/* ═══════════════════════════════════════════════════
   PIPOCAFLIX — Service Worker v3 (Network-First)
   Estratégia: Network First para HTML/CSS/JS
   Cache apenas como fallback offline
═══════════════════════════════════════════════════ */

const CACHE_VERSION = 'pipocaflix-v3-20250502';
const CACHE_NAME    = CACHE_VERSION;

/* Assets que queremos manter disponíveis offline */
const OFFLINE_ASSETS = [
  '/index.html',
  '/manifest.json'
];

/* ── Install: cache mínimo ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS).catch(() => {}))
  );
  self.skipWaiting(); // ativa imediatamente sem esperar aba fechar
});

/* ── Activate: apaga TODOS os caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deletando cache antigo:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim(); // toma controle de todas as abas abertas
});

/* ── Fetch: NETWORK FIRST para tudo ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora extensões de browser e chrome-extension
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza cache com versão nova
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Apenas usa cache se offline
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/index.html');
        });
      })
  );
});
