import { expect, it, vi } from 'vitest';
import { telegramMessage } from '../supabase/functions/scanner-telegram/messages';
import { deliverTelegram } from '../supabase/functions/scanner-telegram/worker';

const event = (type = 'TP2') => ({ id: 1, lease: 'lease', kind: 'EVENT', payload: { type, tradeId: 'abcdef12-3456', occurredAt: '2026-11-19T14:00:00Z', trade: { side: 'BUY', entry: 4000, sl: 3995, tp1: 4005, tp2: 4010, tp3: 4015 } } });
it('renders the same entry, stop and targets with Bogotá time and protects prior-TP stops', () => {
  const text = telegramMessage(event()); expect(text).toContain('TP2 ALCANZADO'); expect(text).toContain('<code>4010.000</code>'); expect(text).toContain('09:00:00');
  expect(text).toContain('🟢 BUY · XAUUSD'); expect(text).toContain('✅ <b>TP2</b>');
  expect(text).toContain('📍 <b>Entrada:</b> <code>4000.000</code>'); expect(text).toContain('🛡 <b>Stop Loss (SL):</b> <code>3995.000</code>');
  const stop = event('SL'); stop.payload.trade.outcome = 'WIN';
  expect(telegramMessage(stop)).toContain('SL tras TP · sin descuento');
  const signal = event('SIGNAL'); signal.payload.trade.side = 'SELL';
  const sell = telegramMessage(signal); expect(sell).toContain('🔴 SELL · XAUUSD'); expect(sell).toContain('✨ NUEVA SEÑAL');
  expect(sell).not.toMatch(/COMPRA|VENTA/); expect(sell).toContain('<code>4015.000</code>');
  expect(() => telegramMessage({ ...event(), payload: { ...event().payload, type: '<script>' } })).toThrow();
});
it.each(['WEEKLY', 'MONTHLY'])('focuses the %s report on measured effectiveness and achieved targets', (kind) => {
  const text = telegramMessage({ kind, payload: { from: '2026-11-16', to: '2026-11-22', asOf: '2026-11-23T13:00:00Z', signals: 5, wins: 2, losses: 2, ignored: 1, open: 0, signalDays: 2, hits: [2, 1, 1], bestDay: { day: '2026-11-16', rate: 66.67, wins: 2, losses: 1 }, targets: [{ level: 1, net: 50 }, { level: 2, net: 0 }, { level: 3, net: -50 }] } });
  expect(text).toContain('50,0% de efectividad histórica'); expect(text).toContain('2 de 4 operativas evaluadas');
  expect(text).toContain('TP3 · <b>1 operativa</b>'); expect(text).toContain('Mejor jornada'); expect(text).toContain('66,7%');
  expect(text).toContain('2 días con señales'); expect(text).not.toMatch(/USD|Simulación|Menor acierto|Ganadas:|SL:|garantizada/); expect(text.length).toBeLessThan(4000);
});
it('does not invent effectiveness for an unevaluated period or inflate a losing period', () => {
  const job = { kind:'WEEKLY', payload:{from:'2026-11-16',to:'2026-11-22',wins:0,losses:0,signalDays:0,hits:[0,0,0]} };
  expect(telegramMessage(job)).toContain('aún no tiene operativas evaluables');
  expect(telegramMessage(job)).not.toContain('0,0%');
  job.payload.losses=3;
  expect(telegramMessage(job)).toContain('0,0% de efectividad histórica');
  expect(telegramMessage(job)).toContain('0 de 3 operativas evaluadas');
});
it('validates photo captions and preserves media metadata through delivery acknowledgement', async () => {
  const job = {id:8,lease:'photo-lease',kind:'PHOTO',payload:{path:'scheduled/example.png',caption:'💜 <b>Efectividad histórica</b>'}};
  const send=vi.fn().mockResolvedValue({status:200,ok:true,messageId:50}),finish=vi.fn();
  await deliverTelegram({claim:vi.fn().mockResolvedValueOnce({job}).mockResolvedValueOnce(null),send,finish});
  expect(send).toHaveBeenCalledWith(job.payload.caption,job);
  expect(finish).toHaveBeenCalledWith(job,{status:'sent',messageId:50});
  for(const caption of ['', ' '.repeat(10), 'a'.repeat(1025)]) expect(()=>telegramMessage({...job,payload:{caption}})).toThrow();
});
it('paces a burst and acknowledges successful sends with their lease and Telegram receipt', async () => {
  let time = 0;
  const claim = vi.fn().mockResolvedValueOnce({ job: event() }).mockResolvedValueOnce({ waitMs: 3100 }).mockResolvedValueOnce({ job: { ...event(), id: 2 } }).mockResolvedValueOnce(null);
  const finish = vi.fn(), send = vi.fn().mockResolvedValue({ status: 200, ok: true, messageId: 123 });
  const result = await deliverTelegram({ claim, finish, send, now: () => time, sleep: async (ms) => { time += ms; } });
  expect(result).toEqual({ sent: 2, retry: 0, failed: 0 }); expect(time).toBe(3100); expect(finish).toHaveBeenCalledWith(event(), { status: 'sent', messageId: 123 });
});
it.each([429, 401, 403])('stops the drain on Telegram %s without retrying permission failures', async (status) => {
  const finish = vi.fn(); const send = vi.fn().mockResolvedValue({ status, retryAfter: 60 });
  const result = await deliverTelegram({ claim: vi.fn().mockResolvedValue({ job: event() }), finish, send });
  expect(send).toHaveBeenCalledOnce(); expect(finish.mock.calls[0][1]).toMatchObject({ status: status === 429 ? 'retry' : 'failed', retryAfter: 60 });
  expect(result[status === 429 ? 'retry' : 'failed']).toBe(1);
});
it('retains a bounded retry on network failure and aborts on acknowledgement failure', async () => {
  const claim = vi.fn().mockResolvedValueOnce({ job: event() }).mockResolvedValueOnce(null), finish = vi.fn();
  await deliverTelegram({ claim, finish, send: async () => { throw new Error('secret URL must not be logged'); } });
  expect(finish.mock.calls[0][1]).toMatchObject({ status: 'retry', code: 'telegram_transport' });
  const send = vi.fn().mockResolvedValue({ status: 200, ok: true, messageId: 1 });
  await expect(deliverTelegram({ claim: async () => ({ job: event() }), finish: async () => { throw new Error('DB unavailable'); }, send })).rejects.toThrow('DB unavailable');
  expect(send).toHaveBeenCalledOnce();
});
