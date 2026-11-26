const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html,application/json' };
for (const u of ['https://gleague.nba.com/robots.txt', 'https://gleague.nba.com/', 'https://gleague.nba.com/schedule', 'https://gleague.nba.com/stats', 'https://stats.gleague.nba.com/', 'https://www.nba.com/robots.txt', 'https://www.nba.com/termsofuse']) {
  try { const r = await fetch(u, { headers: H }); const t = await r.text(); console.log('R', r.status, u, t.length);
    if (/robots/.test(u)) console.log(t.slice(0, 1500));
    if (/termsofuse/.test(u)) { const i = t.search(/scrap|robot|spider|data mining|automated/i); console.log('TERMS', i >= 0 ? t.slice(Math.max(0, i - 300), i + 500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : 'no match'); }
    const ids = [...new Set(t.match(/https?:\/\/[a-z0-9.-]*(stats|api|cdn)[a-z0-9.-]*\.nba\.com[^"' ]{0,50}/g) || [])].slice(0, 8); if (ids.length) console.log('  URLS', ids.join(' | '));
  } catch (e) { console.log('R ERR', u, e.cause?.code || e.message); }
}
