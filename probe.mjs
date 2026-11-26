const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const sites = { ec: 'https://www.euroleaguebasketball.net/en/eurocup/', il: 'https://basket.co.il/?lang=en', lba: 'https://www.legabasket.it/', acb: 'https://www.acb.com/', bbl: 'https://www.easycredit-bbl.de/', gr: 'https://www.esake.gr/', nbl: 'https://www.nbl.com.au/', aba: 'https://www.aba-liga.com/', vtb: 'https://vtb-league.com/en/' };
for (const [k, u] of Object.entries(sites)) {
  try {
    const r = await fetch(u, { headers: H }); const t = await r.text(); const base = new URL(r.url);
    const abs = (x) => { try { return new URL(x.replace(/&amp;/g, '&'), base).href; } catch { return x; } };
    const imgs = [...t.matchAll(/<img[^>]+>/gi)].map((m) => m[0]).filter((x) => /logo/i.test(x)).map((x) => abs((x.match(/src="([^"]+)"/) || x.match(/data-src="([^"]+)"/) || [])[1] || '')).filter(Boolean);
    const svgs = [...new Set((t.match(/https?:[^"' )]+logo[^"' )]*\.(svg|png|webp)/gi) || []).concat((t.match(/["'(]\/[^"' )]*logo[^"' )]*\.(svg|png|webp)/gi) || []).map((x) => abs(x.slice(1)))))];
    const og = (t.match(/property="og:image"\s+content="([^"]+)"/) || t.match(/content="([^"]+)"\s+property="og:image"/) || [])[1];
    const icon = [...t.matchAll(/<link[^>]+rel="(?:apple-touch-icon|icon)"[^>]*>/gi)].map((m) => abs((m[0].match(/href="([^"]+)"/) || [])[1] || '')).slice(0, 3);
    console.log('L', k, r.status, '| IMG', [...new Set(imgs)].slice(0, 4).join(' ; '), '| URLS', svgs.slice(0, 4).join(' ; '), '| OG', og || '', '| ICON', icon.join(' ; '));
  } catch (e) { console.log('L', k, 'ERR', e.message); }
}
