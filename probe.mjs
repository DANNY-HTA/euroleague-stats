const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'application/json' };
const B = 'https://schedule.nbl.com.au';
const id = '36dbeb55-58ad-11f1-a69b-43a6b5595d3e', season = '67d4a190-40bc-4bfb-a9a2-11bd0b93f020';
const d = await (await fetch(`${B}/api/calendar/match?match=${id}&league=NBL&season=${season}`, { headers: H })).json();
const out = [];
const sh = (o, p = '', dd = 0) => { if (dd > 5 || !o || typeof o !== 'object') return; if (Array.isArray(o)) { if (o[0] !== undefined) sh(o[0], p + '[0]', dd + 1); return; }
  for (const [k, v] of Object.entries(o).slice(0, 70)) { out.push(p + '.' + k + (Array.isArray(v) ? `[${v.length}]` : v && typeof v === 'object' ? '' : '=' + String(v).slice(0, 40))); sh(v, p + '.' + k, dd + 1); } };
sh(d); console.log(out.filter(l => !/logo|image|photo|url|color|broadcast|ticket|article|video|news/i.test(l)).slice(0, 400).map(l => 'K ' + l).join('\n'));
