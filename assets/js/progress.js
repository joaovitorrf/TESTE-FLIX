/**
 * PIPOCAFLIX — progress.js
 * "Continuar assistindo" — window.PipocaProgress, disponível em todas as páginas.
 *
 * O QUE É GUARDADO
 *   • Os players do site são embeds de terceiros (iframe): o site não tem como saber em que
 *     minuto a pessoa parou. Então o "continuar assistindo" guarda o ÚLTIMO TÍTULO que ela abriu
 *     e, nas séries, o ÚLTIMO EPISÓDIO — é o marcarInicio(), chamado quando o player abre.
 *     Esses registros têm origem:'embed', não mostram barra de progresso e expiram em 30 dias.
 *   • Se um dia voltar um player próprio (<video>), o save() guarda o minuto exato, como sempre
 *     guardou (registro normal, com pct) — e esse registro convive com o resto.
 *   • Quer desligar o "último aberto"? Troque MARCAR_INICIO por false aqui embaixo: volta a
 *     aparecer só o que tiver minuto salvo por um player próprio.
 *
 * SINCRONIZAÇÃO ENTRE APARELHOS
 *   "Local primeiro" (localStorage) + espelho no Firestore feito pelo sync.js, no documento
 *   users/{uid}/sync/estado → continuar. Cada card de "Continuar assistindo" (uma série inteira
 *   ou um filme) é um item com "ts"; remover vira uma "lápide" pra não ressuscitar (ver
 *   sync-core.js). Se sync-core.js não estiver carregado, tudo funciona igual, sem sincronizar.
 *
 * ANTES: este objeto só existia dentro do index.html, então marcar um título como assistido em
 * filme.html/serie.html não limpava o progresso e o item continuava na Home.
 */
window.PipocaProgress = (function () {
  'use strict';

  const MARCAR_INICIO = true;
  const PREFIX = 'pflix_progress_';
  const TIPO = 'continuar';
  const EMBED_VALIDADE_MS = 30 * 24 * 3600 * 1000;  // "último aberto" some depois de 30 dias
  const MAX_GRUPOS = 40;                            // quantos cards guardar/sincronizar
  const Core = window.PflixSyncCore || null;

  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '_');
  const _key = (titulo) => PREFIX + norm(titulo);
  const avisar = (urgente) => { if (Core) Core.notificar(TIPO, !!urgente); };
  const tsDepoisDe = (anterior) => Math.max(Date.now(), (+anterior || 0) + 1);

  function ler(k) {
    try { const v = JSON.parse(localStorage.getItem(k)); return (v && typeof v === 'object') ? v : null; }
    catch (e) { return null; }
  }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function apagar(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // Todos os registros de progresso guardados aqui: [{ k: chaveNoLocalStorage, v: registro }]
  function todas() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(PREFIX) !== 0) continue;
      const v = ler(k);
      if (v && v.titulo) out.push({ k, v });
    }
    return out;
  }

  // "Grupo" = o que aparece como UM card em "Continuar assistindo": uma série inteira (qualquer
  // episódio dela) ou um filme.
  function grupoDe(v) {
    if (v.tipo === 'serie') return 'serie:' + (v.serieNome || v.titulo);
    return 'filme:' + v.titulo;
  }
  const chaveSync = (grupo) => (Core ? Core.slug(grupo) : grupo);

  const embedExpirado = (v, agora) => v.origem === 'embed' && (agora - (+v.ts || 0)) > EMBED_VALIDADE_MS;

  // Maior ts que já existiu pra esse grupo (registros daqui + lápide): o novo ts tem que passar dele.
  function tsNovo(grupo, lista) {
    let base = Core ? (Core.lerTombs(TIPO)[chaveSync(grupo)] || 0) : 0;
    (lista || todas()).forEach(x => {
      if (grupoDe(x.v) === grupo && (+x.v.ts || 0) > base) base = +x.v.ts;
    });
    return tsDepoisDe(base);
  }

  // Tira o que expirou e mantém só os MAX_GRUPOS cards mais recentes (sem lápide: é limpeza,
  // não uma decisão da pessoa — os outros aparelhos expiram/limitam por conta própria).
  function podar() {
    const agora = Date.now();
    const porGrupo = {};
    todas().forEach(x => {
      if (embedExpirado(x.v, agora)) { apagar(x.k); return; }
      const g = grupoDe(x.v);
      (porGrupo[g] = porGrupo[g] || []).push(x);
    });
    const grupos = Object.keys(porGrupo).map(g => ({
      itens: porGrupo[g],
      ts: Math.max.apply(null, porGrupo[g].map(x => +x.v.ts || 0))
    })).sort((a, b) => b.ts - a.ts);
    grupos.slice(MAX_GRUPOS).forEach(gr => gr.itens.forEach(x => apagar(x.k)));
  }

  /* ── API pública (a de sempre + marcarInicio) ─────────────────────────────── */

  // Player próprio (<video>): guarda o minuto exato.
  function save(titulo, currentTime, duration, capa, tipo, serieNome) {
    if (!titulo || !duration) return;
    const pct = currentTime / duration;
    if (pct >= 0.95) { remove(titulo); return; }
    if (currentTime < 10) return;
    const reg = {
      titulo, currentTime, duration, pct, capa: capa || '', tipo: tipo || 'filme',
      serieNome: serieNome || '', ts: 0
    };
    const grupo = grupoDe(reg);
    reg.ts = tsNovo(grupo);
    gravar(_key(titulo), reg);
    if (Core) Core.limparRemovido(TIPO, chaveSync(grupo));
    avisar(false);
  }

  // Player embedado (iframe): registra "a pessoa abriu este título/episódio".
  //   info = { titulo, capa, tipo: 'filme' | 'serie', serieNome }   (serieNome só pra série)
  function marcarInicio(info) {
    if (!MARCAR_INICIO || !info || !info.titulo) return;
    const tipo = info.tipo === 'serie' ? 'serie' : 'filme';
    const serieNome = tipo === 'serie' ? String(info.serieNome || '') : '';
    if (tipo === 'serie' && !serieNome) return;
    const titulo = String(info.titulo);
    const base = { titulo, capa: info.capa || '', tipo, serieNome };
    const grupo = grupoDe(base);
    const k = _key(titulo);
    const lista = todas();
    const doGrupo = lista.filter(x => grupoDe(x.v) === grupo);
    const atual = doGrupo.find(x => x.k === k);
    const ts = tsNovo(grupo, lista);

    let reg;
    if (atual && atual.v.origem !== 'embed' && atual.v.duration && atual.v.pct < 0.95) {
      reg = Object.assign({}, atual.v, { capa: base.capa || atual.v.capa, ts });   // já tem minuto salvo: só "renova"
    } else {
      reg = { titulo, currentTime: 0, duration: 0, pct: 0, capa: base.capa, tipo, serieNome, origem: 'embed', ts };
    }
    doGrupo.forEach(x => { if (x.k !== k) apagar(x.k); });   // um card por série: o episódio mais novo vale
    gravar(k, reg);
    if (Core) Core.limparRemovido(TIPO, chaveSync(grupo));
    podar();
    avisar(true);
  }

  function get(titulo) {
    const v = ler(_key(titulo));
    // "último aberto" não tem minuto pra retomar: devolve null pra nenhum player tentar usar.
    if (!v || v.origem === 'embed') return null;
    return v;
  }

  function getAll() {
    const agora = Date.now();
    const out = [];
    todas().forEach(x => {
      if (embedExpirado(x.v, agora)) { apagar(x.k); return; }
      if (x.v.origem === 'embed' || x.v.pct < 0.95) out.push(x.v);
    });
    return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  function remove(titulo) {
    const k = _key(titulo);
    const v = ler(k);
    apagar(k);
    if (!v || !v.titulo) return;
    // Se não sobrou nenhum outro episódio/registro do mesmo card, o card inteiro vira lápide.
    const g = grupoDe(v);
    if (todas().some(x => grupoDe(x.v) === g)) return;
    if (Core) Core.marcarRemovido(TIPO, chaveSync(g), tsDepoisDe(+v.ts));
    avisar(true);
  }

  // Remove TUDO que se refere a um título: o filme, a série e qualquer episódio dela (que usa o
  // nome do episódio, não o da série). "tipo" ('filme' | 'serie') é opcional e evita mexer num
  // título de outro tipo com o mesmo nome. Casa pelo nome inteiro — antes casava pelos 15
  // primeiros caracteres, o que apagava junto "Harry Potter e a Pedra…" e "Harry Potter e o Cálice…".
  function removeAllFor(titulo, tipo) {
    if (!titulo) return;
    const alvos = [norm(titulo)];
    try { const d = decodeURIComponent(titulo); if (d !== titulo) alvos.push(norm(d)); } catch (e) {}
    const ehAlvo = (s) => alvos.indexOf(norm(s)) >= 0;
    const comecaCom = (s) => alvos.some(a => norm(s).indexOf(a + '_') === 0);

    const grupos = {};   // grupo → maior ts que existia
    todas().forEach(x => {
      const v = x.v;
      const t = v.tipo === 'serie' ? 'serie' : 'filme';
      if (tipo && t !== tipo) return;
      const bate = ehAlvo(v.titulo) || (v.serieNome && ehAlvo(v.serieNome)) || (t === 'serie' && !v.serieNome && comecaCom(v.titulo));
      if (!bate) return;
      const g = grupoDe(v);
      grupos[g] = Math.max(grupos[g] || 0, +v.ts || 0);
      apagar(x.k);
    });
    // Lápide mesmo sem nada guardado aqui: pode existir um registro desse título na nuvem,
    // vindo de outro aparelho, e "marcar como assistido" tem que limpar ele também.
    (tipo ? [tipo] : ['filme', 'serie']).forEach(t => { const g = t + ':' + titulo; if (!(g in grupos)) grupos[g] = 0; });
    if (Core) Object.keys(grupos).forEach(g => Core.marcarRemovido(TIPO, chaveSync(g), tsDepoisDe(grupos[g])));
    avisar(true);
  }

  function clear() {
    const grupos = {};
    todas().forEach(x => {
      const g = grupoDe(x.v);
      grupos[g] = Math.max(grupos[g] || 0, +x.v.ts || 0);
      apagar(x.k);
    });
    if (Core) Object.keys(grupos).forEach(g => Core.marcarRemovido(TIPO, chaveSync(g), tsDepoisDe(grupos[g])));
    avisar(true);
  }

  /* ── ponte com o sync.js ───────────────────────────────────────────────── */

  // Tudo que existe aqui (um item por card + lápides), no formato que vai pro Firestore.
  function exportar() {
    const agora = Date.now();
    const melhor = {};   // chave do card → { v, ts }
    todas().forEach(x => {
      const v = x.v;
      if (embedExpirado(v, agora)) return;
      if (v.origem !== 'embed' && !(v.pct < 0.95)) return;
      const c = chaveSync(grupoDe(v));
      const ts = +v.ts || 0;
      if (!melhor[c] || ts > melhor[c].ts) melhor[c] = { v, ts };
    });
    const out = {};
    Object.keys(melhor).sort((a, b) => melhor[b].ts - melhor[a].ts).slice(0, MAX_GRUPOS).forEach(c => {
      const v = melhor[c].v;
      const o = {
        titulo: v.titulo, capa: v.capa || '', tipo: v.tipo === 'serie' ? 'serie' : 'filme',
        serieNome: v.serieNome || '', pct: +v.pct || 0, ts: melhor[c].ts || 1, removido: false
      };
      if (v.origem === 'embed') o.origem = 'embed';
      else { o.currentTime = Math.round(+v.currentTime || 0); o.duration = Math.round(+v.duration || 0); }
      out[c] = o;
    });
    const tombs = Core ? Core.lerTombs(TIPO) : {};
    Object.keys(tombs).forEach(c => {
      if (!out[c] || tombs[c] > out[c].ts) out[c] = { removido: true, ts: tombs[c] };
    });
    return out;
  }

  // Junta o que veio da nuvem com o que existe aqui: vale o ts mais recente de cada card.
  // Devolve true se algo mudou neste aparelho (a página então se redesenha).
  function aplicar(remoto) {
    if (!Core || !remoto) return false;
    const agora = Date.now();
    const tombs = Core.lerTombs(TIPO);
    let tombsMudaram = false, mudou = false;

    const locais = {};   // chave do card → registros daqui
    todas().forEach(x => { const c = chaveSync(grupoDe(x.v)); (locais[c] = locais[c] || []).push(x); });

    // Se a nuvem tiver mais cards do que o limite, ignora os mais antigos (senão eles seriam
    // importados e podados a cada sincronização).
    const tsVivos = Object.keys(remoto).filter(c => remoto[c] && !remoto[c].removido)
      .map(c => +remoto[c].ts || 0).sort((a, b) => b - a);
    const corte = tsVivos.length > MAX_GRUPOS ? tsVivos[MAX_GRUPOS - 1] : 0;

    Object.keys(remoto).forEach(c => {
      const r = remoto[c];
      if (!r || typeof r !== 'object') return;
      const rts = +r.ts || 0;
      const daqui = locais[c] || [];
      const lts = daqui.length ? Math.max.apply(null, daqui.map(x => +x.v.ts || 0)) : (tombs[c] || 0);
      if (rts <= lts) return;                       // o que existe aqui é igual ou mais novo

      if (r.removido) {
        daqui.forEach(x => apagar(x.k));
        delete locais[c];
        tombs[c] = rts; tombsMudaram = true;
        if (daqui.length) mudou = true;
        return;
      }
      if (!r.titulo || rts < corte) return;
      const reg = {
        titulo: String(r.titulo), currentTime: +r.currentTime || 0, duration: +r.duration || 0,
        pct: +r.pct || 0, capa: r.capa || '', tipo: r.tipo === 'serie' ? 'serie' : 'filme',
        serieNome: r.serieNome || '', ts: rts
      };
      if (r.origem === 'embed') reg.origem = 'embed';
      if (embedExpirado(reg, agora)) return;                     // velho demais
      if (reg.origem !== 'embed' && !(reg.pct < 0.95)) return;   // já terminou
      daqui.forEach(x => apagar(x.k));
      const k = _key(reg.titulo);
      gravar(k, reg);
      locais[c] = [{ k, v: reg }];
      if (tombs[c] != null) { delete tombs[c]; tombsMudaram = true; }
      mudou = true;
    });

    if (tombsMudaram) Core.gravarTombs(TIPO, tombs);
    if (mudou) podar();
    return mudou;
  }

  // O sync.js usa isso pra também apagar da nuvem os "últimos abertos" que já expiraram.
  const expirado = (r) => !!r && !r.removido && embedExpirado(r, Date.now());

  const api = { save, marcarInicio, get, getAll, remove, removeAllFor, clear };
  Object.defineProperty(api, '__sync', { value: { tipo: TIPO, exportar, aplicar, expirado }, enumerable: false });
  return api;
})();
