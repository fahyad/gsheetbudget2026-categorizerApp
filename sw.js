const CACHE_VERSION = 'v28';
const CACHE_NAME = 'budget-categorizer-' + CACHE_VERSION;

// Precached on install. Views (js/views/*) and lib (js/lib/*) are NOT
// listed here — they're lazy-imported and handled by the SWR rule below.
//
// v0.18.0: pixel.css added — both themes ship in every bundle and the
// data-theme attribute on <html> selects which one applies. Loading both
// stylesheets unconditionally avoids a flash-of-mono on theme switch.
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './css/pixel.css',
  './js/app.js',
  './js/router.js',
  './js/ui.js',
  './js/api.js',
  './js/config.js',
  './js/store.js',
  './js/periods.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   - API calls (script.google.com): network-only, bypass SW entirely
//   - Lazy-loaded view / lib modules: stale-while-revalidate so dynamic
//     imports work offline after first successful fetch
//   - Everything else (app shell): cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.hostname.includes('script.google.com')) {
    return;
  }

  if (url.pathname.includes('/js/views/') || url.pathname.includes('/js/lib/')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(request);
}
