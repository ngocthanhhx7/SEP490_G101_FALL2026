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
  event.waitUntil(self.registration.showNotification('Paw World Care', {
    body: 'Bạn có thông báo mới. Mở ứng dụng để xem.',
    icon: '/pwa/icon-192.png',
    tag: 'pwc-notifications'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/account/notifications', self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = clients.find(client => client.url === target);
    if (open) await open.focus();
    else await self.clients.openWindow(target);
  })());
});
