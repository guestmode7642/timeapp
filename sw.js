const CACHE_NAME = 'time-ledger-pwa-v1';
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/state.js',
    '/render.js',
    '/handlers.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
        ).then(() => self.clients.claim())
    );
});

// Instant Cache-First for UI files + Background Update; Network-Only for /api/sync
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkFetch = fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            // Return cached UI immediately for 0ms startup, or wait for network on very first visit
            return cachedResponse || networkFetch;
        })
    );
});
