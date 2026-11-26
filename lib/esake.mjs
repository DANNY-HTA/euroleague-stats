// Greek Basketball League (Stoiximan GBL): reads the league's own pages on esake.gr — the round-by-round
// results list and each game's statistics page — and converts them to the EuroLeague feed shape.
// The league publishes box scores (no play-by-play, starters or +/-), so on/off and lineups are not available.

const n = (v) => { const x = Number(String(v ?? '').trim()); return Number.isFinite(x) ? x : 0; };
const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const MONTHS = { 'Ιαν': 1, 'Φεβ': 2, 'Μαρ': 3, 'Απρ': 4, 'Μαΐ': 5, 'Μαϊ': 5, 'Μαι': 5, 'Ιουν': 6, 'Ιουλ': 7, 'Αυγ': 8, 'Σεπ': 9, 'Οκτ': 10, 'Νοε': 11, 'Δεκ': 12 };

/** Greek local date text ("Σαβ 3 Οκτ - 15:00") -> UTC ISO string. firstYear: the season's first year. */
export function athensToUtc(text, firstYear) {
  const m = String(text).match(/(\d{1,2})\s+([Α-Ωα-ωΐϊ]+)\.?\s*-?\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mon = MONTHS[m[2]] || MONTHS[m[2].slice(0, 3)] || MONTHS[m[2].slice(0, 4)];
  if (!mon) return null;
  const y = mon >= 8 ? firstYear : firstYear + 1;
  const guess = Date.UTC(y, mon - 1, Number(m[1]), Number(m[3]), Number(m[4]));
  const off = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Athens', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t; };
  return new Date(guess - off(guess)).toISOString();
}

/** One results page (a round) -> [{ id, round, utc, venue, home, away, hs, as, played, crest:{teamId:url} }]. */
export function parseRound(html, firstYear) {
  const out = [];
  for (const block of String(html).split('<div class="esake-program-game">').slice(1)) {
    const id = (block.match(/idgame=([0-9A-F]{8})/) || [])[1];
    if (!id) continue;
    const teams = [...block.matchAll(/\/dat\/esaketeam\/([0-9A-F]{8})\/([^"]+)"/g)].map((m) => ({ id: m[1], crest: `https://www.esake.gr/dat/esaketeam/${m[1]}/${m[2]}` }));
    const info = [...block.matchAll(/esake-program-game-info[^>]*>([\s\S]*?)<\/div>/g)].map((m) => strip(m[1]));
    const score = strip((block.match(/esake-program-game-final-score[\s\S]*?text-center[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '').match(/(\d+)\s*-\s*(\d+)/);
    out.push({ id, round: n((block.match(/<h5>\s*(\d+)/) || [])[1]), utc: athensToUtc(info[0] || '', firstYear), venue: info[1] || '',
      home: teams[0]?.id, away: teams[1]?.id, crests: Object.fromEntries(teams.map((t) => [t.id, t.crest])), hs: score ? n(score[1]) : null, as: score ? n(score[2]) : null, played: !!score });
  }
  return out;
}

const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
const ma = (s) => { const m = String(s).match(/(\d+)\s*-\s*(\d+)/); return m ? [n(m[1]), n(m[2])] : [0, 0]; };
const cells = (row, tag) => [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
// Columns: player, P, 2PM-A, 3PM-A, FTM-A, REB, DREB, OREB, AST, BLK, BLK-A, FOULS drawn, FOULS committed, STL, TO, time played, ranking.
const line = (c) => {
  const [m2, a2] = ma(strip(c[2])), [m3, a3] = ma(strip(c[3])), [ft, fta] = ma(strip(c[4]));
  return { Points: n(strip(c[1])), FieldGoalsMade2: m2, FieldGoalsAttempted2: a2, FieldGoalsMade3: m3, FieldGoalsAttempted3: a3, FreeThrowsMade: ft, FreeThrowsAttempted: fta,
    TotalRebounds: n(strip(c[5])), DefensiveRebounds: n(strip(c[6])), OffensiveRebounds: n(strip(c[7])), Assistances: n(strip(c[8])), BlocksFavour: n(strip(c[9])), BlocksAgainst: n(strip(c[10])),
    FoulsReceived: n(strip(c[11])), FoulsCommited: n(strip(c[12])), Steals: n(strip(c[13])), Turnovers: n(strip(c[14])), Valuation: n(strip(c[16])) };
};

/** html: the game's statistics page (mode=3). meta: { gameId, round, utc, home:{id,code,name}, away:{...} }. */
export function convertEsake(html, meta, season) {
  const tables = String(html).split('table-stats-title').slice(1).map((s) => s.slice(0, s.indexOf('</table>')));
  if (tables.length < 2) throw new Error('box score not found');
  const sides = [meta.home, meta.away];
  const stats = tables.slice(0, 2).map((t, k) => {
    const team = sides[k];
    const body = t.slice(t.indexOf('<tbody>'), t.indexOf('</tbody>'));
    const players = body.split('<tr').slice(1).map((r) => cells(r, 'td')).filter((c) => c.length >= 17).map((c) => {
      const pid = (c[0].match(/idplayer=([0-9A-F]+)/) || [])[1];
      const last = strip((c[0].match(/<SPAN>([\s\S]*?)<\/SPAN>/i) || [])[1] || ''), first = strip(c[0].replace(/[\s\S]*<\/SPAN>/i, ''));
      const tp = strip(c[15]).split(':').map(Number), secs = tp.length === 3 ? tp[0] * 3600 + tp[1] * 60 + tp[2] : 0;
      const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      return { Player_ID: 'GR' + pid, Player: `${last}, ${first}`, Team: team.code, Dorsal: (strip(c[0]).match(/#(\d+)/) || [])[1] || '', IsStarter: 0, IsPlaying: 0, Minutes: secs ? mm : 'DNP', Plusminus: 0, ...line(c) };
    });
    const foot = t.slice(t.indexOf('<tfoot>'));
    const rows = foot.split('<tr').slice(1).map((r) => cells(r, 'th'));
    const tmr = Object.fromEntries(STAT.map((s) => [s, 0]));
    if (rows[0]) { const c = rows[0]; Object.assign(tmr, { TotalRebounds: n(strip(c[5])), DefensiveRebounds: n(strip(c[6])), OffensiveRebounds: n(strip(c[7])), FoulsCommited: n(strip(c[12])), Turnovers: n(strip(c[14])) }); }
    const totr = Object.fromEntries(STAT.map((s) => [s, players.reduce((a, p) => a + p[s], 0) + tmr[s]]));
    const secs = players.reduce((a, p) => { const [m, s] = p.Minutes === 'DNP' ? [0, 0] : p.Minutes.split(':').map(Number); return a + m * 60 + s; }, 0);
    totr.Minutes = `${200 + 25 * Math.max(0, Math.round((secs / 60 - 200) / 25))}:00`;
    if (rows[1]) totr.Valuation = n(strip(rows[1][16])) || totr.Valuation;
    return { Team: team.name, PlayersStats: players, tmr, totr, official: rows[1] ? n(strip(rows[1][1])) : null };
  });
  const q = [...String(html).matchAll(/<tr><td>(\d*)<\/td><td>(?:Q\d|OT\d?|ΠΑΡ\d?)<\/td><td>(\d*)<\/td><\/tr>/g)].slice(0, 4);
  let ca = 0, cb = 0; const qa = q.map((m) => (ca += n(m[1]))), qb = q.map((m) => (cb += n(m[2])));
  const fin = strip((String(html).match(/esake-pgame-view-final-score[\s\S]*?text-center[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '').match(/(\d+)\s*vs\s*(\d+)/);
  const d = String(meta.utc || '').slice(0, 10).split('-');
  const header = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(fin ? n(fin[1]) : stats[0].official), ScoreB: String(fin ? n(fin[2]) : stats[1].official), Date: `${d[2]}/${d[1]}/${d[0]}`, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0] ?? 0), ScoreQuarter2A: String(qa[1] ?? 0), ScoreQuarter3A: String(qa[2] ?? 0), ScoreQuarter4A: String(qa[3] ?? 0),
    ScoreQuarter1B: String(qb[0] ?? 0), ScoreQuarter2B: String(qb[1] ?? 0), ScoreQuarter3B: String(qb[2] ?? 0), ScoreQuarter4B: String(qb[3] ?? 0)
  };
  for (const s of stats) delete s.official;
  return { season, gameCode: parseInt(meta.gameId, 16), fetchedAt: new Date().toISOString(), source: 'esake.gr', header, boxscore: { Stats: stats }, pbp: null };
}
