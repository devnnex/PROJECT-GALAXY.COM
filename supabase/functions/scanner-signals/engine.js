import { openTrade, updateTrade } from './trade-accounting.js';

// Server port of the indicator's original SuperTrend conditions and its
// immediate, frozen signal latch. No TradingView connection is used.
export const DEFAULT_SETTINGS = Object.freeze({
  symbol: 'XAUUSD', timeframeMinutes: 5, atrPeriod: 10, multiplier: 3,
  useRma: true, pipSize: 0.01, tpStepPips: 500,
});

export function settingsFor(input = {}) {
  const config = { ...DEFAULT_SETTINGS, ...input };
  if (config.symbol !== 'XAUUSD' || ![1, 5, 15, 30, 60].includes(config.timeframeMinutes)
    || !Number.isInteger(config.atrPeriod) || config.atrPeriod < 2 || config.atrPeriod > 200
    || !Number.isFinite(config.multiplier) || config.multiplier <= 0 || config.multiplier > 100
    || typeof config.useRma !== 'boolean' || !Number.isFinite(config.pipSize) || config.pipSize <= 0
    || !Number.isInteger(config.tpStepPips) || config.tpStepPips < 1) throw new Error('INVALID_SCANNER_SETTINGS');
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, config[key]]));
}

// `previous` contains only the last COMPLETED candle. Every sample of the
// current candle is recalculated from that snapshot, as in Pine's rollback.
export function evaluateBar(bar, previous, input = DEFAULT_SETTINGS) {
  const config = settingsFor(input);
  const range = previous ? Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close)) : bar.high - bar.low;
  const trWindow = [...(previous?.trWindow || []), range].slice(-config.atrPeriod);
  const sma = trWindow.length === config.atrPeriod ? trWindow.reduce((sum, value) => sum + value, 0) / config.atrPeriod : null;
  const rma = previous?.rma != null ? (previous.rma * (config.atrPeriod - 1) + range) / config.atrPeriod : sma;
  const atr = config.useRma ? rma : sma;
  let up = atr == null ? null : (bar.high + bar.low) / 2 - config.multiplier * atr;
  let down = atr == null ? null : (bar.high + bar.low) / 2 + config.multiplier * atr;
  const up1 = previous?.up ?? up;
  const down1 = previous?.down ?? down;
  if (previous && up1 != null && previous.close > up1 && up != null) up = Math.max(up, up1);
  if (previous && down1 != null && previous.close < down1 && down != null) down = Math.min(down, down1);
  const previousTrend = previous?.trend ?? 1;
  const trend = previousTrend === -1 && down1 != null && bar.close > down1 ? 1
    : previousTrend === 1 && up1 != null && bar.close < up1 ? -1 : previousTrend;
  return {
    close: bar.close, up, down, trend, rma, trWindow, count: (previous?.count || 0) + 1,
    atr, candidateSide: trend !== previousTrend ? trend : 0,
  };
}

export function advanceScanner(saved, quote, input = DEFAULT_SETTINGS) {
  const config = settingsFor(input);
  const settingsKey = JSON.stringify(config);
  if (!Number.isFinite(quote?.price) || quote.price <= 0 || !Number.isSafeInteger(quote?.at)) throw new Error('INVALID_QUOTE');
  let state = saved?.schema === 1 && saved.settingsKey === settingsKey ? structuredClone(saved) : {
    schema: 1, settingsKey, previous: null, bar: null, lastQuoteAt: null, lastSide: 0, lastSignal: null, trade: null,
  };
  if (state.lastQuoteAt != null && quote.at <= state.lastQuoteAt) return { state, signal: null, events: [], trades: [], changed: false, status: 'duplicate' };
  const interval = config.timeframeMinutes * 60_000;
  const bucket = Math.floor(quote.at / interval) * interval;
  let startingMidBar = state.lastQuoteAt == null;
  if (state.bar && bucket !== state.bar.at) {
    // Never fabricate missing candles or issue catch-up signals after an outage.
    if (bucket - state.bar.at > interval) { state.previous = null; startingMidBar = true; }
    else if (!state.bar.partial) state.previous = evaluateBar(state.bar, state.previous, config);
    state.bar = null;
  }
  if (!state.bar) {
    state.bar = { at: bucket, open: quote.price, high: quote.price, low: quote.price, close: quote.price,
      signalSide: 0, partial: startingMidBar && quote.at - bucket > 30_000 };
  } else {
    state.bar.high = Math.max(state.bar.high, quote.price);
    state.bar.low = Math.min(state.bar.low, quote.price);
    state.bar.close = quote.price;
  }
  state.lastQuoteAt = quote.at;
  const calculation = evaluateBar(state.bar, state.previous, config);
  const ready = calculation.atr != null;
  const events = []; const trades = [];
  const newDirection = ready && calculation.candidateSide !== 0 && state.bar.signalSide === 0 && calculation.candidateSide !== state.lastSide;
  if (state.trade?.status === 'OPEN') {
    const result = updateTrade(state.trade, quote.price, quote.at, newDirection && (calculation.candidateSide === 1 ? 'BUY' : 'SELL') !== state.trade.side);
    state.trade = result.trade;
    if (result.changed) trades.push(result.trade);
    events.push(...result.events);
  }
  let signal = null;
  if (newDirection) {
    const side = calculation.candidateSide;
    const entry = quote.price;
    const sl = side === 1 ? calculation.up : calculation.down;
    const step = config.tpStepPips * config.pipSize;
    const risk = (entry - sl) * side;
    signal = {
      key: `${config.symbol}:${config.timeframeMinutes}:${bucket}`, symbol: config.symbol,
      side: side === 1 ? 'BUY' : 'SELL', timeframeMinutes: config.timeframeMinutes,
      entry, sl, tp1: entry + side * step, tp2: entry + side * step * 2, tp3: entry + side * step * 3,
      rewardRatio: risk > 0 ? step * 3 / risk : null,
      detectedAt: new Date(quote.at).toISOString(), barAt: new Date(bucket).toISOString(), source: quote.source || 'gold-api',
    };
    state.bar.signalSide = side;
    state.lastSide = side;
    state.lastSignal = signal;
    state.trade = openTrade(signal, config);
    trades.push(state.trade);
    events.push({ type: 'SIGNAL', tradeKey: signal.key, occurredAt: signal.detectedAt, payload: signal });
  }
  return { state, signal, events, trades, changed: true, status: ready ? 'ready' : 'warming',
    completedBars: state.previous?.count || 0, requiredBars: config.atrPeriod };
}

// Historical candles prepare the ATR immediately. They never create alerts.
// Call again after a missing-candle gap instead of inventing prices.
export function seedScanner(candles, input = DEFAULT_SETTINGS, now = Date.now(), forming = null) {
  const config = settingsFor(input);
  const interval = config.timeframeMinutes * 60_000;
  if (!Array.isArray(candles) || candles.length < config.atrPeriod - (forming ? 1 : 0)) throw new Error('INSUFFICIENT_HISTORY');
  let previous = null; let lastAt = null;
  for (const bar of candles) {
    if (!Number.isSafeInteger(bar.at) || bar.at % interval !== 0 || bar.at + interval > now
      || (lastAt != null && bar.at <= lastAt)
      || ![bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)
      || bar.high < bar.low) throw new Error('INVALID_HISTORY');
    previous = evaluateBar(bar, previous, config);
    lastAt = bar.at;
  }
  if (forming && (!Number.isSafeInteger(forming.at) || forming.at % interval !== 0 || forming.at <= lastAt
    || forming.at > now || forming.at + interval <= now
    || ![forming.open, forming.high, forming.low, forming.close].every((value) => Number.isFinite(value) && value > 0)
    || forming.high < Math.max(forming.open, forming.close) || forming.low > Math.min(forming.open, forming.close))) throw new Error('INVALID_HISTORY');
  return { schema: 1, settingsKey: JSON.stringify(config), previous,
    bar: forming ? { ...forming, signalSide: 0, partial: false } : null,
    lastQuoteAt: forming ? now - 1 : lastAt + interval - 1, lastSide: previous.trend, lastSignal: null, trade: null };
}
