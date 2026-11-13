import { describe, expect, it, vi } from 'vitest';
import { advanceScanner, DEFAULT_SETTINGS, evaluateBar, seedScanner, settingsFor } from '../supabase/functions/scanner-signals/engine.js';
import { openTrade, updateTrade } from '../supabase/functions/scanner-signals/trade-accounting.js';
import { fetchGoldBootstrap, parseGoldQuote } from '../supabase/functions/scanner-signals/provider.js';
import { runScannerTick } from '../supabase/functions/scanner-signals/worker.js';

const interval = 300_000;
const at = Date.UTC(2026, 10, 13, 12);
const settings = settingsFor({ atrPeriod: 3, multiplier: 1 });
const candle = (time, price = 100) => ({ at: time, open: price, high: price + 1, low: price - 1, close: price });
const signal = { key: 'XAUUSD:5:1', symbol: 'XAUUSD', side: 'BUY', entry: 100, sl: 90, tp1: 105, tp2: 110, tp3: 115,
  detectedAt: new Date(at).toISOString(), barAt: new Date(at).toISOString(), source: 'gold-api', timeframeMinutes: 5 };

describe('Pine SuperTrend port', () => {
  it('uses Wilder RMA, hl2 and the previous completed bands, with the original direction conditions', () => {
    let previous = null;
    for (let i = 0; i < 3; i++) previous = evaluateBar(candle(at + i * interval), previous, settings);
    expect(previous.atr).toBe(2); expect(previous.up).toBe(98); expect(previous.down).toBe(102); expect(previous.trend).toBe(1);
    const next = evaluateBar({ open: 100, high: 101, low: 95, close: 96 }, previous, settings);
    expect(next.atr).toBeCloseTo(10 / 3, 12); expect(next.up).toBe(98);
    expect(next.down).toBeCloseTo(101 + 1 / 3, 12); expect(next.trend).toBe(-1); expect(next.candidateSide).toBe(-1);
    expect(evaluateBar({ open: 100, high: 101, low: 95, close: 96 }, previous, { ...settings, useRma: false }).atr).toBeCloseTo(10 / 3, 12);
    const small = { open: 96, high: 96.5, low: 95.5, close: 96 };
    expect(evaluateBar(small, next, settings).atr).toBeCloseTo(23 / 9, 12);
    expect(evaluateBar(small, next, { ...settings, useRma: false }).atr).toBe(3);
  });
  it('initialises from history immediately, without publishing any old signal', () => {
    const history = [candle(at - 3 * interval), candle(at - 2 * interval), candle(at - interval)];
    const prepared = seedScanner(history, settings, at);
    expect(prepared.lastSignal).toBeNull(); expect(prepared.trade).toBeNull();
    const result = advanceScanner(prepared, { price: 96, at: at + 1000 }, settings);
    expect(result.status).toBe('ready'); expect(result.signal.side).toBe('SELL'); expect(result.events).toHaveLength(1);
  });
  it('allows nine completed candles and the current full OHLC to initialise ATR(10) using ten free calls', () => {
    const history = Array.from({ length: 9 }, (_, i) => candle(at - (9 - i) * interval));
    const prepared = seedScanner(history, DEFAULT_SETTINGS, at + 60_000, candle(at));
    expect(advanceScanner(prepared, { price: 100, at: at + 60_000 }).status).toBe('ready');
  });
  it('does not close an immediate BUY when the raw intrabar trend reverts before the fixed SL', () => {
    const initial = { schema: 1, settingsKey: JSON.stringify(DEFAULT_SETTINGS), lastQuoteAt: at - 1, lastSide: -1, lastSignal: null, trade: null, bar: null,
      previous: { close: 95, up: 88, down: 96, trend: -1, rma: 2, trWindow: Array(10).fill(2), count: 10 } };
    const first = advanceScanner(initial, { price: 97, at: at + 1000 });
    expect(first.signal).toMatchObject({ side: 'BUY', entry: 97, sl: 91, tp1: 102, tp2: 107, tp3: 112 });
    const fixed = structuredClone(first.state.trade);
    const retreat = advanceScanner(first.state, { price: 95, at: at + 31_000 });
    expect(retreat.signal).toBeNull(); expect(retreat.events).toEqual([]); expect(retreat.state.trade).toEqual(fixed);
    const reached = advanceScanner(retreat.state, { price: 102, at: at + 61_000 });
    expect(reached.events.map((event) => event.type)).toEqual(['TP1']);
    expect(reached.state.trade.entry).toBe(97); expect(reached.state.trade.sl).toBe(91);
  });
  it('ignores duplicate and out-of-order samples and does not mutate its saved snapshot', () => {
    const prepared = seedScanner([candle(at - 3 * interval), candle(at - 2 * interval), candle(at - interval)], settings, at);
    const snapshot = structuredClone(prepared);
    const next = advanceScanner(prepared, { price: 96, at: at + 1000 }, settings);
    expect(prepared).toEqual(snapshot);
    expect(advanceScanner(next.state, { price: 110, at: at + 1000 }, settings)).toMatchObject({ changed: false, events: [] });
    expect(advanceScanner(next.state, { price: 110, at }, settings).changed).toBe(false);
  });
  it('rejects malformed, unsorted or unfinished historical candles', () => {
    expect(() => seedScanner([candle(at), candle(at - interval)], settings, at)).toThrow();
    expect(() => seedScanner([candle(at - 3 * interval), { ...candle(at - 2 * interval), low: 102 }, candle(at - interval)], settings, at)).toThrow('INVALID_HISTORY');
    expect(() => advanceScanner(null, { price: NaN, at })).toThrow('INVALID_QUOTE');
  });
});

describe('chronological trade outcomes', () => {
  it('SL without TP closes once and blocks all later objectives', () => {
    const first = updateTrade(openTrade(signal, DEFAULT_SETTINGS), 90, at + 1);
    expect(first.trade).toMatchObject({ outcome: 'SL', status: 'CLOSED', lostPips: 1000, lostPercent: 10 });
    expect(first.events.map((event) => event.type)).toEqual(['SL']);
    expect(updateTrade(first.trade, 120, at + 2).events).toEqual([]);
  });
  it('TP1 then opposite signal remains a winner without an SL deduction', () => {
    const first = updateTrade(openTrade(signal, DEFAULT_SETTINGS), 105, at + 1);
    expect(first.events.map((event) => event.type)).toEqual(['TP1']);
    const next = updateTrade(first.trade, 99, at + 2, true);
    expect(next.trade).toMatchObject({ outcome: 'WIN', grossPips: 500, lostPips: 0, status: 'CLOSED' });
    expect(next.events).toEqual([]);
  });
  it('TP3 credits all three original objectives once, including for shorts', () => {
    for (const side of [1, -1]) {
      const opened = openTrade({ ...signal, side: side === 1 ? 'BUY' : 'SELL', sl: 100 - side * 10, tp1: 100 + side * 5, tp2: 100 + side * 10, tp3: 100 + side * 15 }, DEFAULT_SETTINGS);
      const result = updateTrade(opened, 100 + side * 15, at + 1);
      expect(result.events.map((event) => event.type)).toEqual(['TP1', 'TP2', 'TP3']);
      expect(result.trade).toMatchObject({ outcome: 'WIN', grossPips: 3000, lostPips: 0 });
      expect(updateTrade(result.trade, 100 - side * 20, at + 2).events).toEqual([]);
    }
  });
  it('replacement without TP or SL is ignored, never a fabricated loss', () => {
    const result = updateTrade(openTrade(signal, DEFAULT_SETTINGS), 98, at, true);
    expect(result.trade).toMatchObject({ outcome: 'IGNORED', grossPips: 0, lostPips: 0 }); expect(result.events).toEqual([]);
  });
  it('notifies an actual SL after TP while preserving the winner and deducting no loss', () => {
    const reached = updateTrade(openTrade(signal, DEFAULT_SETTINGS), 105, at + 1);
    const result = updateTrade(reached.trade, 90, at + 2);
    expect(result.trade).toMatchObject({ outcome: 'WIN', lostPips: 0, grossPips: 500 });
    expect(result.events[0]).toMatchObject({ type: 'SL', payload: { countsAsLoss: false, eventPrice: 90 } });
  });
  it('the screenshot retreat above the initial SL remains open', () => {
    const trade = openTrade({ ...signal, entry: 3881.625, sl: 3872.933, tp1: 3886.625, tp2: 3891.625, tp3: 3896.625 }, DEFAULT_SETTINGS);
    const result = updateTrade(trade, 3880.495, at + 1);
    expect(result.trade.status).toBe('OPEN'); expect(result.events).toEqual([]); expect(result.changed).toBe(false);
  });
});

describe('free provider and worker', () => {
  it('requires fresh actual XAU/USD prices and rejects stale/future/wrong-symbol data', () => {
    const quote = { symbol: 'XAU', price: 3880.495, updatedAt: new Date(at).toISOString() };
    expect(parseGoldQuote(quote, at)).toMatchObject({ price: 3880.495, at, source: 'gold-api' });
    expect(() => parseGoldQuote(quote, at + 121_000)).toThrow('STALE');
    expect(() => parseGoldQuote({ ...quote, symbol: 'BTC' }, at)).toThrow('INVALID');
    expect(() => parseGoldQuote({ ...quote, price: '3880' }, at)).toThrow('INVALID');
  });
  it('fetches at most ten OHLC segments and checkpoints the free quota; never places keys in URLs', async () => {
    const checkpoints = [];
    const request = vi.fn(async (url, options) => {
      expect(url).not.toContain('test-private-key'); expect(options.headers['x-api-key']).toBe('test-private-key');
      return { ok: true, json: async () => ({ open: 100, high: 101, low: 99, close: 100 }) };
    });
    const wait = vi.fn(async () => {});
    const result = await fetchGoldBootstrap({ key: 'test-private-key', settings: DEFAULT_SETTINGS, quote: { price: 100, at: at + 60_000 }, request, wait, now: () => at + 60_000, onProgress: async (value) => checkpoints.push(value) });
    expect(request).toHaveBeenCalledTimes(10); expect(wait).toHaveBeenCalledTimes(9);
    expect(result.completed).toHaveLength(9); expect(result.forming.at).toBe(at); expect(checkpoints.at(-1).calls).toHaveLength(10);
    expect(() => seedScanner(result.completed, DEFAULT_SETTINGS, at + 60_000, result.forming)).not.toThrow();
    await fetchGoldBootstrap({ key: 'test-private-key', settings: DEFAULT_SETTINGS, quote: { price: 100, at: at + 60_000 }, cache: result.cache, request, now: () => at + 60_000 });
    expect(request).toHaveBeenCalledTimes(10);
  });
  it('does not call the history endpoint after the free quota or without a key', async () => {
    const request = vi.fn();
    await expect(fetchGoldBootstrap({ key: '', settings: DEFAULT_SETTINGS, quote: { at }, request })).rejects.toThrow('MISSING');
    await expect(fetchGoldBootstrap({ key: 'key', settings: DEFAULT_SETTINGS, quote: { at }, cache: { calls: Array(10).fill(at), bars: [] }, now: () => at, request })).rejects.toThrow('QUOTA');
    expect(request).not.toHaveBeenCalled();
  });
  it('never fetches quotes if the stream is disabled or another worker holds its lease', async () => {
    const getQuote = vi.fn(); const client = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    expect(await runScannerTick({ client, getQuote })).toEqual({ status: 'idle', events: 0 }); expect(getQuote).not.toHaveBeenCalled();
  });
  it('commits state, history, events and changed trades as one leased batch', async () => {
    const saved = seedScanner([candle(at - 3 * interval), candle(at - 2 * interval), candle(at - interval)], settings, at);
    const client = { rpc: vi.fn(async (name) => ({ data: name === 'claim_scanner_tick' ? { lease: 'lease', provider: 'gold-api', settings, runtime: saved } : true, error: null })) };
    const result = await runScannerTick({ client, getQuote: async () => ({ price: 96, at: at + 1000, source: 'gold-api' }) });
    expect(result.events).toBe(1);
    const [, params] = client.rpc.mock.calls.find(([name]) => name === 'complete_scanner_tick');
    expect(params.p_events[0].type).toBe('SIGNAL'); expect(params.p_trades[0].side).toBe('SELL'); expect(params.p_lease).toBe('lease');
  });
});
