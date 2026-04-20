const CACHE_VERSION = 'v11';
const CACHE_NAME = 'budget-categorizer-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/store.js',
  './manifest.json'
];

// Precache app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Clean old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-only for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls go straight to network
  if (url.hostname.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
