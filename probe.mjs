const BASE = 'https://basket.co.il';
const list = (j) => (Array.isArray(j) ? j : j?.d ? (typeof j.d === 'string' ? JSON.parse(j.d) : j.d) : j?.Games || j?.games || []);
const r = await fetch(`${BASE}/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=0`, { headers: { Accept: 'application/json' } });
const t = await r.text(); let j; try { j = JSON.parse(t); } catch { console.log('notjson', t.slice(0, 200)); }
const games = list(j).filter((g) => /winner league/i.test(g.board_name_eng || '') && g.ExternalID);
console.log('games', games.length, games[0]?.ExternalID);
const ls = await (await fetch(`${BASE}/livestats/data/game-${games[0].ExternalID}.json`)).json();
const acts = ls.actions?.actions || [];
const shots = acts.filter((a) => /2pt|3pt/i.test(a.actionType || ''));
console.log('acts', acts.length, 'shots', shots.length, 'keys', Object.keys(acts[0] || {}).join(','));
console.log('SHOT', JSON.stringify(shots.slice(0, 3)));
