const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
for (const u of ['https://www.esake.gr', 'https://www.nbl.com.au/schedule', 'https://www.championsleague.basketball/en/games']) {
  const t = await (await fetch(u, { headers: H })).text();
  const hrefs = [...new Set([...t.matchAll(/href=\\?"([^"\\]+)\\?"/g)].map(m => m[1]))].filter(h => !/\.(css|js|png|svg|ico|jpg|webp|woff2?)(\?|$)/.test(h));
  console.log('H', u, hrefs.length, hrefs.filter(h => /\d{3,}/.test(h)).slice(0, 25).join(' '));
  const gids = [...new Set(t.match(/"(gameId|matchId|game_id|match_id|fixtureId|id)":\s*"?\d{4,}/g) || [])].slice(0, 10); console.log('  IDS', gids.join(' '));
  const wh = [...new Set(t.match(/wh\.geniussports\.com[^"' <]{0,120}/g) || [])].slice(0, 5); if (wh.length) console.log('  WH', wh.join(' | '));
}
