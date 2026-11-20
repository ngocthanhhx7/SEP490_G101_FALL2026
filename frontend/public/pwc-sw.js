const cacheName = 'pwc-offline-v1';
const offlinePath = '/pwa/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(offlinePath, { cache: 'reload', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Offline page unavailable');
    const cache = await caches.open(cacheName);
    await cache.put(offlinePath, response);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('pwc-offline-') && key !== cacheName)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'PWC_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data === 'PWC_PUSH_READY') event.ports[0]?.postMessage('PWC_PUSH_READY');
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin
    || /^\/(api|assets|pwa|health|ready)(\/|$)/.test(url.pathname) || /\.[^/]+$/.test(url.pathname)) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(offlinePath)) ?? Response.error();
  }));
});


self.addEventListener('push', (event) => {
  let notificationId;
  try {
    const id = event.data?.json()?.notificationId;
    if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) notificationId = id;
  } catch { /* Invalid data still permits a generic reminder. */ }
  event.waitUntil(self.registration.showNotification('Paw World Care', {
    data: notificationId ? { notificationId } : undefined,
    body: 'Bạn có thông báo mới. Mở ứng dụng để xem.',
    icon: '/pwa/icon-192.png',
    tag: 'pwc-notifications'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const id = event.notification.data?.notificationId;
    const notificationId = typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? id : undefined;
    const target = new URL('/account/notifications', self.location.origin);
    if (notificationId) target.searchParams.set('open', notificationId);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
    const existing = clients.find(client => client.url === target.href) ?? clients[0];
    if (existing) {
      await existing.focus();
      if (existing.url !== target.href) existing.postMessage({ type: 'PWC_NOTIFICATION_CLICK', notificationId });
    } else await self.clients.openWindow(target.href);
  })());
});
