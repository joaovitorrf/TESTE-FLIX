/* ================================================================
   PIPOCAFLIX — security.js v3
   Corrige falsos positivos de redirecionamento (PC e mobile) trocando
   a detecção de DevTools por dimensão de janela (instável — disparava
   com zoom, teclado virtual, rotação de tela, barras do navegador)
   por uma técnica que só "acerta" quando o painel de DevTools está
   de fato aberto e ativo.
================================================================ */
(function () {
  'use strict';

  var REDIRECT_URL = 'https://i.pinimg.com/736x/49/ac/1c/49ac1c6113c5fc2b2126d40f7ae7f850.jpg';
  var _redirected = false;

  function redirectOut() {
    if (_redirected) return;
    _redirected = true;
    try {
      document.body.style.display = 'none';
      window.location.replace(REDIRECT_URL);
    } catch(e) {}
  }

  /* ── 1. ATALHOS DE TECLADO ── */
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && k === 'u') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && k === 's') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && k === 'p') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && e.shiftKey && k === 'i') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && e.shiftKey && k === 'j') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && e.shiftKey && k === 'c') { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && e.shiftKey && k === 'k') { e.preventDefault(); e.stopPropagation(); return false; }
    if (e.key === 'F12') { e.preventDefault(); e.stopPropagation(); return false; }
  }, true);

  /* ── 2. CLIQUE DIREITO ── */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  }, true);

  /* ── 3. IMPRESSÃO ── */
  window.addEventListener('beforeprint', function () {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#ff2d43;font-size:2rem;font-weight:700">⛔ Impressão não permitida</div>';
  });

  /* ── 4. SELEÇÃO DE TEXTO ── */
  document.addEventListener('selectstart', function (e) {
    var tag = (e.target || {}).tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    e.preventDefault();
    return false;
  });

  /* ── 5. DRAG ── */
  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
    return false;
  });

  /* ── 6. COPY/CUT ── */
  document.addEventListener('copy', function (e) {
    var tag = (document.activeElement || {}).tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
  });
  document.addEventListener('cut', function (e) {
    var tag = (document.activeElement || {}).tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
  });

  /* ── 7. DETECÇÃO DE DEVTOOLS (v3 — técnica do toString, não por tamanho) ──
     A técnica antiga media outerWidth/innerWidth, que varia demais em
     mobile (teclado virtual, rotação, barra de endereço escondendo) e em
     PC (zoom, extensões, painéis), causando redirecionamentos aleatórios
     mesmo com o DevTools fechado.

     A nova técnica usa um objeto cujo toString() é chamado pelo motor de
     formatação do DevTools sempre que o console.log roda — mas SÓ quando
     o painel Console está de fato aberto. Com o DevTools fechado, o
     navegador nem chega a formatar o argumento, então o toString() nunca
     executa. Não depende de tamanho de janela, então não tem falso
     positivo por zoom, teclado virtual, rotação ou barra de navegador.
     Em mobile, o DevTools normalmente só abre via cabo (remote debugging),
     então na prática isso fica restrito ao cenário real de inspeção. */
  var _devtoolsAberto = false;
  var _sonda = {
    toString: function () {
      _devtoolsAberto = true;
      return '';
    }
  };

  var _checksConsecutivos = 0;
  setInterval(function () {
    if (_redirected) return;
    _devtoolsAberto = false;
    try {
      console.log('%s', _sonda);
    } catch (e) {}

    if (_devtoolsAberto) {
      _checksConsecutivos++;
      // Exige 2 detecções seguidas (≈3s) pra confirmar, evitando qualquer
      // resíduo de falso positivo pontual.
      if (_checksConsecutivos >= 2) redirectOut();
    } else {
      _checksConsecutivos = 0;
    }
  }, 1500);

  /* ── 8. DETECÇÃO DE BOTS (navigator.webdriver etc) ── */
  function detectBot() {
    if (navigator.webdriver === true) return true;
    if (window.__nightmare) return true;
    if (window._phantom || window.phantom || window.callPhantom) return true;
    if (window.__playwright || window.__pwInitScripts) return true;
    if (document.__driver_evaluate || document.__webdriver_evaluate ||
        document.__selenium_evaluate) return true;
    if (!navigator.languages || navigator.languages.length === 0) return true;
    return false;
  }

  if (detectBot()) {
    redirectOut();
    return;
  }

  /* ── 9. RATE LIMITING: muitas páginas na sessão ── */
  var _poc = parseInt(sessionStorage.getItem('_pf_pc') || '0') + 1;
  sessionStorage.setItem('_pf_pc', _poc);
  if (_poc > 40) { redirectOut(); return; }

  /* ── 10. RATE LIMITING: muitos cliques por minuto ── */
  var _clicks = 0;
  document.addEventListener('click', function () { _clicks++; }, { passive: true });
  setInterval(function () {
    if (_clicks > 80) { redirectOut(); return; }
    _clicks = 0;
  }, 60000);

  /* ── 11. CONSOLE WARNING ── */
  try {
    console.clear();
    console.log('%c⛔ ATENÇÃO', 'color:#ff2d43;font-size:2rem;font-weight:900');
    console.log('%cEsta área é para desenvolvedores.\nSe alguém pediu pra colar algo aqui, é golpe.\nNenhuma função do PipocaFlix requer o console.', 'color:#fff;font-size:0.9rem;background:#0d0d14;padding:8px;border-radius:4px');
  } catch(e) {}

})();
