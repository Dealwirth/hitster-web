const VERSION = 'hitster-web-v4.2.0';
const BASE = self.registration.scope;
const SHELL = [
  '',
  'index.html',
  'styles.css',
  'app.js',
  'vendor/jsqr.js',
  'fonts/anton.woff2',
  'fonts/archivo-black.woff2',
  'fonts/inter.woff2',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'manifest.webmanifest',
].map((path) => new URL(path, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || request.headers.has('range') || request.destination === 'audio') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(new URL('index.html', BASE).href)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(VERSION);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});
