import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from 'node:crypto';
import { deliverTelegram } from './worker.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = new TextEncoder().encode(Deno.env.get('TELEGRAM_DISPATCH_SECRET') || '');
  const actual = new TextEncoder().encode(request.headers.get('x-galaxy-telegram-secret') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ error: 'Unauthorized' }, 401);
  try {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN'); const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return json({ error: 'Telegram is not configured' }, 503);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (name: string, params?: object) => { const { data, error } = await client.rpc(name, params); if (error) throw new Error('Delivery database unavailable'); return data; };
    const result = await deliverTelegram({
      claim: () => rpc('claim_scanner_telegram_job'),
      finish: async (job: { id: number; lease: string }, delivery: { status: string; messageId?: number; retryAfter?: number; code?: string }) => {
        const accepted = await rpc('finish_scanner_telegram_job', { p_id: job.id, p_lease: job.lease, p_status: delivery.status, p_message_id: delivery.messageId ?? null, p_retry_after: delivery.retryAfter ?? 0, p_code: delivery.code ?? null });
        if (accepted !== true) throw new Error('Delivery lease changed');
      },
      send: async (text: string, job: { chatId?: number; kind: string }) => {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: job.chatId ?? chatId, text, parse_mode: 'HTML', allow_paid_broadcast: false, link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: ['LINK', 'LINK_ERROR'].includes(job.kind) ? 'Continuar en Galaxy' : 'Ver en Galaxy', url: `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html?section=black-trade${['LINK', 'LINK_ERROR'].includes(job.kind) ? '&telegram=1' : ''}` }]] } }) });
        const body = await response.json().catch(() => ({}));
        return { status: response.status, ok: body.ok, messageId: body.result?.message_id, retryAfter: body.parameters?.retry_after };
      },
    });
    return json(result);
  } catch {
    // Never log the request URL, bot token, group contents or service credentials.
    console.error('Telegram delivery unavailable; the private queue retains pending jobs.');
    return json({ error: 'Delivery temporarily unavailable' }, 503);
  }
});
