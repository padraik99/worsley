// Offline support: serve from cache, refresh the cache in the background.
const CACHE = 'worsley-v1';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/astro.js', 'js/orient.js', 'js/wmm.js', 'js/wmm-data.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
