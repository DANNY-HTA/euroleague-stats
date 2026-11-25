const UA = { 'User-Agent': 'Mozilla/5.0 (HTA LAB research)' };
const html = await (await fetch('https://live.acb.com/es/partidos/real-madrid-vs-asisa-joventut-105455/estadisticas', { headers: UA })).text();
const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => m[0]);
const t = tables[0];
const tr = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
console.log('row0 raw:', tr[1][0].slice(0, 1500));
console.log('team row raw:', tr[13][0].slice(0, 1200));
console.log('totals raw:', tr[14][0].slice(0, 1200));
console.log('before table0:', html.slice(html.indexOf(tables[0]) - 600, html.indexOf(tables[0])).replace(/\s+/g, ' '));
