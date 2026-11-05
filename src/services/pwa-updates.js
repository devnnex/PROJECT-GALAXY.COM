let meetingActive = false;
export const setPwaMeetingActive = (active) => { meetingActive = Boolean(active); };
export const setPwaMeetingState = ({ busy = false, joined = false, waiting = false }) => setPwaMeetingActive(busy || joined || waiting);

function canReload() {
  if (meetingActive || navigator.onLine === false || document.visibilityState !== 'visible' || document.querySelector('[role="dialog"],form[aria-busy="true"]')) return false;
  return ![...document.querySelectorAll('form textarea,form input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])')]
    .some((input) => String(input.value || '').trim());
}

export function startPwaUpdates({ baseUrl, buildId }) {
  if (!navigator.serviceWorker) return () => {};
  const base = new URL(baseUrl, location.href);
  let active = true; let checking = false; let pendingVersion = false; let reloading = false; let lastCheck = 0;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const registration = navigator.serviceWorker.register(new URL('sw.js', base).href, { updateViaCache: 'none' }).catch(() => null);
  const reload = () => {
    if (!active || !pendingVersion || reloading || !canReload()) return;
    reloading = true; location.reload();
  };
  const check = async () => {
    if (!active || checking || navigator.onLine === false || Date.now() - lastCheck < 60_000) return;
    checking = true; lastCheck = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const [worker, response] = await Promise.all([registration, fetch(new URL('version.json', base).href, { cache: 'no-store', signal: controller.signal })]);
      if (response.ok) {
        const version = await response.json();
        if (typeof version.version === 'string' && version.version !== buildId) {
          pendingVersion = true;
          await worker?.update();
        }
      }
    } catch { /* Keep the current app usable when the network is unavailable. */ }
    finally { clearTimeout(timeout); checking = false; }
    if (active) setTimeout(reload, 0);
  };
  const interact = () => { setTimeout(reload, 0); check(); };
  const visible = () => { if (document.visibilityState === 'visible') interact(); };
  const changed = () => { if (hadController) pendingVersion = true; };
  window.addEventListener('click', interact);
  window.addEventListener('online', interact);
  document.addEventListener('visibilitychange', visible);
  navigator.serviceWorker.addEventListener('controllerchange', changed);
  return () => {
    active = false; window.removeEventListener('click', interact); window.removeEventListener('online', interact);
    document.removeEventListener('visibilitychange', visible); navigator.serviceWorker.removeEventListener('controllerchange', changed);
  };
}
