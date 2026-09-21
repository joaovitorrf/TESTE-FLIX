/**
 * PIPOCAFLIX — pedidos.js  (pedidos de filmes/séries)
 *
 * Firestore:  pedidos/{uid}_{tipo}_{tmdbId}
 *   uid, email, autor, autorFoto, tipo ('filme'|'serie'), tmdbId, titulo, tituloOriginal,
 *   ano, capa, mensagem (opcional), status ('pendente'|'atendido'|'recusado'), ts
 *   e, quando o admin responde: resposta, atendidoEm, atendidoPor
 *
 *   • O ID é fixo por (pessoa + título): não dá pra pedir o mesmo filme duas vezes.
 *   • Só o admin muda o status (regras em firestore.rules). O usuário vê o status no perfil.
 *
 * Usado por:  pedidos.html (fazer pedido + painel do admin)  e  perfil.html (aba "Meus pedidos")
 * Incluir com:  <script type="module" src="assets/js/pedidos.js"></script>
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const ADMIN_EMAILS = ['canalpedroid@gmail.com'];   // mesmo e-mail do suporte.html
const MAX_PENDENTES = 5;                           // limite por pessoa (evita spam)
const MSG_MAX = 500;

let _db = null;
function db() { if (_db) return _db; const a = getApps()[0]; if (!a) return null; return (_db = getFirestore(a)); }
function usuario() { return (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser()) || null; }
function ehAdmin(u) { u = u || usuario(); return !!(u && u.email && ADMIN_EMAILS.indexOf(u.email.toLowerCase()) !== -1); }
const escapar = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function erro(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

const ts = (p) => (p && p.ts && typeof p.ts.toMillis === 'function') ? p.ts.toMillis() : 0;

/* ───────── criar ───────── */
async function criar(o) {
  const u = usuario(), d = db();
  if (!u) throw erro('pflix/sem-login');
  if (!d) throw erro('pflix/sem-firestore');
  const r = o && o.tmdb;
  if (!r || !r.id || !r.titulo) throw erro('pflix/dados');
  const tipo = o.tipo === 'serie' ? 'serie' : 'filme';
  const id = u.uid + '_' + tipo + '_' + r.id;

  const ja = await getDoc(doc(d, 'pedidos', id));
  if (ja.exists()) throw erro('pflix/duplicado', 'Você já pediu esse título.');

  const meus = await listarMeus();
  if (meus.filter(p => p.status === 'pendente').length >= MAX_PENDENTES) throw erro('pflix/limite');

  const dados = {
    uid: u.uid, email: (u.email || '').toLowerCase(),
    autor: u.displayName || 'Anônimo', autorFoto: u.photoURL || '',
    tipo: tipo, tmdbId: Number(r.id), titulo: String(r.titulo).slice(0, 200),
    tituloOriginal: String(r.tituloOriginal || '').slice(0, 200),
    ano: String(r.ano || '').slice(0, 4), capa: String(r.capa || '').slice(0, 300),
    status: 'pendente', ts: serverTimestamp()
  };
  const msg = String(o.mensagem || '').trim().slice(0, MSG_MAX);
  if (msg) dados.mensagem = msg;
  await setDoc(doc(d, 'pedidos', id), dados);
  return id;
}

/* ───────── listar ───────── */
async function listarMeus() {
  const u = usuario(), d = db(); if (!u || !d) return [];
  const s = await getDocs(query(collection(d, 'pedidos'), where('uid', '==', u.uid), limit(60)));
  const arr = []; s.forEach(x => arr.push({ id: x.id, ...x.data() }));
  return arr.sort((a, b) => ts(b) - ts(a));
}
async function listarTodos() {
  const d = db(); if (!d || !ehAdmin()) return [];
  const s = await getDocs(query(collection(d, 'pedidos'), orderBy('ts', 'desc'), limit(150)));
  const arr = []; s.forEach(x => arr.push({ id: x.id, ...x.data() }));
  return arr;
}

/* ───────── admin / dono ───────── */
async function atualizarStatus(id, status, resposta) {
  const u = usuario(), d = db();
  if (!ehAdmin(u) || !d) throw erro('pflix/sem-permissao');
  if (['pendente', 'atendido', 'recusado'].indexOf(status) === -1) throw erro('pflix/dados');
  const dados = { status: status, atendidoEm: serverTimestamp(), atendidoPor: (u.email || '').toLowerCase() };
  if (resposta != null) dados.resposta = String(resposta).trim().slice(0, 300);
  await updateDoc(doc(d, 'pedidos', id), dados);
}
async function cancelar(id) {
  const d = db(); if (!d) throw erro('pflix/sem-firestore');
  await deleteDoc(doc(d, 'pedidos', id));
}

/* ───────── visual: cartão de pedido ───────── */
const STATUS = {
  pendente: { ico: '⏳', txt: 'Pendente', cls: 'is-pendente' },
  atendido: { ico: '✅', txt: 'Atendido', cls: 'is-atendido' },
  recusado: { ico: '❌', txt: 'Não disponível', cls: 'is-recusado' }
};
function fmtData(p) {
  const ms = ts(p); if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* montarCartao(pedido, { admin, catalogo: {filmes, series}, aoMudar })  →  <article> */
function montarCartao(p, opts) {
  opts = opts || {};
  const st = STATUS[p.status] || STATUS.pendente;
  const el = document.createElement('article');
  el.className = 'ped-card ' + st.cls;

  // já está no site? (só faz sentido mostrar link quando foi atendido)
  let link = '';
  if (p.status === 'atendido' && opts.catalogo && window.PipocaAPI && window.PipocaAPI.acharNoSite) {
    const r = window.PipocaAPI.acharNoSite(
      { tipo: p.tipo, titulo: p.titulo, tituloOriginal: p.tituloOriginal, ano: p.ano },
      opts.catalogo.filmes || [], opts.catalogo.series || []);
    if (r.status === 'tem' && r.item) {
      link = '<a class="ped-link" href="' + (p.tipo === 'serie' ? 'serie.html' : 'filme.html') + '?nome=' + encodeURIComponent(r.item.nome) + '">▶ Assistir agora</a>';
    }
  }

  el.innerHTML =
    (p.capa ? '<img class="ped-capa" src="' + escapar(p.capa) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<div class="ped-capa ped-capa--vazia" aria-hidden="true">' + (p.tipo === 'serie' ? '📺' : '🎬') + '</div>') +
    '<div class="ped-corpo">' +
      '<div class="ped-topo">' +
        '<div class="ped-tit"><b>' + escapar(p.titulo) + '</b>' + (p.ano ? ' <span>(' + escapar(p.ano) + ')</span>' : '') +
          '<small>' + (p.tipo === 'serie' ? '📺 Série' : '🎬 Filme') + (fmtData(p) ? ' · pedido em ' + fmtData(p) : '') + '</small></div>' +
        '<span class="ped-badge ' + st.cls + '">' + st.ico + ' ' + st.txt + '</span>' +
      '</div>' +
      (opts.admin ? '<p class="ped-quem">👤 ' + escapar(p.autor || 'Anônimo') + ' · ' + escapar(p.email || '') + '</p>' : '') +
      (p.mensagem ? '<p class="ped-msg">“' + escapar(p.mensagem) + '”</p>' : '') +
      (p.resposta ? '<p class="ped-resp"><b>Resposta da equipe:</b> ' + escapar(p.resposta) + '</p>' : '') +
      link +
    '</div>';

  const corpo = el.querySelector('.ped-corpo');

  if (opts.admin) {
    const acoes = document.createElement('div'); acoes.className = 'ped-acoes';
    const campo = document.createElement('input');
    campo.type = 'text'; campo.maxLength = 300; campo.placeholder = 'Resposta pro usuário (opcional)'; campo.className = 'ped-campo';
    campo.value = p.resposta || '';
    acoes.appendChild(campo);
    [['atendido', '✅ Atendido', 'ped-b-ok'], ['recusado', '❌ Recusar', 'ped-b-no'], ['pendente', '↩️ Voltar p/ pendente', 'ped-b-neutro']].forEach(function (a) {
      if (a[0] === p.status) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ped-b ' + a[2]; b.textContent = a[1];
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { await atualizarStatus(p.id, a[0], campo.value); if (opts.aoMudar) opts.aoMudar(p.id, a[0]); }
        catch (e) { console.warn('[Pedidos]', e && e.code || e); b.disabled = false; if (window.showToast) window.showToast('⚠️ Não deu pra atualizar'); }
      });
      acoes.appendChild(b);
    });
    corpo.appendChild(acoes);
  } else if (p.status === 'pendente' && opts.permitirCancelar) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ped-b ped-b-neutro'; b.textContent = 'Cancelar pedido';
    b.addEventListener('click', async function () {
      if (!confirm('Cancelar o pedido de "' + p.titulo + '"?')) return;
      try { await cancelar(p.id); el.remove(); if (opts.aoMudar) opts.aoMudar(p.id, 'cancelado'); }
      catch (e) { console.warn('[Pedidos]', e && e.code || e); if (window.showToast) window.showToast('⚠️ Não deu pra cancelar'); }
    });
    corpo.appendChild(b);
  }
  return el;
}

window.PipocaPedidos = { criar, listarMeus, listarTodos, atualizarStatus, cancelar, montarCartao, ehAdmin, MAX_PENDENTES, MSG_MAX };
