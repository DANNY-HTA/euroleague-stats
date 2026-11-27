const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const get = async (u) => { const r = await fetch(u, { headers: H }); return [r.status, await r.text()]; };
const [, t] = await get('https://www.championsleague.basketball/en/games');
const links = [...new Set(t.match(/\/en\/games\/[^"'\\ <?#]+/g) || [])];
console.log('LINKS', links.length, links.slice(0, 12).join(' '));
const i = t.indexOf('ScoreTeam') > 0 ? t.indexOf('ScoreTeam') : t.search(/"(homeTeam|teamA|HomeTeam)"/); console.log('SNIP', i, t.slice(Math.max(0, i - 600), i + 900).replace(/\s+/g, ' '));
const g = links.find((l) => l.split('/').length > 4);
if (g) { const [s, p] = await get('https://www.championsleague.basketball' + g); console.log('GAME', g, s, p.length);
  for (const k of ['boxscore', 'Boxscore', 'PlayByPlay', 'playByPlay', 'Points', 'FieldGoal', 'Minutes', 'fibalivestats', 'Rebounds']) { const j = p.indexOf(k); console.log('K', k, j, j > 0 ? p.slice(j - 150, j + 350).replace(/\s+/g, ' ') : ''); } }
