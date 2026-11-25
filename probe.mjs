const urls = [
 'https://www.tbf.org.tr/ligler/bsl-2026-2027', 'https://www.bsl.org.tr/', 'https://bsl.org.tr/fikstur', 'https://www.tbf.org.tr/',
 'https://www.easycredit-bbl.de/', 'https://www.easycredit-bbl.de/spielplan', 'https://api.easycredit-bbl.de/', 'https://www.basketball-bundesliga.de/',
 'https://www.lnb.fr/', 'https://www.lnb.fr/elite/calendrier', 'https://lnb.fr/', 'https://api.lnb.fr/',
 'https://fibalivestats.dcd.shared.geniussports.com/data/2513000/data.json',
];
for (const u of urls) {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html,application/json' }, redirect: 'follow' });
    const t = await r.text(); console.log('R', r.status, u, '->', r.url, t.length, (t.match(/<title>[^<]*/) || [''])[0].slice(0, 80), /cloudflare|captcha|Access Denied/i.test(t) ? 'BLOCK' : '');
    const apis = [...new Set(t.match(/https?:\/\/[a-z0-9.-]*(api|data|stats|live|genius|wh\.|swish|sportradar)[a-z0-9.-]*\.[a-z]{2,}[^"' )]{0,60}/gi) || [])].slice(0, 8); if (apis.length) console.log('  APIS', apis.join(' | '));
  } catch (e) { console.log('R ERR', u, e.cause?.code || e.message); }
}
