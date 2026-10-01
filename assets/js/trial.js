/**
 * PIPOCAFLIX — trial.js
 * Teste grátis de 3 horas (um e-mail só pode usar uma vez).
 *
 * Firestore:  trial/{emailKey}  →  { email, criadoEm: serverTimestamp() }
 * Depois de criado o documento NUNCA MAIS pode ser reescrito (ver firestore.rules:
 * "allow update: if false"), e é exatamente isso que impede o mesmo e-mail de usar
 * o teste de novo — não tem nenhum campo "usado:true" separado, a própria existência
 * do documento (pra sempre) já é a marca de "já usou".
 *
 * As 3 horas são contadas no navegador (agora − criadoEm), nunca gravadas como um
 * campo "expiraEm" — assim ninguém consegue inventar uma validade maior escrevendo
 * direto no Firestore.
 *
 * Usado por: teste-gratis.html (criar) e acesso-vip.js (conferir, via Firestore REST
 * direto — não importa este módulo, pra não precisar carregar o SDK inteiro só pra ler).
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const DURACAO_MS = 3 * 60 * 60 * 1000; // 3 horas
const LS_KEY = 'pflix_trial_email';

function db() {
  const app = getApps()[0];
  if (!app) throw new Error('Firebase ainda não iniciou');
  return getFirestore(app);
}

function emailKeyOf(email) {
  return String(email || '').trim().toLowerCase().replace(/[.#$[\]]/g, '_');
}

function validarEmail(email) {
  return /^[^@\s]+@[^@\s]+[.][^@\s]+$/.test(String(email || '').trim());
}

// status(email) → { estado: 'nunca-usado' | 'ativo' | 'expirado', restanteMs? }
async function status(email) {
  const snap = await getDoc(doc(db(), 'trial', emailKeyOf(email)));
  if (!snap.exists()) return { estado: 'nunca-usado' };
  const d = snap.data();
  const criado = d.criadoEm && typeof d.criadoEm.toMillis === 'function' ? d.criadoEm.toMillis() : 0;
  const restante = DURACAO_MS - (Date.now() - criado);
  return restante > 0 ? { estado: 'ativo', restanteMs: restante } : { estado: 'expirado' };
}

// iniciar(email) → cria o registro (só funciona se nunca existiu — ver regras).
// Lança erro com .code = 'pflix/ja-usado' se esse e-mail já tiver usado antes.
async function iniciar(email) {
  const limpo = String(email || '').trim().toLowerCase();
  if (!validarEmail(limpo)) { const e = new Error('e-mail inválido'); e.code = 'pflix/email-invalido'; throw e; }

  const atual = await status(limpo);
  if (atual.estado !== 'nunca-usado') {
    const e = new Error('e-mail já usado'); e.code = 'pflix/ja-usado'; e.detalhe = atual; throw e;
  }
  try {
    await setDoc(doc(db(), 'trial', emailKeyOf(limpo)), { email: limpo, criadoEm: serverTimestamp() });
  } catch (err) {
    if (err && err.code === 'permission-denied') {
      // Alguém ganhou a corrida (criou o doc um instante antes) — trata como "já usado", não como erro.
      const e = new Error('e-mail já usado'); e.code = 'pflix/ja-usado'; throw e;
    }
    throw err;
  }
  try { localStorage.setItem(LS_KEY, limpo); } catch (e) {}
  return true;
}

function emailLocal() {
  try { return localStorage.getItem(LS_KEY); } catch (e) { return null; }
}

window.PipocaTrial = { iniciar, status, emailKeyOf, validarEmail, emailLocal, DURACAO_MS };
