// Charges drawn: filterable list of every offensive foul, with player and team totals.
(() => {
  const host = document.getElementById('charges-app'), src = document.getElementById('charges-data');
  if (!host || !src) return;
  const D = JSON.parse(src.textContent);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else e.setAttribute(k, v); } e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
  const EV = D.ev.map(([g, per, clock, draw, by, com, cby, hs, as]) => ({ g, per, clock, draw, by, com, cby, hs, as, game: D.games[g] }));
  const tName = (c) => D.teams[c]?.[1] || c, tTv = (c) => D.teams[c]?.[0] || c;
  const crest = (c) => (D.teams[c]?.[2] ? el('img', { class: 'crest', src: D.teams[c][2], alt: '', width: '20', height: '20' }) : null);
  const pLink = (id) => (id && D.players[id] ? el('a', { href: D.players[id][2] }, D.players[id][0]) : el('span', { class: 'muted' }, 'not recorded'));
  const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const perName = (p) => (p <= 4 ? `Q${p}` : `OT${p - 4}`);
  const st = { team: '', opp: '', player: '', per: '', round: '', sort: { by: 'n', dir: -1 }, view: 'players' };
  const teamOpts = Object.entries(D.teams).sort((a, b) => a[1][1].localeCompare(b[1][1]));
  const rounds = [...new Set(EV.map((e) => e.game[1]))].sort((a, b) => a - b);
  const sel = (key, label, opts) => { const s = el('select', { 'aria-label': label }, opts.map(([v, t]) => el('option', { value: v }, t))); s.addEventListener('change', () => { st[key] = s.value; if (key === 'team') fillPlayers(); draw(); }); return [el('label', {}, label, ' ', s), s]; };
  const [teamL] = sel('team', 'Drawn by team', [['', 'All teams'], ...teamOpts.map(([c, t]) => [c, t[1]])]);
  const [oppL] = sel('opp', 'Against', [['', 'All opponents'], ...teamOpts.map(([c, t]) => [c, t[1]])]);
  const [playerL, playerS] = sel('player', 'Player', []);
  const [perL] = sel('per', 'Quarter', [['', 'All'], ['1', 'Q1'], ['2', 'Q2'], ['3', 'Q3'], ['4', 'Q4'], ['5', 'OT']]);
  const [roundL] = sel('round', 'Round', [['', 'All rounds'], ...rounds.map((r) => [String(r), `Round ${r}`])]);
  function fillPlayers() {
    const ids = [...new Set(EV.filter((e) => e.by && (!st.team || e.draw === st.team)).map((e) => e.by))].sort((a, b) => (D.players[a]?.[0] || a).localeCompare(D.players[b]?.[0] || b));
    if (!ids.includes(st.player)) st.player = '';
    playerS.replaceChildren(el('option', { value: '' }, 'All players'), ...ids.map((id) => el('option', { value: id }, D.players[id]?.[0] || id)));
    playerS.value = st.player;
  }
  fillPlayers();
  const tabs = [['players', 'By player'], ['teams', 'By team'], ['list', 'Every charge']].map(([v, t]) => { const b = el('button', { type: 'button', 'data-v': v }, t); b.addEventListener('click', () => { st.view = v; st.sort = { by: v === 'list' ? 'date' : 'n', dir: -1 }; draw(); }); return b; });
  const summary = el('p', { class: 'muted small' });
  const out = el('div', {});
  host.replaceChildren(el('section', { class: 'card' }, el('div', { class: 'filters ch-filters' }, teamL, oppL, playerL, perL, roundL), el('div', { class: 'seg' }, tabs), summary, out));

  const filtered = () => EV.filter((e) => (!st.team || e.draw === st.team) && (!st.opp || e.com === st.opp) && (!st.player || e.by === st.player) && (!st.per || (st.per === '5' ? e.per >= 5 : String(e.per) === st.per)) && (!st.round || String(e.game[1]) === st.round));
  const th = (key, label, num = true, title) => { const b = el('button', { type: 'button' }, label); b.addEventListener('click', () => { st.sort = { by: key, dir: st.sort.by === key ? -st.sort.dir : -1 }; draw(); }); return el('th', { scope: 'col', class: num ? 'num' : null, title, 'aria-sort': st.sort.by === key ? (st.sort.dir < 0 ? 'descending' : 'ascending') : null }, b); };
  const sortBy = (rows, get) => rows.sort((a, b) => { const x = get(a, st.sort.by), y = get(b, st.sort.by); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.sort.dir; });

  function draw() {
    tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.view)));
    const E = filtered();
    summary.textContent = `${E.length} offensive foul${E.length === 1 ? '' : 's'} drawn${st.team ? ` by ${tName(st.team)}` : ''}${st.opp ? ` against ${tName(st.opp)}` : ''}.`;
    if (st.view === 'players') {
      const m = new Map();
      for (const e of E) { const k = e.by || '?' + e.draw; if (!m.has(k)) m.set(k, { id: e.by, team: e.draw, n: 0, games: new Set() }); const r = m.get(k); r.n++; r.games.add(e.g); }
      const rows = sortBy([...m.values()], (r, k) => { const p = D.players[r.id]; return k === 'name' ? (p?.[0] || '') : k === 'team' ? tTv(r.team) : k === 'gp' ? (p?.[3] || 0) : k === 'pg' ? (p?.[3] ? r.n / p[3] : 0) : k === 'p40' ? (p?.[4] ? 40 * r.n / p[4] : 0) : r.n; });
      out.replaceChildren(el('div', { class: 'scroll' }, el('table', { class: 'ch-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '#'), th('name', 'Player', false), th('team', 'Team', false), th('n', 'Drawn'), th('gp', 'GP'), th('pg', 'Per game'), th('p40', 'Per 40 min'))),
        el('tbody', {}, rows.map((r, i) => { const p = D.players[r.id]; return el('tr', {}, el('td', { class: 'num muted' }, String(i + 1)), el('td', {}, r.id ? pLink(r.id) : el('span', { class: 'muted' }, 'Player not recorded')), el('td', {}, crest(r.team), ' ', tTv(r.team)), el('td', { class: 'num' }, el('strong', {}, String(r.n))), el('td', { class: 'num' }, p ? String(p[3]) : '–'), el('td', { class: 'num' }, p?.[3] ? (r.n / p[3]).toFixed(2) : '–'), el('td', { class: 'num' }, p?.[4] ? (40 * r.n / p[4]).toFixed(2) : '–')); })))));
    } else if (st.view === 'teams') {
      const m = new Map(Object.keys(D.teamGp).map((c) => [c, { c, drawn: 0, com: 0 }]));
      for (const e of EV.filter((e) => (!st.per || (st.per === '5' ? e.per >= 5 : String(e.per) === st.per)) && (!st.round || String(e.game[1]) === st.round))) { if (m.has(e.draw)) m.get(e.draw).drawn++; if (m.has(e.com)) m.get(e.com).com++; }
      const rows = sortBy([...m.values()].filter((r) => (!st.team || r.c === st.team)), (r, k) => (k === 'name' ? tName(r.c) : k === 'com' ? r.com / D.teamGp[r.c] : k === 'tot' ? r.drawn : k === 'diff' ? (r.drawn - r.com) / D.teamGp[r.c] : r.drawn / D.teamGp[r.c]));
      out.replaceChildren(el('div', { class: 'scroll' }, el('table', { class: 'ch-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '#'), th('name', 'Team', false), th('n', 'Drawn / game'), th('tot', 'Drawn'), th('com', 'Committed / game'), th('diff', 'Difference / game', true, 'Drawn minus committed, per game'))),
        el('tbody', {}, rows.map((r, i) => { const gp = D.teamGp[r.c] || 1, d = (r.drawn - r.com) / gp; return el('tr', {}, el('td', { class: 'num muted' }, String(i + 1)), el('td', {}, el('a', { href: D.teams[r.c]?.[3] }, crest(r.c), ' ', tName(r.c))), el('td', { class: 'num' }, el('strong', {}, (r.drawn / gp).toFixed(2))), el('td', { class: 'num' }, String(r.drawn)), el('td', { class: 'num' }, (r.com / gp).toFixed(2)), el('td', { class: `num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}` }, (d > 0 ? '+' : '') + d.toFixed(2))); })))),
        el('p', { class: 'muted small' }, 'Team totals ignore the team, opponent and player filters so every team stays comparable; quarter and round filters apply.'));
    } else {
      const rows = sortBy(E.slice(), (e, k) => (k === 'by' ? (D.players[e.by]?.[0] || '') : k === 'cby' ? (D.players[e.cby]?.[0] || '') : k === 'q' ? e.per * 1000 - (Number(e.clock.split(':')[0]) * 60 + Number(e.clock.split(':')[1])) : e.game[0] + String(e.g).padStart(4, '0') + String(e.per) + String(1000 - (Number(e.clock.split(':')[0]) * 60 + Number(e.clock.split(':')[1]))).padStart(4, '0')));
      out.replaceChildren(el('div', { class: 'scroll' }, el('table', { class: 'ch-table' },
        el('thead', {}, el('tr', {}, th('date', 'Date', false), el('th', { scope: 'col' }, 'Game'), th('q', 'Time', false), el('th', { scope: 'col', class: 'num' }, 'Score'), th('by', 'Drawn by', false), th('cby', 'Committed by', false))),
        el('tbody', {}, rows.map((e) => { const [date, rd, href, h, a] = e.game; return el('tr', {}, el('td', {}, `${fmtD(date)} · Rd ${rd}`), el('td', {}, el('a', { href }, `${tTv(h)}–${tTv(a)}`)), el('td', {}, `${perName(e.per)} ${e.clock}`), el('td', { class: 'num muted' }, `${e.hs}–${e.as}`), el('td', {}, crest(e.draw), ' ', pLink(e.by)), el('td', {}, crest(e.com), ' ', e.cby ? pLink(e.cby) : el('span', { class: 'muted' }, 'not recorded'))); })))),
        el('p', { class: 'muted small' }, 'Score = home–away at that moment. Time = clock remaining in the period.'));
    }
  }
  draw();
})();
