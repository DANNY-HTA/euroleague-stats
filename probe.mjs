const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
const nd = (t) => { const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m && JSON.parse(m[1]).props.pageProps; };
const pp = nd(await (await fetch('https://www.easycredit-bbl.de/spiele/2006838', { headers: H })).text());
for (const [k, v] of Object.entries(pp.initialRecentGames)) console.log('RG', k, v.length, v.map(g => `${g.id}:${g.matchDay}:${g.homeTeam.tlc}-${g.guestTeam.tlc}:${g.status}`).join(' '));
for (const u of ['/teams/413', '/team/413', '/teams/alba-berlin', '/clubs/413', '/bbl/teams/413', '/saison/teams/', '/teams/']) { const r = await fetch('https://www.easycredit-bbl.de' + u, { headers: H }); const t = await r.text(); const ids = new Set(t.match(/\/spiele\/\d{7}/g) || []); console.log('TEAM', r.status, u, ids.size, [...t.matchAll(/href="(\/[a-z-]+\/[a-z0-9-]+\/?)"/g)].map(m => m[1]).filter(h => /team|club|verein/.test(h)).slice(0, 8).join(' ')); }
