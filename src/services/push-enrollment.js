const enrollments = new Set();
const pending = new Set();

function applicationKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function createPushEnrollment({ userId, adapter, target = window }) {
  if (!userId || !globalThis.isSecureContext || !('Notification' in globalThis) || !('PushManager' in globalThis) || !navigator.serviceWorker) return () => {};
  let active = true; let config = null; let inFlight = false; let lastSaved = 0; let prompted = false;
  let cancelReady;
  const cancelled = new Promise((resolve) => { cancelReady = resolve; });
  const promptKey = `galaxy_push_prompt_${userId}`;
  try { prompted = sessionStorage.getItem(promptKey) === '1'; } catch { /* Storage may be unavailable. */ }
  const stop = () => { active = false; cancelReady(null); target.removeEventListener('click', interact); target.removeEventListener('keydown', interact); target.removeEventListener('online', online); enrollments.delete(stop); };
  const save = async () => {
    const registration = await Promise.race([navigator.serviceWorker.ready, cancelled]);
    if (!active || !registration || Notification.permission === 'denied') return;
    let subscription = await registration.pushManager.getSubscription();
    if (!active) return;
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) });
    if (!active) return;
    await adapter.savePushSubscription(subscription.toJSON());
    lastSaved = Date.now();
  };
  const enroll = (permissionPromise = Promise.resolve(Notification.permission)) => {
    if (!active || inFlight || !config?.publicKey || Date.now() - lastSaved < 300_000) return;
    inFlight = true;
    const operation = Promise.resolve(permissionPromise).then((permission) => permission === 'granted' && active ? save() : undefined)
      .catch(() => { /* Retry on the next interaction or connection, without blocking the app. */ })
      .finally(() => { inFlight = false; pending.delete(operation); });
    pending.add(operation);
  };
  const load = () => adapter.getPushConfig().then((value) => { if (!active) return; config = value; if (Notification.permission === 'granted') enroll(); }).catch(() => {});
  function interact(event) {
    if (!active || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
    if (!config?.publicKey) { load(); return; }
    if (Notification.permission === 'granted') { enroll(); return; }
    if (Notification.permission !== 'default' || prompted || inFlight) return;
    prompted = true;
    try { sessionStorage.setItem(promptKey, '1'); } catch { /* Storage is optional. */ }
    // Keep this call synchronous inside the browser's trusted user gesture.
    enroll(Notification.requestPermission());
  }
  function online() { if (config?.publicKey && Notification.permission === 'granted') enroll(); else load(); }
  target.addEventListener('click', interact); target.addEventListener('keydown', interact); target.addEventListener('online', online);
  enrollments.add(stop); load();
  return stop;
}

export async function detachDevicePush(adapter) {
  for (const stop of [...enrollments]) stop();
  await Promise.allSettled([...pending]);
  if (!navigator.serviceWorker) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  // Unsubscribe locally even if the database is temporarily unreachable.
  await Promise.allSettled([adapter.removePushSubscription(subscription.endpoint), subscription.unsubscribe()]);
}
