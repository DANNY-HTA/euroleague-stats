// Clip list for the video coordinator: filter the play-by-play of Hapoel's games (and the next opponent's) and export a CSV.
(function () {
  'use strict';
  const root = document.getElementById('clips-app'); if (!root) return;
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  const LABEL = { '2FGM': 'Two made', '2FGA': 'Two missed', '3FGM': 'Three made', '3FGA': 'Three missed', FTM: 'Free throw made', FTA: 'Free throw missed', O: 'Offensive rebound', D: 'Defensive rebound', AS: 'Assist', TO: 'Turnover', ST: 'Steal', FV: 'Block', AG: 'Shot blocked', CM: 'Foul', RV: 'Foul drawn', OF: 'Offensive foul', CMU: 'Unsportsmanlike foul', CMT: 'Technical foul', CMD: 'Disqualifying foul', JB: 'Jump ball' };
  const SHOT = new Set(['2FGM', '2FGA', '3FGM', '3FGA']), END = new Set(['2FGM', '2FGA', '3FGM', '3FGA', 'TO', 'FTM', 'FTA']);
  const FILTERS = [
    ['to', 'Turnovers', (r) => r[4] === 'TO'], ['st', 'Steals', (r) => r[4] === 'ST'], ['3a', 'All three-point shots', (r) => r[4] === '3FGM' || r[4] === '3FGA'], ['3m', 'Made threes', (r) => r[4] === '3FGM'],
    ['shots', 'All shots', (r) => SHOT.has(r[4])], ['oreb', 'Offensive rebounds', (r) => r[4] === 'O'], ['dreb', 'Defensive rebounds', (r) => r[4] === 'D'], ['ast', 'Assists', (r) => r[4] === 'AS'],
    ['ato', 'Plays right after a timeout', (r) => r[7] === 1 && END.has(r[4])], ['clutch', 'Clutch (last 5 min, within 5)', (r) => r[8] === 1 && END.has(r[4])], ['fouls', 'Fouls committed', (r) => /^(CM|CMU|CMT|CMD|OF)$/.test(r[4])], ['of', 'Offensive fouls / charges', (r) => r[4] === 'OF'],
    ['blk', 'Blocks', (r) => r[4] === 'FV'], ['ft', 'Free throws', (r) => r[4] === 'FTM' || r[4] === 'FTA'], ['all', 'Every play', () => true]];
  let D = null;
  const st = { games: new Set(), team: 'hap', filter: 'to', player: '', open: false };
  const gName = (g) => `${g.date} ${D.teams[g.h] || g.h} ${g.hs}–${g.as} ${D.teams[g.a] || g.a}`;
  const teamOk = (g, code) => st.team === 'all' || (st.team === 'hap' ? code === D.hap : st.team === 'opp' ? code !== D.hap && (g.h === D.hap || g.a === D.hap) : code === D.opp);
  function rows() {
    const f = FILTERS.find((x) => x[0] === st.filter)[2], out = [];
    for (const g of D.games) { if (!st.games.has(g.code)) continue; for (const r of g.rows) if (teamOk(g, r[2]) && f(r) && (!st.player || r[3] === st.player)) out.push({ g, r }); }
    return out;
  }
  function csv(list) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['#', 'Date', 'Game', 'Quarter', 'Clock', 'Team', 'Player', 'Play', 'Score', 'After timeout', 'Clutch'].map(q).join(',')];
    list.forEach(({ g, r }, i) => lines.push([i + 1, g.date, `${D.teams[g.h] || g.h} vs ${D.teams[g.a] || g.a}`, r[0] > 4 ? 'OT' + (r[0] - 4) : 'Q' + r[0], r[1], D.teams[r[2]] || r[2], D.names[r[3]] || '', LABEL[r[4]] || r[4], `${r[5]}-${r[6]}`, r[7] ? 'yes' : '', r[8] ? 'yes' : ''].map(q).join(',')));
    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })), download: `clips-${st.filter}.csv` }); document.body.append(a); a.click(); a.remove();
  }
  function draw() {
    const list = rows();
    const gameBox = el('details', { class: 'clip-games', open: st.open, ontoggle: (e) => { st.open = e.target.open; } }, el('summary', {}, `Games (${st.games.size} picked)`), D.games.map((g) => { const c = el('input', { type: 'checkbox', checked: st.games.has(g.code), onchange: () => { c.checked ? st.games.add(g.code) : st.games.delete(g.code); draw(); } }); return el('label', { class: 'clip-g' }, c, ' ', gName(g)); }),
      el('p', {}, el('button', { type: 'button', class: 'btn ghost small', onclick: () => { st.games = new Set(D.games.filter((g) => g.h === D.hap || g.a === D.hap).map((g) => g.code)); draw(); } }, 'All Hapoel games'), ' ', D.opp ? el('button', { type: 'button', class: 'btn ghost small', onclick: () => { st.games = new Set(D.games.filter((g) => g.h === D.opp || g.a === D.opp).map((g) => g.code)); st.team = 'next'; draw(); } }, `All ${D.teams[D.opp]} games`) : null, ' ', el('button', { type: 'button', class: 'btn ghost small', onclick: () => { st.games.clear(); draw(); } }, 'None')));
    const team = el('select', { onchange: () => { st.team = team.value; draw(); } }, [['hap', 'Hapoel'], ['opp', "Hapoel's opponents"], ...(D.opp ? [['next', D.teams[D.opp] + ' (next opponent)']] : []), ['all', 'Both teams']].map(([v, l]) => el('option', { value: v, selected: st.team === v }, l)));
    const filt = el('select', { onchange: () => { st.filter = filt.value; draw(); } }, FILTERS.map(([v, l]) => el('option', { value: v, selected: st.filter === v }, l)));
    const ids = new Set(); for (const g of D.games) if (st.games.has(g.code)) for (const r of g.rows) if (r[3] && teamOk(g, r[2])) ids.add(r[3]);
    const pl = el('select', { onchange: () => { st.player = pl.value; draw(); } }, el('option', { value: '' }, 'Every player'), [...ids].sort((a, b) => (D.names[a] || '').localeCompare(D.names[b] || '')).map((id) => el('option', { value: id, selected: st.player === id }, D.names[id] || id)));
    root.replaceChildren(el('section', { class: 'card clip-controls no-print' }, gameBox, el('div', { class: 'clip-row' }, el('label', {}, 'Team ', team), el('label', {}, 'Show ', filt), el('label', {}, 'Player ', pl),
      el('button', { type: 'button', class: 'btn', onclick: () => csv(list), disabled: !list.length }, `Download CSV (${list.length})`), el('button', { type: 'button', class: 'btn ghost', onclick: () => window.print() }, 'Print'))),
      el('section', { class: 'card' }, el('h2', {}, `${list.length} clips — ${FILTERS.find((x) => x[0] === st.filter)[1]}`), list.length ? el('div', { class: 'scroll' }, el('table', { class: 'rtab' }, el('thead', {}, el('tr', {}, ['#', 'Game', 'Quarter', 'Clock', 'Team', 'Player', 'Play', 'Score', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, list.slice(0, 600).map(({ g, r }, i) => el('tr', {}, el('td', { class: 'num muted' }, i + 1), el('td', { class: 'small' }, `${g.date} ${D.teams[g.h]}–${D.teams[g.a]}`), el('td', { class: 'num' }, r[0] > 4 ? 'OT' + (r[0] - 4) : 'Q' + r[0]), el('td', { class: 'num' }, el('strong', {}, r[1])), el('td', {}, D.teams[r[2]] || r[2]), el('td', {}, D.names[r[3]] || ''), el('td', {}, LABEL[r[4]] || r[4]), el('td', { class: 'num' }, `${r[5]}–${r[6]}`), el('td', { class: 'small muted' }, [r[7] ? 'after timeout' : '', r[8] ? 'clutch' : ''].filter(Boolean).join(', '))))))) : el('p', { class: 'muted' }, 'Nothing matches. Pick more games or another filter.'),
        list.length > 600 ? el('p', { class: 'muted small' }, 'Showing the first 600; the CSV has all of them.') : null,
        el('p', { class: 'muted small' }, 'The clock is the game clock shown on the broadcast (time left in the quarter). "After timeout" = the first plays of a possession right after that team\'s timeout.')));
  }
  fetch('clips.json', { cache: 'no-store' }).then((r) => r.json()).then((d) => { D = d; const hg = D.games.find((g) => g.h === D.hap || g.a === D.hap); if (hg) st.games.add(hg.code); draw(); }).catch((e) => { root.textContent = 'Could not load the plays: ' + e.message; });
})();
