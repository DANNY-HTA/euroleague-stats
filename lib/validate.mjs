// Accuracy checks. Every game must pass every check, or the site is not built,
// so wrong numbers never reach the public page.

const SUM_KEYS = ['pts', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'tov', 'blk', 'pf'];
const pointsFrom = (s) => 2 * s.fgm2 + 3 * s.fgm3 + s.ftm;

function checkSide(g, t, label, errors) {
  const where = `Game ${g.gameCode} (${g.home.tv} vs ${g.away.tv}), ${label} ${t.tv}`;

  if (t.totals.pts !== t.score)
    errors.push(`${where}: official score ${t.score} but box-score total is ${t.totals.pts}`);
  if (pointsFrom(t.totals) !== t.totals.pts)
    errors.push(`${where}: team points ${t.totals.pts} do not equal 2×2PM + 3×3PM + FTM = ${pointsFrom(t.totals)}`);
  if (t.boxName && t.name && t.boxName !== t.name)
    errors.push(`${where}: box-score team "${t.boxName}" does not match header team "${t.name}"`);

  // Players (plus the "team" row for team rebounds/turnovers) must add up to the team total.
  for (const k of SUM_KEYS) {
    const players = t.players.reduce((s, p) => s + p[k], 0);
    const withTeamRow = players + t.teamRow[k];
    if (players !== t.totals[k] && withTeamRow !== t.totals[k])
      errors.push(`${where}: players' ${k} add up to ${players} (${withTeamRow} with team row) but team total is ${t.totals[k]}`);
  }

  // Minutes: 200 for 40 minutes, +25 for each overtime.
  if (t.teamMinutes > 0) {
    if (t.teamMinutes < 199 || Math.abs(((t.teamMinutes - 200) % 25)) > 0.5)
      errors.push(`${where}: team minutes ${t.teamMinutes.toFixed(1)} is not 200 (+25 per overtime)`);
    const pm = t.players.reduce((s, p) => s + p.min, 0);
    if (Math.abs(pm - t.teamMinutes) > 2)
      errors.push(`${where}: players' minutes add up to ${pm.toFixed(1)} but the team played ${t.teamMinutes.toFixed(1)}`);
  }

  const ids = new Set();
  for (const p of t.players) {
    const who = `${where}, ${p.name}`;
    if (!p.id) errors.push(`${who}: missing player id`);
    if (ids.has(p.id)) errors.push(`${who}: listed twice`);
    ids.add(p.id);
    if (pointsFrom(p) !== p.pts) errors.push(`${who}: ${p.pts} points but shots add up to ${pointsFrom(p)}`);
    if (p.fgm2 > p.fga2 || p.fgm3 > p.fga3 || p.ftm > p.fta) errors.push(`${who}: more shots made than attempted`);
    if (p.oreb + p.dreb !== p.reb) errors.push(`${who}: OREB + DREB ≠ REB`);
    for (const k of SUM_KEYS) if (p[k] < 0) errors.push(`${who}: negative ${k}`);
    if (p.min < 0 || p.min > 70) errors.push(`${who}: impossible minutes ${p.min.toFixed(1)}`);
  }
}

export function validateGame(g) {
  const errors = [];
  if (!g.home.code || !g.away.code) errors.push(`Game ${g.gameCode}: missing team code`);
  if (g.home.code === g.away.code) errors.push(`Game ${g.gameCode}: a team is playing itself`);
  if (g.home.score === g.away.score) errors.push(`Game ${g.gameCode}: tied final score ${g.home.score}–${g.away.score}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) errors.push(`Game ${g.gameCode}: unreadable date "${g.date}"`);
  checkSide(g, g.home, 'home', errors);
  checkSide(g, g.away, 'away', errors);
  return errors;
}

export function validateSeason(games) {
  const errors = [];
  const warnings = [];
  for (const g of games) errors.push(...validateGame(g));

  // The same matchup in the same round twice means a duplicate download.
  const seen = new Map();
  for (const g of games) {
    const key = `${g.phase}|${g.round}|${[g.home.code, g.away.code].sort().join('-')}`;
    if (seen.has(key)) errors.push(`Games ${seen.get(key)} and ${g.gameCode} look like the same game`);
    else seen.set(key, g.gameCode);
  }

  // Regular season: no team should be more than 2 games behind another (postponements happen).
  const gp = new Map();
  for (const g of games.filter((x) => /REGULAR/i.test(x.phase))) {
    for (const t of [g.home, g.away]) gp.set(t.code, (gp.get(t.code) || 0) + 1);
  }
  if (gp.size) {
    const max = Math.max(...gp.values());
    for (const [code, n] of gp) if (max - n > 2) warnings.push(`${code} has played ${n} games, others up to ${max}. Check for a missing game.`);
  }
  return { errors, warnings };
}
