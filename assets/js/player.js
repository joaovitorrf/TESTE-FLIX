/**
 * PIPOCAFLIX - player.js
 * Player universal para filmes e séries
 * Mantém a lógica EXATA dos players fornecidos
 */

window.PipocaPlayer = (function() {
  'use strict';

  /* ─────────────────────────────────────────────
     initFilmePlayer — igual ao player original de filmes
  ───────────────────────────────────────────── */
  function initFilmePlayer(opts) {
    var clickCount   = 0;
    var required     = 3;

    var btn          = document.getElementById(opts.btnId       || 'btnDesbloquear');
    var playerBox    = document.getElementById(opts.playerBoxId || 'playerBox');
    var video        = document.getElementById(opts.videoId     || 'video');
    var overlay      = document.getElementById(opts.overlayId   || 'playerOverlay');
    var centerPlay   = document.getElementById(opts.centerPlayId|| 'centerPlay');
    var controls     = document.getElementById(opts.controlsId  || 'playerControls');
    var unlockDots   = document.querySelectorAll('.unlock-dot');

    // Botão de desbloqueio
    btn.addEventListener('click', function() {
      clickCount++;
      window.open(PipocaAPI.SMARTLINK, '_blank');

      // Atualiza dots
      unlockDots.forEach(function(d, i) {
        if (i < clickCount) d.classList.add('filled');
      });

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

    // Iniciar player
    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      centerPlay.style.pointerEvents = 'none';
      controls.classList.remove('hidden');
      video.play().catch(function(){});
    }
    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    // Play/Pause
    var playPauseBtn  = document.getElementById('playPause');
    var playPausePath = document.getElementById('playPausePath');
    playPauseBtn.addEventListener('click', function() {
      if (video.paused) {
        video.play();
        playPausePath.setAttribute('d', 'M6 5h4v14H6V5zm8 0h4v14h-4V5z');
      } else {
        video.pause();
        playPausePath.setAttribute('d', 'M8 5v14l11-7z');
      }
    });
    video.addEventListener('play',  function() { playPausePath.setAttribute('d','M6 5h4v14H6V5zm8 0h4v14h-4V5z'); });
    video.addEventListener('pause', function() { playPausePath.setAttribute('d','M8 5v14l11-7z'); });

    // ±10s
    document.getElementById('back10').onclick    = function() { video.currentTime = Math.max(0, video.currentTime - 10); };
    document.getElementById('forward10').onclick = function() { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    // Progress bar
    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');

    video.addEventListener('timeupdate', function() {
      if (!video.duration) return;
      var p = (video.currentTime / video.duration) * 100;
      progressFilled.style.width = p + '%';
      currentTimeEl.textContent  = formatTime(video.currentTime);
      totalTimeEl.textContent    = formatTime(video.duration);
    });

    progress.addEventListener('click', function(e) {
      var rect = progress.getBoundingClientRect();
      var pos  = (e.clientX - rect.left) / rect.width;
      video.currentTime = pos * (video.duration || 0);
    });

    // Fullscreen
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var isFs = false;
    fullscreenBtn.addEventListener('click', function() {
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
    });
    document.addEventListener('fullscreenchange',        function() { if (!document.fullscreenElement)        isFs = false; });
    document.addEventListener('webkitfullscreenchange',  function() { if (!document.webkitFullscreenElement)  isFs = false; });

    // Auto-hide controls
    var hideTimer;
    playerBox.addEventListener('mousemove', function() {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() { controls.classList.add('hidden'); }, 2500);
    });
    playerBox.addEventListener('mouseleave', function() {
      if (!video.paused) controls.classList.add('hidden');
    });
  }

  /* ─────────────────────────────────────────────
     initSeriePlayer — igual ao original de séries
  ───────────────────────────────────────────── */
  function initSeriePlayer(opts) {
    var video      = document.getElementById(opts.videoId       || 'video');
    var overlay    = document.getElementById(opts.overlayId     || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId  || 'centerPlay');
    var controls   = document.getElementById(opts.controlsId    || 'playerControls');
    var playerBox  = document.getElementById(opts.playerBoxId   || 'playerBox');
    var titleEl    = document.getElementById(opts.titleId       || 'playerTitle');

    var playPauseBtn  = document.getElementById('playPause');
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

    playPauseBtn.onclick = function() {
      if (video.paused) { video.play(); playPauseBtn.innerHTML = '&#9646;&#9646;'; }
      else              { video.pause(); playPauseBtn.innerHTML = '&#9654;'; }
    };
    video.addEventListener('play',  function() { playPauseBtn.innerHTML = '&#9646;&#9646;'; });
    video.addEventListener('pause', function() { playPauseBtn.innerHTML = '&#9654;'; });

    document.getElementById('back10').onclick    = function() { video.currentTime = Math.max(0, video.currentTime - 10); };
    document.getElementById('forward10').onclick = function() { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    video.addEventListener('timeupdate', function() {
      if (!video.duration) return;
      progressFilled.style.width = (video.currentTime / video.duration * 100) + '%';
      currentTimeEl.textContent  = formatTime(video.currentTime);
      totalTimeEl.textContent    = formatTime(video.duration);
    });

    progress.addEventListener('click', function(e) {
      var rect = progress.getBoundingClientRect();
      video.currentTime = ((e.clientX - rect.left) / rect.width) * (video.duration || 0);
    });

    // Fullscreen
    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var isFs = false;
    if (fullscreenBtn) {
      fullscreenBtn.onclick = function() {
        if (!isFs) {
          var req = playerBox.requestFullscreen || playerBox.webkitRequestFullscreen || playerBox.mozRequestFullScreen;
          if (req) req.call(playerBox);
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function(){});
          }
          isFs = true;
        } else {
          var ex = document.exitFullscreen || document.webkitExitFullscreen;
          if (ex) ex.call(document);
          isFs = false;
        }
      };
    }
    document.addEventListener('fullscreenchange', function() { if (!document.fullscreenElement) isFs = false; });

    // Auto-hide
    var hideTimer;
    playerBox.addEventListener('mousemove', function() {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() { controls.classList.add('hidden'); }, 2500);
    });

    // Retorna método para trocar episódio
    return {
      loadEpisode: function(src, titulo) {
        playerBox.style.display = 'block';
        video.src = src;
        video.load();
        if (titleEl) titleEl.textContent = titulo || '';
        overlay.classList.remove('hidden');
        centerPlay.style.opacity  = '1';
        centerPlay.style.pointerEvents = '';
        controls.classList.add('hidden');
        playerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
  }

  /* ─────────────────────────────────────────────
     formatTime
  ───────────────────────────────────────────── */
  function formatTime(t) {
    if (!t || isNaN(t)) return '0:00';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }


  /* ─────────────────────────────────────────────
     initControls — configura controles do player
     sem lógica de desbloqueio por cliques.
     Usado após VAST pre-roll em filme.html
  ───────────────────────────────────────────── */
  function initControls(opts) {
    var playerBox  = document.getElementById(opts.playerBoxId || 'playerBox');
    var video      = document.getElementById(opts.videoId     || 'video');
    var overlay    = document.getElementById(opts.overlayId   || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId|| 'centerPlay');
    var controls   = document.getElementById(opts.controlsId  || 'playerControls');

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
      playPauseBtn.addEventListener('click', function() {
        if (video.paused) {
          video.play();
          if (playPausePath) playPausePath.setAttribute('d', 'M6 5h4v14H6V5zm8 0h4v14h-4V5z');
        } else {
          video.pause();
          if (playPausePath) playPausePath.setAttribute('d', 'M8 5v14l11-7z');
        }
      });
      video.addEventListener('play',  function() { if(playPausePath) playPausePath.setAttribute('d','M6 5h4v14H6V5zm8 0h4v14h-4V5z'); });
      video.addEventListener('pause', function() { if(playPausePath) playPausePath.setAttribute('d','M8 5v14l11-7z'); });
    }

    var back10 = document.getElementById('back10');
    var fwd10  = document.getElementById('forward10');
    if (back10) back10.onclick = function() { video.currentTime = Math.max(0, video.currentTime - 10); };
    if (fwd10)  fwd10.onclick  = function() { video.currentTime = Math.min(video.duration||0, video.currentTime + 10); };

    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');

    video.addEventListener('timeupdate', function() {
      if (!video.duration) return;
      progressFilled.style.width = (video.currentTime / video.duration * 100) + '%';
      currentTimeEl.textContent  = formatTime(video.currentTime);
      totalTimeEl.textContent    = formatTime(video.duration);
    });

    if (progress) {
      progress.addEventListener('click', function(e) {
        var rect = progress.getBoundingClientRect();
        video.currentTime = ((e.clientX - rect.left) / rect.width) * (video.duration || 0);
      });
    }

    var fullscreenBtn = document.getElementById('fullscreenBtn');
    var isFs = false;
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function() {
        if (!isFs) {
          var req = playerBox.requestFullscreen || playerBox.webkitRequestFullscreen || playerBox.mozRequestFullScreen;
          if (req) req.call(playerBox);
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){});
          isFs = true;
        } else {
          var ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
          if (ex) ex.call(document);
          isFs = false;
        }
      });
      document.addEventListener('fullscreenchange', function() { if (!document.fullscreenElement) isFs = false; });
      document.addEventListener('webkitfullscreenchange', function() { if (!document.webkitFullscreenElement) isFs = false; });
    }

    var hideTimer;
    playerBox.addEventListener('mousemove', function() {
      controls.classList.remove('hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function() { controls.classList.add('hidden'); }, 2500);
    });
    playerBox.addEventListener('mouseleave', function() {
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
