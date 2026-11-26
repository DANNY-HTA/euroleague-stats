import { readFileSync, readdirSync, existsSync } from 'node:fs';
const d = ['data/raw/ACB2026', 'data/ACB2026'].find(existsSync); console.log('DIR', d, existsSync('data/raw') && readdirSync('data/raw').join(','));
let o = 0, dr = 0, k = 0;
for (const f of readdirSync(d).filter((f) => f.endsWith('.json')).slice(0, 30)) {
  const g = JSON.parse(readFileSync(`${d}/${f}`, 'utf8')); if (!g.boxscore) continue; k++;
  for (const t of g.boxscore.Stats) { o += t.totr.OffensiveRebounds; dr += t.totr.DefensiveRebounds; }
  if (k === 1) { const p = g.boxscore.Stats[0].PlayersStats[0]; console.log('P', JSON.stringify(p)); const ev = []; for (const q of Object.values(g.pbp || {})) if (Array.isArray(q)) for (const e of q) if (e.PLAYER_ID === p.Player_ID && /^(O|D)$/.test(e.PLAYTYPE)) ev.push(e.PLAYTYPE); console.log('PBP', ev.join('')); }
}
console.log('ACB games', k, 'box OR', o, 'box DR', dr);
