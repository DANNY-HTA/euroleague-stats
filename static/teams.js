// Teams stats tool: tabs of team stats, three per-modes, sortable, coloured by league rank.
(function () {
  'use strict';
  const root = document.getElementById('teams-app');
  if (!root) return;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const div = (a, b) => (b > 0 ? a / b : null);
  const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
  const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1));
  const ord = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  fetch('teams.json').then((r) => r.json()).then((D) => {
    const S = { tab: 'trad', mode: 'game', sort: null, dir: -1 };

    // Derived numbers for one team. s = own totals, o = opponent totals.
    function derive(T) {
      const s = T.raw.tot, o = T.raw.opp, gp = T.gp, poss = T.raw.poss, min = T.raw.min;
      const fgm = s.fgm2 + s.fgm3, fga = s.fga2 + s.fga3, ofgm = o.fgm2 + o.fgm3, ofga = o.fga2 + o.fga3;
      const plays = fga + 0.44 * s.fta + s.tov, oplays = ofga + 0.44 * o.fta + o.tov;
      const sp = T.split || {};
      return {
        T, gp, poss, min, s, o,
        // traditional (counts)
        pts: s.pts, fgm2: s.fgm2, fga2: s.fga2, fgm3: s.fgm3, fga3: s.fga3, fgm, fga, ftm: s.ftm, fta: s.fta,
        oreb: s.oreb, dreb: s.dreb, reb: s.reb, ast: s.ast, tov: s.tov, stl: s.stl, blk: s.blk, blka: s.blka, pf: s.pf, fd: s.fd, pir: s.pir,
        pm: T.raw.pf - T.raw.pa,
        // opponents (counts)
        o_pts: o.pts, o_fgm2: o.fgm2, o_fga2: o.fga2, o_fgm3: o.fgm3, o_fga3: o.fga3, o_fgm: ofgm, o_fga: ofga, o_ftm: o.ftm, o_fta: o.fta,
        o_oreb: o.oreb, o_dreb: o.dreb, o_reb: o.reb, o_ast: o.ast, o_tov: o.tov, o_stl: o.stl, o_blk: o.blk, o_pf: o.pf, o_pir: o.pir,
        // percentages
        p2: div(100 * s.fgm2, s.fga2), p3: div(100 * s.fgm3, s.fga3), pfg: div(100 * fgm, fga), pft: div(100 * s.ftm, s.fta),
        o_p2: div(100 * o.fgm2, o.fga2), o_p3: div(100 * o.fgm3, o.fga3), o_pfg: div(100 * ofgm, ofga), o_pft: div(100 * o.ftm, o.fta),
        // advanced
        possPg: poss / gp, pace: div(40 * poss, min / 5), ortg: div(100 * T.raw.pf, poss), drtg: div(100 * T.raw.pa, poss), net: div(100 * (T.raw.pf - T.raw.pa), poss),
        efg: div(100 * (fgm + 0.5 * s.fgm3), fga), ts: div(100 * s.pts, 2 * (fga + 0.44 * s.fta)),
        o_efg: div(100 * (ofgm + 0.5 * o.fgm3), ofga), o_ts: div(100 * o.pts, 2 * (ofga + 0.44 * o.fta)),
        tovp: div(100 * s.tov, plays), o_tovp: div(100 * o.tov, oplays),
        orbp: div(100 * s.oreb, s.oreb + o.dreb), drbp: div(100 * s.dreb, s.dreb + o.oreb), trbp: div(100 * s.reb, s.reb + o.reb),
        astp: div(100 * s.ast, fgm), o_astp: div(100 * o.ast, ofgm), astTo: div(s.ast, s.tov), astr: div(100 * s.ast, fga + 0.44 * s.fta + s.ast + s.tov),
        stlp: div(100 * s.stl, poss), blkp: div(100 * s.blk, o.fga2),
        ftr: div(100 * s.fta, fga), o_ftr: div(100 * o.fta, ofga), ftmr: div(100 * s.ftm, fga),
        r3: div(100 * s.fga3, fga), r2: div(100 * s.fga2, fga), o_r3: div(100 * o.fga3, ofga),
        ppp: div(s.pts, plays), o_ppp: div(o.pts, oplays),
        pf100: div(100 * s.pf, poss), fd100: div(100 * s.fd, poss),
        pts2: div(100 * 2 * s.fgm2, s.pts), pts3: div(100 * 3 * s.fgm3, s.pts), ptsFt: div(100 * s.ftm, s.pts),
        sos: sp.sos, adjNet: sp.sos != null && poss ? 100 * (T.raw.pf - T.raw.pa) / poss + sp.sos : null,
        sp
      };
    }
    const rows = D.teams.map(derive);

    // [key, label, kind, better, tip]  kind: c = count (follows per-mode), p = % / rating, s = signed count, r = signed rating, i = integer, t = text
    const R = (k) => (x) => x.sp[k];
    const TABS = {
      trad: { label: 'Traditional', cols: [['gp', 'GP', 'i', null], ['w', 'W', 'i', 1], ['l', 'L', 'i', 0], ['wp', 'W%', 'p', 1],
        ['pts', 'PTS', 'c', 1], ['fgm2', '2PM', 'c', 1], ['fga2', '2PA', 'c', null], ['p2', '2P%', 'p', 1], ['fgm3', '3PM', 'c', 1], ['fga3', '3PA', 'c', null], ['p3', '3P%', 'p', 1],
        ['fgm', 'FGM', 'c', 1], ['fga', 'FGA', 'c', null], ['pfg', 'FG%', 'p', 1], ['ftm', 'FTM', 'c', 1], ['fta', 'FTA', 'c', 1], ['pft', 'FT%', 'p', 1],
        ['oreb', 'ORB', 'c', 1], ['dreb', 'DRB', 'c', 1], ['reb', 'TRB', 'c', 1], ['ast', 'AST', 'c', 1], ['tov', 'TOV', 'c', 0], ['stl', 'STL', 'c', 1], ['blk', 'BLK', 'c', 1],
        ['blka', 'BLKA', 'c', 0], ['pf', 'PF', 'c', 0], ['fd', 'FD', 'c', 1], ['pir', 'PIR', 'c', 1], ['pm', '+/-', 's', 1]] },
      opp: { label: 'Opponents (defense)', note: 'What opponents do against each team. For most columns, lower is better.', cols: [['o_pts', 'OPP PTS', 'c', 0],
        ['o_fgm2', '2PM', 'c', 0], ['o_fga2', '2PA', 'c', null], ['o_p2', '2P%', 'p', 0], ['o_fgm3', '3PM', 'c', 0], ['o_fga3', '3PA', 'c', 0], ['o_p3', '3P%', 'p', 0],
        ['o_fgm', 'FGM', 'c', 0], ['o_fga', 'FGA', 'c', null], ['o_pfg', 'FG%', 'p', 0], ['o_ftm', 'FTM', 'c', 0], ['o_fta', 'FTA', 'c', 0], ['o_pft', 'FT%', 'p', null],
        ['o_oreb', 'ORB', 'c', 0], ['o_dreb', 'DRB', 'c', 0], ['o_reb', 'TRB', 'c', 0], ['o_ast', 'AST', 'c', 0], ['o_tov', 'TOV forced', 'c', 1], ['o_stl', 'STL', 'c', 0], ['o_blk', 'BLK', 'c', 0],
        ['o_pf', 'PF', 'c', null], ['o_pir', 'PIR', 'c', 0], ['o_efg', 'eFG%', 'p', 0], ['o_ts', 'TS%', 'p', 0]] },
      adv: { label: 'Advanced', cols: [['possPg', 'POSS', 'p', null, 'Possessions per game'], ['pace', 'PACE', 'p', null, 'Possessions per 40 minutes'],
        ['ortg', 'OFF RTG', 'p', 1, 'Points scored per 100 possessions'], ['drtg', 'DEF RTG', 'p', 0, 'Points allowed per 100 possessions'], ['net', 'NET RTG', 'r', 1],
        ['sos', 'SoS', 'r', 1, 'Strength of schedule: average net rating of opponents faced'], ['adjNet', 'ADJ NET', 'r', 1, 'Net rating + strength of schedule'],
        ['efg', 'eFG%', 'p', 1], ['ts', 'TS%', 'p', 1], ['tovp', 'TOV%', 'p', 0, 'Turnovers per 100 plays'], ['o_tovp', 'DTOV%', 'p', 1, 'Opponent turnovers per 100 of their plays'],
        ['orbp', 'ORB%', 'p', 1], ['drbp', 'DRB%', 'p', 1], ['trbp', 'TRB%', 'p', 1], ['astp', 'AST%', 'p', 1, 'Share of baskets assisted'], ['astTo', 'AST/TO', 'p2', 1],
        ['astr', 'AST RATIO', 'p', 1, 'Assists per 100 plays'], ['stlp', 'ST%', 'p', 1, 'Steals per 100 opponent possessions'], ['blkp', 'BLK%', 'p', 1, 'Share of opponent 2-pt shots blocked'],
        ['ppp', 'OFF PPP', 'p2', 1, 'Points per play'], ['o_ppp', 'DEF PPP', 'p2', 0, 'Points allowed per play'], ['pf100', 'PF/100', 'p', 0], ['fd100', 'FD/100', 'p', 1]] },
      four: { label: 'Four factors', note: 'The four things that decide games, for offense and defense. Ranks: 1st = best.', cols: [['efg', 'eFG%', 'p', 1], ['tovp', 'TOV%', 'p', 0], ['orbp', 'ORB%', 'p', 1], ['ftr', 'FT RATE', 'p', 1, 'FTA per 100 FGA'],
        ['o_efg', 'OPP eFG%', 'p', 0], ['o_tovp', 'OPP TOV%', 'p', 1], ['drbp', 'DRB%', 'p', 1], ['o_ftr', 'OPP FT RATE', 'p', 0]] },
      shoot: { label: 'Shooting profile', cols: [['r2', '%2PA', 'p', null, 'Share of shots that are twos'], ['r3', '%3PA', 'p', null, 'Share of shots that are threes'], ['ftr', 'FT RATE', 'p', 1, 'FTA per 100 FGA'], ['ftmr', 'FTM/FGA', 'p', 1],
        ['p2', '2P%', 'p', 1], ['p3', '3P%', 'p', 1], ['pft', 'FT%', 'p', 1], ['efg', 'eFG%', 'p', 1], ['ts', 'TS%', 'p', 1],
        ['pts2', '% PTS 2PT', 'p', null, 'Share of points from twos'], ['pts3', '% PTS 3PT', 'p', null, 'Share of points from threes'], ['ptsFt', '% PTS FT', 'p', null, 'Share of points from free throws'],
        ['astp', 'AST%', 'p', 1], ['o_r3', 'OPP %3PA', 'p', 0, 'Share of opponent shots that are threes'], ['o_p3', 'OPP 3P%', 'p', 0]] },
      splits: { label: 'Splits', note: 'Records and margins in different situations. Quarter and half columns are average margins per game.', cols: [
        ['home', 'HOME', 't', 'rec'], ['away', 'AWAY', 't', 'rec'], ['homePpg', 'HOME PTS', 'p', 1], ['homeOpp', 'HOME OPP', 'p', 0], ['awayPpg', 'AWAY PTS', 'p', 1], ['awayOpp', 'AWAY OPP', 'p', 0],
        ['close', '≤5 PTS', 't', 'rec', 'Games decided by 5 points or fewer'], ['big', '10+ PTS', 't', 'rec', 'Games decided by 10 or more'], ['ot', 'OT', 't', 'rec'], ['last5', 'LAST 5', 't', 'rec'], ['streak', 'STREAK', 't', null],
        ['q1', 'Q1', 'r', 1], ['q2', 'Q2', 'r', 1], ['q3', 'Q3', 'r', 1], ['q4', 'Q4', 'r', 1], ['h1', '1ST HALF', 'r', 1], ['h2', '2ND HALF', 'r', 1],
        ['bestWin', 'BEST WIN', 'r', 1, 'Largest winning margin'], ['worstLoss', 'WORST LOSS', 'r', 1, 'Largest losing margin']] }
    };
    const extra = (x, k) => {
      if (k === 'w') return x.T.w; if (k === 'l') return x.T.l; if (k === 'wp') return 100 * x.T.w / (x.gp || 1);
      if (/^q[1-4]$/.test(k)) return x.sp.q ? x.sp.q[+k[1] - 1] : null;
      if (['h1', 'h2', 'homePpg', 'homeOpp', 'awayPpg', 'awayOpp', 'bestWin', 'worstLoss', 'streak'].includes(k)) return x.sp[k];
      if (['home', 'away', 'close', 'big', 'ot', 'last5'].includes(k)) return x.sp[k];
      return x[k];
    };
    function value(x, col) {
      const [k, , kind] = col;
      const v = extra(x, k);
      if (kind !== 'c' && kind !== 's') return v;
      if (S.mode === 'game') return v / (x.gp || 1);
      if (S.mode === '100') return x.poss ? 100 * v / x.poss : null;
      return v;
    }
    const recPct = (r) => (r && r[0] + r[1] ? r[0] / (r[0] + r[1]) : -1);
    function sortKey(x, col) { const v = value(x, col); return col[2] === 't' ? (col[3] === 'rec' ? recPct(v) : (String(v || '').startsWith('W') ? 100 + parseInt(String(v).slice(1)) : -parseInt(String(v || 'L0').slice(1)))) : (v == null ? -Infinity : v); }
    function text(x, col) {
      const v = value(x, col), kind = col[2];
      if (kind === 't') return Array.isArray(v) ? `${v[0]}–${v[1]}` : (v || '–');
      if (kind === 'i') return String(v);
      if (kind === 'p2') return v == null ? '–' : v.toFixed(2);
      if (kind === 'r' || kind === 's') return sg(v);
      if (kind === 'c' && S.mode === 'total') return String(Math.round(v));
      return f1(v);
    }

    const modeTabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Per mode' }, [['game', 'Per game'], ['total', 'Totals'], ['100', 'Per 100 poss']].map(([m, l]) =>
      el('button', { type: 'button', 'aria-pressed': m === S.mode ? 'true' : 'false', onclick: (e) => { S.mode = m; modeTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); draw(); } }, l)));
    const tabBar = el('div', { class: 'tabs tm-tabs', role: 'tablist', 'aria-label': 'Stat group' }, Object.entries(TABS).map(([k, t]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': k === S.tab ? 'true' : 'false', 'aria-pressed': k === S.tab ? 'true' : 'false', onclick: (e) => {
        S.tab = k; S.sort = null; tabBar.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', b === e.currentTarget); b.setAttribute('aria-selected', b === e.currentTarget); }); draw();
      } }, t.label)));
    const body = el('div');
    root.replaceChildren(el('section', { class: 'card tm-controls' }, tabBar, el('div', { class: 'tm-row' }, modeTabs, el('div', { class: 'rk-legend' }, el('span', { class: 'rk-1' }, '1st'), el('span', { class: 'rk-2' }, '2nd'), el('span', { class: 'rk-3' }, '3rd'), el('span', { class: 'rk-bot' }, 'Bottom 3'), el('span', { class: 'muted small' }, 'Click a column to sort.')))), el('section', { class: 'card' }, body));

    function draw() {
      const tab = TABS[S.tab], cols = tab.cols;
      // league ranks per column (only for columns with a direction)
      const ranks = {};
      for (const c of cols) {
        if (c[3] == null || c[2] === 't' && c[3] !== 'rec') continue;
        const high = c[3] === 1 || c[3] === 'rec';
        const vals = rows.map((x) => ({ x, v: sortKey(x, c) })).filter((e) => Number.isFinite(e.v) && e.v !== -Infinity);
        vals.sort((a, b) => (high ? b.v - a.v : a.v - b.v));
        if (!vals.length || vals[0].v === vals[vals.length - 1].v) continue; // everyone equal: nothing to colour
        vals.forEach((e, i) => { (ranks[c[0]] ||= new Map()).set(e.x, i > 0 && vals[i - 1].v === e.v ? ranks[c[0]].get(vals[i - 1].x) : i + 1); });
      }
      const sortCol = cols.find((c) => c[0] === S.sort);
      const list = [...rows].sort((a, b) => sortCol ? S.dir * (sortKey(a, sortCol) - sortKey(b, sortCol)) : (b.T.w - a.T.w) || ((b.T.raw.pf - b.T.raw.pa) - (a.T.raw.pf - a.T.raw.pa)));
      const N = rows.length;
      const head = el('tr', {}, el('th', { scope: 'col', class: 'num' }, '#'), el('th', { scope: 'col' }, 'Team'),
        cols.map((c) => el('th', { scope: 'col', class: 'num', title: c[4] || null, 'aria-sort': S.sort === c[0] ? (S.dir < 0 ? 'descending' : 'ascending') : null },
          el('button', { type: 'button', onclick: () => { if (S.sort === c[0]) S.dir = -S.dir; else { S.sort = c[0]; S.dir = -1; } draw(); } }, c[1]))));
      const trs = list.map((x, i) => el('tr', {}, el('td', { class: 'num muted' }, String(i + 1)),
        el('td', { class: 'team' }, el('a', { href: x.T.href }, x.T.crest ? el('img', { class: 'crest', src: x.T.crest, alt: '', width: '24', height: '24', loading: 'lazy' }) : el('span', { class: 'code' }, x.T.tv), x.T.name)),
        cols.map((c) => {
          const r = ranks[c[0]]?.get(x);
          const cls = 'num' + (r ? (r <= 3 ? ' rk-' + r : r > N - 3 ? ' rk-bot' : '') : '');
          return el('td', { class: cls, title: r ? `${ord(r)} in the league` : null }, text(x, c));
        })));
      body.replaceChildren(...[el('h2', {}, tab.label), tab.note ? el('p', { class: 'muted' }, tab.note) : null,
        el('div', { class: 'scroll tm-scroll' }, el('table', { class: 'tm-table' }, el('thead', {}, head), el('tbody', {}, trs))),
        el('p', { class: 'muted small' }, `${D.note} Hover a number to see its league rank, or a column name for its definition. Definitions: Glossary.`)].filter(Boolean));
    }
    draw();
  }).catch((e) => { root.textContent = 'Could not load team stats: ' + e.message; });
})();
