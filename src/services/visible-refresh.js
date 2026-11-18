// One request in flight, coalesced event bursts, no polling in hidden tabs.
// Realtime remains connected; visibility/online events recover missed changes.
export function watchVisibleResource({ load, onData, onError = () => {}, interval = 20_000, target = document, host = window }) {
  let stopped = false, busy = false, dirty = false, timer, debounce, failures = 0;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && !target.hidden) timer = setTimeout(refresh, Math.min(interval * 2 ** failures, 60_000));
  };
  const refresh = async () => {
    if (stopped) return;
    clearTimeout(timer);
    if (busy) { dirty = true; return; }
    busy = true;
    try { const value = await load(); failures = 0; if (!stopped) onData(value); }
    catch (error) { failures = Math.min(failures + 1, 3); if (!stopped) onError(error); }
    finally { busy = false; if (!stopped && dirty) { dirty = false; notify(); } else schedule(); }
  };
  const notify = () => { if (stopped) return; clearTimeout(debounce); debounce = setTimeout(refresh, 150); };
  const wake = () => { if (target.hidden) clearTimeout(timer); else refresh(); };
  target.addEventListener('visibilitychange', wake); host.addEventListener('online', wake);
  refresh();
  return { refresh: notify, stop() { stopped = true; clearTimeout(timer); clearTimeout(debounce); target.removeEventListener('visibilitychange', wake); host.removeEventListener('online', wake); } };
}
