export function rangePeriods(days,from='',to='') {
 const filtered=days.filter(d=>(!from||d.day>=from)&&(!to||d.day<=to));
 const total=filtered.reduce((a,d)=>{for(const k of ['signals','wins','losses','breakevens','open','net','gain','loss','protected'])a[k]=(a[k]||0)+Number(d[k]||0);return a;},{});
 const groups=(size)=>{
  const map=new Map();for(const d of filtered){const key=d.day.slice(0,size);let row=map.get(key);if(!row){row={key,wins:0,losses:0,breakevens:0};map.set(key,row);}for(const k of ['wins','losses','breakevens'])row[k]+=Number(d[k]||0);}
  return [...map.values()].map(r=>({...r,closed:r.wins+r.losses,rate:r.wins+r.losses?r.wins*100/(r.wins+r.losses):null}));
 };
 const ranked=(rows)=>{const eligible=rows.filter(r=>r.closed);const sort=(sign)=>[...eligible].sort((a,b)=>sign*(a.rate-b.rate)||b.closed-a.closed||a.key.localeCompare(b.key));return {best:sort(-1)[0]||null,worst:sort(1)[0]||null};};
 const years=groups(4),months=groups(7),daily=groups(10),closed=Number(total.wins||0)+Number(total.losses||0);
 return {total,closed,rate:closed?total.wins*100/closed:null,signalDays:filtered.filter(d=>Number(d.signals)>0).length,years,months,daily,bestYears:ranked(years),bestMonths:ranked(months),bestDays:ranked(daily)};
}
