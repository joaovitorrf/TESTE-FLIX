/**
 * PIPOCAFLIX — progress.js
 * Módulo global de progresso de reprodução (Continuar Assistindo).
 * Antes esse objeto só existia dentro do index.html, então marcar um
 * título como assistido em filme.html/serie.html não limpava o progresso
 * salvo e o item continuava aparecendo em "Continuar Assistindo" na Home.
 * Agora window.PipocaProgress fica disponível em todas as páginas.
 */
window.PipocaProgress = (function () {
  'use strict';
  const PREFIX = 'pflix_progress_';

  function _key(titulo) {
    return PREFIX + (titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  }

  function save(titulo, currentTime, duration, capa, tipo, serieNome) {
    if (!titulo || !duration) return;
    const pct = currentTime / duration;
    if (pct >= 0.95) { remove(titulo); return; }
    if (currentTime < 10) return;
    try {
      localStorage.setItem(_key(titulo), JSON.stringify({
        titulo, currentTime, duration, pct, capa: capa || '', tipo: tipo || 'filme',
        serieNome: serieNome || '', ts: Date.now()
      }));
    } catch (e) {}
  }

  function get(titulo) {
    try { const v = localStorage.getItem(_key(titulo)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  function getAll() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.pct < 0.95) out.push(v); } catch (e) {}
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  function remove(titulo) { try { localStorage.removeItem(_key(titulo)); } catch (e) {} }

  // Remove qualquer chave de progresso associada a um título, incluindo
  // episódios de uma série (que usam o nome do episódio, não da série).
  function removeAllFor(titulo) {
    remove(titulo);
    try { remove(decodeURIComponent(titulo)); } catch (e) {}
    const normNome = (titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
    if (!normNome) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k.includes(normNome.slice(0, 15))) {
        try { localStorage.removeItem(k); } catch (e) {}
      }
    }
  }

  function clear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  return { save, get, getAll, remove, removeAllFor, clear };
})();
