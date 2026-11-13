import { advanceScanner, seedScanner, settingsFor } from './engine.js';
import { fetchGoldBootstrap, fetchGoldQuote } from './provider.js';

export async function runScannerTick({ client, goldKey, getQuote = fetchGoldQuote, bootstrap = fetchGoldBootstrap }) {
  const rpc = async (name, params) => {
    const { data, error } = await client.rpc(name, params);
    if (error) throw new Error('SCANNER_DATABASE_UNAVAILABLE');
    return data;
  };
  const claimed = await rpc('claim_scanner_tick');
  if (!claimed) return { status: 'idle', events: 0 };
  try {
    if (claimed.provider !== 'gold-api') throw new Error('UNSUPPORTED_SCANNER_PROVIDER');
    const settings = settingsFor(claimed.settings);
    const quote = await getQuote();
    let saved = claimed.runtime || {};
    let cache = saved.bootstrap;
    const interval = settings.timeframeMinutes * 60_000;
    const configMatches = saved.schema === 1 && saved.settingsKey === JSON.stringify(settings);
    const gap = saved.bar && Math.floor(quote.at / interval) * interval - saved.bar.at > interval;
    if (!configMatches || !saved.previous || gap) {
      const history = await bootstrap({ key: goldKey, quote, settings, cache,
        onProgress: async (value) => {
          const retained = await rpc('checkpoint_scanner_history', { p_lease: claimed.lease, p_cache: value });
          if (!retained) throw new Error('SCANNER_LEASE_LOST');
        },
      });
      const prepared = seedScanner(history.completed, settings, quote.at, history.forming);
      if (configMatches) {
        prepared.lastSide = saved.lastSide;
        prepared.lastSignal = saved.lastSignal;
        prepared.trade = saved.trade;
      }
      saved = prepared;
      cache = history.cache;
    }
    const result = advanceScanner(saved, quote, settings);
    if (cache) result.state.bootstrap = cache;
    const stored = await rpc('complete_scanner_tick', { p_lease: claimed.lease, p_provider: claimed.provider,
      p_settings: claimed.settings, p_runtime: result.state, p_trades: result.trades, p_events: result.events });
    return { status: stored ? result.status : 'conflict', events: stored ? result.events.length : 0 };
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'SCANNER_UNAVAILABLE';
    await client.rpc('fail_scanner_tick', { p_lease: claimed.lease, p_code: code });
    throw new Error(code);
  }
}
