const H = { 'User-Agent': 'Mozilla/5.0 HTA LAB stats', Accept: 'text/html' };
for (const u of ['https://www.nba.com/termsofuse', 'https://gleague.nba.com/terms-of-use', 'https://gleague.nba.com/termsofuse']) {
  const r = await fetch(u, { headers: H }); let t = await r.text();
  t = t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  console.log('T', r.status, u, t.length);
  for (const m of t.matchAll(/[^.]{0,400}(scrap|robot|spider|crawl|data mining|automated means|automatic means)[^.]{0,400}\./gi)) console.log('  CLAUSE', m[0].trim().slice(0, 900));
}
