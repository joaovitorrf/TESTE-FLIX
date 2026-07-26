/**
 * PIPOCAFLIX — Anti-AdBlock
 * assets/js/anti-adblock.js
 *
 * Detecta se o usuário está usando bloqueador de anúncios (AdBlock, uBlock, etc)
 * e, se estiver, mostra uma tela pedindo pra desativar — com o tom de "papo reto"
 * explicando por que os ads são necessários pro site continuar de graça.
 *
 * A tela só libera o site (deixa fechar) depois que o adblock for desativado
 * de verdade e a página for atualizada.
 *
 * Inclua perto do fim do <body>, em qualquer página com anúncio:
 *   <script src="assets/js/anti-adblock.js" defer></script>
 */
(function () {
  'use strict';

  const MASCOTE_IMG = "https://i.pinimg.com/736x/f2/6f/71/f26f7163141776f54c0e5a371c340a5f.jpg";

  function detectarAdBlock(callback) {
    const bait = document.createElement('div');
    bait.className = 'adsbox ad-banner ad-unit adsbygoogle pub_300x250 pub_300x250m pub_728x90 textAd text_ad text-ads';
    bait.style.cssText = 'position:absolute !important;left:-9999px !important;top:-9999px !important;width:1px !important;height:1px !important;';
    document.body.appendChild(bait);

    setTimeout(function () {
      const estilo = window.getComputedStyle(bait);
      const bloqueado = (
        bait.offsetParent === null ||
        bait.offsetHeight === 0 ||
        bait.clientHeight === 0 ||
        estilo.display === 'none' ||
        estilo.visibility === 'hidden'
      );
      bait.remove();
      callback(bloqueado);
    }, 300);
  }

  function mostrarTela() {
    if (document.getElementById('pflixAdBlockWall')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pflixAdBlockWall';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(6,6,10,0.94)', 'backdrop-filter:blur(6px)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:20px', 'box-sizing:border-box', 'font-family:inherit'
    ].join(';');

    overlay.innerHTML = `
      <div style="
        max-width:420px;width:100%;background:#141018;border:1px solid #2a2430;
        border-radius:18px;padding:28px 24px;text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <img src="${MASCOTE_IMG}" alt="Mascote PipocaFlix"
             style="width:120px;height:120px;object-fit:contain;margin:0 auto 16px;display:block;border-radius:14px;">
        <h2 style="color:#fff;font-size:1.25rem;margin:0 0 12px;line-height:1.3;">
          Opa, mano, peraí! 🍿
        </h2>
        <p style="color:#c9c4d0;font-size:0.95rem;line-height:1.6;margin:0 0 10px;">
          Bagulho é o seguinte: aqui no PipocaFlix é tudo de graça, sem mensalidade,
          sem pegadinha — mas alguém tem que pagar a conta dos servidores e do catálogo, saca?
        </p>
        <p style="color:#c9c4d0;font-size:0.95rem;line-height:1.6;margin:0 0 20px;">
          É por isso que a gente depende dos anúncios. Sem eles, o site não se sustenta.
          Desativa o bloqueador de anúncio pra essa página e dá um refresh que a gente
          já libera geral de novo, de boa. 🤝
        </p>
        <button id="pflixAdBlockRefresh" style="
          background:linear-gradient(90deg,#B7090B,#ff2d43);color:#fff;border:none;
          border-radius:10px;padding:12px 26px;font-size:0.95rem;font-weight:700;
          cursor:pointer;width:100%;">
          Já desativei, atualizar página
        </button>
        <p style="color:#6c6674;font-size:0.78rem;margin:14px 0 0;">
          Se você é assinante VIP e não devia ver isso, entra em contato com a gente.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.getElementById('pflixAdBlockRefresh').addEventListener('click', function () {
      window.location.reload();
    });
  }

  function iniciar() {
    // Não roda a checagem para usuários VIP confirmados (eles não veem ad mesmo)
    if (window.PipocaVIP && window.PipocaVIP.ativo) return;

    detectarAdBlock(function (bloqueado) {
      if (bloqueado) mostrarTela();
    });

    // Reavalia se o status VIP mudar depois (evita travar quem acabou de logar como VIP)
    document.addEventListener('pflix:vip-ativo', function () {
      const wall = document.getElementById('pflixAdBlockWall');
      if (wall) {
        wall.remove();
        document.body.style.overflow = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
