// HAPOEL home page (site/index.html): everything about Hapoel Tel Aviv in one place, EuroLeague + Winner League.
// Runs after the league builds. Reads the same official data the league sections are built from, so every number
// matches the league pages; league ranks and averages are computed against each competition.
//
//   node scripts/build-hapoel.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGame } from '../lib/parse.mjs';
import { validateGame } from '../lib/validate.mjs';
import { teamTable, playerTable, qualified, teamGames, quarterAverages, possessions } from '../lib/stats.mjs';
import { esc, f1, signed, page, fmtDate, assetVersion } from '../lib/render.mjs';
import { buildStints, checkStints, aggregate, rapm, repairPlusMinus } from '../lib/pbp.mjs';
import { playerRates } from '../lib/advanced.mjs';
import { playLog, offensiveFouls } from '../lib/game.mjs';
import { indexPeople, findPerson, ageOn } from '../lib/people.mjs';

const base = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const OUT = 'site';
const cfg = { ...base, LEAGUE: 'hub', root: '', HOME: 'index.html', elLogo: base.leagueLogo, seasonLabel: 'Hapoel Tel Aviv 2026–27', sourceText: 'the official EuroLeague and Winner League box scores' };
const safe = (s) => String(s).replace(/[^A-Za-z0-9]/g, '');
const TK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'tov', 'blk', 'blka', 'pf', 'fd', 'pir'];
const KEEP_UPPER = new Set(['LDLC', 'ASVEL', 'AKTOR', 'BC', 'FC', 'KK', 'BK', 'AS', 'EA7', 'CSKA', 'PAOK', 'AEK', 'UNICS', 'ALBA', 'TSU']);
const titleCase = (s) => String(s || '').split(/\s+/).map((w) => (KEEP_UPPER.has(w) || w.length <= 2 || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
const ord = (n) => { const t = n % 100 >= 11 && n % 100 <= 13; return n + (t ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); };
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

// ---- The two competitions Hapoel plays in ----
const IL = base.leagues?.il || {};
const COMPS = [
  { key: 'el', short: 'EuroLeague', name: 'EuroLeague', dir: join('data', 'raw', base.seasonCode), pfx: '', home: 'euroleague.html', logo: base.leagueLogo, code: base.hapoelCode || 'HTA' },
  { key: 'il', short: 'Winner League', name: IL.leagueName || 'Winner League', dir: join('data', 'raw', IL.dataDir || 'ISR2027'), pfx: 'il/', home: 'il/index.html', logo: IL.leagueLogo || '', code: null }
].filter((c) => existsSync(c.dir));

for (const C of COMPS) {
  const files = readdirSync(C.dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  C.raw = new Map();
  C.games = files.map((f) => { const raw = JSON.parse(readFileSync(join(C.dir, f))); const g = parseGame(raw); C.raw.set(g.gameCode, raw.pbp || null); return g; }).filter((g) => !validateGame(g).length);
  C.crests = new Map();
  try { for (const c of JSON.parse(readFileSync(join(C.dir, '_clubs.json')))) if (c.code && /^https:\/\//.test(c.crest || '')) C.crests.set(c.code, c.crest); } catch { /* no crests */ }
  try { C.clubs = JSON.parse(readFileSync(join(C.dir, '_clubs.json'))); } catch { C.clubs = []; }
  try { C.schedule = JSON.parse(readFileSync(join(C.dir, '_schedule.json'))); } catch { C.schedule = []; }
  try { C.people = indexPeople(JSON.parse(readFileSync(join(C.dir, '_people.json')))); } catch { C.people = indexPeople([]); }
  if (!C.code) C.code = C.clubs.find((c) => /hapoel/i.test(c.name || '') && /tel[ -]?aviv/i.test(c.name || ''))?.code
    || C.games.flatMap((g) => [g.home, g.away]).find((s) => /hapoel/i.test(s.name) && /tel[ -]?aviv/i.test(s.name))?.code;
}
const ACTIVE = COMPS.filter((c) => c.code && c.games.some((g) => g.home.code === c.code || g.away.code === c.code));
if (!ACTIVE.length) { console.error('No Hapoel games found.'); process.exit(0); }

// ---- Per competition: league context (ranks, averages, play-by-play, boards) ----
const isMine = (C, g) => g.home.code === C.code || g.away.code === C.code;
for (const C of ACTIVE) {
  C.teams = teamTable(C.games);
  C.team = C.teams.find((t) => t.code === C.code);
  C.players = playerTable(C.games);
  C.qual = qualified(C.players, C.teams, base);
  C.rates = playerRates(C.games);
  C.pbpOk = [];
  for (const g of C.games) {
    const pbp = C.raw.get(g.gameCode); if (!pbp) continue;
    const r = buildStints(g, pbp); if (!r.ok) continue;
    repairPlusMinus(g, r.stints);
    if (!checkStints(g, r.stints)) C.pbpOk.push({ game: g, stints: r.stints });
  }
  C.PBP = C.pbpOk.length ? aggregate(C.pbpOk) : null;
  C.IMPACT = C.PBP ? rapm(C.PBP.rows) : null;
  C.OFP = new Map();
  for (const g of C.games) { const pbp = C.raw.get(g.gameCode); if (!pbp) continue; for (const [id, n] of offensiveFouls(playLog(g, pbp).plays).drawers) C.OFP.set(id, (C.OFP.get(id) || 0) + n); }
  C.mine = C.games.filter((g) => isMine(C, g)).sort((a, b) => a.date.localeCompare(b.date) || String(a.gameCode).localeCompare(String(b.gameCode)));
  C.roster = C.players.filter((p) => C.mine.some((g) => (g.home.code === C.code ? g.home : g.away).players.some((x) => x.id === p.id && x.min > 0)));
  C.lg = (k) => C.teams.reduce((s, t) => s + t[k], 0) / (C.teams.length || 1);
  C.onoff = (id) => {
    const o = C.PBP?.onoff.get(id); if (!o) return null;
    const off = { poss: o.teamTot.poss - o.on.poss, pf: o.teamTot.pf - o.on.pf, pa: o.teamTot.pa - o.on.pa };
    const net = (x) => (x.poss > 0 ? 100 * (x.pf - x.pa) / x.poss : null);
    return { onMin: o.on.secs / 60, onPoss: o.on.poss, onNet: net(o.on), offNet: net(off), swing: net(o.on) != null && net(off) != null && off.poss >= 20 ? net(o.on) - net(off) : null,
      onDrtg: o.on.poss >= 300 ? 100 * o.on.pa / o.on.poss : null, defSwing: o.on.poss >= 300 && off.poss >= 50 ? 100 * off.pa / off.poss - 100 * o.on.pa / o.on.poss : null };
  };
}

// ---- Games: every Hapoel game, both competitions, with full box scores ----
const gameRows = [];
for (const C of ACTIVE) for (const g of C.mine) {
  const home = g.home.code === C.code, me = home ? g.home : g.away, op = home ? g.away : g.home;
  const line = (p) => [p.name, p.id, p.starter ? 1 : 0, r2(p.min), p.pm, ...TK.map((k) => p[k])];
  gameRows.push({ c: C.key, id: String(g.gameCode), d: g.date, r: g.round, h: home ? 1 : 0, w: me.score > op.score ? 1 : 0,
    opp: [titleCase(op.name), C.crests.get(op.code) || null, op.tv], s: [me.score, op.score],
    q: [me.quarters || [], op.quarters || []], href: `${C.pfx}game-${safe(g.gameCode)}.html`,
    me: { p: me.players.filter((p) => p.min > 0 || p.starter).map(line), t: TK.map((k) => me.totals[k]), min: me.teamMinutes || 200 },
    op: { p: op.players.filter((p) => p.min > 0 || p.starter).map(line), t: TK.map((k) => op.totals[k]), min: op.teamMinutes || 200 } });
}
gameRows.sort((a, b) => b.d.localeCompare(a.d));

// One identity per Hapoel player across both competitions (same person, two league ids).
const people = new Map(); // key -> { name, ids:Set, href:{comp:href} }
const keyOf = new Map();
for (const C of ACTIVE) for (const p of C.roster) {
  const k = normName(p.name);
  if (!people.has(k)) people.set(k, { key: k, name: p.name, ids: new Set(), href: {} });
  const e = people.get(k); e.ids.add(p.id); e.href[C.key] = `${C.pfx}player-${safe(p.id)}.html`; keyOf.set(C.key + '|' + p.id, k);
}
for (const G of gameRows) for (const row of G.me.p) row[1] = keyOf.get(G.c + '|' + row[1]) || row[1];

// ---- Lineups: Hapoel's five on the court, every stint, from games whose play-by-play matches the box score ----
const stintRows = [];
for (const C of ACTIVE) for (const { game, stints } of C.pbpOk) {
  if (!isMine(C, game)) continue;
  const home = game.home.code === C.code, op = home ? game.away.code : game.home.code;
  for (const s of stints) {
    const ids = (home ? s.home : s.away).map((id) => keyOf.get(C.key + '|' + id) || id);
    const pMe = home ? s.possH : s.possA, pOp = home ? s.possA : s.possH;
    stintRows.push([String(game.gameCode), C.key, ids.join('|'), Math.round(s.secs), s.pts[C.code], s.pts[op], r2(pMe), r2(pOp)]);
  }
}
const lineupGames = new Set(stintRows.map((r) => r[1] + '|' + r[0]));

// ---- Team stats: per competition (with league rank and average) and both competitions together ----
// Shooting made/attempted per game (team and opponents) and points per possession, ranked like the rest.
const EXTRA = [['fgm2', 1], ['fga2', 1], ['fgm3', 1], ['fga3', 1], ['ftm', 1], ['fta', 1]];
function augment(t) {
  if (!t?.raw || !t.gp) return t;
  for (const [k] of EXTRA) { t[k + 'pg'] = t.raw.tot[k] / t.gp; t['o' + k + 'pg'] = t.raw.opp[k] / t.gp; }
  t.ppp = t.raw.poss ? t.raw.pf / t.raw.poss : null; t.oppp = t.raw.poss ? t.raw.pa / t.raw.poss : null;
  return t;
}
const EXTRA_DIR = { ppp: true, oppp: false, ...Object.fromEntries(EXTRA.flatMap(([k]) => [[k + 'pg', true], ['o' + k + 'pg', false]])) };
for (const C of ACTIVE) {
  C.teams.forEach(augment);
  for (const [k, better] of Object.entries(EXTRA_DIR)) {
    if (better == null) continue;
    const sorted = [...C.teams].filter((t) => t[k] != null).sort((a, b) => (better ? b[k] - a[k] : a[k] - b[k]));
    sorted.forEach((t, i) => { t.ranks ||= {}; t.ranks[k] = i + 1; });
  }
}
const STATS = [
  ['Record', null, (t) => `${t.w}–${t.l}`],
  ['Points', 'ppg'], ['Points allowed', 'oppg'], ['Offensive rating', 'ortg'], ['Defensive rating', 'drtg'], ['Net rating', 'net', null, true], ['Pace', 'pace'], ['Points per possession (PPP)', 'ppp', (t) => (t.ppp == null ? '–' : t.ppp.toFixed(3))], ['Opp points per possession', 'oppp', (t) => (t.oppp == null ? '–' : t.oppp.toFixed(3))],
  ['2-pointers made', 'fgm2pg'], ['2-pointers attempted', 'fga2pg'], ['3-pointers made', 'fgm3pg'], ['3-pointers attempted', 'fga3pg'], ['Free throws made', 'ftmpg'], ['Free throws attempted', 'ftapg'],
  ['Opp 2-pointers made', 'ofgm2pg'], ['Opp 2-pointers attempted', 'ofga2pg'], ['Opp 3-pointers made', 'ofgm3pg'], ['Opp 3-pointers attempted', 'ofga3pg'], ['Opp free throws made', 'oftmpg'], ['Opp free throws attempted', 'oftapg'],
  ['eFG%', 'efg'], ['True shooting %', 'ts'], ['Turnovers / 100', 'tov100'], ['Offensive rebound %', 'orebPct'], ['Free-throw rate', 'ftr'],
  ['Opp eFG%', 'efgD'], ['Forced turnovers / 100', 'tov100D'], ['Defensive rebound %', 'drebPct'], ['Opp free-throw rate', 'ftrD'],
  ['2P%', 'twoPct'], ['3P%', 'threePct'], ['3-point rate', 'threeRate'], ['FT%', 'ftPct'], ['Assist rate', 'astRate'],
  ['Opp 2P%', 'twoPctD'], ['Opp 3P%', 'threePctD'], ['Opp 3-point rate', 'threeRateD'],
  ['Rebounds', 'rpg'], ['Assists', 'apg'], ['Steals', 'spg'], ['Blocks', 'bpg']
];
// Both competitions together: Hapoel's games, with the Israeli code mapped to one team.
const allMine = ACTIVE.flatMap((C) => C.mine.map((g) => { const map = (s) => (s.code === C.code ? { ...s, code: 'HAP', tv: 'HTA' } : s); return { ...g, gameCode: C.key + g.gameCode, home: map(g.home), away: map(g.away) }; }));
const tAll = augment(teamTable(allMine).find((t) => t.code === 'HAP'));
const splitRow = (gs) => (gs.length ? augment(teamTable(gs).find((t) => t.code === 'HAP')) : null);
const wins = allMine.filter((g) => (g.home.code === 'HAP' ? g.home.score > g.away.score : g.away.score > g.home.score));
const losses = allMine.filter((g) => !wins.includes(g));
const tW = splitRow(wins), tL = splitRow(losses);
const tH = splitRow(allMine.filter((g) => g.home.code === 'HAP')), tA = splitRow(allMine.filter((g) => g.away.code === 'HAP'));
for (const C of ACTIVE) {
  const won = (g) => (g.home.code === C.code ? g.home.score > g.away.score : g.away.score > g.home.score);
  const one = (gs) => (gs.length ? augment(teamTable(gs).find((t) => t.code === C.code)) || null : null);
  C.split = { w: one(C.mine.filter(won)), l: one(C.mine.filter((g) => !won(g))), h: one(C.mine.filter((g) => g.home.code === C.code)), a: one(C.mine.filter((g) => g.away.code === C.code)) };
}
const fmtV = (t, k, fmt) => (!t ? '–' : fmt ? fmt(t) : k === 'net' ? signed(t[k]) : f1(t[k]));
const rk = (C, k) => (C.team?.ranks?.[k] ? `<span class="rank ${C.team.ranks[k] <= 3 ? 'top' : C.team.ranks[k] > C.teams.length - 3 ? 'bottom' : ''}">${ord(C.team.ranks[k])}</span>` : '');
const teamStatsTable = `<div class="scroll"><table class="hap-stats"><thead><tr><th scope="col">Stat</th><th scope="col" class="num" data-comp-col="all">All</th>
${ACTIVE.map((C) => `<th scope="col" class="num" data-comp-col="${C.key}">${esc(C.short)}</th><th scope="col" class="num muted" data-comp-col="${C.key}">${esc(C.short)} avg</th>${[['w', 'Wins'], ['l', 'Losses'], ['h', 'Home'], ['a', 'Away']].map(([k, l]) => `<th scope="col" class="num" data-comp-col="${C.key}">${l}${C.split[k] ? ` <span class="muted small">${C.split[k].w}–${C.split[k].l}</span>` : ''}</th>`).join('')}`).join('')}
<th scope="col" class="num" data-comp-col="all">Wins</th><th scope="col" class="num" data-comp-col="all">Losses</th><th scope="col" class="num" data-comp-col="all">Home</th><th scope="col" class="num" data-comp-col="all">Away</th></tr></thead><tbody>
${STATS.map(([label, k, fmt]) => `<tr><th scope="row">${label}</th><td class="num" data-comp-col="all"><strong>${fmtV(tAll, k, fmt)}</strong></td>
${ACTIVE.map((C) => `<td class="num" data-comp-col="${C.key}">${fmtV(C.team, k, fmt)} ${k ? rk(C, k) : ''}</td><td class="num muted" data-comp-col="${C.key}">${k ? (/ppp$/.test(k) ? C.lg(k).toFixed(3) : f1(C.lg(k))) : ''}</td>${['w', 'l', 'h', 'a'].map((x) => `<td class="num" data-comp-col="${C.key}">${fmtV(C.split[x], k, fmt)}</td>`).join('')}`).join('')}
<td class="num" data-comp-col="all">${fmtV(tW, k, fmt)}</td><td class="num" data-comp-col="all">${fmtV(tL, k, fmt)}</td><td class="num" data-comp-col="all">${fmtV(tH, k, fmt)}</td><td class="num" data-comp-col="all">${fmtV(tA, k, fmt)}</td></tr>`).join('')}
</tbody></table></div>
<p class="muted small">Per game; ratings are points per 100 possessions. Rank = place in that league (1st = best); avg = league average. Wins, losses, home and away are within the competition chosen above ("All competitions" combines both).</p>`;
const quarterTable = (() => {
  const rows = ACTIVE.map((C) => { const q = quarterAverages(teamGames(C.games, C.code)); return q ? `<tr><th scope="row">${esc(C.short)}</th>${q.map((x) => `<td class="num">${f1(x.for)}–${f1(x.against)} <small class="${x.margin >= 0 ? 'pos' : 'neg'}">${signed(x.margin)}</small></td>`).join('')}</tr>` : ''; }).join('');
  return rows ? `<div class="scroll"><table><thead><tr><th scope="col"></th><th scope="col" class="num">Q1</th><th scope="col" class="num">Q2</th><th scope="col" class="num">Q3</th><th scope="col" class="num">Q4</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
})();

// ---- Leaderboards: every home-page board, Hapoel players only, with their rank in the league ----
function boardsFor(C) {
  const R = (k) => (p) => C.rates.get(p.id)?.[k] ?? null;
  const defs = [
    ['Points', 'Per game', (p) => p.ppg, 'qual'], ['PIR', 'Performance Index Rating per game', (p) => p.pirpg, 'qual'],
    ['PRA', 'Points + rebounds + assists per game', (p) => p.pra, 'qual'], ['Stocks', 'Steals + blocks per game', (p) => p.stocks, 'qual'],
    ['Rebounds', 'Per game', (p) => p.rpg, 'qual'], ['Assists', 'Per game', (p) => p.apg, 'qual'],
    ['True shooting %', 'Scoring efficiency', (p) => p.ts, 'qual'], ['Usage %', 'Share of possessions used on the court', (p) => p.usg, 'qual'],
    ['PIR per 40', 'Per 40 minutes', R('pir40'), 'qual'], ['Points per 40', 'Per 40 minutes', R('pts40'), 'qual'],
    ['Rebounds per 40', 'Per 40 minutes', R('reb40'), 'qual'], ['Assists per 40', 'Per 40 minutes', R('ast40'), 'qual'],
    ['Steal %', 'Opponent possessions ending in his steal', R('stlPct'), 'qual'], ['Block %', 'Opponent 2-point shots he blocked', R('blkPct'), 'qual'],
    ['Defensive rebound %', 'Available defensive rebounds he grabbed', R('drebPct'), 'qual'], ['Stocks per 40', 'Steals + blocks per 40 minutes', R('stocks40'), 'qual'],
    ['Offensive fouls drawn', 'Charges and other offensive fouls drawn, season total', (p) => C.OFP.get(p.id) || null, 'all', (v) => String(Math.round(v))],
    ['On/off', 'Team net rating per 100 with him on the court minus off it', (p) => C.onoff(p.id)?.swing ?? null, 'all', signed],
    ['Impact (RAPM)', 'Adjusted plus-minus per 100 possessions', (p) => C.IMPACT?.values.get(p.id) ?? null, 'all', signed],
    ['On-court defense', 'Points allowed per 100 with him on the court (lower is better, 300+ possessions)', (p) => C.onoff(p.id)?.onDrtg ?? null, 'all', f1, true],
    ['Defensive on/off', 'Fewer points allowed per 100 with him on than off (300+ possessions)', (p) => C.onoff(p.id)?.defSwing ?? null, 'all', signed]
  ];
  const isQ = new Set(C.qual.map((q) => q.id));
  return defs.map(([title, sub, val, poolKind, fmt = f1, asc = false]) => {
    const pool = poolKind === 'qual' ? C.qual : C.players;
    const ranked = pool.map((p) => ({ p, v: val(p) })).filter((x) => x.v != null && Number.isFinite(x.v)).sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
    const rankOf = new Map(ranked.map((x, i) => [x.p.id, i + 1]));
    const mine = C.roster.map((p) => ({ p, v: val(p) })).filter((x) => x.v != null && Number.isFinite(x.v)).sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
    if (!mine.length) return '';
    const vals = mine.map((x) => x.v), hi = Math.max(...vals), lo = Math.min(...vals);
    const width = (v) => (asc ? (hi === lo ? 100 : 5 + 95 * (hi - v) / (hi - lo)) : hi > 0 ? 100 * Math.max(0, v) / hi : 50);
    return `<section class="card board open"><h2>${title}</h2><p class="muted">${sub}. Ranked within Hapoel.</p><ol>
${mine.map(({ p, v }, i) => `<li><span class="muted num">${ord(i + 1)}</span><div><a href="${C.pfx}player-${safe(p.id)}.html">${esc(p.name)}</a>${poolKind === 'qual' && !isQ.has(p.id) ? ' <span class="muted small">(few minutes)</span>' : ''}<div class="bar"><span style="width:${Math.max(3, width(v)).toFixed(1)}%"></span></div></div><strong class="num">${fmt(v)}</strong></li>`).join('')}
</ol></section>`;
  }).filter(Boolean);
}
// MVP index (same formula as the league home page), Hapoel players with their place in the league race.
function mvpFor(C) {
  const F = [[(p) => p.pirpg, 0.30], [(p) => C.IMPACT?.values.get(p.id) ?? null, 0.20], [(p) => { const t = C.teams.find((x) => x.code === p.team); return t && t.gp ? 100 * t.w / t.gp : null; }, 0.15], [(p) => p.ppg, 0.15], [(p) => p.ts, 0.10], [(p) => C.onoff(p.id)?.swing ?? null, 0.10]];
  const vals = F.map(([get]) => C.qual.map(get));
  const st = vals.map((arr) => { const v = arr.filter((x) => x != null && Number.isFinite(x)); const m = v.reduce((s, x) => s + x, 0) / (v.length || 1); const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) || 1; return { m, sd }; });
  const rows = C.qual.map((p, i) => ({ p, score: F.reduce((s, [, w], j) => { const v = vals[j][i]; return s + (v == null || !Number.isFinite(v) ? 0 : (v - st[j].m) / st[j].sd) * w; }, 0) })).sort((a, b) => b.score - a.score);
  const mine = rows.map((x, i) => ({ ...x, r: i + 1 })).filter((x) => C.roster.some((p) => p.id === x.p.id));
  if (!mine.length) return '';
  return `<section class="card board open"><h2>MVP race</h2><p class="muted">HTA LAB MVP index (PIR 30%, impact 20%, team win % 15%, points 15%, TS% 10%, on/off 10%) — ranked within Hapoel.</p><ol>
${mine.map((x, i) => `<li><span class="muted num">${ord(i + 1)}</span><div><a href="${C.pfx}player-${safe(x.p.id)}.html">${esc(x.p.name)}</a><div class="bar"><span style="width:${Math.max(3, Math.min(100, 50 + 25 * x.score)).toFixed(1)}%"></span></div></div><strong class="num">${x.score.toFixed(2)}</strong></li>`).join('')}
</ol></section>`;
}

// ---- Player details (per competition) for the players table: position, height, age, on/off, impact ----
const today = new Date().toISOString().slice(0, 10);
const extra = {};
for (const C of ACTIVE) for (const p of C.roster) {
  const k = keyOf.get(C.key + '|' + p.id), person = findPerson(C.people, p), oo = C.onoff(p.id), rt = C.rates.get(p.id);
  extra[k] ||= { pos: '', ht: null, age: null, num: '' };
  const e = extra[k];
  e.pos ||= person?.position || ''; e.ht ||= person?.height || null; e.age ??= person ? ageOn(person.birthDate, today) : null; e.num ||= p.number || person?.dorsal || '';
  e[C.key] = { usg: r2(p.usg), swing: r2(oo?.swing ?? null), imp: r2(C.IMPACT?.values.get(p.id) ?? null), onMin: r2(oo?.onMin ?? null), stlPct: r2(rt?.stlPct), blkPct: r2(rt?.blkPct), drebPct: r2(rt?.drebPct), ofd: C.OFP.get(p.id) || 0 };
}

// ---- Schedule: next games and results, both competitions ----
const sched = [];
for (const C of COMPS) {
  const code = C.code; if (!code) continue;
  const played = new Set(C.games.map((g) => String(g.gameCode)));
  for (const x of C.schedule) {
    if (x.h?.code !== code && x.a?.code !== code) continue;
    const home = x.h.code === code, o = home ? x.a : x.h;
    const g = C.games.find((gg) => String(gg.gameCode) === String(x.c));
    const me = g ? (home ? g.home : g.away) : null, op = g ? (home ? g.away : g.home) : null;
    sched.push({ c: C.key, utc: x.utc || null, ok: x.ok !== false, r: x.r, rn: x.rn || '', home, opp: titleCase(o.name || o.code), crest: C.crests.get(o.code) || null, venue: x.venue || '',
      res: me ? [me.score, op.score] : null, href: g ? `${C.pfx}game-${safe(g.gameCode)}.html` : null, played: !!me || played.has(String(x.c)) });
  }
}
sched.sort((a, b) => String(a.utc).localeCompare(String(b.utc)));
const nowISO = new Date().toISOString();
const nextGames = sched.filter((x) => !x.res && String(x.utc) >= nowISO.slice(0, 10)).slice(0, 6);
const compShort = Object.fromEntries(COMPS.map((C) => [C.key, C.short]));
const compBadge = (k) => `<span class="comp-tag comp-${k}">${k === 'el' ? 'EL' : 'IL'}</span>`;
const timeTag = (x) => `<time data-utc="${esc(x.utc || '')}" datetime="${esc(x.utc || '')}">${esc(x.utc ? x.utc.slice(0, 16).replace('T', ' ') + ' UTC' : 'Date to be confirmed')}</time>`;
const schedRow = (x) => `<tr data-comp="${x.c}"><td>${compBadge(x.c)}</td><td>${timeTag(x)}${x.ok ? '' : ' <span class="muted small">(time TBC)</span>'}</td><td>${x.home ? 'vs' : 'at'} ${x.crest ? `<img class="crest small" src="${esc(x.crest)}" alt="" width="20" height="20">` : ''}${esc(x.opp)}</td>
<td>${x.res ? `<a class="${x.res[0] > x.res[1] ? 'pos' : 'neg'}" href="${x.href}"><strong>${x.res[0] > x.res[1] ? 'W' : 'L'} ${x.res[0]}–${x.res[1]}</strong></a>` : '<span class="muted">–</span>'}</td><td class="muted small">${esc(x.rn || (x.r ? 'Round ' + x.r : ''))}</td></tr>`;

// ---- Leagues: every league section, with its logo ----
const LEAGUES = [['el', { leagueName: 'EuroLeague', shortName: 'EuroLeague', leagueLogo: base.leagueLogo, seasonLabel: base.seasonLabel }], ...Object.entries(base.leagues || {})];
const leaguesGrid = `<div class="league-grid">${LEAGUES.map(([k, L]) => `<a class="league-card" href="${k === 'el' ? 'euroleague.html' : k + '/index.html'}">${L.leagueLogo ? `<img src="${esc(L.leagueLogo)}" alt="" loading="lazy">` : `<i class="lg-dot big">${esc((L.shortName || k).slice(0, 3))}</i>`}<span class="lc-name">${esc(L.leagueName || L.shortName)}</span><span class="lc-sub muted small">${esc(L.seasonLabel || '')}</span></a>`).join('')}</div>`;

// ---- Page ----
const elC = ACTIVE.find((c) => c.key === 'el'), ilC = ACTIVE.find((c) => c.key === 'il');
const crest = elC?.crests.get(elC.code) || ilC?.crests.get(ilC.code) || '';
const rec = (C) => (C?.team ? `${C.team.w}–${C.team.l}` : '');
const hero = `<section class="cover hap-cover"><div class="wrap"><div>
<span class="kicker">HTA LAB · Home</span><h1>Hapoel Tel Aviv</h1>
<div class="cover-meta">${ACTIVE.map((C) => `<span>${esc(C.short)} ${rec(C)}${C.team ? ` · ${ord(C.team.rank)}` : ''}</span>`).join('<span class="sep">/</span>')}</div>
<p class="cover-lede">${nextGames[0] ? `Next: <strong>${nextGames[0].home ? 'vs' : 'at'} ${esc(nextGames[0].opp)}</strong> (${esc(compShort[nextGames[0].c])}) · ${timeTag(nextGames[0])}` : 'Every Hapoel game, box score, lineup and stat — EuroLeague and Winner League.'}</p>
<div class="strip">${tAll ? `<span><b>${tAll.w}–${tAll.l}</b> all games</span><span><b>${f1(tAll.ortg)}</b> ORtg</span><span><b>${f1(tAll.drtg)}</b> DRtg</span><span><b>${signed(tAll.net)}</b> net</span>` : ''}</div>
</div>${crest ? `<div class="side cover-crest"><img src="${esc(crest)}" alt=""></div>` : ''}</div></section>`;

const tabs = `<div class="comp-tabs" role="tablist" aria-label="Competition"><button type="button" role="tab" data-comp="all" aria-selected="true">All competitions</button>${ACTIVE.map((C) => `<button type="button" role="tab" data-comp="${C.key}" aria-selected="false">${C.logo ? `<img src="${esc(C.logo)}" alt="" width="18" height="18">` : ''}${esc(C.short)}</button>`).join('')}</div>`;
const navLinks = `<nav class="hap-toc" aria-label="On this page"><a href="#schedule">Schedule</a><a href="#boxscores">Box scores</a><a href="#team">Team stats</a><a href="#players">Players</a><a href="#lineups">Lineups</a><a href="#boards">Leaderboards</a><a href="#leagues">Leagues</a></nav>`;

const person = (k) => (people.get(k)?.name || k);
const data = {
  comps: Object.fromEntries(ACTIVE.map((C) => [C.key, C.short])), tk: TK,
  games: gameRows,
  people: Object.fromEntries([...people.values()].map((e) => [e.key, [e.name, e.href.el || e.href.il || null, extra[e.key] || {}]])),
  stints: stintRows, lineupGames: [...lineupGames]
};
const body = `${tabs}${navLinks}
<section class="card" id="schedule"><h2>Schedule</h2><p class="muted">Next games and every result — EuroLeague and Winner League (times in your time zone). <a href="hapoel-schedule.html"><strong>Full schedule and calendar file →</strong></a></p>
<div class="scroll"><table class="hap-sched"><thead><tr><th scope="col"></th><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">Result</th><th scope="col">Round</th></tr></thead><tbody>
${[...nextGames.slice(0, 4)].map(schedRow).join('')}${sched.filter((x) => x.res).reverse().slice(0, 8).map(schedRow).join('')}
</tbody></table></div></section>

<section class="card" id="boxscores"><h2>Box scores</h2><p class="muted">Every Hapoel game. Open a game for its full box score — basic, shooting, advanced and by quarter — or go to the game page for the flow chart, play-by-play and lineups.</p>
<div id="hap-games"><p class="muted">Loading…</p></div></section>

<section class="card" id="team"><h2>Team stats</h2><p class="muted">Hapoel's numbers in each competition, with the league rank and league average, and both competitions together split by wins, losses, home and away.</p>
${teamStatsTable}
${quarterTable ? `<h3>Average by quarter</h3>${quarterTable}` : ''}
<p class="small"><a href="quarter-split.html"><strong>EuroLeague quarter splits — every player and team, quarter by quarter →</strong></a></p>
<p class="small">${ACTIVE.map((C) => `<a href="${C.pfx}team-${safe(C.code)}.html"><strong>${esc(C.short)} team page →</strong></a> · <a href="${C.pfx}team-${safe(C.code)}-report.html">${esc(C.short)} team report</a>`).join(' · ')}</p></section>

<section class="card" id="players"><h2>Players</h2><p class="muted">Every Hapoel player, every stat, in the competition chosen above — per game, totals or per 40 minutes, over all games, wins, losses, home, away, the last few, or any games you tick. Click a column to sort.</p>
<div id="hap-players"><p class="muted">Loading…</p></div></section>

<section class="card" id="lineups"><h2>Lineups</h2><p class="muted">Hapoel's five-man units — and 2-, 3- and 4-man combinations — from the official play-by-play. Pick the games: all of them, the last few, wins or losses, one competition, or any games you tick.</p>
<div id="hap-lineups"><p class="muted">Loading…</p></div></section>

<section id="boards"><h2 class="sec-title">Leaderboards — Hapoel players</h2><p class="muted sec-sub">Every leaderboard from the league home pages, with Hapoel's players ranked within the team.</p>
${ACTIVE.map((C) => `<div class="comp-block" data-comp="${C.key}"><h3 class="comp-h">${C.logo ? `<img src="${esc(C.logo)}" alt="" width="22" height="22">` : ''}${esc(C.short)}</h3><div class="row-3">${[mvpFor(C), ...boardsFor(C)].filter(Boolean).join('')}</div></div>`).join('')}
</section>

<section class="card" id="leagues"><h2>Leagues</h2><p class="muted">Every league on HTA LAB — standings, games, players, teams, lineups and reports.</p>${leaguesGrid}</section>
<script type="application/json" id="hap-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const info = { games: gameRows.length, lastDate: gameRows[0]?.d, lastRound: null };
copyFileSync('static/hapoel.js', join(OUT, 'hapoel.js'));
// ---- Data for "Ask the Brain": Hapoel's season in compact form, and the Brain page ----
{
  const line = (C, p) => [p.name, C.short, p.gp, p.gs, +f1(p.mpg), +f1(p.ppg), +f1(p.rpg), +f1(p.apg), +f1(p.spg), +f1(p.bpg), +f1(p.tpg), p.totals.fga2 ? +(100 * p.totals.fgm2 / p.totals.fga2).toFixed(1) : null, p.totals.fga3 ? +(100 * p.totals.fgm3 / p.totals.fga3).toFixed(1) : null, p.totals.fta ? +(100 * p.totals.ftm / p.totals.fta).toFixed(1) : null, +f1(p.ts), +f1(p.usg), +f1(p.pirpg), +f1(p.pmpg), C.onoff(p.id)?.swing != null ? +C.onoff(p.id).swing.toFixed(1) : null];
  const brain = {
    built: new Date().toISOString().slice(0, 10),
    teamStats: { cols: ['Stat', 'All', ...ACTIVE.flatMap((C) => [C.short, C.short + ' rank', C.short + ' league avg']), 'Wins', 'Losses', 'Home', 'Away'],
      rows: STATS.map(([label, k, fmt]) => [label, fmtV(tAll, k, fmt), ...ACTIVE.flatMap((C) => [fmtV(C.team, k, fmt), k && C.team?.ranks?.[k] ? C.team.ranks[k] : '', k ? (/ppp$/.test(k) ? C.lg(k).toFixed(3) : f1(C.lg(k))) : '']), fmtV(tW, k, fmt), fmtV(tL, k, fmt), fmtV(tH, k, fmt), fmtV(tA, k, fmt)]) },
    playerCols: ['Player', 'Competition', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV', '2P%', '3P%', 'FT%', 'TS%', 'USG%', 'PIR', '+/-', 'On/off net'],
    players: ACTIVE.flatMap((C) => C.roster.map((p) => line(C, p))),
    games: gameRows.map((g) => ({ comp: compShort[g.c], date: g.d, round: g.r, venue: g.h ? 'home' : 'away', opp: g.opp[0], score: `${g.s[0]}-${g.s[1]}`, result: g.w ? 'W' : 'L', quarters: g.q,
      box: g.me.p.map((r) => [person(r[1]), r[3] ? Math.round(r[3]) : 0, ...r.slice(5)].join(' ')).join('; ') })),
    boxKeys: 'name min pts fgm2 fga2 fgm3 fga3 ftm fta oreb dreb reb ast stl tov blk blka pf fd pir',
    schedule: sched.map((x) => [compShort[x.c], x.utc ? x.utc.slice(0, 16) : 'TBC', x.home ? 'home' : 'away', x.opp, x.res ? `${x.res[0]}-${x.res[1]}` : ''])
  };
  writeFileSync(join(OUT, 'hapoel-brain.json'), JSON.stringify(brain));
  const leaguesForBrain = LEAGUES.map(([k, L]) => [k, L.leagueName || L.shortName, k === 'el' ? '' : k + '/', L.leagueLogo || '']);
  copyFileSync('static/brain.js', join(OUT, 'brain.js'));
  writeFileSync(join(OUT, 'brain.html'), page({ title: 'Ask the Brain', cfg: { ...cfg }, info, active: 'brain.html', sample: false,
    body: `<section class="card brain"><h2>Ask the Brain</h2>
<p class="muted">Ask anything about Hapoel and the leagues on HTA LAB — the answer is written by Claude, using only the data on this site (Hapoel's games and box scores, team and player stats, schedules). Add the leagues the question is about; leagues and teams you name are added automatically.</p>
<div id="brain-app"><p class="muted">Loading…</p></div></section>
<script type="application/json" id="brain-leagues">${JSON.stringify(leaguesForBrain).replace(/</g, '\\u003c')}</script>`,
    hero: null, scripts: `<script src="brain.js?v=${assetVersion()}" defer></script>` }));
}
writeFileSync(join(OUT, 'index.html'), page({ title: 'Hapoel Tel Aviv', cfg, info, active: 'index.html', sample: false, body, hero, scripts: `<script src="hapoel.js?v=${assetVersion()}" defer></script>` }));
console.log(`✓ Hapoel home page: ${gameRows.length} games (${ACTIVE.map((C) => `${C.short} ${C.mine.length}`).join(', ')}), ${people.size} players, ${lineupGames.size} games with lineups`);
