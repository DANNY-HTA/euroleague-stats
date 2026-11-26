// Shot locations for every downloaded EuroLeague / EuroCup game (official feed: live.euroleague.net/api/Points).
// Saved per game as data/raw/<season>/_shots/<NNN>.json: { gameCode, fetchedAt, rows: [[team, playerId, action, x, y, fastbreak, secondChance, offTurnover, minute, clock]] }
// Coordinates are centimetres from the basket (x across the court, y towards half court); free throws have no location.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const season = process.argv[2] || 'E2026';
const DIR = join('data', 'raw', season), OUT = join(DIR, '_shots');
const DELAY_MS = 350, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trim = (v) => (typeof v === 'string' ? v.trim() : v);

async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404 || res.status === 204) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(10000 * i); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const t = await res.text(); return t.trim() ? JSON.parse(t) : null;
    } catch (e) { if (i === tries) throw e; await sleep(2000 * i); }
  }
  return null;
}

await mkdir(OUT, { recursive: true });
const games = (await readdir(DIR)).filter((f) => /^\d+\.json$/.test(f));
let got = 0, kept = 0, failed = 0;
for (const f of games) {
  const out = join(OUT, f);
  let played = null;
  try { const g = JSON.parse(await readFile(join(DIR, f), 'utf8')); const m = String(g.header?.Date || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) played = Date.UTC(+m[3], +m[2] - 1, +m[1]); } catch { continue; }
  try {
    const old = JSON.parse(await readFile(out, 'utf8'));
    const at = Date.parse(old.fetchedAt);
    // keep: downloaded after the correction window, or downloaded within the last day
    if (old.rows?.length && ((played && at - played > REFRESH_DAYS * 86400000) || Date.now() - at < 86400000)) { kept++; continue; }
  } catch { /* not downloaded yet */ }
  const code = Number(f.replace('.json', ''));
  try {
    const j = await getJson(`https://live.euroleague.net/api/Points?gamecode=${code}&seasoncode=${season}`);
    await sleep(DELAY_MS);
    const rows = (j?.Rows || []).map((r) => [trim(r.TEAM), trim(r.ID_PLAYER), trim(r.ID_ACTION), Number(r.COORD_X), Number(r.COORD_Y), r.FASTBREAK === '1' ? 1 : 0, r.SECOND_CHANCE === '1' ? 1 : 0, r.POINTS_OFF_TURNOVER === '1' ? 1 : 0, Number(r.MINUTE) || 0, trim(r.CONSOLE) || '']);
    if (!rows.length) { failed++; continue; }
    await writeFile(out, JSON.stringify({ gameCode: code, fetchedAt: new Date().toISOString(), rows }));
    got++;
  } catch (e) { failed++; console.warn(`  shots ${season} ${code}: ${e.message}`); }
}
console.log(`Shots ${season}: ${got} downloaded, ${kept} kept, ${failed} without shot data (${games.length} games)`);
