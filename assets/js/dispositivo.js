/**
 * PIPOCAFLIX — dispositivo.js
 * Identifica o APARELHO (não a pessoa), pra impedir o teste grátis de ser usado de novo
 * com outro Gmail no mesmo celular/PC.
 *
 * Duas pistas, usadas juntas:
 *
 *  1) deviceId — um código aleatório guardado em 3 lugares ao mesmo tempo (localStorage,
 *     cookie e IndexedDB). Se a pessoa limpar um deles, os outros devolvem o código.
 *     Só some se ela limpar TUDO ou trocar de aparelho.
 *
 *  2) fp (impressão digital) — um hash de características do aparelho/navegador (tela,
 *     placa de vídeo, fuso, idioma, canvas...). Não depende de nada guardado, então pega
 *     quem usa aba anônima ou limpa os dados. Nada disso sai do aparelho "cru": só o hash.
 *
 * LIMITES (importante): nenhuma dessas pistas é 100%. Quem troca de aparelho, ou usa
 * navegador que embaralha a impressão digital (Brave, Firefox com proteção máxima),
 * passa. E dois aparelhos IGUAIS (mesmo modelo, mesma versão do sistema) podem gerar
 * a mesma fp — por isso o admin tem "Liberar de novo" na aba Testes grátis.
 */

const LS_KEY = 'pflix_did';
const COOKIE = 'pflix_did';
const IDB_NAME = 'pflix_dev';
const IDB_STORE = 'kv';

function aleatorio() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
const idValido = (s) => typeof s === 'string' && /^[a-f0-9]{32}$/.test(s);

/* ── 3 armazenamentos ── */
function lerLS() { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } }
function gravarLS(v) { try { localStorage.setItem(LS_KEY, v); } catch (e) {} }

function lerCookie() {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([a-f0-9]{32})'));
    return m ? m[1] : null;
  } catch (e) { return null; }
}
function gravarCookie(v) {
  try { document.cookie = COOKIE + '=' + v + '; max-age=' + (60 * 60 * 24 * 730) + '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
}

function abrirIDB() {
  return new Promise((ok) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
      req.onblocked = () => ok(null);
    } catch (e) { ok(null); }
  });
}
async function lerIDB() {
  const db = await abrirIDB(); if (!db) return null;
  return new Promise((ok) => {
    try {
      const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get('did');
      r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null);
    } catch (e) { ok(null); }
  });
}
async function gravarIDB(v) {
  const db = await abrirIDB(); if (!db) return;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, 'did');
      tx.oncomplete = () => ok(); tx.onerror = () => ok(); tx.onabort = () => ok();
    } catch (e) { ok(); }
  });
}

async function obterDeviceId() {
  const achados = [lerLS(), lerCookie(), await lerIDB()].filter(idValido);
  const id = achados[0] || aleatorio();
  // Regrava nos 3 lugares: quem foi apagado é recriado com o MESMO código.
  gravarLS(id); gravarCookie(id); await gravarIDB(id);
  return id;
}

/* ── impressão digital ── */
async function sha256(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

function canvasSinal() {
  try {
    const c = document.createElement('canvas'); c.width = 240; c.height = 60;
    const g = c.getContext('2d');
    g.textBaseline = 'top'; g.font = '16px Arial';
    g.fillStyle = '#f60'; g.fillRect(10, 5, 90, 30);
    g.fillStyle = '#069'; g.fillText('PipocaFlix 🍿 fp', 4, 18);
    g.strokeStyle = 'rgba(102,204,0,.7)'; g.arc(150, 30, 20, 0, Math.PI * 1.6); g.stroke();
    return c.toDataURL();
  } catch (e) { return 'sem-canvas'; }
}

function webglSinal() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return 'sem-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) + '|' + gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.VENDOR) + '|' + gl.getParameter(gl.RENDERER);
  } catch (e) { return 'erro-webgl'; }
}

async function obterFp() {
  const n = navigator, s = screen;
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  const partes = [
    n.platform || '', (n.languages || [n.language || '']).join(','), tz,
    n.hardwareConcurrency || '', n.deviceMemory || '', n.maxTouchPoints || 0,
    Math.max(s.width, s.height) + 'x' + Math.min(s.width, s.height), s.colorDepth || '', window.devicePixelRatio || 1,
    webglSinal(), canvasSinal()
  ];
  return (await sha256(partes.join('||'))).slice(0, 40);
}

let _cache = null;
/** → { deviceId: string(32), fp: string(40) } */
export function obterDispositivo() {
  if (!_cache) _cache = Promise.all([obterDeviceId(), obterFp()]).then(([deviceId, fp]) => ({ deviceId, fp }));
  return _cache;
}

window.PipocaDispositivo = { obter: obterDispositivo };
