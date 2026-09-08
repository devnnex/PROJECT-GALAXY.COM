import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseAggregator } from '../worker/macro/aggregator.js';
import { matchMacroComponent } from '../worker/macro/matcher.js';
import { DEFAULT_ENGINE_CONFIG } from '../worker/macro/registry.js';
import { RECONNECT_BACKOFF_MS } from '../worker/trading-economics.js';
import { countdown } from '../src/macro-ui-utils.js';

describe('Macro pipeline reliability', () => {
  it('matches by symbol before aliases and never fuses unrelated events', () => {
    expect(matchMacroComponent({ country: 'United States', symbol: 'NFP TCH', event: 'Other' }, DEFAULT_ENGINE_CONFIG).match.indicator).toBe('NON_FARM_PAYROLLS');
    expect(matchMacroComponent({ country: 'Canada', symbol: 'NFP TCH' }, DEFAULT_ENGINE_CONFIG).reason).toBe('UNEXPECTED_EVENT');
  });

  it('uses the required reconnect backoff capped at 30 seconds', () => expect(RECONNECT_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 15000, 30000]));

  it('aggregates out-of-order simultaneous and late components with version-ready reevaluation', async () => {
    vi.useFakeTimers(); const evaluations = [];
    const aggregator = new ReleaseAggregator({ aggregationWindowMs: 350, lateUpdateWindowMs: 3000, onEvaluate: async (_key, components, meta) => evaluations.push({ components, meta }) });
    aggregator.ingest('CPI:release', { indicator: 'CPI_MOM' });
    aggregator.ingest('CPI:release', { indicator: 'CORE_CPI_MOM' });
    await vi.advanceTimersByTimeAsync(350);
    expect(evaluations[0].components.map((item) => item.indicator).sort()).toEqual(['CORE_CPI_MOM', 'CPI_MOM']);
    aggregator.ingest('CPI:release', { indicator: 'CPI_YOY' });
    await vi.advanceTimersByTimeAsync(1);
    expect(evaluations[1].components).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(evaluations.at(-1).meta.final).toBe(true);
    aggregator.close(); vi.useRealTimers();
  });

  it('calculates a stable countdown across timezones', () => expect(countdown('2026-03-08T12:30:03Z', new Date('2026-03-08T12:30:00Z').getTime())).toBe('00:00:03'));

  it('wires Supabase Realtime updates without aggressive polling', () => {
    const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
    expect(api).toContain("table: 'macro_signals'"); expect(api).toContain("table: 'macro_feed_health'");
    expect(api).not.toMatch(/setInterval\([^)]*getMacroDashboard/);
  });

  it('keeps secrets backend-only and provides REST reconciliation', () => {
    const worker = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
    const ui = readFileSync(new URL('../src/components/GalaxyMacroLive.jsx', import.meta.url), 'utf8');
    expect(worker).toContain("syncCalendar('reconnect')"); expect(worker).toContain("syncCalendar('scheduled')");
    expect(ui).not.toMatch(/TRADING_ECONOMICS_CLIENT|SERVICE_ROLE/);
  });
});
