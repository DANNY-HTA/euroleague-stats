// Shot charts from the official EuroLeague/EuroCup shot locations (scripts/fetch-shots.mjs).
// Coordinates: centimetres from the centre of the basket; x across the court, y towards half court.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ZONES, SUB, zoneOf, groupOf } from './zones.mjs';
export { ZONES, zoneOf, groupOf };

/** All shots of a season folder, only for games where the shot feed matches the box score (2PA and 3PA of both teams). */
export function loadShots(dir, games, inRaw = null) {
  const d = join(dir, '_shots');
  const files = existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.json')).map((f) => () => JSON.parse(readFileSync(join(d, f), 'utf8'))) : [];
  if (inRaw) for (const [code, rows] of inRaw) files.push(() => ({ gameCode: code, rows }));
  if (!files.length) return null;
  const byCode = new Map(games.map((g) => [Number(g.gameCode), g]));
  const out = []; let ok = 0, bad = 0;
  for (const load of files) {
    let j; try { j = load(); } catch { continue; }
    const g = byCode.get(Number(j.gameCode)); if (!g) continue;
    const fg = j.rows.filter((r) => /^[23]FG[AM]$/.test(r[2]));
    // check: attempts per team and type equal the official box score
    const cnt = (code, t) => fg.filter((r) => r[0] === code && r[2].startsWith(t)).length;
    const good = [g.home, g.away].every((s) => cnt(s.code, '2FG') === s.totals.fga2 && cnt(s.code, '3FG') === s.totals.fga3);
    if (!good) { bad++; continue; }
    ok++;
    for (const r of fg) {
      const is3 = r[2].startsWith('3'), made = r[2].endsWith('M');
      const per = r[8] <= 10 ? 1 : r[8] <= 20 ? 2 : r[8] <= 30 ? 3 : r[8] <= 40 ? 4 : 5;
      const hasXY = !(r[3] === -1 && r[4] === -1);
      out.push({ g: g.gameCode, team: r[0], opp: r[0] === g.home.code ? g.away.code : g.home.code, pid: r[1], is3, made, x: r[3], y: r[4], xy: hasXY, z: hasXY ? zoneOf(r[3], r[4], is3) : null, fb: r[5], sc: r[6], pot: r[7], q: per });
    }
  }
  return { shots: out, ok, bad };
}

export function zoneTable(shots) {
  const z = {}, sub = {};
  for (const s of shots) { if (!s.z) continue; const gk = groupOf(s.z); for (const [o, k] of [[z, gk], [sub, s.z]]) { o[k] ||= { a: 0, m: 0 }; o[k].a++; if (s.made) o[k].m++; } }
  return { z, sub, n: shots.filter((s) => s.z).length };
}

const R = (v) => Math.round(v);
/** Half-court SVG: basket at the top. mode 'dots' (made/missed) or 'zones' (FG% per zone vs league). */
export function courtSvg(shots, { mode = 'dots', league = null, title = '', id = '' } = {}) {
  const W = 1500, X0 = -750, Y0 = -170, H = 1150;
  const L = [];
  // court
  L.push(`<rect x="${X0}" y="-157.5" width="1500" height="${H}" class="ct-floor"/>`);
  L.push(`<path class="ct-line" d="M-750 -157.5H750M-245 -157.5V422.5H245V-157.5M-660 -157.5V141.5A675 675 0 0 0 660 141.5V-157.5M-90 -37.5H90M-125 0A125 125 0 0 0 125 0"/>`);
  L.push(`<circle class="ct-line" cx="0" cy="422.5" r="180"/><circle class="ct-rim" cx="0" cy="0" r="22.5"/>`);
  if (mode === 'dots') {
    for (const s of shots) {
      if (!s.xy || s.y > 980) continue;
      const cls = `shot-dot ${s.made ? 'sd-m' : 'sd-x'}`;
      L.push(s.made ? `<circle class="${cls}" data-q="${s.q}" cx="${R(s.x)}" cy="${R(s.y)}" r="17"/>` : `<path class="${cls}" data-q="${s.q}" d="M${R(s.x) - 13} ${R(s.y) - 13}l26 26m0 -26l-26 26"/>`);
    }
  } else {
    const t = zoneTable(shots), lg = league ? zoneTable(league) : null;
    for (const [k, , lx, ly] of SUB) {
      const c = t.sub[k]; if (!c || !c.a) continue;
      const p = 100 * c.m / c.a, lp = lg?.sub[k]?.a ? 100 * lg.sub[k].m / lg.sub[k].a : null;
      const d = lp == null ? 0 : p - lp, heat = c.a < 5 ? 'zn-few' : d >= 6 ? 'zn-hot2' : d >= 2 ? 'zn-hot' : d <= -6 ? 'zn-cold2' : d <= -2 ? 'zn-cold' : 'zn-avg';
      L.push(`<g class="zone ${heat}"><rect x="${lx - 105}" y="${ly - 62}" width="210" height="124" rx="22"/><text x="${lx}" y="${ly + 4}" class="zn-p">${p.toFixed(0)}%</text><text x="${lx}" y="${ly + 46}" class="zn-n">${c.m}/${c.a}</text></g>`);
    }
  }
  return `<svg class="court ${mode}" viewBox="${X0} ${Y0} ${W} ${H}"${id ? ` id="${id}"` : ''} role="img" aria-label="${title.replace(/"/g, '')}">${L.join('')}</svg>`;
}

/** Zone table rows vs league: [label, made, att, pct, leaguePct, share] */
export function zoneRows(shots, league) {
  const t = zoneTable(shots), lg = league ? zoneTable(league) : null;
  return ZONES.map(([k, label]) => { const c = t.z[k] || { a: 0, m: 0 }, l = lg?.z[k]; return { k, label, m: c.m, a: c.a, pct: c.a ? 100 * c.m / c.a : null, lpct: l?.a ? 100 * l.m / l.a : null, share: t.n ? 100 * c.a / t.n : 0, lshare: lg?.n ? 100 * (l?.a || 0) / lg.n : null }; });
}
