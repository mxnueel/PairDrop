// QRDrop does not use offline caching. This worker exists only to clean up
// any previously registered PairDrop service worker (and its cached files)
// on browsers that visited this origin before the rebrand.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            await self.registration.unregister();

            const clientsList = await self.clients.matchAll({ type: 'window' });
            for (const client of clientsList) {
                client.navigate(client.url);
            }
        })()
    );
});
