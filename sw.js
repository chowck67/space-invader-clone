/* Pip Patrol service worker.
 * Same-origin files: stale-while-revalidate, so the game opens instantly offline and picks up updates on the next launch.
 * Google Fonts: cached after the first online visit so the cartoon fonts also work offline.
 * Bump VERSION when you want to drop every old cached file. */
const VERSION = 'v3';
const SHELL = `pip-patrol-shell-${VERSION}`;
const FONTS = 'pip-patrol-fonts';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'js/game.js', 'js/pwa.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pip-patrol-shell-') && k !== SHELL) await caches.delete(k);
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
