const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const r = await fetch('https://www.euroleaguebasketball.net/robots.txt', { headers: H }); console.log('ROBOTS', (await r.text()).slice(0, 600).replace(/\n/g, ' | '));
for (let n = 12; n <= 16; n++) for (const suf of ['-el2627', '']) {
  const u = `https://www.euroleaguebasketball.net/euroleague/news/injury-report-round-${n}${suf}`;
  const x = await fetch(u, { headers: H, redirect: 'follow' }); const t = await x.text();
  const title = (t.match(/<title>([^<]*)/) || [])[1];
  console.log('U', n, suf, x.status, x.url, t.length, title);
  if (x.ok && n === 14 && suf) { const i = t.indexOf('Milan'); console.log('MIL', t.slice(i - 300, i + 1500).replace(/\s+/g, ' ')); const ld = t.match(/"articleBody"\s*:\s*"([^"]{0,600})/); console.log('LD', ld && ld[1]); console.log('H3', (t.match(/<h[23][^>]*>[^<]{2,80}<\/h[23]>/g) || []).slice(0, 30).join(' ')); }
}
