// Team splits and schedule strength, from the list of games.
import { teamGames, quarterAverages } from './stats.mjs';

const rec = (list) => { const w = list.filter((g) => g.win).length; return [w, list.length - w]; };
const avg = (list, f) => (list.length ? list.reduce((s, g) => s + f(g), 0) / list.length : null);

export function teamSplits(games, teams) {
  const netOf = new Map(teams.map((t) => [t.code, t.net]));
  const out = {};
  for (const t of teams) {
    const list = teamGames(games, t.code); // newest first
    const home = list.filter((g) => g.isHome), away = list.filter((g) => !g.isHome);
    const margin = (g) => g.for - g.against;
    const close = list.filter((g) => Math.abs(margin(g)) <= 5);
    const big = list.filter((g) => Math.abs(margin(g)) >= 10);
    const ot = list.filter((g) => {
      const me = g.isHome ? games.find((x) => x.gameCode === g.gameCode)?.home : games.find((x) => x.gameCode === g.gameCode)?.away;
      return (me?.teamMinutes || 200) > 200.5;
    });
    const qa = quarterAverages(list);
    const withQ = list.filter((g) => g.q && g.qOpp);
    const half = (h) => avg(withQ, (g) => (h === 1 ? g.q[0] + g.q[1] - g.qOpp[0] - g.qOpp[1] : g.q[2] + g.q[3] - g.qOpp[2] - g.qOpp[3]));
    let streak = '';
    if (list.length) { const first = list[0].win; let n = 0; for (const g of list) { if (g.win !== first) break; n++; } streak = (first ? 'W' : 'L') + n; }
    const sos = avg(list, (g) => netOf.get(g.opp.code) ?? 0);
    out[t.code] = {
      home: rec(home), away: rec(away), close: rec(close), big: rec(big), ot: rec(ot), last5: rec(list.slice(0, 5)),
      streak,
      homePpg: avg(home, (g) => g.for), homeOpp: avg(home, (g) => g.against),
      awayPpg: avg(away, (g) => g.for), awayOpp: avg(away, (g) => g.against),
      bestWin: list.length ? Math.max(...list.map(margin)) : null, worstLoss: list.length ? Math.min(...list.map(margin)) : null,
      q: qa ? qa.map((x) => +x.margin.toFixed(2)) : null,
      qFor: qa ? qa.map((x) => +x.for.toFixed(2)) : null,
      h1: half(1), h2: half(2),
      sos
    };
  }
  return out;
}
