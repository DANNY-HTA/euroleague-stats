// Downloads the Greek Basketball League (Stoiximan GBL) from the league's own site, esake.gr:
// the results list of every round and, for every finished game, its statistics page.
//
//   node scripts/fetch-esake.mjs 2026     -> 2026-27 season
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRound, convertEsake } from '../lib/esake.mjs';

const year = Number(process.argv[2] || 2026);
const CHAMPIONSHIP = { 2026: '184645B9', 2025: '44B80BEB' }[year];
if (!CHAMPIONSHIP) { console.error(`No esake.gr championship id known for ${year}`); process.exit(1); }
const OUT = join('data', 'raw', 'GR' + year);
const DELAY_MS = 700, REFRESH_DAYS = 10;
const TEAMS = { // esake.gr team id -> code and English name
  '00000001': ['PAO', 'Panathinaikos'], '00000002': ['OLY', 'Olympiacos'], '00000005': ['ARI', 'Aris'], '0000000A': ['KOL', 'Kolossos Rodou'],
  '0000000C': ['PAOK', 'PAOK'], '0000000D': ['PER', 'Peristeri'], '0000000F': ['MAR', 'Maroussi'], '00000010': ['AEK', 'AEK Athens'], '00000011': ['IRA', 'Iraklis'],
  '0041ADCB': ['VIK', 'Vikos Falcons'], '2A25C696': ['PRO', 'Promitheas Patras'], '3CA10C07': ['LEF', 'Doxa Lefkadas'], 'B742845D': ['KAR', 'Karditsa'], 'BB4B460F': ['MYK', 'Mykonos']
};
const team = (id) => ({ id, code: TEAMS[id]?.[0] || 'T' + id.slice(-4), name: TEAMS[id]?.[1] || 'Team ' + id });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'text/html' };
async function get(path) {
  for (let i = 1; i <= 4; i++) {
    try { const r = await fetch('https://www.esake.gr' + path, { headers: HEAD }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    catch (err) { if (i === 4) throw new Error(`${path}: ${err.message}`); await sleep(3000 * i); }
  }
}

await mkdir(OUT, { recursive: true });
const games = new Map(), crests = {};
for (const phase of ['00000001', '00000002']) {
  for (let s = 1; s <= 40; s++) {
    const list = parseRound(await get(`/el/action/EsakeResults?idchampionship=${CHAMPIONSHIP}&idteam=&idseason=${phase}&series=${s}`), year);
    await sleep(DELAY_MS);
    if (!list.length) break;
    for (const g of list) { if (!games.has(g.id)) games.set(g.id, { ...g, phase }); Object.assign(crests, g.crests); }
  }
}
const all = [...games.values()].filter((g) => g.home && g.away).sort((a, b) => String(a.utc).localeCompare(String(b.utc)));
await writeFile(join(OUT, '_clubs.json'), JSON.stringify(Object.keys(crests).map((id) => { const t = team(id); return { code: t.code, name: t.name, tvCode: t.code, crest: crests[id] }; })));
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(all.map((g) => { const h = team(g.home), a = team(g.away); return { c: parseInt(g.id, 16), r: g.round, rn: (g.phase === '00000002' ? 'Phase B · ' : '') + 'Round ' + g.round, utc: g.utc, ok: !!g.utc, played: g.played,
  h: { code: h.code, tv: h.code, name: h.name }, a: { code: a.code, tv: a.code, name: a.name }, venue: g.venue }; })));

const keep = new Set(['_clubs.json', '_schedule.json']);
let fresh = 0, kept = 0, failed = 0;
for (const g of all.filter((x) => x.played)) {
  const file = `${parseInt(g.id, 16)}.json`; keep.add(file);
  if ((Date.now() - Date.parse(g.utc)) / 86400000 > REFRESH_DAYS) { try { JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; continue; } catch { /* download */ } }
  try {
    const raw = convertEsake(await get(`/el/action/EsakegameView?idgame=${g.id}&mode=3`), { gameId: g.id, round: g.round, utc: g.utc, home: team(g.home), away: team(g.away) }, 'GR' + year);
    await writeFile(join(OUT, file), JSON.stringify(raw)); fresh++;
  } catch (err) { console.warn(`  game ${g.id}: ${err.message}`); failed++; keep.delete(file); }
  await sleep(DELAY_MS);
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));
const unknown = Object.keys(crests).filter((id) => !TEAMS[id]);
console.log(`Done: ${all.filter((x) => x.played).length} played GBL games for ${year} (${fresh} downloaded, ${kept} kept, ${failed} failed); ${all.length} games in the calendar` + (unknown.length ? `; teams without a code: ${unknown.join(', ')}` : ''));
