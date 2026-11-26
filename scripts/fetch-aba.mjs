// Downloads the ABA League (Adriatic) from the league's own site, aba-liga.com: the season calendar and, for every
// finished game, its match page (box score + play-by-play). The site asks crawlers to wait 2 s between requests.
//
//   node scripts/fetch-aba.mjs 2026     -> 2026-27 season (aba-liga.com season id 26)
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAbaCalendar, convertAba } from '../lib/aba.mjs';

const year = Number(process.argv[2] || 2026);
const SEASON_ID = year - 2000; // 2026-27 -> 26
const OUT = join('data', 'raw', 'ABA' + year);
const DELAY_MS = 2500, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'text/html' };
async function get(url) {
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    catch (err) { if (i === 4) throw new Error(`${url}: ${err.message}`); await sleep(4000 * i); }
  }
}

await mkdir(OUT, { recursive: true });
const cal = parseAbaCalendar(await get('https://www.aba-liga.com/calendar/'), SEASON_ID).filter((g) => g.home.code && g.away.code);
const teams = new Map(); for (const g of cal) for (const t of [g.home, g.away]) if (!teams.has(t.code)) teams.set(t.code, t.name);
await writeFile(join(OUT, '_clubs.json'), JSON.stringify([...teams].map(([code, name]) => ({ code, name, tvCode: code, crest: null }))));
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(cal.map((g) => ({ c: g.id, r: g.round, rn: g.label, utc: g.utc, ok: g.ok, played: g.played,
  h: { code: g.home.code, tv: g.home.code, name: g.home.name }, a: { code: g.away.code, tv: g.away.code, name: g.away.name }, venue: '' }))));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const g of cal.filter((x) => x.played && x.box)) {
  const file = `${g.id}.json`; keep.add(file);
  if (g.utc && (Date.now() - Date.parse(g.utc)) / 86400000 > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  try {
    await sleep(DELAY_MS);
    const raw = convertAba(await get(g.box), { gameId: g.id, round: g.round, utc: g.utc, home: g.home, away: g.away }, 'ABA' + year);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${g.id}: ${err.message}`); failed++; keep.delete(file); }
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
console.log(`Done: ${cal.filter((x) => x.played).length} played ABA games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${cal.length} games in the calendar`);
