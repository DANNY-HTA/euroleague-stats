import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json', Referer: 'https://vtb-league.com/' };
const g = async (u) => { try { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; } catch (e) { return [0, e.cause?.code || e.message]; } };
const B = 'https://org.infobasket.su';
let [s, t] = await g(B + '/robots.txt'); console.log('ROBOTS', s, JSON.stringify(String(t).slice(0, 500)));
for (const u of ['/Comp/GetCalendar/?comps=55613&format=json&lang=en', '/Widget/CompGameList/55613?format=json&lang=en', '/Comp/GetCompCalendar/55613?format=json&lang=en', '/Widget/GetCalendar/55613?format=json&lang=en']) { [s, t] = await g(B + u); console.log('CAL', s, u, String(t).length, String(t).slice(0, 300).replace(/\s+/g, ' ')); }
for (const u of ['/Widget/GamePage/1081891?format=json&lang=en', '/Widget/GetOnline/1081891?format=json&lang=en']) { [s, t] = await g(B + u); console.log('G', s, u, String(t).length); const b64 = gzipSync(String(t)).toString('base64'); const tag = /Online/.test(u) ? 'O' : 'P'; for (let i = 0; i < b64.length; i += 4000) console.log(tag + 'CH' + String(i / 4000).padStart(4, '0') + ' ' + b64.slice(i, i + 4000)); }
