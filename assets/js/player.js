/**
 * PIPOCAFLIX - player.js (Video.js integrado)
 */

window.PipocaPlayer = (function() {
  'use strict';

  function createPlayer(id) {
    return videojs(id, {
      controls: false,
      preload: "auto",
      fluid: true
    });
  }

  /* ───────────────────────────────────────────── */
  function initFilmePlayer(opts) {

    var clickCount = 0;
    var required   = 3;

    var btn        = document.getElementById(opts.btnId || 'btnDesbloquear');
    var playerBox  = document.getElementById(opts.playerBoxId || 'playerBox');
    var overlay    = document.getElementById(opts.overlayId || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId || 'centerPlay');
    var controls   = document.getElementById(opts.controlsId || 'playerControls');
    var unlockDots = document.querySelectorAll('.unlock-dot');

    var player = createPlayer(opts.videoId || 'video');

    btn.addEventListener('click', function() {
      clickCount++;
      window.open(PipocaAPI.SMARTLINK, '_blank');

      unlockDots.forEach(function(d, i) {
        if (i < clickCount) d.classList.add('filled');
      });

      if (clickCount < required) {
        btn.textContent = '🔓 ' + (required - clickCount) + ' clique(s) restantes para desbloquear';
      } else {
        btn.textContent = '✅ Player Desbloqueado!';
        btn.disabled = true;
        playerBox.style.display = 'block';
      }
    });

    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      controls.classList.remove('hidden');
      player.play();
    }

    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    // Play / Pause
    var playPauseBtn = document.getElementById('playPause');

    playPauseBtn.addEventListener('click', function() {
      if (player.paused()) {
        player.play();
      } else {
        player.pause();
      }
    });

    // ±10s
    document.getElementById('back10').onclick = function() {
      player.currentTime(Math.max(0, player.currentTime() - 10));
    };

    document.getElementById('forward10').onclick = function() {
      player.currentTime(player.currentTime() + 10);
    };

    // Progress
    var progress       = document.getElementById('progressBar');
    var progressFilled = document.getElementById('progressFilled');
    var currentTimeEl  = document.getElementById('currentTime');
    var totalTimeEl    = document.getElementById('totalTime');

    player.on('timeupdate', function() {
      if (!player.duration()) return;
      var p = (player.currentTime() / player.duration()) * 100;
      progressFilled.style.width = p + '%';
      currentTimeEl.textContent  = formatTime(player.currentTime());
      totalTimeEl.textContent    = formatTime(player.duration());
    });

    progress.addEventListener('click', function(e) {
      var rect = progress.getBoundingClientRect();
      var pos  = (e.clientX - rect.left) / rect.width;
      player.currentTime(pos * player.duration());
    });

    // Fullscreen
    document.getElementById('fullscreenBtn').onclick = function() {
      if (!player.isFullscreen()) {
        player.requestFullscreen();
      } else {
        player.exitFullscreen();
      }
    };
  }

  /* ───────────────────────────────────────────── */
  function initSeriePlayer(opts) {

    var overlay    = document.getElementById(opts.overlayId || 'playerOverlay');
    var centerPlay = document.getElementById(opts.centerPlayId || 'centerPlay');
    var controls   = document.getElementById(opts.controlsId || 'playerControls');
    var playerBox  = document.getElementById(opts.playerBoxId || 'playerBox');
    var titleEl    = document.getElementById(opts.titleId || 'playerTitle');

    var player = createPlayer(opts.videoId || 'video');

    function iniciar() {
      overlay.classList.add('hidden');
      centerPlay.style.opacity = '0';
      controls.classList.remove('hidden');
      player.play();
    }

    overlay.addEventListener('click', iniciar);
    centerPlay.addEventListener('click', iniciar);

    document.getElementById('playPause').onclick = function() {
      if (player.paused()) player.play();
      else player.pause();
    };

    document.getElementById('back10').onclick = function() {
      player.currentTime(Math.max(0, player.currentTime() - 10));
    };

    document.getElementById('forward10').onclick = function() {
      player.currentTime(player.currentTime() + 10);
    };

    player.on('timeupdate', function() {
      var progressFilled = document.getElementById('progressFilled');
      var currentTimeEl  = document.getElementById('currentTime');
      var totalTimeEl    = document.getElementById('totalTime');

      if (!player.duration()) return;

      progressFilled.style.width =
        (player.currentTime() / player.duration() * 100) + '%';

      currentTimeEl.textContent = formatTime(player.currentTime());
      totalTimeEl.textContent   = formatTime(player.duration());
    });

    return {
      loadEpisode: function(src, titulo) {

        playerBox.style.display = 'block';

        player.src({
          src: src,
          type: src.includes(".m3u8")
            ? "application/x-mpegURL"
            : "video/mp4"
        });

        player.load();
        player.pause();

        if (titleEl) titleEl.textContent = titulo || '';

        overlay.classList.remove('hidden');
        centerPlay.style.opacity = '1';
        controls.classList.add('hidden');
      }
    };
  }

  /* ───────────────────────────────────────────── */
  function formatTime(t) {
    if (!t || isNaN(t)) return '0:00';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  return {
    initFilmePlayer,
    initSeriePlayer,
    formatTime
  };

})();
