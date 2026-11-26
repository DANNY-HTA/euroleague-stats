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
      detail.innerHTML = `<h3>${esc(p.name)}</h3><p class="muted">${esc(p.team)} · ${p.gp} games</p><dl>${p.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p><a href="player-${String(p.id).replace(/[^A-Za-z0-9]/g, '')}.html"><strong>Full player page →</strong></a></p>`;
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
    const heads = [...table.querySelectorAll('thead th')];
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

// Home page: games browser (team and round filters).
(() => {
  const box = document.getElementById('games-filter');
  if (!box) return;
  const team = box.querySelector('[data-g="team"]'), round = box.querySelector('[data-g="round"]'), count = box.querySelector('[data-g="count"]');
  const cards = [...document.querySelectorAll('.gcards .gcard')];
  const apply = () => {
    let n = 0;
    for (const c of cards) { const ok = (!team.value || c.dataset.t.split(' ').includes(team.value)) && (!round.value || c.dataset.r === round.value); c.hidden = !ok; if (ok) n++; }
    count.textContent = `${n} game${n === 1 ? '' : 's'}`;
  };
  team.addEventListener('change', () => { if (team.value) round.value = ''; apply(); });
  round.addEventListener('change', apply);
  apply();
})();

// Show game times in the visitor's own time zone.
(() => {
  const day = (d) => { const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0); return Math.round((b - a) / 86400000); };
  document.querySelectorAll('time[data-utc]').forEach((el) => {
    const v = el.dataset.utc; if (!v) return;
    const d = new Date(v); if (isNaN(d)) return;
    const n = day(d);
    const date = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    el.textContent = `${date} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  });
})();

// Home boards: show the full list on demand.
document.querySelectorAll('.board-more').forEach((b) => b.addEventListener('click', () => {
  const card = b.closest('.board'), open = card.classList.toggle('open');
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? 'Show top 10' : `Show all ${b.dataset.n} players`;
  if (!open) card.scrollIntoView({ block: 'nearest' });
}));
