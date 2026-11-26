// ABA League (Adriatic): reads the league's own match page on aba-liga.com (box score + play-by-play, server-rendered)
// and the season calendar, and converts each game to the EuroLeague feed shape.

const n = (v) => { const x = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(x) ? x : 0; };
const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
const QUARTER_KEYS = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
const STAT = ['Points', 'FieldGoalsMade2', 'FieldGoalsAttempted2', 'FieldGoalsMade3', 'FieldGoalsAttempted3', 'FreeThrowsMade', 'FreeThrowsAttempted', 'OffensiveRebounds', 'DefensiveRebounds', 'TotalRebounds', 'Assistances', 'Steals', 'Turnovers', 'BlocksFavour', 'BlocksAgainst', 'FoulsCommited', 'FoulsReceived', 'Valuation'];
// Box columns: #, player, Min, Pts, FG%, 2M, 2A, 2%, 3M, 3A, 3%, FTM, FTA, FT%, DR, OR, TR, AS, ST, TO, FV, AG, CM, RV, paint, 2nd ch., fast br., +/-, VAL
const line = (c) => ({ Points: n(strip(c[3])), FieldGoalsMade2: n(strip(c[5])), FieldGoalsAttempted2: n(strip(c[6])), FieldGoalsMade3: n(strip(c[8])), FieldGoalsAttempted3: n(strip(c[9])),
  FreeThrowsMade: n(strip(c[11])), FreeThrowsAttempted: n(strip(c[12])), DefensiveRebounds: n(strip(c[14])), OffensiveRebounds: n(strip(c[15])), TotalRebounds: n(strip(c[16])),
  Assistances: n(strip(c[17])), Steals: n(strip(c[18])), Turnovers: n(strip(c[19])), BlocksFavour: n(strip(c[20])), BlocksAgainst: n(strip(c[21])), FoulsCommited: n(strip(c[22])), FoulsReceived: n(strip(c[23])), Valuation: n(strip(c[28])) });

/** Text of one play-by-play action -> EuroLeague play type. */
export function abaPlayType(text) {
  const s = String(text).toLowerCase();
  if (/made 2 points/.test(s)) return '2FGM';
  if (/missed 2 points/.test(s)) return '2FGA';
  if (/made 3 points/.test(s)) return '3FGM';
  if (/missed 3 points/.test(s)) return '3FGA';
  if (/made free throw/.test(s)) return 'FTM';
  if (/missed free throw/.test(s)) return 'FTA';
  if (/rebound \(offensive\)/.test(s)) return 'O';
  if (/rebound/.test(s)) return 'D';
  if (/\bassist/.test(s)) return 'AS';
  if (/\bsteal/.test(s)) return 'ST';
  if (/turnover/.test(s)) return 'TO';
  if (/blocked shot|shot blocked|block \(received\)|block against/.test(s)) return 'AG';
  if (/\bblock/.test(s)) return 'FV';
  if (/foul on\b/.test(s)) return 'RV';
  if (/foul/.test(s)) return /offensive/.test(s) ? 'OF' : /technical|bench|coach/.test(s) ? 'CMT' : /unsportsman/.test(s) ? 'CMU' : /disqualif/.test(s) ? 'CMD' : 'CM';
  if (/substitution \(in\)/.test(s)) return 'IN';
  if (/substitution \(out\)/.test(s)) return 'OUT';
  if (/timeout/.test(s)) return 'TOUT';
  return null;
}

/** html: the match page. meta: { gameId, round, utc, home:{code,name}, away:{code,name} } */
export function convertAba(html, meta, season) {
  const t = String(html);
  const boxIdx = [...t.matchAll(/<table[^>]*>/g)].map((m) => m.index).filter((i) => { const head = strip(t.slice(i, i + 1600)); return /^overall FG2 FG3 FT/.test(head) && !/match_boxscore_teams_compare_table/.test(t.slice(i, i + 200)); });
  if (boxIdx.length < 2) throw new Error('box score not found');
  const names = new Map();
  const sides = [meta.home, meta.away];
  const tot = t.indexOf('match_boxscore_teams_compare_table');
  const totRows = tot > 0 ? t.slice(tot, t.indexOf('</table>', tot)).split('<tr').slice(3).map(cells) : [];
  const stats = boxIdx.slice(0, 2).map((i, k) => {
    const team = sides[k];
    const body = t.slice(t.indexOf('<tbody', i), t.indexOf('</tbody>', i));
    const players = body.split('<tr').slice(1).map(cells).filter((c) => c.length >= 3).map((c) => {
      const pid = (c[1].match(/\/player\/(\d+)\//) || [])[1];
      const nm = strip((c[1].match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || c[1]);
      const sp = nm.lastIndexOf(' '), name = sp > 0 ? `${nm.slice(0, sp)}, ${nm.slice(sp + 1)}` : nm;
      names.set(pid, name);
      const min = strip(c[2]); const [mm, ss] = min.split(':').map(Number); const secs = (mm || 0) * 60 + (ss || 0);
      const played = c.length >= 29;
      return { Player_ID: 'ABA' + pid, Player: name, Team: team.code, Dorsal: strip(c[0]), IsStarter: /\*/.test(strip(c[1].replace(/<a[\s\S]*?<\/a>/, ''))) ? 1 : 0, IsPlaying: 0,
        Minutes: secs ? min : 'DNP', Plusminus: played ? n(strip(c[27])) : 0, ...(played ? line(c) : Object.fromEntries(STAT.map((s) => [s, 0]))) };
    });
    const tr = totRows[k] || [];
    const sum = (key) => players.reduce((a, p) => a + p[key], 0);
    const tmr = Object.fromEntries(STAT.map((s) => [s, 0]));
    if (tr.length >= 28) { tmr.DefensiveRebounds = Math.max(0, n(strip(tr[13])) - sum('DefensiveRebounds')); tmr.OffensiveRebounds = Math.max(0, n(strip(tr[14])) - sum('OffensiveRebounds')); tmr.TotalRebounds = tmr.DefensiveRebounds + tmr.OffensiveRebounds; tmr.Turnovers = Math.max(0, n(strip(tr[18])) - sum('Turnovers')); }
    const totr = Object.fromEntries(STAT.map((s) => [s, sum(s) + tmr[s]]));
    totr.Minutes = tr[1] ? strip(tr[1]).replace(/:00$/, '') + ':00' : '200:00';
    return { Team: team.name, PlayersStats: players, tmr, totr };
  });
  // Play-by-play: one table per period (tabs q1, q2, …), newest action first; left column = home, right = away.
  const out = { FirstQuarter: [], SecondQuarter: [], ThirdQuarter: [], ForthQuarter: [], ExtraTime: [], continuous: true };
  const pbpAt = t.indexOf('id="PlayByPlay"');
  let seq = 0, qa = [], qb = [];
  if (pbpAt > 0) {
    const pbp = t.slice(pbpAt);
    // Period panes (q1…q4, then overtimes) — only those that hold a play-by-play table.
    const panes = [...pbp.matchAll(/id="(q\d+)"/g)].map((m) => ({ id: m[1], at: m.index }))
      .filter((p, i, a) => pbp.slice(p.at, i + 1 < a.length ? a[i + 1].at : p.at + 400000).includes('match_table_play_by_play'));
    panes.forEach((p, idx) => {
      const per = idx + 1;
      const body = pbp.slice(p.at, idx + 1 < panes.length ? panes[idx + 1].at : pbp.indexOf('</table>', pbp.indexOf('<tbody', p.at)) + 8);
      const tb = body.slice(body.indexOf('<tbody'), body.indexOf('</tbody>'));
      const rows = tb.split('<tr').slice(1).map(cells).filter((c) => c.length === 3).reverse();
      if (!rows.length) return; // an empty overtime tab: no overtime was played
      const key = per <= 4 ? QUARTER_KEYS[per - 1] : 'ExtraTime';
      out[key].push({ NUMBEROFPLAY: ++seq, PLAYTYPE: 'BP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '' });
      let last = null;
      for (const c of rows) {
        const mid = strip(c[1]), clock = (mid.match(/\d{2}:\d{2}/) || [])[0];
        const sc = strip((c[1].match(/td-rezultat[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '').match(/(\d+)\s*:\s*(\d+)/); if (sc) last = [n(sc[1]), n(sc[2])];
        for (const [col, side] of [[0, sides[0]], [2, sides[1]]]) {
          if (!strip(c[col])) continue;
          const type = abaPlayType(strip(c[col])); if (!type) continue;
          const pid = (c[col].match(/\/player\/(\d+)\//) || [])[1];
          out[key].push({ NUMBEROFPLAY: ++seq, PLAYTYPE: type, CODETEAM: side.code, PLAYER_ID: pid ? 'ABA' + pid : '', PLAYER: pid ? names.get(pid) || '' : '', MARKERTIME: clock || '' });
        }
        if (/end of/i.test(mid)) { /* period end marker added below */ }
      }
      out[key].push({ NUMBEROFPLAY: ++seq, PLAYTYPE: 'EP', CODETEAM: '', PLAYER_ID: '', PLAYER: '', MARKERTIME: '00:00' });
      if (per <= 4 && last) { qa.push(last[0]); qb.push(last[1]); }
    });
  }
  const d = String(meta.utc || '').slice(0, 10).split('-');
  const header = {
    TeamA: meta.home.name, TeamB: meta.away.name, CodeTeamA: meta.home.code, CodeTeamB: meta.away.code, TVCodeA: meta.home.code, TVCodeB: meta.away.code,
    ScoreA: String(stats[0].totr.Points), ScoreB: String(stats[1].totr.Points), Date: `${d[2]}/${d[1]}/${d[0]}`, Round: String(meta.round ?? ''), Phase: 'REGULAR SEASON', Live: false, GameTime: '40:00',
    ScoreQuarter1A: String(qa[0] ?? 0), ScoreQuarter2A: String(qa[1] ?? 0), ScoreQuarter3A: String(qa[2] ?? 0), ScoreQuarter4A: String(qa[3] ?? 0),
    ScoreQuarter1B: String(qb[0] ?? 0), ScoreQuarter2B: String(qb[1] ?? 0), ScoreQuarter3B: String(qb[2] ?? 0), ScoreQuarter4B: String(qb[3] ?? 0)
  };
  return { season, gameCode: Number(meta.gameId), fetchedAt: new Date().toISOString(), source: 'aba-liga.com', header, boxscore: { Stats: stats }, pbp: seq ? out : null };
}

/** Central European local time ("02.10.2026 18:30") -> UTC ISO. */
function cetToUtc(day, time) {
  const [d, m, y] = day.split('.').map(Number), [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Belgrade', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  return new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess)).toISOString();
}

/** The season calendar page -> [{ id, round, utc, ok, home:{code,name}, away:{...}, hs, as, played, box }] */
export function parseAbaCalendar(html, seasonId) {
  const out = [];
  const parts = String(html).split(/<div class="panel-heading"/).slice(1);
  for (const part of parts) {
    const round = Number((strip(part.slice(0, 800)).match(/ROUND (\d+)/i) || [])[1]) || 0;
    const label = (strip(part.slice(0, 800)).match(/([A-Z][A-Z0-9 -]{2,40})/) || [])[1] || '';
    for (const row of part.split('<tr').slice(1)) {
      const id = Number((row.match(new RegExp(`/match/(\\d+)/${seasonId}/1/`)) || [])[1]);
      if (!id) continue;
      const short = strip((row.match(/class="visible-xs">([\s\S]*?)<\/p>/) || [])[1] || '').split(':').map((x) => x.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
      const full = strip((row.match(/class="hidden-xs">([\s\S]*?)<\/p>/) || [])[1] || '').split(' : ').map((x) => x.trim());
      const score = strip((row.match(/class="scoretable">([\s\S]*?)<\/td>/) || [])[1] || '').match(/(\d+)\s*:\s*(\d+)/);
      const when = strip((row.match(/class="locationtable">([\s\S]*?)<\/td>/) || [])[1] || '');
      const dm = when.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})/), dOnly = when.match(/(\d{2}\.\d{2}\.\d{4})/);
      const box = (row.match(/href="(https:\/\/www\.aba-liga\.com\/match\/[^"]*\/Boxscore\/[^"]*)"/) || [])[1];
      out.push({ id, round, label: round ? 'Round ' + round : label, utc: dm ? cetToUtc(dm[1], dm[2]) : dOnly ? cetToUtc(dOnly[1], '12:00') : null, ok: !!dm,
        home: { code: short[0], name: full[0] }, away: { code: short[1], name: full[1] }, hs: score ? n(score[1]) : null, as: score ? n(score[2]) : null, played: !!score, box });
    }
  }
  return out;
}
