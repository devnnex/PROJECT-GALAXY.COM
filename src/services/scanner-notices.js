export function scannerNoticeBatch(previous, items, userId, now = Date.now()) {
  const ids = new Set(previous?.userId === userId ? previous.ids : []);
  const first = previous?.userId !== userId;
  const fresh = [];
  for (const item of [...items].reverse()) {
    if (item.type === 'SCANNER_SIGNAL' && !ids.has(item.id) && !first && !item.readAt
      && Number.isFinite(Date.parse(item.createdAt)) && now - Date.parse(item.createdAt) <= 120_000
      && Date.parse(item.createdAt) <= now + 15_000) fresh.push(item);
    ids.add(item.id);
  }
  return { cursor: { userId, ids: [...ids].slice(-200) }, fresh };
}

// A new price sample can cross several targets. Show its latest notice now,
// rather than making TP2/TP3 wait behind older nine-second banners.
export function latestScannerBanner(items, current = []) {
  let latest = current[0];
  const target = (item) => String(item?.title || '').match(/\bTP([123])\b/)?.[1];
  const levels = (item) => String(item?.body || '').match(/Entrada\s+([\d.,]+)/)?.[1];
  for (const item of items) {
    if (latest) {
      const at = Date.parse(item.createdAt) || 0, previousAt = Date.parse(latest.createdAt) || 0;
      if (at < previousAt) continue;
      // Push can arrive after Realtime. A delayed TP1 must not replace TP3
      // from the same sample and entry just because its transport was slower.
      if (at === previousAt && target(item) && target(latest) && levels(item) && levels(item) === levels(latest)
        && Number(target(item)) < Number(target(latest))) continue;
    }
    latest = item;
  }
  return latest ? [latest] : [];
}
