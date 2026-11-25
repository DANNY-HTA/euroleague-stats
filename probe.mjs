const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const keys = (o, p = '', d = 0, out = []) => { if (d > 6 || !o || typeof o !== 'object') return out; for (const [k, v] of Object.entries(o)) { const q = p + '.' + k; out.push(q + (Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '' : '=' + String(v).slice(0, 30))); if (!Array.isArray(v)) keys(v, q, d + 1, out); else if (v[0]) keys(v[0], q + '[0]', d + 1, out); } return out; };
for (const id of [2006700, 2006760, 2006790]) {
  const r = await fetch('https://www.easycredit-bbl.de/spiele/' + id, { headers: H }); const t = await r.text();
  const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (!m) { console.log('X', id, r.status); continue; }
  const pp = JSON.parse(m[1]).props?.pageProps || {}; delete pp.menuData; delete pp.footerData; delete pp.originalError;
  const gd = pp.initialGameData || {}; console.log('GAME', id, r.status, gd.status, gd.homeTeam?.tlc, gd.guestTeam?.tlc, 'size', m[1].length);
  console.log(keys(pp).filter(k => !/last10|ticket|foreign|magenta|advancedCustom/.test(k)).slice(0, 160).join('\n'));
  if (gd.status && gd.status !== 'PRE') break;
}
