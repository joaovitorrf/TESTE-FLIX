/**
 * PIPOCAFLIX — preview-hover.js
 * Prévia em vídeo ao passar o mouse no pôster — SÓ NO DESKTOP.
 *
 * COMO FUNCIONA
 *   • Passou o mouse num card e ficou ~0,7 s parado? Se o título tem trailer cadastrado
 *     (coluna "trailer" da planilha), um vídeo mudo toca por cima do pôster. Saiu do card, rolou a
 *     página, trocou de aba ou passou de 25 s? A prévia some e o vídeo é descarregado.
 *   • Só 1 prévia por vez, e o vídeo só aparece com ele realmente tocando (sem tela preta nem
 *     "vídeo indisponível" piscando no card).
 *   • Trailer do YouTube (watch?v=, youtu.be, /embed/, /shorts/) ou arquivo .mp4/.webm direto.
 *
 * SÓ DESKTOP — o módulo nem liga em:
 *   • celular/tablet (precisa de mouse: hover + ponteiro "fine") nem em tela < 1024 px
 *   • quem pede menos movimento (prefers-reduced-motion) ou ativou a economia de dados
 *
 * USO: basta incluir  <script src="assets/js/preview-hover.js"></script>  numa página que tenha
 * cards (.card > .card-thumb-wrap > img.card-thumb). Os dados dos trailers vêm do PipocaAPI
 * (api.js), que a página já carrega — e só são buscados na primeira vez que alguém passa o mouse.
 * Pra um card específico NÃO ter prévia: data-pfx-no-preview no .card.
 *
 * Ajustes rápidos: as constantes logo abaixo.
 */
(function () {
  'use strict';
  if (window.PipocaPreview) return;

  var MQ = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
  var ESPERA_MS = 700;          // mouse parado no card antes de começar
  var MAX_MS = 25000;           // duração máxima de uma prévia
  var INICIO_S = 6;             // pula a vinheta do estúdio no começo do trailer
  var FALLBACK_MS = 4500;       // se o YouTube não avisar que começou, mostra mesmo assim
  var YT_ORIGEM = 'https://www.youtube-nocookie.com';

  var mq = window.matchMedia ? window.matchMedia(MQ) : null;
  var reduzMov = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function economiaDeDados() {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)[23]g$/.test(c.effectiveType || '')));
  }
  function permitido() {
    return !!(mq && mq.matches) && !(reduzMov && reduzMov.matches) && !economiaDeDados();
  }
  if (!mq) return;

  /* ── trailer de cada título ─────────────────────────────────────────────── */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function analisarTrailer(url) {
    url = String(url || '').trim();
    if (!url) return null;
    var m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return { yt: m[1] };
    if (/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(url)) return { mp4: url };
    return null;
  }

  var mapa = null, carregando = null;
  function carregarMapa() {
    if (mapa) return Promise.resolve(mapa);
    if (carregando) return carregando;
    var fonte = (window.PipocaAPI && window.PipocaAPI.getTodosConteudos)
      ? window.PipocaAPI.getTodosConteudos() : Promise.resolve([]);
    carregando = Promise.resolve(fonte).then(function (lista) {
      var m = {};
      (lista || []).forEach(function (it) {
        var t = analisarTrailer(it && it.trailer);
        if (!t) return;
        var k = norm(it.nome);
        (m[k] = m[k] || []).push({ serie: !!it.isSerie, trailer: t });
      });
      mapa = m;
      return m;
    }).catch(function () { mapa = {}; return mapa; });
    return carregando;
  }

  function nomeDoCard(card) {
    var img = card.querySelector('img.card-thumb');
    var n = (img && img.getAttribute('alt')) || '';
    if (!n) { var el = card.querySelector('.card-name'); n = el ? el.textContent : ''; }
    return n.trim();
  }

  /* ── estilo (injetado uma vez) ──────────────────────────────────────────── */
  function garantirCss() {
    if (document.getElementById('pfx-prev-css')) return;
    var st = document.createElement('style');
    st.id = 'pfx-prev-css';
    st.textContent =
      '.pfx-prev{position:absolute;inset:0;z-index:1;overflow:hidden;background:#000;opacity:0;transition:opacity .45s ease;pointer-events:none}' +
      '.pfx-prev.is-on{opacity:1}' +
      /* o vídeo é 16:9 e o pôster é vertical: centraliza e corta as laterais (e um pouco do topo/rodapé, onde o YouTube põe título e controles) */
      '.pfx-prev iframe,.pfx-prev video{position:absolute;top:50%;left:50%;height:130%;width:auto;aspect-ratio:16/9;max-width:none;transform:translate(-50%,-50%);border:0;pointer-events:none;object-fit:cover}' +
      '.card.pfx-prev-on .card-play{opacity:0!important}' +
      '.card.pfx-prev-on .card-hover-overlay{background:linear-gradient(0deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.4) 55%,transparent 100%)}' +
      '@media (prefers-reduced-motion:reduce){.pfx-prev{transition:none}}';
    document.head.appendChild(st);
  }

  /* ── ciclo de vida da prévia ────────────────────────────────────────────── */
  var atual = null;        // { card, camada, el, yt, timers[], mostrou }
  var intencao = null;     // { card, timer }

  function cancelarIntencao() {
    if (intencao) { clearTimeout(intencao.timer); intencao = null; }
  }

  function parar() {
    var a = atual;
    if (!a) return;
    atual = null;
    a.timers.forEach(clearTimeout);
    a.card.classList.remove('pfx-prev-on');
    if (a.el) {
      try { if (a.yt) a.el.src = 'about:blank'; else a.el.pause(); } catch (e) {}
      if (!a.yt) { try { a.el.removeAttribute('src'); a.el.load(); } catch (e) {} }
    }
    a.camada.classList.remove('is-on');
    setTimeout(function () { if (a.camada.parentNode) a.camada.parentNode.removeChild(a.camada); }, 400);
  }

  function mostrar(a) {
    if (atual !== a || a.mostrou) return;
    a.mostrou = true;
    a.camada.classList.add('is-on');
    a.card.classList.add('pfx-prev-on');
    a.timers.push(setTimeout(parar, MAX_MS));
  }

  function iniciar(card, t) {
    parar();
    var wrap = card.querySelector('.card-thumb-wrap');
    if (!wrap) return;
    garantirCss();
    var camada = document.createElement('div');
    camada.className = 'pfx-prev';
    camada.setAttribute('aria-hidden', 'true');
    var a = { card: card, camada: camada, el: null, yt: !!t.yt, timers: [], mostrou: false };

    if (t.yt) {
      var f = document.createElement('iframe');
      f.src = YT_ORIGEM + '/embed/' + t.yt +
        '?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0' +
        '&enablejsapi=1&start=' + INICIO_S + (/^https?:/.test(location.origin) ? '&origin=' + encodeURIComponent(location.origin) : '');
      f.setAttribute('allow', 'autoplay; encrypted-media');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('title', 'Prévia');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      f.addEventListener('load', function () {
        if (atual !== a) return;
        // pede ao player pra avisar quando começar a tocar (ou der erro)
        try {
          var w = f.contentWindow;
          w.postMessage(JSON.stringify({ event: 'listening', id: 'pfx', channel: 'widget' }), YT_ORIGEM);
          ['onStateChange', 'onError'].forEach(function (ev) {
            w.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: [ev], id: 'pfx', channel: 'widget' }), YT_ORIGEM);
          });
        } catch (e) {}
        a.timers.push(setTimeout(function () { mostrar(a); }, FALLBACK_MS));   // rede de segurança
      });
      a.el = f;
      camada.appendChild(f);
    } else {
      var v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('playing', function () { mostrar(a); });
      v.addEventListener('error', function () { if (atual === a) parar(); });
      v.src = t.mp4;
      a.el = v;
      camada.appendChild(v);
      var p = v.play(); if (p && p.catch) p.catch(function () { if (atual === a) parar(); });
    }
    wrap.appendChild(camada);
    atual = a;
    a.timers.push(setTimeout(function () { if (atual === a && !a.mostrou) parar(); }, FALLBACK_MS + 4000));   // nunca ficou pronto: desiste
  }

  // Mensagens do player do YouTube (começou a tocar / terminou / erro)
  window.addEventListener('message', function (ev) {
    var a = atual;
    if (!a || !a.yt || !a.el || ev.source !== a.el.contentWindow) return;
    var d = ev.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    if (!d || typeof d !== 'object') return;
    var estado = null;
    if (d.event === 'onStateChange' && typeof d.info === 'number') estado = d.info;
    else if (d.event === 'infoDelivery' && d.info && typeof d.info.playerState === 'number') estado = d.info.playerState;
    if (d.event === 'onError') { parar(); return; }
    if (estado === 1) mostrar(a);          // tocando
    else if (estado === 0) parar();        // acabou
  });

  function tentar(card) {
    if (!permitido() || !card.isConnected || !card.matches(':hover')) return;
    var nome = nomeDoCard(card);
    if (!nome) return;
    var badge = card.querySelector('.card-badge');
    var ehSerie = !!badge && /s[ée]rie/i.test(badge.textContent || '');
    carregarMapa().then(function (m) {
      if (!permitido() || !card.isConnected || !card.matches(':hover')) return;   // o mouse já saiu
      if (atual && atual.card === card) return;
      var lista = m[norm(nome)];
      if (!lista || !lista.length) return;                                         // sem trailer: nada acontece
      var escolhido = lista[0];
      if (lista.length > 1 && badge) {
        for (var i = 0; i < lista.length; i++) if (lista[i].serie === ehSerie) { escolhido = lista[i]; break; }
      }
      iniciar(card, escolhido.trailer);
    });
  }

  /* ── eventos (delegados no document: valem pra cards criados depois) ───── */
  document.addEventListener('mouseover', function (e) {
    if (!permitido()) return;
    var card = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    if ((atual && atual.card === card) || (intencao && intencao.card === card)) return;
    cancelarIntencao();
    parar();                                                   // entrou em outro card
    if (card.hasAttribute('data-pfx-no-preview')) return;
    if (card.closest('.carousel-track.dragging')) return;      // arrastando o carrossel
    intencao = { card: card, timer: setTimeout(function () { intencao = null; tentar(card); }, ESPERA_MS) };
  }, true);

  document.addEventListener('mouseout', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    var para = e.relatedTarget;
    if (para && card.contains(para)) return;                   // só mudou de filho dentro do mesmo card
    if (intencao && intencao.card === card) cancelarIntencao();
    if (atual && atual.card === card) parar();
  }, true);

  // Rolou a página (ou um carrossel)? O que estava sob o mouse mudou: encerra.
  window.addEventListener('scroll', function () { cancelarIntencao(); if (atual) parar(); }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { cancelarIntencao(); parar(); } });
  window.addEventListener('pagehide', parar);
  window.addEventListener('blur', function () { cancelarIntencao(); parar(); });

  // Redimensionou pra tela pequena / ligou economia de dados no meio do caminho
  var aoMudar = function () { if (!permitido()) { cancelarIntencao(); parar(); } };
  if (mq.addEventListener) mq.addEventListener('change', aoMudar); else if (mq.addListener) mq.addListener(aoMudar);

  window.PipocaPreview = { parar: parar, permitido: permitido };
})();
