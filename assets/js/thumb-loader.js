/**
 * PIPOCAFLIX — thumb-loader.js
 * Melhora o carregamento das capas (.card-thumb):
 *  - Fundo colorido (gradiente) baseado na categoria do título, exibido
 *    enquanto a imagem carrega.
 *  - Fade-in suave assim que a imagem termina de carregar (ou dá erro).
 * Funciona automaticamente para qualquer <img class="card-thumb"> dentro
 * de um .card-thumb-wrap, mesmo em cards criados dinamicamente depois.
 */
(function () {
  'use strict';

  // Paleta de gradientes discretos, alinhados ao tema escuro do site.
  var PALETTE = [
    ['#3a1c54', '#63277d'], // roxo
    ['#0f3a5c', '#1a5c8a'], // azul
    ['#5c1a2a', '#8a1f3d'], // vinho
    ['#1a4d3a', '#237a57'], // verde
    ['#5c4114', '#8a621f'], // dourado queimado
    ['#4a1a5c', '#701f8a'], // magenta
    ['#1a3350', '#2a5580'], // azul petróleo
    ['#5c2e14', '#8a4a1f'], // laranja queimado
    ['#2a2a5c', '#3d3d8a'], // índigo
    ['#1a5c4d', '#237a68'], // esmeralda
  ];

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function colorFor(cat) {
    var key = (cat || 'geral').toLowerCase().trim();
    var pair = PALETTE[hash(key) % PALETTE.length];
    return 'linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')';
  }

  function initImg(img) {
    if (!img || img.dataset.pflixInit) return;
    img.dataset.pflixInit = '1';

    var wrap = img.closest('.card-thumb-wrap');
    if (wrap && !wrap.dataset.pflixBg) {
      wrap.dataset.pflixBg = '1';
      var cat = img.getAttribute('data-cat') || img.getAttribute('alt') || '';
      wrap.style.background = colorFor(cat);
    }

    function reveal() {
      img.classList.add('pflix-loaded');
      if (wrap) wrap.classList.add('pflix-thumb-loaded');
    }

    if (img.complete && img.naturalWidth > 0) {
      reveal();
    } else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    }
  }

  function scan(root) {
    (root || document).querySelectorAll('img.card-thumb:not([data-pflix-init])').forEach(initImg);
  }

  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (!m.addedNodes) return;
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('img.card-thumb')) initImg(n);
        if (n.querySelectorAll) scan(n);
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(document); });
  } else {
    scan(document);
  }

  window.PipocaThumb = { colorFor: colorFor, initImg: initImg, scan: scan };
})();
