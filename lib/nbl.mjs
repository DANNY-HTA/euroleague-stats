// NBL (Australia): converts one game from the league's own match service (schedule.nbl.com.au/api/calendar/match,
// the data behind nbl.com.au's Game Centre: box score + play-by-play) into the EuroLeague feed shape.

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
const line = (r) => ({
  Points: n(r.points), FieldGoalsMade2: n(r.two_points_made), FieldGoalsAttempted2: n(r.two_points_attempted), FieldGoalsMade3: n(r.three_points_made), FieldGoalsAttempted3: n(r.three_points_attempted),
  FreeThrowsMade: n(r.free_throws_made), FreeThrowsAttempted: n(r.free_throws_attempted), OffensiveRebounds: n(r.offensive_rebounds), DefensiveRebounds: n(r.defensive_rebounds), TotalRebounds: n(r.rebounds),
  Assistances: n(r.assists), Steals: n(r.steals), Turnovers: n(r.turnovers), BlocksFavour: n(r.blocks), BlocksAgainst: 0, FoulsCommited: n(r.personal_fouls ?? r.fouls), FoulsReceived: 0, Valuation: n(r.efficiency)
});
const code = (t) => String(t?.team_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pid = (id) => (id ? 'NBL' + id : '');
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.round(secs % 60)).padStart(2, '0')}`;

function playType(p) {
  const t = p.action_type, s = String(p.sub_type || '');
  switch (t) {
    case 'period': return s === 'Start' ? 'BP' : s === 'End' ? 'EP' : null;
    case '2pt': return p.success ? '2FGM' : '2FGA';
    case '3pt': return p.success ? '3FGM' : '3FGA';
    case 'freeThrow': return p.success ? 'FTM' : 'FTA';
    case 'assist': return 'AS';
    case 'rebound': return /Offensive/i.test(s) ? 'O' : 'D';
    case 'steal': return 'ST';
    case 'block': return 'FV';
    case 'turnover': return 'TO';
    case 'foul': return /Drawn/i.test(s) ? 'RV' : /Offensive/i.test(s) ? 'OF' : /Technical/i.test(s) ? 'CMT' : /Unsportsmanlike/i.test(s) ? 'CMU' : /Disqualif/i.test(s) ? 'CMD' : 'CM';
    case 'substitution': return /In/i.test(s) ? 'IN' : 'OUT';
    case 'timeOut': return 'TOUT';
    default: return null;
  }
}

/** m: the "match" object of /api/calendar/match. */
export function convertNbl(m, season) {
  const H = m.home_team, A = m.away_team;
  const all = (m.player_match_statistics || []).filter((r) => String(r.period) === '0');
  if (!all.length) throw new Error('no box score');
  const teamTot = (t, per) => (m.team_match_statistics || []).find((x) => String(x.period) === String(per) && x.team?.id === t.id) || null;
  const drawn = new Map(), ag = new Map();
  // Chronological: period, game clock (counting down), then the league's own action order.
  const clk = (c) => { const [a, b] = String(c || '0:0').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  const acts = [...(m.play_by_play || [])].filter((p) => p.action_type !== 'fixture')
    .sort((x, y) => n(x.period) - n(y.period) || (x.action_type === 'period' && x.sub_type === 'Start' ? -1 : 0) - (y.action_type === 'period' && y.sub_type === 'Start' ? -1 : 0)
      || (x.action_type === 'period' && x.sub_type === 'End' ? 1 : 0) - (y.action_type === 'period' && y.sub_type === 'End' ? 1 : 0) || clk(y.clock) - clk(x.clock) || n(x.action_id) - n(y.action_id));
  let lastMiss = null;
  for (const p of acts) {
    const t = playType(p), who = p.personId || p.player?.id;
    if (t === 'RV' && who) drawn.set(who, (drawn.get(who) || 0) + 1);
    if (t === '2FGA' || t === '3FGA') lastMiss = p; else if (t === '2FGM' || t === '3FGM') lastMiss = null;
    if (t === 'FV' && lastMiss && lastMiss.team?.id !== p.team?.id) { const s = lastMiss.personId || lastMiss.player?.id; if (s) ag.set(s, (ag.get(s) || 0) + 1); lastMiss = null; }
  }
  const names = new Map();
  const stats = [H, A].map((t) => {
    const players = all.filter((r) => r.team?.id === t.id).map((r) => {
      const name = `${String(r.player?.last_name || '').trim()}, ${String(r.player?.first_name || '').trim()}`; names.set(r.player?.id, name);
      const [mm, ss] = String(r.minutes || '').split(':').map(Number); const secs = (mm || 0) * 60 + (ss || 0);
      return { Player_ID: pid(r.player?.id), Player: name, Team: code(t), Dorsal: String(r.jersey_number ?? ''), IsStarter: r.starter ? 1 : 0, IsPlaying: 0, Minutes: secs ? mmss(secs) : 'DNP',
        Plusminus: n(r.plus_minus), ...line(r), FoulsReceived: drawn.get(r.player?.id) || 0, BlocksAgainst: ag.get(r.player?.id) || 0 };
    });
    const tt = teamTot(t, 0) || {};
    const sum = (k) => players.reduce((a, p) => a + p[k], 0);
    const tmr = Object.fromEntries(STAT.map((k) => [k, 0]));
    Object.assign(tmr, { OffensiveRebounds: Math.max(0, n(tt.offensive_rebounds) - sum('OffensiveRebounds')), DefensiveRebounds: Math.max(0, n(tt.defensive_rebounds) - sum('DefensiveRebounds')),
      Turnovers: Math.max(0, n(tt.turnovers) - sum('Turnovers')) });
    tmr.TotalRebounds = tmr.OffensiveRebounds + tmr.DefensiveRebounds;
    const totr = Object.fromEntries(STAT.map((k) => [k, sum(k) + tmr[k]]));
    totr.Minutes = `${n(tt.minutes) || 200}:00`;
    return { Team: t.name, PlayersStats: players, tmr, totr };
  });
  const cum = (t) => { let c = 0; return [1, 2, 3, 4].map((q) => (c += n(teamTot(t, q)?.points))); };
  const [qa, qb] = [cum(H), cum(A)];
  const d = String(m.start_time_datetime || m.start_time).slice(0, 10).split('-');
  const header = {
    TeamA: H.name, TeamB: A.name, CodeTeamA: code(H), CodeTeamB: code(A), TVCodeA: code(H), TVCodeB: code(A),
    ScoreA: String(n(m.home_score)), ScoreB: String(n(m.away_score)), Date: `${d[2]}/${d[1]}/${d[0]}`, Round: String(m.override_round ?? m.round ?? ''), Phase: m.match_type === 'regular' ? 'REGULAR SEASON' : String(m.match_type || '').toUpperCase(), Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0]), ScoreQuarter2A: String(qa[1]), ScoreQuarter3A: String(qa[2]), ScoreQuarter4A: String(qa[3]),
    ScoreQuarter1B: String(qb[0]), ScoreQuarter2B: String(qb[1]), ScoreQuarter3B: String(qb[2]), ScoreQuarter4B: String(qb[3])
  };
  // Every substitution is recorded, including between periods, so the lineup carries over (continuous).
  const out = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [], continuous: true };
  let seq = 0;
  for (const p of acts) {
    const type = playType(p); if (!type) continue;
    const per = n(p.period) || 1, who = p.personId || p.player?.id || '';
    const side = p.team?.id === H.id ? code(H) : p.team?.id === A.id ? code(A) : '';
    const row = { NUMBEROFPLAY: ++seq, PLAYTYPE: type, CODETEAM: type === 'BP' || type === 'EP' ? '' : side, PLAYER_ID: pid(who), PLAYER: who ? names.get(who) || '' : '', MARKERTIME: type === 'BP' ? '' : String(p.clock || '') };
    (per <= 4 ? out[QUARTER_KEYS[per - 1]] : out.ExtraTime).push(row);
  }
  return { season, gameCode: m.id, fetchedAt: new Date().toISOString(), source: 'nbl.com.au', header, boxscore: { Stats: stats }, pbp: out };
}
