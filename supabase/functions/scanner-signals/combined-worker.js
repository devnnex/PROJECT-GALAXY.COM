import {runScannerTick} from './worker.js';
import {runRangeTick} from './range-worker.js';
import {fetchGoldQuote} from './provider.js';
export async function runCombinedScannerTick({client,goldKey,getQuote=fetchGoldQuote,scanner=runScannerTick,range=runRangeTick,onEvents=()=>{}}) {
 let shared;
 // Notification transport cannot turn an already committed trade into a failure.
 const published=(result)=>{if(result?.events>0)try{onEvents(result);}catch{}};
 try{const result=await scanner({client,goldKey,getQuote:async()=>{shared=await getQuote();return shared;}});published(result);return result;}
 finally{
  // The original transaction completes first. Isolate the new ledger even if
  // its write fails or the original ATR bootstrap needs to retry its history.
  if(shared)try{published(await range(client,shared));}catch{/* Its own lease expires. */}
 }
}
