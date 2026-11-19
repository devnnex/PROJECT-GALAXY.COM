const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const number = (value, decimals = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
const money = (value) => `USD ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const date = (day) => new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });

export function telegramMessage(job) {
  const p = job.payload;
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
  const rate = closed ? `${number(Number(p.wins) * 100 / closed, 1)}% (${number(p.wins)}/${number(closed)})` : 'Sin operaciones evaluables';
  const day = (value) => value ? `${date(value.day)} · ${number(value.rate, 1)}% (${number(value.wins)}/${number(Number(value.wins) + Number(value.losses))})` : 'Sin datos evaluables';
  const scenarios = (p.targets || []).map((target) => `Salir en TP${target.level}: <b>${money(target.net)}</b>`).join('\n');
  const asOf = new Date(p.asOf).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
  return `<b>BLACK GALAXY TRADE</b>\n📊 <b>Reporte ${job.kind === 'WEEKLY' ? 'semanal' : 'mensual'}</b>\n${date(p.from)} — ${date(p.to)}\n\nSeñales: <b>${number(p.signals)}</b> · ${number(p.signalDays)} días con señales\nGanadas: ${number(p.wins)} · SL: ${number(p.losses)}\nAbiertas: ${number(p.open)} · No consideradas: ${number(p.ignored)}\n<b>Efectividad: ${rate}</b>\nTP1: ${number(p.hits?.[0])} · TP2: ${number(p.hits?.[1])} · TP3: ${number(p.hits?.[2])}\n\nMejor día: ${day(p.bestDay)}\nMenor acierto: ${day(p.worstDay)}\n\n<b>Simulación histórica · 0,10 lotes</b>\n${scenarios}\n100 oz/lote. SL tras TP previo sin descuento. Sin comisiones ni deslizamiento; no es ganancia garantizada.\n\nResultados de las señales emitidas en este período, registrados al ${escape(asOf)} · Bogotá.`;
}
