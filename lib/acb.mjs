// Liga Endesa (ACB, Spain): reads the league's public match pages on live.acb.com — the box-score table
// on /estadisticas and the play-by-play data embedded in /jugadas — and converts them into the same raw
// shape as the EuroLeague feed, so every check and page of the site works unchanged.

const n = (v) => { const x = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(x) ? x : 0; };
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
const pad = (x) => String(x).padStart(2, '0');

/** The page's embedded data (Next.js "flight" payload), decoded into one string. */
export function flight(html) {
  let out = '';
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { out += JSON.parse(m[1]); } catch { /* skip */ } }
  return out;
}
/** Extract the JSON value that follows `"key":` in the decoded payload. */
export function jsonAfter(s, key, open = null) {
  let at = -1;
  for (;;) {
    at = s.indexOf(`"${key}":`, at + 1); if (at < 0) return null;
    const c = s[at + key.length + 3];
    if (open ? c === open : (c === '{' || c === '[')) break;
  }
  let k = at + key.length + 3; const start = k; let depth = 0;
  for (; k < s.length; k++) {
    const c = s[k];
    if (c === '"') { k++; while (k < s.length && s[k] !== '"') { if (s[k] === '\\') k++; k++; } continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, k + 1)); } catch { return null; } } }
  }
  return null;
}

const text = (h) => String(h).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ma = (v) => { const m = String(v).match(/(\d+)\s*\/\s*(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
const secs = (v) => { const m = String(v).match(/(\d+):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; };

/** Box-score tables from /estadisticas: [{ players:[{num, name, ...}], team:{...}, totals:{...} }, x2] (home, away). */
export function boxTables(html) {
  const tables = [...String(html).matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => m[0]).filter((t) => /__playerName/.test(t));
  const out = [];
  for (const t of tables) {
    const rows = [...t.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)];
    const team = { players: [], team: null, totals: null };
    for (const [, attrs, inner] of rows) {
      const cells = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
      if (cells.length < 20) continue;
      const [who, min, pts, t2, , t3, , tl, , or, dr, tr, as, to, st, b, br, , pf, fd, pm, val] = cells;
      const [f2m, f2a] = ma(t2), [f3m, f3a] = ma(t3), [ftm, fta] = ma(tl);
      const line = { secs: secs(min), Points: n(pts), FieldGoalsMade2: f2m, FieldGoalsAttempted2: f2a, FieldGoalsMade3: f3m, FieldGoalsAttempted3: f3a, FreeThrowsMade: ftm, FreeThrowsAttempted: fta,
        DefensiveRebounds: n(dr), OffensiveRebounds: n(or), TotalRebounds: n(tr), Assistances: n(as), Turnovers: n(to), Steals: n(st), BlocksFavour: n(b), BlocksAgainst: n(br),
        FoulsCommited: n(pf), FoulsReceived: n(fd), Plusminus: n(pm), Valuation: n(val) };
      if (/teamRow/.test(attrs)) team.team = line;
      else if (/totalsRow/.test(attrs)) team.totals = line;
      else { const m = who.match(/^(\d+)\s+(.*)$/); team.players.push({ num: m ? m[1] : '', name: m ? m[2] : who, ...line }); }
    }
    if (team.players.length && team.totals) out.push(team);
  }
  // The page may repeat the tables (mobile/desktop): keep the first two distinct ones.
  const uniq = [];
  for (const t of out) if (!uniq.some((u) => u.totals.Points === t.totals.Points && u.players.length === t.players.length && u.players[0].name === t.players[0].name)) uniq.push(t);
  return uniq.slice(0, 2);
}

const STAT_EVENTS = [
  ['twoPointersMade', '2FGM'], ['threePointersMade', '3FGM'], ['freeThrowsMade', 'FTM'],
  ['offRebounds', 'O'], ['defRebounds', 'D'], ['assists', 'AS'], ['steals', 'ST'], ['turnovers', 'TO'], ['blocks', 'FV'], ['personalFouls', 'CM'], ['foulsDrawn', 'RV']
];

/**
 * statsHtml: /estadisticas page; playsHtml: /jugadas page.
 * meta: { gameId, date: "dd/mm/yyyy", round, home: {code, name}, away: {...} }
 */
export function convertAcb(statsHtml, playsHtml, meta, season) {
  const F = flight(playsHtml);
  const header = jsonAfter(F, 'initialMatchHeader', '{') || {};
  const plays = (jsonAfter(F, 'plays', '[') || []).slice().sort((a, b) => n(a.order) - n(b.order));
  const box = boxTables(statsHtml);
  if (box.length !== 2) throw new Error('box score not found');
  const sideOf = (local) => (local ? 'A' : 'B');
  // shirt number -> player id and full name, from the play-by-play
  const byNum = { A: new Map(), B: new Map() };
  for (const p of plays) if (p.playerLicenseId && p.playerNumber != null && p.playerNumber !== '') byNum[sideOf(p.local)].set(String(p.playerNumber), { id: 'ACB' + p.playerLicenseId, name: p.playerName });
  // starters: the starting-lineup plays (type 599) at the opening
  const starters = new Set(plays.filter((p) => p.playType === 599 && p.playerLicenseId).map((p) => 'ACB' + p.playerLicenseId));
  const T = { A: meta.home, B: meta.away };
  const lastName = (abbr) => String(abbr).replace(/^[A-ZÁÉÍÓÚÑ]\.\s*/u, '').trim();
  const stats = ['A', 'B'].map((w, i) => {
    const t = box[i];
    const players = t.players.map((p) => {
      const hit = byNum[w].get(String(p.num));
      const id = hit?.id || `ACB${T[w].code}${p.num}`;
      const full = hit?.name || p.name;
      const parts = full.split(' ');
      const PL = parts.length > 1 ? `${parts.slice(1).join(' ')}, ${parts[0]}` : full;
      const { secs: s, num, name, ...line } = p;
      return { Player_ID: id, Player: hit ? PL : lastName(p.name), Team: T[w].code, Dorsal: String(p.num), IsStarter: starters.has(id) ? 1 : 0, IsPlaying: 0,
        Minutes: s ? `${pad(Math.floor(s / 60))}:${pad(s % 60)}` : 'DNP', ...line };
    });
    const tmr = Object.fromEntries(STAT.map((k) => [k, t.team?.[k] || 0]));
    const totr = Object.fromEntries(STAT.map((k) => [k, t.totals[k] || 0]));
    // Overtimes from the players' minutes (5 on court): the totals row can show 200:00 after an overtime.
    const sumSecs = players.reduce((a, q) => { const [m, x] = q.Minutes === 'DNP' ? [0, 0] : q.Minutes.split(':').map(Number); return a + m * 60 + x; }, 0);
    const ot = Math.max(0, Math.round((Math.max(t.totals.secs, sumSecs / 5) / 60 - 200) / 25));
    totr.Minutes = `${200 + 25 * ot}:00`;
    return { Team: T[w].name, PlayersStats: players, tmr, totr };
  });
  const qs = header.quarterScores || [];
  const cum = (k) => { let c = 0; return [1, 2, 3, 4].map((q) => (c += n(qs.find((x) => x.quarter === q)?.[k]))); };
  const [qa, qb] = [cum('home'), cum('away')];
  const H = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(n(header.currentHomeScore)), ScoreB: String(n(header.currentAwayScore)), Date: meta.date, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0]), ScoreQuarter2A: String(qa[1]), ScoreQuarter3A: String(qa[2]), ScoreQuarter4A: String(qa[3]),
    ScoreQuarter1B: String(qb[0]), ScoreQuarter2B: String(qb[1]), ScoreQuarter3B: String(qb[2]), ScoreQuarter4B: String(qb[3])
  };

  // Play-by-play: what each play did is read from the change in the player's running stats; a substitution
  // play takes a player off the court if he is on it, and puts him on otherwise.
  const pbp = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [], continuous: true };
  const prev = new Map(), on = { A: new Set(), B: new Set() };
  let seq = 0, curQ = 0;
  const push = (q, row) => (q <= 4 ? pbp[QUARTER_KEYS[q - 1]] : pbp.ExtraTime).push({ NUMBEROFPLAY: ++seq, ...row });
  for (const p of plays) {
    const q = n(p.quarter) || 1;
    if (q !== curQ) { if (curQ) push(curQ, { PLAYTYPE: 'EP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '00:00' }); curQ = q; push(q, { PLAYTYPE: 'BP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '' }); }
    if (!p.playerLicenseId) continue;
    const id = 'ACB' + p.playerLicenseId, w = sideOf(p.local), team = T[w].code, clock = `${pad(n(p.minute))}:${pad(n(p.second))}`;
    const base = { CODETEAM: team, PLAYER_ID: id, PLAYER: p.playerName || '', MARKERTIME: clock };
    if (p.playType === 599) { on[w].add(id); continue; }
    const st = p.playerStats || {}, before = prev.get(id) || {};
    const changed = STAT_EVENTS.filter(([k]) => n(st[k]) > n(before[k]));
    const missed = [['twoPointersAttempted', 'twoPointersMade', '2FGA'], ['threePointersAttempted', 'threePointersMade', '3FGA'], ['freeThrowsAttempted', 'freeThrowsMade', 'FTA']]
      .filter(([a, m]) => n(st[a]) - n(before[a]) > n(st[m]) - n(before[m]));
    if (p.playerStats) prev.set(id, st);
    if (!changed.length && !missed.length) {
      if (p.playType === 112 || p.playType === 115) { const inNow = on[w].has(id); if (inNow) on[w].delete(id); else on[w].add(id); push(q, { ...base, PLAYTYPE: inNow ? 'OUT' : 'IN' }); }
      continue;
    }
    for (const [, type] of changed) push(q, { ...base, PLAYTYPE: type });
    for (const [, , type] of missed) push(q, { ...base, PLAYTYPE: type });
  }
  if (curQ) push(curQ, { PLAYTYPE: 'EP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '00:00' });
  return { season, gameCode: meta.gameId, fetchedAt: new Date().toISOString(), source: 'live.acb.com', header: H, boxscore: { Stats: stats }, pbp };
}

/** Team identity from the match header (for codes, names and logos). */
export function headerTeams(playsHtml) {
  const h = jsonAfter(flight(playsHtml), 'initialMatchHeader', '{') || {};
  return { status: h.status, start: h.start, home: h.teams?.home, away: h.teams?.away };
}
