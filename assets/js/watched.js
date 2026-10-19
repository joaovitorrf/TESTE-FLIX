/**
 * PIPOCAFLIX — watched.js
 * Lista de "Assistidos" (filmes/séries que a pessoa marcou como vistos).
 *
 * Mesma ideia do favoritos.js: "local primeiro" (localStorage, instantâneo) e, quando a pessoa
 * está logada, o sync.js espelha no Firestore (users/{uid}/sync/estado → assistidos) pra lista
 * aparecer igual no celular e no notebook. A API pública continua a de sempre:
 *     add(item) / remove(nome) / has(nome) / getAll() / clear()
 *
 * Precisa de sync-core.js carregado ANTES (se faltar, funciona igual, só que sem sincronizar).
 */
(function () {
  'use strict';

  var KEY = 'pflix_watched_list';
  var TIPO = 'assistidos';
  var MAX = 500;
  var Core = window.PflixSyncCore || null;

  function chaveDe(nome) { return Core ? Core.slug(nome) : String(nome || ''); }
  function avisar() { if (Core) Core.notificar(TIPO, true); }
  // O ts de uma remoção/inclusão sempre ganha do estado anterior daquele item, mesmo que o
  // relógio deste aparelho esteja um pouco atrasado em relação ao de outro.
  function tsDepoisDe(anterior) { return Math.max(Date.now(), (+anterior || 0) + 1); }

  function save(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX))); } catch (e) {} }

  function getAll() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function add(item) {
    if (!item || !item.nome) return;
    var chave = chaveDe(item.nome);
    var lapide = Core ? (Core.lerTombs(TIPO)[chave] || 0) : 0;
    var anterior = 0;
    var a = getAll().filter(function (i) {
      if (i.nome === item.nome) { anterior = +i.ts || 0; return false; }
      return true;
    });
    a.unshift({
      nome: item.nome,
      capa: item.capa || '',
      tipo: item.tipo === 'serie' ? 'serie' : 'filme',
      ts: tsDepoisDe(Math.max(lapide, anterior))
    });
    save(a);
    if (Core) Core.limparRemovido(TIPO, chave);
    avisar();
  }

  function remove(nome) {
    var anterior = 0, achou = false;
    var a = getAll().filter(function (i) {
      if (i.nome === nome) { anterior = +i.ts || 0; achou = true; return false; }
      return true;
    });
    if (!achou) return;
    save(a);
    if (Core) Core.marcarRemovido(TIPO, chaveDe(nome), tsDepoisDe(anterior));
    avisar();
  }

  function has(nome) { return getAll().some(function (i) { return i.nome === nome; }); }

  // "Limpar todos": cada item vira lápide — assim os outros aparelhos também esvaziam a lista.
  function clear() {
    var agora = Date.now();
    if (Core) {
      var t = Core.lerTombs(TIPO);
      getAll().forEach(function (i) {
        if (i && i.nome) t[chaveDe(i.nome)] = Math.max(agora, (+i.ts || 0) + 1);
      });
      Core.gravarTombs(TIPO, t);
    }
    try { localStorage.removeItem(KEY); } catch (e) {}
    avisar();
  }

  /* ── ponte com o sync.js ───────────────────────────────────────────────── */

  // Tudo que existe aqui (itens vivos + lápides), no formato que vai pro Firestore.
  function exportar() {
    var out = {};
    getAll().forEach(function (i) {
      if (!i || !i.nome) return;
      out[chaveDe(i.nome)] = {
        nome: i.nome, capa: i.capa || '', tipo: i.tipo === 'serie' ? 'serie' : 'filme',
        ts: +i.ts || 1, removido: false
      };
    });
    var tombs = Core ? Core.lerTombs(TIPO) : {};
    Object.keys(tombs).forEach(function (k) {
      if (!out[k] || tombs[k] > out[k].ts) out[k] = { removido: true, ts: tombs[k] };
    });
    return out;
  }

  // Junta o que veio da nuvem com o que existe aqui: vale o ts mais recente de cada item.
  // Devolve true se algo mudou neste aparelho (a página então se redesenha).
  function aplicar(remoto) {
    if (!Core || !remoto) return false;
    var antes = getAll();
    var porChave = {};
    antes.forEach(function (i) { if (i && i.nome) porChave[chaveDe(i.nome)] = i; });
    var tombs = Core.lerTombs(TIPO);
    var tombsMudaram = false;

    Object.keys(remoto).forEach(function (k) {
      var r = remoto[k];
      if (!r || typeof r !== 'object') return;
      var rts = +r.ts || 0;
      var l = porChave[k];
      var lts = l ? (+l.ts || 0) : (tombs[k] || 0);
      if (rts <= lts) return;                       // o que existe aqui é igual ou mais novo
      if (r.removido) {
        delete porChave[k];
        tombs[k] = rts; tombsMudaram = true;
      } else if (r.nome) {
        porChave[k] = { nome: r.nome, capa: r.capa || '', tipo: r.tipo === 'serie' ? 'serie' : 'filme', ts: rts };
        if (tombs[k] != null) { delete tombs[k]; tombsMudaram = true; }
      }
    });

    var depois = Object.keys(porChave).map(function (k) { return porChave[k]; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, MAX);
    var mudou = JSON.stringify(depois) !== JSON.stringify(antes);
    if (mudou) save(depois);
    if (tombsMudaram) Core.gravarTombs(TIPO, tombs);
    return mudou;
  }

  window.PipocaWatched = { add: add, remove: remove, has: has, getAll: getAll, clear: clear };
  Object.defineProperty(window.PipocaWatched, '__sync', { value: { tipo: TIPO, exportar: exportar, aplicar: aplicar }, enumerable: false });
})();
