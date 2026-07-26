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
