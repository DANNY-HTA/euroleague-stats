// Hapoel home page: competition tabs, box scores (basic / shooting / advanced / quarters), players table and the
// lineups tool with game selection. All data is embedded in the page (#hap-data).
(function () {
  const el = document.getElementById('hap-data');
  if (!el) return;
  const D = JSON.parse(el.textContent);
  const TK = D.tk, K = Object.fromEntries(TK.map((k, i) => [k, i]));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
  const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const pct = (m, a) => (a ? (100 * m / a).toFixed(1) : '–');
  const mm = (m) => { const t = Math.round((m || 0) * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const fmtD = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const compTag = (c) => `<span class="comp-tag comp-${c}">${c === 'el' ? 'EL' : 'IL'}</span>`;
  const person = (key) => D.people[key] || [key, null, {}];
  let comp = 'all';
  try { comp = new URLSearchParams(location.search).get('comp') || sessionStorage.getItem('hap-comp') || 'all'; } catch { /* storage unavailable */ }
  if (comp !== 'all' && !D.comps[comp]) comp = 'all';
  const inComp = (c) => comp === 'all' || c === comp;

  // ---- Competition tabs ----
  function applyComp() {
    document.body.dataset.comp = comp;
    document.querySelectorAll('.comp-tabs [data-comp]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.comp === comp)));
    document.querySelectorAll('[data-comp-col]').forEach((c) => { c.hidden = !(comp === 'all' || c.dataset.compCol === comp); });
    document.querySelectorAll('.hap-sched tr[data-comp], .comp-block[data-comp]').forEach((r) => { r.hidden = !inComp(r.dataset.comp); });
    renderGames(); renderPlayers(); renderLineups();
  }
  document.querySelectorAll('.comp-tabs [data-comp]').forEach((b) => b.addEventListener('click', () => {
    comp = b.dataset.comp; try { sessionStorage.setItem('hap-comp', comp); } catch { /* ignore */ }
    applyComp();
  }));

  // ---- Box scores ----
  const gamesBox = document.getElementById('hap-games');
  const VIEWS = [['basic', 'Basic'], ['shoot', 'Shooting'], ['adv', 'Advanced'], ['q', 'By quarter']];
  function boxTable(side, view, isMe, oppSide) {
    const rows = side.p.map((r) => ({ name: isMe ? person(r[1])[0] : r[0], href: isMe ? person(r[1])[1] : null, st: r[2], min: r[3] || 0, pm: r[4], s: r.slice(5) }));
    const T = side.t, tm = side.min || 200;
    const tFga = T[K.fga2] + T[K.fga3], tPoss = tFga + 0.44 * T[K.fta] - T[K.oreb] + T[K.tov];
    const nm = (x) => `${x.st ? '<span class="st" title="Starter">●</span> ' : ''}${x.href ? `<a href="${esc(x.href)}">${esc(x.name)}</a>` : esc(x.name)}`;
    const v = (x, k) => x.s[K[k]];
    let head, cells, tot;
    if (view === 'shoot') {
      head = ['Player', 'MIN', 'PTS', 'FG', 'FG%', '2P', '2P%', '3P', '3P%', 'FT', 'FT%', 'eFG%', 'TS%', 'FTr'];
      const row = (s, min) => { const fgm = s[K.fgm2] + s[K.fgm3], fga = s[K.fga2] + s[K.fga3]; return [min, s[K.pts], `${fgm}/${fga}`, pct(fgm, fga), `${s[K.fgm2]}/${s[K.fga2]}`, pct(s[K.fgm2], s[K.fga2]), `${s[K.fgm3]}/${s[K.fga3]}`, pct(s[K.fgm3], s[K.fga3]), `${s[K.ftm]}/${s[K.fta]}`, pct(s[K.ftm], s[K.fta]), fga ? (100 * (fgm + 0.5 * s[K.fgm3]) / fga).toFixed(1) : '–', (fga + 0.44 * s[K.fta]) ? (100 * s[K.pts] / (2 * (fga + 0.44 * s[K.fta]))).toFixed(1) : '–', fga ? (100 * s[K.fta] / fga).toFixed(0) : '–']; };
      cells = (x) => row(x.s, mm(x.min)); tot = row(T, String(Math.round(tm)));
    } else if (view === 'adv') {
      head = ['Player', 'MIN', 'PTS', 'PIR', '+/-', 'TS%', 'USG%', 'AST/TO', 'PTS/40', 'PIR/40', 'REB/40', 'Stocks', 'FD', 'BLKA'];
      const row = (s, min, pm) => { const fga = s[K.fga2] + s[K.fga3], plays = fga + 0.44 * s[K.fta] + s[K.tov]; const tPlays = tFga + 0.44 * T[K.fta] + T[K.tov];
        return [mm(min), s[K.pts], s[K.pir], pm == null ? '–' : (pm > 0 ? '+' : '') + pm, (fga + 0.44 * s[K.fta]) ? (100 * s[K.pts] / (2 * (fga + 0.44 * s[K.fta]))).toFixed(1) : '–', min ? (100 * plays * (tm / 5) / (min * tPlays)).toFixed(1) : '–', s[K.tov] ? (s[K.ast] / s[K.tov]).toFixed(1) : s[K.ast] ? '∞' : '–', min ? (40 * s[K.pts] / min).toFixed(1) : '–', min ? (40 * s[K.pir] / min).toFixed(1) : '–', min ? (40 * s[K.reb] / min).toFixed(1) : '–', s[K.stl] + s[K.blk], s[K.fd], s[K.blka]]; };
      cells = (x) => row(x.s, x.min, x.pm); tot = row(T, tm, null); tot[0] = String(Math.round(tm)); tot[5] = '100'; tot[7] = (40 * T[K.pts] / (tm / 5)).toFixed(1); tot[8] = (40 * T[K.pir] / (tm / 5)).toFixed(1); tot[9] = (40 * T[K.reb] / (tm / 5)).toFixed(1);
    } else {
      head = ['Player', 'MIN', 'PTS', '2P', '3P', 'FT', 'OR', 'DR', 'REB', 'AST', 'STL', 'TOV', 'BLK', 'BLKA', 'PF', 'FD', '+/-', 'PIR'];
      cells = (x) => [mm(x.min), v(x, 'pts'), `${v(x, 'fgm2')}/${v(x, 'fga2')}`, `${v(x, 'fgm3')}/${v(x, 'fga3')}`, `${v(x, 'ftm')}/${v(x, 'fta')}`, v(x, 'oreb'), v(x, 'dreb'), v(x, 'reb'), v(x, 'ast'), v(x, 'stl'), v(x, 'tov'), v(x, 'blk'), v(x, 'blka'), v(x, 'pf'), v(x, 'fd'), x.pm > 0 ? '+' + x.pm : x.pm, v(x, 'pir')];
      tot = [String(Math.round(tm)), T[K.pts], `${T[K.fgm2]}/${T[K.fga2]}`, `${T[K.fgm3]}/${T[K.fga3]}`, `${T[K.ftm]}/${T[K.fta]}`, T[K.oreb], T[K.dreb], T[K.reb], T[K.ast], T[K.stl], T[K.tov], T[K.blk], T[K.blka], T[K.pf], T[K.fd], '', T[K.pir]];
    }
    return `<table class="box"><thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((x) => `<tr${x.min ? '' : ' class="dnp"'}><td>${nm(x)}</td>${x.min ? cells(x).map((c) => `<td class="num">${c}</td>`).join('') : `<td class="muted small" colspan="${head.length - 1}">Did not play</td>`}</tr>`).join('')}
</tbody><tfoot><tr><th scope="row">Team</th>${tot.map((c) => `<td class="num">${c}</td>`).join('')}</tr></tfoot></table>`;
  }
  function quarterBox(g) {
    const n = Math.max(g.q[0].length, g.q[1].length, 4);
    const lab = (i) => (i < 4 ? 'Q' + (i + 1) : 'OT');
    const cum = (arr) => { let c = 0; return arr.map((x) => (c += x)); };
    return `<table class="box q"><thead><tr><th scope="col">Team</th>${Array.from({ length: n }, (_, i) => `<th scope="col" class="num">${lab(i)}</th>`).join('')}<th scope="col" class="num">Total</th></tr></thead><tbody>
<tr><th scope="row">Hapoel</th>${Array.from({ length: n }, (_, i) => `<td class="num">${g.q[0][i] ?? '–'}</td>`).join('')}<td class="num"><strong>${g.s[0]}</strong></td></tr>
<tr><th scope="row">${esc(g.opp[0])}</th>${Array.from({ length: n }, (_, i) => `<td class="num">${g.q[1][i] ?? '–'}</td>`).join('')}<td class="num"><strong>${g.s[1]}</strong></td></tr>
<tr class="muted"><th scope="row">Margin</th>${cum(g.q[0]).map((c, i) => { const m = c - (cum(g.q[1])[i] || 0); return `<td class="num ${m >= 0 ? 'pos' : 'neg'}">${m > 0 ? '+' : ''}${m}</td>`; }).join('')}<td></td></tr></tbody></table>`;
  }
  function gameDetail(g, view) {
    return `<div class="box-views" role="tablist">${VIEWS.map(([k, l]) => `<button type="button" data-view="${k}" aria-selected="${k === view}">${l}</button>`).join('')}<a class="btn-ghost small" href="${esc(g.href)}">Full game page →</a></div>
${view === 'q' ? quarterBox(g) : `<h4>Hapoel Tel Aviv</h4><div class="scroll">${boxTable(g.me, view, true)}</div><h4>${esc(g.opp[0])}</h4><div class="scroll">${boxTable(g.op, view, false)}</div>`}`;
  }
  function renderGames() {
    const list = D.games.filter((g) => inComp(g.c));
    if (!list.length) { gamesBox.innerHTML = '<p class="muted">No games yet.</p>'; return; }
    gamesBox.innerHTML = list.map((g, i) => `<details class="hap-game" data-i="${D.games.indexOf(g)}"${i === 0 ? ' open' : ''}><summary>${compTag(g.c)}<span class="hg-date">${fmtD(g.d)}</span><span class="hg-opp">${g.h ? 'vs' : 'at'} ${g.opp[1] ? `<img src="${esc(g.opp[1])}" alt="" width="20" height="20">` : ''}${esc(g.opp[0])}</span><strong class="${g.w ? 'pos' : 'neg'}">${g.w ? 'W' : 'L'} ${g.s[0]}–${g.s[1]}</strong>${g.r ? `<span class="muted small">Rd ${g.r}</span>` : ''}</summary><div class="hg-body"></div></details>`).join('');
    const fill = (d, view = 'basic') => { const g = D.games[Number(d.dataset.i)]; const b = d.querySelector('.hg-body'); b.innerHTML = gameDetail(g, view);
      b.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => fill(d, btn.dataset.view))); };
    gamesBox.querySelectorAll('details').forEach((d) => { if (d.open) fill(d); d.addEventListener('toggle', () => { if (d.open && !d.querySelector('.box-views')) fill(d); }); });
  }

  // ---- Players: every stat, aggregated over the games of the chosen competition ----
  const playersBox = document.getElementById('hap-players');
  let pMode = 'pg', pSort = 'min', pDir = -1;
  const PCOLS = [['gp', 'GP'], ['gs', 'GS'], ['min', 'MIN'], ['pts', 'PTS'], ['fgm2', '2PM'], ['fga2', '2PA'], ['p2', '2P%'], ['fgm3', '3PM'], ['fga3', '3PA'], ['p3', '3P%'], ['ftm', 'FTM'], ['fta', 'FTA'], ['pft', 'FT%'], ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['tov', 'TOV'], ['blk', 'BLK'], ['blka', 'BLKA'], ['pf', 'PF'], ['fd', 'FD'], ['pm', '+/-'], ['pir', 'PIR'], ['efg', 'eFG%'], ['ts', 'TS%'], ['usg', 'USG%'], ['ato', 'AST/TO'], ['swing', 'On/off'], ['imp', 'Impact'], ['ofd', 'Charges drawn']];
  const RATE = new Set(['p2', 'p3', 'pft', 'efg', 'ts', 'usg', 'ato', 'swing', 'imp']);
  const NOSCALE = new Set(['gp', 'gs', ...RATE]);
  function playerRows() {
    const agg = new Map();
    for (const g of D.games) {
      if (!inComp(g.c)) continue;
      const T = g.me.t, tFga = T[K.fga2] + T[K.fga3];
      for (const r of g.me.p) {
        if (!(r[3] > 0)) continue;
        if (!agg.has(r[1])) agg.set(r[1], { key: r[1], gp: 0, gs: 0, min: 0, pm: 0, s: TK.map(() => 0), ctx: { min: 0, fga: 0, fta: 0, tov: 0 } });
        const a = agg.get(r[1]); a.gp++; if (r[2]) a.gs++; a.min += r[3]; a.pm += r[4]; r.slice(5).forEach((v, i) => { a.s[i] += v; });
        a.ctx.min += g.me.min; a.ctx.fga += tFga; a.ctx.fta += T[K.fta]; a.ctx.tov += T[K.tov];
      }
    }
    return [...agg.values()].map((a) => {
      const [name, href, ex] = person(a.key), s = a.s, fga = s[K.fga2] + s[K.fga3], fgm = s[K.fgm2] + s[K.fgm3];
      const plays = fga + 0.44 * s[K.fta] + s[K.tov], tPlays = a.ctx.fga + 0.44 * a.ctx.fta + a.ctx.tov;
      const adv = comp === 'all' ? null : ex[comp] || null;
      const row = { name, href, ex, gp: a.gp, gs: a.gs, min: a.min, pm: a.pm, ...Object.fromEntries(TK.map((k, i) => [k, s[i]])),
        p2: s[K.fga2] ? 100 * s[K.fgm2] / s[K.fga2] : null, p3: s[K.fga3] ? 100 * s[K.fgm3] / s[K.fga3] : null, pft: s[K.fta] ? 100 * s[K.ftm] / s[K.fta] : null,
        efg: fga ? 100 * (fgm + 0.5 * s[K.fgm3]) / fga : null, ts: (fga + 0.44 * s[K.fta]) ? 100 * s[K.pts] / (2 * (fga + 0.44 * s[K.fta])) : null,
        usg: a.min && tPlays ? 100 * plays * (a.ctx.min / 5) / (a.min * tPlays) : null, ato: s[K.tov] ? s[K.ast] / s[K.tov] : null,
        swing: adv?.swing ?? null, imp: adv?.imp ?? null, ofd: comp === 'all' ? Object.values(ex).reduce((t, x) => t + (x && typeof x === 'object' ? x.ofd || 0 : 0), 0) : adv?.ofd ?? 0 };
      return row;
    });
  }
  function shown(r, k) {
    const v = r[k]; if (v == null) return null;
    if (NOSCALE.has(k)) return v;
    if (pMode === 'pg') return v / r.gp;
    if (pMode === '40') return r.min ? 40 * v / r.min : null;
    return v;
  }
  function renderPlayers() {
    const rows = playerRows();
    if (!rows.length) { playersBox.innerHTML = '<p class="muted">No games yet.</p>'; return; }
    rows.sort((a, b) => { const x = shown(a, pSort), y = shown(b, pSort); if (pSort === 'name') return pDir * a.name.localeCompare(b.name); return (y ?? -1e9) - (x ?? -1e9) === 0 ? a.name.localeCompare(b.name) : pDir * ((x ?? -1e9) - (y ?? -1e9)); });
    const fmt = (r, k) => { const v = shown(r, k); if (v == null) return '–'; if (k === 'gp' || k === 'gs') return v; if (k === 'min') return pMode === 'tot' ? Math.round(v) : f1(v);
      if (k === 'pm' || k === 'swing' || k === 'imp') return sg(v); if (k === 'ato') return v.toFixed(2); if (pMode === 'tot' && !RATE.has(k)) return Math.round(v); return f1(v); };
    playersBox.innerHTML = `<div class="filters"><div class="seg" role="group" aria-label="Show">${[['pg', 'Per game'], ['tot', 'Totals'], ['40', 'Per 40 min']].map(([k, l]) => `<button type="button" data-pm="${k}" aria-pressed="${pMode === k}">${l}</button>`).join('')}</div>
<span class="muted small">${comp === 'all' ? 'Both competitions. On/off and impact are per league — pick a competition to see them.' : esc(D.comps[comp])}</span></div>
<div class="scroll"><table class="sortable hap-players"><thead><tr><th scope="col"><button type="button" data-k="name">Player</button></th><th scope="col">Pos</th><th scope="col" class="num">Ht</th><th scope="col" class="num">Age</th>${PCOLS.map(([k, l]) => `<th scope="col" class="num"><button type="button" data-k="${k}"${pSort === k ? ` aria-sort="${pDir < 0 ? 'descending' : 'ascending'}"` : ''}>${l}</button></th>`).join('')}</tr></thead><tbody>
${rows.map((r) => `<tr><td>${r.href ? `<a href="${esc(r.href)}">${esc(r.name)}</a>` : esc(r.name)}${r.ex.num ? ` <span class="muted small">#${esc(r.ex.num)}</span>` : ''}</td><td>${esc(r.ex.pos || '')}</td><td class="num">${r.ex.ht || '–'}</td><td class="num">${r.ex.age ?? '–'}</td>${PCOLS.map(([k]) => `<td class="num">${fmt(r, k)}</td>`).join('')}</tr>`).join('')}
</tbody></table></div>`;
    playersBox.querySelectorAll('[data-pm]').forEach((b) => b.addEventListener('click', () => { pMode = b.dataset.pm; renderPlayers(); }));
    playersBox.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.k; if (pSort === k) pDir = -pDir; else { pSort = k; pDir = k === 'name' ? 1 : -1; } renderPlayers(); }));
  }

  // ---- Lineups: choose games, unit size, minimum minutes ----
  const lineBox = document.getElementById('hap-lineups');
  const LG = D.games.filter((g) => D.lineupGames.includes(g.c + '|' + g.id));
  let picked = null, size = 5, minMin = 5, lSort = 'min';
  const combos = (arr, k) => { const out = []; const rec = (st, acc) => { if (acc.length === k) { out.push(acc); return; } for (let i = st; i < arr.length; i++) rec(i + 1, [...acc, arr[i]]); }; rec(0, []); return out; };
  function renderLineups() {
    const avail = LG.filter((g) => inComp(g.c));
    if (!avail.length) { lineBox.innerHTML = '<p class="muted">No games with a complete play-by-play yet.</p>'; return; }
    if (!picked || ![...picked].every((id) => avail.some((g) => g.c + '|' + g.id === id))) picked = new Set(avail.map((g) => g.c + '|' + g.id));
    const units = new Map();
    for (const s of D.stints) {
      const gid = s[1] + '|' + s[0]; if (!picked.has(gid)) continue;
      const ids = s[2].split('|').sort();
      for (const c of (size === 5 ? [ids] : combos(ids, size))) {
        const key = c.join('|');
        if (!units.has(key)) units.set(key, { ids: c, secs: 0, pf: 0, pa: 0, pm: 0, po: 0, g: new Set() });
        const u = units.get(key); u.secs += s[3]; u.pf += s[4]; u.pa += s[5]; u.pm += s[6] || 0; u.po += s[7] || 0; u.g.add(gid);
      }
    }
    const list = [...units.values()].filter((u) => u.secs >= minMin * 60).map((u) => { const poss = (u.pm + u.po) / 2; return { ...u, poss, ortg: poss ? 100 * u.pf / poss : null, drtg: poss ? 100 * u.pa / poss : null }; })
      .map((u) => ({ ...u, net: u.ortg != null ? u.ortg - u.drtg : null }));
    const key = { min: (u) => u.secs, net: (u) => u.net ?? -1e9, ortg: (u) => u.ortg ?? -1e9, drtg: (u) => -(u.drtg ?? 1e9), pm: (u) => u.pf - u.pa, gp: (u) => u.g.size }[lSort];
    list.sort((a, b) => key(b) - key(a));
    const short = (k) => { const n = person(k)[0] || k; const p = n.split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; };
    const gLabel = (g) => `${g.c === 'el' ? 'EL' : 'IL'} ${fmtD(g.d)} ${g.h ? 'vs' : 'at'} ${g.opp[2] || g.opp[0]} ${g.w ? 'W' : 'L'} ${g.s[0]}–${g.s[1]}`;
    lineBox.innerHTML = `<div class="filters">
<label>Group <select data-l="size">${[5, 4, 3, 2].map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n === 5 ? 'Five-man lineups' : n + '-man combinations'}</option>`).join('')}</select></label>
<label>At least <select data-l="min">${[0, 2, 5, 10, 20, 40].map((n) => `<option value="${n}"${n === minMin ? ' selected' : ''}>${n} min</option>`).join('')}</select></label>
<div class="seg" role="group" aria-label="Quick game selection"><button type="button" data-q="all">All games</button><button type="button" data-q="l3">Last 3</button><button type="button" data-q="l5">Last 5</button><button type="button" data-q="l10">Last 10</button><button type="button" data-q="w">Wins</button><button type="button" data-q="l">Losses</button><button type="button" data-q="h">Home</button><button type="button" data-q="a">Away</button></div>
</div>
<details class="game-pick"><summary>Games: <strong>${picked.size}</strong> of ${avail.length} selected — choose specific games</summary><div class="game-pick-list">${avail.map((g) => { const id = g.c + '|' + g.id; return `<label><input type="checkbox" value="${esc(id)}"${picked.has(id) ? ' checked' : ''}> ${esc(gLabel(g))}</label>`; }).join('')}</div></details>
<div class="scroll"><table class="hap-lineups"><thead><tr><th scope="col">Players</th>${[['gp', 'GP'], ['min', 'MIN'], ['pm', 'Score'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net']].map(([k, l]) => `<th scope="col" class="num"><button type="button" data-ls="${k}"${lSort === k ? ' aria-sort="descending"' : ''}>${l}</button></th>`).join('')}</tr></thead><tbody>
${list.slice(0, 60).map((u) => `<tr><td>${u.ids.map((k) => { const h = person(k)[1]; return h ? `<a href="${esc(h)}">${esc(short(k))}</a>` : esc(short(k)); }).join('<span class="muted"> · </span>')}</td><td class="num">${u.g.size}</td><td class="num">${mm(u.secs / 60)}</td><td class="num">${u.pf}–${u.pa}</td><td class="num">${f1(u.ortg)}</td><td class="num">${f1(u.drtg)}</td><td class="num ${u.net == null ? '' : u.net >= 0 ? 'pos' : 'neg'}">${sg(u.net)}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">No ${size === 5 ? 'lineup' : 'combination'} with at least ${minMin} minutes in these games.</td></tr>`}
</tbody></table></div><p class="muted small">${list.length} ${size === 5 ? 'lineups' : 'combinations'} (top 60 shown). ORtg/DRtg = points scored/allowed per 100 possessions. Only games whose official play-by-play matches the box score are used: ${LG.length} of ${D.games.length}.</p>`;
    lineBox.querySelector('[data-l="size"]').addEventListener('change', (e) => { size = Number(e.target.value); renderLineups(); });
    lineBox.querySelector('[data-l="min"]').addEventListener('change', (e) => { minMin = Number(e.target.value); renderLineups(); });
    lineBox.querySelectorAll('[data-ls]').forEach((b) => b.addEventListener('click', () => { lSort = b.dataset.ls; renderLineups(); }));
    lineBox.querySelectorAll('.game-pick input').forEach((c) => c.addEventListener('change', () => { if (c.checked) picked.add(c.value); else picked.delete(c.value); const open = lineBox.querySelector('.game-pick').open; renderLineups(); lineBox.querySelector('.game-pick').open = open; }));
    lineBox.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q, sorted = [...avail].sort((x, y) => y.d.localeCompare(x.d));
      const sel = q === 'all' ? sorted : q[0] === 'l' && q.length > 1 ? sorted.slice(0, Number(q.slice(1))) : sorted.filter((g) => (q === 'w' ? g.w : q === 'l' ? !g.w : q === 'h' ? g.h : !g.h));
      picked = new Set(sel.map((g) => g.c + '|' + g.id)); renderLineups();
    }));
  }

  applyComp();
})();
