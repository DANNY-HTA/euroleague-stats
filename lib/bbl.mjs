// easyCredit Basketball Bundesliga (Germany): converts the data embedded in the league's public game pages
// (easycredit-bbl.de/spiele/<id>: box score + play-by-play) into the same raw shape as the EuroLeague feed.

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
const line = (r) => ({
  Points: n(r.points), FieldGoalsMade2: n(r.twoPointShotsMade), FieldGoalsAttempted2: n(r.twoPointShotsAttempted), FieldGoalsMade3: n(r.threePointShotsMade), FieldGoalsAttempted3: n(r.threePointShotsAttempted),
  FreeThrowsMade: n(r.freeThrowsMade), FreeThrowsAttempted: n(r.freeThrowsAttempted), OffensiveRebounds: n(r.offensiveRebounds), DefensiveRebounds: n(r.defensiveRebounds), TotalRebounds: n(r.totalRebounds),
  Assistances: n(r.assists), Steals: n(r.steals), Turnovers: n(r.turnovers), BlocksFavour: n(r.blocks), BlocksAgainst: 0, FoulsCommited: n(r.foulsCommitted), FoulsReceived: n(r.foulsReceived), Valuation: n(r.efficiency)
});
const pid = (id) => (id ? 'BBL' + id : '');
const clock = (t) => { const p = String(t || '0:0:0').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0); };

/** One league action -> zero or more EuroLeague-style plays: [type, playerId, side]. */
function plays(a, shooterOfBlock) {
  const q = a.qualifiers || [], ok = a.isSuccessful, p = a.seasonPlayerId;
  switch (a.type) {
    case 'START': return [['BP']];
    case 'END': return [['EP']];
    case 'TWO_POINT_THROW': return [[ok ? '2FGM' : '2FGA', p], ...(ok && a.assistingSeasonPlayerId ? [['AS', a.assistingSeasonPlayerId]] : [])];
    case 'THREE_POINT_THROW': return [[ok ? '3FGM' : '3FGA', p], ...(ok && a.assistingSeasonPlayerId ? [['AS', a.assistingSeasonPlayerId]] : [])];
    case 'FREE_THROW': return [[ok ? 'FTM' : 'FTA', p]];
    case 'REBOUND': case 'TEAM_REBOUND': return [[q.includes('OFFENSIVE') ? 'O' : 'D', p]];
    case 'TURN_OVER': case 'TEAM_TURN_OVER': return [['TO', p]];
    case 'STEAL': return [['ST', p]];
    case 'BLOCK': return [['FV', p], ...(shooterOfBlock ? [['AG', shooterOfBlock.seasonPlayerId, shooterOfBlock.seasonTeamId]] : [])];
    case 'RECEIVED_FOUL': return [['RV', p]];
    case 'FOUL': {
      if (!p) return [['CMT']];
      const t = q.includes('OFFENSIVE') ? 'OF' : q.some((x) => /TECHNICAL/.test(x)) ? 'CMT' : q.some((x) => /UNSPORTSMANLIKE/.test(x)) ? 'CMU' : q.some((x) => /DISQUALIF/.test(x)) ? 'CMD' : 'CM';
      return [[t, p]];
    }
    case 'SUBSTITUTION': return [['OUT', p], ['IN', a.assistingSeasonPlayerId]];
    case 'TIME_OUT': return [['TOUT']];
    default: return [];
  }
}

/** page: the game page's pageProps (initialGameData + initialGameStats). meta: { round } (optional). */
export function convertBbl(page, season, meta = {}) {
  const G = page.initialGameData, S = page.initialGameStats;
  if (!G || !S?.homeTeam?.playerStats || !S?.guestTeam?.playerStats) throw new Error('incomplete box score');
  const sideT = { A: G.homeTeam, B: G.guestTeam }, code = (t) => String(t.tlc).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const teamOf = new Map([[String(G.homeTeam.seasonTeamId ?? G.homeTeam.teamId), 'A'], [String(G.guestTeam.seasonTeamId ?? G.guestTeam.teamId), 'B'], [String(S.homeTeam.id), 'A'], [String(S.guestTeam.id), 'B']]);
  const names = new Map();
  const stats = ['A', 'B'].map((w) => {
    const box = w === 'A' ? S.homeTeam : S.guestTeam, t = sideT[w];
    const players = box.playerStats.map((r) => {
      const sp = r.seasonPlayer || {}, name = `${String(sp.lastName || '').trim()}, ${String(sp.firstName || '').trim()}`;
      names.set(String(sp.id), name);
      const secs = n(r.secondsPlayed);
      return { Player_ID: pid(sp.id), Player: name, Team: code(t), Dorsal: String(r.shirtNumber ?? sp.shirtNumber ?? ''), IsStarter: r.isStartingFive ? 1 : 0, IsPlaying: 0,
        Minutes: secs ? mmss(secs) : 'DNP', Plusminus: n(r.plusMinus), ...line(r) };
    });
    const c = box.coachStat || {};
    const tmr = Object.fromEntries(STAT.map((k) => [k, 0]));
    Object.assign(tmr, { OffensiveRebounds: n(c.offensiveRebounds), DefensiveRebounds: n(c.defensiveRebounds), TotalRebounds: n(c.totalRebounds), Turnovers: n(c.turnovers), Steals: n(c.steals), FoulsCommited: n(c.foulsCommitted) });
    const totr = Object.fromEntries(STAT.map((k) => [k, players.reduce((s, p) => s + p[k], 0) + tmr[k]]));
    totr.Minutes = `${Math.round(n(box.gameStat?.secondsPlayed) / 60) || 200}:00`;
    return { Team: t.name, PlayersStats: players, tmr, totr };
  });
  const R = G.result || {};
  const cum = (s) => { let c = 0; return [1, 2, 3, 4].map((q) => (c += n(R[`${s}TeamQ${q}Score`]))); };
  const [qa, qb] = [cum('home'), cum('guest')];
  const d = String(G.scheduledTime || S.scheduledTime).slice(0, 10).split('-');
  const header = {
    TeamA: G.homeTeam.name, TeamB: G.guestTeam.name, CodeTeamA: code(G.homeTeam), CodeTeamB: code(G.guestTeam), TVCodeA: code(G.homeTeam), TVCodeB: code(G.guestTeam),
    ScoreA: String(n(R.homeTeamFinalScore)), ScoreB: String(n(R.guestTeamFinalScore)), Date: `${d[2]}/${d[1]}/${d[0]}`, Round: String(meta.round ?? G.matchDay ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0]), ScoreQuarter2A: String(qa[1]), ScoreQuarter3A: String(qa[2]), ScoreQuarter4A: String(qa[3]),
    ScoreQuarter1B: String(qb[0]), ScoreQuarter2B: String(qb[1]), ScoreQuarter3B: String(qb[2]), ScoreQuarter4B: String(qb[3])
  };
  // Blocked shots are not in the box score: credit them from the play-by-play (the missed shot just before a block).
  const acts = [...(S.actions || [])].sort((x, y) => n(x.orderId) - n(y.orderId));
  const out = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [] }; // breaks between periods carry unrecorded changes: starters are worked out per period
  let seq = 0, lastMiss = null;
  const ag = new Map();
  for (const a of acts) {
    const per = n(a.period) || 1;
    if (/_THROW$/.test(a.type) && a.type !== 'FREE_THROW') lastMiss = a.isSuccessful ? null : a;
    const blockOf = a.type === 'BLOCK' && lastMiss && String(lastMiss.seasonTeamId) !== String(a.seasonTeamId) ? lastMiss : null;
    for (const [type, p, team] of plays(a, blockOf)) {
      const side = teamOf.get(String(team ?? a.seasonTeamId));
      if (type === 'AG' && p) ag.set(String(p), (ag.get(String(p)) || 0) + 1);
      const row = { NUMBEROFPLAY: ++seq, PLAYTYPE: type, CODETEAM: type === 'BP' || type === 'EP' || !side ? '' : code(sideT[side]), PLAYER_ID: pid(p),
        PLAYER: p ? names.get(String(p)) || '' : '', MARKERTIME: type === 'BP' ? '' : mmss(clock(a.gameTime)) };
      (per <= 4 ? out[QUARTER_KEYS[per - 1]] : out.ExtraTime).push(row);
    }
    if (a.type === 'BLOCK') lastMiss = null;
  }
  for (const s of stats) { for (const p of s.PlayersStats) p.BlocksAgainst = ag.get(p.Player_ID.slice(3)) || 0; s.totr.BlocksAgainst = s.PlayersStats.reduce((t, p) => t + p.BlocksAgainst, 0); }
  return { season, gameCode: Number(G.id), fetchedAt: new Date().toISOString(), source: 'easycredit-bbl.de', header, boxscore: { Stats: stats }, pbp: out };
}
