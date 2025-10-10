const CACHE_NAME = 'map-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/location.html',  // If using details page
  '/data.csv',
  // Cache CDNs (for offline; they may update, so version CACHE_NAME when updating)
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
  // Add more if you download/localize files
];

// Install event: Cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Cache-first for assets, network-first for dynamic (e.g., email)
self.addEventListener('fetch', event => {
  // Ignore non-GET or non-same-origin (e.g., external APIs like email)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request).then(fetchResponse => {
          // Cache successful fetches (except tiles, to avoid staleness)
          if (event.request.url.includes('openstreetmap.org')) {
            return fetchResponse;  // Don't cache tiles (dynamic)
          }
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        }).catch(() => {
          // Offline fallback: Show cached HTML or basic message
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
          return new Response('Offline: Resource not available.', { status: 503 });
        });
      })
  );
});
