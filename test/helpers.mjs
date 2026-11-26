// Builds games in the exact shape of the official live.euroleague.net feed.

export function playerRow(team, id, name, [fgm2, fga2], [fgm3, fga3], [ftm, fta], [oreb, dreb], ast, stl, tov, blk, pf, minutes = '40:00') {
  const pts = 2 * fgm2 + 3 * fgm3 + ftm;
  return {
    Player_ID: id + '   ', IsStarter: 1, IsPlaying: 0, Team: team, Dorsal: '1', Player: name, Minutes: minutes,
    Points: pts, FieldGoalsMade2: fgm2, FieldGoalsAttempted2: fga2, FieldGoalsMade3: fgm3, FieldGoalsAttempted3: fga3,
    FreeThrowsMade: ftm, FreeThrowsAttempted: fta, OffensiveRebounds: oreb, DefensiveRebounds: dreb, TotalRebounds: oreb + dreb,
    Assistances: ast, Steals: stl, Turnovers: tov, BlocksFavour: blk, BlocksAgainst: 0, FoulsCommited: pf, FoulsReceived: 0,
    Valuation: pts + oreb + dreb + ast + stl + blk - (fga2 - fgm2) - (fga3 - fgm3) - (fta - ftm) - tov - pf, Plusminus: 0
  };
}

const FIELDS = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];

export function teamBlock(name, players, teamRow = {}) {
  const tmr = { Player_ID: '', Team: '', Dorsal: '', Player: '', Minutes: null, Plusminus: null };
  for (const f of FIELDS) tmr[f] = teamRow[f] || 0;
  const totr = { Minutes: '200:00' };
  for (const f of FIELDS) totr[f] = players.reduce((s, p) => s + p[f], 0) + tmr[f];
  return { Team: name, Coach: 'COACH, A', PlayersStats: players, tmr, totr };
}

export function rawGame({ code = 1, round = 1, date = '30/09/2026', a, b, codeA, codeB, tvA, tvB }) {
  return {
    season: 'E2026', gameCode: code,
    header: {
      Live: false, Round: String(round), Date: date, TeamA: a.Team, TeamB: b.Team,
      CodeTeamA: codeA, CodeTeamB: codeB, TVCodeA: tvA || codeA, TVCodeB: tvB || codeB,
      ScoreA: String(a.totr.Points), ScoreB: String(b.totr.Points), Phase: 'REGULAR SEASON'
    },
    boxscore: { Live: false, Stats: [a, b] }
  };
}

/** The hand-checked game used in the tests (answers worked out on paper). */
export function knownGame() {
  const A = [
    playerRow('IST', 'P1', 'LARKIN, SHANE', [5, 8], [2, 5], [4, 4], [1, 4], 6, 2, 3, 0, 2),
    playerRow('IST', 'P2', 'DOE, JOHN', [4, 6], [1, 3], [2, 2], [2, 5], 2, 1, 1, 1, 3),
    playerRow('IST', 'P3', 'ROE, RICK', [3, 7], [3, 6], [0, 0], [0, 3], 1, 0, 2, 0, 1),
    playerRow('IST', 'P4', 'POE, PAUL', [6, 9], [0, 0], [3, 6], [3, 6], 1, 1, 2, 2, 4),
    playerRow('IST', 'P5', 'MOE, MIKE', [2, 4], [1, 4], [1, 2], [1, 2], 3, 0, 1, 0, 2)
  ];
  const B = [
    playerRow('TEL', 'Q1', 'ONE, AL', [4, 9], [2, 6], [2, 3], [1, 3], 4, 1, 2, 0, 3),
    playerRow('TEL', 'Q2', 'TWO, BO', [5, 8], [0, 1], [4, 4], [2, 4], 1, 0, 3, 1, 2),
    playerRow('TEL', 'Q3', 'THREE, CY', [3, 5], [2, 4], [0, 0], [0, 2], 2, 2, 1, 0, 2),
    playerRow('TEL', 'Q4', 'FOUR, DI', [2, 3], [0, 0], [2, 4], [3, 5], 0, 0, 1, 2, 4),
    playerRow('TEL', 'Q5', 'FIVE, ED', [1, 4], [1, 5], [0, 0], [0, 1], 5, 1, 2, 0, 1)
  ];
  return rawGame({
    a: teamBlock('ANADOLU EFES ISTANBUL', A, { DefensiveRebounds: 2, TotalRebounds: 2 }),
    b: teamBlock('MACCABI RAPYD TEL AVIV', B),
    codeA: 'IST', codeB: 'TEL', tvA: 'EFS', tvB: 'MTA'
  });
}
