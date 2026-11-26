const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const g = async (u) => { try { const r = await fetch(u, { headers: H, redirect: 'follow' }); return [r.status, await r.text(), r.url]; } catch (e) { return [0, e.cause?.code || e.message, u]; } };
for (const u of ['https://www.aba-liga.com', 'https://www.aba-liga.com/robots.txt', 'https://www.aba-liga.com/calendar/', 'https://www.vtb-league.com', 'https://www.vtb-league.com/robots.txt', 'https://vtb-league.com/en/', 'https://api.vtb-league.com/']) {
  const [s, t, fu] = await g(u);
  console.log('R', s, u, '->', fu, String(t).length, (String(t).match(/<title>[^<]*/) || [''])[0].slice(0, 80), /Just a moment|cf-chl|captcha/i.test(t) ? 'CHALLENGE' : '');
  if (/robots/.test(u) && s === 200) console.log('  ROBOTS', String(t).slice(0, 400).replace(/\n/g, ' ⏎ '));
  const apis = [...new Set(String(t).match(/https?:\/\/[a-z0-9.-]*(api|data|stats|live|genius|fiba|hapi|wh\.|synergy|widget)[a-z0-9.-]*\.[a-z]{2,}[^"' )<]{0,60}/gi) || [])].filter(x => !/googleapis|gstatic|facebook|twitter|google-analytics|doubleclick/.test(x)).slice(0, 10);
  if (apis.length) console.log('  APIS', apis.join(' | '));
  const links = [...new Set(String(t).match(/href="[^"]*(game|match|boxscore|box-score|stats)[^"]*"/gi) || [])].slice(0, 10); if (links.length) console.log('  LINKS', links.join(' '));
}
