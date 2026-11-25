// Israeli Basketball Super League (Winner League): converts the league's official LiveStats game file
// (basket.co.il/livestats/data/game-<id>.json — box score + play-by-play) into the same raw shape as the
// EuroLeague live feed (header / boxscore / pbp), so every check and every page of the site works unchanged.

const n = (v) => { const x = Number(String(v ?? '').trim()); return Number.isFinite(x) ? x : 0; };
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];

/** "32:12" -> "32:12" (kept), seconds -> "mm:ss" */
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
const toSecs = (v) => { const m = String(v ?? '').match(/^(\d+):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : 0; };

/** Team codes for the site: three letters from the short English name ("Hapoel Tel Aviv" -> "HTA"), unique per season. */
export function teamCodes(teams) {
  const used = new Set(), out = new Map();
  for (const t of teams) {
    const words = String(t.short || t.name).replace(/[^A-Za-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    let code = (words.length >= 3 ? words.slice(0, 3).map((w) => w[0]).join('') : words.length === 2 ? words[0][0] + words[1].slice(0, 2) : (words[0] || 'TEAM').slice(0, 3)).toUpperCase();
    let k = 2; const base = code; while (used.has(code)) code = base.slice(0, 2) + k++;
    used.add(code); out.set(String(t.id), code);
  }
  return out;
}

/**
 * ls: the LiveStats game JSON. meta: { gameId, date: "dd/mm/yyyy", round, home: {code, name, short}, away: {...} }
 * Returns { season, gameCode, header, boxscore, pbp } like the EuroLeague feed, or throws if the file is incomplete.
 */
export function convertGame(ls, meta, season) {
  const gi = ls.gameInfo, box = ls.boxscore, acts = ls.actions?.actions || [];
  if (!gi || !box?.homeTeam || !box?.awayTeam) throw new Error('incomplete LiveStats file');
  const sides = { [String(gi.homeTeam.id)]: 'A', [String(gi.awayTeam.id)]: 'B' };
  const T = { A: meta.home, B: meta.away };
  const names = new Map();
  for (const [w, team] of [['A', gi.homeTeam], ['B', gi.awayTeam]]) for (const p of team.players || []) names.set(String(p.id), { last: p.lastName || '', first: p.firstName || '', jersey: p.jerseyNumber, w });
  const pid = (id) => 'IL' + id;
  const pname = (id) => { const x = names.get(String(id)); return x ? `${x.last}, ${x.first}` : ''; };

  // Team rebounds / turnovers (no player) go to the "team" row, as in the EuroLeague box score.
  const teamRow = { A: { reb: 0, oreb: 0, dreb: 0, tov: 0 }, B: { reb: 0, oreb: 0, dreb: 0, tov: 0 } };
  for (const a of acts) {
    const w = sides[String(a.teamId)]; if (!w || a.playerId) continue;
    if (a.type === 'rebound') { teamRow[w].reb++; teamRow[w][a.parameters?.type === 'offensive' ? 'oreb' : 'dreb']++; }
    if (a.type === 'turnover') teamRow[w].tov++;
  }
  const quarters = Math.max(4, n(gi.currentQuarter), ...acts.map((a) => n(a.quarter)));
  const teamMin = 200 + 25 * (quarters - 4);

  const line = (p) => {
    const f2m = n(p.fg_2m), f2a = f2m + n(p.fg_2mis), f3m = n(p.fg_3m), f3a = f3m + n(p.fg_3mis), ftm = n(p.ft_m), fta = ftm + n(p.ft_mis);
    return { Points: n(p.points), FieldGoalsMade2: f2m, FieldGoalsAttempted2: f2a, FieldGoalsMade3: f3m, FieldGoalsAttempted3: f3a, FreeThrowsMade: ftm, FreeThrowsAttempted: fta,
      OffensiveRebounds: n(p.reb_o), DefensiveRebounds: n(p.reb_d), TotalRebounds: n(p.reb_o) + n(p.reb_d), Assistances: n(p.ast), Steals: n(p.stl), Turnovers: n(p.to),
      BlocksFavour: n(p.blk), BlocksAgainst: n(p.blk_against), FoulsCommited: n(p.f), FoulsReceived: n(p.f_drawn), Valuation: n(p.rate) };
  };
  const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
  const stats = ['A', 'B'].map((w) => {
    const team = w === 'A' ? box.homeTeam : box.awayTeam, code = T[w].code;
    const players = (team.players || []).filter((p) => names.has(String(p.playerId)) || toSecs(p.minutes) > 0).map((p) => ({
      Player_ID: pid(p.playerId), Player: pname(p.playerId) || `PLAYER ${p.playerId}`, Team: code, Dorsal: String(p.jerseyNumber ?? ''), IsStarter: p.starter ? 1 : 0, IsPlaying: 0,
      Minutes: toSecs(p.minutes) ? mmss(toSecs(p.minutes)) : 'DNP', Plusminus: n(p.plusMinus), ...line(p)
    }));
    const tr = teamRow[w];
    const tmr = Object.fromEntries(STAT.map((k) => [k, 0]));
    tmr.OffensiveRebounds = tr.oreb; tmr.DefensiveRebounds = tr.dreb; tmr.TotalRebounds = tr.reb; tmr.Turnovers = tr.tov;
    const totr = Object.fromEntries(STAT.map((k) => [k, players.reduce((s, p) => s + p[k], 0) + tmr[k]]));
    totr.Minutes = `${teamMin}:00`;
    return { Team: T[w].name, PlayersStats: players, tmr, totr };
  });

  // Header in the EuroLeague shape (quarter scores are running totals).
  const qs = (arr) => { let c = 0; return [0, 1, 2, 3].map((i) => (c += n(arr?.[i]))); };
  const [qa, qb] = [qs(box.gameInfo?.homeQuarterScores), qs(box.gameInfo?.awayQuarterScores)];
  const header = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(n(box.gameInfo?.homeScore)), ScoreB: String(n(box.gameInfo?.awayScore)), Date: meta.date, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0]), ScoreQuarter2A: String(qa[1]), ScoreQuarter3A: String(qa[2]), ScoreQuarter4A: String(qa[3]),
    ScoreQuarter1B: String(qb[0]), ScoreQuarter2B: String(qb[1]), ScoreQuarter3B: String(qb[2]), ScoreQuarter4B: String(qb[3])
  };

  // Play-by-play in the EuroLeague shape.
  const pbp = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [] };
  let seq = 0;
  const push = (q, row) => { (q <= 4 ? pbp[QUARTER_KEYS[q - 1]] : pbp.ExtraTime).push({ NUMBEROFPLAY: ++seq, ...row }); };
  for (const a of acts) {
    const q = n(a.quarter) || 1, p = a.parameters || {}, w = sides[String(a.teamId)];
    const team = w ? T[w].code : '', player = a.playerId ? pid(a.playerId) : '', who = a.playerId ? pname(a.playerId) : '';
    const base = { CODETEAM: team, PLAYER_ID: player, PLAYER: who, MARKERTIME: a.quarterTime || '' };
    let type = null;
    if (a.type === 'quarter') type = p.type === 'start-of-quarter' ? 'BP' : p.type === 'end-of-quarter' ? 'EP' : null;
    else if (a.type === 'substitution') type = p.playerIn != null ? 'IN' : p.playerOut != null ? 'OUT' : null;
    else if (a.type === 'shot') type = (n(p.points) === 3 ? '3FG' : '2FG') + (p.made === 'made' ? 'M' : 'A');
    else if (a.type === 'freeThrow') type = p.made === 'made' ? 'FTM' : 'FTA';
    else if (a.type === 'rebound') type = p.type === 'offensive' ? 'O' : 'D';
    else if (a.type === 'assist') type = 'AS';
    else if (a.type === 'steal') type = 'ST';
    else if (a.type === 'turnover') type = 'TO';
    else if (a.type === 'block') type = 'FV';
    else if (a.type === 'foul-drawn') type = 'RV';
    else if (a.type === 'timeout') type = 'TOUT';
    else if (a.type === 'foul') {
      const t = String(p.type || ''), k = String(p.kind || '');
      type = !a.playerId ? 'C' : k === 'offensive' ? 'OF' : /^technical/.test(t) ? 'CMT' : /unsportsmanlike/.test(t) ? 'CMU' : /disqualif/.test(t) ? 'CMD' : 'CM';
    }
    if (!type) continue;
    if (type === 'BP' || type === 'EP') { push(q, { ...base, CODETEAM: '', PLAYER_ID: '', PLAYER: '', PLAYTYPE: type, MARKERTIME: type === 'BP' ? '' : '00:00' }); continue; }
    push(q, { ...base, PLAYTYPE: type });
  }
  return { season, gameCode: meta.gameId, fetchedAt: new Date().toISOString(), source: 'basket.co.il LiveStats', header, boxscore: { Stats: stats }, pbp };
}
