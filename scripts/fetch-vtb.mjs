// Downloads the VTB United League from Infobasket (org.infobasket.su), the public data service behind
// vtb-league.com's schedule and game pages: the season calendar and, for every finished game, box score + play-by-play.
//
//   node scripts/fetch-vtb.mjs 2026     -> 2026-27 season
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { convertVtb } from '../lib/vtb.mjs';

const year = Number(process.argv[2] || 2026);
const LEAGUE_ID = { 2026: 55613 }[year];
if (!LEAGUE_ID) { console.error(`No Infobasket league id known for ${year}`); process.exit(1); }
const OUT = join('data', 'raw', 'VTB' + year);
const B = 'https://org.infobasket.su';
const DELAY_MS = 1000, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'application/json', Referer: 'https://vtb-league.com/' };
async function getJson(url) {
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch(url, { headers: HEAD }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (err) { if (i === 4) throw new Error(`${url}: ${err.message}`); await sleep(4000 * i); }
  }
}
const C = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ms = (s) => Number(String(s || '').match(/-?\d+/)?.[0]) || null;

await mkdir(OUT, { recursive: true });
const cal = (await getJson(`${B}/Comp/GetCalendar/?comps=${LEAGUE_ID}&format=json&lang=en`)).filter((g) => g.TeamAid && g.TeamBid);
const teams = new Map();
for (const g of cal) { teams.set(g.TeamAid, { code: C(g.ShortTeamNameAen), name: g.CompTeamNameAen || g.ShortTeamNameAen, crest: g.TeamLogoA }); teams.set(g.TeamBid, { code: C(g.ShortTeamNameBen), name: g.CompTeamNameBen || g.ShortTeamNameBen, crest: g.TeamLogoB }); }
const perRound = Math.max(1, Math.floor(teams.size / 2));
const roundOf = (g) => { const k = Number(String(g.GameNumber).match(/(\d+)$/)?.[1]); return k ? Math.ceil(k / perRound) : 0; };
await writeFile(join(OUT, '_clubs.json'), JSON.stringify([...teams.values()].map((t) => ({ code: t.code, name: t.name, tvCode: t.code, crest: /^https:\/\//.test(t.crest || '') ? t.crest : null }))));
const utc = (g) => { const t = ms(g.GameDateTimeMoscow) ?? ms(g.GameDateTime); return t ? new Date(t - 3 * 3600e3).toISOString() : null; }; // Moscow time (UTC+3) -> UTC
const played = (g) => g.GameStatus === 1;
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(cal.map((g) => { const h = teams.get(g.TeamAid), a = teams.get(g.TeamBid); return { c: g.GameID, r: roundOf(g), rn: 'Round ' + roundOf(g), utc: utc(g), ok: !!g.HasTime, played: played(g),
  h: { code: h.code, tv: h.code, name: h.name }, a: { code: a.code, tv: a.code, name: a.name }, venue: [g.ArenaEn, g.RegionEn].filter(Boolean).join(', ') }; })));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const g of cal.filter(played)) {
  const file = `${g.GameID}.json`; keep.add(file);
  const when = utc(g);
  if (when && (Date.now() - Date.parse(when)) / 86400000 > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  try {
    const online = await getJson(`${B}/Widget/GetOnline/${g.GameID}?format=json&lang=en`);
    const raw = convertVtb(online, { gameId: g.GameID, round: roundOf(g), utc: when, home: teams.get(g.TeamAid), away: teams.get(g.TeamBid) }, 'VTB' + year);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${g.GameID}: ${err.message}`); failed++; keep.delete(file); }
  await sleep(DELAY_MS);
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
console.log(`Done: ${cal.filter(played).length} played VTB games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${cal.length} games in the calendar`);
