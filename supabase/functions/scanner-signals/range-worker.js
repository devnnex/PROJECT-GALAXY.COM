import { advanceRange } from './range-engine.js';
export async function runRangeTick(client, quote, now = Date.now()) {
  const rpc=async(name,params)=>{const {data,error}=await client.rpc(name,params);if(error)throw new Error('RANGE_DATABASE_UNAVAILABLE');return data;};
  const claim=await rpc('claim_range_tick');if(!claim)return {status:'idle'};
  try {
    const result=advanceRange(claim.runtime,quote,now);
    const stored=await rpc('complete_range_tick',{p_lease:claim.lease,p_runtime:result.state,p_trades:result.trades,p_events:result.events});
    return {status:stored?result.status:'conflict',events:stored?result.events.length:0};
  }catch{await client.rpc('fail_range_tick',{p_lease:claim.lease});return {status:'unavailable'};}
}
