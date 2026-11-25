const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const keys = (o, p = '', d = 0, out = []) => { if (d > 7 || !o || typeof o !== 'object') return out; for (const [k, v] of Object.entries(o)) { const q = p + '.' + k; out.push(q + (Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '' : '=' + String(v).slice(0, 30))); if (!Array.isArray(v)) keys(v, q, d + 1, out); else if (v[0]) keys(v[0], q + '[0]', d + 1, out); } return out; };
const r = await fetch('https://www.easycredit-bbl.de/spiele/2006838', { headers: H }); const t = await r.text();
const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); const pp = JSON.parse(m[1]).props.pageProps;
console.log('STATUS', pp.initialGameData.status, 'statsize', JSON.stringify(pp.initialGameStats || null).length);
console.log(keys(pp.initialGameStats).filter(k => !/imageUrl|birth/.test(k)).slice(0, 220).join('\n'));
console.log('OTHER', Object.keys(pp).join(','));
console.log('PBPWORDS', (t.match(/play-?by-?play|liveticker|actions|"events"/gi) || []).slice(0, 10));
