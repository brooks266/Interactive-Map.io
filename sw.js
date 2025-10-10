   const CACHE_NAME = 'map-app-v4';  // Bump version for cache busting
   const urlsToCache = [
     '/Interactive-Map.io/',
     '/Interactive-Map.io/index.html',
     '/Interactive-Map.io/login.html',
     '/Interactive-Map.io/location.html',  // If using details page
     '/Interactive-Map.io/data.csv',
     '/Interactive-Map.io/manifest.json',
     // Local assets (now cached)
     '/Interactive-Map.io/leaflet.css',
     '/Interactive-Map.io/MarkerCluster.css',
     '/Interactive-Map.io/MarkerCluster.Default.css',
     '/Interactive-Map.io/leaflet.js',
     '/Interactive-Map.io/leaflet.markercluster.js',
     '/Interactive-Map.io/papaparse.min.js',  // If downloaded
      // Icons (new: cache Leaflet markers)
     '/Interactive-Map.io/images/marker-icon.png',
     '/Interactive-Map.io/images/marker-icon-2x.png',
     '/Interactive-Map.io/images/marker-shadow.png',
     // Icons
     '/Interactive-Map.io/icon-192.png',
     '/Interactive-Map.io/icon-512.png'
     // Note: CDNs removed since local; add back if keeping any
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
   


