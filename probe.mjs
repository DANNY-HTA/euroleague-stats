import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const g = async (u) => { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; };
let [s, t] = await g('https://www.aba-liga.com/robots.txt'); console.log('ROBOTSJSON ' + JSON.stringify(t));
[s, t] = await g('https://www.aba-liga.com/calendar/');
const boxes = [...new Set(t.match(/https:\/\/www\.aba-liga\.com\/match\/\d+\/26\/1\/Boxscore\/[^"]+/g) || [])];
console.log('NBOX', boxes.length, boxes.slice(0, 3).join(' '));
const i = t.indexOf(boxes[0]); console.log('CALCTX ' + t.slice(i - 2500, i + 200).replace(/\s+/g, ' ').slice(0, 2700));
for (const u of [boxes[0], boxes[1]]) { const [a, b] = await g(u); console.log('BOX', a, u, b.length, /No stats available yet/.test(b) ? 'NOSTATS' : 'HASSTATS'); }
const played = []; for (const u of boxes.slice(0, 12)) { const [, b] = await g(u); if (!/No stats available yet for this match\. Unofficial/.test(b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))) { played.push(u); console.log('P64 ' + gzipSync(b).toString('base64')); break; } }
console.log('PLAYED', played.join(' '));
// VTB
[s, t] = await g('https://vtb-league.com/en/'); const js = [...new Set(t.match(/https?:\/\/vtb-league\.com\/[^"' ]+\.js[^"' ]*/g) || [])];
for (const u of js) { const [, c] = await g(u); for (const m of c.match(/.{0,140}\/api\/v1.{0,200}/g) || []) console.log('VTBCTX ' + u.split('/').pop() + ' ' + m.replace(/\s+/g, ' ')); }
