import { readFileSync, existsSync } from 'node:fs';
for (const f of ['site/brain.html', 'site/brain.js', 'site/hapoel-brain.json', 'site/team-stats.json', 'site/il/team-stats.json']) console.log('FILE', f, existsSync(f) ? readFileSync(f).length : 'MISSING');
const b = JSON.parse(readFileSync('site/hapoel-brain.json', 'utf8')); console.log('BRAIN', b.players.length, b.games.length, b.teamStats.rows.length, JSON.stringify(b.games[0]).slice(0, 300));
