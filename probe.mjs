import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const g = async (u) => (await fetch('https://www.esake.gr' + u, { headers: H })).text();
const r1 = await g('/el/action/EsakeResults?idchampionship=184645B9&idteam=&idseason=00000001&series=1');
console.log('R164 ' + gzipSync(r1).toString('base64'));
const id = (r1.match(/idgame=([0-9A-F]{8})/) || [])[1]; console.log('GID', id);
for (const m of [3, 2]) console.log(`P${m}64 ` + gzipSync(await g(`/el/action/EsakegameView?idgame=${id}&mode=${m}`)).toString('base64'));
