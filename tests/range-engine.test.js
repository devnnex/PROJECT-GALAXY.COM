import {expect,it} from 'vitest';
import {advanceRange,rangeBreakout} from '../supabase/functions/scanner-signals/range-engine';
import {rangePeriods} from '../src/services/range-analytics';
const start=Date.UTC(2026,10,19,15),interval=300_000;
const bars=()=>Array.from({length:20},(_,i)=>({at:start+i*interval,open:100,close:100,high:102,low:98}));
const signal=(side='BUY')=>({at:start+20*interval,open:100,high:side==='BUY'?104:101,low:side==='BUY'?99:96,close:side==='BUY'?103:97});
const saved=(side='BUY')=>({schema:1,bars:bars(),bar:signal(side),lastQuoteAt:start+20*interval+270_000,trade:null});
const quote=(price,offset=0)=>({price,at:start+21*interval+offset,source:'gold-api'});
const advance=(state,q)=>advanceRange(state,q,q.at);
it('compares the signal close against the preceding twenty bars, excluding the signal itself',()=>{
 expect(rangeBreakout([...bars(),signal()])).toMatchObject({side:'BUY',level:102.05});
 expect(rangeBreakout([...bars(),signal('SELL')])).toMatchObject({side:'SELL',level:97.95});
 expect(rangeBreakout([...bars(),{...signal(),close:102.05}])).toBe(null);
 expect(rangeBreakout(bars())).toBe(null);
});
it.each(['BUY','SELL'])('opens a %s once, with a $10 stop and no invented targets',side=>{
 const result=advance(saved(side),quote(side==='BUY'?103:97));
 const t=result.trades[0];expect(t.side).toBe(side);expect(Math.abs(t.entry-t.sl)).toBe(10);expect(t.tp1).toBeUndefined();
 expect(result.events).toHaveLength(1);expect(advance(result.state,quote(t.entry)).events).toHaveLength(0);
 expect(advance(result.state,quote(t.entry,30000)).events).toHaveLength(0);
});
it('expires an entry at twenty seconds and rejects late receipts and a return to the breakout level',()=>{
 expect(advance(saved(),quote(103,20000)).trades).toHaveLength(0);
 expect(advanceRange(saved(),quote(103),quote(103).at+25000).trades).toHaveLength(0);
 expect(advance(saved(),quote(102)).trades).toHaveLength(0);
});
it.each(['BUY','SELL'])('waits for $10, announces protection once and classifies the protected stop for %s',side=>{
 const direction=side==='BUY'?1:-1,entry=side==='BUY'?103:97;
 let result=advance(saved(side),quote(entry));
 result=advance(result.state,quote(entry+direction*5,30000));expect(result.state.trade.sl).toBe(entry-direction*10);expect(result.events).toHaveLength(0);
 result=advance(result.state,quote(entry+direction*10,60000));expect(result.state.trade.sl).toBe(entry+direction*5);expect(result.events.map(e=>e.type)).toEqual(['BE']);
 result=advance(result.state,quote(entry+direction*9,90000));expect(result.state.trade.sl).toBe(entry+direction*5);expect(result.events).toEqual([]);
 result=advance(result.state,quote(entry+direction*4,120000));expect(result.state.trade).toMatchObject({status:'CLOSED',outcome:'WIN',net:5,exitReason:'SL_PROFIT',observedNet:4,accountingBasis:'STOP_LEVEL'});expect(result.events[0].type).toBe('CLOSED');
});
it('keeps a breakeven close distinct and counts a gap through BE as an observed loss',()=>{
 const opened=advance(saved(),quote(103));const be=structuredClone(opened);be.state.trade.sl=103;be.state.trade.beAt=new Date(quote(108,30000).at).toISOString();
 expect(advance(be.state,quote(103,60000)).state.trade).toMatchObject({outcome:'BE',net:0});
 expect(advance(be.state,quote(101,60000)).state.trade).toMatchObject({outcome:'SL',net:-2,exit:101});
});
it('warms up from observed full bars without historical alerts and discards gaps',()=>{
 let state;for(let i=0;i<22;i++)state=advance(state,{price:100,source:'gold-api',at:start+i*interval}).state;
 // Five-minute gaps between samples are not full observed candles.
 expect(state.bars).toHaveLength(0);expect(state.trade).toBe(null);
 const gap=advance(saved(),quote(103,interval*2));expect(gap.state.bars).toHaveLength(0);expect(gap.events).toHaveLength(0);
});
it('builds its complete channel from continuous shared samples without historical or premature entries',()=>{
 let state,result;
 for(let i=0;i<=210;i++){const at=start+i*30000;result=advance(state,{price:100,source:'gold-api',at});state=result.state;expect(result.events).toHaveLength(0);}
 expect(state.bars).toHaveLength(21);expect(result.status).toBe('ready');expect(state.trade).toBe(null);
});
it('excludes break even from weighted effectiveness and applies dates without mixing strategies',()=>{
 const rows=[{day:'2025-12-31',wins:1,losses:0,breakevens:0,signals:1},{day:'2026-01-01',wins:2,losses:1,breakevens:1,signals:4},{day:'2026-01-02',wins:1,losses:0,breakevens:0,signals:1}];
 const all=rangePeriods(rows);expect(all.rate).toBe(80);expect(all.bestDays.best.key).toBe('2025-12-31');expect(all.bestYears.best.key).toBe('2025');
 const filtered=rangePeriods(rows,'2026-01-01','2026-01-01');expect(filtered.rate).toBeCloseTo(200/3);expect(filtered.closed).toBe(3);expect(filtered.total.breakevens).toBe(1);
});
it.each(['BUY','SELL'])('retains legacy positive stops as winners even when the next %s sample crosses entry',side=>{
 const dir=side==='BUY'?1:-1,entry=side==='BUY'?103:97;
 const opened=advance(saved(side),quote(entry));
 opened.state.trade.sl=entry+dir*.2;opened.state.trade.beAt=new Date(quote(entry+dir*5,30000).at).toISOString();
 const closed=advance(opened.state,quote(entry-dir*2,60000));
 expect(closed.state.trade).toMatchObject({outcome:'WIN',exitReason:'SL_PROFIT',net:.2,observedNet:-2,observedExit:entry-dir*2});
});
it('pauses entries without pausing stop management or replaying a pending breakout on resume',()=>{
 const q=quote(103),paused=advanceRange(saved(),q,q.at,false);expect(paused.events).toEqual([]);expect(paused.state.trade).toBeNull();
 expect(advance(paused.state,quote(104,10000)).events).toEqual([]);
 const opened=advance(saved(),q);const stopped=advanceRange(opened.state,quote(92,30000),quote(92,30000).at,false);
 expect(stopped.state.trade).toMatchObject({status:'CLOSED',outcome:'SL'});expect(stopped.events.map(e=>e.type)).toEqual(['CLOSED']);
});
