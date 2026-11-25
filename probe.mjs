const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: '*/*' };
const g = async (u) => { try { const r = await fetch(u, { headers: H }); const t = await r.text(); return [r.status, t]; } catch (e) { return [0, e.cause?.code || e.message]; } };
let [s, t] = await g('https://www.easycredit-bbl.de/robots.txt'); console.log('ROBOTS', s, t.slice(0, 800));
[s, t] = await g('https://www.easycredit-bbl.de/');
const all = [...new Set(t.match(/https?:\/\/api\.basketball-bundesliga\.de\/[^"'\\ )]+/g) || [])].filter(u => !/images/.test(u)); console.log('APIURLS', all.slice(0, 20).join('\n'));
const paths = [...new Set(t.match(/\/(spielplan|spiele|games|match|tabelle|statistik)[a-z0-9\/_-]*/gi) || [])].slice(0, 30); console.log('PATHS', paths.join(' '));
const js = [...new Set(t.match(/\/_next\/static\/[^"']+\.js/g) || [])]; console.log('JS', js.length);
const found = new Set();
for (const j of js) { const [, c] = await g('https://www.easycredit-bbl.de' + j); for (const m of c.match(/["'`](\/?[a-zA-Z0-9_\/-]*(games|matches|boxscore|playbyplay|play-by-play|pbp|stats|seasons|competitions)[a-zA-Z0-9_\/${}.-]*)["'`]/g) || []) found.add(m); for (const m of c.match(/https?:\/\/[a-z0-9.-]+\.(de|com|io|net)[a-z0-9\/._-]*/g) || []) if (!/w3\.org|react|google|facebook/.test(m)) found.add(m); }
console.log('FOUND', [...found].slice(0, 80).join('\n'));
for (const u of ['https://api.basketball-bundesliga.de/', 'https://api.basketball-bundesliga.de/games', 'https://api.basketball-bundesliga.de/competitions', 'https://api.basketball-bundesliga.de/seasons']) { const [a, b] = await g(u); console.log('API', a, u, String(b).slice(0, 200)); }
