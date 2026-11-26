const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json', Referer: 'https://vtb-league.com/' };
const j = await (await fetch('https://org.infobasket.su/Comp/GetCalendar/?comps=55613&format=json&lang=en', { headers: H })).json();
console.log('N', j.length, 'played', j.filter(g => g.GameStatus === 1).length, JSON.stringify(Object.keys(j[0])));
const p = j.find(g => g.GameID === 1081891) || j[0]; console.log('G', JSON.stringify(p).slice(0, 2500));
console.log('STATUS', JSON.stringify([...new Set(j.map(g => g.GameStatus))]), JSON.stringify([...new Set(j.map(g => g.CompNameEn))]));
