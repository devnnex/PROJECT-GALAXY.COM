import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPushEnrollment, detachDevicePush } from '../src/services/push-enrollment.js';

let target; let adapter; let notification; let subscription; let registration;
beforeEach(() => {
  target = new EventTarget();
  subscription = { endpoint: 'https://fcm.googleapis.com/device', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/device', keys: {} }), unsubscribe: vi.fn(async () => true) };
  registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn(async () => subscription) } };
  notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
  adapter = { getPushConfig: vi.fn(async () => ({ publicKey: 'B'.repeat(87) })), savePushSubscription: vi.fn(async () => {}), removePushSubscription: vi.fn(async () => {}) };
  vi.stubGlobal('Notification', notification); vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) } });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const click = () => target.dispatchEvent(new Event('click'));

it('asks permission only in an interaction, enrolls automatically, and does not repeat the request', async () => {
  const stop = createPushEnrollment({ userId: 'member', adapter, target });
  await tick(); expect(notification.requestPermission).not.toHaveBeenCalled();
  click(); await tick();
  expect(notification.requestPermission).toHaveBeenCalledOnce();
  expect(adapter.savePushSubscription).toHaveBeenCalledOnce();
  click(); await tick(); expect(notification.requestPermission).toHaveBeenCalledOnce(); stop();
});
it('reuses granted permission and neither prompts denied users nor unconfigured installations', async () => {
  notification.permission = 'granted';
  const stop = createPushEnrollment({ userId: 'member', adapter, target });
  await tick(); expect(adapter.savePushSubscription).toHaveBeenCalledOnce(); stop();
  notification.permission = 'denied';
  const denied = createPushEnrollment({ userId: 'member', adapter, target });
  await tick(); click(); await tick(); expect(notification.requestPermission).not.toHaveBeenCalled(); denied();
  notification.permission = 'default'; adapter.getPushConfig.mockResolvedValue({ publicKey: '' });
  const missing = createPushEnrollment({ userId: 'member', adapter, target });
  await tick(); click(); await tick(); expect(notification.requestPermission).not.toHaveBeenCalled(); missing();
});
it('cancels an enrollment before logout and detaches this device before another login', async () => {
  let resolve; notification.permission = 'granted';
  registration.pushManager.getSubscription.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const stop = createPushEnrollment({ userId: 'member', adapter, target });
  await tick(); stop(); resolve(subscription); await tick();
  expect(adapter.savePushSubscription).not.toHaveBeenCalled();
  await detachDevicePush(adapter);
  expect(adapter.removePushSubscription).toHaveBeenCalledWith(subscription.endpoint);
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
});
