import {expect,it,vi} from 'vitest';
import {telegramMessage} from '../supabase/functions/scanner-telegram/messages';
import {telegramMedia} from '../supabase/functions/scanner-telegram/media';
import {reportCardTree} from '../supabase/functions/scanner-telegram/report-card';
import {runRangeTick} from '../supabase/functions/scanner-signals/range-worker';
const event={kind:'EVENT',payload:{strategy:'RANGE777',type:'SIGNAL',tradeId:'12345678',occurredAt:'2026-11-19T14:00:00Z',trade:{side:'BUY',entry:4000,initialSl:3990,sl:3990}}};
it('labels the breakout strategy and publishes BE/trailing instead of fictitious TP levels',()=>{
 const text=telegramMessage(event);expect(text).toContain('💠 <b>RUPTURA 777 · M5');expect(text).toContain('🟢 BUY');expect(text).toContain('BE desde +$5');expect(text).not.toMatch(/TP1|TP2|TP3/);expect(text.length).toBeLessThan(1024);
 const close=structuredClone(event);close.payload.type='CLOSED';close.payload.trade={...close.payload.trade,outcome:'BE',exit:4000};expect(telegramMessage(close)).toContain('CIERRE EN BREAKEVEN');
 close.payload.trade.exit=undefined;expect(()=>telegramMessage(close)).toThrow();
});
it('uses all closed results including BE for range reports, and keeps the image calculation consistent',()=>{
 const job={kind:'MONTHLY',payload:{strategy:'RANGE777',from:'2026-11-01',to:'2026-11-30',wins:4,losses:1,breakevens:3,protected:7,signalDays:5}};
 const text=telegramMessage(job);expect(text).toContain('50,0%');expect(text).toContain('4 de 8');expect(text).not.toContain('TP1');expect(text.length).toBeLessThan(1024);
 const image=JSON.stringify(reportCardTree(job));expect(image).toContain('50%');expect(image).toContain('RUPTURA 777');expect(image).not.toContain('OPUS');
});
it('reuses Telegram file IDs without fetching a PNG and sends other outcome events as text',async()=>{
 const single=vi.fn().mockResolvedValue({data:{path:'reusable/galaxy-buy.png',file_id:'cached-photo'}}),download=vi.fn();
 const client={from:()=>({select:()=>({eq:()=>({single})})}),storage:{from:()=>({download})}};
 expect(await telegramMedia(event,client,vi.fn())).toBe('cached-photo');expect(download).not.toHaveBeenCalled();
 expect(await telegramMedia({...event,payload:{...event.payload,type:'BE'}},client,vi.fn())).toBe(null);
});
it('uploads the stored artwork initially, renders report data locally, and rejects arbitrary storage paths',async()=>{
 const png=new Blob(['png']),download=vi.fn().mockResolvedValue({data:png}),single=vi.fn().mockResolvedValue({data:{path:'reusable/galaxy-buy.png',file_id:null}});
 const client={from:()=>({select:()=>({eq:()=>({single})})}),storage:{from:()=>({download})}};
 expect(await telegramMedia(event,client,vi.fn())).toBe(png);expect(download).toHaveBeenCalledWith('reusable/galaxy-buy.png');
 const render=vi.fn().mockResolvedValue(png),report={kind:'WEEKLY',payload:{}};expect(await telegramMedia(report,client,render)).toBe(png);expect(render).toHaveBeenCalledWith(report);
 await expect(telegramMedia({kind:'PHOTO',payload:{path:'../private.png'}},client,render)).rejects.toThrow();
});
it('persists only one leased range state and releases failed work without propagating it into the original engine',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:{lease:'range-lease',runtime:{}}}).mockResolvedValueOnce({data:true});
 const q={price:4000,at:Date.now(),source:'gold-api'};expect((await runRangeTick({rpc},q,q.at)).status).toBe('warming');expect(rpc.mock.calls[1][1].p_lease).toBe('range-lease');
 const failing=vi.fn().mockResolvedValueOnce({data:{lease:'bad',runtime:{}}}).mockResolvedValue({error:{message:'private'}});
 expect(await runRangeTick({rpc:failing},{price:NaN})).toEqual({status:'unavailable'});expect(failing.mock.calls[1][0]).toBe('fail_range_tick');
});
