/**
 * PIPOCAFLIX - player.js v3.0
 * Melhorias: volume, velocidade, barra aprimorada, buffering,
 * PiP, atalhos de teclado, gradiente, próximo episódio (série)
 */

window.PipocaPlayer = (function () {
  'use strict';

  /* ─── Helpers ─── */
  function formatTime(t) {
    if (!t || isNaN(t)) return '0:00';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function volIcon(vol, muted) {
    if (muted || vol === 0) return '🔇';
    if (vol < 0.5)          return '🔉';
    return '🔊';
  }

  /* ─── Toast do player ─── */
  function showPlayerToast(container, msg) {
    var t = container.querySelector('.player-toast-inner');
    if (!t) {
      t = document.createElement('div');
      t.className = 'player-toast-inner';
      t.style.cssText = [
        'position:absolute','top:50%','left:50%',
        'transform:translate(-50%,-50%)',
        'background:rgba(0,0,0,0.75)','color:#fff',
        'padding:10px 22px','border-radius:30px',
        'font-size:1rem','font-weight:600',
        'pointer-events:none','z-index:200',
        'opacity:0','transition:opacity 0.2s',
        'white-space:nowrap'
      ].join(';');
      container.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1500);
  }

  /* ─── Spinner de buffering ─── */
  function injectSpinnerCSS() {
    if (document.getElementById('pipoca-spinner-css')) return;
    var s = document.createElement('style');
    s.id = 'pipoca-spinner-css';
    s.textContent = [
      '@keyframes pipoca-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}',
      '.player-buffer-spinner{',
        'position:absolute;top:50%;left:50%;',
        'width:52px;height:52px;',
        'border:4px solid rgba(255,255,255,0.15);',
        'border-top-color:var(--red,#ff2d43);',
        'border-radius:50%;',
        'transform:translate(-50%,-50%);',
        'animation:pipoca-spin 0.8s linear infinite;',
        'pointer-events:none;z-index:50;',
        'display:none;',
      '}',
      /* Volume slider */
      '.ctrl-vol-wrap{position:relative;display:flex;align-items:center;gap:4px;}',
      '.ctrl-vol-slider{',
        'display:none;position:absolute;bottom:110%;left:50%;',
        'transform:translateX(-50%);',
        'width:32px;height:90px;',
        'background:rgba(13,13,20,0.92);',
        'border:1px solid rgba(255,255,255,0.12);',
        'border-radius:20px;padding:8px 0;',
        'align-items:center;justify-content:center;',
        'flex-direction:column;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.7);',
        'z-index:100;',
      '}',
      '.ctrl-vol-wrap:hover .ctrl-vol-slider{display:flex;}',
      '.ctrl-vol-slider input[type=range]{',
        'writing-mode:vertical-lr;direction:rtl;',
        'width:4px;height:70px;',
        'accent-color:var(--red,#ff2d43);cursor:pointer;',
      '}',
      /* Speed menu */
      '.ctrl-speed-wrap{position:relative;}',
      '.ctrl-speed-btn{',
        'background:rgba(255,255,255,0.08);',
        'border:1px solid rgba(255,255,255,0.15);',
        'color:#fff;padding:3px 8px;border-radius:6px;',
        'font-size:0.7rem;font-weight:700;cursor:pointer;',
        'font-family:inherit;white-space:nowrap;',
        'transition:background 0.15s;',
      '}',
      '.ctrl-speed-btn:hover{background:var(--red,#ff2d43);}',
      '.ctrl-speed-menu{',
        'display:none;position:absolute;bottom:110%;left:50%;',
        'transform:translateX(-50%);',
        'background:rgba(13,13,20,0.95);',
        'border:1px solid rgba(255,255,255,0.12);',
        'border-radius:10px;overflow:hidden;',
        'min-width:80px;',
        'box-shadow:0 8px 32px rgba(0,0,0,0.7);z-index:100;',
      '}',
      '.ctrl-speed-wrap.open .ctrl-speed-menu{display:block;}',
      '.ctrl-speed-option{',
        'display:block;width:100%;padding:7px 16px;',
        'background:none;border:none;color:#ccc;',
        'font-size:0.8rem;cursor:pointer;text-align:center;',
        'transition:background 0.1s,color 0.1s;font-family:inherit;',
      '}',
      '.ctrl-speed-option:hover,.ctrl-speed-option.active{',
        'background:var(--red,#ff2d43);color:#fff;',
      '}',
      /* Progress thumb */
      '.player-progress{cursor:pointer;position:relative;}',
      '.player-progress-thumb{',
        'position:absolute;top:50%;right:calc(100% - var(--pct,0%) - 6px);',
        'width:12px;height:12px;',
        'background:var(--red,#ff2d43);border-radius:50%;',
        'transform:translateY(-50%);',
        'opacity:0;transition:opacity 0.15s;pointer-events:none;',
        'box-shadow:0 0 8px var(--red-glow,rgba(255,45,67,.5));',
      '}',
      '.player-progress:hover .player-progress-thumb{opacity:1;}',
      /* Time tooltip */
      '.player-progress-tooltip{',
        'position:absolute;bottom:calc(100% + 8px);',
        'background:rgba(0,0,0,0.85);color:#fff;',
        'font-size:0.7rem;padding:3px 8px;border-radius:5px;',
        'pointer-events:none;opacity:0;transition:opacity 0.15s;',
        'white-space:nowrap;transform:translateX(-50%);',
        'z-index:10;',
      '}',
      '.player-progress:hover .player-progress-tooltip{opacity:1;}',
      /* Controls gradient */
      '.player-controls{',
        'background:linear-gradient(0deg,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.55) 60%,transparent 100%) !important;',
        'padding-top:24px !important;',
      '}',
      /* PiP button */
      '.ctrl-pip-btn{display:none;}',
      /* Next episode card */
      '.next-ep-card{',
        'position:absolute;bottom:80px;right:16px;',
        'background:rgba(13,13,20,0.95);',
        'border:1px solid rgba(255,255,255,0.15);',
        'border-radius:12px;padding:12px 16px;',
        'display:none;flex-direction:column;gap:8px;',
        'min-width:200px;max-width:260px;',
        'z-index:90;box-shadow:0 8px 32px rgba(0,0,0,0.7);',
        'animation:card-in 0.3s ease both;',
      '}',
      '.next-ep-label{font-size:0.7rem;color:rgba(255,255,255,0.5);letter-spacing:0.5px;}',
      '.next-ep-btn{',
        'background:var(--red,#ff2d43);border:none;',
        'color:#fff;padding:8px 14px;border-radius:8px;',
        'font-size:0.8rem;font-weight:700;cursor:pointer;',
        'font-family:inherit;transition:transform 0.15s;',
      '}',
      '.next-ep-btn:hover{transform:scale(1.04);}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ─── Construção dos controles extras ─── */
  function buildExtraControls(ctrlRow, video, playerBox, isSerieCtx) {
    injectSpinnerCSS();

    // Spinner buffering
    var spinner = document.createElement('div');
    spinner.className = 'player-buffer-spinner';
    playerBox.appendChild(spinner);
    video.addEventListener('waiting',  function () { spinner.style.display = 'block'; });
    video.addEventListener('playing',  function () { spinner.style.display = 'none'; });
    video.addEventListener('canplay',  function () { spinner.style.display = 'none'; });

    // Volume
    var volWrap = document.createElement('div');
    volWrap.className = 'ctrl-vol-wrap';
    var volBtn = document.createElement('button');
    volBtn.className = 'ctrl-btn';
    volBtn.style.fontSize = '1rem';
    volBtn.innerHTML = volIcon(video.volume, video.muted);
    volBtn.title = 'Volume';

    var volSliderWrap = document.createElement('div');
    volSliderWrap.className = 'ctrl-vol-slider';
    var volRange = document.createElement('input');
    volRange.type = 'range';
    volRange.min = '0'; volRange.max = '1'; volRange.step = '0.05';
    volRange.value = video.volume;
    volSliderWrap.appendChild(volRange);
    volWrap.appendChild(volBtn);
    volWrap.appendChild(volSliderWrap);

    function updateVolIcon() {
      volBtn.innerHTML = volIcon(video.volume, video.muted);
    }
    volBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      updateVolIcon();
    });
    volRange.addEventListener('input', function () {
      video.volume = parseFloat(volRange.value);
      video.muted = video.volume === 0;
      updateVolIcon();
    });
    video.addEventListener('volumechange', function () {
      volRange.value = video.muted ? 0 : video.volume;
      updateVolIcon();
    });

    // Velocidade
    var speedWrap = document.createElement('div');
    speedWrap.className = 'ctrl-speed-wrap';
    var speedBtn = document.createElement('button');
    speedBtn.className = 'ctrl-speed-btn';
    speedBtn.textContent = '1x';
    var speedMenu = document.createElement('div');
    speedMenu.className = 'ctrl-speed-menu';
    [0.5, 0.75, 1, 1.25, 1.5, 2].forEach(function (rate) {
      var opt = document.createElement('button');
      opt.className = 'ctrl-speed-option' + (rate === 1 ? ' active' : '');
      opt.textContent = rate + 'x';
      opt.addEventListener('click', function () {
        video.playbackRate = rate;
        speedBtn.textContent = rate + 'x';
        speedMenu.querySelectorAll('.ctrl-speed-option').forEach(function (o) { o.classList.remove('active'); });
        opt.classList.add('active');
        speedWrap.classList.remove('open');
      });
      speedMenu.appendChild(opt);
    });
    speedBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      speedWrap.classList.toggle('open');
    });
    document.addEventListener('click', function () { speedWrap.classList.remove('open'); });
    speedWrap.appendChild(speedBtn);
    speedWrap.appendChild(speedMenu);

    // PiP
    var pipBtn = document.createElement('button');
    pipBtn.className = 'ctrl-btn ctrl-pip-btn';
    pipBtn.title = 'Picture-in-Picture';
    pipBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 7H5a2 2 0 00-2 2v6a2 2 0 002 2h2v-4h8v4h4a2 2 0 002-2V9a2 2 0 00-2-2z"/><rect x="11" y="13" width="8" height="5" rx="1"/></svg>';
    if (document.pictureInPictureEnabled) {
      pipBtn.style.display = 'flex';
      pipBtn.addEventListener('click', function () {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(function(){});
        } else {
          video.requestPictureInPicture().catch(function(){});
        }
      });
    }

    // Inserir na ctrlRow: volWrap + speedWrap + pipBtn antes do fullscreen
    var fsBtn = ctrlRow.querySelector('#fullscreenBtn');
    if (fsBtn) {
      ctrlRow.insertBefore(pipBtn, fsBtn);
      ctrlRow.insertBefore(speedWrap, pipBtn);
      ctrlRow.insertBefore(volWrap, speedWrap);
    } else {
      ctrlRow.appendChild(volWrap);
      ctrlRow.appendChild(speedWrap);
      ctrlRow.appendChild(pipBtn);
    }

    return { spinner: spinner };
  }

  /* ─── Barra de progresso aprimorada ─── */
  function enhanceProgressBar(progress, progressFilled, video, container) {
    // Thumb
    var thumb = document.createElement('div');
    thumb.className = 'player-progress-thumb';
    progress.appendChild(thumb);

    // Tooltip
    var tooltip = document.createElement('div');
    tooltip.className = 'player-progress-tooltip';
    tooltip.textContent = '0:00';
    progress.appendChild(tooltip);

    // Atualizar thumb position
    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      var pct = (video.currentTime / video.duration) * 100;
      progressFilled.style.width = pct + '%';
      thumb.style.setProperty('--pct', pct + '%');
      // reposição real
      thumb.style.left = 'calc(' + pct + '% - 6px)';
      thumb.style.right = 'auto';
    });

    // Tooltip on hover
    progress.addEventListener('mousemove', function (e) {
      if (!video.duration) return;
      var rect = progress.getBoundingClientRect();
      var pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      tooltip.textContent = formatTime(pos * video.duration);
      tooltip.style.left = (pos * rect.width) + 'px';
    });

    // Drag support
    var dragging = false;
    function seek(e) {
      if (!video.duration) return;
      var rect = progress.getBoundingClientRect();
      var pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = pos * video.duration;
    }
    progress.addEventListener('mousedown', function (e) { dragging = true; seek(e); });
    document.addEventListener('mousemove', function (e) { if (dragging) seek(e); });
    document.addEventListener('mouseup',   function ()  { dragging = false; });
  }

  /* ─── Atalhos de teclado ─── */
  function setupKeyboardShortcuts(video, playerBox, fullscreenFn) {
    document.addEventListener('keydown', function (e) {
      // Não disparar se foco em input/textarea
      var tag = (document.activeElement || {}).tagName || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (playerBox.style.display === 'none') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (video.paused) { video.play(); showPlayerToast(playerBox, '▶ Play'); }
          else              { video.pause(); showPlayerToast(playerBox, '⏸ Pausa'); }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          showPlayerToast(playerBox, '⏪ −10s');
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          showPlayerToast(playerBox, '⏩ +10s');
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          video.muted = false;
          showPlayerToast(playerBox, '🔊 ' + Math.round(video.volume * 100) + '%');
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          showPlayerToast(playerBox, '🔉 ' + Math.round(video.volume * 100) + '%');
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (fullscreenFn) fullscreenFn();
          showPlayerToast(playerBox, '⛶ Tela Cheia');
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          video.muted = !video.muted;
          showPlayerToast(playerBox, video.muted ? '🔇 Mudo' : '🔊 Som');
          break;
      }
    });
  }

  /* ─── Fullscreen helper ─── */
  function makeFullscreenToggle(playerBox) {
    var isFs = false;
    function toggle() {
      if (!isFs) {
        var req = playerBox.requestFullscreen || playerBox.webkitRequestFullscreen || playerBox.mozRequestFullScreen;
        if (req) req.call(playerBox);
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function(){});
        }
        isFs = true;
      } else {
        var ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (ex) ex.call(document);
        isFs = false;
      }
    }
    document.addEventListener('fullscreenchange',       function () { if (!document.fullscreenElement)       isFs = false; });
    document.addEventListener('webkitfullscreenchange', function () { if (!document.webkitFullscreenElement) isFs = false; });
    return toggle;
  }

  /* ─────────────────────────────────────────────
     initControls — usado após VAST em filme.html
  ───────────────────────────────────────────── */
  function initControls(opts) {
    injectSpinnerCSS();
    var playerBox  = document.getElementById(opts.playerBoxId || 'playerBox');
    var video      = document.getElementById(opts.videoId     || 'video');
    var overlay    = document.getElementById(opts.overlayId   || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId|| 'centerPlay');
    var controls   = document.getElementById(opts.controlsId  || 'playerControls');
    var ctrlRow    = controls.querySelector('.player-ctrl-row');
    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');

    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      centerPlay.style.pointerEvents = 'none';
      controls.classList.remove('hidden');
      video.play().catch(function(){});
    }
    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    var playPauseBtn  = document.getElementById('playPause');
    var playPausePath = document.getElementById('playPausePath');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', function () {
        if (video.paused) { video.play(); }
        else              { video.pause(); }
      });
      video.addEventListener('play',  function () { if(playPausePath) playPausePath.setAttribute('d','M6 5h4v14H6V5zm8 0h4v14h-4V5z'); });
      video.addEventListener('pause', function () { if(playPausePath) playPausePath.setAttribute('d','M8 5v14l11-7z'); });
    }

    var back10 = document.getElementById('back10');
    var fwd10  = document.getElementById('forward10');
    if (back10) back10.onclick = function () { video.currentTime = Math.max(0, video.currentTime - 10); };
    if (fwd10)  fwd10.onclick  = function () { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      currentTimeEl.textContent = formatTime(video.currentTime);
      totalTimeEl.textContent   = formatTime(video.duration);
    });

    // Barra de progresso aprimorada
    if (progress && progressFilled) {
      enhanceProgressBar(progress, progressFilled, video, playerBox);
    }

    var toggleFs = makeFullscreenToggle(playerBox);
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFs);

    // Controles extras
    if (ctrlRow) buildExtraControls(ctrlRow, video, playerBox, false);

    // Atalhos de teclado
    setupKeyboardShortcuts(video, playerBox, toggleFs);

    // Auto-hide
    var hideTimer;
    playerBox.addEventListener('mousemove', function () {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { controls.classList.add('hidden'); }, 2500);
    });
    playerBox.addEventListener('mouseleave', function () {
      if (!video.paused) controls.classList.add('hidden');
    });
  }

  /* ─────────────────────────────────────────────
     initSeriePlayer — séries com próximo episódio
  ───────────────────────────────────────────── */
  function initSeriePlayer(opts) {
    injectSpinnerCSS();
    var video      = document.getElementById(opts.videoId      || 'video');
    var overlay    = document.getElementById(opts.overlayId    || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId || 'centerPlay');
    var controls   = document.getElementById(opts.controlsId   || 'playerControls');
    var playerBox  = document.getElementById(opts.playerBoxId  || 'playerBox');
    var titleEl    = document.getElementById(opts.titleId      || 'playerTitle');
    var ctrlRow    = controls.querySelector('.player-ctrl-row');

    var playPauseBtn   = document.getElementById('playPause');
    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');

    // Próximo episódio card
    var nextEpCard = document.createElement('div');
    nextEpCard.className = 'next-ep-card';
    nextEpCard.innerHTML = '<div class="next-ep-label">A SEGUIR</div><button class="next-ep-btn" id="nextEpBtn">Próximo Episódio →</button>';
    playerBox.appendChild(nextEpCard);

    var _onNextEp = null; // callback definido externamente
    document.getElementById('nextEpBtn').addEventListener('click', function () {
      nextEpCard.style.display = 'none';
      if (_onNextEp) _onNextEp();
    });

    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      centerPlay.style.pointerEvents = 'none';
      controls.classList.remove('hidden');
      video.play().catch(function(){});
    }
    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    if (playPauseBtn) {
      playPauseBtn.onclick = function () {
        if (video.paused) { video.play(); }
        else              { video.pause(); nextEpCard.style.display = 'none'; }
      };
      video.addEventListener('play',  function () { playPauseBtn.innerHTML = '&#9646;&#9646;'; });
      video.addEventListener('pause', function () { playPauseBtn.innerHTML = '&#9654;'; });
    }

    document.getElementById('back10').onclick    = function () { video.currentTime = Math.max(0, video.currentTime - 10); };
    document.getElementById('forward10').onclick = function () { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      currentTimeEl.textContent = formatTime(video.currentTime);
      totalTimeEl.textContent   = formatTime(video.duration);

      // Próximo episódio: exibir 30s antes do fim
      var remaining = video.duration - video.currentTime;
      if (remaining <= 30 && remaining > 0 && !video.paused && _onNextEp) {
        nextEpCard.style.display = 'flex';
      } else if (video.paused) {
        nextEpCard.style.display = 'none';
      }
    });

    if (progress && progressFilled) {
      enhanceProgressBar(progress, progressFilled, video, playerBox);
    }

    var toggleFs = makeFullscreenToggle(playerBox);
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) fullscreenBtn.onclick = toggleFs;

    if (ctrlRow) buildExtraControls(ctrlRow, video, playerBox, true);

    setupKeyboardShortcuts(video, playerBox, toggleFs);

    var hideTimer;
    playerBox.addEventListener('mousemove', function () {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { controls.classList.add('hidden'); }, 2500);
    });

    return {
      loadEpisode: function (src, titulo) {
        playerBox.style.display = 'block';

        // Para o vídeo anterior e limpa o src antes de trocar
        // (evita que o browser mantenha o stream antigo em memória)
        video.pause();
        video.removeAttribute('src');
        video.load();

        // Seta o novo src
        video.src = src;
        video.load();

        if (titleEl) titleEl.textContent = titulo || '';

        // Reseta overlay para estado inicial
        overlay.classList.remove('hidden');
        var overlayText = overlay.querySelector('.player-overlay-text');
        if (overlayText) overlayText.textContent = 'Clique para reproduzir';
        centerPlay.style.opacity = '1';
        centerPlay.style.pointerEvents = '';
        controls.classList.add('hidden');
        nextEpCard.style.display = 'none';
        playerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Handler de erro — exibe mensagem no overlay em vez de silenciar
        video.onerror = function () {
          var code = video.error ? video.error.code : '?';
          var msg  = video.error ? video.error.message : 'Erro desconhecido';
          console.error('[PipocaPlayer] Erro ao carregar vídeo. Código:', code, '| Src:', src, '| Msg:', msg);
          overlay.classList.remove('hidden');
          if (overlayText) overlayText.textContent = '⚠️ Não foi possível carregar. Tente outro episódio.';
        };
      },
      setNextEpCallback: function (fn) {
        _onNextEp = fn;
      }
    };
  }

  /* ─────────────────────────────────────────────
     initFilmePlayer — mantido para compatibilidade
  ───────────────────────────────────────────── */
  function initFilmePlayer(opts) {
    var clickCount = 0;
    var required   = 3;
    var btn        = document.getElementById(opts.btnId       || 'btnDesbloquear');
    var playerBox  = document.getElementById(opts.playerBoxId || 'playerBox');
    var video      = document.getElementById(opts.videoId     || 'video');
    var overlay    = document.getElementById(opts.overlayId   || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId|| 'centerPlay');
    var controls   = document.getElementById(opts.controlsId  || 'playerControls');
    var unlockDots = document.querySelectorAll('.unlock-dot');

    btn.addEventListener('click', function () {
      clickCount++;
      window.open(PipocaAPI.SMARTLINK, '_blank');
      unlockDots.forEach(function (d, i) { if (i < clickCount) d.classList.add('filled'); });
      if (clickCount < required) {
        btn.textContent = '🔓 ' + (required - clickCount) + ' clique(s) restantes para desbloquear';
      } else {
        btn.textContent = '✅ Player Desbloqueado!';
        btn.disabled = true;
        btn.style.background = 'linear-gradient(135deg,#1a7a1a,#0e5e0e)';
        playerBox.style.display = 'block';
        playerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      centerPlay.style.pointerEvents = 'none';
      controls.classList.remove('hidden');
      video.play().catch(function(){});
    }
    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    var playPauseBtn  = document.getElementById('playPause');
    var playPausePath = document.getElementById('playPausePath');
    playPauseBtn.addEventListener('click', function () {
      if (video.paused) { video.play(); }
      else              { video.pause(); }
    });
    video.addEventListener('play',  function () { if(playPausePath) playPausePath.setAttribute('d','M6 5h4v14H6V5zm8 0h4v14h-4V5z'); });
    video.addEventListener('pause', function () { if(playPausePath) playPausePath.setAttribute('d','M8 5v14l11-7z'); });

    document.getElementById('back10').onclick    = function () { video.currentTime = Math.max(0, video.currentTime - 10); };
    document.getElementById('forward10').onclick = function () { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');
    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      currentTimeEl.textContent = formatTime(video.currentTime);
      totalTimeEl.textContent   = formatTime(video.duration);
    });
    if (progress && progressFilled) enhanceProgressBar(progress, progressFilled, video, playerBox);

    var toggleFs = makeFullscreenToggle(playerBox);
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFs);

    var ctrlRow = controls.querySelector('.player-ctrl-row');
    if (ctrlRow) buildExtraControls(ctrlRow, video, playerBox, false);
    setupKeyboardShortcuts(video, playerBox, toggleFs);

    var hideTimer;
    playerBox.addEventListener('mousemove', function () {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { controls.classList.add('hidden'); }, 2500);
    });
    playerBox.addEventListener('mouseleave', function () {
      if (!video.paused) controls.classList.add('hidden');
    });
  }

  return {
    initFilmePlayer,
    initSeriePlayer,
    initControls,
    formatTime
  };
})();
