// Signal-only adaptation of XAUUSD_Ruptura_Rangos_M1_M5_777 v1.12.
// Gold API supplies sampled prices, not broker bid/ask, orders or fills.
export const RANGE_SETTINGS = Object.freeze({ timeframeMinutes: 5, rangeBars: 20, buffer: 0.05, initialStop: 10, breakeven: 5, trailing: 5, trailingStep: 0.10, validityMs: 20_000 });
const interval = 300_000;
const iso = (at) => new Date(at).toISOString();

export function rangeBreakout(bars) {
  if (bars.length < 21) return null;
  const signal = bars.at(-1), prior = bars.slice(-21, -1);
  const high = Math.max(...prior.map((bar) => bar.high)), low = Math.min(...prior.map((bar) => bar.low));
  return signal.close > high + RANGE_SETTINGS.buffer ? {side:'BUY', level:high + RANGE_SETTINGS.buffer, high, low}
    : signal.close < low - RANGE_SETTINGS.buffer ? {side:'SELL', level:low - RANGE_SETTINGS.buffer, high, low} : null;
}

export function advanceRange(saved, quote, receivedAt = Date.now()) {
  if (!Number.isFinite(quote?.price) || quote.price <= 0 || !Number.isSafeInteger(quote.at) || quote.source !== 'gold-api') throw new Error('INVALID_RANGE_QUOTE');
  const state = saved?.schema === 1 ? structuredClone(saved) : {schema:1, bars:[], bar:null, trade:null, lastQuoteAt:null};
  const events = [], trades = [];
  if (state.lastQuoteAt != null && quote.at <= state.lastQuoteAt) return {state,events,trades,status:'duplicate'};
  const bucket = Math.floor(quote.at / interval) * interval;
  const emit = (type, trade) => events.push({type, tradeKey:trade.key, occurredAt:iso(quote.at), payload:structuredClone(trade)});
  if (state.trade?.status === 'OPEN') {
    const t = state.trade, direction = t.side === 'BUY' ? 1 : -1;
    // Evaluate the existing stop BEFORE raising it. Never credit an unobserved
    // excursion or pretend a gap filled at the stop rather than the sample.
    if ((quote.price - t.sl) * direction <= 0) {
      t.status='CLOSED'; t.exit=quote.price; t.closedAt=iso(quote.at); t.net=Number(((quote.price-t.entry)*direction).toFixed(6));
      t.outcome=t.net > 0 ? 'WIN' : t.net < 0 ? 'SL' : 'BE';
      t.exitReason=t.beAt ? 'TRAILING' : 'INITIAL_SL'; emit('CLOSED',t);
    } else if ((quote.price-t.entry)*direction >= RANGE_SETTINGS.breakeven) {
      const desired = direction === 1 ? Math.max(t.entry,quote.price-RANGE_SETTINGS.trailing) : Math.min(t.entry,quote.price+RANGE_SETTINGS.trailing);
      // Directional pip rounding matches PrecioAlTick's floor/ceil convention.
      const candidate = (direction === 1 ? Math.floor(desired*100+1e-8) : Math.ceil(desired*100-1e-8))/100;
      if ((candidate-t.sl)*direction >= RANGE_SETTINGS.trailingStep-0.0025) {
        t.sl=candidate;
        if (!t.beAt) { t.beAt=iso(quote.at); emit('BE',t); }
      }
    }
    if (JSON.stringify(t) !== JSON.stringify(saved?.trade)) trades.push(structuredClone(t));
  }
  const gap = state.lastQuoteAt != null && quote.at-state.lastQuoteAt > 60_000;
  if (gap) { state.bars=[]; state.bar=null; state.pending=null; }
  if (state.bar && bucket !== state.bar.at) {
    if (bucket-state.bar.at !== interval) state.bars=[];
    else if (!state.bar.partial) state.bars=[...state.bars,state.bar].slice(-21);
    state.pending=rangeBreakout(state.bars);
    state.bar=null;
  }
  if (!state.bar) state.bar={at:bucket,open:quote.price,high:quote.price,low:quote.price,close:quote.price,partial:gap || quote.at-bucket>30_000};
  else {state.bar.high=Math.max(state.bar.high,quote.price);state.bar.low=Math.min(state.bar.low,quote.price);state.bar.close=quote.price;}
  const fresh=receivedAt-quote.at<=20_000 && quote.at-receivedAt<=15_000;
  const withinWindow=quote.at-bucket<RANGE_SETTINGS.validityMs && receivedAt-bucket<RANGE_SETTINGS.validityMs;
  if (state.pending && (!withinWindow || (quote.price-state.pending.level)*(state.pending.side === 'BUY' ? 1 : -1)<=0)) state.pending=null;
  if (state.pending && state.trade?.status !== 'OPEN' && withinWindow && fresh) {
    const direction=state.pending.side === 'BUY' ? 1 : -1;
    const initialSl=(direction===1?Math.floor((quote.price-RANGE_SETTINGS.initialStop)*100+1e-8):Math.ceil((quote.price+RANGE_SETTINGS.initialStop)*100-1e-8))/100;
    const trade={key:`RANGE777:XAUUSD:5:${bucket}`,strategy:'RANGE777',symbol:'XAUUSD',timeframeMinutes:5,source:'gold-api',
      side:state.pending.side,entry:quote.price,initialSl,sl:initialSl,
      rangeHigh:state.pending.high,rangeLow:state.pending.low,breakoutLevel:state.pending.level,
      barAt:iso(bucket),detectedAt:iso(quote.at),status:'OPEN',outcome:null,beAt:null};
    state.trade=trade;trades.push(structuredClone(trade));emit('SIGNAL',trade);state.pending=null;
  }
  // A position blocks that candle's signal just as HayPosicionEnElSimbolo does.
  if (state.trade?.status === 'OPEN') state.pending=null;
  state.lastQuoteAt=quote.at;
  return {state,events,trades,status:state.bars.length>=21?'ready':'warming'};
}
