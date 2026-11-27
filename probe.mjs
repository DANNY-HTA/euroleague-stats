const r0 = await fetch('https://basket.co.il/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=0', { headers: { 'User-Agent': 'HTA LAB stats' } });
let j = JSON.parse((await r0.text()).replace(/^﻿/, '')); j = j.d ?? j; if (!Array.isArray(j)) j = Object.values(j).find(Array.isArray);
const d = (s) => s.split('/').reverse().join('-');
const next = j.filter((x) => /winner league/i.test(x.board_name_eng || '') && !(+x.score_team1 > 0)).sort((a, b) => (d(a.game_date_txt) + a.TimeOfGame).localeCompare(d(b.game_date_txt) + b.TimeOfGame));
console.log('SOON', next.slice(0, 8).map((g) => `${d(g.game_date_txt)} ${g.TimeOfGame} ${g.team1_name_eng} - ${g.team2_name_eng} ext=${g.ExternalID}`).join(' || '));
console.log('HAP', next.filter((g) => /IBI Tel Aviv/.test(g.team1_name_eng + g.team2_name_eng)).slice(0, 2).map((g) => `${d(g.game_date_txt)} ${g.TimeOfGame} ${g.team1_name_eng} - ${g.team2_name_eng} ext=${g.ExternalID}`).join(' || '));
