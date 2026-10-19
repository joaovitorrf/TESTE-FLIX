/**
 * PIPOCAFLIX — sync.js
 * Sincroniza entre aparelhos os dados que antes só existiam no localStorage:
 *     ❤️  favoritos          (favoritos.js)
 *     ▶️  continuar assistindo (progress.js)
 *     ✅  assistidos          (watched.js)
 *
 * COMO FUNCIONA (a explicação longa está no sync-core.js)
 *   • A página sempre lê/escreve no localStorage — instantâneo e funciona offline.
 *   • Logado, este módulo espelha isso num único documento do Firestore:
 *         users/{uid}/sync/estado  →  { favoritos: {…}, continuar: {…}, assistidos: {…} }
 *     (um documento = 1 leitura por página, em vez de 3).
 *   • Cada item tem um "ts" (hora da última alteração) e remover vira uma "lápide". Na hora de
 *     juntar o que veio da nuvem com o que existe aqui, vale o ts mais recente de cada item —
 *     ninguém "ressuscita" o que outro aparelho apagou.
 *   • Só o que mudou é enviado (comparando com o ts que a nuvem já conhece), e as gravações são
 *     agrupadas: favoritos/assistidos ~1 s depois da última mudança, continuar assistindo a cada
 *     ~15 s no máximo (ou ~1 s quando a pessoa abre um título novo).
 *   • Mudança feita em outro aparelho chega em tempo real (onSnapshot) e a página é avisada com
 *     o evento  window "pflix:sync"  { detail: { tipo, origem } }  pra se redesenhar.
 *   • Conta diferente entrando no mesmo navegador: os dados locais da conta anterior são
 *     apagados antes de qualquer coisa (marcador "pflix_sync_uid"). Na primeira vez que alguém
 *     loga depois desta atualização, o que já estava salvo no aparelho SOBE pra conta — é a
 *     migração dos dados antigos.
 *
 * SE O FIRESTORE RECUSAR (regras sem permissão pra users/{uid}/sync) o site continua normal,
 * só sem sincronizar, e o console avisa. Veja firestore-rules-sync.txt.
 *
 * Incluir com:  <script type="module" src="assets/js/sync.js"></script>
 * DEPOIS do bloco que cria window.PipocaAuth, e com sync-core.js + os módulos de dados
 * (favoritos.js, progress.js, watched.js) carregados antes (scripts normais).
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, setDoc, updateDoc, deleteField, FieldPath, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const Core = window.PflixSyncCore;
const LAPIDE_MAX_NUVEM_MS = 60 * 24 * 3600 * 1000;   // lápide com mais de 60 dias sai da nuvem
const LOTE = 100;                                    // itens por gravação

// Cada tipo: quanto esperar antes de gravar e onde achar o adaptador (o __sync de cada módulo).
const TIPOS = {
  favoritos:  { espera: 900,   adaptador: () => window.PipocaFavoritos && window.PipocaFavoritos.__sync },
  assistidos: { espera: 900,   adaptador: () => window.PipocaWatched   && window.PipocaWatched.__sync },
  continuar:  { espera: 15000, adaptador: () => window.PipocaProgress  && window.PipocaProgress.__sync }
};

let uid = null;
let ref = null;
let cancelar = null;     // desliga o onSnapshot
let estado = {};         // por tipo: { servidor, pronto, timer, timerEm, emVoo, sujo, desligado, falhas, limpou }

const pub = {
  pronto: false,         // true depois da 1ª resposta confirmada da nuvem (nesta página)
  uid: null,
  erro: null,            // 'permission-denied' etc., se a sincronização foi desligada
  aoFicarPronto(cb) {
    if (pub.pronto) { try { cb(); } catch (e) { console.warn(e); } return; }
    window.addEventListener('pflix:sync-pronto', () => { try { cb(); } catch (e) { console.warn(e); } }, { once: true });
  },
  sincronizarAgora() { Object.keys(estado).forEach(t => empurrar(t)); }
};

function getDB() {
  const app = getApps()[0];
  return app ? getFirestore(app) : null;
}
function adaptador(tipo) {
  try { return TIPOS[tipo].adaptador() || null; } catch (e) { return null; }
}
function avisarPaginas(tipo, origem) {
  try { window.dispatchEvent(new CustomEvent('pflix:sync', { detail: { tipo, origem } })); } catch (e) {}
}
// Firestore não aceita "undefined" — passa tudo por JSON pra garantir.
const limpo = (v) => JSON.parse(JSON.stringify(v));

/* ─── login / logout ─────────────────────────────────────────────────────── */

function aoMudarUsuario(user) {
  if (user && uid === user.uid && cancelar) return;     // mesma pessoa, nada a refazer

  if (cancelar) { try { cancelar(); } catch (e) {} cancelar = null; }
  Object.keys(estado).forEach(t => clearTimeout(estado[t].timer));
  estado = {};
  ref = null; uid = null;
  pub.pronto = false; pub.uid = null; pub.erro = null;
  if (!user) return;      // deslogou: os dados continuam no aparelho (ver nota no sync-core.js)

  const d = getDB();
  if (!d) { console.warn('[Sync] Firebase não inicializado nesta página — sincronização desligada.'); return; }
  uid = user.uid; pub.uid = uid;

  const dono = Core.donoLocal();
  if (dono && dono !== uid) {
    // Outra conta usava este navegador: o que está salvo aqui é dela, não desta pessoa.
    Core.limparDadosLocais();
    avisarPaginas('*', 'troca-de-conta');
  }
  Core.definirDono(uid);

  ref = doc(d, 'users', uid, 'sync', 'estado');
  try {
    cancelar = onSnapshot(ref, aoSnapshot, aoErro);
  } catch (e) {
    console.warn('[Sync] não foi possível ouvir a nuvem:', e);
  }
}

function aoErro(e) {
  const code = e && e.code;
  pub.erro = code || 'erro';
  if (code === 'permission-denied') {
    console.warn('[Sync] O Firestore recusou a leitura (permission-denied). Falta liberar users/{uid}/sync/{doc} nas regras — veja firestore-rules-sync.txt. Enquanto isso, favoritos/continuar/assistidos ficam só neste aparelho.');
    Object.keys(estado).forEach(t => { estado[t].desligado = true; });
  } else {
    console.warn('[Sync] erro ouvindo a nuvem:', code || e);   // o SDK tenta reconectar sozinho
  }
}

/* ─── nuvem → aparelho ───────────────────────────────────────────────────── */

function aoSnapshot(snap) {
  // Aparelho offline e sem nada em cache: não dá pra concluir que "a nuvem está vazia".
  if (snap.metadata.fromCache && !snap.exists()) return;
  const dados = snap.exists() ? (snap.data() || {}) : {};
  Object.keys(TIPOS).forEach(tipo => reconciliar(tipo, dados[tipo]));
  if (!pub.pronto) {
    pub.pronto = true;
    try { window.dispatchEvent(new CustomEvent('pflix:sync-pronto')); } catch (e) {}
  }
}

function reconciliar(tipo, remoto) {
  const ad = adaptador(tipo);
  if (!ad) return;      // esta página não carrega esse módulo
  const st = estado[tipo] || (estado[tipo] = {
    servidor: {}, pronto: false, timer: null, timerEm: 0, emVoo: false, sujo: false,
    desligado: false, falhas: 0, limpou: false
  });
  remoto = (remoto && typeof remoto === 'object' && !Array.isArray(remoto)) ? remoto : {};

  // ts que a nuvem já conhece de cada item: só empurramos o que for mais novo que isso.
  st.servidor = {};
  Object.keys(remoto).forEach(k => { const r = remoto[k]; st.servidor[k] = (r && +r.ts) || 0; });

  let mudou = false;
  try { mudou = !!ad.aplicar(remoto); } catch (e) { console.warn('[Sync] erro ao aplicar', tipo, e); }
  st.pronto = true;
  if (mudou) avisarPaginas(tipo, 'nuvem');

  limparNuvem(tipo, st, ad, remoto);
  agendar(tipo, 50);    // manda pra nuvem o que existe só aqui (ou é mais novo)
}

// Lápides antigas e registros expirados saem da nuvem (uma vez por visita) pro documento não crescer.
function limparNuvem(tipo, st, ad, remoto) {
  if (st.limpou || st.desligado || !ref) return;
  const agora = Date.now();
  const velhas = Object.keys(remoto).filter(k => {
    const r = remoto[k];
    if (!r || typeof r !== 'object') return false;
    if (r.removido) return (agora - (+r.ts || 0)) > LAPIDE_MAX_NUVEM_MS;
    return typeof ad.expirado === 'function' && ad.expirado(r);
  }).slice(0, 200);
  if (!velhas.length) return;
  st.limpou = true;
  const args = [];
  velhas.forEach(k => { args.push(new FieldPath(tipo, k), deleteField()); });
  updateDoc(ref, ...args).catch(e => console.warn('[Sync] limpeza da nuvem falhou:', e && e.code || e));
}

/* ─── aparelho → nuvem ───────────────────────────────────────────────────── */

// Marca um envio para daqui a "espera" ms. Vários pedidos viram um só; vale o mais cedo.
function agendar(tipo, espera) {
  const st = estado[tipo];
  if (!st || st.desligado) return;
  const quando = Date.now() + espera;
  if (st.timer) {
    if (quando >= st.timerEm) return;
    clearTimeout(st.timer);
  }
  st.timerEm = quando;
  st.timer = setTimeout(() => { st.timer = null; st.timerEm = 0; empurrar(tipo); }, espera);
}

async function gravar(tipo, diff) {
  const chaves = Object.keys(diff);
  for (let i = 0; i < chaves.length; i += LOTE) {
    const lote = chaves.slice(i, i + LOTE);
    const args = [];
    lote.forEach(k => { args.push(new FieldPath(tipo, k), diff[k]); });
    args.push('atualizadoEm', serverTimestamp());
    try {
      await updateDoc(ref, ...args);
    } catch (e) {
      if (!e || e.code !== 'not-found') throw e;
      // Primeira gravação desta conta: o documento ainda não existe.
      const mapa = {};
      lote.forEach(k => { mapa[k] = diff[k]; });
      await setDoc(ref, { [tipo]: mapa, atualizadoEm: serverTimestamp() }, { merge: true });
    }
  }
}

async function empurrar(tipo) {
  const st = estado[tipo];
  const ad = adaptador(tipo);
  if (!st || !ad || !st.pronto || st.desligado || !uid || !ref) return;
  if (st.emVoo) { st.sujo = true; return; }

  let local;
  try { local = ad.exportar(); } catch (e) { console.warn('[Sync] erro ao exportar', tipo, e); return; }
  const diff = {};
  let n = 0;
  Object.keys(local).forEach(k => {
    const item = local[k];
    if (item && (+item.ts || 0) > (st.servidor[k] || 0)) { diff[k] = limpo(item); n++; }
  });
  if (!n) return;

  st.emVoo = true;
  try {
    await gravar(tipo, diff);
    Object.keys(diff).forEach(k => { st.servidor[k] = Math.max(st.servidor[k] || 0, +diff[k].ts || 0); });
    st.falhas = 0;
  } catch (e) {
    const code = e && e.code;
    if (code === 'permission-denied') {
      st.desligado = true; pub.erro = code;
      console.warn('[Sync] O Firestore recusou a gravação (permission-denied). Falta liberar users/{uid}/sync/{doc} nas regras — veja firestore-rules-sync.txt. Enquanto isso, os dados ficam só neste aparelho.');
    } else {
      st.falhas++;
      console.warn('[Sync] falha ao gravar', tipo, code || e);
      if (st.falhas <= 4 && estado[tipo] === st) agendar(tipo, Math.min(60000, 2000 * Math.pow(2, st.falhas)));
    }
  } finally {
    st.emVoo = false;
    if (st.sujo) { st.sujo = false; if (estado[tipo] === st) agendar(tipo, 400); }
  }
}

// Mudança feita neste aparelho (favoritou, abriu um título, marcou como assistido…).
window.addEventListener('pflix:local-change', (ev) => {
  const d = (ev && ev.detail) || {};
  if (!estado[d.tipo]) return;       // deslogado, ou ainda sem 1ª resposta: o envio sai na reconciliação
  agendar(d.tipo, d.urgente ? 600 : TIPOS[d.tipo].espera);
});

// Vai fechar/esconder a aba? Manda já o que estiver esperando.
function empurrarTudoJa() {
  Object.keys(estado).forEach(t => {
    const st = estado[t];
    if (st.timer) { clearTimeout(st.timer); st.timer = null; st.timerEm = 0; empurrar(t); }
  });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') empurrarTudoJa(); });
window.addEventListener('pagehide', empurrarTudoJa);

// Outra aba do mesmo navegador mexeu no localStorage: avisa a página pra se redesenhar.
window.addEventListener('storage', (ev) => {
  const k = ev && ev.key;
  if (!k) return;
  let tipo = null;
  if (k === 'pflix_favoritos') tipo = 'favoritos';
  else if (k === 'pflix_watched_list') tipo = 'assistidos';
  else if (k.indexOf('pflix_progress_') === 0) tipo = 'continuar';
  if (tipo) avisarPaginas(tipo, 'aba');
});

/* ─── liga no login ──────────────────────────────────────────────────────── */

function ligarAuth(tentativas) {
  const a = window.PipocaAuth;
  if (a && typeof a.onAuthChanged === 'function') { a.onAuthChanged(aoMudarUsuario); return; }
  if (tentativas < 100) setTimeout(() => ligarAuth(tentativas + 1), 100);   // PipocaAuth aparece já já
}

if (!Core) {
  console.warn('[Sync] sync-core.js não foi carregado nesta página — sincronização desligada.');
} else {
  window.PipocaSync = pub;
  ligarAuth(0);
}
