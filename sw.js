const CACHE_NAME = 'workout-tracker-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// Install Event - caches all structural files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Fetch Event - network interceptor for offline capability (Cache-First Strategy)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // Return cached version if found
            if (response) {
                return response;
            }

            // Otherwise, fetch from network
            return fetch(event.request).then(networkResponse => {
                // If the user goes offline, CDN requests (like Chart.js) will fail,
                // but the app itself will load from cache and remain functional.
                return networkResponse;
            });
        }).catch(error => {
            console.error('Fetch failed:', error);
            // Fallback strategy could be implemented here
        })
    );
});

// Activate Event - clean up old caches
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
        })
    );
});
