/**
 * PIPOCAFLIX - api.js
 * Integração Google Sheets via Worker Cloudflare
 *
 * Workers:
 *   WORKER_BASE → filmes, series
 *   EPISODES_WORKER → episodios (múltiplas abas em paralelo)
 */

const WORKER_BASE = "https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev";

const ROUTES = {
  FILMES:  "/filmes",
  SERIES:  "/series",
};

// Novo Worker de episódios com múltiplas abas
const EPISODES_WORKER = "https://shy-dream-7986.slacarambafdsosobrenome.workers.dev";
const EPISODE_TABS = [
  '/episodios1', '/episodios2', '/episodios3', '/episodios4',
  '/episodios5', '/episodios6', '/episodios7'
];

// Cache em memória
const _cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/* ─────────────────────────────────────────────
   fetchCSV — filmes e séries
───────────────────────────────────────────── */
async function fetchCSV(tab, retries = 3, delay = 1200) {
  const cacheKey = tab;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }
  const workerUrl = WORKER_BASE + ROUTES[tab];
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(workerUrl, {
        signal:  ctrl.signal,
        headers: { 'Accept': 'text/csv, text/plain, */*' }
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${tab}`);
      const text = await res.text();
      const data = parseCSV(text);
      _cache[cacheKey] = { data, ts: Date.now() };
      return data;
    } catch (err) {
      if (attempt === retries) {
        console.error(`[API] Falha ao buscar ${tab} após ${retries} tentativas:`, err);
        return [];
      }
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
}

/* ─────────────────────────────────────────────
   fetchEpisodeTab — busca uma aba de episódios
───────────────────────────────────────────── */
async function fetchEpisodeTab(route) {
  const cacheKey = 'ep_tab_' + route;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(EPISODES_WORKER + route, {
      signal: ctrl.signal,
      headers: { 'Accept': 'text/csv, text/plain, */*' }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const text = await res.text();
    const data = parseCSV(text);
    _cache[cacheKey] = { data, ts: Date.now() };
    return data;
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────
   parseCSV — parser robusto com suporte a aspas
───────────────────────────────────────────── */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseCSVLine(line));
  }
  return rows.slice(1).filter(r => r && r[0] && r[0].trim());
}

function parseCSVLine(line) {
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

/* ─────────────────────────────────────────────
   mapRow — mapeia colunas para objetos
───────────────────────────────────────────── */
function mapFilme(row) {
  return {
    nome:       row[0]  || '',
    linkMP4:    row[1]  || '',
    sinopse:    row[2]  || '',
    capa:       row[3]  || '',
    categoria:  row[4]  || '',
    ano:        row[5]  || '',
    duracao:    row[6]  || '',
    trailer:    row[7]  || '',
    nomeElenco: row[8]  || '',
    fotoElenco: row[9]  || '',
    tipo:       row[11] || 'Filme',
    audio:      row[12] || '',
    isSerie:    false
  };
}

function mapSerie(row) {
  return {
    nome:       row[0]  || '',
    linkMP4:    row[1]  || '',
    sinopse:    row[2]  || '',
    capa:       row[3]  || '',
    categoria:  row[4]  || '',
    ano:        row[5]  || '',
    duracao:    row[6]  || '',
    trailer:    row[7]  || '',
    nomeElenco: row[8]  || '',
    fotoElenco: row[9]  || '',
    tipo:       row[11] || 'Série',
    audio:      row[12] || '',
    totalTemp:  row[13] || '1',
    isSerie:    true
  };
}

function mapEpisodio(row) {
  return {
    serie:     row[0] || '',
    linkMP4:   row[1] || '',   // Coluna B (índice 1) — link do episódio
    temporada: parseInt(row[2]) || 1,
    episodio:  parseInt(row[3]) || 1
  };
}

/* ─────────────────────────────────────────────
   Funções públicas de alto nível
───────────────────────────────────────────── */
async function getFilmes() {
  const rows = await fetchCSV('FILMES');
  return rows.map(mapFilme).filter(f => f.nome);
}

async function getSeries() {
  const rows = await fetchCSV('SERIES');
  return rows.map(mapSerie).filter(s => s.nome);
}

/* getEpisodios — busca todas as abas em paralelo e mescla */
async function getEpisodios() {
  const results = await Promise.all(EPISODE_TABS.map(fetchEpisodeTab));
  const all = results.flat();
  return all.map(mapEpisodio).filter(e => e.serie);
}

async function getTodosConteudos() {
  const [filmes, series] = await Promise.all([getFilmes(), getSeries()]);
  return [...filmes, ...series];
}

/* ─────────────────────────────────────────────
   getEpisodiosPorSerie — agrupa por temporada
───────────────────────────────────────────── */
async function getEpisodiosPorSerie(nomeSerieOriginal) {
  const todos = await getEpisodios();
  const nomeNorm = normalizeStr(nomeSerieOriginal);

  const filtrados = todos.filter(e =>
    normalizeStr(e.serie).includes(nomeNorm) ||
    nomeNorm.includes(normalizeStr(e.serie))
  );

  const temporadas = {};
  for (const ep of filtrados) {
    if (!temporadas[ep.temporada]) temporadas[ep.temporada] = [];
    temporadas[ep.temporada].push(ep);
  }

  for (const t in temporadas) {
    temporadas[t].sort((a, b) => a.episodio - b.episodio);
  }

  return temporadas;
}

function normalizeStr(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Exporta para uso global
window.PipocaAPI = {
  getFilmes,
  getSeries,
  getEpisodios,
  getTodosConteudos,
  getEpisodiosPorSerie,
  normalizeStr,
};
