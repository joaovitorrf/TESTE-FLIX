/**
 * PIPOCAFLIX — Ad Guard v2 (carrega primeiro, no <head>)
 * assets/js/pflix-guard.js
 *
 * POR QUE ESSE ARQUIVO EXISTE:
 *   O pflix-vip.js (que decide quem é VIP) só carrega perto do </body>,
 *   bem depois dos scripts de anúncio "Page Push" e "Video Slide Ad",
 *   que ficam soltos no meio da página sem nenhuma div em volta.
 *   Sem este guard, esses 2 anúncios disparavam para TODO MUNDO, inclusive VIP.
 *
 * MUDANÇA NA v2 (corrige bug da v1):
 *   Na v1, quando um script de ad era bloqueado, ele era simplesmente
 *   descartado — se depois descobríssemos que o usuário NÃO é VIP, não tinha
 *   como aquele anúncio aparecer mais tarde, porque o elemento já tinha
 *   morrido. Resultado: no modo Free, alguns anúncios paravam de aparecer.
 *   Agora, em vez de descartar, os scripts bloqueados ficam numa fila
 *   (_fila). Quando liberar() é chamado (usuário confirmado como Free),
 *   reinserimos esses scripts de verdade — o anúncio aparece normalmente.
 *   Se manterBloqueado() for chamado (usuário é VIP), a fila é descartada
 *   de vez e nada é inserido.
 *
 * COMO USAR:
 *   Primeira linha do <head>, antes de qualquer outro <script>:
 *   <script src="assets/js/pflix-guard.js"></script>
 *   O pflix-vip.js continua incluído normalmente perto do </body>.
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

  // null = ainda não sabemos (estado inicial, enquanto aguarda Firestore)
  // true = é VIP → bloqueia para sempre
  // false = não é VIP → libera tudo
  var decisao = null;

  // Fila de { node, parent, referenceNode } dos scripts de ad que tentaram
  // se inserir enquanto a decisão ainda não saiu (ou era bloqueio).
  var fila = [];

  function ehUrlDeAd(url) {
    if (!url) return false;
    for (var i = 0; i < AD_SCRIPT_KEYWORDS.length; i++) {
      if (url.indexOf(AD_SCRIPT_KEYWORDS[i]) !== -1) return true;
    }
    return false;
  }

  // ─── CSS de ocultação das divs (cobre os ads que ficam dentro de container) ───
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
  var origInsertBefore = Node.prototype.insertBefore;
  var origAppendChild   = Node.prototype.appendChild;

  function ehScriptDeAd(node) {
    return node && node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || '');
  }

  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (decisao !== false && ehScriptDeAd(newNode)) {
      // Decisão ainda não confirmada como "não-VIP" → segura na fila
      fila.push({ node: newNode, parent: this, ref: referenceNode, metodo: 'insertBefore' });
      return newNode;
    }
    return origInsertBefore.call(this, newNode, referenceNode);
  };

  Node.prototype.appendChild = function (newNode) {
    if (decisao !== false && ehScriptDeAd(newNode)) {
      fila.push({ node: newNode, parent: this, ref: null, metodo: 'appendChild' });
      return newNode;
    }
    return origAppendChild.call(this, newNode);
  };

  // ─── Observer extra: caso algum ad escape via outro método de inserção ───
  function iniciarObserver() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node) return;
          if (decisao !== false && node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || node.textContent || '')) {
            node.remove();
            return;
          }
          if (decisao !== false && node.nodeType === 1 && node.querySelectorAll) {
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
    // Usuário confirmado como NÃO-VIP: solta tudo que ficou na fila
    liberar: function () {
      decisao = false;
      var styleEl = document.getElementById(_styleId);
      if (styleEl) styleEl.remove();

      // Reinsere de verdade os scripts de ad que ficaram represados
      var pendentes = fila;
      fila = [];
      pendentes.forEach(function (item) {
        try {
          // Cria um <script> novo (clonar src/atributos) — reaproveitar o
          // node antigo pode não disparar o carregamento de novo em alguns
          // navegadores, então criamos um equivalente do zero.
          var novo = document.createElement('script');
          for (var i = 0; i < item.node.attributes.length; i++) {
            var attr = item.node.attributes[i];
            novo.setAttribute(attr.name, attr.value);
          }
          if (item.node.text) novo.text = item.node.text;
          if (item.metodo === 'insertBefore' && item.parent && item.parent.isConnected) {
            origInsertBefore.call(item.parent, novo, item.ref);
          } else if (item.parent && item.parent.isConnected) {
            origAppendChild.call(item.parent, novo);
          } else {
            // Parent não está mais no DOM (ex.: trocou de página) → ignora
          }
        } catch (e) {
          console.warn('[PFLIX_GUARD] erro ao reinserir ad represado:', e);
        }
      });
    },

    // Usuário confirmado como VIP: descarta a fila de vez, nada é inserido
    manterBloqueado: function () {
      decisao = true;
      fila = [];
      injetarCSS();
    }
  };
})();
