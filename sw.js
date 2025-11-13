  const CACHE_NAME = 'map-app-v6';  // Bump version for cache busting
const urlsToCache = [
  '/Interactive-Map.io/',
  '/Interactive-Map.io/index.html',
  '/Interactive-Map.io/login.html',
  '/Interactive-Map.io/settings.html',
  '/Interactive-Map.io/location.html',
  '/Interactive-Map.io/manifest.json',
  // CSS files
  '/Interactive-Map.io/css/common.css',
  '/Interactive-Map.io/css/leaflet.css',
  '/Interactive-Map.io/css/MarkerCluster.css',
  '/Interactive-Map.io/css/MarkerCluster.Default.css',
  // JavaScript files
  '/Interactive-Map.io/js/leaflet.js',
  '/Interactive-Map.io/js/leaflet.markercluster.js',
  '/Interactive-Map.io/js/firebase-config.js',
  '/Interactive-Map.io/js/utils.js',
  // Leaflet marker images
  '/Interactive-Map.io/images/marker-icon.png',
  '/Interactive-Map.io/images/marker-icon-2x.png',
  '/Interactive-Map.io/images/marker-shadow.png',
  // PWA icons
  '/Interactive-Map.io/icons/icon-192.png',
  '/Interactive-Map.io/icons/icon-512.png'
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
              return caches.match('/Interactive-Map.io/index.html');
            }
             return new Response('Offline: Resource not available.', { status: 503 });
           });
         })
     );
   });
   



