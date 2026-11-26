// Downloads Lega Basket Serie A (Italy) from the league's official site, legabasket.it: the season calendar
// and, for every finished game, the box score and play-by-play. Each game is converted to the EuroLeague
// feed shape and saved to data/raw/LBA<year>/<gameId>.json.
//
//   node scripts/fetch-lba.mjs 2026     -> 2026-27 season (the league names seasons by their start year)
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { convertLba } from '../lib/lba.mjs';

const year = process.argv[2] || '2026';
const BASE = 'https://www.legabasket.it/api';
const LOGO = (k) => (k ? `https://lba-media.s3.eu-south-1.amazonaws.com/variants/${k}/large` : null);
const OUT = join('data', 'raw', 'LBA' + year);
const DELAY_MS = 400, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'application/json' };
async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (err) { if (i === tries) throw new Error(`${url}: ${err.message}`); await sleep(3000 * i); }
  }
}
const list = (x) => (Array.isArray(x) ? x : Object.values(x || {}).find(Array.isArray) || []);

await mkdir(OUT, { recursive: true });
const champs = list(await getJson(`${BASE}/championships/get-championships?s=${year}&cs_id=1&items=1000`));
const rs = champs.find((c) => c.ctype_code === 'RS') || champs[0];
if (!rs) { console.error('No Serie A regular season found.'); process.exit(1); }
const matches = [];
for (let d = 1; d <= 40; d++) {
  const c = await getJson(`${BASE}/championships/get-championships-calendar-by-id?id=${rs.id}&d=${d}`).catch(() => null);
  await sleep(DELAY_MS);
  const ms = c?.matches || [];
  if (!ms.length || (d > 1 && ms[0].number !== d && matches.some((m) => m.id === ms[0].id))) break;
  for (const m of ms) if (!matches.some((x) => x.id === m.id)) matches.push(m);
}
const team = (m, h) => ({ code: h ? m.h_club_code : m.v_club_code, name: h ? m.h_team_name : m.v_team_name, teamId: h ? m.h_team_id : m.v_team_id, logo: LOGO(h ? m.home_logo_key : m.v_logo_key) });
const clubs = new Map();
for (const m of matches) for (const h of [true, false]) { const t = team(m, h); if (t.code && !clubs.has(t.code)) clubs.set(t.code, t); }
await writeFile(join(OUT, '_clubs.json'), JSON.stringify([...clubs.values()].map((t) => ({ code: t.code, name: t.name, tvCode: t.code, crest: t.logo }))));
const played = (m) => String(m.game_status) === '2';
const utc = (m) => { const s = String(m.match_datetime || ''); if (!s) return null; const d = new Date(s.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(s) ? s : s + '+01:00'); return isNaN(d) ? null : d.toISOString().replace('.000Z', 'Z'); };
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(matches.map((m) => ({ c: m.id, r: m.number, rn: 'Round ' + m.number, utc: utc(m), ok: true, played: played(m),
  h: { code: m.h_club_code, tv: m.h_club_code, name: m.h_team_name }, a: { code: m.v_club_code, tv: m.v_club_code, name: m.v_team_name }, venue: [m.plant_name, m.town_name].filter(Boolean).join(', ') }))));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const m of matches.filter(played)) {
  const file = `${m.id}.json`; keep.add(file);
  const age = (Date.now() - Date.parse(m.match_datetime)) / 86400000;
  if (age > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  try {
    const scores = await getJson(`${BASE}/championships/get-championships-matches-scores-by-id?id=${m.id}&info=true`); await sleep(DELAY_MS);
    const pbp = await getJson(`${BASE}/championships/get-championships-matches-play-by-play?id=${m.id}&info=true&sort=asc`).catch(() => null); await sleep(DELAY_MS);
    const d = String(m.match_datetime).slice(0, 10).split('-');
    const raw = convertLba(scores, pbp, { gameId: m.id, date: `${d[2]}/${d[1]}/${d[0]}`, round: m.number, home: team(m, true), away: team(m, false) }, 'LBA' + year);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${m.id}: ${err.message}`); failed++; keep.delete(file); }
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
console.log(`Done: ${matches.filter(played).length} played Serie A games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${matches.length} games in the calendar`);
