import { telegramMessage } from './messages.js';

export async function deliverTelegram({ claim, finish, send, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const totals = { sent: 0, retry: 0, failed: 0 };
  const deadline = now() + 20_000;
  for (let step = 0; step < 30 && now() < deadline; step++) {
    const result = await claim();
    if (!result) break;
    if (result.waitMs > 0) {
      if (result.waitMs > 3500 || now() + result.waitMs >= deadline) break;
      await sleep(result.waitMs); continue;
    }
    const job = result.job;
    if (!job) break;
    let text;
    try { text = telegramMessage(job); if (text.length > 4000) throw new Error('Message too long'); }
    catch { await finish(job, { status: 'failed', code: 'invalid_payload' }); totals.failed++; continue; }
    let response;
    try { response = await send(text); }
    catch { response = { status: 0 }; }
    if (response.status === 200 && response.ok === true && Number.isInteger(response.messageId)) {
      // A failed database acknowledgement must abort the drain; never send the
      // same leased job twice in one invocation.
      await finish(job, { status: 'sent', messageId: response.messageId }); totals.sent++;
    } else {
      const retry = response.status === 0 || response.status === 429 || response.status >= 500;
      await finish(job, { status: retry ? 'retry' : 'failed', retryAfter: Math.min(86400, Math.max(0, Number(response.retryAfter) || 0)), code: `telegram_${Number(response.status) || 'transport'}` });
      totals[retry ? 'retry' : 'failed']++;
      if (response.status === 429 || response.status === 401 || response.status === 403) break;
    }
  }
  return totals;
}
