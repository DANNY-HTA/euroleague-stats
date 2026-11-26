import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const g = async (u) => (await fetch('https://www.esake.gr' + u, { headers: H })).text();
const all = await g('/el/action/EsakeResults?idchampionship=184645B9&idteam=&idseason=&series=');
console.log('ALL64 ' + gzipSync(all).toString('base64'));
const ids = [...new Set(all.match(/idgame=[0-9A-F]{8}/g) || [])].map(x => x.slice(7)); console.log('NIDS', ids.length);
// first game with a score: look at the text near each id
const played = ids.find(id => { const i = all.indexOf(id); const seg = all.slice(i - 3000, i + 300).replace(/<[^>]+>/g, ' '); return /\b\d{2,3}\s*-\s*\d{2,3}\b/.test(seg); }) || ids[0];
console.log('PLAYED', played);
for (const m of [3, 2]) console.log(`G${m}64 ` + gzipSync(await g(`/el/action/EsakegameView?idgame=${played}&mode=${m}`)).toString('base64'));
