const block = (style, ...children) => ({type:'div',props:{style:{display:'flex',...style},children}});
const format = (value) => new Intl.NumberFormat('es-CO',{maximumFractionDigits:1}).format(Number(value)||0);
export function reportCardTree(job) {
  const p=job.payload, range=p.strategy==='RANGE777';
  const closed=Number(p.wins||0)+Number(p.losses||0)+(range?Number(p.breakevens||0):0);
  const rate=closed?`${format(Number(p.wins)*100/closed)}%`:'—';
  const metrics=range?[['POSITIVAS',p.wins],['BREAKEVEN',p.breakevens],['BE ACTIVADO',p.protected]]:[['TP1',p.hits?.[0]],['TP2',p.hits?.[1]],['TP3',p.hits?.[2]]];
  return block({width:1200,height:760,padding:'56px 64px',flexDirection:'column',color:'#f7f3ff',fontFamily:'sans-serif',backgroundImage:'radial-gradient(ellipse at 90% 10%, #54238c 0%, #15101f 52%, #090b15 100%)'},
    block({fontSize:23,letterSpacing:6,color:'#d5b4ff'},'PROJECT GALAXY'),
    block({marginTop:14,fontSize:40,fontWeight:700},'BLACK GALAXY TRADE'),
    block({marginTop:16,fontSize:24,color:'#e3d5fb'},`${range?'GALAXY AURUM BOT':'OPUS 5.5'} · M5  /  ${job.kind==='WEEKLY'?'SEMANAL':'MENSUAL'}`),
    block({marginTop:12,fontSize:21,color:'#b7b0cb'},`${p.from} — ${p.to} · Bogotá`),
    block({marginTop:26,alignItems:'center',gap:28},block({fontSize:116,lineHeight:1,fontWeight:700,color:'#d4b0ff'},rate),
      block({flexDirection:'column',fontSize:25,gap:10},'EFECTIVIDAD HISTÓRICA',block({fontSize:21,color:'#c6bfd5'},closed?`${format(p.wins)} de ${format(closed)} ${closed===1?'operativa evaluada':'operativas evaluadas'}`:'Aún sin operativas evaluables'))),
    block({marginTop:34,gap:20},...metrics.map(([label,value])=>block({width:344,padding:'22px 26px',border:'1px solid #74568f',borderRadius:22,backgroundColor:'#221b31',flexDirection:'column',gap:12},block({fontSize:18,letterSpacing:2,color:'#cbb7e0'},label),block({fontSize:46,fontWeight:700,color:'#b9f5d7'},format(value))))),
    block({marginTop:26,fontSize:21,color:'#d3c8e3'},`${format(p.signalDays)} ${Number(p.signalDays)===1?'día':'días'} con señales · Resultados del período${range?' · BE incluidos':''}`));
}
