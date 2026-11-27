const H = { 'User-Agent': 'HTA LAB stats', Accept: 'application/json, text/plain, */*' };
const get = async (u) => { try { const r = await fetch(u, { headers: H }); const t = await r.text(); return [r.status, t.replace(/^﻿/, '')]; } catch (e) { return [0, String(e)]; } };
const [, t] = await get('https://basket.co.il/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=0');
let j = JSON.parse(t); j = j.d ?? j; if (!Array.isArray(j)) j = Object.values(j).find(Array.isArray);
const g = j.find((x) => /winner league/i.test(x.board_name_eng || '') && x.Ref);
console.log('KEYS', Object.keys(g).join(','));
for (const [k, v] of Object.entries(g)) if (/ref|judge|shofet|umpire|official/i.test(k)) console.log('FIELD', k, JSON.stringify(v));
const allRefs = new Set(j.filter((x) => /winner league/i.test(x.board_name_eng || '')).flatMap((x) => String(x.Ref || '').split(',').map((s) => s.trim()).filter(Boolean)));
console.log('NREFS', allRefs.size, [...allRefs].join(' | '));
for (const u of ['https://basket.co.il/ws/ws.asmx/Referees?cYear=2027', 'https://basket.co.il/ws/ws.asmx/GetReferees?cYear=2027', 'https://basket.co.il/ws/ws.asmx', `https://basket.co.il/ws/ws.asmx/Games?league_id=0&team_uid=0&cYear=2027&board_id=0&board_round=0&team_id=0&game_id=${g.game_id || g.id}&lang=en`]) { const [s, b] = await get(u); console.log('URL', u, s, b.slice(0, 1500).replace(/\s+/g, ' ')); }
