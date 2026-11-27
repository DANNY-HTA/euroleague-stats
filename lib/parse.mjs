import { refEnglish } from './refs-he.mjs';
// Turns the raw EuroLeague feed (Header + Boxscore JSON) into clean game objects.
// Nothing is calculated here; values are only renamed and converted to numbers.

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "33:21" -> 33.35 ; "DNP", "", null -> 0 */
export function parseMinutes(v) {
  const s = trim(v);
  if (!s || typeof s !== 'string' || !s.includes(':')) return 0;
  const [m, sec] = s.split(':').map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(sec)) return 0;
  return m + sec / 60;
}

/** "LARKIN, SHANE" -> "Shane Larkin" ; "DE COLO, NANDO" -> "Nando De Colo" */
export function formatName(raw) {
  const s = trim(raw) || '';
  const cap = (w) => w.toLowerCase()
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/(^|[\s\-])Mc(\p{L})/gu, (_, a, b) => a + 'Mc' + b.toUpperCase());
  // Roman numerals in names stay upper case: "Wade Baldwin IV", "Jimmy Clark III".
  const roman = (x) => x.replace(/\b(Ii|Iii|Iv|Vi)\b/g, (m) => m.toUpperCase());
  if (!s.includes(',')) return roman(cap(s));
  const [last, first] = s.split(',').map((x) => x.trim());
  return roman(cap(`${first} ${last}`.trim()));
}

/** "30/09/2025" -> "2025-09-30" */
export function parseDate(v) {
  const s = trim(v) || '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
}

const STAT_FIELDS = {
  pts: 'Points', fgm2: 'FieldGoalsMade2', fga2: 'FieldGoalsAttempted2',
  fgm3: 'FieldGoalsMade3', fga3: 'FieldGoalsAttempted3', ftm: 'FreeThrowsMade',
  fta: 'FreeThrowsAttempted', oreb: 'OffensiveRebounds', dreb: 'DefensiveRebounds',
  reb: 'TotalRebounds', ast: 'Assistances', stl: 'Steals', tov: 'Turnovers',
  blk: 'BlocksFavour', blka: 'BlocksAgainst', pf: 'FoulsCommited', fd: 'FoulsReceived',
  pir: 'Valuation'
};
export const STAT_KEYS = Object.keys(STAT_FIELDS);

function statLine(row) {
  const out = {};
  for (const [k, f] of Object.entries(STAT_FIELDS)) out[k] = num(row?.[f]);
  return out;
}

export function isFinishedGame(header, boxscore) {
  if (!header || header.Live === true) return false;
  if (trim(header.ScoreA) === '' || trim(header.ScoreB) === '') return false;
  const stats = boxscore?.Stats;
  if (!Array.isArray(stats) || stats.length !== 2) return false;
  return stats.every((t) => t?.totr && num(t.totr.Points) > 0 && Array.isArray(t.PlayersStats));
}

/** Points scored in each of the four quarters, from the header's running totals. null if missing. */
export function quarterPoints(header, which) {
  const cum = [1, 2, 3, 4].map((q) => header?.[`ScoreQuarter${q}${which}`]);
  if (cum.some((v) => v === undefined || v === null || v === '')) return null;
  const n = cum.map(Number);
  if (n.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const q = n.map((v, i) => v - (i ? n[i - 1] : 0));
  return q.some((v) => v < 0) ? null : q;
}

function side(header, teamStats, which) {
  const code = trim(header['CodeTeam' + which]);
  return {
    code,
    quarters: quarterPoints(header, which),
    tv: trim(header['TVCode' + which]) || code,
    name: trim(header['Team' + which]),
    score: num(header['Score' + which]),
    boxName: trim(teamStats?.Team),
    teamMinutes: parseMinutes(teamStats?.totr?.Minutes),
    totals: statLine(teamStats?.totr),
    teamRow: statLine(teamStats?.tmr),
    players: (teamStats?.PlayersStats || []).map((p) => ({
      id: trim(p.Player_ID),
      name: formatName(p.Player),
      rawName: trim(p.Player),
      team: code,
      number: trim(p.Dorsal),
      starter: num(p.IsStarter) === 1,
      min: parseMinutes(p.Minutes),
      pm: num(p.Plusminus),
      ...statLine(p)
    }))
  };
}

/** raw file object -> game */
export function parseGame(raw) {
  const { header, boxscore } = raw;
  const stats = boxscore.Stats;
  const nameA = trim(header.TeamA);
  // Match box-score teams to header teams by name; fall back to feed order.
  let a = stats.find((t) => trim(t.Team) === nameA);
  let b = stats.find((t) => t !== a);
  if (!a) { a = stats[0]; b = stats[1]; }
  return {
    season: raw.season,
    gameCode: raw.gameCode,
    round: num(header.Round),
    date: parseDate(header.Date),
    phase: trim(header.Phase) || '',
    refs: [header.Referee1, header.Referee2, header.Referee3].map((r) => refEnglish(trim(r))).filter(Boolean),
    home: side(header, a, 'A'),
    away: side(header, b, 'B')
  };
}
