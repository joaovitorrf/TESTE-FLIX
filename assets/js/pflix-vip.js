/**
 * ═══════════════════════════════════════════════════════
 *  PIPOCAFLIX — VIP Ad Blocker
 *  Arquivo: assets/js/pflix-vip.js
 *
 *  Como usar: adicione em TODAS as páginas que têm anúncio,
 *  logo antes do </body>:
 *
 *  <script src="assets/js/pflix-vip.js"></script>
 *
 *  Funciona sozinho — detecta o Firebase já carregado na página.
 * ═══════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

  // ── Seletores dos elementos de anúncio ──
  // Adicione aqui qualquer novo seletor de ad que aparecer
  const AD_SELECTORS = [
    '.ad-banner-wrap',
    '.mobile-banner-ad',
    '#mobileBannerAdNew',
  ];

  // ── Strings dos scripts de anúncio ──
  const AD_SCRIPT_KEYWORDS = [
    'simplisticpride.com',
    'sophisticatedpin.com',
    'sorrowfulpsychology.com',
  ];

  /** Esconde e desativa todos os elementos de anúncio */
  function matarAnuncios() {
    // 1. Esconde divs de anúncio
    AD_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.display = 'none';
        el.innerHTML = '';
      });
    });

    // 2. Bloqueia scripts de anúncio que ainda não carregaram
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.tagName === 'SCRIPT') {
            const src = node.src || node.textContent || '';
            if (AD_SCRIPT_KEYWORDS.some(kw => src.includes(kw))) {
              node.remove();
            }
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 3. Bloqueia popunder
    window.__pflix_vip__ = true;

    // 4. Marca body pra CSS (útil no futuro)
    document.body.classList.add('pflix-vip-ativo');

    console.log('[PipocaFlix VIP] ✅ Anúncios desativados');
  }

  /** Consulta o Firestore via REST e verifica se o email tem VIP ativo */
  async function verificarVipFirestore(email) {
    const emailKey = email.replace(/[.#$[\]]/g, '_');
    const url = `${FS_BASE}/vip/${emailKey}?key=${FIREBASE_API_KEY}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return false; // Documento não existe = não é VIP

      const data = await res.json();
      const vipAte = data?.fields?.vip_ate?.stringValue;
      if (!vipAte) return false;

      const expira = new Date(vipAte);
      const agora  = new Date();

      if (expira > agora) {
        const diasRestantes = Math.ceil((expira - agora) / (1000 * 60 * 60 * 24));
        console.log(`[PipocaFlix VIP] Plano ativo por mais ${diasRestantes} dias`);
        return true;
      }

      console.log('[PipocaFlix VIP] Plano expirado em', vipAte);
      return false;
    } catch (err) {
      console.warn('[PipocaFlix VIP] Erro ao verificar Firestore:', err.message);
      return false;
    }
  }

  /** Verifica VIP no localStorage (cache de 1h pra não bater Firestore em toda página) */
  function verificarCacheLocal(email) {
    try {
      const raw = localStorage.getItem('pflix_vip_cache');
      if (!raw) return null;

      const cache = JSON.parse(raw);
      if (cache.email !== email) return null; // email trocou, ignora cache

      const cacheExp = new Date(cache.cache_ate);
      if (new Date() > cacheExp) return null; // cache expirou

      return cache.is_vip; // true ou false
    } catch {
      return null;
    }
  }

  /** Salva resultado no localStorage por 1 hora */
  function salvarCacheLocal(email, isVip) {
    try {
      const cacheAte = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
      localStorage.setItem('pflix_vip_cache', JSON.stringify({
        email,
        is_vip: isVip,
        cache_ate: cacheAte,
      }));
    } catch {}
  }

  /** Fluxo principal */
  async function iniciar() {
    // Espera o Firebase Auth carregar (está em module no index.html)
    // Fica tentando por até 5 segundos
    let user = null;
    for (let i = 0; i < 20; i++) {
      user = window.PipocaAuth?.getUser?.();
      if (user) break;
      await new Promise(r => setTimeout(r, 250));
    }

    if (!user?.email) {
      // Não logado = vê anúncios normalmente
      return;
    }

    const email = user.email.toLowerCase().trim();

    // 1. Verifica cache local primeiro (rápido, sem rede)
    const cached = verificarCacheLocal(email);
    if (cached === true) {
      matarAnuncios();
      return;
    }
    if (cached === false) {
      return; // Sabe que não é VIP, não precisa bater Firestore
    }

    // 2. Cache expirado ou inexistente → bate no Firestore
    const isVip = await verificarVipFirestore(email);
    salvarCacheLocal(email, isVip);

    if (isVip) matarAnuncios();
  }

  // Roda quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})();
