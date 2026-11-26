import { readFileSync, readdirSync } from 'node:fs';
for (const f of ['site/team-OLY-report.html', 'site/il/' + readdirSync('site/il').find((x) => /-report\.html$/.test(x)), 'site/lba/' + readdirSync('site/lba').find((x) => /-report\.html$/.test(x))]) {
  const h = readFileSync(f, 'utf8'); const t = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('REPORT', f, h.length, (h.match(/<h2>\d+\. [^<]+/g) || []).join(' | '));
  const i = t.indexOf('Compared with Hapoel'); console.log('  HAP', i > 0 ? t.slice(i, i + 400) : 'none');
  const j = t.indexOf('Wins vs losses'); console.log('  WL', t.slice(j, j + 300));
}
