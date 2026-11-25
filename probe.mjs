import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
execSync('node scripts/fetch-acb.mjs 2026', { stdio: 'inherit' });
const dir = 'data/raw/ACB2026'; const f = readdirSync(dir);
console.log('files', f.length);
const s = JSON.parse(readFileSync(dir + '/_schedule.json')); console.log('sched', s.length, JSON.stringify(s[0]));
console.log('clubs', readFileSync(dir + '/_clubs.json', 'utf8').slice(0, 300));
