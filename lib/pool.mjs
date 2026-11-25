// Scouting pool: season stats for every player of a competition, from official box scores.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGame } from './parse.mjs';
import { validateGame } from './validate.mjs';
import { playerTable } from './stats.mjs';
import { indexPeople, findPerson, ageOn } from './people.mjs';
import { parseGamePage } from './ibba.mjs';

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

/** One row per player: [src, id, name, teamCode, teamName, pos, height, age, nat, gp, mpg, ppg, rpg, apg, spg, bpg, tpg, fgm2, fga2, fgm3, fga3, ftm, fta, ts, usg, pirpg, orpg, drpg, crest] */
export function poolRows(players, { src, teamName, people, crests, today }) {
  return players.map((p) => {
    const per = findPerson(people, p);
    const t = p.totals;
    return [src, String(p.id), p.name, p.team, teamName(p.team), per?.position || '', per?.height || null, per ? ageOn(per.birthDate, today) : null, per?.country || '',
      p.gp, r1(p.mpg), r1(p.ppg), r1(p.rpg), r1(p.apg), r1(p.spg), r1(p.bpg), r1(p.tpg), t.fgm2, t.fga2, t.fgm3, t.fga3, t.ftm, t.fta, r1(p.ts), r1(p.usg), r1(p.pirpg),
      r1(t.oreb / p.gp), r1(t.dreb / p.gp), crests.get(p.team) || null];
  });
}

/** Reads a downloaded season folder (e.g. data/raw/U2026) and returns pool rows. Games that fail the checks are left out. */
export function poolFromDir(dir, src, today) {
  if (!existsSync(dir)) return { rows: [], games: 0, skipped: 0 };
  const games = [], names = new Map();
  let skipped = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    try {
      const g = parseGame(JSON.parse(readFileSync(join(dir, f))));
      if (validateGame(g).length) { skipped++; continue; }
      games.push(g); names.set(g.home.code, g.home.name); names.set(g.away.code, g.away.name);
    } catch { skipped++; }
  }
  if (!games.length) return { rows: [], games: 0, skipped };
  const crests = new Map();
  try { for (const c of JSON.parse(readFileSync(join(dir, '_clubs.json')))) if (c.code && /^https:\/\/[^\s"'<>]+$/.test(c.crest || '')) { crests.set(c.code, c.crest); if (c.name) names.set(c.code, c.name); } } catch { /* optional */ }
  let people = indexPeople([]);
  try { people = indexPeople(JSON.parse(readFileSync(join(dir, '_people.json')))); } catch { /* optional */ }
  const tn = (code) => names.get(code) || code;
  return { rows: poolRows(playerTable(games), { src, teamName: tn, people, crests, today }), games: games.length, skipped };
}

/** Israeli Winner League: reads data/raw/ISR<year> (results list + game pages saved by fetch-ibba.mjs). */
export function poolFromIbba(dir, today) {
  if (!existsSync(dir)) return { rows: [], games: 0, skipped: 0 };
  let list = [];
  try { list = JSON.parse(readFileSync(join(dir, '_results.json'))); } catch { return { rows: [], games: 0, skipped: 0 }; }
  const games = [], names = new Map(), crests = new Map();
  let skipped = 0;
  for (const info of list) {
    try {
      const g = parseGamePage(readFileSync(join(dir, info.gameId + '.html'), 'utf8'), info, 'ISR');
      if (validateGame(g).length) { skipped++; continue; }
      games.push(g);
      for (const s of [g.home, g.away]) { names.set(s.code, s.name); if (s.crest && /^https:\/\/[^\s"'<>]+$/.test(s.crest)) crests.set(s.code, s.crest); }
    } catch { skipped++; }
  }
  if (!games.length) return { rows: [], games: 0, skipped };
  return { rows: poolRows(playerTable(games), { src: 'IL', teamName: (c) => names.get(c) || c, people: indexPeople([]), crests, today }), games: games.length, skipped };
}
