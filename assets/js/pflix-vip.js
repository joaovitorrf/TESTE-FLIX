/**
 * PIPOCAFLIX — VIP Ad Blocker v5
 * assets/js/pflix-vip.js
 * Inclua este script em TODAS as páginas com anúncio, antes de </body>
 * NÃO inclua em planos.html
 *
 * ESTRATÉGIA v5:
 *   - v4 só escondia DIVs de anúncio (.ad-banner-wrap, .mobile-banner-ad etc).
 *     Mas existem 2 anúncios ("Page Push" e "Video Slide Ad") que são scripts
 *     soltos no body, SEM nenhuma div — eles passavam direto pro VIP.
 *   - v5 intercepta a CRIAÇÃO desses scripts: sobrescreve document.createElement
 *     para que, se o código tentar criar um <script> e depois setar o .src para
 *     um domínio de anúncio, o elemento nunca seja inserido de fato — ele se
 *     torna um "fantasma" inofensivo (nunca entra no DOM).
 *   - Continua escondendo as divs de anúncio via CSS imediato, igual v4, para
 *     cobrir os anúncios que ficam dentro de containers.
 *   - A decisão de quem é VIP continua vindo do Firestore + cache local.
 */
(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents';

  const AD_SELECTORS = [
    '.ad-banner-wrap',
    '.mobile-banner-ad',
    '#mobileBannerAdNew',
    '#supportBannerOverlay',
  ];

  const AD_SCRIPT_KEYWORDS = [
    'simplisticpride.com',
    'sophisticatedpin.com',
    'sorrowfulpsychology.com',
  ];

  // ─── Estado: ainda não sabemos se é VIP (null = indefinido) ───
  // Enquanto for null, bloqueamos tudo (benefício da dúvida).
  // true  = é VIP → bloqueado pra sempre
  // false = não é VIP → liberado
  var _bloquearAds = true;

  function ehUrlDeAd(url) {
    if (!url) return false;
    return AD_SCRIPT_KEYWORDS.some(function(kw) { return url.indexOf(kw) !== -1; });
  }

  // ─── PASSO 1: Injeta CSS de ocultação IMEDIATAMENTE (síncrono) ───
  var _styleId = 'pflix-ads-hidden';
  (function injetarOcultacaoImediata() {
    if (document.getElementById(_styleId)) return;
    var s = document.createElement('style');
    s.id = _styleId;
    s.textContent = AD_SELECTORS.map(function(sel) {
      return sel + ' { display: none !important; visibility: hidden !important; }';
    }).join('\n');
    var target = document.head || document.documentElement;
    if (target.firstChild) {
      target.insertBefore(s, target.firstChild);
    } else {
      target.appendChild(s);
    }
  })();

  // ─── PASSO 2: Intercepta criação de <script> soltos (Page Push / Video Slide Ad) ───
  // Esses scripts não usam nenhuma div, então a única forma de pegá-los é no
  // momento em que o código do anúncio tenta inserir o <script> de fato no DOM.
  (function interceptarScriptsSoltos() {
    var origInsertBefore = Node.prototype.insertBefore;
    var origAppendChild   = Node.prototype.appendChild;

    function ehScriptDeAd(node) {
      return node && node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || '');
    }

    Node.prototype.insertBefore = function(newNode, referenceNode) {
      if (_bloquearAds && ehScriptDeAd(newNode)) {
        // Não insere — devolve o próprio node sem efeito (comportamento esperado de insertBefore)
        return newNode;
      }
      return origInsertBefore.call(this, newNode, referenceNode);
    };

    Node.prototype.appendChild = function(newNode) {
      if (_bloquearAds && ehScriptDeAd(newNode)) {
        return newNode;
      }
      return origAppendChild.call(this, newNode);
    };
  })();

  // Expõe status VIP globalmente para outras partes do site usarem
  window.PipocaVIP = { ativo: false, plano: null };

  // ─── Liberar ads (usuário NÃO é VIP) ───
  function liberarAnuncios() {
    _bloquearAds = false;
    var styleEl = document.getElementById(_styleId);
    if (styleEl) styleEl.remove();
    console.log('[PipocaFlix VIP] ℹ️ Usuário não-VIP — anúncios liberados');
  }

  // ─── Matar ads permanentemente (usuário É VIP) ───
  function matarAnuncios() {
    window.PipocaVIP.ativo = true;
    _bloquearAds = true;

    if (!document.getElementById(_styleId)) {
      var s = document.createElement('style');
      s.id = _styleId;
      s.textContent = AD_SELECTORS.map(function(sel) {
        return sel + ' { display: none !important; visibility: hidden !important; }';
      }).join('\n');
      (document.head || document.documentElement).appendChild(s);
    }

    function limparContainers() {
      AD_SELECTORS.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(el) {
          el.innerHTML = '';
        });
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', limparContainers);
    } else {
      limparContainers();
    }

    // Limpa scripts/iframes de ad que porventura já estejam no DOM
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (!node) return;
          if (node.tagName === 'SCRIPT' && ehUrlDeAd(node.src || node.textContent || '')) {
            node.remove();
            return;
          }
          if (node.nodeType === 1) {
            AD_SELECTORS.forEach(function(sel) {
              if (node.matches && node.matches(sel)) {
                node.innerHTML = '';
              }
            });
            node.querySelectorAll && node.querySelectorAll('iframe').forEach(function(f) {
              if (ehUrlDeAd(f.src || '')) f.remove();
            });
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Bloqueia window.open (popunder)
    window.open = function(url) {
      if (url && (url.startsWith('/') || url.startsWith(location.origin))) {
        return window.__origOpen ? window.__origOpen(url) : null;
      }
      return null;
    };

    document.body && document.body.classList.add('pflix-vip-ativo');
    console.log('[PipocaFlix VIP] ✅ Anúncios desativados (VIP confirmado)');

    document.dispatchEvent(new CustomEvent('pflix:vip-ativo', { detail: { plano: window.PipocaVIP.plano } }));
  }

  // ─── Cache local ───
  function verificarCacheLocal(email) {
    try {
      var raw = localStorage.getItem('pflix_vip_cache');
      if (!raw) return null;
      var cache = JSON.parse(raw);
      if (cache.email !== email) return null;
      if (new Date() > new Date(cache.cache_ate)) return null;
      return cache;
    } catch(e) { return null; }
  }

  function salvarCacheLocal(email, ativo, plano) {
    try {
      localStorage.setItem('pflix_vip_cache', JSON.stringify({
        email: email,
        is_vip: ativo,
        plano: plano,
        cache_ate: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }));
    } catch(e) {}
  }

  // ─── Consulta Firestore ───
  async function verificarVipFirestore(email) {
    var emailKey = email.replace(/[.#$[\]]/g, '_');
    var url = FS_BASE + '/vip/' + emailKey + '?key=' + FIREBASE_API_KEY;
    try {
      var res = await fetch(url);
      if (!res.ok) return { ativo: false, plano: null };
      var data = await res.json();
      var vipAte = data && data.fields && data.fields.vip_ate && data.fields.vip_ate.stringValue;
      var plano  = data && data.fields && data.fields.plano  && data.fields.plano.stringValue;
      if (!vipAte) return { ativo: false, plano: null };
      return { ativo: new Date(vipAte) > new Date(), plano: plano || 'gold' };
    } catch(e) {
      // Em caso de erro de rede, mantém ads ocultos (benefício da dúvida)
      return { ativo: true, plano: null };
    }
  }

  // ─── Lógica principal ───
  async function checarVip(email) {
    var cached = verificarCacheLocal(email);

    if (cached !== null) {
      window.PipocaVIP.plano = cached.plano || null;
      if (cached.is_vip === true) {
        matarAnuncios();
      } else {
        liberarAnuncios();
      }
      return;
    }

    var resultado = await verificarVipFirestore(email);
    salvarCacheLocal(email, resultado.ativo, resultado.plano);
    window.PipocaVIP.plano = resultado.plano;

    if (resultado.ativo) {
      matarAnuncios();
    } else {
      liberarAnuncios();
    }
  }

  function usuarioNaoLogado() {
    liberarAnuncios();
  }

  if (!window.__origOpen) window.__origOpen = window.open.bind(window);

  function aguardarAuth() {
    var user = window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser();
    if (user && user.email) {
      checarVip(user.email.toLowerCase().trim());
      return;
    }
    if (window.PipocaAuth && window.PipocaAuth.onAuthChanged) {
      window.PipocaAuth.onAuthChanged(function(u) {
        if (u && u.email) {
          checarVip(u.email.toLowerCase().trim());
        } else {
          usuarioNaoLogado();
        }
      });
      return;
    }
    var tentativas = 0;
    var intervalo = setInterval(function() {
      tentativas++;
      if (tentativas > 60) {
        clearInterval(intervalo);
        liberarAnuncios();
        return;
      }
      var auth = window.PipocaAuth;
      if (!auth || !auth.onAuthChanged) return;
      clearInterval(intervalo);
      auth.onAuthChanged(function(u) {
        if (u && u.email) {
          checarVip(u.email.toLowerCase().trim());
        } else {
          usuarioNaoLogado();
        }
      });
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aguardarAuth);
  } else {
    aguardarAuth();
  }
})();
