/**
 * PIPOCAFLIX — Security / Anti-Scraping básico
 * assets/js/security.js
 *
 * Proteção BÁSICA contra scraping automatizado. Não é infalível (nenhuma
 * proteção client-side é), mas dificulta bots simples e scrapers rodando
 * headless browser sem disfarce.
 *
 * O que faz:
 *   1. Detecta sinais comuns de headless browser / automação
 *      (Puppeteer, Selenium, PhantomJS, navigator.webdriver, etc).
 *      Se detectado, interrompe o carregamento do conteúdo da página.
 *   2. Limita a taxa de requisições feitas via fetch() para os endpoints
 *      de dados do site (Sheets/Workers), dificultando scraping em massa
 *      via loop de requisições.
 *   3. Aviso no console pra quem abre o DevTools (informativo, não bloqueia
 *      usuários legítimos — é só uma camada a mais de "não mexe aqui").
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     1. Detecção de automação / headless browser
  ───────────────────────────────────────────── */
  function pareceAutomacao() {
    const nav = window.navigator;

    if (nav.webdriver === true) return true;
    if (window.callPhantom || window._phantom || window.__nightmare) return true;
    if (window.domAutomation || window.domAutomationController) return true;

    const semPlugins = nav.plugins && nav.plugins.length === 0;
    const semIdiomas = !nav.languages || nav.languages.length === 0;
    const chromeHeadlessUA = /HeadlessChrome/i.test(nav.userAgent);

    if (chromeHeadlessUA) return true;
    if (semPlugins && semIdiomas) return true;

    return false;
  }

  function bloquearConteudo() {
    const aviso = document.createElement('div');
    aviso.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0c0c10;' +
      'color:#c9c4d0;display:flex;align-items:center;justify-content:center;' +
      'text-align:center;padding:24px;font-family:sans-serif;font-size:1rem;';
    aviso.textContent = 'Acesso automatizado detectado. Se você é uma pessoa real, acesse pelo navegador normalmente.';
    document.addEventListener('DOMContentLoaded', function () {
      document.body.appendChild(aviso);
      document.body.style.overflow = 'hidden';
    });
  }

  if (pareceAutomacao()) {
    bloquearConteudo();
  }

  /* ─────────────────────────────────────────────
     2. Rate limiting básico do fetch() para os
        endpoints de dados do site
  ───────────────────────────────────────────── */
  (function throttleFetch() {
    const ENDPOINT_KEYWORDS = ['workers.dev', 'googleapis.com', 'docs.google.com'];
    const MIN_INTERVAL_MS = 400;
    const ultimaChamada = {};

    const origFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const ehEndpointDeDados = ENDPOINT_KEYWORDS.some((k) => url.indexOf(k) !== -1);

        if (ehEndpointDeDados) {
          let host;
          try { host = new URL(url, location.href).hostname; } catch (e) { host = url; }

          const agora = Date.now();
          const ultima = ultimaChamada[host] || 0;
          const espera = MIN_INTERVAL_MS - (agora - ultima);

          if (espera > 0) {
            return new Promise((resolve) => {
              setTimeout(() => {
                ultimaChamada[host] = Date.now();
                resolve(origFetch(input, init));
              }, espera);
            });
          }
          ultimaChamada[host] = agora;
        }
      } catch (e) {}
      return origFetch(input, init);
    };
  })();

  /* ─────────────────────────────────────────────
     3. Aviso informativo no console
  ───────────────────────────────────────────── */
  try {
    console.log('%cPeraí!', 'color:#ff2d43;font-size:32px;font-weight:bold;');
    console.log(
      '%cSe alguém pediu pra você colar algo aqui pra "hackear conta" ou algo do tipo, é golpe. ' +
      'Este site é protegido — automações e scraping de conteúdo não são permitidos.',
      'font-size:14px;'
    );
  } catch (e) {}
})();
