/* ═══════════════════════════════════════════════════
   PIPOCAFLIX — Service Worker v4 (Network-First, só do próprio site)
   Estratégia: Network First para HTML/CSS/JS do PRÓPRIO site
   Cache apenas como fallback offline

   O que mudou na v4:
   • NÃO intermedeia mais pedidos de outros domínios (Worker, Firebase, fontes, capas…).
     Antes todo pedido passava pelo SW; se a rede falhasse, um pedido de CSV/JSON recebia o
     index.html como resposta (e o catálogo tentava "ler" HTML como se fosse planilha).
   • Falha de rede em arquivo que NÃO é página (js, css, imagem…) agora falha de verdade, em vez
     de devolver a home no lugar.
   • /api/* e /c/* (prévia de compartilhamento) nunca passam pelo cache.
═══════════════════════════════════════════════════ */

const CACHE_VERSION = 'pipocaflix-v4-20261112';
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

/* ── Fetch: NETWORK FIRST (só pedidos do próprio site) ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignora extensões de browser e chrome-extension
  if (!url.protocol.startsWith('http')) return;

  // Outros domínios (Worker do catálogo, Firebase, Google Fonts, capas…): o navegador resolve sozinho.
  if (url.origin !== self.location.origin) return;

  // Funções do servidor e links de prévia: sempre direto da rede.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/c/')) return;

  const ehPagina = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    fetch(req)
      .then(response => {
        // Atualiza cache com versão nova
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: usa o que tiver em cache. Só PÁGINAS caem pra home; o resto falha de verdade.
        return caches.match(req).then(cached => {
          if (cached) return cached;
          return ehPagina ? caches.match('/index.html') : Response.error();
        });
      })
  );
});
