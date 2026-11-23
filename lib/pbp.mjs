// Play-by-play: who is on the court at every moment, and what happens while they are.
// Each game is only used if the result agrees with the official box score
// (team points, and every player's +/-), so lineup numbers are never guessed.

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const QUARTERS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const ACTION = new Set(['2FGM', '2FGA', '3FGM', '3FGA', 'FTM', 'FTA', 'O', 'D', 'AS', 'TO', 'ST', 'FV', 'AG', 'CM', 'RV', 'OF']);
const periodLen = (p) => (p <= 4 ? 600 : 300);
const periodStart = (p) => (p <= 4 ? (p - 1) * 600 : 2400 + (p - 5) * 300);

function clock(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Flatten the feed into plays with period and elapsed game seconds. */
export function flattenPlays(pbp) {
  const out = [];
  const push = (raw, period) => {
    const rem = clock(raw.MARKERTIME);
    const type = trim(raw.PLAYTYPE) || '';
    let t;
    if (type === 'BP') t = periodStart(period);
    else if (type === 'EP') t = periodStart(period) + periodLen(period);
    else if (rem != null) t = periodStart(period) + periodLen(period) - Math.min(rem, periodLen(period));
    else t = out.length ? out[out.length - 1].t : periodStart(period);
    out.push({ period, t, type, team: trim(raw.CODETEAM) || '', pid: trim(raw.PLAYER_ID) || '', n: Number(raw.NUMBEROFPLAY) || 0 });
  };
  QUARTERS.forEach((k, i) => (pbp?.[k] || []).forEach((r) => push(r, i + 1)));
  let ot = 4;
  for (const r of pbp?.ExtraTime || []) { if (trim(r.PLAYTYPE) === 'BP') ot++; push(r, Math.max(5, ot)); }
  return out;
}

/** Who started each period, worked out from the period's own events. */
function periodStarters(plays, team, carried) {
  const firstSub = new Map(), actedBeforeIn = new Set();
  for (const p of plays) {
    if (p.team !== team || !p.pid) continue;
    if (p.type === 'IN' || p.type === 'OUT') { if (!firstSub.has(p.pid)) firstSub.set(p.pid, p.type); continue; }
    if (ACTION.has(p.type) && firstSub.get(p.pid) !== 'IN') actedBeforeIn.add(p.pid);
  }
  const s = new Set();
  for (const [pid, first] of firstSub) if (first === 'OUT') s.add(pid);
  for (const pid of actedBeforeIn) if (!firstSub.has(pid) || firstSub.get(pid) === 'OUT') s.add(pid);
  for (const pid of carried) { if (s.size >= 5) break; if (firstSub.get(pid) !== 'IN') s.add(pid); }
  return s;
}

/**
 * Splits a game into stints (stretches with the same ten players on court).
 * game: parsed box-score game (home = A, away = B). Returns { ok, reason, stints }.
 */
export function buildStints(game, pbp) {
  const A = game.home.code, B = game.away.code;
  const plays = flattenPlays(pbp);
  if (!plays.length) return { ok: false, reason: 'no plays' };
  const starters = (side) => new Set(side.players.filter((p) => p.starter).map((p) => p.id));
  let on = { [A]: starters(game.home), [B]: starters(game.away) };
  if (on[A].size !== 5 || on[B].size !== 5) return { ok: false, reason: 'box score does not list 5 starters' };

  const stints = [];
  let cur = null, lastT = 0;
  const key = () => [...on[A]].sort().join(',') + '|' + [...on[B]].sort().join(',');
  const open = () => {
    const k = key();
    if (!cur || cur.key !== k) { cur = { key: k, home: [...on[A]].sort(), away: [...on[B]].sort(), secs: 0, pts: { [A]: 0, [B]: 0 }, fga: { [A]: 0, [B]: 0 }, fta: { [A]: 0, [B]: 0 }, oreb: { [A]: 0, [B]: 0 }, tov: { [A]: 0, [B]: 0 } }; stints.push(cur); }
  };
  const periods = [...new Set(plays.map((p) => p.period))].sort((a, b) => a - b);
  for (const per of periods) {
    const pp = plays.filter((p) => p.period === per);
    if (per > 1) {
      on = { [A]: periodStarters(pp, A, on[A]), [B]: periodStarters(pp, B, on[B]) };
      if (on[A].size !== 5 || on[B].size !== 5) return { ok: false, reason: `could not tell who started period ${per}` };
    }
    lastT = periodStart(per);
    open();
    for (const p of pp) {
      if (p.t > lastT) { open(); cur.secs += p.t - lastT; lastT = p.t; }
      if (p.type === 'OUT' && p.pid && on[p.team]) { on[p.team].delete(p.pid); continue; }
      if (p.type === 'IN' && p.pid && on[p.team]) { on[p.team].add(p.pid); continue; }
      if (!(p.team in cur.pts)) continue;
      if (on[A].size !== 5 || on[B].size !== 5) {
        if (ACTION.has(p.type)) return { ok: false, reason: `not 5 players on court in period ${per}` };
        continue;
      }
      open();
      const t = p.team;
      if (p.type === '2FGM') { cur.pts[t] += 2; cur.fga[t]++; }
      else if (p.type === '3FGM') { cur.pts[t] += 3; cur.fga[t]++; }
      else if (p.type === '2FGA' || p.type === '3FGA') cur.fga[t]++;
      else if (p.type === 'FTM') { cur.pts[t] += 1; cur.fta[t]++; }
      else if (p.type === 'FTA') cur.fta[t]++;
      else if (p.type === 'O') cur.oreb[t]++;
      else if (p.type === 'TO') cur.tov[t]++;
    }
    const end = periodStart(per) + periodLen(per);
    if (end > lastT) { open(); cur.secs += end - lastT; lastT = end; }
  }
  const out = stints.filter((s) => s.secs > 0 || s.pts[A] || s.pts[B] || s.fga[A] || s.fga[B]);
  return { ok: true, stints: out.map((s) => ({ ...s, possH: s.fga[A] - s.oreb[A] + s.tov[A] + 0.44 * s.fta[A], possA: s.fga[B] - s.oreb[B] + s.tov[B] + 0.44 * s.fta[B] })) };
}

/** Accuracy check: the stints must reproduce the official team points and every player's +/- and minutes. */
export function checkStints(game, stints) {
  const A = game.home.code, B = game.away.code;
  const pts = { [A]: 0, [B]: 0 }, pm = new Map(), secs = new Map();
  for (const s of stints) {
    pts[A] += s.pts[A]; pts[B] += s.pts[B];
    for (const id of s.home) { pm.set(id, (pm.get(id) || 0) + s.pts[A] - s.pts[B]); secs.set(id, (secs.get(id) || 0) + s.secs); }
    for (const id of s.away) { pm.set(id, (pm.get(id) || 0) + s.pts[B] - s.pts[A]); secs.set(id, (secs.get(id) || 0) + s.secs); }
  }
  if (pts[A] !== game.home.score || pts[B] !== game.away.score) return `play-by-play score ${pts[A]}–${pts[B]} ≠ official ${game.home.score}–${game.away.score}`;
  for (const side of [game.home, game.away]) for (const p of side.players) {
    if (p.min <= 0) continue;
    if ((pm.get(p.id) || 0) !== p.pm) return `${p.name}: +/- ${pm.get(p.id) || 0} from play-by-play ≠ official ${p.pm}`;
    if (Math.abs((secs.get(p.id) || 0) / 60 - p.min) > 1.5) return `${p.name}: ${((secs.get(p.id) || 0) / 60).toFixed(1)} min from play-by-play ≠ official ${p.min.toFixed(1)}`;
  }
  return null;
}

/** On/off, lineups and the rows for the impact model, over all games that passed. */
export function aggregate(gameStints) {
  const onoff = new Map(), lineups = new Map(), rows = [];
  const team = new Map(); // per game per team totals, to derive "off"
  for (const { game, stints } of gameStints) {
    const A = game.home.code, B = game.away.code;
    const tot = { [A]: { secs: 0, poss: 0, pf: 0, pa: 0 }, [B]: { secs: 0, poss: 0, pf: 0, pa: 0 } };
    for (const s of stints) {
      const poss = (s.possH + s.possA) / 2;
      for (const [code, ids, pf, pa] of [[A, s.home, s.pts[A], s.pts[B]], [B, s.away, s.pts[B], s.pts[A]]]) {
        const t = tot[code]; t.secs += s.secs; t.poss += poss; t.pf += pf; t.pa += pa;
        for (const id of ids) {
          if (!onoff.has(id)) onoff.set(id, { on: { secs: 0, poss: 0, pf: 0, pa: 0 }, teamTot: { secs: 0, poss: 0, pf: 0, pa: 0 } });
          const o = onoff.get(id).on; o.secs += s.secs; o.poss += poss; o.pf += pf; o.pa += pa;
        }
        const lk = code + ':' + ids.join(',');
        if (!lineups.has(lk)) lineups.set(lk, { team: code, ids, secs: 0, poss: 0, pf: 0, pa: 0 });
        const L = lineups.get(lk); L.secs += s.secs; L.poss += poss; L.pf += pf; L.pa += pa;
      }
      if (poss > 0) rows.push({ home: s.home, away: s.away, poss, margin: 100 * (s.pts[A] - s.pts[B]) / poss });
    }
    for (const [code, side] of [[A, game.home], [B, game.away]]) {
      for (const p of side.players) {
        if (p.min <= 0 || !onoff.has(p.id)) continue;
        const tt = onoff.get(p.id).teamTot, t = tot[code];
        tt.secs += t.secs; tt.poss += t.poss; tt.pf += t.pf; tt.pa += t.pa;
      }
      team.set(game.gameCode + code, tot[code]);
    }
  }
  return { onoff, lineups: [...lineups.values()], rows };
}

/**
 * Regularised adjusted plus-minus (ridge regression). Each stint is a row:
 * +1 for home players, −1 for away players, target = home margin per 100 possessions,
 * weighted by possessions. Players under minPoss share a single "low minutes" slot.
 */
export function rapm(rows, { lambda = 2000, minPoss = 150 } = {}) {
  const poss = new Map();
  for (const r of rows) for (const id of [...r.home, ...r.away]) poss.set(id, (poss.get(id) || 0) + r.poss);
  const ids = [...poss.keys()].filter((id) => poss.get(id) >= minPoss);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const REST = ids.length, HOME = ids.length + 1, n = ids.length + 2;
  const M = Array.from({ length: n }, () => new Float64Array(n)), v = new Float64Array(n);
  for (const r of rows) {
    const x = new Map();
    for (const id of r.home) { const i = idx.has(id) ? idx.get(id) : REST; x.set(i, (x.get(i) || 0) + 1); }
    for (const id of r.away) { const i = idx.has(id) ? idx.get(id) : REST; x.set(i, (x.get(i) || 0) - 1); }
    x.set(HOME, 1);
    const ent = [...x].filter(([, c]) => c !== 0);
    for (const [i, xi] of ent) { v[i] += r.poss * xi * r.margin; for (const [j, xj] of ent) M[i][j] += r.poss * xi * xj; }
  }
  for (let i = 0; i < n; i++) if (i !== HOME) M[i][i] += lambda;
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; v[r] -= f * v[c]; }
  }
  const beta = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < n; k++) s -= M[r][k] * beta[k]; beta[r] = Math.abs(M[r][r]) < 1e-12 ? 0 : s / M[r][r]; }
  return { values: new Map(ids.map((id, i) => [id, beta[i]])), homeEdge: beta[HOME], players: ids.length };
}
