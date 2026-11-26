import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const t = await (await fetch('https://www.aba-liga.com/calendar/', { headers: H })).text();
const b64 = gzipSync(t).toString('base64'); for (let i = 0; i < b64.length; i += 4000) console.log('CH' + String(i / 4000).padStart(4, '0') + ' ' + b64.slice(i, i + 4000));
