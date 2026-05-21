const CACHE_NAME = 'aidash-v2.4.0';
const ASSETS = [
  '/',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  // Network first, fallback to cache for static assets
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
