const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB research)' };
const get = async (u) => (await fetch(u, { headers: UA })).text();
/** Decode the Next.js RSC payload strings pushed in the page. */
function rsc(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { out += JSON.parse(m[1]); } catch {} }
  return out;
}
const base = 'https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/';
const J = rsc(await get(base + 'jugadas'));
console.log('decoded jugadas', J.length);
let i = J.indexOf('{"order":'); console.log('BEFORE FIRST PLAY:', J.slice(Math.max(0, i - 400), i + 50));
const types = new Map();
for (const m of J.matchAll(/\{"order":(\d+),"playType":(\d+),"playTag":([^,]*),"quarter":(\d+),"minute":(\d+),"second":(\d+),"local":(true|false|null)/g)) types.set(m[2], (types.get(m[2]) || 0) + 1);
console.log('playType counts:', [...types].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(' '));
const dict = J.match(/"playTypes?":\{[^}]{0,3000}\}/); console.log('DICT:', dict ? dict[0].slice(0, 2000) : 'none');
for (const w of ['"description"', '"playTypeName"', '"literal"']) { const k = J.indexOf(w); if (k > 0) console.log('NEAR', w, J.slice(k - 200, k + 300)); }
const S = rsc(await get(base + 'estadisticas'));
console.log('\ndecoded estadisticas', S.length);
for (const w of ['playerLicenseId', '"minutes"', '"plusMinus"', '"valuation"', '"isStarter"', '"starter"']) { const k = S.indexOf(w); console.log('E', w, k, k > 0 ? S.slice(k - 300, k + 600) : ''); }
// game header
const h = J.indexOf('initialMatchHeader'); console.log('\nHEADER:', J.slice(h, h + 1500));
