const CACHE_NAME = 'eros-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through fetch listener for PWA criteria
  event.respondWith(fetch(event.request));
});
