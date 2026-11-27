// HTA LAB live: reads the official EuroLeague live feed straight from the browser every 15 seconds.
import { parseGame } from './lib/parse.mjs';
import { playLog, flowStats, connections, LABEL } from './lib/game.mjs';
import { buildStints } from './lib/pbp.mjs';
import { zoneOf, groupOf, ZONES } from './lib/zones.mjs';
const VIEW = new URLSearchParams(location.search).get('view') || '';

const CFG = JSON.parse(document.getElementById('live-config').textContent);
const API = 'https://live.euroleague.net/api/';
const host = document.getElementById('live-app');
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  e.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return e;
};
const svg = (tag, attrs, ...kids) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); e.append(...kids.flat(Infinity).filter(Boolean)); return e; };
const f1 = (v) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(1));
const t = (v) => (typeof v === 'string' ? v.trim() : v);
const get = async (what, code) => {
  const r = await fetch(`${API}${what}?gamecode=${code}&seasoncode=${CFG.season}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${what} ${r.status}`);
  const txt = await r.text();
  return txt.trim() ? JSON.parse(txt) : null;
};
const crest = (code, size = 28) => (CFG.crests[code] ? el('img', { src: CFG.crests[code], alt: '', width: String(size), height: String(size), class: 'lv-crest' }) : null);
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase()).replace(/\b(Bc|Fc|Kk|Ldlc|Asvel|Aktor|Ea7|Paok|Aek)\b/g, (m) => m.toUpperCase());
const status = (h) => {
  if (!h || !t(h.TeamA)) return 'none';
  if (h.Live === true || h.Live === 'true') return 'live';
  return (Number(h.ScoreA) || 0) + (Number(h.ScoreB) || 0) > 0 ? 'final' : 'upcoming';
};
const quarterName = (h) => { const q = Number(t(h.Quarter)) || 0; return q ? (q <= 4 ? `Q${q}` : `OT${q - 4}`) : ''; };

// ---------- Game list ----------
let headers = new Map(), selected = null, timer = null;
async function loadList() {
  const soon = CFG.schedule.filter((x) => !x.utc || new Date(x.utc).getTime() - Date.now() < 3 * 86400000);
  const codes = new Set(soon.map((x) => x.c));
  for (let c = CFG.firstCode; c < CFG.firstCode + 6; c++) codes.add(c);
  if (selected) codes.add(selected);
  const got = await Promise.all([...codes].map((c) => get('Header', c).then((h) => [c, h]).catch(() => [c, null])));
  headers = new Map(got.filter(([, h]) => h && t(h.TeamA)));
}
const when = (utc) => {
  if (!utc) return 'Time to be confirmed';
  const d = new Date(utc), a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 86400000);
  return `${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
function listView() {
  // Every game we know of: the schedule, plus anything the live feed shows.
  const all = new Map();
  for (const x of CFG.schedule) all.set(x.c, { c: x.c, sched: x, h: headers.get(x.c) || null });
  for (const [c, h] of headers) if (!all.has(c)) all.set(c, { c, sched: null, h });
  const items = [...all.values()].map((g) => ({ ...g, st: g.h && status(g.h) !== 'upcoming' ? status(g.h) : 'upcoming', ts: g.sched?.utc ? new Date(g.sched.utc).getTime() : Infinity }));
  const live = items.filter((g) => g.st === 'live');
  const done = items.filter((g) => g.st === 'final');
  const next = items.filter((g) => g.st === 'upcoming').sort((a, b) => a.ts - b.ts || a.c - b.c).slice(0, 20);
  const side = (g, w) => g.sched ? (w === 'A' ? g.sched.h : g.sched.a) : { code: t(g.h['CodeTeam' + w]), name: g.h['Team' + w] };
  const card = (g) => {
    const H = side(g, 'A'), A = side(g, 'B'), sA = g.h ? Number(g.h.ScoreA) : 0, sB = g.h ? Number(g.h.ScoreB) : 0, played = g.st !== 'upcoming';
    const line = (s, sc, win) => el('span', { class: `gl ${win ? 'w' : ''}` }, crest(s.code, 22) || el('i'), el('span', { class: 'gn' }, titleCase(s.name || s.code)), el('b', {}, played ? String(sc) : ''));
    const top = g.st === 'live' ? el('span', { class: 'live-dot' }, `LIVE · ${quarterName(g.h)} ${t(g.h.RemainingPartialTime) || ''}`) : g.st === 'final' ? `Final${g.sched ? ` · Rd ${g.sched.r}` : ''}` : `${g.sched ? `Rd ${g.sched.r} · ` : ''}${when(g.sched?.utc)}`;
    return el('a', { class: `gcard ${g.st === 'live' ? 'is-live' : ''} ${g.st === 'upcoming' ? 'upcoming' : ''}`, href: `?game=${g.c}` }, el('span', { class: 'gd' }, top), line(H, sA, played && sA > sB), line(A, sB, played && sB > sA), g.sched?.venue && g.st === 'upcoming' ? el('span', { class: 'gm' }, g.sched.venue) : null);
  };
  const block = (title, sub, list) => list.length ? el('section', { class: 'card' }, el('h2', {}, title), sub ? el('p', { class: 'muted' }, sub) : null, el('div', { class: 'gcards' }, list.map(card))) : null;
  const out = [
    block('Live now', 'Updates every 15 seconds. Click to follow the game.', live),
    block('Upcoming games', 'Times in your time zone. Each game goes live here automatically at tip-off — click one to open it and leave the page open.', next),
    block('Just finished', '', done)
  ].filter(Boolean);
  return out.length ? out : [el('section', { class: 'card' }, el('h2', {}, 'No games scheduled'), el('p', { class: 'muted' }, 'There are no upcoming games in the league schedule right now.'))];
}

// ---------- One game ----------
async function loadGame(code) {
  const [header, boxscore, pbp, points] = await Promise.all([get('Header', code), get('Boxscore', code).catch(() => null), get('PlaybyPlay', code).catch(() => null), VIEW === 'half' ? get('Points', code).catch(() => null) : null]);
  return { header, boxscore, pbp, points };
}
const pct = (m, a) => (a ? 100 * m / a : 0);
function compare(g) {
  const h = g.home.totals, a = g.away.totals;
  const rows = [['Points', h.pts, a.pts], ['2-point %', pct(h.fgm2, h.fga2), pct(a.fgm2, a.fga2), 1, `${h.fgm2}/${h.fga2}`, `${a.fgm2}/${a.fga2}`], ['3-point %', pct(h.fgm3, h.fga3), pct(a.fgm3, a.fga3), 1, `${h.fgm3}/${h.fga3}`, `${a.fgm3}/${a.fga3}`],
    ['Free throw %', pct(h.ftm, h.fta), pct(a.ftm, a.fta), 1, `${h.ftm}/${h.fta}`, `${a.ftm}/${a.fta}`], ['Rebounds', h.reb, a.reb], ['Offensive rebounds', h.oreb, a.oreb], ['Assists', h.ast, a.ast], ['Steals', h.stl, a.stl], ['Blocks', h.blk, a.blk], ['Turnovers', h.tov, a.tov, 0, '', '', 1], ['Fouls', h.pf, a.pf, 0, '', '', 1], ['PIR', h.pir, a.pir]];
  return rows.map(([label, x, y, dec, sx, sy, low]) => {
    const tot = Math.abs(x) + Math.abs(y) || 1, wx = 100 * Math.abs(x) / tot;
    const better = x === y ? '' : (low ? x < y : x > y) ? 'h' : 'a';
    return el('div', { class: `cmp ${better ? 'b-' + better : ''}` },
      el('span', { class: 'v h' }, dec ? f1(x) : String(x), sx ? el('small', {}, ' ' + sx) : null), el('span', { class: 'lab' }, label), el('span', { class: 'v a' }, dec ? f1(y) : String(y), sy ? el('small', {}, ' ' + sy) : null),
      el('div', { class: 'split' }, el('i', { style: `width:${wx.toFixed(1)}%` }), el('i', { style: `width:${(100 - wx).toFixed(1)}%` })));
  });
}
const BOX = [['min', 'MIN'], ['pts', 'PTS'], ['fg2', '2P'], ['fg3', '3P'], ['ft', 'FT'], ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['tov', 'TOV'], ['blk', 'BLK'], ['pf', 'PF'], ['pm', '+/-'], ['pir', 'PIR']];
const cell = (p, k) => {
  if (k === 'min') return p.min > 0 ? `${Math.floor(p.min)}:${String(Math.round((p.min % 1) * 60)).padStart(2, '0')}` : '–';
  if (k === 'fg2') return `${p.fgm2}/${p.fga2}`; if (k === 'fg3') return `${p.fgm3}/${p.fga3}`; if (k === 'ft') return `${p.ftm}/${p.fta}`;
  if (k === 'pm') return `${p.pm > 0 ? '+' : ''}${p.pm}`;
  return String(p[k]);
};
function boxTable(side, onCourt) {
  const ps = side.players.slice().sort((a, b) => onCourt.has(b.id) - onCourt.has(a.id) || b.min - a.min);
  return el('div', { class: 'scroll' }, el('table', { class: 'gbox' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '#'), el('th', { scope: 'col' }, 'Player'), BOX.map(([, l]) => el('th', { scope: 'col', class: 'num' }, l)))),
    el('tbody', {}, ps.map((p) => el('tr', { class: onCourt.has(p.id) ? 'on-court' : '' },
      el('td', { class: 'num muted' }, p.number || ''),
      el('td', {}, onCourt.has(p.id) ? el('span', { class: 'oc', title: 'On the court' }) : null, CFG.players[p.id] ? el('a', { href: CFG.players[p.id] }, p.name) : p.name, p.pf >= 4 ? el('span', { class: 'foul-warn', title: `${p.pf} fouls` }, ` ${p.pf}F`) : null),
      BOX.map(([k]) => el('td', { class: `num ${k === 'pm' ? (p.pm > 0 ? 'pos' : p.pm < 0 ? 'neg' : '') : ''}` }, k === 'pts' ? el('strong', {}, cell(p, k)) : cell(p, k)))))),
    el('tfoot', {}, el('tr', {}, el('td'), el('th', { scope: 'row' }, 'Team'), BOX.map(([k]) => el('td', { class: 'num' }, k === 'min' || k === 'pm' ? '' : cell(side.totals, k)))))));
}
function flowChart(line, periods, hTv, aTv) {
  const W = 900, H = 220, L = 40, R = 10, T = 12, B = 24;
  const total = periods <= 4 ? 2400 : 2400 + (periods - 4) * 300;
  const top = Math.ceil(Math.max(10, ...line.map(([, v]) => Math.abs(v))) / 5) * 5;
  const sx = (x) => L + (Math.min(x, total) / total) * (W - L - R), sy = (v) => T + ((top - v) / (2 * top)) * (H - T - B);
  let d = `M${sx(0)},${sy(0)}`; for (const [x, v] of line) d += ` H${sx(x).toFixed(1)} V${sy(v).toFixed(1)}`;
  const area = `${d} V${sy(0)} H${sx(0)} Z`;
  const kids = [svg('defs', {}, svg('clipPath', { id: 'lv-up' }, svg('rect', { x: 0, y: 0, width: W, height: sy(0) })), svg('clipPath', { id: 'lv-dn' }, svg('rect', { x: 0, y: sy(0), width: W, height: H })))];
  for (const v of [top, top / 2, 0, -top / 2, -top]) { kids.push(svg('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: v === 0 ? 'zero' : 'grid' })); const tx = svg('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end' }); tx.textContent = v ? '+' + Math.abs(v) : '0'; kids.push(tx); }
  for (let p = 1; p <= periods; p++) { const s = p <= 4 ? (p - 1) * 600 : 2400 + (p - 5) * 300, e = p <= 4 ? s + 600 : s + 300; if (p > 1) kids.push(svg('line', { x1: sx(s), x2: sx(s), y1: T, y2: H - B, class: 'grid' })); const tx = svg('text', { x: sx((s + e) / 2), y: H - 6, 'text-anchor': 'middle' }); tx.textContent = p <= 4 ? `Q${p}` : `OT${p - 4}`; kids.push(tx); }
  kids.push(svg('path', { d: area, class: 'fa-h', 'clip-path': 'url(#lv-up)' }), svg('path', { d: area, class: 'fa-a', 'clip-path': 'url(#lv-dn)' }), svg('path', { d, class: 'fl' }));
  const a = svg('text', { x: L + 6, y: T + 12, class: 'lbl' }); a.textContent = `${hTv} ahead`; const b = svg('text', { x: L + 6, y: H - B - 6, class: 'lbl' }); b.textContent = `${aTv} ahead`; kids.push(a, b);
  return svg('svg', { class: 'flow', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Score margin through the game' }, kids);
}
function gameView(code, raw, updated) {
  const h = raw.header, st = status(h);
  const okBox = raw.boxscore?.Stats?.length === 2;
  const g = okBox ? parseGame({ season: CFG.season, gameCode: code, header: h, boxscore: raw.boxscore }) : null;
  const onCourt = new Set((raw.boxscore?.Stats || []).flatMap((s) => (s.PlayersStats || []).filter((p) => Number(p.IsPlaying) === 1).map((p) => t(p.Player_ID))));
  const A = t(h.CodeTeamA), B = t(h.CodeTeamB), sA = Number(h.ScoreA) || 0, sB = Number(h.ScoreB) || 0;
  const log = g && raw.pbp ? playLog(g, raw.pbp) : null;
  const flow = log ? flowStats(log.plays) : null;
  const periods = log ? Math.max(4, ...log.plays.map((p) => p[0])) : 4;
  const qs = (w) => [1, 2, 3, 4].map((q, i) => { const c = Number(h[`ScoreQuarter${q}${w}`]), p = i ? Number(h[`ScoreQuarter${q - 1}${w}`]) : 0; return Number.isFinite(c) && c >= p && t(h[`ScoreQuarter${q}${w}`]) !== '' ? c - p : null; });
  const qA = qs('A'), qB = qs('B');
  const sideH = (s) => el('h3', { class: 'side-h' }, crest(s.code, 24), ' ', titleCase(s.name));
  const head = el('section', { class: 'live-board' },
    el('div', { class: 'lb-top' }, el('a', { href: 'live.html', class: 'lb-back' }, '← All games'), st === 'live' ? el('span', { class: 'live-dot big' }, 'LIVE') : el('span', { class: 'lb-st' }, st === 'final' ? 'FINAL' : `${t(h.Date)} · ${t(h.Hour)}`), el('span', { class: 'lb-upd' }, `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${st === 'live' ? ' · refreshes every 15 s' : ''}`)),
    el('div', { class: 'scoreboard' },
      el('div', { class: 'sb-team' }, CFG.crests[A] ? el('span', { class: 'sb-crest' }, el('img', { src: CFG.crests[A], alt: '' })) : null, el('span', { class: 'sb-name' }, titleCase(h.TeamA)), el('span', { class: 'muted-w' }, `Fouls ${t(h.FoultsA) || 0} · Timeouts ${t(h.TimeoutsA) || 0}`)),
      el('div', { class: 'sb-score' }, el('span', { class: sA >= sB ? 'win' : '' }, String(sA)), el('span', { class: 'dash' }, '–'), el('span', { class: sB >= sA ? 'win' : '' }, String(sB)), el('small', {}, st === 'live' ? `${quarterName(h)} · ${t(h.RemainingPartialTime)}` : st === 'final' ? 'Final' : 'Not started')),
      el('div', { class: 'sb-team' }, CFG.crests[B] ? el('span', { class: 'sb-crest' }, el('img', { src: CFG.crests[B], alt: '' })) : null, el('span', { class: 'sb-name' }, titleCase(h.TeamB)), el('span', { class: 'muted-w' }, `Fouls ${t(h.FoultsB) || 0} · Timeouts ${t(h.TimeoutsB) || 0}`))),
    qA.some((v) => v != null) ? el('table', { class: 'qtable' }, el('thead', {}, el('tr', {}, el('th'), ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => el('th', { scope: 'col' }, q)))),
      el('tbody', {}, [[t(h.TVCodeA), qA, qB], [t(h.TVCodeB), qB, qA]].map(([tv, me, op]) => el('tr', {}, el('th', { scope: 'row' }, tv), me.map((v, i) => el('td', { class: v != null && v > (op[i] ?? -1) ? 'w' : '' }, v == null ? '' : String(v))))))) : null);
  if (!g) return [head, el('section', { class: 'card' }, el('p', { class: 'muted' }, 'Stats appear here when the game starts.'))];
  const tabs = el('div', { class: 'seg lv-views', role: 'group', 'aria-label': 'View' }, [['', 'Full game'], ['half', 'Halftime report'], ['bench', 'Bench screen']].map(([k, l]) => el('a', { class: 'btn ghost small', href: `?game=${code}${k ? '&view=' + k : ''}`, 'aria-pressed': String(VIEW === k) }, l)));
  if (VIEW === 'bench') return benchView(h, g, raw, onCourt, log, st);
  if (VIEW === 'half') return [head, tabs, ...halftimeView(h, g, raw, log, st)];
  head.append(tabs);
  const mvpPool = st === 'final' ? (sA > sB ? g.home : g.away).players : [...g.home.players, ...g.away.players];
  const leader = mvpPool.filter((p) => p.min > 0).sort((x, y) => y.pir - x.pir || y.pts - x.pts)[0];
  const best = (s, k) => s.players.filter((p) => p.min > 0).sort((x, y) => y[k] - x[k] || y.pir - x.pir)[0];
  const perf = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['pir', 'PIR']].map(([k, l]) => {
    const c = (p) => (p ? [el('span', {}, p.name), el('strong', {}, String(p[k]))] : []);
    return el('div', { class: 'perf' }, el('span', { class: 'ph' }, c(best(g.home, k))), el('span', { class: 'lab' }, l), el('span', { class: 'pa' }, c(best(g.away, k))));
  });
  const conn = log ? connections(log.plays) : [];
  const names = Object.fromEntries([...g.home.players, ...g.away.players].map((p) => [p.id, p.name]));
  const recent = log ? log.plays.filter((p) => !['BP', 'EP', 'EG'].includes(p[4])).slice(-40).reverse() : [];
  const onList = (s) => s.players.filter((p) => onCourt.has(p.id));
  return [head,
    el('div', { class: 'tiles' },
      leader ? el('div', { class: 'tile mvp-tile' }, el('span', { class: 'label' }, st === 'final' ? 'Game MVP' : 'Top PIR so far'), el('span', { class: 'big' }, String(leader.pir)), el('span', { class: 'sub' }, `${leader.pts} pts, ${leader.reb} reb, ${leader.ast} ast`), el('span', { class: 'chip hot' }, `${leader.name} · ${leader.team}`)) : null,
      flow ? [el('div', { class: 'tile' }, el('span', { class: 'label' }, 'Lead changes'), el('span', { class: 'big' }, String(flow.leadChanges)), el('span', { class: 'sub' }, `and ${flow.ties} ties`)),
        el('div', { class: 'tile' }, el('span', { class: 'label' }, 'Biggest lead'), el('span', { class: 'big' }, String(Math.max(flow.maxLead.H, flow.maxLead.A))), el('span', { class: 'sub' }, `${t(h.TVCodeA)} +${flow.maxLead.H} · ${t(h.TVCodeB)} +${flow.maxLead.A}`)),
        el('div', { class: 'tile' }, el('span', { class: 'label' }, 'Biggest run'), el('span', { class: 'big' }, `${Math.max(flow.bestRun.H, flow.bestRun.A)}–0`), el('span', { class: 'sub' }, `${t(h.TVCodeA)} ${flow.bestRun.H}–0 · ${t(h.TVCodeB)} ${flow.bestRun.A}–0`))] : null),
    st === 'live' && onCourt.size ? el('section', { class: 'card' }, el('h2', {}, 'On the court now'), el('div', { class: 'row two' }, [g.home, g.away].map((s) => el('div', {}, sideH(s), el('ul', { class: 'oc-list' }, onList(s).map((p) => el('li', {}, el('span', {}, `#${p.number} ${p.name}`), el('span', { class: 'muted' }, `${p.pts} pts · ${p.pf} PF · ${p.pm > 0 ? '+' : ''}${p.pm}`)))))))) : null,
    flow && flow.line.length > 1 ? el('section', { class: 'card' }, el('h2', {}, 'Game flow'), flowChart(flow.line, periods, t(h.TVCodeA), t(h.TVCodeB))) : null,
    el('div', { class: 'row' },
      el('section', { class: 'card' }, el('h2', {}, 'Top performers'), el('div', { class: 'perf-head' }, el('span', {}, t(h.TVCodeA)), el('span'), el('span', {}, t(h.TVCodeB))), perf),
      el('section', { class: 'card' }, el('h2', {}, 'Team comparison'), el('div', { class: 'perf-head' }, el('span', {}, t(h.TVCodeA)), el('span'), el('span', {}, t(h.TVCodeB))), compare(g))),
    el('section', { class: 'card' }, el('h2', {}, 'Box score'), sideH(g.home), boxTable(g.home, onCourt), sideH(g.away), boxTable(g.away, onCourt), el('p', { class: 'muted small' }, 'Green dot = on the court now. Red number = 4+ fouls.')),
    log ? el('div', { class: 'row' },
      el('section', { class: 'card' }, el('h2', {}, 'Latest plays'), el('ol', { class: 'pbp' }, recent.map((p) => el('li', { class: `pbp-row ${p[2] === 'H' ? 'ph' : p[2] === 'A' ? 'pa' : 'pn'}${['2FGM', '3FGM', 'FTM'].includes(p[4]) ? ' sc' : ''}` },
        el('span', { class: 'pt' }, `${p[0] <= 4 ? 'Q' + p[0] : 'OT' + (p[0] - 4)} ${p[1]}`), el('span', {}, p[2] ? el('b', {}, p[2] === 'H' ? t(h.TVCodeA) : t(h.TVCodeB)) : null, ' ', p[3] ? `${names[p[3]] || log.names[p[3]] || ''} · ` : '', LABEL[p[4]] || p[4]), el('span', { class: 'ps' }, `${p[5]}–${p[6]}`))))),
      el('section', { class: 'card' }, el('h2', {}, 'Best connections'), ['H', 'A'].map((s) => [sideH(s === 'H' ? g.home : g.away), el('ol', { class: 'conn' }, conn.filter((c) => c.side === s).slice(0, 5).map((c) => el('li', {}, el('span', {}, `${names[c.from] || c.from} → ${names[c.to] || c.to}`), el('strong', {}, `${c.pts} pts`), el('span', { class: 'muted small' }, `${c.n} ast`))))]))) : null,
    el('p', { class: 'muted small' }, 'Live numbers come straight from the official EuroLeague live feed and can be corrected by the league after the game. The checked, final version is published on the site the same night.')];
}

// ---------- Halftime report: everything from the first half ----------
function halftimeView(h, g, raw, log, st) {
  const plays = log ? log.plays.filter((p) => p[0] <= 2) : [];
  const q = Number(t(h.Quarter)) || 0, done = st === 'final' || q >= 3 || (q === 2 && /^0?0:00$/.test(t(h.RemainingPartialTime) || ''));
  const side = (w) => (w === 'H' ? g.home : g.away), tv = (w) => (w === 'H' ? t(h.TVCodeA) : t(h.TVCodeB));
  // team and player numbers from the first-half plays
  const Z = () => ({ pts: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, tov: 0, stl: 0, blk: 0, pf: 0, offTO: 0, second: 0 });
  const T = { H: Z(), A: Z() }, P = new Map(), tag = { H: {}, A: {} };
  const add = (o, k, n = 1) => { o[k] += n; };
  for (const p of plays) {
    const w = p[2], type = p[4]; if (w !== 'H' && w !== 'A') continue;
    const o = w === 'H' ? 'A' : 'H';
    if (!P.has(p[3]) && p[3]) P.set(p[3], { w, ...Z() });
    const pl = P.get(p[3]);
    const both = (k, n = 1) => { add(T[w], k, n); if (pl) add(pl, k, n); };
    const pts = type === '2FGM' ? 2 : type === '3FGM' ? 3 : type === 'FTM' ? 1 : 0;
    if (type === '2FGM') { both('fgm2'); both('fga2'); } else if (type === '2FGA') both('fga2'); else if (type === '3FGM') { both('fgm3'); both('fga3'); } else if (type === '3FGA') both('fga3');
    else if (type === 'FTM') { both('ftm'); both('fta'); } else if (type === 'FTA') both('fta'); else if (type === 'O') { both('oreb'); tag[w] = { ...tag[w], sc: true }; } else if (type === 'D') { both('dreb'); tag[w] = {}; }
    else if (type === 'AS') both('ast'); else if (type === 'TO') { both('tov'); tag[o] = { to: true }; } else if (type === 'ST') both('stl'); else if (type === 'FV') both('blk'); else if (type === 'CM' || type === 'OF' || type === 'CMU' || type === 'CMT') both('pf');
    if (pts) { both('pts', pts); if (tag[w].to) add(T[w], 'offTO', pts); if (tag[w].sc) add(T[w], 'second', pts); tag[o] = {}; }
  }
  // minutes, +/- and lineups from the first-half lineups
  let stints = null; try { const r = buildStints(g, raw.pbp); if (r.ok) stints = r.periodStints.filter((x) => x.period <= 2); } catch { /* lineups unavailable */ }
  const mins = new Map(), pm = new Map(), units = { H: new Map(), A: new Map() };
  if (stints) for (const x of stints) for (const [w, ids, me, op] of [['H', x.home, g.home.code, g.away.code], ['A', x.away, g.away.code, g.home.code]]) {
    for (const id of ids) { mins.set(id, (mins.get(id) || 0) + x.secs); pm.set(id, (pm.get(id) || 0) + x.pts[me] - x.pts[op]); }
    const k = ids.join(','); const u = units[w].get(k) || { ids, secs: 0, pf: 0, pa: 0 }; u.secs += x.secs; u.pf += x.pts[me]; u.pa += x.pts[op]; units[w].set(k, u);
  }
  const nm = Object.fromEntries([...g.home.players, ...g.away.players].map((p) => [p.id, p]));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const pc = (m, a) => (a ? `${m}/${a} (${Math.round(100 * m / a)}%)` : '0/0');
  const rowsT = [['Points', (x) => x.pts], ['2-pointers', (x) => pc(x.fgm2, x.fga2)], ['3-pointers', (x) => pc(x.fgm3, x.fga3)], ['Free throws', (x) => pc(x.ftm, x.fta)], ['Off. rebounds', (x) => x.oreb], ['Def. rebounds', (x) => x.dreb], ['Assists', (x) => x.ast], ['Turnovers', (x) => x.tov], ['Steals', (x) => x.stl], ['Fouls', (x) => x.pf], ['Points off turnovers', (x) => x.offTO], ['Second-chance points', (x) => x.second]];
  const fl = plays.length ? flowStats(plays) : null;
  // shooting zones (official shot locations)
  const shots = (raw.points?.Rows || []).filter((r) => /^[23]FG[AM]$/.test(t(r.ID_ACTION)) && Number(r.MINUTE) <= 20 && !(Number(r.COORD_X) === -1 && Number(r.COORD_Y) === -1));
  const zoneT = (code) => ZONES.map(([k, l]) => { const s2 = shots.filter((r) => t(r.TEAM) === code && groupOf(zoneOf(Number(r.COORD_X), Number(r.COORD_Y), t(r.ID_ACTION).startsWith('3'))) === k); const m = s2.filter((r) => t(r.ID_ACTION).endsWith('M')).length; return el('tr', {}, el('td', {}, l), el('td', { class: 'num' }, `${m}/${s2.length}`), el('td', { class: 'num' }, s2.length ? Math.round(100 * m / s2.length) + '%' : '–')); });
  const playersT = (w) => { const s2 = side(w); const list = s2.players.filter((p) => mins.get(p.id) || P.get(p.id)).sort((a, b) => (mins.get(b.id) || 0) - (mins.get(a.id) || 0)); return el('div', { class: 'scroll' }, el('table', { class: 'gbox' }, el('thead', {}, el('tr', {}, ['Player', 'MIN', 'PTS', '2P', '3P', 'FT', 'REB', 'AST', 'TOV', 'PF', '+/-'].map((x, i) => el('th', { class: i ? 'num' : '' }, x)))),
    el('tbody', {}, list.map((p) => { const x = P.get(p.id) || Z(), v = pm.get(p.id) || 0; return el('tr', {}, el('td', {}, p.name), el('td', { class: 'num' }, mins.has(p.id) ? mmss(mins.get(p.id)) : '–'), el('td', { class: 'num' }, el('strong', {}, String(x.pts))), el('td', { class: 'num' }, `${x.fgm2}/${x.fga2}`), el('td', { class: 'num' }, `${x.fgm3}/${x.fga3}`), el('td', { class: 'num' }, `${x.ftm}/${x.fta}`), el('td', { class: 'num' }, String(x.oreb + x.dreb)), el('td', { class: 'num' }, String(x.ast)), el('td', { class: 'num' }, String(x.tov)), el('td', { class: `num ${x.pf >= 3 ? 'neg' : x.pf >= 2 ? 'warn' : ''}` }, String(x.pf)), el('td', { class: `num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}` }, `${v > 0 ? '+' : ''}${v}`)); })))); };
  const unitsT = (w) => {
    const list = [...units[w].values()].sort((a, b) => b.secs - a.secs).slice(0, 6);
    if (!list.length) return el('p', { class: 'muted' }, 'Lineups not available.');
    const head = el('thead', {}, el('tr', {}, el('th', {}, 'Lineup'), el('th', { class: 'num' }, 'MIN'), el('th', { class: 'num' }, 'Score'), el('th', { class: 'num' }, '+/-')));
    const body = el('tbody', {}, list.map((u) => { const d = u.pf - u.pa; return el('tr', {}, el('td', { class: 'small' }, u.ids.map((id) => nm[id]?.name || id).join(' · ')), el('td', { class: 'num' }, mmss(u.secs)), el('td', { class: 'num' }, `${u.pf}–${u.pa}`), el('td', { class: `num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}` }, `${d > 0 ? '+' : ''}${d}`)); }));
    return el('table', { class: 'gbox' }, head, body);
  };
  const trouble = [...P.entries()].filter(([, x]) => x.pf >= 2).sort((a, b) => b[1].pf - a[1].pf).map(([id, x]) => el('li', { class: x.pf >= 3 ? 'neg' : '' }, `${tv(x.w)} · ${nm[id]?.name || id}: ${x.pf} fouls`));
  return [
    el('section', { class: 'card ht-head' }, el('h2', {}, done ? 'Halftime report' : 'First half so far'), el('p', { class: 'muted' }, done ? `Score at half: ${t(h.TVCodeA)} ${T.H.pts} – ${T.A.pts} ${t(h.TVCodeB)}. Everything below is from the first half only.` : 'The game is still in the first half: numbers update every 15 seconds and are complete at halftime.'), el('button', { type: 'button', class: 'btn ghost small no-print', onclick: () => window.print() }, 'Print')),
    el('div', { class: 'row' },
      el('section', { class: 'card' }, el('h2', {}, 'Teams — first half'), el('table', { class: 'gbox ht-cmp' }, el('thead', {}, el('tr', {}, el('th'), el('th', { class: 'num' }, t(h.TVCodeA)), el('th', { class: 'num' }, t(h.TVCodeB)))), el('tbody', {}, rowsT.map(([l, f]) => el('tr', {}, el('td', {}, l), el('td', { class: 'num' }, String(f(T.H))), el('td', { class: 'num' }, String(f(T.A))))))),
        fl ? el('p', { class: 'small' }, `Lead changes ${fl.leadChanges} · ties ${fl.ties} · biggest lead ${t(h.TVCodeA)} +${fl.maxLead.H} / ${t(h.TVCodeB)} +${fl.maxLead.A} · biggest run ${t(h.TVCodeA)} ${fl.bestRun.H}–0 / ${t(h.TVCodeB)} ${fl.bestRun.A}–0`) : null),
      el('section', { class: 'card' }, el('h2', {}, 'Foul trouble'), trouble.length ? el('ul', { class: 'ht-fouls' }, trouble) : el('p', { class: 'muted' }, 'Nobody has 2 or more fouls.'),
        shots.length ? [el('h2', {}, 'Shooting by zone'), el('div', { class: 'row two' }, [['A', t(h.CodeTeamA)], ['B', t(h.CodeTeamB)]].map(([w, code]) => el('div', {}, el('h3', {}, w === 'A' ? t(h.TVCodeA) : t(h.TVCodeB)), el('table', { class: 'gbox' }, el('tbody', {}, zoneT(code))))))] : null)),
    el('section', { class: 'card' }, el('h2', {}, 'Players — first half'), el('h3', {}, titleCase(g.home.name)), playersT('H'), el('h3', {}, titleCase(g.away.name)), playersT('A'), el('p', { class: 'muted small' }, 'Fouls: orange = 2, red = 3+.')),
    el('section', { class: 'card' }, el('h2', {}, 'Lineups used — first half'), el('h3', {}, titleCase(g.home.name)), el('div', { class: 'scroll' }, unitsT('H')), el('h3', {}, titleCase(g.away.name)), el('div', { class: 'scroll' }, unitsT('A')))
  ];
}

// ---------- Bench screen: big, simple, for the bench or a tablet ----------
function benchView(h, g, raw, onCourt, log, st) {
  const mmss = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  const recent = log ? log.plays.filter((p) => !['BP', 'EP', 'EG'].includes(p[4])).slice(-4).reverse() : [];
  const names = Object.fromEntries([...g.home.players, ...g.away.players].map((p) => [p.id, p.name]));
  const team = (s, w) => {
    const on = s.players.filter((p) => onCourt.has(p.id)), bench = s.players.filter((p) => !onCourt.has(p.id) && (p.min > 0 || p.pf > 0)).sort((a, b) => b.min - a.min);
    const row = (p, big) => el('tr', { class: big ? 'bs-on' : '' }, el('td', { class: 'bs-num' }, p.number || ''), el('td', { class: 'bs-name' }, p.name), el('td', {}, mmss(p.min)), el('td', {}, el('strong', {}, String(p.pts))), el('td', { class: p.pf >= 4 ? 'bs-f4' : p.pf >= 3 ? 'bs-f3' : '' }, `${p.pf}F`), el('td', { class: p.pm > 0 ? 'pos' : p.pm < 0 ? 'neg' : '' }, `${p.pm > 0 ? '+' : ''}${p.pm}`));
    return el('div', { class: 'bs-team' }, el('div', { class: 'bs-th' }, crest(s.code, 34), el('span', {}, titleCase(s.name)), el('span', { class: 'bs-tf' }, `Team fouls ${t(h['Foults' + w]) || 0} · TO left ${t(h['Timeouts' + w]) || 0}`)),
      el('table', { class: 'bs-table' }, el('thead', {}, el('tr', {}, ['#', 'On the court', 'MIN', 'PTS', 'PF', '+/-'].map((x) => el('th', {}, x)))), el('tbody', {}, on.map((p) => row(p, true)))),
      el('table', { class: 'bs-table bs-bench' }, el('thead', {}, el('tr', {}, ['#', 'Bench', 'MIN', 'PTS', 'PF', '+/-'].map((x) => el('th', {}, x)))), el('tbody', {}, bench.map((p) => row(p, false)))));
  };
  return [el('section', { class: 'bench-screen' },
    el('div', { class: 'bs-top' }, el('a', { href: `?game=${selected}`, class: 'lb-back' }, '← Full view'), el('button', { type: 'button', class: 'btn ghost small', onclick: () => document.documentElement.requestFullscreen?.() }, 'Full screen'), el('span', { class: 'lb-upd' }, st === 'live' ? 'LIVE · refreshes every 15 s' : st === 'final' ? 'FINAL' : 'Not started')),
    el('div', { class: 'bs-score' }, el('span', {}, `${t(h.TVCodeA)} ${Number(h.ScoreA) || 0}`), el('span', { class: 'bs-clock' }, st === 'live' ? `${quarterName(h)} ${t(h.RemainingPartialTime) || ''}` : st === 'final' ? 'Final' : ''), el('span', {}, `${Number(h.ScoreB) || 0} ${t(h.TVCodeB)}`)),
    el('div', { class: 'bs-grid' }, team(g.home, 'A'), team(g.away, 'B')),
    recent.length ? el('ol', { class: 'bs-plays' }, recent.map((p) => el('li', {}, `${p[0] <= 4 ? 'Q' + p[0] : 'OT' + (p[0] - 4)} ${p[1]} · ${p[2] === 'H' ? t(h.TVCodeA) : p[2] === 'A' ? t(h.TVCodeB) : ''} ${p[3] ? names[p[3]] || '' : ''} ${LABEL[p[4]] || p[4]} · ${p[5]}–${p[6]}`))) : null)];
}

// ---------- Run ----------
async function tick() {
  clearTimeout(timer);
  let next = 60000;
  try {
    if (selected) {
      let raw, cachedAt = null;
      try { raw = await loadGame(selected); if (raw?.header && t(raw.header.TeamA)) { try { localStorage.setItem('hta-live-' + selected, JSON.stringify({ at: Date.now(), raw })); } catch { /* storage full or blocked */ } } }
      catch (err) { const c = (() => { try { return JSON.parse(localStorage.getItem('hta-live-' + selected) || 'null'); } catch { return null; } })(); if (!c) throw err; raw = c.raw; cachedAt = c.at; offlineErr = err; }
      if (!raw.header || !t(raw.header.TeamA)) {
        const x = CFG.schedule.find((y) => y.c === selected);
        host.replaceChildren(el('section', { class: 'live-board' },
          el('div', { class: 'lb-top' }, el('a', { href: 'live.html', class: 'lb-back' }, '← All games'), el('span', { class: 'lb-st' }, x ? when(x.utc) : 'NOT STARTED'), el('span', { class: 'lb-upd' }, 'This page checks for tip-off every minute')),
          x ? el('div', { class: 'scoreboard' },
            el('div', { class: 'sb-team' }, CFG.crests[x.h.code] ? el('span', { class: 'sb-crest' }, el('img', { src: CFG.crests[x.h.code], alt: '' })) : null, el('span', { class: 'sb-name' }, titleCase(x.h.name)), el('span', { class: 'muted-w' }, 'Home')),
            el('div', { class: 'sb-score' }, el('span', { class: 'dash' }, 'vs'), el('small', {}, x.venue || '')),
            el('div', { class: 'sb-team' }, CFG.crests[x.a.code] ? el('span', { class: 'sb-crest' }, el('img', { src: CFG.crests[x.a.code], alt: '' })) : null, el('span', { class: 'sb-name' }, titleCase(x.a.name)), el('span', { class: 'muted-w' }, 'Away'))) : el('p', {}, 'This game is not in the live feed yet.')));
      }
      else {
        host.replaceChildren(...gameView(selected, raw, cachedAt ? new Date(cachedAt) : new Date()).filter(Boolean));
        if (cachedAt) { host.prepend(el('p', { class: 'note-warn lv-offline' }, `No connection (${offlineErr?.message || 'offline'}). Showing the last numbers received at ${new Date(cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Trying again every 10 seconds.`)); next = 10000; }
        else if (status(raw.header) === 'live') next = 15000; else if (status(raw.header) === 'final') next = 0;
      }
    } else {
      await loadList();
      host.replaceChildren(...listView());
      if ([...headers.values()].some((h) => status(h) === 'live')) next = 30000;
    }
  } catch (e) {
    host.querySelector(':scope > .lv-offline')?.remove();
    host.prepend(el('p', { class: 'note-warn lv-offline' }, `Could not reach the EuroLeague live feed (${e.message}). The numbers below stay as they were; trying again shortly.`));
    next = 20000;
  }
  if (next) timer = setTimeout(() => (document.hidden ? document.addEventListener('visibilitychange', tick, { once: true }) : tick()), next);
}
let offlineErr = null;
selected = Number(new URLSearchParams(location.search).get('game')) || null;
tick();
