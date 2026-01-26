
const CACHE_NAME = 'order-tracker-v4';
const CORE_ASSETS = [
  'index.html',
  'manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use relative paths for local assets
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        // Cache external CDNs and local assets on the fly
        const isSafeToCache = 
          networkResponse.status === 200 && 
          (event.request.url.includes('cdn.tailwindcss.com') || 
           event.request.url.includes('cdnjs.cloudflare.com') ||
           event.request.url.startsWith(self.location.origin));

        if (isSafeToCache) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Return index.html for navigation requests (SPA support)
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return null;
      });
    })
  );
});
