// Israeli Basketball Super League (Winner League) from the official site basket.co.il.
// The site publishes server-rendered HTML: a results page per season and a "game zone" page per game
// with full box scores. These helpers turn that HTML into the same game shape as the EuroLeague feed,
// so the same checks and stats code can be used.

const decodeEntities = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
export const text = (html) => decodeEntities(String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const rows = (html) => [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
const cells = (rowHtml) => [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
const int = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const ma = (v) => { const m = String(v).match(/(\d+)\s*\/\s*(\d+)/); return m ? [+m[1], +m[2]] : [0, 0]; };
const isoDate = (s) => { const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

/** Results page -> played games [{ gameId, round, date, home: {id, name, crest}, away: {...}, hs, as }] */
export function parseResults(html) {
  const out = [];
  let round = null;
  for (const r of rows(html)) {
    const t = text(r);
    const g = t.match(/^Game (\d+)$/i);
    if (g) { round = +g[1]; continue; }
    const id = r.match(/game-zone\.asp\?GameId=(\d+)/i);
    if (!id) continue;
    const cs = cells(r);
    const score = text(cs[cs.length - 1] || '').match(/^(\d+)\s*-\s*(\d+)$/);
    if (!score) continue; // not played yet
    const teams = [...r.matchAll(/team\.asp\?TeamId=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
      const crest = (m[2].match(/<img[^>]+src="(https:\/\/[^"]+)"/i) || [])[1] || null;
      const name = text((m[2].match(/game_item mid deskOnly">([\s\S]*?)<\/div>/i) || [])[1] || m[2]);
      return { id: m[1], name, crest };
    });
    if (teams.length < 2) continue;
    out.push({ gameId: +id[1], round, date: isoDate(text(cs[0] || '')), home: teams[0], away: teams[1], hs: +score[1], as: +score[2] });
  }
  return out;
}

const COLS = ['num', 'name', 'sf', 'min', 'pts', 'fg2', 'p2', 'fg3', 'p3', 'ft', 'pft', 'dreb', 'oreb', 'reb', 'pf', 'fd', 'stl', 'tov', 'ast', 'blk', 'blka', 'pir', 'pm'];
function line(cs) {
  const v = Object.fromEntries(COLS.map((k, i) => [k, cs[i] == null ? '' : text(cs[i])]));
  const [fgm2, fga2] = ma(v.fg2), [fgm3, fga3] = ma(v.fg3), [ftm, fta] = ma(v.ft);
  return { pts: int(v.pts), fgm2, fga2, fgm3, fga3, ftm, fta, oreb: int(v.oreb), dreb: int(v.dreb), reb: int(v.reb), ast: int(v.ast), stl: int(v.stl), tov: int(v.tov),
    blk: int(v.blk), blka: int(v.blka), pf: int(v.pf), fd: int(v.fd), pir: int(v.pir), _min: int(v.min), _pm: int(v.pm), _num: v.num, _name: v.name, _sf: v.sf };
}
const zero = () => line([]);

/** Game-zone page + its results row -> game in the EuroLeague shape (home/away with players, totals, team row). */
export function parseGamePage(html, info, season) {
  const tables = [...String(html).matchAll(/<table class="stats_tbl"[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]).filter((t) => /Player Name/i.test(t));
  if (tables.length < 2) throw new Error(`game ${info.gameId}: box score not found`);
  const sides = tables.slice(0, 2).map((t) => {
    const teamId = (t.match(/team\.asp\?TeamId=(\d+)/i) || [])[1] || '';
    const players = [], teamRow = zero(); let totals = null;
    for (const r of rows(t)) {
      const cs = cells(r);
      if (cs.length < 20) continue;
      const l = line(cs);
      if (/^total$/i.test(l._name)) { totals = l; continue; }
      if (/^team$/i.test(l._name)) { Object.assign(teamRow, l); continue; }
      const pid = (r.match(/player\.asp\?PlayerId=(\d+)/i) || [])[1];
      if (!pid || !l._name) continue;
      players.push({ id: 'IL' + pid, name: l._name, rawName: l._name, number: l._num, starter: l._sf === '*', min: l._min, pm: l._pm, ...l });
    }
    return { teamId, players, teamRow, totals };
  });
  const mk = (s, t, score) => {
    const code = 'IL' + t.id;
    const strip = (o) => { const x = { ...o }; for (const k of Object.keys(x)) if (k.startsWith('_')) delete x[k]; return x; };
    return { code, tv: t.name, name: t.name, crest: t.crest, score, quarters: [], boxName: '', teamMinutes: s.totals?._min || 200,
      totals: strip(s.totals || zero()), teamRow: strip(s.teamRow), players: s.players.map((p) => ({ ...strip(p), team: code })) };
  };
  // Box-score tables follow the page's home/away order; match them to the results row by team id.
  const [a, b] = sides;
  const homeSide = a.teamId === info.home.id ? a : b.teamId === info.home.id ? b : a;
  const awaySide = homeSide === a ? b : a;
  return { season, gameCode: info.gameId, round: info.round, date: info.date, phase: 'Winner League', home: mk(homeSide, info.home, info.hs), away: mk(awaySide, info.away, info.as) };
}
