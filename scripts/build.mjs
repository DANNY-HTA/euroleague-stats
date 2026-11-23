// Reads the saved box scores, runs every accuracy check, calculates the stats
// and writes the website to site/.  If any check fails, nothing is written.
//
//   node scripts/build.mjs                          -> real data in data/raw/<season>
//   node scripts/build.mjs --data data/sample --sample

import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGame } from '../lib/parse.mjs';
import { validateSeason } from '../lib/validate.mjs';
import { teamTable, playerTable, qualified, leaders, seasonInfo, teamGames, quarterAverages } from '../lib/stats.mjs';
import { esc, f1, signed, scatter, page } from '../lib/render.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const args = process.argv.slice(2);
const dataDir = args.includes('--data') ? args[args.indexOf('--data') + 1] : join('data', 'raw', cfg.seasonCode);
const sample = args.includes('--sample');
const OUT = 'site';

if (!existsSync(dataDir)) { console.error(`No data in ${dataDir}. Run "npm run fetch" first.`); process.exit(1); }
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort();
const games = files.map((f) => parseGame(JSON.parse(readFileSync(join(dataDir, f)))));

// ---- 1. Accuracy checks: stop if anything is wrong ----
const { errors, warnings } = validateSeason(games);
for (const w of warnings) console.warn('Warning: ' + w);
if (errors.length) {
  console.error(`\n${errors.length} accuracy check(s) failed. The site was NOT updated:\n`);
  for (const e of errors.slice(0, 50)) console.error('  ✗ ' + e);
  if (errors.length > 50) console.error(`  …and ${errors.length - 50} more`);
  process.exit(1);
}
console.log(`✓ ${games.length} games passed all accuracy checks`);

// ---- 2. Stats ----
const teams = teamTable(games);
const players = playerTable(games);
const qual = qualified(players, teams, cfg);
const info = seasonInfo(games);
const avg = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / (arr.length || 1);
const teamName = new Map(teams.map((t) => [t.code, t.name]));
// "FC BARCELONA" -> "FC Barcelona", "LDLC ASVEL VILLEURBANNE" -> "LDLC ASVEL Villeurbanne"
const KEEP_UPPER = new Set(['LDLC', 'ASVEL', 'AKTOR', 'BC', 'FC', 'KK', 'BK', 'AS', 'EA7', 'CSKA', 'PAOK', 'AEK', 'UNICS', 'ALBA', 'TSU']);
const titleCase = (s) => s.split(/\s+/).map((w) => (KEEP_UPPER.has(w) || w.length <= 2 || /\d/.test(w)
  ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');

// ---- 3. Pages ----
const standingsRows = teams.map((t) => `<tr>
<td class="num muted">${t.rank}</td>
<td><a href="team-${esc(String(t.code).replace(/[^A-Za-z0-9]/g, ''))}.html"><span class="code">${esc(t.tv)}</span> ${esc(titleCase(t.name))}</a></td>
<td class="num">${t.w}–${t.l}</td>
<td class="num">${f1(t.ortg)}</td>
<td class="num">${f1(t.drtg)}</td>
<td class="num ${t.net >= 0 ? 'pos' : 'neg'}">${signed(t.net)}</td>
</tr>`).join('');

const teamChart = scatter(teams.map((t) => ({
  x: t.ortg, y: t.drtg, label: t.tv,
  title: `${titleCase(t.name)}: ${t.w}–${t.l}, offensive rating ${f1(t.ortg)}, defensive rating ${f1(t.drtg)}, net ${signed(t.net)}`
})), { xLabel: 'Points scored per 100 possessions', yLabel: 'Points allowed per 100', invertY: true, big: true, avgX: avg(teams, 'ortg'), avgY: avg(teams, 'drtg'), cornerGood: 'Good at both ends', cornerBad: 'Struggling at both ends' });

function board(title, sub, key, fmt = f1) {
  const list = leaders(qual, key, 10);
  const top = list[0]?.[key] || 1;
  return `<section class="card board"><h2>${title}</h2><p class="muted">${sub}</p><ol>
${list.map((p, i) => `<li><span class="muted num">${i + 1}</span><div><a href="players.html#${esc(p.id)}">${esc(p.name)}</a> <span class="muted">${esc(p.tv)}</span><div class="bar"><span style="width:${(100 * p[key] / top).toFixed(1)}%"></span></div></div><strong class="num">${fmt(p[key])}</strong></li>`).join('')}
</ol></section>`;
}

const qualNote = `Players averaging at least ${cfg.minMinutesForLeaders} minutes and playing ${Math.round(cfg.minGamesShare * 100)}% of their team's games.`;

writePage('index.html', cfg.seasonLabel, `
<section class="hero">
<h1>${esc(cfg.seasonLabel)}</h1>
<p>Every team placed by how well it scores and how well it defends, per 100 possessions.</p>
</section>
<div class="row">
<section class="card"><h2>Standings</h2>
<div class="scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" class="num">W–L</th><th scope="col" class="num" title="Points scored per 100 possessions">ORtg</th><th scope="col" class="num" title="Points allowed per 100 possessions">DRtg</th><th scope="col" class="num">Net</th></tr></thead>
<tbody>${standingsRows}</tbody></table></div>
<p class="muted small">Ranked by wins, then point difference. Official tiebreakers use head-to-head results.</p>
</section>
<section class="card wide"><h2>Who scores, who defends</h2><p class="muted">Right = better offense. Up = better defense. Dashed lines are the league average.</p>
${teamChart}<p class="hover-info" aria-live="polite"></p></section>
</div>
<div class="row">
${board('Points', 'Per game', 'ppg')}
${board('PIR', 'Performance Index Rating per game', 'pirpg')}
</div>
<div class="row">
${board('PRA', 'Points + rebounds + assists per game', 'pra')}
${board('Stocks', 'Steals + blocks per game', 'stocks')}
</div>
<p class="muted small">${qualNote}</p>`, 'index.html');

// Players page
const VIEWS = [
  { id: 'usage', label: 'Usage vs efficiency', x: 'usg', y: 'ts', xl: 'Usage rate %', yl: 'True shooting %' },
  { id: 'threes', label: '3-point volume vs accuracy', x: 'threeApg', y: 'threePct', xl: '3-point attempts per game', yl: '3P%', filter: (p) => p.totals.fga3 >= 15 },
  { id: 'scoring', label: 'Scoring vs playmaking', x: 'ppg', y: 'apg', xl: 'Points per game', yl: 'Assists per game' },
  { id: 'minutes', label: 'Minutes vs PIR', x: 'mpg', y: 'pirpg', xl: 'Minutes per game', yl: 'PIR per game' }
];
const playerCharts = VIEWS.map((v, i) => scatter(qual.filter(v.filter || (() => true)).map((p) => ({
  x: p[v.x], y: p[v.y],
  title: `${p.name} (${p.tv}): ${v.xl} ${f1(p[v.x])}, ${v.yl} ${f1(p[v.y])}`,
  attrs: { 'data-id': p.id, 'data-team': p.team }
})), { xLabel: v.xl, yLabel: v.yl, view: v.id, hidden: i > 0 })).join('');

const cols = [['name', 'Player', 's'], ['tv', 'Team', 's'], ['gp', 'GP'], ['mpg', 'MIN'], ['ppg', 'PTS'], ['rpg', 'REB'], ['apg', 'AST'], ['spg', 'STL'], ['bpg', 'BLK'], ['tpg', 'TOV'], ['pirpg', 'PIR'], ['pra', 'PRA'], ['fgPct', 'FG%'], ['threePct', '3P%'], ['ftPct', 'FT%'], ['ts', 'TS%'], ['usg', 'USG%']];
const sortedPlayers = [...players].sort((a, b) => b.ppg - a.ppg);
const playerRows = sortedPlayers.map((p) => `<tr id="${esc(p.id)}" data-team="${esc(p.team)}">${cols.map(([k, , t]) => t === 's'
  ? `<td data-v="${esc(p[k])}">${esc(p[k])}</td>`
  : `<td class="num" data-v="${p[k].toFixed(3)}">${k === 'gp' ? p.gp : f1(p[k])}</td>`).join('')}</tr>`).join('');
const teamOptions = teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${esc(t.code)}">${esc(titleCase(t.name))}</option>`).join('');

writePage('players.html', 'Players', `
<section class="hero"><h1>Players</h1><p>${esc(cfg.seasonLabel)} per-game stats. Click a column to sort.</p></section>
<section class="card">
<div class="controls">
<div role="group" aria-label="Chart" class="tabs">${VIEWS.map((v, i) => `<button type="button" data-show="${v.id}" aria-pressed="${i === 0}">${v.label}</button>`).join('')}</div>
<label>Team <select id="team-filter"><option value="">All teams</option>${teamOptions}</select></label>
</div>
<div class="chart-row"><div class="charts">${playerCharts}</div>
<aside class="detail" aria-live="polite"><p class="muted">Hover or tab to a dot to see the player.</p></aside></div>
<p class="muted small">Chart: ${qualNote} 3-point chart: at least 15 attempts.</p>
</section>
<section class="card">
<div class="scroll"><table class="sortable" id="players"><thead><tr>${cols.map(([k, l, t]) => `<th scope="col"${t === 's' ? '' : ' class="num"'}><button type="button" data-key="${k}">${l}</button></th>`).join('')}</tr></thead>
<tbody>${playerRows}</tbody></table></div>
</section>`, 'players.html');

// Teams page
const tcols = [['name', 'Team', 's'], ['gp', 'GP'], ['w', 'W'], ['l', 'L'], ['ppg', 'PTS'], ['oppg', 'OPP'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net'], ['pace', 'Pace'], ['ts', 'TS%'], ['efg', 'eFG%'], ['tov100', 'TOV/100'], ['orebPct', 'OREB%']];
writePage('teams.html', 'Teams', `
<section class="hero"><h1>Teams</h1><p>${esc(cfg.seasonLabel)} team stats. Click a column to sort, or a team for its scouting report.</p></section>
<section class="card"><div class="scroll"><table class="sortable"><thead><tr>${tcols.map(([k, l, t]) => `<th scope="col"${t === 's' ? '' : ' class="num"'}><button type="button" data-key="${k}">${l}</button></th>`).join('')}</tr></thead>
<tbody>${teams.map((t) => `<tr>${tcols.map(([k, , ty]) => ty === 's' ? `<td data-v="${esc(t.name)}"><a href="team-${esc(String(t.code).replace(/[^A-Za-z0-9]/g, ''))}.html"><span class="code">${esc(t.tv)}</span> ${esc(titleCase(t.name))}</a></td>` : `<td class="num" data-v="${t[k].toFixed(3)}">${['gp', 'w', 'l'].includes(k) ? t[k] : k === 'net' ? signed(t[k]) : f1(t[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`, 'teams.html');

// Scouting page for every team
const ord = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
};
const N = teams.length;
const lg = (k) => avg(teams, k);
const safe = (code) => String(code).replace(/[^A-Za-z0-9]/g, '');
const teamHref = (code) => `team-${safe(code)}.html`;
const rankTag = (r) => `<span class="rank ${r <= 3 ? 'top' : r > N - 3 ? 'bottom' : ''}">${ord(r)}</span>`;

function scoutNotes(t, roster, qa) {
  const notes = [];
  const top = (k) => t.ranks[k] <= 3, bottom = (k) => t.ranks[k] > N - 3;
  const say = (cond, text) => { if (cond) notes.push(text); };
  say(top('threeRate'), `Shoots a lot of threes: ${f1(t.threeRate)}% of their shots are threes (${ord(t.ranks.threeRate)} in the league).`);
  say(bottom('threeRate'), `Rarely shoots threes: only ${f1(t.threeRate)}% of their shots (${ord(t.ranks.threeRate)}). They attack inside.`);
  say(top('threePct'), `Dangerous from outside: ${f1(t.threePct)}% from three (${ord(t.ranks.threePct)}).`);
  say(bottom('threePct'), `Struggles from outside: ${f1(t.threePct)}% from three (${ord(t.ranks.threePct)}).`);
  say(top('orebPct'), `Crashes the offensive glass: grabs ${f1(t.orebPct)}% of their own misses (${ord(t.ranks.orebPct)}). Box out.`);
  say(bottom('orebPct'), `Doesn't chase offensive rebounds: ${f1(t.orebPct)}% (${ord(t.ranks.orebPct)}).`);
  say(top('tov100'), `Takes care of the ball: ${f1(t.tov100)} turnovers per 100 possessions (${ord(t.ranks.tov100)}).`);
  say(bottom('tov100'), `Turnover-prone: ${f1(t.tov100)} turnovers per 100 possessions (${ord(t.ranks.tov100)}). Pressure the ball.`);
  say(top('tov100D'), `Forces turnovers: opponents give it away ${f1(t.tov100D)} times per 100 possessions (${ord(t.ranks.tov100D)}).`);
  say(top('ftr'), `Gets to the line: ${f1(t.ftr)} free throws per 100 shots (${ord(t.ranks.ftr)}). Avoid cheap fouls.`);
  say(top('ftrD'), `Rarely fouls: opponents get only ${f1(t.ftrD)} free throws per 100 shots (${ord(t.ranks.ftrD)}).`);
  say(top('pace'), `Plays fast: ${f1(t.pace)} possessions per 40 minutes (${ord(t.ranks.pace)}).`);
  say(bottom('pace'), `Plays slow: ${f1(t.pace)} possessions per 40 minutes (${ord(t.ranks.pace)}).`);
  say(top('drtg'), `Elite defence: allows ${f1(t.drtg)} points per 100 possessions (${ord(t.ranks.drtg)}).`);
  say(bottom('drtg'), `Weak defence: allows ${f1(t.drtg)} points per 100 possessions (${ord(t.ranks.drtg)}).`);
  say(top('ortg'), `Elite offence: scores ${f1(t.ortg)} points per 100 possessions (${ord(t.ranks.ortg)}).`);
  say(top('threePctD'), `Defends the three-point line well: opponents shoot ${f1(t.threePctD)}% (${ord(t.ranks.threePctD)}).`);
  say(bottom('threePctD'), `Gives up threes: opponents shoot ${f1(t.threePctD)}% from three against them (${ord(t.ranks.threePctD)}).`);
  if (qa) {
    const best = [...qa].sort((a, b) => b.margin - a.margin)[0];
    const worst = [...qa].sort((a, b) => a.margin - b.margin)[0];
    notes.push(`Best quarter: Q${best.q} (${signed(best.margin)} per game on average). Worst quarter: Q${worst.q} (${signed(worst.margin)}).`);
  }
  const reg = roster.filter((p) => p.mpg >= 10);
  const byUsg = [...reg].sort((a, b) => b.usg - a.usg)[0];
  if (byUsg) notes.push(`Main option: ${byUsg.name}, who uses ${f1(byUsg.usg)}% of possessions when on court (${f1(byUsg.ppg)} points, ${f1(byUsg.ts)} TS%).`);
  const shooter = reg.filter((p) => p.threeApg >= 2).sort((a, b) => b.threePct - a.threePct)[0];
  if (shooter) notes.push(`Best volume shooter: ${shooter.name}, ${f1(shooter.threePct)}% on ${f1(shooter.threeApg)} threes per game.`);
  const glass = [...reg].sort((a, b) => b.rpg - a.rpg)[0];
  if (glass) notes.push(`Top rebounder: ${glass.name}, ${f1(glass.rpg)} per game.`);
  const creator = [...reg].sort((a, b) => b.apg - a.apg)[0];
  if (creator) notes.push(`Main playmaker: ${creator.name}, ${f1(creator.apg)} assists per game.`);
  return notes;
}

const factorRow = (label, k, kd, hint) => `<tr><th scope="row">${label}${hint ? ` <span class="muted">${hint}</span>` : ''}</th>
<td class="num">${f1(curTeam[k])} ${rankTag(curTeam.ranks[k])}</td><td class="num muted">${f1(lg(k))}</td>
<td class="num">${kd ? `${f1(curTeam[kd])} ${rankTag(curTeam.ranks[kd])}` : '–'}</td><td class="num muted">${kd ? f1(lg(kd)) : '–'}</td></tr>`;
let curTeam;

for (const t of teams) {
  curTeam = t;
  const list = teamGames(games, t.code);
  const qa = quarterAverages(list);
  const roster = players.filter((p) => p.team === t.code).sort((a, b) => b.mpg - a.mpg);
  const notes = scoutNotes(t, roster, qa);
  const last5 = list.slice(0, 5).map((g) => (g.win ? 'W' : 'L')).join(' ');
  writePage(teamHref(t.code), titleCase(t.name), `
<section class="hero"><p class="muted"><a href="teams.html">Teams</a> / Scouting report</p>
<h1>${esc(titleCase(t.name))}</h1>
<p>${t.w}–${t.l} · ${ord(t.rank)} in the standings · Home ${t.home} · Away ${t.away} · Last 5: ${last5}</p></section>
<div class="row">
<section class="card"><h2>Scouting notes</h2><p class="muted">Generated from this season's box scores. Ranks are out of ${N} teams.</p>
<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>
<section class="card"><h2>Ratings</h2>
<div class="kpis">
<div><span class="muted">Offence</span><strong>${f1(t.ortg)}</strong>${rankTag(t.ranks.ortg)}</div>
<div><span class="muted">Defence</span><strong>${f1(t.drtg)}</strong>${rankTag(t.ranks.drtg)}</div>
<div><span class="muted">Net</span><strong class="${t.net >= 0 ? 'pos' : 'neg'}">${signed(t.net)}</strong>${rankTag(t.ranks.net)}</div>
<div><span class="muted">Pace</span><strong>${f1(t.pace)}</strong>${rankTag(t.ranks.pace)}</div>
</div>
${qa ? `<h3>Scoring by quarter <span class="muted">(per game)</span></h3>
<div class="scroll"><table><thead><tr><th scope="col"></th>${qa.map((x) => `<th scope="col" class="num">Q${x.q}</th>`).join('')}</tr></thead><tbody>
<tr><th scope="row">Scored</th>${qa.map((x) => `<td class="num">${f1(x.for)}</td>`).join('')}</tr>
<tr><th scope="row">Allowed</th>${qa.map((x) => `<td class="num">${f1(x.against)}</td>`).join('')}</tr>
<tr><th scope="row">Margin</th>${qa.map((x) => `<td class="num ${x.margin >= 0 ? 'pos' : 'neg'}">${signed(x.margin)}</td>`).join('')}</tr>
</tbody></table></div>` : ''}
</section></div>
<section class="card"><h2>Four factors and shooting</h2><p class="muted">Ranks: 1st = best in the league. On defence, "best" means the lowest value for opponents.</p>
<div class="scroll"><table class="factors"><thead><tr><th scope="col"></th><th scope="col" class="num">Offence</th><th scope="col" class="num">League avg</th><th scope="col" class="num">Defence (opponents)</th><th scope="col" class="num">League avg</th></tr></thead><tbody>
${factorRow('Effective FG%', 'efg', 'efgD')}
${factorRow('Turnovers per 100', 'tov100', 'tov100D', '(defence: forced)')}
${factorRow('Offensive rebound %', 'orebPct', null)}
${factorRow('Defensive rebound %', 'drebPct', null)}
${factorRow('Free throws per 100 shots', 'ftr', 'ftrD')}
${factorRow('Share of shots that are threes', 'threeRate', 'threeRateD')}
${factorRow('3P%', 'threePct', 'threePctD')}
${factorRow('2P%', 'twoPct', 'twoPctD')}
${factorRow('FT%', 'ftPct', null)}
${factorRow('Assisted baskets %', 'astRate', null)}
</tbody></table></div></section>
<section class="card"><h2>Rotation</h2><p class="muted">Sorted by minutes. Season stats for players whose most recent game was for this team.</p>
<div class="scroll"><table><thead><tr>${['Player', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'TOV', 'PIR', 'USG%', 'TS%', '3PA', '3P%', 'FT%'].map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>
${roster.map((p) => `<tr><td><a href="players.html#${esc(p.id)}">${esc(p.name)}</a></td><td class="num">${p.gp}</td><td class="num">${p.gs}</td><td class="num">${f1(p.mpg)}</td><td class="num">${f1(p.ppg)}</td><td class="num">${f1(p.rpg)}</td><td class="num">${f1(p.apg)}</td><td class="num">${f1(p.spg)}</td><td class="num">${f1(p.tpg)}</td><td class="num">${f1(p.pirpg)}</td><td class="num">${f1(p.usg)}</td><td class="num">${f1(p.ts)}</td><td class="num">${f1(p.threeApg)}</td><td class="num">${f1(p.threePct)}</td><td class="num">${f1(p.ftPct)}</td></tr>`).join('')}
</tbody></table></div></section>
<section class="card"><h2>Results</h2>
<div class="scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Rd</th><th scope="col"></th><th scope="col">Opponent</th><th scope="col">Result</th></tr></thead><tbody>
${list.map((g) => `<tr><td>${esc(g.date)}</td><td class="num">${g.round}</td><td class="muted">${g.isHome ? 'vs' : 'at'}</td><td><a href="${teamHref(g.opp.code)}"><span class="code">${esc(g.opp.tv)}</span> ${esc(titleCase(g.opp.name))}</a></td><td class="${g.win ? 'pos' : 'neg'}">${g.win ? 'W' : 'L'} ${g.for}–${g.against}</td></tr>`).join('')}
</tbody></table></div></section>`, 'teams.html');
}

// Method page
writePage('method.html', 'How we calculate', `
<section class="hero"><h1>How we calculate</h1><p>Every number on this site comes from the official EuroLeague box scores. Nothing is typed in by hand.</p></section>
<section class="card prose">
<h2>Where the data comes from</h2>
<p>Each night the site downloads the box score of every finished game from the EuroLeague's live data feed, the same feed behind euroleaguebasketball.net. All games are downloaded again every night, so any correction the league makes after a game is picked up.</p>
<h2>Accuracy checks</h2>
<p>Before the site is updated, every game must pass all of these checks. If one fails, the site keeps showing the previous day's numbers.</p>
<ul>
<li>The final score in the box score equals the official result.</li>
<li>Each player's points equal 2 × two-pointers + 3 × three-pointers + free throws.</li>
<li>Players' points, shots, rebounds, assists, steals, blocks, turnovers and fouls add up to the team total.</li>
<li>Players' minutes add up to 200 (plus 25 for each overtime).</li>
<li>No player made more shots than he attempted, and offensive + defensive rebounds equal total rebounds.</li>
<li>No game is counted twice, and no team is missing games.</li>
</ul>
<h2>Formulas</h2>
<dl>
<dt>Possessions</dt><dd>FGA − offensive rebounds + turnovers + 0.44 × FTA, averaged over both teams in the game.</dd>
<dt>Offensive rating (ORtg)</dt><dd>Points scored per 100 possessions.</dd>
<dt>Defensive rating (DRtg)</dt><dd>Points allowed per 100 possessions. Lower is better.</dd>
<dt>Net rating</dt><dd>ORtg − DRtg.</dd>
<dt>Pace</dt><dd>Possessions per 40 minutes.</dd>
<dt>True shooting % (TS%)</dt><dd>Points ÷ (2 × (FGA + 0.44 × FTA)). Counts threes and free throws fairly.</dd>
<dt>Effective FG% (eFG%)</dt><dd>(FGM + 0.5 × 3PM) ÷ FGA.</dd>
<dt>Usage rate (USG%)</dt><dd>Share of the team's plays a player finished while on the court: 100 × (FGA + 0.44 × FTA + TOV) × (team minutes ÷ 5) ÷ (player minutes × (team FGA + 0.44 × team FTA + team TOV)).</dd>
<dt>PIR</dt><dd>The EuroLeague's official Performance Index Rating, taken directly from the box score.</dd>
<dt>PRA</dt><dd>Points + rebounds + assists per game.</dd>
<dt>Stocks</dt><dd>Steals + blocks per game.</dd>
</dl>
<h2>Leaderboards</h2>
<p>${qualNote}</p>
</section>`, 'method.html');

// Static files + data for the browser
mkdirSync(OUT, { recursive: true });
copyFileSync('static/style.css', join(OUT, 'style.css'));
copyFileSync('static/app.js', join(OUT, 'app.js'));
writeFileSync(join(OUT, 'players.json'), JSON.stringify(players.map((p) => ({
  id: p.id, name: p.name, team: teamName.get(p.team) ? titleCase(teamName.get(p.team)) : p.team, tv: p.tv, gp: p.gp,
  stats: [['PTS', p.ppg], ['REB', p.rpg], ['AST', p.apg], ['STL', p.spg], ['BLK', p.bpg], ['PIR', p.pirpg], ['MIN', p.mpg], ['TS%', p.ts], ['USG%', p.usg]].map(([k, v]) => [k, f1(v)])
}))));
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`✓ Site written to ${OUT}/ (${teams.length} teams, ${players.length} players)`);

function writePage(file, title, body, active) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), page({ title, cfg, info, active, sample, body }));
}
