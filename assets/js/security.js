/**
 * PIPOCAFLIX - security.js
 * Proteção básica sem prejudicar usuários legítimos
 */

(function () {
  'use strict';

  /* ── Domínio permitido ── */
  const ALLOWED = "www.pipocaflix.fun";
  const REDIRECT = "https://www.google.com";

  let triggered = false;

  function triggerSecurity(reason) {
    if (triggered) return;
    triggered = true;
    console.warn('[PipocaFlix] Acesso bloqueado:', reason);
    window.location.replace(REDIRECT);
  }

  /* ── Bloqueia domínio errado (cópia/embed em outro site) ── */
  if (location.hostname !== ALLOWED) {
    triggerSecurity("domain");
  }

  /* ── Bloqueia iframe (embedding em outro site) ── */
  if (window.top !== window.self) {
    triggerSecurity("iframe");
  }

  /* ── Bloqueia bots/headless conhecidos ── */
  if (
    navigator.webdriver ||
    /Headless|PhantomJS|Selenium|Puppeteer/i.test(navigator.userAgent)
  ) {
    triggerSecurity("bot");
  }

  /* ── Bloqueia botão direito ── */
  document.addEventListener('contextmenu', e => e.preventDefault());

  /* ── Bloqueia drag de elementos ── */
  document.addEventListener('dragstart', e => e.preventDefault());

  /* ── Bloqueia só os atalhos de DevTools ── */
  /* (sem bloquear F5, Ctrl+R, Ctrl+S que são ações normais do usuário) */
  document.addEventListener('keydown', function (e) {
    const key = e.key.toLowerCase();

    // F12
    if (key === 'f12') { e.preventDefault(); return; }

    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
    if (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(key)) {
      e.preventDefault();
      return;
    }

    // Ctrl+U (ver código fonte)
    if (e.ctrlKey && key === 'u') {
      e.preventDefault();
      return;
    }
  });

  /* ── Console warning (dissuasivo) ── */
  setTimeout(() => {
    console.log(
      "%cPARE!",
      "color:red;font-size:48px;font-weight:bold;"
    );
    console.log(
      "%cEsta área é restrita. Tentativas de extrair conteúdo violam os termos de uso.",
      "color:#ff4444;font-size:14px;"
    );
  }, 800);

})();
