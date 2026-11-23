// Small extras on top of the static pages: hover details, chart switching,
// team filter and sortable tables. Every page still works without this file.
(function () {
  // Home page: show the hovered team under the chart.
  const info = document.querySelector('.hover-info');
  if (info) {
    const show = (e) => { const g = e.target.closest('.dot'); if (g) info.textContent = g.getAttribute('aria-label'); };
    document.querySelectorAll('.dot').forEach((g) => { g.addEventListener('mouseenter', show); g.addEventListener('focus', show); });
  }

  // Players page: detail card, chart tabs, team filter.
  const detail = document.querySelector('.detail');
  if (detail) {
    let byId = {};
    fetch('players.json').then((r) => r.json()).then((list) => { list.forEach((p) => { byId[p.id] = p; }); }).catch(() => {});
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pick = (g) => {
      document.querySelectorAll('.dot.on').forEach((d) => d.classList.remove('on'));
      g.classList.add('on');
      const p = byId[g.dataset.id];
      if (!p) { detail.textContent = g.getAttribute('aria-label'); return; }
      detail.innerHTML = `<h3>${esc(p.name)}</h3><p class="muted">${esc(p.team)} · ${p.gp} games</p><dl>${p.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p><a href="#${esc(p.id)}">Find in table ↓</a></p>`;
    };
    document.querySelectorAll('.charts .dot').forEach((g) => {
      g.addEventListener('mouseenter', () => pick(g));
      g.addEventListener('focus', () => pick(g));
      g.addEventListener('click', () => pick(g));
    });
    document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-show]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      document.querySelectorAll('.charts .chart').forEach((c) => { c.hidden = c.dataset.view !== b.dataset.show; });
    }));
    const sel = document.getElementById('team-filter');
    sel.addEventListener('change', () => {
      const t = sel.value;
      document.querySelectorAll('.charts .dot').forEach((g) => g.classList.toggle('dim', !!t && g.dataset.team !== t));
      document.querySelectorAll('#players tbody tr').forEach((tr) => { tr.hidden = !!t && tr.dataset.team !== t; });
    });
  }

  // Sortable tables.
  document.querySelectorAll('table.sortable').forEach((table) => {
    const heads = [...table.querySelectorAll('th')];
    heads.forEach((th, i) => th.querySelector('button').addEventListener('click', () => {
      const desc = th.getAttribute('aria-sort') !== 'descending';
      heads.forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      const body = table.tBodies[0];
      const rows = [...body.rows];
      const num = th.classList.contains('num');
      rows.sort((a, b) => {
        const x = a.cells[i].dataset.v, y = b.cells[i].dataset.v;
        const c = num ? Number(x) - Number(y) : x.localeCompare(y);
        return desc ? -c : c;
      });
      rows.forEach((r) => body.appendChild(r));
    }));
  });
})();
