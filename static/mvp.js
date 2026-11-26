// Home page MVP race: change the weights, see every qualified player, find anyone.
(() => {
  const host = document.getElementById('mvp-app'), src = document.getElementById('mvp-data');
  if (!host || !src) return;
  const D = JSON.parse(src.textContent);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (v != null) e.setAttribute(k, v); } e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return e; };
  const DEF = D.factors.map((f) => f[2]);
  const w = DEF.slice();
  const st = D.factors.map((_, j) => { const v = D.players.map((p) => p[4][j]).filter((x) => x != null); const m = v.reduce((s, x) => s + x, 0) / (v.length || 1); const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) || 1; return { m, sd }; });
  const Z = D.players.map((p) => p[4].map((v, j) => (v == null ? 0 : (v - st[j].m) / st[j].sd)));
  const fmt = (v, j) => (v == null ? '–' : D.factors[j][3] === 's' ? (v > 0 ? '+' : '') + v.toFixed(1) : v.toFixed(1));
  let showAll = false, q = '';
  const inputs = D.factors.map(([, l], j) => { const i = el('input', { type: 'number', min: '0', max: '100', step: '5', value: String(w[j]), 'aria-label': `${l} weight` }); i.addEventListener('input', () => { w[j] = Math.max(0, Number(i.value) || 0); draw(); }); return el('label', { class: 'w-in' }, l, ' ', i, '%'); });
  const reset = el('button', { type: 'button', class: 'btn-ghost' }, 'Reset weights');
  reset.addEventListener('click', () => { DEF.forEach((v, j) => { w[j] = v; inputs[j].querySelector('input').value = String(v); }); draw(); });
  const allBtn = el('button', { type: 'button', class: 'btn-ghost', 'aria-pressed': 'false' }, `Show all ${D.players.length} players`);
  allBtn.addEventListener('click', () => { showAll = !showAll; allBtn.setAttribute('aria-pressed', String(showAll)); allBtn.textContent = showAll ? 'Show top 10' : `Show all ${D.players.length} players`; draw(); });
  const find = el('input', { type: 'search', placeholder: 'Find a player…', 'aria-label': 'Find a player' });
  find.addEventListener('input', () => { q = find.value.trim().toLowerCase(); draw(); });
  const tbody = el('tbody', {});
  const total = el('span', { class: 'muted small' });
  host.replaceChildren(
    el('div', { class: 'mvp-controls' }, el('div', { class: 'w-row' }, inputs, total, reset), el('div', { class: 'w-row' }, find, allBtn)),
    el('div', { class: 'scroll' }, el('table', { class: 'mvp' }, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '#'), el('th', { scope: 'col' }, 'Player'), el('th', { scope: 'col', class: 'num' }, 'Index'), D.factors.map(([, l]) => el('th', { scope: 'col', class: 'num' }, l)), el('th', { scope: 'col', class: 'num', title: 'Times MVP of a round' }, 'Rd MVP'))), tbody)));
  function draw() {
    const sum = w.reduce((s, x) => s + x, 0) || 1;
    total.textContent = `Total ${w.reduce((s, x) => s + x, 0)}% (weights are scaled to 100%)`;
    const rows = D.players.map((p, i) => ({ p, i, score: Z[i].reduce((s, z, j) => s + z * w[j] / sum, 0) })).sort((a, b) => b.score - a.score);
    rows.forEach((r, k) => { r.rank = k + 1; });
    const max = Math.max(0.01, rows[0]?.score || 0);
    let list = q ? rows.filter((r) => r.p[0].toLowerCase().includes(q) || r.p[1].toLowerCase() === q) : showAll ? rows : rows.slice(0, 10);
    tbody.replaceChildren(...list.map((r) => {
      const [name, tv, crest, href, vals, rd] = r.p;
      return el('tr', {}, el('td', { class: 'num' }, el('span', { class: `mvp-rank r${r.rank}` }, String(r.rank))),
        el('td', {}, el('a', { href }, name), ' ', el('span', { class: 'muted' }, crest ? el('img', { class: 'badge-img', src: crest, alt: '', width: '18', height: '18' }) : null, ' ', tv), el('div', { class: 'bar' }, el('span', { style: `width:${Math.max(3, 100 * Math.max(0, r.score) / max).toFixed(1)}%` }))),
        el('td', { class: 'num' }, el('strong', {}, r.score.toFixed(2))),
        vals.map((v, j) => el('td', { class: `num ${Z[r.i][j] >= 1 ? 'hi' : Z[r.i][j] <= -0.5 ? 'lo' : ''}` }, fmt(v, j))),
        el('td', { class: 'num' }, rd ? String(rd) : ''));
    }));
    if (!list.length) tbody.replaceChildren(el('tr', {}, el('td', { colspan: String(D.factors.length + 4), class: 'muted' }, 'No qualified player matches. Players need 10+ minutes a game and 40% of their team\'s games.')));
  }
  draw();
})();
