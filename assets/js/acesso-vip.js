/**
 * PIPOCAFLIX — acesso-vip.js
 * Trava o SITE INTEIRO pra quem não é VIP e não está num teste grátis ativo.
 *
 * Antes só canais.html/canal.html eram exclusivos VIP (via canais-vip.js). Agora o
 * PipocaFlix inteiro só funciona pra assinante — ou pra quem está dentro das 3 horas
 * do teste grátis (teste-gratis.html).
 *
 * COMO FUNCIONA (mesma ideia do canais-vip.js, só que pro site inteiro):
 *   1. Mostra uma tela "Carregando…" cobrindo tudo (o texto é genérico de propósito:
 *      a pessoa não vê que existe uma checagem de assinatura). Não precisa mexer no
 *      HTML de cada página — é um <div> por cima de tudo, com a rolagem travada.
 *   2. Espera o pflix-vip.js terminar de checar (ou usa o cache dele).
 *   3. Depois, se não for VIP, olha se a CONTA Google (Gmail) logada tem um teste grátis em
 *      andamento e confere no Firestore se ainda não passaram as 3 horas.
 *   4. Libera (some com a tela) se VIP.ativo OU teste ainda dentro das 3h.
 *      Se for só teste, deixa uma pílula fixa no canto mostrando quanto falta.
 *   5. Senão, troca a tela por "assine ou teste grátis", sem nunca mostrar o
 *      conteúdo por trás (por isso não precisa mexer no CSS/HTML de cada página).
 *
 * Incluir LOGO DEPOIS do <script src="assets/js/pflix-vip.js"> em toda página de
 * conteúdo (home, filmes, séries, catálogo, canais, canal, elenco, feed, busca,
 * assistidos, filme, série). NÃO incluir em: login, perfil, planos, pedidos,
 * suporte, teste-gratis e páginas institucionais — essas continuam abertas pra
 * qualquer um, porque sem elas ninguém conseguiria nem virar VIP.
 */
(function () {
  'use strict';

  const FIREBASE_PROJECT = 'pipoca-flix-43de0';
  const FIREBASE_API_KEY = 'AIzaSyDQK5iw8v0eVf6auRiVkZzaRJn_I6znbeA';
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents';
  const TRIAL_MS = 3 * 60 * 60 * 1000; // 3 horas
  const TIMEOUT_MS = 12000;

  function emailKeyOf(email) {
    return String(email || '').trim().toLowerCase().replace(/[.#$[\]]/g, '_');
  }

  function loginUrl() {
    return 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
  }
  function logado() {
    var a = window.PipocaAuth;
    return !!(a && a.getUser && a.getUser());
  }

  // ─── convite de amigo: guarda o código do link (?ref=CODIGO) até a pessoa entrar na conta ───
  // (quem registra o convite de verdade é o convite.js, que roda no login/planos/teste/perfil/home)
  (function capturarConvite() {
    try {
      var ref = new URLSearchParams(location.search).get('ref');
      if (ref && /^[A-Za-z0-9]{6,12}$/.test(ref)) {
        localStorage.setItem('pflix_ref', JSON.stringify({ codigo: ref.toUpperCase(), ts: Date.now() }));
      }
    } catch (e) {}
  })();

  // ─── teste grátis: confere no Firestore se ainda está dentro das 3h ───
  // O teste agora é da CONTA Google (Gmail), não de um e-mail guardado no navegador.
  // Lê o documento com o token da própria pessoa; as regras só deixam ler o do próprio e-mail.
  async function checarTrial() {
    var user = window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser();
    if (!user || !user.email) return { ativo: false };
    var email = user.email.trim().toLowerCase();
    try {
      var token = await user.getIdToken();
      var url = FS_BASE + '/trial/' + emailKeyOf(email);
      var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 404) return { ativo: false };
      if (!res.ok) return { ativo: false, erro: true };
      var data = await res.json();
      var criadoStr = data && data.fields && data.fields.criadoEm && data.fields.criadoEm.timestampValue;
      if (!criadoStr) return { ativo: false };
      var criado = new Date(criadoStr).getTime();
      var restante = TRIAL_MS - (Date.now() - criado);
      return { ativo: restante > 0, restanteMs: restante, expirado: restante <= 0, email: email };
    } catch (e) {
      return { ativo: false, erro: true };
    }
  }

  function aguardarVip() {
    return new Promise(function (resolve) {
      if (window.PipocaVIP && window.PipocaVIP.pronto) { resolve(); return; }
      var resolvido = false;
      function ok() { if (resolvido) return; resolvido = true; document.removeEventListener('pflix:vip-checado', ok); resolve(); }
      document.addEventListener('pflix:vip-checado', ok);
      setTimeout(ok, TIMEOUT_MS); // pflix-vip.js não carregou / rede travada: não trava pra sempre
    });
  }

  /* ───────── visual ───────── */
  function estilos() {
    if (document.getElementById('pfxAcessoStyle')) return;
    var s = document.createElement('style');
    s.id = 'pfxAcessoStyle';
    s.textContent = `
.pfx-av-ov{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:1.25rem;
  overflow-y:auto;background:var(--void,#050507);font-family:var(--font-body,'DM Sans',system-ui,sans-serif)}
.pfx-av-card{width:100%;max-width:480px;margin:auto;text-align:center;color:var(--text-1,#f0f0f6)}
.pfx-av-logo{font-family:var(--font-display,'Syne',system-ui,sans-serif);font-weight:800;font-size:1.5rem;margin:0 0 2rem;
  color:var(--red,#ff2d43);letter-spacing:-.01em}
.pfx-av-spin{width:38px;height:38px;margin:0 auto 1.1rem;border-radius:50%;
  border:3px solid var(--border-light,rgba(255,255,255,.12));border-top-color:var(--red,#ff2d43);animation:pfxAvSpin .8s linear infinite}
.pfx-av-load{color:var(--text-3,#5a5a72);font-size:.9rem}
.pfx-av-ico{font-size:2.6rem;margin-bottom:.6rem}
.pfx-av-tit{font-family:var(--font-display,'Syne',system-ui,sans-serif);font-weight:800;font-size:1.5rem;margin:0 0 .6rem}
.pfx-av-txt{color:var(--text-3,#5a5a72);font-size:.95rem;line-height:1.6;margin:0 0 1.6rem}
.pfx-av-acoes{display:flex;flex-direction:column;gap:.65rem}
.pfx-av-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.85rem 1.2rem;border-radius:999px;
  text-decoration:none;font:700 .95rem var(--font-body,'DM Sans',system-ui,sans-serif);border:1px solid var(--border-light,rgba(255,255,255,.14));
  color:var(--text-1,#f0f0f6);background:transparent;transition:filter .15s ease,transform .15s ease}
.pfx-av-btn:active{transform:scale(.98)}
.pfx-av-btn--gold{border:0;background:linear-gradient(135deg,#ffb020,#ff8c00);color:#1a1000;box-shadow:0 10px 28px rgba(255,140,0,.32)}
.pfx-av-btn--trial{border:0;background:var(--red,#ff2d43);color:#fff;box-shadow:0 10px 28px rgba(255,45,67,.32)}
.pfx-av-rodape{margin-top:1.6rem;font-size:.8rem;color:var(--text-3,#5a5a72)}
.pfx-av-rodape a{color:var(--text-2,#a0a0b8)}
.pfx-trial-pill{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9500;display:flex;align-items:center;gap:.5rem;
  padding:.55rem .95rem;border-radius:999px;background:var(--card,#1e1e2a);border:1px solid var(--border-light,rgba(255,255,255,.14));
  box-shadow:0 10px 30px rgba(0,0,0,.4);font:600 .8rem var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--text-1,#f0f0f6);
  text-decoration:none;transition:filter .15s ease}
.pfx-trial-pill:hover{filter:brightness(1.1)}
.pfx-trial-pill b{color:#ffb020}
@keyframes pfxAvSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.pfx-av-spin{animation:none;border-top-color:var(--red,#ff2d43);border-right-color:var(--red,#ff2d43)}}`;
    document.head.appendChild(s);
  }

  var overlay = null;
  function mostrarCarregando() {
    estilos();
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'pfx-av-ov';
    overlay.id = 'pfxAcessoOverlay';
    overlay.innerHTML =
      '<div class="pfx-av-card">' +
        '<p class="pfx-av-logo">🍿 PipocaFlix</p>' +
        '<div class="pfx-av-spin" aria-hidden="true"></div>' +
        // Texto propositalmente genérico: a pessoa não precisa saber que existe uma
        // checagem de assinatura rolando por trás — pra ela, a página só está carregando.
        '<p class="pfx-av-load" role="status">Carregando…</p>' +
      '</div>';
    (document.body || document.documentElement).appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
  }

  function esconder() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.documentElement.style.overflow = '';
  }

  function mostrarBloqueio(motivo) {
    estilos();
    if (!overlay) mostrarCarregando();
    var estaLogado = logado();
    var ico = '🔒', titulo, texto;
    var mostrarTrial = true;

    if (motivo === 'erro') {
      ico = '⚠️'; titulo = 'Não consegui verificar seu acesso';
      texto = 'Deu algum problema na conexão. Recarregue a página pra tentar de novo.';
    } else if (motivo === 'trial-expirado') {
      ico = '⏰'; titulo = 'Seu teste grátis acabou';
      var emailLogado = (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser() || {}).email;
      texto = 'As 3 horas de teste chegaram ao fim. Assine o Pipoca Flix Gold pra continuar assistindo sem limite.' +
        (emailLogado ? ' Na hora de pagar, use este mesmo e-mail (' + emailLogado + ') — é nele que o seu VIP é liberado.' : '');
      mostrarTrial = false;
    } else {
      titulo = 'O PipocaFlix agora é só para assinantes';
      texto = estaLogado
        ? 'Sua conta ainda não tem o Pipoca Flix Gold. Assine pra ter acesso completo, ou teste grátis por 3 horas.'
        : 'Entre na sua conta, assine o Pipoca Flix Gold, ou teste o site de graça por 3 horas — sem precisar de cartão.';
    }

    overlay.innerHTML =
      '<div class="pfx-av-card">' +
        '<p class="pfx-av-logo">🍿 PipocaFlix</p>' +
        '<div class="pfx-av-ico" aria-hidden="true">' + ico + '</div>' +
        '<h1 class="pfx-av-tit"></h1>' +
        '<p class="pfx-av-txt"></p>' +
        '<div class="pfx-av-acoes"></div>' +
        '<p class="pfx-av-rodape"></p>' +
      '</div>';
    overlay.querySelector('.pfx-av-tit').textContent = titulo;
    overlay.querySelector('.pfx-av-txt').textContent = texto;

    var ac = overlay.querySelector('.pfx-av-acoes');
    function botao(href, txt, cls) {
      var a = document.createElement('a');
      a.href = href; a.className = 'pfx-av-btn' + (cls ? ' ' + cls : ''); a.textContent = txt;
      ac.appendChild(a);
      return a;
    }
    if (motivo === 'erro') {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pfx-av-btn pfx-av-btn--gold'; b.textContent = 'Recarregar';
      b.onclick = function () { location.reload(); };
      ac.appendChild(b);
    } else {
      botao(motivo === 'trial-expirado' ? 'planos.html?origem=teste' : 'planos.html', '⭐ Assinar o Pipoca Flix Gold', 'pfx-av-btn--gold');
      if (mostrarTrial) botao('teste-gratis.html', '▶ Testar 3 horas grátis', 'pfx-av-btn--trial');
      if (!estaLogado) botao(loginUrl(), 'Entrar com Google');
    }
    overlay.querySelector('.pfx-av-rodape').innerHTML =
      'Já é assinante e algo parece errado? <a href="suporte.html">Fale com o suporte</a>.';
  }

  function mostrarPilulaTrial(restanteMs) {
    if (document.getElementById('pfxTrialPill')) return;
    estilos();
    var min = Math.max(1, Math.round(restanteMs / 60000));
    var texto = min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60) + 'min' : min + ' min';
    var a = document.createElement('a');
    a.id = 'pfxTrialPill';
    a.className = 'pfx-trial-pill';
    a.href = 'planos.html?origem=teste';
    a.innerHTML = '🍿 Teste grátis: <b>' + texto + '</b> restantes · assinar';
    document.body.appendChild(a);
  }

  async function iniciar() {
    mostrarCarregando();
    await aguardarVip(); // quando termina, o login do Firebase já foi resolvido
    var vip = window.PipocaVIP || { ativo: false, erro: false };
    var trial = vip.ativo ? { ativo: false } : await checarTrial();

    if (vip.ativo) { esconder(); return; }
    if (trial.ativo) { esconder(); mostrarPilulaTrial(trial.restanteMs); return; }
    if (vip.erro && trial.erro) { mostrarBloqueio('erro'); return; }
    if (trial.expirado) { mostrarBloqueio('trial-expirado'); return; }
    mostrarBloqueio();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
