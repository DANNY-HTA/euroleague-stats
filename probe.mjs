import { gzipSync } from 'node:zlib';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const nd = (t) => { const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m && JSON.parse(m[1]).props.pageProps; };
const pp = nd(await (await fetch('https://www.easycredit-bbl.de/spiele/2006838', { headers: H })).text());
console.log('GAMEB64 ' + gzipSync(JSON.stringify({ g: pp.initialGameData, s: pp.initialGameStats })).toString('base64'));
const r = await fetch('https://www.easycredit-bbl.de/saison/spielplaene_liga-pokalspiele/', { headers: H }); const t = await r.text(); const sp = nd(t) || {};
delete sp.menuData; delete sp.footerData;
console.log('SCHED', r.status, t.length, Object.keys(sp).join(','), (t.match(/\/spiele\/\d{7}/g) || []).length);
console.log('SCHEDB64 ' + gzipSync(JSON.stringify(sp)).toString('base64'));
