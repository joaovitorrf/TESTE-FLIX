/**
 * PIPOCAFLIX — search.js v2.0
 * Busca aprimorada: peso por campo, iniciais, ano, áudio, match exato primeiro
 */

(function () {
  'use strict';

  let _allContent = [];
  let _indexed    = false;

  /* ── Normalização ── */
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

  /* ── Iniciais de palavras: "cobra kai" → "ck" ── */
  function initials(s) {
    return norm(s).split(' ').filter(Boolean).map(w => w[0]).join('');
  }

  /* ── Bigrams ── */
  function bigrams(s) {
    const pairs = new Set();
    for (let i = 0; i < s.length - 1; i++) pairs.add(s.slice(i, i + 2));
    return pairs;
  }
  function bigramSim(a, b) {
    if (a.length < 2 || b.length < 2) return 0;
    const sA = bigrams(a), sB = bigrams(b);
    let inter = 0;
    sA.forEach(bi => { if (sB.has(bi)) inter++; });
    return (2 * inter) / (sA.size + sB.size);
  }

  /* ── Score por campo (pesos distintos) ── */
  function scoreField(text, q, weight) {
    const t = norm(text);
    if (!t || !q) return 0;
    if (t === q)          return 100 * weight;
    if (t.startsWith(q)) return  90 * weight;
    if (t.includes(q))   return  75 * weight;
    const words = q.split(' ').filter(Boolean);
    if (words.length > 1 && words.every(w => t.includes(w))) return 60 * weight;
    const matched = words.filter(w => t.includes(w)).length;
    if (matched > 0) return Math.floor((matched / words.length) * 50) * weight;
    return Math.floor(bigramSim(t, q) * 40) * weight;
  }

  /* ── Score total para um item ── */
  function totalScore(item, q) {
    const qn = norm(q);

    // Busca por ano (ex: "2023")
    if (/^\d{4}$/.test(qn)) {
      return norm(item.ano) === qn ? 80 : 0;
    }

    // Busca por áudio ("dublado", "legendado", "dub", "leg")
    const audioAliases = { dub: 'dublado', leg: 'legendado' };
    const qAudio = audioAliases[qn] || qn;
    if (['dublado', 'legendado'].includes(qAudio)) {
      return norm(item.audio).includes(qAudio) ? 80 : 0;
    }

    let score = 0;

    // Nome: peso 3x
    score += scoreField(item.nome, qn, 3);

    // Iniciais do nome: "ck" → "Cobra Kai"
    const ini = initials(item.nome);
    if (ini && ini === qn) score += 85;
    else if (ini && ini.startsWith(qn) && qn.length >= 2) score += 50;

    // Categoria: peso 1.5x
    score += scoreField(item.categoria, qn, 1.5);

    // Sinopse: peso 0.5x (fuzzy leve)
    score += scoreField((item.sinopse || '').slice(0, 200), qn, 0.5);

    // Tipo (filme/série)
    if (qn === 'filme' && !item.isSerie)   score += 30;
    if (qn === 'serie' && item.isSerie)    score += 30;
    if (qn === 'series' && item.isSerie)   score += 30;
    if (qn === 'filmes' && !item.isSerie)  score += 30;

    return score;
  }

  /* ── Indexar ── */
  function indexContent(contents) {
    _allContent = contents.map(item => ({ ...item }));
    _indexed = true;
  }

  /* ── Busca principal ── */
  function search(query, limit = 24) {
    if (!_indexed || !query || query.trim().length < 2) return [];
    const q = query.trim();

    const scored = _allContent
      .map(item => ({ item, score: totalScore(item, q) }))
      .filter(x => x.score > 10)
      .sort((a, b) => {
        // Match exato no nome primeiro
        const aNome = norm(a.item.nome);
        const bNome = norm(b.item.nome);
        const qn    = norm(q);
        const aExact = aNome === qn ? 1 : aNome.startsWith(qn) ? 0.5 : 0;
        const bExact = bNome === qn ? 1 : bNome.startsWith(qn) ? 0.5 : 0;
        if (bExact !== aExact) return bExact - aExact;
        return b.score - a.score;
      })
      .slice(0, limit);

    return scored.map(x => x.item);
  }

  /* ── Debounce ── */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  window.PipocaSearch = { indexContent, search, debounce, norm };
})();
