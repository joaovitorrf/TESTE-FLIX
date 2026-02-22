/**
 * PIPOCAFLIX - security.js
 * Anti-DevTools | Anti-Copy | Anti-Debug | Anti-Source
 */

(function() {
  'use strict';

  /* ── Disable right-click ── */
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });

  /* ── Disable select ── */
  document.addEventListener('selectstart', function(e) {
    if (!e.target.matches('input, textarea, [contenteditable]')) {
      e.preventDefault();
    }
  });

  /* ── Bloquear teclas críticas ── */
  document.addEventListener('keydown', function(e) {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return false; }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && ['I','J','C','i','j','c'].includes(e.key)) {
      e.preventDefault(); return false;
    }
    // Ctrl+U (view source)
    if (e.ctrlKey && ['U','u'].includes(e.key)) {
      e.preventDefault(); return false;
    }
    // Ctrl+S (save)
    if (e.ctrlKey && ['S','s'].includes(e.key)) {
      e.preventDefault(); return false;
    }
    // Ctrl+A (select all) - only on non-inputs
    if (e.ctrlKey && ['A','a'].includes(e.key) &&
        !e.target.matches('input, textarea, [contenteditable]')) {
      e.preventDefault(); return false;
    }
  });

  /* ── Detectar DevTools abertas via debugger ── */
  var devtoolsOpen = false;

  function detectDevTools() {
    var threshold = 160;
    var widthDiff  = window.outerWidth  - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;

    if (widthDiff > threshold || heightDiff > threshold) {
      if (!devtoolsOpen) {
        devtoolsOpen = true;
        handleDevTools();
      }
    } else {
      devtoolsOpen = false;
    }
  }

  function handleDevTools() {
    // Limpa console
    console.clear();
    // Redireciona para home suavemente
    try { history.go(0); } catch(e) {}
  }

  // Verifica periodicamente
  setInterval(detectDevTools, 1000);

  /* ── Anti-debug trap no console ── */
  var consoleMethods = ['log','warn','error','info','debug','dir','table'];
  consoleMethods.forEach(function(method) {
    var original = console[method];
    console[method] = function() {
      // Permite erros internos passarem silenciosamente
    };
  });

  /* ── Ofusca dados sensíveis do DOM ── */
  // Observa tentativas de inspecionar elementos de vídeo
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            // Remove atributos src expostos em iframes não-autorizados
            if (node.tagName === 'IFRAME' && 
                node.src && 
                !node.src.includes('youtube') && 
                !node.src.includes('youtu.be') &&
                !node.dataset.authorized) {
              // Não remove, apenas registra
            }
          }
        });
      });
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /* ── Proteção de drag-and-drop de imagens ── */
  document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') {
      e.preventDefault();
    }
  });

  /* ── Console warning ── */
  setTimeout(function() {
    var style1 = 'font-size:30px;font-weight:bold;color:red;';
    var style2 = 'font-size:15px;color:#555;';
    // Mensagem de aviso para engenheiros curiosos
  }, 500);

})();
