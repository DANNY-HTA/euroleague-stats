// Game page: box score for the chosen quarter(s) and a playing-time chart (who was on the court when).
(function () {
  const el = document.getElementById('qb-data'), app = document.getElementById('qb-app');
  if (!el || !app) return;
  const D = JSON.parse(el.textContent);
  const X = Object.fromEntries(D.k.map((k, i) => [k, i]));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mm = (secs) => { const t = Math.round(secs); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const pLabel = (q) => (q <= 4 ? 'Q' + q : D.periods > 5 ? 'OT' + (q - 4) : 'OT');
  const picked = new Set(Array.from({ length: D.periods }, (_, i) => i + 1));
  let quick = 'all';

  const sum = (byQ) => { const out = D.k.map(() => 0); for (const q of picked) { const c = byQ?.[q]; if (c) c.forEach((v, i) => { out[i] += v; }); } return out; };
  const line = (a) => {
    const v = (k) => a[X[k]], fga = v('fga2') + v('fga3'), fgm = v('fgm2') + v('fgm3'), reb = v('oreb') + v('dreb');
    const pir = v('pts') + reb + v('ast') + v('stl') + v('blk') + v('fd') - (fga - fgm) - (v('fta') - v('ftm')) - v('tov') - v('blka') - v('fl');
    return [mm(v('secs')), v('pts'), `${v('fgm2')}/${v('fga2')}`, `${v('fgm3')}/${v('fga3')}`, `${v('ftm')}/${v('fta')}`, v('oreb'), v('dreb'), reb, v('ast'), v('stl'), v('tov'), v('blk'), v('fl'), v('fd'), (v('pm') > 0 ? '+' : '') + v('pm'), pir];
  };
  const HEAD = ['MIN', 'PTS', '2P', '3P', 'FT', 'OR', 'DR', 'REB', 'AST', 'STL', 'TOV', 'BLK', 'PF', 'FD', '+/-', 'PIR'];
  function boxFor(side) {
    const rows = D.players.filter((p) => p[2] === side).map((p) => ({ p, a: sum(D.box[p[0]]) })).filter((r) => r.a[X.secs] > 0 || r.a.some((v) => v)).sort((x, y) => y.a[X.secs] - x.a[X.secs]);
    const t = sum(D.team[side]);
    return `<h3>${esc(D[side][1])}</h3><div class="scroll"><table class="box qb-box"><thead><tr><th scope="col">Player</th>${HEAD.map((h) => `<th scope="col" class="num">${h}</th>`).join('')}</tr></thead><tbody>
${rows.map(({ p, a }) => `<tr><td>${p[3] ? '<span class="st" title="Starter">●</span> ' : ''}<a href="${esc(p[4])}">${esc(p[1])}</a></td>${line(a).map((c) => `<td class="num">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${HEAD.length + 1}" class="muted">Nobody played in these quarters.</td></tr>`}
</tbody><tfoot><tr><th scope="row">Team</th>${line(t).map((c, i) => `<td class="num">${i === 0 ? mm(t[X.secs]) : c}</td>`).join('')}</tr></tfoot></table></div>`;
  }
  // Playing time: one row per player, on-court stretches across the whole game, quarter lines.
  function chart(side) {
    const total = D.total || 2400, per = [];
    let acc = 0; for (let q = 1; q <= D.periods; q++) { per.push(acc); acc += q <= 4 ? 600 : 300; }
    const rows = D.players.filter((p) => p[2] === side && D.iv[p[0]]?.length).map((p) => ({ p, iv: D.iv[p[0]], secs: D.iv[p[0]].reduce((s, [a, b]) => s + b - a, 0) }));
    rows.sort((x, y) => y.p[3] - x.p[3] || y.secs - x.secs);
    const pct = (t) => (100 * t / total).toFixed(3);
    return `<h3>${esc(D[side][1])} — playing time</h3><div class="pt-chart">
<div class="pt-row pt-head"><span></span><div class="pt-track">${per.map((t, i) => `<span class="pt-q" style="left:${pct(t)}%">${pLabel(i + 1)}</span>`).join('')}</div><span class="num">MIN</span></div>
${rows.map(({ p, iv, secs }) => `<div class="pt-row"><span class="pt-name">${p[3] ? '<span class="st">●</span> ' : ''}${esc(p[1])}</span><div class="pt-track">${per.slice(1).map((t) => `<i class="pt-line" style="left:${pct(t)}%"></i>`).join('')}${iv.map(([a, b]) => `<b class="pt-on" style="left:${pct(a)}%;width:${pct(b - a)}%" title="${mm(a)}–${mm(b)} game time (${mm(b - a)})"></b>`).join('')}</div><span class="num">${mm(secs)}</span></div>`).join('')}
</div>`;
  }
  function render() {
    app.innerHTML = `${D.ok ? '' : ''}<div class="filters"${D.ok ? '' : ' hidden'}><div class="seg" role="group" aria-label="Quarters"><button type="button" data-q="all" aria-pressed="${quick === 'all'}">Whole game</button>${Array.from({ length: D.periods }, (_, i) => `<button type="button" data-q="${i + 1}" aria-pressed="${quick !== 'all' && picked.has(i + 1)}">${pLabel(i + 1)}</button>`).join('')}<button type="button" data-q="h1" aria-pressed="${quick === 'h1'}">1st half</button><button type="button" data-q="h2" aria-pressed="${quick === 'h2'}">2nd half</button></div>
<span class="muted small">${quick === 'all' ? 'Whole game' : [...picked].sort().map(pLabel).join(' + ')}</span></div>
${D.ok ? boxFor('H') + boxFor('A') : '<p class="muted">The play-by-play for this game does not add up exactly to the official box score, so the quarter box score is not shown. Playing time below is exact.</p>'}
<div class="pt-wrap">${chart('H')}${chart('A')}</div>
<p class="muted small">Quarter lines are from the play-by-play; in the "Whole game" view every stat matches the official box score${D.tdiff > 2 ? `, and minutes are within ${D.tdiff} seconds of the official minutes (the play-by-play clock is slightly off in this game)` : ''}. ● = starter. Hover a bar for the exact minutes.</p>`;
    app.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q;
      if (q === 'all') { picked.clear(); for (let i = 1; i <= D.periods; i++) picked.add(i); quick = 'all'; }
      else if (q === 'h1') { picked.clear(); picked.add(1); picked.add(2); quick = 'h1'; }
      else if (q === 'h2') { picked.clear(); for (let i = 3; i <= D.periods; i++) picked.add(i); quick = 'h2'; }
      else { const n = Number(q); if (quick !== 'pick') { picked.clear(); picked.add(n); } else if (picked.has(n) && picked.size > 1) picked.delete(n); else picked.add(n); quick = 'pick'; }
      render();
    }));
  }
  render();
})();
