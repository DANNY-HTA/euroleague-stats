const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const g = async (u) => { try { const r = await fetch(u, { headers: H }); return [r.status, await r.text(), r.url]; } catch (e) { return [0, e.message, u]; } };
for (const u of ['https://vtb-league.com/en/calendar/', 'https://vtb-league.com/en/games/', 'https://vtb-league.com/en/schedule/', 'https://vtb-league.com/en/results/', 'https://vtb-league.com/en/stats/']) {
  const [s, t, fu] = await g(u); const hrefs = [...new Set([...String(t).matchAll(/href="([^"]+)"/g)].map(m => m[1]))].filter(h => /game|match|calendar|box|stat/i.test(h));
  console.log('V', s, u, '->', fu, String(t).length, hrefs.slice(0, 15).join(' '));
  const apis = [...new Set(String(t).match(/https?:\/\/[a-z0-9.-]*(api|stats|data|widget|geniussports|fibalivestats|infobasket)[a-z0-9.-]*\.[a-z]{2,}[^"' <]{0,80}/gi) || [])].filter(x => !/w\.org|yandex|google/.test(x)); if (apis.length) console.log('  APIS', apis.slice(0, 10).join(' | '));
}
const [s, t] = await g('https://vtb-league.com/en/'); const ib = [...new Set(String(t).match(/[a-z0-9.-]*infobasket[^"' <]{0,80}|org\.infobasket[^"' <]{0,60}/gi) || [])]; console.log('IB', ib.slice(0, 10).join(' '));
