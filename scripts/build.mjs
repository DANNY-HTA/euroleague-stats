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
import { buildStints, checkStints, aggregate, rapm, BOX_KEYS, repairPlusMinus } from '../lib/pbp.mjs';
import { GLOSSARY } from '../lib/glossary.mjs';
import { teamSplits } from '../lib/teamsplits.mjs';
import { playerRates } from '../lib/advanced.mjs';
import { playLog, flowStats, connections, LABEL as PLAY_LABEL, GROUP as PLAY_GROUP } from '../lib/game.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const args = process.argv.slice(2);
const dataDir = args.includes('--data') ? args[args.indexOf('--data') + 1] : join('data', 'raw', cfg.seasonCode);
const sample = args.includes('--sample');
const OUT = 'site';

if (!existsSync(dataDir)) { console.error(`No data in ${dataDir}. Run "npm run fetch" first.`); process.exit(1); }
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const rawPbp = new Map();
const games = files.map((f) => { const raw = JSON.parse(readFileSync(join(dataDir, f))); const g = parseGame(raw); if (raw.pbp) rawPbp.set(g.gameCode, raw.pbp); return g; });

// Official club crests (optional). Only https image links are used.
const crests = new Map();
try {
  for (const c of JSON.parse(readFileSync(join(dataDir, '_clubs.json')))) {
    if (c.code && typeof c.crest === 'string' && /^https:\/\/[^\s"'<>]+$/.test(c.crest)) crests.set(c.code, c.crest);
  }
} catch { /* no crest file: team codes are shown instead */ }
// Season schedule (optional): upcoming games with date, time and venue.
let schedule = [];
try { schedule = JSON.parse(readFileSync(join(dataDir, '_schedule.json'))); } catch { /* no schedule: only played games are shown */ }
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

// ---- Play-by-play: on/off, lineups, impact (only games that match the box score exactly) ----
const pbpOk = [], pbpBad = [], pbpNear = new Map(), pmRepaired = new Map();
for (const g of games) {
  const raw = rawPbp.get(g.gameCode);
  if (!raw) continue;
  const r = buildStints(g, raw);
  if (r.ok) { const fix = repairPlusMinus(g, r.stints); if (fix) { pmRepaired.set(g.gameCode, fix.fixed); console.log(`  game ${g.gameCode} (${g.home.tv}–${g.away.tv}): official +/- is wrong for ${fix.fixed} players (off by up to ${fix.maxDiff}), recalculated from the play-by-play`); } }
  const why = r.ok ? checkStints(g, r.stints) : r.reason;
  if (why && r.ok && !why.startsWith('play-by-play score')) pbpNear.set(g.gameCode, { stints: r.stints, why });
  if (why) pbpBad.push(`game ${g.gameCode} (${g.home.tv}–${g.away.tv}): ${why}`); else pbpOk.push({ game: g, stints: r.stints });
}
const PBP = pbpOk.length ? aggregate(pbpOk) : null;

// ---- 2. Stats ----
const teams = teamTable(games);
const players = playerTable(games);
const qual = qualified(players, teams, cfg);
const info = seasonInfo(games);

const IMPACT = PBP ? rapm(PBP.rows) : null;
if (rawPbp.size) {
  console.log(`✓ Play-by-play: ${pbpOk.length} of ${rawPbp.size} games match the box score exactly and are used for on/off, lineups and impact`);
  for (const b of pbpBad.slice(0, 8)) console.log('  left out: ' + b);
}
const onOffOf = (id) => {
  const o = PBP?.onoff.get(id);
  if (!o) return null;
  const off = { secs: o.teamTot.secs - o.on.secs, poss: o.teamTot.poss - o.on.poss, pf: o.teamTot.pf - o.on.pf, pa: o.teamTot.pa - o.on.pa };
  const net = (x) => (x.poss > 0 ? 100 * (x.pf - x.pa) / x.poss : null);
  return { onMin: o.on.secs / 60, offMin: off.secs / 60, onNet: net(o.on), offNet: net(off), swing: net(o.on) != null && net(off) != null && off.poss >= 20 ? net(o.on) - net(off) : null };
};
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
const cover = ({ crumbs = '', kicker = '', title, meta = '', lede = '', strip = [], side = '', actions = '' }) => `<section class="cover"><div class="wrap"><div>
${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}${kicker ? `<span class="kicker">${kicker}</span>` : ''}
<h1>${title}</h1>${meta ? `<div class="cover-meta">${meta}</div>` : ''}${lede ? `<p class="cover-lede">${lede}</p>` : ''}
${strip.length ? `<div class="strip">${strip.map(([b, t]) => `<span><b>${b}</b> ${t}</span>`).join('')}</div>` : ''}${actions ? `<div class="cover-actions">${actions}</div>` : ''}
</div>${side}</div></section>`;
const roundLine = info.lastDate ? `Through ${info.lastRound ? `Round ${info.lastRound}, ` : ''}${fmtDate(info.lastDate)}` : 'Season';
const qualNote = `Players averaging at least ${cfg.minMinutesForLeaders} minutes and playing ${Math.round(cfg.minGamesShare * 100)}% of their team's games.`;
// ---- Game pages: every game in full (modelled on the EuroLeague Media Game Center) ----
const gameHref = (code) => `game-${safe(code)}.html`;
const stintsOf = new Map(pbpOk.map(({ game, stints }) => [game.gameCode, stints]));
const nameOf = new Map(players.map((q) => [q.id, q.name]));
const pctTxt = (m, a) => (a ? f1(100 * m / a) : '–');
const sortTh = (label, num = true, title = '') => `<th scope="col"${num ? ' class="num"' : ''}${title ? ` title="${esc(title)}"` : ''}><button type="button">${label}</button></th>`;
const GBOX = [['min', 'MIN'], ['pts', 'PTS'], ['fg2', '2P'], ['fg3', '3P'], ['ft', 'FT'], ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['tov', 'TOV'], ['blk', 'BLK'], ['pf', 'PF'], ['fd', 'FD'], ['pm', '+/-'], ['pir', 'PIR']];
const boxCell = (s, k, isTeam) => {
  if (k === 'min') return isTeam ? `<td class="num">${Math.round(s.min || 200)}</td>` : `<td class="num" data-v="${s.min}">${mmss(s.min)}</td>`;
  if (k === 'fg2') return `<td class="num" data-v="${s.fgm2 + s.fga2 / 1000}">${s.fgm2}/${s.fga2}</td>`;
  if (k === 'fg3') return `<td class="num" data-v="${s.fgm3 + s.fga3 / 1000}">${s.fgm3}/${s.fga3}</td>`;
  if (k === 'ft') return `<td class="num" data-v="${s.ftm + s.fta / 1000}">${s.ftm}/${s.fta}</td>`;
  if (k === 'pm') return isTeam ? '<td class="num"></td>' : `<td class="num ${s.pm > 0 ? 'pos' : s.pm < 0 ? 'neg' : ''}" data-v="${s.pm}">${s.pm > 0 ? '+' : ''}${s.pm}</td>`;
  return `<td class="num" data-v="${s[k]}">${k === 'pts' ? `<strong>${s[k]}</strong>` : s[k]}</td>`;
};
function gameBox(side) {
  const ps = side.players.filter((p) => p.min > 0).sort((a, b) => b.starter - a.starter || b.min - a.min);
  const dnp = side.players.filter((p) => p.min <= 0);
  const T = side.totals;
  return `<div class="scroll"><table class="sortable gbox"><thead><tr>${sortTh('#')}${sortTh('Player', false)}${GBOX.map(([, l]) => sortTh(l)).join('')}</tr></thead><tbody>
${ps.map((p) => `<tr><td class="num muted" data-v="${Number(p.number) || 0}">${esc(p.number ?? '')}</td><td data-v="${esc(p.name)}"><a href="${playerHref(p.id)}">${esc(p.name)}</a>${p.starter ? '<span class="muted">*</span>' : ''}</td>${GBOX.map(([k]) => boxCell(p, k)).join('')}</tr>`).join('')}
</tbody><tfoot><tr><td></td><th scope="row">Team</th>${GBOX.map(([k]) => boxCell({ ...T, min: side.teamMinutes }, k, true)).join('')}</tr>
<tr class="muted"><td></td><th scope="row">Shooting</th><td></td><td></td><td class="num">${pctTxt(T.fgm2, T.fga2)}%</td><td class="num">${pctTxt(T.fgm3, T.fga3)}%</td><td class="num">${pctTxt(T.ftm, T.fta)}%</td><td colspan="11"></td></tr></tfoot></table></div>
${dnp.length ? `<p class="muted small">Did not play: ${dnp.map((p) => esc(p.name)).join(', ')}. * started.</p>` : '<p class="muted small">* started.</p>'}`;
}
function flowSvg(line, periods, hTv, aTv) {
  const W = 900, H = 240, L = 40, R = 10, T = 14, B = 26;
  const total = periods <= 4 ? 2400 : 2400 + (periods - 4) * 300;
  const m = Math.max(10, ...line.map(([, v]) => Math.abs(v)));
  const top = Math.ceil(m / 5) * 5;
  const sx = (t) => L + (Math.min(t, total) / total) * (W - L - R);
  const sy = (v) => T + ((top - v) / (2 * top)) * (H - T - B);
  let d = `M${sx(0)},${sy(0)}`;
  for (const [t, v] of line) d += ` H${sx(t).toFixed(1)} V${sy(v).toFixed(1)}`;
  d += ` H${sx(total)}`;
  const area = `${d} V${sy(0)} H${sx(0)} Z`;
  const marks = [];
  for (let p = 1; p < periods; p++) marks.push(p <= 4 ? p * 600 : 2400 + (p - 4) * 300);
  const labels = Array.from({ length: periods }, (_, i) => { const s = i < 4 ? i * 600 : 2400 + (i - 4) * 300, e = i < 4 ? s + 600 : s + 300; return [(s + e) / 2, i < 4 ? `Q${i + 1}` : `OT${i - 3}`]; });
  const ticks = [top, top / 2, 0, -top / 2, -top];
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score margin through the game. Above the line ${esc(hTv)} lead, below it ${esc(aTv)} lead.">
<defs><clipPath id="fl-up"><rect x="0" y="0" width="${W}" height="${sy(0)}"/></clipPath><clipPath id="fl-dn"><rect x="0" y="${sy(0)}" width="${W}" height="${H}"/></clipPath></defs>
${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" class="${v === 0 ? 'zero' : 'grid'}"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v > 0 ? '+' + v : v < 0 ? '+' + -v : '0'}</text>`).join('')}
${marks.map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${T}" y2="${H - B}" class="grid"/>`).join('')}
${labels.map(([t, l]) => `<text x="${sx(t)}" y="${H - 8}" text-anchor="middle">${l}</text>`).join('')}
<path d="${area}" class="fa-h" clip-path="url(#fl-up)"/><path d="${area}" class="fa-a" clip-path="url(#fl-dn)"/><path d="${d}" class="fl"/>
<text x="${L + 6}" y="${T + 12}" class="lbl">${esc(hTv)} ahead</text><text x="${L + 6}" y="${H - B - 6}" class="lbl">${esc(aTv)} ahead</text></svg>`;
}
const per100 = (pts, poss) => (poss ? 100 * pts / poss : 0);
function compareRows(g) {
  const h = g.home.totals, a = g.away.totals;
  const poss = (t, o) => t.fga2 + t.fga3 - t.oreb + t.tov + 0.44 * t.fta;
  const P = (poss(h) + poss(a)) / 2;
  const efg = (t) => (t.fga2 + t.fga3 ? 100 * (t.fgm2 + t.fgm3 + 0.5 * t.fgm3) / (t.fga2 + t.fga3) : 0);
  const ts = (t) => (t.fga2 + t.fga3 + 0.44 * t.fta ? 100 * t.pts / (2 * (t.fga2 + t.fga3 + 0.44 * t.fta)) : 0);
  const pct = (m, x) => (x ? 100 * m / x : 0);
  const rows = [
    ['Points', h.pts, a.pts], ['Points per 100 possessions', per100(h.pts, P), per100(a.pts, P), 1],
    ['2-point %', pct(h.fgm2, h.fga2), pct(a.fgm2, a.fga2), 1, `${h.fgm2}/${h.fga2}`, `${a.fgm2}/${a.fga2}`],
    ['3-point %', pct(h.fgm3, h.fga3), pct(a.fgm3, a.fga3), 1, `${h.fgm3}/${h.fga3}`, `${a.fgm3}/${a.fga3}`],
    ['Free throw %', pct(h.ftm, h.fta), pct(a.ftm, a.fta), 1, `${h.ftm}/${h.fta}`, `${a.ftm}/${a.fta}`],
    ['Effective FG %', efg(h), efg(a), 1], ['True shooting %', ts(h), ts(a), 1],
    ['Rebounds', h.reb, a.reb], ['Offensive rebounds', h.oreb, a.oreb], ['Defensive rebounds', h.dreb, a.dreb],
    ['Assists', h.ast, a.ast], ['Steals', h.stl, a.stl], ['Blocks', h.blk, a.blk],
    ['Turnovers', h.tov, a.tov, 0, '', '', true], ['Fouls', h.pf, a.pf, 0, '', '', true], ['PIR', h.pir, a.pir]
  ];
  return { P, html: rows.map(([label, x, y, dec, sx, sy, low]) => {
    const tot = Math.abs(x) + Math.abs(y) || 1, wx = (100 * Math.abs(x) / tot).toFixed(1);
    const better = x === y ? '' : (low ? x < y : x > y) ? 'h' : 'a';
    const fx = dec ? f1(x) : x, fy = dec ? f1(y) : y;
    return `<div class="cmp ${better ? 'b-' + better : ''}"><span class="v h">${fx}${sx ? ` <small>${sx}</small>` : ''}</span><span class="lab">${label}${low ? ' <small>(fewer is better)</small>' : ''}</span><span class="v a">${fy}${sy ? ` <small>${sy}</small>` : ''}</span><div class="split"><i style="width:${wx}%"></i><i style="width:${(100 - wx).toFixed(1)}%"></i></div></div>`;
  }).join('') };
}
const sideHead = (s) => `<h3 class="side-h">${badge(s.code, s.tv)} ${esc(titleCase(s.name))}</h3>`;
function gameUnits(g, stints, size) {
  const out = { H: new Map(), A: new Map() };
  const A = g.home.code, B = g.away.code;
  const combos = (ids, k) => { const r = []; const rec = (st, acc) => { if (acc.length === k) { r.push(acc); return; } for (let i = st; i < ids.length; i++) rec(i + 1, [...acc, ids[i]]); }; rec(0, []); return r; };
  const zero = () => Object.fromEntries(BOX_KEYS.map((k) => [k, 0]));
  for (const s of stints) for (const [side, ids, me, op, poss, oposs] of [['H', s.home, A, B, s.possH, s.possA], ['A', s.away, B, A, s.possA, s.possH]]) for (const c of combos(ids, size)) {
    const k = c.join(','); if (!out[side].has(k)) out[side].set(k, { ids: c, secs: 0, pf: 0, pa: 0, poss: 0, oposs: 0, me: zero(), op: zero() });
    const e = out[side].get(k); e.secs += s.secs; e.pf += s.pts[me]; e.pa += s.pts[op]; e.poss += poss; e.oposs += oposs;
    for (const x of BOX_KEYS) { e.me[x] += s.box[me][x]; e.op[x] += s.box[op][x]; }
  }
  for (const s of ['H', 'A']) out[s] = [...out[s].values()].filter((e) => e.secs > 0 || e.pf || e.pa).sort((x, y) => y.secs - x.secs);
  return out;
}
const UCOLS = [['MIN', 'Minutes together'], ['PTS', 'Points scored'], ['OPP', 'Points allowed'], ['+/-', 'Plus-minus'], ['POSS', 'Possessions (average of both teams)'], ['ORtg', 'Points scored per 100 possessions'], ['DRtg', 'Points allowed per 100 possessions'], ['Net', 'ORtg minus DRtg'], ['2P', '2-pointers made/attempted'], ['3P', '3-pointers made/attempted'], ['FT', 'Free throws made/attempted'], ['eFG%', 'Effective field goal %'], ['OR', 'Offensive rebounds'], ['DR', 'Defensive rebounds'], ['AST', 'Assists'], ['TOV', 'Turnovers'], ['STL', 'Steals'], ['BLK', 'Blocks'], ['PF', 'Fouls'], ['OPP 3P', 'Opponent 3-pointers'], ['OPP TOV', 'Opponent turnovers'], ['OPP OR', 'Opponent offensive rebounds']];
const unitTable = (list) => {
  const td = (v, txt = v, cls = '') => `<td class="num ${cls}" data-v="${v}">${txt}</td>`;
  const fr = (m, a) => td(m + a / 1000, `${m}/${a}`);
  return `<div class="scroll"><table class="sortable units"><thead><tr>${sortTh('Players', false)}${UCOLS.map(([l, t]) => sortTh(l, true, t)).join('')}</tr></thead><tbody>
${list.map((u) => {
    const P = (u.poss + u.oposs) / 2, o = P ? 100 * u.pf / P : null, d = P ? 100 * u.pa / P : null, m = u.me, x = u.op;
    const fga = m.fga2 + m.fga3, efg = fga ? 100 * (m.fgm2 + 1.5 * m.fgm3) / fga : null, pm = u.pf - u.pa;
    const n = (v, f = f1) => (v == null ? td(-999, '–') : td(v.toFixed(2), f(v)));
    return `<tr><td data-v="${esc(u.ids.map((id) => nameOf.get(id) || id).join(' '))}">${u.ids.map((id) => `<a href="${playerHref(id)}">${esc(nameOf.get(id) || id)}</a>`).join('<span class="muted"> · </span>')}</td>${td(u.secs, mmss(u.secs / 60))}${td(u.pf)}${td(u.pa)}${td(pm, `${pm > 0 ? '+' : ''}${pm}`, pm > 0 ? 'pos' : pm < 0 ? 'neg' : '')}${td(P.toFixed(1), f1(P))}${n(o)}${n(d)}${o == null ? td(-999, '–') : td((o - d).toFixed(2), signed(o - d), o > d ? 'pos' : o < d ? 'neg' : '')}${fr(m.fgm2, m.fga2)}${fr(m.fgm3, m.fga3)}${fr(m.ftm, m.fta)}${n(efg)}${td(m.oreb)}${td(m.dreb)}${td(m.ast)}${td(m.tov)}${td(m.stl)}${td(m.blk)}${td(m.pf)}${fr(x.fgm3, x.fga3)}${td(x.tov)}${td(x.oreb)}</tr>`;
  }).join('')}</tbody></table></div>`;
};
function lineupBlock(g, stints, note) {
  const sizes = [5, 4, 3, 2], U = Object.fromEntries(sizes.map((k) => [k, gameUnits(g, stints, k)]));
  const name = { 5: 'Five-man lineups', 4: '4-man', 3: '3-man', 2: 'Pairs' };
  return `<section class="card" id="lineups"><h2>Lineups</h2><p class="muted">Every unit that played in this game, with the full stats while it was on the court. Click any column to sort.</p>
${note ? `<p class="note-warn">${note}</p>` : ''}
<div class="seg" role="group" aria-label="Lineup size">${sizes.map((k, i) => `<button type="button" data-size="${k}" aria-pressed="${i === 0}">${name[k]}</button>`).join('')}</div>
${sizes.map((k, i) => `<div class="unit-size" data-size="${k}"${i ? ' hidden' : ''}>${sideHead(g.home)}${unitTable(U[k].H)}${sideHead(g.away)}${unitTable(U[k].A)}</div>`).join('')}
</section>`;
}
const gameMvp = (g) => {
  const win = g.home.score > g.away.score ? g.home : g.away;
  const p = win.players.filter((x) => x.min > 0).sort((x, y) => y.pir - x.pir || y.pts - x.pts)[0];
  return p ? { p, s: win } : null;
};
const sortedGames = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.gameCode - b.gameCode);
for (const g of sortedGames) {
  const H = g.home, A = g.away, raw = rawPbp.get(g.gameCode);
  const log = raw ? playLog(g, raw) : null;
  const flow = log ? flowStats(log.plays) : null;
  const periods = log ? Math.max(4, ...log.plays.map((p) => p[0])) : 4;
  const near = pbpNear.get(g.gameCode);
  const stints = stintsOf.get(g.gameCode) || near?.stints;
  const hWin = H.score > A.score;
  const qs = (s) => { const q = s.quarters || []; const ot = q.length ? s.score - q.reduce((x, y) => x + y, 0) : 0; return [...q, ...(periods > 4 || ot ? [ot] : [])]; };
  const qH = qs(H), qA = qs(A);
  const mvp = gameMvp(g);
  const cmp = compareRows(g);
  const best = (side, k) => side.players.filter((p) => p.min > 0).sort((x, y) => y[k] - x[k] || y.pir - x.pir)[0];
  const perf = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['pir', 'PIR']].map(([k, l]) => {
    const x = best(H, k), y = best(A, k);
    const cell = (p) => p ? `<a href="${playerHref(p.id)}">${esc(p.name)}</a><strong>${p[k]}</strong>` : '';
    return `<div class="perf"><span class="ph">${cell(x)}</span><span class="lab">${l}</span><span class="pa">${cell(y)}</span></div>`;
  }).join('');
  const conn = log ? connections(log.plays) : [];
  const connList = (side) => { const l = conn.filter((c) => c.side === side).slice(0, 6); return l.length ? `<ol class="conn">${l.map((c) => `<li><span>${esc(nameOf.get(c.from) || log.names[c.from] || c.from)} <span class="muted">→</span> ${esc(nameOf.get(c.to) || log.names[c.to] || c.to)}</span><strong>${c.pts} pts</strong><span class="muted small">${c.n} assist${c.n > 1 ? 's' : ''}</span></li>`).join('')}</ol>` : '<p class="muted">No assisted baskets recorded.</p>'; };
  const pbpJson = log ? JSON.stringify({
    H: H.tv, A: A.tv, hName: titleCase(H.name), aName: titleCase(A.name),
    names: Object.fromEntries([...H.players, ...A.players].map((p) => [p.id, p.name])),
    plays: log.plays.map((p) => p.slice(0, 7)), labels: PLAY_LABEL, groups: PLAY_GROUP
  }).replace(/</g, '\\u003c') : null;
  const hero = `<section class="cover game-cover"><div class="wrap gc-wrap">
<div class="crumbs"><a href="index.html#games">Games</a> / ${g.round ? `Round ${g.round}` : esc(g.phase || '')}</div>
<span class="kicker">${g.round ? `Round ${g.round} · ` : ''}${esc(fmtDate(g.date))}</span>
<div class="scoreboard">
<a class="sb-team" href="${teamHref(H.code)}">${crests.has(H.code) ? `<span class="sb-crest"><img src="${esc(crests.get(H.code))}" alt=""></span>` : ''}<span class="sb-name">${esc(titleCase(H.name))}</span><span class="muted-w">Home</span></a>
<div class="sb-score"><span class="${hWin ? 'win' : ''}">${H.score}</span><span class="dash">–</span><span class="${hWin ? '' : 'win'}">${A.score}</span><small>Final${periods > 4 ? ` · ${periods > 5 ? (periods - 4) + ' OT' : 'OT'}` : ''}</small></div>
<a class="sb-team" href="${teamHref(A.code)}">${crests.has(A.code) ? `<span class="sb-crest"><img src="${esc(crests.get(A.code))}" alt=""></span>` : ''}<span class="sb-name">${esc(titleCase(A.name))}</span><span class="muted-w">Away</span></a>
</div>
${qH.length ? `<table class="qtable"><thead><tr><th scope="col"></th>${qH.map((_, i) => `<th scope="col">${i < 4 ? 'Q' + (i + 1) : 'OT'}</th>`).join('')}<th scope="col">Final</th></tr></thead><tbody>
<tr><th scope="row">${esc(H.tv)}</th>${qH.map((v, i) => `<td class="${v > (qA[i] ?? 0) ? 'w' : ''}">${v}</td>`).join('')}<td class="w">${H.score}</td></tr>
<tr><th scope="row">${esc(A.tv)}</th>${qA.map((v, i) => `<td class="${v > (qH[i] ?? 0) ? 'w' : ''}">${v}</td>`).join('')}<td class="w">${A.score}</td></tr></tbody></table>` : ''}
</div></section>`;
  writePage(gameHref(g.gameCode), `${H.tv} ${H.score}–${A.score} ${A.tv}`, `
<div class="tiles">
${mvp ? `<a class="tile mvp-tile" href="${playerHref(mvp.p.id)}"><span class="label">Game MVP</span><span class="big">${mvp.p.pir}</span><span class="sub">PIR · ${mvp.p.pts} pts, ${mvp.p.reb} reb, ${mvp.p.ast} ast</span><span class="chip hot">${esc(mvp.p.name)} · ${esc(mvp.s.tv)}</span></a>` : ''}
${flow ? `<div class="tile"><span class="label">Lead changes</span><span class="big">${flow.leadChanges}</span><span class="sub">and ${flow.ties} tie${flow.ties === 1 ? '' : 's'}</span></div>
<div class="tile"><span class="label">Biggest lead</span><span class="big">${Math.max(flow.maxLead.H, flow.maxLead.A)}</span><span class="sub">${esc(H.tv)} +${flow.maxLead.H} · ${esc(A.tv)} +${flow.maxLead.A}</span></div>
<div class="tile"><span class="label">Biggest run</span><span class="big">${Math.max(flow.bestRun.H, flow.bestRun.A)}–0</span><span class="sub">${esc(H.tv)} ${flow.bestRun.H}–0 · ${esc(A.tv)} ${flow.bestRun.A}–0</span></div>` : `<div class="tile"><span class="label">Possessions</span><span class="big">${f1(cmp.P)}</span><span class="sub">per team</span></div>`}
</div>
${flow ? `<section class="card"><h2>Game flow</h2><p class="muted">The score margin after every basket. Red: ${esc(H.tv)} ahead. Dark: ${esc(A.tv)} ahead.</p>${flowSvg(flow.line, periods, H.tv, A.tv)}</section>` : ''}
<div class="row">
<section class="card"><h2>Top performers</h2><div class="perf-head"><span>${badge(H.code, H.tv)} ${esc(H.tv)}</span><span></span><span>${esc(A.tv)} ${badge(A.code, A.tv)}</span></div>${perf}</section>
<section class="card"><h2>Team comparison</h2><div class="perf-head"><span>${badge(H.code, H.tv)} ${esc(H.tv)}</span><span>${f1(cmp.P)} possessions</span><span>${esc(A.tv)} ${badge(A.code, A.tv)}</span></div>${cmp.html}</section>
</div>
<section class="card"><h2>Box score</h2>${pmRepaired.has(g.gameCode) ? `<p class="note-warn">The league's published +/- for this game is wrong (${pmRepaired.get(g.gameCode)} players). The +/- shown here is recalculated from the official play-by-play, which reproduces the final score and every player's minutes.</p>` : ''}${sideHead(H)}${gameBox(H)}${sideHead(A)}${gameBox(A)}<p class="muted small">Click any column to sort. PIR = Performance Index Rating.</p></section>
${stints ? lineupBlock(g, stints, near ? `Small difference with the official box score in this game (${esc(near.why)}). These lineups are shown for this game only and are not used in the season lineup, on/off or impact numbers.` : '') : raw ? '<p class="muted small">Lineups are not available for this game: the official play-by-play does not say who was on the court at every moment.</p>' : ''}
${log ? `<section class="card"><h2>Best connections</h2><p class="muted">Who assisted whom, by points created.</p><div class="row two">${['H', 'A'].map((s) => `<div>${sideHead(s === 'H' ? H : A)}${connList(s)}</div>`).join('')}</div></section>
<section class="card"><h2>Play-by-play</h2><div id="pbp-app"><p class="muted">Loading…</p></div></section>
<script type="application/json" id="pbp-data">${pbpJson}</script>` : ''}`, 'index.html', hero, { scripts: `<script src="game.js?v=${assetVersion()}" defer></script>` });
}
console.log(`✓ Game pages: ${sortedGames.length}`);
// ---- Home: MVP race (several factors) and MVP of each round ----
const MVP_F = [
  ['pirpg', 'PIR', 0.30, (p) => p.pirpg, f1],
  ['imp', 'Impact', 0.20, (p) => IMPACT?.values.get(p.id) ?? null, signed],
  ['win', 'Team win %', 0.15, (p) => { const t = teams.find((x) => x.code === p.team); return t && t.gp ? 100 * t.w / t.gp : null; }, (v) => f1(v)],
  ['ppg', 'Points', 0.15, (p) => p.ppg, f1],
  ['ts', 'TS%', 0.10, (p) => p.ts, f1],
  ['swing', 'On/off', 0.10, (p) => onOffOf(p.id)?.swing ?? null, signed]
];
const mvpRows = (() => {
  const vals = MVP_F.map(([, , , get]) => qual.map(get));
  const stat = vals.map((arr) => { const v = arr.filter((x) => x != null && Number.isFinite(x)); const m = v.reduce((s, x) => s + x, 0) / (v.length || 1); const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)) || 1; return { m, sd }; });
  return qual.map((p, i) => {
    const f = MVP_F.map((F, j) => { const v = vals[j][i]; return { v, z: v == null || !Number.isFinite(v) ? 0 : (v - stat[j].m) / stat[j].sd }; });
    return { p, f, score: f.reduce((s, x, j) => s + x.z * MVP_F[j][2], 0) };
  }).sort((a, b) => b.score - a.score);
})();
const roundMvps = (() => {
  const by = new Map();
  for (const g of games) { if (!g.round) continue; if (!by.has(g.round)) by.set(g.round, []); by.get(g.round).push(g); }
  return [...by].sort((a, b) => b[0] - a[0]).map(([r, gs]) => {
    const best = gs.map((g) => ({ g, ...gameMvp(g) })).filter((x) => x.p).sort((x, y) => y.p.pir - x.p.pir || y.p.pts - x.p.pts)[0];
    return { r, ...best };
  }).filter((x) => x.p);
})();
const mvpCount = new Map();
for (const x of roundMvps) mvpCount.set(x.p.id, (mvpCount.get(x.p.id) || 0) + 1);
const mvpTop = mvpRows.slice(0, 10), mvpMax = Math.max(0.01, mvpTop[0]?.score || 0);
const mvpSection = mvpTop.length ? `<section class="card mvp-race"><h2>MVP race</h2>
<p class="muted">HTA LAB MVP index: each factor is compared with every qualified player (z-score) and weighted — PIR 30%, impact rating (RAPM) 20%, team win % 15%, points 15%, true shooting 10%, on/off 10%.</p>
<div id="mvp-app"><div class="scroll"><table class="mvp"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" class="num">Index</th>${MVP_F.map(([, l, w]) => `<th scope="col" class="num">${l} <small class="muted">${Math.round(w * 100)}%</small></th>`).join('')}<th scope="col" class="num" title="Times MVP of a round">Rd MVP</th></tr></thead><tbody>
${mvpTop.map((x, i) => `<tr${i < 3 ? ` class="rk-row-${i + 1}"` : ''}><td class="num"><span class="mvp-rank r${i + 1}">${i + 1}</span></td><td><a href="${playerHref(x.p.id)}">${esc(x.p.name)}</a> <span class="muted">${badge(x.p.team, x.p.tv)}${esc(x.p.tv)}</span><div class="bar"><span style="width:${Math.max(4, 100 * x.score / mvpMax).toFixed(1)}%"></span></div></td><td class="num"><strong>${x.score.toFixed(2)}</strong></td>${x.f.map((f, j) => `<td class="num ${f.z >= 1 ? 'hi' : f.z <= -0.5 ? 'lo' : ''}">${f.v == null ? '–' : MVP_F[j][4](f.v)}</td>`).join('')}<td class="num">${mvpCount.get(x.p.id) || ''}</td></tr>`).join('')}
</tbody></table></div></div><p class="muted small">${qualNote} Green = well above average for that factor. Impact and on/off come from the play-by-play and are still noisy this early in the season.</p>
<script type="application/json" id="mvp-data">${JSON.stringify({
  factors: MVP_F.map(([k, l, w]) => [k, l, Math.round(w * 100), k === 'imp' || k === 'swing' ? 's' : '']),
  players: mvpRows.map((x) => [x.p.name, x.p.tv, crests.get(x.p.team) || null, playerHref(x.p.id), x.f.map((f) => (f.v == null || !Number.isFinite(f.v) ? null : +f.v.toFixed(2))), mvpCount.get(x.p.id) || 0])
}).replace(/</g, '\\u003c')}</script></section>` : '';
const roundMvpSection = roundMvps.length ? `<section class="card"><h2>MVP of each round</h2><p class="muted">Highest PIR of the round among players on the winning team.</p>
<div class="scroll"><table><thead><tr><th scope="col">Rd</th><th scope="col">Player</th><th scope="col" class="num">PTS</th><th scope="col" class="num">REB</th><th scope="col" class="num">AST</th><th scope="col" class="num">PIR</th><th scope="col">Game</th></tr></thead><tbody>
${roundMvps.map((x) => `<tr><td class="num">${x.r}</td><td><a href="${playerHref(x.p.id)}">${esc(x.p.name)}</a> <span class="muted">${badge(x.s.code, x.s.tv)}${esc(x.s.tv)}</span></td><td class="num">${x.p.pts}</td><td class="num">${x.p.reb}</td><td class="num">${x.p.ast}</td><td class="num"><strong>${x.p.pir}</strong></td><td><a href="${gameHref(x.g.gameCode)}">${esc(x.g.home.tv)} ${x.g.home.score}–${x.g.away.score} ${esc(x.g.away.tv)}</a></td></tr>`).join('')}
</tbody></table></div></section>` : '';
// ---- Home: every game of the season ----
const playedCodes = new Set(games.map((g) => Number(g.gameCode)));
const upcoming = schedule.filter((x) => !playedCodes.has(Number(x.c)) && x.h?.code && x.a?.code).sort((a, b) => String(a.utc).localeCompare(String(b.utc)) || a.c - b.c);
const roundsList = [...new Set([...games.map((g) => g.round), ...upcoming.map((x) => x.r)].filter(Boolean))].sort((a, b) => a - b);
const currentRound = upcoming.length ? upcoming[0].r : roundsList[roundsList.length - 1];
const timeTag = (x) => `<time data-utc="${esc(x.utc || '')}" datetime="${esc(x.utc || '')}">${esc(x.utc ? x.utc.slice(0, 16).replace('T', ' ') + ' UTC' : 'Date to be confirmed')}</time>`;
const upcomingCard = (x) => {
  const line = (s) => `<span class="gl">${crests.has(s.code) ? `<img src="${esc(crests.get(s.code))}" alt="" width="22" height="22">` : '<i></i>'}<span class="gn">${esc(titleCase(s.name || s.code))}</span><b></b></span>`;
  return `<a class="gcard upcoming" href="live.html?game=${Number(x.c)}" data-r="${x.r || 0}" data-t="${esc(x.h.code)} ${esc(x.a.code)}"><span class="gd">Rd ${x.r} · ${timeTag(x)}</span>${line(x.h)}${line(x.a)}<span class="gm">${x.venue ? esc(titleCase(x.venue)) : ''}${x.ok ? '' : ' · time to be confirmed'}</span></a>`;
};

const gameCard = (g) => {
  const hw = g.home.score > g.away.score, m = gameMvp(g);
  const line = (s, w) => `<span class="gl ${w ? 'w' : ''}">${crests.has(s.code) ? `<img src="${esc(crests.get(s.code))}" alt="" width="22" height="22">` : '<i></i>'}<span class="gn">${esc(titleCase(s.name))}</span><b>${s.score}</b></span>`;
  return `<a class="gcard" href="${gameHref(g.gameCode)}" data-r="${g.round || 0}" data-t="${esc(g.home.code)} ${esc(g.away.code)}"><span class="gd">${g.round ? `Rd ${g.round} · ` : ''}${esc(fmtDate(g.date))}</span>${line(g.home, hw)}${line(g.away, !hw)}${m ? `<span class="gm">MVP ${esc(m.p.name)} · ${m.p.pir} PIR</span>` : ''}</a>`;
};
const gamesSection = `<section class="card" id="games"><h2>All games</h2><p class="muted">Every game of the season, played and still to come (times in your time zone). Click a played game for the full picture; click an upcoming game to follow it live.</p>
<div class="filters" id="games-filter"><label>Team <select data-g="team"><option value="">All teams</option>${teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${esc(t.code)}">${esc(titleCase(t.name))}</option>`).join('')}</select></label>
<label>Round <select data-g="round"><option value="">All rounds</option>${roundsList.map((r) => `<option value="${r}"${r === currentRound ? ' selected' : ''}>Round ${r}</option>`).join('')}</select></label>
<span class="muted small" data-g="count"></span></div>
<div class="gcards">${upcoming.map(upcomingCard).join('')}${[...sortedGames].reverse().map(gameCard).join('')}</div></section>`;

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

const moreBtn = (n) => (n > 10 ? `<button type="button" class="btn-ghost board-more" data-n="${n}" aria-expanded="false">Show all ${n} players</button>` : '');
// Every home leaderboard is registered here so the browser can re-rank it with filters.
const BOARD_REG = [];
const regBoard = (def) => { const id = 'b' + BOARD_REG.length; BOARD_REG.push({ id, ...def }); return id; };
// Per-40 and defensive boards
const RATES = playerRates(games);
const defOf = (id) => {
  const o = PBP?.onoff.get(id);
  if (!o || o.on.poss < 300) return null;
  const off = { poss: o.teamTot.poss - o.on.poss, pa: o.teamTot.pa - o.on.pa };
  const on = 100 * o.on.pa / o.on.poss;
  return { onDrtg: on, defSwing: off.poss >= 50 ? 100 * off.pa / off.poss - on : null };
};
function rateBoard(title, sub, val, { fmt = f1, asc = false, pool = qual } = {}) {
  const bid = regBoard({ val, fmt: fmt === signed ? 's' : '1', asc, all: pool !== qual });
  const list = pool.map((p) => ({ p, v: val(p) })).filter((x) => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => (asc ? a.v - b.v : b.v - a.v) || a.p.name.localeCompare(b.p.name));
  if (!list.length) return '';
  const vals = list.map((x) => x.v), hi = Math.max(...vals), lo = Math.min(...vals);
  const width = (v) => (asc ? (hi === lo ? 100 : 5 + 95 * (hi - v) / (hi - lo)) : 100 * v / (hi || 1));
  return `<section class="card board" data-board="${bid}"><h2>${title}</h2><p class="muted">${sub}</p><ol>
${list.map(({ p, v }, i) => `<li${i >= 10 ? ' class="more"' : ''}><span class="muted num">${i + 1}</span><div><a href="${playerHref(p.id)}">${esc(p.name)}</a> <span class="muted">${esc(p.tv)}</span><div class="bar"><span style="width:${Math.max(3, width(v)).toFixed(1)}%"></span></div></div><strong class="num">${fmt(v)}</strong></li>`).join('')}
</ol>${moreBtn(list.length)}</section>`;
}
const R = (k) => (p) => RATES.get(p.id)?.[k] ?? null;
const per40Section = `<h2 class="sec-title" id="per40">Per 40 minutes</h2>
<p class="muted sec-sub">What each player produces for every 40 minutes on the court, so bench players and starters can be compared. ${qualNote}</p>
<div class="row">${rateBoard('PIR per 40', 'Performance Index Rating per 40 minutes', R('pir40'))}${rateBoard('Points per 40', 'Points per 40 minutes', R('pts40'))}</div>
<div class="row">${rateBoard('Rebounds per 40', 'Rebounds per 40 minutes', R('reb40'))}${rateBoard('Assists per 40', 'Assists per 40 minutes', R('ast40'))}</div>`;
const defenseSection = `<h2 class="sec-title" id="defense">Defense</h2>
<p class="muted sec-sub">Advanced defensive stats. Steal, block and defensive rebound % estimate how many of the chances available while the player was on the court he converted.</p>
<div class="row">${rateBoard('Steal %', 'Share of opponent possessions ending in his steal while he plays', R('stlPct'))}${rateBoard('Block %', "Share of opponent 2-point shots he blocked while he plays", R('blkPct'))}</div>
<div class="row">${rateBoard('Defensive rebound %', 'Share of available defensive rebounds he grabbed while he plays', R('drebPct'))}${rateBoard('Stocks per 40', 'Steals + blocks per 40 minutes', R('stocks40'))}</div>
${PBP ? `<div class="row">${rateBoard('On-court defense', 'Points allowed per 100 possessions by his team with him on the court. Lower is better. At least 300 possessions on the court.', (p) => defOf(p.id)?.onDrtg ?? null, { asc: true, pool: players })}${rateBoard('Defensive on/off', 'How many fewer points per 100 possessions his team allows with him on the court than off it. At least 300 possessions on the court.', (p) => defOf(p.id)?.defSwing ?? null, { fmt: signed, pool: players })}</div>` : ''}`;
// Composite boards (PRA, Stocks): each part gets its own colour.
const PARTS = { pra: [['ppg', 'Points', 'c1'], ['rpg', 'Rebounds', 'c2'], ['apg', 'Assists', 'c3']], stocks: [['spg', 'Steals', 'c1'], ['bpg', 'Blocks', 'c2']] };
function board(title, sub, key, fmt = f1) {
  const bid = regBoard({ val: (p) => p[key], fmt: '1', asc: false, all: false, parts: PARTS[key]?.map(([k, l, c]) => [k, l, c]) });
  const list = leaders(qual, key, Infinity);
  const top = list[0]?.[key] || 1;
  const parts = PARTS[key];
  const legend = parts ? `<div class="legend">${parts.map(([, l, c]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div>` : '';
  const bar = (p) => parts
    ? `<div class="bar stack" title="${esc(parts.map(([k, l]) => `${l} ${f1(p[k])}`).join(' · '))}">${parts.map(([k, , c]) => `<span class="${c}" style="width:${(100 * p[k] / top).toFixed(1)}%"></span>`).join('')}</div><div class="parts">${parts.map(([k, l, c]) => `<span class="${c}" title="${l}">${f1(p[k])}</span>`).join('')}</div>`
    : `<div class="bar"><span style="width:${(100 * p[key] / top).toFixed(1)}%"></span></div>`;
  return `<section class="card board" data-board="${bid}"><h2>${title}</h2><p class="muted">${sub}</p>${legend}<ol>
${list.map((p, i) => `<li${i >= 10 ? ' class="more"' : ''}><span class="muted num">${i + 1}</span><div><a href="${playerHref(p.id)}">${esc(p.name)}</a> <span class="muted">${esc(p.tv)}</span>${bar(p)}</div><strong class="num">${fmt(p[key])}</strong></li>`).join('')}
</ol>${moreBtn(list.length)}</section>`;
}


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
  strip: [[info.games, 'games played'], [esc(bestO?.tv || ''), `best offense, ${f1(bestO?.ortg)}`], [esc(bestD?.tv || ''), `best defense, ${f1(bestD?.drtg)}`]],
  side: cfg.leagueLogo ? `<div class="side league-badge"><img src="${esc(cfg.leagueLogo)}" alt="EuroLeague" width="190" height="43"></div>` : ''
});
writePage('index.html', cfg.seasonLabel, `
<div class="tiles">
${leaderTile('ppg', 'Scoring', 'points per game, 1st in the league')}
${leaderTile('pirpg', 'All-round', 'PIR per game, 1st in the league')}
${leaderTile('rpg', 'Rebounding', 'rebounds per game, 1st in the league')}
${leaderTile('apg', 'Playmaking', 'assists per game, 1st in the league')}
</div>
${gamesSection}
${mvpSection}
${roundMvpSection}
<div class="row">
<section class="card"><h2>Standings</h2><p class="muted">Top 6 go to the playoffs, 7–10 to the play-in.</p>
<div class="scroll"><table class="standings"><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" class="num">W–L</th><th scope="col" class="num" title="Points scored per 100 possessions">ORtg</th><th scope="col" class="num" title="Points allowed per 100 possessions">DRtg</th><th scope="col" class="num">Net</th></tr></thead>
<tbody>${standingsRows}</tbody></table></div>
<p class="muted small">Ranked by wins, then point difference. Official tiebreakers use head-to-head results.</p>
</section>
<section class="card wide"><h2>Who scores, who defends</h2><p class="muted">Right = better offense. Up = better defense. Dashed lines are the league average.</p>
${teamChart}<p class="hover-info" aria-live="polite"></p></section>
</div>
<div id="board-filter" class="card board-filter"></div>
<div class="row">
${board('Points', 'Per game', 'ppg')}
${board('PIR', 'Performance Index Rating per game', 'pirpg')}
</div>
<div class="row">
${board('PRA', 'Points + rebounds + assists per game', 'pra')}
${board('Stocks', 'Steals + blocks per game', 'stocks')}
</div>
<p class="muted small">${qualNote}</p>
${per40Section}
${defenseSection}
<script type="application/json" id="boards-data">${boardsJson()}</script>`, 'index.html', homeHero, { scripts: `<script src="mvp.js?v=${assetVersion()}" defer></script><script src="boards.js?v=${assetVersion()}" defer></script>` });


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
{
  const splits = teamSplits(games, teams);
  writeFileSync(join(OUT, 'teams.json'), JSON.stringify({
    note: `${info.games} games, ${roundLine.toLowerCase()}. Calculated from the official EuroLeague box scores.`,
    teams: teams.map((t) => ({ code: t.code, tv: t.tv, name: titleCase(t.name), crest: crests.get(t.code) || null, href: teamHref(t.code), gp: t.gp, w: t.w, l: t.l, raw: t.raw, split: splits[t.code] }))
  }));
  // A simple table stays in the page for browsers without JavaScript.
  const tcols = [['name', 'Team', 's'], ['gp', 'GP'], ['w', 'W'], ['l', 'L'], ['ppg', 'PTS'], ['oppg', 'OPP'], ['ortg', 'ORtg'], ['drtg', 'DRtg'], ['net', 'Net'], ['pace', 'Pace']];
  writePage('teams.html', 'Teams', `<div id="teams-app"><p class="muted">Loading team stats…</p></div>
<noscript><section class="card"><div class="scroll"><table><thead><tr>${tcols.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody>${teams.map((t) => `<tr>${tcols.map(([k, , ty]) => ty === 's' ? `<td><a href="${teamHref(t.code)}">${esc(titleCase(t.name))}</a></td>` : `<td class="num">${['gp', 'w', 'l'].includes(k) ? t[k] : f1(t[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section></noscript>`,
    'teams.html', cover({ kicker: esc(roundLine), title: 'Teams', lede: 'Every team stat: traditional, opponents, advanced, four factors, shooting profile and splits. Per game, totals or per 100 possessions, coloured by league rank. Click a team for its scouting report.', strip: [[teams.length, 'clubs'], [f1(avg(teams, 'ortg')), 'league ORtg'], [f1(avg(teams, 'pace')), 'possessions per 40 min']] }),
    { scripts: `<script src="teams.js?v=${assetVersion()}" defer></script>` });
}

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
  say(top('drtg'), `Elite defense: allows ${f1(t.drtg)} points per 100 possessions (${ord(t.ranks.drtg)}).`);
  say(bottom('drtg'), `Weak defense: allows ${f1(t.drtg)} points per 100 possessions (${ord(t.ranks.drtg)}).`);
  say(top('ortg'), `Elite offense: scores ${f1(t.ortg)} points per 100 possessions (${ord(t.ranks.ortg)}).`);
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
  const LBL = { ortg: 'offense', drtg: 'defense', net: 'net rating', efg: 'shooting (eFG%)', efgD: 'shooting defense', tov100D: 'forcing turnovers', orebPct: 'offensive rebounding', drebPct: 'defensive rebounding', threePct: '3-point shooting', twoPct: '2-point shooting' };
  const nameOf = new Map(players.map((q) => [q.id, q.name]));
  const short = (id) => { const n = nameOf.get(id) || id; const parts = n.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : n; };
  const sg = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  let lineupCard = '', onoffTeamCard = '';
  if (PBP) {
    const L = PBP.lineups.filter((l) => l.team === t.code && l.secs >= 300).sort((a, b) => b.secs - a.secs).slice(0, 12);
    if (L.length) lineupCard = `<section class="card"><h2>Lineups</h2><p class="muted">Five-man groups with at least 5 minutes together, most used first. Ratings are points per 100 possessions.</p>
<div class="scroll"><table><thead><tr><th scope="col">Lineup</th><th scope="col" class="num">MIN</th><th scope="col" class="num">Poss</th><th scope="col" class="num">ORtg</th><th scope="col" class="num">DRtg</th><th scope="col" class="num">Net</th></tr></thead><tbody>
${L.map((l) => { const o = l.poss ? 100 * l.pf / l.poss : 0, d = l.poss ? 100 * l.pa / l.poss : 0; return `<tr><td class="team">${l.ids.map((id) => `<a href="${playerHref(id)}">${esc(short(id))}</a>`).join('<span class="muted"> · </span>')}</td><td class="num">${f1(l.secs / 60)}</td><td class="num">${Math.round(l.poss)}</td><td class="num">${f1(o)}</td><td class="num">${f1(d)}</td><td class="num ${o - d >= 0 ? 'pos' : 'neg'}">${sg(o - d)}</td></tr>`; }).join('')}
</tbody></table></div><p class="muted small">Lineups with few minutes swing a lot from game to game. Treat them as clues, not verdicts. <a href="lineups.html?team=${encodeURIComponent(t.code)}"><strong>Open the full lineups tool →</strong></a></p></section>`;
    const R = roster.map((q) => ({ q, oo: onOffOf(q.id), imp: IMPACT?.values.get(q.id) })).filter((x) => x.oo);
    if (R.length) onoffTeamCard = `<section class="card"><h2>With and without</h2><p class="muted">Team margin per 100 possessions with each player on the court and on the bench (games he played), and his impact rating.</p>
<div class="scroll"><table><thead><tr><th scope="col">Player</th><th scope="col" class="num">MIN on</th><th scope="col" class="num">On</th><th scope="col" class="num">Off</th><th scope="col" class="num">Swing</th><th scope="col" class="num">Impact</th></tr></thead><tbody>
${R.map(({ q, oo, imp }) => `<tr><td><a href="${playerHref(q.id)}">${esc(q.name)}</a></td><td class="num">${Math.round(oo.onMin)}</td><td class="num">${sg(oo.onNet)}</td><td class="num">${sg(oo.offNet)}</td><td class="num ${oo.swing == null ? '' : oo.swing >= 0 ? 'pos' : 'neg'}">${sg(oo.swing)}</td><td class="num">${imp == null ? '–' : sg(imp)}</td></tr>`).join('')}
</tbody></table></div></section>`;
  }
  const BOXK = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'tov', 'blk', 'blka', 'pf', 'fd', 'pir'];
  const boxJson = JSON.stringify({
    keys: BOXK,
    players: Object.fromEntries(players.filter((q) => list.some((g) => (g.isHome ? games.find((x) => x.gameCode === g.gameCode).home : games.find((x) => x.gameCode === g.gameCode).away).players.some((pl) => pl.id === q.id))).map((q) => [q.id, [q.name, playerHref(q.id)]])),
    games: list.map((g) => {
      const gm = games.find((x) => x.gameCode === g.gameCode), me = g.isHome ? gm.home : gm.away;
      return { h: g.isHome ? 1 : 0, w: g.win ? 1 : 0, d: g.date, o: g.opp.tv,
        team: BOXK.map((k) => me.totals[k]), min: me.teamMinutes || 200, pm: g.for - g.against,
        p: me.players.filter((pl) => pl.min > 0).map((pl) => [pl.id, pl.starter ? 1 : 0, +pl.min.toFixed(2), pl.pm, ...BOXK.map((k) => pl[k])]) };
    })
  }).replace(/</g, '\\u003c');
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
<div><span class="muted">Offense</span><strong>${f1(t.ortg)}</strong>${rankTag(t.ranks.ortg)}</div>
<div><span class="muted">Defense</span><strong>${f1(t.drtg)}</strong>${rankTag(t.ranks.drtg)}</div>
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
<section class="card"><h2>Four factors and shooting</h2><p class="muted">Ranks: 1st = best in the league. On defense, "best" means the lowest value for opponents.</p>
<div class="scroll"><table class="factors"><thead><tr><th scope="col"></th><th scope="col" class="num">Offense</th><th scope="col" class="num">League avg</th><th scope="col" class="num">Defense (opponents)</th><th scope="col" class="num">League avg</th></tr></thead><tbody>
${factorRow('Effective FG%', 'efg', 'efgD')}
${factorRow('Turnovers per 100', 'tov100', 'tov100D', '(defense: forced)')}
${factorRow('Offensive rebound %', 'orebPct', null)}
${factorRow('Defensive rebound %', 'drebPct', null)}
${factorRow('Free throws per 100 shots', 'ftr', 'ftrD')}
${factorRow('Share of shots that are threes', 'threeRate', 'threeRateD')}
${factorRow('3P%', 'threePct', 'threePctD')}
${factorRow('2P%', 'twoPct', 'twoPctD')}
${factorRow('FT%', 'ftPct', null)}
${factorRow('Assisted baskets %', 'astRate', null)}
</tbody></table></div></section>
<section class="card"><h2>Season box score</h2><p class="muted">Every player's cumulative stats for this team. Filter by home, away, wins or losses, switch totals and per game, and click any column to sort from highest to lowest.</p>
<div id="teambox-app"><noscript><div><p class="muted">Sorted by total minutes played. Season stats for players whose most recent game was for this team.</p>
<div class="scroll"><table><thead><tr>${['Player', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'TOV', 'PIR', 'USG%', 'TS%', '3PA', '3P%', 'FT%'].map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>
${roster.map((p) => `<tr><td><a href="${playerHref(p.id)}">${esc(p.name)}</a></td><td class="num">${p.gp}</td><td class="num">${p.gs}</td><td class="num">${f1(p.mpg)}</td><td class="num">${f1(p.ppg)}</td><td class="num">${f1(p.rpg)}</td><td class="num">${f1(p.apg)}</td><td class="num">${f1(p.spg)}</td><td class="num">${f1(p.tpg)}</td><td class="num">${f1(p.pirpg)}</td><td class="num">${f1(p.usg)}</td><td class="num">${f1(p.ts)}</td><td class="num">${f1(p.threeApg)}</td><td class="num">${f1(p.threePct)}</td><td class="num">${f1(p.ftPct)}</td></tr>`).join('')}
</tbody></table></div></div>
</noscript><p class="muted">Loading…</p></div></section>
<script type="application/json" id="teambox-data">${boxJson}</script>
${onoffTeamCard}${PBP ? `<section class="lu-embed"><h2 class="sec-title">All lineups</h2><p class="muted">Every five-man unit and 2-, 3- and 4-man combination this team has used. Filter by home/away, wins/losses and dates.</p><div id="lineups-app" data-team="${esc(t.code)}" data-lock="1" data-min-poss="0"><p class="muted">Loading lineups…</p></div></section>` : ""}
${(() => { const up = upcoming.filter((x) => x.h.code === t.code || x.a.code === t.code); return up.length ? `<section class="card"><h2>Upcoming games</h2>
<div class="scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Rd</th><th scope="col"></th><th scope="col">Opponent</th><th scope="col">Venue</th><th scope="col"></th></tr></thead><tbody>
${up.map((x) => { const home = x.h.code === t.code, o = home ? x.a : x.h; return `<tr><td>${timeTag(x)}</td><td class="num">${x.r}</td><td class="muted">${home ? 'vs' : 'at'}</td><td><a href="${teamHref(o.code)}">${badge(o.code, o.tv)} ${esc(titleCase(o.name || o.code))}</a></td><td class="muted">${esc(titleCase(x.venue || ''))}</td><td><a href="live.html?game=${Number(x.c)}">Follow live ›</a></td></tr>`; }).join('')}
</tbody></table></div></section>` : ''; })()}
<section class="card"><h2>Results</h2>
<div class="scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Rd</th><th scope="col"></th><th scope="col">Opponent</th><th scope="col">Result</th></tr></thead><tbody>
${list.map((g) => `<tr><td>${esc(g.date)}</td><td class="num">${g.round}</td><td class="muted">${g.isHome ? 'vs' : 'at'}</td><td><a href="${teamHref(g.opp.code)}">${badge(g.opp.code, g.opp.tv)} ${esc(titleCase(g.opp.name))}</a></td><td><a class="${g.win ? 'pos' : 'neg'}" href="${gameHref(g.gameCode)}">${g.win ? 'W' : 'L'} ${g.for}–${g.against} ›</a></td></tr>`).join('')}
</tbody></table></div></section>`, 'teams.html', teamHero, { scripts: `<script src="teambox.js?v=${assetVersion()}" defer></script>${PBP ? `<script src="lineups.js?v=${assetVersion()}" defer></script>` : ''}` });
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
    actions: `<button type="button" id="share-btn" class="btn white">Download as image</button>`,
    side: num ? `<div class="side jersey" aria-hidden="true">${esc(String(num).replace(/^0+(?=\d)/, ''))}</div>` : coverCrest(p.team)
  });

  const chip = (k) => !isQual ? '<span class="chip">Not enough minutes yet</span>'
    : `<span class="chip ${r[k] <= 3 ? 'hot' : r[k] <= 20 ? 'warm' : ''}">${ord(r[k])} in the league</span>`;
  const fourth = [['rpg', 'Rebounding', 'rebounds per game'], ['apg', 'Playmaking', 'assists per game'], ['stocks', 'Defense', 'steals + blocks per game']]
    .map((x) => ({ x, rank: isQual ? (qualRank[p.id]?.[x[0]] ?? [...qual].sort((a, b) => b[x[0]] - a[x[0]]).findIndex((q) => q.id === p.id) + 1) : 0 }))
    .sort((a, b) => a.rank - b.rank)[0].x;
  if (isQual && r[fourth[0]] == null) r[fourth[0]] = [...qual].sort((a, b) => b[fourth[0]] - a[fourth[0]]).findIndex((q) => q.id === p.id) + 1;
  const oo = onOffOf(p.id), imp = IMPACT?.values.get(p.id);
  const rankIn = (map) => { if (!isQual || map == null) return null; const list = qual.map((q) => [q.id, map(q)]).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1]); const i = list.findIndex(([id]) => id === p.id); return i < 0 ? null : { r: i + 1, n: list.length }; };
  const chipR = (rk) => !rk ? '<span class="chip">Not enough minutes yet</span>' : `<span class="chip ${rk.r <= 3 ? 'hot' : rk.r <= 20 ? 'warm' : ''}">${ord(rk.r)} in the league</span>`;
  const sgn = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
  const tiles = (oo && imp != null) ? `<div class="tiles">
<div class="tile"><span class="label">Scoring</span><span class="big">${f1(p.ppg)}</span><span class="sub">points per game</span>${chip('ppg')}</div>
<div class="tile"><span class="label">Impact rating</span><span class="big">${sgn(imp)}</span><span class="sub">RAPM, points per 100 possessions</span>${chipR(rankIn((q) => IMPACT.values.get(q.id) ?? null))}</div>
<div class="tile"><span class="label">On / off swing</span><span class="big">${sgn(oo.swing)}</span><span class="sub">team margin per 100, on v off</span>${chipR(oo.swing == null ? null : rankIn((q) => onOffOf(q.id)?.swing ?? null))}</div>
<div class="tile"><span class="label">All-round</span><span class="big">${f1(p.pirpg)}</span><span class="sub">PIR per game</span>${chip('pirpg')}</div>
</div>` : `<div class="tiles">
<div class="tile"><span class="label">Scoring</span><span class="big">${f1(p.ppg)}</span><span class="sub">points per game</span>${chip('ppg')}</div>
<div class="tile"><span class="label">All-round</span><span class="big">${f1(p.pirpg)}</span><span class="sub">PIR per game</span>${chip('pirpg')}</div>
<div class="tile"><span class="label">Efficiency</span><span class="big">${f1(p.ts)}</span><span class="sub">true shooting %</span>${chip('ts')}</div>
<div class="tile"><span class="label">${fourth[1]}</span><span class="big">${f1(p[fourth[0]])}</span><span class="sub">${fourth[2]}</span>${chip(fourth[0])}</div>
</div>`;
  const teamShort = esc(teamT ? titleCase(teamT.name) : p.tv);
  const onoffCard = (oo && oo.onNet != null && oo.offNet != null) ? (() => {
    const max = Math.max(10, Math.abs(oo.onNet), Math.abs(oo.offNet));
    const bar = (v) => `<div class="oo-track"><span class="oo-mid"></span><span class="oo-fill ${v >= 0 ? 'up' : 'down'}" style="${v >= 0 ? 'left:50%' : `right:50%`};width:${(50 * Math.abs(v) / max).toFixed(1)}%"></span></div>`;
    return `<section class="card oo"><h2>${teamShort} with him, and without him</h2><p class="muted">Points the team wins or loses by per 100 possessions, in the games he played.</p>
<div class="oo-row"><div><strong>On the floor</strong><span class="muted small">${Math.round(oo.onMin)} minutes</span></div>${bar(oo.onNet)}<span class="oo-val ${oo.onNet >= 0 ? 'pos' : 'neg'}">${sgn(oo.onNet)}</span></div>
<div class="oo-row"><div><strong>On the bench</strong><span class="muted small">${Math.round(oo.offMin)} minutes</span></div>${bar(oo.offNet)}<span class="oo-val ${oo.offNet >= 0 ? 'pos' : 'neg'}">${sgn(oo.offNet)}</span></div>
${oo.offMin < 30 ? '<p class="muted small">Few bench minutes so far, so the "without him" number is a small sample.</p>' : ''}</section>`;
  })() : '';

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

  const tileData = (oo && imp != null)
    ? [['Scoring', f1(p.ppg), 'points per game', isQual ? r.ppg : null], ['Impact', sgn(imp), 'RAPM per 100 poss', rankIn((q) => IMPACT.values.get(q.id) ?? null)?.r], ['On / off', sgn(oo.swing), 'margin per 100, on v off', oo.swing == null ? null : rankIn((q) => onOffOf(q.id)?.swing ?? null)?.r], ['All-round', f1(p.pirpg), 'PIR per game', isQual ? r.pirpg : null]]
    : [['Scoring', f1(p.ppg), 'points per game', isQual ? r.ppg : null], ['All-round', f1(p.pirpg), 'PIR per game', isQual ? r.pirpg : null], ['Efficiency', f1(p.ts), 'true shooting %', isQual ? r.ts : null], [fourth[1], f1(p[fourth[0]]), fourth[2], isQual ? r[fourth[0]] : null]];
  const shareJson = JSON.stringify({
    site: cfg.siteName, season: `${cfg.seasonLabel}, ${roundLine.toLowerCase()}`, kicker: kicker.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'), name: p.name, number: num ? String(num).replace(/^0+(?=\d)/, '') : '',
    crest: crests.get(p.team) || null,
    meta: [teamT ? titleCase(teamT.name) : p.tv, position, age != null ? `${age} years` : null].filter(Boolean).join('  ·  '),
    lede: `Averages ${f1(p.ppg)} points, ${f1(p.rpg)} rebounds and ${f1(p.apg)} assists in ${f1(p.mpg)} minutes, at ${f1(p.ts)}% true shooting. His team is ${wonWith}–${log.length - wonWith} when he plays.`,
    tiles: tileData.map(([label, value, sub, rk]) => ({ label, value, sub, rank: rk ? `${ord(rk)} in the league` : '', hot: rk != null && rk <= 3 })),
    games: log.slice(0, 8).reverse().map((g) => ({ pts: g.line.pts, opp: g.opp.tv, win: g.win })),
    gbgNote: `Points in his last ${Math.min(8, log.length)} games. Red = win.`,
    footer: 'Calculated from the official EuroLeague box scores and play-by-play.',
    file: `${p.name.replace(/[^A-Za-z0-9]+/g, '-')}-HTA-LAB.png`
  }).replace(/</g, '\\u003c');
  writePage(`player-${safe(p.id)}.html`, p.name, `
${tiles}
<div class="row">${onoffCard}${gbg}</div>
<div class="row">${pctlCard}</div>
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
${log.map((g) => { const l = g.line; return `<tr><td>${esc(g.date)}</td><td class="num">${g.round}</td><td><a href="${teamHref(g.opp.code)}"><span class="muted">${g.isHome ? 'vs' : 'at'}&nbsp;</span>${badge(g.opp.code, g.opp.tv)}${esc(g.opp.tv)}</a></td><td><a class="${g.win ? 'pos' : 'neg'}" href="${gameHref(g.gameCode)}">${g.win ? 'W' : 'L'} ${g.for}–${g.against} ›</a></td>
<td class="num">${mmss(l.min)}${l.starter ? '<span class="muted">*</span>' : ''}</td><td class="num"><strong>${l.pts}</strong></td><td class="num">${l.fgm2}/${l.fga2}</td><td class="num">${l.fgm3}/${l.fga3}</td><td class="num">${l.ftm}/${l.fta}</td><td class="num">${l.reb}</td><td class="num">${l.ast}</td><td class="num">${l.stl}</td><td class="num">${l.tov}</td><td class="num">${l.blk}</td><td class="num">${l.pf}</td><td class="num">${l.pm > 0 ? '+' : ''}${l.pm}</td><td class="num">${l.pir}</td></tr>`; }).join('')}
</tbody></table></div><p class="muted small">* started the game.</p></section>
<script type="application/json" id="share-data">${shareJson}</script>`, 'players.html', hero, { scripts: `<script src="share.js?v=${assetVersion()}" defer></script>` });
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
<h2>On/off, lineups and impact</h2>
<p>From the official play-by-play we track exactly which ten players are on the court at every moment. A game is only used if this reproduces the official final score and every player's official +/- and minutes; otherwise it is left out of these numbers.</p>
<dl>
<dt>On / off</dt><dd>The team's points scored minus points allowed per 100 possessions with the player on the court, and with him on the bench, in the games he played. The swing is the difference.</dd>
<dt>Lineups</dt><dd>The same, for each five-man group that played together.</dd>
<dt>Impact rating (RAPM)</dt><dd>Regularised adjusted plus-minus: a ridge regression over every stint of the season that estimates how many points per 100 possessions each player adds, after accounting for his teammates and opponents. It is pulled towards zero on purpose, so early in the season most values are small. Players with fewer than 150 possessions are not rated.</dd>
</dl>
<h2>Leaderboards</h2>
<p>${qualNote}</p>
</section>`, 'method.html', cover({ kicker: 'Methodology', title: 'How we calculate', lede: 'Every number on this site comes from the official EuroLeague box scores. Nothing is typed in by hand, and every game is checked before it is published.' }));


// ---- Lineups tool data: one row per team, game and lineup (stints merged) ----
if (PBP) {
  const K = BOX_KEYS.filter((k) => k !== 'pts');
  const rows = new Map();
  for (const { game, stints } of pbpOk) {
    const A = game.home.code, B = game.away.code;
    for (const st of stints) {
      for (const [code, opp, ids, isHome, won] of [[A, B, st.home, 1, game.home.score > game.away.score ? 1 : 0], [B, A, st.away, 0, game.away.score > game.home.score ? 1 : 0]]) {
        const key = `${game.gameCode}|${code}|${ids.join(',')}`;
        if (!rows.has(key)) rows.set(key, { code, ids, g: game.gameCode, isHome, won, secs: 0, me: Object.fromEntries(K.map((k) => [k, 0])), op: Object.fromEntries(K.map((k) => [k, 0])) });
        const r = rows.get(key); r.secs += st.secs;
        for (const k of K) { r.me[k] += st.box[code][k]; r.op[k] += st.box[opp][k]; }
      }
    }
  }
  const usedIds = new Set([...rows.values()].flatMap((r) => r.ids));
  const out = {
    keys: K,
    players: Object.fromEntries(players.filter((q) => usedIds.has(q.id)).map((q) => [q.id, [q.name, q.tv, playerHref(q.id)]])),
    teams: Object.fromEntries(teams.map((t) => [t.code, [t.tv, titleCase(t.name), crests.get(t.code) || null, teamHref(t.code)]])),
    games: Object.fromEntries(pbpOk.map(({ game }) => [game.gameCode, [game.date, game.round]])),
    rows: [...rows.values()].map((r) => [r.code, r.ids.join(','), r.g, r.isHome, r.won, r.secs, ...K.map((k) => r.me[k]), ...K.map((k) => r.op[k])]),
    note: `${pbpOk.length} of ${rawPbp.size} games`
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'lineups.json'), JSON.stringify(out));
}
writePage('lineups.html', 'Lineups', `<div id="lineups-app"><p class="muted">Loading…</p></div>`, 'lineups.html',
  cover({ kicker: esc(roundLine), title: 'Lineups', lede: 'Every five-man unit, and every 2-, 3- and 4-man combination, built from the official play-by-play. Filter, sort any column, and switch between totals, per game, per 40 minutes and per 100 possessions.' }),
  { scripts: `<script src="lineups.js?v=${assetVersion()}" defer></script>` });

// ---- Live games (read from the official live feed in the browser) ----
writePage('live.html', 'Live', `<div id="live-app"><p class="muted">Connecting to the EuroLeague live feed…</p></div>
<script type="application/json" id="live-config">${JSON.stringify({
  season: cfg.seasonCode,
  firstCode: Math.max(0, ...games.map((g) => Number(g.gameCode) || 0)) + 1,
  schedule: upcoming.slice(0, 40).map((x) => ({ c: Number(x.c), r: x.r, utc: x.utc, ok: x.ok, venue: x.venue ? titleCase(x.venue) : '', h: x.h, a: x.a })),
  crests: Object.fromEntries([...crests]),
  players: Object.fromEntries(players.map((q) => [q.id, playerHref(q.id)]))
}).replace(/</g, '\\u003c')}</script>`, 'live.html',
  cover({ kicker: 'Live', title: 'Live games', lede: 'Follow any EuroLeague game as it happens: score, box scores, who is on the court, game flow and every play, straight from the official live feed.' }),
  { scripts: `<script type="module" src="live.js?v=${assetVersion()}"></script>` });

// ---- Glossary ----
{
  const all = GLOSSARY.flatMap(([, items]) => items);
  const live = all.filter((x) => x[5] === 'live').length;
  writePage('glossary.html', 'Glossary', `
<section class="card"><div class="gl-bar"><input type="search" id="gl-q" placeholder="Search: TS%, usage, rebound…" aria-label="Search the glossary">
<div class="tabs" role="group" aria-label="Show"><button type="button" data-gl="all" aria-pressed="true">All</button><button type="button" data-gl="live" aria-pressed="false">On HTA LAB</button><button type="button" data-gl="soon" aria-pressed="false">Coming</button></div></div></section>
${GLOSSARY.map(([section, items]) => `<section class="card gl-sec"><h2>${esc(section)}</h2><dl class="gl">
${items.map(([ab, name, def, formula, where, status]) => `<div class="gl-item" data-status="${status}" data-text="${esc((ab + ' ' + name + ' ' + def).toLowerCase())}"><dt><span class="gl-ab">${esc(ab)}</span><span class="gl-name">${esc(name)}</span><span class="chip ${status === 'live' ? 'hot' : ''}">${status === 'live' ? 'On HTA LAB' : 'Coming'}</span></dt>
<dd><p>${esc(def)}</p>${formula ? `<code>${esc(formula)}</code>` : ''}<p class="muted small">${status === 'live' ? 'Where: ' : ''}${esc(where)}</p></dd></div>`).join('')}
</dl></section>`).join('')}
<p class="muted small">${live} of ${all.length} stats are on HTA LAB today. Formulas in detail: <a href="method.html">How we calculate</a>.</p>
<script>(function(){var q=document.getElementById('gl-q'),mode='all';function f(){var t=q.value.toLowerCase();document.querySelectorAll('.gl-item').forEach(function(i){i.hidden=!((mode==='all'||i.dataset.status===mode)&&(!t||i.dataset.text.indexOf(t)>-1));});document.querySelectorAll('.gl-sec').forEach(function(s){s.hidden=!s.querySelector('.gl-item:not([hidden])');});}
q.addEventListener('input',f);document.querySelectorAll('[data-gl]').forEach(function(b){b.addEventListener('click',function(){mode=b.dataset.gl;document.querySelectorAll('[data-gl]').forEach(function(x){x.setAttribute('aria-pressed',x===b);});f();});});})();</script>`,
  'glossary.html', cover({ kicker: 'Reference', title: 'Glossary', lede: `Every stat in basketball analytics, explained in plain words with its formula. ${live} of ${all.length} are already on HTA LAB; the rest are marked as coming.` }));
}

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
    try { const o = JSON.parse(text); if (![1, 2].includes(o.v) || !o.iv || !o.ct) throw new Error('not an encrypted document'); }
    catch (e) { console.warn(`Skipping internal/${f}: ${e.message}`); continue; }
    writeFileSync(join(OUT, 'internal', f), text);
  }
  // Encrypted file parts (binary). Published only if their description file is published.
  const partFiles = existsSync('internal') ? readdirSync('internal').filter((f) => /^[a-z0-9][a-z0-9-]{0,80}-\d{1,3}\.part$/.test(f)) : [];
  for (const f of partFiles) {
    const owner = f.replace(/-\d{1,3}\.part$/, '.enc');
    if (encFiles.includes(owner)) copyFileSync(join('internal', f), join(OUT, 'internal', f));
  }
  const published = encFiles.filter((f) => existsSync(join(OUT, 'internal', f)));
  writeFileSync(join(OUT, 'internal', 'index.json'), JSON.stringify(published));
  // Warn loudly if anything that is not an encrypted document was put in the folder.
  if (existsSync('internal')) for (const f of readdirSync('internal')) {
    if (f !== 'README.md' && !f.endsWith('.enc') && !f.endsWith('.part')) console.warn(`WARNING: internal/${f} is not an encrypted .enc file. It is NOT published, but it IS visible in the public GitHub repository. Delete it there.`);
  }
  // The repository is taken from GitHub Actions when building there, so the site keeps working if it moves.
  const REPO = process.env.GITHUB_REPOSITORY || IC.repo;
  const BRANCH = process.env.GITHUB_REF_NAME || 'main';
  const clientCfg = JSON.stringify({ salt: IC.salt, iterations: IC.iterations, uploadUrl: `https://github.com/${REPO}/upload/${BRANCH}/internal`, repo: REPO, branch: BRANCH, categories: IC.categories, teams: teams.map((t) => titleCase(t.name)).sort() }).replace(/</g, '\\u003c');
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
copyFileSync('static/lineups.js', join(OUT, 'lineups.js'));
copyFileSync('static/teams.js', join(OUT, 'teams.js'));
copyFileSync('static/teambox.js', join(OUT, 'teambox.js'));
copyFileSync('static/share.js', join(OUT, 'share.js'));
copyFileSync('static/game.js', join(OUT, 'game.js'));
copyFileSync('static/mvp.js', join(OUT, 'mvp.js'));
copyFileSync('static/boards.js', join(OUT, 'boards.js'));
copyFileSync('static/live.js', join(OUT, 'live.js'));
mkdirSync(join(OUT, 'lib'), { recursive: true });
for (const f of ['parse.mjs', 'pbp.mjs', 'game.mjs']) copyFileSync(join('lib', f), join(OUT, 'lib', f));
writeFileSync(join(OUT, 'players.json'), JSON.stringify(players.map((p) => ({
  id: p.id, name: p.name, team: teamName.get(p.team) ? titleCase(teamName.get(p.team)) : p.team, tv: p.tv, gp: p.gp,
  stats: [['PTS', p.ppg], ['REB', p.rpg], ['AST', p.apg], ['STL', p.spg], ['BLK', p.bpg], ['PIR', p.pirpg], ['MIN', p.mpg], ['TS%', p.ts], ['USG%', p.usg]].map(([k, v]) => [k, f1(v)])
}))));
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`✓ Site written to ${OUT}/ (${teams.length} teams, ${players.length} players)`);

function boardsJson() {
  const isQ = new Set(qual.map((q) => q.id));
  const PK = [...new Set(BOARD_REG.flatMap((b) => (b.parts || []).map(([k]) => k)))];
  const rnd = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  return JSON.stringify({
    boards: BOARD_REG.map((b) => ({ id: b.id, fmt: b.fmt, asc: b.asc, all: b.all, parts: b.parts ? b.parts.map(([k, l, c]) => [PK.indexOf(k), l, c]) : null })),
    teams: teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.code, titleCase(t.name)]),
    players: players.map((p) => [p.name, p.tv, p.team, playerHref(p.id), findPerson(peopleIndex, p)?.position || '', p.gp, +p.mpg.toFixed(1), isQ.has(p.id) ? 1 : 0,
      BOARD_REG.map((b) => rnd(b.val(p))), PK.map((k) => rnd(p[k]))])
  }).replace(/</g, '\\u003c');
}

function writePage(file, title, body, active, hero, extra = {}) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), page({ title, cfg, info, active, sample, body, hero, ...extra }));
}
