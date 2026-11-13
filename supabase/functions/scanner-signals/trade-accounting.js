// Mirrors the current Pine rules: initial fixed SL, TP before SL protects
// the result, and replacement without TP/SL is excluded from effectiveness.
export function openTrade(signal, settings) {
  return { ...signal, status: 'OPEN', outcome: null, hit1: false, hit2: false, hit3: false,
    grossPips: 0, grossPercent: 0, lostPips: 0, lostPercent: 0,
    pipSize: settings.pipSize, stepPips: settings.tpStepPips, closedAt: null };
}

export function updateTrade(saved, price, at, opposite = false) {
  const trade = structuredClone(saved);
  const events = [];
  if (trade.status !== 'OPEN') return { trade, events, changed: false };
  const side = trade.side === 'BUY' ? 1 : -1;
  const previousTP = trade.hit1 || trade.hit2 || trade.hit3;
  const stopTouched = (trade.entry - trade.sl) * side > 0 && (price - trade.sl) * side <= 0;
  if (stopTouched || opposite) {
    trade.status = 'CLOSED'; trade.closedAt = new Date(at).toISOString();
    trade.outcome = previousTP ? 'WIN' : stopTouched ? 'SL' : 'IGNORED';
    if (trade.outcome === 'SL') {
      const distance = Math.abs(trade.entry - trade.sl);
      trade.lostPips = distance / trade.pipSize;
      trade.lostPercent = distance / Math.abs(trade.entry) * 100;
    }
    if (stopTouched) events.push({ type: 'SL', tradeKey: trade.key, occurredAt: trade.closedAt, payload: { ...trade, eventPrice: trade.sl, countsAsLoss: !previousTP } });
  } else {
    for (const level of [1, 2, 3]) {
      if (!trade[`hit${level}`] && (price - trade[`tp${level}`]) * side >= 0) {
        trade[`hit${level}`] = true;
        trade.grossPips += trade.stepPips * level;
        trade.grossPercent += Math.abs(trade[`tp${level}`] - trade.entry) / Math.abs(trade.entry) * 100;
        events.push({ type: `TP${level}`, tradeKey: trade.key, occurredAt: new Date(at).toISOString(), payload: { ...trade, eventPrice: trade[`tp${level}`] } });
      }
    }
    if (trade.hit3) { trade.status = 'CLOSED'; trade.outcome = 'WIN'; trade.closedAt = new Date(at).toISOString(); }
  }
  return { trade, events, changed: trade.status !== saved.status || events.length > 0 };
}
