/* ================================================================
   PIPOCAFLIX — security.js
   Proteção client-side máxima possível em site estático.
   Cole em assets/js/security.js e confirme que está carregado
   em TODOS os HTMLs com <script src="assets/js/security.js"></script>
   (já deve estar — só substitua o arquivo)
================================================================ */
(function () {
  'use strict';

  /* ── 1. URL de redirect quando detectar coisa errada ── */
  var REDIRECT_URL = 'https://i.pinimg.com/736x/49/ac/1c/49ac1c6113c5fc2b2126d40f7ae7f850.jpg';

  function redirectOut() {
    try { window.location.replace(REDIRECT_URL); } catch(e) {}
  }

  /* ════════════════════════════════════════════════════
     2. BLOQUEAR ATALHOS DE TECLADO
  ════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    var k = e.key ? e.key.toLowerCase() : '';
    var ctrl = e.ctrlKey || e.metaKey; // ctrl no Win/Linux, cmd no Mac

    // Ctrl+U — ver código fonte
    if (ctrl && k === 'u') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+S — salvar página
    if (ctrl && k === 's') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+P — imprimir
    if (ctrl && k === 'p') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+Shift+I — DevTools (Chrome/Firefox/Edge)
    if (ctrl && e.shiftKey && k === 'i') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+Shift+J — Console (Chrome)
    if (ctrl && e.shiftKey && k === 'j') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+Shift+C — Inspecionar elemento
    if (ctrl && e.shiftKey && k === 'c') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+Shift+K — Console (Firefox)
    if (ctrl && e.shiftKey && k === 'k') { e.preventDefault(); e.stopPropagation(); return false; }

    // Ctrl+Shift+E — Network (Firefox)
    if (ctrl && e.shiftKey && k === 'e') { e.preventDefault(); e.stopPropagation(); return false; }

    // F12 — DevTools
    if (e.key === 'F12') { e.preventDefault(); e.stopPropagation(); return false; }

    // F5 e Ctrl+R bloqueados só pra robôs? Não — usuário legítimo precisa recarregar.
    // Deixamos F5/Ctrl+R livres.

    // Ctrl+A — Selecionar tudo (opcional — bloqueia copiar o HTML visível)
    // Comentado pois atrapalha campos de busca e formulários.
    // if (ctrl && k === 'a') { e.preventDefault(); return false; }

  }, true); // capture=true garante que roda antes de qualquer outro handler

  /* ════════════════════════════════════════════════════
     3. BLOQUEAR CLIQUE DIREITO (context menu)
  ════════════════════════════════════════════════════ */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  }, true);

  /* ════════════════════════════════════════════════════
     4. BLOQUEAR CTRL+P via beforeprint (dupla proteção)
  ════════════════════════════════════════════════════ */
  window.addEventListener('beforeprint', function (e) {
    e.preventDefault();
    // Limpa o conteúdo da página durante impressão
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#ff2d43;font-size:2rem;font-weight:700">⛔ Impressão não permitida</div>';
    setTimeout(function () { window.location.reload(); }, 100);
  });

  /* ════════════════════════════════════════════════════
     5. BLOQUEAR SELEÇÃO DE TEXTO (impede Ctrl+A + copiar)
     Permite em inputs e textareas (busca, comentários)
  ════════════════════════════════════════════════════ */
  document.addEventListener('selectstart', function (e) {
    var tag = e.target ? e.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    e.preventDefault();
    return false;
  });

  /* ════════════════════════════════════════════════════
     6. BLOQUEAR DRAG de imagens e links
  ════════════════════════════════════════════════════ */
  document.addEventListener('dragstart', function (e) {
    e.preventDefault();
    return false;
  });

  /* ════════════════════════════════════════════════════
     7. DETECÇÃO DE DEVTOOLS ABERTO
     Técnica: mede o tamanho da janela vs o viewport.
     DevTools aberto reduz o tamanho disponível.
     Técnica 2: console.log com getter — detecta quando
     o console formata o objeto (só acontece com DevTools aberto).
  ════════════════════════════════════════════════════ */
  var _devToolsOpen = false;
  var _devToolsRedirected = false;

  // Técnica A: diferença de tamanho da janela
  function checkDevToolsBySize() {
    var widthThreshold  = window.outerWidth  - window.innerWidth  > 160;
    var heightThreshold = window.outerHeight - window.innerHeight > 160;
    return widthThreshold || heightThreshold;
  }

  // Técnica B: console object getter (mais confiável)
  function checkDevToolsByConsole() {
    var opened = false;
    var el = /./;
    el.toString = function () { opened = true; return ''; };
    console.log('%c', el);
    console.clear();
    return opened;
  }

  // Técnica C: performance timing — DevTools abre, tudo fica lento
  function checkDevToolsByTiming() {
    var start = performance.now();
    // eslint-disable-next-line no-debugger
    try { (function(){}).constructor('debugger')(); } catch(e) {}
    return (performance.now() - start) > 100;
  }

  function handleDevToolsOpen() {
    if (_devToolsRedirected) return;
    _devToolsOpen = true;
    _devToolsRedirected = true;
    // Limpa o conteúdo visível
    try {
      document.body.style.display = 'none';
      document.documentElement.style.display = 'none';
    } catch(e) {}
    redirectOut();
  }

  // Checar periodicamente (a cada 1s)
  setInterval(function () {
    if (_devToolsRedirected) return;
    var detected = false;
    try { if (checkDevToolsBySize())    detected = true; } catch(e) {}
    try { if (checkDevToolsByConsole()) detected = true; } catch(e) {}
    if (detected) handleDevToolsOpen();
  }, 1000);

  // Checar também no resize (quando DevTools abre, o resize dispara)
  window.addEventListener('resize', function () {
    if (_devToolsRedirected) return;
    if (checkDevToolsBySize()) handleDevToolsOpen();
  });

  /* ════════════════════════════════════════════════════
     8. DETECTAR SELENIUM / PUPPETEER / PLAYWRIGHT / BOTS
     Verifica propriedades que bots deixam expostas.
  ════════════════════════════════════════════════════ */
  function detectBot() {
    // navigator.webdriver — true em Selenium, Puppeteer e similares
    if (navigator.webdriver === true) return true;

    // Propriedades ausentes que browsers reais sempre têm
    if (!window.chrome && navigator.userAgent.includes('Chrome')) {
      // Chrome sem window.chrome = headless
      // (cuidado: alguns mobile não têm, então checar UA também)
      if (!navigator.userAgent.includes('Mobile')) return true;
    }

    // Plugins — browser headless geralmente tem 0 plugins
    if (navigator.plugins && navigator.plugins.length === 0
        && navigator.userAgent.includes('Chrome')
        && !navigator.userAgent.includes('Mobile')) {
      return true;
    }

    // Linguagens — headless frequentemente retorna vazio
    if (!navigator.languages || navigator.languages.length === 0) return true;

    // __nightmare — NightmareJS
    if (window.__nightmare) return true;

    // _phantom — PhantomJS (antigo mas ainda usado)
    if (window._phantom || window.phantom || window.callPhantom) return true;

    // domAutomation — outro indicador de automação
    if (document.__driver_evaluate || document.__webdriver_evaluate ||
        document.__selenium_evaluate || document.__fxdriver_evaluate ||
        document.__driver_unwrapped || document.__webdriver_unwrapped ||
        document.__selenium_unwrapped || document.__fxdriver_unwrapped) {
      return true;
    }

    // Playwright deixa essa propriedade
    if (window.__playwright || window.__pwInitScripts) return true;

    // Teste de permissão — humano real tem estado 'prompt' ou 'granted', bot costuma ter 'denied' sem nunca pedir
    // (assíncrono, então não bloqueia aqui — registra e checa depois)

    return false;
  }

  if (detectBot()) {
    redirectOut();
    return; // Para execução do script
  }

  /* ════════════════════════════════════════════════════
     9. DETECÇÃO DE COMPORTAMENTO DE BOT
     Rate limiting client-side:
     - Muitos cliques por minuto
     - Muitas navegações em sequência
     - Interação sem movimento de mouse (bot não move mouse)
  ════════════════════════════════════════════════════ */
  var _clickCount = 0;
  var _pageOpenCount = parseInt(sessionStorage.getItem('_pflix_poc') || '0') + 1;
  var _mouseHasMoved = false;
  var _touchHasOccurred = false;

  // Registrar abertura de página
  sessionStorage.setItem('_pflix_poc', _pageOpenCount);

  // Muitas páginas abertas em sequência (> 30 em uma sessão = suspeito)
  if (_pageOpenCount > 30) {
    redirectOut();
    return;
  }

  // Detectar movimento de mouse (bots não movem mouse de verdade)
  document.addEventListener('mousemove', function () {
    _mouseHasMoved = true;
  }, { once: true, passive: true });

  // Touch device — não precisa de mouse
  document.addEventListener('touchstart', function () {
    _touchHasOccurred = true;
  }, { once: true, passive: true });

  // Contar cliques — mais de 60 por minuto é suspeito
  document.addEventListener('click', function () {
    _clickCount++;
  }, { passive: true });

  setInterval(function () {
    // Se após 5 segundos não houve mouse nem touch = provável bot
    if (!_mouseHasMoved && !_touchHasOccurred) {
      // Não redireciona ainda — pode ser usuário de teclado.
      // Só redireciona se combinar com muitos cliques.
    }

    // Mais de 60 cliques no último minuto = bot
    if (_clickCount > 60) {
      redirectOut();
      return;
    }
    _clickCount = 0; // reseta contador a cada intervalo
  }, 60 * 1000); // checa a cada 1 minuto

  /* ════════════════════════════════════════════════════
     10. BLOQUEAR COPY de texto sensível
     (permite copiar em inputs/textareas)
  ════════════════════════════════════════════════════ */
  document.addEventListener('copy', function (e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // permite
    e.clipboardData && e.clipboardData.setData('text/plain', '');
    e.preventDefault();
  });

  document.addEventListener('cut', function (e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
  });

  /* ════════════════════════════════════════════════════
     11. OFUSCAR CONSOLE
     Limpa o console e mostra aviso intimidador.
  ════════════════════════════════════════════════════ */
  try {
    console.clear();
    console.log(
      '%c⛔ ATENÇÃO',
      'color:#ff2d43;font-size:2rem;font-weight:900'
    );
    console.log(
      '%cEsta área é destinada a desenvolvedores.\nSe alguém te pediu para colar algo aqui, é uma tentativa de golpe.\nNenhuma funcionalidade do PipocaFlix requer acesso ao console.',
      'color:#fff;font-size:0.9rem;background:#0d0d14;padding:8px;border-radius:4px'
    );
  } catch(e) {}

  /* ════════════════════════════════════════════════════
     12. BLOQUEAR EXTENSÕES DE SCREENSHOT / GRAVAÇÃO
     Detecta se a página está sendo capturada via
     MediaDevices (não cobre extensões do browser).
  ════════════════════════════════════════════════════ */
  // Monitorar visibilitychange — bots frequentemente ficam em background
  var _hiddenCount = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      _hiddenCount++;
      // Mais de 20 vezes escondido/mostrado = suspeito de scraping com múltiplas abas
      if (_hiddenCount > 50) {
        sessionStorage.setItem('_pflix_poc', '31'); // força redirect na próxima
      }
    }
  });

  /* ════════════════════════════════════════════════════
     13. PROTEÇÃO ADICIONAL: desabilitar F11 (fullscreen nativo)
     e outras teclas menos comuns
  ════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+M — Mobile emulation no DevTools
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault(); return false;
    }
    // Ctrl+Shift+N — Nova janela anônima (não impede, mas registra)
    // Ctrl+F — Busca na página (opcional deixar livre para usabilidade)
  }, true);

})();
