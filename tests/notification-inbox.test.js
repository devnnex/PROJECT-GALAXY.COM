import { expect, it, vi } from 'vitest';
import { createNotificationInbox, mergeNotificationRows } from '../src/services/notification-inbox';

const notice = (id, extra = {}) => ({ id, type: 'SCANNER_SIGNAL', title: 'TP1', createdAt: '2026-11-18T17:00:00Z', ...extra });
const read = (row) => ({ ...row, readAt: '2026-11-18T17:01:00Z' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

it('acknowledges once, clears the unread count immediately and preserves the reading only until close', async () => {
  const row = notice('one'), acknowledge = vi.fn(async () => ({ cleared: 1, notifications: [read(row)] }));
  const inbox = createNotificationInbox({ acknowledge }); inbox.setItems([row]);
  const pending = inbox.open();
  expect(inbox.getSnapshot()).toMatchObject({ open: true, busy: true, items: [], reading: [{ id: 'one', readAt: expect.any(String) }] });
  await pending; expect(acknowledge).toHaveBeenCalledOnce();
  expect(inbox.getSnapshot()).toMatchObject({ busy: false, cleared: 1 });
  inbox.close(); expect(inbox.getSnapshot()).toMatchObject({ open: false, items: [], reading: [] });
});
it('coalesces repeated reads and does not reopen a reading if the user closed it while the server replied', async () => {
  const request = deferred(), acknowledge = vi.fn(() => request.promise);
  const inbox = createNotificationInbox({ acknowledge }); inbox.setItems([notice('one')]);
  const first = inbox.open(); const second = inbox.readAll(); expect(first).toBe(second);
  inbox.close(); request.resolve({ notifications: [read(notice('one'))] }); await first;
  expect(inbox.getSnapshot()).toMatchObject({ open: false, reading: [] }); expect(acknowledge).toHaveBeenCalledOnce();
});
it('keeps a newly arriving notification unread when it was not part of the server-cleared snapshot', async () => {
  const request = deferred(), inbox = createNotificationInbox({ acknowledge: () => request.promise });
  inbox.setItems([notice('old')]); const pending = inbox.open();
  inbox.setItems((items) => [...items, notice('new', { createdAt: '2026-11-18T17:02:00Z' })]);
  request.resolve({ cleared: 1, notifications: [read(notice('old'))] }); await pending;
  expect(inbox.getSnapshot().items.map((row) => row.id)).toEqual(['new']);
  expect(inbox.getSnapshot().items[0].readAt).toBeUndefined();
});
it('blocks old poll/Push copies while retaining newer realtime rows across a stale poll response', async () => {
  const old = notice('old'), fresh = notice('fresh', { createdAt: '2026-11-18T17:02:00Z' });
  const inbox = createNotificationInbox({ acknowledge: async () => ({ notifications: [read(old)] }) });
  const version = inbox.getVersion(); inbox.setItems([old]); await inbox.open(); inbox.close();
  inbox.setItems((items) => [...items, fresh]);
  inbox.setItems([old], version);
  expect(inbox.getSnapshot().items.map((row) => row.id)).toEqual(['fresh']);
  inbox.setItems((items) => [...items, old]); expect(inbox.getSnapshot().items.map((row) => row.id)).toEqual(['fresh']);
});
it('restores unread notices on failure and allows a retry instead of claiming they were cleaned', async () => {
  const row = notice('one'), acknowledge = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ cleared: 1, notifications: [read(row)] });
  const inbox = createNotificationInbox({ acknowledge }); inbox.setItems([row]);
  expect(await inbox.open()).toBe(false);
  expect(inbox.getSnapshot()).toMatchObject({ items: [row], busy: false, error: expect.any(String) });
  expect(await inbox.readAll()).toBe(true);
  expect(inbox.getSnapshot()).toMatchObject({ items: [], error: '', cleared: 1 });
});
it('deduplicates and bounds the temporary reading and notifies subscribers only while subscribed', async () => {
  const inbox = createNotificationInbox({ acknowledge: async () => ({ notifications: [] }) }), listener = vi.fn();
  const stop = inbox.subscribe(listener); inbox.setItems([notice('same')]); expect(listener).toHaveBeenCalledOnce();
  stop(); inbox.close(); expect(listener).toHaveBeenCalledOnce();
  expect(mergeNotificationRows([notice('same')], [read(notice('same'))])).toHaveLength(1);
  expect(mergeNotificationRows(Array.from({ length: 200 }, (_, i) => notice(String(i))))).toHaveLength(100);
});

it('does not resurrect a cleared trading Push that was outside the bounded display snapshot', async () => {
  const inbox = createNotificationInbox({ acknowledge: async () => ({ notifications: [], clearedScannerIds: ['older-scanner'] }) });
  await inbox.open(); inbox.close(); inbox.setItems((items) => [...items, notice('older-scanner')]);
  expect(inbox.getSnapshot().items).toEqual([]);
});
