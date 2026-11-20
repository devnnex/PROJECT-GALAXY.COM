import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from 'node:crypto';
import { drainTelegram } from './delivery.js';
import { renderReportImage } from './report-image.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = new TextEncoder().encode(Deno.env.get('TELEGRAM_DISPATCH_SECRET') || '');
  const actual = new TextEncoder().encode(request.headers.get('x-galaxy-telegram-secret') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action === 'check-report-renderer') {
      const photo = await renderReportImage({ kind: 'WEEKLY', payload: { from: '2026-01-01', to: '2026-01-07', wins: 0, losses: 0, hits: [0, 0, 0], signalDays: 0 } });
      return json({ rendered: true, bytes: photo.size, type: photo.type });
    }
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN'), chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return json({ error: 'Telegram is not configured' }, 503);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    return json(await drainTelegram({ client, token, chatId, renderReport: renderReportImage }));
  } catch {
    console.error('Telegram delivery unavailable; the private queue retains pending jobs.');
    return json({ error: 'Delivery temporarily unavailable' }, 503);
  }
});
