const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB research)', Accept: 'text/html,application/json' };
async function show(url, re, n = 6) {
  try {
    const r = await fetch(url, { headers: UA });
    const t = await r.text();
    console.log(`\n=== ${url} -> ${r.status} ${t.length} bytes ${r.headers.get('content-type')}`);
    if (re) { const m = [...new Set(t.match(re) || [])].slice(0, n); for (const x of m) console.log('  ', x.slice(0, 300)); }
    return t;
  } catch (e) { console.log(`\n=== ${url} -> ERROR ${e.message}`); return ''; }
}
// ACB: game page, look for embedded JSON / ids / full names
const acb = await show('https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/estadisticas', /"(?:playerId|idPlayer|license|fullName|playerName|nombre|shirtNumber)"\s*:\s*"?[^",}]{1,40}/g, 12);
const i = acb.indexOf('Luwawu'); console.log('ACB around Luwawu:', acb.slice(Math.max(0, i - 600), i + 400).replace(/\s+/g, ' '));
await show('https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/jugadas', /\\"[a-zA-Z]+\\":/g, 40);
await show('https://www.acb.com/robots.txt', /.+/g, 20);
// Turkey
await show('https://www.tbf.org.tr/ligler/bsl-2026-2027', /href="[^"]*(mac|match|istatistik)[^"]*"/gi, 10);
await show('https://www.bsl.org.tr/', /href="[^"]*(mac|match|fikstur|istatistik)[^"]*"/gi, 10);
// Germany
await show('https://www.easycredit-bbl.de/spielplan', /(api[a-z0-9./-]*|https?:\/\/[a-z0-9.-]*(api|stats|genius|fiba)[^"'\s<]*)/gi, 15);
// France
await show('https://lnb.fr/fr/betclic-elite/calendrier', /(https?:\/\/[a-z0-9.-]*(api|stats|genius|fiba|atrium)[^"'\s<]*)/gi, 15);
