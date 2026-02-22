/**
 * PIPOCAFLIX - search.js
 * Busca fuzzy com normalização, debounce e ignorar acentos
 */

(function() {
  'use strict';

  let _allContent = [];
  let _indexed = false;

  /* ─────────────────────────────────────────────
     Normalização de string
  ───────────────────────────────────────────── */
  function norm(s) {
    if (!s) return '';
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ─────────────────────────────────────────────
     Score fuzzy simples
  ───────────────────────────────────────────── */
  function fuzzyScore(text, query) {
    const t = norm(text);
    const q = norm(query);

    if (!t || !q) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.includes(q)) return 75;

    // Verifica se todas as palavras da query estão no texto
    const words = q.split(' ').filter(Boolean);
    if (words.every(w => t.includes(w))) return 60;

    // Verifica se a maioria das palavras está
    const matched = words.filter(w => t.includes(w)).length;
    if (matched > 0) return Math.floor((matched / words.length) * 50);

    // Bigram similarity
    const score = bigramSimilarity(t, q);
    return Math.floor(score * 40);
  }

  function bigrams(s) {
    const pairs = new Set();
    for (let i = 0; i < s.length - 1; i++) pairs.add(s.slice(i, i+2));
    return pairs;
  }

  function bigramSimilarity(a, b) {
    if (a.length < 2 || b.length < 2) return 0;
    const setA = bigrams(a);
    const setB = bigrams(b);
    let inter = 0;
    setA.forEach(bi => { if (setB.has(bi)) inter++; });
    return (2 * inter) / (setA.size + setB.size);
  }

  /* ─────────────────────────────────────────────
     Indexar conteúdo
  ───────────────────────────────────────────── */
  function indexContent(contents) {
    _allContent = contents.map(item => ({
      ...item,
      _searchText: norm([item.nome, item.categoria, item.sinopse, item.ano].join(' '))
    }));
    _indexed = true;
  }

  /* ─────────────────────────────────────────────
     Busca principal
  ───────────────────────────────────────────── */
  function search(query, limit = 24) {
    if (!_indexed || !query || query.trim().length < 2) return [];

    const q = norm(query);

    const scored = _allContent
      .map(item => ({
        item,
        score: fuzzyScore(item._searchText, q)
      }))
      .filter(x => x.score > 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(x => x.item);
  }

  /* ─────────────────────────────────────────────
     Debounce
  ───────────────────────────────────────────── */
  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ─────────────────────────────────────────────
     Expõe
  ───────────────────────────────────────────── */
  window.PipocaSearch = {
    indexContent,
    search,
    debounce,
    norm
  };
})();
