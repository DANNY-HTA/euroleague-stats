import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResults, parseGamePage } from '../lib/ibba.mjs';
import { validateGame } from '../lib/validate.mjs';

const team = (id, name) => `<a href="team.asp?TeamId=${id}&amp;lang=en"> <div class="game_item"><img src="https://www.basket.co.il/pics/${id}.png" alt=""></div> <div class="game_item mid deskOnly">${name}</div></a>`;
const RESULTS = `<table><tr><td colspan="9">Game 1</td></tr>
<tr class="row odd"><td>10/10/2026<div class="mobileOnly">20:15</div></td><td>20:15</td><td>Arena</td><td>5PLUS</td><td></td><td>${team(1, 'Home BC')}</td><td>${team(2, 'Away BC')}</td><td><a href="game-zone.asp?GameId=900&amp;lang=en#!review"><img src="x"></a></td><td><a href="game-zone.asp?GameId=900&amp;lang=en">8 - 5</a></td></tr>
<tr class="row"><td>20/12/2026</td><td></td><td></td><td></td><td></td><td>${team(2, 'Away BC')}</td><td>${team(1, 'Home BC')}</td><td><a href="game-zone.asp?GameId=901&amp;lang=en">news</a></td><td></td></tr></table>`;
const row = (c) => '<tr>' + c.map((x) => `<td>${x}</td>`).join('') + '</tr>';
const p = (id, name, sf, min, pts, f2, f3, ft, dr, or, tr, pir, pm) => row(['5', `<a href="player.asp?PlayerId=${id}&amp;lang=en">${name}</a>`, sf, min, pts, f2, '', f3, '', ft, '', dr, or, tr, 1, 0, 0, 1, 1, 0, 0, pir, pm]);
const box = (id, name, players, totals) => `<table class="stats_tbl"><tbody><tr><td class="round_break en" colspan="23"><a href="team.asp?TeamId=${id}&amp;lang=en">${name}</a></td></tr>
<tr class="header_row"><td>#</td><td>Player Name</td><td>SF</td><td>Min</td><td>Pts</td><td>M/A</td><td>%</td><td>M/A</td><td>%</td><td>M/A</td><td>%</td><td>DR</td><td>OR</td><td>TR</td><td>PF</td><td>FA</td><td>ST</td><td>TO</td><td>AS</td><td>BKF</td><td>BKA</td><td>VAL</td><td>+/-</td></tr>
${row(['', 'Team', '', 0, 0, '0/0', 0, '0/0', 0, '0/0', 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0])}${players}${totals}</tbody></table>`;
// Away team box first on the page (the parser must match by team id)
const fill = (base) => [1, 2, 3, 4].map((i) => p(base + i, 'Filler ' + (base + i), '', 40, 0, '0/0', '0/0', '0/0', 0, 0, 0, -2, 0)).join('');
// Each filler has 1 PF, 1 TO, 1 AS in the helper, so totals below include them.
const PAGE = box(2, 'Away BC', p(21, 'Ann Away', '*', 40, 5, '1/2', '1/3', '0/0', 2, 0, 2, 4, -3) + fill(30), row(['', 'Total', '', 200, 5, '1/2', 50, '1/3', 33, '0/0', 0, 3, 0, 3, 5, 0, 0, 5, 5, 0, 0, -3, 0]))
  + box(1, 'Home BC', p(11, 'Bob Home', '*', 40, 6, '3/4', '0/1', '0/0', 1, 1, 2, 7, 3) + p(12, 'Cy Bench', '', 0, 2, '0/1', '0/0', '2/2', 0, 0, 0, 1, 3) + fill(40), row(['', 'Total', '', 200, 8, '3/5', 60, '0/1', 0, '2/2', 100, 2, 1, 3, 6, 0, 0, 6, 6, 0, 0, 1, 0]));

test('results page: played games with round, date, teams and score', () => {
  const g = parseResults(RESULTS);
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].gameId, g[0].round, g[0].date, g[0].home.name, g[0].away.id, g[0].hs, g[0].as], [900, 1, '2026-10-10', 'Home BC', '2', 8, 5]);
  assert.match(g[0].home.crest, /^https:/);
});

test('game page: box scores matched to home/away and pass the same checks as EuroLeague games', () => {
  const info = parseResults(RESULTS)[0];
  const g = parseGamePage(PAGE, info, 'ISR');
  assert.equal(g.home.name, 'Home BC');
  assert.equal(g.home.players.length, 6);
  assert.equal(g.home.players[1].ftm, 2);
  assert.equal(g.home.totals.pts, 8);
  assert.equal(g.away.players[0].pm, -3);
  assert.deepEqual(validateGame(g), []);
});
