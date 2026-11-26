// Situational stats from the checked play-by-play (games where lineups reproduce the box score):
//  - clutch: last 5 minutes of the 4th quarter or overtime, score within 5 points (NBA definition)
//  - after timeouts (ATO): the first possession after a team's own timeout
//  - on/off: team stats with each player on and off the court
// Input entries: [{ game, stints, periodStints, events }] from buildStints().

const pLen = (p) => (p <= 4 ? 600 : 300);
const pStart = (p) => (p <= 4 ? (p - 1) * 600 : 2400 + (p - 5) * 300);
const PTS = { '2FGM': 2, '3FGM': 3, FTM: 1 };
const SHOT = new Set(['2FGM', '2FGA', '3FGM', '3FGA', 'FTM', 'FTA']);
// play type -> player/team box fields
const EV = {
  '2FGM': { pts: 2, fgm2: 1, fga2: 1 }, '2FGA': { fga2: 1 }, '3FGM': { pts: 3, fgm3: 1, fga3: 1 }, '3FGA': { fga3: 1 },
  FTM: { pts: 1, ftm: 1, fta: 1 }, FTA: { fta: 1 }, O: { oreb: 1 }, D: { dreb: 1 }, AS: { ast: 1 }, TO: { tov: 1 },
  ST: { stl: 1 }, FV: { blk: 1 }, CM: { pf: 1 }, OF: { pf: 1 }, RV: { fd: 1 }
};
export const BOXK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk', 'pf', 'fd'];
const zero = () => Object.fromEntries(BOXK.map((k) => [k, 0]));
const addEv = (box, type) => { const f = EV[type]; if (f) for (const k in f) box[k] += f[k]; };
const possOf = (b) => b.fga2 + b.fga3 - b.oreb + b.tov + 0.44 * b.fta;

/** Clutch intervals of one game: [[from, to], ...] in game seconds. */
function clutchWindows(game, events) {
  const A = game.home.code, B = game.away.code, sc = { [A]: 0, [B]: 0 };
  const lastP = Math.max(4, ...events.map((e) => e.period));
  const end = pStart(lastP) + pLen(lastP);
  // score is constant between scoring events: segments [t, next t) with the score after the event at t
  const segs = []; let t0 = 0;
  for (const e of events) {
    const p = PTS[e.type]; if (!p || !(e.team in sc)) continue;
    if (e.t > t0) segs.push([t0, e.t, Math.abs(sc[A] - sc[B])]);
    sc[e.team] += p; t0 = Math.max(t0, e.t);
  }
  segs.push([t0, end, Math.abs(sc[A] - sc[B])]);
  const out = [];
  for (let per = 4; per <= lastP; per++) {
    const w0 = pStart(per) + pLen(per) - 300, w1 = pStart(per) + pLen(per);
    for (const [a, b, d] of segs) { if (d > 5) continue; const lo = Math.max(a, w0), hi = Math.min(b, w1); if (hi > lo) out.push([lo, hi]); }
  }
  return out;
}
const overlap = (a, b, wins) => wins.reduce((s, [x, y]) => s + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);

export function clutch(entries) {
  const teams = new Map(), players = new Map();
  const T = (code) => { if (!teams.has(code)) teams.set(code, { code, games: 0, w: 0, l: 0, secs: 0, pf: 0, pa: 0, box: zero(), opp: zero() }); return teams.get(code); };
  const P = (id, team) => { const k = id + '|' + team; if (!players.has(k)) players.set(k, { id, team, games: new Set(), secs: 0, pm: 0, box: zero() }); return players.get(k); };
  for (const { game, periodStints, events } of entries) {
    const A = game.home.code, B = game.away.code;
    const wins = clutchWindows(game, events);
    if (!wins.length) continue;
    const hw = game.home.score > game.away.score;
    for (const [code, won] of [[A, hw], [B, !hw]]) { const e = T(code); e.games++; if (won) e.w++; else e.l++; }
    for (const s of periodStints) {
      if (s.start == null) continue;
      const secs = overlap(s.start, s.start + s.secs, wins); if (!secs) continue;
      T(A).secs += secs; T(B).secs += secs;
      for (const id of s.home) { const p = P(id, A); p.secs += secs; p.games.add(game.gameCode); }
      for (const id of s.away) { const p = P(id, B); p.secs += secs; p.games.add(game.gameCode); }
    }
    // events: scored while the game was in a clutch window (score checked before the play)
    const sc = { [A]: 0, [B]: 0 };
    for (const e of events) {
      if (!(e.team in sc)) continue;
      const before = Math.abs(sc[A] - sc[B]) <= 5;
      const pts = PTS[e.type] || 0;
      const isC = before && e.period >= 4 && (pStart(e.period) + pLen(e.period) - e.t) <= 300;
      sc[e.team] += pts;
      if (!isC) continue;
      const me = e.team, op = me === A ? B : A;
      addEv(T(me).box, e.type); addEv(T(op).opp, e.type);
      if (pts) {
        T(me).pf += pts; T(op).pa += pts;
        const homeScored = me === A;
        for (const id of e.st.home) P(id, A).pm += homeScored ? pts : -pts;
        for (const id of e.st.away) P(id, B).pm += homeScored ? -pts : pts;
      }
      if (e.pid) { const p = P(e.pid, me); addEv(p.box, e.type); p.games.add(game.gameCode); }
    }
  }
  return {
    teams: [...teams.values()].map((t) => ({ ...t, poss: possOf(t.box), possD: possOf(t.opp) })),
    players: [...players.values()].map((p) => ({ ...p, games: p.games.size })).filter((p) => p.secs > 0 || p.box.pts || p.box.fga2 + p.box.fga3)
  };
}

/** First possession after each team's own timeout. */
export function afterTimeouts(entries) {
  const teams = new Map();
  const blank = () => ({ n: 0, pts: 0, scored: 0, tov: 0, fga: 0, fgm: 0, fga3: 0, fgm3: 0, fta: 0, late: { n: 0, pts: 0 } });
  const T = (code) => { if (!teams.has(code)) teams.set(code, { code, off: blank(), def: blank() }); return teams.get(code); };
  for (const { game, events } of entries) {
    const A = game.home.code, B = game.away.code;
    for (let i = 0; i < events.length; i++) {
      const to = events[i];
      if (to.type !== 'TOUT' || !(to.team === A || to.team === B)) continue;
      // who has the ball: the first shot, free throw, turnover or offensive rebound after the timeout
      let j = i + 1;
      while (j < events.length && !(SHOT.has(events[j].type) || events[j].type === 'TO' || events[j].type === 'TOUT')) j++;
      if (j >= events.length || events[j].type === 'TOUT' || events[j].period !== to.period || events[j].team !== to.team) continue;
      const me = to.team, op = me === A ? B : A, r = { pts: 0, tov: 0, fga: 0, fgm: 0, fga3: 0, fgm3: 0, fta: 0 };
      for (let k = j; k < events.length; k++) {
        const e = events[k];
        if (e.period !== to.period) break;
        if (e.team === op && (SHOT.has(e.type) || e.type === 'TO' || e.type === 'D' || e.type === 'O')) break;
        if (e.team !== me) continue;
        if (e.type === 'TO') { r.tov++; break; }
        if (e.type === '2FGA' || e.type === '3FGA') { r.fga++; if (e.type === '3FGA') r.fga3++; }
        if (e.type === 'FTM' || e.type === 'FTA') { r.fta++; r.pts += PTS[e.type] || 0; }
        if (e.type === '2FGM' || e.type === '3FGM') {
          r.fga++; r.fgm++; r.pts += PTS[e.type]; if (e.type === '3FGM') { r.fga3++; r.fgm3++; }
          // and-one: free throws at the same moment belong to this possession
          let m = k + 1;
          while (m < events.length && events[m].t === e.t) { const x = events[m]; if (x.team === me && (x.type === 'FTM' || x.type === 'FTA')) { r.fta++; r.pts += PTS[x.type] || 0; } m++; }
          break;
        }
      }
      const late = to.period >= 4 && pStart(to.period) + pLen(to.period) - to.t <= 120;
      for (const [side, code] of [['off', me], ['def', op]]) {
        const o = T(code)[side]; o.n++; o.pts += r.pts; if (r.pts > 0) o.scored++; o.tov += r.tov; o.fga += r.fga; o.fgm += r.fgm; o.fga3 += r.fga3; o.fgm3 += r.fgm3; o.fta += r.fta;
        if (late) { o.late.n++; o.late.pts += r.pts; }
      }
    }
  }
  return [...teams.values()];
}

/** Team numbers with each player on and off the court (team = the player's team in that game). */
export function onOff(entries) {
  const out = new Map(), tot = new Map();
  const blank = () => ({ secs: 0, poss: 0, possD: 0, pf: 0, pa: 0, box: zero(), opp: zero() });
  const acc = (o, s, me, op, possMe, possOp) => {
    o.secs += s.secs; o.poss += possMe; o.possD += possOp; o.pf += s.pts[me]; o.pa += s.pts[op];
    for (const k of BOXK) { if (k in s.box[me]) o.box[k] += s.box[me][k]; if (k in s.box[op]) o.opp[k] += s.box[op][k]; }
    o.box.pts = o.pf; o.opp.pts = o.pa;
  };
  for (const { game, stints } of entries) {
    const A = game.home.code, B = game.away.code;
    for (const s of stints) {
      for (const [me, op, ids, pm, po] of [[A, B, s.home, s.possH, s.possA], [B, A, s.away, s.possA, s.possH]]) {
        const tk = me + '|' + game.gameCode;
        if (!tot.has(tk)) tot.set(tk, { team: me, game: game.gameCode, ...blank() });
        acc(tot.get(tk), s, me, op, pm, po);
        for (const id of ids) {
          if (!out.has(id)) out.set(id, { id, team: me, games: new Map() });
          const g = out.get(id).games;
          if (!g.has(game.gameCode)) g.set(game.gameCode, { ...blank(), team: me });
          acc(g.get(game.gameCode), s, me, op, pm, po);
        }
      }
    }
  }
  // per player: "on" over his games, "off" = his team in those same games minus his on-court stretches
  return [...out.values()].map((p) => {
    const on = blank(), team = blank();
    for (const [code, g] of p.games) {
      const t = tot.get(g.team + '|' + code);
      const add = (dst, src) => { dst.secs += src.secs; dst.poss += src.poss; dst.possD += src.possD; dst.pf += src.pf; dst.pa += src.pa; for (const k of BOXK) { dst.box[k] += src.box[k]; dst.opp[k] += src.opp[k]; } };
      add(on, g); add(team, t);
    }
    const off = { secs: team.secs - on.secs, poss: team.poss - on.poss, possD: team.possD - on.possD, pf: team.pf - on.pf, pa: team.pa - on.pa, box: {}, opp: {} };
    for (const k of BOXK) { off.box[k] = team.box[k] - on.box[k]; off.opp[k] = team.opp[k] - on.opp[k]; }
    return { id: p.id, team: p.team, games: p.games.size, on, off };
  });
}

/** Rates for an on/off/clutch block. */
export function rates(x) {
  const b = x.box, o = x.opp, d = (a, c) => (c > 0 ? a / c : null);
  const poss = (x.poss + x.possD) / 2;
  return {
    min: x.secs / 60, pf: x.pf, pa: x.pa, poss,
    ortg: d(100 * x.pf, poss), drtg: d(100 * x.pa, poss), net: poss > 0 ? 100 * (x.pf - x.pa) / poss : null,
    pace: x.secs > 0 ? 2400 * poss / x.secs : null,
    efg: d(100 * (b.fgm2 + 1.5 * b.fgm3), b.fga2 + b.fga3), efgD: d(100 * (o.fgm2 + 1.5 * o.fgm3), o.fga2 + o.fga3),
    tovPct: d(100 * b.tov, x.poss), tovPctD: d(100 * o.tov, x.possD),
    orebPct: d(100 * b.oreb, b.oreb + o.dreb), drebPct: d(100 * b.dreb, b.dreb + o.oreb),
    ftr: d(100 * b.fta, b.fga2 + b.fga3), threeRate: d(100 * b.fga3, b.fga2 + b.fga3),
    threePct: d(100 * b.fgm3, b.fga3), threePctD: d(100 * o.fgm3, o.fga3),
    astPct: d(100 * b.ast, b.fgm2 + b.fgm3)
  };
}

/** Rotation pattern: for each player, the share of each regulation minute (0–39) he was on the court, over the team's games. */
export function rotation(entries, code) {
  const mine = entries.filter((e) => e.game.home.code === code || e.game.away.code === code);
  const P = new Map();
  for (const { game, periodStints } of mine) {
    const side = game.home.code === code ? 'home' : 'away';
    for (const s of periodStints) {
      if (s.start == null || !s.secs) continue;
      for (const id of s[side]) {
        if (!P.has(id)) P.set(id, { id, games: new Set(), sec: new Array(40).fill(0), total: 0 });
        const p = P.get(id); p.games.add(game.gameCode); p.total += s.secs;
        const a = s.start, b = s.start + s.secs;
        for (let m = Math.floor(a / 60); m < Math.min(40, Math.ceil(b / 60)); m++) p.sec[m] += Math.max(0, Math.min(b, (m + 1) * 60) - Math.max(a, m * 60));
      }
    }
  }
  const n = mine.length;
  return { games: n, players: [...P.values()].map((p) => ({ id: p.id, gp: p.games.size, mpg: p.total / 60 / (p.games.size || 1), share: p.sec.map((v) => (n ? v / (60 * n) : 0)) })) };
}

/** Scoring runs (8+ unanswered points), points off turnovers, second-chance points, last minute of each quarter. */
export function flowExtras(entries) {
  const T = new Map();
  const blank = () => ({ games: 0, runs: 0, runsA: 0, best: 0, bestA: 0, runPts: 0, runQ: [0, 0, 0, 0, 0], offTO: 0, offTOA: 0, second: 0, secondA: 0, oreb: 0, orebA: 0, tov: 0, tovA: 0, lastMin: 0, lastMinA: 0, pts: 0, ptsA: 0 });
  const get = (c) => { if (!T.has(c)) T.set(c, { code: c, ...blank() }); return T.get(c); };
  for (const { game, events } of entries) {
    const A = game.home.code, B = game.away.code, other = (x) => (x === A ? B : A);
    get(A).games++; get(B).games++;
    // runs
    let runTeam = null, runPts = 0, runStartPer = 1;
    const closeRun = () => { if (runTeam && runPts >= 8) { const t = get(runTeam), o = get(other(runTeam)); t.runs++; o.runsA++; t.best = Math.max(t.best, runPts); o.bestA = Math.max(o.bestA, runPts); t.runPts += runPts; t.runQ[Math.min(5, runStartPer) - 1]++; } };
    // possessions: tags of the team's current possession
    const tag = { [A]: { to: false, sc: false }, [B]: { to: false, sc: false } };
    let per = 0;
    for (const e of events) {
      if (!(e.team === A || e.team === B)) continue;
      if (e.period !== per) { per = e.period; tag[A] = { to: false, sc: false }; tag[B] = { to: false, sc: false }; }
      const me = e.team, op = other(me);
      const pts = PTS[e.type] || 0;
      if (e.type === 'TO') { get(me).tov++; get(op).tovA++; tag[op] = { to: true, sc: false }; }
      else if (e.type === 'D') tag[me] = { to: false, sc: false };
      else if (e.type === 'O') { get(me).oreb++; get(op).orebA++; tag[me] = { ...tag[me], sc: true }; }
      if (pts) {
        const t = get(me), o = get(op);
        t.pts += pts; o.ptsA += pts;
        if (tag[me].to) { t.offTO += pts; o.offTOA += pts; }
        if (tag[me].sc) { t.second += pts; o.secondA += pts; }
        const end = (e.period <= 4 ? e.period * 600 : 2400 + (e.period - 4) * 300);
        if (end - e.t <= 60) { t.lastMin += pts; o.lastMinA += pts; }
        if (runTeam === me) runPts += pts; else { closeRun(); runTeam = me; runPts = pts; runStartPer = e.period; }
        tag[op] = { to: false, sc: false }; // after a score the other team starts a fresh possession
      }
    }
    closeRun();
  }
  return [...T.values()];
}
