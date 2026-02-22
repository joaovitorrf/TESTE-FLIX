/**
 * PIPOCAFLIX - security.js v3
 * Psychological Shield (Stable Version)
 */

(function () {
  'use strict';

  let securityTriggered = false;

  function blockAccess(message) {
    if (securityTriggered) return;
    securityTriggered = true;

    document.body.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        height:100vh;
        background:#000;
        color:#fff;
        font-family:sans-serif;
        text-align:center;
        padding:20px;">
        <div>
          <h1>⚠️ Acesso Bloqueado</h1>
          <p>${message}</p>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════
     🔒 BLOQUEIOS DE INTERAÇÃO
  ═══════════════════════════════ */

  // Bloquear clique direito
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Bloquear seleção total
  document.addEventListener('selectstart', e => e.preventDefault());

  // Bloquear drag de mídia
  document.addEventListener('dragstart', function (e) {
    if (['IMG', 'VIDEO'].includes(e.target.tagName)) {
      e.preventDefault();
    }
  });

  // Bloquear atalhos
  document.addEventListener('keydown', function (e) {

    const key = e.key.toLowerCase();

    // F12
    if (key === 'f12') return e.preventDefault();

    // Ctrl
    if (e.ctrlKey) {

      const blockedKeys = ['u','s','p','c','v','a'];

      if (blockedKeys.includes(key)) {
        e.preventDefault();
        return false;
      }

      // Ctrl + Shift + I/J/C
      if (e.shiftKey && ['i','j','c'].includes(key)) {
        e.preventDefault();
        return false;
      }
    }

  });

  // Bloquear botão esquerdo apenas se clicar 3 vezes rápido (anti spam inspect)
  let clickCount = 0;
  document.addEventListener('click', function () {
    clickCount++;
    setTimeout(() => clickCount = 0, 800);

    if (clickCount >= 5) {
      blockAccess("Comportamento suspeito detectado.");
    }
  });

  /* ═══════════════════════════════
     🧠 DEVTOOLS DETECTION
  ═══════════════════════════════ */

  function detectDevTools() {

    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;

    if (widthDiff > threshold || heightDiff > threshold) {
      blockAccess("Ferramentas de desenvolvedor detectadas.");
    }

    const start = performance.now();
    debugger;
    const end = performance.now();

    if (end - start > 120) {
      blockAccess("Depuração não permitida.");
    }
  }

  setInterval(detectDevTools, 2000);

  /* ═══════════════════════════════
     🚫 ANTI ADBLOCK (FIXED)
  ═══════════════════════════════ */

  function detectAdBlock() {

    const bait = document.createElement('div');
    bait.className = 'ad ads ad-banner adsbox';
    bait.style.position = 'absolute';
    bait.style.height = '10px';
    bait.style.width = '10px';
    bait.style.left = '-999px';
    bait.style.top = '-999px';

    document.body.appendChild(bait);

    setTimeout(() => {

      const isBlocked = (
        !bait ||
        bait.offsetParent === null ||
        bait.offsetHeight === 0 ||
        bait.clientHeight === 0
      );

      bait.remove();

      if (isBlocked) {
        blockAccess("AdBlock detectado. Desative para continuar.");
      }

    }, 200);
  }

  window.addEventListener('load', function () {
    setTimeout(detectAdBlock, 500);
  });

  /* ═══════════════════════════════
     🧨 CONSOLE PSICOLÓGICO
  ═══════════════════════════════ */

  setTimeout(() => {
    console.log("%cPARE.", "color:red;font-size:40px;font-weight:bold;");
    console.log("%cEste sistema é protegido.", "color:#aaa;font-size:14px;");
  }, 800);

})();
