import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertGame, teamCodes } from '../lib/livestats.mjs';
import { parseGame } from '../lib/parse.mjs';
import { validateGame } from '../lib/validate.mjs';
import { buildStints, checkStints } from '../lib/pbp.mjs';

// Tiny game: 6 players per team, one substitution at the same moment as a made free throw.
const roster = (base) => [0, 1, 2, 3, 4, 5].map((i) => ({ id: String(base + i), firstName: 'P' + i, lastName: 'T' + base, jerseyNumber: i }));
const act = (q, t, type, pid, tid, parameters = {}) => ({ quarter: q, quarterTime: t, type, playerId: pid, teamId: tid, parameters });
function game() {
  const acts = [act(1, '10:00', 'quarter', 0, 0, { type: 'start-of-quarter' })];
  for (const [b, tid] of [[100, 1], [200, 2]]) for (let i = 0; i < 5; i++) acts.push(act(1, '10:00', 'substitution', b + i, tid, { playerIn: String(i) }));
  acts.push(act(1, '09:00', 'shot', 100, 1, { points: 2, made: 'made' }));
  acts.push(act(1, '08:00', 'shot', 200, 2, { points: 3, made: 'made' }));
  acts.push(act(1, '07:00', 'foul', 200, 2, { type: 'personal', kind: 'shooting' }));
  acts.push(act(1, '07:00', 'freeThrow', 101, 1, { made: 'made' }));
  // official +/-: the substitution at 07:00 counts before the free throw
  acts.push(act(1, '07:00', 'substitution', 104, 1, { playerOut: '4' }));
  acts.push(act(1, '07:00', 'substitution', 105, 1, { playerIn: '5' }));
  acts.push(act(1, '06:00', 'rebound', 0, 2, { type: 'defensive' }));
  acts.push(act(1, '00:00', 'quarter', 0, 0, { type: 'end-of-quarter' }));
  for (const q of [2, 3, 4]) acts.push(act(q, '10:00', 'quarter', 0, 0, { type: 'start-of-quarter' }), act(q, '00:00', 'quarter', 0, 0, { type: 'end-of-quarter' }));
  const P = (id, o) => ({ playerId: String(id), jerseyNumber: String(id % 100), starter: id % 100 < 5, minutes: '00:00', plusMinus: '0', fg_2m: '0', fg_2mis: '0', fg_3m: '0', fg_3mis: '0', ft_m: '0', ft_mis: '0', reb_d: '0', reb_o: '0', f: '0', f_drawn: '0', stl: '0', to: '0', ast: '0', blk: '0', blk_against: '0', points: '0', rate: '0', ...o });
  const homeMin = { 100: '40:00', 101: '40:00', 102: '40:00', 103: '40:00', 104: '03:00', 105: '37:00' };
  const home = [100, 101, 102, 103, 104, 105].map((id) => P(id, { minutes: homeMin[id], plusMinus: String(id === 104 ? -1 : 0) }));
  Object.assign(home[0], { fg_2m: '1', points: '2', rate: '2', plusMinus: '0' }); Object.assign(home[1], { ft_m: '1', points: '1', rate: '2', f_drawn: '1' });
  for (const p of home) if (p.playerId !== '104') p.plusMinus = p.playerId === '105' ? '1' : '0';
  const away = [200, 201, 202, 203, 204, 205].map((id) => P(id, { minutes: id === 205 ? '00:00' : '40:00', plusMinus: id === 205 ? '0' : '0' }));
  Object.assign(away[0], { fg_3m: '1', points: '3', rate: '2', f: '1' });
  return {
    gameInfo: { homeTeam: { id: '1', players: roster(100) }, awayTeam: { id: '2', players: roster(200) }, gameFinished: true, currentQuarter: 4 },
    boxscore: { gameInfo: { homeScore: '3', awayScore: '3', homeQuarterScores: ['3', '0', '0', '0'], awayQuarterScores: ['3', '0', '0', '0'] }, homeTeam: { players: home }, awayTeam: { players: away } },
    actions: { actions: acts }
  };
}
const meta = { gameId: 7, date: '11/10/2026', round: 1, home: { code: 'HTA', name: 'Hapoel Tel Aviv' }, away: { code: 'MTA', name: 'Maccabi Tel Aviv' } };

test('team codes from short names are unique', () => {
  const c = teamCodes([{ id: 1, short: 'Hapoel Tel Aviv' }, { id: 2, short: 'Maccabi Tel Aviv' }, { id: 3, short: 'Hapoel Tel Aviv' }]);
  assert.deepEqual([c.get('1'), c.get('2'), c.get('3')], ['HTA', 'MTA', 'HT2']);
});

test('LiveStats game becomes a EuroLeague-shaped game that passes the checks', () => {
  const raw = convertGame(game(), meta, 'ISR2027');
  const g = parseGame(raw);
  assert.equal(g.home.score, 3);
  assert.equal(g.home.players.find((p) => p.id === 'IL101').ftm, 1);
  assert.equal(g.away.teamRow.dreb, 1);
  assert.equal(g.away.totals.reb, 1);
  assert.equal(g.home.players[0].name, 'P0 T100');
  // the draw-in for the tie is not an error here; only the box-score consistency is checked
  const errs = validateGame(g).filter((e) => !/tied/.test(e));
  assert.deepEqual(errs, []);
});

test('play-by-play reproduces the official +/- (substitutions first at the same moment)', () => {
  const raw = convertGame(game(), meta, 'ISR2027');
  const g = parseGame(raw);
  const st = buildStints(g, raw.pbp);
  assert.ok(st.ok, st.reason);
  assert.equal(checkStints(g, st.stints), null);
});
