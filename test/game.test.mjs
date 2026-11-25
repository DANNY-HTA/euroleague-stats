import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playLog, flowStats, connections } from '../lib/game.mjs';

const ev = (n, type, team, pid, mt, name = '') => ({ NUMBEROFPLAY: n, PLAYTYPE: type, CODETEAM: team ? team + '  ' : '', PLAYER_ID: pid ? pid + ' ' : '', PLAYER: name, MARKERTIME: mt });
const game = { home: { code: 'AAA' }, away: { code: 'BBB' } };
// A: 2, B: 3 (assisted by B2), A: 3 (assisted by A2), B: 2, B: 2  → A 5 – 7 B
const pbp = { FirstQuarter: [ev(1, 'BP', '', '', ''),
  ev(2, '2FGM', 'AAA', 'A1', '09:30', 'ONE, A'),
  ev(3, '3FGM', 'BBB', 'B1', '09:00', 'ONE, B'), ev(4, 'AS', 'BBB', 'B2', '09:00', 'TWO, B'),
  ev(5, '3FGM', 'AAA', 'A1', '08:00', 'ONE, A'), ev(6, 'AS', 'AAA', 'A2', '08:00', 'TWO, A'),
  ev(7, '2FGM', 'BBB', 'B1', '07:00', 'ONE, B'), ev(8, '2FGM', 'BBB', 'B1', '06:00', 'ONE, B'),
  ev(9, 'EP', '', '', '')] };

test('play log keeps a running score and readable names', () => {
  const { plays, names } = playLog(game, pbp);
  const last = plays[plays.length - 1];
  assert.equal(last[5], 5); assert.equal(last[6], 7);
  assert.equal(names.A1, 'A One');
  assert.equal(plays[1][1], '09:30');
});

test('lead changes, ties, biggest lead and runs', () => {
  const f = flowStats(playLog(game, pbp).plays);
  // 2–0 A leads, 2–3 B leads (change), 5–3 A leads (change), 5–5 tie, 5–7 B leads
  assert.equal(f.leadChanges, 2);
  assert.equal(f.ties, 1);
  assert.equal(f.maxLead.H, 2);
  assert.equal(f.maxLead.A, 2);
  assert.equal(f.bestRun.A, 4);
  assert.equal(f.line.length, 6);
});

test('assist connections link the passer to the scorer', () => {
  const c = connections(playLog(game, pbp).plays);
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((x) => [x.from, x.to, x.pts]), [['B2', 'B1', 3], ['A2', 'A1', 3]]);
});
