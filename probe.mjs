const r = await fetch('https://media-cdn.incrowdsports.com/cbb1c3ad-03d5-426a-b5ef-2832a4eee484.png', { headers: { 'User-Agent': 'Mozilla/5.0 HTA LAB' } });
const b = Buffer.from(await r.arrayBuffer());
console.log('STATUS', r.status, r.headers.get('content-type'), b.length);
const s = b.toString('base64'); for (let i = 0; i < s.length; i += 4000) console.log('B64 ' + String(i / 4000).padStart(4, '0') + ' ' + s.slice(i, i + 4000));
