/**
 * PIPOCAFLIX — episodios-vistos.js
 * Marcar episódios de série como "já vi" / "ainda não vi".
 *
 * Mesmo esquema do watched.js e do favoritos.js: "local primeiro" (localStorage, instantâneo,
 * funciona sem login) e, quando a pessoa está logada, o sync.js espelha no Firestore
 * (users/{uid}/sync/estado → epvistos) pra marcação aparecer igual no celular e no notebook.
 *
 * COMO OS DADOS SÃO GUARDADOS
 *   Um registro POR SÉRIE (e não um por episódio) — fica pequeno mesmo com 500 episódios:
 *     { "<slug da série>": { nome: "La Casa de Papel", eps: ["1x1","1x2","2x5"], ts: 1731372000000 } }
 *   "1x2" = temporada 1, episódio 2.
 *
 * API pública (window.PipocaEpVistos):
 *     has(serie, temporada, episodio)           → true/false
 *     set(serie, temporada, episodio, visto)    → marca/desmarca um
 *     toggle(serie, temporada, episodio)        → inverte e devolve o novo estado
 *     setVarios(serie, [{t,e}, …], visto)       → marca/desmarca vários de uma vez (ex.: temporada inteira)
 *     contar(serie, [{t,e}, …])                 → quantos dos episódios dados estão vistos
 *     todos(serie)                              → array com todas as chaves "TxE" vistas
 *     limpar(serie)                             → desmarca tudo daquela série
 *
 * Precisa do sync-core.js carregado ANTES (se faltar, funciona igual, só que sem sincronizar).
 */
(function () {
  'use strict';

  var KEY = 'pflix_ep_vistos';
  var TIPO = 'epvistos';
  var MAX_SERIES = 400;
  var Core = window.PflixSyncCore || null;

  function chaveDe(nome) { return Core ? Core.slug(nome) : String(nome || '').toLowerCase(); }
  function epKey(t, e) { return (parseInt(t, 10) || 1) + 'x' + (parseInt(e, 10) || 1); }
  function avisar() { if (Core) Core.notificar(TIPO, true); }
  function tsDepoisDe(anterior) { return Math.max(Date.now(), (+anterior || 0) + 1); }

  function ler() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function gravar(o) {
    // Se passar do limite, descarta as séries mexidas há mais tempo.
    var ks = Object.keys(o);
    if (ks.length > MAX_SERIES) {
      ks.sort(function (a, b) { return (o[b].ts || 0) - (o[a].ts || 0); });
      var novo = {};
      ks.slice(0, MAX_SERIES).forEach(function (k) { novo[k] = o[k]; });
      o = novo;
    }
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function registro(o, serie) {
    var k = chaveDe(serie);
    if (!o[k]) o[k] = { nome: serie, eps: [], ts: 0 };
    return o[k];
  }

  function has(serie, t, e) {
    var r = ler()[chaveDe(serie)];
    return !!(r && r.eps && r.eps.indexOf(epKey(t, e)) !== -1);
  }

  function set(serie, t, e, visto) {
    return setVarios(serie, [{ t: t, e: e }], visto);
  }

  function setVarios(serie, lista, visto) {
    if (!serie || !lista || !lista.length) return false;
    var o = ler();
    var r = registro(o, serie);
    var conj = {};
    (r.eps || []).forEach(function (x) { conj[x] = 1; });
    var mudou = false;
    lista.forEach(function (it) {
      var k = epKey(it.t, it.e);
      if (visto && !conj[k]) { conj[k] = 1; mudou = true; }
      if (!visto && conj[k]) { delete conj[k]; mudou = true; }
    });
    if (!mudou) return false;
    r.eps = Object.keys(conj).sort(function (a, b) {
      var pa = a.split('x'), pb = b.split('x');
      return (pa[0] - pb[0]) || (pa[1] - pb[1]);
    });
    r.nome = serie;
    r.ts = tsDepoisDe(r.ts);
    gravar(o);
    avisar();
    return true;
  }

  function toggle(serie, t, e) {
    var novo = !has(serie, t, e);
    set(serie, t, e, novo);
    return novo;
  }

  function contar(serie, lista) {
    var r = ler()[chaveDe(serie)];
    if (!r || !r.eps || !lista) return 0;
    var conj = {};
    r.eps.forEach(function (x) { conj[x] = 1; });
    var n = 0;
    lista.forEach(function (it) { if (conj[epKey(it.t, it.e)]) n++; });
    return n;
  }

  function todos(serie) {
    var r = ler()[chaveDe(serie)];
    return (r && r.eps) ? r.eps.slice() : [];
  }

  function limpar(serie) {
    var o = ler(), k = chaveDe(serie);
    if (!o[k] || !o[k].eps.length) return;
    o[k].eps = [];
    o[k].ts = tsDepoisDe(o[k].ts);
    gravar(o);
    avisar();
  }

  /* ── ponte com o sync.js ───────────────────────────────────────────────── */

  function exportar() {
    var o = ler(), out = {};
    Object.keys(o).forEach(function (k) {
      var r = o[k];
      if (!r || !r.nome) return;
      out[k] = { nome: r.nome, eps: (r.eps || []).slice(), ts: +r.ts || 1 };
    });
    return out;
  }

  // Vale o ts mais recente de cada série. Devolve true se algo mudou neste aparelho.
  function aplicar(remoto) {
    if (!remoto) return false;
    var o = ler(), mudou = false;
    Object.keys(remoto).forEach(function (k) {
      var r = remoto[k];
      if (!r || typeof r !== 'object' || !r.nome) return;
      var rts = +r.ts || 0;
      var l = o[k];
      if (l && (+l.ts || 0) >= rts) return;          // o daqui é igual ou mais novo
      var eps = Array.isArray(r.eps) ? r.eps.filter(function (x) { return /^\d+x\d+$/.test(x); }) : [];
      o[k] = { nome: String(r.nome), eps: eps, ts: rts };
      mudou = true;
    });
    if (mudou) gravar(o);
    return mudou;
  }

  window.PipocaEpVistos = {
    has: has, set: set, toggle: toggle, setVarios: setVarios,
    contar: contar, todos: todos, limpar: limpar
  };
  Object.defineProperty(window.PipocaEpVistos, '__sync', {
    value: { tipo: TIPO, exportar: exportar, aplicar: aplicar },
    enumerable: false
  });
})();
