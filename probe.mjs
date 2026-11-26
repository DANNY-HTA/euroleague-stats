import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const t = await (await fetch('https://www.esake.gr/el/action/EsakeResults', { headers: H })).text();
console.log('RES64 ' + gzipSync(t).toString('base64'));
