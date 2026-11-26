const tryj = async (u) => { try { const r = await fetch(u, { headers: { Accept: 'application/json' } }); const t = await r.text(); console.log('URL', u, r.status, t.length, t.slice(0, 700).replace(/\s+/g, ' ')); } catch (e) { console.log('URL', u, 'ERR', e.message); } };
await tryj('https://live.euroleague.net/api/Points?gamecode=1&seasoncode=E2026');
await tryj('https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games/1/points');
await tryj('https://live.euroleague.net/api/Points?gamecode=1&seasoncode=U2026');
// Israel: livestats (FIBA) data with shot x/y?
import { readFileSync, readdirSync } from 'node:fs';
const d = 'data/raw/ISR2027'; const f = readdirSync(d).find((x) => /^\d/.test(x)); const j = JSON.parse(readFileSync(d + '/' + f)); console.log('IL keys', Object.keys(j), JSON.stringify(j.pbp?.FirstQuarter?.[3] || {}).slice(0, 300), j.source);
