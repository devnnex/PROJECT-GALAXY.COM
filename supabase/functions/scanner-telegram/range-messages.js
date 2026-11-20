const number=(value,decimals=0)=>new Intl.NumberFormat('es-CO',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(Number(value)||0);
const date=(day)=>new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium'});
const escape=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function rangeMessage(job) {
 const p=job.payload;
 if(job.kind==='EVENT') {
  const t=p.trade;
  if (!['SIGNAL','BE','CLOSED'].includes(p.type)||!['BUY','SELL'].includes(t?.side)||!['entry','sl','initialSl'].every(key=>Number.isFinite(Number(t[key])))||!Number.isFinite(Date.parse(p.occurredAt))
    || (p.type==='CLOSED'&&(!['WIN','SL','BE'].includes(t.outcome)||!Number.isFinite(Number(t.exit))))) throw new Error('Invalid range event');
  const price=value=>Number(value).toFixed(3);
  const heading=p.type==='SIGNAL'?'✨ RUPTURA CONFIRMADA':p.type==='BE'?'🛡 BREAKEVEN ACTIVADO':t.outcome==='WIN'?'🏆 CIERRE POSITIVO':t.outcome==='BE'?'🛡 CIERRE EN BREAKEVEN':'🛑 CIERRE POR SL';
  const closing=p.type==='CLOSED'?`\n📌 <b>Salida observada:</b> <code>${price(t.exit)}</code>`:'';
  const at=new Date(p.occurredAt).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'});
  return `💜 <b>BLACK GALAXY TRADE</b>\n💠 <b>RUPTURA 777 · M5</b>\n<b>${t.side==='BUY'?'🟢 BUY':'🔴 SELL'} · XAUUSD</b>\n${heading}\n\n📍 <b>Entrada:</b> <code>${price(t.entry)}</code>\n🛡 <b>SL actual:</b> <code>${price(t.sl)}</code>${closing}\n\n⚡ BE desde +$5 · Trailing $5\n<i>Sin TP fijo · Seguimiento en Galaxy</i>\n\n🗓 ${escape(at)} · Bogotá\n<code>Ref. ${escape(String(p.tradeId).slice(0,8))}</code>`;
 }
 if(!['WEEKLY','MONTHLY'].includes(job.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(p.from)||!/^\d{4}-\d{2}-\d{2}$/.test(p.to))throw new Error('Invalid range report');
 const closed=Number(p.wins)+Number(p.losses)+Number(p.breakevens);
 const effectiveness=closed?`🎯 <b>${number(Number(p.wins)*100/closed,1)}% de efectividad histórica</b>\n<b>${number(p.wins)} de ${number(closed)} ${closed===1?'operativa evaluada':'operativas evaluadas'} con resultado positivo.</b>`:'🎯 <b>Seguimiento de efectividad</b>\nEste período aún no tiene operativas evaluables.';
 const best=p.bestDay?`\n\n🌟 <b>Mejor jornada</b>\n${date(p.bestDay.day)} · <b>${number(p.bestDay.rate,1)}%</b>`:'';
 return `💜 <b>PROJECT GALAXY</b>\n💠 <b>RUPTURA 777 · M5</b>\n📊 <b>Efectividad ${job.kind==='WEEKLY'?'semanal':'mensual'}</b>\n🗓 ${date(p.from)} — ${date(p.to)}\n\n${effectiveness}\n\n🛡 BE activado · <b>${number(p.protected)}</b>\n⚖️ Cierres en breakeven · <b>${number(p.breakevens)}</b>${best}\n\n💎 <b>Resultados visibles. Seguimiento de cada señal.</b>\n<i>${number(p.signalDays)} ${Number(p.signalDays)===1?'día':'días'} con señales · El porcentaje incluye los cierres BE.</i>`;
}
