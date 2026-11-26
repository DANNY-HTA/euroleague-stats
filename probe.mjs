const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
for (const m of [1, 2, 3, 4, 5]) {
  const u = `https://www.esake.gr/el/action/EsakegameView?idgame=578190A6&mode=${m}`;
  const r = await fetch(u, { headers: H }); const t = await r.text();
  const txt = t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  console.log('M', m, r.status, t.length, (t.match(/<table/g) || []).length, 'tables', /geniussports|fibalivestats/.test(t) ? 'GENIUS' : '', [...new Set(t.match(/(fibalivestats|geniussports)[^"' <]{0,100}/g) || [])].slice(0, 3).join(' | '));
  const i = txt.search(/ΛΕΠΤΑ|Λεπτά|MIN|ΠΟΝ/); console.log('   TXT', txt.slice(Math.max(0, i - 300), i + 900));
}
