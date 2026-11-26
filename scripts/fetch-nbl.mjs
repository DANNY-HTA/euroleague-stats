// Downloads the NBL (Australia) from the league's own match service (schedule.nbl.com.au), the data behind
// nbl.com.au's schedule and Game Centre: the season schedule and, for every finished game, box score + play-by-play.
//
//   node scripts/fetch-nbl.mjs 2026     -> 2026-27 season (NBL27)
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { convertNbl } from '../lib/nbl.mjs';

const year = Number(process.argv[2] || 2026);
const OUT = join('data', 'raw', 'NBL' + year);
const B = 'https://schedule.nbl.com.au/api/calendar';
const DELAY_MS = 800, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'application/json' };
async function getJson(url) {
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (err) { if (i === 4) throw new Error(`${url}: ${err.message}`); await sleep(3000 * i); }
  }
}
const num = (uuid) => parseInt(String(uuid).replace(/-/g, '').slice(0, 12), 16); // numeric game code, as the site expects
const C = (t) => String(t?.team_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

await mkdir(OUT, { recursive: true });
const sched = await getJson(`${B}/schedule?league=nbl&limit=500&offset=0&year=${year}`);
const list = Object.values(sched).find((v) => Array.isArray(v) && v[0]?.match_slug) || [];
// League games only: the regular season and the finals (not preseason, the Blitz or exhibition games).
const games = list.filter((m) => ['regular', 'finals', 'playoffs', 'postseason'].includes(String(m.season_type)) && m.home?.team_code && m.away?.team_code)
  .sort((a, b) => a.starts_at_ms - b.starts_at_ms);
const teams = new Map();
for (const m of games) for (const t of [m.home, m.away]) teams.set(C(t), { code: C(t), name: t.name, tvCode: C(t), crest: /^https:\/\//.test(t.logo || '') ? t.logo : null });
await writeFile(join(OUT, '_clubs.json'), JSON.stringify([...teams.values()]));
const played = (m) => m.phase === 'complete';
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(games.map((m) => ({ c: num(m.id), r: Number(String(m.round_label).match(/\d+/)?.[0]) || 0, rn: m.round_label || '', utc: new Date(m.starts_at_ms).toISOString(), ok: true, played: played(m),
  h: { code: C(m.home), tv: C(m.home), name: m.home.name }, a: { code: C(m.away), tv: C(m.away), name: m.away.name }, venue: m.venue_name || '' }))));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const m of games.filter(played)) {
  const file = `${num(m.id)}.json`; keep.add(file);
  if ((Date.now() - m.starts_at_ms) / 86400000 > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  try {
    const d = await getJson(`${B}/match?match=${m.id}&league=NBL&season=${m.season_id}`);
    const raw = convertNbl(d.match, 'NBL' + year);
    raw.gameCode = num(m.id);
    raw.header.Round = String(Number(String(m.round_label).match(/\d+/)?.[0]) || raw.header.Round);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${m.id}: ${err.message}`); failed++; keep.delete(file); }
  await sleep(DELAY_MS);
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
console.log(`Done: ${games.filter(played).length} played NBL games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${games.length} games in the calendar`);
