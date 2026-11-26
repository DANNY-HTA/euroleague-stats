const r = await fetch('https://www.nba.com/termsofuse', { headers: { 'User-Agent': 'Mozilla/5.0 HTA LAB stats' } }); let t = await r.text();
t = t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
for (const w of ['harvest', 'extract', 'commercial', 'statistic', 'Rules of Conduct', 'you agree not to', 'shall not', 'may not']) { const i = t.toLowerCase().indexOf(w.toLowerCase()); console.log('W', w, i, i >= 0 ? t.slice(Math.max(0, i - 400), i + 700) : ''); }
