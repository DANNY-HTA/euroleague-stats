const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const g = async (u) => { try { const r = await fetch(u, { headers: H, redirect: 'follow' }); return [r.status, await r.text(), r.url]; } catch (e) { return [0, e.cause?.code || e.message, u]; } };
const sites = {
  GR: ['https://www.esake.gr', 'https://www.esake.gr/robots.txt', 'https://www.basket.gr'],
  AU: ['https://www.nbl.com.au', 'https://www.nbl.com.au/robots.txt', 'https://www.nbl.com.au/schedule'],
  LT: ['https://www.lkl.lt', 'https://www.lkl.lt/robots.txt', 'https://lkl.lt/en/'],
  BCL: ['https://www.championsleague.basketball', 'https://www.championsleague.basketball/robots.txt'],
  TR: ['https://www.tbf.org.tr', 'https://basketbolsuperligi.com', 'https://www.bsl.org.tr'],
};
for (const [k, us] of Object.entries(sites)) for (const u of us) {
  const [s, t, fu] = await g(u);
  console.log('R', k, s, u, '->', fu, String(t).length, (String(t).match(/<title>[^<]*/) || [''])[0].slice(0, 70), /Just a moment|cf-chl|captcha/i.test(t) ? 'CHALLENGE' : '');
  if (/robots/.test(u) && s === 200) console.log('  ROBOTS', String(t).slice(0, 500).replace(/\n/g, ' ⏎ '));
  const apis = [...new Set(String(t).match(/https?:\/\/[a-z0-9.-]*(api|data|stats|live|genius|fiba|hapi|wh\.)[a-z0-9.-]*\.[a-z]{2,}[^"' )<]{0,50}/gi) || [])].filter(x => !/googleapis|gstatic|facebook|twitter/.test(x)).slice(0, 10);
  if (apis.length) console.log('  APIS', apis.join(' | '));
}
