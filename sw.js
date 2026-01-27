const CACHE_NAME = 'order-tracker-v8';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Navigation Preload / Fallback for SPA routing and 404 prevention
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If we hit a 404 on a sub-route, serve index.html (the PWA shell)
          if (response.status === 404) {
            return caches.match('index.html');
          }
          return response;
        })
        .catch(() => {
          // If offline, serve cached index.html
          return caches.match('index.html') || caches.match('./');
        })
    );
    return;
  }

  // Cache-First strategy for static assets and CDNs
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        const isSafeToCache = 
          networkResponse.status === 200 && 
          (url.origin === self.location.origin || 
           url.hostname.includes('tailwindcss.com') || 
           url.hostname.includes('cloudflare.com'));

        if (isSafeToCache) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => null);
    })
  );
});