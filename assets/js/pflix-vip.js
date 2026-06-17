/**
 * PIPOCAFLIX — VIP Ad Blocker
 * assets/js/pflix-vip.js
 */
(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

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

  function matarAnuncios() {
    // 1. Esconde e esvazia divs de anúncio
    AD_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.innerHTML = '';
      });
    });

    // 2. Bloqueia scripts de anúncio futuros via MutationObserver
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (!node) return;
          // Script tag adicionado dinamicamente
          if (node.tagName === 'SCRIPT') {
            const src = node.src || node.textContent || '';
            if (AD_SCRIPT_KEYWORDS.some(kw => src.includes(kw))) {
              node.remove();
            }
          }
          // Div de anúncio adicionada dinamicamente
          if (node.nodeType === 1) {
            AD_SELECTORS.forEach(sel => {
              if (node.matches && node.matches(sel)) {
                node.style.setProperty('display', 'none', 'important');
                node.innerHTML = '';
              }
            });
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 3. Bloqueia popunder — sobrescreve window.open
    const _origOpen = window.open.bind(window);
    window.open = function(url, ...args) {
      if (url && AD_SCRIPT_KEYWORDS.some(kw => url.includes(kw))) return null;
      // Bloqueia qualquer popunder (nova aba em clique)
      return null;
    };

    // 4. Remove o banner "apoio 30 min" também
    const supportBanner = document.getElementById('supportBannerOverlay');
    if (supportBanner) supportBanner.remove();

    document.body.classList.add('pflix-vip-ativo');
    console.log('[PipocaFlix VIP] ✅ Anúncios desativados');
  }

  async function verificarVipFirestore(email) {
    const emailKey = email.replace(/[.#$[\]]/g, '_');
    const url = `${FS_BASE}/vip/${emailKey}?key=${FIREBASE_API_KEY}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      const vipAte = data?.fields?.vip_ate?.stringValue;
      if (!vipAte) return false;
      return new Date(vipAte) > new Date();
    } catch {
      return false;
    }
  }

  function verificarCacheLocal(email) {
    try {
      const raw = localStorage.getItem('pflix_vip_cache');
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (cache.email !== email) return null;
      if (new Date() > new Date(cache.cache_ate)) return null;
      return cache.is_vip;
    } catch { return null; }
  }

  function salvarCacheLocal(email, isVip) {
    try {
      localStorage.setItem('pflix_vip_cache', JSON.stringify({
        email,
        is_vip: isVip,
        cache_ate: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }));
    } catch {}
  }

  async function checarVip(email) {
    const cached = verificarCacheLocal(email);
    if (cached === true) { matarAnuncios(); return; }
    if (cached === false) return;

    const isVip = await verificarVipFirestore(email);
    salvarCacheLocal(email, isVip);
    if (isVip) matarAnuncios();
  }

  // ── Estratégia: escuta o evento customizado que o Firebase dispara ──
  // O index.html já tem onAuthStateChanged — vamos nos pendurar nele
  // via um evento customizado que vamos injetar lá, OU via polling inteligente

  function aguardarAuth() {
    // Tenta pegar o usuário imediatamente
    const user = window.PipocaAuth?.getUser?.();
    if (user?.email) {
      checarVip(user.email.toLowerCase().trim());
      return;
    }

    // Se PipocaAuth ainda não existe ou usuário ainda não carregou,
    // usa onAuthChanged se disponível
    if (window.PipocaAuth?.onAuthChanged) {
      window.PipocaAuth.onAuthChanged(function(user) {
        if (user?.email) {
          checarVip(user.email.toLowerCase().trim());
        }
      });
      return;
    }

    // Fallback: polling até PipocaAuth aparecer (máx 10s)
    let tentativas = 0;
    const intervalo = setInterval(function() {
      tentativas++;
      if (tentativas > 40) { clearInterval(intervalo); return; } // desiste após 10s

      const auth = window.PipocaAuth;
      if (!auth) return;

      // PipocaAuth existe — usa onAuthChanged
      clearInterval(intervalo);
      auth.onAuthChanged(function(user) {
        if (user?.email) {
          checarVip(user.email.toLowerCase().trim());
        }
      });
    }, 250);
  }

  // Inicia após DOM pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aguardarAuth);
  } else {
    aguardarAuth();
  }

})();
