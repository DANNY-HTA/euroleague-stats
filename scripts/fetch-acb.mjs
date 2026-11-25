// Downloads the Liga Endesa (ACB, Spain) from the league's public match pages (acb.com / live.acb.com):
// the season calendar and, for every finished game, the box score and play-by-play. Each game is converted
// to the EuroLeague feed shape and saved to data/raw/ACB<year>/<gameId>.json. acb.com's robots.txt allows this.
//
//   node scripts/fetch-acb.mjs 2026     -> 2026-27 season
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { flight, jsonAfter, convertAcb } from '../lib/acb.mjs';

const year = process.argv[2] || '2026';
const OUT = join('data', 'raw', 'ACB' + year);
const DELAY_MS = 300, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'text/html' };
async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    catch (err) { if (i === tries) throw new Error(`${url}: ${err.message}`); await sleep(4000 * i); }
  }
}

await mkdir(OUT, { recursive: true });
const calHtml = await get('https://acb.com/es/calendario');
const F = flight(calHtml);
const rAt = F.indexOf('"rounds":[');
const tAt = F.lastIndexOf('"teams":[', rAt);
const teams = tAt >= 0 ? jsonAfter(F.slice(tAt), 'teams', '[') : null;
const rounds = jsonAfter(F.slice(rAt), 'rounds', '[');
if (!teams || !rounds) { console.error('ACB calendar not found (the page layout may have changed).'); process.exit(1); }
const team = (ref) => { const i = Number(String(ref).split(':').pop()); const t = typeof ref === 'object' ? ref : teams[i]; return t ? { code: t.abbreviatedName, name: t.fullName, crest: t.logo } : null; };
const slugOf = new Map([...new Set(calHtml.match(/partidos\/[a-z0-9-]+-\d{5,}/g) || [])].map((s) => [Number(s.match(/(\d+)$/)[1]), s]));
const matches = rounds.flatMap((r) => (r.matches || []).map((m) => ({ ...m, round: r.roundNumber, h: team(m.homeTeam), a: team(m.awayTeam) }))).filter((m) => m.h && m.a);
await writeFile(join(OUT, '_clubs.json'), JSON.stringify(teams.map((t) => ({ code: t.abbreviatedName, name: t.fullName, tvCode: t.abbreviatedName, crest: /^https:\/\//.test(t.logo || '') ? t.logo : null }))));
const played = (m) => m.matchStatus === 'FINALIZED';
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(matches.map((m) => ({ c: m.id, r: m.round, rn: 'Round ' + m.round, utc: m.startDateTime || null, ok: !!m.startDateTime, played: played(m),
  h: { code: m.h.code, tv: m.h.code, name: m.h.name }, a: { code: m.a.code, tv: m.a.code, name: m.a.name }, venue: '' }))));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const m of matches.filter(played)) {
  const file = `${m.id}.json`; keep.add(file);
  const age = (Date.now() - Date.parse(m.startDateTime)) / 86400000;
  if (age > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  const slug = slugOf.get(m.id) || `partidos/x-vs-y-${m.id}`;
  try {
    const plays = await get(`https://live.acb.com/es/${slug}/jugadas`); await sleep(DELAY_MS);
    const stats = await get(`https://live.acb.com/es/${slug}/estadisticas`); await sleep(DELAY_MS);
    const d = String(m.startDateTime).slice(0, 10).split('-');
    const raw = convertAcb(stats, plays, { gameId: m.id, date: `${d[2]}/${d[1]}/${d[0]}`, round: m.round, home: m.h, away: m.a }, 'ACB' + year);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${m.id}: ${err.message}`); failed++; keep.delete(file); }
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
console.log(`Done: ${matches.filter(played).length} played ACB games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${matches.length} games in the calendar`);
