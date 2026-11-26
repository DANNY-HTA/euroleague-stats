const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)' };
const t = await (await fetch('https://schedule.nbl.com.au/match/match.js', { headers: H })).text();
console.log('LEN', t.length);
const s = new Set();
for (const m of t.match(/[`'"](\/api\/[^`'"\s]+)[`'"]/g) || []) s.add('API ' + m);
for (const m of t.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^`'"\s]{0,80}/g) || []) s.add('URL ' + m);
for (const m of t.match(/.{0,100}fetch\(.{0,160}/g) || []) s.add('FETCH ' + m.replace(/\s+/g, ' '));
console.log([...s].slice(0, 70).map(x => 'X ' + x).join('\n'));
