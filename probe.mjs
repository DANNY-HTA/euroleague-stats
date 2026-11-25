const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const g = async (u) => { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; };
const keys = (o, p = '', d = 0, out = []) => { if (d > 5 || !o || typeof o !== 'object') return out; for (const [k, v] of Object.entries(o)) { const q = p + '.' + k; out.push(q + (Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '' : '=' + String(v).slice(0, 40))); if (!Array.isArray(v)) keys(v, q, d + 1, out); else if (v[0]) keys(v[0], q + '[0]', d + 1, out); } return out; };
for (const u of ['https://www.easycredit-bbl.de/spiele/2006820', 'https://www.easycredit-bbl.de/spiele/2006820/boxscore', 'https://www.easycredit-bbl.de/spiele/2006820/play-by-play', 'https://www.easycredit-bbl.de/spiele/2006820/statistiken', 'https://www.easycredit-bbl.de/spiele/2006820/liveticker', 'https://www.easycredit-bbl.de/spiele']) {
  const [s, t] = await g(u); console.log('PAGE', s, u, t.length);
  const sub = [...new Set(t.match(/\/spiele\/2006820\/[a-z-]+/g) || [])]; console.log('  SUB', sub.join(' '));
  const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { const j = JSON.parse(m[1]); console.log('  NEXT', keys(j.props?.pageProps).slice(0, 120).join('\n  ')); }
}
