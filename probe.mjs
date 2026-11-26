const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json,text/html' };
const j = await (await fetch('https://schedule.nbl.com.au/api/calendar/schedule?league=nbl&limit=500&offset=0', { headers: H })).json();
const arr = Object.values(j).find((v) => Array.isArray(v) && v[0]?.match_slug) || [];
const reg = arr.filter((x) => x.phase === 'complete' && x.round_label !== 'Preseason');
console.log('N', arr.length, reg.length, Object.keys(arr[0] || {}).join(','));
const x = reg[0] || arr[0]; const urls = JSON.stringify(x).match(/https?:[^"]+/g) || []; console.log('URLS', urls.filter(u => !/sportradar\.com\/b1sjj|logo/.test(u)).join(' | '));
console.log('ITEM', JSON.stringify({ ...x, home: x.home?.team_code, away: x.away?.team_code }).slice(0, 1500));
