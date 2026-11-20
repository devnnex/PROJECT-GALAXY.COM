import { deliverTelegram } from './worker.js';
import { telegramMedia, signalMediaKey } from './media.js';

// Both the scanner and the retry endpoint drain the same leased outbox.
// No extra HTTP invocation is required for the first live delivery.
export async function drainTelegram({ client, token, chatId, renderReport, request = fetch }) {
  if (!token || !chatId) return { sent: 0, retry: 0, failed: 0 };
  const rpc = async (name, params) => {
    const { data, error } = await client.rpc(name, params);
    if (error) throw new Error('Delivery database unavailable');
    return data;
  };
  return deliverTelegram({
    claim: () => rpc('claim_scanner_telegram_job'),
    finish: async (job, delivery) => {
      const accepted = await rpc('finish_scanner_telegram_job', { p_id: job.id, p_lease: job.lease, p_status: delivery.status, p_message_id: delivery.messageId ?? null, p_retry_after: delivery.retryAfter ?? 0, p_code: delivery.code ?? null });
      if (accepted !== true) throw new Error('Delivery lease changed');
      if (delivery.status === 'sent' && delivery.photoFileId && job.kind === 'EVENT' && job.payload.type === 'SIGNAL') {
        await client.from('scanner_telegram_media').update({ file_id: delivery.photoFileId }).eq('key', signalMediaKey(job));
      }
      if (delivery.status === 'sent' && job.kind === 'PHOTO' && /^scheduled\/[a-f0-9-]+\.png$/.test(job.payload.path || '')) {
        await client.storage.from('telegram-evidence').remove([job.payload.path]).catch(() => {});
      }
    },
    send: async (text, job) => {
      const photo = await telegramMedia(job, client, renderReport);
      const strategyQuery = job.payload.strategy === 'RANGE777' ? '&strategy=aurum' : '';
      const url = `https://devnnex.github.io/PROJECT-GALAXY.COM/dist/index.html?section=black-trade${['LINK', 'LINK_ERROR'].includes(job.kind) ? '&telegram=1' : ''}${strategyQuery}`;
      const keyboard = { inline_keyboard: [[{ text: photo ? 'Ver Black Galaxy Trade' : ['LINK', 'LINK_ERROR'].includes(job.kind) ? 'Continuar en Galaxy' : 'Ver en Galaxy', url }]] };
      let body, headers, method;
      if (photo) {
        if (text.length > 1024) throw new Error('Photo caption too long');
        const form = new FormData();
        form.set('chat_id', String(job.chatId ?? chatId));
        if (typeof photo === 'string') form.set('photo', photo); else form.set('photo', photo, 'black-galaxy.png');
        form.set('caption', text); form.set('parse_mode', 'HTML'); form.set('allow_paid_broadcast', 'false');
        form.set('reply_markup', JSON.stringify(keyboard));
        body = form; method = 'sendPhoto';
      } else {
        method = 'sendMessage'; headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({ chat_id: job.chatId ?? chatId, text, parse_mode: 'HTML', allow_paid_broadcast: false, link_preview_options: { is_disabled: true }, reply_markup: keyboard });
      }
      const response = await request(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body, ...(headers ? { headers } : {}), redirect: 'error', signal: AbortSignal.timeout(photo ? 10000 : 8000) });
      const result = await response.json().catch(() => ({}));
      return { status: response.status, ok: result.ok, messageId: result.result?.message_id, retryAfter: result.parameters?.retry_after, photoFileId: result.result?.photo?.at(-1)?.file_id };
    },
  });
}
