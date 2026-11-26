// Team season box score: cumulative player stats for one team, with game filters.
(function () {
  'use strict';
  const root = document.getElementById('teambox-app');
  const dataEl = document.getElementById('teambox-data');
  if (!root || !dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const K = D.keys, ix = Object.fromEntries(K.map((k, i) => [k, i]));
  const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
  const pct = (m, a) => (a > 0 ? 100 * m / a : null);
  const S = { filter: 'all', mode: 'total', sort: 'min', dir: -1 };
  const FILTERS = [['all', 'All games'], ['home', 'Home'], ['away', 'Away'], ['wins', 'Wins'], ['losses', 'Losses']];
  const keep = (g) => S.filter === 'all' || (S.filter === 'home' && g.h) || (S.filter === 'away' && !g.h) || (S.filter === 'wins' && g.w) || (S.filter === 'losses' && !g.w);

  // [key, label, kind]  kind: c = count (per-mode), p = percentage, i = integer, m = minutes, s = signed
  const COLS = [['gp', 'GP', 'i'], ['gs', 'GS', 'i'], ['min', 'MIN', 'm'], ['pts', 'PTS', 'c'],
    ['fgm2', '2PM', 'c'], ['fga2', '2PA', 'c'], ['p2', '2P%', 'p'], ['fgm3', '3PM', 'c'], ['fga3', '3PA', 'c'], ['p3', '3P%', 'p'],
    ['fgm', 'FGM', 'c'], ['fga', 'FGA', 'c'], ['pfg', 'FG%', 'p'], ['ftm', 'FTM', 'c'], ['fta', 'FTA', 'c'], ['pft', 'FT%', 'p'],
    ['oreb', 'ORB', 'c'], ['dreb', 'DRB', 'c'], ['reb', 'REB', 'c'], ['ast', 'AST', 'c'], ['stl', 'STL', 'c'], ['tov', 'TOV', 'c'],
    ['blk', 'BLK', 'c'], ['blka', 'BLKA', 'c'], ['pf', 'PF', 'c'], ['fd', 'FD', 'c'], ['pm', '+/-', 's'], ['pir', 'PIR', 'c']];

  function aggregate() {
    const by = new Map(), games = D.games.filter(keep);
    const team = { gp: games.length, gs: 0, min: 0, pm: 0, s: new Array(K.length).fill(0) };
    for (const g of games) {
      team.min += g.min; team.pm += g.pm; g.team.forEach((v, i) => { team.s[i] += v; });
      for (const row of g.p) {
        const [id, st, min, pm, ...vals] = row;
        if (!by.has(id)) by.set(id, { id, gp: 0, gs: 0, min: 0, pm: 0, s: new Array(K.length).fill(0) });
        const r = by.get(id); r.gp++; r.gs += st; r.min += min; r.pm += pm; vals.forEach((v, i) => { r.s[i] += v; });
      }
    }
    return { rows: [...by.values()].map(derive), team: derive(team), games: games.length };
  }
  function derive(r) {
    const s = (k) => r.s[ix[k]];
    const fgm = s('fgm2') + s('fgm3'), fga = s('fga2') + s('fga3');
    return { id: r.id, gp: r.gp, gs: r.gs, min: r.min, pm: r.pm, fgm, fga,
      ...Object.fromEntries(K.map((k) => [k, s(k)])),
      p2: pct(s('fgm2'), s('fga2')), p3: pct(s('fgm3'), s('fga3')), pfg: pct(fgm, fga), pft: pct(s('ftm'), s('fta')) };
  }
  const val = (x, [k, , kind]) => {
    const v = x[k];
    if ((kind === 'c' || kind === 'm' || kind === 's') && S.mode === 'game') return x.gp ? v / x.gp : 0;
    return v;
  };
  const text = (x, c) => {
    const v = val(x, c), kind = c[2];
    if (kind === 'i') return v === '–' ? '–' : String(v);
    if (kind === 'p') return f1(v);
    if (kind === 's') { const n = S.mode === 'game' ? v : Math.round(v); return (n > 0 ? '+' : n < 0 ? '−' : '') + (S.mode === 'game' ? Math.abs(n).toFixed(1) : Math.abs(n)); }
    if (kind === 'm') return S.mode === 'game' ? f1(v) : String(Math.round(v));
    return S.mode === 'game' ? f1(v) : String(v);
  };

  const pill = (opts, cur, on, label) => {
    const g = el('div', { class: 'tabs', role: 'group', 'aria-label': label }, opts.map(([k, l]) => el('button', { type: 'button', 'aria-pressed': k === cur ? 'true' : 'false', onclick: (e) => {
      on(k); g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); draw();
    } }, l)));
    return g;
  };
  const body = el('div');
  root.replaceChildren(el('div', { class: 'tb-controls' },
    pill(FILTERS, S.filter, (k) => { S.filter = k; }, 'Games'),
    pill([['total', 'Totals'], ['game', 'Per game']], S.mode, (k) => { S.mode = k; }, 'Per mode')), body);

  function draw() {
    const { rows, team, games } = aggregate();
    const col = COLS.find((c) => c[0] === S.sort);
    rows.sort((a, b) => S.dir * ((val(a, col) ?? -1) - (val(b, col) ?? -1)) || b.min - a.min);
    const head = el('tr', {}, el('th', { scope: 'col' }, 'Player'), COLS.map((c) => el('th', { scope: 'col', class: 'num', 'aria-sort': S.sort === c[0] ? (S.dir < 0 ? 'descending' : 'ascending') : null },
      el('button', { type: 'button', onclick: () => { if (S.sort === c[0]) S.dir = -S.dir; else { S.sort = c[0]; S.dir = -1; } draw(); } }, c[1]))));
    const tr = (x, name, cls) => el('tr', { class: cls || null }, el('td', {}, name), COLS.map((c) => el('td', { class: 'num' + (S.sort === c[0] ? ' sorted' : '') }, text(x, c))));
    const sum = { ...team, gs: '' };
    body.replaceChildren(
      games ? el('div', { class: 'scroll tb-scroll' }, el('table', { class: 'tb-table' }, el('thead', {}, head),
        el('tbody', {}, rows.map((x) => tr(x, el('a', { href: D.players[x.id]?.[1] || '#' }, D.players[x.id]?.[0] || x.id)))),
        el('tfoot', {}, tr({ ...sum, gs: '–' }, el('strong', {}, `Team totals (${games} game${games === 1 ? '' : 's'})`), 'tb-total'))))
        : el('p', { class: 'muted' }, 'No games match this filter yet.'),
      el('p', { class: 'muted small' }, 'Team totals are the official team line from each box score (they include team rebounds, so they can be a little higher than the players’ sum). Click a column to sort from highest to lowest; click again to flip.'));
  }
  draw();
})();
