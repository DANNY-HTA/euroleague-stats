// Players in more than one competition (e.g. EuroLeague + Winner League, EuroCup + Serie A): adds a
// "Stats in every competition" table to each of their player pages, in every league section.
// Runs after all league builds; reads each section's player-stats.json and edits the player pages in place.
//
// The same person is found by name (accents, case and first/last order ignored) and, where both leagues
// know it, the same age. A name shared by two players in one league is left out rather than guessed.
//
//   node scripts/build-cross.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../lib/render.mjs';

const base = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const SITE = 'site';
const LEAGUES = [['el', { shortName: 'EuroLeague', leagueName: 'EuroLeague', leagueLogo: base.leagueLogo }], ...Object.entries(base.leagues || {})];
const dirOf = (k) => (k === 'el' ? SITE : join(SITE, k));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase()
  .replace(/[^a-z\s'-]/g, ' ').replace(/['-]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

// 1) Every player of every league
const all = []; // { lg, key, name, team, teamName, href, age, gp, min, pm, t:{...totals} }
for (const [k, L] of LEAGUES) {
  const f = join(dirOf(k), 'player-stats.json');
  if (!existsSync(f)) continue;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const teamName = new Map((d.teams || []).map((t) => [t[0], t[1]]));
  for (const p of d.players) {
    const [name, tv, team, href, , , , age, , , gp, gs, min, pm, , totals] = p;
    if (!gp) continue;
    const t = Object.fromEntries(d.tk.map((x, i) => [x, totals[i] || 0]));
    all.push({ lg: k, L, key: norm(name), name, team, teamName: teamName.get(team) || tv || team, href, age, gp, gs, min, pm, t });
  }
}

// 2) Group by name; split into people by age; drop names that are ambiguous within one league
const byName = new Map();
for (const e of all) { if (!byName.has(e.key)) byName.set(e.key, []); byName.get(e.key).push(e); }
const people = [];
for (const list of byName.values()) {
  if (new Set(list.map((e) => e.lg)).size < 2) continue;
  const perLeague = new Map(); for (const e of list) perLeague.set(e.lg, (perLeague.get(e.lg) || 0) + 1);
  if ([...perLeague.values()].some((n) => n > 1)) continue; // two different players with this name in one league
  const groups = [];
  for (const e of list.sort((a, b) => (a.age == null) - (b.age == null))) {
    const g = groups.find((gr) => gr.every((x) => x.age == null || e.age == null || Math.abs(x.age - e.age) <= 1));
    if (g) g.push(e); else groups.push([e]);
  }
  for (const g of groups) if (new Set(g.map((e) => e.lg)).size >= 2) people.push(g);
}

// 3) The table, then write it into each of the person's pages
const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
const pct = (m, a) => (a ? (100 * m / a).toFixed(1) : '–');
const sg = (v) => (v == null || !Number.isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
const order = new Map(LEAGUES.map(([k], i) => [k, i]));
function rowCells(t, gp, min, pm) {
  const fga = t.fga2 + t.fga3, tsa = fga + 0.44 * t.fta, pg = (k) => t[k] / gp;
  return [gp, f1(min / gp), f1(pg('pts')), f1(pg('reb')), f1(pg('ast')), f1(pg('stl')), f1(pg('blk')), f1(pg('tov')),
    pct(t.fgm2, t.fga2), pct(t.fgm3, t.fga3), pct(t.ftm, t.fta), tsa ? (100 * t.pts / (2 * tsa)).toFixed(1) : '–', f1(pg('pir')), sg(pm / gp)];
}
const HEAD = ['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV', '2P%', '3P%', 'FT%', 'TS%', 'PIR', '+/-'];
function section(group, current) {
  const fromRoot = current.lg === 'el' ? '' : '../';
  const link = (e) => fromRoot + (e.lg === 'el' ? '' : e.lg + '/') + e.href;
  const lgLink = (e) => fromRoot + (e.lg === 'el' ? 'euroleague.html' : e.lg + '/index.html');
  const rows = [...group].sort((a, b) => order.get(a.lg) - order.get(b.lg));
  const tot = { gp: 0, min: 0, pm: 0, t: {} };
  for (const e of rows) { tot.gp += e.gp; tot.min += e.min; tot.pm += e.pm; for (const [k, v] of Object.entries(e.t)) tot.t[k] = (tot.t[k] || 0) + v; }
  const logo = (e) => (e.L.leagueLogo ? `<img src="${esc(e.L.leagueLogo)}" alt="" width="22" height="22" loading="lazy">` : '');
  return `<section class="card cross-comp" id="competitions"><h2>Stats in every competition</h2>
<p class="muted">${esc(current.name)} plays in ${rows.length} competitions this season. Per game in each; the last row combines them all.</p>
<div class="scroll"><table class="cross-table"><thead><tr><th scope="col">Competition</th><th scope="col">Team</th>${HEAD.map((h) => `<th scope="col" class="num">${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((e) => `<tr${e === current ? ' class="here"' : ''}><td><a class="cc-lg" href="${esc(lgLink(e))}">${logo(e)}<span>${esc(e.L.shortName || e.L.leagueName || e.lg)}</span></a></td><td>${e === current ? esc(e.teamName) : `<a href="${esc(link(e))}">${esc(e.teamName)}</a>`}</td>${rowCells(e.t, e.gp, e.min, e.pm).map((c) => `<td class="num">${c}</td>`).join('')}</tr>`).join('')}
</tbody><tfoot><tr><th scope="row" colspan="2">All competitions</th>${rowCells(tot.t, tot.gp, tot.min, tot.pm).map((c) => `<td class="num">${c}</td>`).join('')}</tr></tfoot></table></div>
<p class="muted small">Matched by name${group.some((e) => e.age != null) ? ' and age' : ''} across the leagues' official data. Click a team to open his page in that competition.</p></section>`;
}

let pages = 0;
for (const g of people) for (const e of g) {
  const file = join(dirOf(e.lg), e.href);
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<section class="card cross-comp" id="competitions">[\s\S]*?<\/section>\n?/, '');
  const sec = section(g, e) + '\n';
  const at = html.indexOf('<section class="card"><h2>Game log</h2>');
  if (at > 0) html = html.slice(0, at) + sec + html.slice(at);
  else { const m = html.lastIndexOf('</main>'); if (m < 0) continue; html = html.slice(0, m) + sec + html.slice(m); }
  writeFileSync(file, html); pages++;
}
const pairs = new Map(); for (const g of people) { const k = [...new Set(g.map((e) => e.lg))].sort((a, b) => order.get(a) - order.get(b)).join(' + '); pairs.set(k, (pairs.get(k) || 0) + 1); }
console.log(`✓ Players in more than one competition: ${people.length} (${pages} player pages updated) — ${[...pairs].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(', ')}`);

// Injury report and the next EuroLeague opponent's domestic games (needs every league's gamelog.json)
await import('./build-availability.mjs');
