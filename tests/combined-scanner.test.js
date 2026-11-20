import {expect,it,vi} from 'vitest';
import {runCombinedScannerTick} from '../supabase/functions/scanner-signals/combined-worker';
it('starts Telegram directly after each commit without waiting for the other strategy',async()=>{
 const order=[],getQuote=vi.fn().mockResolvedValue({price:4000}),onEvents=vi.fn(()=>order.push('send'));
 await runCombinedScannerTick({getQuote,onEvents,scanner:async options=>{await options.getQuote();order.push('opus-commit');return {events:1};},range:async()=>{order.push('aurum-commit');return {events:1};}});
 expect(order).toEqual(['opus-commit','send','aurum-commit','send']);expect(onEvents).toHaveBeenCalledTimes(2);
 await expect(runCombinedScannerTick({onEvents:()=>{throw new Error('Transport failure');},scanner:async()=>({events:1,status:'ready'})})).resolves.toEqual({events:1,status:'ready'});
});
it('uses a single provider sample and commits the original scanner before the independent range ledger',async()=>{
 const order=[],quote={price:4000,at:Date.now(),source:'gold-api'},getQuote=vi.fn().mockResolvedValue(quote),range=vi.fn(async()=>{order.push('range');});
 const result=await runCombinedScannerTick({client:{},getQuote,scanner:async options=>{expect(await options.getQuote()).toBe(quote);order.push('original-committed');return {status:'ready'};},range});
 expect(result.status).toBe('ready');expect(getQuote).toHaveBeenCalledOnce();expect(range).toHaveBeenCalledWith({},quote);expect(order).toEqual(['original-committed','range']);
});
it('keeps an idle scanner idle and preserves the original result when the second ledger is unavailable',async()=>{
 const getQuote=vi.fn().mockResolvedValue({price:4000}),range=vi.fn(async()=>{throw new Error('range failure');});
 await runCombinedScannerTick({scanner:async()=>({status:'idle'}),getQuote,range});expect(range).not.toHaveBeenCalled();expect(getQuote).not.toHaveBeenCalled();
 expect(await runCombinedScannerTick({getQuote,range,scanner:async options=>{await options.getQuote();return {status:'ready'};}})).toEqual({status:'ready'});
});
it('can continue the second strategy with the same quote while the original historical bootstrap retries',async()=>{
 const range=vi.fn(),getQuote=vi.fn().mockResolvedValue({price:4000});
 await expect(runCombinedScannerTick({getQuote,range,scanner:async options=>{await options.getQuote();throw new Error('HISTORY_RETRY');}})).rejects.toThrow('HISTORY_RETRY');expect(range).toHaveBeenCalledOnce();
});
