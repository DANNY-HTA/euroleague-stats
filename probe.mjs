import { readFileSync, readdirSync } from 'node:fs';
for (const dir of ['site', 'site/il', 'site/acb']) {
  let n = 0, ok = 0, bad = [];
  for (const f of readdirSync(dir).filter((f) => /^game-.*\.html$/.test(f))) {
    const h = readFileSync(`${dir}/${f}`, 'utf8'); const m = h.match(/<script type="application\/json" id="qb-data">([\s\S]*?)<\/script>/);
    if (!m) continue; n++; const D = JSON.parse(m[1]); if (D.ok) ok++; else bad.push(f);
    if (n === 1) { const id = D.players[0][0]; console.log('SAMPLE', dir, f, D.periods, D.total, D.players[0][1], JSON.stringify(D.box[id]), JSON.stringify(D.iv[id])); }
  }
  console.log('QB', dir, 'pages', n, 'statsOk', ok, 'bad', bad.slice(0, 5).join(' '));
}
