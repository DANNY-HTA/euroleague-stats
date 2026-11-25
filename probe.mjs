const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats' };
for (const u of ['https://api.basketball-bundesliga.de/calendar/ical/all-games', 'https://www.easycredit-bbl.de/api/calendar/ical/all-games', 'https://easycredit-bbl.de/api/calendar/ical/all-games', 'https://api.basketball-bundesliga.de/calendar/ical/games/413']) {
  try { const r = await fetch(u, { headers: H }); const t = await r.text(); console.log('CAL', r.status, u, t.length, (t.match(/BEGIN:VEVENT/g) || []).length); console.log(t.slice(0, 900).replace(/\r?\n/g, ' ⏎ ')); } catch (e) { console.log('CAL ERR', u, e.message); }
}
