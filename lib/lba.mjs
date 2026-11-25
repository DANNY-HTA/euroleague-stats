// Lega Basket Serie A (Italy): converts the league's own match data (legabasket.it — box score + play-by-play)
// into the same raw shape as the EuroLeague feed, so every check and page of the site works unchanged.

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];

const line = (r) => ({
  Points: n(r.pun), FieldGoalsMade2: n(r.t2_r), FieldGoalsAttempted2: n(r.t2_t), FieldGoalsMade3: n(r.t3_r), FieldGoalsAttempted3: n(r.t3_t), FreeThrowsMade: n(r.tl_r), FreeThrowsAttempted: n(r.tl_t),
  OffensiveRebounds: n(r.rimbalzi_o), DefensiveRebounds: n(r.rimbalzi_d), TotalRebounds: n(r.rimbalzi_t), Assistances: n(r.ass), Steals: n(r.palle_r), Turnovers: n(r.palle_p),
  BlocksFavour: n(r.stoppate_dat), BlocksAgainst: n(r.stoppate_sub), FoulsCommited: n(r.falli_c), FoulsReceived: n(r.falli_sf), Valuation: n(r.val_lega)
});
const fullName = (r) => `${String(r.player_surname || r.surname || '').trim()}, ${String(r.player_name || r.name || '').trim()}`;

/** Play-by-play description (Italian) -> EuroLeague play type. */
function playType(a) {
  const d = String(a.description || '').toLowerCase(), q = `${a.action_1_qualifier_description || ''} ${a.action_2_qualifier_description || ''}`.toLowerCase();
  if (d === 'inizio tempo') return 'BP';
  if (d === 'fine tempo') return 'EP';
  if (d === '2 punti segnato') return '2FGM';
  if (d === '2 punti sbagliato') return '2FGA';
  if (d === '3 punti segnato') return '3FGM';
  if (d === '3 punti sbagliato') return '3FGA';
  if (d === 'tiro libero segnato') return 'FTM';
  if (d === 'tiro libero sbagliato') return 'FTA';
  if (d.startsWith('rimbalzo difensivo') || d.startsWith('rimbalzi difensivi')) return 'D';
  if (d.startsWith('rimbalzo offensivo') || d.startsWith('rimbalzi offensivi')) return 'O';
  if (d === 'assist') return 'AS';
  if (d === 'palla persa') return 'TO';
  if (d === 'palla recuperata') return 'ST';
  if (d === 'stoppata') return 'FV';
  if (d === 'stoppata subita') return 'AG';
  if (d === 'fallo subito') return 'RV';
  if (d === 'fallo commesso') return /offensiv/.test(q) ? 'OF' : /tecnic/.test(q) ? 'CMT' : /antisportiv/.test(q) ? 'CMU' : /espuls|squalific/.test(q) ? 'CMD' : 'CM';
  if (d === 'ingresso') return 'IN';
  if (d === 'uscita') return 'OUT';
  if (d === 'time out') return 'TOUT';
  return null;
}

/**
 * scores: get-championships-matches-scores-by-id; pbp: get-championships-matches-play-by-play;
 * meta: { gameId, date: "dd/mm/yyyy", round, home: {code, name, teamId}, away: {...} }
 */
export function convertLba(scores, pbp, meta, season) {
  const S = scores?.scores, m = scores?.match || {};
  if (!S?.ht?.rows || !S?.vt?.rows) throw new Error('incomplete box score');
  const sides = { A: { box: S.ht, t: meta.home }, B: { box: S.vt, t: meta.away } };
  const names = new Map();
  const stats = ['A', 'B'].map((w) => {
    const { box, t } = sides[w];
    const players = box.rows.map((r) => {
      names.set(String(r.player_id), fullName(r));
      const secs = n(r.sec) || n(r.min) * 60;
      return { Player_ID: 'LBA' + r.player_id, Player: fullName(r), Team: t.code, Dorsal: String(r.player_num ?? ''), IsStarter: n(r.sf) === 1 ? 1 : 0, IsPlaying: 0,
        Minutes: secs ? mmss(secs) : 'DNP', Plusminus: n(r.plus_minus), ...line(r) };
    });
    const tr = box.team || {};
    const tmr = Object.fromEntries(STAT.map((k) => [k, 0]));
    Object.assign(tmr, { OffensiveRebounds: n(tr.rimbalzi_o), DefensiveRebounds: n(tr.rimbalzi_d), TotalRebounds: n(tr.rimbalzi_t), Turnovers: n(tr.palle_p), Steals: n(tr.palle_r), FoulsCommited: n(tr.falli_c) });
    const totr = Object.fromEntries(STAT.map((k) => [k, players.reduce((s, p) => s + p[k], 0) + tmr[k]]));
    const ot = n(m.ot_hs) || n(m.ot_vs) ? Math.max(1, Math.round((n(box.totals?.min) - 200) / 25)) : 0;
    totr.Minutes = `${200 + 25 * ot}:00`;
    return { Team: t.name, PlayersStats: players, tmr, totr };
  });
  const cum = (k) => { let c = 0; return [1, 2, 3, 4].map((q) => (c += n(m[`q${q}_${k}`]))); };
  const [qa, qb] = [cum('hs'), cum('vs')];
  const header = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(n(m.home_final_score)), ScoreB: String(n(m.visitor_final_score)), Date: meta.date, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0]), ScoreQuarter2A: String(qa[1]), ScoreQuarter3A: String(qa[2]), ScoreQuarter4A: String(qa[3]),
    ScoreQuarter1B: String(qb[0]), ScoreQuarter2B: String(qb[1]), ScoreQuarter3B: String(qb[2]), ScoreQuarter4B: String(qb[3])
  };

  // Play-by-play: chronological (period, elapsed time, the league's own order), substitutions first at the same moment.
  const acts = (pbp?.pbp?.actions || []).map((a) => ({ a, type: playType(a), t: n(a.minute) * 60 + n(a.seconds) })).filter((x) => x.type);
  acts.sort((x, y) => n(x.a.period) - n(y.a.period) || (x.type === 'BP' ? -1 : 0) - (y.type === 'BP' ? -1 : 0) || (x.type === 'EP' ? 1 : 0) - (y.type === 'EP' ? 1 : 0)
    || x.t - y.t || ((x.type === 'IN' || x.type === 'OUT') ? 0 : 1) - ((y.type === 'IN' || y.type === 'OUT') ? 0 : 1) || n(x.a.order) - n(y.a.order) || n(x.a.id) - n(y.a.id));
  const out = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [], continuous: true };
  let seq = 0;
  for (const { a, type } of acts) {
    const per = n(a.period) || 1, len = per <= 4 ? 600 : 300;
    const team = a.team_id == null ? '' : String(a.team_id) === String(meta.home.teamId) ? meta.home.code : String(a.team_id) === String(meta.away.teamId) ? meta.away.code : '';
    const rem = Math.max(0, len - (n(a.minute) * 60 + n(a.seconds)));
    const row = { NUMBEROFPLAY: ++seq, PLAYTYPE: type, CODETEAM: type === 'BP' || type === 'EP' ? '' : team, PLAYER_ID: a.player_id ? 'LBA' + a.player_id : '',
      PLAYER: a.player_id ? names.get(String(a.player_id)) || `${a.player_surname || ''}, ${a.player_name || ''}` : '', MARKERTIME: type === 'BP' ? '' : mmss(rem) };
    (per <= 4 ? out[QUARTER_KEYS[per - 1]] : out.ExtraTime).push(row);
  }
  return { season, gameCode: meta.gameId, fetchedAt: new Date().toISOString(), source: 'legabasket.it', header, boxscore: { Stats: stats }, pbp: out };
}
