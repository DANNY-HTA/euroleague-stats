import { writeFileSync } from 'node:fs';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const nd = (t) => { const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m && JSON.parse(m[1]).props.pageProps; };
let t = await (await fetch('https://www.easycredit-bbl.de/spiele/2006838', { headers: H })).text(); const pp = nd(t);
const A = pp.initialGameStats.actions;
const byType = {}; for (const a of A) { const k = a.type + '|' + (a.qualifiers || []).join(','); byType[k] = (byType[k] || 0) + 1; }
console.log('TYPES', JSON.stringify(byType));
console.log('KEYS', [...new Set(A.flatMap(a => Object.keys(a)))].join(','));
for (const a of A.slice(0, 30)) console.log('ACT', JSON.stringify(a));
const menu = JSON.stringify(pp.menuData); console.log('MENU', [...new Set(menu.match(/"url":"[^"]*(spiel|termin|plan|ergebn)[^"]*"/gi) || [])].join(' '));
for (const u of ['/spielplan-ergebnisse', '/spielplan/', '/spiele/', '/termine', '/saison/spielplan']) { const r = await fetch('https://www.easycredit-bbl.de' + u, { headers: H }); const x = await r.text(); const p = r.ok && nd(x); console.log('SCHED', r.status, u, p ? Object.keys(p).join(',') : '', (x.match(/\/spiele\/\d{7}/g) || []).length); }
