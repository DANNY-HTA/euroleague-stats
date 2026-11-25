import { flight } from './lib/acb.mjs';
const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB stats)' };
const html = await (await fetch('https://acb.com/es/calendario', { headers: UA })).text();
const F = flight(html);
console.log('flight', F.length, 'html', html.length);
for (const w of ['"matchId"', '"start"', '"status"', '"round"', '"jornada"', '"homeTeam"', '105455']) { const k = (F || html).indexOf(w); console.log(w, k, k > 0 ? (F || html).slice(k - 300, k + 500).replace(/\s+/g, ' ') : ''); }
const k2 = html.indexOf('105455'); console.log('HTML ctx:', html.slice(k2 - 1500, k2 + 300).replace(/\s+/g, ' '));
