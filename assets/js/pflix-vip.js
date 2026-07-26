/**
 * PIPOCAFLIX — VIP Detector v6
 * assets/js/pflix-vip.js
 * Inclua este script perto do </body>, em TODAS as páginas com anúncio.
 * NÃO inclua em planos.html
 *
 * IMPORTANTE: este arquivo depende do assets/js/pflix-guard.js, que precisa
 * estar incluído na PRIMEIRA linha do <head> (antes de tudo). O guard é quem
 * efetivamente bloqueia os anúncios desde o carregamento da página; este
 * arquivo apenas decide, mais tarde, se libera (não-VIP) ou mantém bloqueado
 * (VIP) — usando window.PFLIX_GUARD.liberar() / manterBloqueado().
 */
(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents';

  // Fallback de segurança: se por algum motivo o pflix-guard.js não foi
  // incluído na página, cria um stub pra não quebrar o restante do código
  // (mas sem a proteção real — por isso é só um fallback de emergência).
  if (!window.PFLIX_GUARD) {
    console.warn('[PipocaFlix VIP] ⚠️ pflix-guard.js não encontrado! Inclua-o na primeira linha do <head>.');
    window.PFLIX_GUARD = { liberar: function(){}, manterBloqueado: function(){} };
  }

  // Expõe status VIP globalmente para outras partes do site usarem
  window.PipocaVIP = { ativo: false, plano: null };

  function matarAnuncios() {
    window.PipocaVIP.ativo = true;
    window.PFLIX_GUARD.manterBloqueado();

    // Bloqueia window.open (popunder)
    window.open = function(url) {
      if (url && (url.startsWith('/') || url.startsWith(location.origin))) {
        return window.__origOpen ? window.__origOpen(url) : null;
      }
      return null;
    };

    // Remove banner "apoio 30min" se já estiver na tela
    var sb = document.getElementById('supportBannerOverlay');
    if (sb) sb.remove();

    document.body && document.body.classList.add('pflix-vip-ativo');
    console.log('[PipocaFlix VIP] ✅ Anúncios desativados (VIP confirmado)');

    document.dispatchEvent(new CustomEvent('pflix:vip-ativo', { detail: { plano: window.PipocaVIP.plano } }));
  }

  function liberarAnuncios() {
    window.PFLIX_GUARD.liberar();
    console.log('[PipocaFlix VIP] ℹ️ Usuário não-VIP — anúncios liberados');
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
      // Erro de rede: mantém bloqueado por precaução
      return { ativo: true, plano: null };
    }
  }

  // ─── Lógica principal ───
  async function checarVip(email) {
    var cached = verificarCacheLocal(email);

    if (cached !== null) {
      window.PipocaVIP.plano = cached.plano || null;
      if (cached.is_vip === true) matarAnuncios();
      else liberarAnuncios();
      return;
    }

    var resultado = await verificarVipFirestore(email);
    salvarCacheLocal(email, resultado.ativo, resultado.plano);
    window.PipocaVIP.plano = resultado.plano;

    if (resultado.ativo) matarAnuncios();
    else liberarAnuncios();
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
        if (u && u.email) checarVip(u.email.toLowerCase().trim());
        else usuarioNaoLogado();
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
        if (u && u.email) checarVip(u.email.toLowerCase().trim());
        else usuarioNaoLogado();
      });
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aguardarAuth);
  } else {
    aguardarAuth();
  }
})();
