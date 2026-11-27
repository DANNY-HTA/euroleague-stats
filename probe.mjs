const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html,application/json' };
const get = async (u) => { try { const r = await fetch(u, { headers: H, redirect: 'follow' }); const t = await r.text(); return [r.status, t, r]; } catch (e) { return [0, String(e)]; } };
for (const u of ['https://www.championsleague.basketball/en/games', 'https://www.championsleague.basketball/en/schedule', 'https://www.championsleague.basketball/en/', 'https://www.championsleague.basketball/robots.txt']) {
  const [s, t] = await get(u);
  console.log('P', u, s, t.length);
  if (u.endsWith('robots.txt')) console.log('ROBOTS', t.slice(0, 800).replace(/\n/g, ' | '));
  const ids = [...new Set((t.match(/fibalivestats[^"' <]+|geniussports[^"' <]+|\/game\/[^"' <]+|"gameId"\s*:\s*"?\d+|api[^"' <]*\.(?:fiba|basketball)[^"' <]*/gi) || []))].slice(0, 25);
  console.log('IDS', ids.join(' '));
  const nx = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); if (nx) console.log('NEXT', nx[1].slice(0, 1500));
}
