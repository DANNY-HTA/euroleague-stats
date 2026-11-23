// Reads the saved box scores, runs every accuracy check, calculates the stats
// and writes the website to site/.  If any check fails, nothing is written.
//
//   node scripts/build.mjs                          -> real data in data/raw/<season>
//   node scripts/build.mjs --data data/sample --sample

import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGame } from '../lib/parse.mjs';
import { validateSeason } from '../lib/validate.mjs';
import { teamTable, playerTable, qualified, leaders, seasonInfo, teamGames, quarterAverages, playerGameLogs } from '../lib/stats.mjs';
import { esc, f1, signed, scatter, page, fmtDate, assetVersion } from '../lib/render.mjs';
import { indexPeople, findPerson, ageOn } from '../lib/people.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const args = process.argv.slice(2);
const dataDir = args.includes('--data') ? args[args.indexOf('--data') + 1] : join('data', 'raw', cfg.seasonCode);
const sample = args.includes('--sample');
const OUT = 'site';

if (!existsSync(dataDir)) { console.error(`No data in ${dataDir}. Run "npm run fetch" first.`); process.exit(1); }
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const games = files.map((f) => parseGame(JSON.parse(readFileSync(join(dataDir, f)))));

// Official club crests (optional). Only https image links are used.
const crests = new Map();
try {
  for (const c of JSON.parse(readFileSync(join(dataDir, '_clubs.json')))) {
    if (c.code && typeof c.crest === 'string' && /^https:\/\/[^\s"'<>]+$/.test(c.crest)) crests.set(c.code, c.crest);
  }
} catch { /* no crest file: team codes are shown instead */ }
// Player details (optional). Never includes photos.
let peopleIndex = indexPeople([]);
try { peopleIndex = indexPeople(JSON.parse(readFileSync(join(dataDir, '_people.json')))); } catch { /* stats-only player pages */ }
const playerHref = (id) => `player-${String(id).replace(/[^A-Za-z0-9]/g, '')}.html`;
const badge = (code, tv) => crests.has(code)
  ? `<img class="crest" src="${esc(crests.get(code))}" alt="" width="22" height="22" loading="lazy">`
  : `<span class="code">${esc(tv)}</span>`;

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
const ord = (n) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return n + (teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
};
const N = teams.length;
const lg = (k) => avg(teams, k);
const safe = (code) => String(code).replace(/[^A-Za-z0-9]/g, '');
const teamHref = (code) => `team-${safe(code)}.html`;
const rankTag = (r, total = N) => { const band = Math.max(3, Math.round(total * 0.1)); return `<span class="rank ${r <= band ? 'top' : r > total - band ? 'bottom' : ''}">${ord(r)}</span>`; };
const mmss = (m) => { const t = Math.round(m * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

const crestImg = (code, size = 'big') => crests.has(code) ? `<img class="crest ${size}" src="${esc(crests.get(code))}" alt="" width="56" height="56">` : '';
const coverCrest = (code) => crests.has(code) ? `<div class="side cover-crest"><img src="${esc(crests.get(code))}" alt=""></div>` : '';
const cover = ({ crumbs = '', kicker = '', title, meta = '', lede = '', strip = [], side = '' }) => `<section class="cover"><div class="wrap"><div>
${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}${kicker ? `<span class="kicker">${kicker}</span>` : ''}
<h1>${title}</h1>${meta ? `<div class="cover-meta">${meta}</div>` : ''}${lede ? `<p class="cover-lede">${lede}</p>` : ''}
${strip.length ? `<div class="strip">${strip.map(([b, t]) => `<span><b>${b}</b> ${t}</span>`).join('')}</div>` : ''}
</div>${side}</div></section>`;
const roundLine = info.lastDate ? `Through ${info.lastRound ? `Round ${info.lastRound}, ` : ''}${fmtDate(info.lastDate)}` : 'Season';

const standingsRows = teams.map((t) => `<tr>
<td class="num muted">${t.rank}</td>
<td class="team"><a href="team-${esc(String(t.code).replace(/[^A-Za-z0-9]/g, ''))}.html">${badge(t.code, t.tv)} ${esc(titleCase(t.name))}</a></td>
<td class="num">${t.w}–${t.l}</td>
<td class="num">${f1(t.ortg)}</td>
<td class="num">${f1(t.drtg)}</td>
<td class="num ${t.net >= 0 ? 'pos' : 'neg'}">${signed(t.net)}</td>
</tr>`).join('');

const teamChart = scatter(teams.map((t) => ({
  x: t.ortg, y: t.drtg, label: t.tv, img: crests.get(t.code),
  title: `${titleCase(t.name)}: ${t.w}–${t.l}, offensive rating ${f1(t.ortg)}, defensive rating ${f1(t.drtg)}, net ${signed(t.net)}`
})), { xLabel: 'Points scored per 100 possessions', yLabel: 'Points allowed per 100', invertY: true, big: true, avgX: avg(teams, 'ortg'), avgY: avg(teams, 'drtg'), cornerGood: 'Good at both ends', cornerBad: 'Struggling at both ends' });

function board(title, sub, key, fmt = f1) {
  const list = leaders(qual, key, 10);
  const top = list[0]?.[key] || 1;
  return `<section class="card board"><h2>${title}</h2><p class="muted">${sub}</p><ol>
${list.map((p, i) => `<li><span class="muted num">${i + 1}</span><div><a href="${playerHref(p.id)}">${esc(p.name)}</a> <span class="muted">${esc(p.tv)}</span><div class="bar"><span style="width:${(100 * p[key] / top).toFixed(1)}%"></span></div></div><strong class="num">${fmt(p[key])}</strong></li>`).join('')}
</ol></section>`;
}

const qualNote = `Players averaging at least ${cfg.minMinutesForLeaders} minutes and playing ${Math.round(cfg.minGamesShare * 100)}% of their team's games.`;

const lead = teams[0];
const topBy = (k) => leaders(qual, k, 1)[0];
const bestO = [...teams].sort((x, y) => y.ortg - x.ortg)[0], bestD = [...teams].sort((x, y) => x.drtg - y.drtg)[0];
const leaderTile = (k, label, sub) => {
  const p = topBy(k);
  if (!p) return '';
  return `<a class="tile" href="${playerHref(p.id)}"><span class="label">${label}</span><span class="big">${f1(p[k])}</span><span class="sub">${sub}</span>
<span class="chip hot">${esc(p.name)} · ${esc(p.tv)}</span></a>`;
};
const homeHero = cover({
  kicker: esc(roundLine),
  title: esc(cfg.seasonLabel),
  lede: lead ? `<strong>${esc(titleCase(lead.name))}</strong> lead the league at ${lead.w}–${lead.l}. ` +
    (topBy('pirpg') ? `<strong>${esc(topBy('pirpg').name)}</strong> tops the PIR chart at ${f1(topBy('pirpg').pirpg)} a game.` : '') : '',
  strip: [[info.games, 'games played'], [esc(bestO?.tv || ''), `best offence, ${f1(bestO?.ortg)}`], [esc(bestD?.tv || ''), `best defence, ${f1(bestD?.drtg)}`]],
  side: lead ? coverCrest(lead.code) : ''
});
writePage('index.html', cfg.seasonLabel, `
<div class="tiles">
${leaderTile('ppg', 'Scoring', 'points per game, 1st in the league')}
${leaderTile('pirpg', 'All-round', 'PIR per game, 1st in the league')}
${leaderTile('rpg', 'Rebounding', 'rebounds per game, 1st in the league')}
${leaderTile('apg', 'Playmaking', 'assists per game, 1st in the league')}
</div>
<div class="row">
<section class="card"><h2>Standings</h2><p class="muted">Top 6 go to the playoffs, 7–10 to the play-in.</p>
<div class="scroll"><table class="standings"><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" class="num">W–L</th><th scope="col" class="num" title="Points scored per 100 possessions">ORtg</th><th scope="col" class="num" title="Points allowed per 100 possessions">DRtg</th><th scope="col" class="num">Net</th></tr></thead>
<tbody>${standingsRows}</tbody></table></div>
<p class="muted small">Ranked by wins, then point difference. Official tiebreakers use head-to-head results.</p>
</section>
<section class="card wide"><h2>Who scores, who defends</h2><p class="muted">Right = better offence. Up = better defence. Dashed lines are the league average.</p>
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
<p class="muted small">${qualNote}</p>`, 'index.html', homeHero);


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
  ? `<td data-v="${esc(p[k])}">${k === 'name' ? `<a href="${playerHref(p.id)}">${esc(p[k])}</a>` : esc(p[k])}</td>`
  : `<td class="num" data-v="${p[k].toFixed(3)}">${k === 'gp' ? p.gp : f1(p[k])}</td>`).join('')}</tr>`).join('');
const teamOptions = teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${esc(t.code)}">${esc(titleCase(t.name))}</option>`).join('');

writePage('players.html', 'Players', `
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
</section>`, 'players.html', cover({ kicker: esc(roundLine), title: 'Players', lede: `${players.length} players have stepped on the court this season. Switch the chart, filter by team, and click any name for the full profile.`, strip: [[qual.length, 'qualified for leaderboards'], [players.length, 'players used']] }));

// Teams page
const tcols = [['name', 'Team', 's'], ['gp', 'GP'], ['w', 'W'], ['l', 'L'], ['ppg', 'PTS'], ['oppg', 'OPP'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net'], ['pace', 'Pace'], ['ts', 'TS%'], ['efg', 'eFG%'], ['tov100', 'TOV/100'], ['orebPct', 'OREB%']];
writePage('teams.html', 'Teams', `
<section class="card"><div class="scroll"><table class="sortable"><thead><tr>${tcols.map(([k, l, t]) => `<th scope="col"${t === 's' ? '' : ' class="num"'}><button type="button" data-key="${k}">${l}</button></th>`).join('')}</tr></thead>
<tbody>${teams.map((t) => `<tr>${tcols.map(([k, , ty]) => ty === 's' ? `<td data-v="${esc(t.name)}"><a href="team-${esc(String(t.code).replace(/[^A-Za-z0-9]/g, ''))}.html">${badge(t.code, t.tv)} ${esc(titleCase(t.name))}</a></td>` : `<td class="num" data-v="${t[k].toFixed(3)}">${['gp', 'w', 'l'].includes(k) ? t[k] : k === 'net' ? signed(t[k]) : f1(t[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`, 'teams.html', cover({ kicker: esc(roundLine), title: 'Teams', lede: 'Every club, every rating. Click a column to sort, or a team for its scouting report.', strip: [[teams.length, 'clubs'], [f1(avg(teams, 'ortg')), 'league ORtg'], [f1(avg(teams, 'pace')), 'possessions per 40 min']] }));

// Scouting page for every team
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
  const roster = players.filter((p) => p.team === t.code).sort((a, b) => b.totalMin - a.totalMin);
  const notes = scoutNotes(t, roster, qa);
  const last5 = list.slice(0, 5).map((g) => (g.win ? 'W' : 'L')).join(' ');
  const form = list.slice(0, 5).reverse().map((g) => `<span class="form ${g.win ? 'w' : 'l'}" title="${g.win ? 'Win' : 'Loss'} ${g.isHome ? 'vs' : 'at'} ${esc(g.opp.tv)} ${g.for}–${g.against}">${g.win ? 'W' : 'L'}</span>`).join('');
  const best = Object.entries(t.ranks).filter(([k]) => ['ortg', 'drtg', 'net', 'efg', 'efgD', 'tov100D', 'orebPct', 'drebPct', 'threePct', 'twoPct'].includes(k)).sort((a, b) => a[1] - b[1])[0];
  const LBL = { ortg: 'offence', drtg: 'defence', net: 'net rating', efg: 'shooting (eFG%)', efgD: 'shooting defence', tov100D: 'forcing turnovers', orebPct: 'offensive rebounding', drebPct: 'defensive rebounding', threePct: '3-point shooting', twoPct: '2-point shooting' };
  const teamHero = cover({
    crumbs: `<a href="teams.html">Teams</a> / Scouting report`,
    kicker: best && best[1] <= 3 ? `${ord(best[1])} in the league in ${LBL[best[0]]}` : `${ord(t.rank)} in the standings`,
    title: esc(titleCase(t.name)),
    meta: `<span>${t.w}–${t.l}</span><span class="sep">/</span><span>${ord(t.rank)} in the standings</span><span class="sep">/</span><span>Home ${t.home} · Away ${t.away}</span><span class="sep">/</span><span class="formrow">${form}</span>`,
    strip: [[f1(t.ortg), `ORtg · ${ord(t.ranks.ortg)}`], [f1(t.drtg), `DRtg · ${ord(t.ranks.drtg)}`], [signed(t.net), `Net · ${ord(t.ranks.net)}`], [f1(t.pace), `Pace · ${ord(t.ranks.pace)}`]],
    side: coverCrest(t.code)
  });
  writePage(teamHref(t.code), titleCase(t.name), `
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
<section class="card"><h2>Rotation</h2><p class="muted">Sorted by total minutes played. Season stats for players whose most recent game was for this team.</p>
<div class="scroll"><table><thead><tr>${['Player', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'TOV', 'PIR', 'USG%', 'TS%', '3PA', '3P%', 'FT%'].map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>
${roster.map((p) => `<tr><td><a href="${playerHref(p.id)}">${esc(p.name)}</a></td><td class="num">${p.gp}</td><td class="num">${p.gs}</td><td class="num">${f1(p.mpg)}</td><td class="num">${f1(p.ppg)}</td><td class="num">${f1(p.rpg)}</td><td class="num">${f1(p.apg)}</td><td class="num">${f1(p.spg)}</td><td class="num">${f1(p.tpg)}</td><td class="num">${f1(p.pirpg)}</td><td class="num">${f1(p.usg)}</td><td class="num">${f1(p.ts)}</td><td class="num">${f1(p.threeApg)}</td><td class="num">${f1(p.threePct)}</td><td class="num">${f1(p.ftPct)}</td></tr>`).join('')}
</tbody></table></div></section>
<section class="card"><h2>Results</h2>
<div class="scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Rd</th><th scope="col"></th><th scope="col">Opponent</th><th scope="col">Result</th></tr></thead><tbody>
${list.map((g) => `<tr><td>${esc(g.date)}</td><td class="num">${g.round}</td><td class="muted">${g.isHome ? 'vs' : 'at'}</td><td><a href="${teamHref(g.opp.code)}">${badge(g.opp.code, g.opp.tv)} ${esc(titleCase(g.opp.name))}</a></td><td class="${g.win ? 'pos' : 'neg'}">${g.win ? 'W' : 'L'} ${g.for}–${g.against}</td></tr>`).join('')}
</tbody></table></div></section>`, 'teams.html', teamHero);
}

// ---- Player pages ----
{
  const matched = players.filter((p) => findPerson(peopleIndex, p)).length;
  console.log(`Player details matched for ${matched} of ${players.length} players`);
  const missing = players.filter((p) => !findPerson(peopleIndex, p)).slice(0, 10).map((p) => `${p.name} (${p.id})`);
  if (missing.length && peopleIndex.byId.size) console.log('  No details for: ' + missing.join(', ') + (players.length - matched > 10 ? ', …' : ''));
}
const logs = playerGameLogs(games);
const today = new Date().toISOString().slice(0, 10);
const pct = (m, a) => (a > 0 ? f1(100 * m / a) : '–');
const per = (v, gp) => f1(gp ? v / gp : 0);
const RANK_KEYS = [['ppg', 'Points'], ['rpg', 'Rebounds'], ['apg', 'Assists'], ['spg', 'Steals'], ['bpg', 'Blocks'], ['pirpg', 'PIR'], ['pra', 'PRA'], ['ts', 'TS%'], ['usg', 'Usage']];
const qualRank = {};
for (const [k] of RANK_KEYS) {
  const sorted = [...qual].sort((a, b) => b[k] - a[k]);
  sorted.forEach((p, i) => { (qualRank[p.id] ||= {})[k] = i + 1; });
}

function boxCells(s, gp, perGame) {
  const v = (x) => (perGame ? per(x, gp) : String(x));
  return [v(s.pts), v(s.fgm2), v(s.fga2), pct(s.fgm2, s.fga2), v(s.fgm3), v(s.fga3), pct(s.fgm3, s.fga3), v(s.ftm), v(s.fta), pct(s.ftm, s.fta),
    v(s.oreb), v(s.dreb), v(s.reb), v(s.ast), v(s.stl), v(s.tov), v(s.blk), v(s.blka), v(s.pf), v(s.fd), v(s.pir)];
}
const BOX_HEAD = ['PTS', '2PM', '2PA', '2P%', '3PM', '3PA', '3P%', 'FTM', 'FTA', 'FT%', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'TOV', 'BLK', 'BLKA', 'PF', 'FD', 'PIR'];
const th = (h) => `<th scope="col" class="num">${h}</th>`;

const posOf = new Map(players.map((q) => [q.id, findPerson(peopleIndex, q)?.position || null]));
for (const p of players) {
  const person = findPerson(peopleIndex, p);
  const log = logs.get(p.id) || [];
  const s = p.totals, gp = p.gp;
  const age = person ? ageOn(person.birthDate, today) : null;
  const teamT = teams.find((t) => t.code === p.team);
  const fga = s.fga2 + s.fga3, fgm = s.fgm2 + s.fgm3;
  const per40 = (x) => f1(p.totalMin ? 40 * x / p.totalMin : 0);
  const high = (key, label) => {
    const best = [...log].sort((a, b) => b.line[key] - a.line[key])[0];
    return best ? `<div><dt>${label}</dt><dd>${best.line[key]}</dd><span class="muted small">${best.isHome ? 'vs' : 'at'} ${esc(best.opp.tv)}, ${esc(best.date)}</span></div>` : '';
  };
  const bio = [
    ['Team', teamT ? `<a href="${teamHref(p.team)}">${badge(p.team, p.tv)}${esc(titleCase(teamT.name))}</a>` : esc(p.tv)],
    ['Number', esc(person?.dorsal || p.number || '–')],
    ['Position', esc(person?.position || '–')],
    ['Age', age != null ? `${age} <span class="muted">(born ${esc(fmtDate(person.birthDate))})</span>` : '–'],
    ['Height', person?.height ? `${person.height} cm` : '–'],
    ['Weight', person?.weight ? `${person.weight} kg` : '–'],
    ['Nationality', esc(person?.country || '–') + (person?.birthCountry && person.birthCountry !== person.country ? ` <span class="muted">(born in ${esc(person.birthCountry)})</span>` : '')]
  ];
  const ranks = qualRank[p.id];

  // ---- infographic sections ----
  const position = person?.position || null;
  const peersAll = position ? qual.filter((q) => (posOf.get(q.id) || null) === position) : [];
  const peers = peersAll.length >= 10 ? peersAll : qual;
  const peerLabel = peersAll.length >= 10 ? `${position.toLowerCase()}s` : 'players';
  const isQual = qual.some((q) => q.id === p.id);
  const r = qualRank[p.id] || {};
  const LBLS = { ppg: 'points', rpg: 'rebounds', apg: 'assists', spg: 'steals', bpg: 'blocks', pirpg: 'PIR', pra: 'PRA', ts: 'true shooting' };
  const tops = Object.entries(r).filter(([k, v]) => LBLS[k] && v <= 10).sort((a, b) => a[1] - b[1]);
  const firsts = tops.filter(([, v]) => v === 1).map(([k]) => LBLS[k]);
  const kicker = firsts.length ? `1st in the league in ${firsts.slice(0, 2).join(' and ')}`
    : tops.length ? `${ord(tops[0][1])} in the league in ${LBLS[tops[0][0]]}`
    : esc([position, p.tv].filter(Boolean).join(' · '));
  const wonWith = log.filter((g) => g.win).length;
  const ledeParts = [`Averages <strong>${f1(p.ppg)} points</strong>, ${f1(p.rpg)} rebounds and ${f1(p.apg)} assists in ${f1(p.mpg)} minutes, at ${f1(p.ts)}% true shooting.`,
    `His team is ${wonWith}–${log.length - wonWith} in the games he played.`];
  if (tops.length > 1) ledeParts.push(`Top 10 in the league in ${tops.slice(0, 3).map(([k, v]) => `${LBLS[k]} (${ord(v)})`).join(', ')}.`);
  const num = person?.dorsal || p.number;
  const hero = cover({
    crumbs: `<a href="players.html">Players</a> / <a href="${teamHref(p.team)}">${esc(p.tv)}</a>`,
    kicker, title: esc(p.name),
    meta: `${crests.has(p.team) ? `<img class="crest" src="${esc(crests.get(p.team))}" alt="">` : ''}<span>${esc(teamT ? titleCase(teamT.name) : p.tv)}</span>${position ? `<span class="sep">/</span><span>${esc(position)}</span>` : ''}${age != null ? `<span class="sep">/</span><span>${age} years</span>` : ''}${person?.height ? `<span class="sep">/</span><span>${person.height} cm</span>` : ''}${person?.country ? `<span class="sep">/</span><span>${esc(person.country)}</span>` : ''}`,
    lede: ledeParts.join(' '),
    side: num ? `<div class="side jersey" aria-hidden="true">${esc(String(num).replace(/^0+(?=\d)/, ''))}</div>` : coverCrest(p.team)
  });

  const chip = (k) => !isQual ? '<span class="chip">Not enough minutes yet</span>'
    : `<span class="chip ${r[k] <= 3 ? 'hot' : r[k] <= 20 ? 'warm' : ''}">${ord(r[k])} in the league</span>`;
  const fourth = [['rpg', 'Rebounding', 'rebounds per game'], ['apg', 'Playmaking', 'assists per game'], ['stocks', 'Defence', 'steals + blocks per game']]
    .map((x) => ({ x, rank: isQual ? (qualRank[p.id]?.[x[0]] ?? [...qual].sort((a, b) => b[x[0]] - a[x[0]]).findIndex((q) => q.id === p.id) + 1) : 0 }))
    .sort((a, b) => a.rank - b.rank)[0].x;
  if (isQual && r[fourth[0]] == null) r[fourth[0]] = [...qual].sort((a, b) => b[fourth[0]] - a[fourth[0]]).findIndex((q) => q.id === p.id) + 1;
  const tiles = `<div class="tiles">
<div class="tile"><span class="label">Scoring</span><span class="big">${f1(p.ppg)}</span><span class="sub">points per game</span>${chip('ppg')}</div>
<div class="tile"><span class="label">All-round</span><span class="big">${f1(p.pirpg)}</span><span class="sub">PIR per game</span>${chip('pirpg')}</div>
<div class="tile"><span class="label">Efficiency</span><span class="big">${f1(p.ts)}</span><span class="sub">true shooting %</span>${chip('ts')}</div>
<div class="tile"><span class="label">${fourth[1]}</span><span class="big">${f1(p[fourth[0]])}</span><span class="sub">${fourth[2]}</span>${chip(fourth[0])}</div>
</div>`;

  // Game by game: last 10 games, oldest left
  const recent = log.slice(0, 10).reverse();
  let gbg = '';
  if (recent.length) {
    const W = 640, H = 250, top = 34, base = 180, max = Math.max(10, ...recent.map((g) => g.line.pts));
    const slot = W / recent.length, bw = Math.min(56, slot * 0.62);
    const bars = recent.map((g, i) => {
      const l = g.line, h = Math.max(3, (l.pts / max) * (base - top)), x = i * slot + (slot - bw) / 2;
      const fgm = l.fgm2 + l.fgm3, fga = l.fga2 + l.fga3;
      return `<g><title>${esc(g.date)} ${g.isHome ? 'vs' : 'at'} ${esc(g.opp.tv)}: ${l.pts} points, ${fgm}/${fga} FG, ${g.win ? 'win' : 'loss'} ${g.for}–${g.against}</title>
<rect class="${g.win ? 'b-win' : 'b-loss'}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>
<text class="v" x="${(x + bw / 2).toFixed(1)}" y="${(base - h - 8).toFixed(1)}" text-anchor="middle">${l.pts}</text>
<text class="o" x="${(x + bw / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle">${esc(g.opp.tv)}</text>
<text class="f" x="${(x + bw / 2).toFixed(1)}" y="${base + 35}" text-anchor="middle">${fgm}/${fga} FG</text>
<text class="f" x="${(x + bw / 2).toFixed(1)}" y="${base + 49}" text-anchor="middle">${g.win ? 'Win' : 'Loss'}</text></g>`;
    }).join('');
    const last3 = log.slice(0, 3);
    const l3pts = last3.reduce((a, g) => a + g.line.pts, 0) / (last3.length || 1);
    const l3m = last3.reduce((a, g) => a + g.line.fgm2 + g.line.fgm3, 0), l3a = last3.reduce((a, g) => a + g.line.fga2 + g.line.fga3, 0);
    const l3w = last3.filter((g) => g.win).length;
    gbg = `<section class="card gbg"><h2>Game by game</h2><p class="muted">Points in his last ${recent.length} games. Last ${last3.length}: ${f1(l3pts)} a night on ${l3a ? f1(100 * l3m / l3a) : '–'}% shooting, ${l3w} win${l3w === 1 ? '' : 's'}. Red = win.</p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per game, last ${recent.length} games">${bars}<line class="base" x1="0" x2="${W}" y1="${base}" y2="${base}"/></svg></section>`;
  }

  // Percentiles against players at the same position
  const PCT = [['ppg', 'Points'], ['rpg', 'Rebounds'], ['apg', 'Assists'], ['stocks', 'Stocks'], ['pirpg', 'PIR'], ['ts', 'TS%'], ['threePct', '3P%', (q) => q.totals.fga3 >= 15], ['usg', 'Usage'], ['tpg', 'Ball security', null, true]];
  const pctl = PCT.map(([k, label, filt, low]) => {
    const pool = peers.filter(filt || (() => true));
    if (!pool.some((q) => q.id === p.id) && !(isQual === false && (!filt || filt(p)))) return '';
    const vals = [...pool.filter((q) => q.id !== p.id).map((q) => q[k])];
    if (!vals.length) return '';
    const below = vals.filter((v) => (low ? v > p[k] : v < p[k])).length;
    const pc = Math.round(100 * below / vals.length);
    return `<div class="p"><span>${label}</span><span class="track" role="img" aria-label="${label}: better than ${pc}% of ${peerLabel}"><span class="fill" style="width:${Math.max(3, pc)}%"></span></span><span>${pc}<small>${f1(p[k])}</small></span></div>`;
  }).join('');
  const pctlCard = pctl ? `<section class="card"><h2>Profile vs ${esc(peerLabel)}</h2><p class="muted">Percentile: better than this share of ${peers.length} qualified ${esc(peerLabel)}. The line marks the middle.${isQual ? '' : ' He has not played enough minutes to qualify yet.'}</p><div class="pctl">${pctl}</div></section>` : '';

  // How he stacks up against the best at his position
  const SC = [['ppg', 'PPG'], ['rpg', 'RPG'], ['apg', 'APG'], ['pirpg', 'PIR'], ['ts', 'TS%'], ['usg', 'USG%']];
  const stackList = [...peers].sort((a, b) => b.pirpg - a.pirpg).slice(0, 5);
  if (!stackList.some((q) => q.id === p.id)) stackList.push(p);
  const bestIn = Object.fromEntries(SC.map(([k]) => [k, Math.max(...stackList.map((q) => q[k]))]));
  const stack = `<section class="card"><h2>How he stacks up</h2><p class="muted">The top 5 ${esc(peerLabel)} by PIR${stackList.length > 5 ? `, plus ${esc(p.name)}` : ''}. Red marks the best in each column.</p>
<div class="scroll"><table><thead><tr><th scope="col">Player</th>${SC.map(([, l]) => `<th scope="col" class="num">${l}</th>`).join('')}</tr></thead><tbody>
${stackList.map((q) => `<tr${q.id === p.id ? ' class="me"' : ''}><td><a href="${playerHref(q.id)}">${badge(q.team, q.tv)}${esc(q.name)}</a></td>${SC.map(([k]) => `<td class="num">${q[k] === bestIn[k] ? `<span class="best">${f1(q[k])}</span>` : f1(q[k])}</td>`).join('')}</tr>`).join('')}
</tbody></table></div></section>`;

  writePage(`player-${safe(p.id)}.html`, p.name, `
${tiles}
<div class="row">${gbg}${pctlCard}</div>
${stack}
<div class="row">
<section class="card"><h2>Profile</h2><dl class="bio">${bio.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
${person ? '' : '<p class="muted small">Personal details are not available for this player in the EuroLeague roster feed.</p>'}</section>
<section class="card"><h2>League ranks</h2>${ranks ? `<p class="muted">Among ${qual.length} players with enough minutes.</p><div class="kpis">${RANK_KEYS.map(([k, l]) => `<div><span class="muted">${l}</span><strong>${k === 'ts' || k === 'usg' ? f1(p[k]) + '%' : f1(p[k])}</strong>${rankTag(ranks[k], qual.length)}</div>`).join('')}</div>` : `<p class="muted">${esc(qualNote)} This player doesn't qualify yet.</p>`}</section>
</div>
<section class="card"><h2>Season stats</h2>
<div class="scroll"><table><thead><tr><th scope="col"></th>${th('GP')}${th('GS')}${th('MIN')}${BOX_HEAD.map(th).join('')}${th('+/-')}</tr></thead><tbody>
<tr><th scope="row">Per game</th><td class="num">${gp}</td><td class="num">${p.gs}</td><td class="num">${f1(p.mpg)}</td>${boxCells(s, gp, true).map((c) => `<td class="num">${c}</td>`).join('')}<td class="num">${signed(p.pmpg)}</td></tr>
<tr><th scope="row">Totals</th><td class="num">${gp}</td><td class="num">${p.gs}</td><td class="num">${f1(p.totalMin)}</td>${boxCells(s, gp, false).map((c) => `<td class="num">${c}</td>`).join('')}<td class="num">${p.totalPm > 0 ? '+' : ''}${p.totalPm}</td></tr>
<tr><th scope="row">Per 40 min</th><td class="num">–</td><td class="num">–</td><td class="num">40.0</td>${[s.pts, s.fgm2, s.fga2, null, s.fgm3, s.fga3, null, s.ftm, s.fta, null, s.oreb, s.dreb, s.reb, s.ast, s.stl, s.tov, s.blk, s.blka, s.pf, s.fd, s.pir].map((x, i) => `<td class="num">${x === null ? boxCells(s, gp, true)[i] : per40(x)}</td>`).join('')}<td class="num">${per40(p.totalPm)}</td></tr>
</tbody></table></div></section>
<div class="row">
<section class="card"><h2>Shooting and efficiency</h2><dl class="bio">
${[['FG%', pct(fgm, fga) + ` <span class="muted">(${fgm}/${fga})</span>`], ['2P%', pct(s.fgm2, s.fga2) + ` <span class="muted">(${s.fgm2}/${s.fga2})</span>`], ['3P%', pct(s.fgm3, s.fga3) + ` <span class="muted">(${s.fgm3}/${s.fga3})</span>`], ['FT%', pct(s.ftm, s.fta) + ` <span class="muted">(${s.ftm}/${s.fta})</span>`],
    ['True shooting %', f1(p.ts)], ['Effective FG%', f1(p.efg)], ['Usage rate %', f1(p.usg)], ['Share of shots that are threes', pct(s.fga3, fga)], ['Free throws per 100 shots', fga ? f1(100 * s.fta / fga) : '–'],
    ['Assists per turnover', s.tov ? (s.ast / s.tov).toFixed(2) : '–'], ['PRA per game', f1(p.pra)], ['Stocks per game', f1(p.stocks)]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
</dl></section>
<section class="card"><h2>Season highs</h2><dl class="bio highs">${high('pts', 'Points')}${high('reb', 'Rebounds')}${high('ast', 'Assists')}${high('fgm3', 'Threes made')}${high('stl', 'Steals')}${high('blk', 'Blocks')}${high('pir', 'PIR')}</dl></section>
</div>
<section class="card"><h2>Game log</h2>
<div class="scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Rd</th><th scope="col">Opponent</th><th scope="col">Result</th>${['MIN', 'PTS', '2P', '3P', 'FT', 'REB', 'AST', 'STL', 'TOV', 'BLK', 'PF', '+/-', 'PIR'].map(th).join('')}</tr></thead><tbody>
${log.map((g) => { const l = g.line; return `<tr><td>${esc(g.date)}</td><td class="num">${g.round}</td><td><a href="${teamHref(g.opp.code)}"><span class="muted">${g.isHome ? 'vs' : 'at'}&nbsp;</span>${badge(g.opp.code, g.opp.tv)}${esc(g.opp.tv)}</a></td><td class="${g.win ? 'pos' : 'neg'}">${g.win ? 'W' : 'L'} ${g.for}–${g.against}</td>
<td class="num">${mmss(l.min)}${l.starter ? '<span class="muted">*</span>' : ''}</td><td class="num"><strong>${l.pts}</strong></td><td class="num">${l.fgm2}/${l.fga2}</td><td class="num">${l.fgm3}/${l.fga3}</td><td class="num">${l.ftm}/${l.fta}</td><td class="num">${l.reb}</td><td class="num">${l.ast}</td><td class="num">${l.stl}</td><td class="num">${l.tov}</td><td class="num">${l.blk}</td><td class="num">${l.pf}</td><td class="num">${l.pm > 0 ? '+' : ''}${l.pm}</td><td class="num">${l.pir}</td></tr>`; }).join('')}
</tbody></table></div><p class="muted small">* started the game.</p></section>`, 'players.html', hero);
}

// Method page
writePage('method.html', 'How we calculate', `

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
</section>`, 'method.html', cover({ kicker: 'Methodology', title: 'How we calculate', lede: 'Every number on this site comes from the official EuroLeague box scores. Nothing is typed in by hand, and every game is checked before it is published.' }));


// ---- Matchup (head-to-head) ----
{
  const METRICS = [['ortg', 'Offensive rating', true, 'points per 100'], ['drtg', 'Defensive rating', false, 'allowed per 100'], ['net', 'Net rating', true], ['pace', 'Pace', null, 'possessions per 40'],
    ['efg', 'Effective FG%', true], ['efgD', 'Opponent eFG%', false], ['threeRate', 'Share of shots from three', null], ['threePct', '3P%', true], ['threePctD', 'Opponent 3P%', false],
    ['tov100', 'Turnovers per 100', false], ['tov100D', 'Forced turnovers per 100', true], ['orebPct', 'Offensive rebound %', true], ['drebPct', 'Defensive rebound %', true],
    ['ftr', 'Free throws per 100 shots', true], ['ftrD', 'Opponent FT per 100 shots', false], ['astRate', 'Assisted baskets %', true]];
  const data = {
    defaultA: teams.some((t) => t.code === 'HTA') ? 'HTA' : teams[0]?.code,
    defaultB: teams.find((t) => t.code !== 'HTA')?.code,
    metrics: METRICS,
    teams: teams.map((t) => {
      const list = teamGames(games, t.code);
      return {
        code: t.code, tv: t.tv, name: titleCase(t.name), crest: crests.get(t.code) || null, href: teamHref(t.code),
        w: t.w, l: t.l, rank: t.rank, form: list.slice(0, 5).map((g) => (g.win ? 'W' : 'L')).join(' '),
        ...Object.fromEntries(METRICS.map(([k]) => [k, +t[k].toFixed(2)])), ranks: t.ranks,
        players: players.filter((p) => p.team === t.code).sort((a, b) => b.totalMin - a.totalMin).slice(0, 7)
          .map((p) => ({ name: p.name, href: playerHref(p.id), mpg: +p.mpg.toFixed(1), ppg: +p.ppg.toFixed(1), rpg: +p.rpg.toFixed(1), apg: +p.apg.toFixed(1), pir: +p.pirpg.toFixed(1) }))
      };
    }),
    games: games.map((g) => ({ h: g.home.code, v: g.away.code, hs: g.home.score, vs: g.away.score, date: g.date, round: g.round }))
  };
  writeFileSync(join(OUT, 'matchup.json'), JSON.stringify(data));
  writePage('matchup.html', 'Matchup', `<div id="matchup-app"><p class="muted">Loading…</p></div>`, 'matchup.html',
    cover({ kicker: esc(roundLine), title: 'Matchup', lede: 'Put any two teams side by side: ratings, four factors, this season’s meetings, key players, and where the mismatches are.' }),
    { scripts: `<script src="matchup.js?v=${assetVersion()}" defer></script>` });
}

// ---- HAPOEL – INTERNAL (password-protected, encrypted in the browser) ----
{
  const IC = cfg.internal || {};
  const encFiles = existsSync('internal') ? readdirSync('internal').filter((f) => /^[a-z0-9][a-z0-9-]{0,80}\.enc$/.test(f)).sort() : [];
  mkdirSync(join(OUT, 'internal'), { recursive: true });
  for (const f of encFiles) {
    const text = readFileSync(join('internal', f), 'utf8');
    try { const o = JSON.parse(text); if (o.v !== 1 || !o.iv || !o.ct) throw new Error('not an encrypted document'); }
    catch (e) { console.warn(`Skipping internal/${f}: ${e.message}`); continue; }
    writeFileSync(join(OUT, 'internal', f), text);
  }
  const published = encFiles.filter((f) => existsSync(join(OUT, 'internal', f)));
  writeFileSync(join(OUT, 'internal', 'index.json'), JSON.stringify(published));
  // Warn loudly if anything that is not an encrypted document was put in the folder.
  if (existsSync('internal')) for (const f of readdirSync('internal')) {
    if (f !== 'README.md' && !f.endsWith('.enc')) console.warn(`WARNING: internal/${f} is not an encrypted .enc file. It is NOT published, but it IS visible in the public GitHub repository. Delete it there.`);
  }
  const clientCfg = JSON.stringify({ salt: IC.salt, iterations: IC.iterations, uploadUrl: IC.repoUploadUrl, categories: IC.categories, teams: teams.map((t) => titleCase(t.name)).sort() }).replace(/</g, '\\u003c');
  const extra = {
    head: '<meta name="robots" content="noindex, nofollow">',
    scripts: `<script>window.HTA_INTERNAL = ${clientCfg};</script>\n<script src="internal.js?v=${assetVersion()}" defer></script>`
  };
  const internalCover = (lede) => cover({ kicker: 'Staff only', title: esc(IC.title || 'Internal'), lede });
  writePage('internal.html', IC.title || 'Internal', `<div id="internal-app" data-mode="vault"><p class="muted">Loading…</p></div>
<noscript><p>The internal section needs JavaScript.</p></noscript>`, 'internal.html',
    internalCover('Strategy, scouting reports and game plans for the Hapoel staff. Every document is locked with the team password and opened only on your device.'), extra);
  writePage('internal-upload.html', 'Add internal document', `<div id="internal-app" data-mode="upload"><p class="muted">Loading…</p></div>`, 'internal.html',
    internalCover('Add a document. It is locked here in your browser before it goes anywhere.'), extra);
  console.log(`✓ Internal section: ${published.length} encrypted document(s)`);
}

// Static files + data for the browser
mkdirSync(OUT, { recursive: true });
copyFileSync('static/style.css', join(OUT, 'style.css'));
copyFileSync('static/app.js', join(OUT, 'app.js'));
copyFileSync('static/internal.js', join(OUT, 'internal.js'));
copyFileSync('static/matchup.js', join(OUT, 'matchup.js'));
writeFileSync(join(OUT, 'players.json'), JSON.stringify(players.map((p) => ({
  id: p.id, name: p.name, team: teamName.get(p.team) ? titleCase(teamName.get(p.team)) : p.team, tv: p.tv, gp: p.gp,
  stats: [['PTS', p.ppg], ['REB', p.rpg], ['AST', p.apg], ['STL', p.spg], ['BLK', p.bpg], ['PIR', p.pirpg], ['MIN', p.mpg], ['TS%', p.ts], ['USG%', p.usg]].map(([k, v]) => [k, f1(v)])
}))));
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`✓ Site written to ${OUT}/ (${teams.length} teams, ${players.length} players)`);

function writePage(file, title, body, active, hero, extra = {}) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), page({ title, cfg, info, active, sample, body, hero, ...extra }));
}
