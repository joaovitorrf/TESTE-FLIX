/**
 * PIPOCAFLIX — VIP Detector v7
 * assets/js/pflix-vip.js
 *
 * Antes este arquivo tinha duas funções: (1) decidir quem é VIP e (2) esconder
 * anúncio de quem for VIP (via window.PFLIX_GUARD). Agora que o site não tem
 * NENHUM anúncio (pra ninguém, VIP ou não), a função (2) inteira saiu daqui.
 * Sobrou só a (1): decidir e avisar o resto do site quem é VIP.
 *
 * O resto do site (acesso-vip.js, stats.js, conta.js, perfil.html…)
 * continua funcionando igual, porque a API pública não mudou:
 *   window.PipocaVIP = { ativo, plano, pronto, erro }
 *   eventos: "pflix:vip-checado" (sempre, quando termina) e "pflix:vip-ativo" (só se VIP)
 *
 * Inclua perto do </body>, em qualquer página (não precisa mais vir depois de
 * nenhum "guard" no <head> — isso não existe mais).
 */
(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents';

  // ativo/plano: status da assinatura. pronto: a checagem (cache ou Firestore) já terminou.
  // erro: a última checagem falhou por rede (Firestore fora do ar, sem internet etc.) —
  // quem decide o que fazer nesse caso (bloquear ou liberar) é quem lê essa flag, não aqui.
  window.PipocaVIP = { ativo: false, plano: null, pronto: false, erro: false };

  function marcarPronto() {
    window.PipocaVIP.pronto = true;
    document.dispatchEvent(new CustomEvent('pflix:vip-checado', {
      detail: { ativo: window.PipocaVIP.ativo, plano: window.PipocaVIP.plano, erro: window.PipocaVIP.erro }
    }));
  }

  function confirmarVip() {
    window.PipocaVIP.ativo = true;
    document.body && document.body.classList.add('pflix-vip-ativo');
    console.log('[PipocaFlix VIP] ✅ Assinatura VIP confirmada');
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
    } catch (e) { return null; }
  }

  function salvarCacheLocal(email, ativo, plano) {
    try {
      localStorage.setItem('pflix_vip_cache', JSON.stringify({
        email: email,
        is_vip: ativo,
        plano: plano,
        cache_ate: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }));
    } catch (e) {}
  }

  // ─── Consulta Firestore ───
  async function verificarVipFirestore(email) {
    var emailKey = email.replace(/[.#$[\]]/g, '_');
    var url = FS_BASE + '/vip/' + emailKey + '?key=' + FIREBASE_API_KEY;
    try {
      var res = await fetch(url);
      if (res.status === 404) return { ativo: false, plano: null, erro: false };
      if (!res.ok) return { ativo: false, plano: null, erro: true };
      var data = await res.json();
      var vipAte = data && data.fields && data.fields.vip_ate && data.fields.vip_ate.stringValue;
      var plano = data && data.fields && data.fields.plano && data.fields.plano.stringValue;
      if (!vipAte) return { ativo: false, plano: null, erro: false };
      return { ativo: new Date(vipAte) > new Date(), plano: plano || 'gold', erro: false };
    } catch (e) {
      // Erro de rede de verdade (sem internet, Firestore fora do ar): NÃO sabemos se é VIP.
      // Antigamente isso assumia "é VIP" (só pra não mostrar anúncio à toa). Agora que o site
      // inteiro é pago, isso seria dar acesso de graça em qualquer instabilidade — por isso
      // agora assume ativo:false + erro:true, e quem decide travar a tela é o gate (acesso-vip.js).
      return { ativo: false, plano: null, erro: true };
    }
  }

  // ─── Lógica principal ───
  async function checarVip(email) {
    var cached = verificarCacheLocal(email);
    if (cached !== null) {
      window.PipocaVIP.plano = cached.plano || null;
      window.PipocaVIP.erro = false;
      if (cached.is_vip === true) confirmarVip();
      marcarPronto();
      return;
    }

    var resultado = await verificarVipFirestore(email);
    window.PipocaVIP.erro = !!resultado.erro;
    if (!resultado.erro) salvarCacheLocal(email, resultado.ativo, resultado.plano); // erro de rede não vira cache
    window.PipocaVIP.plano = resultado.plano;

    if (resultado.ativo) confirmarVip();
    marcarPronto();
  }

  function usuarioNaoLogado() {
    window.PipocaVIP.ativo = false;
    window.PipocaVIP.erro = false;
    marcarPronto();
  }

  function aguardarAuth() {
    var user = window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser();
    if (user && user.email) {
      checarVip(user.email.toLowerCase().trim());
      return;
    }
    if (window.PipocaAuth && window.PipocaAuth.onAuthChanged) {
      window.PipocaAuth.onAuthChanged(function (u) {
        if (u && u.email) checarVip(u.email.toLowerCase().trim());
        else usuarioNaoLogado();
      });
      return;
    }
    var tentativas = 0;
    var intervalo = setInterval(function () {
      tentativas++;
      if (tentativas > 60) {
        clearInterval(intervalo);
        usuarioNaoLogado();
        return;
      }
      var auth = window.PipocaAuth;
      if (!auth || !auth.onAuthChanged) return;
      clearInterval(intervalo);
      auth.onAuthChanged(function (u) {
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
