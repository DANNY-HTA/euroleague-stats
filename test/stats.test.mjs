import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGame, parseMinutes, formatName, parseDate, isFinishedGame, quarterPoints } from '../lib/parse.mjs';
import { validateGame, validateSeason } from '../lib/validate.mjs';
import { possessions, gamePossessions, trueShooting, teamTable, playerTable, leaders, teamGames, quarterAverages } from '../lib/stats.mjs';
import { knownGame, rawGame, teamBlock, playerRow } from './helpers.mjs';

const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('parsing helpers', () => {
  close(parseMinutes('33:21'), 33.35);
  assert.equal(parseMinutes('DNP'), 0);
  assert.equal(parseMinutes(null), 0);
  assert.equal(formatName('LARKIN, SHANE'), 'Shane Larkin');
  assert.equal(formatName('DE COLO, NANDO'), 'Nando De Colo');
  assert.equal(formatName("O'NEALE, ROYCE"), "Royce O'Neale");
  assert.equal(parseDate('30/09/2025'), '2025-09-30');
});

test('finished-game detection', () => {
  const raw = knownGame();
  assert.equal(isFinishedGame(raw.header, raw.boxscore), true);
  assert.equal(isFinishedGame({ ...raw.header, Live: true }, raw.boxscore), false);
  assert.equal(isFinishedGame({ ...raw.header, ScoreA: '' }, raw.boxscore), false);
  assert.equal(isFinishedGame(raw.header, { Stats: [] }), false);
});

test('known game parses to the right totals', () => {
  const g = parseGame(knownGame());
  assert.equal(g.home.code, 'IST');
  assert.equal(g.home.score, 71);
  assert.equal(g.away.score, 53);
  assert.equal(g.home.players[0].name, 'Shane Larkin');
  assert.equal(g.home.players[0].pts, 20);
  assert.equal(g.home.totals.reb, 29); // 27 player rebounds + 2 team rebounds
});

test('known game passes every accuracy check', () => {
  assert.deepEqual(validateGame(parseGame(knownGame())), []);
});

test('possessions and ratings match hand calculation', () => {
  const g = parseGame(knownGame());
  close(possessions(g.home.totals), 60.16);  // 52 FGA − 7 OREB + 9 TOV + 0.44×14 FTA
  close(possessions(g.away.totals), 52.84);
  close(gamePossessions(g), 56.5);
  const [ist] = teamTable([g]);
  assert.equal(ist.code, 'IST');
  close(ist.ortg, 125.66);                   // 100 × 71 / 56.5
  close(ist.drtg, 93.81);                    // 100 × 53 / 56.5
  close(ist.net, 31.86);
  assert.equal(ist.w, 1);
});

test('player shooting and usage match hand calculation', () => {
  const g = parseGame(knownGame());
  const larkin = playerTable([g]).find((p) => p.id === 'P1');
  close(larkin.ts, 67.75);                   // 20 / (2 × (13 + 0.44×4))
  close(larkin.usg, 26.44);                  // 17.76 plays of the team's 67.16
  close(larkin.pra, 31);                     // 20 + 5 + 6
  close(larkin.stocks, 2);
  close(trueShooting({ pts: 0, fga2: 0, fga3: 0, fta: 0 }), 0); // no divide-by-zero
});

test('four factors match hand calculation', () => {
  const [ist, tel] = teamTable([parseGame(knownGame())]);
  close(ist.efg, 58.65);       // (27 FGM + 0.5×7 3PM) / 52 FGA
  close(ist.efgD, 50.0);       // opponents: (20 + 2.5) / 45
  close(ist.tov100, 15.93);    // 9 TOV / 56.5 possessions
  close(ist.orebPct, 31.82);   // 7 / (7 + 15 opponent DREB)
  close(ist.drebPct, 78.57);   // 22 / (22 + 6 opponent OREB)
  close(ist.ftr, 26.92);       // 14 FTA / 52 FGA
  close(ist.threeRate, 34.62); // 18 3PA / 52 FGA
  assert.equal(ist.home, '1–0');
  assert.equal(tel.away, '0–1');
  assert.equal(ist.ranks.ortg, 1);
  assert.equal(tel.ranks.ortg, 2);
});

test('quarter points come from the running totals', () => {
  assert.deepEqual(quarterPoints({ ScoreQuarter1A: 21, ScoreQuarter2A: 40, ScoreQuarter3A: 60, ScoreQuarter4A: 85 }, 'A'), [21, 19, 20, 25]);
  assert.equal(quarterPoints({ ScoreQuarter1A: 21 }, 'A'), null);
  const raw = knownGame();
  Object.assign(raw.header, { ScoreQuarter1A: 20, ScoreQuarter2A: 38, ScoreQuarter3A: 55, ScoreQuarter4A: 71, ScoreQuarter1B: 10, ScoreQuarter2B: 25, ScoreQuarter3B: 40, ScoreQuarter4B: 53 });
  const list = teamGames([parseGame(raw)], 'IST');
  assert.equal(list[0].win, true);
  const qa = quarterAverages(list);
  assert.deepEqual(qa.map((x) => x.margin), [10, 3, 2, 3]);
});

test('season averages over two games', () => {
  const g1 = parseGame(knownGame());
  const raw2 = knownGame(); raw2.gameCode = 2; raw2.header.Round = '2';
  // swap home/away so it is a different game
  [raw2.header.TeamA, raw2.header.TeamB] = [raw2.header.TeamB, raw2.header.TeamA];
  [raw2.header.CodeTeamA, raw2.header.CodeTeamB] = [raw2.header.CodeTeamB, raw2.header.CodeTeamA];
  [raw2.header.TVCodeA, raw2.header.TVCodeB] = [raw2.header.TVCodeB, raw2.header.TVCodeA];
  [raw2.header.ScoreA, raw2.header.ScoreB] = [raw2.header.ScoreB, raw2.header.ScoreA];
  const g2 = parseGame(raw2);
  assert.deepEqual(validateGame(g2), []);
  const larkin = playerTable([g1, g2]).find((p) => p.id === 'P1');
  assert.equal(larkin.gp, 2);
  close(larkin.ppg, 20);
  const teams = teamTable([g1, g2]);
  assert.equal(teams.find((t) => t.code === 'IST').w, 2);
  assert.equal(leaders(playerTable([g1, g2]), 'ppg', 1)[0].id, 'P1');
});

test('checks catch a wrong official score', () => {
  const raw = knownGame(); raw.header.ScoreA = '72';
  const errors = validateGame(parseGame(raw));
  assert.ok(errors.some((e) => e.includes('official score 72')));
});

test('checks catch players not adding up to the team total', () => {
  const raw = knownGame(); raw.boxscore.Stats[0].totr.Assistances += 1;
  assert.ok(validateGame(parseGame(raw)).some((e) => e.includes('ast')));
});

test('checks catch a player whose points do not match his shots', () => {
  const raw = knownGame(); raw.boxscore.Stats[1].PlayersStats[2].Points += 2;
  const errors = validateGame(parseGame(raw));
  assert.ok(errors.some((e) => e.includes('points but shots add up')));
});

test('checks catch missing minutes', () => {
  const raw = knownGame(); raw.boxscore.Stats[0].PlayersStats[0].Minutes = '20:00';
  assert.ok(validateGame(parseGame(raw)).some((e) => e.includes('minutes')));
});

test('checks catch a duplicate game', () => {
  const g = parseGame(knownGame());
  const dup = { ...g, gameCode: 99 };
  assert.ok(validateSeason([g, dup]).errors.some((e) => e.includes('same game')));
});

test('overtime game is accepted', () => {
  const A = [playerRow('AAA', 'A1', 'A, A', [10, 20], [2, 6], [5, 6], [2, 8], 5, 1, 2, 0, 2, '45:00'),
    ...[2, 3, 4, 5].map((i) => playerRow('AAA', 'A' + i, 'A, ' + i, [3, 6], [1, 3], [0, 0], [1, 2], 1, 0, 1, 0, 1, '45:00'))];
  const B = [1, 2, 3, 4, 5].map((i) => playerRow('BBB', 'B' + i, 'B, ' + i, [4, 8], [1, 4], [0, 0], [1, 3], 1, 0, 1, 0, 1, '45:00'));
  const a = teamBlock('TEAM A', A); a.totr.Minutes = '225:00';
  const b = teamBlock('TEAM B', B); b.totr.Minutes = '225:00';
  const g = parseGame(rawGame({ a, b, codeA: 'AAA', codeB: 'BBB' }));
  assert.deepEqual(validateGame(g), []);
});
