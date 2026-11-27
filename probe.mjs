const H = { 'User-Agent': 'HTA LAB stats', Accept: 'application/json', Origin: 'https://hta-lab.github.io' };
const r0 = await fetch('https://basket.co.il/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=0', { headers: H });
let j = JSON.parse((await r0.text()).replace(/^﻿/, '')); j = j.d ?? j; if (!Array.isArray(j)) j = Object.values(j).find(Array.isArray);
const wl = j.filter((x) => /winner league/i.test(x.board_name_eng || ''));
console.log('GAMESAPI', r0.status, 'ACAO=', r0.headers.get('access-control-allow-origin'));
const played = wl.filter((g) => +g.score_team1 > 0), next = wl.filter((g) => !(+g.score_team1 > 0));
console.log('NEXT', next.slice(0, 6).map((g) => `${g.game_date_txt} ${g.TimeOfGame} ${g.team1_name_eng}-${g.team2_name_eng} ext=${g.ExternalID}`).join(' || '));
for (const g of [played[played.length - 1], ...next.slice(0, 2)]) {
  if (!g?.ExternalID) { console.log('NOEXT', g && g.game_id); continue; }
  for (const u of [`https://basket.co.il/livestats/data/game-${g.ExternalID}.json`, `https://www.basket.co.il/livestats/data/game-${g.ExternalID}.json`]) {
    const r = await fetch(u, { headers: H }); const t = await r.text();
    console.log('LS', u, r.status, 'ACAO=', r.headers.get('access-control-allow-origin'), 'CC=', r.headers.get('cache-control'), 'LM=', r.headers.get('last-modified'), 'len', t.length, t.slice(0, 200).replace(/\s+/g, ' '));
  }
}
// what does the league's own live page use?
for (const u of ['https://basket.co.il/livestats/', 'https://basket.co.il/livestats/index.html']) { const r = await fetch(u, { headers: H }); const t = await r.text(); console.log('PAGE', u, r.status, (t.match(/(src|href)="[^"]+"|https?:\/\/[^"' ]+/g) || []).slice(0, 40).join(' ')); }
