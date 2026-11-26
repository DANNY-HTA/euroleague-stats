const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const g = async (u) => { try { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; } catch (e) { return [0, e.message]; } };
const show = (k, u, s, t) => { console.log('P', k, s, u, t.length, /__NEXT_DATA__/.test(t) ? 'NEXTDATA' : '', /self\.__next_f/.test(t) ? 'FLIGHT' : '', /geniussports/.test(t) ? 'GENIUS' : '');
  for (const w of ['PlayersStats', 'playerStats', 'boxscore', 'boxScore', '"pts"', '"points"', 'Minutes', '"min"', 'play-by-play', 'playByPlay', 'pbp']) { const i = t.indexOf(w); if (i >= 0) console.log('   W', w, t.slice(Math.max(0, i - 120), i + 200).replace(/\s+/g, ' ')); } };
// Greece
let [s, t] = await g('https://www.esake.gr'); const gr = [...new Set(t.match(/https?:\/\/www\.esake\.gr\/[^"' ]*(game|match|agon|boxscore|stat)[^"' ]*/gi) || [])]; console.log('GRLINKS', gr.slice(0, 12).join(' '));
for (const u of gr.slice(0, 2)) { const [a, b] = await g(u); show('GR', u, a, b); }
// Australia
[s, t] = await g('https://www.nbl.com.au/schedule'); const au = [...new Set(t.match(/\/(game|games|match|matches)\/[a-z0-9\/-]+/gi) || [])]; console.log('AULINKS', au.slice(0, 12).join(' '));
for (const u of au.slice(0, 2)) { const [a, b] = await g('https://www.nbl.com.au' + u); show('AU', u, a, b); }
// BCL
[s, t] = await g('https://www.championsleague.basketball/en/games'); console.log('BCLGAMES', s, t.length);
const bc = [...new Set(t.match(/\/en\/games?\/[a-z0-9\/-]+/gi) || [])]; console.log('BCLLINKS', bc.slice(0, 12).join(' '));
for (const u of bc.filter(x => /\d/.test(x)).slice(0, 2)) { const [a, b] = await g('https://www.championsleague.basketball' + u); show('BCL', u, a, b); const [c, d] = await g('https://www.championsleague.basketball' + u + '#boxscore'); }
