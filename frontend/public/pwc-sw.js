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
