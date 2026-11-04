/**
 * PIPOCAFLIX — api/share.js  (Vercel Function)
 *
 * Gera a "página de preview" de um filme/série pra quando o link é colado no WhatsApp, Telegram,
 * Discord, Facebook, X/Twitter, iMessage, Slack, LinkedIn…
 *
 * Esses apps NÃO executam JavaScript: eles só leem as <meta> do HTML. Como filme.html e serie.html
 * carregam os dados no navegador, o link ficava com um cartão genérico. Aqui o servidor monta as
 * meta-tags certas (pôster + sinopse + ano/categoria) na hora, a partir da planilha.
 *
 * Como chega aqui:
 *   • vercel.json REDIRECIONA só os robôs de preview (pelo User-Agent) de /filme?nome=… e /serie?nome=…
 *     para esta função. Gente de verdade nunca passa por aqui nesses links.
 *   • /c/filme/<slug> e /c/serie/<slug> (links "bonitos") caem aqui pra todo mundo; quem é gente é
 *     mandado pro filme/série na hora (meta refresh + JS).
 *
 * A resposta fica no cache da Vercel (s-maxage), então a planilha quase nunca é lida de novo.
 */

const SITE   = 'https://www.pipocaflix.fun';
const WORKER = 'https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev';
const CACHE_MEM_MS = 10 * 60 * 1000;
const _mem = {};      // tipo → { linhas, ts }   (só vale enquanto a instância da função estiver "quente")

/* ───────── utilidades (mesma lógica do api.js do site) ───────── */
function normalizeStr(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
}
function slugify(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}
function parseCSVLine(line) {
  if (line.indexOf('"') === -1) { const c = line.split(','); for (let i = 0; i < c.length; i++) c[i] = c[i].trim(); return c; }
  const cols = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}
function primeiroCampo(line) {
  if (line.charCodeAt(0) === 34) {
    const n = line.length; let i = 1;
    while (i < n) { if (line.charCodeAt(i) === 34) { if (line.charCodeAt(i + 1) === 34) { i += 2; continue; } break; } i++; }
    if (i < n && (i + 1 === n || line.charCodeAt(i + 1) === 44)) return line.slice(1, i).replace(/""/g, '"').trim();
    return parseCSVLine(line)[0];
  }
  const c = line.indexOf(',');
  const campo = c === -1 ? line : line.slice(0, c);
  return campo.indexOf('"') === -1 ? campo.trim() : parseCSVLine(line)[0];
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const first = (v) => Array.isArray(v) ? v[0] : v;

/* ───────── dados ───────── */
async function carregarLinhas(tipo) {
  const c = _mem[tipo];
  if (c && Date.now() - c.ts < CACHE_MEM_MS) return c.linhas;
  const res = await fetch(WORKER + (tipo === 'serie' ? '/series' : '/filmes'), {
    // o Worker só atende quem "parece" o site — mesmo cabeçalho que o generate-seo-pages.js usa
    headers: { 'Origin': SITE, 'Referer': SITE + '/', 'User-Agent': 'PipocaFlix-Share/1.0', 'Accept': 'text/csv, text/plain, */*' },
  });
  if (!res.ok) throw new Error('Worker HTTP ' + res.status);
  let text = await res.text();
  if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
  const todas = text.split('\n'); const linhas = []; let cab = true;
  for (let i = 0; i < todas.length; i++) { const l = todas[i]; if (!l || !l.trim()) continue; if (cab) { cab = false; continue; } linhas.push(l); }
  _mem[tipo] = { linhas, ts: Date.now() };
  return linhas;
}

// mesma regra das páginas: 1º nome igual; senão o 1º que contém / está contido
function acharPorNome(linhas, nome) {
  const alvo = normalizeStr(nome); if (!alvo) return null;
  let aprox = null;
  for (let i = 0; i < linhas.length; i++) {
    const n = normalizeStr(primeiroCampo(linhas[i]));
    if (n === alvo) return parseCSVLine(linhas[i]);
    if (!aprox && n && (n.includes(alvo) || alvo.includes(n))) aprox = linhas[i];
  }
  return aprox ? parseCSVLine(aprox) : null;
}
function acharPorSlug(linhas, slug) {
  if (!slug) return null;
  for (let i = 0; i < linhas.length; i++) {
    if (slugify(primeiroCampo(linhas[i])) === slug) return parseCSVLine(linhas[i]);
  }
  return null;
}

/* ───────── página ───────── */
function aparar(txt, max) {
  txt = String(txt || '').replace(/\s+/g, ' ').trim();
  if (txt.length <= max) return txt;
  const corte = txt.slice(0, max - 1); const ult = corte.lastIndexOf(' ');
  return (ult > max * 0.6 ? corte.slice(0, ult) : corte).replace(/[,.;:\s-]+$/, '') + '…';
}
function urlHttp(u) { u = String(u || '').trim().replace(/^["']|["']$/g, ''); return /^https?:\/\//i.test(u) ? u : ''; }

function montarHtml({ tipo, row, urlPagina }) {
  const ehSerie = tipo === 'serie';
  const nome = row ? row[0] : '';
  const ano = row ? (row[5] || '') : '';
  const cats = row ? (row[4] || '').split(/[,;/|]/).map(s => s.trim()).filter(Boolean).slice(0, 3).join(', ') : '';
  const dur = row ? (row[6] || '') : '';
  const sin = row ? (row[2] || '') : '';
  const capa = row ? urlHttp(row[3]) : '';
  const backdrop = row ? urlHttp(row[20]) : '';
  const imagem = backdrop || capa || SITE + '/icon-512.png';

  let titulo, desc;
  if (row) {
    titulo = nome + (ano ? ' (' + ano + ')' : '') + ' — Assistir no PipocaFlix';
    const ficha = [ehSerie ? '📺 Série' : '🎬 Filme', cats, dur].filter(Boolean).join(' • ');
    const rodape = ' ▶ Teste grátis 3h no PipocaFlix.';
    desc = ficha + (sin ? ' — ' + aparar(sin, Math.max(60, 200 - ficha.length - rodape.length)) : '') + rodape;
  } else {
    titulo = 'PipocaFlix — Filmes e séries online';
    desc = 'Milhares de filmes e séries em um só lugar. Teste grátis por 3 horas, sem cartão.';
  }

  const og = [
    ['property', 'og:site_name', 'PipocaFlix'],
    ['property', 'og:locale', 'pt_BR'],
    ['property', 'og:type', row ? (ehSerie ? 'video.tv_show' : 'video.movie') : 'website'],
    ['property', 'og:title', titulo],
    ['property', 'og:description', desc],
    ['property', 'og:url', urlPagina],
    ['property', 'og:image', imagem],
    ['property', 'og:image:alt', row ? 'Pôster de ' + nome : 'PipocaFlix'],
    ['name', 'twitter:card', backdrop ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', titulo],
    ['name', 'twitter:description', desc],
    ['name', 'twitter:image', imagem],
  ].map(([k, n, c]) => `<meta ${k}="${n}" content="${esc(c)}">`).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(urlPagina)}">
${og}
<meta http-equiv="refresh" content="0;url=${esc(urlPagina)}">
<script>location.replace(${JSON.stringify(urlPagina).replace(/</g, '\\u003c')});</script>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0c10;color:#f0f0f6;font-family:system-ui,sans-serif;text-align:center}a{color:#ff2d43}</style>
</head>
<body>
<p>🍿 Abrindo <strong>${esc(row ? nome : 'PipocaFlix')}</strong>… <a href="${esc(urlPagina)}">clique aqui se não abrir</a>.</p>
</body>
</html>`;
}

/* ───────── handler ───────── */
module.exports = async (req, res) => {
  const q = req.query || {};
  const tipo = String(first(q.tipo) || '').toLowerCase() === 'serie' ? 'serie' : 'filme';
  const nomeQ = first(q.nome);
  const slugQ = first(q.slug);
  let row = null;
  try {
    const linhas = await carregarLinhas(tipo);
    row = nomeQ ? acharPorNome(linhas, String(nomeQ)) : acharPorSlug(linhas, slugify(String(slugQ || '')));
  } catch (e) {
    // planilha fora do ar → entrega o cartão genérico (e NÃO guarda isso no cache por muito tempo)
    row = null;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }

  const base = tipo === 'serie' ? '/serie' : '/filme';
  const urlPagina = row
    ? SITE + base + '?nome=' + encodeURIComponent(row[0])
    : (slugQ ? SITE + '/buscar?q=' + encodeURIComponent(String(slugQ).replace(/-/g, ' ')) : SITE + '/');
  const html = montarHtml({ tipo, row, urlPagina });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', row
      ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
      : 'public, max-age=0, s-maxage=300');
  }
  res.setHeader('X-Robots-Tag', 'noindex');     // é só uma "ponte" de preview; o Google indexa as páginas de verdade
  res.end(html);
};

// exposto só pros testes
module.exports._interno = { normalizeStr, slugify, acharPorNome, acharPorSlug, montarHtml, parseCSVLine, primeiroCampo };
