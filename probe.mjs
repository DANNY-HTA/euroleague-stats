import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const g = async (u) => { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; };
let [s, t] = await g('https://www.aba-liga.com/robots.txt'); console.log('ROBOTS ' + t.replace(/\n/g, ' ⏎ '));
for (const v of ['Boxscore', 'Overview', 'Comments']) { [s, t] = await g(`https://www.aba-liga.com/match/1/26/1/${v}/q1/1/home/borac-mozzart-crvena-zvezda-meridianbet/`); console.log('ABA', v, s, t.length, (t.match(/<table/g) || []).length); console.log(`ABA${v}64 ` + gzipSync(t).toString('base64')); }
[s, t] = await g('https://vtb-league.com/en/'); const js = [...new Set(t.match(/https?:\/\/vtb-league\.com\/[^"' ]+\.js[^"' ]*/g) || [])]; console.log('VTBJS', js.length);
const found = new Set(); for (const u of js) { const [, c] = await g(u); for (const m of c.match(/api\.vtb-league\.com[^"'`\s]{0,120}|["'`]\/api\/[^"'`\s]{0,100}/g) || []) found.add(m); }
console.log('VTBAPI ' + [...found].slice(0, 40).join(' | '));
