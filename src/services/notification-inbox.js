export function mergeNotificationRows(...groups) {
  const rows = new Map();
  for (const group of groups) for (const row of group || []) if (row?.id) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 100);
}

// One batch acknowledgement per interaction. The server returns the cleared
// reading for temporary display; only genuinely new arrivals stay in the inbox.
export function createNotificationInbox({ acknowledge }) {
  let state = { items: [], reading: [], open: false, busy: false, error: '', cleared: 0 };
  let pending = null, view = 0, version = 0;
  const listeners = new Set(), acknowledged = new Set(), touched = new Map();
  const publish = (patch) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const remember = (ids) => {
    for (const id of ids) { acknowledged.delete(id); acknowledged.add(id); }
    while (acknowledged.size > 1000) acknowledged.delete(acknowledged.values().next().value);
  };
  const setItems = (update, startedAtVersion) => {
    const local = typeof update === 'function';
    let rows = local ? update(state.items) : update;
    if (!Array.isArray(rows)) return;
    if (local) {
      version++;
      const previous = new Map(state.items.map((row) => [row.id, row]));
      for (const row of rows) if (previous.get(row.id) !== row) touched.set(row.id, version);
    } else if (startedAtVersion != null) {
      rows = mergeNotificationRows(rows, state.items.filter((row) => (touched.get(row.id) || 0) > startedAtVersion));
    }
    rows = mergeNotificationRows(rows).filter((row) => !acknowledged.has(row.id));
    const retained = new Set(rows.map((row) => row.id));
    for (const id of touched.keys()) if (!retained.has(id)) touched.delete(id);
    publish({ items: rows });
  };
  const readAll = () => {
    if (pending) return pending;
    const originals = state.items, requestView = view;
    const optimistic = originals.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString() }));
    const added = originals.map((row) => row.id).filter((id) => !acknowledged.has(id));
    remember(added);
    publish({ items: [], reading: state.open ? mergeNotificationRows(state.reading, optimistic) : state.reading, busy: true, error: '' });
    pending = Promise.resolve().then(acknowledge).then((result) => {
      const reading = Array.isArray(result?.notifications) ? result.notifications : optimistic;
      remember([...reading.map((row) => row.id), ...(Array.isArray(result?.clearedScannerIds) ? result.clearedScannerIds : [])]);
      publish({ items: state.items.filter((row) => !acknowledged.has(row.id)), busy: false, error: '',
        cleared: Number(result?.cleared ?? result?.updated ?? originals.length),
        ...(state.open && view === requestView ? { reading: mergeNotificationRows(state.reading, reading) } : {}) });
      return true;
    }).catch(() => {
      for (const id of added) acknowledged.delete(id);
      const originalIds = new Set(originals.map((row) => row.id));
      publish({ items: mergeNotificationRows(originals, state.items), busy: false,
        error: 'No pudimos confirmar la lectura. Reintenta para sincronizar tus avisos.',
        ...(state.open && view === requestView ? { reading: state.reading.filter((row) => !originalIds.has(row.id)) } : {}) });
      return false;
    }).finally(() => { pending = null; });
    return pending;
  };
  const close = () => { view++; publish({ open: false, reading: [] }); };
  const open = () => { view++; publish({ open: true, reading: [], error: '' }); return readAll(); };
  return { getSnapshot: () => state, getVersion: () => version, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setItems, readAll, open, close, toggle: () => state.open ? close() : open() };
}
