/**
 * Service worker do PWA: app shell offline e cache dos assets estáticos.
 *
 * Regras:
 * - `/api` e `/realtime` (HTTP e WebSocket) NUNCA passam pelo cache;
 * - assets (`/assets/`, ícones): cache-first — são versionados por hash (build) ou por `?v=`
 *   (modelos 3DX), então uma versão nova sempre tem uma URL nova;
 * - navegação: network-first com o shell em cache como reserva (abre offline);
 * - o resto: stale-while-revalidate.
 */
const VERSION = '3dx-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (request) => {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? network;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/realtime')) return;

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(VERSION);
          await cache.put('/index.html', response.clone());
          return response;
        })
        .catch(
          async () =>
            (await caches.match('/index.html')) ?? (await caches.match('/')) ?? Response.error(),
        ),
    );
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
