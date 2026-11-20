import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from 'node:crypto';
import { deliverTelegram } from './worker.js';
import { telegramMedia } from './media.js';
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
      const photo=await renderReportImage({kind:'WEEKLY',payload:{from:'2026-01-01',to:'2026-01-07',wins:0,losses:0,hits:[0,0,0],signalDays:0}});
      return json({rendered:true,bytes:photo.size,type:photo.type});
    }
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN'); const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return json({ error: 'Telegram is not configured' }, 503);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (name: string, params?: object) => { const { data, error } = await client.rpc(name, params); if (error) throw new Error('Delivery database unavailable'); return data; };
    const result = await deliverTelegram({
      claim: () => rpc('claim_scanner_telegram_job'),
      finish: async (job: { id: number; lease: string; kind: string; payload: { path?: string; type?:string; trade?:{side:string} } }, delivery: { status: string; messageId?: number; retryAfter?: number; code?: string; photoFileId?:string }) => {
        const accepted = await rpc('finish_scanner_telegram_job', { p_id: job.id, p_lease: job.lease, p_status: delivery.status, p_message_id: delivery.messageId ?? null, p_retry_after: delivery.retryAfter ?? 0, p_code: delivery.code ?? null });
        if (accepted !== true) throw new Error('Delivery lease changed');
        if(delivery.status==='sent'&&delivery.photoFileId&&job.kind==='EVENT'&&job.payload.type==='SIGNAL') {
          await client.from('scanner_telegram_media').update({file_id:delivery.photoFileId}).eq('key',job.payload.trade?.side);
        }
        if (delivery.status === 'sent' && job.kind === 'PHOTO' && /^scheduled\/[a-f0-9-]+\.png$/.test(job.payload.path || '')) {
          await client.storage.from('telegram-evidence').remove([job.payload.path!]).catch(() => {});
        }
      },
      send: async (text: string, job: { chatId?: number; kind: string; payload: Record<string, unknown> }) => {
        const photo=await telegramMedia(job,client,renderReportImage);
        const strategyQuery=job.payload.strategy==='RANGE777'?'&strategy=range777':'';
        if (photo) {
          if(text.length>1024)throw new Error('Photo caption too long');
          const form = new FormData();
          form.set('chat_id', String(job.chatId ?? chatId));
          if(typeof photo==='string')form.set('photo',photo);else form.set('photo',photo,'black-galaxy.png');
          form.set('caption', text); form.set('parse_mode', 'HTML'); form.set('allow_paid_broadcast', 'false');
          form.set('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: 'Ver Black Galaxy Trade', url: `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html?section=black-trade${strategyQuery}` }]] }));
          const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(10000) });
          const body = await response.json().catch(() => ({}));
          return { status: response.status, ok: body.ok, messageId: body.result?.message_id, retryAfter: body.parameters?.retry_after,photoFileId:body.result?.photo?.at(-1)?.file_id };
        }
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: job.chatId ?? chatId, text, parse_mode: 'HTML', allow_paid_broadcast: false, link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: ['LINK', 'LINK_ERROR'].includes(job.kind) ? 'Continuar en Galaxy' : 'Ver en Galaxy', url: `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html?section=black-trade${['LINK', 'LINK_ERROR'].includes(job.kind) ? '&telegram=1' : ''}${strategyQuery}` }]] } }) });
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
