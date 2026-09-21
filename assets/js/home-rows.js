/**
 * PIPOCAFLIX — home-rows.js
 * Cards e carrosséis da home, usados também por filmes.html e series.html.
 *
 * ⚠ Estas funções foram COPIADAS de index.html (mkCard, setupCarouselArrows, getCatConfig…)
 *   pra as páginas novas ficarem idênticas à home. Se mudar o visual/comportamento do card
 *   na home, mude aqui também (ou me peça pra unificar).
 *
 * Depende de (globais da página): showToast, PipocaFavoritos. Expõe window.PflixRows.
 */
(function () {
const CLICKS_KEY = 'pflix_clicks';

function trackClick(item) {
  try {
    const data = JSON.parse(localStorage.getItem(CLICKS_KEY) || '{}');
    if (!data[item.nome]) data[item.nome] = { count:0, lastClick:0, capa:item.capa||'', isSerie:!!item.isSerie, categoria:item.categoria||'', ano:item.ano||'' };
    data[item.nome].count++;
    data[item.nome].lastClick = Date.now();
    localStorage.setItem(CLICKS_KEY, JSON.stringify(data));
  } catch {}
}

const CAT_CONFIG = {
  'ação':{ emoji:'⚡', gradient:'linear-gradient(135deg,#1a1a2e,#e94560)' },
  'acao':{ emoji:'⚡', gradient:'linear-gradient(135deg,#1a1a2e,#e94560)' },
  'romance':{ emoji:'💕', gradient:'linear-gradient(135deg,#2d1b1b,#c94b4b)' },
  'terror':{ emoji:'👻', gradient:'linear-gradient(135deg,#0d0d0d,#3a1c71)' },
  'horror':{ emoji:'🩸', gradient:'linear-gradient(135deg,#0d0d0d,#3a1c71)' },
  'comédia':{ emoji:'😂', gradient:'linear-gradient(135deg,#1a2a1a,#f7971e)' },
  'comedia':{ emoji:'😂', gradient:'linear-gradient(135deg,#1a2a1a,#f7971e)' },
  'drama':{ emoji:'🎭', gradient:'linear-gradient(135deg,#1a1a2e,#4a4a8a)' },
  'ficção':{ emoji:'🚀', gradient:'linear-gradient(135deg,#001a33,#0077b6)' },
  'ficcao':{ emoji:'🚀', gradient:'linear-gradient(135deg,#001a33,#0077b6)' },
  'animação':{ emoji:'✨', gradient:'linear-gradient(135deg,#1a0a2e,#7b2d8b)' },
  'animacao':{ emoji:'✨', gradient:'linear-gradient(135deg,#1a0a2e,#7b2d8b)' },
  'aventura':{ emoji:'🗺️', gradient:'linear-gradient(135deg,#1a2010,#56ab2f)' },
  'thriller':{ emoji:'🔪', gradient:'linear-gradient(135deg,#0d0d10,#434343)' },
  'crime':{ emoji:'🔫', gradient:'linear-gradient(135deg,#0d0d10,#434343)' },
  'fantasia':{ emoji:'🧙', gradient:'linear-gradient(135deg,#1a0a30,#8360c3)' },
  'documentário':{ emoji:'📽️', gradient:'linear-gradient(135deg,#101820,#2c5364)' },
  'documentario':{ emoji:'📽️', gradient:'linear-gradient(135deg,#101820,#2c5364)' },
  'faroeste':{ emoji:'🤠', gradient:'linear-gradient(135deg,#1a1005,#c79200)' },
  'guerra':{ emoji:'⚔️', gradient:'linear-gradient(135deg,#0d0d0d,#5c5c5c)' },
  'musical':{ emoji:'🎵', gradient:'linear-gradient(135deg,#0d0020,#8b0000)' },
  'família':{ emoji:'👨‍👩‍👧', gradient:'linear-gradient(135deg,#001a20,#00b4db)' },
  'familia':{ emoji:'👨‍👩‍👧', gradient:'linear-gradient(135deg,#001a20,#00b4db)' },
};

function getCatConfig(cat) {
  const k = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (const key of Object.keys(CAT_CONFIG)) { if (k.includes(key)||key.includes(k)) return CAT_CONFIG[key]; }
  return { emoji:'🎬', gradient:'linear-gradient(135deg,#1a1a24,#ff2d43)' };
}

function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').trim(); }

function mkCard(item, opts = {}) {
  const div = document.createElement('div');
  div.className = opts.wide ? 'card card--wide' : 'card';
  const page = item.isSerie ? 'serie.html' : 'filme.html';

  // Badge áudio
  let audioBadge = '';
  if (item.audio) {
    const a = item.audio.toLowerCase();
    if (a.includes('dub')) audioBadge = '<span class="card-audio-badge card-audio-dub">DUB</span>';
    else if (a.includes('leg')) audioBadge = '<span class="card-audio-badge card-audio-leg">LEG</span>';
  }

  // Badge Em Alta
  let hotBadge = '';
  if (opts.hotCount) hotBadge = `<span class="card-hot-badge">🔥 ${opts.hotCount}</span>`;

  // Badge NOVO (ano 2025 ou 2026)
  const isNew = item.ano && (item.ano === '2025' || item.ano === '2026');
  const newBadge = isNew ? '<span class="card-new-badge">NOVO</span>' : '';

  // Fake rating (visual premium)
  const fakeRating = (7 + Math.random() * 2.9).toFixed(1);

  // Barra de progresso (Continuar Assistindo)
  let progressBar = '';
  if (opts.pct != null) {
    progressBar = `<div class="card-progress-bar" style="width:${Math.round(opts.pct*100)}%"></div>`;
  }

  // No modo "wide" (Continuar Assistindo) prioriza o backdrop (paisagem);
  // só cai pra capa se o título não tiver backdrop cadastrado.
  const imgSrc = opts.wide ? (item.backdrop || item.capa || '') : (item.capa || '');
  const imgFallback = opts.wide
    ? "https://placehold.co/640x360/13131a/333?text=PipocaFlix"
    : "https://placehold.co/300x450/13131a/333?text=Sem+Capa";

  // Hover overlay
  const synopsis = (item.sinopse || '').slice(0, 120);
  const cat1 = item.categoria ? item.categoria.split(',')[0].trim() : '';

  div.innerHTML = `
    <div class="card-thumb-wrap" style="position:relative">
      <img class="card-thumb" src="${imgSrc}" alt="${item.nome}" data-cat="${cat1}" loading="lazy"
        onerror="this.src='${imgFallback}'">
      <span class="card-badge">${item.isSerie?'📺 Série':'🎬 Filme'}</span>
      <div class="card-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      ${audioBadge}${hotBadge}${newBadge}${progressBar}
      ${item.ano ? `<div class="card-year-badge">${item.ano}</div>` : ''}
      <button class="card-fav-btn${window.PipocaFavoritos&&window.PipocaFavoritos.has(item.nome)?' active':''}" data-nome="${item.nome}" aria-label="Favoritar">
        <svg viewBox="0 0 24 24" fill="${window.PipocaFavoritos&&window.PipocaFavoritos.has(item.nome)?'currentColor':'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      <div class="card-hover-overlay">
        ${synopsis ? `<p class="card-hover-synopsis">${synopsis}</p>` : ''}
        <div class="card-hover-meta">
          ${item.ano ? `<span>${item.ano}</span>` : ''}
          ${cat1 ? `<span>${cat1}</span>` : ''}
          <span>⭐ ${fakeRating}</span>
        </div>
        <button class="card-hover-btn">▶ Assistir</button>
      </div>
    </div>
    <div class="card-info">
      <div class="card-name">${item.nome}</div>
      <div class="card-meta-row">
        ${item.categoria ? `<span>${cat1}</span>` : ''}
      </div>
    </div>`;

  // Clique principal — navega
  div.addEventListener('click', e => {
    if (e.target.closest('.card-fav-btn') || e.target.closest('.card-hover-btn')) return;
    trackClick(item);
    location.href = `${page}?nome=${encodeURIComponent(item.nome)}`;
  });
  div.setAttribute('role','button'); div.setAttribute('tabindex','0');
  div.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') div.click(); });

  // Botão hover "Assistir"
  const hoverBtn = div.querySelector('.card-hover-btn');
  if (hoverBtn) hoverBtn.addEventListener('click', e => {
    e.stopPropagation(); trackClick(item);
    location.href = `${page}?nome=${encodeURIComponent(item.nome)}`;
  });

  // Botão favorito
  const favBtn = div.querySelector('.card-fav-btn');
  if (favBtn && window.PipocaFavoritos) {
    favBtn.addEventListener('click', e => {
      e.stopPropagation();
      const added = window.PipocaFavoritos.toggle(item);
      const svg = favBtn.querySelector('svg');
      favBtn.classList.toggle('active', added);
      if (svg) svg.setAttribute('fill', added ? 'currentColor' : 'none');
      showToast(added ? '❤️ Adicionado à sua lista' : '💔 Removido da sua lista');
      renderFavSection();
    });
  }

  return div;
}

function setupCarouselArrows(trackId, prevId, nextId) {
  var track = document.getElementById(trackId);
  var prev  = document.getElementById(prevId);
  var next  = document.getElementById(nextId);
  if (!track || !prev || !next) return;

  var STEP = 680;

  function updArrows() {
    var atStart = track.scrollLeft <= 2;
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    prev.style.opacity       = atStart ? '0.3' : '1';
    prev.style.pointerEvents = atStart ? 'none' : 'auto';
    next.style.opacity       = atEnd   ? '0.3' : '1';
    next.style.pointerEvents = atEnd   ? 'none' : 'auto';
  }

  prev.addEventListener('click', function() {
    track.scrollBy({ left: -STEP, behavior: 'smooth' });
    setTimeout(updArrows, 350);
  });
  next.addEventListener('click', function() {
    track.scrollBy({ left: STEP, behavior: 'smooth' });
    setTimeout(updArrows, 350);
  });
  track.addEventListener('scroll', updArrows, { passive: true });
  updArrows();

  // Drag desktop — lógica isolada por track (sem conflito de múltiplos listeners)
  var _drag = { active: false, startX: 0, startScroll: 0, dist: 0 };
  track.style.userSelect = 'none';
  track.style.webkitUserSelect = 'none';
  track.style.cursor = 'grab';

  track.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return; // só botão esquerdo
    _drag.active = true;
    _drag.startX = e.pageX;
    _drag.startScroll = track.scrollLeft;
    _drag.dist = 0;
    track.style.cursor = 'grabbing';
    track.style.scrollBehavior = 'auto';
    track.classList.add('dragging');
    e.preventDefault();
    e.stopPropagation();
  });

  // mousemove e mouseup no próprio track E no document (captura movimento fora)
  function onMouseMove(e) {
    if (!_drag.active) return;
    var dx = e.pageX - _drag.startX;
    _drag.dist = Math.abs(dx);
    track.scrollLeft = _drag.startScroll - dx;
  }
  function onMouseUp() {
    if (!_drag.active) return;
    _drag.active = false;
    track.style.cursor = 'grab';
    track.style.scrollBehavior = 'smooth';
    track.classList.remove('dragging');
    updArrows();
  }

  track.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousemove', onMouseMove);
  track.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mouseup', onMouseUp);

  // Cancela click se foi drag
  track.addEventListener('click', function(e) {
    if (_drag.dist > 5) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);
}

function filterByCategory(items, cat, max) {
  const n = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return items.filter(item => {
    if (!item.categoria) return false;
    return item.categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(n);
  }).sort(() => Math.random()-0.5).slice(0, max);
}

window.PflixRows = { mkCard, setupCarouselArrows, filterByCategory, getCatConfig, trackClick, norm };
})();
