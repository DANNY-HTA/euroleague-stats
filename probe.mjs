const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Referer: 'https://vtb-league.com/' };
const c = await (await fetch('https://vtb-league.com/app/themes/mbt/assets/rfb/widgets.bundle.min.js', { headers: H })).text();
const i = c.indexOf('playTypes=["-","1 point"'); const j = c.indexOf(']', i); console.log('TYPES ' + c.slice(i, j + 1));
const k = c.indexOf('case 25:if(play.parent!==null)'); console.log('SW ' + c.slice(k, k + 3500).replace(/\s+/g, ' '));
