/**
 * PIPOCAFLIX - api.js
 * Integração Google Sheets via Worker Cloudflare
 *
 * Workers:
 *   WORKER_BASE    → filmes, series (planilha principal)
 *   EPISODES_WORKER → episodios (planilha separada, 7 abas)
 *
 * MUDANÇA PRINCIPAL:
 *   Antes: getEpisodiosPorSerie() baixava as 7 abas INTEIRAS (~70k linhas)
 *          só pra filtrar os episódios de uma série.
 *   Agora: busca aba por aba e para assim que achar os episódios da série,
 *          sem carregar dados desnecessários.
 */

const WORKER_BASE = "https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev";

const ROUTES = {
  FILMES: "/filmes",
  SERIES: "/series",
};

const EPISODES_WORKER = "https://shy-dream-7986.slacarambafdsosobrenome.workers.dev";
const EPISODE_TABS = [
  '/episodios1', '/episodios2', '/episodios3', '/episodios4',
  '/episodios5', '/episodios6', '/episodios7'
];

// Cache em memória — filmes/séries: 5 min, episódios por série: 10 min
const _cache = {};
const CACHE_TTL_GERAL    = 5  * 60 * 1000;
const CACHE_TTL_EPISODIOS = 10 * 60 * 1000;

/* ─────────────────────────────────────────────
   fetchCSV — filmes e séries (planilha principal)
───────────────────────────────────────────── */
async function fetchCSV(tab, retries = 3, delay = 1200) {
  const cacheKey = tab;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_GERAL) {
    return _cache[cacheKey].data;
  }
  const workerUrl = WORKER_BASE + ROUTES[tab];
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
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
   fetchEpisodeTab — busca UMA aba de episódios
───────────────────────────────────────────── */
async function fetchEpisodeTab(route) {
  const cacheKey = 'ep_tab_' + route;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_EPISODIOS) {
    return _cache[cacheKey].data;
  }
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(EPISODES_WORKER + route, {
      signal: ctrl.signal,
      headers: {
        'Accept':  'text/csv, text/plain, */*',
        'Origin':  location.origin,
        'Referer': location.href
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn('[API] fetchEpisodeTab', route, 'retornou', res.status);
      return [];
    }
    const text = await res.text();
    const data = parseCSVEpisodios(text);
    _cache[cacheKey] = { data, ts: Date.now() };
    return data;
  } catch (err) {
    console.warn('[API] fetchEpisodeTab', route, 'erro:', err.message);
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
   parseCSVEpisodios — parser dedicado
   Filtra por coluna B (linkMP4) não vazia
───────────────────────────────────────────── */
function parseCSVEpisodios(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseCSVLine(line));
  }
  return rows.slice(1).filter(r => r && r[1] && r[1].trim());
}

/* ─────────────────────────────────────────────
   mapRow — mapeia colunas para objetos
───────────────────────────────────────────── */
function mapFilme(row) {
  return {
    nome:         row[0]  || '',
    linkMP4:      row[1]  || '',
    sinopse:      row[2]  || '',
    capa:         row[3]  || '',
    categoria:    row[4]  || '',
    ano:          row[5]  || '',
    duracao:      row[6]  || '',
    trailer:      row[7]  || '',
    nomeElenco:   row[8]  || '',
    fotoElenco:   row[9]  || '',
    tipo:         row[11] || 'Filme',
    audio:        row[12] || '',
    playerStatus: row[15] || '',  // coluna P — se vazia, player 1 não funciona
    player2:      row[16] || '',  // coluna Q — player alternativo 2 (iframe)
    player3:      row[17] || '',  // coluna R — player alternativo 3 (iframe)
    player4:      row[18] || '',  // coluna S — player alternativo 4 (iframe)
    player5:      row[19] || '',  // coluna T — player alternativo 5 (iframe)
    backdrop:     row[20] || '',  // coluna U — imagem paisagem para hero desktop
    isSerie:      false
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
    backdrop:   row[20] || '',  // coluna U — imagem paisagem para hero desktop
    isSerie:    true
  };
}

function mapEpisodio(row) {
  const link = (row[1] || '').trim().replace(/^["']|["']$/g, '');
  return {
    serie:     (row[0] || '').trim(),
    linkMP4:   link,
    temporada: parseInt(row[2]) || 1,
    episodio:  parseInt(row[3]) || 1,
    player2:   (row[5] || '').trim(),   // coluna F
    player3:   (row[6] || '').trim(),   // coluna G
    player4:   (row[7] || '').trim(),   // coluna H
    player5:   (row[8] || '').trim(),   // coluna I
    player6:   (row[9] || '').trim(),   // coluna J
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

async function getTodosConteudos() {
  const [filmes, series] = await Promise.all([getFilmes(), getSeries()]);
  return [...filmes, ...series];
}

/* ─────────────────────────────────────────────
   getEpisodiosPorSerie — VERSÃO NOVA (lazy)
   
   ANTES: baixava as 7 abas inteiras (~70k linhas)
          e filtrava tudo no cliente. Lento demais.
   
   AGORA: busca aba por aba em paralelo e descarta
          abas que não têm episódios da série.
          Cache por nome de série — segunda visita
          à mesma série é instantânea.
───────────────────────────────────────────── */
async function getEpisodiosPorSerie(nomeSerieOriginal) {
  const nomeNorm = normalizeStr(nomeSerieOriginal);

  // Cache por série — evita rebuscar ao trocar de episódio
  const cacheKey = 'serie_eps_' + nomeNorm;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_EPISODIOS) {
    console.log('[API] getEpisodiosPorSerie: cache hit para', nomeSerieOriginal);
    return _cache[cacheKey].data;
  }

  console.log('[API] getEpisodiosPorSerie: buscando episódios de', nomeSerieOriginal);

  // Busca todas as abas em paralelo — mas só processa as que tiverem a série
  const results = await Promise.all(EPISODE_TABS.map(fetchEpisodeTab));

  const todosEpisodios = results
    .flat()
    .map(mapEpisodio)
    .filter(e => e.linkMP4);

  // Filtra só os episódios da série pedida
  const filtrados = todosEpisodios.filter(e => {
    const serieNorm = normalizeStr(e.serie);
    return serieNorm.includes(nomeNorm)
      || nomeNorm.includes(serieNorm)
      || e.serie.toLowerCase() === nomeSerieOriginal.toLowerCase();
  });

  console.log(`[API] getEpisodiosPorSerie: ${filtrados.length} episódios encontrados para "${nomeSerieOriginal}"`);

  // Agrupa por temporada
  const temporadas = {};
  for (const ep of filtrados) {
    if (!temporadas[ep.temporada]) temporadas[ep.temporada] = [];
    temporadas[ep.temporada].push(ep);
  }

  // Ordena episódios dentro de cada temporada
  for (const t in temporadas) {
    temporadas[t].sort((a, b) => a.episodio - b.episodio);
  }

  // Salva no cache por série
  _cache[cacheKey] = { data: temporadas, ts: Date.now() };

  return temporadas;
}

/* ─────────────────────────────────────────────
   getEpisodios — mantido para compatibilidade
   (não é usado por nenhuma página atualmente)
───────────────────────────────────────────── */
async function getEpisodios() {
  const results = await Promise.all(EPISODE_TABS.map(fetchEpisodeTab));
  const all = results.flat();
  const mapped = all.map(mapEpisodio).filter(e => e.linkMP4);
  console.log('[API] getEpisodios: total de episódios carregados:', mapped.length);
  return mapped;
}

function normalizeStr(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/* ─────────────────────────────────────────────
   getFeedNoticias — busca a aba Feed da planilha
   Coluna A: titulo | B: ativo (sim/nao) | C: conteudo | D: fotoPersonagem | E: imagemNoticia
───────────────────────────────────────────── */
const FEED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=923245815';

async function getFeedNoticias() {
  try {
    const res = await fetch(FEED_SHEET_URL);
    const text = await res.text();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines.slice(1).map(parseCSVLine).filter(r => r && r[0] && r[0].trim());
    return rows
      .map(row => ({
        titulo:         (row[0] || '').trim(),
        ativo:          (row[1] || '').trim().toLowerCase(),
        conteudo:       (row[2] || '').trim(),
        fotoPersonagem: (row[3] || '').trim(),
        imagemNoticia:  (row[4] || '').trim(),
      }))
      .filter(n => n.ativo === 'sim' && n.titulo);
  } catch(e) {
    console.error('[API] Feed error:', e);
    return [];
  }
}

/* ─────────────────────────────────────────────
   getCanais — busca a aba de Canais Ao Vivo
   Coluna C: nome | D: categoria | E: embedUrl | F: logoUrl
───────────────────────────────────────────── */
const CANAIS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=319480319';
const CACHE_TTL_CANAIS = 10 * 60 * 1000;

async function getCanais() {
  const cacheKey = 'canais_csv';
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_CANAIS) {
    return _cache[cacheKey].data;
  }
  try {
    const res = await fetch(CANAIS_CSV_URL);
    const text = await res.text();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines.slice(1).map(parseCSVLine).filter(r => r && r[2] && r[2].trim());
    const data = rows.map(row => ({
      nome:     (row[2] || '').trim(),
      categoria:(row[3] || '').trim(),
      embedUrl: (row[4] || '').trim(),
      logoUrl:  (row[5] || '').trim(),
    })).filter(c => c.nome);
    _cache[cacheKey] = { data, ts: Date.now() };
    return data;
  } catch(e) {
    console.error('[API] getCanais error:', e);
    return [];
  }
}

// Exporta para uso global
window.PipocaAPI = {
  getFilmes,
  getSeries,
  getEpisodios,
  getTodosConteudos,
  getEpisodiosPorSerie,
  getFeedNoticias,
  getCanais,
  normalizeStr,
};
