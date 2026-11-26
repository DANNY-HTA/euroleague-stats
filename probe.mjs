const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html,application/json' };
const B = 'https://basketball.scouting4u.com';
const g = async (u) => { try { const r = await fetch(u, { headers: H }); return [r.status, await r.text(), r.headers.get('content-type')]; } catch (e) { return [0, e.cause?.code || e.message, '']; } };
let [s, t] = await g(B + '/robots.txt'); console.log('ROBOTS', s, t.slice(0, 600));
[s, t] = await g(B + '/leagues/g-league-37'); console.log('LEAGUE', s, t.length, (t.match(/<title>[^<]*/) || [''])[0]);
const links = [...new Set(t.match(/href="(\/[^"#?]+)"/g) || [])].map((x) => x.slice(6, -1)); console.log('LINKS', links.filter(l => !/\.(css|png|svg|ico|js)$/.test(l)).slice(0, 80).join(' '));
const apis = [...new Set(t.match(/https?:\/\/[a-z0-9.-]*(api|supabase|firebase|data)[a-z0-9.-]*\.[a-z]{2,}[^"' )]{0,60}/gi) || [])]; console.log('APIS', apis.join(' | '));
const nx = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]{0,3000})/); console.log('NEXT', nx ? nx[1].slice(0, 1500) : 'none', /self\.__next_f/.test(t) ? 'FLIGHT' : '');
for (const l of links.filter(l => /schedule|result|game|stats|leader|player/i.test(l)).slice(0, 6)) { const [a, b] = await g(B + l); console.log('SUB', a, l, b.length, (b.match(/\/games?\/[a-z0-9-]+/gi) || []).slice(0, 5).join(' '), /log ?in|sign ?in/i.test(b) ? 'LOGIN?' : ''); }
