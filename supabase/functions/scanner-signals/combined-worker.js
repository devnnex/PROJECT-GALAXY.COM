import {runScannerTick} from './worker.js';
import {runRangeTick} from './range-worker.js';
import {fetchGoldQuote} from './provider.js';
export async function runCombinedScannerTick({client,goldKey,getQuote=fetchGoldQuote,scanner=runScannerTick,range=runRangeTick}) {
 let shared;
 try{return await scanner({client,goldKey,getQuote:async()=>{shared=await getQuote();return shared;}});}
 finally{
  // The original transaction completes first. Isolate the new ledger even if
  // its write fails or the original ATR bootstrap needs to retry its history.
  if(shared)try{await range(client,shared);}catch{/* Its own lease expires. */}
 }
}
