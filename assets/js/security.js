/**
 * PIPOCAFLIX - security.js v2
 * Psychological Protection Layer
 */

(function () {
  'use strict';

  /* ═══════════════════════════════
     🔒 BLOQUEIOS BÁSICOS
  ═══════════════════════════════ */

  // Disable right click
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Disable selection outside inputs
  document.addEventListener('selectstart', function (e) {
    if (!e.target.closest('input, textarea, [contenteditable="true"]')) {
      e.preventDefault();
    }
  });

  // Disable drag of media
  document.addEventListener('dragstart', function (e) {
    if (['IMG', 'VIDEO'].includes(e.target.tagName)) {
      e.preventDefault();
    }
  });

  // Block critical shortcuts
  document.addEventListener('keydown', function (e) {

    const key = e.key.toLowerCase();

    // F12
    if (key === 'f12') return e.preventDefault();

    // Ctrl combinations
    if (e.ctrlKey) {
      const blocked = ['u', 's', 'p'];
      if (blocked.includes(key)) return e.preventDefault();

      // Ctrl + A outside inputs
      if (key === 'a' && 
          !e.target.closest('input, textarea, [contenteditable="true"]')) {
        return e.preventDefault();
      }
    }

    // Ctrl + Shift + I/J/C
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) {
      return e.preventDefault();
    }

  });

  /* ═══════════════════════════════
     🧠 DEVTOOLS DETECTION
  ═══════════════════════════════ */

  let devToolsTriggered = false;

  function triggerSecurityAction() {
    if (devToolsTriggered) return;
    devToolsTriggered = true;

    document.body.innerHTML = '';
    window.location.replace("https://www.google.com");
  }

  // Size detection
  function detectBySize() {
    const threshold = 150;
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;

    if (widthDiff > threshold || heightDiff > threshold) {
      triggerSecurityAction();
    }
  }

  // Debugger trap
  function detectByDebugger() {
    const start = performance.now();
    debugger;
    const end = performance.now();

    if (end - start > 100) {
      triggerSecurityAction();
    }
  }

  setInterval(() => {
    detectBySize();
    detectByDebugger();
  }, 2000);

  /* ═══════════════════════════════
     🚫 ANTI ADBLOCK
  ═══════════════════════════════ */

  function detectAdBlock() {
    const bait = document.createElement('div');
    bait.className = 'adsbox ad-banner ad-unit ad-container';
    bait.style.position = 'absolute';
    bait.style.left = '-999px';
    document.body.appendChild(bait);

    setTimeout(() => {
      if (!bait.offsetHeight) {
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
              <h1>⚠️ AdBlock Detectado</h1>
              <p>Desative o bloqueador de anúncios para continuar.</p>
            </div>
          </div>
        `;
      }
      bait.remove();
    }, 150);
  }

  window.addEventListener("load", detectAdBlock);

  /* ═══════════════════════════════
     🧨 CONSOLE TRAP
  ═══════════════════════════════ */

  setTimeout(() => {
    console.log(
      "%cPARE.",
      "color:red;font-size:40px;font-weight:bold;"
    );
    console.log(
      "%cEste sistema é protegido. Qualquer tentativa de engenharia reversa pode resultar em bloqueio.",
      "font-size:14px;color:#999;"
    );
  }, 1000);

  // Silenciar console
  ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    console[method] = function () {};
  });

})();
