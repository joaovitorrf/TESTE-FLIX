/**
 * PIPOCAFLIX — reportar.js
 * Botão "🚩 Reportar problema" nas páginas de filme.html / serie.html.
 *
 * Escreve na MESMA coleção do sistema de suporte (tickets/{id}), com
 * tipo:'conteudo' + os dados do filme/série anexados. Assim o ticket
 * aparece pro admin junto com os outros, em suporte.html, sem precisar
 * de nenhuma coleção nem regra do Firestore nova.
 *
 * Só usuários logados podem reportar — quem não estiver logado é
 * mandado pro login, com redirect de volta pra página atual (mesmo
 * padrão usado em listas.js e nos comentários).
 *
 * Inclua como <script type="module" src="assets/js/reportar.js"></script>
 * DEPOIS do módulo que inicializa o Firebase Auth (initializeApp).
 */
import { getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

function toast(msg) {
  if (typeof window.showToast === 'function') { window.showToast(msg); return; }
  alert(msg);
}

function getDB() {
  const app = getApps()[0];
  if (!app) throw new Error('[PipocaReportar] Firebase app não inicializado nesta página.');
  return getFirestore(app);
}

function getUser() {
  return (window.PipocaAuth && window.PipocaAuth.getUser) ? window.PipocaAuth.getUser() : null;
}

function waitForAuthUser(timeoutMs) {
  timeoutMs = timeoutMs || 6000;
  return new Promise(resolve => {
    const jaLogado = getUser();
    if (jaLogado) { resolve(jaLogado); return; }
    let resolvido = false, decorrido = 0;
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

const MOTIVOS = [
  { v: 'video',    label: '🎥 Vídeo não carrega / trava / dá erro' },
  { v: 'audio',    label: '🔊 Áudio ou legenda errada' },
  { v: 'link',     label: '🔗 Player/link quebrado' },
  { v: 'info',     label: '📝 Informação errada (sinopse, capa, ano...)' },
  { v: 'outro',    label: '❓ Outro problema' },
];

let _modalEl = null;
let _itemAtual = null;

function garantirModal() {
  if (_modalEl) return;

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="pflix-modal-overlay" id="pflixModalReportar">' +
      '<div class="pflix-modal-panel">' +
        '<button class="pflix-modal-close" id="pflixReportClose" aria-label="Fechar">✕</button>' +
        '<div class="pflix-modal-title">🚩 Reportar problema</div>' +
        '<div class="pflix-modal-subtitle" id="pflixReportSubtitle"></div>' +
        '<select class="ticket-tipo-select" id="pflixReportMotivo">' +
          MOTIVOS.map(m => '<option value="' + m.v + '">' + m.label + '</option>').join('') +
        '</select>' +
        '<textarea class="ticket-textarea" id="pflixReportTexto" maxlength="500" placeholder="Descreva o que está acontecendo (se for um episódio específico, diz a temporada/episódio aqui)..."></textarea>' +
        '<div class="ticket-form-footer">' +
          '<span class="ticket-char-count" id="pflixReportCharCount">0/500</span>' +
          '<button class="ticket-submit-btn" id="pflixReportSubmit">📨 Enviar Report</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);

  _modalEl = document.getElementById('pflixModalReportar');

  const fechar = () => _modalEl.classList.remove('open');
  document.getElementById('pflixReportClose').addEventListener('click', fechar);
  _modalEl.addEventListener('click', e => { if (e.target === _modalEl) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

  const textarea = document.getElementById('pflixReportTexto');
  const charCount = document.getElementById('pflixReportCharCount');
  textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length + '/500'; });

  document.getElementById('pflixReportSubmit').addEventListener('click', enviarReport);
}

async function enviarReport() {
  const btn = document.getElementById('pflixReportSubmit');
  const textarea = document.getElementById('pflixReportTexto');
  const motivoSel = document.getElementById('pflixReportMotivo');
  const texto = textarea.value.trim();

  if (!texto) { toast('Descreve o problema antes de enviar 🙂'); textarea.focus(); return; }
  if (!_itemAtual) return;

  const user = getUser();
  if (!user) { toast('Faça login para reportar.'); return; }

  btn.disabled = true;
  const textoOriginalBtn = btn.textContent;
  btn.textContent = 'Enviando...';
  try {
    const db = getDB();
    const motivoObj = MOTIVOS.find(m => m.v === motivoSel.value);
    await addDoc(collection(db, 'tickets'), {
      uid: user.uid,
      email: (user.email || '').toLowerCase(),
      autor: user.displayName || 'Anônimo',
      autorFoto: user.photoURL || '',
      tipo: 'conteudo',
      motivo: motivoSel.value,
      texto: texto,
      status: 'aberto',
      ts: serverTimestamp(),
      ultimaAtividade: serverTimestamp(),
      // Dados do conteúdo reportado — só pra exibição/contexto no painel de suporte.
      conteudoNome: _itemAtual.nome,
      conteudoTipo: _itemAtual.isSerie ? 'serie' : 'filme',
      conteudoUrl: (_itemAtual.isSerie ? 'serie.html' : 'filme.html') + '?nome=' + encodeURIComponent(_itemAtual.nome),
      conteudoMotivoLabel: motivoObj ? motivoObj.label : ''
    });
    textarea.value = '';
    charCountReset();
    _modalEl.classList.remove('open');
    toast('✅ Report enviado! Você pode acompanhar em "Suporte". Valeu por avisar 🙌');
  } catch (e) {
    console.error('[PipocaReportar] Erro ao enviar report:', e);
    toast('⚠️ Não deu pra enviar o report agora. Tenta de novo em instantes.');
  }
  btn.disabled = false;
  btn.textContent = textoOriginalBtn;
}

function charCountReset() {
  const cc = document.getElementById('pflixReportCharCount');
  if (cc) cc.textContent = '0/500';
}

/* ─── Ponto de entrada — chame no clique do botão "Reportar problema" ─── */
async function abrirModal(item) {
  if (!item || !item.nome) return;

  const user = await waitForAuthUser();
  if (!user) {
    window.location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
    return;
  }

  garantirModal();
  _itemAtual = { nome: item.nome, isSerie: !!item.isSerie };

  const subtitle = document.getElementById('pflixReportSubtitle');
  if (subtitle) subtitle.textContent = 'Conte pra gente o que está errado em "' + item.nome + '":';
  document.getElementById('pflixReportTexto').value = '';
  charCountReset();
  document.getElementById('pflixReportMotivo').value = 'video';

  _modalEl.classList.add('open');
  document.getElementById('pflixReportTexto').focus();
}

window.PipocaReportar = { abrirModal };
