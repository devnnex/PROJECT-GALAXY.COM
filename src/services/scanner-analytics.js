// All amounts follow the scanner's recorded TP/SL rules, never a broker balance.
export const ANALYTICS_TIMEZONE = 'America/Bogota';
export const usd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);

export function summarizePeriods(days, from = '', to = '', target = 'all', lossPolicy = 'scanner') {
  const level = ['tp1', 'tp2', 'tp3'].indexOf(target);
  let available = true;
  const selected = days.filter((day) => (!from || day.day >= from) && (!to || day.day <= to)).map((day) => {
    if (level < 0) return day;
    const exit = day.targets?.[level];
    if (!exit) { available = false; return { ...day, wins: 0, losses: 0, gain: 0, peakGain: 0, loss: 0, hits: [0, 0, 0] }; }
    const protectedStops = lossPolicy === 'scanner' ? Number(exit.protectedStops || 0) : 0;
    const protectedLoss = lossPolicy === 'scanner' ? Number(exit.protectedLoss || 0) : 0;
    return { ...day, wins: Number(exit.wins || 0), losses: Number(exit.losses || 0) - protectedStops,
      gain: Number(exit.gain || 0), peakGain: Number(exit.gain || 0), loss: Number(exit.loss || 0) - protectedLoss,
      open: Number(exit.pending || 0), ignored: Number(exit.excluded || 0) + protectedStops,
      hits: [0, 1, 2].map((index) => index === level ? Number(exit.wins || 0) : 0) };
  });
  const months = new Map(), years = new Map();
  const totals = { signals: 0, wins: 0, losses: 0, ignored: 0, open: 0, gain: 0, peakGain: 0, loss: 0, hits: [0, 0, 0] };
  for (const day of selected) {
    for (const key of ['signals', 'wins', 'losses', 'ignored', 'open', 'gain', 'peakGain', 'loss']) totals[key] += Number(day[key] || 0);
    for (let i = 0; i < 3; i++) totals.hits[i] += Number(day.hits?.[i] || 0);
    for (const [periods, key] of [[months, day.day.slice(0, 7)], [years, day.day.slice(0, 4)]]) {
      const period = periods.get(key) || { day: key, wins: 0, losses: 0 };
      period.wins += Number(day.wins || 0); period.losses += Number(day.losses || 0); periods.set(key, period);
    }
  }
  const rank = (items) => items.filter((day) => day.wins + day.losses > 0)
    .map((day) => ({ ...day, count: day.wins + day.losses, rate: day.wins * 100 / (day.wins + day.losses) }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count || a.day.localeCompare(b.day));
  const daily = rank(selected), monthly = rank([...months.values()]), yearly = rank([...years.values()]);
  const signalDates = [...new Set(selected.filter((day) => Number(day.signals) > 0).map((day) => day.day))].sort();
  // Ties prefer the larger sample, then the earliest period for both extremes.
  const worst = (items) => [...items].sort((a, b) => a.rate - b.rate || b.count - a.count || a.day.localeCompare(b.day))[0] || null;
  return { ...totals, available, target, signalDays: signalDates.length, firstSignalDay: signalDates[0] || null, lastSignalDay: signalDates[signalDates.length - 1] || null,
    days: selected, monthly: [...monthly].sort((a, b) => a.day.localeCompare(b.day)), yearly: [...yearly].sort((a, b) => a.day.localeCompare(b.day)),
    rate: totals.wins + totals.losses ? totals.wins * 100 / (totals.wins + totals.losses) : null,
    bestDay: daily[0] || null, worstDay: worst(daily), bestMonth: monthly[0] || null, worstMonth: worst(monthly), bestYear: yearly[0] || null, worstYear: worst(yearly) };
}

export function simulateRecordedResults(summary, { lots, contractSize, allocation = 'single', costPerLot = 0 }) {
  const values = [lots, contractSize, costPerLot].map(Number);
  if (summary.available === false || !values.every(Number.isFinite) || values[0] <= 0 || values[0] > 100 || values[1] <= 0 || values[1] > 10000 || values[2] < 0 || values[2] > 10000
    || !['single', 'split', 'per-target'].includes(allocation)) return null;
  const [lot, contract, cost] = values;
  const exposure = lot * (allocation === 'per-target' ? 3 : 1);
  const targetLot = allocation === 'split' ? lot / 3 : lot;
  const gross = (allocation === 'single' ? summary.peakGain : summary.gain) * targetLot * contract;
  const losses = summary.loss * exposure * contract;
  const costs = (summary.signals - summary.ignored) * exposure * cost;
  return { gross, losses, costs, net: gross - losses - costs, exposure, targetLot };
}

export function eventTone(type) {
  return type === 'SL' || type === 'SELL' ? 'loss' : type === 'BUY' || /^TP[123]$/.test(type) ? 'win' : 'neutral';
}
