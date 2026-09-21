/**
 * PIPOCAFLIX — conta.js
 *
 * 1) MENU DO ÍCONE DE PERFIL (cabeçalho)
 *    Clicar no ícone/“Entrar” não leva mais direto ao perfil: abre um menuzinho com
 *    “Acessar meu perfil” em destaque e, embaixo, lado a lado, “Baixar app” e “Comunidade”.
 *
 * 2) NOME + AVATAR
 *    • Quem acabou de criar a conta vê um passo “escolha seu nome e avatar”.
 *    • Quem já tinha conta NÃO é obrigado a nada — muda quando quiser em perfil.html.
 *    • Salva no Firestore  users/{uid}: perfilNome, perfilAvatar, perfilCompleto
 *    • E também atualiza o perfil do Firebase Auth (displayName/photoURL). É isso que
 *      faz comentários, suporte, feed e reports passarem a usar o novo nome/foto sem
 *      precisar mexer em cada página.
 *
 * As imagens de avatar vêm da aba “Avatares” da planilha (PipocaAPI.getAvatares).
 *
 * Incluir com:  <script type="module" src="assets/js/conta.js"></script>
 * (depois do bloco que cria window.PipocaAuth; a página precisa do api.js — se não tiver,
 *  este arquivo carrega sozinho quando for preciso)
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

/* ───────── links (troque aqui se mudar) ───────── */
export const LINKS = {
  telegram: 'https://t.me/pipocaflixx',
  app: 'instalar-app.html'
};
window.PFLIX_LINKS = LINKS;

const NOME_MIN = 2, NOME_MAX = 24;
const ONB_KEY = 'pflix_onboarding_pendente';

let db = null, usuario = null, perfil = null;
const ouvintes = [];

/* ───────── helpers ───────── */
const $el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const cacheKey = (uid) => 'pflix_perfil_' + uid;
const paginaAtual = () => location.pathname.split('/').pop() + location.search;
const urlLogin = () => 'login.html?redirect=' + encodeURIComponent(paginaAtual());

function plataforma() {
  const ua = navigator.userAgent || '';
  const ipadOS = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || ipadOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  return 'outro';
}
function rotuloApp() {
  switch (plataforma()) {
    case 'windows': return { ico: '💻', txt: 'Baixar para Windows' };
    case 'android': return { ico: '📱', txt: 'Baixar o app' };
    case 'ios':     return { ico: '📱', txt: 'Instalar no iPhone' };
    default:        return { ico: '💻', txt: 'Baixar o app' };
  }
}

function lerCache(uid) { try { return JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null'); } catch (e) { return null; } }
function gravarCache(uid, p) { try { localStorage.setItem(cacheKey(uid), JSON.stringify(p)); } catch (e) {} }

function nomeDe(user) { return (perfil && perfil.nome) || (user && user.displayName) || 'Minha Conta'; }
function avatarDe(user) { return (perfil && perfil.avatar) || (user && user.photoURL) || 'https://placehold.co/64x64/1a1a24/f0f0f6?text=%3F'; }

/* ───────── estilos (escopo .pfx-c-) ───────── */
function estilos() {
  if (document.getElementById('pfxContaStyle')) return;
  const s = $el('style'); s.id = 'pfxContaStyle';
  s.textContent = `
.pfx-c-menu{position:fixed;z-index:10001;width:min(320px,calc(100vw - 24px));padding:.85rem;background:var(--card,#1e1e2a);
  border:1px solid var(--border-light,rgba(255,255,255,.12));border-radius:var(--r-lg,18px);box-shadow:0 22px 60px rgba(0,0,0,.55);
  font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--text-1,#f0f0f6);animation:pfxCPop .16s ease-out both}
.pfx-c-quem{display:flex;align-items:center;gap:.7rem;padding:.2rem .2rem .8rem}
.pfx-c-quem img,.pfx-c-quem .pfx-c-ph{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--red,#ff2d43);flex-shrink:0;background:var(--panel,#1a1a24)}
.pfx-c-ph{display:flex;align-items:center;justify-content:center;font-size:1.3rem}
.pfx-c-quem b{display:block;font-size:.95rem;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
.pfx-c-quem small{display:block;font-size:.76rem;color:var(--text-3,#5a5a72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
.pfx-c-main{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;padding:.8rem .95rem;border:0;border-radius:14px;
  background:var(--red,#ff2d43);color:#fff;font:700 .95rem var(--font-body,'DM Sans',system-ui,sans-serif);text-decoration:none;
  box-shadow:0 8px 22px rgba(255,45,67,.32);transition:transform .14s ease,filter .14s ease}
.pfx-c-main:hover{filter:brightness(1.06)}.pfx-c-main:active{transform:scale(.985)}
.pfx-c-main span:first-child{display:flex;align-items:center;gap:.55rem}
.pfx-c-grid{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-top:.6rem}
.pfx-c-tile{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.7rem .75rem;border-radius:14px;text-decoration:none;
  background:var(--surface-2,#16161e);border:1px solid var(--border,rgba(255,255,255,.08));color:var(--text-1,#f0f0f6);
  font:600 .82rem/1.25 var(--font-body,'DM Sans',system-ui,sans-serif);transition:border-color .14s ease,background .14s ease}
.pfx-c-tile:hover{border-color:var(--red,#ff2d43);background:var(--card-hover,#22222e)}
.pfx-c-tile i{font-style:normal;font-size:1.25rem;line-height:1}
.pfx-c-tile small{font-weight:500;font-size:.72rem;color:var(--text-3,#5a5a72)}
.pfx-c-sair{display:block;width:100%;margin-top:.55rem;padding:.55rem;border:0;background:transparent;border-radius:10px;
  color:var(--text-3,#5a5a72);font:500 .8rem var(--font-body,'DM Sans',system-ui,sans-serif);transition:color .14s ease,background .14s ease}
.pfx-c-sair:hover{color:var(--text-1,#f0f0f6);background:var(--surface-2,#16161e)}
.pfx-c-menu :is(a,button):focus-visible{outline:2px solid var(--text-1,#f0f0f6);outline-offset:2px}

.pfx-c-ov{position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;
  background:rgba(5,5,9,.8);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:pfxCFade .2s ease-out both}
.pfx-c-card{width:100%;max-width:520px;margin:auto;padding:1.4rem 1.3rem 1.2rem;background:var(--card,#1e1e2a);
  border:1px solid var(--border-light,rgba(255,255,255,.12));border-radius:var(--r-lg,20px);box-shadow:0 28px 80px rgba(0,0,0,.6);
  font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--text-1,#f0f0f6);animation:pfxCRise .28s cubic-bezier(.22,1,.36,1) both}
.pfx-c-card h2{margin:0 0 .25rem;font:700 1.3rem var(--font-display,'Syne',system-ui,sans-serif)}
.pfx-c-card>p{margin:0 0 1.1rem;font-size:.88rem;color:var(--text-2,#a0a0b8);line-height:1.5}
.pfx-c-topo{display:flex;align-items:center;gap:1rem;margin-bottom:1rem}
.pfx-c-prev{width:78px;height:78px;border-radius:50%;object-fit:cover;flex-shrink:0;border:3px solid var(--red,#ff2d43);background:var(--panel,#1a1a24);box-shadow:0 8px 24px rgba(255,45,67,.3)}
.pfx-c-campo{flex:1;min-width:0}
.pfx-c-campo label{display:block;margin:0 0 .3rem;font-size:.78rem;font-weight:600;color:var(--text-3,#8a8aa0)}
.pfx-c-campo input{width:100%;padding:.7rem .8rem;border-radius:12px;border:1px solid var(--border-light,rgba(255,255,255,.14));background:var(--surface-2,#16161e);
  color:var(--text-1,#f0f0f6);font:500 1rem var(--font-body,'DM Sans',system-ui,sans-serif)}
.pfx-c-campo input:focus{outline:2px solid var(--red,#ff2d43);outline-offset:1px}
.pfx-c-cont{display:flex;justify-content:space-between;margin-top:.25rem;font-size:.72rem;color:var(--text-3,#5a5a72)}
.pfx-c-cont .err{color:var(--red,#ff2d43)}
.pfx-c-cats{display:flex;gap:.4rem;overflow-x:auto;padding:.1rem 0 .55rem;scrollbar-width:thin}
.pfx-c-chip{flex-shrink:0;padding:.4rem .85rem;border-radius:999px;border:1px solid var(--border-light,rgba(255,255,255,.14));background:transparent;
  color:var(--text-2,#a0a0b8);font:600 .8rem var(--font-body,'DM Sans',system-ui,sans-serif);white-space:nowrap}
.pfx-c-chip[aria-pressed="true"]{background:var(--red,#ff2d43);border-color:var(--red,#ff2d43);color:#fff}
.pfx-c-avs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:.55rem;max-height:236px;overflow-y:auto;padding:.25rem;
  border-radius:14px;background:var(--surface-2,#16161e)}
.pfx-c-av{position:relative;aspect-ratio:1;padding:0;border:3px solid transparent;border-radius:50%;background:var(--panel,#1a1a24);overflow:hidden}
.pfx-c-av img{width:100%;height:100%;object-fit:cover;display:block}
.pfx-c-av[aria-pressed="true"]{border-color:var(--red,#ff2d43);box-shadow:0 0 0 3px rgba(255,45,67,.25)}
.pfx-c-av:focus-visible{outline:2px solid var(--text-1,#f0f0f6);outline-offset:2px}
.pfx-c-vazio{grid-column:1/-1;padding:1.1rem;text-align:center;font-size:.85rem;color:var(--text-3,#5a5a72)}
.pfx-c-acoes{display:flex;gap:.6rem;margin-top:1.1rem}
.pfx-c-b1{flex:1;padding:.8rem 1rem;border:0;border-radius:999px;background:var(--red,#ff2d43);color:#fff;font:700 .95rem var(--font-body,'DM Sans',system-ui,sans-serif);box-shadow:0 8px 22px rgba(255,45,67,.32)}
.pfx-c-b1:disabled{opacity:.55;box-shadow:none}
.pfx-c-b2{padding:.8rem 1.1rem;border:1px solid var(--border-light,rgba(255,255,255,.14));border-radius:999px;background:transparent;color:var(--text-2,#a0a0b8);font:600 .9rem var(--font-body,'DM Sans',system-ui,sans-serif)}
.pfx-c-erro{margin:.7rem 0 0;font-size:.82rem;color:var(--red,#ff2d43)}
.pfx-c-card :is(button,input):focus-visible{outline:2px solid var(--text-1,#f0f0f6);outline-offset:2px}
@keyframes pfxCPop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
@keyframes pfxCFade{from{opacity:0}to{opacity:1}}
@keyframes pfxCRise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:480px){.pfx-c-topo{flex-direction:column;align-items:stretch;text-align:center}.pfx-c-prev{align-self:center}}
@media (prefers-reduced-motion:reduce){.pfx-c-menu,.pfx-c-ov,.pfx-c-card{animation:none}.pfx-c-main{transition:none}}`;
  document.head.appendChild(s);
}

/* ═══════════════════════ 1) MENU DO ÍCONE ═══════════════════════ */
let menuEl = null;

function fecharMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  const b = document.getElementById('authBtn'); if (b) b.setAttribute('aria-expanded', 'false');
}

function posicionar() {
  const b = document.getElementById('authBtn'); if (!b || !menuEl) return;
  const r = b.getBoundingClientRect();
  menuEl.style.top = Math.round(r.bottom + 10) + 'px';
  menuEl.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
}

function abrirMenu() {
  estilos(); fecharMenu();
  const logado = !!usuario;
  const m = $el('div', 'pfx-c-menu'); m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Menu da conta');

  const quem = $el('div', 'pfx-c-quem');
  if (logado) {
    const img = $el('img'); img.alt = ''; img.src = avatarDe(usuario); img.referrerPolicy = 'no-referrer';
    const t = $el('div'); t.appendChild($el('b', null, nomeDe(usuario))); t.appendChild($el('small', null, usuario.email || ''));
    quem.appendChild(img); quem.appendChild(t);
  } else {
    quem.appendChild($el('div', 'pfx-c-ph', '👤'));
    const t = $el('div'); t.appendChild($el('b', null, 'Você não está logado'));
    t.appendChild($el('small', null, 'Entre pra salvar seu histórico'));
    quem.appendChild(t);
  }
  m.appendChild(quem);

  const principal = $el('a', 'pfx-c-main'); principal.setAttribute('role', 'menuitem');
  principal.href = logado ? 'perfil.html' : urlLogin();
  principal.innerHTML = '<span><span aria-hidden="true">' + (logado ? '👤' : '🔐') + '</span>' + (logado ? 'Acessar meu perfil' : 'Entrar com Google') + '</span><span aria-hidden="true">→</span>';
  m.appendChild(principal);

  const grid = $el('div', 'pfx-c-grid');
  const app = rotuloApp();
  const tApp = $el('a', 'pfx-c-tile'); tApp.href = LINKS.app; tApp.setAttribute('role', 'menuitem');
  tApp.innerHTML = '<i aria-hidden="true">' + app.ico + '</i>' + app.txt;
  const tCom = $el('a', 'pfx-c-tile'); tCom.href = LINKS.telegram; tCom.target = '_blank'; tCom.rel = 'noopener noreferrer'; tCom.setAttribute('role', 'menuitem');
  tCom.innerHTML = '<i aria-hidden="true">💬</i>Comunidade<small>Telegram</small>';
  grid.appendChild(tApp); grid.appendChild(tCom); m.appendChild(grid);

  if (logado) {
    const sair = $el('button', 'pfx-c-sair', 'Sair da conta'); sair.type = 'button'; sair.setAttribute('role', 'menuitem');
    sair.addEventListener('click', () => {
      window.PipocaAuth.logout().then(() => { location.href = 'index.html'; }).catch(() => {});
    });
    m.appendChild(sair);
  }

  document.body.appendChild(m); menuEl = m; posicionar();
  const b = document.getElementById('authBtn'); if (b) b.setAttribute('aria-expanded', 'true');
  principal.focus({ preventScroll: true });
}

function ligarBotao() {
  // Fase de captura no document: roda ANTES do onclick que cada página coloca no botão
  // (aquele que ia direto pro perfil) e o impede de rodar.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#authBtn');
    if (btn) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (menuEl) fecharMenu(); else abrirMenu();
      return;
    }
    if (menuEl && !menuEl.contains(e.target)) fecharMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuEl) { fecharMenu(); const b = document.getElementById('authBtn'); if (b) b.focus(); } });
  window.addEventListener('resize', posicionar);
  window.addEventListener('scroll', () => { if (menuEl) posicionar(); }, { passive: true });
  const b = document.getElementById('authBtn');
  if (b) { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); }
}

// Mostra o avatar/nome escolhidos no botão do cabeçalho (o script de cada página coloca o do Google primeiro)
function desenharBotao() {
  const b = document.getElementById('authBtn');
  if (!b || !usuario) return;
  const img = b.querySelector('img'), sp = b.querySelector('span');
  if (img) img.src = avatarDe(usuario); else {
    b.innerHTML = '<img src="' + avatarDe(usuario).replace(/"/g, '&quot;') + '" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--red)"> <span></span>';
  }
  const sp2 = b.querySelector('span'); if (sp2) sp2.textContent = nomeDe(usuario);
  b.title = 'Minha conta';
}

/* ═══════════════════════ 2) PERFIL (nome + avatar) ═══════════════════════ */
async function garantirApi() {
  if (window.PipocaAPI && window.PipocaAPI.getAvatares) return true;
  await new Promise((ok) => {
    const s = document.createElement('script'); s.src = 'assets/js/api.js'; s.onload = ok; s.onerror = ok; document.head.appendChild(s);
  });
  return !!(window.PipocaAPI && window.PipocaAPI.getAvatares);
}

function validarNome(txt) {
  const n = String(txt || '').replace(/\s+/g, ' ').trim();
  if (n.length < NOME_MIN) return { ok: false, msg: 'Use pelo menos ' + NOME_MIN + ' letras.' };
  if (n.length > NOME_MAX) return { ok: false, msg: 'Máximo de ' + NOME_MAX + ' caracteres.' };
  if (!/[\p{L}\p{N}]{2,}/u.test(n)) return { ok: false, msg: 'Coloque um nome de verdade 🙂' };
  if (/https?:|www\.|\.(com|net|org|br)\b|@.+\./i.test(n)) return { ok: false, msg: 'Nada de links ou e-mails no nome.' };
  return { ok: true, nome: n };
}

async function aplicarNoAuth(user, p) {
  try {
    const dn = (p.nome && p.nome !== user.displayName) ? p.nome : undefined;
    const ph = (p.avatar && p.avatar !== user.photoURL) ? p.avatar : undefined;
    if (dn !== undefined || ph !== undefined) await updateProfile(user, { displayName: dn !== undefined ? dn : user.displayName, photoURL: ph !== undefined ? ph : user.photoURL });
  } catch (e) { console.warn('[Conta] updateProfile:', e && e.code || e); }
}

async function salvarPerfil(nome, avatar) {
  if (!usuario || !db) throw new Error('sem login');
  const dados = { perfilNome: nome, perfilCompleto: true, perfilAtualizadoEm: serverTimestamp() };
  if (avatar) dados.perfilAvatar = avatar;
  await setDoc(doc(db, 'users', usuario.uid), dados, { merge: true });
  perfil = { nome: nome, avatar: avatar || (perfil && perfil.avatar) || '', completo: true };
  gravarCache(usuario.uid, perfil);
  await aplicarNoAuth(usuario, perfil);
  desenharBotao();
  try { localStorage.removeItem(ONB_KEY); } catch (e) {}
  window.dispatchEvent(new CustomEvent('pflix:perfil', { detail: perfil }));
  ouvintes.forEach(f => { try { f(perfil); } catch (e) {} });
}

let editorEl = null;
async function abrirEditor(opts) {
  opts = opts || {};
  if (!usuario) { location.href = urlLogin(); return; }
  if (editorEl) return;
  estilos();
  const onboarding = opts.modo === 'onboarding';

  const ov = $el('div', 'pfx-c-ov'); editorEl = ov;
  const card = $el('div', 'pfx-c-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pfxCTitulo'); card.tabIndex = -1;
  ov.appendChild(card);

  const h2 = $el('h2', null, onboarding ? 'Bem-vindo(a) ao PipocaFlix 🍿' : 'Editar perfil'); h2.id = 'pfxCTitulo';
  card.appendChild(h2);
  card.appendChild($el('p', null, onboarding ? 'Como você quer ser chamado(a)? Escolha também um avatar — dá pra mudar depois no seu perfil.' : 'Troque seu nome e escolha o avatar que mais combina com você.'));

  // topo: prévia + nome
  const topo = $el('div', 'pfx-c-topo');
  const prev = $el('img', 'pfx-c-prev'); prev.alt = 'Prévia do avatar'; prev.referrerPolicy = 'no-referrer';
  let avatarEscolhido = (perfil && perfil.avatar) || '';
  prev.src = avatarEscolhido || usuario.photoURL || 'https://placehold.co/78x78/1a1a24/f0f0f6?text=%3F';
  const campo = $el('div', 'pfx-c-campo');
  const lb = $el('label', null, 'Seu nome'); lb.htmlFor = 'pfxCNome';
  const inp = $el('input'); inp.id = 'pfxCNome'; inp.type = 'text'; inp.maxLength = NOME_MAX + 6; inp.autocomplete = 'nickname'; inp.spellcheck = false;
  const primeiroNome = (usuario.displayName || '').split(' ')[0];
  inp.value = nomeDe(usuario) === 'Minha Conta' ? primeiroNome : ((perfil && perfil.nome) || primeiroNome || '');
  const cont = $el('div', 'pfx-c-cont'); const msg = $el('span'); const cnt = $el('span');
  cont.appendChild(msg); cont.appendChild(cnt);
  campo.appendChild(lb); campo.appendChild(inp); campo.appendChild(cont);
  topo.appendChild(prev); topo.appendChild(campo); card.appendChild(topo);

  // avatares
  const cats = $el('div', 'pfx-c-cats'); cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Categorias de avatar');
  const grade = $el('div', 'pfx-c-avs'); grade.appendChild($el('div', 'pfx-c-vazio', 'Carregando avatares…'));
  card.appendChild(cats); card.appendChild(grade);

  const erro = $el('p', 'pfx-c-erro'); erro.setAttribute('role', 'alert'); erro.hidden = true; card.appendChild(erro);

  const acoes = $el('div', 'pfx-c-acoes');
  const salvar = $el('button', 'pfx-c-b1', onboarding ? 'Salvar e continuar' : 'Salvar'); salvar.type = 'button';
  const cancelar = $el('button', 'pfx-c-b2', onboarding ? 'Pular por enquanto' : 'Cancelar'); cancelar.type = 'button';
  acoes.appendChild(salvar); acoes.appendChild(cancelar); card.appendChild(acoes);

  function atualizarNome() {
    const v = validarNome(inp.value);
    cnt.textContent = inp.value.trim().length + '/' + NOME_MAX;
    msg.textContent = v.ok || !inp.value.trim() ? '' : v.msg; msg.className = v.ok ? '' : 'err';
    salvar.disabled = !v.ok;
    return v;
  }
  inp.addEventListener('input', atualizarNome); atualizarNome();

  function fechar(pulou) {
    if (editorEl) { editorEl.remove(); editorEl = null; }
    document.documentElement.style.overflow = '';
    if (pulou) { try { localStorage.removeItem(ONB_KEY); } catch (e) {} }
  }
  cancelar.addEventListener('click', () => fechar(onboarding));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) fechar(onboarding); });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fechar(onboarding); return; }
    if (e.key === 'Enter' && e.target === inp && !salvar.disabled) { e.preventDefault(); salvar.click(); }
    if (e.key === 'Tab') {
      const f = Array.from(card.querySelectorAll('button:not([disabled]),input')); if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (!card.contains(document.activeElement) || document.activeElement === card) { e.preventDefault(); (e.shiftKey ? z : a).focus(); }
      else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  salvar.addEventListener('click', async () => {
    const v = atualizarNome(); if (!v.ok) return;
    salvar.disabled = true; salvar.textContent = 'Salvando…'; erro.hidden = true;
    try {
      await salvarPerfil(v.nome, avatarEscolhido);
      fechar(false);
      if (window.showToast) window.showToast('✅ Perfil salvo!');
    } catch (e) {
      console.warn('[Conta] salvar perfil:', e && e.code || e);
      erro.textContent = (e && e.code === 'permission-denied')
        ? 'Sem permissão pra salvar. (Falta publicar as regras do Firestore — veja o arquivo de regras.)'
        : 'Não deu pra salvar agora. Confere a internet e tenta de novo.';
      erro.hidden = false; salvar.disabled = false; salvar.textContent = onboarding ? 'Salvar e continuar' : 'Salvar';
    }
  });

  document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
  card.focus({ preventScroll: true });

  // carrega avatares da planilha
  try {
    await garantirApi();
    const lista = await window.PipocaAPI.getAvatares();
    grade.textContent = ''; cats.textContent = '';
    if (!lista.length) { grade.appendChild($el('div', 'pfx-c-vazio', 'Nenhum avatar disponível agora — você pode manter sua foto e escolher depois.')); return; }
    let catAtual = 0;
    const desenharGrade = () => {
      grade.textContent = '';
      lista[catAtual].avatares.forEach((url) => {
        const b = $el('button', 'pfx-c-av'); b.type = 'button'; b.setAttribute('aria-label', 'Avatar de ' + lista[catAtual].categoria);
        b.setAttribute('aria-pressed', String(url === avatarEscolhido));
        const im = $el('img'); im.loading = 'lazy'; im.alt = ''; im.referrerPolicy = 'no-referrer'; im.src = url;
        im.onerror = () => { b.remove(); };
        b.appendChild(im);
        b.addEventListener('click', () => {
          avatarEscolhido = url; prev.src = url;
          grade.querySelectorAll('.pfx-c-av').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
        });
        grade.appendChild(b);
      });
    };
    lista.forEach((c, i) => {
      const chip = $el('button', 'pfx-c-chip', c.categoria); chip.type = 'button'; chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-pressed', String(i === 0));
      chip.addEventListener('click', () => { catAtual = i; cats.querySelectorAll('.pfx-c-chip').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); desenharGrade(); });
      cats.appendChild(chip);
    });
    // abre já na categoria do avatar atual, se houver
    const idxAtual = lista.findIndex(c => c.avatares.includes(avatarEscolhido));
    if (idxAtual > 0) { catAtual = idxAtual; cats.querySelectorAll('.pfx-c-chip').forEach((x, j) => x.setAttribute('aria-pressed', String(j === idxAtual))); }
    desenharGrade();
  } catch (e) {
    grade.textContent = ''; grade.appendChild($el('div', 'pfx-c-vazio', 'Não deu pra carregar os avatares agora.'));
  }
}

/* ───────── reação ao login ───────── */
async function aoMudarUsuario(user) {
  usuario = user || null;
  if (!user) { perfil = null; return; }

  const c = lerCache(user.uid);
  if (c) { perfil = c; aplicarNoAuth(user, c); desenharBotao(); }

  if (!db) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const d = snap.exists() ? snap.data() : {};
    perfil = { nome: d.perfilNome || '', avatar: d.perfilAvatar || '', completo: !!d.perfilCompleto };
    gravarCache(user.uid, perfil);
    await aplicarNoAuth(user, perfil);
    desenharBotao();
    window.dispatchEvent(new CustomEvent('pflix:perfil', { detail: perfil }));
    ouvintes.forEach(f => { try { f(perfil); } catch (e) {} });

    // Passo "escolha nome e avatar": só pra conta NOVA (login recém-feito) e só uma vez por sessão
    if (!perfil.completo) {
      let pendente = false; try { pendente = localStorage.getItem(ONB_KEY) === user.uid; } catch (e) {}
      const criada = Date.parse(user.metadata && user.metadata.creationTime) || 0;
      const recente = criada && (Date.now() - criada) < 30 * 60 * 1000;
      let visto = false; try { visto = !!sessionStorage.getItem('pflix_onb_visto_' + user.uid); } catch (e) {}
      if ((pendente || recente) && !visto) {
        try { sessionStorage.setItem('pflix_onb_visto_' + user.uid, '1'); } catch (e) {}
        setTimeout(() => abrirEditor({ modo: 'onboarding' }), 700);
      }
    }
  } catch (e) { console.warn('[Conta] não deu pra ler o perfil:', e && e.code || e); }
}

function iniciar() {
  ligarBotao();
  let tent = 0;
  (function esperar() {
    const app = getApps()[0];
    if (app && window.PipocaAuth && window.PipocaAuth.onAuthChanged) {
      db = getFirestore(app);
      window.PipocaAuth.onAuthChanged(aoMudarUsuario);
      return;
    }
    if (++tent < 60) setTimeout(esperar, 200);
  })();
}

window.PipocaPerfil = {
  get: () => perfil,
  abrirEditor: abrirEditor,
  onChange: (f) => { ouvintes.push(f); },
  nomeExibicao: nomeDe,
  avatarExibicao: avatarDe,
  validarNome: validarNome
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
