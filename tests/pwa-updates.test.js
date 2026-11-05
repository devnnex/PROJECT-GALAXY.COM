import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { startPwaUpdates, setPwaMeetingActive, setPwaMeetingState } from '../src/services/pwa-updates.js';

let events; let registration; let sw; let reload; let fetchVersion;
beforeEach(() => {
  events = new EventTarget(); sw = new EventTarget();
  registration = { update: vi.fn(async () => {}), addEventListener: vi.fn() };
  sw.register = vi.fn(async () => registration); sw.controller = {};
  reload = vi.fn(); fetchVersion = vi.fn(async () => ({ ok: true, json: async () => ({ version: 'new' }) }));
  vi.stubGlobal('window', events); vi.stubGlobal('navigator', { serviceWorker: sw, onLine: true });
  vi.stubGlobal('location', { href: 'https://galaxy.test/dist/index.html', reload });
  vi.stubGlobal('document', { visibilityState: 'visible', querySelector: () => null, querySelectorAll: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('fetch', fetchVersion); setPwaMeetingActive(false);
});
afterEach(() => { vi.unstubAllGlobals(); setPwaMeetingActive(false); });
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
it('detects a new build on interaction and reloads automatically without reinstalling', async () => {
  const stop = startPwaUpdates({ baseUrl: './', buildId: 'old' }); await tick();
  expect(sw.register).toHaveBeenCalledWith('https://galaxy.test/dist/sw.js', { updateViaCache: 'none' });
  events.dispatchEvent(new Event('click')); await tick(); await tick();
  expect(registration.update).toHaveBeenCalled(); expect(reload).toHaveBeenCalledOnce(); stop();
});
it('defers an update through a live meeting and unsent input until the next safe interaction', async () => {
  setPwaMeetingActive(true);
  const stop = startPwaUpdates({ baseUrl: './', buildId: 'old' }); await tick();
  events.dispatchEvent(new Event('click')); await tick(); expect(reload).not.toHaveBeenCalled();
  setPwaMeetingActive(false); document.querySelectorAll = () => [{ value: 'Unsent message', type: 'text' }];
  events.dispatchEvent(new Event('click')); await tick(); expect(reload).not.toHaveBeenCalled();
  document.querySelectorAll = () => []; events.dispatchEvent(new Event('click')); await tick();
  expect(reload).toHaveBeenCalledOnce(); stop();
});
it('does not reload when offline or the version endpoint fails', async () => {
  fetchVersion.mockRejectedValue(new Error('Offline'));
  const stop = startPwaUpdates({ baseUrl: './', buildId: 'old' }); await tick();
  events.dispatchEvent(new Event('click')); await tick(); expect(reload).not.toHaveBeenCalled(); stop();
});
it('protects an unresolved meeting connection before it is joined or waiting', async () => {
  const stop = startPwaUpdates({ baseUrl: './', buildId: 'old' }); await tick();
  setPwaMeetingState({ busy: true, joined: false, waiting: false });
  events.dispatchEvent(new Event('click')); await tick(); expect(reload).not.toHaveBeenCalled();
  setPwaMeetingState({ busy: false, joined: false, waiting: false });
  events.dispatchEvent(new Event('click')); await tick(); expect(reload).toHaveBeenCalledOnce(); stop();
});

function worker() {
  const handlers = {}; const showNotification = vi.fn(async () => {});
  const client = { url: 'https://galaxy.test/dist/index.html', focus: vi.fn(async () => client), postMessage: vi.fn() };
  const context = {
    self: { location: { origin: 'https://galaxy.test' }, registration: { scope: 'https://galaxy.test/dist/', showNotification }, clients: { matchAll: vi.fn(async () => [client]), openWindow: vi.fn() }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    URL, Request, Response, caches: {}, fetch: vi.fn(),
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { handlers, showNotification, client, context };
}
it('displays a branded push with a stable tag and routes clicks only within the PWA scope', async () => {
  const { handlers, showNotification, client } = worker();
  const notice = { id: 'n1', type: 'DIRECT_MESSAGE', title: 'Elkin', body: 'Hello', actorId: 'owner', userId: 'member', url: 'https://evil.test' };
  let promise;
  handlers.push({ data: { json: () => notice }, waitUntil: (value) => { promise = value; } }); await promise;
  expect(showNotification.mock.calls[0][1]).toMatchObject({ body: 'Hello', tag: 'galaxy-n1' });
  handlers.notificationclick({ notification: { data: notice, close: vi.fn() }, waitUntil: (value) => { promise = value; } }); await promise;
  expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'GALAXY_NOTIFICATION_OPEN', notice: expect.objectContaining({ type: 'DIRECT_MESSAGE' }) }));
  expect(client.focus).toHaveBeenCalledOnce();
});
it('always uses the network for version checks and degrades safely for malformed push payloads', async () => {
  const { handlers, context, showNotification } = worker();
  let promise;
  context.fetch.mockResolvedValue(new Response('{}'));
  handlers.fetch({ request: new Request('https://galaxy.test/dist/version.json'), respondWith: (value) => { promise = value; } });
  await promise; expect(context.fetch).toHaveBeenCalled();
  handlers.push({ data: { json: () => { throw new Error('Malformed'); } }, waitUntil: (value) => { promise = value; } });
  await promise; expect(showNotification).toHaveBeenCalledOnce();
});
