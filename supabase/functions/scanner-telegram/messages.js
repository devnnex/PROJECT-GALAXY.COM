import { rangeMessage } from './range-messages.js';
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const number = (value, decimals = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
const date = (day) => new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
const trades = (value) => `${number(value)} ${Number(value) === 1 ? 'operativa' : 'operativas'}`;

function messageContent(job) {
  const p = job.payload;
  if (p.strategy === 'RANGE777') return rangeMessage(job);
  if (job.kind === 'PHOTO') {
    if (typeof p.caption !== 'string' || !p.caption.trim() || p.caption.length > 1024) throw new Error('Invalid photo caption');
    return p.caption;
  }
  if (job.kind === 'WELCOME') return '💜 <b>¡Bienvenido/a a PROJECT GALAXY!</b>\nSoy <b>PowerEliteBot</b>, tu compañero de Black Galaxy Trade. Aquí recibirás señales y reportes. ¡Qué gusto tenerte con nosotros! 🚀';
  if (job.kind === 'LINK') return '💜 <b>¡Cuenta de Telegram detectada!</b>\nVuelve a la pestaña o app de Galaxy donde empezaste y confirma que esta cuenta es tuya. Después podrás solicitar el ingreso.\n\nSi usas el botón y se abre otra ventana, inicia sesión con la misma cuenta Galaxy para retomar este paso.';
  if (job.kind === 'LINK_ERROR') return p.reason === 'ALREADY_LINKED'
    ? '💜 Esta cuenta de Telegram ya está vinculada a otra cuenta Galaxy. Vuelve a la cuenta Galaxy con la que la confirmaste. No cambiamos ningún registro confirmado.'
    : '💜 Ya se detectó otra cuenta de Telegram en ese enlace. Vuelve a Galaxy y elige «No es mi cuenta» si necesitas corregirla.';
  if (job.kind === 'EVENT') {
    const t = p.trade;
    if (!['SIGNAL', 'TP1', 'TP2', 'TP3', 'SL'].includes(p.type) || !['BUY', 'SELL'].includes(t?.side)
      || !['entry', 'sl', 'tp1', 'tp2', 'tp3'].every((key) => Number.isFinite(Number(t[key]))) || !Number.isFinite(Date.parse(p.occurredAt))) throw new Error('Invalid event payload');
    const side = t.side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    const protectedStop = p.type === 'SL' && t.outcome === 'WIN';
    const heading = p.type === 'SIGNAL' ? '✨ NUEVA SEÑAL' : protectedStop ? '🛡 SL tras TP · sin descuento' : p.type === 'SL' ? '🛑 STOP LOSS ALCANZADO' : `🎯 ${p.type} ALCANZADO`;
    const at = new Date(p.occurredAt);
    const day = at.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
    const time = at.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    // Quote-style prices retain all three decimals without mixed grouping marks.
    const price = (value) => new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(value));
    const targets = [1, 2, 3].map((level) => `${t[`hit${level}`] === true || p.type === `TP${level}` ? '✅ ' : ''}<b>TP${level}</b>  <code>${price(t[`tp${level}`])}</code>`).join('\n');
    return `<b>💜 BLACK GALAXY TRADE</b>\n<b>${side} · XAUUSD</b>\n${escape(heading)} · 5 min\n\n📍 <b>Entrada:</b> <code>${price(t.entry)}</code>\n🛡 <b>Stop Loss (SL):</b> <code>${price(t.sl)}</code>\n\n🎯 <b>OBJETIVOS</b>\n${targets}\n\n🗓 ${escape(day)}\n🕒 ${escape(time)} · Bogotá\n<code>Ref. ${escape(String(p.tradeId).slice(0, 8))}</code>`;
  }
  if (!['WEEKLY', 'MONTHLY'].includes(job.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) throw new Error('Invalid report payload');
  const closed = Number(p.wins) + Number(p.losses);
  const effectiveness = closed
    ? `🎯 <b>${number(Number(p.wins) * 100 / closed, 1)}% de efectividad histórica</b>\n<b>${number(p.wins)} de ${trades(closed)} ${closed === 1 ? 'evaluada' : 'evaluadas'} con resultado ganador.</b>`
    : '🎯 <b>Seguimiento de efectividad</b>\nEste período aún no tiene operativas evaluables.';
  const bestDay = p.bestDay && closed ? `\n\n🌟 <b>Mejor jornada</b>\n${date(p.bestDay.day)} · <b>${number(p.bestDay.rate, 1)}%</b> (${number(p.bestDay.wins)}/${number(Number(p.bestDay.wins) + Number(p.bestDay.losses))} evaluadas)` : '';
  return `💜 <b>PROJECT GALAXY</b>\n<b>BLACK GALAXY TRADE</b>\n📊 <b>Efectividad ${job.kind === 'WEEKLY' ? 'semanal' : 'mensual'}</b>\n🗓 ${date(p.from)} — ${date(p.to)}\n\n${effectiveness}\n\n🚀 <b>Objetivos alcanzados</b>\n✅ TP1 · <b>${trades(p.hits?.[0])}</b>\n✅ TP2 · <b>${trades(p.hits?.[1])}</b>\n🏆 TP3 · <b>${trades(p.hits?.[2])}</b>${bestDay}\n\n💎 <b>Resultados visibles. Seguimiento de cada señal.</b>\n<i>Historial del período · ${number(p.signalDays)} ${Number(p.signalDays) === 1 ? 'día' : 'días'} con señales.</i>`;
}

export function telegramMessage(job) {
  const text=messageContent(job);
  if(job.payload.strategy==='RANGE777')return text;
  if(job.kind==='EVENT')return text.replace('<b>💜 BLACK GALAXY TRADE</b>','<b>💜 BLACK GALAXY TRADE</b>\n💎 <b>OPUS 5.5 · M5</b>');
  if(['WEEKLY','MONTHLY'].includes(job.kind))return text.replace('<b>BLACK GALAXY TRADE</b>','<b>BLACK GALAXY TRADE · OPUS 5.5</b>');
  return text;
}
