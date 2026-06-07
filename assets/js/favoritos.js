/**
 * PIPOCAFLIX — favoritos.js
 * Gerencia a lista de favoritos do usuário via localStorage
 */

(function () {
  'use strict';

  const LS_KEY = 'pflix_favoritos';

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  function save(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
  }

  function toggle(item) {
    const arr = load();
    const idx = arr.findIndex(f => f.nome === item.nome);
    if (idx >= 0) {
      arr.splice(idx, 1);
      save(arr);
      return false; // removido
    } else {
      arr.unshift({
        nome:      item.nome      || '',
        capa:      item.capa      || '',
        isSerie:   !!item.isSerie,
        categoria: item.categoria || '',
        ano:       item.ano       || '',
        audio:     item.audio     || '',
        sinopse:   item.sinopse   || '',
        ts:        Date.now()
      });
      save(arr);
      return true; // adicionado
    }
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
    const arr = load().filter(f => f.nome !== nome);
    save(arr);
  }

  window.PipocaFavoritos = { toggle, has, getAll, count, remove };
})();
