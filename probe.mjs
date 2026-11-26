const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)' };
const B = 'https://schedule.nbl.com.au';
const found = new Set();
for (const p of ['/schedule-v2/schedule.js', '/schedule-shared/fan-widget.js', '/schedule-shared/widget-runtime.js', '/schedule-shared/widget-shells.js', '/schedule-shared/fan-bootstrap.js', '/schedule-shared/fan-path.js']) {
  const t = await (await fetch(B + p, { headers: H })).text();
  for (const m of t.match(/["'`](\/api\/[^"'`\s]+|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[^"'`\s]{0,80})["'`]/g) || []) found.add(p.split('/').pop() + ' ' + m);
  for (const m of t.match(/.{0,80}(game.?centre|gamecentre|boxscore|box-score|matchcentre|match-centre).{0,120}/gi) || []) found.add('CTX ' + m.replace(/\s+/g, ' '));
}
console.log([...found].slice(0, 80).map(x => 'F ' + x).join('\n'));
