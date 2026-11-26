const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Referer: 'https://vtb-league.com/' };
const c = await (await fetch('https://vtb-league.com/app/themes/mbt/assets/rfb/widgets.bundle.min.js', { headers: H })).text();
console.log('LEN', c.length);
for (const m of c.match(/.{0,300}PlayTypeID.{0,600}/g) || []) console.log('CTX ' + m.replace(/\s+/g, ' ').slice(0, 900));
const i = c.search(/[Aa]ssist/); console.log('AS ' + c.slice(Math.max(0, i - 1500), i + 1500).replace(/\s+/g, ' '));
