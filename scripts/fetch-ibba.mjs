// Downloads the Israeli Basketball Super League (Winner League) from the league's official site,
// basket.co.il: the schedule, teams, rosters (age, height, position) and, for every finished game,
// the official LiveStats file (box score + play-by-play). Each game is converted to the EuroLeague feed
// shape and saved to data/raw/ISR<year>/<gameId>.json, so the whole site can be built from it.
//
//   node scripts/fetch-ibba.mjs 2027     -> 2026-27 season (the league names seasons by their end year)
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { convertGame, teamCodes } from '../lib/livestats.mjs';

const year = process.argv[2] || '2027';
const BASE = 'https://basket.co.il';
const OUT = join('data', 'raw', 'ISR' + year);
const DELAY_MS = 500, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff)', Accept: 'application/json, text/plain, */*' };

async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: HEAD });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      const j = JSON.parse(t.replace(/^﻿/, ''));
      return Array.isArray(j) || !j || typeof j !== 'object' ? j : (j.d ?? j);
    } catch (err) {
      if (i === tries) throw new Error(`${url}: ${err.message}`);
      await sleep(3000 * i);
    }
  }
}
const list = (x) => (Array.isArray(x) ? x : Array.isArray(x?.d) ? x.d : (Object.values(x || {}).find(Array.isArray) || []));
const dmy = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? [m[1].padStart(2, '0'), m[2].padStart(2, '0'), m[3]] : null; };
const decode = (s) => String(s || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
/** Israel local time -> UTC ISO (handles summer/winter time). */
function israelToUtc(dateTxt, time) {
  const d = dmy(dateTxt); if (!d) return null;
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  const guess = Date.UTC(+d[2], +d[1] - 1, +d[0], hh || 0, mm || 0);
  const off = (t) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).reduce((o, x) => ({ ...o, [x.type]: x.value }), {}); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t; };
  return new Date(guess - off(guess)).toISOString().replace('.000Z', 'Z');
}
const POS = (p) => { const s = String(p || '').toUpperCase(); return /C/.test(s) && !/G|F/.test(s) ? 'Center' : /F/.test(s) && !/G/.test(s) ? 'Forward' : /G/.test(s) && !/F/.test(s) ? 'Guard' : /G/.test(s) ? 'Guard' : /C/.test(s) ? 'Center' : s ? 'Forward' : null; };

await mkdir(OUT, { recursive: true });
const all = list(await getJson(`${BASE}/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=${year}&board_id=0&board_round=0&team_id=0&game_id=0`));
const games = all.filter((g) => /winner league/i.test(g.board_name_eng || ''));
if (!games.length) { console.error('No Winner League games found (the league site may have changed).'); process.exit(1); }
const teamsRaw = list(await getJson(`${BASE}/ws/ws.asmx/Teams?board_id=${games[0].BOARD_ID || 5}&cYear=${year}`));
const teams = teamsRaw.map((t) => ({ id: String(t.team_year_id), uid: String(t.TeamUID), name: decode(t.teamEng), short: decode(t.team_shortNameEng) }));
const codes = teamCodes(teams);
const teamOf = (id, fallbackName, logo) => { const t = teams.find((x) => x.id === String(id)); return { code: codes.get(String(id)) || 'T' + id, name: t?.name || decode(fallbackName), short: t?.short || '', logo }; };

// Clubs (with the official logos) and the schedule of games still to play.
const crest = new Map();
for (const g of games) { if (/^https:\/\//.test(g.team1_logo || '')) crest.set(String(g.team1), g.team1_logo); if (/^https:\/\//.test(g.team2_logo || '')) crest.set(String(g.team2), g.team2_logo); }
await writeFile(join(OUT, '_clubs.json'), JSON.stringify(teams.map((t) => ({ code: codes.get(t.id), name: t.name, tvCode: codes.get(t.id), crest: crest.get(t.id) || null }))));
const played = (g) => String(g.score_team1 || '').trim() !== '' && (Number(g.score_team1) + Number(g.score_team2)) > 0;
const sched = games.map((g) => {
  const h = teamOf(g.team1, g.team1_name_eng), a = teamOf(g.team2, g.team2_name_eng);
  return { c: Number(g.game_id), r: Number(g.gameNumber) || null, rn: 'Round ' + g.gameNumber, utc: israelToUtc(g.game_date_txt, g.TimeOfGame), ok: !!g.TimeOfGame, played: played(g),
    h: { code: h.code, tv: h.code, name: h.name }, a: { code: a.code, tv: a.code, name: a.name }, venue: decode(g.PlaceOfGame) };
});
await writeFile(join(OUT, '_schedule.json'), JSON.stringify(sched));

// Finished games: LiveStats box score + play-by-play.
const keep = new Set(['_clubs.json', '_schedule.json', '_people.json']);
let fresh = 0, kept = 0, missing = 0;
const lsPlayers = new Map();
for (const g of games.filter(played)) {
  const file = `${g.game_id}.json`; keep.add(file);
  const d = dmy(g.game_date_txt), age = d ? (Date.now() - Date.UTC(+d[2], +d[1] - 1, +d[0])) / 86400000 : 0;
  let raw = null;
  if (age > REFRESH_DAYS) { try { raw = JSON.parse(await readFile(join(OUT, file), 'utf8')); kept++; } catch { raw = null; } }
  if (!raw) {
    if (!g.ExternalID) { missing++; keep.delete(file); continue; }
    const ls = await getJson(`${BASE}/livestats/data/game-${g.ExternalID}.json`).catch(() => null);
    await sleep(DELAY_MS);
    if (!ls?.gameInfo?.gameFinished) { missing++; keep.delete(file); continue; }
    const meta = { gameId: Number(g.game_id), date: d ? d.join('/') : '', round: Number(g.gameNumber) || null, home: teamOf(g.team1, g.team1_name_eng), away: teamOf(g.team2, g.team2_name_eng) };
    try { raw = convertGame(ls, meta, 'ISR' + year); } catch (err) { console.warn(`  game ${g.game_id}: ${err.message}`); missing++; keep.delete(file); continue; }
    await writeFile(join(OUT, file), JSON.stringify(raw));
    fresh++;
  }
  for (const s of raw.boxscore.Stats) for (const p of s.PlayersStats) lsPlayers.set(p.Player_ID, { name: p.Player, dorsal: p.Dorsal, club: p.Team });
}
for (const f of await readdir(OUT)) if (f.endsWith('.json') && !keep.has(f)) await unlink(join(OUT, f));

// Rosters: age, height and position, matched to the LiveStats players by team + shirt number, then name.
const people = [];
for (const t of teams) {
  let roster = [];
  try { roster = list(await getJson(`${BASE}/ws/ws.asmx/Players?team_uid=${t.uid}&cYear=${year}&team_id=0`)); } catch (err) { console.warn(`  roster ${t.name}: ${err.message}`); }
  await sleep(DELAY_MS);
  const code = codes.get(t.id);
  const mine = [...lsPlayers].filter(([, p]) => p.club === code);
  for (const r of roster) {
    const eng = String(r.name_eng || '').trim().toUpperCase();
    const hit = mine.find(([, p]) => String(p.dorsal) === String(r.jersy).replace(/^0(\d)$/, '$1') && p.dorsal !== '')
      || mine.find(([, p]) => { const [last, first] = p.name.split(',').map((x) => x.trim()); return `${first} ${last}`.toUpperCase() === eng; });
    if (!hit) continue;
    const b = dmy(r.birth_date), h = Number(String(r.Height || '').replace(',', '.'));
    people.push({ code: hit[0], name: hit[1].name, engName: String(r.name_eng || '').trim() || null, birthDate: b ? `${b[2]}-${b[1]}-${b[0]}` : null, height: h ? Math.round(h < 3 ? h * 100 : h) : null, weight: null,
      country: null, birthCountry: null, position: POS(r.position_eng), dorsal: String(r.jersy || ''), club: code, active: String(r.isReplaced) !== 'True', startDate: null });
  }
}
await writeFile(join(OUT, '_people.json'), JSON.stringify(people));

// Spell names as the league's roster does (LiveStats sometimes misspells, e.g. "Otoru" for Oturu),
// plus any fixes listed in config.json ("nameFixes": { "Wrong Name": "Right Name" }).
const fixes = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8')).nameFixes || {};
const rosterName = new Map(people.map((p) => [p.code, p.engName]).filter(([, n]) => n));
const fixName = (id, player) => {
  let name = rosterName.get(id) || player;
  const shown = name.includes(',') ? name.split(',').map((x) => x.trim()).reverse().join(' ') : name;
  for (const [wrong, right] of Object.entries(fixes)) if (shown.toUpperCase() === wrong.toUpperCase()) name = right;
  return name;
};
let renamed = 0;
for (const f of (await readdir(OUT)).filter((x) => /^\d+\.json$/.test(x))) {
  const raw = JSON.parse(await readFile(join(OUT, f), 'utf8'));
  let changed = false;
  for (const s of raw.boxscore.Stats) for (const p of s.PlayersStats) { const n = fixName(p.Player_ID, p.Player); if (n !== p.Player) { p.Player = n; changed = true; } }
  for (const k of Object.keys(raw.pbp || {})) if (Array.isArray(raw.pbp[k])) for (const r of raw.pbp[k]) if (r.PLAYER_ID) { const n = fixName(r.PLAYER_ID, r.PLAYER); if (n !== r.PLAYER) { r.PLAYER = n; changed = true; } }
  if (changed) { await writeFile(join(OUT, f), JSON.stringify(raw)); renamed++; }
}
if (renamed) console.log(`  names updated in ${renamed} game files`);
console.log(`Done: ${games.filter(played).length} played Winner League games for ${year} (${fresh} downloaded, ${kept} kept, ${missing} without a finished LiveStats file); ${people.length} roster entries`);
