/**
 * PIPOCAFLIX — VIP Ad Blocker v4
 * assets/js/pflix-vip.js
 * Inclua este script em TODAS as páginas com anúncio, antes de </body>
 * NÃO inclua em planos.html
 *
 * ESTRATÉGIA v4 (sem flash de ads para VIP):
 *   - Injeta <style> que esconde TODOS os blocos de anúncio IMEDIATAMENTE,
 *     antes do DOMContentLoaded, antes de qualquer script de ad rodar.
 *   - Verifica cache local (síncrono) → se é VIP, mantém oculto permanentemente.
 *   - Se NÃO é VIP (cache confirma), remove o CSS de ocultação e libera os ads.
 *   - Se não há cache (primeira visita), consulta Firestore; só libera ads se
 *     não for VIP. O usuário não-VIP vê os ads aparecerem após ~1s (tempo de
 *     consulta), mas o VIP NUNCA vê o flash.
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

  // ─── PASSO 1: Injeta CSS de ocultação IMEDIATAMENTE (síncrono) ───
  // Isso garante que os ads nunca aparecem na tela, independente de ser VIP ou não.
  // Se não for VIP, removemos esse style depois da verificação.
  var _styleId = 'pflix-ads-hidden';
  (function injetarOcultacaoImediata() {
    if (document.getElementById(_styleId)) return;
    var s = document.createElement('style');
    s.id = _styleId;
    s.textContent = AD_SELECTORS.map(function(sel) {
      return sel + ' { display: none !important; visibility: hidden !important; }';
    }).join('\n');
    // Coloca no <head> ou no topo do <html> — o mais cedo possível
    var target = document.head || document.documentElement;
    if (target.firstChild) {
      target.insertBefore(s, target.firstChild);
    } else {
      target.appendChild(s);
    }
  })();

  // Expõe status VIP globalmente para outras partes do site usarem
  window.PipocaVIP = { ativo: false, plano: null };

  // ─── Liberar ads (usuário NÃO é VIP) ───
  function liberarAnuncios() {
    var styleEl = document.getElementById(_styleId);
    if (styleEl) styleEl.remove();
    console.log('[PipocaFlix VIP] ℹ️ Usuário não-VIP — anúncios liberados');
  }

  // ─── Matar ads permanentemente (usuário É VIP) ───
  function matarAnuncios() {
    window.PipocaVIP.ativo = true;

    // 1. Garante que o style de ocultação existe (por precaução)
    if (!document.getElementById(_styleId)) {
      var s = document.createElement('style');
      s.id = _styleId;
      s.textContent = AD_SELECTORS.map(function(sel) {
        return sel + ' { display: none !important; visibility: hidden !important; }';
      }).join('\n');
      (document.head || document.documentElement).appendChild(s);
    }

    // 2. Limpa o innerHTML dos containers (evita que scripts já carregados façam algo)
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

    // 3. Bloqueia scripts de anúncio injetados dinamicamente
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
            AD_SELECTORS.forEach(function(sel) {
              if (node.matches && node.matches(sel)) {
                node.innerHTML = '';
              }
            });
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

    // 4. Bloqueia window.open (popunder)
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
      // Cache válido encontrado — decisão instantânea, zero delay
      window.PipocaVIP.plano = cached.plano || null;
      if (cached.is_vip === true) {
        matarAnuncios();
      } else {
        // Não é VIP: libera os ads (remove o CSS de ocultação)
        liberarAnuncios();
      }
      return;
    }

    // Sem cache: consulta Firestore
    // Ads permanecem ocultos até sabermos o resultado.
    var resultado = await verificarVipFirestore(email);
    salvarCacheLocal(email, resultado.ativo, resultado.plano);
    window.PipocaVIP.plano = resultado.plano;

    if (resultado.ativo) {
      matarAnuncios();
    } else {
      // Confirmado não-VIP: libera os ads agora
      liberarAnuncios();
    }
  }

  // ─── Usuário não logado: libera ads ───
  function usuarioNaoLogado() {
    liberarAnuncios();
  }

  // Salva window.open original antes de qualquer script de ad
  if (!window.__origOpen) window.__origOpen = window.open.bind(window);

  // ─── Aguarda autenticação ───
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
          // Auth resolveu mas sem usuário logado → não é VIP
          usuarioNaoLogado();
        }
      });
      return;
    }
    // Polling: espera PipocaAuth ficar disponível
    var tentativas = 0;
    var intervalo = setInterval(function() {
      tentativas++;
      if (tentativas > 60) {
        // Timeout (12s): não conseguiu verificar, libera ads
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
