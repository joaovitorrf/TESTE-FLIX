/**
 * PIPOCAFLIX — Ad Guard (carrega primeiro, no <head>)
 * assets/js/pflix-guard.js
 *
 * POR QUE ESSE ARQUIVO EXISTE:
 *   O pflix-vip.js (que decide quem é VIP) só carrega perto do </body>,
 *   bem depois dos scripts de anúncio "Page Push" e "Video Slide Ad",
 *   que ficam soltos no meio da página sem nenhuma div em volta.
 *   Resultado: quando o pflix-vip.js finalmente rodava, esses 2 anúncios
 *   já tinham sido inseridos e disparado — para TODO MUNDO, inclusive VIP.
 *
 * SOLUÇÃO:
 *   Este arquivo é minúsculo e síncrono, e deve ser o PRIMEIRO <script>
 *   da página (primeira linha do <head>, antes até do CSS se possível).
 *   Ele intercepta a criação de elementos <script> cujo .src apontar pra
 *   um domínio de anúncio conhecido, e os bloqueia desde o início — até
 *   o pflix-vip.js (no fim da página) decidir se a pessoa é VIP ou não:
 *     - Se for VIP   → mantém bloqueado para sempre.
 *     - Se NÃO for VIP → libera (window.PFLIX_GUARD.liberar()).
 *
 * COMO USAR:
 *   Cole isso na PRIMEIRA linha do <head>, antes de qualquer outro <script>:
 *   <script src="assets/js/pflix-guard.js"></script>
 *
 *   O pflix-vip.js continua sendo incluído normalmente perto do </body>.
 */
(function () {
  'use strict';

  const AD_SCRIPT_KEYWORDS = [
    'simplisticpride.com',
    'sophisticatedpin.com',
    'sorrowfulpsychology.com',
  ];

  const AD_SELECTORS = [
    '.ad-banner-wrap',
    '.mobile-banner-ad',
    '#mobileBannerAdNew',
    '#supportBannerOverlay',
  ];

  // true = bloqueando tudo (estado inicial / VIP confirmado)
  // false = liberado (não-VIP confirmado)
  var bloquear = true;

  function ehUrlDeAd(url) {
    if (!url) return false;
    for (var i = 0; i < AD_SCRIPT_KEYWORDS.length; i++) {
      if (url.indexOf(AD_SCRIPT_KEYWORDS[i]) !== -1) return true;
    }
    return false;
  }

  // ─── Injeta CSS de ocultação das divs IMEDIATAMENTE ───
  var _styleId = 'pflix-ads-hidden';
  function injetarCSS() {
    if (document.getElementById(_styleId)) return;
    var s = document.createElement('style');
    s.id = _styleId;
    s.textContent = AD_SELECTORS.map(function(sel) {
      return sel + '{display:none!important;visibility:hidden!important;}';
    }).join('\n');
    var target = document.head || document.documentElement;
    if (target.firstChild) target.insertBefore(s, target.firstChild);
    else target.appendChild(s);
  }
  injetarCSS();

  // ─── Intercepta a inserção de <script> de anúncio no DOM ───
  // Cobre os 2 anúncios soltos (Page Push, Video Slide Ad) que não usam div.
  var origInsertBefore = Node.prototype.insertBefore;
  var origAppendChild   = Node.prototype.appendChild;

  function ehScriptDeAd(node) {
    return node && node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || '');
  }

  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (bloquear && ehScriptDeAd(newNode)) return newNode;
    return origInsertBefore.call(this, newNode, referenceNode);
  };

  Node.prototype.appendChild = function (newNode) {
    if (bloquear && ehScriptDeAd(newNode)) return newNode;
    return origAppendChild.call(this, newNode);
  };

  // ─── Observer extra: caso algum ad escape via outro método de inserção ───
  function iniciarObserver() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node) return;
          if (bloquear && node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || node.textContent || '')) {
            node.remove();
            return;
          }
          if (bloquear && node.nodeType === 1 && node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(function (f) {
              if (ehUrlDeAd(f.src || '')) f.remove();
            });
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarObserver);
  } else {
    iniciarObserver();
  }

  // ─── API exposta para o pflix-vip.js controlar o estado ───
  window.PFLIX_GUARD = {
    liberar: function () {
      bloquear = false;
      var styleEl = document.getElementById(_styleId);
      if (styleEl) styleEl.remove();
    },
    manterBloqueado: function () {
      bloquear = true;
      injetarCSS();
    }
  };
})();
