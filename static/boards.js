// Home leaderboards: filter every list by team, position, minutes and games, and see the full ranking.
(() => {
  const src = document.getElementById('boards-data'), bar = document.getElementById('board-filter');
  if (!src || !bar) return;
  const D = JSON.parse(src.textContent);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else e.setAttribute(k, v); } e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
  const P = D.players.map(([name, tv, team, href, pos, gp, mpg, q, vals, parts]) => ({ name, tv, team, href, pos, gp, mpg, q, vals, parts }));
  const f1 = (v) => v.toFixed(1), sg = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const st = { team: '', pos: '', min: 'q', gp: 0, q: '' };
  const open = new Set();

  // ---- filter bar ----
  const sel = (key, label, opts) => { const s = el('select', { 'aria-label': label }, opts.map(([v, t]) => el('option', { value: v }, t))); s.addEventListener('change', () => { st[key] = s.value; draw(); }); return el('label', {}, label, ' ', s); };
  const positions = [...new Set(P.map((p) => p.pos).filter(Boolean))].sort();
  const search = el('input', { type: 'search', placeholder: 'Find a player…', 'aria-label': 'Find a player' });
  search.addEventListener('input', () => { st.q = search.value.trim().toLowerCase(); draw(); });
  const reset = el('button', { type: 'button', class: 'btn-ghost' }, 'Reset');
  const summary = el('span', { class: 'muted small' });
  const controls = [
    sel('team', 'Team', [['', 'All teams'], ...D.teams]),
    positions.length ? sel('pos', 'Position', [['', 'All positions'], ...positions.map((p) => [p, p])]) : null,
    sel('min', 'Players', [['q', 'Qualified (10+ min, 40% of games)'], ['0', 'Everyone'], ['5', '5+ minutes'], ['15', '15+ minutes'], ['20', '20+ minutes'], ['25', '25+ minutes']]),
    sel('gp', 'Games', [['0', 'Any'], ['3', '3+'], ['5', '5+'], ['8', '8+'], ['10', '10+']]),
    search, reset
  ];
  reset.addEventListener('click', () => { Object.assign(st, { team: '', pos: '', min: 'q', gp: 0, q: '' }); bar.querySelectorAll('select').forEach((s) => { s.selectedIndex = 0; }); search.value = ''; draw(); });
  bar.replaceChildren(el('h2', {}, 'Filter the leaderboards'), el('p', { class: 'muted' }, 'Pick a team, position, minutes or games: every list below re-ranks instantly. Choosing a team shows all of its players.'), el('div', { class: 'filters' }, controls), summary);

  const pass = (p, b) => {
    if (st.team && p.team !== st.team) return false;
    if (st.pos && p.pos !== st.pos) return false;
    if (p.gp < Number(st.gp)) return false;
    if (st.q && !p.name.toLowerCase().includes(st.q)) return false;
    if (b.all) return true; // on-court boards have their own 300-possession minimum
    if (st.min === 'q') return !!p.q;
    return p.mpg >= Number(st.min);
  };

  const boards = D.boards.map((b, j) => ({ ...b, j, card: document.querySelector(`.board[data-board="${b.id}"]`) })).filter((b) => b.card);
  for (const b of boards) {
    const btn = b.card.querySelector('.board-more') || el('button', { type: 'button', class: 'btn-ghost board-more' });
    if (!btn.parentNode) b.card.append(btn);
    const clone = btn.cloneNode(false); btn.replaceWith(clone); b.btn = clone;
    clone.addEventListener('click', () => { if (open.has(b.id)) open.delete(b.id); else open.add(b.id); draw(); if (!open.has(b.id)) b.card.scrollIntoView({ block: 'nearest' }); });
  }

  function drawBoard(b) {
    const fmt = b.fmt === 's' ? sg : f1;
    const all = P.filter((p) => p.vals[b.j] != null);
    const league = all.filter((p) => (b.all ? true : p.q)).sort((x, y) => (b.asc ? x.vals[b.j] - y.vals[b.j] : y.vals[b.j] - x.vals[b.j]));
    const lgRank = new Map(league.map((p, i) => [p, i + 1]));
    const list = all.filter((p) => pass(p, b)).sort((x, y) => (b.asc ? x.vals[b.j] - y.vals[b.j] : y.vals[b.j] - x.vals[b.j]) || x.name.localeCompare(y.name));
    const filtered = !!(st.team || st.pos || st.q || st.min !== 'q' || Number(st.gp));
    const showAll = open.has(b.id) || !!st.team || !!st.q;
    const shown = showAll ? list : list.slice(0, 10);
    const vals = all.map((p) => p.vals[b.j]), hi = Math.max(...vals), lo = Math.min(...vals);
    const width = (v) => Math.max(3, b.asc ? (hi === lo ? 100 : 5 + 95 * (hi - v) / (hi - lo)) : 100 * v / (Math.max(...league.map((p) => p.vals[b.j]).slice(0, 1), hi) || 1));
    const top = b.asc ? null : Math.max(...list.map((p) => p.vals[b.j]), 0.0001);
    const ol = b.card.querySelector('ol');
    ol.replaceChildren(...shown.map((p, i) => {
      const v = p.vals[b.j];
      const barEl = b.parts
        ? [el('div', { class: 'bar stack' }, b.parts.map(([k, , c]) => el('span', { class: c, style: `width:${(100 * (p.parts[k] || 0) / (top || 1)).toFixed(1)}%` }))), el('div', { class: 'parts' }, b.parts.map(([k, l, c]) => el('span', { class: c, title: l }, f1(p.parts[k] || 0))))]
        : el('div', { class: 'bar' }, el('span', { style: `width:${(b.asc ? width(v) : Math.max(3, 100 * v / (top || 1))).toFixed(1)}%` }));
      const lr = lgRank.get(p);
      return el('li', {}, el('span', { class: 'muted num' }, String(i + 1)),
        el('div', {}, el('a', { href: p.href }, p.name), ' ', el('span', { class: 'muted' }, p.tv), filtered && lr ? el('span', { class: 'lg-rank' }, ` ${ord(lr)} in league`) : null, barEl),
        el('strong', { class: 'num' }, fmt(v)));
    }));
    if (!shown.length) ol.replaceChildren(el('li', { class: 'empty' }, el('span'), el('span', { class: 'muted' }, 'No player matches these filters.'), el('span')));
    b.card.classList.toggle('open', showAll && list.length > 10);
    b.btn.hidden = !!st.team || !!st.q || list.length <= 10;
    b.btn.textContent = open.has(b.id) ? 'Show top 10' : `Show all ${list.length} players`;
    b.btn.setAttribute('aria-expanded', String(open.has(b.id)));
    return list.length;
  }
  function draw() {
    const n = Math.max(0, ...boards.filter((b) => !b.all).map(drawBoard));
    boards.filter((b) => b.all).forEach(drawBoard);
    const parts = [];
    if (st.team) parts.push(D.teams.find((t) => t[0] === st.team)?.[1]);
    if (st.pos) parts.push(st.pos);
    summary.textContent = `${n} player${n === 1 ? '' : 's'}${parts.length ? ' · ' + parts.join(' · ') : ''}`;
  }
  draw();
})();
