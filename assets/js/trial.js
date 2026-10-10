/**
 * PIPOCAFLIX — trial.js
 * Teste grátis de 3 horas. Regras:
 *
 *   1. SÓ GMAIL, e só pelo login do Google. O e-mail NÃO é mais digitado: vem da conta
 *      Google que a pessoa acabou de usar pra entrar (o Google já confirmou que ela é dona
 *      dele). Isso fecha de uma vez e-mail inventado, e-mail descartável (tempmail etc.)
 *      e o "escrevo o e-mail de outra pessoa". As regras do Firestore conferem tudo de
 *      novo no servidor (ver firestore.rules.novas) — não dá pra burlar mexendo no JS.
 *
 *   2. UM TESTE POR E-MAIL — o documento trial/{emailKey} nunca pode ser reescrito.
 *
 *   3. UM TESTE POR APARELHO — junto com o teste, grava-se o aparelho em
 *      trial_devices/{deviceId} e trial_fp/{fp} (ver dispositivo.js). Se o aparelho já
 *      tem registro, outro Gmail não consegue começar teste ali.
 *
 *   4. As 3 horas continuam sendo contadas no navegador (agora − criadoEm), nunca gravadas
 *      como "expiraEm".
 *
 * Firestore:
 *   trial/{emailKey}        { email, uid, deviceId, fp, criadoEm }
 *   trial_devices/{deviceId} { uid, criadoEm }
 *   trial_fp/{fp}            { uid, criadoEm }
 *
 * Usado por: teste-gratis.html (criar) e acesso-vip.js (conferir).
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { obterDispositivo } from "./dispositivo.js";

const DURACAO_MS = 3 * 60 * 60 * 1000; // 3 horas
// true  = bloqueia também pela impressão digital (pega aba anônima / dados limpos,
//         mas aparelhos idênticos podem colidir → admin libera em "Testes grátis").
// false = só pelo código guardado no aparelho (menos falso-positivo, mais fácil de burlar).
const BLOQUEAR_POR_FINGERPRINT = true;

function db() {
  const app = getApps()[0];
  if (!app) throw new Error('Firebase ainda não iniciou');
  return getFirestore(app);
}
function usuario() { return (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser()) || null; }

function emailKeyOf(email) {
  return String(email || '').trim().toLowerCase().replace(/[.#$[\]]/g, '_');
}
function ehGmail(email) {
  return /^[^@\s]+@gmail\.com$/i.test(String(email || '').trim());
}
function erro(code, msg, detalhe) { const e = new Error(msg || code); e.code = code; if (detalhe) e.detalhe = detalhe; return e; }

// status(email) → { estado: 'nunca-usado' | 'ativo' | 'expirado', restanteMs? }
// Precisa estar logado com esse mesmo e-mail (as regras só deixam a própria pessoa ler).
async function status(email) {
  const snap = await getDoc(doc(db(), 'trial', emailKeyOf(email)));
  if (!snap.exists()) return { estado: 'nunca-usado' };
  const d = snap.data();
  const criado = d.criadoEm && typeof d.criadoEm.toMillis === 'function' ? d.criadoEm.toMillis() : 0;
  const restante = DURACAO_MS - (Date.now() - criado);
  return restante > 0 ? { estado: 'ativo', restanteMs: restante } : { estado: 'expirado' };
}

// → true se ESTE aparelho já começou algum teste (com qualquer e-mail).
async function aparelhoJaUsado() {
  const d = db();
  const disp = await obterDispositivo();
  const checks = [getDoc(doc(d, 'trial_devices', disp.deviceId))];
  if (BLOQUEAR_POR_FINGERPRINT) checks.push(getDoc(doc(d, 'trial_fp', disp.fp)));
  const r = await Promise.all(checks);
  return r.some((s) => s.exists());
}

// iniciar() → cria o teste pra conta Google logada.
// Erros (.code): pflix/sem-login · pflix/nao-gmail · pflix/ja-usado · pflix/aparelho-usado
async function iniciar() {
  const u = usuario();
  if (!u || !u.email) throw erro('pflix/sem-login', 'faça login com o Google primeiro');
  const email = u.email.trim().toLowerCase();
  if (!ehGmail(email)) throw erro('pflix/nao-gmail', 'só Gmail', { email });
  if (u.emailVerified === false) throw erro('pflix/nao-gmail', 'e-mail não verificado', { email });

  const atual = await status(email);
  if (atual.estado !== 'nunca-usado') throw erro('pflix/ja-usado', 'e-mail já usado', atual);

  if (await aparelhoJaUsado()) throw erro('pflix/aparelho-usado', 'aparelho já usou o teste');

  const disp = await obterDispositivo();
  const d = db();
  const lote = writeBatch(d);
  lote.set(doc(d, 'trial', emailKeyOf(email)), { email: email, uid: u.uid, deviceId: disp.deviceId, fp: disp.fp, criadoEm: serverTimestamp() });
  lote.set(doc(d, 'trial_devices', disp.deviceId), { uid: u.uid, criadoEm: serverTimestamp() });
  lote.set(doc(d, 'trial_fp', disp.fp), { uid: u.uid, criadoEm: serverTimestamp() });
  try {
    await lote.commit();
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      // Quase sempre: alguém ganhou a corrida (o registro apareceu um instante antes). Descobre qual.
      try {
        if ((await status(email)).estado !== 'nunca-usado') throw erro('pflix/ja-usado', 'e-mail já usado');
        if (await aparelhoJaUsado()) throw erro('pflix/aparelho-usado', 'aparelho já usou o teste');
      } catch (e2) { if (e2 && String(e2.code || '').indexOf('pflix/') === 0) throw e2; }
    }
    throw err;
  }
  return true;
}

window.PipocaTrial = { iniciar, status, aparelhoJaUsado, emailKeyOf, ehGmail, DURACAO_MS };
