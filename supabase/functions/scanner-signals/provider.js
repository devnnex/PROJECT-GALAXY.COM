export const GOLD_PRICE_URL = 'https://api.gold-api.com/price/XAU';

export function parseGoldQuote(value, now = Date.now()) {
  const at = Date.parse(value?.updatedAt);
  if (value?.symbol !== 'XAU' || (value.currency != null && value.currency !== 'USD')
    || typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price <= 0 || !Number.isFinite(at)) throw new Error('INVALID_PROVIDER_QUOTE');
  if (at > now + 15_000 || now - at > 120_000) throw new Error('STALE_PROVIDER_QUOTE');
  return { price: value.price, at, source: 'gold-api' };
}

export function parseGoldCandle(value, at) {
  const bar = { at, open: value?.open, high: value?.high, low: value?.low, close: value?.close };
  if (![bar.open, bar.high, bar.low, bar.close].every((item) => typeof item === 'number' && Number.isFinite(item) && item > 0)
    || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) throw new Error('INVALID_PROVIDER_HISTORY');
  return bar;
}

// The free quota is ten OHLC requests/hour. Nine completed 5m candles plus
// the current candle initialise ATR(10) without waiting fifty minutes.
// Checkpoint before every call: retries cannot silently exceed that quota.
export async function fetchGoldBootstrap({ key, quote, settings, cache = {}, onProgress = async () => {}, request = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now }) {
  if (!key) throw new Error('MISSING_GOLD_API_KEY');
  if (settings.atrPeriod > 10) throw new Error('FREE_HISTORY_PERIOD_LIMIT');
  const interval = settings.timeframeMinutes * 60_000;
  const bucket = Math.floor(quote.at / interval) * interval;
  const progress = { calls: (cache.calls || []).filter((at) => at > now() - 3600_000), bars: (cache.bars || []).slice(-20) };
  const completed = []; let forming;
  for (let offset = settings.atrPeriod - 1; offset >= 0; offset--) {
    const start = bucket - offset * interval;
    const end = offset === 0 ? quote.at : start + interval - 1;
    let item = progress.bars.find((bar) => bar.at === start && bar.end >= end);
    if (!item) {
      progress.calls = progress.calls.filter((at) => at > now() - 3600_000);
      if (progress.calls.length >= 10) throw new Error('FREE_HISTORY_QUOTA_REACHED');
      if (progress.calls.length) await wait(1300);
      progress.calls.push(now()); await onProgress(structuredClone(progress));
      const url = new URL('https://api.gold-api.com/ohlc/XAU');
      url.searchParams.set('startTimestamp', String(Math.floor(start / 1000)));
      url.searchParams.set('endTimestamp', String(Math.floor(end / 1000)));
      const response = await request(url.href, { headers: { Accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) throw new Error(`PROVIDER_HISTORY_HTTP_${response.status}`);
      item = { ...parseGoldCandle(await response.json(), start), end };
      progress.bars = [...progress.bars.filter((bar) => bar.at !== start), item].slice(-20);
      await onProgress(structuredClone(progress));
    }
    if (offset === 0) forming = item; else completed.push(item);
  }
  return { completed, forming, cache: progress };
}

export async function fetchGoldQuote({ request = fetch, now = Date.now } = {}) {
  const response = await request(GOLD_PRICE_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  return parseGoldQuote(await response.json(), now());
}
