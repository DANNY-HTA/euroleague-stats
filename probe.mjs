import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json' };
const B = 'https://schedule.nbl.com.au';
const id = '36dbeb55-58ad-11f1-a69b-43a6b5595d3e', season = '67d4a190-40bc-4bfb-a9a2-11bd0b93f020';
const d = (await (await fetch(`${B}/api/calendar/match?match=${id}&league=NBL&season=${season}`, { headers: H })).json()).match;
const slim = { ...d }; for (const k of ['betting', 'latest_play', 'match_bg', 'odds']) delete slim[k];
const b64 = gzipSync(JSON.stringify(slim)).toString('base64');
for (let i = 0; i < b64.length; i += 4000) console.log('CH' + String(i / 4000).padStart(4, '0') + ' ' + b64.slice(i, i + 4000));
