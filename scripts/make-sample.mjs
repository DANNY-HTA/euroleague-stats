// Makes a fake season in the exact format of the official feed, so you can
// preview the site without downloading anything:  npm run demo
// Team and player names are invented. The real site never uses this data.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { playerRow, teamBlock, rawGame } from '../test/helpers.mjs';

const OUT = join('data', 'sample');
let seed = 42;
const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ri = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
const bin = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; };

const CITIES = ['Northport', 'Valemont', 'Ashford', 'Brightwater', 'Coldridge', 'Dunmore', 'Eastvale', 'Fairhaven', 'Glenrock', 'Highmoor',
  'Ironbridge', 'Kingsreach', 'Lakeside', 'Millbrook', 'Newcastle Bay', 'Oakham', 'Pinecrest', 'Queensford', 'Redcliff', 'Stonehill'];
const FIRST = ['ALEX', 'BEN', 'CHRIS', 'DAN', 'ELI', 'FINN', 'GUS', 'HUGO', 'IVAN', 'JON', 'KAI', 'LEO', 'MAX', 'NIKO', 'OTTO', 'PIET', 'RAY', 'SAM', 'TOM', 'VIC'];
const LAST = ['STONE', 'RIVERS', 'HALE', 'CROSS', 'MOORE', 'LANE', 'FROST', 'BLAKE', 'REED', 'WARD', 'NASH', 'COLE', 'PIKE', 'VANCE', 'BROOK', 'DRAKE', 'WEST', 'KNOX', 'LYLE', 'MARSH'];

const teams = CITIES.map((c, i) => {
  const strength = r();
  return {
    code: c.slice(0, 3).toUpperCase(), name: (c + ' BC').toUpperCase(), strength,
    roster: Array.from({ length: 10 }, (_, j) => ({
      id: `S${String(i).padStart(2, '0')}${j}`,
      name: `${LAST[(i * 3 + j) % 20]}, ${FIRST[(i + j * 7) % 20]}`,
      role: j < 2 ? 'G' : j < 4 ? 'W' : j < 6 ? 'F' : j < 8 ? 'B' : 'G',
      talent: 0.6 + r() * 0.8 - j * 0.04,
      shoot: 0.3 + r() * 0.14
    }))
  };
});
// avoid duplicate 3-letter codes
const used = new Set();
for (const t of teams) { let c = t.code; let k = 0; while (used.has(c)) c = t.code.slice(0, 2) + String.fromCharCode(65 + k++); t.code = c; used.add(c); }

function minutesSplit() {
  const base = [32, 30, 28, 26, 24, 20, 16, 12, 8, 4];
  const m = base.map((b) => Math.max(0, b + ri(-3, 3)));
  let diff = 200 - m.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0) { const k = i % 10; if (diff > 0) { m[k]++; diff--; } else if (m[k] > 1) { m[k]--; diff++; } i++; }
  return m;
}

function line(p, min, form) {
  const k = (min / 40) * p.talent * form;
  const role = p.role;
  const a2 = bin(Math.round(14 * k), role === 'B' ? 0.9 : 0.6);
  const a3 = bin(Math.round(12 * k), role === 'B' ? 0.1 : role === 'G' ? 0.65 : 0.45);
  const fta = bin(Math.round(8 * k), 0.6);
  const m2 = bin(a2, 0.5 + p.talent * 0.06);
  const m3 = bin(a3, p.shoot);
  const ftm = bin(fta, 0.78);
  const oreb = bin(Math.round(6 * k), role === 'B' ? 0.5 : 0.15);
  const dreb = bin(Math.round(12 * k), role === 'B' ? 0.55 : 0.25);
  const ast = bin(Math.round(12 * k), role === 'G' ? 0.5 : 0.15);
  const stl = bin(Math.round(4 * k), 0.3);
  const tov = bin(Math.round(5 * k), 0.4);
  const blk = bin(Math.round(4 * k), role === 'B' ? 0.4 : 0.06);
  const pf = Math.min(5, bin(Math.round(6 * (min / 40)), 0.45));
  return { s: [[m2, a2], [m3, a3], [ftm, fta], [oreb, dreb], ast, stl, tov, blk, pf], min };
}

function teamGame(t, edge) {
  const mins = minutesSplit();
  const form = 0.85 + t.strength * 0.3 + edge + (r() - 0.5) * 0.2;
  return t.roster.map((p, j) => (mins[j] > 0 ? line(p, mins[j], form) : null));
}

function rows(t, lines) {
  return t.roster.map((p, j) => {
    const L = lines[j];
    if (!L) return { ...playerRow(t.code, p.id, p.name, [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 'DNP'), IsStarter: 0 };
    const row = playerRow(t.code, p.id, p.name, ...L.s, `${String(L.min).padStart(2, '0')}:00`);
    row.IsStarter = j < 5 ? 1 : 0;
    return row;
  });
}

const pts = (lines) => lines.reduce((s, L) => s + (L ? 2 * L.s[0][0] + 3 * L.s[1][0] + L.s[2][0] : 0), 0);

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  // round-robin pairings (circle method)
  const ids = teams.map((_, i) => i);
  let code = 1;
  const start = new Date('2026-09-24T00:00:00Z');
  for (let round = 1; round <= 14; round++) {
    for (let i = 0; i < 10; i++) {
      const h = teams[ids[i]], a = teams[ids[19 - i]];
      const [home, away] = round % 2 ? [h, a] : [a, h];
      const hl = teamGame(home, 0.03), al = teamGame(away, 0);
      // no ties: give the home side's first player an extra made free throw until it is decided
      while (pts(hl) === pts(al)) { hl[0].s[2] = [hl[0].s[2][0] + 1, hl[0].s[2][1] + 1]; }
      const d = new Date(start.getTime() + (round - 1) * 7 * 86400000 + (i % 2) * 86400000);
      const date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
      const raw = rawGame({ code, round, date, a: teamBlock(home.name, rows(home, hl)), b: teamBlock(away.name, rows(away, al)), codeA: home.code, codeB: away.code });
      // running score after each quarter, like the real header
      for (const [side, total] of [['A', pts(hl)], ['B', pts(al)]]) {
        const cuts = [0.22 + r() * 0.06, 0.47 + r() * 0.06, 0.72 + r() * 0.06].map((f) => Math.round(total * f));
        [...cuts, total].forEach((v, i) => { raw.header[`ScoreQuarter${i + 1}${side}`] = v; });
      }
      await writeFile(join(OUT, `${String(code).padStart(3, '0')}.json`), JSON.stringify(raw));
      code++;
    }
    ids.splice(1, 0, ids.pop());
  }
  console.log(`Sample season written: ${code - 1} games in ${OUT}`);
}
main();
