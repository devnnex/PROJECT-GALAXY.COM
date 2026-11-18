// All amounts follow the scanner's recorded TP/SL rules, never a broker balance.
export const ANALYTICS_TIMEZONE = 'America/Bogota';
export const usd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);

export function summarizePeriods(days, from = '', to = '') {
  const selected = days.filter((day) => (!from || day.day >= from) && (!to || day.day <= to));
  const months = new Map();
  const totals = { signals: 0, wins: 0, losses: 0, ignored: 0, open: 0, gain: 0, peakGain: 0, loss: 0, hits: [0, 0, 0] };
  for (const day of selected) {
    for (const key of ['signals', 'wins', 'losses', 'ignored', 'open', 'gain', 'peakGain', 'loss']) totals[key] += Number(day[key] || 0);
    for (let i = 0; i < 3; i++) totals.hits[i] += Number(day.hits?.[i] || 0);
    const key = day.day.slice(0, 7);
    const month = months.get(key) || { day: key, wins: 0, losses: 0 };
    month.wins += Number(day.wins || 0); month.losses += Number(day.losses || 0); months.set(key, month);
  }
  const rank = (items) => items.filter((day) => day.wins + day.losses > 0)
    .map((day) => ({ ...day, count: day.wins + day.losses, rate: day.wins * 100 / (day.wins + day.losses) }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count || a.day.localeCompare(b.day));
  const daily = rank(selected), monthly = rank([...months.values()]);
  // Ties prefer the larger sample, then the earliest period for both extremes.
  const worst = (items) => [...items].sort((a, b) => a.rate - b.rate || b.count - a.count || a.day.localeCompare(b.day))[0] || null;
  return { ...totals, days: selected, monthly: [...monthly].sort((a, b) => a.day.localeCompare(b.day)),
    rate: totals.wins + totals.losses ? totals.wins * 100 / (totals.wins + totals.losses) : null,
    bestDay: daily[0] || null, worstDay: worst(daily), bestMonth: monthly[0] || null, worstMonth: worst(monthly) };
}

export function simulateRecordedResults(summary, { lots, contractSize, allocation = 'single', costPerLot = 0 }) {
  const values = [lots, contractSize, costPerLot].map(Number);
  if (!values.every(Number.isFinite) || values[0] <= 0 || values[0] > 100 || values[1] <= 0 || values[1] > 10000 || values[2] < 0 || values[2] > 10000
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
