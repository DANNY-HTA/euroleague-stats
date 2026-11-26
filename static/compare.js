// Player comparison: 2–3 players side by side, from any league on HTA LAB (EuroLeague, Winner League, ACB …).
(function () {
  const app = document.getElementById('compare-app');
  if (!app) return;
  const LEAGUES = JSON.parse(document.getElementById('compare-leagues').textContent); // [key, name, dir, logo]
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ALL = []; // {lg, row, I, team, key}
  let mode = 'pg';
  const picked = [];

  async function load() {
    app.innerHTML = '<p class="muted">Loading every league…</p>';
    await Promise.all(LEAGUES.map(async (L) => {
      try {
        const r = await fetch(L[2] + 'player-stats.json'); if (!r.ok) return;
        const ps = await r.json(); const I = Object.fromEntries(ps.tk.map((k, i) => [k, i]));
        const tn = new Map((ps.teams || []).map((t) => [t[0], t[1]]));
        for (const p of ps.players) if (p[10] > 0) ALL.push({ lg: L, row: p, I, team: tn.get(p[2]) || tn.get(p[1]) || p[2] || p[1], key: L[0] + ':' + p[3] });
      } catch { /* league not available */ }
    }));
    // from the address (#el:player-X.html,acb:player-Y.html)
    for (const k of decodeURIComponent(location.hash.slice(1)).split(',').filter(Boolean)) { const x = ALL.find((a) => a.key === k); if (x && picked.length < 3) picked.push(x); }
    render();
  }

  const val = (x) => {
    const p = x.row, t = p[15], I = x.I, gp = p[10], min = p[12] || 0, g = (k) => t[I[k]] || 0;
    const div = (a, b) => (b ? a / b : null);
    const scale = mode === 'pg' ? 1 / gp : mode === '40' ? (min ? 40 / min : 0) : 1;
    const c = (k) => g(k) * scale;
    const fga = g('fga2') + g('fga3'), fgm = g('fgm2') + g('fgm3'), tsa = fga + 0.44 * g('fta');
    return {
      gp, gs: p[11], min: mode === 'tot' ? min : mode === '40' ? 40 : min / gp,
      pts: c('pts'), reb: c('reb'), oreb: c('oreb'), dreb: c('dreb'), ast: c('ast'), stl: c('stl'), blk: c('blk'), tov: c('tov'), pf: c('pf'), fd: c('fd'), pir: c('pir'),
      pm: (p[13] || 0) * scale, fga2: c('fga2'), fga3: c('fga3'), fta: c('fta'),
      p2: div(100 * g('fgm2'), g('fga2')), p3: div(100 * g('fgm3'), g('fga3')), pft: div(100 * g('ftm'), g('fta')),
      m2: `${g('fgm2')}/${g('fga2')}`, m3: `${g('fgm3')}/${g('fga3')}`, mft: `${g('ftm')}/${g('fta')}`,
      ts: div(100 * g('pts'), 2 * tsa), efg: div(100 * (fgm + 0.5 * g('fgm3')), fga), usg: p[16] ?? null,
      astTo: div(g('ast'), g('tov')), tpr: div(100 * g('fga3'), fga), ftr: div(100 * g('fta'), fga)
    };
  };
  // [label, key, decimals, higher is better (1) / lower (-1) / neutral (0)]
  const ROWS = [
    ['Games (started)', 'gp', 0, 0], ['Minutes', 'min', 1, 0], ['Points', 'pts', 1, 1], ['Rebounds', 'reb', 1, 1], ['Off. rebounds', 'oreb', 1, 1], ['Def. rebounds', 'dreb', 1, 1],
    ['Assists', 'ast', 1, 1], ['Steals', 'stl', 1, 1], ['Blocks', 'blk', 1, 1], ['Turnovers', 'tov', 1, -1], ['Fouls', 'pf', 1, -1], ['Fouls drawn', 'fd', 1, 1],
    ['2P%', 'p2', 1, 1], ['3P%', 'p3', 1, 1], ['3P attempts', 'fga3', 1, 0], ['FT%', 'pft', 1, 1], ['FT attempts', 'fta', 1, 1],
    ['True shooting %', 'ts', 1, 1], ['Effective FG%', 'efg', 1, 1], ['3-pt rate (% of FGA)', 'tpr', 1, 0], ['FT rate', 'ftr', 1, 1], ['Usage %', 'usg', 1, 0],
    ['AST/TO', 'astTo', 2, 1], ['PIR', 'pir', 1, 1], ['+/-', 'pm', 1, 1]
  ];
  function table() {
    if (!picked.length) return '<p class="muted">Search for a player above — up to three, from any league.</p>';
    const V = picked.map(val);
    const head = picked.map((x, i) => { const p = x.row; return `<th scope="col" class="cmp-p"><button type="button" class="cmp-x" data-rm="${i}" aria-label="Remove ${esc(p[0])}">×</button>
<a href="${esc(x.lg[2] + p[3])}"><strong>${esc(p[0])}</strong></a><span class="cmp-lg">${x.lg[3] ? `<img src="${esc(x.lg[3])}" alt="" width="18" height="18">` : ''}${esc(x.lg[1])}</span><span class="muted small">${esc(x.team)}</span>
<span class="muted small">${[p[4], p[5] ? p[5] + ' cm' : '', p[7] ? p[7] + ' y' : '', p[8]].filter(Boolean).map(esc).join(' · ')}</span></th>`; }).join('');
    const body = ROWS.map(([label, k, dp, good]) => {
      const vs = V.map((v) => v[k]);
      const nums = vs.filter((v) => v != null && Number.isFinite(v));
      const best = good && nums.length > 1 ? (good > 0 ? Math.max(...nums) : Math.min(...nums)) : null;
      const mx = Math.max(...nums.map(Math.abs), 0);
      const cells = V.map((v, i) => {
        const x = v[k]; if (x == null || !Number.isFinite(x)) return '<td class="num">–</td>';
        const txt = k === 'gp' ? `${x} <span class="muted">(${v.gs})</span>` : k === 'pm' ? (x > 0 ? '+' : '') + x.toFixed(dp) : x.toFixed(dp);
        const extra = k === 'p2' ? v.m2 : k === 'p3' ? v.m3 : k === 'pft' ? v.mft : '';
        const isBest = best != null && x === best && nums.filter((n) => n === best).length < nums.length;
        return `<td class="num${isBest ? ' cmp-best' : ''}"><span class="cmp-bar" style="width:${mx ? Math.max(0, 100 * Math.abs(x) / mx) : 0}%"></span><span class="cmp-v">${txt}${extra ? ` <span class="muted small">${extra}</span>` : ''}</span></td>`;
      }).join('');
      return `<tr><th scope="row">${label}</th>${cells}</tr>`;
    }).join('');
    const lgs = new Set(picked.map((x) => x.lg[0]));
    return `<div class="scroll"><table class="cmp-table"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
${lgs.size > 1 ? '<p class="muted small">Players from different leagues: the level of competition is different, so compare roles and styles more than raw numbers.</p>' : ''}
<p class="muted small">Green = best of the players compared. ${mode === '40' ? 'Per 40 minutes. ' : mode === 'pg' ? 'Per game. ' : 'Season totals. '}Percentages and rates are for the whole season.</p>`;
  }
  function render() {
    app.innerHTML = `<div class="filters cmp-filters"><div class="cmp-search"><input type="search" id="cmp-q" placeholder="${picked.length >= 3 ? 'Remove a player to add another' : 'Add a player: type a name…'}" ${picked.length >= 3 ? 'disabled' : ''} autocomplete="off" aria-label="Search players"><ul id="cmp-sug" class="cmp-sug" hidden></ul></div>
<div class="seg" role="group" aria-label="Show">${[['pg', 'Per game'], ['40', 'Per 40'], ['tot', 'Totals']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
${picked.length ? '<button type="button" class="btn ghost" id="cmp-link">Copy link</button>' : ''}</div>
${table()}`;
    const q = app.querySelector('#cmp-q'), sug = app.querySelector('#cmp-sug');
    q?.addEventListener('input', () => {
      const s = norm(q.value.trim()); if (s.length < 2) { sug.hidden = true; return; }
      const hits = ALL.filter((x) => norm(x.row[0]).includes(s) && !picked.includes(x)).sort((a, b) => (b.row[12] || 0) - (a.row[12] || 0)).slice(0, 12);
      sug.innerHTML = hits.map((x, i) => `<li><button type="button" data-i="${ALL.indexOf(x)}"><strong>${esc(x.row[0])}</strong> <span class="muted small">${esc(x.team)} · ${esc(x.lg[1])} · ${x.row[10]} GP</span></button></li>`).join('') || '<li class="muted small">No player found.</li>';
      sug.hidden = false;
    });
    q?.focus();
    sug?.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; picked.push(ALL[+b.dataset.i]); sync(); });
    app.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { picked.splice(+b.dataset.rm, 1); sync(); }));
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; render(); }));
    app.querySelector('#cmp-link')?.addEventListener('click', (e) => { navigator.clipboard?.writeText(location.href); e.target.textContent = 'Link copied'; });
  }
  function sync() { history.replaceState(null, '', '#' + picked.map((x) => x.key).join(',')); render(); }
  load();
})();
