import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from 'node:crypto';
import { runCombinedScannerTick } from './combined-worker.js';
import { fetchGoldQuote } from './provider.js';
import { drainTelegram } from '../scanner-telegram/delivery.js';
import { renderReportImage } from '../scanner-telegram/report-image.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = new TextEncoder().encode(Deno.env.get('SCANNER_DISPATCH_SECRET') || '');
  const actual = new TextEncoder().encode(request.headers.get('x-galaxy-scanner-secret') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action === 'check-provider') return json({ provider: 'gold-api', quote: await fetchGoldQuote() });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const onEvents = () => {
      const delivery = drainTelegram({ client, token: Deno.env.get('TELEGRAM_BOT_TOKEN'), chatId: Deno.env.get('TELEGRAM_CHAT_ID'), renderReport: renderReportImage })
        .catch(() => { console.error('Telegram outbox retained for retry.'); });
      EdgeRuntime.waitUntil(delivery);
    };
    return json(await runCombinedScannerTick({ client, goldKey: Deno.env.get('GOLD_API_KEY'), onEvents }));
  } catch {
    console.error('Scanner tick unavailable. State and history quota are retained for retry.');
    return json({ error: 'Scanner temporarily unavailable' }, 503);
  }
});
