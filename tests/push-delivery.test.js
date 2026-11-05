import { expect, it, vi } from 'vitest';
import { deliverPushBatch, isPushEndpoint } from '../supabase/functions/push-notifications/delivery.js';

it('allows only HTTPS push providers without credentials or redirects to local servers', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/device', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/device']) expect(isPushEndpoint(url)).toBe(true);
  for (const url of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://user@fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://web.push.apple.com:444/x']) expect(isPushEndpoint(url)).toBe(false);
});
it('marks accepted sends, removes expired subscriptions, and leaves transient failures for retry', async () => {
  const jobs = [201, 410, 503].map((status) => ({ job_id: String(status), subscription_id: `device-${status}`, subscription: { endpoint: 'https://fcm.googleapis.com/x' }, notification: { id: `n-${status}`, type: 'DIRECT_MESSAGE', actorId: 'owner', userId: 'member', title: 'Elkin', body: 'Hello' } }));
  const send = vi.fn(async (job) => ({ status: Number(job.job_id) }));
  const complete = vi.fn(); const remove = vi.fn();
  const result = await deliverPushBatch(jobs, { send, complete, remove });
  expect(complete).toHaveBeenCalledExactlyOnceWith('201');
  expect(remove).toHaveBeenCalledExactlyOnceWith('device-410');
  expect(result).toEqual({ sent: 1, expired: 1, retry: 1 });
});
