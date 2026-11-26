import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerRates } from '../lib/advanced.mjs';

const line = (o) => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, dreb: 0, oreb: 0, pir: 0, pf: 0, fga2: 0, fga3: 0, fta: 0, tov: 0, ...o });
test('per 40 and defensive rates', () => {
  // Opponent: 60 two-point attempts, 20 threes, 10 OREB, 12 TOV, 20 FTA → 60+20−10+12+8.8 = 90.8 possessions
  const game = {
    home: { teamMinutes: 200, totals: line({ dreb: 30 }), players: [{ id: 'X', min: 20, ...line({ pts: 10, pir: 12, stl: 2, blk: 1, dreb: 4 }) }] },
    away: { teamMinutes: 200, totals: line({ fga2: 60, fga3: 20, oreb: 10, tov: 12, fta: 20 }), players: [] }
  };
  const r = playerRates([game]).get('X');
  assert.equal(r.pts40, 20);
  assert.equal(r.pir40, 24);
  // share = 20 / 40 = 0.5
  assert.ok(Math.abs(r.stlPct - 100 * 2 / (90.8 * 0.5)) < 1e-9);
  assert.ok(Math.abs(r.blkPct - 100 * 1 / 30) < 1e-9);
  assert.ok(Math.abs(r.drebPct - 100 * 4 / 20) < 1e-9);
});
