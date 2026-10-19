/**
 * PIPOCAFLIX — sync-core.js
 * Peças compartilhadas pelos módulos de dados do usuário (favoritos.js, progress.js,
 * watched.js) e pela ponte com o Firestore (sync.js).
 *
 * COMO A SINCRONIZAÇÃO FUNCIONA ("local primeiro")
 *   • A página SEMPRE lê e escreve no localStorage — é instantâneo, funciona offline e
 *     continua funcionando pra quem ainda não entrou na conta.
 *   • Quando a pessoa está logada, o sync.js espelha isso no Firestore, num único
 *     documento  users/{uid}/sync/estado  →  { favoritos:{…}, continuar:{…}, assistidos:{…} }
 *     e traz de volta o que mudou em outro aparelho (celular ↔ notebook).
 *   • Todo item tem um "ts" (hora da última alteração). Remover um item não apaga ele do
 *     mapa: vira uma "lápide" ({ removido:true, ts }). Assim um aparelho que ficou
 *     desatualizado não "ressuscita" um item que outro aparelho apagou. Na hora de juntar
 *     local + nuvem, vale sempre o ts mais recente de cada item.
 *
 * Carregue ESTE arquivo antes de favoritos.js / progress.js / watched.js.
 * (Se ele faltar numa página, os três continuam funcionando — só não sincronizam.)
 */
(function () {
  'use strict';
  if (window.PflixSyncCore) return;

  var TOMB_PREFIX = 'pflix_tomb_';
  var TOMB_MAX_AGE_MS = 60 * 24 * 3600 * 1000; // lápides com mais de 60 dias podem sumir
  var OWNER_KEY = 'pflix_sync_uid';

  /* ── normalização / chave estável ──────────────────────────────────────────
     A MESMA chave tem que sair em qualquer aparelho a partir do mesmo nome.
     "slug-do-nome_hash": o hash evita colisão quando o nome é cortado ou quando dois
     nomes diferentes viram o mesmo slug. */
  function normalizar(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function hash36(str) {
    var h = 0x811c9dc5; // FNV-1a 32 bits
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }
  function slug(nome) {
    var n = normalizar(nome);
    if (!n) return 'sem-nome';
    var base = n.replace(/\s+/g, '-').slice(0, 48).replace(/-+$/, '');
    return (base || 'x') + '_' + hash36(n);
  }

  /* ── lápides (itens removidos) ────────────────────────────────────────────── */
  function lerTombs(tipo) {
    try {
      var o = JSON.parse(localStorage.getItem(TOMB_PREFIX + tipo) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function gravarTombs(tipo, obj) {
    var limite = Date.now() - TOMB_MAX_AGE_MS;
    var out = {};
    Object.keys(obj || {}).forEach(function (k) { if (obj[k] > limite) out[k] = obj[k]; });
    try {
      if (Object.keys(out).length) localStorage.setItem(TOMB_PREFIX + tipo, JSON.stringify(out));
      else localStorage.removeItem(TOMB_PREFIX + tipo);
    } catch (e) {}
  }
  function marcarRemovido(tipo, chave, ts) {
    var t = lerTombs(tipo);
    t[chave] = ts || Date.now();
    gravarTombs(tipo, t);
  }
  function limparRemovido(tipo, chave) {
    var t = lerTombs(tipo);
    if (t[chave] != null) { delete t[chave]; gravarTombs(tipo, t); }
  }
  function limparTombs(tipo) {
    try { localStorage.removeItem(TOMB_PREFIX + tipo); } catch (e) {}
  }

  /* ── aviso de "mudou algo no aparelho" (o sync.js escuta isso e empurra pra nuvem) ── */
  function notificar(tipo, urgente) {
    try {
      window.dispatchEvent(new CustomEvent('pflix:local-change', { detail: { tipo: tipo, urgente: !!urgente } }));
    } catch (e) {}
  }

  /* ── de quem são os dados guardados neste navegador? ───────────────────────
     Evita misturar os favoritos da conta A na conta B quando duas pessoas usam o mesmo
     computador. O sync.js consulta isso ao detectar o login. */
  function donoLocal() { try { return localStorage.getItem(OWNER_KEY) || ''; } catch (e) { return ''; } }
  function definirDono(uid) { try { localStorage.setItem(OWNER_KEY, uid); } catch (e) {} }

  /* ── apagar os dados de usuário guardados neste navegador ──────────────────
     Chamado pelo sync.js quando OUTRA conta entra aqui. Mexe direto no localStorage (e não
     nos módulos) porque nem toda página carrega todos eles — e nenhum dado da conta
     anterior pode sobrar. As chaves que carregam o uid (streak, atividade) não entram:
     elas já são separadas por conta. */
  var DADOS_FIXOS = ['pflix_favoritos', 'pflix_watched_list'];
  var DADOS_PREFIXOS = ['pflix_progress_', TOMB_PREFIX];
  function limparDadosLocais() {
    try {
      var apagar = DADOS_FIXOS.slice();
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < DADOS_PREFIXOS.length; j++) {
          if (k.indexOf(DADOS_PREFIXOS[j]) === 0) { apagar.push(k); break; }
        }
      }
      apagar.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  window.PflixSyncCore = {
    slug: slug,
    normalizar: normalizar,
    lerTombs: lerTombs,
    gravarTombs: gravarTombs,
    marcarRemovido: marcarRemovido,
    limparRemovido: limparRemovido,
    limparTombs: limparTombs,
    notificar: notificar,
    donoLocal: donoLocal,
    definirDono: definirDono,
    limparDadosLocais: limparDadosLocais
  };
})();
