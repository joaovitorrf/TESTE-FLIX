/**
 * PIPOCAFLIX — canais-vip.js
 * Canais ao vivo (canais.html e canal.html) agora são EXCLUSIVOS para assinantes VIP.
 *
 * Como funciona:
 *   • Tudo que tem o atributo  data-vip-only  fica escondido (pelo CSS) até a assinatura ser confirmada.
 *   • O pflix-vip.js decide se a pessoa é VIP e avisa pelo evento "pflix:vip-checado".
 *   • Se for VIP  → libera a página (classe pflix-canais-ok no <html>).
 *   • Se não for  → mostra o aviso "exclusivo VIP" (com botões de entrar / assinar).
 *   • window.PflixCanaisVip.pronto é uma Promise (true = VIP). O canal.html só carrega o
 *     player DEPOIS dela — quem não é VIP nem baixa o embed do canal.
 *
 * ⚠ Limite honesto: é uma trava do lado do navegador. Quem sabe mexer no código ainda
 *   consegue achar os links de embed, porque eles vêm da planilha pública. Serve pra
 *   guiar o usuário comum até o VIP, não pra proteger conteúdo contra pirataria.
 */
(function () {
  'use strict';
  var liberar;
  var pronto = new Promise(function (ok) { liberar = ok; });
  window.PflixCanaisVip = { pronto: pronto };

  var decidido = false, gate = null;

  function loginUrl() { return 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); }
  function logado() { var a = window.PipocaAuth; return !!(a && a.getUser && a.getUser()); }

  function criarGate() {
    if (gate) return gate;
    gate = document.createElement('section');
    gate.className = 'vip-gate'; gate.id = 'vipGate';
    gate.setAttribute('aria-live', 'polite');
    var alvo = document.querySelector('[data-vip-only]');
    if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(gate, alvo);
    else (document.querySelector('main') || document.body).appendChild(gate);
    return gate;
  }

  function mostrarCarregando() {
    var g = criarGate();
    g.innerHTML = '<div class="vip-gate-card"><div class="vip-gate-spin" aria-hidden="true"></div><p class="vip-gate-load">Verificando sua assinatura…</p></div>';
  }

  function mostrarBloqueio(motivo) {
    var g = criarGate();
    var estaLogado = logado();
    var titulo = motivo === 'erro' ? 'Não consegui verificar sua assinatura' : 'Canais ao vivo são exclusivos para VIP';
    var texto  = motivo === 'erro'
      ? 'Deu algum problema na conexão. Recarregue a página pra tentar de novo.'
      : (estaLogado
          ? 'Sua conta ainda não tem o plano VIP. Assine pra assistir aos canais ao vivo, sem anúncios e com os recursos Premium.'
          : 'Entre na sua conta pra conferir sua assinatura. Ainda não é VIP? Dá pra assinar em um minuto.');
    g.innerHTML =
      '<div class="vip-gate-card">' +
        '<div class="vip-gate-ico" aria-hidden="true">🔒</div>' +
        '<h1 class="vip-gate-titulo"></h1>' +
        '<p class="vip-gate-texto"></p>' +
        '<div class="vip-gate-acoes"></div>' +
      '</div>';
    g.querySelector('.vip-gate-titulo').textContent = titulo;
    g.querySelector('.vip-gate-texto').textContent = texto;
    var ac = g.querySelector('.vip-gate-acoes');
    function link(href, txt, cls) { var a = document.createElement('a'); a.href = href; a.className = cls; a.textContent = txt; ac.appendChild(a); }
    if (motivo === 'erro') {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'vip-gate-btn vip-gate-btn--main'; b.textContent = 'Recarregar'; b.onclick = function () { location.reload(); }; ac.appendChild(b);
    } else {
      link('planos.html', '⭐ ' + (estaLogado ? 'Assinar o VIP' : 'Conhecer o VIP'), 'vip-gate-btn vip-gate-btn--main');
      if (!estaLogado) link(loginUrl(), 'Entrar com Google', 'vip-gate-btn');
      else link('index.html', 'Voltar pra home', 'vip-gate-btn');
    }
  }

  function decidir() {
    var v = window.PipocaVIP;
    if (!v || !v.pronto) return;
    if (v.ativo) {
      decidido = true;
      document.documentElement.classList.add('pflix-canais-ok');
      if (gate) { gate.remove(); gate = null; }
      liberar(true);
    } else {
      // não é VIP (ou saiu da conta): mantém bloqueado; pode virar VIP na mesma sessão
      document.documentElement.classList.remove('pflix-canais-ok');
      if (!decidido) liberar(false);
      mostrarBloqueio();
    }
  }

  document.addEventListener('pflix:vip-checado', decidir);
  document.addEventListener('pflix:vip-ativo', decidir);
  document.addEventListener('DOMContentLoaded', function () {
    mostrarCarregando();
    decidir();                                         // se o pflix-vip.js já terminou
    setTimeout(function () {                           // rede travada: não deixa o "verificando" pra sempre
      if (!window.PipocaVIP || !window.PipocaVIP.pronto) { mostrarBloqueio('erro'); liberar(false); }
    }, 12000);
  });
})();
