   const CACHE_NAME = 'map-app-v5';  // Bump version for cache busting
const urlsToCache = [
  '/',
  '/index.html',
  '/login.html',
  '/settings.html',
  '/location.html',
  '/manifest.json',
  // CSS files
  '/css/common.css',
  '/css/leaflet.css',
  '/css/MarkerCluster.css',
  '/css/MarkerCluster.Default.css',
  // JavaScript files
  '/js/leaflet.js',
  '/js/leaflet.markercluster.js',
  '/js/firebase-config.js',
  '/js/utils.js',
  // Leaflet marker images
  '/images/marker-icon.png',
  '/images/marker-icon-2x.png',
  '/images/marker-shadow.png',
  // PWA icons
  '/icons/icon-192.png',
  '/icons/icon-512.png'
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
   



