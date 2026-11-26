const r = await fetch('https://www.nba.com/termsofuse', { headers: { 'User-Agent': 'Mozilla/5.0 HTA LAB stats' } }); let t = await r.text();
t = t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const i = t.lastIndexOf('NBA STATISTICS'); console.log('S9', i, t.slice(i, i + 2500));
