import { describe, expect, it } from 'vitest';
import { evaluateMacroRelease } from '../worker/macro/engine.js';
import { DEFAULT_ENGINE_CONFIG } from '../worker/macro/registry.js';

const now = '2026-09-11T12:30:00.050Z';
const component = (indicator, actual, forecast, extra = {}) => ({ indicator, actual, forecast, previous: forecast, revised: null, unit: indicator.includes('PAYROLL') ? 'K' : '%', receivedAt: '2026-09-11T12:30:00.020Z', ...extra });
const evaluate = (engine, components, health = { connected: true, stale: false }) => evaluateMacroRelease({ engine, country: 'United States', components }, DEFAULT_ENGINE_CONFIG, { feedHealth: health, generatedAt: now });

describe('Galaxy Macro deterministic engines', () => {
  it('emits strong CPI directions only when core and headline monthly components confirm', () => {
    const below = evaluate('CPI', [component('CORE_CPI_MOM', .1, .3), component('CPI_MOM', .1, .3), component('CORE_CPI_YOY', 3, 3.4), component('CPI_YOY', 2.5, 2.9)]);
    const above = evaluate('CPI', [component('CORE_CPI_MOM', .5, .3), component('CPI_MOM', .5, .3), component('CORE_CPI_YOY', 3.8, 3.4), component('CPI_YOY', 3.3, 2.9)]);
    expect(below.signal).toBe('STRONG_BUY'); expect(above.signal).toBe('STRONG_SELL');
  });

  it('returns MIXED when required CPI components contradict', () => {
    expect(evaluate('CPI', [component('CORE_CPI_MOM', .1, .3), component('CPI_MOM', .5, .3)]).signal).toBe('MIXED');
  });

  it('keeps exactly-on-consensus releases neutral', () => {
    const result = evaluate('PPI', [component('CORE_PPI_MOM', .2, .2), component('PPI_MOM', .3, .3)]);
    expect(result.signal).toBe('NEUTRAL'); expect(result.galaxyScore).toBe(0);
  });

  it('blocks a signal when consensus is absent and never substitutes TEForecast', () => {
    const result = evaluate('PCE', [component('CORE_PCE_MOM', .1, null, { teForecast: .2 })]);
    expect(result).toMatchObject({ signal: 'NO_SIGNAL', reason: 'MISSING_FORECAST', confidence: 'LOW' });
  });

  it('uses inverse NFP/unemployment directions and marks contradictions mixed', () => {
    const mixed = evaluate('NFP', [component('NON_FARM_PAYROLLS', 250000, 180000), component('UNEMPLOYMENT_RATE', 4.3, 4.1), component('AVERAGE_HOURLY_EARNINGS_MOM', .3, .3)]);
    expect(mixed.signal).toBe('MIXED');
    const weak = evaluate('NFP', [component('NON_FARM_PAYROLLS', 100000, 180000), component('UNEMPLOYMENT_RATE', 4.3, 4.1), component('AVERAGE_HOURLY_EARNINGS_MOM', .1, .3)]);
    expect(weak.signal).toBe('STRONG_BUY');
  });

  it('keeps NFP revisions secondary', () => {
    const result = evaluate('NFP', [component('NON_FARM_PAYROLLS', 180000, 180000, { previous: 250000, revised: 100000 }), component('UNEMPLOYMENT_RATE', 4.1, 4.1), component('AVERAGE_HOURLY_EARNINGS_MOM', .3, .3)]);
    expect(Math.abs(result.galaxyScore)).toBeLessThanOrEqual(10);
  });

  it.each([
    ['PPI', [component('CORE_PPI_MOM', 0, .4), component('PPI_MOM', 0, .4)], 'STRONG_BUY'],
    ['PCE', [component('CORE_PCE_MOM', .0, .3), component('PCE_MOM', 0, .3)], 'STRONG_BUY'],
    ['RETAIL_SALES', [component('RETAIL_SALES_MOM', -.5, .3), component('RETAIL_SALES_EX_AUTOS', -.3, .2)], 'STRONG_BUY'],
  ])('evaluates the %s engine', (engine, components, expected) => expect(evaluate(engine, components).signal).toBe(expected));

  it('renormalizes available retail components but forbids strong signals with a required component missing', () => {
    const result = evaluate('RETAIL_SALES', [component('RETAIL_SALES_MOM', -.5, .3)]);
    expect(result.signal).toBe('BUY'); expect(result.status).toBe('PRELIMINARY');
  });

  it('waits for guidance when the FOMC rate is as expected', () => {
    expect(evaluate('FOMC', [component('FEDERAL_FUNDS_RATE', 4.5, 4.5)])).toMatchObject({ signal: 'WAIT', status: 'WAIT_FOR_STATEMENT', reason: 'RATE_AS_EXPECTED' });
  });

  it('produces a dovish/hawkish FOMC rate bias only on a numeric surprise', () => {
    expect(evaluate('FOMC', [component('FEDERAL_FUNDS_RATE', 4.25, 4.5)]).signal).toBe('BUY');
    expect(evaluate('FOMC', [component('FEDERAL_FUNDS_RATE', 4.75, 4.5)]).signal).toBe('SELL');
  });

  it.each([
    [{ connected: false, stale: false }, 'FEED_DISCONNECTED'], [{ connected: true, stale: true }, 'STALE_DATA'],
  ])('rejects unhealthy feeds', (health, reason) => expect(evaluate('FOMC', [component('FEDERAL_FUNDS_RATE', 4.25, 4.5)], health)).toMatchObject({ signal: 'NO_SIGNAL', reason }));
});
