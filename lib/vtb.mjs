// VTB United League: converts one game from Infobasket (org.infobasket.su/Widget/GetOnline/<id>, the public feed behind
// vtb-league.com's game pages: box score + play-by-play) into the EuroLeague feed shape. Action codes and how they
// count follow the league's own game widget (rebound = offensive when it follows the same team's miss, etc.).

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
const pid = (id) => (id ? 'VTB' + id : '');

/** online: GetOnline JSON. meta: { gameId, round, utc, home:{code,name}, away:{code,name} } (home = team 1). */
export function convertVtb(online, meta, season) {
  const teams = online.GameTeams || [];
  const T1 = teams.find((t) => t.TeamNumber === 1), T2 = teams.find((t) => t.TeamNumber === 2);
  if (!T1?.Players?.length || !T2?.Players?.length) throw new Error('no box score');
  const sideOf = { 1: meta.home, 2: meta.away };
  const starts = new Map((online.OnlineStarts || []).map((s) => [s.StartID, s]));
  const plays = (online.OnlinePlays || []).filter((p) => p.SysStatus !== 0 && p.PlayTypeID !== 0);
  const byId = new Map(plays.map((p) => [p.PlayID, p]));
  const startOf = (p) => starts.get(p.StartID) || null;
  // Blocked shots: a block (27) is attached to the missed shot it blocked.
  const ag = new Map();
  for (const p of plays) if (p.PlayTypeID === 27 && p.ParentPlayID != null) { const sh = startOf(byId.get(p.ParentPlayID) || {}); if (sh?.PersonID) ag.set(sh.PersonID, (ag.get(sh.PersonID) || 0) + 1); }
  const names = new Map();
  const stats = [T1, T2].map((t) => {
    const side = sideOf[t.TeamNumber];
    const players = t.Players.map((r) => {
      const name = `${String(r.LastNameEn || r.LastNameRu || '').trim()}, ${String(r.FirstNameEn || r.FirstNameRu || '').trim()}`; names.set(r.PersonID, name);
      const g1 = n(r.Goal1), g2 = n(r.Goal2), g3 = n(r.Goal3);
      const line = { Points: n(r.Points), FieldGoalsMade2: g2, FieldGoalsAttempted2: n(r.Shot2), FieldGoalsMade3: g3, FieldGoalsAttempted3: n(r.Shot3), FreeThrowsMade: g1, FreeThrowsAttempted: n(r.Shot1),
        OffensiveRebounds: n(r.OffRebound), DefensiveRebounds: n(r.DefRebound), TotalRebounds: n(r.Rebound), Assistances: n(r.Assist), Steals: n(r.Steal), Turnovers: n(r.Turnover),
        BlocksFavour: n(r.Blocks), BlocksAgainst: ag.get(r.PersonID) || 0, FoulsCommited: n(r.Foul), FoulsReceived: n(r.OpponentFoul), Valuation: 0 };
      line.Valuation = line.Points + line.TotalRebounds + line.Assistances + line.Steals + line.BlocksFavour + line.FoulsReceived
        - (line.FieldGoalsAttempted2 - g2) - (line.FieldGoalsAttempted3 - g3) - (line.FreeThrowsAttempted - g1) - line.Turnovers - line.BlocksAgainst - line.FoulsCommited;
      return { Player_ID: pid(r.PersonID), Player: name, Team: side.code, Dorsal: String(r.DisplayNumber ?? ''), IsStarter: r.IsStart ? 1 : 0, IsPlaying: 0,
        Minutes: n(r.Seconds) ? mmss(n(r.Seconds)) : 'DNP', Plusminus: n(r.PlusMinus), ...line };
    });
    const tmr = Object.fromEntries(STAT.map((k) => [k, 0]));
    Object.assign(tmr, { OffensiveRebounds: n(t.TeamOffRebound), DefensiveRebounds: n(t.TeamDefRebound), TotalRebounds: n(t.TeamRebound), Turnovers: n(t.TeamTurnover), Steals: n(t.TeamSteal) });
    const totr = Object.fromEntries(STAT.map((k) => [k, players.reduce((a, p) => a + p[k], 0) + tmr[k]]));
    totr.Minutes = `${Math.round(n(t.Seconds) / 60) || 200}:00`;
    return { Team: side.name, PlayersStats: players, tmr, totr };
  });

  // Play-by-play. PlaySecond = tenths of a second elapsed in the period; children follow their parent.
  const per = online.Online || {};
  const lens = String(per.Periods || '10,10,10,10').split(',').map((x) => n(x) * 60), extra = n(per.PeriodExtraSeconds) || 300;
  const len = (p) => (p <= lens.length ? lens[p - 1] : extra);
  const root = (p) => { let r = p, guard = 0; while (r.ParentPlayID != null && byId.has(r.ParentPlayID) && guard++ < 10) r = byId.get(r.ParentPlayID); return r; };
  const ordered = [...plays].sort((a, b) => n(a.PlayPeriod) - n(b.PlayPeriod) || n(root(a).PlaySecond) - n(root(b).PlaySecond) || n(root(a).PlayID) - n(root(b).PlayID)
    || (a.ParentPlayID == null ? -1 : 0) - (b.ParentPlayID == null ? -1 : 0) || n(a.PlaySortOrder) - n(b.PlaySortOrder) || n(a.PlayID) - n(b.PlayID));
  const out = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [], continuous: true };
  const scoreAt = { 1: [0, 0] }; let sA = 0, sB = 0, seq = 0;
  const qEnd = [];
  // Who is on court, so the five listed at each period start can be turned into explicit substitutions.
  const onCourt = { 1: new Set(), 2: new Set() };
  for (const t of [T1, T2]) for (const r of t.Players) if (r.IsStart) onCourt[t.TeamNumber].add(r.PersonID);
  const push = (period, row) => (period <= 4 ? out[QUARTER_KEYS[period - 1]] : out.ExtraTime).push(row);
  for (const p of ordered) {
    const code = p.PlayTypeID, period = n(p.PlayPeriod) || 1, st = startOf(p), team = st && (st.TeamNumber === 1 || st.TeamNumber === 2) ? st.TeamNumber : 0;
    const isPlayer = st && names.has(st.PersonID);
    const parent = p.ParentPlayID != null ? byId.get(p.ParentPlayID) : null;
    let type = null;
    if (code === 1) { type = 'FTM'; } else if (code === 2) type = '2FGM'; else if (code === 3) type = '3FGM';
    else if (code === 4) type = 'FTA'; else if (code === 5) type = '2FGA'; else if (code === 6) type = '3FGA';
    else if (code === 8) type = parent?.PlayTypeID === 21 ? null : 'IN'; else if (code === 9) type = 'OUT';
    else if ((code >= 10 && code <= 20) || code === 47) type = 'TO';
    else if (code === 21) {
      push(period, { NUMBEROFPLAY: ++seq, PLAYTYPE: 'BP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '' });
      const five = { 1: new Set(), 2: new Set() };
      for (const c of plays) if (c.ParentPlayID === p.PlayID && c.PlayTypeID === 8) { const cs = startOf(c); if (cs && five[cs.TeamNumber] && names.has(cs.PersonID)) five[cs.TeamNumber].add(cs.PersonID); }
      const clock = mmss(len(period));
      for (const tn of [1, 2]) {
        if (five[tn].size !== 5) continue;
        for (const id of [...onCourt[tn]]) if (!five[tn].has(id)) { onCourt[tn].delete(id); push(period, { NUMBEROFPLAY: ++seq, PLAYTYPE: 'OUT', CODETEAM: sideOf[tn].code, PLAYER_ID: pid(id), PLAYER: names.get(id), MARKERTIME: clock }); }
        for (const id of five[tn]) if (!onCourt[tn].has(id)) { onCourt[tn].add(id); push(period, { NUMBEROFPLAY: ++seq, PLAYTYPE: 'IN', CODETEAM: sideOf[tn].code, PLAYER_ID: pid(id), PLAYER: names.get(id), MARKERTIME: clock }); }
      }
      continue;
    } else if (code === 22) type = 'EP';
    else if (code === 23) type = 'TOUT';
    else if (code === 25) type = parent && [1, 2, 3].includes(parent.PlayTypeID) ? 'AS' : null;
    else if (code === 26) type = 'ST'; else if (code === 27) type = 'FV';
    else if (code === 28) { const ps = parent ? startOf(parent) : null; type = ps && ps.TeamNumber === team ? 'O' : 'D'; }
    else if (code >= 40 && code <= 46) { const off = plays.some((c) => c.ParentPlayID === p.PlayID && c.PlayTypeID === 47); type = off ? 'OF' : code === 41 ? 'CMU' : code === 43 ? 'CMD' : (code === 42 || code === 44 || code === 45) ? 'CMT' : 'CM'; }
    else if (code >= 50 && code <= 54) type = 'RV';
    if (!type) continue;
    if (type === 'IN' && isPlayer && team) onCourt[team].add(st.PersonID);
    if (type === 'OUT' && isPlayer && team) onCourt[team].delete(st.PersonID);
    if (type === 'FTM') team === 1 ? (sA += 1) : (sB += 1); else if (type === '2FGM') team === 1 ? (sA += 2) : (sB += 2); else if (type === '3FGM') team === 1 ? (sA += 3) : (sB += 3);
    if (type === 'EP') qEnd[period] = [sA, sB];
    const rem = Math.max(0, len(period) - n(root(p).PlaySecond) / 10);
    const row = { NUMBEROFPLAY: ++seq, PLAYTYPE: type, CODETEAM: type === 'BP' || type === 'EP' || !team ? '' : sideOf[team].code, PLAYER_ID: isPlayer ? pid(st.PersonID) : '', PLAYER: isPlayer ? names.get(st.PersonID) : '', MARKERTIME: type === 'BP' ? '' : mmss(rem) };
    (period <= 4 ? out[QUARTER_KEYS[period - 1]] : out.ExtraTime).push(row);
  }
  const q = (i, k) => String((qEnd[i] || [0, 0])[k]);
  const d = String(meta.utc || '').slice(0, 10).split('-');
  const header = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(n(T1.Score)), ScoreB: String(n(T2.Score)), Date: `${d[2]}/${d[1]}/${d[0]}`, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: q(1, 0), ScoreQuarter2A: q(2, 0), ScoreQuarter3A: q(3, 0), ScoreQuarter4A: q(4, 0), ScoreQuarter1B: q(1, 1), ScoreQuarter2B: q(2, 1), ScoreQuarter3B: q(3, 1), ScoreQuarter4B: q(4, 1)
  };
  return { season, gameCode: Number(meta.gameId), fetchedAt: new Date().toISOString(), source: 'vtb-league.com (Infobasket)', header, boxscore: { Stats: stats }, pbp: seq ? out : null };
}
