const CACHE = 'galaxy-shell-mwejt9xg';
const SHELL = ['index.html', 'manifest.webmanifest', 'galaxy-icon.svg', 'galaxy-notification.png'];
const scopedUrl = (path) => new URL(path, self.registration.scope).href;
self.addEventListener('install', (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((path) => new Request(scopedUrl(path), { cache: 'reload' })))).then(() => self.skipWaiting()),
));
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('galaxy-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (['version.json', 'sw.js'].includes(url.pathname.split('/').pop())) {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
        const cache = await caches.open(CACHE); await cache.put(scopedUrl('index.html'), response.clone());
      }
      return response;
    }).catch(() => caches.match(scopedUrl('index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
    if (response.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname) && /\.(js|css|woff2?|png|svg|webp)$/.test(url.pathname)) {
      const cache = await caches.open(CACHE); await cache.put(event.request, response.clone());
    }
    return response;
  })));
});

function notificationData(value = {}) {
  const fields = ['id', 'type', 'title', 'body', 'actorId', 'userId', 'meetingId', 'roomCode'];
  return Object.fromEntries(fields.map((key) => [key, typeof value?.[key] === 'string' ? value[key].slice(0, key === 'body' ? 240 : 140) : '']));
}
self.addEventListener('push', (event) => {
  let notice = {};
  try { notice = notificationData(event.data?.json()); } catch { /* An empty payload still produces a visible notice. */ }
  const message = notice.type === 'DIRECT_MESSAGE';
  const scanner = notice.type === 'SCANNER_SIGNAL';
  event.waitUntil(self.registration.showNotification(notice.title || 'PROJECT GALAXY', {
    body: notice.body || 'Tienes novedades en tu comunidad.',
    icon: scopedUrl('galaxy-notification.png'), badge: scopedUrl('galaxy-notification.png'),
    tag: `galaxy-${notice.id || 'update'}`, data: notice,
    vibrate: [180, 80, 180], renotify: true,
    ...(scanner ? { silent: false } : {}),
    actions: [{ action: 'open', title: message ? 'Ver mensaje' : scanner ? 'Ver señal' : 'Ver reunion' }, { action: 'dismiss', title: 'Cerrar' }],
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const notice = notificationData(event.notification.data);
  event.waitUntil((async () => {
    const scope = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((item) => { const url = new URL(item.url); return url.origin === scope.origin && url.pathname.startsWith(scope.pathname); });
    if (client) { await client.focus(); client.postMessage({ type: 'GALAXY_NOTIFICATION_OPEN', notice }); return; }
    const url = new URL('index.html', scope);
    url.searchParams.set('section', notice.type === 'DIRECT_MESSAGE' ? 'messages' : notice.type === 'SCANNER_SIGNAL' ? 'black-trade' : 'meetings');
    url.searchParams.set('recipient', notice.userId);
    if (notice.type === 'DIRECT_MESSAGE') url.searchParams.set('peer', notice.actorId);
    else if (notice.roomCode) url.searchParams.set('room', notice.roomCode);
    await self.clients.openWindow(url.href);
  })());
});
