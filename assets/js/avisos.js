/**
 * PIPOCAFLIX — Sistema de Avisos (via Google Sheets)
 * assets/js/avisos.js
 *
 * Lê uma aba específica da planilha:
 *   A1 = título do aviso
 *   A2 = conteúdo/texto do aviso
 *   B2 = "Sim" ou "Não" — controla se o aviso aparece no site
 *
 * Se B2 = "Não" (ou vazio, ou qualquer coisa diferente de "sim"), nada é mostrado.
 * Se B2 = "Sim", um banner aparece no topo do site com o título + texto.
 *
 * O usuário pode fechar o aviso; ele não aparece de novo enquanto o
 * conteúdo (título+texto) não mudar na planilha.
 *
 * Basta incluir este script em qualquer página:
 *   <script src="assets/js/avisos.js" defer></script>
 */
(function () {
  'use strict';

  const SHEET_ID = "1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU";
  const GID = "1010784164"; // aba de avisos
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

  const DISMISS_KEY = "pflix_aviso_fechado";
  const CACHE_KEY = "pflix_aviso_cache";
  const CACHE_TTL = 5 * 60 * 1000; // 5 min

  function parseCsvLine(text) {
    // Parser simples de CSV, lida com aspas e vírgulas dentro de campos
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQuotes) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ""; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === '\r') { /* ignora */ }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  // Compartilha o parser (aguenta vírgula e quebra de linha dentro de aspas) com o aviso de atualização, mais abaixo
  window.PflixCsv = { parse: parseCsvLine };

  function getCachedCsv() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CACHE_TTL) return null;
      return obj.csv;
    } catch (e) { return null; }
  }

  function setCachedCsv(csv) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ csv, ts: Date.now() }));
    } catch (e) {}
  }

  function montarBanner(titulo, texto) {
    const chaveAtual = (titulo + "|" + texto);

    // Se o usuário já fechou ESSE mesmo aviso (mesmo texto), não mostra de novo
    try {
      if (localStorage.getItem(DISMISS_KEY) === chaveAtual) return;
    } catch (e) {}

    if (document.getElementById("pflixAvisoBanner")) return; // já existe na página

    const banner = document.createElement("div");
    banner.id = "pflixAvisoBanner";
    banner.setAttribute("role", "alert");
    banner.style.cssText = [
      "position:relative", "width:100%", "z-index:9999",
      "background:linear-gradient(90deg,#B7090B,#ff2d43)",
      "color:#fff", "padding:12px 44px 12px 16px",
      "font-family:inherit", "box-sizing:border-box",
      "display:flex", "align-items:center", "gap:10px",
      "flex-wrap:wrap", "font-size:0.9rem", "line-height:1.4"
    ].join(";");

    banner.innerHTML =
      '<span style="font-size:1.2rem;flex-shrink:0">📢</span>' +
      '<span style="flex:1;min-width:200px">' +
        '<strong style="margin-right:6px">' + escapeHtml(titulo) + '</strong>' +
        '<span style="opacity:0.95">' + escapeHtml(texto) + '</span>' +
      '</span>' +
      '<button id="pflixAvisoFechar" aria-label="Fechar aviso" style="' +
        'position:absolute;top:8px;right:10px;background:none;border:none;color:#fff;' +
        'font-size:1.3rem;cursor:pointer;line-height:1;opacity:0.85">×</button>';

    document.body.insertBefore(banner, document.body.firstChild);

    document.getElementById("pflixAvisoFechar").addEventListener("click", function () {
      banner.remove();
      try { localStorage.setItem(DISMISS_KEY, chaveAtual); } catch (e) {}
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function processarCsv(csvText) {
    const rows = parseCsvLine(csvText);
    if (!rows || rows.length < 2) return;

    const titulo = (rows[0] && rows[0][0]) ? rows[0][0].trim() : "";
    const texto = (rows[1] && rows[1][0]) ? rows[1][0].trim() : "";
    const flag = (rows[1] && rows[1][1]) ? rows[1][1].trim().toLowerCase() : "";

    if (flag !== "sim") return; // só mostra se B2 = "Sim"
    if (!titulo && !texto) return;

    montarBanner(titulo, texto);
  }

  async function iniciar() {
    const cached = getCachedCsv();
    if (cached) {
      processarCsv(cached);
      return;
    }
    try {
      const res = await fetch(CSV_URL);
      if (!res.ok) return;
      const csv = await res.text();
      setCachedCsv(csv);
      processarCsv(csv);
    } catch (e) {
      // Falha silenciosa — se a planilha não puder ser lida, o site
      // continua funcionando normalmente, só sem o aviso.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();


/**
 * PIPOCAFLIX — Aviso de ATUALIZAÇÃO do site (aba "Atualização" da planilha)
 *
 * Planilha (aba "Atualização", gid 1102017720) — sempre na LINHA 2:
 *   A2 = SIM ou NÃO  → SIM mostra o aviso pra quem entra no site; NÃO (ou vazio) não mostra nada
 *   B2 = mensagem que aparece pro usuário
 *   C2 = link da foto (aparece redonda, tipo foto de perfil)
 *
 * O aviso é OPCIONAL: o usuário pode tocar em "Agora não" (não aparece de novo por 12 h).
 * Ao tocar em "Atualizar agora":
 *   1. mostra a tela de carregando;
 *   2. apaga os cookies do site, o Cache Storage e o service worker;
 *   3. vai pra /limpar-cache.html, que manda o navegador limpar o cache de verdade
 *      (cabeçalho Clear-Site-Data do vercel.json) e devolve a pessoa pra página onde estava.
 * NÃO apaga favoritos, histórico, listas nem o login (ficam no localStorage/IndexedDB).
 *
 * Quem já clicou em "Atualizar agora" não vê o mesmo aviso de novo. Para mostrar um aviso
 * NOVO pra todo mundo, é só mudar o texto (B2) ou a foto (C2) na planilha.
 */
(function () {
  'use strict';

  const SHEET_ID = "1i__-NfKkjKYmlm78vGXdNBMk2Z-o3dzZ-LL0Me-oPtU";
  const GID = "1102017720"; // aba "Atualização"
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const LIMPAR_URL = "/limpar-cache.html";

  const DONE_KEY = "pflix_upd_done";     // assinatura do último aviso que a pessoa JÁ atualizou
  const SNOOZE_KEY = "pflix_upd_snooze"; // { sig, until } — clicou em "Agora não"
  const CACHE_KEY = "pflix_upd_cache";   // { csv, ts }
  const CACHE_TTL = 3 * 60 * 1000;       // 3 min
  const SNOOZE_MS = 12 * 60 * 60 * 1000; // 12 h
  const MSG_PADRAO = "O site foi atualizado! Clique no botão abaixo para usar a versão mais recente.";

  let carregando = false;
  let overlay = null;

  /* ───────── planilha ───────── */
  function normaliza(v) {
    return String(v == null ? "" : v).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // assinatura curta do aviso (texto + foto): muda a mensagem → é um aviso novo
  function assinatura(msg, img) {
    const s = msg + "|" + img;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function lerAviso(csv) {
    const rows = window.PflixCsv.parse(csv);
    const linha2 = rows && rows[1];
    if (!linha2) return null;
    if (normaliza(linha2[0]) !== "sim") return null; // só "SIM" mostra
    const msg = (linha2[1] || "").trim() || MSG_PADRAO;
    const img = (linha2[2] || "").trim();
    return { msg: msg, img: img, sig: assinatura(msg, img) };
  }

  function csvDoCache() {
    try {
      const o = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (o && Date.now() - o.ts < CACHE_TTL) return o.csv;
    } catch (e) {}
    return null;
  }

  async function obterCsv() {
    const c = csvDoCache();
    if (c) return c;
    try {
      const res = await fetch(CSV_URL);
      if (!res.ok) return null;
      const csv = await res.text();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ csv: csv, ts: Date.now() })); } catch (e) {}
      return csv;
    } catch (e) {
      return null; // planilha fora do ar → o site segue normal, só sem o aviso
    }
  }

  function jaAtualizou(sig) {
    try { return localStorage.getItem(DONE_KEY) === sig; } catch (e) { return false; }
  }
  function emSoneca(sig) {
    try {
      const o = JSON.parse(localStorage.getItem(SNOOZE_KEY));
      return !!(o && o.sig === sig && Date.now() < o.until);
    } catch (e) { return false; }
  }

  // Depois de "Atualizar agora" a URL volta com "?_u=123" (pra forçar baixar tudo de novo). Tira isso da barra de endereço.
  function limparParamU() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.has("_u")) {
        u.searchParams.delete("_u");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch (e) {}
  }

  /* ───────── limpeza ───────── */
  function comTimeout(promessa, ms) {
    return Promise.race([promessa, new Promise(function (r) { setTimeout(r, ms); })]).catch(function () {});
  }

  function apagarCookies() {
    try {
      const host = location.hostname, partes = host.split(".");
      const dominios = ["", host, "." + host];
      for (let i = 1; i < partes.length - 1; i++) dominios.push("." + partes.slice(i).join("."));
      const pasta = location.pathname.replace(/\/[^\/]*$/, "") || "/";
      const caminhos = pasta === "/" ? ["/"] : ["/", pasta];
      document.cookie.split(";").forEach(function (c) {
        const nome = c.split("=")[0].trim();
        if (!nome) return;
        dominios.forEach(function (d) {
          caminhos.forEach(function (p) {
            document.cookie = nome + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=" + p + (d ? "; domain=" + d : "");
          });
        });
      });
    } catch (e) {}
  }

  async function apagarCacheStorage() {
    if (!("caches" in window)) return;
    const chaves = await caches.keys();
    await Promise.all(chaves.map(function (k) { return caches.delete(k); }));
  }

  async function removerServiceWorkers() {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(function (r) { return r.unregister(); }));
  }

  function recarregarSemLimpeza() {
    try {
      const u = new URL(location.href);
      u.searchParams.set("_u", Date.now());
      location.replace(u.toString());
    } catch (e) { location.reload(); }
  }

  async function irParaLimpeza() {
    // Confere se a página de limpeza foi publicada; se não foi, recarrega normal (nunca deixa a pessoa num 404)
    let existe = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(function () { ctrl.abort(); }, 4000);
      const r = await fetch(LIMPAR_URL, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      existe = r.ok;
    } catch (e) {}
    if (!existe) { recarregarSemLimpeza(); return; }
    location.replace(LIMPAR_URL + "?volta=" + encodeURIComponent(location.pathname + location.search));
  }

  async function atualizarAgora(aviso) {
    if (carregando) return;
    if (navigator.onLine === false) { mostrarErro("Sem internet. Conecte-se e tente de novo."); return; }
    carregando = true;
    mostrarCarregando();
    const inicio = Date.now();
    try { localStorage.setItem(DONE_KEY, aviso.sig); } catch (e) {}
    apagarCookies();
    await Promise.all([
      comTimeout(apagarCacheStorage(), 3000),
      comTimeout(removerServiceWorkers(), 3000)
    ]);
    const resta = 1100 - (Date.now() - inicio); // tempo mínimo pra dar pra ler a mensagem
    if (resta > 0) await new Promise(function (r) { setTimeout(r, resta); });
    irParaLimpeza();
  }

  function dispensar(aviso) {
    if (carregando) return;
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ sig: aviso.sig, until: Date.now() + SNOOZE_MS })); } catch (e) {}
    fechar();
  }

  /* ───────── visual ───────── */
  function estilos() {
    if (document.getElementById("pfxUpdStyle")) return;
    const s = document.createElement("style");
    s.id = "pfxUpdStyle";
    s.textContent = `
.pfx-upd-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
  padding:1.25rem;overflow-y:auto;background:rgba(5,5,9,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  animation:pfxUpdFade .22s ease-out both}
.pfx-upd-card{position:relative;width:100%;max-width:400px;margin:44px 0 1rem;padding:54px 1.5rem 1.3rem;
  background:var(--card,#1e1e2a);border:1px solid var(--border-light,rgba(255,255,255,.12));
  border-radius:var(--r-lg,20px);box-shadow:0 28px 80px rgba(0,0,0,.6);text-align:center;
  font-family:var(--font-body,'DM Sans',system-ui,sans-serif);color:var(--text-1,#f0f0f6);
  animation:pfxUpdRise .3s cubic-bezier(.22,1,.36,1) both}
.pfx-upd-avatar{position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:80px;height:80px;
  border-radius:50%;object-fit:cover;background:var(--panel,#1a1a24);border:3px solid var(--red,#ff2d43);
  box-shadow:0 0 0 6px var(--card,#1e1e2a),0 12px 32px rgba(255,45,67,.4)}
.pfx-upd-avatar--fallback{display:flex;align-items:center;justify-content:center;font-size:2rem;line-height:1}
.pfx-upd-nome{margin:0 0 .6rem;font-family:var(--font-display,'Syne',system-ui,sans-serif);font-weight:700;font-size:1.1rem;letter-spacing:.2px}
.pfx-upd-msg{margin:0 0 1.35rem;font-size:1rem;line-height:1.6;color:var(--text-2,#a0a0b8);white-space:pre-line;overflow-wrap:anywhere}
.pfx-upd-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;padding:.8rem 1rem;border:0;
  border-radius:var(--r-pill,50px);background:var(--red,#ff2d43);color:#fff;font:600 .95rem var(--font-body,'DM Sans',system-ui,sans-serif);
  box-shadow:0 8px 24px rgba(255,45,67,.35);transition:opacity .15s ease,transform .15s ease}
.pfx-upd-btn:hover{opacity:.9}
.pfx-upd-btn:active{transform:scale(.985)}
.pfx-upd-later{display:block;width:100%;margin-top:.35rem;padding:.65rem;border:0;background:transparent;
  color:var(--text-3,#5a5a72);font:500 .85rem var(--font-body,'DM Sans',system-ui,sans-serif);transition:color .15s ease}
.pfx-upd-later:hover{color:var(--text-2,#a0a0b8)}
.pfx-upd-card:focus{outline:none}
.pfx-upd-btn:focus-visible,.pfx-upd-later:focus-visible{outline:2px solid var(--text-1,#f0f0f6);outline-offset:3px}
.pfx-upd-erro{margin:-.4rem 0 .9rem;font-size:.85rem;color:var(--red,#ff2d43)}
.pfx-upd-load{padding:.4rem 0 .6rem}
.pfx-upd-spin{width:38px;height:38px;margin:0 auto 1rem;border-radius:50%;
  border:3px solid var(--border-light,rgba(255,255,255,.12));border-top-color:var(--red,#ff2d43);animation:pfxUpdSpin .8s linear infinite}
.pfx-upd-load-t{margin:0 0 .3rem;font-weight:600;font-size:1rem}
.pfx-upd-load-s{margin:0;font-size:.85rem;line-height:1.5;color:var(--text-3,#5a5a72)}
@keyframes pfxUpdFade{from{opacity:0}to{opacity:1}}
@keyframes pfxUpdRise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes pfxUpdSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){
  .pfx-upd-overlay,.pfx-upd-card{animation:none}
  .pfx-upd-spin{animation:none;border-top-color:var(--red,#ff2d43);border-right-color:var(--red,#ff2d43)}
  .pfx-upd-btn{transition:none}
}`;
    document.head.appendChild(s);
  }

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function avatar(url) {
    function fallback() {
      const d = el("div", "pfx-upd-avatar pfx-upd-avatar--fallback", "📢");
      d.setAttribute("aria-hidden", "true");
      return d;
    }
    if (!/^https?:\/\//i.test(url || "")) return fallback();
    const img = el("img", "pfx-upd-avatar");
    img.alt = "";
    img.width = 80; img.height = 80;
    img.referrerPolicy = "no-referrer"; // alguns sites de imagem bloqueiam quando vem de outro site
    img.decoding = "async";
    img.onerror = function () { if (img.parentNode) img.parentNode.replaceChild(fallback(), img); };
    img.src = url;
    return img;
  }

  let corpo = null;

  function montarModal(aviso) {
    if (document.getElementById("pfxUpdOverlay")) return;
    estilos();

    overlay = el("div", "pfx-upd-overlay");
    overlay.id = "pfxUpdOverlay";

    const card = el("div", "pfx-upd-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "pfxUpdNome");
    card.setAttribute("aria-describedby", "pfxUpdMsg");
    card.tabIndex = -1; // recebe o foco inicial (leitor de tela lê o aviso); o Tab leva pro botão

    card.appendChild(avatar(aviso.img));

    const nome = el("p", "pfx-upd-nome", "PipocaFlix");
    nome.id = "pfxUpdNome";
    card.appendChild(nome);

    corpo = el("div", "pfx-upd-corpo");
    corpo.setAttribute("aria-live", "polite");
    const msg = el("p", "pfx-upd-msg", aviso.msg); // textContent → nada da planilha vira HTML
    msg.id = "pfxUpdMsg";
    corpo.appendChild(msg);

    const btn = el("button", "pfx-upd-btn");
    btn.type = "button";
    btn.id = "pfxUpdBtn";
    btn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg><span>Atualizar agora</span>';
    btn.addEventListener("click", function () { atualizarAgora(aviso); });

    const depois = el("button", "pfx-upd-later", "Agora não");
    depois.type = "button";
    depois.addEventListener("click", function () { dispensar(aviso); });

    corpo.appendChild(btn);
    corpo.appendChild(depois);
    card.appendChild(corpo);
    overlay.appendChild(card);

    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) dispensar(aviso); });
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { dispensar(aviso); return; }
      if (e.key === "Tab") {
        const foco = overlay.querySelectorAll("button:not([disabled])");
        if (!foco.length) { e.preventDefault(); return; }
        const primeiro = foco[0], ultimo = foco[foco.length - 1];
        if (!overlay.contains(document.activeElement) || document.activeElement === card) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); }
        else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    });

    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden"; // trava a rolagem da página por trás
    card.focus({ preventScroll: true });
  }

  function mostrarCarregando() {
    if (!corpo) return;
    corpo.textContent = "";
    const box = el("div", "pfx-upd-load");
    const spin = el("div", "pfx-upd-spin");
    spin.setAttribute("aria-hidden", "true");
    box.appendChild(spin);
    box.appendChild(el("p", "pfx-upd-load-t", "Atualizando o PipocaFlix…"));
    box.appendChild(el("p", "pfx-upd-load-s", "Limpando cookies e cache. Não feche esta página."));
    corpo.appendChild(box);
  }

  function mostrarErro(texto) {
    if (!corpo) return;
    let e = corpo.querySelector(".pfx-upd-erro");
    if (!e) {
      e = el("p", "pfx-upd-erro");
      e.setAttribute("role", "alert");
      corpo.insertBefore(e, corpo.querySelector(".pfx-upd-btn"));
    }
    e.textContent = texto;
  }

  function fechar() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; corpo = null;
    document.documentElement.style.overflow = "";
  }

  /* ───────── início ───────── */
  async function iniciar() {
    limparParamU();
    const csv = await obterCsv();
    if (!csv) return;
    const aviso = lerAviso(csv);
    if (!aviso) return;
    if (jaAtualizou(aviso.sig) || emSoneca(aviso.sig)) return;
    setTimeout(function () { montarModal(aviso); }, 900); // deixa a página respirar antes de mostrar
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
