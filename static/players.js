// Players stats tool: every stat we have, in tabs, with per-game / totals / per-40 modes,
// filters, sorting and league-rank colours.
(function () {
  'use strict';
  const root = document.getElementById('players-app');
  if (!root) return;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const div = (a, b) => (b > 0 ? a / b : null);
  const fx = (d) => (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));
  const f1 = fx(1), f2 = fx(2), f0 = fx(0);
  const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1));

  fetch('player-stats.json').then((r) => r.json()).then((D) => {
    const TK = D.tk;
    const crest = Object.fromEntries(D.teams.map(([c, , u]) => [c, u]));
    const rows = D.players.map(([name, tv, team, href, pos, ht, wt, age, nat, num, gp, gs, min, pm, q, tot, usg, ctx, pb, of, misc, traded]) => {
      const t = Object.fromEntries(TK.map((k, i) => [k, tot[i]]));
      const fgm = t.fgm2 + t.fgm3, fga = t.fga2 + t.fga3, plays = fga + 0.44 * t.fta + t.tov;
      const c = ctx ? { oppPoss: ctx[0], opp2a: ctx[1], drebCh: ctx[2], orebCh: ctx[3], rebCh: ctx[4], teamFgm: ctx[5] } : null;
      const P = pb ? { onMin: pb[0], onPoss: pb[1], onO: pb[2], onD: pb[3], offO: pb[4], offD: pb[5], rapm: pb[6] } : null;
      return {
        name, tv, team, href, pos, ht, wt, age, nat, num, gp, gs, min, q, traded,
        ...t, fgm, fga, pm, stocks: t.stl + t.blk, pra: t.pts + t.reb + t.ast,
        mpg: div(min, gp),
        p2: div(100 * t.fgm2, t.fga2), p3: div(100 * t.fgm3, t.fga3), pfg: div(100 * fgm, fga), pft: div(100 * t.ftm, t.fta),
        efg: div(100 * (fgm + 0.5 * t.fgm3), fga), ts: div(100 * t.pts, 2 * (fga + 0.44 * t.fta)),
        r3: div(100 * t.fga3, fga), ftr: div(100 * t.fta, fga), pps: div(t.pts, fga), ppp: div(t.pts, plays),
        pts2: div(100 * 2 * t.fgm2, t.pts), pts3: div(100 * 3 * t.fgm3, t.pts), ptsFt: div(100 * t.ftm, t.pts),
        usg, astTo: div(t.ast, t.tov), tovp: div(100 * t.tov, plays),
        astp: c ? div(100 * t.ast, c.teamFgm - fgm) : null, orbp: c ? div(100 * t.oreb, c.orebCh) : null, drbp: c ? div(100 * t.dreb, c.drebCh) : null,
        trbp: c ? div(100 * t.reb, c.rebCh) : null, stlp: c ? div(100 * t.stl, c.oppPoss) : null, blkp: c ? div(100 * t.blk, c.opp2a) : null,
        pir40: div(40 * t.pir, min), pts40: div(40 * t.pts, min), pm40: div(40 * pm, min),
        onMin: P?.onMin ?? null, onPoss: P?.onPoss ?? null, onO: P?.onO ?? null, onD: P?.onD ?? null,
        onNet: P && P.onO != null ? P.onO - P.onD : null, offNet: P && P.offO != null ? P.offO - P.offD : null,
        swing: P && P.offO != null && P.onPoss >= 20 ? (P.onO - P.onD) - (P.offO - P.offD) : null,
        oSwing: P && P.offO != null ? P.onO - P.offO : null, dSwing: P && P.offD != null ? P.offD - P.onD : null, rapm: P?.rapm ?? null,
        chg: of[0], ofc: of[1], chg40: div(40 * of[0], min),
        dd: misc[0], td: misc[1], g20: misc[2], hiPts: misc[3], hiReb: misc[4], hiAst: misc[5], hiPir: misc[6]
      };
    });

    // [key, label, kind, better(1 high good / 0 low good / null none), tip]
    // kind: c = count (follows mode), s = signed count (follows mode), p = % or rate, p2 = 2 decimals, r = signed rate, i = integer, t = text
    const TABS = {
      trad: { label: 'Traditional', cols: [['gp', 'GP', 'i', null], ['gs', 'GS', 'i', null], ['min', 'MIN', 'm', null], ['pts', 'PTS', 'c', 1], ['fgm2', '2PM', 'c', 1], ['fga2', '2PA', 'c', null], ['p2', '2P%', 'p', 1],
        ['fgm3', '3PM', 'c', 1], ['fga3', '3PA', 'c', null], ['p3', '3P%', 'p', 1], ['ftm', 'FTM', 'c', 1], ['fta', 'FTA', 'c', 1], ['pft', 'FT%', 'p', 1],
        ['oreb', 'ORB', 'c', 1], ['dreb', 'DRB', 'c', 1], ['reb', 'TRB', 'c', 1], ['ast', 'AST', 'c', 1], ['stl', 'STL', 'c', 1], ['tov', 'TOV', 'c', 0], ['blk', 'BLK', 'c', 1], ['blka', 'BLKA', 'c', 0, 'Shots of his that were blocked'],
        ['pf', 'PF', 'c', 0], ['fd', 'FD', 'c', 1, 'Fouls drawn'], ['pir', 'PIR', 'c', 1], ['pm', '+/-', 's', 1]] },
      shoot: { label: 'Shooting', cols: [['fgm', 'FGM', 'c', 1], ['fga', 'FGA', 'c', null], ['pfg', 'FG%', 'p', 1], ['p2', '2P%', 'p', 1], ['p3', '3P%', 'p', 1], ['pft', 'FT%', 'p', 1],
        ['efg', 'eFG%', 'p', 1, 'Field goal % with threes worth 1.5'], ['ts', 'TS%', 'p', 1, 'True shooting: points per shooting possession, free throws included'],
        ['r3', '%3PA', 'p', null, 'Share of his shots that are threes'], ['ftr', 'FT RATE', 'p', 1, 'Free throws per 100 field-goal attempts'], ['pps', 'PTS/SHOT', 'p2', 1, 'Points per field-goal attempt'],
        ['ppp', 'PTS/PLAY', 'p2', 1, 'Points per play (FGA + 0.44×FTA + TOV)'], ['pts2', '% PTS 2PT', 'p', null], ['pts3', '% PTS 3PT', 'p', null], ['ptsFt', '% PTS FT', 'p', null]] },
      adv: { label: 'Advanced', cols: [['usg', 'USG%', 'p', null, 'Share of team possessions he uses while on the court'], ['astp', 'AST%', 'p', 1, 'Share of teammates’ baskets he assisted while on the court'],
        ['astTo', 'AST/TO', 'p2', 1], ['tovp', 'TOV%', 'p', 0, 'Turnovers per 100 of his plays'], ['orbp', 'ORB%', 'p', 1, 'Share of available offensive rebounds he grabbed'],
        ['drbp', 'DRB%', 'p', 1, 'Share of available defensive rebounds he grabbed'], ['trbp', 'TRB%', 'p', 1], ['stlp', 'ST%', 'p', 1, 'Steals per 100 opponent possessions while he plays'],
        ['blkp', 'BLK%', 'p', 1, 'Share of opponent 2-pt shots he blocked while he plays'], ['pir40', 'PIR/40', 'p', 1], ['pts40', 'PTS/40', 'p', 1], ['pm40', '+/- /40', 'r', 1], ['pra', 'PRA', 'c', 1], ['stocks', 'STOCKS', 'c', 1]] },
      def: { label: 'Defense', cols: [['stl', 'STL', 'c', 1], ['blk', 'BLK', 'c', 1], ['dreb', 'DRB', 'c', 1], ['stocks', 'STOCKS', 'c', 1], ['stlp', 'ST%', 'p', 1], ['blkp', 'BLK%', 'p', 1], ['drbp', 'DRB%', 'p', 1],
        ['chg', 'CHARGES', 'c', 1, 'Offensive fouls drawn (charges, illegal screens, push-offs)'], ['chg40', 'CHG/40', 'p2', 1], ['pf', 'PF', 'c', 0],
        ['onD', 'ON DRTG', 'p', 0, 'Points allowed per 100 possessions with him on the court'], ['dSwing', 'DEF ON/OFF', 'r', 1, 'How many fewer points per 100 his team allows with him on the court']] },
      impact: { label: 'On/off & impact', note: 'From the official play-by-play (games that match the box score exactly). Ratings are points per 100 possessions.', cols: [
        ['onMin', 'MIN ON', 'p', null, 'Minutes on court in play-by-play games'], ['onPoss', 'POSS', 'i', null], ['onO', 'ON ORTG', 'p', 1], ['onD', 'ON DRTG', 'p', 0], ['onNet', 'ON NET', 'r', 1], ['offNet', 'OFF NET', 'r', null, 'Team net rating with him on the bench'],
        ['swing', 'SWING', 'r', 1, 'On net minus off net'], ['oSwing', 'OFF ON/OFF', 'r', 1, 'Team offense with him on minus off'], ['dSwing', 'DEF ON/OFF', 'r', 1, 'Team defense with him on vs off (positive = better)'],
        ['rapm', 'IMPACT', 'r', 1, 'RAPM: points per 100 possessions he adds, adjusted for teammates and opponents'], ['pm', '+/-', 's', 1]] },
      misc: { label: 'Highs & misc', cols: [['dd', 'DBL-DBL', 'i', 1], ['td', 'TRP-DBL', 'i', 1], ['g20', '20+ PTS', 'i', 1, 'Games with 20 or more points'], ['hiPts', 'HIGH PTS', 'i', 1], ['hiReb', 'HIGH REB', 'i', 1], ['hiAst', 'HIGH AST', 'i', 1], ['hiPir', 'HIGH PIR', 'i', 1],
        ['fd', 'FD', 'c', 1], ['ofc', 'OFF FOULS', 'c', 0, 'Offensive fouls committed'], ['blka', 'BLKA', 'c', 0]] },
      bio: { label: 'Profile', cols: [['num', '#', 't', null], ['pos', 'POS', 't', null], ['ht', 'HEIGHT', 'i', null], ['wt', 'WEIGHT', 'i', null], ['age', 'AGE', 'i', null], ['nat', 'NATIONALITY', 't', null], ['gp', 'GP', 'i', null], ['gs', 'GS', 'i', null], ['mpg', 'MPG', 'p', null]] }
    };
    const S = { tab: 'trad', mode: 'game', sort: 'pts', dir: -1, team: '', pos: '', min: 'q', gp: 0, q: '' };
    const value = (x, [k, , kind]) => {
      const v = x[k];
      if (v == null) return null;
      if (kind === 'm') return S.mode === 'tot' ? v : div(v, x.gp);
      if (kind === 'c' || kind === 's') return S.mode === 'tot' ? v : S.mode === 'p40' ? div(40 * v, x.min) : div(v, x.gp);
      return v;
    };
    const fmt = (v, [, , kind, , ], k) => {
      if (kind === 't') return v || '–';
      if (v == null) return '–';
      if (kind === 'i') return f0(v);
      if (kind === 'm') return S.mode === 'tot' ? f0(v) : f1(v);
      if (kind === 'p2') return f2(v);
      if (kind === 'r') return sg(v);
      if (kind === 's') return S.mode === 'tot' ? (v > 0 ? '+' : '') + v : sg(v);
      if (kind === 'c') return S.mode === 'tot' ? (k === 'min' ? f0(v) : String(Math.round(v * 10) / 10)) : f1(v);
      return f1(v);
    };
    const MIN_ATT = { p2: (x) => x.fga2 >= 20, p3: (x) => x.fga3 >= 15, pft: (x) => x.fta >= 15, pfg: (x) => x.fga >= 30, efg: (x) => x.fga >= 30, ts: (x) => x.fga >= 30, pps: (x) => x.fga >= 30, ppp: (x) => x.fga >= 30, astTo: (x) => x.tov >= 5 };
    const pass = (x) => (!S.team || x.team === S.team) && (!S.pos || x.pos === S.pos) && x.gp >= Number(S.gp) && (!S.q || x.name.toLowerCase().includes(S.q)) && (S.min === 'q' ? x.q : (x.mpg || 0) >= Number(S.min));

    // controls
    const tabBar = el('div', { class: 'tabs tm-tabs', role: 'group', 'aria-label': 'Stat group' }, Object.entries(TABS).map(([k, t]) => el('button', { type: 'button', 'data-k': k, onclick: () => { S.tab = k; const c = TABS[k].cols.find((c) => c[3] != null) || TABS[k].cols[0]; S.sort = c[0]; S.dir = c[3] === 0 ? 1 : -1; draw(); } }, t.label)));
    const modeBar = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Per mode' }, [['game', 'Per game'], ['tot', 'Totals'], ['p40', 'Per 40 min']].map(([k, l]) => el('button', { type: 'button', 'data-k': k, onclick: () => { S.mode = k; draw(); } }, l)));
    const sel = (key, label, opts) => el('label', {}, label, ' ', el('select', { 'aria-label': label, onchange: (e) => { S[key] = e.target.value; draw(); } }, opts.map(([v, t]) => el('option', { value: v }, t))));
    const positions = [...new Set(rows.map((r) => r.pos).filter(Boolean))].sort();
    const search = el('input', { type: 'search', placeholder: 'Find a player…', 'aria-label': 'Find a player', oninput: (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); } });
    const count = el('span', { class: 'muted small' });
    const filters = el('div', { class: 'filters pl-filters' }, sel('team', 'Team', [['', 'All teams'], ...D.teams.map(([c, n]) => [c, n])]), positions.length ? sel('pos', 'Position', [['', 'All'], ...positions.map((p) => [p, p])]) : null,
      sel('min', 'Players', [['q', 'Qualified (10+ min, 40% of games)'], ['0', 'Everyone'], ['5', '5+ min'], ['15', '15+ min'], ['20', '20+ min'], ['25', '25+ min']]), sel('gp', 'Games', [['0', 'Any'], ['3', '3+'], ['5', '5+'], ['8', '8+'], ['10', '10+']]), search);
    const note = el('p', { class: 'muted small' });
    const body = el('div', {});
    root.replaceChildren(el('section', { class: 'card tm-controls' }, tabBar, el('div', { class: 'tm-row' }, modeBar, el('div', { class: 'rk-legend' }, el('span', { class: 'rk-1' }, '1st'), el('span', { class: 'rk-2' }, '2nd'), el('span', { class: 'rk-3' }, '3rd'), el('span', { class: 'rk-bot' }, 'Bottom 3'), el('span', { class: 'muted small' }, 'Among the players shown (shooting % need a minimum number of attempts). Click a column to sort.'))), filters, count), el('section', { class: 'card' }, note, body));

    function draw() {
      tabBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === S.tab)));
      modeBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === S.mode)));
      const T = TABS[S.tab], cols = T.cols;
      note.textContent = (T.note ? T.note + ' ' : '') + `${D.note} Per-game and per-40 apply to counting stats; percentages and ratings are for the season.`;
      const list = rows.filter(pass);
      count.textContent = `${list.length} player${list.length === 1 ? '' : 's'}`;
      const sc = cols.find((c) => c[0] === S.sort) || (S.sort === 'name' ? null : cols[0]);
      list.sort((a, b) => {
        if (S.sort === 'name') return a.name.localeCompare(b.name) * -S.dir;
        if (S.sort === 'team') return a.tv.localeCompare(b.tv) * -S.dir;
        const x = value(a, sc), y = value(b, sc);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir;
      });
      // ranks among the players shown
      const rank = new Map();
      for (const c of cols) {
        if (c[3] == null || c[2] === 't') continue;
        const vals = list.filter((x) => !MIN_ATT[c[0]] || MIN_ATT[c[0]](x)).map((x) => [x, value(x, c)]).filter(([, v]) => v != null && Number.isFinite(v));
        if (vals.length < 10 || new Set(vals.map(([, v]) => v)).size < 4) continue;
        vals.sort((a, b) => (c[3] ? b[1] - a[1] : a[1] - b[1]));
        vals.forEach(([x, v], i) => { const r = vals.findIndex(([, w]) => w === v) + 1; rank.set(x.name + x.team + c[0], [r, vals.length]); });
      }
      const head = el('tr', {}, el('th', { scope: 'col', class: 'num' }, '#'),
        el('th', { scope: 'col', 'aria-sort': S.sort === 'name' ? (S.dir < 0 ? 'descending' : 'ascending') : null }, el('button', { type: 'button', onclick: () => { S.dir = S.sort === 'name' ? -S.dir : -1; S.sort = 'name'; draw(); } }, 'Player')),
        el('th', { scope: 'col' }, el('button', { type: 'button', onclick: () => { S.dir = S.sort === 'team' ? -S.dir : -1; S.sort = 'team'; draw(); } }, 'Team')),
        cols.map((c) => el('th', { scope: 'col', class: 'num', title: c[4] || null, 'aria-sort': S.sort === c[0] ? (S.dir < 0 ? 'descending' : 'ascending') : null },
          el('button', { type: 'button', onclick: () => { if (S.sort === c[0]) S.dir = -S.dir; else { S.sort = c[0]; S.dir = c[3] === 0 ? 1 : -1; } draw(); } }, c[1]))));
      const trs = list.map((x, i) => el('tr', {}, el('td', { class: 'num muted' }, String(i + 1)),
        el('td', {}, el('a', { href: x.href }, x.name), x.traded ? el('span', { class: 'muted small', title: 'Played for more than one team' }, ' *') : null),
        el('td', {}, crest[x.team] ? el('img', { class: 'crest', src: crest[x.team], alt: '', width: '18', height: '18', loading: 'lazy' }) : null, ' ', x.tv),
        cols.map((c) => { const v = value(x, c), rk = rank.get(x.name + x.team + c[0]); const cls = 'num' + (rk ? (rk[0] <= 3 ? ' rk-' + rk[0] : rk[0] > rk[1] - 3 ? ' rk-bot' : '') : ''); return el('td', { class: cls }, fmt(v, c, c[0])); })));
      body.replaceChildren(el('div', { class: 'scroll tm-scroll' }, el('table', { class: 'tm-table pl-table' }, el('thead', {}, head), el('tbody', {}, trs))),
        el('p', { class: 'muted small' }, '* played for more than one team this season (stats include both). Profile data from the official EuroLeague rosters.'));
    }
    draw();
  }).catch((e) => { console.error(e); root.replaceChildren(el('p', { class: 'muted' }, 'Could not load the player stats.')); });
})();
