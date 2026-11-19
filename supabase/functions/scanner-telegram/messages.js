const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const number = (value, decimals = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
const money = (value) => `USD ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const date = (day) => new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });

export function telegramMessage(job) {
  const p = job.payload;
  if (job.kind === 'WELCOME') return '💜 <b>¡Bienvenido/a a PROJECT GALAXY!</b>\nSoy <b>PowerEliteBot</b>, tu compañero de Black Galaxy Trade. Aquí recibirás señales y reportes. ¡Qué gusto tenerte con nosotros! 🚀';
  if (job.kind === 'LINK') return '💜 <b>¡Hola! Soy PowerEliteBot.</b>\nTu cuenta de Telegram está lista para vincularse. Vuelve a Galaxy y confirma que es tuya para solicitar el acceso privado.';
  if (job.kind === 'EVENT') {
    const t = p.trade;
    if (!['SIGNAL', 'TP1', 'TP2', 'TP3', 'SL'].includes(p.type) || !['BUY', 'SELL'].includes(t?.side)
      || !['entry', 'sl', 'tp1', 'tp2', 'tp3'].every((key) => Number.isFinite(Number(t[key]))) || !Number.isFinite(Date.parse(p.occurredAt))) throw new Error('Invalid event payload');
    const side = t.side === 'BUY' ? '🟢 COMPRA' : '🔴 VENTA';
    const protectedStop = p.type === 'SL' && t.outcome === 'WIN';
    const heading = p.type === 'SIGNAL' ? `${side} · NUEVA SEÑAL` : protectedStop ? '🛡 SL tras TP · sin descuento' : p.type === 'SL' ? '🔴 STOP LOSS' : `🎯 ${p.type} ALCANZADO`;
    const at = new Date(p.occurredAt).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `<b>BLACK GALAXY TRADE</b>\n<b>${escape(heading)}</b>\nXAUUSD · 5 min${p.type === 'SIGNAL' ? '' : ` · ${side}`}\n\nEntrada: <b>${number(t.entry, 3)}</b>\nSL: ${number(t.sl, 3)}\nTP1: ${number(t.tp1, 3)}\nTP2: ${number(t.tp2, 3)}\nTP3: ${number(t.tp3, 3)}\n\n${escape(at)} · Bogotá\n<code>Operación ${escape(String(p.tradeId).slice(0, 8))}</code>`;
  }
  if (!['WEEKLY', 'MONTHLY'].includes(job.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) throw new Error('Invalid report payload');
  const closed = Number(p.wins) + Number(p.losses);
  const rate = closed ? `${number(Number(p.wins) * 100 / closed, 1)}% (${number(p.wins)}/${number(closed)})` : 'Sin operaciones evaluables';
  const day = (value) => value ? `${date(value.day)} · ${number(value.rate, 1)}% (${number(value.wins)}/${number(Number(value.wins) + Number(value.losses))})` : 'Sin datos evaluables';
  const scenarios = (p.targets || []).map((target) => `Salir en TP${target.level}: <b>${money(target.net)}</b>`).join('\n');
  const asOf = new Date(p.asOf).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
  return `<b>BLACK GALAXY TRADE</b>\n📊 <b>Reporte ${job.kind === 'WEEKLY' ? 'semanal' : 'mensual'}</b>\n${date(p.from)} — ${date(p.to)}\n\nSeñales: <b>${number(p.signals)}</b> · ${number(p.signalDays)} días con señales\nGanadas: ${number(p.wins)} · SL: ${number(p.losses)}\nAbiertas: ${number(p.open)} · No consideradas: ${number(p.ignored)}\n<b>Efectividad: ${rate}</b>\nTP1: ${number(p.hits?.[0])} · TP2: ${number(p.hits?.[1])} · TP3: ${number(p.hits?.[2])}\n\nMejor día: ${day(p.bestDay)}\nMenor acierto: ${day(p.worstDay)}\n\n<b>Simulación histórica · 0,10 lotes</b>\n${scenarios}\n100 oz/lote. SL tras TP previo sin descuento. Sin comisiones ni deslizamiento; no es ganancia garantizada.\n\nResultados de las señales emitidas en este período, registrados al ${escape(asOf)} · Bogotá.`;
}
