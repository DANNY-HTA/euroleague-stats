// Downloads every played game of the season from the official EuroLeague live feed
// and saves it, unchanged, to data/raw/<season>/<gamecode>.json.
//
//   node scripts/fetch.mjs            -> season from config.json
//   node scripts/fetch.mjs E2025      -> another season
//
// It re-downloads every game on each run, so corrections made by the league's
// stat crew after a game always come through.

import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isFinishedGame } from '../lib/parse.mjs';
import { slimPeople } from '../lib/people.mjs';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const season = process.argv[2] || config.seasonCode;
const BASE = 'https://live.euroleague.net/api';
const OUT = join('data', 'raw', season);
const MAX_GAMES = 600;          // a full season incl. playoffs is ~400 games
const STOP_AFTER_MISSES = 20;   // stop when this many game codes in a row are not played yet
const DELAY_MS = 150;           // be polite to the league's servers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404 || res.status === 204) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text.trim()) return null;
      return JSON.parse(text);
    } catch (err) {
      if (i === tries) throw new Error(`${url} failed: ${err.message}`);
      await sleep(1000 * i);
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let saved = 0, misses = 0, live = 0;
  const keep = new Set();

  for (let code = 1; code <= MAX_GAMES; code++) {
    const q = `gamecode=${code}&seasoncode=${season}`;
    const header = await getJson(`${BASE}/Header?${q}`);
    await sleep(DELAY_MS);

    if (!header || !header.TeamA) {
      misses++;
      if (misses >= STOP_AFTER_MISSES) break;
      continue;
    }
    if (header.Live === true) { live++; misses = 0; continue; } // in progress: skip for now

    const boxscore = await getJson(`${BASE}/Boxscore?${q}`);
    await sleep(DELAY_MS);

    if (!isFinishedGame(header, boxscore)) {
      misses++;
      if (misses >= STOP_AFTER_MISSES) break;
      continue;
    }
    misses = 0;
    const file = `${String(code).padStart(3, '0')}.json`;
    keep.add(file);
    await writeFile(join(OUT, file), JSON.stringify({ season, gameCode: code, fetchedAt: new Date().toISOString(), header, boxscore }));
    saved++;
    if (saved % 25 === 0) console.log(`  ${saved} games saved…`);
  }

  // Remove files for games that no longer exist in the feed (e.g. a game code that was reassigned).
  for (const f of await readdir(OUT)) {
    if (f.endsWith('.json') && !f.startsWith('_') && !keep.has(f)) await unlink(join(OUT, f));
  }

  // Club list (with official crests) and each club's roster (age, height, position,
  // nationality). Optional: the site still builds without them. Photos are not saved.
  let clubs = [];
  try {
    const raw = await getJson(`https://api-live.euroleague.net/v2/competitions/E/seasons/${season}/clubs`);
    clubs = (raw?.data || []).map((c) => ({
      code: c.code, name: c.name, tvCode: c.tvCode,
      crest: c.images?.crest || c['images.crest'] || null
    }));
    await writeFile(join(OUT, '_clubs.json'), JSON.stringify(clubs));
    console.log(`Club crests saved for ${clubs.filter((c) => c.crest).length} clubs`);
  } catch (err) {
    console.warn('Could not download the club list (the site will show team codes instead): ' + err.message);
  }

  const people = [];
  const sources = [
    ...clubs.map((c) => `https://api-live.euroleague.net/v2/competitions/E/seasons/${season}/clubs/${encodeURIComponent(c.code)}/people`),
    `https://api-live.euroleague.net/v2/competitions/E/seasons/${season}/people`
  ];
  for (const url of sources) {
    try {
      const got = slimPeople(await getJson(url));
      people.push(...got);
      console.log(`  ${got.length} players from ${url.split('/seasons/')[1]}`);
    } catch (err) { console.warn(`Could not download ${url}: ${err.message}`); }
    await sleep(DELAY_MS);
  }
  if (people.length) {
    await writeFile(join(OUT, '_people.json'), JSON.stringify(people));
    console.log(`Player details saved: ${people.length} roster entries`);
  }

  console.log(`Done: ${saved} finished games saved for ${season}` + (live ? ` (${live} live game(s) skipped)` : ''));
  if (saved === 0) {
    console.error('No games downloaded. The feed may be down or the season code may be wrong.');
    process.exit(1);
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
