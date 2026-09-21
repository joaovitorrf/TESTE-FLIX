/**
 * PIPOCAFLIX — stats.js  (avaliações, visualizações e "Em alta" de verdade)
 *
 * Substitui o "Em alta" antigo, que só contava cliques do próprio navegador
 * (e até inventava números aleatórios na primeira visita).
 *
 * COMO FUNCIONA
 *   • Cada filme/série tem uma chave:  f_nome-do-filme  /  s_nome-da-serie
 *   • Firestore:
 *       avaliacoes/{uid}_{chave}           → a nota (1-5) de UMA pessoa
 *       conteudo/{chave}                   → totais de sempre: views, somaNotas, qtdNotas
 *       trending/{semana}/itens/{chave}    → pontos da semana (é daqui que sai o "Em alta")
 *   • Pontos do "Em alta":
 *       +1 por visualização (quem abriu o player — mesmo que ache ruim, ajuda a bombar)
 *       + bônus pela nota:  1★ +0,5 · 2★ +1 · 3★ +2 · 4★ +4 · 5★ +6
 *       A semana passada entra com peso 0,4 pra não zerar tudo na segunda-feira.
 *   • O resultado fica 30 min em cache no navegador (poupa leituras do Firestore).
 *
 * USO
 *   PipocaStats.registrarView({ nome, isSerie })       ← chamado quando o player abre
 *   PipocaStats.montarWidget('idDoDiv', { nome, isSerie })   ← caixinha de estrelas
 *   PipocaStats.getTrending({ limite: 15 })            ← usado pela home
 *
 * Incluir com:  <script type="module" src="assets/js/stats.js"></script>
 * (depois do bloco que cria window.PipocaAuth)
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, writeBatch, increment, serverTimestamp,
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const ROTULOS = {
  1: 'Pipoca molhada',
  2: 'Pipoca sem sal',
  3: 'Pipoca aceitável',
  4: 'Pipoca boa',
  5: 'Pipoca gostosa'
};
const BONUS = [0, 0.5, 1, 2, 4, 6];          // pontos extras no "Em alta" por nota
const VIEW_COOLDOWN_MS = 6 * 60 * 60 * 1000;  // a mesma pessoa só soma 1 view a cada 6h
const TRENDING_CACHE_MS = 30 * 60 * 1000;
const PESO_SEMANA_PASSADA = 0.4;

let _db = null;
function db() {
  if (_db) return _db;
  const app = getApps()[0];
  if (!app) return null;
  _db = getFirestore(app);
  return _db;
}

/* ───────── chaves ───────── */
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome';
}
function chave(item) { return (item && item.isSerie ? 's_' : 'f_') + slug(item && item.nome); }

// "2026-W38" — semana ISO em UTC
function semanaId(data) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const ano = d.getUTCFullYear();
  const ini = new Date(Date.UTC(ano, 0, 1));
  const sem = Math.ceil(((d - ini) / 86400000 + 1) / 7);
  return ano + '-W' + String(sem).padStart(2, '0');
}

function usuario() {
  return (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser()) || null;
}

/* ───────── visualizações ───────── */
async function registrarView(item) {
  try {
    const d = db(); if (!d || !item || !item.nome) return;
    const k = chave(item);
    const lsKey = 'pflix_view_' + k;
    const ultimo = +localStorage.getItem(lsKey) || 0;
    if (Date.now() - ultimo < VIEW_COOLDOWN_MS) return;
    localStorage.setItem(lsKey, String(Date.now()));

    const tipo = item.isSerie ? 'serie' : 'filme';
    const b = writeBatch(d);
    b.set(doc(d, 'conteudo', k), { nome: item.nome, tipo: tipo, views: increment(1) }, { merge: true });
    b.set(doc(d, 'trending', semanaId(new Date()), 'itens', k),
      { nome: item.nome, tipo: tipo, views: increment(1), score: increment(1) }, { merge: true });
    await b.commit();
  } catch (e) { console.warn('[Stats] view não registrada:', e && e.code || e); }
}

/* ───────── leitura dos totais ───────── */
async function getResumo(item) {
  try {
    const d = db(); if (!d) return { views: 0, qtd: 0, media: 0 };
    const snap = await getDoc(doc(d, 'conteudo', chave(item)));
    const x = snap.exists() ? snap.data() : {};
    const qtd = x.qtdNotas || 0;
    return { views: x.views || 0, qtd: qtd, media: qtd ? (x.somaNotas || 0) / qtd : 0 };
  } catch (e) { return { views: 0, qtd: 0, media: 0 }; }
}

async function getMinhaNota(item) {
  try {
    const u = usuario(), d = db(); if (!u || !d) return 0;
    const snap = await getDoc(doc(d, 'avaliacoes', u.uid + '_' + chave(item)));
    return snap.exists() ? (snap.data().nota || 0) : 0;
  } catch (e) { return 0; }
}

/* ───────── avaliar ───────── */
async function avaliar(item, nota) {
  nota = Math.round(+nota);
  if (!(nota >= 1 && nota <= 5)) throw new Error('nota inválida');
  const u = usuario(), d = db();
  if (!u) { const e = new Error('login'); e.code = 'pflix/sem-login'; throw e; }
  if (!d) throw new Error('Firestore indisponível');

  const k = chave(item), tipo = item.isSerie ? 'serie' : 'filme';
  const notaRef = doc(d, 'avaliacoes', u.uid + '_' + k);
  const antes = await getDoc(notaRef);
  const anterior = antes.exists() ? (antes.data().nota || 0) : 0;
  if (anterior === nota) return { mudou: false };

  const b = writeBatch(d);
  b.set(notaRef, { uid: u.uid, chave: k, nome: item.nome, tipo: tipo, nota: nota, ts: serverTimestamp() });
  b.set(doc(d, 'conteudo', k), {
    nome: item.nome, tipo: tipo,
    somaNotas: increment(nota - anterior),
    qtdNotas: increment(anterior ? 0 : 1)
  }, { merge: true });
  b.set(doc(d, 'trending', semanaId(new Date()), 'itens', k), {
    nome: item.nome, tipo: tipo,
    score: increment(BONUS[nota] - BONUS[anterior]),
    notas: increment(anterior ? 0 : 1)
  }, { merge: true });
  await b.commit();
  try { localStorage.removeItem('pflix_trending_v1'); } catch (e) {}
  return { mudou: true, anterior: anterior };
}

/* ───────── "Em alta" ───────── */
async function getTrending(opts) {
  const limite = (opts && opts.limite) || 15;
  try {
    const c = JSON.parse(localStorage.getItem('pflix_trending_v1') || 'null');
    if (c && Date.now() - c.ts < TRENDING_CACHE_MS && Array.isArray(c.items)) return c.items.slice(0, limite);
  } catch (e) {}

  const d = db(); if (!d) return [];
  const agora = new Date();
  const passada = new Date(agora.getTime() - 7 * 86400000);
  const ler = async (sem) => {
    const q = query(collection(d, 'trending', sem, 'itens'), orderBy('score', 'desc'), limit(limite + 8));
    const s = await getDocs(q);
    const arr = []; s.forEach(x => arr.push({ chave: x.id, ...x.data() }));
    return arr;
  };
  try {
    const [atual, ant] = await Promise.all([ler(semanaId(agora)), ler(semanaId(passada))]);
    const mapa = new Map();
    atual.forEach(x => mapa.set(x.chave, { chave: x.chave, nome: x.nome, tipo: x.tipo, views: x.views || 0, pontos: x.score || 0 }));
    ant.forEach(x => {
      const p = (x.score || 0) * PESO_SEMANA_PASSADA;
      if (mapa.has(x.chave)) mapa.get(x.chave).pontos += p;
      else mapa.set(x.chave, { chave: x.chave, nome: x.nome, tipo: x.tipo, views: 0, pontos: p });
    });
    const items = Array.from(mapa.values()).filter(x => x.nome && x.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos).slice(0, limite + 8);
    try { localStorage.setItem('pflix_trending_v1', JSON.stringify({ ts: Date.now(), items: items })); } catch (e) {}
    return items.slice(0, limite);
  } catch (e) {
    console.warn('[Stats] não foi possível ler o Em alta:', e && e.code || e);
    return [];
  }
}

/* ───────── widget de estrelas ───────── */
function injetarEstilo() {
  if (document.getElementById('pfxRateStyle')) return;
  const s = document.createElement('style'); s.id = 'pfxRateStyle';
  s.textContent = `
.pfx-rate{margin:1.1rem 0;padding:1rem 1.1rem;background:var(--surface-2,#16161e);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:var(--r-lg,16px)}
.pfx-rate-top{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.pfx-rate-media{display:flex;flex-direction:column;align-items:center;min-width:64px;line-height:1.1}
.pfx-rate-media b{font-family:var(--font-display,'Syne',system-ui,sans-serif);font-size:1.9rem;color:var(--text-1,#f0f0f6)}
.pfx-rate-media span{font-size:.7rem;color:var(--text-3,#5a5a72);margin-top:.2rem;text-align:center}
.pfx-rate-main{flex:1;min-width:220px}
.pfx-rate-titulo{font-size:.82rem;color:var(--text-3,#5a5a72);margin:0 0 .35rem}
.pfx-rate-stars{display:flex;gap:.15rem}
.pfx-rate-star{background:none;border:0;padding:.1rem .12rem;font-size:1.9rem;line-height:1;color:var(--border-light,rgba(255,255,255,.18));transition:transform .12s ease,color .12s ease}
.pfx-rate-star.on{color:#ffb020}
.pfx-rate-star:hover{transform:scale(1.14)}
.pfx-rate-star:focus-visible{outline:2px solid var(--red,#ff2d43);outline-offset:2px;border-radius:6px}
.pfx-rate-rotulo{min-height:1.3em;margin:.35rem 0 0;font-weight:600;font-size:.92rem;color:var(--text-1,#f0f0f6)}
.pfx-rate-info{margin:.55rem 0 0;font-size:.78rem;color:var(--text-3,#5a5a72)}
.pfx-rate-info a{color:var(--red,#ff2d43)}
@media (prefers-reduced-motion:reduce){.pfx-rate-star{transition:none}.pfx-rate-star:hover{transform:none}}`;
  document.head.appendChild(s);
}

function fmtNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + ' mil' : String(n);
}

async function montarWidget(alvo, item) {
  const box = typeof alvo === 'string' ? document.getElementById(alvo) : alvo;
  if (!box || !item) return;
  injetarEstilo();
  box.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'pfx-rate';
  wrap.innerHTML =
    '<div class="pfx-rate-top">' +
      '<div class="pfx-rate-media" aria-live="polite"><b data-r="media">–</b><span data-r="qtd">sem notas ainda</span></div>' +
      '<div class="pfx-rate-main">' +
        '<p class="pfx-rate-titulo">Como foi a pipoca?</p>' +
        '<div class="pfx-rate-stars" role="radiogroup" aria-label="Sua avaliação de 1 a 5"></div>' +
        '<p class="pfx-rate-rotulo" data-r="rotulo" aria-live="polite"></p>' +
      '</div>' +
    '</div>' +
    '<p class="pfx-rate-info" data-r="info"></p>';
  box.appendChild(wrap);

  const $ = (n) => wrap.querySelector('[data-r="' + n + '"]');
  const starsEl = wrap.querySelector('.pfx-rate-stars');
  let minha = 0, resumo = { views: 0, qtd: 0, media: 0 };

  const estrelas = [];
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pfx-rate-star'; b.textContent = '★';
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', i + ' — ' + ROTULOS[i]);
    b.addEventListener('mouseenter', () => pintar(i, ROTULOS[i]));
    b.addEventListener('focus', () => pintar(i, ROTULOS[i]));
    b.addEventListener('click', () => escolher(i));
    estrelas.push(b); starsEl.appendChild(b);
  }
  starsEl.addEventListener('mouseleave', () => pintar(minha, minha ? 'Sua nota: ' + ROTULOS[minha] : ''));
  starsEl.addEventListener('focusout', () => pintar(minha, minha ? 'Sua nota: ' + ROTULOS[minha] : ''));

  function pintar(n, rotulo) {
    estrelas.forEach((b, idx) => { b.classList.toggle('on', idx < n); b.setAttribute('aria-checked', String(idx + 1 === minha)); });
    $('rotulo').textContent = rotulo || '';
  }
  function desenharResumo() {
    $('media').textContent = resumo.qtd ? resumo.media.toFixed(1).replace('.', ',') : '–';
    $('qtd').textContent = resumo.qtd ? resumo.qtd + (resumo.qtd === 1 ? ' avaliação' : ' avaliações') : 'sem notas ainda';
    const v = resumo.views ? '👁 ' + fmtNum(resumo.views) + ' visualizações' : '';
    const u = usuario();
    $('info').innerHTML = [v, u ? '' : '<a href="login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + '">Entre na sua conta</a> pra dar sua nota']
      .filter(Boolean).join(' · ');
  }

  async function escolher(n) {
    if (!usuario()) {
      if (window.showToast) window.showToast('🔐 Entre na sua conta pra avaliar');
      setTimeout(() => { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); }, 900);
      return;
    }
    const antes = minha;
    minha = n; pintar(n, 'Sua nota: ' + ROTULOS[n]);
    try {
      const r = await avaliar(item, n);
      if (r.mudou) {
        // atualiza o resumo na tela sem reler o Firestore
        if (antes) resumo.media = (resumo.media * resumo.qtd - antes + n) / resumo.qtd;
        else { resumo.media = (resumo.media * resumo.qtd + n) / (resumo.qtd + 1); resumo.qtd += 1; }
        desenharResumo();
        if (window.showToast) window.showToast('🍿 ' + ROTULOS[n] + '! Valeu pela nota');
      }
    } catch (e) {
      minha = antes; pintar(antes, antes ? 'Sua nota: ' + ROTULOS[antes] : '');
      console.warn('[Stats] falha ao avaliar:', e && e.code || e);
      if (window.showToast) window.showToast('⚠️ Não deu pra salvar sua nota agora');
    }
  }

  desenharResumo();
  // dados reais (a nota da pessoa só aparece quando o login estiver pronto)
  getResumo(item).then(r => { resumo = r; desenharResumo(); });
  const carregarMinha = async () => { minha = await getMinhaNota(item); pintar(minha, minha ? 'Sua nota: ' + ROTULOS[minha] : ''); desenharResumo(); };
  if (window.PipocaAuth && window.PipocaAuth.onAuthChanged) window.PipocaAuth.onAuthChanged(u => { if (u) carregarMinha(); else { minha = 0; pintar(0, ''); desenharResumo(); } });
}

window.PipocaStats = { ROTULOS, chave, semanaId, registrarView, getResumo, getMinhaNota, avaliar, getTrending, montarWidget };
