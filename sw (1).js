/* ═══════════════════════════════════════════════════
   PIPOCAFLIX — Service Worker v1
   Cache first para assets estáticos
   Network first para dados da API (Workers)
═══════════════════════════════════════════════════ */

const CACHE_NAME = 'pipocaflix-v1';

const STATIC_ASSETS = [
  '/index.html',
  '/catalogo.html',
  '/filme.html',
  '/serie.html',
  '/elenco.html',
  '/assets/css/style.css',
  '/assets/js/api.js',
  '/assets/js/search.js',
  '/assets/js/player.js',
  '/assets/js/security.js',
  '/assets/js/favoritos.js',
  '/manifest.json'
];

/* ── Install: pré-cacheiar assets estáticos ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

/* ── Activate: limpar caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: estratégia híbrida ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar requisições não-GET
  if (event.request.method !== 'GET') return;

  // Network first para Workers (dados dinâmicos)
  if (
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache first para assets estáticos
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
