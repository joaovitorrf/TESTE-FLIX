/**
 * PIPOCAFLIX — VIP Ad Blocker v3
 * assets/js/pflix-vip.js
 * Inclua este script em TODAS as páginas com anúncio, antes de </body>
 * NÃO inclua em planos.html
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

  // Expõe status VIP globalmente para outras partes do site usarem
  window.PipocaVIP = { ativo: false, plano: null };

  function matarAnuncios() {
    window.PipocaVIP.ativo = true;

    // 1. Esconde divs de anúncio já no DOM
    AD_SELECTORS.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.style.setProperty('display', 'none', 'important');
        el.innerHTML = '';
      });
    });

    // 2. Bloqueia scripts de anúncio injetados dinamicamente
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (!node) return;
          if (node.tagName === 'SCRIPT') {
            var src = node.src || node.textContent || '';
            if (AD_SCRIPT_KEYWORDS.some(function(kw){ return src.includes(kw); })) {
              node.remove();
              return;
            }
          }
          if (node.nodeType === 1) {
            // Esconde divs de ad inseridas dinamicamente
            AD_SELECTORS.forEach(function(sel) {
              if (node.matches && node.matches(sel)) {
                node.style.setProperty('display', 'none', 'important');
                node.innerHTML = '';
              }
            });
            // Mata iframes de ad inseridos dinamicamente
            node.querySelectorAll && node.querySelectorAll('iframe').forEach(function(f) {
              var src = f.src || '';
              if (AD_SCRIPT_KEYWORDS.some(function(kw){ return src.includes(kw); })) {
                f.remove();
              }
            });
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 3. Bloqueia window.open (popunder)
    window.open = function(url) {
      // Permite window.open normal de links do próprio site
      if (url && (url.startsWith('/') || url.startsWith(location.origin))) {
        return window.__origOpen ? window.__origOpen(url) : null;
      }
      return null;
    };

    // 4. Remove banner "apoio 30min"
    var sb = document.getElementById('supportBannerOverlay');
    if (sb) sb.remove();

    // 5. Mata iframes de ad já existentes
    document.querySelectorAll('iframe').forEach(function(f) {
      var src = f.src || '';
      if (AD_SCRIPT_KEYWORDS.some(function(kw){ return src.includes(kw); })) f.remove();
    });

    document.body.classList.add('pflix-vip-ativo');
    console.log('[PipocaFlix VIP] ✅ Anúncios desativados');

    // Dispara evento para outras partes do site reagirem
    document.dispatchEvent(new CustomEvent('pflix:vip-ativo', { detail: { plano: window.PipocaVIP.plano } }));
  }

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
      return { ativo: false, plano: null };
    }
  }

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

  async function checarVip(email) {
    var cached = verificarCacheLocal(email);
    if (cached) {
      window.PipocaVIP.plano = cached.plano || null;
      if (cached.is_vip === true) { matarAnuncios(); return; }
      if (cached.is_vip === false) return;
    }
    var resultado = await verificarVipFirestore(email);
    salvarCacheLocal(email, resultado.ativo, resultado.plano);
    window.PipocaVIP.plano = resultado.plano;
    if (resultado.ativo) matarAnuncios();
  }

  // Salva window.open original antes de qualquer script de ad
  if (!window.__origOpen) window.__origOpen = window.open.bind(window);

  function aguardarAuth() {
    var user = window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser();
    if (user && user.email) {
      checarVip(user.email.toLowerCase().trim());
      return;
    }
    if (window.PipocaAuth && window.PipocaAuth.onAuthChanged) {
      window.PipocaAuth.onAuthChanged(function(u) {
        if (u && u.email) checarVip(u.email.toLowerCase().trim());
      });
      return;
    }
    // Polling: espera PipocaAuth ficar disponível
    var tentativas = 0;
    var intervalo = setInterval(function() {
      tentativas++;
      if (tentativas > 60) { clearInterval(intervalo); return; }
      var auth = window.PipocaAuth;
      if (!auth || !auth.onAuthChanged) return;
      clearInterval(intervalo);
      auth.onAuthChanged(function(u) {
        if (u && u.email) checarVip(u.email.toLowerCase().trim());
      });
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aguardarAuth);
  } else {
    aguardarAuth();
  }
})();
