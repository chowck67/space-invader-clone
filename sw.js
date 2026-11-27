/* Orange Invader service worker.
 * Same-origin files: stale-while-revalidate, so the game opens instantly offline and picks up updates on the next launch.
 * Google Fonts: cached after the first online visit so the cartoon fonts also work offline.
 * Bump VERSION when you want to drop every old cached file. */
const VERSION = 'v8';
const SHELL = `orange-invader-shell-${VERSION}`;
const FONTS = 'orange-invader-fonts';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'js/game.js', 'js/pwa.js', 'manifest.webmanifest',
  'icons/icon.svg?v=2', 'icons/icon-192.png?v=2', 'icons/icon-512.png?v=2', 'icons/icon-maskable-192.png?v=2',
  'icons/icon-maskable-512.png?v=2', 'icons/apple-touch-icon.png?v=2', 'icons/favicon-32.png?v=2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== FONTS) await caches.delete(k);   // also clears the old Pip Patrol caches
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(evt, cacheName, req, matchKey) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(matchKey || req);
  const refresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(matchKey || req, res.clone());
    return res;
  }).catch(() => null);
  evt.waitUntil(refresh);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(e, FONTS, req));
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(staleWhileRevalidate(e, SHELL, req, 'index.html')); return; }
  e.respondWith(staleWhileRevalidate(e, SHELL, req));
});
