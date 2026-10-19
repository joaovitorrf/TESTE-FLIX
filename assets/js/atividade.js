/**
 * PIPOCAFLIX — atividade.js  (sequência de dias, horas assistidas e "Seu ano no PipocaFlix")
 *
 * O QUE MEDE
 *   Os players do site são embeds de terceiros (iframe) — não dá pra saber em que minuto o filme
 *   está. Então a medida é: TEMPO COM O PLAYER ABERTO E A ABA VISÍVEL (estimativa honesta; não
 *   conta aba em segundo plano, computador dormindo, nem passa de 4 h numa mesma sessão).
 *   Esse tempo alimenta: sequência de dias (streak), total de horas, título mais assistido,
 *   gênero favorito, horário preferido… tudo mostrado no perfil.html.
 *
 * ONDE FICA
 *   users/{uid}/atividade/{ano}   (um documento por ano — é isso que o resumo anual lê)
 *     {
 *       dias:    { "2026-10-11": 5400, … }          // segundos assistidos em cada dia
 *       hr:      { "21": 3600, … }                  // segundos por hora do dia (0–23)
 *       titulos: { "<chave>": { nome, capa, tipo:'filme'|'serie', cat, seg, abertos, ult }, … }
 *       total:   { seg, sessoes }
 *     }
 *   Séries contam como UM título (a chave é a da série, não a do episódio).
 *   A escrita usa increment() com merge: vários aparelhos somam sem sobrescrever um ao outro.
 *   Enquanto não sobe, o tempo fica guardado no aparelho (pflix_atv_pend_<uid>) e sobe a cada
 *   ~5 min, ao esconder a aba e ao sair da página.
 *
 * USO
 *   PipocaAtividade.iniciarSessao({ nome, capa, isSerie, categoria })   ← quando o player abre
 *   PipocaAtividade.getAno(2026)            → Promise<{ dias, hr, titulos, total }>
 *   PipocaAtividade.getDiasAtivos(extras)   → Promise<Set<'AAAA-MM-DD'>>
 *   PipocaAtividade.calcStreak(set)         → { atual, melhor, hoje }
 *
 * Incluir com:  <script type="module" src="assets/js/atividade.js"></script>
 * (depois do bloco que cria window.PipocaAuth)
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const TICK_MS = 15000;                 // de quanto em quanto tempo o relógio da sessão anda
const FLUSH_MS = 5 * 60 * 1000;        // sobe pra nuvem a cada 5 min
const MAX_SESSAO_S = 4 * 3600;         // uma sessão não passa de 4 h (aba esquecida aberta)
const MAX_DIA_S = 14 * 3600;           // nem um dia inteiro passa de 14 h
const LIMIAR_DIA_S = 5 * 60;           // o dia só conta pra sequência com 5+ min assistidos
const PEND_PREFIX = 'pflix_atv_pend_';

let _db = null;
function db() {
  if (_db) return _db;
  const app = getApps()[0];
  if (!app) return null;
  _db = getFirestore(app);
  return _db;
}
function usuario() {
  return (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser()) || null;
}

/* ───────── datas (sempre no fuso do aparelho) ───────── */
const dois = (n) => (n < 10 ? '0' : '') + n;
function fmtDia(d) { return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()); }
// "2026-10-11" → número de dias desde 1970 (aritmética de calendário sem sustos de horário de verão)
function diaNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN;
}

/* ───────── chave do título ───────── */
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome';
}
const chaveTitulo = (item) => (item && item.isSerie ? 's_' : 'f_') + slug(item && item.nome);

/* ───────── buffer local (o que ainda não subiu) ───────── */
const bufVazio = () => ({ dias: {}, hr: {}, titulos: {}, total: { seg: 0, sessoes: 0 } });

function lerPend(uid) {
  try {
    const o = JSON.parse(localStorage.getItem(PEND_PREFIX + uid) || '{}');
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}
function gravarPend(uid, o) {
  try {
    if (Object.keys(o).length) localStorage.setItem(PEND_PREFIX + uid, JSON.stringify(o));
    else localStorage.removeItem(PEND_PREFIX + uid);
  } catch (e) {}
}
function somaNoBuf(buf, ev) {
  // ev = { dia, hora, key, meta:{nome,capa,tipo,cat}, seg, abertos, ult }
  buf.dias[ev.dia] = (buf.dias[ev.dia] || 0) + ev.seg;
  buf.hr[ev.hora] = (buf.hr[ev.hora] || 0) + ev.seg;
  const t = buf.titulos[ev.key] || (buf.titulos[ev.key] = Object.assign({ seg: 0, abertos: 0, ult: 0 }, ev.meta));
  t.seg += ev.seg; t.abertos += ev.abertos || 0; t.ult = Math.max(t.ult || 0, ev.ult || 0);
  buf.total.seg += ev.seg; buf.total.sessoes += ev.abertos || 0;
}
function juntarBufs(destino, origem) {   // origem → destino (usado pra devolver o que falhou ao subir)
  Object.keys(origem.dias || {}).forEach(k => { destino.dias[k] = (destino.dias[k] || 0) + origem.dias[k]; });
  Object.keys(origem.hr || {}).forEach(k => { destino.hr[k] = (destino.hr[k] || 0) + origem.hr[k]; });
  Object.keys(origem.titulos || {}).forEach(k => {
    const o = origem.titulos[k];
    const t = destino.titulos[k] || (destino.titulos[k] = { nome: o.nome, capa: o.capa, tipo: o.tipo, cat: o.cat, seg: 0, abertos: 0, ult: 0 });
    t.seg += o.seg || 0; t.abertos += o.abertos || 0; t.ult = Math.max(t.ult || 0, o.ult || 0);
  });
  destino.total.seg += (origem.total && origem.total.seg) || 0;
  destino.total.sessoes += (origem.total && origem.total.sessoes) || 0;
}

/* ───────── sessão: o relógio que conta o tempo assistido ───────── */
let sessao = null;       // { key, meta, ultimo, totalSeg }
let ticker = null;
let flusher = null;
let negado = false;      // regras do Firestore recusaram: para de tentar
const abertosRecentes = {};   // key → quando contei a última "abertura" (evita contar clique duplo)

function iniciarSessao(item) {
  try {
    const u = usuario();
    if (!u || !item || !item.nome) return;
    const key = chaveTitulo(item);
    const agora = Date.now();
    const meta = {
      nome: String(item.nome).slice(0, 120),
      capa: String(item.capa || '').slice(0, 500),
      tipo: item.isSerie ? 'serie' : 'filme',
      cat: String(item.categoria || '').slice(0, 80)
    };
    const mesmaSessao = sessao && sessao.key === key;
    sessao = mesmaSessao ? Object.assign(sessao, { meta }) : { key, meta, ultimo: agora, totalSeg: 0 };

    // "abertura" = uma vez por título a cada 30 s (clique duplo não vale duas vezes)
    if (!abertosRecentes[key] || agora - abertosRecentes[key] > 30000) {
      abertosRecentes[key] = agora;
      const pend = lerPend(u.uid);
      const ano = String(new Date().getFullYear());
      const buf = pend[ano] || (pend[ano] = bufVazio());
      const d = new Date();
      somaNoBuf(buf, { dia: fmtDia(d), hora: String(d.getHours()), key, meta, seg: 0, abertos: 1, ult: agora });
      gravarPend(u.uid, pend);
    }
    if (!ticker) ticker = setInterval(tick, TICK_MS);
    if (!flusher) flusher = setInterval(() => flush(), FLUSH_MS);
  } catch (e) { console.warn('[Atividade]', e); }
}

function tick() {
  if (!sessao) return;
  const agora = Date.now();
  const delta = agora - sessao.ultimo;
  sessao.ultimo = agora;
  if (document.visibilityState !== 'visible') return;       // aba em segundo plano não conta
  if (delta > 2 * TICK_MS + 5000) return;                   // computador dormiu / timer congelado
  const u = usuario();
  if (!u) return;
  if (sessao.totalSeg >= MAX_SESSAO_S) return;              // aba esquecida aberta
  const seg = Math.round(delta / 1000);
  if (seg <= 0) return;

  const d = new Date(agora);
  const dia = fmtDia(d);
  const pend = lerPend(u.uid);
  const ano = String(d.getFullYear());
  const buf = pend[ano] || (pend[ano] = bufVazio());
  if ((buf.dias[dia] || 0) >= MAX_DIA_S) return;
  sessao.totalSeg += seg;
  somaNoBuf(buf, { dia, hora: String(d.getHours()), key: sessao.key, meta: sessao.meta, seg, abertos: 0, ult: agora });
  gravarPend(u.uid, pend);
}

/* ───────── subir pra nuvem ───────── */
let subindo = false;
async function flush() {
  const u = usuario();
  const d = db();
  if (!u || !d || negado || subindo) return;
  const pend = lerPend(u.uid);
  const anos = Object.keys(pend).filter(a => {
    const b = pend[a];
    return b && b.total && (b.total.seg > 0 || b.total.sessoes > 0);
  });
  if (!anos.length) return;
  gravarPend(u.uid, {});                  // "tira da fila" antes de enviar; se falhar, devolve
  subindo = true;
  try {
    for (const ano of anos) {
      const b = pend[ano];
      const out = { dias: {}, hr: {}, titulos: {}, total: { seg: increment(b.total.seg), sessoes: increment(b.total.sessoes) }, atualizadoEm: serverTimestamp() };
      Object.keys(b.dias).forEach(k => { out.dias[k] = increment(b.dias[k]); });
      Object.keys(b.hr).forEach(k => { out.hr[k] = increment(b.hr[k]); });
      Object.keys(b.titulos).forEach(k => {
        const t = b.titulos[k];
        out.titulos[k] = { nome: t.nome, capa: t.capa, tipo: t.tipo, cat: t.cat, seg: increment(t.seg), abertos: increment(t.abertos), ult: t.ult };
      });
      try {
        await setDoc(doc(d, 'users', u.uid, 'atividade', ano), out, { merge: true });
        cacheAno.delete(u.uid + ':' + ano);
      } catch (e) {
        // devolve pra fila o que não subiu (esse ano e os seguintes)
        const resto = lerPend(u.uid);
        anos.slice(anos.indexOf(ano)).forEach(a => {
          const dest = resto[a] || (resto[a] = bufVazio());
          juntarBufs(dest, pend[a]);
        });
        gravarPend(u.uid, resto);
        if (e && e.code === 'permission-denied') {
          negado = true;
          console.warn('[Atividade] O Firestore recusou a gravação (permission-denied). Falta liberar users/{uid}/atividade/{ano} nas regras — veja firestore-rules-sync.txt.');
        } else {
          console.warn('[Atividade] não subiu agora, tento de novo depois:', e && e.code || e);
        }
        break;
      }
    }
  } finally { subindo = false; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { tick(); flush(); }
  else if (sessao) sessao.ultimo = Date.now();            // voltou: não conta o tempo em que esteve fora
});
window.addEventListener('pagehide', () => { tick(); flush(); });

/* ───────── leitura (perfil.html) ───────── */
const cacheAno = new Map();   // "uid:ano" → { quando, dados }

function copiaProfunda(o) { return JSON.parse(JSON.stringify(o)); }

function somarPendente(dados, uid, ano) {
  const out = Object.assign(bufVazio(), copiaProfunda(dados || {}));
  out.dias = out.dias || {}; out.hr = out.hr || {}; out.titulos = out.titulos || {};
  out.total = Object.assign({ seg: 0, sessoes: 0 }, out.total || {});
  const b = lerPend(uid)[String(ano)];
  if (b) juntarBufs(out, b);
  return out;
}

async function getAno(ano) {
  ano = String(ano || new Date().getFullYear());
  const u = usuario();
  if (!u) return bufVazio();
  const chave = u.uid + ':' + ano;
  const c = cacheAno.get(chave);
  let dados = c && (Date.now() - c.quando < 60000) ? c.dados : null;
  if (!dados) {
    dados = {};
    const d = db();
    if (d) {
      try {
        const snap = await getDoc(doc(d, 'users', u.uid, 'atividade', ano));
        if (snap.exists()) dados = snap.data() || {};
        cacheAno.set(chave, { quando: Date.now(), dados });
      } catch (e) { console.warn('[Atividade] não consegui ler o ano', ano, e && e.code || e); }
    }
  }
  return somarPendente(dados, u.uid, ano);
}

// Dias em que a pessoa "apareceu": 5+ min assistidos OU atividade registrada por outro caminho
// (marcou como assistido, avaliou…) que o chamador passa em "extras" (timestamps em ms).
async function getDiasAtivos(extras) {
  const set = new Set();
  const ano = new Date().getFullYear();
  const lerDias = (dados) => Object.keys((dados && dados.dias) || {}).forEach(k => { if ((dados.dias[k] || 0) >= LIMIAR_DIA_S) set.add(k); });
  const atual = await getAno(ano);
  lerDias(atual);
  (extras || []).forEach(ts => { if (ts > 0) set.add(fmtDia(new Date(ts))); });
  // sequência que atravessa o Réveillon: precisa dos últimos dias do ano passado
  const jan1 = fmtDia(new Date(ano, 0, 1));
  if (set.has(jan1) || set.has(fmtDia(new Date(ano, 0, 2)))) lerDias(await getAno(ano - 1));
  return set;
}

function calcStreak(set) {
  const hojeNum = diaNum(fmtDia(new Date()));
  const nums = new Set();
  set.forEach(s => { const n = diaNum(s); if (!isNaN(n)) nums.add(n); });
  const hoje = nums.has(hojeNum);
  // a sequência continua "viva" se a pessoa já assistiu hoje OU assistiu ontem (ainda dá tempo hoje)
  let cursor = hoje ? hojeNum : hojeNum - 1;
  let atual = 0;
  while (nums.has(cursor)) { atual++; cursor--; }
  let melhor = 0;
  const ord = Array.from(nums).sort((a, b) => a - b);
  let run = 0, prev = null;
  ord.forEach(n => { run = (prev !== null && n === prev + 1) ? run + 1 : 1; if (run > melhor) melhor = run; prev = n; });
  return { atual, melhor, hoje, viva: atual > 0 };
}

window.PipocaAtividade = {
  iniciarSessao, flush, getAno, getDiasAtivos, calcStreak, fmtDia, diaNum, chaveTitulo,
  LIMIAR_DIA_S
};
