// Downloads the easyCredit Basketball Bundesliga (Germany) from the league's public game pages
// (easycredit-bbl.de/spiele/<id>, which embed the box score and play-by-play). Game ids are consecutive within
// a season, so the season's id range is scanned once and remembered in _index.json; afterwards only games that
// have been played since, or are still to be played, are looked at again.
//
//   node scripts/fetch-bbl.mjs 2026     -> 2026-27 season
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { convertBbl } from '../lib/bbl.mjs';

const year = process.argv[2] || '2026';
const OUT = join('data', 'raw', 'BBL' + year);
const FIRST = Number(process.env.BBL_FIRST || 2006400), LAST = Number(process.env.BBL_LAST || 2007050);
const DELAY_MS = 500, DAY = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'text/html' };
async function page(id) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`https://www.easycredit-bbl.de/spiele/${id}`, { headers: HEAD });
      const t = await r.text();
      const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      const pp = m && JSON.parse(m[1]).props?.pageProps;
      if (pp?.initialGameData) return pp;
      if (r.status === 404 || r.status === 400 || pp?.error) return null;
      throw new Error('HTTP ' + r.status);
    } catch (err) { if (i === 3) throw err; await sleep(3000 * i); }
  }
}

await mkdir(OUT, { recursive: true });
let index = {};
try { index = JSON.parse(await readFile(join(OUT, '_index.json'), 'utf8')); } catch { /* first run */ }
let clubs = null;
try { clubs = JSON.parse(await readFile(join(OUT, '_clubs.json'), 'utf8')); } catch { /* first run */ }
const now = Date.now();
const due = (id) => {
  const x = index[id];
  if (!x) return true;
  if (x.none) return now - x.seen > 7 * DAY;                      // no game with this id: look again weekly
  if (x.comp !== 'BBL') return false;
  if (x.st === 'OFFICIAL') return now - Date.parse(x.t) < 10 * DAY; // recently finished: corrections are possible
  return Date.parse(x.t) < now + 2 * 3600e3 || now - x.seen > 3 * DAY; // started, or the date may have moved
};
let fetched = 0, saved = 0, failed = 0;
for (let id = FIRST; id <= LAST; id++) {
  if (!due(id)) continue;
  let pp;
  try { pp = await page(id); fetched++; } catch (err) { console.warn(`  game ${id}: ${err.message}`); failed++; continue; }
  await sleep(DELAY_MS);
  if (!pp) { index[id] = { none: true, seen: now }; continue; }
  const G = pp.initialGameData;
  if (Array.isArray(pp.teamNavigatorData) && pp.teamNavigatorData.length) clubs = pp.teamNavigatorData.map((t) => { const code = String(t.tlc).toUpperCase().replace(/[^A-Z0-9]/g, ''); return { code, name: t.nameFull, tvCode: code, crest: /^https:\/\//.test(t.logoUrl || '') ? t.logoUrl : null }; });
  index[id] = { comp: G.competition, stage: G.stage, st: G.status, t: G.scheduledTime, md: G.matchDay, h: G.homeTeam?.tlc, a: G.guestTeam?.tlc, hn: G.homeTeam?.name, an: G.guestTeam?.name, venue: G.venue?.name || '', seen: now };
  if (G.competition === 'BBL' && G.status === 'OFFICIAL' && pp.initialGameStats) {
    try { await writeFile(join(OUT, `${id}.json`), JSON.stringify(convertBbl(pp, 'BBL' + year))); saved++; }
    catch (err) { console.warn(`  game ${id}: ${err.message}`); failed++; }
  }
}
await writeFile(join(OUT, '_index.json'), JSON.stringify(index));
if (clubs) await writeFile(join(OUT, '_clubs.json'), JSON.stringify(clubs));
const C = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const games = Object.entries(index).filter(([, x]) => x.comp === 'BBL').sort((a, b) => Date.parse(a[1].t) - Date.parse(b[1].t));
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(games.map(([id, x]) => ({ c: Number(id), r: x.md, rn: 'Round ' + x.md, utc: x.t || null, ok: !!x.t, played: x.st === 'OFFICIAL',
  h: { code: C(x.h), tv: C(x.h), name: x.hn }, a: { code: C(x.a), tv: C(x.a), name: x.an }, venue: x.venue }))));
const keep = new Set(['_index.json', '_clubs.json', '_schedule.json', ...games.filter(([, x]) => x.st === 'OFFICIAL').map(([id]) => `${id}.json`)]);
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
const have = (await readdir(OUT)).filter((f) => /^\d+\.json$/.test(f)).length;
console.log(`Done: ${games.length} BBL games in the season (${games.filter(([, x]) => x.st === 'OFFICIAL').length} played); ${have} saved (${saved} new), ${fetched} pages read, ${failed} failed`);
