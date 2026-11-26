// Recruiting: every player of every league on HTA LAB in one searchable table, "find players like…", and a shortlist.
(function () {
  const app = document.getElementById('recruit-app');
  if (!app) return;
  const LEAGUES = JSON.parse(document.getElementById('recruit-leagues').textContent); // [key, name, dir, logo]
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } } };
  const SL = 'hta-shortlist';
  let shortlist = store.get(SL, []); // keys
  const P = []; // players
  const st = { lg: new Set(LEAGUES.map((l) => l[0])), pos: '', ageMin: '', ageMax: '', htMin: '', minGp: 5, minMpg: 10, q: '', sort: 'pts40', dir: -1, mode: '40', like: null, show: 100, onlyList: false };
  // [key, label, per-mode?, decimals, higher better]
  const COLS = [['gp', 'GP', 0, 0], ['mpg', 'MIN', 0, 1], ['pts', 'PTS', 1, 1], ['reb', 'REB', 1, 1], ['oreb', 'OR', 1, 1], ['ast', 'AST', 1, 1], ['stl', 'STL', 1, 1], ['blk', 'BLK', 1, 1], ['tov', 'TOV', 1, 1],
    ['p2', '2P%', 0, 1], ['p3', '3P%', 0, 1], ['a3', '3PA', 1, 1], ['pft', 'FT%', 0, 1], ['fta', 'FTA', 1, 1], ['ts', 'TS%', 0, 1], ['usg', 'USG%', 0, 1], ['astTo', 'A/TO', 0, 2], ['pir', 'PIR', 1, 1]];

  async function load() {
    app.innerHTML = '<p class="muted">Loading every league…</p>';
    await Promise.all(LEAGUES.map(async (L) => {
      try {
        const r = await fetch(L[2] + 'player-stats.json'); if (!r.ok) return;
        const ps = await r.json(); const I = Object.fromEntries(ps.tk.map((k, i) => [k, i])); const tn = new Map((ps.teams || []).map((t) => [t[0], t[1]]));
        for (const p of ps.players) {
          const gp = p[10], min = p[12] || 0; if (!gp || !min) continue;
          const t = p[15], g = (k) => t[I[k]] || 0, fga = g('fga2') + g('fga3'), tsa = fga + 0.44 * g('fta');
          const per = (k) => ({ pg: g(k) / gp, 40: 40 * g(k) / min, tot: g(k) });
          P.push({ key: L[0] + ':' + p[3], lg: L, name: p[0], team: tn.get(p[2]) || tn.get(p[1]) || p[2] || p[1], href: L[2] + p[3], pos: p[4] || '', ht: +p[5] || null, age: p[7] === '' || p[7] == null ? null : +p[7], nat: p[8] || '',
            gp, mpg: min / gp, min, pts: per('pts'), reb: per('reb'), oreb: per('oreb'), ast: per('ast'), stl: per('stl'), blk: per('blk'), tov: per('tov'), a3: per('fga3'), fta: per('fta'), pir: per('pir'),
            p2: g('fga2') ? 100 * g('fgm2') / g('fga2') : null, p3: g('fga3') >= 10 ? 100 * g('fgm3') / g('fga3') : null, pft: g('fta') >= 10 ? 100 * g('ftm') / g('fta') : null,
            ts: tsa ? 100 * g('pts') / (2 * tsa) : null, usg: p[16] ?? null, astTo: g('tov') ? g('ast') / g('tov') : null,
            tpr: fga ? g('fga3') / fga : 0, ftr: fga ? g('fta') / fga : 0, raw40: { pts: 40 * g('pts') / min, oreb: 40 * g('oreb') / min, dreb: 40 * g('dreb') / min, ast: 40 * g('ast') / min, stl: 40 * g('stl') / min, blk: 40 * g('blk') / min, tov: 40 * g('tov') / min, fd: 40 * g('fd') / min } });
        }
      } catch { /* league not available */ }
    }));
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('like')) st.like = h.get('like');
    if (h.get('list')) { for (const k of h.get('list').split(',')) if (!shortlist.includes(k)) shortlist.push(k); store.set(SL, shortlist); st.onlyList = true; }
    render();
  }
  const v = (p, k) => { const x = p[k]; return x != null && typeof x === 'object' ? x[st.mode] : x; };

  // ---- similarity: standardized style profile (per 40 + shot mix + efficiency + size) ----
  const FEAT = [(p) => p.raw40.pts, (p) => p.raw40.oreb, (p) => p.raw40.dreb, (p) => p.raw40.ast, (p) => p.raw40.stl, (p) => p.raw40.blk, (p) => p.raw40.tov, (p) => p.raw40.fd, (p) => p.tpr, (p) => p.ftr, (p) => p.ts ?? 50, (p) => p.usg ?? 20, (p) => p.ht ?? 198];
  const W = [1.2, 1, 1, 1.2, 0.7, 0.8, 0.6, 0.6, 1.2, 0.6, 0.7, 1, 1.3];
  function similar(base) {
    const pool = P.filter((p) => p.min >= 120 && p !== base);
    const all = [...pool, base];
    const mu = FEAT.map((f) => all.reduce((s, p) => s + f(p), 0) / all.length);
    const sd = FEAT.map((f, i) => Math.sqrt(all.reduce((s, p) => s + (f(p) - mu[i]) ** 2, 0) / all.length) || 1);
    const z = (p) => FEAT.map((f, i) => (f(p) - mu[i]) / sd[i]);
    const zb = z(base);
    return pool.map((p) => { const zp = z(p); const d = Math.sqrt(zp.reduce((s, x, i) => s + W[i] * (x - zb[i]) ** 2, 0) / W.reduce((a, b) => a + b, 0)); return { p, d, sim: Math.max(0, Math.round(100 * Math.exp(-d * 0.9))) }; }).sort((a, b) => a.d - b.d).slice(0, 25);
  }

  function filtered() {
    const q = norm(st.q);
    return P.filter((p) => (st.onlyList ? shortlist.includes(p.key) : (st.lg.has(p.lg[0]) && p.gp >= st.minGp && p.mpg >= st.minMpg
      && (!st.pos || norm(p.pos).startsWith(st.pos)) && (st.ageMin === '' || (p.age != null && p.age >= +st.ageMin)) && (st.ageMax === '' || (p.age != null && p.age <= +st.ageMax))
      && (st.htMin === '' || (p.ht != null && p.ht >= +st.htMin)))) && (!q || norm(p.name).includes(q) || norm(p.team).includes(q) || norm(p.nat).includes(q)));
  }
  const fmt = (x, d) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
  const star = (p) => `<button type="button" class="rc-star${shortlist.includes(p.key) ? ' on' : ''}" data-star="${esc(p.key)}" aria-label="Shortlist ${esc(p.name)}" title="Shortlist">${shortlist.includes(p.key) ? '★' : '☆'}</button>`;
  const who = (p) => `<a href="${esc(p.href)}"><strong>${esc(p.name)}</strong></a><span class="muted small"> ${esc(p.team)}</span>`;
  const lgTag = (p) => `<span class="rc-lg">${p.lg[3] ? `<img src="${esc(p.lg[3])}" alt="" width="16" height="16">` : ''}${esc(p.lg[1])}</span>`;
  const bio = (p) => `<td class="small">${esc((p.pos || '').slice(0, 1))}</td><td class="num">${p.ht || '–'}</td><td class="num">${p.age ?? '–'}</td><td class="small">${esc(p.nat)}</td>`;
  const statCells = (p) => COLS.map(([k, , , d]) => `<td class="num">${fmt(v(p, k), d)}</td>`).join('');

  function likeHtml() {
    const base = P.find((p) => p.key === st.like); if (!base) return '';
    const S = similar(base);
    return `<div class="rc-like card-inset"><h3>Players like ${esc(base.name)} <span class="muted small">${esc(base.team)} · ${esc(base.lg[1])}</span> <button type="button" class="btn ghost small" id="rc-like-x">Close</button></h3>
<p class="muted small">Closest style profiles across every league: scoring, rebounding, playmaking, defense stats per 40, shot mix (threes, free throws), efficiency, usage and height. 100 = identical profile. Players with 120+ minutes.</p>
<div class="scroll"><table class="rc-table"><thead><tr><th></th><th>Similarity</th><th>Player</th><th>League</th><th>Pos</th><th class="num">Ht</th><th class="num">Age</th><th>Nat</th>${COLS.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>
<tr class="rc-base"><td>${star(base)}</td><td><strong>Base</strong></td><td>${who(base)}</td><td>${lgTag(base)}</td>${bio(base)}${statCells(base)}</tr>
${S.map(({ p, sim }) => `<tr><td>${star(p)}</td><td><span class="rc-sim" style="--s:${sim}%">${sim}</span></td><td>${who(p)}</td><td>${lgTag(p)}</td>${bio(p)}${statCells(p)}</tr>`).join('')}
</tbody></table></div></div>`;
  }

  function render() {
    const rows = filtered().sort((a, b) => { const x = v(a, st.sort), y = v(b, st.sort); if (x == null) return 1; if (y == null) return -1; return st.dir * (x - y); });
    const listP = shortlist.map((k) => P.find((p) => p.key === k)).filter(Boolean);
    app.innerHTML = `<div class="rc-filters">
<div class="rc-lgs">${LEAGUES.map((L) => `<label class="chip"><input type="checkbox" data-lg="${L[0]}" ${st.lg.has(L[0]) ? 'checked' : ''}>${L[3] ? `<img src="${esc(L[3])}" alt="" width="16" height="16">` : ''}${esc(L[1])}</label>`).join('')}</div>
<div class="rc-row">
<input type="search" id="rc-q" placeholder="Name, team or nationality" value="${esc(st.q)}">
<label>Position <select id="rc-pos"><option value="">Any</option>${[['g', 'Guard'], ['f', 'Forward'], ['c', 'Center']].map(([k, l]) => `<option value="${k}" ${st.pos === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
<label>Age <input type="number" id="rc-amin" value="${st.ageMin}" placeholder="min" min="15" max="45"> – <input type="number" id="rc-amax" value="${st.ageMax}" placeholder="max" min="15" max="45"></label>
<label>Height ≥ <input type="number" id="rc-ht" value="${st.htMin}" placeholder="cm" min="150" max="230"></label>
<label>Games ≥ <input type="number" id="rc-gp" value="${st.minGp}" min="0"></label>
<label>MIN/g ≥ <input type="number" id="rc-mpg" value="${st.minMpg}" min="0"></label>
<div class="seg" role="group" aria-label="Show">${[['40', 'Per 40'], ['pg', 'Per game'], ['tot', 'Totals']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${st.mode === k}">${l}</button>`).join('')}</div>
</div></div>
<div class="rc-shortlist"><strong>Shortlist (${listP.length})</strong> ${listP.map((p) => `<span class="chip">${esc(p.name)} <button type="button" data-star="${esc(p.key)}" aria-label="Remove">×</button></span>`).join('')}
${listP.length ? `<button type="button" class="btn ghost small" id="rc-only">${st.onlyList ? 'Show everyone' : 'Show shortlist only'}</button> <a class="btn ghost small" href="compare.html#${listP.slice(0, 3).map((p) => p.key).join(',')}">Compare first 3</a> <button type="button" class="btn ghost small" id="rc-share">Copy link to shortlist</button> <button type="button" class="btn ghost small" id="rc-csv">Download CSV</button>` : '<span class="muted small">Tap ☆ to add players. The shortlist stays in this browser; "Copy link" sends it to someone else.</span>'}</div>
${likeHtml()}
<p class="muted small">${rows.length} players. ${st.mode === '40' ? 'Per 40 minutes' : st.mode === 'pg' ? 'Per game' : 'Season totals'}; 3P% and FT% need 10+ attempts. Click a column to sort; ≈ finds players with the same profile. Different leagues are different levels.</p>
<div class="scroll"><table class="rc-table"><thead><tr><th></th><th></th><th>Player</th><th>League</th><th>Pos</th><th class="num">Ht</th><th class="num">Age</th><th>Nat</th>${COLS.map(([k, l]) => `<th class="num"><button type="button" data-sort="${k}">${l}${st.sort === k ? (st.dir < 0 ? ' ▼' : ' ▲') : ''}</button></th>`).join('')}</tr></thead><tbody>
${rows.slice(0, st.show).map((p) => `<tr>${'<td>' + star(p) + '</td>'}<td><button type="button" class="rc-likebtn" data-like="${esc(p.key)}" title="Find players like ${esc(p.name)}">≈</button></td><td>${who(p)}</td><td>${lgTag(p)}</td>${bio(p)}${statCells(p)}</tr>`).join('')}
</tbody></table></div>${rows.length > st.show ? `<p><button type="button" class="btn ghost" id="rc-more">Show more (${rows.length - st.show} left)</button></p>` : ''}`;
    const on = (sel, ev, f) => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, f));
    on('[data-lg]', 'change', (e) => { const k = e.target.dataset.lg; if (e.target.checked) st.lg.add(k); else st.lg.delete(k); render(); });
    const num = (id, key) => on('#' + id, 'change', (e) => { st[key] = e.target.value === '' ? '' : Number(e.target.value); render(); });
    num('rc-amin', 'ageMin'); num('rc-amax', 'ageMax'); num('rc-ht', 'htMin'); num('rc-gp', 'minGp'); num('rc-mpg', 'minMpg');
    on('#rc-pos', 'change', (e) => { st.pos = e.target.value; render(); });
    on('#rc-q', 'input', (e) => { st.q = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { const pos = e.target.selectionStart; render(); const q = app.querySelector('#rc-q'); q.focus(); q.setSelectionRange(pos, pos); }, 250); });
    on('[data-mode]', 'click', (e) => { st.mode = e.target.dataset.mode; render(); });
    on('[data-sort]', 'click', (e) => { const k = e.currentTarget.dataset.sort; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = -1; } render(); });
    on('[data-star]', 'click', (e) => { const k = e.currentTarget.dataset.star; shortlist = shortlist.includes(k) ? shortlist.filter((x) => x !== k) : [...shortlist, k]; store.set(SL, shortlist); if (!shortlist.length) st.onlyList = false; render(); });
    on('[data-like]', 'click', (e) => { st.like = e.currentTarget.dataset.like; history.replaceState(null, '', '#like=' + encodeURIComponent(st.like)); render(); app.querySelector('.rc-like')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    on('#rc-like-x', 'click', () => { st.like = null; history.replaceState(null, '', location.pathname); render(); });
    on('#rc-more', 'click', () => { st.show += 200; render(); });
    on('#rc-only', 'click', () => { st.onlyList = !st.onlyList; render(); });
    on('#rc-share', 'click', (e) => { const u = location.origin + location.pathname + '#list=' + encodeURIComponent(shortlist.join(',')); navigator.clipboard?.writeText(u); e.target.textContent = 'Link copied'; });
    on('#rc-csv', 'click', () => {
      const head = ['Player', 'Team', 'League', 'Pos', 'Height', 'Age', 'Nationality', ...COLS.map((c) => c[1])];
      const lines = [head, ...listP.map((p) => [p.name, p.team, p.lg[1], p.pos, p.ht ?? '', p.age ?? '', p.nat, ...COLS.map(([k, , , d]) => fmt(v(p, k), d))])].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })); a.download = 'hta-shortlist.csv'; a.click();
    });
  }
  load();
})();
