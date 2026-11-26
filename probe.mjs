import { readFileSync, readdirSync } from 'node:fs';
const d = 'data/raw/ISR2027'; console.log('IL files', readdirSync(d).slice(0, 5));
const f = readdirSync(d).find((x) => /^\d+\.json$/.test(x)); const j = JSON.parse(readFileSync(d + '/' + f)); console.log('IL', f, j.source, Object.keys(j));
const id = j.gameCode; for (const u of [`https://basket.co.il/livestats/data/game-${id}.json`]) { try { const r = await fetch(u); const t = await r.text(); console.log('URL', u, r.status, t.length); const m = t.match(/"(x|y|shotX|shot_x)"\s*:\s*[-\d.]+/g); console.log('XY', (m || []).slice(0, 10).join(' ')); const k = t.indexOf('"x"'); console.log('CTX', t.slice(Math.max(0, k - 300), k + 200)); } catch (e) { console.log('ERR', e.message); } }
