const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)' };
const B = 'https://schedule.nbl.com.au';
const all = {};
for (const p of ['/schedule-v2/schedule.js', '/schedule-shared/fan-widget.js', '/schedule-shared/widget-runtime.js', '/schedule-shared/widget-shells.js', '/schedule-shared/fan-bootstrap.js', '/schedule-shared/fan-path.js']) all[p] = await (await fetch(B + p, { headers: H })).text();
for (const [p, t] of Object.entries(all)) {
  const i = t.indexOf('function buildMatchCentreHref'); if (i >= 0) console.log('FN', p, t.slice(i, i + 900).replace(/\s+/g, ' '));
  for (const m of t.match(/["'`][^"'`\s]*\.(js|mjs)(\?[^"'`\s]*)?["'`]/g) || []) console.log('JS', p, m);
  for (const m of t.match(/["'`][^"'`\s]*(match-centre|matchcentre|match_centre|game-centre)[^"'`\s]*["'`]/gi) || []) console.log('MC', p, m);
}
