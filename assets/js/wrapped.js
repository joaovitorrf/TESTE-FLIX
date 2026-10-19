/**
 * PIPOCAFLIX — wrapped.js
 * Gamificação do perfil.html
 *
 *   🔥 Sequência de dias assistindo ("você assistiu 5 dias seguidos") — chip no topo do perfil
 *      + cartão e semana na aba "Conquistas"
 *   🏆 Nível, conquistas (medalhas) e calendário de atividade       → aba "Conquistas"
 *   🎬 "Seu ano no PipocaFlix" (estilo Spotify Wrapped)             → aba "Seu ano"
 *        resumo na página · "stories" em tela cheia · imagem 1080×1920 pra compartilhar
 *
 * DE ONDE VÊM OS DADOS (nada novo é gravado por aqui — este arquivo só LÊ e desenha)
 *   • atividade.js  → tempo com o player aberto, por dia / hora / título   (users/{uid}/atividade/{ano})
 *   • stats.js      → as notas que a pessoa deu                            (users/{uid}/sync/notas)
 *   • watched.js    → "Assistidos" (marcados pela pessoa, com data)
 *   • favoritos.js  → "Favoritos"
 *   • api.js        → catálogo (gênero e duração de cada título)
 *
 * COMO AS CONTAS SÃO FEITAS
 *   • Dia "assistido" = 5+ min com o player aberto, OU marcou algo como assistido, OU deu uma nota.
 *   • Sequência = dias seguidos até hoje (ou até ontem — ainda dá tempo de assistir hoje).
 *   • Horas = tempo com o player aberto (aba visível) + a duração dos FILMES que a pessoa marcou como
 *     assistidos sem ter assistido por aqui (no máx. 6 h por dia, pra "marcar 40 de uma vez" não
 *     inflar). É uma estimativa — o player é de terceiros e não informa o minuto — e a tela diz isso.
 *   • Gênero favorito = gêneros dos títulos ponderados por tempo assistido, "assistido", notas 4–5★ e favoritos.
 *
 * Incluir no perfil.html (depois do bloco que cria window.PipocaAuth):
 *   <link rel="stylesheet" href="assets/css/perfil-game.css">
 *   <script type="module" src="assets/js/stats.js"></script>
 *   <script type="module" src="assets/js/atividade.js"></script>
 *   <script src="assets/js/wrapped.js"></script>
 * e os elementos  #pfxStreakChip  #pfxConquistas  #pfxAno  (veja o perfil.html).
 * Se algum desses módulos faltar, a parte que depende dele só fica vazia — nada quebra.
 */
(function () {
  'use strict';
  if (window.PipocaGame) return;

  /* ═════════════════════════ constantes ═════════════════════════ */
  const LIMIAR_DIA_S = 300;                 // dia conta com 5+ min assistidos (igual ao atividade.js)
  const CAP_EXTRA_DIA_S = 6 * 3600;         // estimativa de "marquei como assistido": máx. 6 h por dia
  const FILME_MEDIO_S = 110 * 60;
  const SEMANAS_CAL = 16;                   // calendário: últimas 16 semanas
  const SITE = 'pipocaflix.fun';
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const INICIAIS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const SEEN_KEY = 'pflix_game_seen_';      // + uid → ids das conquistas já vistas (pra marcar "NOVO")

  const NIVEIS = [
    { min: 0, nome: 'Espectador', emoji: '🎟️' },
    { min: 50, nome: 'Pipoqueiro', emoji: '🍿' },
    { min: 150, nome: 'Fã de cinema', emoji: '🎬' },
    { min: 300, nome: 'Maratonista', emoji: '🛋️' },
    { min: 520, nome: 'Cinéfilo', emoji: '🎞️' },
    { min: 820, nome: 'Crítico', emoji: '⭐' },
    { min: 1250, nome: 'Mestre da pipoca', emoji: '👑' },
    { min: 1800, nome: 'Lenda da telona', emoji: '🌟' }
  ];
  const PERFIS = {
    maratonista: { nome: 'Maratonista', emoji: '🛋️', desc: 'Quando começa, não para.' },
    coruja: { nome: 'Coruja da madrugada', emoji: '🦉', desc: 'A sessão preferida é de noite.' },
    madrugador: { nome: 'Madrugador', emoji: '☀️', desc: 'Cinema com café da manhã.' },
    fimsemana: { nome: 'Sessão de fim de semana', emoji: '🎉', desc: 'Sábado e domingo são dia de tela.' },
    chama: { nome: 'Fiel da pipoca', emoji: '🔥', desc: 'Sequência de respeito!' },
    critico: { nome: 'Crítico exigente', emoji: '🧐', desc: 'Nota boa só pra quem merece.' },
    coracao: { nome: 'Coração mole', emoji: '🥹', desc: 'Quase tudo merece 5 estrelas.' },
    explorador: { nome: 'Explorador de gêneros', emoji: '🧭', desc: 'Não se prende a um estilo só.' },
    pipoqueiro: { nome: 'Pipoqueiro de carteirinha', emoji: '🍿', desc: 'Cinema é com você mesmo.' }
  };

  /* ═════════════════════════ utilidades ═════════════════════════ */
  const $ = (id) => document.getElementById(id);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const dois = (n) => (n < 10 ? '0' : '') + n;
  const fmtDia = (d) => d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
  function diaNum(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function slug(s) {   // igual ao atividade.js / stats.js (é a chave do título no Firestore)
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome';
  }
  const chaveDe = (nome, serie) => (serie ? 's_' : 'f_') + slug(nome);
  const pl = (n, s, p) => n + ' ' + (n === 1 ? s : p);
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pagina = (serie) => (serie ? 'serie.html' : 'filme.html');
  const ehSerie = (x) => !!x && (x.isSerie === true || x.tipo === 'serie');
  const usuario = () => (window.PipocaAuth && window.PipocaAuth.getUser && window.PipocaAuth.getUser()) || null;
  const toast = (m) => { try { if (typeof window.showToast === 'function') window.showToast(m); } catch (e) { /* sem toast, sem problema */ } };

  function fmtDur(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    if (h >= 100) return h + ' h';
    if (h > 0) return h + ' h' + (m ? ' ' + m + ' min' : '');
    if (m > 0) return m + ' min';
    return seg > 0 ? 'menos de 1 min' : '0 min';
  }
  // número grande + legenda em 2 linhas ("142" · "horas de" / "pipoca")
  function grandeza(seg) {
    seg = Math.max(0, seg || 0);
    if (seg >= 36000) { const n = Math.round(seg / 3600); return { n: num(n), un: [n === 1 ? 'hora de' : 'horas de', 'pipoca'] }; }
    if (seg >= 3600) {
      const n = Math.round(seg / 360) / 10;
      return { n: n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), un: ['horas de', 'pipoca'] };
    }
    const m = Math.max(0, Math.round(seg / 60));
    return { n: String(m), un: [m === 1 ? 'minuto de' : 'minutos de', 'pipoca'] };
  }
  // "1h 45min" | "105 min" | "01:45" | "105"  →  minutos (0 se não der pra entender)
  function minutosDe(txt) {
    const s = String(txt || '').toLowerCase().trim();
    if (!s) return 0;
    let h = 0, m = 0, mt;
    if ((mt = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/))) { h = +mt[1]; m = +mt[2]; }
    else {
      const hm = s.match(/(\d+)\s*(?:horas?|hrs?|h)/);
      const mm = s.match(/(\d+)\s*(?:minutos?|mins?|m)\b/);
      if (hm) h = +hm[1];
      if (mm) m = +mm[1];
      if (hm && !mm) { const tail = s.match(/(?:horas?|hrs?|h)\s*(\d{1,2})\s*$/); if (tail) m = +tail[1]; }
      if (!hm && !mm && /^\d{1,3}$/.test(s)) m = +s;
    }
    const t = h * 60 + m;
    return t > 0 && t <= 600 ? t : 0;
  }
  function generosDe(txt) {
    const vistos = {}, out = [];
    String(txt || '').split(/[,;\/|]+/).forEach((g) => {
      g = g.trim();
      const k = norm(g);
      if (!k || vistos[k] || /^(filmes?|series?)$/.test(k)) return;
      vistos[k] = 1;
      out.push({ k, nome: g.charAt(0).toUpperCase() + g.slice(1) });
    });
    return out;
  }
  function indexarCatalogo(lista) {
    const mapa = {};
    (lista || []).forEach((it) => { if (it && it.nome) mapa[norm(it.nome) + (it.isSerie ? '|s' : '|f')] = it; });
    return mapa;
  }
  const noCatalogo = (mapa, nome, serie) => (mapa && mapa[norm(nome) + (serie ? '|s' : '|f')]) || null;

  /* ═════════════════════════ contas (funções puras — dá pra testar sem a página) ═════════════════════════ */

  // Sequência de dias. "set" = dias 'AAAA-MM-DD' em que a pessoa apareceu.
  function calcSeq(set, hojeData) {
    const hojeNum = diaNum(fmtDia(hojeData || new Date()));
    const nums = new Set();
    set.forEach((s) => { const n = diaNum(s); if (!isNaN(n)) nums.add(n); });
    const hoje = nums.has(hojeNum);
    let cur = hoje ? hojeNum : hojeNum - 1, atual = 0;       // "viva" também se assistiu ontem (ainda dá tempo hoje)
    while (nums.has(cur)) { atual++; cur--; }
    let melhor = 0, run = 0, prev = null;
    Array.from(nums).sort((a, b) => a - b).forEach((n) => {
      run = prev !== null && n === prev + 1 ? run + 1 : 1;
      if (run > melhor) melhor = run;
      prev = n;
    });
    return { atual, melhor, hoje, viva: atual > 0 };
  }

  // O resumo de UM ano. E = { ano, atv, notas, watched, favs, catMapa, chaveDe? }
  function calcularAno(E) {
    const ano = E.ano;
    const atv = E.atv || {};
    const dias = atv.dias || {}, hr = atv.hr || {}, titulos = atv.titulos || {};
    const chave = E.chaveDe || chaveDe;
    const catMapa = E.catMapa || {};
    const noAno = (ts) => ts > 0 && new Date(ts).getFullYear() === ano;

    // — tempo: o que o cronômetro viu + estimativa dos filmes marcados como assistidos
    let segTrack = (atv.total && +atv.total.seg) || 0;
    if (!segTrack) Object.keys(titulos).forEach((k) => { segTrack += (titulos[k] && +titulos[k].seg) || 0; });
    const watchedAno = (E.watched || []).filter((w) => w && w.nome && noAno(+w.ts));
    const extraDia = {};
    watchedAno.forEach((w) => {
      if (ehSerie(w)) return;
      const it = noCatalogo(catMapa, w.nome, false);
      const min = it ? minutosDe(it.duracao) : 0;
      if (!min) return;
      const rastreado = (titulos[chave(w.nome, false)] || {}).seg || 0;
      const falta = Math.max(0, min * 60 - rastreado);
      if (falta > 0) { const d = fmtDia(new Date(+w.ts)); extraDia[d] = (extraDia[d] || 0) + falta; }
    });
    let segExtra = 0;
    Object.keys(extraDia).forEach((d) => { segExtra += Math.min(extraDia[d], CAP_EXTRA_DIA_S); });
    const segTotal = segTrack + segExtra;

    // — uma "ficha" por título que apareceu no ano
    const fichas = {};
    const ficha = (k, nome, serie) => {
      const f = fichas[k] || (fichas[k] = { key: k, nome: '', serie: !!serie, seg: 0, abertos: 0, capa: '', cat: '', assistido: false, nota: 0, fav: false });
      if (!f.nome && nome) f.nome = nome;
      return f;
    };
    Object.keys(titulos).forEach((k) => {
      const t = titulos[k];
      if (!t) return;
      const f = ficha(k, t.nome, t.tipo === 'serie' || k.charAt(0) === 's');
      f.seg = +t.seg || 0; f.abertos = +t.abertos || 0; f.capa = t.capa || ''; f.cat = t.cat || '';
    });
    watchedAno.forEach((w) => {
      const s = ehSerie(w);
      const f = ficha(chave(w.nome, s), w.nome, s);
      f.assistido = true;
      if (!f.capa) f.capa = w.capa || '';
    });
    const notasAno = [];
    Object.keys(E.notas || {}).forEach((k) => {
      const n = E.notas[k];
      if (!n || !(+n.nota >= 1) || !noAno(+n.ts)) return;
      notasAno.push({ nome: n.nome || '', serie: n.tipo === 'serie', nota: +n.nota, ts: +n.ts });
      ficha(k, n.nome, n.tipo === 'serie').nota = +n.nota;
    });
    (E.favs || []).forEach((fv) => {
      if (!fv || !fv.nome || !noAno(+fv.ts)) return;
      const s = ehSerie(fv);
      const f = ficha(chave(fv.nome, s), fv.nome, s);
      f.fav = true;
      if (!f.capa) f.capa = fv.capa || '';
      if (!f.cat) f.cat = fv.categoria || '';
    });
    Object.keys(fichas).forEach((k) => {
      const f = fichas[k], it = noCatalogo(catMapa, f.nome, f.serie);
      if (it) { if (!f.cat) f.cat = it.categoria || ''; if (!f.capa) f.capa = it.capa || ''; }
    });

    // — gêneros (peso: tempo assistido, "assistido", notas 4–5★, favoritos)
    const gPeso = {}, gNome = {}, gVistos = {};
    Object.keys(fichas).forEach((k) => {
      const f = fichas[k];
      let peso = f.seg ? Math.max(0.5, f.seg / 7200) : 0;
      if (f.assistido) peso = Math.max(peso, 1);
      if (f.nota >= 4) peso += 0.5;
      if (f.fav) peso += 0.5;
      if (!peso && f.abertos) peso = 0.25;
      if (!peso) return;
      generosDe(f.cat).forEach((g) => {
        gPeso[g.k] = (gPeso[g.k] || 0) + peso;
        gNome[g.k] = gNome[g.k] || g.nome;
        if (f.seg >= LIMIAR_DIA_S || f.assistido) gVistos[g.k] = 1;
      });
    });
    const gTotal = Object.keys(gPeso).reduce((s, k) => s + gPeso[k], 0);
    const generos = Object.keys(gPeso).map((k) => ({ k, nome: gNome[k], peso: gPeso[k] }))
      .sort((a, b) => b.peso - a.peso || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 6);
    generos.forEach((g) => { g.pct = gTotal ? Math.round((g.peso / gTotal) * 100) : 0; g.rel = generos[0].peso ? g.peso / generos[0].peso : 0; });

    const topo = Object.keys(fichas).map((k) => fichas[k]).filter((f) => f.seg >= 60)
      .sort((a, b) => b.seg - a.seg || b.abertos - a.abertos).slice(0, 5)
      .map((f) => ({ key: f.key, nome: f.nome, capa: f.capa, serie: f.serie, seg: f.seg, abertos: f.abertos }));
    const titulosN = Object.keys(fichas).filter((k) => { const f = fichas[k]; return f.seg >= LIMIAR_DIA_S || f.assistido || f.nota > 0; }).length;

    // — quando assiste (hora do dia / dia da semana)
    const hrArr = []; let hrTot = 0;
    for (let h = 0; h < 24; h++) { const v = +hr[String(h)] || 0; hrArr.push(v); hrTot += v; }
    const somaHr = (de, ate) => { let s = 0; for (let h = de; h <= ate; h++) s += hrArr[h]; return s; };
    const periodos = [
      { id: 'madrugada', nome: 'Madrugada', emoji: '🦉', seg: somaHr(0, 5) },
      { id: 'manha', nome: 'Manhã', emoji: '☀️', seg: somaHr(6, 11) },
      { id: 'tarde', nome: 'Tarde', emoji: '🌤️', seg: somaHr(12, 17) },
      { id: 'noite', nome: 'Noite', emoji: '🌙', seg: somaHr(18, 23) }
    ];
    const temHr = hrTot >= 600;
    let horaTop = -1;
    if (temHr) { let mx = -1; hrArr.forEach((v, h) => { if (v > mx) { mx = v; horaTop = h; } }); }
    const periodoTop = temHr ? periodos.slice().sort((a, b) => b.seg - a.seg)[0] : null;

    const dsem = [0, 0, 0, 0, 0, 0, 0];
    let dsemTot = 0, maiorDiaSeg = 0;
    Object.keys(dias).forEach((d) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
      if (!m || +m[1] !== ano) return;
      const s = +dias[d] || 0;
      if (!s) return;
      dsem[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] += s;
      dsemTot += s;
      if (s > maiorDiaSeg) maiorDiaSeg = s;
    });
    let diaSemana = null;
    if (dsemTot >= 600) { let mx = -1, ix = 0; dsem.forEach((v, i) => { if (v > mx) { mx = v; ix = i; } }); diaSemana = { idx: ix, nome: DIAS_SEMANA[ix], seg: mx }; }

    // — dias ativos e maior sequência do ano
    const ativos = new Set();
    Object.keys(dias).forEach((d) => { if (d.slice(0, 4) === String(ano) && (+dias[d] || 0) >= LIMIAR_DIA_S) ativos.add(d); });
    watchedAno.forEach((w) => ativos.add(fmtDia(new Date(+w.ts))));
    notasAno.forEach((n) => ativos.add(fmtDia(new Date(n.ts))));
    const melhorSeq = calcSeq(ativos).melhor;

    // — notas do ano
    notasAno.sort((a, b) => b.ts - a.ts);
    const media = notasAno.length ? notasAno.reduce((s, n) => s + n.nota, 0) / notasAno.length : 0;
    const cinco = notasAno.filter((n) => n.nota === 5).slice(0, 5);

    // — "que tipo de espectador você é" (a primeira regra que bater ganha)
    const frac = (parte, tot) => (tot ? parte / tot : 0);
    const coruja = somaHr(22, 23) + somaHr(0, 4);
    let perfilId = 'pipoqueiro';
    if (maiorDiaSeg >= 5 * 3600) perfilId = 'maratonista';
    else if (temHr && frac(coruja, hrTot) >= 0.45) perfilId = 'coruja';
    else if (temHr && frac(somaHr(5, 9), hrTot) >= 0.4) perfilId = 'madrugador';
    else if (dsemTot >= 3600 && frac(dsem[0] + dsem[6], dsemTot) >= 0.6) perfilId = 'fimsemana';
    else if (melhorSeq >= 7) perfilId = 'chama';
    else if (notasAno.length >= 8 && media <= 3.3) perfilId = 'critico';
    else if (notasAno.length >= 5 && media >= 4.5) perfilId = 'coracao';
    else if (generos.length >= 6 && titulosN >= 10) perfilId = 'explorador';

    return {
      ano, segTrack, segExtra, segTotal, estimado: segExtra > 0,
      filmesEq: Math.round(segTotal / FILME_MEDIO_S),
      titulosN, diasAtivos: ativos.size, melhorSeq,
      topo, generos, generoFav: generos[0] ? generos[0].nome : null, generosVistos: Object.keys(gVistos),
      hrArr, periodos, periodoTop, horaTop, dsem, diaSemana, maiorDiaSeg, madrugadaSeg: somaHr(0, 4),
      notas: { qtd: notasAno.length, media, cinco },
      perfilId, perfil: PERFIS[perfilId],
      temDados: segTotal >= 60 || titulosN > 0 || ativos.size > 0 || notasAno.length > 0
    };
  }

  // Números gerais da conta (nível + conquistas). G = { watched, favs, notas, resumo, melhorSeq, catMapa }
  function calcGeral(G) {
    const R = G.resumo || {};
    const notasQtd = Object.keys(G.notas || {}).filter((k) => G.notas[k] && +G.notas[k].nota >= 1).length;
    const gset = new Set(R.generosVistos || []);
    (G.watched || []).forEach((w) => {
      const it = noCatalogo(G.catMapa, w.nome, ehSerie(w));
      if (it) generosDe(it.categoria).forEach((g) => gset.add(g.k));
    });
    return {
      assistidos: (G.watched || []).length, favoritos: (G.favs || []).length, notas: notasQtd,
      segAno: R.segTotal || 0, maiorDiaSeg: R.maiorDiaSeg || 0, madrugadaSeg: R.madrugadaSeg || 0,
      melhorSeq: G.melhorSeq || 0, generos: gset.size
    };
  }
  function calcNivel(g) {
    const xp = Math.round(g.assistidos * 10 + g.notas * 5 + g.favoritos * 2 + Math.floor(g.segAno / 3600) * 8 + g.melhorSeq * 10);
    let i = 0;
    NIVEIS.forEach((n, ix) => { if (xp >= n.min) i = ix; });
    const atual = NIVEIS[i], prox = NIVEIS[i + 1] || null;
    return {
      nivel: i + 1, nome: atual.nome, emoji: atual.emoji, xp, de: atual.min, ate: prox ? prox.min : null,
      proxNome: prox ? prox.nome : null, pct: prox ? Math.min(100, Math.round(((xp - atual.min) / (prox.min - atual.min)) * 100)) : 100
    };
  }
  function calcConquistas(g) {
    const lista = [
      { id: 'primeira-pipoca', emoji: '🍿', nome: 'Primeira pipoca', desc: 'Marque o primeiro título como assistido', v: g.assistidos, meta: 1 },
      { id: 'pipoqueiro', emoji: '🎟️', nome: 'Pipoqueiro', desc: '10 títulos assistidos', v: g.assistidos, meta: 10 },
      { id: 'cinefilo', emoji: '🎞️', nome: 'Cinéfilo', desc: '50 títulos assistidos', v: g.assistidos, meta: 50 },
      { id: 'lenda', emoji: '👑', nome: 'Lenda da telona', desc: '100 títulos assistidos', v: g.assistidos, meta: 100 },
      { id: 'primeira-nota', emoji: '⭐', nome: 'Primeira nota', desc: 'Avalie um filme ou série', v: g.notas, meta: 1 },
      { id: 'critico', emoji: '📝', nome: 'Crítico de plantão', desc: 'Dê 10 notas', v: g.notas, meta: 10 },
      { id: 'coracao', emoji: '❤️', nome: 'Coração cheio', desc: 'Favorite 5 títulos', v: g.favoritos, meta: 5 },
      { id: 'fogo3', emoji: '🔥', nome: 'Pegando fogo', desc: '3 dias seguidos assistindo', v: g.melhorSeq, meta: 3 },
      { id: 'fogo7', emoji: '⚡', nome: 'Semana de fogo', desc: '7 dias seguidos assistindo', v: g.melhorSeq, meta: 7 },
      { id: 'fogo30', emoji: '🌋', nome: 'Mês em chamas', desc: '30 dias seguidos assistindo', v: g.melhorSeq, meta: 30 },
      { id: 'horas10', emoji: '⏱️', nome: 'Sofá reservado', desc: '10 horas assistidas no ano', v: g.segAno / 3600, meta: 10 },
      { id: 'maratona', emoji: '🛋️', nome: 'Maratona de sofá', desc: '5 horas assistidas em um dia', v: g.maiorDiaSeg / 3600, meta: 5 },
      { id: 'coruja', emoji: '🦉', nome: 'Coruja', desc: '1 hora assistida entre meia-noite e 5h', v: g.madrugadaSeg / 3600, meta: 1 },
      { id: 'explorador', emoji: '🧭', nome: 'Explorador', desc: 'Assista títulos de 5 gêneros diferentes', v: g.generos, meta: 5 }
    ];
    lista.forEach((b) => {
      b.ok = b.v >= b.meta;
      b.pct = Math.max(b.ok ? 100 : 3, Math.min(100, Math.round((b.v / b.meta) * 100)));
      const v = b.v >= b.meta ? b.meta : (Number.isInteger(b.v) ? b.v : Math.floor(b.v * 10) / 10);
      b.progTxt = String(v).replace('.', ',') + ' de ' + b.meta;
    });
    return lista;
  }
  // Calendário: SEMANAS_CAL colunas (domingo → sábado), a última é a semana de hoje.
  function montarCalendario(diasSeg, extras, hojeData) {
    const hoje = new Date((hojeData || new Date()).getFullYear(), (hojeData || new Date()).getMonth(), (hojeData || new Date()).getDate());
    const iniSemana = new Date(hoje); iniSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicio = new Date(iniSemana); inicio.setDate(iniSemana.getDate() - 7 * (SEMANAS_CAL - 1));
    const cel = [];
    for (let i = 0; i < SEMANAS_CAL * 7; i++) {
      const d = new Date(inicio); d.setDate(inicio.getDate() + i);
      const k = fmtDia(d), seg = diasSeg[k] || 0;
      let nivel = 0;
      if (seg >= 7200) nivel = 4; else if (seg >= 3600) nivel = 3; else if (seg >= 1800) nivel = 2;
      else if (seg >= LIMIAR_DIA_S || (extras && extras.has(k))) nivel = 1;
      cel.push({ k, d, seg, nivel, futuro: d > hoje, hoje: d.getTime() === hoje.getTime() });
    }
    return { cel, inicio };
  }

  /* ═════════════════════════ leitura dos dados ═════════════════════════ */
  const lerWatched = () => { try { return (window.PipocaWatched && window.PipocaWatched.getAll()) || []; } catch (e) { return []; } };
  const lerFavs = () => { try { return (window.PipocaFavoritos && window.PipocaFavoritos.getAll()) || []; } catch (e) { return []; } };
  const atvVazio = () => ({ dias: {}, hr: {}, titulos: {}, total: { seg: 0, sessoes: 0 } });
  const seguro = (p, vazio) => Promise.resolve(p).catch((e) => { console.warn('[Game]', (e && e.code) || e); return vazio; });

  let estado = novoEstado(null);
  let token = 0;
  function novoEstado(uid) {
    return { uid, atv: {}, notas: {}, catalogo: [], catMapa: {}, anoSel: new Date().getFullYear(), seen: null, seenAntes: null };
  }

  async function esperarGlobais() {   // atividade.js e stats.js são módulos: chegam depois dos scripts normais
    for (let i = 0; i < 25 && !(window.PipocaAtividade && window.PipocaStats); i++) await dormir(150);
  }

  async function iniciar() {
    const meu = ++token;
    const u = usuario();
    if (!u) return;
    await esperarGlobais();
    if (meu !== token) return;
    if (estado.uid !== u.uid) { estado = novoEstado(u.uid); carregarSeen(u.uid); }
    const A = window.PipocaAtividade, S = window.PipocaStats, API = window.PipocaAPI;
    const hoje = new Date(), anoHoje = hoje.getFullYear();
    const diaDoAno = Math.floor((hoje - new Date(anoHoje, 0, 0)) / 86400000);
    const tarefas = [];
    tarefas.push(seguro(A ? A.getAno(anoHoje) : null, null).then((a) => { estado.atv[anoHoje] = a || atvVazio(); }));
    // nos primeiros meses do ano, a sequência e o calendário ainda "enxergam" o ano passado
    if (A && diaDoAno <= 120) tarefas.push(seguro(A.getAno(anoHoje - 1), null).then((a) => { estado.atv[anoHoje - 1] = a || atvVazio(); }));
    tarefas.push(seguro(API && API.getTodosConteudos ? API.getTodosConteudos() : [], []).then((l) => { estado.catalogo = l || []; estado.catMapa = indexarCatalogo(estado.catalogo); }));
    tarefas.push(seguro(S && S.getMinhasNotas ? S.getMinhasNotas() : {}, {}).then((n) => { estado.notas = n || {}; }));
    tarefas.forEach((t) => t.then(() => { if (meu === token) desenhar(); }));
    await Promise.all(tarefas);
    if (meu === token) desenhar();
  }

  async function carregarAno(ano) {   // troca de ano na aba "Seu ano" (janeiro/fevereiro)
    const A = window.PipocaAtividade;
    if (!estado.atv[ano] && A) estado.atv[ano] = (await seguro(A.getAno(ano), null)) || atvVazio();
    estado.anoSel = ano;
    desenhar();
  }

  function carregarSeen(uid) {
    estado.seen = null;
    try { const j = JSON.parse(localStorage.getItem(SEEN_KEY + uid) || 'null'); if (Array.isArray(j)) estado.seen = j; } catch (e) { /* sem storage: sem "NOVO" */ }
    estado.seenAntes = estado.seen ? estado.seen.slice() : null;
  }
  function gravarSeen(uid, ids) {
    estado.seen = ids;
    try { localStorage.setItem(SEEN_KEY + uid, JSON.stringify(ids)); } catch (e) { /* ok */ }
  }

  /* ═════════════════════════ desenho das abas ═════════════════════════ */
  let ultimo = null;   // { R (ano selecionado), Rhoje, nivel, badges, st } — usado pelos botões

  function desenhar() {
    try {
      const u = usuario();
      if (!u) return;
      const anoHoje = new Date().getFullYear();
      if (!estado.atv[anoHoje]) return;                     // ainda carregando: mantém o "Carregando…"
      const watched = lerWatched(), favs = lerFavs();

      // dias em que a pessoa apareceu (tempo assistido + marcou como assistido + deu nota)
      const extras = new Set();
      watched.forEach((w) => { if (+w.ts > 0) extras.add(fmtDia(new Date(+w.ts))); });
      Object.keys(estado.notas).forEach((k) => { const n = estado.notas[k]; if (n && +n.ts > 0) extras.add(fmtDia(new Date(+n.ts))); });
      const diasSeg = {};
      [anoHoje - 1, anoHoje].forEach((a) => {
        const d = (estado.atv[a] || {}).dias || {};
        Object.keys(d).forEach((k) => { diasSeg[k] = d[k]; });
      });
      const todos = new Set(extras);
      Object.keys(diasSeg).forEach((k) => { if ((+diasSeg[k] || 0) >= LIMIAR_DIA_S) todos.add(k); });
      const st = calcSeq(todos);

      const base = { notas: estado.notas, watched, favs, catMapa: estado.catMapa };
      const Rhoje = calcularAno(Object.assign({ ano: anoHoje, atv: estado.atv[anoHoje] }, base));
      const g = calcGeral({ watched, favs, notas: estado.notas, resumo: Rhoje, melhorSeq: st.melhor, catMapa: estado.catMapa });
      const nivel = calcNivel(g);
      const badges = calcConquistas(g);

      // "NOVO" nas conquistas desbloqueadas desde a última visita (na 1ª visita nada é novo)
      const okIds = badges.filter((b) => b.ok).map((b) => b.id);
      badges.forEach((b) => { b.novo = b.ok && !!estado.seenAntes && estado.seenAntes.indexOf(b.id) === -1; });
      const jaVistos = (estado.seen || []).filter((id) => okIds.indexOf(id) === -1);
      if (!estado.seen || okIds.some((id) => estado.seen.indexOf(id) === -1)) gravarSeen(u.uid, okIds.concat(jaVistos));
      if (!estado.seenAntes) estado.seenAntes = okIds.slice();   // 1ª visita: tudo que já existe conta como "visto"

      const cal = montarCalendario(diasSeg, extras, new Date());
      const R = estado.anoSel === anoHoje ? Rhoje
        : calcularAno(Object.assign({ ano: estado.anoSel, atv: estado.atv[estado.anoSel] || atvVazio() }, base));
      ultimo = { R, Rhoje, st, nivel, badges, user: u };

      desenharChip(st);
      const boxC = $('pfxConquistas');
      if (boxC) boxC.innerHTML = htmlConquistas(st, nivel, badges, cal, diasSeg, todos);
      const boxA = $('pfxAno');
      if (boxA) { boxA.innerHTML = htmlAno(R, anoHoje); ligarAno(boxA); }
      const n = document.querySelector('[data-n="conquistas"]');
      if (n) n.textContent = okIds.length + '/' + badges.length;
      agendarPreparo();
    } catch (e) { console.warn('[Game] não consegui desenhar:', e); }
  }

  function desenharChip(st) {
    const chip = $('pfxStreakChip');
    if (!chip) return;
    chip.hidden = false;
    chip.classList.toggle('is-off', !(st.atual > 0));
    if (st.atual > 0) {
      chip.innerHTML = '🔥 <b>' + st.atual + '</b> ' + (st.atual === 1 ? 'dia seguido' : 'dias seguidos') + (st.hoje ? '' : ' <small>· assista hoje</small>');
      chip.title = st.hoje ? 'Sequência garantida hoje! Toque pra ver suas conquistas.' : 'Assista hoje pra manter a sequência. Toque pra ver suas conquistas.';
    } else {
      chip.innerHTML = '🔥 <small>Comece sua sequência</small>';
      chip.title = 'Assista 5 minutos hoje pra começar a sequência. Toque pra ver suas conquistas.';
    }
  }

  function subStreak(st) {
    if (st.atual > 0 && st.hoje) return st.atual > 1 && st.atual >= st.melhor ? 'Você já assistiu hoje — e esse é o seu recorde! 🎉' : 'Você já assistiu hoje — sequência garantida! 🎉';
    if (st.atual > 0) return 'Assista hoje pra manter a sua sequência de ' + pl(st.atual, 'dia', 'dias') + '.';
    return st.melhor > 0 ? 'A sequência zerou, mas dá pra recomeçar: assista 5 minutos hoje.' : 'Assista pelo menos 5 minutos hoje pra começar a sua sequência.';
  }

  function htmlConquistas(st, nivel, badges, cal, diasSeg, todos) {
    // semana (últimos 7 dias)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let semana = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje); d.setDate(hoje.getDate() - i);
      const on = todos.has(fmtDia(d));
      semana += '<li class="' + (on ? 'on ' : '') + (i === 0 ? 'hoje' : '') + '"><span>' + INICIAIS[d.getDay()] + '</span><i aria-hidden="true">✓</i><span class="pfx-g-sr">' + (on ? 'assistiu' : 'não assistiu') + (i === 0 ? ' (hoje)' : '') + '</span></li>';
    }
    // nível
    const falta = nivel.ate != null ? nivel.ate - nivel.xp : 0;
    const nivelHtml =
      '<div class="pfx-g-nivel"><div class="pfx-g-nivel-top"><span class="pfx-g-nivel-ico" aria-hidden="true">' + nivel.emoji + '</span>' +
      '<div><b>Nível ' + nivel.nivel + ' · ' + esc(nivel.nome) + '</b><small>' + num(nivel.xp) + ' pontos de pipoca</small></div></div>' +
      '<div class="pfx-g-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + nivel.pct + '"><span style="width:' + nivel.pct + '%"></span></div>' +
      '<p class="pfx-g-nivel-xp">' + (nivel.ate != null ? 'Faltam ' + num(falta) + ' pontos pro nível ' + (nivel.nivel + 1) + ' — ' + esc(nivel.proxNome) + '.' : 'Nível máximo! Você é lenda. 🌟') + '</p></div>';
    // conquistas (as ganhas primeiro; as pendentes, da mais perto pra mais longe)
    const ord = badges.slice().sort((a, b) => (b.ok - a.ok) || (b.pct - a.pct));
    const ganhas = badges.filter((b) => b.ok).length;
    const badgesHtml = ord.map((b) =>
      '<li class="pfx-g-badge' + (b.ok ? ' is-on' : '') + '">' +
      (b.novo ? '<span class="pfx-g-novo">NOVO</span>' : '') +
      '<span class="pfx-g-badge-ico" aria-hidden="true">' + b.emoji + '</span>' +
      '<b>' + esc(b.nome) + '</b><small>' + esc(b.desc) + '</small>' +
      (b.ok ? '<span class="pfx-g-sr">Conquistada</span>'
        : '<div class="pfx-g-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + b.pct + '"><span style="width:' + b.pct + '%"></span></div><div class="pfx-g-badge-prog">' + esc(b.progTxt) + '</div>') +
      '</li>').join('');
    return (
      '<section class="pfx-g-streak' + (st.atual > 0 ? '' : ' is-off') + '" aria-label="Sequência de dias">' +
      '<div class="pfx-g-flame" aria-hidden="true">🔥</div><div>' +
      '<div class="pfx-g-streak-n"><b>' + st.atual + '</b> ' + (st.atual === 1 ? 'dia seguido' : 'dias seguidos') + '</div>' +
      '<p class="pfx-g-streak-sub">' + esc(subStreak(st)) + '</p>' +
      (st.melhor > 0 ? '<p class="pfx-g-streak-rec">Seu recorde: <b>' + pl(st.melhor, 'dia', 'dias') + '</b></p>' : '') +
      '</div></section>' +
      '<ol class="pfx-g-semana" aria-label="Últimos 7 dias">' + semana + '</ol>' +
      '<h3 class="pfx-g-h3">Seu nível</h3>' + nivelHtml +
      '<h3 class="pfx-g-h3">Conquistas <small>' + ganhas + ' de ' + badges.length + '</small></h3>' +
      '<ul class="pfx-g-badges">' + badgesHtml + '</ul>' +
      '<h3 class="pfx-g-h3">Seus últimos 4 meses <small>cada quadradinho é um dia</small></h3>' + htmlCalendario(cal) +
      '<p class="pfx-g-nota">Um dia conta pra sequência quando você assiste 5 minutos ou mais (com o player aberto), marca algo como assistido ou dá uma nota.</p>'
    );
  }

  function htmlCalendario(cal) {
    let rot = [];
    for (let c = 0; c < SEMANAS_CAL; c++) {
      const m = cal.cel[c * 7].d.getMonth();
      if (!rot.length || rot[rot.length - 1].m !== m) rot.push({ c, m });
    }
    rot = rot.filter((r, i) => !rot[i + 1] || rot[i + 1].c - r.c >= 3);   // sem rótulos encavalados
    const meses = rot.map((r) => '<span style="grid-column:' + (r.c + 1) + '">' + MESES[r.m] + '</span>').join('');
    const cels = cal.cel.map((x) => {
      const t = x.futuro ? '' : x.d.getDate() + ' de ' + MESES[x.d.getMonth()] + ' · ' + (x.seg >= 60 ? fmtDur(x.seg) : (x.nivel ? 'ativo' : 'sem atividade'));
      return '<i class="' + (x.futuro ? 'fut' : 'l' + x.nivel) + (x.hoje ? ' hoje' : '') + '"' + (t ? ' title="' + esc(t) + '"' : '') + '></i>';
    }).join('');
    return '<div class="pfx-g-heat" role="img" aria-label="Calendário das suas últimas 16 semanas: quanto mais forte a cor, mais você assistiu naquele dia">' +
      '<div class="pfx-g-heat-meses" aria-hidden="true">' + meses + '</div><div class="pfx-g-heat-grid" aria-hidden="true">' + cels + '</div>' +
      '<div class="pfx-g-legenda" aria-hidden="true">menos <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> mais</div></div>';
  }

  /* — aba "Seu ano" — */
  function textoEstimativa(R) {
    const mesAtual = new Date().getMonth();
    const partes = [];
    if (R.ano === new Date().getFullYear() && mesAtual < 11) partes.push('Resumo parcial: o ano ainda não acabou — ele se atualiza a cada visita.');
    partes.push('As horas somam o tempo em que o player ficou aberto com a aba visível (é uma estimativa: o player é de terceiros e não avisa o minuto exato)' + (R.estimado ? ' e a duração dos filmes que você marcou como assistidos' : '') + '.');
    return partes.join(' ');
  }

  function htmlAno(R, anoHoje) {
    const anos = [anoHoje];
    if (new Date().getMonth() <= 1) anos.push(anoHoje - 1);     // em jan/fev dá pra ver o ano que passou
    const seletor = anos.length > 1
      ? '<div class="pfx-g-anos" role="group" aria-label="Escolher o ano">' + anos.map((a) => '<button type="button" data-ano="' + a + '"' + (a === R.ano ? ' class="is-ativo" aria-pressed="true"' : ' aria-pressed="false"') + '>' + a + '</button>').join('') + '</div>' : '';

    if (!R.temDados) {
      return (seletor ? '<div style="margin-bottom:12px">' + seletor + '</div>' : '') +
        '<div class="pfx-g-vazio"><div class="pfx-g-vazio-ico" aria-hidden="true">🍿</div><h3>Seu ano começa agora</h3>' +
        '<p>Assista alguma coisa, marque como assistido e dê suas notas. Suas horas, seu gênero favorito, o título mais assistido e sua sequência aparecem aqui — e viram um resumo pra você compartilhar.</p>' +
        '<a class="perf-btn perf-btn--main" href="catalogo.html">Escolher o que assistir →</a></div>';
    }
    const usaHoras = R.segTotal >= 600;
    const gr = grandeza(R.segTotal);
    const sub = [];
    if (usaHoras && R.filmesEq >= 2) sub.push('≈ ' + num(R.filmesEq) + ' filmes');
    if (usaHoras || R.titulosN) sub.push(pl(R.titulosN, 'título', 'títulos'));
    if (R.diasAtivos) sub.push(pl(R.diasAtivos, 'dia ativo', 'dias ativos'));
    if (R.melhorSeq >= 2) sub.push('🔥 recorde de ' + R.melhorSeq + ' dias');
    const topo = R.topo[0];
    const cards = [];
    if (topo) cards.push('<div class="pfx-g-card">' + (topo.capa ? '<img src="' + esc(topo.capa) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="pfx-g-card-ico" aria-hidden="true">' + (topo.serie ? '📺' : '🎬') + '</div>') +
      '<div class="pfx-g-card-txt"><small>Título mais assistido</small><b>' + esc(topo.nome) + '</b><span>' + fmtDur(topo.seg) + (topo.abertos > 1 ? ' · aberto ' + topo.abertos + ' vezes' : '') + '</span></div></div>');
    if (R.generoFav) cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">🎭</div><div class="pfx-g-card-txt"><small>Gênero favorito</small><b>' + esc(R.generoFav) + '</b><span>' + R.generos[0].pct + '% do seu gosto</span></div></div>');
    if (R.periodoTop) cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">' + R.periodoTop.emoji + '</div><div class="pfx-g-card-txt"><small>Seu horário</small><b>' + esc(R.periodoTop.nome) + '</b><span>pico por volta das ' + R.horaTop + 'h</span></div></div>');
    if (R.diaSemana) cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">📅</div><div class="pfx-g-card-txt"><small>Dia favorito</small><b>' + esc(R.diaSemana.nome.charAt(0).toUpperCase() + R.diaSemana.nome.slice(1)) + '</b><span>' + fmtDur(R.diaSemana.seg) + ' no ano</span></div></div>');
    if (R.melhorSeq >= 1) cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">🔥</div><div class="pfx-g-card-txt"><small>Maior sequência</small><b>' + pl(R.melhorSeq, 'dia', 'dias') + '</b><span>seguidos assistindo</span></div></div>');
    if (R.notas.qtd) cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">⭐</div><div class="pfx-g-card-txt"><small>Suas notas</small><b>' + R.notas.media.toFixed(1).replace('.', ',') + ' de média</b><span>' + pl(R.notas.qtd, 'avaliação', 'avaliações') + (R.notas.cinco.length ? ' · ' + pl(R.notas.cinco.length, 'nota máxima', 'notas máximas') : '') + '</span></div></div>');
    cards.push('<div class="pfx-g-card"><div class="pfx-g-card-ico" aria-hidden="true">' + R.perfil.emoji + '</div><div class="pfx-g-card-txt"><small>Você é</small><b>' + esc(R.perfil.nome) + '</b><span>' + esc(R.perfil.desc) + '</span></div></div>');

    const top = R.topo.length ? '<h3 class="pfx-g-h3">Mais assistidos do ano</h3><ol class="pfx-g-top">' + R.topo.map((t) =>
      '<li><a href="' + pagina(t.serie) + '?nome=' + encodeURIComponent(t.nome) + '">' +
      (t.capa ? '<img src="' + esc(t.capa) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="pfx-g-sem-capa" aria-hidden="true">' + (t.serie ? '📺' : '🎬') + '</span>') +
      '<span><b>' + esc(t.nome) + '</b><small>' + fmtDur(t.seg) + (t.serie ? ' · série' : ' · filme') + '</small></span></a></li>').join('') + '</ol>' : '';
    const gen = R.generos.length ? '<h3 class="pfx-g-h3">Seus gêneros</h3><ul class="pfx-g-gen">' + R.generos.map((g) =>
      '<li><span>' + esc(g.nome) + '</span><div class="pfx-g-barra" aria-hidden="true"><span style="width:' + Math.max(4, Math.round(g.rel * 100)) + '%"></span></div><em>' + g.pct + '%</em></li>').join('') + '</ul>' : '';
    let horas = '';
    if (R.periodoTop) {
      const mx = Math.max.apply(null, R.hrArr) || 1;
      horas = '<h3 class="pfx-g-h3">Quando você assiste <small>por hora do dia</small></h3><div class="pfx-g-horas" role="img" aria-label="Horas do dia em que você mais assiste: pico por volta das ' + R.horaTop + 'h">' +
        R.hrArr.map((v, h) => '<i' + (h === R.horaTop ? ' class="top"' : '') + ' style="height:' + Math.max(4, Math.round((v / mx) * 100)) + '%" title="' + h + 'h · ' + esc(fmtDur(v)) + '"></i>').join('') +
        '</div><div class="pfx-g-horas-rot" aria-hidden="true"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>';
    }
    return (
      (seletor ? '<div style="margin-bottom:12px">' + seletor + '</div>' : '') +
      '<article class="pfx-g-wrap" aria-label="Resumo do seu ano">' +
      '<p class="pfx-g-wrap-kick">Seu ano no PipocaFlix · ' + R.ano + '</p>' +
      '<div class="pfx-g-wrap-big"><b>' + (usaHoras ? gr.n : num(R.titulosN)) + '</b><span>' + (usaHoras ? gr.un.join(' ') : (R.titulosN === 1 ? 'título assistido' : 'títulos assistidos')) + '</span></div>' +
      (sub.length ? '<p class="pfx-g-wrap-sub">' + sub.join(' · ') + '</p>' : '') +
      '<div class="pfx-g-wrap-btns"><button type="button" class="perf-btn perf-btn--main" data-act="ver">▶️ Ver meu ano</button><button type="button" class="perf-btn" data-act="share">📤 Compartilhar</button></div>' +
      '</article>' +
      '<div class="pfx-g-cards">' + cards.join('') + '</div>' + top + gen + horas +
      '<p class="pfx-g-nota">⏱️ ' + esc(textoEstimativa(R)) + '</p>'
    );
  }

  function ligarAno(box) {
    box.querySelectorAll('[data-ano]').forEach((b) => b.addEventListener('click', () => carregarAno(+b.getAttribute('data-ano'))));
    box.querySelectorAll('[data-act]').forEach((b) => {
      const ag = () => agendarPreparo(true);
      b.addEventListener('pointerenter', ag); b.addEventListener('focus', ag);
      b.addEventListener('click', () => {
        if (!ultimo) return;
        if (b.getAttribute('data-act') === 'ver') abrirHistoria(ultimo.R, ctxAtual());
        else compartilhar(ultimo.R, ctxAtual(), b);
      });
    });
  }
  function ctxAtual() {
    const u = (ultimo && ultimo.user) || usuario();
    const P = window.PipocaPerfil;
    let nome = '';
    try { nome = (P && P.nomeExibicao ? P.nomeExibicao(u) : (u && u.displayName)) || ''; } catch (e) { nome = (u && u.displayName) || ''; }
    return { nome: String(nome).trim().split(/\s+/)[0] || '' };
  }

  /* ═════════════════════════ stories em tela cheia ═════════════════════════ */
  let abertoOv = null, focoAntes = null, teclaHistoria = null;

  function montarSlides(R, ctx) {
    const s = [];
    const gr = grandeza(R.segTotal);
    const usaHoras = R.segTotal >= 600;
    const topo = R.topo[0];
    s.push({ g: ['#ff2d43', '#3a0ca3'], html:
      '<p class="pfx-g-kick">Seu ano no PipocaFlix</p><div class="pfx-g-year">' + R.ano + '</div>' +
      '<p class="pfx-g-lead">' + (ctx.nome ? 'Bora ver como foi, <b>' + esc(ctx.nome) + '</b>?' : 'Bora ver como foi?') + '</p><div class="pfx-g-emoji" aria-hidden="true">🍿</div>' });
    if (usaHoras || R.titulosN) s.push({ g: ['#6a11cb', '#c2185b'], html: usaHoras
      ? '<p class="pfx-g-kick">Você passou</p><div class="pfx-g-num">' + esc(gr.n) + '</div><p class="pfx-g-un">' + esc(gr.un.join(' ')) + '<br>na mão</p>' +
        (R.filmesEq >= 2 ? '<p class="pfx-g-peq">Dá pra assistir uns <b>' + num(R.filmesEq) + ' filmes</b> nesse tempo.</p>' : '') +
        '<p class="pfx-g-peq">Tempo estimado: player aberto + filmes marcados como assistidos.</p>'
      : '<p class="pfx-g-kick">Você assistiu</p><div class="pfx-g-num">' + num(R.titulosN) + '</div><p class="pfx-g-un">' + (R.titulosN === 1 ? 'título' : 'títulos') + ' em ' + R.ano + '</p>' });
    if (topo) s.push({ g: ['#0f3b57', '#6d28a8'], html:
      '<p class="pfx-g-kick">Seu título mais assistido</p>' +
      (topo.capa ? '<img class="pfx-g-cap" src="' + esc(topo.capa) + '" alt="" referrerpolicy="no-referrer">' : '<div class="pfx-g-cap pfx-g-cap--vazio" aria-hidden="true">' + (topo.serie ? '📺' : '🎬') + '</div>') +
      '<h2 class="pfx-g-nome">' + esc(topo.nome) + '</h2><p class="pfx-g-peq">' + fmtDur(topo.seg) + (topo.abertos > 1 ? ' · você abriu ' + topo.abertos + ' vezes' : '') + '</p>' });
    if (R.generoFav) s.push({ g: ['#b3123f', '#d9480f'], html:
      '<p class="pfx-g-kick">Seu gênero favorito</p><div class="pfx-g-emoji" aria-hidden="true">🎭</div><div class="pfx-g-gen-nome">' + esc(R.generoFav) + '</div>' +
      '<div class="pfx-g-mini">' + R.generos.slice(0, 3).map((g) => '<div><span>' + esc(g.nome) + '</span><em>' + g.pct + '%</em><div class="pfx-g-barra"><span style="width:' + Math.max(4, Math.round(g.rel * 100)) + '%"></span></div></div>').join('') + '</div>' });
    if (R.periodoTop || R.diaSemana) s.push({ g: ['#0f172a', '#1e3a8a'], html:
      '<p class="pfx-g-kick">Você é do tipo…</p><div class="pfx-g-emoji" aria-hidden="true">' + R.perfil.emoji + '</div><div class="pfx-g-gen-nome">' + esc(R.perfil.nome) + '</div><p class="pfx-g-peq">' + esc(R.perfil.desc) + '</p>' +
      '<p class="pfx-g-peq">' + [R.periodoTop ? 'Mais ativo de <b>' + esc(R.periodoTop.nome.toLowerCase()) + '</b> (pico às ' + R.horaTop + 'h)' : '', R.diaSemana ? 'dia favorito: <b>' + esc(R.diaSemana.nome) + '</b>' : ''].filter(Boolean).join(' · ') + '</p>' });
    if (R.melhorSeq >= 1) s.push({ g: ['#c2290b', '#e8590c'], html:
      '<p class="pfx-g-kick">Sua maior sequência</p><div class="pfx-g-emoji" aria-hidden="true">🔥</div><div class="pfx-g-num">' + R.melhorSeq + '</div><p class="pfx-g-un">' + (R.melhorSeq === 1 ? 'dia' : 'dias') + ' seguidos</p>' +
      (R.diasAtivos ? '<p class="pfx-g-peq">' + pl(R.diasAtivos, 'dia ativo', 'dias ativos') + ' em ' + R.ano + '</p>' : '') });
    if (R.notas.qtd) s.push({ g: ['#4a1d96', '#a21caf'], html:
      '<p class="pfx-g-kick">Suas notas</p><div class="pfx-g-num">' + R.notas.media.toFixed(1).replace('.', ',') + '<span style="font-size:.4em"> ★</span></div><p class="pfx-g-un">de média em ' + pl(R.notas.qtd, 'avaliação', 'avaliações') + '</p>' +
      (R.notas.cinco.length ? '<p class="pfx-g-peq">Nota máxima pra: <b>' + R.notas.cinco.slice(0, 3).map((n) => esc(n.nome)).join(', ') + '</b></p>' : '') });
    const fin = [];
    fin.push([usaHoras ? gr.n : num(R.titulosN), usaHoras ? (gr.un[0].replace(/ de$/, '')) : 'títulos']);
    if (usaHoras) fin.push([num(R.titulosN), 'títulos']);
    fin.push([num(R.diasAtivos), 'dias ativos']);
    fin.push([num(R.melhorSeq), 'maior sequência']);
    s.push({ g: ['#0b0b1a', '#4c0f2e'], ultimo: true, html:
      '<p class="pfx-g-kick">Seu ano em números · ' + R.ano + '</p><div class="pfx-g-fin-grid">' + fin.slice(0, 4).map((x) => '<div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>').join('') + '</div>' +
      '<div class="pfx-g-fin-perfil">' + R.perfil.emoji + ' ' + esc(R.perfil.nome) + '</div>' +
      '<div class="pfx-g-fin-btns"><button type="button" class="pfx-g-bt pfx-g-bt--main" data-act="share">📤 Compartilhar imagem</button><button type="button" class="pfx-g-bt" data-act="baixar">⬇️ Baixar imagem</button><button type="button" class="pfx-g-bt" data-act="fechar">Fechar</button></div>' });
    return s;
  }

  function abrirHistoria(R, ctx) {
    fecharHistoria();
    const slides = montarSlides(R, ctx);
    const ov = document.createElement('div');
    ov.className = 'pfx-g-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Seu ano no PipocaFlix ' + R.ano);
    ov.innerHTML = '<div class="pfx-g-story"><div class="pfx-g-prog" aria-hidden="true">' + slides.map(() => '<i></i>').join('') + '</div>' +
      '<button type="button" class="pfx-g-x" aria-label="Fechar">✕</button><div class="pfx-g-slide" aria-live="polite"></div>' +
      '<button type="button" class="pfx-g-nav pfx-g-nav--prev" aria-label="Anterior"></button><button type="button" class="pfx-g-nav pfx-g-nav--next" aria-label="Próximo"></button>' +
      '<div class="pfx-g-dica" aria-hidden="true">toque na direita pra avançar</div></div>';
    const story = ov.firstChild, box = story.querySelector('.pfx-g-slide'), barras = story.querySelectorAll('.pfx-g-prog i');
    let i = 0;
    function ir(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      const sl = slides[i];
      story.style.setProperty('--g1', sl.g[0]); story.style.setProperty('--g2', sl.g[1]);
      story.classList.toggle('is-ultimo', !!sl.ultimo);
      box.innerHTML = sl.html; box.scrollTop = 0;
      barras.forEach((b, k) => b.classList.toggle('on', k <= i));
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        const a = b.getAttribute('data-act');
        if (a === 'fechar') fecharHistoria();
        else if (a === 'share') compartilhar(R, ctx, b);
        else if (a === 'baixar') baixar(R, ctx, b);
      }));
    }
    story.querySelector('.pfx-g-x').addEventListener('click', fecharHistoria);
    story.querySelector('.pfx-g-nav--prev').addEventListener('click', () => ir(i - 1));
    story.querySelector('.pfx-g-nav--next').addEventListener('click', () => ir(i + 1));
    ov.addEventListener('click', (e) => { if (e.target === ov) fecharHistoria(); });
    let x0 = null;
    story.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    story.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 55) ir(i + (dx < 0 ? 1 : -1));
    }, { passive: true });
    teclaHistoria = (e) => {
      if (!abertoOv || document.querySelector('.pfx-g-previa')) return;     // a prévia da imagem (por cima) cuida das teclas dela
      if (e.key === 'Escape') { e.stopPropagation(); fecharHistoria(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ir(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(i - 1); }
      else if (e.key === 'Tab') {
        const f = Array.prototype.filter.call(ov.querySelectorAll('button, a[href]'), (el) => el.offsetParent !== null && getComputedStyle(el).display !== 'none');
        if (!f.length) return;
        const p = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(p + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener('keydown', teclaHistoria);
    focoAntes = document.activeElement;
    document.body.appendChild(ov);
    document.body.classList.add('pfx-g-lock');
    abertoOv = ov;
    ir(0);
    story.querySelector('.pfx-g-x').focus();
    agendarPreparo(true);
  }
  function devolverFoco(el, seletor) {
    try {
      const alvo = el && el.isConnected ? el : (seletor ? document.querySelector(seletor) : null);
      if (alvo && alvo.focus) alvo.focus();
    } catch (e) { /* ok */ }
  }
  function fecharHistoria() {
    if (!abertoOv) return;
    abertoOv.remove(); abertoOv = null;
    if (teclaHistoria) { document.removeEventListener('keydown', teclaHistoria); teclaHistoria = null; }
    document.body.classList.remove('pfx-g-lock');
    devolverFoco(focoAntes, '#pfxAno [data-act="ver"]');
    focoAntes = null;
  }

  /* ═════════════════════════ imagem pra compartilhar (1080×1920) ═════════════════════════ */
  const FD = '"Syne", "DM Sans", system-ui, sans-serif';
  const FB = '"DM Sans", system-ui, sans-serif';
  const FE = ', "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

  async function prepararFontes() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.race([Promise.all([
        document.fonts.load('800 80px Syne'), document.fonts.load('700 40px Syne'),
        document.fonts.load('600 30px "DM Sans"'), document.fonts.load('400 30px "DM Sans"')
      ]), dormir(2200)]);
    } catch (e) { /* usa a fonte padrão */ }
  }
  // Carrega o pôster COM CORS (senão o canvas "suja" e não dá pra exportar). Se o servidor da imagem não
  // liberar, a imagem sai sem o pôster em vez de falhar.
  function carregarImagem(url) {
    const tenta = (src) => new Promise((ok) => {
      const im = new Image();
      const t = setTimeout(() => ok(null), 7000);
      im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer';
      im.onload = () => { clearTimeout(t); ok(im.naturalWidth ? im : null); };
      im.onerror = () => { clearTimeout(t); ok(null); };
      im.src = src;
    });
    return tenta(url).then((im) => im || tenta(url + (url.indexOf('?') > -1 ? '&' : '?') + 'pfx=1'));   // 2ª tentativa fura o cache sem CORS
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function ajustar(c, txt, maxW, fonteFn, px, min) {   // reduz a fonte até caber
    c.font = fonteFn(px);
    while (c.measureText(txt).width > maxW && px > min) { px -= 2; c.font = fonteFn(px); }
    return px;
  }
  function quebrar(c, txt, maxW, maxLin) {
    const pal = String(txt).split(/\s+/).filter(Boolean), lin = [];
    let at = '';
    pal.forEach((p) => {
      const t = at ? at + ' ' + p : p;
      if (c.measureText(t).width <= maxW || !at) at = t; else { lin.push(at); at = p; }
    });
    if (at) lin.push(at);
    if (lin.length > maxLin) lin.length = maxLin, lin[maxLin - 1] = lin[maxLin - 1] + '…';
    return lin.map((l) => { while (l.length > 2 && c.measureText(l).width > maxW) l = l.slice(0, -2) + '…'; return l; });
  }
  function espacado(c, txt, x, y, esp) {
    let cx = x;
    Array.from(txt).forEach((ch) => { c.fillText(ch, cx, y); cx += c.measureText(ch).width + esp; });
  }

  async function gerarImagem(R, ctx) {
    const W = 1080, H = 1920, M = 84;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    await prepararFontes();
    const titulo = R.topo[0] || null;
    const poster = titulo && titulo.capa ? await carregarImagem(titulo.capa) : null;
    const usaHoras = R.segTotal >= 600;
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';

    // fundo
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#13041f'); g.addColorStop(0.5, '#2e0b30'); g.addColorStop(1, '#561030');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    let rg = c.createRadialGradient(W * 0.9, 120, 0, W * 0.9, 120, 800);
    rg.addColorStop(0, 'rgba(255,45,67,.55)'); rg.addColorStop(1, 'rgba(255,45,67,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    rg = c.createRadialGradient(100, H - 120, 0, 100, H - 120, 760);
    rg.addColorStop(0, 'rgba(245,197,24,.24)'); rg.addColorStop(1, 'rgba(245,197,24,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 3;
    [240, 380, 520].forEach((r) => { c.beginPath(); c.arc(W - 40, 200, r, 0, Math.PI * 2); c.stroke(); });

    // marca + ano
    c.font = '800 54px ' + FD; c.fillStyle = '#fff';
    c.fillText('Pipoca', M, 124);
    const wp = c.measureText('Pipoca').width;
    c.fillStyle = '#ff2d43'; c.fillText('Flix', M + wp, 124);
    rr(c, W - M - 170, 78, 170, 64, 32); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.stroke();
    c.font = '800 34px ' + FD; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(R.ano), W - M - 85, 122); c.textAlign = 'left';

    // título
    c.font = '700 28px ' + FB; c.fillStyle = '#f5c518';
    espacado(c, 'SEU ANO NO PIPOCAFLIX', M, 240, 7);
    c.font = '800 236px ' + FD;
    const gy = c.createLinearGradient(0, 270, 0, 470);
    gy.addColorStop(0, '#ffffff'); gy.addColorStop(1, '#ffd0a0');
    c.fillStyle = gy; c.fillText(String(R.ano), M - 6, 452);
    if (ctx.nome) {
      c.font = '600 46px ' + FB + FE; c.fillStyle = 'rgba(255,255,255,.88)';
      c.fillText(quebrar(c, ctx.nome + ', esse foi o seu ano 🍿', W - 2 * M, 1)[0], M, 522);
    }

    // número grande
    const gr = grandeza(R.segTotal);
    const bigTxt = usaHoras ? gr.n : num(R.titulosN);
    const lab = usaHoras ? gr.un : [R.titulosN === 1 ? 'título' : 'títulos', 'assistidos'];
    const px = ajustar(c, bigTxt, 520, (p) => '800 ' + p + 'px ' + FD, 300, 120);
    const topoNum = 596, base = topoNum + Math.round(px * 0.76);
    c.fillStyle = '#fff'; c.fillText(bigTxt, M - 8, base);
    const nW = c.measureText(bigTxt).width;
    c.font = '700 60px ' + FD; c.fillStyle = 'rgba(255,255,255,.92)';
    c.fillText(lab[0], M + nW + 30, base - 72); c.fillText(lab[1], M + nW + 30, base - 4);
    if (usaHoras && R.filmesEq >= 2) { c.font = '600 42px ' + FB; c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText('≈ ' + num(R.filmesEq) + ' filmes assistidos de ponta a ponta', M, base + 100); }   // +100: a vírgula do "7,9" desce abaixo da linha

    // três números
    const mini = usaHoras
      ? [[num(R.titulosN), 'títulos'], [num(R.diasAtivos), 'dias ativos'], [num(R.melhorSeq), 'maior sequência']]
      : [[num(R.diasAtivos), 'dias ativos'], [num(R.melhorSeq), 'maior sequência'], [num(R.notas.qtd), 'notas dadas']];
    const yM = 968, cw = (W - 2 * M - 2 * 22) / 3;
    mini.forEach((m, k) => {
      const x = M + k * (cw + 22);
      rr(c, x, yM, cw, 170, 30); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke();
      c.textAlign = 'center';
      ajustar(c, m[0], cw - 36, (p) => '800 ' + p + 'px ' + FD, 76, 36); c.fillStyle = '#fff'; c.fillText(m[0], x + cw / 2, yM + 98);
      c.font = '600 26px ' + FB; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(m[1], x + cw / 2, yM + 142);
      c.textAlign = 'left';
    });

    // título mais assistido / gênero / perfil
    let y = yM + 170 + 32;
    const painel = (yy, hh) => { rr(c, M, yy, W - 2 * M, hh, 36); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke(); };
    const rotulo = (txt, x, yy) => { c.font = '700 23px ' + FB; c.fillStyle = '#f5c518'; espacado(c, txt, x, yy, 5); };
    const dupla = (yy, hh) => {
      const w2 = (W - 2 * M - 22) / 2;
      if (R.generoFav) {
        rr(c, M, yy, w2, hh, 30); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke();
        rotulo('GÊNERO FAVORITO', M + 28, yy + 52);
        ajustar(c, R.generoFav, w2 - 56, (p) => '800 ' + p + 'px ' + FD, 50, 26); c.fillStyle = '#fff'; c.fillText(R.generoFav, M + 28, yy + 116);
      }
      const x2 = R.generoFav ? M + w2 + 22 : M, wp2 = R.generoFav ? w2 : W - 2 * M;
      rr(c, x2, yy, wp2, hh, 30); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke();
      rotulo('VOCÊ É', x2 + 28, yy + 52);
      const t = R.perfil.emoji + ' ' + R.perfil.nome;
      c.font = '800 38px ' + FD + FE; ajustar(c, t, wp2 - 56, (p) => '800 ' + p + 'px ' + FD + FE, 38, 22); c.fillStyle = '#fff'; c.fillText(t, x2 + 28, yy + 116);
    };
    if (titulo) {
      const hh = 396;
      painel(y, hh);
      const px0 = M + 34, py0 = y + 34, pw = 245, ph = 332;
      c.save(); rr(c, px0, py0, pw, ph, 22); c.clip();
      if (poster) {
        const esc2 = Math.max(pw / poster.naturalWidth, ph / poster.naturalHeight);
        const dw = poster.naturalWidth * esc2, dh = poster.naturalHeight * esc2;
        c.drawImage(poster, px0 + (pw - dw) / 2, py0 + (ph - dh) / 2, dw, dh);
      } else {
        const gp = c.createLinearGradient(px0, py0, px0 + pw, py0 + ph); gp.addColorStop(0, '#ff2d43'); gp.addColorStop(1, '#6d28a8');
        c.fillStyle = gp; c.fillRect(px0, py0, pw, ph);
        c.font = '800 120px ' + FD; c.fillStyle = 'rgba(255,255,255,.9)'; c.textAlign = 'center';
        c.fillText((titulo.nome.trim().charAt(0) || '🎬').toUpperCase(), px0 + pw / 2, py0 + ph / 2 + 42); c.textAlign = 'left';
      }
      c.restore();
      const tx = px0 + pw + 38, tw = W - M - 34 - tx;
      rotulo('TÍTULO MAIS ASSISTIDO', tx, y + 84);
      c.font = '800 52px ' + FD; c.fillStyle = '#fff';
      const lin = quebrar(c, titulo.nome, tw, 3);
      lin.forEach((l, k) => c.fillText(l, tx, y + 158 + k * 62));
      c.font = '600 36px ' + FB; c.fillStyle = 'rgba(255,255,255,.75)';
      c.fillText(fmtDur(titulo.seg) + (titulo.abertos > 1 ? ' · ' + titulo.abertos + 'x' : ''), tx, y + 158 + lin.length * 62 + 22);
      y += hh + 28;
      dupla(y, 158); y += 158;
    } else {
      if (R.generoFav) {
        painel(y, 230);
        rotulo('GÊNERO FAVORITO', M + 40, y + 74);
        ajustar(c, R.generoFav, W - 2 * M - 80, (p) => '800 ' + p + 'px ' + FD, 92, 44); c.fillStyle = '#fff'; c.fillText(R.generoFav, M + 40, y + 176);
        y += 230 + 30;
      }
      painel(y, 300);
      rotulo('VOCÊ É', M + 40, y + 74);
      c.font = '800 120px ' + FD + FE; c.fillStyle = '#fff'; c.fillText(R.perfil.emoji, M + 40, y + 218);
      c.font = '800 54px ' + FD; ajustar(c, R.perfil.nome, W - 2 * M - 230, (p) => '800 ' + p + 'px ' + FD, 54, 28); c.fillText(R.perfil.nome, M + 200, y + 168);
      c.font = '600 32px ' + FB; c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText(quebrar(c, R.perfil.desc, W - 2 * M - 230, 1)[0], M + 200, y + 216);
      y += 300;
    }

    // rodapé
    c.textAlign = 'center';
    c.font = '600 34px ' + FB; const t1 = 'Qual foi o seu ano?  ';
    c.font = '700 38px ' + FD; const t2 = SITE;
    c.font = '600 34px ' + FB; const w1 = c.measureText(t1).width;
    c.font = '700 38px ' + FD; const w2b = c.measureText(t2).width;
    const x0 = (W - (w1 + w2b)) / 2;
    c.textAlign = 'left';
    c.font = '600 34px ' + FB; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(t1, x0, H - 62);
    c.font = '700 38px ' + FD; c.fillStyle = '#fff'; c.fillText(t2, x0 + w1, H - 62);

    return new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('canvas vazio'))), 'image/png'));
  }

  /* — preparo antecipado: a imagem fica pronta antes do clique (o "compartilhar" do celular exige que a
       chamada aconteça logo depois do toque) — */
  let preparo = null, preparoTimer = null;
  const assinatura = (R) => [R.ano, Math.round(R.segTotal), R.titulosN, R.diasAtivos, R.melhorSeq, R.generoFav, R.topo[0] && R.topo[0].nome, R.perfilId, R.notas.qtd].join('|');
  function agendarPreparo(ja) {
    clearTimeout(preparoTimer);
    if (!ultimo || !ultimo.R.temDados) return;
    const painelAno = $('painel-ano');
    if (!ja && !(painelAno && !painelAno.hidden)) return;       // só prepara com a aba "Seu ano" aberta (ou a pedido)
    preparoTimer = setTimeout(() => { obterImagem(ultimo.R, ctxAtual()).catch(() => {}); }, ja ? 0 : 900);
  }
  function obterImagem(R, ctx) {
    const sig = assinatura(R) + '|' + ctx.nome;
    if (preparo && preparo.sig === sig) return preparo.p;
    const p = gerarImagem(R, ctx);
    preparo = { sig, p };
    p.catch(() => { if (preparo && preparo.p === p) preparo = null; });
    return p;
  }
  const textoCompartilhar = (R) => {
    const p = [];
    if (R.segTotal >= 600) p.push(grandeza(R.segTotal).n + ' ' + grandeza(R.segTotal).un.join(' '));
    p.push(pl(R.titulosN, 'título', 'títulos'));
    if (R.melhorSeq >= 2) p.push('sequência de ' + R.melhorSeq + ' dias 🔥');
    return 'Meu ano no PipocaFlix ' + R.ano + ' 🍿 ' + p.join(' · ') + '. Qual foi o seu? https://' + SITE;
  };

  async function compartilhar(R, ctx, btn) {
    const rot = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando imagem…'; }
    try {
      const blob = await obterImagem(R, ctx);
      const arq = new File([blob], 'pipocaflix-seu-ano-' + R.ano + '.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: 'Meu ano no PipocaFlix ' + R.ano, text: textoCompartilhar(R) }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; /* qualquer outro erro: cai na prévia */ }
      }
      abrirPrevia(blob, R);
    } catch (e) {
      console.warn('[Game] imagem:', e);
      toast('Não consegui gerar a imagem agora 😕 Tenta de novo em instantes.');
    } finally { if (btn) { btn.disabled = false; btn.textContent = rot; } }
  }
  async function baixar(R, ctx, btn) {
    const rot = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando imagem…'; }
    try {
      const blob = await obterImagem(R, ctx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'pipocaflix-seu-ano-' + R.ano + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { console.warn('[Game] imagem:', e); toast('Não consegui gerar a imagem agora 😕'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = rot; } }
  }
  function abrirPrevia(blob, R) {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('div');
    el.className = 'pfx-g-previa'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Imagem do seu ano');
    el.innerHTML = '<img src="' + url + '" alt="Resumo do seu ano no PipocaFlix ' + R.ano + '"><p>No celular, segure na imagem pra salvar ou compartilhar. 🍿</p>' +
      '<div class="pfx-g-previa-bts"><a class="main" href="' + url + '" download="pipocaflix-seu-ano-' + R.ano + '.png">⬇️ Baixar imagem</a><button type="button">Fechar</button></div>';
    const antes = document.activeElement;
    const fechar = () => { el.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', tecla, true); devolverFoco(antes, abertoOv ? '.pfx-g-ov .pfx-g-x' : '#pfxAno [data-act="share"]'); };
    const tecla = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); }
      else if (e.key === 'Tab') {
        const f = el.querySelectorAll('a[href], button');
        const p = Array.prototype.indexOf.call(f, document.activeElement);
        e.preventDefault(); e.stopPropagation();
        f[(p + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    el.querySelector('button').addEventListener('click', fechar);
    el.addEventListener('click', (e) => { if (e.target === el) fechar(); });
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(el);
    el.querySelector('a').focus();
  }

  /* ═════════════════════════ partida ═════════════════════════ */
  function esperar(cond, cb, tent) {
    if (cond()) return cb();
    if ((tent || 0) > 60) return;
    setTimeout(() => esperar(cond, cb, (tent || 0) + 1), 200);
  }
  function limpar() {
    token++; estado = novoEstado(null); ultimo = null;
    const chip = $('pfxStreakChip'); if (chip) chip.hidden = true;
    fecharHistoria();
  }
  let deb = null;
  window.addEventListener('pflix:sync', () => { clearTimeout(deb); deb = setTimeout(desenhar, 250); });   // outro aparelho mudou algo

  const chip = $('pfxStreakChip');
  if (chip) chip.addEventListener('click', () => {
    location.hash = '#conquistas';
    const p = $('painel-conquistas');
    if (p && p.scrollIntoView) setTimeout(() => p.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  });
  esperar(() => window.PipocaAuth, () => {
    window.PipocaAuth.onAuthChanged((u) => { if (u) iniciar(); else limpar(); });
  });
  // quem abre a aba "Seu ano" depois da página carregada: já deixa a imagem pronta
  window.addEventListener('hashchange', () => agendarPreparo());

  window.PipocaGame = {
    abrirHistoria: () => { if (ultimo) abrirHistoria(ultimo.R, ctxAtual()); },
    gerarImagem: () => (ultimo ? obterImagem(ultimo.R, ctxAtual()) : Promise.reject(new Error('sem dados'))),
    atualizar: iniciar,
    calc: { calcularAno, calcSeq, calcGeral, calcNivel, calcConquistas, montarCalendario, minutosDe, generosDe, grandeza, fmtDur },
    __debug: { get estado() { return estado; }, get ultimo() { return ultimo; }, gerarImagemDe: gerarImagem, montarSlides, abrirHistoriaDe: abrirHistoria }
  };
})();
