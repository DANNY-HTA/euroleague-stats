import { readFileSync, readdirSync } from 'node:fs';
const d = 'data/raw/ACB2026'; let o = 0, dr = 0, k = 0;
for (const f of readdirSync(d).filter((f) => f.endsWith('.json'))) { const g = JSON.parse(readFileSync(`${d}/${f}`, 'utf8')); if (!g.boxscore) continue; k++; for (const t of g.boxscore.Stats) { o += t.totr.OffensiveRebounds; dr += t.totr.DefensiveRebounds; } }
console.log('ACB games', k, 'box OR', o, 'box DR', dr);
