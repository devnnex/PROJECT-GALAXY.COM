const number=(value,decimals=0)=>new Intl.NumberFormat('es-CO',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(Number(value)||0);
const date=(day)=>new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-CO',{timeZone:'America/Bogota',dateStyle:'medium'});
export function rangeMessage(job) {
 const p=job.payload;
 if(job.kind==='EVENT') {
  const t=p.trade;
  if (!['SIGNAL','BE','CLOSED'].includes(p.type)||!['BUY','SELL'].includes(t?.side)||!['entry','sl','initialSl'].every(key=>Number.isFinite(Number(t[key])))||!Number.isFinite(Date.parse(p.occurredAt))
    || (p.type==='CLOSED'&&(!['WIN','SL'].includes(t.outcome)||!Number.isFinite(Number(t.exit))))) throw new Error('Invalid range event');
  const price=value=>Number(value).toFixed(3),direction=t.side==='BUY'?1:-1;
  const protectedMove=Number(((t.sl-t.entry)*direction).toFixed(6));
  const brand='💠 <b>GALAXY AURUM BOT · M5</b>';
  const side=`<b>${t.side==='BUY'?'🟢 BUY':'🔴 SELL'} · XAUUSD</b>`;
  if(p.type==='SIGNAL')return `${brand}\n${side}\n\n📍 Entrada <code>${price(t.entry)}</code>\n🛡 SL <code>${price(t.sl)}</code>\n\n<i>SL positivo desde +$10 · Seguimiento en Galaxy</i>`;
  if(p.type==='BE') {
   if(protectedMove<=0)throw new Error('Protection must be positive');
   return `🛡 <b>BENEFICIO PROTEGIDO</b>\n${brand}\n${side}\n\nMueve el SL a <code>${price(t.sl)}</code>\n<b>+$${price(protectedMove)}</b> de movimiento a favor de la señal.`;
  }
  const net=Number(((Number(t.exit)-Number(t.entry))*direction).toFixed(6));
  return `${t.outcome==='WIN'?'🏆 <b>GANADA · SL PROFIT</b>':'🔴 <b>OPERATIVA PERDEDORA</b>'}\n${brand}\n${side}\n\n📍 Entrada <code>${price(t.entry)}</code>\n${t.accountingBasis==='STOP_LEVEL'?'🛡 SL Profit':'Salida'} <code>${price(t.exit)}</code>\n<b>Resultado de la señal: ${net>0?'+':''}$${price(net)}</b>`;
 }
 if(!['WEEKLY','MONTHLY'].includes(job.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(p.from)||!/^\d{4}-\d{2}-\d{2}$/.test(p.to))throw new Error('Invalid range report');
 const closed=Number(p.wins)+Number(p.losses);
 const effectiveness=closed?`🎯 <b>${number(Number(p.wins)*100/closed,1)}% de efectividad histórica</b>\n${number(p.wins)} de ${number(closed)} operativas evaluadas.`:'Este período aún no tiene operativas evaluables.';
 return `💠 <b>GALAXY AURUM BOT · M5</b>\n📊 <b>Resumen ${job.kind==='WEEKLY'?'semanal':'mensual'}</b>\n${date(p.from)} — ${date(p.to)}\n\n${effectiveness}\n🏆 Ganadas <b>${number(p.wins)}</b> · Perdidas <b>${number(p.losses)}</b>\n⚪ BE excluidas <b>${number(p.breakevens)}</b>\n\n<i>Historial completo en Galaxy.</i>`;
}
