const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats (Hapoel Tel Aviv)', Accept: 'text/html' };
const B = 'https://www.esake.gr';
const g = async (u) => (await fetch(u, { headers: H })).text();
const t = await g(B + '/el');
const acts = [...new Set([...t.matchAll(/href="([^"]*action\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')))].map(h => h.replace(/=[0-9A-F]{8}/g, '=X')); console.log('ACTIONS', [...new Set(acts)].join(' '));
const gc = [...t.matchAll(/href="([^"]+)"[^>]*>\s*Game Center/g)].map(m => m[1]); console.log('GC', gc.join(' '));
for (const u of gc.slice(0, 1)) { const x = await g(u.startsWith('http') ? u : B + u); const ids = [...new Set(x.match(/idgame=[0-9A-F]{8}/g) || [])]; console.log('GCIDS', ids.length, ids.slice(0, 5).join(' '), [...new Set([...x.matchAll(/href="([^"]*action\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/=[0-9A-F]{8}/g, '=X')))].join(' ')); }
