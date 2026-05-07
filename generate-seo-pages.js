/**
 * PIPOCAFLIX — Gerador de Páginas SEO Estáticas
 * node generate-seo-pages.js
 */

const fs   = require('fs');
const path = require('path');

const WORKER_BASE = 'https://autumn-pine-50da.slacarambafdsosobrenome.workers.dev';
const SITE_URL    = 'https://www.pipocaflix.fun';

// ── CSV parser (igual ao api.js) ─────────────────────────
function parseCSVLine(line) {
  const cols = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const rows = [];
  for (const line of lines) { if (line.trim()) rows.push(parseCSVLine(line)); }
  return rows.slice(1).filter(r => r && r[0] && r[0].trim());
}

function mapFilme(row) {
  return { nome:row[0]||'', sinopse:row[2]||'', capa:row[3]||'', categoria:row[4]||'', ano:row[5]||'', audio:row[12]||'', isSerie:false };
}
function mapSerie(row) {
  return { nome:row[0]||'', sinopse:row[2]||'', capa:row[3]||'', categoria:row[4]||'', ano:row[5]||'', audio:row[12]||'', isSerie:true };
}

// ── Helpers ──────────────────────────────────────────────
function slugify(str) {
  return (str||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim()
    .replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,80);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trunc(s,n){ s=(s||'').trim(); return s.length>n?s.slice(0,n-3)+'...':s; }

// ── Template HTML da página estática ────────────────────
function buildPage(item, tipo) {
  const slug    = slugify(item.nome);
  const pageUrl = `${SITE_URL}/${tipo}/${slug}`;
  const dynUrl  = `${SITE_URL}/${tipo==='filmes'?'filme':'serie'}.html?nome=${encodeURIComponent(item.nome)}`;
  const title   = `${esc(item.nome)}${item.ano?' ('+item.ano+')':''} — Assistir Online Grátis | PipocaFlix`;
  const desc    = trunc(item.sinopse
    ? `Assista ${item.nome} online grátis. ${item.sinopse}`
    : `Assista ${item.nome}${item.ano?' ('+item.ano+')':''} online grátis no PipocaFlix.`, 160);
  const tipoLabel = tipo==='filmes'?'Filme':'Série';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type"        content="${tipo==='filmes'?'video.movie':'video.tv_show'}">
<meta property="og:title"       content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image"       content="${esc(item.capa)}">
<meta property="og:url"         content="${pageUrl}">
<meta property="og:site_name"   content="PipocaFlix">
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="${title}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image"       content="${esc(item.capa)}">
<link rel="canonical" href="${pageUrl}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"${tipo==='filmes'?'Movie':'TVSeries'}","name":"${esc(item.nome)}","description":"${esc(trunc(desc,120))}","image":"${esc(item.capa)}","datePublished":"${esc(item.ano)}","genre":"${esc(item.categoria)}","url":"${pageUrl}"}
</script>
<meta name="theme-color" content="#ff2d43">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#f0f0f6;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1rem}
.card{max-width:460px;width:100%;text-align:center}
img{width:100%;max-width:280px;border-radius:12px;box-shadow:0 8px 40px rgba(255,45,67,0.35);margin-bottom:1.5rem}
h1{font-size:clamp(1.3rem,4vw,1.9rem);font-weight:800;margin-bottom:.5rem;line-height:1.2}
.meta{color:#888;font-size:.82rem;margin-bottom:1rem;display:flex;gap:.4rem;justify-content:center;flex-wrap:wrap}
.badge{background:rgba(255,45,67,.15);border:1px solid rgba(255,45,67,.3);color:#ff4d5e;padding:2px 10px;border-radius:20px;font-size:.72rem;font-weight:600}
p{color:#aaa;font-size:.88rem;line-height:1.6;margin-bottom:1.5rem}
a.btn{display:inline-block;background:#ff2d43;color:#fff;text-decoration:none;padding:.8rem 2.2rem;border-radius:30px;font-weight:700;font-size:1rem;box-shadow:0 4px 20px rgba(255,45,67,.4)}
.logo{font-size:1rem;font-weight:800;color:#ff2d43;margin-bottom:2rem;letter-spacing:1px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🍿 PipocaFlix</div>
  ${item.capa?`<img src="${esc(item.capa)}" alt="${esc(item.nome)}" loading="eager">`:''}
  <h1>${esc(item.nome)}${item.ano?` <span style="color:#555;font-size:.65em">(${esc(item.ano)})</span>`:''}</h1>
  <div class="meta">
    <span class="badge">${tipoLabel}</span>
    ${item.categoria?`<span class="badge">${esc(item.categoria)}</span>`:''}
    ${item.audio?`<span class="badge">${esc(item.audio)}</span>`:''}
  </div>
  ${item.sinopse?`<p>${esc(trunc(item.sinopse,200))}</p>`:''}
  <a class="btn" href="${dynUrl}">▶ Assistir Agora Grátis</a>
</div>
<script>window.location.replace('${dynUrl}');</script>
</body>
</html>`;
}

// ── Busca dados do Worker (CSV) ──────────────────────────
async function fetchCSV(route) {
  const url = WORKER_BASE + route;
  console.log(`  Buscando ${url} ...`);
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/csv, text/plain, */*',
      'Origin': 'https://www.pipocaflix.fun',
      'Referer': 'https://www.pipocaflix.fun/'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ── Main ─────────────────────────────────────────────────
async function generate() {
  console.log('\n🍿 PipocaFlix — Gerador SEO\n' + '='.repeat(38));

  let filmes = [], series = [];

  try {
    const csv = await fetchCSV('/filmes');
    filmes = parseCSV(csv).map(mapFilme).filter(f => f.nome);
    console.log(`  ✓ ${filmes.length} filmes`);
  } catch(e) { console.error('  ✗ Filmes:', e.message); }

  try {
    const csv = await fetchCSV('/series');
    series = parseCSV(csv).map(mapSerie).filter(s => s.nome);
    console.log(`  ✓ ${series.length} séries`);
  } catch(e) { console.error('  ✗ Séries:', e.message); }

  // Criar pastas de saída
  if (!fs.existsSync('filmes')) fs.mkdirSync('filmes');
  if (!fs.existsSync('series')) fs.mkdirSync('series');

  let gerados = 0;
  const sitemapUrls = [];

  for (const item of filmes) {
    if (!item.nome) continue;
    const slug = slugify(item.nome);
    fs.writeFileSync(path.join('filmes', slug+'.html'), buildPage(item,'filmes'), 'utf8');
    sitemapUrls.push(`${SITE_URL}/filmes/${slug}`);
    gerados++;
  }

  for (const item of series) {
    if (!item.nome) continue;
    const slug = slugify(item.nome);
    fs.writeFileSync(path.join('series', slug+'.html'), buildPage(item,'series'), 'utf8');
    sitemapUrls.push(`${SITE_URL}/series/${slug}`);
    gerados++;
  }

  // Atualizar sitemap.xml
  const today = new Date().toISOString().slice(0,10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/catalogo.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
${sitemapUrls.map(u=>`  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>`;
  fs.writeFileSync('sitemap.xml', sitemap, 'utf8');

  console.log(`\n✅ Pronto!`);
  console.log(`   Páginas geradas : ${gerados}`);
  console.log(`   /filmes/        : ${filmes.length} arquivos`);
  console.log(`   /series/        : ${series.length} arquivos`);
  console.log(`   sitemap.xml     : ${sitemapUrls.length} URLs`);
  console.log('\n📋 Próximo passo:');
  console.log('   Sobe as pastas filmes/ e series/ + sitemap.xml pro GitHub');
}

generate().catch(e => { console.error('Erro:', e.message); process.exit(1); });
