import { readFileSync, readdirSync } from 'node:fs';
const d = 'data/raw/ISR2027'; const R = [];
for (const f of readdirSync(d).filter((x) => /^\d+\.json$/.test(x))) { const j = JSON.parse(readFileSync(d + '/' + f)); if (j.shots) R.push(...j.shots); }
const q = (a, p) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
for (const t of ['2FG', '3FG']) { const s = R.filter((r) => r[2].startsWith(t)); const D = s.map((r) => Math.hypot(r[3], r[4])); console.log(t, s.length, 'x', q(s.map((r) => r[3]), 0), q(s.map((r) => r[3]), 1), 'y', q(s.map((r) => r[4]), 0), q(s.map((r) => r[4]), 0.5), q(s.map((r) => r[4]), 1), 'dist p1/50/99', q(D, 0.01).toFixed(0), q(D, 0.5).toFixed(0), q(D, 0.99).toFixed(0)); }
