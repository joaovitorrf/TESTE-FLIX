/**
 * PIPOCAFLIX — anúncios que só podem existir no COMPUTADOR
 * assets/js/pflix-ads-desktop.js
 *
 * ANTES: cada página tinha uma cópia do popunder com a checagem
 *        "User-Agent de celular OU janela < 768px". Isso falha em:
 *          • Chrome/Samsung Internet do celular em “Modo desktop”
 *            (UA de PC + janela de ~980px)  → o link direto disparava no celular;
 *          • iPad (o iPadOS finge ser Mac);
 *          • tablets em modo paisagem.
 *
 * AGORA: um único arquivo, usado por todas as páginas, com detecção ESTRITA.
 *        Só é “PC” quem passa em TODOS estes testes:
 *          1. o dispositivo tem mouse/trackpad de verdade  (pointer: fine + hover)
 *          2. o navegador NÃO se declara mobile (UA e userAgentData)
 *          3. não é iPad disfarçado de Mac (Mac + tela de toque)
 *          4. a TELA física é de computador (>= 1024px no lado maior e >= 600px no menor).
 *             Usamos screen.* e não a largura da janela, porque o “modo desktop” do
 *             celular aumenta a janela mas NÃO muda a tela.
 *
 * O QUE ELE FAZ (só no PC, e só se a pessoa não for VIP):
 *   • popunder do link direto no primeiro clique da página
 *   • o novo anúncio (vapid-size.com)
 *
 * window.PFLIX_IS_DESKTOP fica disponível pro resto do site.
 */
(function () {
  'use strict';

  function ehComputador() {
    try {
      var ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini|Silk|Kindle|webOS/i.test(ua)) return false;
      if (navigator.userAgentData && navigator.userAgentData.mobile) return false;
      if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return false;   // iPad
      var mm = window.matchMedia;
      if (!mm) return false;
      if (!mm('(pointer: fine)').matches || !mm('(hover: hover)').matches) return false;
      var maior = Math.max(screen.width || 0, screen.height || 0);
      var menor = Math.min(screen.width || 0, screen.height || 0);
      if (maior < 1024 || menor < 600) return false;
      return true;
    } catch (e) { return false; }   // na dúvida, NÃO é PC
  }

  window.PFLIX_IS_DESKTOP = ehComputador();
  if (!window.PFLIX_IS_DESKTOP) return;   // celular/tablet: não faz absolutamente nada

  var POPUNDER_URL = 'https://sorrowfulpsychology.com/7YQ2ye';
  var NOVO_AD_SRC  = '//vapid-size.com/cxD/9h6.bn2g5xllSEWGQn9_NIzBQD0jNGDwIJ0/OdSD0M3/N/DxQM0jMUjjURzF';

  // ── Popunder: 1x por página, no primeiro clique ──
  var popped = false;
  document.addEventListener('click', function handler() {
    if (popped) return;
    if (window.PipocaVIP && window.PipocaVIP.ativo) return;   // VIP nunca vê anúncio
    popped = true;
    var win = window.open(POPUNDER_URL, '_blank');            // (VIP: o pflix-vip.js troca o window.open e bloqueia)
    if (win) { try { win.blur(); window.focus(); } catch (e) {} }
    document.removeEventListener('click', handler, true);
  }, true);

  // ── Novo anúncio (script da rede) ──
  // Só entra em página que tem o pflix-guard.js: é ele que segura o script até o
  // pflix-vip.js confirmar que a pessoa NÃO é VIP.
  function carregarNovoAd() {
    if (!window.PFLIX_GUARD) return;
    var s = document.createElement('script');
    s.settings = {};
    s.async = true;
    s.referrerPolicy = 'no-referrer-when-downgrade';
    s.src = NOVO_AD_SRC;
    (document.head || document.documentElement).appendChild(s);
  }
  carregarNovoAd();
})();
