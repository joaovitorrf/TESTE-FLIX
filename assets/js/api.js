/**
 * PIPOCAFLIX - api.js
 * Integração Google Sheets via Worker Cloudflare
 *
 * Workers:
 *   WORKER_BASE    → filmes, series (planilha principal) + abas pequenas (/aba/top10, feed, canais…)
 *   EPISODES_WORKER → episodios (planilha separada, 11 abas)
 *
 * ── O QUE ESTA VERSÃO FAZ DE DIFERENTE (velocidade) ───────────────────────────────────────────
 *  • Leitor de CSV mais rápido: linha sem aspas vira split(',') (antes era caractere por caractere).
 *  • Nunca baixa a mesma planilha duas vezes ao mesmo tempo (várias páginas pediam séries 2x).
 *  • Pré-busca: o <head> das páginas pode largar o download do CSV antes do resto da página
 *    carregar (window.__pfPre) — o api.js aproveita esse download já em andamento.
 *  • getFilmePorNome / getSeriePorNome: acha UM título sem transformar as ~30 mil linhas em
 *    objetos (a página do filme/série só precisa de um).
 *  • Episódios: em vez de transformar ~70 mil linhas em objetos pra achar os de UMA série, olha só
 *    o nome (1ª coluna) de cada linha e só lê por completo as que são da série.
 *  • Abas pequenas (Top 10, Feed, Canais, Plataformas, Seções, Avatares) passam pelo Worker
 *    (cache no edge). Se o Worker for a versão antiga, cai sozinho pro Google, como antes.
 *  • Top 10: coluna B da planilha diz se o título da coluna A é "Filme" ou "Serie".
 */

const WORKER_BASE = "https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev";

const ROUTES = {
  FILMES: "/filmes",
  SERIES: "/series",
};

const EPISODES_WORKER = "https://shy-dream-7986.slacarambafdsosobrenome.workers.dev";
const EPISODE_TABS = [
  '/episodios1', '/episodios2', '/episodios3', '/episodios4',
  '/episodios5', '/episodios6', '/episodios7', '/episodios8',
  '/episodios9', '/episodios10', '/episodios11'
];

// Cache em memória — filmes/séries: 5 min, episódios por série: 10 min
const _cache = {};
const _inflight = {};   // downloads em andamento (chave → Promise): evita baixar a mesma coisa 2x ao mesmo tempo
const _linhas = {};     // CSV já separado em linhas (ainda não transformado em colunas)
const CACHE_TTL_GERAL    = 5  * 60 * 1000;
const CACHE_TTL_EPISODIOS = 10 * 60 * 1000;

// Junta pedidos iguais que chegam ao mesmo tempo numa só Promise.
function dedupe(chave, criar) {
  if (_inflight[chave]) return _inflight[chave];
  const p = Promise.resolve().then(criar).finally(() => { if (_inflight[chave] === p) delete _inflight[chave]; });
  _inflight[chave] = p;
  return p;
}

// Pré-busca largada pelo <head> da página (window.__pfPre[url] = fetch(url)). Só dá pra usar uma vez.
function pegarPreBusca(url) {
  try {
    const m = window.__pfPre;
    if (m && m[url]) { const p = m[url]; delete m[url]; return p; }
  } catch (e) {}
  return null;
}

/* ─────────────────────────────────────────────
   Quebra o texto do CSV em linhas de DADOS
   (sem a linha de cabeçalho e sem linhas em branco).
───────────────────────────────────────────── */
function separarLinhas(text) {
  if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
  const todas = text.split('\n');
  const out = [];
  let cabecalho = true;
  for (let i = 0; i < todas.length; i++) {
    const l = todas[i];
    if (!l || !l.trim()) continue;
    if (cabecalho) { cabecalho = false; continue; }
    out.push(l);
  }
  return out;
}

function linhasParaRows(linhas) {
  const rows = [];
  for (let i = 0; i < linhas.length; i++) {
    const r = parseCSVLine(linhas[i]);
    if (r[0]) rows.push(r);       // já vem sem espaços nas pontas: vazio = linha sem nome
  }
  return rows;
}

/* ─────────────────────────────────────────────
   fetchCSVLines — baixa o CSV (filmes ou séries) e devolve as linhas
───────────────────────────────────────────── */
function fetchCSVLines(tab, retries = 3, delay = 1200) {
  const c = _linhas[tab];
  if (c && Date.now() - c.ts < CACHE_TTL_GERAL) return Promise.resolve(c.lines);
  return dedupe('lines_' + tab, async () => {
    const workerUrl = WORKER_BASE + ROUTES[tab];
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let res = null;
        if (attempt === 1) {
          const pre = pegarPreBusca(workerUrl);
          if (pre) { try { res = await pre; } catch (e) { res = null; } if (res && !res.ok) res = null; }
        }
        if (!res) {
          const ctrl  = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 12000);
          try {
            res = await fetch(workerUrl, { signal: ctrl.signal, headers: { 'Accept': 'text/csv, text/plain, */*' } });
          } finally { clearTimeout(timer); }
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${tab}`);
        const lines = separarLinhas(await res.text());
        _linhas[tab] = { lines, ts: Date.now() };
        return lines;
      } catch (err) {
        if (attempt === retries) {
          console.error(`[API] Falha ao buscar ${tab} após ${retries} tentativas:`, err);
          return [];
        }
        await new Promise(r => setTimeout(r, delay * attempt));
      }
    }
  });
}

/* ─────────────────────────────────────────────
   fetchCSV — filmes e séries (planilha principal) → linhas já em colunas
───────────────────────────────────────────── */
function fetchCSV(tab, retries = 3, delay = 1200) {
  const c = _cache[tab];
  if (c && Date.now() - c.ts < CACHE_TTL_GERAL) return Promise.resolve(c.data);
  return dedupe('csv_' + tab, async () => {
    const lines = await fetchCSVLines(tab, retries, delay);
    const data = linhasParaRows(lines);
    if (lines.length) _cache[tab] = { data, ts: Date.now() };
    delete _linhas[tab];            // o texto já virou colunas: libera a memória
    return data;
  });
}

/* ─────────────────────────────────────────────
   fetchEpisodeTab — busca UMA aba de episódios (usado só por getEpisodios, que é raro)
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
      headers: { 'Accept': 'text/csv, text/plain, */*' }
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
  return linhasParaRows(separarLinhas(text));
}

function parseCSVLine(line) {
  // Caminho rápido: sem aspas não existe vírgula "escondida" dentro de campo.
  if (line.indexOf('"') === -1) {
    const cols = line.split(',');
    for (let i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
    return cols;
  }
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

// Só o PRIMEIRO campo de uma linha CSV (já sem aspas e sem espaços nas pontas),
// sem transformar a linha inteira em colunas. Qualquer caso estranho cai no parser completo.
function primeiroCampo(line) {
  if (line.charCodeAt(0) === 34) {                       // campo entre aspas
    const n = line.length;
    let i = 1;
    while (i < n) {
      if (line.charCodeAt(i) === 34) {
        if (line.charCodeAt(i + 1) === 34) { i += 2; continue; }   // "" = aspas literal
        break;
      }
      i++;
    }
    if (i < n && (i + 1 === n || line.charCodeAt(i + 1) === 44)) {
      return line.slice(1, i).replace(/""/g, '"').trim();
    }
    return parseCSVLine(line)[0];
  }
  const c = line.indexOf(',');
  const campo = c === -1 ? line : line.slice(0, c);
  return campo.indexOf('"') === -1 ? campo.trim() : parseCSVLine(line)[0];
}

/* ─────────────────────────────────────────────
   parseCSVEpisodios — parser dedicado
   Filtra por coluna B (linkMP4) não vazia
───────────────────────────────────────────── */
function parseCSVEpisodios(text) {
  const rows = [];
  const linhas = separarLinhas(text);
  for (let i = 0; i < linhas.length; i++) {
    const r = parseCSVLine(linhas[i]);
    if (r && r[1] && r[1].trim()) rows.push(r);
  }
  return rows;
}

/* ─────────────────────────────────────────────
   Episódios de UMA série dentro do texto de uma aba:
   olha só o nome (1ª coluna) de cada linha — e só lê por completo as que batem.
───────────────────────────────────────────── */
function filtrarEpisodiosDaSerie(text, nomeNorm) {
  const out = [];
  if (!nomeNorm) return out;
  const linhas = separarLinhas(text);
  const memo = new Map();       // o mesmo nome se repete em todos os episódios da série
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const campo = primeiroCampo(linha);
    let n = memo.get(campo);
    if (n === undefined) { n = normalizeStr(campo); memo.set(campo, n); }
    if (n !== nomeNorm) continue;
    const r = parseCSVLine(linha);
    if (r[1] && r[1].trim()) out.push(r);
  }
  return out;
}

async function buscarEpisodiosNaAba(route, nomeNorm) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(EPISODES_WORKER + route, { signal: ctrl.signal, headers: { 'Accept': 'text/csv, text/plain, */*' } });
    } finally { clearTimeout(timer); }
    if (!res.ok) { console.warn('[API] episódios', route, 'retornou', res.status); return { rows: [], ok: false }; }
    return { rows: filtrarEpisodiosDaSerie(await res.text(), nomeNorm), ok: true };
  } catch (err) {
    console.warn('[API] episódios', route, 'erro:', err && err.message);
    return { rows: [], ok: false };
  }
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
    visivel:      (row[22] || '').trim().toUpperCase() !== 'FALSE', // coluna W — TRUE/vazio = aparece, FALSE = some da busca/recomendações
    plataforma:   row[24] || '',  // coluna Y — plataforma de streaming
    legendas:     row[25] || '',  // coluna Z — legendas (opcional). Formato: "Rótulo:idioma:url|Rótulo2:idioma2:url2"
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
    visivel:    (row[14] || '').trim().toUpperCase() !== 'FALSE', // coluna O (aba séries) — TRUE/vazio = aparece, FALSE = some da busca/recomendações
    backdrop:   row[20] || '',  // coluna U — imagem paisagem para hero desktop
    plataforma: row[24] || '',  // coluna Y — plataforma de streaming (se a aba de séries tiver essa coluna)
    legendas:   row[25] || '',  // coluna Z — legendas padrão da série (opcional, mesmo formato de mapFilme)
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
    legendas:  (row[10] || '').trim(),  // coluna K — legendas específicas do episódio (opcional)
  };
}

/* ─────────────────────────────────────────────
   parseLegendas — converte a string da planilha em
   faixas utilizáveis pelo player.
   Formato aceito: "Rótulo:idioma:url|Rótulo2:idioma2:url2"
   Ex: "Português:pt-BR:https://cdn.site.com/pt.vtt"
   Linhas mal formadas são ignoradas silenciosamente.
───────────────────────────────────────────── */
function parseLegendas(str) {
  if (!str || !str.trim()) return [];
  return str.split('|').map(function (part) {
    var bits = part.split(':');
    if (bits.length < 3) return null;
    var label = (bits[0] || '').trim();
    var lang = (bits[1] || '').trim();
    var url = bits.slice(2).join(':').trim(); // rejunta o resto (a url pode ter "://")
    if (!label || !lang || !url) return null;
    return { label: label, lang: lang, src: url };
  }).filter(Boolean);
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

/* ─────────────────────────────────────────────
   getFilmePorNome / getSeriePorNome
   Acha UM título sem transformar o catálogo inteiro em objetos.
   Regra igual à das páginas filme.html / serie.html:
     1º nome IGUAL (sem acento/pontuação/maiúscula) → senão o 1º que "contém" / "está contido".
   Devolve null se não achar (aí a página usa o caminho completo, como antes).
───────────────────────────────────────────── */
function acharRowPorNome(rows, alvo) {
  let aprox = null;
  for (let i = 0; i < rows.length; i++) {
    const n = normalizeStr(rows[i][0]);
    if (n === alvo) return rows[i];
    if (!aprox && (n.includes(alvo) || alvo.includes(n))) aprox = rows[i];
  }
  return aprox;
}
function acharLinhaPorNome(linhas, alvo) {
  let aprox = null;
  for (let i = 0; i < linhas.length; i++) {
    const n = normalizeStr(primeiroCampo(linhas[i]));
    if (n === alvo) return parseCSVLine(linhas[i]);
    if (!aprox && n && (n.includes(alvo) || alvo.includes(n))) aprox = linhas[i];
  }
  return aprox ? parseCSVLine(aprox) : null;
}
async function acharItemPorNome(tab, nome, mapper) {
  const alvo = normalizeStr(String(nome || ''));
  if (!alvo) return null;
  const c = _cache[tab];
  const row = (c && Date.now() - c.ts < CACHE_TTL_GERAL)
    ? acharRowPorNome(c.data, alvo)
    : acharLinhaPorNome(await fetchCSVLines(tab), alvo);
  if (!row) return null;
  const item = mapper(row);
  return item.nome ? item : null;
}
async function getFilmePorNome(nome) { return acharItemPorNome('FILMES', nome, mapFilme); }
async function getSeriePorNome(nome) { return acharItemPorNome('SERIES', nome, mapSerie); }

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

  // Se já tem uma busca desta série em andamento (ex.: a página pré-buscou), junta com ela.
  return dedupe(cacheKey, async () => {
    console.log('[API] getEpisodiosPorSerie: buscando episódios de', nomeSerieOriginal);

    // Todas as abas em paralelo — cada uma já devolve SÓ as linhas da série pedida
    const resultados = await Promise.all(EPISODE_TABS.map(r => buscarEpisodiosNaAba(r, nomeNorm)));

    // Aba que falhou (rede / tempo esgotado) ganha UMA segunda chance. Antes, uma aba que
    // falhava virava "sem episódios" e o resultado ficava no cache por 10 minutos.
    const falhas = [];
    resultados.forEach((x, i) => { if (!x.ok) falhas.push(i); });
    if (falhas.length) {
      const novas = await Promise.all(falhas.map(i => buscarEpisodiosNaAba(EPISODE_TABS[i], nomeNorm)));
      falhas.forEach((idx, k) => { resultados[idx] = novas[k]; });
    }
    const algumaFalhou = resultados.some(x => !x.ok);

    const filtrados = resultados
      .map(x => x.rows)
      .flat()
      .map(mapEpisodio)
      .filter(e => e.linkMP4)
      .filter(e => isNomeSerieMatch(normalizeStr(e.serie), nomeNorm));

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

    // Salva no cache por série (se alguma aba falhou, NÃO salva: a próxima chamada tenta de novo)
    if (!algumaFalhou) _cache[cacheKey] = { data: temporadas, ts: Date.now() };

    return temporadas;
  });
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
   isNomeSerieMatch — compara o nome da série da aba
   de episódios com o nome pedido pela página.

   BUG CORRIGIDO (13/09/2026): a versão antiga usava
   serieNorm.includes(nomeNorm) || nomeNorm.includes(serieNorm),
   um includes() "cru". Isso causava falso-positivo em
   pares tipo "Reacher" x "Preacher": normalizeStr("Preacher")
   é "preacher", que CONTÉM "reacher" como substring — então
   os episódios de uma série apareciam colados na outra (e
   vice-versa).

   Testei também uma versão "por palavra inteira" (ex: exigir
   que "reacher" apareça como palavra separada, não dentro de
   outra palavra) — mas ISSO AINDA quebra em pares tipo "Dark"
   x "Dark Matter" (duas séries reais e diferentes), porque
   "Dark" é uma palavra inteira dentro de "Dark Matter".

   Por isso a versão final exige MATCH EXATO (após normalizar:
   minúsculas, sem acento/pontuação). É a única forma de garantir
   ZERO contaminação entre séries diferentes. Se depois desse
   fix uma série específica ficar sem episódios, o motivo é o
   nome dela na planilha de Séries estar diferente do nome usado
   na coluna "série" das abas de Episódios — aí é só igualar os
   dois nomes na planilha (mais seguro que o código "adivinhar").
───────────────────────────────────────────── */
function isNomeSerieMatch(serieNorm, nomeNorm) {
  return !!serieNorm && !!nomeNorm && serieNorm === nomeNorm;
}

/* ─────────────────────────────────────────────
   getFeedNoticias — busca a aba Feed da planilha
   Coluna A: titulo | B: ativo (sim/nao) | C: conteudo | D: fotoPersonagem | E: imagemNoticia
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   fetchSheetText — abas pequenas da planilha "geral" (Top 10, Feed, Canais, Plataformas,
   Seções, Avatares). Tenta o Worker (cache no edge, rápido); se o Worker for a versão
   antiga ou falhar, busca direto no Google, como era antes.
───────────────────────────────────────────── */
const WORKER_ABAS = {
  top10: '/aba/top10', feed: '/aba/feed', canais: '/aba/canais',
  plataformas: '/aba/plataformas', secoes: '/aba/secoes', avatares: '/aba/avatares'
};
let _workerAbasOff = false;
const _abaTexto = {};     // nome → { text, ts }   (cache curto, em memória)
const CACHE_TTL_ABA = 2 * 60 * 1000;

function fetchSheetText(nome, urlDireta) {
  const c = _abaTexto[nome];
  if (c && Date.now() - c.ts < CACHE_TTL_ABA) return Promise.resolve(c.text);
  return dedupe('aba_' + nome, async () => {
    const rota = WORKER_ABAS[nome];
    let text = null;
    if (rota && !_workerAbasOff) {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        let res;
        try { res = await fetch(WORKER_BASE + rota, { signal: ctrl.signal, headers: { 'Accept': 'text/csv, text/plain, */*' } }); }
        finally { clearTimeout(timer); }
        if (res.ok) {
          const t = await res.text();
          if (t && t.trim().charAt(0) !== '<') text = t;           // HTML = erro, não é CSV
        } else if (res.status === 404 || res.status === 403) {
          _workerAbasOff = true;                                    // Worker antigo (sem /aba/*): não insiste nesta visita
        }
      } catch (e) { /* cai pro Google direto */ }
    }
    if (text === null) {
      const res = await fetch(urlDireta);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    }
    _abaTexto[nome] = { text, ts: Date.now() };
    return text;
  });
}

const FEED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=923245815';

async function getFeedNoticias() {
  try {
    const text = await fetchSheetText('feed', FEED_SHEET_URL);
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
   Coluna J (SITUAÇÃO): vazio/TRUE = aparece normal.
                        FALSE      = o canal SOME do site inteiro
                        (home, lista de canais, jogos de hoje e página do canal).
   O filtro é feito AQUI, na origem, então nenhuma página consegue
   mostrar um canal FALSE por engano.
───────────────────────────────────────────── */
const CANAIS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=319480319';
const CACHE_TTL_CANAIS = 10 * 60 * 1000;

async function getCanais() {
  const cacheKey = 'canais_csv';
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_CANAIS) {
    return _cache[cacheKey].data;
  }
  try {
    const text = await fetchSheetText('canais', CANAIS_CSV_URL);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines.slice(1).map(parseCSVLine).filter(r => r && r[2] && r[2].trim());
    const data = rows.map(row => ({
      nome:     (row[2] || '').trim(),
      categoria:(row[3] || '').trim(),
      embedUrl: (row[4] || '').trim(),
      logoUrl:  (row[5] || '').trim(),
      visivel:  (row[9] || '').trim().toUpperCase() !== 'FALSE', // coluna J (SITUAÇÃO)
    })).filter(c => c.nome && c.visivel);
    _cache[cacheKey] = { data, ts: Date.now() };
    return data;
  } catch(e) {
    console.error('[API] getCanais error:', e);
    return [];
  }
}

/* ─────────────────────────────────────────────
   isVisivel / filtrarVisiveis — coluna W (planilha)
   TRUE ou vazio = aparece normalmente.
   FALSE         = some da busca e das recomendações
                   (mas continua acessível por link direto).
───────────────────────────────────────────── */
function isVisivel(item) {
  return !item || item.visivel !== false;
}
function filtrarVisiveis(lista) {
  return (lista || []).filter(isVisivel);
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
  isVisivel,
  filtrarVisiveis,
};

/* ─────────────────────────────────────────────
   getTop10 — busca a aba Top10 da planilha
   Coluna A: nome do filme/série (a partir da linha 2)
   Coluna B: palavra-chave "Filme" ou "Serie" (opcional) — resolve o caso de um filme e uma
             série com o MESMO nome. Sem palavra-chave, vale o comportamento antigo (filme primeiro).
───────────────────────────────────────────── */
const TOP10_CSV_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=1557218892';

// "Filme", "filmes", "FILME" → 'filme' | "Serie", "Série", "séries" → 'serie' | vazio/outra coisa → ''
function tipoTop10(v) {
  const t = normalizeStr(String(v || ''));
  if (!t) return '';
  const serie = t.indexOf('serie') !== -1, filme = t.indexOf('film') !== -1;
  if (serie && !filme) return 'serie';
  if (filme && !serie) return 'filme';
  return '';
}

// → [{ nome, tipo: 'filme' | 'serie' | '' }, …] na ordem da planilha
async function getTop10Items() {
  try {
    const text = await fetchSheetText('top10', TOP10_CSV_URL);
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
    // Pula linha 1 (cabeçalho). Coluna A = nome, coluna B = palavra-chave
    return lines.slice(1)
      .map(l => parseCSVLine(l))
      .map(r => ({ nome: ((r && r[0]) || '').trim(), tipo: tipoTop10(r && r[1]) }))
      .filter(x => x.nome.length > 0);
  } catch(e) {
    console.error('[API] getTop10Items error:', e);
    return [];
  }
}

// Só os nomes (mantido pra compatibilidade)
async function getTop10Names() {
  return (await getTop10Items()).map(i => i.nome);
}

/* resolverTop10(entradas, filmes, series) → itens do catálogo, na ordem da planilha.
   - "Filme" → procura só entre os filmes; "Serie" → só entre as séries.
   - sem palavra-chave → filme primeiro, depois série (comportamento antigo).
   - título que não existe no catálogo é pulado (e o motivo aparece no console). */
function resolverTop10(entradas, filmes, series) {
  const alvos = new Set(entradas.map(e => normalizeStr(e.nome)));
  const mapaF = new Map(), mapaS = new Map();
  for (const f of filmes) { const k = normalizeStr(f.nome); if (alvos.has(k) && !mapaF.has(k)) mapaF.set(k, f); }
  for (const s of series) { const k = normalizeStr(s.nome); if (alvos.has(k) && !mapaS.has(k)) mapaS.set(k, s); }
  const out = [];
  for (const e of entradas) {
    const k = normalizeStr(e.nome);
    const achou = e.tipo === 'serie' ? mapaS.get(k)
                : e.tipo === 'filme' ? mapaF.get(k)
                : (mapaF.get(k) || mapaS.get(k));
    if (!achou) { console.warn('[Top10] não achei no catálogo:', e.nome + (e.tipo ? ' (' + e.tipo + ')' : '')); continue; }
    if (out.indexOf(achou) === -1) out.push(achou);
  }
  return out;
}

window.PipocaAPI.getTop10Items = getTop10Items;
window.PipocaAPI.resolverTop10 = resolverTop10;
window.PipocaAPI.getFilmePorNome = getFilmePorNome;
window.PipocaAPI.getSeriePorNome = getSeriePorNome;
window.PipocaAPI.getTop10Names = getTop10Names;
window.PipocaAPI.parseLegendas = parseLegendas;

/* ─────────────────────────────────────────────
   getPlataformas — busca a aba de Plataformas
   Coluna A (a partir da linha 2): nome da plataforma
   Coluna B (a partir da linha 2): link da capa/logo
───────────────────────────────────────────── */
const PLATAFORMAS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU/export?format=csv&gid=1359259950';
const CACHE_TTL_PLATAFORMAS = 10 * 60 * 1000;

async function getPlataformas() {
  const cacheKey = 'plataformas_csv';
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_PLATAFORMAS) {
    return _cache[cacheKey].data;
  }
  try {
    const text = await fetchSheetText('plataformas', PLATAFORMAS_CSV_URL);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = lines.slice(1).map(parseCSVLine).filter(r => r && r[0] && r[0].trim());
    const data = rows.map(row => ({
      nome: (row[0] || '').trim(),
      capa: (row[1] || '').trim(),
    })).filter(p => p.nome);
    _cache[cacheKey] = { data, ts: Date.now() };
    return data;
  } catch (e) {
    console.error('[API] getPlataformas error:', e);
    return [];
  }
}

window.PipocaAPI.getPlataformas = getPlataformas;

/* ─────────────────────────────────────────────
   TMDB — títulos e capas de episódios
   (via proxy Cloudflare Worker, sem expor api_key)

   IMPORTANTE:
   - A proxy só aceita requisições com Origin
     "https://pipocaflix.fun". Em localhost ou em
     previews da Vercel ela retorna 403 — nesse caso
     as funções abaixo falham silenciosamente e o
     site cai de volta pro título genérico (T1 EP1),
     sem quebrar nada.
   - A QUANTIDADE de episódios/temporadas nunca vem
     daqui — continua vindo 100% da planilha via
     getEpisodiosPorSerie(). O TMDB só é usado pra
     "vestir" (nome + imagem) os episódios que a
     planilha já determinou que existem.
───────────────────────────────────────────── */
const TMDB_PROXY_BASE = 'https://tmbdnewchame.canalpedroid.workers.dev';
const TMDB_IMG_BASE   = 'https://image.tmdb.org/t/p/w300';
const CACHE_TTL_TMDB_ID     = 24 * 60 * 60 * 1000; // 24h — id de uma série não muda
const CACHE_TTL_TMDB_ID_NEG = 30 * 60 * 1000;      // 30min — cache curto quando não achou
const CACHE_TTL_TMDB_TEMP   = 6  * 60 * 60 * 1000; // 6h — episódios de uma temporada

async function tmdbFetch(path, params) {
  const url = new URL(TMDB_PROXY_BASE + path);
  url.searchParams.set('language', 'pt-BR');
  if (params) {
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        url.searchParams.set(k, params[k]);
      }
    });
  }
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Busca o ID da série no TMDB pelo nome (com cache).
// Se "ano" for informado, prioriza resultado cujo ano de estreia bate.
async function buscarTmdbIdSerie(nomeSerie, ano) {
  const cacheKey = 'tmdb_id_' + normalizeStr(nomeSerie);
  const cached = _cache[cacheKey];
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return cached.data;
  }

  const data = await tmdbFetch('/3/search/tv', { query: nomeSerie });
  const results = (data && Array.isArray(data.results)) ? data.results : [];

  let escolhido = null;
  if (results.length) {
    if (ano) {
      escolhido = results.find(r => (r.first_air_date || '').slice(0, 4) === String(ano).trim());
    }
    if (!escolhido) escolhido = results[0];
  }

  const id = escolhido ? escolhido.id : null;
  _cache[cacheKey] = { data: id, ts: Date.now(), ttl: id ? CACHE_TTL_TMDB_ID : CACHE_TTL_TMDB_ID_NEG };
  return id;
}

// Retorna um mapa { numeroDoEpisodio: { nome, imagem, sinopse } } pra uma temporada.
// Nunca decide QUANTOS episódios existem — isso é papel da planilha.
async function getTmdbEpisodiosTemporada(nomeSerie, ano, temporada) {
  try {
    const id = await buscarTmdbIdSerie(nomeSerie, ano);
    if (!id) return {};

    const cacheKey = 'tmdb_season_' + id + '_' + temporada;
    const cached = _cache[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL_TMDB_TEMP) {
      return cached.data;
    }

    const data = await tmdbFetch('/3/tv/' + id + '/season/' + temporada);
    const episodios = (data && Array.isArray(data.episodes)) ? data.episodes : [];

    const mapa = {};
    episodios.forEach(ep => {
      mapa[ep.episode_number] = {
        nome:    ep.name || '',
        imagem:  ep.still_path ? (TMDB_IMG_BASE + ep.still_path) : '',
        sinopse: ep.overview || ''
      };
    });

    _cache[cacheKey] = { data: mapa, ts: Date.now() };
    return mapa;
  } catch (e) {
    console.warn('[TMDB] Falha ao buscar episódios:', e.message);
    return {};
  }
}

window.PipocaAPI.getTmdbEpisodiosTemporada = getTmdbEpisodiosTemporada;


/* ─────────────────────────────────────────────
   Schema.org (JSON-LD) — dados estruturados pro Google

   As páginas filme.html / serie.html montam o conteúdo no navegador (a
   partir da planilha), então o JSON-LD também é montado aqui, quando o
   filme/série já foi encontrado. O Google renderiza JavaScript e lê esse
   bloco normalmente.

   Só entra o que EXISTE na planilha. A nota (aggregateRating) só entra com
   avaliações REAIS feitas no site (estrelas de 1 a 5, mín. 3 avaliações) —
   nunca inventada nem copiada de outro site (isso dá penalidade no Google).

   Itens ocultos (visivel = FALSE) não recebem o bloco — são itens que o
   dono escondeu da busca, então também não divulgamos pro Google.
───────────────────────────────────────────── */

// "2h 15min", "1h45", "105 min", "1:45", "01:45:00", "90" → "PT2H15M" (ISO 8601)
function duracaoParaISO(txt) {
  const s = String(txt || '').toLowerCase().trim();
  if (!s) return '';
  let h = 0, m = 0, mt;
  if ((mt = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/))) {
    h = +mt[1]; m = +mt[2];
  } else {
    const hm = s.match(/(\d+)\s*(?:horas?|hrs?|h)/);
    const mm = s.match(/(\d+)\s*(?:minutos?|mins?|m)\b/);
    if (hm) h = +hm[1];
    if (mm) m = +mm[1];
    if (hm && !mm) {                       // "1h45" (sem escrever "min")
      const tail = s.match(/(?:horas?|hrs?|h)\s*(\d{1,2})\s*$/);
      if (tail) m = +tail[1];
    }
    if (!hm && !mm && /^\d{1,3}$/.test(s)) m = +s;   // só o número = minutos
  }
  const total = h * 60 + m;
  if (!total || total > 1500) return '';   // vazio ou absurdo → não publica
  const H = Math.floor(total / 60), M = total % 60;
  return 'PT' + (H ? H + 'H' : '') + (M ? M + 'M' : '');
}

function montarSchemaOrg(item, extra) {
  if (!item || !item.nome) return null;
  const isSerie = !!item.isSerie;
  const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  const schema = {
    '@context': 'https://schema.org',
    '@type': isSerie ? 'TVSeries' : 'Movie',
    name: item.nome,
    url: location.origin + location.pathname + '?nome=' + encodeURIComponent(item.nome),
  };

  if (item.sinopse) schema.description = item.sinopse;
  if (/^https?:\/\//i.test(item.capa || '')) schema.image = item.capa;

  const ano = String(item.ano || '').match(/\b(?:19|20)\d{2}\b/);
  if (ano) { if (isSerie) schema.startDate = ano[0]; else schema.datePublished = ano[0]; }

  const generos = lista(item.categoria);
  if (generos.length) schema.genre = generos;

  const elenco = lista(item.nomeElenco).slice(0, 15).map(n => ({ '@type': 'Person', name: n }));
  if (elenco.length) schema.actor = elenco;

  if (isSerie) {
    const t = parseInt(item.totalTemp, 10);
    if (t > 0) schema.numberOfSeasons = t;
  } else {
    const dur = duracaoParaISO(item.duracao);
    if (dur) schema.duration = dur;
  }
  // Nota REAL: só entra quando existem avaliações de verdade feitas no site (stats.js), com no mínimo 3.
  const rt = extra && extra.rating;
  if (rt && rt.qtd >= 3 && rt.media >= 1 && rt.media <= 5) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(rt.media.toFixed(1)), ratingCount: rt.qtd, bestRating: 5, worstRating: 1 };
  }
  return schema;
}

// Coloca (ou atualiza) o <script type="application/ld+json"> no <head>.
function injetarSchemaOrg(item, extra) {
  try {
    if (!isVisivel(item)) return;
    const schema = montarSchemaOrg(item, extra);
    if (!schema) return;
    let el = document.getElementById('pflix-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'pflix-jsonld';
      document.head.appendChild(el);
    }
    // "<" escapado: o JSON continua válido e nunca "fecha" a tag <script> por acidente
    el.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
  } catch (e) {
    console.warn('[SEO] Schema.org falhou (o site segue normal):', e);
  }
}

window.PipocaAPI.injetarSchemaOrg = injetarSchemaOrg;
window.PipocaAPI.montarSchemaOrg  = montarSchemaOrg;
window.PipocaAPI.duracaoParaISO   = duracaoParaISO;


/* ═════════════════════════════════════════════════════════════════════
   NOVAS ABAS DA PLANILHA (rodada 2)
   ─ Avatares  (gid 712895202): A = categoria | B = links separados por vírgula
   ─ Seções    (gid 1958765563): A = nome da seção | B = Filmes / Series / Series/Filmes
                                 C = nomes EXATOS (como na planilha), separados por vírgula
   Estas abas usam um leitor de CSV que aguenta vírgula e quebra de linha
   DENTRO de uma célula (é o que acontece com uma lista de links/nomes).
═════════════════════════════════════════════════════════════════════ */
const SHEET_ID_PIPOCA = '1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU';
const AVATARES_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID_PIPOCA + '/export?format=csv&gid=712895202';
const SECOES_CSV_URL   = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID_PIPOCA + '/export?format=csv&gid=1958765563';
const CACHE_TTL_NOVAS_ABAS = 5 * 60 * 1000;

// CSV completo (várias linhas por célula, aspas duplas escapadas com "")
function parseCSVCompleto(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function baixarAba(url, cacheKey) {
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL_NOVAS_ABAS) return _cache[cacheKey].data;
  const rows = parseCSVCompleto(await fetchSheetText(cacheKey.replace(/_csv$/, ''), url));
  _cache[cacheKey] = { data: rows, ts: Date.now() };
  return rows;
}

/* getAvatares → [{ categoria: 'Anime', avatares: ['https://…', …] }, …]
   Categorias repetidas em linhas diferentes são juntadas numa só. */
async function getAvatares() {
  try {
    const rows = (await baixarAba(AVATARES_CSV_URL, 'avatares_csv')).slice(1);
    const porCat = new Map();
    rows.forEach(r => {
      const cat = (r[0] || '').trim();
      const links = ((r[1] || '').match(/https?:\/\/[^\s,;"|]+/g) || []);
      if (!cat || !links.length) return;
      if (!porCat.has(cat)) porCat.set(cat, []);
      links.forEach(l => { if (!porCat.get(cat).includes(l)) porCat.get(cat).push(l); });
    });
    return Array.from(porCat, ([categoria, avatares]) => ({ categoria, avatares }));
  } catch (e) {
    console.error('[API] getAvatares error:', e);
    return [];
  }
}

/* getSecoesHome → [{ titulo, tipo: 'filmes'|'series'|'ambos', nomes: ['Nome A', …] }, …] */
function tipoDaSecao(txt) {
  const t = normalizeStr(txt || '');
  const s = t.includes('serie'), f = t.includes('filme');
  return (s && f) ? 'ambos' : s ? 'series' : f ? 'filmes' : 'ambos';
}
async function getSecoesHome() {
  try {
    const rows = (await baixarAba(SECOES_CSV_URL, 'secoes_csv')).slice(1);
    return rows.map(r => ({
      titulo: (r[0] || '').trim(),
      tipo: tipoDaSecao(r[1]),
      // vírgula, ponto e vírgula, barra vertical ou quebra de linha separam os nomes
      nomes: String(r[2] || '').split(/\s*[,;|\n]\s*/).map(s => s.trim()).filter(Boolean),
      brutoC: String(r[2] || ''),
    })).filter(s => s.titulo && s.nomes.length);
  } catch (e) {
    console.error('[API] getSecoesHome error:', e);
    return [];
  }
}

/* Resolve os nomes da seção contra o catálogo. Aceita título que TEM vírgula
   (ex.: "Bad Boys, Parte 2"): tenta juntar pedaços vizinhos e vê se bate com
   um título real do catálogo antes de considerar cada pedaço isolado. */
function resolverSecao(secao, filmes, series) {
  const pool = secao.tipo === 'filmes' ? filmes : secao.tipo === 'series' ? series : filmes.concat(series);
  const mapa = new Map();
  pool.forEach(i => { const k = normalizeStr(i.nome); if (!mapa.has(k)) mapa.set(k, i); });
  const partes = secao.nomes, out = [], usados = new Set();
  for (let i = 0; i < partes.length; i++) {
    let achou = null, fim = i;
    for (let j = Math.min(partes.length - 1, i + 3); j >= i; j--) {   // tenta o maior "grudado" primeiro
      const cand = mapa.get(normalizeStr(partes.slice(i, j + 1).join(', ')));
      if (cand) { achou = cand; fim = j; break; }
    }
    if (achou && !usados.has(achou.nome)) { out.push(achou); usados.add(achou.nome); }
    i = fim;
  }
  return out;
}

/* montarSecoesHome(filmes, series) → [{ titulo, tipo, itens: [...] }] (só as que têm itens) */
async function montarSecoesHome(filmes, series) {
  const secoes = await getSecoesHome();
  return secoes
    .map(s => ({ titulo: s.titulo, tipo: s.tipo, itens: resolverSecao(s, filmes, series) }))
    .filter(s => s.itens.length);
}

/* ═════════════════════════════════════════════════════════════════════
   TMDB — busca de filme/série (usada em pedidos.html) e checagem PRECISA
   de "esse título já existe no site?"
═════════════════════════════════════════════════════════════════════ */
async function buscarTmdb(tipo, query) {
  query = String(query || '').trim();
  if (query.length < 2) return [];
  const data = await tmdbFetch(tipo === 'serie' ? '/3/search/tv' : '/3/search/movie', { query: query, include_adult: 'false' });
  const results = (data && Array.isArray(data.results)) ? data.results : [];
  return results.slice(0, 12).map(r => ({
    id: r.id, tipo: tipo === 'serie' ? 'serie' : 'filme',
    titulo: r.title || r.name || '',
    tituloOriginal: r.original_title || r.original_name || '',
    ano: String(r.release_date || r.first_air_date || '').slice(0, 4),
    capa: r.poster_path ? 'https://image.tmdb.org/t/p/w342' + r.poster_path : '',
    sinopse: r.overview || '',
  })).filter(r => r.titulo);
}

/* acharNoSite(resultadoTmdb, filmes, series)
   → { status: 'tem' | 'nao' | 'mesmo-nome-outro-ano', item?, outroAno? }
   Regras (busca precisa, sem "parecido"):
     1) só compara dentro do mesmo tipo (filme com filme, série com série);
     2) o nome tem que ser IGUAL depois de tirar acento, maiúscula e pontuação —
        vale o título em português OU o original;
     3) se os dois lados têm ano, o ano tem que bater (±1 pelo fuso/estreia).
        Mesmo nome com ano bem diferente = outro filme (refilmagem) → "nao". */
function acharNoSite(r, filmes, series) {
  const pool = r.tipo === 'serie' ? series : filmes;
  const alvos = [r.titulo, r.tituloOriginal].map(x => normalizeStr(x || '')).filter(Boolean);   // tolera campo ausente
  const mesmoNome = pool.filter(i => alvos.includes(normalizeStr(i.nome || '')));
  if (!mesmoNome.length) return { status: 'nao' };
  const anoR = parseInt(r.ano, 10);
  const bate = mesmoNome.find(i => {
    const a = parseInt(String(i.ano || '').match(/\d{4}/), 10);
    return !anoR || !a || Math.abs(a - anoR) <= 1;
  });
  if (bate) return { status: 'tem', item: bate };
  return { status: 'mesmo-nome-outro-ano', outroAno: mesmoNome[0] };
}

window.PipocaAPI.getAvatares      = getAvatares;
window.PipocaAPI.getSecoesHome    = getSecoesHome;
window.PipocaAPI.resolverSecao    = resolverSecao;
window.PipocaAPI.montarSecoesHome = montarSecoesHome;
window.PipocaAPI.buscarTmdb       = buscarTmdb;
window.PipocaAPI.acharNoSite      = acharNoSite;
window.PipocaAPI.parseCSVCompleto = parseCSVCompleto;
