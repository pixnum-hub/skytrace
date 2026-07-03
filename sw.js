// SkyTrace Service Worker — v2
const CACHE_NAME = 'skytrace-v2';

// Only cache files we know exist — a single 404 in addAll() aborts install
const PRECACHE = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Hostnames whose responses must NEVER be cached
const LIVE_API_HOSTS = [
  'airplanes.live',
  'api.airplanes.live',
  'bigdatacloud.net',
  'api.bigdatacloud.net',
  'adsbdb.com',
  'api.adsbdb.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll one-by-one so a single failure doesn't abort the whole install
        return Promise.allSettled(
          PRECACHE.map(url =>
            cache.add(url).catch(err => console.warn('[SW] precache miss:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for APIs, cache-first for shell ─────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Pass live API calls straight to network — never cache them
  if (LIVE_API_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(
          '{"error":"offline"}',
          {status: 503, headers: {'Content-Type': 'application/json'}}
        ))
    );
    return;
  }

  // App shell: cache-first, then network, then update cache
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      // Return cache immediately if available, but also refresh in background
      return cached || networkFetch;
    }).catch(() => caches.match('./index.html'))
  );
});
