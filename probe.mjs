import { readFileSync, readdirSync } from 'node:fs';
const f = readdirSync('site').filter((x) => /^player-/.test(x)).find((x) => readFileSync('site/' + x, 'utf8').includes('id="competitions"'));
const h = readFileSync('site/' + f, 'utf8'); const i = h.indexOf('id="competitions"');
console.log('SAMPLE', f, h.slice(i, i + 2500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
for (const name of ['elijahbryant', 'danoturu', 'vasiliemicic']) { const x = readdirSync('site').find((y) => y.toLowerCase().includes(name)); }
