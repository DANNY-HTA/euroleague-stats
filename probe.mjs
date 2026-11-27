const BASE = 'https://basket.co.il';
const list = (j) => (Array.isArray(j) ? j : j?.d ? (typeof j.d === 'string' ? JSON.parse(j.d) : j.d) : j?.Games || j?.games || []);
const r = await fetch(`${BASE}/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=0`, { headers: { Accept: 'application/json' } });
const games = list(JSON.parse(await r.text())).filter((g) => /winner league/i.test(g.board_name_eng || '') && g.ExternalID);
console.log('GAMEKEYS', Object.keys(games[0]).join(','));
console.log('GAME0', JSON.stringify(games[0]).slice(0, 900));
const ls = await (await fetch(`${BASE}/livestats/data/game-${games[0].ExternalID}.json`)).json();
console.log('LSKEYS', Object.keys(ls).join(','));
const t = JSON.stringify(ls); for (const k of ['officials', 'referee', 'Referee', 'official', 'umpire', 'Umpire']) { const i = t.indexOf(k); if (i >= 0) console.log('HIT', k, t.slice(Math.max(0, i - 100), i + 400)); }
