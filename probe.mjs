const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB research)' };
const get = async (u) => (await fetch(u, { headers: UA })).text();
function rsc(html) { let out = ''; for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { out += JSON.parse(m[1]); } catch {} } return out; }
const base = 'https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/';
const html = await get(base + 'estadisticas');
const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => m[0]);
console.log('tables', tables.length);
const text = (s) => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').trim();
for (const t of tables.slice(0, 2)) { const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]; console.log('--- rows', rows.length); for (const r of rows) console.log((r[0].match(/<tr[^>]*>/)[0]).slice(0, 120), text(r[1]).slice(0, 220)); }
// section titles near tables
for (const m of html.matchAll(/(Real Madrid|Asisa Joventut)[^<]{0,40}<\/(h2|h3|span|div)>/g)) { console.log('TITLE', m[0].slice(0, 80)); }
const J = rsc(await get(base + 'jugadas'));
const s = J.indexOf('"plays":['); let depth = 0, k = s + 8, end = k;
for (; k < J.length; k++) { const c = J[k]; if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = k + 1; break; } } else if (c === '"') { k++; while (J[k] !== '"') { if (J[k] === '\\') k++; k++; } } }
const plays = JSON.parse(J.slice(s + 8, end));
console.log('plays', plays.length, 'keys', Object.keys(plays[0]).join(','));
plays.sort((a, b) => a.order - b.order);
for (const p of plays.slice(0, 40)) console.log(p.order, p.playType, 'Q' + p.quarter, p.minute + ':' + p.second, p.local, p.scoreHome + '-' + p.scoreAway, p.playerLicenseId || '-', p.playerName || '', p.playerNumber || '', JSON.stringify(p.playerStats || {}).slice(0, 0));
console.log('last', plays.slice(-3).map((p) => [p.order, p.playType, p.quarter, p.minute, p.second, p.scoreHome, p.scoreAway].join(' ')));
