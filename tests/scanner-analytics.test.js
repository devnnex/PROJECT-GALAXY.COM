import { expect, it } from 'vitest';
import { simulateRecordedResults, summarizePeriods } from '../src/services/scanner-analytics';

const day = (date, wins, losses, extra = {}) => ({ day: date, signals: wins + losses, wins, losses, gain: 0, peakGain: 0, loss: 0, ...extra });

it('credits $150 for one 0.10 position through TP3, without counting earlier targets twice', () => {
  const summary = summarizePeriods([day('2026-11-17', 1, 0, { gain: 30, peakGain: 15, hits: [1, 1, 1] })]);
  expect(simulateRecordedResults(summary, { lots: '0.10', contractSize: '100' })).toMatchObject({ gross: 150, losses: 0, net: 150, exposure: 0.1 });
  expect(simulateRecordedResults(summary, { lots: '0.10', contractSize: '100', allocation: 'per-target' }).gross).toBe(300);
  expect(simulateRecordedResults(summary, { lots: '0.10', contractSize: '100', allocation: 'split' }).gross).toBe(100);
});
it('uses actual recorded distances, subtracts initial stops, scales lot/contract size and explicit costs', () => {
  const summary = summarizePeriods([day('2026-11-17', 2, 1, { peakGain: 15, gain: 20, loss: 7.5 })]);
  const result = simulateRecordedResults(summary, { lots: 0.1, contractSize: 100, costPerLot: 7 });
  expect(result).toMatchObject({ gross: 150, losses: 75 });
  expect(result.costs).toBeCloseTo(2.1); expect(result.net).toBeCloseTo(72.9);
  expect(simulateRecordedResults(summary, { lots: 0.2, contractSize: 100 }).net).toBe(150);
  expect(simulateRecordedResults(summary, { lots: 0.1, contractSize: 10 }).net).toBe(7.5);
});
it('includes observed TP on open signals without turning them into closed wins', () => {
  const summary = summarizePeriods([day('2026-11-17', 0, 0, { signals: 1, open: 1, gain: 5, peakGain: 5, hits: [1, 0, 0] })]);
  expect(summary.rate).toBeNull(); expect(summary.bestDay).toBeNull();
  expect(simulateRecordedResults(summary, { lots: 0.1, contractSize: 100 }).net).toBe(50);
});
it('ranks days and months by weighted effectiveness, excluding open/ignored and breaking ties by sample size', () => {
  const summary = summarizePeriods([
    day('2026-09-01', 1, 0), day('2026-10-01', 6, 2), day('2026-10-02', 0, 2),
    day('2026-11-01', 5, 0), day('2026-11-02', 1, 4), day('2026-11-03', 0, 0, { ignored: 5, signals: 5 }),
  ]);
  expect(summary.bestDay.day).toBe('2026-11-01'); expect(summary.worstDay.day).toBe('2026-10-02');
  expect(summary.bestMonth.day).toBe('2026-09'); expect(summary.worstMonth.day).toBe('2026-10');
  expect(summary.monthly.find((period) => period.day === '2026-10').rate).toBe(60);
  expect(summarizePeriods(summary.days, '2026-11-01', '2026-11-01')).toMatchObject({ wins: 5, losses: 0, rate: 100 });
  expect(summarizePeriods([], '', '')).toMatchObject({ rate: null, bestDay: null, worstMonth: null });
});
it('rejects invalid numeric inputs instead of displaying misleading gains', () => {
  const summary = summarizePeriods([]);
  for (const lots of ['', 'abc', 'Infinity', '-0.1', '0', 101]) expect(simulateRecordedResults(summary, { lots, contractSize: 100 })).toBeNull();
  expect(simulateRecordedResults(summary, { lots: 0.1, contractSize: 0 })).toBeNull();
  expect(simulateRecordedResults(summary, { lots: 0.1, contractSize: 100, costPerLot: -1 })).toBeNull();
});

it('compares one full position exiting at TP1/TP2/TP3 and keeps SL after a previous TP without discount', () => {
  const days = [day('2026-11-18', 2, 1, { signals: 5, targets: [
    { wins: 3, gain: 15, losses: 1, loss: 10, pending: 0, excluded: 1 },
    { wins: 1, gain: 10, losses: 2, loss: 20, protectedStops: 1, protectedLoss: 10, pending: 1, excluded: 1 },
    { wins: 1, gain: 15, losses: 2, loss: 20, protectedStops: 1, protectedLoss: 10, pending: 1, excluded: 1 },
  ] })];
  const tp1 = summarizePeriods(days, '', '', 'tp1'), tp2 = summarizePeriods(days, '', '', 'tp2'), tp3 = summarizePeriods(days, '', '', 'tp3');
  expect(tp1).toMatchObject({ wins: 3, losses: 1, rate: 75, gain: 15, peakGain: 15 });
  expect(tp2).toMatchObject({ wins: 1, losses: 1, loss: 10, open: 1, ignored: 2 });
  expect(simulateRecordedResults(tp1, { lots: 0.1, contractSize: 100 }).net).toBe(50);
  expect(simulateRecordedResults(tp2, { lots: 0.1, contractSize: 100 }).net).toBe(0);
  expect(simulateRecordedResults(tp3, { lots: 0.1, contractSize: 100 }).net).toBe(50);
});

it('never invents target profits when the server does not yet provide target scenarios', () => {
  const summary = summarizePeriods([day('2026-11-18', 1, 0, { peakGain: 15 })], '', '', 'tp2');
  expect(summary.available).toBe(false);
  expect(simulateRecordedResults(summary, { lots: 0.1, contractSize: 100 })).toBeNull();
});

it('weights yearly results over the selected dates and does not average daily percentages', () => {
  const summary = summarizePeriods([day('2025-01-01', 1, 0), day('2025-12-31', 1, 8), day('2026-01-01', 4, 1)]);
  expect(summary.bestYear).toMatchObject({ day: '2026', rate: 80, count: 5 });
  expect(summary.worstYear).toMatchObject({ day: '2025', rate: 20, count: 10 });
  expect(summarizePeriods(summary.days, '2026-01-01', '2026-12-31').yearly).toHaveLength(1);
});

it('counts actual dates with signals rather than elapsed calendar days or the number of trades', () => {
  const days = [day('2026-11-18', 1, 0), day('2026-11-13', 2, 1), day('2026-11-17', 0, 0), day('2026-11-16', 0, 0, { signals: 2, open: 2 })];
  expect(summarizePeriods(days)).toMatchObject({ signalDays: 3, firstSignalDay: '2026-11-13', lastSignalDay: '2026-11-18', signals: 6 });
  expect(summarizePeriods(days, '2026-11-16', '2026-11-18')).toMatchObject({ signalDays: 2, firstSignalDay: '2026-11-16', lastSignalDay: '2026-11-18' });
  expect(summarizePeriods(days, '2026-11-18', '2026-11-18')).toMatchObject({ signalDays: 1, firstSignalDay: '2026-11-18', lastSignalDay: '2026-11-18' });
});

it('uses the same signal-day context for fixed exits, including days whose target was not reached', () => {
  const days = [day('2026-11-18', 0, 0, { signals: 1, open: 1, targets: [0, 1, 2].map(() => ({ wins: 0, pending: 1 })) })];
  expect(summarizePeriods(days, '', '', 'tp3')).toMatchObject({ signalDays: 1, wins: 0, open: 1, firstSignalDay: '2026-11-18' });
  expect(summarizePeriods(days, '2027-01-01')).toMatchObject({ signalDays: 0, firstSignalDay: null, lastSignalDay: null });
  expect(summarizePeriods([])).toMatchObject({ signalDays: 0, firstSignalDay: null, lastSignalDay: null });
});
