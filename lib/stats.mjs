// All calculated numbers on the site come from here. Formulas are written out on
// the site's "How we calculate" page; keep the two in step.

import { STAT_KEYS } from './parse.mjs';

const zero = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
const add = (a, b) => { for (const k of STAT_KEYS) a[k] += b[k]; return a; };
const div = (a, b) => (b > 0 ? a / b : 0);

/** Possession estimate for one team in one game. */
export const possessions = (t) => t.fga2 + t.fga3 - t.oreb + t.tov + 0.44 * t.fta;

/** Game possessions = average of both teams' estimates (they should be nearly equal). */
export const gamePossessions = (g) => (possessions(g.home.totals) + possessions(g.away.totals)) / 2;

/** True shooting % = PTS / (2 × (FGA + 0.44 × FTA)) */
export const trueShooting = (s) => 100 * div(s.pts, 2 * (s.fga2 + s.fga3 + 0.44 * s.fta));

/** Effective FG% = (FGM + 0.5 × 3PM) / FGA */
export const effectiveFg = (s) => 100 * div(s.fgm2 + s.fgm3 + 0.5 * s.fgm3, s.fga2 + s.fga3);

/**
 * Usage rate: share of team plays a player used while on the floor.
 * 100 × (FGA + 0.44·FTA + TOV) × (TeamMin / 5) / (Min × (TmFGA + 0.44·TmFTA + TmTOV))
 */
export function usageRate(p, teamCtx) {
  const plays = p.fga2 + p.fga3 + 0.44 * p.fta + p.tov;
  const teamPlays = teamCtx.fga + 0.44 * teamCtx.fta + teamCtx.tov;
  return 100 * div(plays * (teamCtx.min / 5), p.min * teamPlays);
}

export function teamTable(games) {
  const teams = new Map();
  const get = (t) => {
    if (!teams.has(t.code)) teams.set(t.code, { code: t.code, tv: t.tv, name: t.name, gp: 0, w: 0, l: 0, pf: 0, pa: 0, poss: 0, min: 0, tot: zero(), opp: zero() });
    return teams.get(t.code);
  };
  for (const g of games) {
    const poss = gamePossessions(g);
    for (const [me, them] of [[g.home, g.away], [g.away, g.home]]) {
      const r = get(me);
      r.name = me.name; r.tv = me.tv;  // latest name wins (sponsor names change)
      r.gp++; r.pf += me.score; r.pa += them.score;
      if (me.score > them.score) r.w++; else r.l++;
      r.poss += poss; r.min += me.teamMinutes || 200;
      add(r.tot, me.totals); add(r.opp, them.totals);
    }
  }
  const rows = [...teams.values()].map((r) => {
    const ortg = 100 * div(r.pf, r.poss);
    const drtg = 100 * div(r.pa, r.poss);
    return {
      code: r.code, tv: r.tv, name: r.name, gp: r.gp, w: r.w, l: r.l,
      winPct: 100 * div(r.w, r.gp),
      ppg: div(r.pf, r.gp), oppg: div(r.pa, r.gp), diff: r.pf - r.pa,
      ortg, drtg, net: ortg - drtg,
      pace: 40 * div(r.poss, r.min / 5),
      ts: trueShooting(r.tot), efg: effectiveFg(r.tot),
      tov100: 100 * div(r.tot.tov, r.poss),
      orebPct: 100 * div(r.tot.oreb, r.tot.oreb + r.opp.dreb)
    };
  });
  // Wins, then point difference. (Official tiebreakers use head-to-head results.)
  rows.sort((a, b) => b.w - a.w || b.diff - a.diff || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function playerTable(games) {
  const players = new Map();
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date) || a.gameCode - b.gameCode)) {
    for (const t of [g.home, g.away]) {
      const ctxGame = {
        min: t.teamMinutes || 200,
        fga: t.totals.fga2 + t.totals.fga3, fta: t.totals.fta, tov: t.totals.tov
      };
      for (const p of t.players) {
        if (p.min <= 0) continue; // did not play
        if (!players.has(p.id)) players.set(p.id, { id: p.id, name: p.name, team: t.code, tv: t.tv, teams: new Set(), gp: 0, gs: 0, min: 0, pm: 0, tot: zero(), ctx: { min: 0, fga: 0, fta: 0, tov: 0 } });
        const r = players.get(p.id);
        r.name = p.name; r.team = t.code; r.tv = t.tv; r.teams.add(t.tv);
        r.gp++; if (p.starter) r.gs++;
        r.min += p.min; r.pm += p.pm;
        add(r.tot, p);
        for (const k of Object.keys(r.ctx)) r.ctx[k] += ctxGame[k];
      }
    }
  }
  return [...players.values()].map((r) => {
    const s = r.tot, gp = r.gp;
    const fga = s.fga2 + s.fga3, fgm = s.fgm2 + s.fgm3;
    const per = (v) => div(v, gp);
    return {
      id: r.id, name: r.name, team: r.team, tv: r.tv, teams: [...r.teams],
      gp, gs: r.gs, mpg: per(r.min), totalMin: r.min,
      ppg: per(s.pts), rpg: per(s.reb), apg: per(s.ast), spg: per(s.stl), bpg: per(s.blk), tpg: per(s.tov),
      pirpg: per(s.pir), pmpg: per(r.pm),
      pra: per(s.pts + s.reb + s.ast), stocks: per(s.stl + s.blk),
      fgPct: 100 * div(fgm, fga), threePct: 100 * div(s.fgm3, s.fga3), ftPct: 100 * div(s.ftm, s.fta),
      threeApg: per(s.fga3),
      ts: trueShooting(s), efg: effectiveFg(s),
      usg: usageRate({ ...s, min: r.min }, r.ctx),
      totals: s
    };
  });
}

/** Players who have played enough to appear in leaderboards and charts. */
export function qualified(players, teams, cfg) {
  const teamGames = new Map(teams.map((t) => [t.code, t.gp]));
  return players.filter((p) => p.mpg >= cfg.minMinutesForLeaders && p.gp >= Math.ceil(cfg.minGamesShare * (teamGames.get(p.team) || 0)));
}

export function leaders(players, key, n = 10) {
  return [...players].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, n);
}

export function seasonInfo(games) {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const reg = games.filter((g) => /REGULAR/i.test(g.phase));
  return {
    games: games.length,
    lastDate: sorted.length ? sorted[sorted.length - 1].date : null,
    lastRound: reg.length ? Math.max(...reg.map((g) => g.round)) : null,
    phase: sorted.length ? sorted[sorted.length - 1].phase : ''
  };
}
