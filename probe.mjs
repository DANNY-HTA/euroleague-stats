const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Referer: 'https://vtb-league.com/' };
const g = async (u) => { try { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; } catch (e) { return [0, '']; } };
const [, page] = await g('https://vtb-league.com/en/game/1081891/');
const scripts = [...new Set(page.match(/<script[^>]+src="([^"]+)"/g) || [])].map((s) => s.match(/src="([^"]+)"/)[1]).map((u) => u.startsWith('http') ? u : 'https://vtb-league.com' + u);
console.log('SCRIPTS', scripts.join(' '));
for (const u of scripts) { const [s, c] = await g(u); if (/PlayTypeID|PlayType|OnlinePlays/.test(c)) { console.log('HAS', u, c.length); for (const m of c.match(/.{0,200}(PlayTypeID|OnlinePlays).{0,300}/g) || []) console.log('CTX ' + m.replace(/\s+/g, ' ').slice(0, 500)); } }
for (const u of ['https://org.infobasket.su/Widget/GetPlayTypes?format=json&lang=en', 'https://org.infobasket.su/Widget/GetPlays/1081891?format=json&lang=en', 'https://org.infobasket.su/Widget/GamePlays/1081891?format=json&lang=en', 'https://org.infobasket.su/Api/GetPlayTypes?format=json']) { const [s, c] = await g(u); console.log('EP', s, u, c.length, c.slice(0, 300).replace(/\s+/g, ' ')); }
