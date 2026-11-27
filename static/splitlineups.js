// Lineups in two sets of games (wins / losses, or before / after), with filters.
(function () {
  const el = document.getElementById('sl-data'), app = document.getElementById('sl-app');
  if (!el || !app) return;
  const D = JSON.parse(el.textContent);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mm = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const st = { size: 5, min: 2, show: 'both', withIds: new Set(), without: new Set(), sort: 'secsAll', dir: -1, limit: 30 };
  const players = Object.entries(D.names).sort((a, b) => a[1].localeCompare(b[1]));
  const stat = (r) => { if (!r) return null; const [secs, pf, pa, poss, oposs, g] = r, P = (poss + oposs) / 2; return { secs, pf, pa, pm: pf - pa, ortg: P ? 100 * pf / P : null, drtg: P ? 100 * pa / P : null, net: P ? 100 * (pf - pa) / P : null, g }; };
  function rows() {
    const A = D.A[st.size] || {}, B = D.B[st.size] || {};
    return [...new Set([...Object.keys(A), ...Object.keys(B)])].map((k) => {
      const a = stat(A[k]), b = stat(B[k]), ids = k.split(',');
      return { k, ids, a, b, secsAll: (a?.secs || 0) + (b?.secs || 0), netDiff: a?.net != null && b?.net != null ? a.net - b.net : null };
    }).filter((r) => {
      if ([...st.withIds].some((id) => !r.ids.includes(id))) return false;
      if ([...st.without].some((id) => r.ids.includes(id))) return false;
      const minS = st.min * 60;
      if (st.show === 'a') return (r.a?.secs || 0) >= minS;
      if (st.show === 'b') return (r.b?.secs || 0) >= minS;
      if (st.show === 'both') return (r.a?.secs || 0) >= minS && (r.b?.secs || 0) >= minS;
      return r.secsAll >= minS; // any
    });
  }
  const val = (r, key) => { const [set, f] = key.split('.'); if (!f) return r[key]; return r[set]?.[f]; };
  function render() {
    const list = rows().sort((x, y) => { const a = val(x, st.sort), b = val(y, st.sort); if (a == null) return 1; if (b == null) return -1; return st.dir * (a - b); });
    const f1 = (v, sign) => (v == null ? '–' : (sign && v > 0 ? '+' : '') + v.toFixed(1));
    const cell = (s, k) => { if (!s) return '<td class="num muted">–</td>'.repeat(5); const pmC = s.pm > 0 ? 'pos' : s.pm < 0 ? 'neg' : ''; return `<td class="num">${mm(s.secs)}</td><td class="num muted">${s.g}</td><td class="num ${pmC}"><strong>${s.pm > 0 ? '+' : ''}${s.pm}</strong></td><td class="num">${f1(s.ortg)} / ${f1(s.drtg)}</td><td class="num ${s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : ''}">${f1(s.net, true)}</td>`; };
    const th = (label, key) => `<th class="num"><button type="button" data-sort="${key}">${label}${st.sort === key ? (st.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th>`;
    const chip = (set, cls) => [...set].map((id) => `<span class="chip ${cls}">${esc(D.names[id])} <button type="button" data-rm="${cls}:${id}" aria-label="Remove">×</button></span>`).join('');
    app.innerHTML = `<div class="sl-filters">
<div class="seg" role="group" aria-label="Lineup size">${[[5, 'Fives'], [4, '4-man'], [3, '3-man'], [2, 'Pairs']].map(([k, l]) => `<button type="button" data-size="${k}" aria-pressed="${st.size === k}">${l}</button>`).join('')}</div>
<div class="seg" role="group" aria-label="Show">${[['both', 'In both'], ['a', `In ${D.a.toLowerCase()}`], ['b', `In ${D.b.toLowerCase()}`], ['any', 'All']].map(([k, l]) => `<button type="button" data-show="${k}" aria-pressed="${st.show === k}">${esc(l)}</button>`).join('')}</div>
<label>Min. minutes <input type="number" id="sl-min" value="${st.min}" min="0" step="1"></label>
<label>With <select id="sl-with"><option value="">player…</option>${players.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label>
<label>Without <select id="sl-without"><option value="">player…</option>${players.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label>
${chip(st.withIds, 'with')}${chip(st.without, 'without')}
</div>
<p class="muted small">${list.length} lineups. "In ${esc(D.a.toLowerCase())}" = at least the minimum minutes in ${esc(D.a.toLowerCase())}; "In both" = at least the minimum in each; "All" = the minimum in total. From the games with lineups from the play-by-play: ${D.gA} ${esc(D.a.toLowerCase())}, ${D.gB} ${esc(D.b.toLowerCase())}. ORtg / DRtg / Net per 100 possessions. Click a column to sort.</p>
<div class="scroll"><table class="sl-table"><thead><tr><th rowspan="2">Lineup</th><th colspan="5" class="grp">${esc(D.a)}</th><th colspan="5" class="grp">${esc(D.b)}</th><th rowspan="2" class="num"><button type="button" data-sort="netDiff">Net diff${st.sort === 'netDiff' ? (st.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th></tr>
<tr>${['a', 'b'].map((x) => `${th('MIN', x + '.secs')}${th('G', x + '.g')}${th('+/-', x + '.pm')}<th class="num">ORtg / DRtg</th>${th('Net', x + '.net')}`).join('')}</tr></thead><tbody>
${list.slice(0, st.limit).map((r) => `<tr><td class="small">${r.ids.map((id) => esc(D.names[id] || id)).join(' · ')}</td>${cell(r.a)}${cell(r.b)}<td class="num ${r.netDiff > 0 ? 'pos' : r.netDiff < 0 ? 'neg' : ''}">${f1(r.netDiff, true)}</td></tr>`).join('') || '<tr><td colspan="12" class="muted">No lineup matches these filters.</td></tr>'}
</tbody></table></div>${list.length > st.limit ? `<p class="no-print"><button type="button" class="btn ghost" id="sl-more">Show more (${list.length - st.limit} left)</button></p>` : ''}`;
    const on = (sel, ev, fn) => app.querySelectorAll(sel).forEach((x) => x.addEventListener(ev, fn));
    on('[data-size]', 'click', (e) => { st.size = +e.currentTarget.dataset.size; st.min = st.size === 5 ? 2 : 5; render(); });
    on('[data-show]', 'click', (e) => { st.show = e.currentTarget.dataset.show; render(); });
    on('#sl-min', 'change', (e) => { st.min = Math.max(0, +e.target.value || 0); render(); });
    on('#sl-with', 'change', (e) => { if (e.target.value) { st.withIds.add(e.target.value); st.without.delete(e.target.value); } render(); });
    on('#sl-without', 'change', (e) => { if (e.target.value) { st.without.add(e.target.value); st.withIds.delete(e.target.value); } render(); });
    on('[data-rm]', 'click', (e) => { const [k, id] = e.currentTarget.dataset.rm.split(':'); (k === 'with' ? st.withIds : st.without).delete(id); render(); });
    on('[data-sort]', 'click', (e) => { const k = e.currentTarget.dataset.sort; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = -1; } render(); });
    on('#sl-more', 'click', () => { st.limit += 30; render(); });
  }
  render();
})();
