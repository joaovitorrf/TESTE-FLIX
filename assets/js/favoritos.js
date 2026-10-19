/**
 * PIPOCAFLIX — favoritos.js
 * Lista de favoritos do usuário.
 *
 * "Local primeiro": tudo acontece no localStorage (instantâneo, funciona offline). Quando a
 * pessoa está logada, o sync.js espelha isso no Firestore, no documento
 *     users/{uid}/sync/estado  →  { favoritos: { "<chave>": { nome, capa, ..., ts, removido } }, ... }
 * e traz de volta o que mudou em outro aparelho — é isso que faz o ❤️ do celular aparecer no
 * notebook. A API pública continua a de sempre: toggle / has / getAll / count / remove.
 *
 * Precisa de sync-core.js carregado ANTES (se faltar, os favoritos funcionam igual, só
 * que sem sincronizar).
 */

(function () {
  'use strict';

  const LS_KEY = 'pflix_favoritos';
  const TIPO = 'favoritos';
  const Core = window.PflixSyncCore || null;

  const chaveDe = (nome) => (Core ? Core.slug(nome) : String(nome || ''));
  const avisar = () => { if (Core) Core.notificar(TIPO, true); };

  function save(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function load() {
    let a;
    try {
      a = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      if (!Array.isArray(a)) return [];
    } catch (e) { return []; }
    // Favoritos salvos antes do sync não têm "ts". Ganham um valor bem pequeno (1, 2, 3…, o mais
    // recente da lista fica com o maior): suficiente pra subirem pra nuvem uma vez, e qualquer
    // mudança de verdade feita em outro aparelho continua ganhando deles.
    if (a.some(f => f && !f.ts)) {
      a.forEach((f, i) => { if (f && !f.ts) f.ts = a.length - i; });
      save(a);
    }
    return a;
  }

  // ts de uma remoção/inclusão precisa SEMPRE ganhar do estado anterior daquele item, mesmo
  // que o relógio deste aparelho esteja um pouco atrasado em relação ao de outro.
  const tsDepoisDe = (anterior) => Math.max(Date.now(), (+anterior || 0) + 1);

  function toggle(item) {
    const arr = load();
    const idx = arr.findIndex(f => f.nome === item.nome);
    const chave = chaveDe(item.nome);
    if (idx >= 0) {
      const ts = tsDepoisDe(arr[idx].ts);
      arr.splice(idx, 1);
      save(arr);
      if (Core) Core.marcarRemovido(TIPO, chave, ts);
      avisar();
      return false; // removido
    }
    const lapide = Core ? (Core.lerTombs(TIPO)[chave] || 0) : 0;
    arr.unshift({
      nome:      item.nome      || '',
      capa:      item.capa      || '',
      isSerie:   !!item.isSerie,
      categoria: item.categoria || '',
      ano:       item.ano       || '',
      audio:     item.audio     || '',
      sinopse:   item.sinopse   || '',
      ts:        tsDepoisDe(lapide)
    });
    save(arr);
    if (Core) Core.limparRemovido(TIPO, chave);
    avisar();
    return true; // adicionado
  }

  function has(nome) {
    return load().some(f => f.nome === nome);
  }

  function getAll() {
    return load();
  }

  function count() {
    return load().length;
  }

  function remove(nome) {
    const arr = load();
    const idx = arr.findIndex(f => f.nome === nome);
    if (idx < 0) return;
    const ts = tsDepoisDe(arr[idx].ts);
    arr.splice(idx, 1);
    save(arr);
    if (Core) Core.marcarRemovido(TIPO, chaveDe(nome), ts);
    avisar();
  }

  /* ── ponte com o sync.js ───────────────────────────────────────────────── */

  // Tudo que existe aqui (itens vivos + lápides), no formato que vai pro Firestore.
  function exportar() {
    const out = {};
    load().forEach(f => {
      if (!f || !f.nome) return;
      out[chaveDe(f.nome)] = {
        nome: f.nome, capa: f.capa || '', isSerie: !!f.isSerie, categoria: f.categoria || '',
        ano: f.ano || '', audio: f.audio || '',
        sinopse: String(f.sinopse || '').slice(0, 220),   // o documento da nuvem não precisa da sinopse inteira
        ts: +f.ts || 0, removido: false
      };
    });
    const tombs = Core ? Core.lerTombs(TIPO) : {};
    Object.keys(tombs).forEach(k => {
      if (!out[k] || tombs[k] > out[k].ts) out[k] = { removido: true, ts: tombs[k] };
    });
    return out;
  }

  // Junta o que veio da nuvem com o que existe aqui: vale o ts mais recente de cada item.
  // Devolve true se algo mudou neste aparelho (pra página se redesenhar).
  function aplicar(remoto) {
    if (!Core || !remoto) return false;
    const antes = load();
    const porChave = {};
    antes.forEach(f => { if (f && f.nome) porChave[chaveDe(f.nome)] = f; });
    const tombs = Core.lerTombs(TIPO);
    let tombsMudaram = false;

    Object.keys(remoto).forEach(k => {
      const r = remoto[k];
      if (!r || typeof r !== 'object') return;
      const rts = +r.ts || 0;
      const l = porChave[k];
      const lts = l ? (+l.ts || 0) : (tombs[k] || 0);
      if (rts <= lts) return;                       // o que existe aqui é igual ou mais novo
      if (r.removido) {
        delete porChave[k];
        tombs[k] = rts; tombsMudaram = true;
      } else if (r.nome) {
        porChave[k] = {
          nome: r.nome, capa: r.capa || '', isSerie: !!r.isSerie, categoria: r.categoria || '',
          ano: r.ano || '', audio: r.audio || '', sinopse: r.sinopse || '', ts: rts
        };
        if (tombs[k] != null) { delete tombs[k]; tombsMudaram = true; }
      }
    });

    const depois = Object.keys(porChave).map(k => porChave[k]).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const mudou = JSON.stringify(depois) !== JSON.stringify(antes);
    if (mudou) save(depois);
    if (tombsMudaram) Core.gravarTombs(TIPO, tombs);
    return mudou;
  }

  window.PipocaFavoritos = { toggle, has, getAll, count, remove };
  Object.defineProperty(window.PipocaFavoritos, '__sync', { value: { tipo: TIPO, exportar, aplicar }, enumerable: false });

  // Quando chega mudança de outro aparelho, atualiza os ❤️ que já estão desenhados na tela.
  window.addEventListener('pflix:sync', (e) => {
    if (!e.detail || e.detail.tipo !== TIPO) return;
    document.querySelectorAll('.card-fav-btn[data-nome]').forEach(btn => {
      const on = has(btn.getAttribute('data-nome'));
      btn.classList.toggle('active', on);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
    });
  });
})();
