/**
 * PIPOCAFLIX — player.js v5.0
 * ─────────────────────────────────────────────────────────────
 * Player de vídeo customizado usado em filme.html e serie.html.
 *
 * Novidades desta versão (upgrade "player TOP"):
 *  - Streaming adaptativo: fontes .m3u8/.m3u carregam via hls.js
 *    automaticamente (com fallback nativo no Safari/iOS). Fontes
 *    .mp4 continuam funcionando exatamente como antes.
 *  - Seletor de qualidade manual — só aparece quando a fonte HLS
 *    realmente expõe mais de uma renditions (nada de opções falsas).
 *  - Legendas (.vtt) — botão "CC" só aparece quando o título tem
 *    faixas configuradas (ver PipocaAPI.parseLegendas). Lembra o
 *    idioma escolhido entre sessões.
 *  - Faixa de buffer na barra de progresso + preview de miniatura
 *    (melhor esforço via canvas; nunca trava a UI se falhar).
 *  - Progresso salvo por intervalo fixo + em pause/visibilitychange/
 *    beforeunload, delegando pro window.PipocaProgress (fonte única
 *    de verdade, compartilhada com a Home).
 *  - Atalhos de teclado só respondem quando o player está de fato
 *    visível na tela e nenhum player alternativo (iframe) está aberto.
 *  - Chromecast funcional (antes só existia o botão, sem lógica).
 *  - Ícones SVG consistentes (sem emoji) nos toasts/feedback.
 *  - Cartão de "próximo episódio" com miniatura + anel de contagem
 *    regressiva (auto-avança, com opção de cancelar).
 *  - Menu "mais opções" (⋮) agrupa controles secundários em telas
 *    estreitas.
 *
 * Toda a aparência destes componentes vive em assets/css/style.css
 * (tokens do design system) — este arquivo não injeta CSS.
 */
window.PipocaPlayer = (function () {
  'use strict';

  var NEXT_EP_TRIGGER_SECONDS = 30;   // quando o cartão de próximo episódio aparece
  var NEXT_EP_AUTOPLAY_MS     = 8000; // duração do anel de contagem regressiva
  var PROGRESS_SAVE_INTERVAL  = 5000; // salva progresso a cada 5s, além dos gatilhos de evento
  var PREVIEW_SEEK_DEBOUNCE   = 120;  // ms entre seeks do preview ao arrastar o mouse na barra

  /* ═══════════════════════════════════════════════════════════
     ÍCONES (SVG inline — substituem os emojis usados antes em
     toasts/feedback, pra ficar visualmente consistente com os
     botões do player em qualquer SO/navegador).
  ═══════════════════════════════════════════════════════════ */
  var ICONS = {
    play:   '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause:  '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>',
    back10: '<svg viewBox="0 0 24 24"><path d="M11 18V6l-8 6 8 6zm2-12h8v2h-8zm0 6h6v2h-6z"/></svg>',
    fwd10:  '<svg viewBox="0 0 24 24"><path d="M13 6v12l8-6-8-6zm-2 12H3v-2h8zm0-6H5v-2h6z"/></svg>',
    volUp:  '<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 5V4l-5 5H5zm11.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/></svg>',
    volDown:'<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 5V4l-5 5H5z"/></svg>',
    muted:  '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.94 8.94 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
    fs:     '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4V4zm14 0v6h-2V6h-4V4h6zm0 14h-6v-2h4v-4h2v6zm-14 0v-6h2v4h4v2H4z"/></svg>',
    skip:   '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
    cc:     '<svg viewBox="0 0 24 24"><path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM10.5 15.5c-1.66 0-3-1.34-3-3v-1c0-1.66 1.34-3 3-3 1.3 0 2.4.83 2.82 2h-1.55a1.5 1.5 0 0 0-1.27-.7c-.83 0-1.5.9-1.5 1.7v1c0 .8.67 1.7 1.5 1.7.58 0 1.06-.29 1.27-.7h1.55c-.42 1.17-1.52 2-2.82 2zm6.75 0c-1.66 0-3-1.34-3-3v-1c0-1.66 1.34-3 3-3 1.3 0 2.4.83 2.82 2h-1.55a1.5 1.5 0 0 0-1.27-.7c-.83 0-1.5.9-1.5 1.7v1c0 .8.67 1.7 1.5 1.7.58 0 1.06-.29 1.27-.7h1.55c-.42 1.17-1.52 2-2.82 2z"/></svg>',
    quality:'<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3a7.99 7.99 0 0 0-.25-1.8l1.9-1.5a.5.5 0 0 0 .12-.64l-1.8-3.12a.5.5 0 0 0-.6-.22l-2.24.9a8.1 8.1 0 0 0-1.56-.9l-.34-2.38a.5.5 0 0 0-.5-.44h-3.6a.5.5 0 0 0-.5.44l-.34 2.38c-.56.23-1.08.53-1.56.9l-2.24-.9a.5.5 0 0 0-.6.22L4.29 6.06a.5.5 0 0 0 .12.64l1.9 1.5c-.1.58-.16 1.18-.16 1.8s.06 1.22.16 1.8l-1.9 1.5a.5.5 0 0 0-.12.64l1.8 3.12c.13.22.4.31.6.22l2.24-.9c.48.37 1 .67 1.56.9l.34 2.38c.05.25.26.44.5.44h3.6c.24 0 .45-.19.5-.44l.34-2.38c.56-.23 1.08-.53 1.56-.9l2.24.9c.2.09.47 0 .6-.22l1.8-3.12a.5.5 0 0 0-.12-.64l-1.9-1.5c.1-.58.16-1.18.16-1.8z"/></svg>',
    more:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    close:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    cast:   '<svg viewBox="0 0 24 24"><path d="M1 18v3h3a3 3 0 00-3-3zm0-4v2a7 7 0 017 7h2a9 9 0 00-9-9zm0-4v2a13 13 0 0113 13h2C16 12.95 9.05 6 1 10zm20-6H3C1.9 4 1 4.9 1 6v3h2V6h18v12h-7v2h7c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };

  /* ═══════════════════════════════════════════════════════════
     Utils
  ═══════════════════════════════════════════════════════════ */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatTime(s) {
    if (isNaN(s) || s < 0 || !isFinite(s)) s = 0;
    s = Math.floor(s);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ':' + pad2(m) + ':' + pad2(sec);
    return m + ':' + pad2(sec);
  }

  function normTitulo(titulo) {
    return (titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  }

  function volIcon(vol, muted) {
    if (muted || vol <= 0) return ICONS.muted;
    if (vol < 0.5) return ICONS.volDown;
    return ICONS.volUp;
  }

  /* ═══════════════════════════════════════════════════════════
     Progresso — delega para window.PipocaProgress (fonte única,
     compartilhada com a Home/"Continuar Assistindo"). Mantém um
     fallback interno caso progress.js não esteja carregado nessa
     página por algum motivo, pra nunca quebrar o player por isso.
  ═══════════════════════════════════════════════════════════ */
  function progressSave(titulo, currentTime, duration, capa, tipo, serieNome) {
    if (!titulo || !duration) return;
    if (window.PipocaProgress && window.PipocaProgress.save) {
      window.PipocaProgress.save(titulo, currentTime, duration, capa, tipo, serieNome);
      return;
    }
    try {
      var pct = currentTime / duration;
      if (pct >= 0.95 || currentTime < 10) return;
      localStorage.setItem('pflix_progress_' + normTitulo(titulo), JSON.stringify({
        titulo: titulo, currentTime: currentTime, duration: duration, pct: pct,
        capa: capa || '', tipo: tipo || 'filme', serieNome: serieNome || '', ts: Date.now()
      }));
    } catch (e) {}
  }

  function progressGet(titulo) {
    if (window.PipocaProgress && window.PipocaProgress.get) return window.PipocaProgress.get(titulo);
    try {
      var v = localStorage.getItem('pflix_progress_' + normTitulo(titulo));
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  /* ═══════════════════════════════════════════════════════════
     Toast / feedback (ícone + texto, sem emoji cru)
  ═══════════════════════════════════════════════════════════ */
  function showPlayerToast(container, msg, iconKey) {
    var t = container.querySelector('.player-toast-inner');
    if (!t) {
      t = document.createElement('div');
      t.className = 'player-toast-inner';
      container.appendChild(t);
    }
    var iconHtml = iconKey && ICONS[iconKey] ? '<span class="player-toast-icon">' + ICONS[iconKey] + '</span>' : '';
    t.innerHTML = iconHtml + '<span class="player-toast-text">' + msg + '</span>';
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }

  function showTapFeedback(container, msg, side, iconKey) {
    var cls = 'player-tap-feedback player-tap-feedback--' + side;
    var el = document.createElement('div');
    el.className = cls;
    el.innerHTML = (iconKey && ICONS[iconKey] ? ICONS[iconKey] : '') + '<span>' + msg + '</span>';
    container.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 220);
    }, 500);
  }

  /* ═══════════════════════════════════════════════════════════
     HLS — carregamento sob demanda do hls.js (só quando a fonte
     é .m3u8/.m3u e o navegador não suporta HLS nativamente).
  ═══════════════════════════════════════════════════════════ */
  var _hlsLibPromise = null;
  function loadHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (_hlsLibPromise) return _hlsLibPromise;
    _hlsLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      s.onload = function () { resolve(window.Hls); };
      s.onerror = function () { reject(new Error('hls.js falhou ao carregar')); };
      document.head.appendChild(s);
    });
    return _hlsLibPromise;
  }

  function isHlsSource(url) {
    return !!url && (url.indexOf('.m3u8') !== -1 || url.indexOf('.m3u') !== -1);
  }

  // Aplica `src` no <video>, escolhendo automaticamente entre HLS.js,
  // HLS nativo (Safari/iOS) ou fonte direta (mp4 e afins).
  // `state` é um objeto por-instância de player onde guardamos a
  // instância atual do hls.js, pra poder destruir ao trocar de fonte.
  function loadSource(video, src, state, onLevels) {
    if (state.hls) {
      try { state.hls.destroy(); } catch (e) {}
      state.hls = null;
    }
    if (onLevels) onLevels([], null, null);

    if (!src) {
      video.removeAttribute('src');
      try { video.load(); } catch (e) {}
      return;
    }

    if (isHlsSource(src)) {
      var canNative = video.canPlayType('application/vnd.apple.mpegurl');
      if (canNative) {
        video.src = src;
        video.load();
        return;
      }
      loadHlsLib().then(function (Hls) {
        if (!Hls || !Hls.isSupported()) { video.src = src; video.load(); return; }
        var hls = new Hls({ capLevelToPlayerSize: true });
        state.hls = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (onLevels) onLevels(hls.levels || [], hls, Hls);
        });
        hls.on(Hls.Events.ERROR, function (evt, data) {
          if (data && data.fatal) {
            console.warn('[Player] Erro fatal HLS (' + data.type + ') — tentando recuperar.');
            try {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            } catch (e) {}
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      }).catch(function (err) {
        console.warn('[Player] hls.js indisponível, tentando fonte direta:', err.message);
        video.src = src;
        video.load();
      });
    } else {
      video.src = src;
      video.load();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Barra de progresso: preenchido + buffer + thumb + tooltip
     de tempo + preview de miniatura (melhor esforço).
  ═══════════════════════════════════════════════════════════ */
  function enhanceProgressBar(progress, progressFilled, video, container) {
    var bufferedEl = document.createElement('div');
    bufferedEl.className = 'player-progress-buffered';
    progress.insertBefore(bufferedEl, progressFilled);

    var thumb = document.createElement('div');
    thumb.className = 'player-progress-thumb';
    progressFilled.appendChild(thumb);

    var tooltip = document.createElement('div');
    tooltip.className = 'player-progress-tooltip';
    progress.appendChild(tooltip);

    var previewWrap = document.createElement('div');
    previewWrap.className = 'player-progress-preview';
    var previewCanvas = document.createElement('canvas');
    previewCanvas.width = 160;
    previewCanvas.height = 90;
    previewWrap.appendChild(previewCanvas);
    progress.appendChild(previewWrap);

    function updateBuffered() {
      if (!video.duration || !video.buffered || !video.buffered.length) return;
      try {
        var end = video.buffered.end(video.buffered.length - 1);
        bufferedEl.style.width = Math.min(100, (end / video.duration) * 100) + '%';
      } catch (e) {}
    }
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('timeupdate', updateBuffered);
    video.addEventListener('loadedmetadata', updateBuffered);

    function updatePlayhead() {
      if (!video.duration) return;
      var pct = Math.min(100, (video.currentTime / video.duration) * 100);
      progressFilled.style.width = pct + '%';
    }
    video.addEventListener('timeupdate', updatePlayhead);

    // ── Preview de miniatura ao passar o mouse (best-effort) ──
    // Usa um <video> oculto clonado + canvas. Se qualquer etapa falhar
    // (CORS, seek lento, formato não seekável etc.), simplesmente não
    // mostra a miniatura — o tooltip de tempo continua funcionando normal.
    var previewVideo = null, previewFailed = false, previewSeekToken = 0, hoverSeekTimer = null;
    function ensurePreviewVideo() {
      if (previewVideo || previewFailed) return;
      try {
        var srcNow = video.currentSrc || video.src;
        if (!srcNow) { previewFailed = true; return; }
        previewVideo = document.createElement('video');
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewVideo.preload = 'auto';
        try { previewVideo.crossOrigin = 'anonymous'; } catch (e) {}
        previewVideo.style.display = 'none';
        previewVideo.src = srcNow;
        document.body.appendChild(previewVideo);
        previewVideo.addEventListener('error', function () { previewFailed = true; });
      } catch (e) { previewFailed = true; }
    }

    function seekPreview(t) {
      ensurePreviewVideo();
      if (!previewVideo || previewFailed) return;
      clearTimeout(hoverSeekTimer);
      hoverSeekTimer = setTimeout(function () {
        if (!previewVideo || previewFailed) return;
        var myToken = ++previewSeekToken;
        var onSeeked = function () {
          previewVideo.removeEventListener('seeked', onSeeked);
          if (myToken !== previewSeekToken) return;
          try {
            var ctx = previewCanvas.getContext('2d');
            ctx.drawImage(previewVideo, 0, 0, previewCanvas.width, previewCanvas.height);
            previewWrap.classList.add('has-frame');
          } catch (err) { /* canvas tainted ou outro erro — segue só com o tooltip de texto */ }
        };
        try {
          previewVideo.addEventListener('seeked', onSeeked);
          previewVideo.currentTime = t;
        } catch (e) {}
      }, PREVIEW_SEEK_DEBOUNCE);
    }

    function posToTime(clientX) {
      var rect = progress.getBoundingClientRect();
      var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return { pos: pos, time: pos * (video.duration || 0) };
    }

    progress.addEventListener('mousemove', function (e) {
      if (!video.duration) return;
      var r = posToTime(e.clientX);
      var leftPx = r.pos * progress.getBoundingClientRect().width;
      tooltip.textContent = formatTime(r.time);
      tooltip.style.left = leftPx + 'px';
      previewWrap.style.left = leftPx + 'px';
      seekPreview(r.time);
    });
    progress.addEventListener('mouseleave', function () {
      previewWrap.classList.remove('has-frame');
      clearTimeout(hoverSeekTimer);
    });

    // ── Clique/arrasto pra buscar posição ──
    var dragging = false;
    function seekFromEvent(e) {
      if (!video.duration) return;
      var clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var r = posToTime(clientX);
      video.currentTime = r.time;
      progressFilled.style.width = (r.pos * 100) + '%';
    }
    progress.addEventListener('mousedown', function (e) { dragging = true; seekFromEvent(e); });
    window.addEventListener('mousemove', function (e) { if (dragging) seekFromEvent(e); });
    window.addEventListener('mouseup', function () { dragging = false; });
    progress.addEventListener('touchstart', function (e) { dragging = true; seekFromEvent(e); }, { passive: true });
    progress.addEventListener('touchmove', function (e) { if (dragging) seekFromEvent(e); }, { passive: true });
    progress.addEventListener('touchend', function () { dragging = false; });

    return {
      // Chamado quando a fonte do vídeo principal muda (troca de episódio),
      // pra manter a miniatura de preview sincronizada com o título certo.
      onSourceChanged: function () {
        previewFailed = false;
        previewWrap.classList.remove('has-frame');
        if (previewVideo) {
          try {
            previewVideo.pause();
            previewVideo.src = video.currentSrc || video.src;
            previewVideo.load();
          } catch (e) {}
        }
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     Controles extras: volume, legendas, qualidade, velocidade,
     PiP — com agrupamento "mais opções" (⋮) em telas estreitas.
  ═══════════════════════════════════════════════════════════ */
  function buildExtraControls(ctrlRow, video, playerBox, state) {
    var fullscreenBtn = ctrlRow.querySelector('#fullscreenBtn');
    var insertBeforeEl = fullscreenBtn || null;

    function insert(el) { ctrlRow.insertBefore(el, insertBeforeEl); }

    /* ── Volume (sempre visível) ── */
    var volWrap = document.createElement('div');
    volWrap.className = 'ctrl-vol-wrap';
    var volBtn = document.createElement('button');
    volBtn.className = 'ctrl-btn ctrl-vol-btn';
    volBtn.setAttribute('aria-label', 'Volume');
    volBtn.innerHTML = volIcon(video.volume, video.muted);
    var volSliderWrap = document.createElement('div');
    volSliderWrap.className = 'ctrl-vol-slider-wrap';
    var volSlider = document.createElement('input');
    volSlider.type = 'range'; volSlider.min = '0'; volSlider.max = '1'; volSlider.step = '0.05';
    volSlider.className = 'ctrl-vol-slider';
    volSlider.value = String(video.muted ? 0 : video.volume);
    volSliderWrap.appendChild(volSlider);
    volWrap.appendChild(volBtn); volWrap.appendChild(volSliderWrap);
    insert(volWrap);

    function refreshVolIcon() { volBtn.innerHTML = volIcon(video.volume, video.muted); }
    volBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      volSlider.value = String(video.muted ? 0 : video.volume);
      refreshVolIcon();
    });
    volSlider.addEventListener('input', function () {
      var v = parseFloat(volSlider.value);
      video.volume = v; video.muted = v <= 0;
      refreshVolIcon();
    });

    /* ── Wrapper "mais opções" (secundários) ── */
    var moreWrap = document.createElement('div');
    moreWrap.className = 'ctrl-more-wrap';
    var moreBtn = document.createElement('button');
    moreBtn.className = 'ctrl-btn ctrl-more-btn';
    moreBtn.setAttribute('aria-label', 'Mais opções');
    moreBtn.innerHTML = ICONS.more;
    var morePanel = document.createElement('div');
    morePanel.className = 'ctrl-more-panel';
    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(morePanel);
    insert(moreWrap);

    moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      moreWrap.classList.toggle('open');
    });
    document.addEventListener('click', function () { moreWrap.classList.remove('open'); });

    // Fábrica de menus popup reutilizada por Legendas/Qualidade/Velocidade
    function makePopup(btnLabel, btnClass) {
      var wrap = document.createElement('div');
      wrap.className = 'ctrl-popup ' + btnClass;
      var btn = document.createElement('button');
      btn.className = 'ctrl-btn ctrl-popup-btn';
      btn.innerHTML = btnLabel;
      var menu = document.createElement('div');
      menu.className = 'ctrl-popup-menu';
      wrap.appendChild(btn); wrap.appendChild(menu);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = wrap.classList.contains('open');
        document.querySelectorAll('.ctrl-popup.open').forEach(function (p) { p.classList.remove('open'); });
        if (!wasOpen) wrap.classList.add('open');
      });
      document.addEventListener('click', function () { wrap.classList.remove('open'); });
      morePanel.appendChild(wrap);
      return { wrap: wrap, btn: btn, menu: menu };
    }

    /* ── Legendas (CC) — só existe visualmente quando há faixas ── */
    var cc = makePopup(ICONS.cc, 'ctrl-cc');
    cc.wrap.style.display = 'none';
    var _subtitleTracks = [];
    function setSubtitles(tracks) {
      // Remove <track> antigas
      Array.prototype.slice.call(video.querySelectorAll('track')).forEach(function (t) { t.remove(); });
      _subtitleTracks = tracks || [];
      cc.menu.innerHTML = '';
      if (!_subtitleTracks.length) { cc.wrap.style.display = 'none'; return; }
      cc.wrap.style.display = '';

      var lastLang = null;
      try { lastLang = localStorage.getItem('pflix_legenda_lang'); } catch (e) {}

      var offOpt = document.createElement('button');
      offOpt.className = 'ctrl-popup-option';
      offOpt.textContent = 'Desativado';
      cc.menu.appendChild(offOpt);

      _subtitleTracks.forEach(function (t, i) {
        var trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = t.label;
        trackEl.srclang = t.lang;
        trackEl.src = t.src;
        video.appendChild(trackEl);

        var opt = document.createElement('button');
        opt.className = 'ctrl-popup-option';
        opt.textContent = t.label;
        opt.addEventListener('click', function () {
          selectTrack(i);
          try { localStorage.setItem('pflix_legenda_lang', t.lang); } catch (e) {}
        });
        cc.menu.appendChild(opt);
      });

      function selectTrack(idx) {
        for (var i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = (i === idx) ? 'showing' : 'disabled';
        }
        Array.prototype.forEach.call(cc.menu.querySelectorAll('.ctrl-popup-option'), function (el, i) {
          el.classList.toggle('active', i === idx + 1);
        });
        cc.wrap.classList.toggle('cc-active', idx !== -1);
      }
      offOpt.addEventListener('click', function () {
        selectTrack(-1);
        try { localStorage.setItem('pflix_legenda_lang', ''); } catch (e) {}
      });

      // Restaura o idioma preferido, se existir entre as faixas atuais
      var autoIdx = -1;
      if (lastLang) {
        for (var i = 0; i < _subtitleTracks.length; i++) {
          if (_subtitleTracks[i].lang === lastLang) { autoIdx = i; break; }
        }
      }
      // Dá um tick pro <track> registrar no textTracks antes de setar o modo
      setTimeout(function () { selectTrack(autoIdx); }, 0);
    }

    /* ── Qualidade (HLS) — só aparece com múltiplas renditions reais ── */
    var quality = makePopup(ICONS.quality, 'ctrl-quality');
    quality.wrap.style.display = 'none';
    function setQualityLevels(levels, hls, Hls) {
      quality.menu.innerHTML = '';
      if (!levels || levels.length < 2 || !hls || !Hls) { quality.wrap.style.display = 'none'; return; }
      quality.wrap.style.display = '';

      function label(lvl) { return lvl.height ? lvl.height + 'p' : Math.round(lvl.bitrate / 1000) + 'kbps'; }

      var autoOpt = document.createElement('button');
      autoOpt.className = 'ctrl-popup-option active';
      autoOpt.textContent = 'Automática';
      autoOpt.addEventListener('click', function () { hls.currentLevel = -1; markActive(-1); });
      quality.menu.appendChild(autoOpt);

      var sorted = levels.map(function (l, i) { return { lvl: l, idx: i }; }).sort(function (a, b) { return (b.lvl.height || 0) - (a.lvl.height || 0); });
      sorted.forEach(function (entry) {
        var opt = document.createElement('button');
        opt.className = 'ctrl-popup-option';
        opt.textContent = label(entry.lvl);
        opt.addEventListener('click', function () { hls.currentLevel = entry.idx; markActive(entry.idx); });
        quality.menu.appendChild(opt);
      });

      function markActive(levelIdx) {
        Array.prototype.forEach.call(quality.menu.querySelectorAll('.ctrl-popup-option'), function (el) { el.classList.remove('active'); });
        if (levelIdx === -1) { autoOpt.classList.add('active'); return; }
        var pos = sorted.findIndex(function (e) { return e.idx === levelIdx; });
        if (pos !== -1) quality.menu.children[pos + 1].classList.add('active');
      }
      hls.on(Hls.Events.LEVEL_SWITCHED, function (evt, data) {
        if (hls.autoLevelEnabled) { markActive(-1); } else { markActive(data.level); }
      });
    }

    /* ── Velocidade ── */
    var speed = makePopup('1x', 'ctrl-speed');
    var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    speeds.forEach(function (s) {
      var opt = document.createElement('button');
      opt.className = 'ctrl-popup-option' + (s === 1 ? ' active' : '');
      opt.textContent = s + 'x';
      opt.addEventListener('click', function () {
        video.playbackRate = s;
        speed.btn.innerHTML = s + 'x';
        Array.prototype.forEach.call(speed.menu.children, function (c) { c.classList.remove('active'); });
        opt.classList.add('active');
      });
      speed.menu.appendChild(opt);
    });

    /* ── Picture-in-Picture (só se suportado) ── */
    var pipBtn = null;
    if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
      pipBtn = document.createElement('button');
      pipBtn.className = 'ctrl-btn ctrl-pip-btn';
      pipBtn.setAttribute('aria-label', 'Picture-in-Picture');
      pipBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4v-2H5V9h14v6h-4v2h4c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-6 5h6v5h-6v-5z"/></svg>';
      pipBtn.addEventListener('click', function () {
        if (document.pictureInPictureElement) { document.exitPictureInPicture().catch(function () {}); }
        else { video.requestPictureInPicture().catch(function () {}); }
      });
      morePanel.appendChild(pipBtn);
    }

    return {
      setSubtitles: setSubtitles,
      setQualityLevels: setQualityLevels,
      refreshVolIcon: refreshVolIcon,
      adjustVolume: function (delta) {
        var v = Math.max(0, Math.min(1, (video.muted ? 0 : video.volume) + delta));
        video.volume = v; video.muted = v <= 0; volSlider.value = String(v);
        refreshVolIcon();
      },
      toggleMute: function () { volBtn.click(); },
      cycleSpeed: function () {
        var i = speeds.indexOf(video.playbackRate);
        var next = speeds[(i + 1) % speeds.length];
        video.playbackRate = next;
        speed.btn.innerHTML = next + 'x';
        Array.prototype.forEach.call(speed.menu.children, function (c, idx) { c.classList.toggle('active', speeds[idx] === next); });
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     Chromecast — wiring real do Cast SDK (antes só existia o
     botão no HTML, sem nenhum listener). Progressive enhancement:
     o botão só aparece se o framework realmente ficar disponível.
  ═══════════════════════════════════════════════════════════ */
  var _castGetMediaInfo = null; // função que retorna {src, titulo, capa} do player ATIVO na página
  function wireCast(getMediaInfo) {
    _castGetMediaInfo = getMediaInfo;
    if (window.__pflixCastReady) { _activateCastBtn(); }
  }
  function _activateCastBtn() {
    var castBtn = document.getElementById('castBtn');
    if (!castBtn || castBtn._wired) return;
    castBtn._wired = true;
    castBtn.style.display = 'flex';
    castBtn.addEventListener('click', function () {
      if (!_castGetMediaInfo) return;
      var info = _castGetMediaInfo();
      if (!info || !info.src) return;
      var ctx = cast.framework.CastContext.getInstance();
      var session = ctx.getCurrentSession();
      if (session) { session.endSession(true); return; }
      ctx.requestSession().then(function () {
        var activeSession = ctx.getCurrentSession();
        if (!activeSession) return;
        var mediaInfo = new chrome.cast.media.MediaInfo(info.src, 'video/mp4');
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = info.titulo || 'PipocaFlix';
        if (info.capa) mediaInfo.metadata.images = [{ url: info.capa }];
        var request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.currentTime = info.currentTime || 0;
        activeSession.loadMedia(request).catch(function (err) {
          console.warn('[Cast] Falha ao carregar mídia:', err);
        });
      }).catch(function () { /* usuário cancelou o seletor de dispositivo — ok, sem erro */ });
    });
    // Ativa o estado visual ".casting" (pulso vermelho) que já existia no
    // CSS mas nunca tinha sido ligado a nenhum evento real do SDK.
    try {
      cast.framework.CastContext.getInstance().addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        function (e) {
          var active = e.sessionState === cast.framework.SessionState.SESSION_STARTED ||
                       e.sessionState === cast.framework.SessionState.SESSION_RESUMED;
          castBtn.classList.toggle('casting', active);
        }
      );
    } catch (e) {}
  }
  // Callback global exigido pelo Cast Sender SDK (cast_sender.js chama
  // isso quando o framework termina de inicializar, o que pode acontecer
  // antes OU depois deste arquivo rodar — por isso o flag window.__pflixCastReady.
  window['__onGCastApiAvailable'] = function (isAvailable) {
    if (!isAvailable || !window.chrome || !window.chrome.cast) return;
    try {
      cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
      });
      window.__pflixCastReady = true;
      _activateCastBtn();
    } catch (e) { console.warn('[Cast] Falha ao inicializar framework:', e); }
  };

  /* ═══════════════════════════════════════════════════════════
     Atalhos de teclado — só respondem quando o player está
     realmente visível na viewport e nenhum player alternativo
     (iframe de terceiro) está aberto por cima.
  ═══════════════════════════════════════════════════════════ */
  function setupKeyboardShortcuts(video, playerBox, toggleFullscreen, controlsApi, container) {
    function playerIsActive() {
      if (playerBox.style.display === 'none') return false;
      if (document.getElementById('altPlayerWrap')) return false; // player alternativo (iframe) aberto
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
      var rect = playerBox.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      return rect.bottom > 0 && rect.top < vh && rect.width > 0;
    }

    document.addEventListener('keydown', function (e) {
      if (!playerIsActive()) return;
      switch (e.key) {
        case ' ': case 'k':
          e.preventDefault();
          if (video.paused) { video.play(); showPlayerToast(container, 'Reproduzindo', 'play'); }
          else { video.pause(); showPlayerToast(container, 'Pausado', 'pause'); }
          break;
        case 'ArrowLeft': case 'j':
          video.currentTime = Math.max(0, video.currentTime - 10);
          showPlayerToast(container, '−10s', 'back10');
          break;
        case 'ArrowRight': case 'l':
          video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10);
          showPlayerToast(container, '+10s', 'fwd10');
          break;
        case 'ArrowUp':
          e.preventDefault();
          controlsApi.adjustVolume(0.1);
          showPlayerToast(container, 'Volume ' + Math.round((video.muted ? 0 : video.volume) * 100) + '%', volIconKey(video));
          break;
        case 'ArrowDown':
          e.preventDefault();
          controlsApi.adjustVolume(-0.1);
          showPlayerToast(container, 'Volume ' + Math.round((video.muted ? 0 : video.volume) * 100) + '%', volIconKey(video));
          break;
        case 'm':
          controlsApi.toggleMute();
          showPlayerToast(container, video.muted ? 'Mudo' : 'Som ativado', volIconKey(video));
          break;
        case 'f':
          toggleFullscreen();
          break;
      }
    });

    function volIconKey(video) {
      if (video.muted || video.volume <= 0) return 'muted';
      if (video.volume < 0.5) return 'volDown';
      return 'volUp';
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Fullscreen (com lock de orientação em mobile, quando suportado)
  ═══════════════════════════════════════════════════════════ */
  function makeFullscreenToggle(playerBox, video) {
    function isFs() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    }
    function toggle() {
      if (!isFs()) {
        var req = playerBox.requestFullscreen || playerBox.webkitRequestFullscreen || playerBox.mozRequestFullScreen;
        if (req) req.call(playerBox);
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function () {});
        }
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exit) exit.call(document);
        if (screen.orientation && screen.orientation.unlock) {
          try { screen.orientation.unlock(); } catch (e) {}
        }
      }
    }
    return toggle;
  }

  /* ═══════════════════════════════════════════════════════════
     Cartão "Próximo episódio" — miniatura + anel de contagem
     regressiva com auto-avanço (cancelável).
  ═══════════════════════════════════════════════════════════ */
  function makeNextEpController(playerBox) {
    var card = document.createElement('div');
    card.className = 'next-ep-card';
    card.innerHTML =
      '<button class="next-ep-cancel" aria-label="Cancelar próximo episódio">' + ICONS.close + '</button>' +
      '<div class="next-ep-thumb-wrap"><img class="next-ep-thumb" alt=""></div>' +
      '<div class="next-ep-body">' +
        '<div class="next-ep-label">A seguir</div>' +
        '<div class="next-ep-title"></div>' +
        '<button class="next-ep-btn">' +
          '<svg class="next-ep-ring" viewBox="0 0 46 46">' +
            '<circle class="next-ep-ring-bg" cx="23" cy="23" r="20"/>' +
            '<circle class="next-ep-ring-progress" cx="23" cy="23" r="20"/>' +
          '</svg>' +
          '<span>Próximo episódio</span>' + ICONS.chevRight +
        '</button>' +
      '</div>';
    playerBox.appendChild(card);

    var cancelBtn = card.querySelector('.next-ep-cancel');
    var thumbEl = card.querySelector('.next-ep-thumb');
    var titleEl = card.querySelector('.next-ep-title');
    var goBtn = card.querySelector('.next-ep-btn');
    var ring = card.querySelector('.next-ep-ring-progress');

    var _onAdvance = null, _pendingMeta = null, _timer = null,
        _dismissed = false, _shown = false, _fallbackThumb = '';

    function reset() {
      _dismissed = false; _shown = false;
      clearTimeout(_timer);
      card.classList.remove('visible', 'counting');
    }

    function hide() {
      if (!_shown) return;
      _shown = false;
      clearTimeout(_timer);
      card.classList.remove('visible', 'counting');
    }

    // Só mostra o cartão se de fato existir um próximo episódio configurado
    // (setCallback foi chamado com uma função válida, não null).
    function show() {
      if (_dismissed || _shown || !_onAdvance) return;
      _shown = true;
      var meta = _pendingMeta || {};
      titleEl.textContent = meta.label || 'Próximo episódio';
      var thumbSrc = meta.thumb || _fallbackThumb;
      if (thumbSrc) { thumbEl.src = thumbSrc; thumbEl.style.display = ''; }
      else { thumbEl.style.display = 'none'; }
      card.classList.add('visible');
      requestAnimationFrame(function () {
        ring.style.animationDuration = NEXT_EP_AUTOPLAY_MS + 'ms';
        card.classList.add('counting');
      });
      clearTimeout(_timer);
      _timer = setTimeout(function () {
        if (_onAdvance) _onAdvance();
      }, NEXT_EP_AUTOPLAY_MS);
    }

    cancelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _dismissed = true;
      hide();
    });
    goBtn.addEventListener('click', function () {
      clearTimeout(_timer);
      if (_onAdvance) _onAdvance();
    });

    return {
      setCallback: function (fn, meta) {
        _onAdvance = fn || null;
        _pendingMeta = meta || null;
      },
      updateMeta: function (meta) {
        if (!meta) return;
        _pendingMeta = _pendingMeta || {};
        if (meta.label) _pendingMeta.label = meta.label;
        if (meta.thumb) _pendingMeta.thumb = meta.thumb;
        if (_shown) {
          if (meta.label) titleEl.textContent = meta.label;
          if (meta.thumb) { thumbEl.src = meta.thumb; thumbEl.style.display = ''; }
        }
      },
      setFallbackThumb: function (src) { _fallbackThumb = src || ''; },
      hasCallback: function () { return !!_onAdvance; },
      show: show,
      hide: hide,
      reset: reset,
      isShown: function () { return _shown; }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     Núcleo compartilhado entre filme (initControls) e série
     (initSeriePlayer) — evita duplicar toda a lógica de player.
  ═══════════════════════════════════════════════════════════ */
  function setupCore(opts) {
    var video = document.getElementById(opts.videoId);
    var overlay = document.getElementById(opts.overlayId);
    var centerPlay = document.getElementById(opts.centerPlayId);
    var centerPlayPath = document.getElementById('centerPlayPath');
    var controlsEl = document.getElementById(opts.controlsId);
    var playerBox = document.getElementById(opts.playerBoxId);
    var progress = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl = document.getElementById('currentTime');
    var totalTimeEl = document.getElementById('totalTime');
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var back10Btn = document.getElementById('back10');
    var forward10Btn = document.getElementById('forward10');
    var playerHeader = playerBox.querySelector('.player-header');
    var centerControlsEl = playerBox.querySelector('.player-center-controls');
    var ctrlRow = controlsEl.querySelector('.player-ctrl-row');
    var legacyPlayPause = document.getElementById('playPause');
    var legacyPlayPausePath = document.getElementById('playPausePath');

    var state = { hls: null };
    var controlsApi = buildExtraControls(ctrlRow, video, playerBox, state);
    var progressApi = enhanceProgressBar(progress, progressFilled, video, playerBox);
    var toggleFullscreen = makeFullscreenToggle(playerBox, video);
    var toastContainer = playerBox;

    setupKeyboardShortcuts(video, playerBox, toggleFullscreen, controlsApi, toastContainer);
    wireCast(function () {
      return { src: video.currentSrc || video.src, titulo: _curTitulo, capa: _curCapa, currentTime: video.currentTime };
    });

    var _curTitulo = '', _curCapa = '', _serieNome = '', _tipo = opts.isSerie ? 'serie' : 'filme';

    function saveProgressNow() {
      if (!_curTitulo || !video.duration || !isFinite(video.duration)) return;
      progressSave(_curTitulo, video.currentTime, video.duration, _curCapa, _tipo, _serieNome);
    }
    var _saveInterval = setInterval(function () { if (!video.paused) saveProgressNow(); }, PROGRESS_SAVE_INTERVAL);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saveProgressNow(); });
    window.addEventListener('pagehide', saveProgressNow);
    window.addEventListener('beforeunload', saveProgressNow);
    video.addEventListener('pause', saveProgressNow);

    /* ── Play / pause ── */
    function setPlayIcon(isPlaying) {
      if (centerPlayPath) centerPlayPath.setAttribute('d', isPlaying ? 'M6 5h4v14H6V5zm8 0h4v14h-4V5z' : 'M8 5v14l11-7z');
      if (legacyPlayPausePath) legacyPlayPausePath.setAttribute('d', isPlaying ? 'M6 5h4v14H6V5zm8 0h4v14h-4V5z' : 'M8 5v14l11-7z');
      centerPlay.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproduzir');
    }
    function togglePlay() {
      if (video.paused) video.play().catch(function () {});
      else video.pause();
    }

    centerPlay.addEventListener('click', togglePlay);
    if (legacyPlayPause) legacyPlayPause.addEventListener('click', togglePlay);
    video.addEventListener('play', function () { setPlayIcon(true); overlay.classList.add('hidden'); showControlsUI(); });
    video.addEventListener('pause', function () { setPlayIcon(false); showChromeAlways(); });

    /* ── Chrome do player (header + controles centrais + barra
       inferior) aparece com interação e some junto durante a
       reprodução após alguns segundos parado — como em qualquer
       player "top" (Netflix/YouTube/Disney+). Fica sempre visível
       pausado ou com algum menu (velocidade/CC/qualidade) aberto. ── */
    var _controlsHideTimer = null;
    function setChromeHidden(hidden) {
      controlsEl.classList.toggle('hidden', hidden);
      if (playerHeader) playerHeader.classList.toggle('hidden', hidden);
      if (centerControlsEl) centerControlsEl.classList.toggle('hidden', hidden);
    }
    function showChromeAlways() {
      clearTimeout(_controlsHideTimer);
      setChromeHidden(false);
    }
    function showControlsUI() {
      setChromeHidden(false);
      clearTimeout(_controlsHideTimer);
      if (!video.paused) {
        _controlsHideTimer = setTimeout(function () {
          if (playerBox.querySelector('.ctrl-popup.open, .ctrl-more-wrap.open')) { showControlsUI(); return; }
          setChromeHidden(true);
        }, 3000);
      }
    }
    playerBox.addEventListener('mousemove', showControlsUI);
    playerBox.addEventListener('touchstart', showControlsUI, { passive: true });
    playerBox.addEventListener('click', showControlsUI);

    back10Btn.addEventListener('click', function () {
      video.currentTime = Math.max(0, video.currentTime - 10);
      showTapFeedback(playerBox, '10s', 'left', 'back10');
    });
    forward10Btn.addEventListener('click', function () {
      video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10);
      showTapFeedback(playerBox, '10s', 'right', 'fwd10');
    });
    playerBox.addEventListener('dblclick', function (e) {
      var rect = playerBox.getBoundingClientRect();
      var half = rect.width / 2;
      var x = e.clientX - rect.left;
      if (x < half) { video.currentTime = Math.max(0, video.currentTime - 10); showTapFeedback(playerBox, '10s', 'left', 'back10'); }
      else { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10); showTapFeedback(playerBox, '10s', 'right', 'fwd10'); }
    });

    fullscreenBtn.addEventListener('click', toggleFullscreen);

    var backBtn = document.getElementById('playerBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        video.pause();
        playerBox.style.display = 'none';
        var section = document.getElementById('playerSection');
        if (section && opts.isSerie) section.style.display = 'none';
      });
    }

    /* ── Tempo / progresso ── */
    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      currentTimeEl.textContent = formatTime(video.currentTime);
      totalTimeEl.textContent = '-' + formatTime(video.duration - video.currentTime);
    });
    video.addEventListener('loadedmetadata', function () {
      totalTimeEl.textContent = formatTime(video.duration);
    });

    video.addEventListener('waiting', function () { playerBox.classList.add('buffering'); });
    video.addEventListener('playing', function () { playerBox.classList.remove('buffering'); });
    video.addEventListener('canplay', function () { playerBox.classList.remove('buffering'); });

    video.addEventListener('error', function () {
      var textEl = overlay.querySelector('.player-overlay-text');
      if (textEl) textEl.textContent = '⚠️ Não foi possível reproduzir este vídeo. Tente um player alternativo abaixo.';
      overlay.classList.remove('hidden');
    });

    overlay.addEventListener('click', function () {
      video.play().catch(function () {});
    });

    /* ── Resume toast ── */
    function showResumeToast(savedTime, onResume, onRestart) {
      var old = playerBox.querySelector('.resume-toast');
      if (old) old.remove();
      var el = document.createElement('div');
      el.className = 'resume-toast';
      el.innerHTML =
        '<span class="resume-toast-text">Continuar de ' + formatTime(savedTime) + '?</span>' +
        '<span class="resume-toast-btns">' +
          '<button class="btn-resume">Continuar</button>' +
          '<button class="btn-restart">Do início</button>' +
        '</span>';
      playerBox.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('show'); });
      var autoHide = setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 8000);
      el.querySelector('.btn-resume').addEventListener('click', function () {
        clearTimeout(autoHide);
        video.currentTime = savedTime;
        video.play().catch(function () {});
        el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300);
        if (onResume) onResume();
      });
      el.querySelector('.btn-restart').addEventListener('click', function () {
        clearTimeout(autoHide);
        video.currentTime = 0;
        video.play().catch(function () {});
        el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300);
        if (onRestart) onRestart();
      });
    }

    /* ── VIP badge dourado no header (só quando aplicável) ── */
    var vipBadge = null;
    function ensureVipBadge() {
      if (!playerHeader) return;
      var ativo = !!(window.PipocaVIP && window.PipocaVIP.ativo);
      if (ativo && !vipBadge) {
        vipBadge = document.createElement('span');
        vipBadge.className = 'player-header-vip-badge';
        vipBadge.textContent = 'VIP';
        var titleEl = playerHeader.querySelector('.player-header-title');
        if (titleEl) playerHeader.insertBefore(vipBadge, titleEl.nextSibling);
        else playerHeader.appendChild(vipBadge);
      } else if (!ativo && vipBadge) {
        vipBadge.remove(); vipBadge = null;
      }
    }
    ensureVipBadge();
    document.addEventListener('pflix:vip-checado', ensureVipBadge);

    /* ── API pública do núcleo ── */
    function setSource(src, titulo, capa, legendas, serieNome) {
      _curTitulo = titulo || ''; _curCapa = capa || ''; _serieNome = serieNome || '';
      loadSource(video, src, state, controlsApi.setQualityLevels);
      controlsApi.setSubtitles(legendas || []);
      progressApi.onSourceChanged();
      video.poster = capa || '';

      var saved = titulo ? progressGet(titulo) : null;
      if (saved && saved.currentTime > 10 && saved.pct < 0.95) {
        video.addEventListener('loadedmetadata', function onceLoaded() {
          video.removeEventListener('loadedmetadata', onceLoaded);
          showResumeToast(saved.currentTime);
        });
      }
    }

    return {
      video: video, playerBox: playerBox, overlay: overlay, controlsEl: controlsEl,
      controlsApi: controlsApi, setSource: setSource, saveProgressNow: saveProgressNow,
      togglePlay: togglePlay, toastContainer: toastContainer,
      destroy: function () { clearInterval(_saveInterval); }
    };
  }

  /* ═══════════════════════════════════════════════════════════
     API pública: initControls (filme), initSeriePlayer (série)
  ═══════════════════════════════════════════════════════════ */
  function initControls(opts) {
    var core = setupCore({
      videoId: opts.videoId, overlayId: opts.overlayId, centerPlayId: opts.centerPlayId,
      controlsId: opts.controlsId, playerBoxId: opts.playerBoxId, isSerie: false
    });
    core.setSource(opts.src || '', opts.titulo || '', opts.capa || '', opts.legendas || [], '');
    return core;
  }

  function initSeriePlayer(opts) {
    var core = setupCore({
      videoId: opts.videoId, overlayId: opts.overlayId, centerPlayId: opts.centerPlayId,
      controlsId: opts.controlsId, playerBoxId: opts.playerBoxId, isSerie: true
    });
    var nextEp = makeNextEpController(core.playerBox);

    core.video.addEventListener('timeupdate', function () {
      if (!core.video.duration) return;
      var remaining = core.video.duration - core.video.currentTime;
      if (remaining <= NEXT_EP_TRIGGER_SECONDS && remaining > 0 && !core.video.paused) {
        nextEp.show(); // no-op se já visível, cancelado, ou sem próximo episódio
      }
    });
    core.video.addEventListener('pause', function () { nextEp.hide(); });
    core.video.addEventListener('ended', function () { nextEp.hide(); });

    function loadEpisode(src, titulo, capa, legendas) {
      nextEp.reset();
      nextEp.setFallbackThumb(capa || '');
      var titleEl = document.getElementById(opts.titleId);
      if (titleEl) titleEl.textContent = titulo || '';
      core.setSource(src, titulo, capa, legendas || [], (titulo || '').split(' — ')[0] || titulo);
      core.playerBox.style.display = 'block';
      core.overlay.classList.remove('hidden');
      core.controlsEl.classList.add('hidden');
    }

    return {
      loadEpisode: loadEpisode,
      setNextEpCallback: function (fn, meta) { nextEp.setCallback(fn, meta); },
      updateNextEpMeta: function (meta) { nextEp.updateMeta(meta); },
      video: core.video
    };
  }

  // Mantido por compatibilidade — não é usado por nenhuma página atualmente.
  function initFilmePlayer(opts) {
    return initControls(opts);
  }

  return { initFilmePlayer: initFilmePlayer, initSeriePlayer: initSeriePlayer, initControls: initControls, formatTime: formatTime };
})();
