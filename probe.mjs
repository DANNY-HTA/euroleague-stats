import { flight } from './lib/acb.mjs';
const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const B = 'https://basketball.scouting4u.com';
for (const p of ['/leagues/g-league-37/results', '/leagues/g-league-37/players', '/leagues/g-league-37/stats']) {
  const t = await (await fetch(B + p, { headers: H })).text(); const F = flight(t);
  console.log('PAGE', p, t.length, F.length);
  const hrefs = [...new Set((t + F).match(/\/(games?|matches?|match|boxscore|players?)\/[a-z0-9-]+/gi) || [])]; console.log('  HREFS', hrefs.slice(0, 15).join(' '));
  for (const w of ['"games"', '"matches"', 'homeScore', 'home_score', 'boxscore', 'points', '"results"', 'Season', 'season']) { const i = F.indexOf(w); if (i >= 0) console.log('  W', w, F.slice(Math.max(0, i - 200), i + 500).replace(/\s+/g, ' ')); }
  const txt = t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); const k = txt.indexOf('Results'); console.log('  TEXT', txt.slice(k, k + 1200));
}
