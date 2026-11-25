import { convertAcb, headerTeams } from './lib/acb.mjs';
import { parseGame } from './lib/parse.mjs';
import { validateGame } from './lib/validate.mjs';
import { buildStints, checkStints } from './lib/pbp.mjs';
const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB stats)' };
const get = async (u) => (await fetch(u, { headers: UA })).text();
const cal = await get('https://acb.com/es/calendario');
const slugs = [...new Set(cal.match(/partidos\/[a-z0-9-]+-\d{5,}/g) || [])];
console.log('calendar games', slugs.length);
let ok = 0, pbpOk = 0, n = 0; const reasons = {};
for (const s of slugs.slice(0, 40)) {
  const plays = await get(`https://live.acb.com/es/${s}/jugadas`);
  const h = headerTeams(plays);
  if (h.status !== 'FINALIZED') continue;
  if (++n > 12) break;
  const stats = await get(`https://live.acb.com/es/${s}/estadisticas`);
  const meta = { gameId: +s.match(/(\d+)$/)[1], date: h.start.slice(0, 10).split('-').reverse().join('/'), round: 1, home: { code: h.home.abbreviatedName, name: h.home.fullName }, away: { code: h.away.abbreviatedName, name: h.away.fullName } };
  try {
    const raw = convertAcb(stats, plays, meta, 'ACB');
    const g = parseGame(raw);
    const e = validateGame(g);
    if (e.length) { console.log('BOX FAIL', s, e.slice(0, 2).join(' | ')); continue; }
    ok++;
    const st = buildStints(g, raw.pbp); const why = st.ok ? checkStints(g, st.stints) : st.reason;
    if (!why) pbpOk++; else { console.log('PBP', s, why); }
    if (n === 1) console.log('sample players', g.home.players.slice(0, 3).map((p) => `${p.name} ${p.id} ${p.min.toFixed(1)} ${p.pts} st=${p.starter}`).join(' / '));
  } catch (err) { console.log('ERR', s, err.message); }
}
console.log('tested', n, 'boxOk', ok, 'pbpOk', pbpOk);
