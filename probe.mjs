import { readFileSync } from 'node:fs';
const h = readFileSync('site/index.html', 'utf8');
const t = h.slice(h.indexOf('class="hap-stats"'), h.indexOf('</table>', h.indexOf('class="hap-stats"')));
for (const lab of ['Points per possession', 'Opp points per possession', '2-pointers made', '3-pointers attempted', 'Opp free throws made']) { const i = t.indexOf(lab); console.log('ROW', t.slice(i, i + 900).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)); }
