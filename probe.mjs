import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
try { execSync('node scripts/fetch-lba.mjs 2026', { stdio: 'inherit', timeout: 900000 }); } catch (e) { console.log('FETCH ERR', e.message); }
const { parseGame } = await import('./lib/parse.mjs');
const dirs = ['data/raw/LBA2026', 'data/raw/lba/2026', 'data/raw/lba2026'];
const find = (d) => { try { return readdirSync(d); } catch { return null; } };
let dir = dirs.find((d) => find(d));
if (!dir) { console.log('DIRS', execSync('ls data/raw').toString()); }
console.log('DIR', dir);
const o = { gp: 0, min: 0, pts: 0, ast: 0, reb: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, games: [] };
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
  let g; try { g = parseGame(JSON.parse(readFileSync(dir + '/' + f))); } catch { continue; }
  for (const s of [g.home, g.away]) for (const p of s.players) if (/tonut/i.test(p.name)) { o.games.push([g.date, s.code, p.min, p.pts]); if (p.min > 0) { o.gp++; o.min += p.min; o.pts += p.pts; o.ast += p.ast; o.reb += p.reb; o.fgm2 += p.fgm2; o.fga2 += p.fga2; o.fgm3 += p.fgm3; o.fga3 += p.fga3; } }
}
console.log('TONUT', JSON.stringify(o));
