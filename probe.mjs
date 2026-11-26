const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json,text/html' };
const r = await fetch('https://schedule.nbl.com.au/api/calendar/schedule?league=nbl&limit=500&offset=0', { headers: H }); const t = await r.text();
console.log('SCHED', r.status, t.length, t.slice(0, 1200));
let j; try { j = JSON.parse(t); } catch {}
const items = Array.isArray(j) ? j : (j?.data || j?.matches || j?.items || j?.schedule || []);
const done = (Array.isArray(items) ? items : []).find((x) => /complete|final|closed|post/i.test(JSON.stringify(x).slice(0, 2000)));
console.log('DONE', JSON.stringify(done || items[0] || {}).slice(0, 2000));
