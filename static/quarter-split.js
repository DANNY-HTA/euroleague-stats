// Quarter splits: players and teams, season stats accumulated over the chosen quarter(s).
(function () {
  const el = document.getElementById('qs-data');
  if (!el) return;
  const D = JSON.parse(el.textContent);
  const I = Object.fromEntries(D.f.map((k, i) => [k, i]));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
  const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const st = { view: 'players', qs: new Set([1]), mode: 'tot', team: '', min: 30, gp: 3, q: '', sort: 'pts', dir: -1 };
  const table = document.querySelector('.qs-table'), note = document.getElementById('qs-note');

  const sum = (cells) => { const out = D.f.map(() => 0); let gMax = 0; for (const q of st.qs) { const c = cells?.[q]; if (!c) continue; c.forEach((v, i) => { out[i] += v; }); gMax = Math.max(gMax, c[I.g]); } out.gMax = gMax; return out; };
  // Games = most games in any one selected quarter (a player who played Q1 in 10 games and Q2 in 8 has 10 games).
  function row(name, sub, team, href, cells, opp) {
    const a = sum(cells), o = opp ? sum(opp) : null, g = a.gMax, min = a[I.secs] / 60;
    const r = { name, sub, team, href, g, min, ...Object.fromEntries(D.f.map((k) => [k, a[I[k]]])) };
    r.reb = r.oreb + r.dreb; r.pm = r.pf - r.pa;
    r.ortg = r.poss ? 100 * r.pf / r.poss : null; r.drtg = r.poss ? 100 * r.pa / r.poss : null; r.net = r.ortg != null ? r.ortg - r.drtg : null;
    const fga = r.fga2 + r.fga3, fgm = r.fgm2 + r.fgm3;
    r.p2 = r.fga2 ? 100 * r.fgm2 / r.fga2 : null; r.p3 = r.fga3 ? 100 * r.fgm3 / r.fga3 : null; r.pft = r.fta ? 100 * r.ftm / r.fta : null;
    r.efg = fga ? 100 * (fgm + 0.5 * r.fgm3) / fga : null; r.ts = (fga + 0.44 * r.fta) ? 100 * r.pts / (2 * (fga + 0.44 * r.fta)) : null;
    r.pir = r.pts + r.reb + r.ast + r.stl + r.blk + r.fd - (fga - fgm) - (r.fta - r.ftm) - r.tov - r.blka - r.fl;
    if (o) { r.opts = r.pa; const ofga = o[I.fga2] + o[I.fga3]; r.oefg = ofga ? 100 * (o[I.fgm2] + o[I.fgm3] + 0.5 * o[I.fgm3]) / ofga : null; r.o3 = o[I.fga3] ? 100 * o[I.fgm3] / o[I.fga3] : null; r.otov = o[I.tov]; r.pace = r.secs ? 40 * r.poss / (r.secs / 60) : null; }
    return r;
  }
  const RATE = new Set(['ortg', 'drtg', 'net', 'p2', 'p3', 'pft', 'efg', 'ts', 'oefg', 'o3', 'pace']);
  const PCOLS = [['g', 'GP'], ['min', 'MIN'], ['pts', 'PTS'], ['pm', '+/-'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net'], ['fgm2', '2PM'], ['fga2', '2PA'], ['p2', '2P%'], ['fgm3', '3PM'], ['fga3', '3PA'], ['p3', '3P%'], ['ftm', 'FTM'], ['fta', 'FTA'], ['pft', 'FT%'], ['ts', 'TS%'], ['efg', 'eFG%'], ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['tov', 'TOV'], ['stl', 'STL'], ['blk', 'BLK'], ['blka', 'BLKA'], ['fl', 'PF'], ['fd', 'FD'], ['pir', 'PIR']];
  const TCOLS = [['g', 'GP'], ['pts', 'PTS'], ['opts', 'OPP'], ['pm', '+/-'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net'], ['pace', 'Pace'], ['fgm2', '2PM'], ['fga2', '2PA'], ['p2', '2P%'], ['fgm3', '3PM'], ['fga3', '3PA'], ['p3', '3P%'], ['ftm', 'FTM'], ['fta', 'FTA'], ['pft', 'FT%'], ['ts', 'TS%'], ['efg', 'eFG%'], ['oefg', 'Opp eFG%'], ['o3', 'Opp 3P%'], ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['tov', 'TOV'], ['otov', 'Forced TOV'], ['stl', 'STL'], ['blk', 'BLK'], ['fl', 'PF'], ['fd', 'FD'], ['pir', 'PIR']];
  const shown = (r, k) => { const v = r[k]; if (v == null || RATE.has(k) || k === 'g') return v; if (st.mode === 'pg') return r.g ? v / r.g : null; if (st.mode === '40') return r.min ? 40 * v / r.min : null; return v; };
  const fmt = (r, k) => { const v = shown(r, k); if (v == null) return '–'; if (k === 'g') return v; if (k === 'pm' || k === 'net') return sg(v); if (k === 'min') return st.mode === 'tot' ? Math.round(v) : f1(v); if (st.mode === 'tot' && !RATE.has(k)) return Math.round(v); return f1(v); };

  function render() {
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
    document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(st.qs.has(Number(b.dataset.q)))));
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    const isP = st.view === 'players', cols = isP ? PCOLS : TCOLS;
    let rows = isP ? D.players.map(([n, tv, team, href, cells]) => row(n, tv, team, href, cells)) : D.teams.map(([n, code, crest, href, cells, opp]) => ({ ...row(n, code, code, href, cells, opp), crest }));
    if (st.team) rows = rows.filter((r) => r.team === st.team);
    if (isP) rows = rows.filter((r) => r.min >= st.min && r.g >= st.gp);
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter((r) => r.name.toLowerCase().includes(q)); }
    if (!cols.some(([k]) => k === st.sort)) st.sort = 'pts';
    rows.sort((a, b) => (st.sort === 'name' ? st.dir * a.name.localeCompare(b.name) : st.dir * ((shown(a, st.sort) ?? -1e9) - (shown(b, st.sort) ?? -1e9))));
    const qLab = [...st.qs].sort().map((q) => (q === 5 ? 'OT' : 'Q' + q)).join(' + ') || 'no quarter';
    note.textContent = `${qLab} · ${st.mode === 'tot' ? 'season totals' : st.mode === 'pg' ? 'per game' : 'per 40 minutes'} · ${rows.length} ${isP ? 'players' : 'teams'}${isP ? ` · at least ${st.min} min and ${st.gp} games in these quarters` : ''}. Hapoel highlighted.`;
    table.querySelector('thead').innerHTML = `<tr>${isP ? '<th scope="col">Team</th>' : ''}<th scope="col"><button type="button" data-s="name">${isP ? 'Player' : 'Team'}</button></th>${cols.map(([k, l]) => `<th scope="col" class="num"><button type="button" data-s="${k}"${st.sort === k ? ` aria-sort="${st.dir < 0 ? 'descending' : 'ascending'}"` : ''}>${l}</button></th>`).join('')}</tr>`;
    table.querySelector('tbody').innerHTML = rows.map((r) => `<tr${r.team === D.hapoel ? ' class="hap"' : ''}>${isP ? `<td class="muted">${esc(r.sub)}</td>` : ''}<td>${r.crest ? `<img class="crest small" src="${esc(r.crest)}" alt="" width="18" height="18"> ` : ''}<a href="${esc(r.href)}">${esc(r.name)}</a></td>${cols.map(([k]) => `<td class="num">${fmt(r, k)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="muted">Nothing matches these filters.</td></tr>`;
    table.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.s; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === 'name' || k === 'drtg' || k === 'oefg' || k === 'o3' || k === 'opts' ? 1 : -1; } render(); }));
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));
  document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { const q = Number(b.dataset.q); if (st.qs.has(q) && st.qs.size > 1) st.qs.delete(q); else st.qs.add(q); render(); }));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.mode = b.dataset.mode; render(); }));
  const f = (n) => document.querySelector(`[data-f="${n}"]`);
  f('team').addEventListener('change', (e) => { st.team = e.target.value; render(); });
  f('min').addEventListener('input', (e) => { st.min = Number(e.target.value) || 0; render(); });
  f('gp').addEventListener('input', (e) => { st.gp = Number(e.target.value) || 0; render(); });
  f('q').addEventListener('input', (e) => { st.q = e.target.value.trim(); render(); });
  render();
})();
