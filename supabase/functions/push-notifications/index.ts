import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';
import { timingSafeEqual } from 'node:crypto';
import { deliverPushBatch } from './delivery.js';

const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const expected = new TextEncoder().encode(env('PUSH_DISPATCH_SECRET'));
    const actual = new TextEncoder().encode(request.headers.get('x-galaxy-push-secret') || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
    const vapidDetails = { subject: 'mailto:elkin56ty@gmail.com', publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') };
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const totals = { sent: 0, expired: 0, retry: 0 };
    // Drain a bounded batch; the cron worker picks up retries and remaining jobs.
    for (let batch = 0; batch < 5; batch++) {
      const { data: jobs, error } = await admin.rpc('claim_push_delivery_jobs');
      if (error) throw error;
      if (!jobs?.length) break;
      const result = await deliverPushBatch(jobs, {
        send: async (job: { subscription: object; notification: { id: string; type: string } }) => {
          const details = webpush.generateRequestDetails(job.subscription, JSON.stringify(job.notification), {
            vapidDetails, TTL: job.notification.type === 'DIRECT_MESSAGE' ? 3600 : 300,
            urgency: 'high', topic: job.notification.id.replaceAll('-', '').slice(0, 32),
          });
          const response = await fetch(details.endpoint, {
            method: 'POST', headers: details.headers, body: details.body,
            redirect: 'error', signal: AbortSignal.timeout(8000),
          });
          await response.body?.cancel();
          return { status: response.status };
        },
        complete: async (id: string) => {
          const { error } = await admin.from('push_delivery_jobs').update({ sent_at: new Date().toISOString() }).eq('id', id);
          if (error) throw error;
        },
        remove: async (id: string) => {
          const { error } = await admin.from('push_subscriptions').delete().eq('id', id);
          if (error) throw error;
        },
      });
      totals.sent += result.sent; totals.expired += result.expired; totals.retry += result.retry;
    }
    return json(totals);
  } catch {
    // Do not log message text, push endpoints, VAPID keys or dispatch credentials.
    console.error('Web Push dispatch failed; pending deliveries will be retried.');
    return json({ error: 'Push service temporarily unavailable' }, 503);
  }
});
