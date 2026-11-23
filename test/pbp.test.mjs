import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStints, checkStints, aggregate, rapm, flattenPlays } from '../lib/pbp.mjs';

// A tiny game: A1–A5 v B1–B5 start. A1 scores 2 at 9:30, A6 replaces A5 at 5:00, B1 hits a three at 4:00.
// Nothing else happens. Final 2–3. Expected +/-: A1–A4 −1, A5 +2, A6 −3, B1–B5 +1.
function tinyGame() {
  const pl = (team, ids, starters, pm, mins) => ids.map((id, i) => ({ id, name: id, starter: starters.includes(id), min: mins[i], pm: pm[i] }));
  return {
    gameCode: 1,
    home: { code: 'AAA', score: 2, players: pl('AAA', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], ['A1', 'A2', 'A3', 'A4', 'A5'], [-1, -1, -1, -1, 2, -3], [40, 40, 40, 40, 5, 35]) },
    away: { code: 'BBB', score: 3, players: pl('BBB', ['B1', 'B2', 'B3', 'B4', 'B5'], ['B1', 'B2', 'B3', 'B4', 'B5'], [1, 1, 1, 1, 1], [40, 40, 40, 40, 40]) }
  };
}
const ev = (n, type, team, pid, mt) => ({ NUMBEROFPLAY: n, PLAYTYPE: type, CODETEAM: team ? team + '   ' : '', PLAYER_ID: pid ? pid + '   ' : '', MARKERTIME: mt });
function tinyPbp() {
  const q = (extra = []) => [ev(1, 'BP', '', '', ''), ...extra, ev(99, 'EP', '', '', '')];
  return {
    FirstQuarter: q([ev(2, '2FGM', 'AAA', 'A1', '09:30'), ev(3, 'OUT', 'AAA', 'A5', '05:00'), ev(4, 'IN', 'AAA', 'A6', '05:00'), ev(5, '3FGM', 'BBB', 'B1', '04:00')]),
    SecondQuarter: q(), ThirdQuarter: q(), ForthQuarter: q()
  };
}

test('elapsed time from the game clock', () => {
  const plays = flattenPlays(tinyPbp());
  assert.equal(plays.find((p) => p.type === '2FGM').t, 30);
  assert.equal(plays.find((p) => p.type === '3FGM').t, 360);
  assert.equal(plays[plays.length - 1].t, 2400);
});

test('stints reproduce official points, +/- and minutes', () => {
  const g = tinyGame();
  const r = buildStints(g, tinyPbp());
  assert.equal(r.ok, true, r.reason);
  assert.equal(checkStints(g, r.stints), null);
  assert.equal(r.stints.reduce((s, x) => s + x.secs, 0), 2400);
});

test('a wrong +/- in the box score makes the game fail the check', () => {
  const g = tinyGame(); g.home.players[5].pm = 0;
  const r = buildStints(g, tinyPbp());
  assert.match(checkStints(g, r.stints), /\+\/-/);
});

test('a missing substitution is caught', () => {
  const g = tinyGame(); const p = tinyPbp();
  p.FirstQuarter = p.FirstQuarter.filter((e) => e.PLAYTYPE !== 'OUT'); // 6 players on court
  const r = buildStints(g, p);
  assert.ok(!r.ok || checkStints(g, r.stints));
});

test('on/off and lineups from the stints', () => {
  const g = tinyGame();
  const { stints } = buildStints(g, tinyPbp());
  const agg = aggregate([{ game: g, stints }]);
  const a5 = agg.onoff.get('A5');
  assert.equal(a5.on.secs, 300);
  assert.equal(a5.on.pf - a5.on.pa, 2);
  assert.equal(a5.teamTot.pf - a5.teamTot.pa, -1);
  assert.equal(agg.lineups.filter((l) => l.team === 'AAA').length, 2);
});

test('impact model: a player whose lineups win gets a positive value', () => {
  const rows = [];
  for (let i = 0; i < 200; i++) {
    rows.push({ home: ['S', 'x1', 'x2', 'x3', 'x4'], away: ['y1', 'y2', 'y3', 'y4', 'y5'], poss: 10, margin: 12 });
    rows.push({ home: ['z', 'x1', 'x2', 'x3', 'x4'], away: ['y1', 'y2', 'y3', 'y4', 'y5'], poss: 10, margin: 0 });
  }
  const r = rapm(rows, { lambda: 500, minPoss: 1 });
  assert.ok(r.values.get('S') > r.values.get('z'));
  assert.ok(r.values.get('S') > 0);
});
