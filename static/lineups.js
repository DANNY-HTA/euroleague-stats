// Lineups tool: filter, combine and sort lineup stats built from the play-by-play.
(function () {
  'use strict';
  const root = document.getElementById('lineups-app');
  if (!root) return;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
  const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const div = (a, b) => (b > 0 ? a / b : null);
  function combos(arr, k) {
    if (k === arr.length) return [arr];
    const out = [];
    const rec = (start, pick) => { if (pick.length === k) { out.push(pick.slice()); return; } for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); } };
    rec(0, []);
    return out;
  }

  fetch('lineups.json').then((r) => { if (!r.ok) throw new Error('none'); return r.json(); }).then((D) => {
    const K = D.keys, NK = K.length, ix = Object.fromEntries(K.map((k, i) => [k, i]));
    const params = new URLSearchParams(location.search);
    const S = { team: D.teams[params.get('team')] ? params.get('team') : '', player: '', size: 5, outcome: '', loc: '', from: '', to: '', minMin: 0, minPoss: 15, mode: 'total', sort: 'min', dir: -1, page: 0 };
    const PER = 50;

    // Columns: [key, label, kind]  kind: c = count (scaled by per mode), p = percentage / rating, s = signed count, i = integer, r = rating
    const COLS = [['gp', 'GP', 'i'], ['w', 'W', 'i'], ['l', 'L', 'i'], ['min', 'MIN', 'm'], ['pts', 'PTS', 'c'],
      ['fgm2', '2PM', 'c'], ['fga2', '2PA', 'c'], ['p2', '2P%', 'p'], ['fgm3', '3PM', 'c'], ['fga3', '3PA', 'c'], ['p3', '3P%', 'p'],
      ['fgm', 'FGM', 'c'], ['fga', 'FGA', 'c'], ['pfg', 'FG%', 'p'], ['ftm', 'FTM', 'c'], ['fta', 'FTA', 'c'], ['pft', 'FT%', 'p'],
      ['oreb', 'ORB', 'c'], ['dreb', 'DRB', 'c'], ['trb', 'TRB', 'c'], ['ast', 'AST', 'c'], ['tov', 'TOV', 'c'], ['stl', 'STL', 'c'], ['blk', 'BLK', 'c'], ['pf', 'PF', 'c'],
      ['pm', '+/-', 's'], ['poss', 'POSS', 'c'], ['pace', 'PACE', 'p'], ['ortg', 'OFF RTG', 'p'], ['drtg', 'DEF RTG', 'p'], ['net', 'NET RTG', 'r'],
      ['efg', 'EFG%', 'p'], ['ts', 'TS%', 'p'], ['tovp', 'TOV%', 'p'], ['dtovp', 'DTOV%', 'p'], ['orbp', 'ORB%', 'p'], ['drbp', 'DRB%', 'p'], ['trbp', 'TRB%', 'p'],
      ['astp', 'AST%', 'p'], ['astr', 'AST RATIO', 'p'], ['stlp', 'ST%', 'p'], ['blkp', 'BLK%', 'p'], ['oppts', 'OPP PTS', 'c'], ['opefg', 'OPP EFG%', 'p']];
    const TIPS = { gp: 'Games played', min: 'Minutes together', poss: 'Possessions (average of both teams)', pace: 'Possessions per 40 minutes', ortg: 'Points scored per 100 possessions', drtg: 'Points allowed per 100 possessions', net: 'ORtg − DRtg', efg: '(FGM + 0.5×3PM) / FGA', ts: 'PTS / (2 × (FGA + 0.44×FTA))', tovp: 'Turnovers per 100 plays', dtovp: 'Opponent turnovers per 100 of their plays', orbp: 'Share of own misses rebounded', drbp: 'Share of opponent misses rebounded', trbp: 'Share of all rebounds', astp: 'Share of baskets that were assisted', astr: 'Assists per 100 plays', stlp: 'Steals per 100 opponent possessions', blkp: 'Share of opponent 2-pt attempts blocked' };

    function aggregate() {
      const groups = new Map();
      for (const r of D.rows) {
        const [code, idsStr, g, isHome, won, secs] = r;
        if (S.team && code !== S.team) continue;
        if (S.outcome === 'W' && !won) continue; if (S.outcome === 'L' && won) continue;
        if (S.loc === 'H' && !isHome) continue; if (S.loc === 'A' && isHome) continue;
        const date = D.games[g]?.[0] || '';
        if (S.from && date < S.from) continue; if (S.to && date > S.to) continue;
        const ids = idsStr.split(',');
        if (S.player && !ids.includes(S.player)) continue;
        for (const c of combos(ids, S.size)) {
          if (S.player && !c.includes(S.player)) continue;
          const key = code + '|' + c.join(',');
          let G = groups.get(key);
          if (!G) { G = { code, ids: c, games: new Set(), wins: new Set(), secs: 0, me: new Array(NK).fill(0), op: new Array(NK).fill(0) }; groups.set(key, G); }
          G.games.add(g); if (won) G.wins.add(g); G.secs += secs;
          for (let i = 0; i < NK; i++) { G.me[i] += r[6 + i]; G.op[i] += r[6 + NK + i]; }
        }
      }
      return [...groups.values()].map(derive).filter((x) => x.min >= S.minMin && x.poss >= S.minPoss);
    }
    function derive(G) {
      const m = (k) => G.me[ix[k]], o = (k) => G.op[ix[k]];
      const pts = 2 * m('fgm2') + 3 * m('fgm3') + m('ftm'), oppts = 2 * o('fgm2') + 3 * o('fgm3') + o('ftm');
      const fgm = m('fgm2') + m('fgm3'), fga = m('fga2') + m('fga3'), ofgm = o('fgm2') + o('fgm3'), ofga = o('fga2') + o('fga3');
      const pm_ = fga - m('oreb') + m('tov') + 0.44 * m('fta'), po_ = ofga - o('oreb') + o('tov') + 0.44 * o('fta');
      const poss = (pm_ + po_) / 2, min = G.secs / 60;
      return {
        code: G.code, ids: G.ids, gp: G.games.size, w: G.wins.size, l: G.games.size - G.wins.size, min, poss,
        pts, oppts, pm: pts - oppts, fgm, fga, fgm2: m('fgm2'), fga2: m('fga2'), fgm3: m('fgm3'), fga3: m('fga3'), ftm: m('ftm'), fta: m('fta'),
        oreb: m('oreb'), dreb: m('dreb'), trb: m('oreb') + m('dreb'), ast: m('ast'), tov: m('tov'), stl: m('stl'), blk: m('blk'), pf: m('pf'),
        p2: div(100 * m('fgm2'), m('fga2')), p3: div(100 * m('fgm3'), m('fga3')), pfg: div(100 * fgm, fga), pft: div(100 * m('ftm'), m('fta')),
        pace: div(40 * poss, min), ortg: div(100 * pts, poss), drtg: div(100 * oppts, poss), net: poss > 0 ? 100 * (pts - oppts) / poss : null,
        efg: div(100 * (fgm + 0.5 * m('fgm3')), fga), ts: div(100 * pts, 2 * (fga + 0.44 * m('fta'))), opefg: div(100 * (ofgm + 0.5 * o('fgm3')), ofga),
        tovp: div(100 * m('tov'), fga + 0.44 * m('fta') + m('tov')), dtovp: div(100 * o('tov'), ofga + 0.44 * o('fta') + o('tov')),
        orbp: div(100 * m('oreb'), m('oreb') + o('dreb')), drbp: div(100 * m('dreb'), m('dreb') + o('oreb')), trbp: div(100 * (m('oreb') + m('dreb')), m('oreb') + m('dreb') + o('oreb') + o('dreb')),
        astp: div(100 * m('ast'), fgm), astr: div(100 * m('ast'), fga + 0.44 * m('fta') + m('ast') + m('tov')), stlp: div(100 * m('stl'), po_), blkp: div(100 * m('blk'), o('fga2'))
      };
    }
    const scale = (x, kind, v) => {
      if (kind === 'm') return S.mode === 'game' ? v / (x.gp || 1) : v;
      if (kind !== 'c' && kind !== 's') return v;
      if (S.mode === 'game') return v / (x.gp || 1);
      if (S.mode === '40') return x.min > 0 ? 40 * v / x.min : null;
      if (S.mode === '100') return x.poss > 0 ? 100 * v / x.poss : null;
      return v;
    };
    const cellText = (x, [k, , kind]) => {
      const v = scale(x, kind, x[k]);
      if (kind === 'i') return String(v);
      if (kind === 's' || kind === 'r') return sg(v);
      if (S.mode === 'total' && kind === 'c' && k !== 'poss') return String(Math.round(v));
      return f1(v);
    };
    const sortVal = (x) => { const col = COLS.find((c) => c[0] === S.sort); const v = col ? scale(x, col[2], x[S.sort]) : 0; return v == null ? -Infinity : v; };

    // ---- controls ----
    const teamOpts = [['', 'All teams'], ...Object.entries(D.teams).sort((a, b) => a[1][1].localeCompare(b[1][1])).map(([c, t]) => [c, t[1]])];
    const mkSel = (opts, val, on, label) => el('select', { 'aria-label': label, onchange: on }, opts.map(([v, l]) => { const o = el('option', { value: v }, l); if (v === val) o.selected = true; return o; }));
    const playerSel = el('select', { 'aria-label': 'Player', onchange: (e) => { S.player = e.target.value; S.page = 0; draw(); } });
    const fillPlayers = () => {
      const list = Object.entries(D.players).filter(([, p]) => !S.team || p[1] === D.teams[S.team][0]).sort((a, b) => a[1][0].localeCompare(b[1][0]));
      playerSel.replaceChildren(el('option', { value: '' }, 'All players'), ...list.map(([id, p]) => el('option', { value: id }, `${p[0]} (${p[1]})`)));
      if (S.player && !list.some(([id]) => id === S.player)) S.player = '';
      playerSel.value = S.player;
    };
    const sizeTabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Lineup size' }, [5, 4, 3, 2].map((n) => el('button', { type: 'button', 'aria-pressed': n === S.size ? 'true' : 'false', onclick: (e) => {
      S.size = n; S.page = 0; sizeTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); draw();
    } }, n === 5 ? '5-man' : `${n}-man`)));
    const modeTabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Per mode' }, [['total', 'Totals'], ['game', 'Per game'], ['40', 'Per 40 min'], ['100', 'Per 100 poss']].map(([m, l]) => el('button', { type: 'button', 'aria-pressed': m === S.mode ? 'true' : 'false', onclick: (e) => {
      S.mode = m; modeTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); draw();
    } }, l)));
    const num = (val, on, label, step = 1) => el('label', { class: 'lu-num' }, label, el('input', { type: 'number', min: '0', step: String(step), value: String(val), oninput: on }));
    const date = (on, label) => el('label', { class: 'lu-num' }, label, el('input', { type: 'date', oninput: on }));
    const filters = el('div', { class: 'card lu-filters' },
      el('div', { class: 'lu-row' }, sizeTabs, modeTabs),
      el('div', { class: 'lu-grid' },
        mkSel(teamOpts, S.team, (e) => { S.team = e.target.value; S.page = 0; fillPlayers(); draw(); }, 'Team'),
        playerSel,
        mkSel([['', 'Wins and losses'], ['W', 'Wins only'], ['L', 'Losses only']], '', (e) => { S.outcome = e.target.value; S.page = 0; draw(); }, 'Outcome'),
        mkSel([['', 'Home and away'], ['H', 'Home only'], ['A', 'Away only']], '', (e) => { S.loc = e.target.value; S.page = 0; draw(); }, 'Location'),
        date((e) => { S.from = e.target.value; S.page = 0; draw(); }, 'From'),
        date((e) => { S.to = e.target.value; S.page = 0; draw(); }, 'To'),
        num(S.minMin, (e) => { S.minMin = Number(e.target.value) || 0; S.page = 0; draw(); }, 'Min. minutes'),
        num(S.minPoss, (e) => { S.minPoss = Number(e.target.value) || 0; S.page = 0; draw(); }, 'Min. possessions')),
      el('p', { class: 'muted small' }, `Built from ${D.note} whose play-by-play matches the official box score exactly.`));
    fillPlayers();
    const results = el('div', { class: 'card' });
    root.replaceChildren(filters, results);

    function draw() {
      const all = aggregate();
      all.sort((a, b) => S.dir * (sortVal(a) - sortVal(b)) || b.min - a.min);
      const pages = Math.max(1, Math.ceil(all.length / PER));
      S.page = Math.min(S.page, pages - 1);
      const shown = all.slice(S.page * PER, S.page * PER + PER);
      const head = el('tr', {}, el('th', { scope: 'col', class: 'num' }, '#'), el('th', { scope: 'col' }, 'Lineup'),
        COLS.map(([k, l]) => el('th', { scope: 'col', class: 'num', title: TIPS[k] || null, 'aria-sort': S.sort === k ? (S.dir < 0 ? 'descending' : 'ascending') : null },
          el('button', { type: 'button', onclick: () => { if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = (k === 'drtg' || k === 'tovp' || k === 'opefg' || k === 'oppts') ? 1 : -1; } draw(); } }, l))));
      const body = shown.map((x, i) => {
        const t = D.teams[x.code];
        return el('tr', {}, el('td', { class: 'num muted' }, String(S.page * PER + i + 1)),
          el('td', { class: 'lu-names' }, t?.[2] ? el('img', { class: 'crest', src: t[2], alt: '', width: '22', height: '22', loading: 'lazy' }) : el('span', { class: 'code' }, t?.[0] || x.code),
            x.ids.map((id, j) => [j ? el('span', { class: 'muted' }, ' · ') : null, el('a', { href: D.players[id]?.[2] || '#' }, (D.players[id]?.[0] || id).split(' ').slice(-1)[0])])),
          COLS.map((c) => {
            const v = cellText(x, c);
            const cls = c[0] === 'net' || c[0] === 'pm' ? (v.startsWith('+') ? 'num pos' : v.startsWith('−') ? 'num neg' : 'num') : 'num';
            return el('td', { class: cls }, v);
          }));
      });
      results.replaceChildren(
        el('div', { class: 'lu-head' }, el('h2', {}, `${all.length} ${S.size}-man ${S.size === 5 ? 'lineups' : 'combinations'}`),
          el('div', { class: 'lu-pager' }, el('button', { type: 'button', class: 'btn ghost', disabled: S.page === 0, onclick: () => { S.page--; draw(); } }, '‹ Prev'),
            el('span', { class: 'muted' }, `Page ${S.page + 1} of ${pages}`),
            el('button', { type: 'button', class: 'btn ghost', disabled: S.page >= pages - 1, onclick: () => { S.page++; draw(); } }, 'Next ›'))),
        all.length ? el('div', { class: 'scroll lu-scroll' }, el('table', { class: 'lu-table' }, el('thead', {}, head), el('tbody', {}, body)))
          : el('p', { class: 'muted' }, 'No lineups match these filters. Try lowering the minimum possessions.'),
        el('p', { class: 'muted small' }, 'Click a column to sort; click again to flip. Small samples swing a lot: use the minimum possessions filter.'));
    }
    draw();
  }).catch(() => { root.replaceChildren(el('p', { class: 'card' }, 'Lineup data is not available yet. It appears after the next nightly update.')); });
})();
