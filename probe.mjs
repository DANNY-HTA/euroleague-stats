const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB research)' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); return [r.status, await r.text()]; };
const ctx = (t, w, k = 3, span = 500) => { let i = -1, out = []; while (out.length < k && (i = t.indexOf(w, i + 1)) >= 0) out.push(t.slice(Math.max(0, i - span), i + span).replace(/\s+/g, ' ')); return out; };
for (const path of ['estadisticas', 'jugadas']) {
  const [s, t] = await get(`https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/${path}`);
  console.log(`\n##### ${path} ${s} ${t.length}`);
  const keys = [...new Set((t.match(/\\"[a-zA-Z_]{3,30}\\":/g) || []))];
  console.log('KEYS:', keys.filter((k) => !/className|children|style|href|src|precedence|nonce|async|crossOrigin|parallelRouterKey|template|error|notFound|forbidden|unauthorized|forceMount|orientation|scrollHideDelay|fontFamily|height|width|type|rel/.test(k)).slice(0, 150).join(' '));
  for (const c of ctx(t, 'Shulga', 2, 700)) console.log('CTX:', c);
}
const [s3, t3] = await get('https://acb.com/es/liga/partidos');
console.log('\n##### calendar', s3, t3.length, [...new Set(t3.match(/partidos\/[a-z0-9-]+-\d{5,}/g) || [])].length, [...new Set(t3.match(/partidos\/[a-z0-9-]+-\d{5,}/g) || [])].slice(0, 5));
const [s4, t4] = await get('https://acb.com/es/calendario');
console.log('##### calendario', s4, t4.length, [...new Set(t4.match(/partidos\/[a-z0-9-]+-\d{5,}/g) || [])].length);
