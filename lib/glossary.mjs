// HTA LAB glossary. Definitions are our own. status: 'live' = shown on the site, 'soon' = planned.
// [abbreviation, full name, definition, formula or null, where on the site, status]
export const GLOSSARY = [
  ['Basics', [
    ['GP', 'Games played', 'Games in which the player was on the court for at least one second.', null, 'Players, player pages, lineups', 'live'],
    ['GS', 'Games started', 'Games in which the player was in the starting five.', null, 'Player pages, team rotation', 'live'],
    ['MIN / MP', 'Minutes played', 'Time on the court, from the official box score.', null, 'Everywhere', 'live'],
    ['W / L', 'Wins / losses', 'Games won and lost. For a player or lineup: games his team won or lost while he (or the unit) played.', null, 'Standings, lineups', 'live'],
    ['W%', 'Win percentage', 'Share of games won.', 'W / GP', 'Teams', 'live'],
    ['PTS', 'Points', 'Points scored.', '2 × 2PM + 3 × 3PM + FTM', 'Everywhere', 'live'],
    ['+/-', 'Plus-minus', 'The team’s points scored minus points allowed while the player was on the court, from the official box score.', null, 'Player pages, lineups', 'live'],
    ['PIR / EFF', 'Performance Index Rating', 'The EuroLeague’s official all-in-one box score number: positive plays minus negative ones.', '(PTS + REB + AST + STL + BLK + FD) − (missed FG + missed FT + TOV + BLKA + PF)', 'Players, leaderboards, player pages', 'live']
  ]],
  ['Shooting', [
    ['2PM / 2PA / 2P%', 'Two-pointers made, attempted, percentage', 'Shots inside the arc.', '2P% = 2PM / 2PA', 'Player pages, teams, lineups', 'live'],
    ['3PM / 3PA / 3P%', 'Three-pointers made, attempted, percentage', 'Shots from behind the arc.', '3P% = 3PM / 3PA', 'Player pages, teams, lineups', 'live'],
    ['FGM / FGA / FG%', 'Field goals made, attempted, percentage', 'All shots from the floor, twos and threes together.', 'FG% = FGM / FGA', 'Players, lineups', 'live'],
    ['FTM / FTA / FT%', 'Free throws made, attempted, percentage', 'Shots from the free-throw line.', 'FT% = FTM / FTA', 'Players, lineups', 'live'],
    ['%2P / 2P FREQ', 'Two-point frequency', 'Share of a player’s or team’s shots that are twos.', '2PA / FGA', 'Player pages', 'live'],
    ['%3P / 3P FREQ', 'Three-point frequency', 'Share of shots that are threes.', '3PA / FGA', 'Player pages, team reports, matchup', 'live'],
    ['FT RATIO / FT RATE', 'Free-throw rate', 'How often a player or team gets to the line, relative to shots taken.', 'FTA / FGA × 100', 'Player pages, team reports', 'live'],
    ['EFG%', 'Effective field-goal percentage', 'Field-goal percentage that gives a three its extra value.', '(FGM + 0.5 × 3PM) / FGA', 'Player pages, teams, lineups', 'live'],
    ['TS%', 'True shooting percentage', 'Scoring efficiency counting twos, threes and free throws together.', 'PTS / (2 × (FGA + 0.44 × FTA))', 'Players, player pages, lineups', 'live'],
    ['2P / 3P / FT per 100 POSS', 'Attempts per 100 possessions', 'Shot volume adjusted for pace.', 'attempts × 100 / possessions', 'Lineups (per 100 poss mode)', 'live'],
    ['SHOOTING FREQ (RIM, PAINT, MID, C3, L3)', 'Shooting frequency by zone', 'Share of shots taken at the rim, in the paint, from mid-range, from the corner three and from above-the-break three.', null, 'Needs the league’s shot-location feed', 'soon'],
    ['PPS (RIM, PAINT, MID, C3, L3)', 'Points per shot by zone', 'Points scored per shot attempt from each zone.', 'points from zone / shots from zone', 'Needs the league’s shot-location feed', 'soon']
  ]],
  ['Rebounds, passing, defence', [
    ['OREB / OR', 'Offensive rebounds', 'Rebounds of your own team’s misses.', null, 'Everywhere', 'live'],
    ['DREB / DR', 'Defensive rebounds', 'Rebounds of the opponent’s misses.', null, 'Everywhere', 'live'],
    ['TREB / TR', 'Total rebounds', 'Offensive plus defensive rebounds.', 'OREB + DREB', 'Everywhere', 'live'],
    ['OREB%', 'Offensive rebound percentage', 'Share of your own missed shots that your team rebounds.', 'OREB / (OREB + opponent DREB)', 'Team reports, matchup, lineups', 'live'],
    ['DREB%', 'Defensive rebound percentage', 'Share of the opponent’s misses your team rebounds.', 'DREB / (DREB + opponent OREB)', 'Team reports, matchup, lineups', 'live'],
    ['TREB%', 'Total rebound percentage', 'Share of all available rebounds collected.', '(OREB + DREB) / all rebounds', 'Lineups', 'live'],
    ['AST', 'Assists', 'Passes that lead directly to a made basket.', null, 'Everywhere', 'live'],
    ['AST%', 'Assist percentage', 'For a team or lineup: share of made baskets that were assisted.', 'AST / FGM', 'Team reports, lineups', 'live'],
    ['AST / TO', 'Assist-to-turnover ratio', 'Assists for every turnover.', 'AST / TOV', 'Player pages', 'live'],
    ['AST RATIO', 'Assist ratio', 'Assists per 100 plays used.', '100 × AST / (FGA + 0.44 × FTA + AST + TOV)', 'Lineups', 'live'],
    ['TO / TOV', 'Turnovers', 'Possessions lost without a shot or free throw.', null, 'Everywhere', 'live'],
    ['TOV% / TO RATIO', 'Turnover percentage', 'Turnovers per 100 plays used.', '100 × TOV / (FGA + 0.44 × FTA + TOV)', 'Lineups; per 100 possessions on team reports', 'live'],
    ['ST / STL', 'Steals', 'Times the player took the ball from the opponent.', null, 'Everywhere', 'live'],
    ['ST%', 'Steal percentage', 'Steals per 100 opponent possessions.', '100 × STL / opponent possessions', 'Lineups', 'live'],
    ['BLK', 'Blocks', 'Opponent shots blocked.', null, 'Everywhere', 'live'],
    ['BLKA / BA', 'Blocks against', 'The player’s own shots that were blocked.', null, 'Player pages', 'live'],
    ['BLK%', 'Block percentage', 'Share of opponent two-point attempts that were blocked.', 'BLK / opponent 2PA', 'Lineups', 'live'],
    ['PF', 'Personal fouls', 'Fouls committed.', null, 'Player pages, lineups', 'live'],
    ['DF / FD', 'Fouls drawn', 'Fouls committed against the player.', null, 'Player pages', 'live'],
    ['PF / DF per 100 POSS', 'Fouls per 100 possessions', 'Fouls committed or drawn, adjusted for pace.', 'fouls × 100 / possessions', 'Lineups (per 100 poss mode)', 'live'],
    ['PSF FREQ / DSF FREQ', 'Shooting foul frequency', 'How often fouls committed or drawn are shooting fouls.', null, 'Needs foul types from the play-by-play', 'soon'],
    ['STOCKS', 'Steals + blocks', 'A quick measure of defensive plays.', 'STL + BLK', 'Leaderboards, player pages', 'live'],
    ['PRA', 'Points + rebounds + assists', 'A quick all-round production number.', 'PTS + REB + AST', 'Leaderboards, player pages', 'live']
  ]],
  ['Pace and ratings', [
    ['POSS', 'Possessions', 'An estimate of how many times a team had the ball. We average both teams’ estimates for the game or stint.', 'FGA − OREB + TOV + 0.44 × FTA', 'Team reports, lineups', 'live'],
    ['SHOOTING CHANCES / PLAYS', 'Plays', 'Possession-ending actions: every shot, trip to the free-throw line or turnover.', 'FGA + 0.44 × FTA + TOV', 'Used in usage and turnover %', 'live'],
    ['PACE', 'Pace', 'Possessions per 40 minutes.', '40 × possessions / minutes', 'Teams, matchup, lineups', 'live'],
    ['ORTG / OFF RTG', 'Offensive rating', 'Points scored per 100 possessions. For a player: his team’s rating while he is on the court.', '100 × PTS / possessions', 'Teams, lineups, on/off', 'live'],
    ['DRTG / DEF RTG', 'Defensive rating', 'Points allowed per 100 possessions. Lower is better.', '100 × opponent PTS / possessions', 'Teams, lineups, on/off', 'live'],
    ['NRTG / NET RTG', 'Net rating', 'Offensive minus defensive rating.', 'ORTG − DRTG', 'Standings, teams, lineups', 'live'],
    ['OFF PPP / DEF PPP', 'Points per play', 'Points scored or allowed per play rather than per possession.', 'PTS / plays', 'Planned for team reports', 'soon'],
    ['IND ORTG / IND DRTG / IND NRTG', 'Individual ratings', 'On HTA LAB, the team’s offensive, defensive and net rating with the player on the court (on/off), rather than the Dean Oliver individual estimate.', null, 'Player pages (with and without), team reports', 'live'],
    ['USG%', 'Usage percentage', 'Share of the team’s plays a player finishes while on the court.', '100 × (FGA + 0.44 × FTA + TOV) × (team MIN / 5) / (MIN × (team FGA + 0.44 × team FTA + team TOV))', 'Players, player pages', 'live'],
    ['SoS', 'Strength of schedule', 'How strong a team’s opponents have been, from their net ratings.', 'average opponent net rating', 'Planned for team reports', 'soon']
  ]],
  ['Impact', [
    ['ON / OFF', 'On/off swing', 'Team margin per 100 possessions with the player on the court, minus the same with him on the bench, in the games he played.', 'NET RTG on − NET RTG off', 'Player pages, team reports', 'live'],
    ['LINEUPS', 'Lineup stats', 'Every stat above for five-man units and 2-, 3- and 4-man combinations.', null, 'Lineups tool, team reports', 'live'],
    ['RAPM', 'Regularised adjusted plus-minus', 'Estimates the points per 100 possessions a player adds, adjusted for every teammate and opponent he shared the court with. Pulled towards zero on purpose, so small samples don’t produce extreme numbers.', 'ridge regression over all stints of the season', 'Player pages, team reports', 'live'],
    ['KILLS', 'Kills', 'Runs of three or more stops in a row on defence.', null, 'Needs possession-by-possession parsing', 'soon'],
    ['NET POINTS', 'Net points', 'Points a player creates minus points he gives up, from the play-by-play.', null, 'Planned', 'soon'],
    ['PER', 'Player Efficiency Rating', 'A per-minute all-in-one rating adjusted to the league average (15). In the EuroLeague, PIR is the official equivalent.', null, 'Planned', 'soon'],
    ['WS / OWS / DWS', 'Win shares', 'Wins a player contributed, split into offence and defence.', null, 'Planned', 'soon'],
    ['WS / 40', 'Win shares per 40 minutes', 'Win shares adjusted for playing time.', 'WS × 40 / MIN', 'Planned', 'soon'],
    ['BPM / OBPM / DBPM', 'Box plus-minus', 'A box-score estimate of a player’s points per 100 possessions above an average player, split into offence and defence.', null, 'Planned', 'soon'],
    ['VORP', 'Value over replacement player', 'BPM turned into total value over a replacement-level player, scaled by minutes.', null, 'Planned', 'soon']
  ]]
];
