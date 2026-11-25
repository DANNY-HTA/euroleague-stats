// Per-40 and defensive rates for each player, built game by game so that a player who
// changed teams is measured against the right team and opponent in every game.
import { possessions } from './stats.mjs';

/**
 * Returns Map id -> rates. Shares follow the usual "player's share of team minutes" approach:
 * share = player minutes / (team minutes / 5).
 *   stlPct  = 100 * STL / (opponent possessions × share)
 *   blkPct  = 100 * BLK / (opponent 2-point attempts × share)
 *   drebPct = 100 * DREB / ((team DREB + opponent OREB) × share)
 */
export function playerRates(games) {
  const acc = new Map();
  for (const g of games) {
    for (const [me, op] of [[g.home, g.away], [g.away, g.home]]) {
      const teamMin = me.teamMinutes || 200;
      const oppPoss = possessions(op.totals);
      for (const p of me.players) {
        if (!(p.min > 0)) continue;
        if (!acc.has(p.id)) acc.set(p.id, { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, dreb: 0, pir: 0, pf: 0, oppPoss: 0, opp2a: 0, drebCh: 0 });
        const a = acc.get(p.id), share = p.min / (teamMin / 5);
        for (const k of ['min', 'pts', 'reb', 'ast', 'stl', 'blk', 'dreb', 'pir', 'pf']) a[k] += p[k];
        a.oppPoss += oppPoss * share;
        a.opp2a += op.totals.fga2 * share;
        a.drebCh += (me.totals.dreb + op.totals.oreb) * share;
      }
    }
  }
  const out = new Map();
  const p40 = (v, m) => (m > 0 ? 40 * v / m : 0);
  for (const [id, a] of acc) out.set(id, {
    pir40: p40(a.pir, a.min), pts40: p40(a.pts, a.min), reb40: p40(a.reb, a.min), ast40: p40(a.ast, a.min),
    stocks40: p40(a.stl + a.blk, a.min), stl40: p40(a.stl, a.min), blk40: p40(a.blk, a.min), pf40: p40(a.pf, a.min),
    stlPct: a.oppPoss > 0 ? 100 * a.stl / a.oppPoss : 0,
    blkPct: a.opp2a > 0 ? 100 * a.blk / a.opp2a : 0,
    drebPct: a.drebCh > 0 ? 100 * a.dreb / a.drebCh : 0
  });
  return out;
}
