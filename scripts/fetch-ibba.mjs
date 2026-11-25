// Downloads the Israeli Basketball Super League (Winner League) box scores from the official site,
// basket.co.il, for the scouting pool. Saves the original pages to data/raw/ISR<year>/.
//
//   node scripts/fetch-ibba.mjs 2027     -> 2026-27 season (the site names seasons by their end year)
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseResults } from '../lib/ibba.mjs';

const year = process.argv[2] || '2027';
const BASE = 'https://basket.co.il';
const OUT = join('data', 'raw', 'ISR' + year);
const DELAY_MS = 600, REFRESH_DAYS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'HTA LAB stats (Hapoel Tel Aviv basketball staff; github.com/hta-lab)', Accept: 'text/html' };

async function get(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
      throw new Error('HTTP ' + r.status);
    } catch (err) {
      if (i === tries) throw new Error(`${url}: ${err.message}`);
      await sleep(3000 * i);
    }
  }
}

await mkdir(OUT, { recursive: true });
const resultsHtml = await get(`${BASE}/results.asp?cYear=${year}&lang=en`);
const games = parseResults(resultsHtml || '');
if (!games.length) { console.error('No played games found on basket.co.il (the page layout may have changed).'); process.exit(1); }
await writeFile(join(OUT, '_results.json'), JSON.stringify(games));
let fresh = 0, kept = 0;
for (const g of games) {
  const file = join(OUT, g.gameId + '.html');
  try {
    const s = await stat(file);
    const age = (Date.now() - Date.parse(g.date)) / 86400000;
    if (s.size > 5000 && age > REFRESH_DAYS) { kept++; continue; }
  } catch { /* not downloaded yet */ }
  const html = await get(`${BASE}/game-zone.asp?GameId=${g.gameId}&lang=en`);
  if (html) { await writeFile(file, html); fresh++; }
  await sleep(DELAY_MS);
}
console.log(`Done: ${games.length} played Winner League games for ${year} (${fresh} downloaded, ${kept} kept from earlier runs)`);
