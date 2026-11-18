import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('requests audible scanner notifications with the Galaxy image and forwards the same ID to the open app', async () => {
  const listeners = {}, showNotification = vi.fn(async () => {}), postMessage = vi.fn();
  const scope = 'https://example.com/PROJECT-GALAXY.COM/dist/';
  const self = { registration: { scope, showNotification }, location: { origin: 'https://example.com' },
    addEventListener: (type, handler) => { listeners[type] = handler; }, clients: { matchAll: async () => [{ postMessage }] } };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL, Date, Request });
  const notice = { id: 'one-event', userId: 'member', type: 'SCANNER_SIGNAL', title: '✅ TP1 alcanzado', body: 'Entrada 4000', createdAt: '2026-11-17T14:00:00Z' };
  let pending;
  listeners.push({ data: { json: () => notice }, waitUntil: (value) => { pending = value; } });
  await pending;
  expect(showNotification).toHaveBeenCalledWith(notice.title, expect.objectContaining({ silent: false, renotify: true, requireInteraction: true,
    icon: scope + 'galaxy-notification.png', badge: scope + 'galaxy-notification.png', tag: 'galaxy-one-event', timestamp: Date.parse(notice.createdAt) }));
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'GALAXY_SCANNER_PUSH', notice: expect.objectContaining({ id: notice.id, userId: 'member', createdAt: notice.createdAt }) }));
});
