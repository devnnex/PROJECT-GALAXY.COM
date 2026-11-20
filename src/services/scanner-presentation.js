export function levelSymbol(level, reached = false) {
  return level === 'entry' ? '🔵' : level === 'sl' ? '🔴' : reached ? '✅' : '🎯';
}

export function scannerStrategyForNotice(notice) { return /Ruptura\s*777|Galaxy\s+Aurum\s+Bot/i.test(String(notice?.title||'')) ? 'RANGE777' : 'OPUS'; }
export function scannerNoticeTitle(notice) { return String(notice?.title||'').replace(/\bRuptura\s*777\b/gi,'Galaxy Aurum Bot'); }
export function selectScannerNoticeStrategy(notice) {
  if(!notice?.title)return; // A cold Push return already carries its URL intent.
  const strategy=scannerStrategyForNotice(notice),url=new URL(window.location.href);
  if(strategy==='RANGE777')url.searchParams.set('strategy','aurum');else url.searchParams.delete('strategy');
  window.history.replaceState(null,'',url);
  window.dispatchEvent(new CustomEvent('galaxy:scanner-strategy',{detail:strategy}));
}

export function parseScannerNotice(notice) {
  const trade = {};
  for (const part of String(notice.body || '').split('|')) {
    // Supports previously delivered notices and the new per-level symbols.
    const match = part.trim().match(/^(?:🔵|🔴|🎯|✅)?\s*(Entrada|SL|TP1|TP2|TP3)\s+([\d.,]+)$/u);
    if (!match) continue;
    const [, label, raw] = match;
    const key = label === 'Entrada' ? 'entry' : label.toLowerCase();
    const value = Number(raw.replaceAll(',', ''));
    if (!Number.isFinite(value)) continue;
    trade[key] = value;
    if (label.startsWith('TP') && part.trim().startsWith('✅')) trade[`hit${label.slice(2)}`] = true;
  }
  const event = String(notice.title || '').match(/^(?:🔵|🔴|✅)?\s*(TP[123]|SL|BUY|SELL)\b/u)?.[1];
  if (event?.startsWith('TP')) {
    // TP2/TP3 include all preceding targets by definition.
    for (let level = 1; level <= Number(event.slice(2)); level++) trade[`hit${level}`] = true;
  }
  if(scannerStrategyForNotice(notice)==='RANGE777')trade.strategy='RANGE777';
  return { trade, event };
}

export function quotePresentation(data, now = Date.now()) {
  const at = Number(data?.lastQuoteAt);
  const valid = data?.lastQuoteAt != null && Number.isFinite(at) && at > 0 && at <= now + 15_000;
  const ageSeconds = valid ? Math.max(0, Math.floor((now - at) / 1000)) : null;
  const recent = Boolean(data?.enabled && valid && ageSeconds <= 60);
  return { ageSeconds, recent, source: 'Gold API · muestra cada 30 s',
    status: !data?.enabled ? 'Pendiente de activación' : !valid ? 'Sin cotización' : ageSeconds > 60 ? 'Cotización retrasada' : !data?.ready ? 'Preparando histórico' : 'Muestreo · 30 s' };
}
