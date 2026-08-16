/**
 * PIPOCAFLIX — listas.js
 * Feature "Minhas Listas" (Premium/VIP).
 *
 * - Logado + VIP  → pode criar listas e adicionar filmes/séries nelas.
 * - Logado + FREE → vê um convite pra assinar (planos.html).
 * - Não logado    → vai pro login.
 *
 * Dados ficam em: users/{uid}/listas/{listaId}
 *   { nome: string, criadoEm: serverTimestamp, criadoEmMs: number,
 *     itens: [{ nome, capa, isSerie, addedEm }] }
 *
 * Inclua como <script type="module" src="assets/js/listas.js"></script>
 * DEPOIS do módulo que inicializa o Firebase Auth (initializeApp).
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

/* ─── Toast (reaproveita o da página; cria um se não existir) ─── */
function toast(msg) {
  if (typeof window.showToast === 'function') { window.showToast(msg); return; }
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._pflixToastTimer);
  el._pflixToastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ─── Firestore helpers ─── */
function getDB() {
  const app = getApps()[0];
  if (!app) throw new Error('[PipocaListas] Firebase app não inicializado nesta página.');
  return getFirestore(app);
}

function getUser() {
  return (window.PipocaAuth && window.PipocaAuth.getUser) ? window.PipocaAuth.getUser() : null;
}

async function getMinhasListas() {
  const user = getUser();
  if (!user) return [];
  const db = getDB();
  const snap = await getDocs(collection(db, 'users', user.uid, 'listas'));
  const listas = [];
  snap.forEach(d => listas.push(Object.assign({ id: d.id }, d.data())));
  listas.sort((a, b) => (b.criadoEmMs || 0) - (a.criadoEmMs || 0));
  return listas;
}

async function criarLista(nome) {
  const user = getUser();
  if (!user) throw new Error('not-logged-in');
  const nomeLimpo = (nome || '').trim().slice(0, 60);
  if (!nomeLimpo) throw new Error('nome-vazio');
  const db = getDB();
  const ref = await addDoc(collection(db, 'users', user.uid, 'listas'), {
    nome: nomeLimpo,
    criadoEm: serverTimestamp(),
    criadoEmMs: Date.now(),
    itens: []
  });
  return ref.id;
}

async function adicionarItem(listaId, item) {
  const user = getUser();
  if (!user) throw new Error('not-logged-in');
  const db = getDB();
  const ref = doc(db, 'users', user.uid, 'listas', listaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('lista-nao-encontrada');
  const data = snap.data();
  const itens = Array.isArray(data.itens) ? data.itens.slice() : [];
  if (itens.some(i => i.nome === item.nome)) return; // já está na lista
  itens.unshift({
    nome: item.nome || '',
    capa: item.capa || '',
    isSerie: !!item.isSerie,
    addedEm: Date.now()
  });
  await updateDoc(ref, { itens });
}

async function removerItem(listaId, nomeItem) {
  const user = getUser();
  if (!user) throw new Error('not-logged-in');
  const db = getDB();
  const ref = doc(db, 'users', user.uid, 'listas', listaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const itens = (Array.isArray(data.itens) ? data.itens : []).filter(i => i.nome !== nomeItem);
  await updateDoc(ref, { itens });
}

async function excluirLista(listaId) {
  const user = getUser();
  if (!user) throw new Error('not-logged-in');
  const db = getDB();
  await deleteDoc(doc(db, 'users', user.uid, 'listas', listaId));
}

/* ─── Espera o auth resolver (getUser fica null até o Firebase confirmar) ─── */
function waitForAuthUser(timeoutMs) {
  timeoutMs = timeoutMs || 6000;
  return new Promise(resolve => {
    const jaLogado = getUser();
    if (jaLogado) { resolve(jaLogado); return; }
    let resolvido = false;
    let decorrido = 0;
    const passo = 150;
    const intervalo = setInterval(() => {
      if (resolvido) return;
      const u = getUser();
      decorrido += passo;
      if (u) { resolvido = true; clearInterval(intervalo); resolve(u); return; }
      if (decorrido >= timeoutMs) { resolvido = true; clearInterval(intervalo); resolve(null); }
    }, passo);
  });
}

/* ─── Espera window.PipocaVIP terminar de checar (ver pflix-vip.js) ─── */
function aguardarStatusVip(timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return new Promise(resolve => {
    if (window.PipocaVIP && window.PipocaVIP.pronto) { resolve(!!window.PipocaVIP.ativo); return; }
    let resolvido = false;
    function onReady(e) {
      if (resolvido) return;
      resolvido = true;
      document.removeEventListener('pflix:vip-checado', onReady);
      resolve(!!(e && e.detail && e.detail.ativo));
    }
    document.addEventListener('pflix:vip-checado', onReady);
    setTimeout(() => {
      if (resolvido) return;
      resolvido = true;
      document.removeEventListener('pflix:vip-checado', onReady);
      resolve(!!(window.PipocaVIP && window.PipocaVIP.ativo));
    }, timeoutMs);
  });
}

/* ─── Modais (injetados sob demanda, uma única vez) ─── */
let _modalListasEl = null;
let _modalPremiumEl = null;
let _itemAtual = null;

function garantirModais() {
  if (_modalListasEl) return;

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="pflix-modal-overlay" id="pflixModalListas">' +
      '<div class="pflix-modal-panel">' +
        '<button class="pflix-modal-close" id="pflixModalListasClose" aria-label="Fechar">✕</button>' +
        '<div class="pflix-modal-title">📋 Adicionar à lista</div>' +
        '<div class="pflix-modal-subtitle" id="pflixModalListasSubtitle"></div>' +
        '<div id="pflixListasContainer"></div>' +
        '<div class="pflix-nova-lista-row">' +
          '<input type="text" class="pflix-nova-lista-input" id="pflixNovaListaInput" placeholder="Nome da nova lista..." maxlength="60">' +
          '<button class="pflix-nova-lista-btn" id="pflixNovaListaBtn">+ Criar</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="pflix-modal-overlay" id="pflixModalPremium">' +
      '<div class="pflix-modal-panel" style="max-width:380px;text-align:center">' +
        '<button class="pflix-modal-close" id="pflixModalPremiumClose" aria-label="Fechar">✕</button>' +
        '<div class="pflix-premium-icon">⭐</div>' +
        '<div class="pflix-modal-title">Listas são um recurso Premium</div>' +
        '<div class="pflix-modal-subtitle">Assine o PipocaFlix VIP pra criar listas personalizadas — "ver depois", "assistir com a namorada", "pra chorar"... o que você quiser. 🍿</div>' +
        '<a href="planos.html" class="pflix-premium-cta">⭐ Ver planos VIP</a>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);

  _modalListasEl = document.getElementById('pflixModalListas');
  _modalPremiumEl = document.getElementById('pflixModalPremium');

  document.getElementById('pflixModalListasClose').addEventListener('click', () => fecharModal(_modalListasEl));
  document.getElementById('pflixModalPremiumClose').addEventListener('click', () => fecharModal(_modalPremiumEl));
  [_modalListasEl, _modalPremiumEl].forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) fecharModal(m); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fecharModal(_modalListasEl); fecharModal(_modalPremiumEl); }
  });

  document.getElementById('pflixNovaListaBtn').addEventListener('click', onCriarNovaLista);
  document.getElementById('pflixNovaListaInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); onCriarNovaLista(); }
  });
}

function abrirModal(el) { if (el) el.classList.add('open'); }
function fecharModal(el) { if (el) el.classList.remove('open'); }

async function renderListasNoModal() {
  const container = document.getElementById('pflixListasContainer');
  if (!container) return;
  container.innerHTML = '<p class="pflix-lista-vazio">Carregando suas listas...</p>';

  let listas = [];
  try { listas = await getMinhasListas(); }
  catch (e) { console.error('[PipocaListas]', e); }

  if (!listas.length) {
    container.innerHTML = '<p class="pflix-lista-vazio">Você ainda não tem listas. Crie a primeira aqui embaixo 👇</p>';
    return;
  }

  container.innerHTML = '';
  listas.forEach(lista => {
    const itens = Array.isArray(lista.itens) ? lista.itens : [];
    const jaTem = _itemAtual && itens.some(i => i.nome === _itemAtual.nome);

    const row = document.createElement('label');
    row.className = 'pflix-lista-item';
    row.innerHTML =
      '<input type="checkbox" class="pflix-lista-checkbox"' + (jaTem ? ' checked' : '') + '>' +
      '<span class="pflix-lista-nome">' + lista.nome + '</span>' +
      '<span class="pflix-lista-count">' + itens.length + (itens.length === 1 ? ' item' : ' itens') + '</span>';

    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', async () => {
      if (!_itemAtual) return;
      checkbox.disabled = true;
      try {
        if (checkbox.checked) {
          await adicionarItem(lista.id, _itemAtual);
          toast('✅ Adicionado à lista "' + lista.nome + '"');
        } else {
          await removerItem(lista.id, _itemAtual.nome);
          toast('↩️ Removido da lista "' + lista.nome + '"');
        }
      } catch (e) {
        console.error('[PipocaListas]', e);
        checkbox.checked = !checkbox.checked;
        toast('⚠️ Não deu pra atualizar a lista. Tenta de novo.');
      }
      renderListasNoModal(); // recarrega contagens
    });

    container.appendChild(row);
  });
}

async function onCriarNovaLista() {
  const input = document.getElementById('pflixNovaListaInput');
  const btn = document.getElementById('pflixNovaListaBtn');
  if (!input || !btn) return;
  const nome = input.value.trim();
  if (!nome) { input.focus(); return; }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Criando...';
  try {
    const id = await criarLista(nome);
    if (_itemAtual) await adicionarItem(id, _itemAtual);
    input.value = '';
    toast('✅ Lista "' + nome + '" criada!');
    await renderListasNoModal();
  } catch (e) {
    console.error('[PipocaListas]', e);
    toast('⚠️ Não deu pra criar a lista. Tenta de novo.');
  }
  btn.disabled = false;
  btn.textContent = textoOriginal;
}

/* ─── Ponto de entrada — chame isso no botão "Minha Lista" da página ─── */
async function abrirSeletor(item) {
  if (!item || !item.nome) return;

  const user = await waitForAuthUser();
  if (!user) {
    window.location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return;
  }

  garantirModais();

  const ehVip = await aguardarStatusVip();
  if (!ehVip) {
    abrirModal(_modalPremiumEl);
    return;
  }

  _itemAtual = { nome: item.nome, capa: item.capa || '', isSerie: !!item.isSerie };
  const subtitle = document.getElementById('pflixModalListasSubtitle');
  if (subtitle) subtitle.textContent = 'Escolha uma ou mais listas para "' + item.nome + '":';
  abrirModal(_modalListasEl);
  renderListasNoModal();
}

window.PipocaListas = {
  getMinhasListas,
  criarLista,
  adicionarItem,
  removerItem,
  excluirLista,
  abrirSeletor
};
