import { expect, it, vi } from 'vitest';
import { drainTelegram } from '../supabase/functions/scanner-telegram/delivery';
import { availableTradeStrategy } from '../src/services/trade-strategy-access';
import { lockAppScroll } from '../src/services/lock-app-scroll';
vi.mock('../src/services/api', () => ({ api: {} }));

it('sends a cached entry image directly and acknowledges it in the shared outbox', async () => {
  const job={id:1,lease:'lease',kind:'EVENT',chatId:-123,payload:{type:'SIGNAL',occurredAt:new Date().toISOString(),tradeId:'trade',trade:{side:'BUY',entry:4000,sl:3990,tp1:4005,tp2:4010,tp3:4015}}};
  const rpc=vi.fn(async name=>({data:name==='claim_scanner_telegram_job'?(rpc.mock.calls.filter(([n])=>n===name).length===1?{job}:null):true}));
  const cache=vi.fn().mockResolvedValue({data:{path:'reusable/galaxy-buy.png',file_id:'cached-buy'}}),save=vi.fn().mockResolvedValue({});
  const client={rpc,from:()=>({select:()=>({eq:()=>({single:cache})}),update:()=>({eq:save})})};
  const request=vi.fn().mockResolvedValue({status:200,json:async()=>({ok:true,result:{message_id:99,photo:[{file_id:'cached-buy'}]}})}),renderReport=vi.fn();
  expect(await drainTelegram({client,token:'private-token',chatId:-123,request,renderReport})).toEqual({sent:1,retry:0,failed:0});
  expect(request.mock.calls[0][0]).toMatch(/\/sendPhoto$/);
  const form=request.mock.calls[0][1].body;expect(form.get('photo')).toBe('cached-buy');expect(form.get('caption')).toContain('NUEVA SEÑAL');
  expect(rpc).toHaveBeenCalledWith('finish_scanner_telegram_job',expect.objectContaining({p_id:1,p_lease:'lease',p_status:'sent',p_message_id:99}));
  expect(save).toHaveBeenCalledWith('key','BUY');expect(renderReport).not.toHaveBeenCalled();
});
it('never opens a disabled strategy, including direct links and the both-disabled case',()=>{
 expect(availableTradeStrategy('RANGE777',{OPUS:true,RANGE777:false})).toBe('OPUS');
 expect(availableTradeStrategy('OPUS',{OPUS:false,RANGE777:true})).toBe('RANGE777');
 expect(availableTradeStrategy('OPUS',{OPUS:false,RANGE777:false})).toBeNull();
 expect(availableTradeStrategy('OPUS',null)).toBeNull();
});
it('keeps the internal mobile scroller locked through nested dialogs and restores it once',()=>{
 const body={style:{overflow:''}},page={style:{overflow:'auto'}},target={body,querySelector:()=>page};
 const first=lockAppScroll(target),second=lockAppScroll(target);expect(page.style.overflow).toBe('hidden');
 first();expect(page.style.overflow).toBe('hidden');second();expect(page.style.overflow).toBe('auto');expect(body.style.overflow).toBe('');
 second();expect(page.style.overflow).toBe('auto');
});
