/**
 * PIPOCAFLIX - api.js
 * Integração Google Sheets via Worker Cloudflare
 *
 * O Worker expõe 3 rotas diretas:
 *   GET /filmes    → CSV da aba Filmes
 *   GET /series    → CSV da aba Séries
 *   GET /episodios → CSV da aba Episódios
 *
 * NÃO usar ?url= — o Worker usa pathname como rota.
 */

const WORKER_BASE = "https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev";

// Rotas exatas que o Worker aceita (pathname sem /)
const ROUTES = {
  FILMES:    "/filmes",
  SERIES:    "/series",
  EPISODIOS: "/episodios"
};

const SMARTLINK = "https://www.effectivegatecpm.com/eacwhk55f?key=87f8fc919fb5d70a825293b5490713dd";

// Cache em memória para evitar fetches repetidos durante a sessão
const _cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/* ─────────────────────────────────────────────
   fetchCSV — chama Worker diretamente pela rota
   Ex: WORKER_BASE + "/filmes"
───────────────────────────────────────────── */
async function fetchCSV(tab, retries = 3, delay = 1200) {
  const cacheKey = tab;

  // Retorna cache válido
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  // URL correta: https://...workers.dev/filmes  (sem ?url=, sem parâmetros)
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
      // Espera crescente entre retries
      await new Promise(r => setTimeout(r, delay * attempt));
    }
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
  
  // Remove header (linha 1)
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
    nome:          row[0]  || '',
    linkMP4:       row[1]  || '',
    sinopse:       row[2]  || '',
    capa:          row[3]  || '',
    categoria:     row[4]  || '',
    ano:           row[5]  || '',
    duracao:       row[6]  || '',
    trailer:       row[7]  || '',
    nomeElenco:    row[8]  || '',
    fotoElenco:    row[9]  || '',
    tipo:          row[11] || 'Filme',
    audio:         row[12] || '',
    isSerie:       false
  };
}

function mapSerie(row) {
  return {
    nome:          row[0]  || '',
    linkMP4:       row[1]  || '',
    sinopse:       row[2]  || '',
    capa:          row[3]  || '',
    categoria:     row[4]  || '',
    ano:           row[5]  || '',
    duracao:       row[6]  || '',
    trailer:       row[7]  || '',
    nomeElenco:    row[8]  || '',
    fotoElenco:    row[9]  || '',
    tipo:          row[11] || 'Série',
    audio:         row[12] || '',
    totalTemp:     row[13] || '1',
    isSerie:       true
  };
}

function mapEpisodio(row) {
  return {
    serie:     row[0] || '',
    linkMP4:   row[1] || '',
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

async function getEpisodios() {
  const rows = await fetchCSV('EPISODIOS');
  return rows.map(mapEpisodio).filter(e => e.serie);
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

  // Agrupa por temporada
  const temporadas = {};
  for (const ep of filtrados) {
    if (!temporadas[ep.temporada]) temporadas[ep.temporada] = [];
    temporadas[ep.temporada].push(ep);
  }

  // Ordena episódios de cada temporada
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

function openSmartlink() {
  window.open(SMARTLINK, '_blank');
}

// Exporta para uso global
window.PipocaAPI = {
  getFilmes,
  getSeries,
  getEpisodios,
  getTodosConteudos,
  getEpisodiosPorSerie,
  openSmartlink,
  normalizeStr,
  SMARTLINK
};
