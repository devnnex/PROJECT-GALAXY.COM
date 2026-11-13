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
