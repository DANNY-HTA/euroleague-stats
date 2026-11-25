// Game page: filterable play-by-play (period, team, player, play type).
(() => {
  const host = document.getElementById('pbp-app'), src = document.getElementById('pbp-data');
  if (!host || !src) return;
  const D = JSON.parse(src.textContent);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (v != null) e.setAttribute(k, v); } e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
  const TYPES = [['', 'All plays'], ['score', 'Scoring plays'], ['made', 'Field goals made'], ['missed', 'Field goals missed'], ['ft', 'Free throws'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['tov', 'Turnovers & steals'], ['blk', 'Blocks'], ['foul', 'Fouls'], ['sub', 'Substitutions'], ['timeout', 'Timeouts']];
  const SCORE = { '2FGM': 1, '3FGM': 1, FTM: 1 };
  const periods = [...new Set(D.plays.map((p) => p[0]))];
  const pname = (n) => (n <= 4 ? `Q${n}` : `OT${n - 4}`);
  const state = { per: '', team: '', player: '', type: '', rev: false };
  const opt = (v, t) => el('option', { value: v }, t);
  const sel = (key, opts) => { const s = el('select', { 'aria-label': key }, opts); s.addEventListener('change', () => { state[key] = s.value; if (key === 'team') fillPlayers(); draw(); }); return s; };
  const perSel = sel('per', [opt('', 'All periods'), periods.map((p) => opt(String(p), pname(p)))]);
  const teamSel = sel('team', [opt('', 'Both teams'), opt('H', D.hName), opt('A', D.aName)]);
  const playerSel = sel('player', []);
  const typeSel = sel('type', TYPES.map(([v, t]) => opt(v, t)));
  const revBtn = el('button', { type: 'button', class: 'btn-ghost', 'aria-pressed': 'false' }, 'Latest first');
  revBtn.addEventListener('click', () => { state.rev = !state.rev; revBtn.setAttribute('aria-pressed', String(state.rev)); draw(); });
  function fillPlayers() {
    const ids = [...new Set(D.plays.filter((p) => p[3] && (!state.team || p[2] === state.team)).map((p) => p[3]))].sort((a, b) => (D.names[a] || a).localeCompare(D.names[b] || b));
    if (!ids.includes(state.player)) state.player = '';
    playerSel.replaceChildren(opt('', 'All players'), ...ids.map((id) => opt(id, D.names[id] || id)));
    playerSel.value = state.player;
  }
  fillPlayers();
  const count = el('span', { class: 'muted small' });
  const list = el('ol', { class: 'pbp' });
  host.replaceChildren(el('div', { class: 'filters' }, perSel, teamSel, playerSel, typeSel, revBtn, count), list);
  function draw() {
    let rows = D.plays.filter((p) => {
      if (state.per && String(p[0]) !== state.per) return false;
      if (state.team && p[2] !== state.team) return false;
      if (state.player && p[3] !== state.player) return false;
      if (state.type === 'score') return !!SCORE[p[4]];
      if (state.type && D.groups[p[4]] !== state.type) return false;
      return true;
    });
    if (state.rev) rows = rows.slice().reverse();
    count.textContent = `${rows.length} plays`;
    let lastPer = null;
    const items = [];
    for (const p of rows) {
      if (p[0] !== lastPer) { items.push(el('li', { class: 'pbp-per' }, pname(p[0]))); lastPer = p[0]; }
      const who = p[3] ? (D.names[p[3]] || p[3]) : '';
      const label = D.labels[p[4]] || p[4];
      if (p[4] === 'BP' || p[4] === 'EP' || p[4] === 'EG') continue;
      const sc = !!SCORE[p[4]];
      items.push(el('li', { class: `pbp-row ${p[2] === 'H' ? 'ph' : p[2] === 'A' ? 'pa' : 'pn'}${sc ? ' sc' : ''}` },
        el('span', { class: 'pt' }, p[1]),
        el('span', { class: 'pw' }, p[2] ? el('b', {}, p[2] === 'H' ? D.H : D.A) : '', ' ', who ? el('span', {}, who, ' · ') : '', label),
        el('span', { class: 'ps' }, sc ? el('strong', {}, `${p[5]}–${p[6]}`) : el('span', { class: 'muted' }, `${p[5]}–${p[6]}`))));
    }
    list.replaceChildren(...items);
  }
  draw();
})();

// Lineup size switcher
(() => {
  const btns = [...document.querySelectorAll('#lineups .seg button')];
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('#lineups .unit-size').forEach((d) => { d.hidden = d.dataset.size !== b.dataset.size; });
  }));
})();
