// Locks the whole built site: every HTML page and JSON data file is encrypted (AES-256-GCM) with the
// site key (GitHub secret SITE_KEY). Visitors sign in on /lock.js's screen; each person's login unwraps
// the site key (see access/users.json, made with access-setup.html). Nothing readable is published.
//
// No access/users.json in the repo -> the site stays public (lock not set up yet).
// access/users.json present but SITE_KEY missing or wrong -> FAIL, so an unlocked site is never deployed.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

const SITE = 'site', ACCESS = 'access/users.json';
if (!existsSync(ACCESS)) { console.log('Site lock: not set up (no access/users.json) — site stays public.'); process.exit(0); }
const access = JSON.parse(readFileSync(ACCESS, 'utf8'));
const keyB64 = (process.env.SITE_KEY || '').trim();
if (!keyB64) { console.error('Site lock: access/users.json exists but the SITE_KEY secret is missing. Refusing to publish an unlocked site.'); process.exit(1); }
const K = Buffer.from(keyB64, 'base64');
if (K.length !== 32) { console.error('Site lock: SITE_KEY is not a 32-byte base64 key.'); process.exit(1); }

const seal = (buf) => { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', K, iv); const ct = Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]); return Buffer.concat([iv, ct]).toString('base64'); };
// The key must match the one the logins were made with.
try {
  const b = Buffer.from(access.check, 'base64'), d = createDecipheriv('aes-256-gcm', K, b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  if (Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString() !== 'hta-lab') throw new Error();
} catch { console.error('Site lock: SITE_KEY does not match access/users.json. Refusing to publish.'); process.exit(1); }
if (!access.users?.length) { console.error('Site lock: no users in access/users.json.'); process.exit(1); }

const PUBLIC = new Set(['access-setup.html', 'access.json', 'lock.js', 'hapoel-schedule.ics']);
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } })(SITE);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pages = 0, data = 0;
for (const f of files) {
  const rel = relative(SITE, f).split('\\').join('/');
  if (PUBLIC.has(rel)) continue;
  if (f.endsWith('.html')) {
    const html = readFileSync(f, 'utf8');
    const m = html.match(/^([\s\S]*?<head[^>]*>)([\s\S]*?)(<\/head>)\s*<body([^>]*)>([\s\S]*)<\/body>\s*<\/html>\s*$/i);
    if (!m) { console.error(`Site lock: cannot parse ${rel}`); process.exit(1); }
    const [, pre, head, , bodyAttrs, body] = m;
    const title = (head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || 'HTA LAB';
    // Keep styles/fonts in <head>; drop description and title (they can describe the page).
    const keptHead = head.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta name="(description|robots)"[^>]*>/gi, '');
    const depth = rel.split('/').length - 1, root = depth ? '../'.repeat(depth) : '';
    const payload = seal(deflateRawSync(Buffer.from(JSON.stringify({ t: title, a: bodyAttrs, b: body }))));
    writeFileSync(f, `${pre}${keptHead}<title>HTA LAB</title>
<meta name="robots" content="noindex, nofollow">
</head>
<body class="hta-locked-page">
<script type="text/plain" id="hta-locked" data-root="${esc(root)}">${payload}</script>
<script src="${root}lock.js?v=${Date.now()}"></script>
</body>
</html>
`);
    pages++;
  } else if (f.endsWith('.json')) {
    writeFileSync(f, JSON.stringify({ htaLocked: 1, d: seal(deflateRawSync(readFileSync(f))) }));
    data++;
  }
}
// Logins file (wrapped keys only; useless without a password) and the sign-in script.
writeFileSync(join(SITE, 'access.json'), JSON.stringify({ v: 1, check: access.check, users: access.users }));
copyFileSync('static/lock.js', join(SITE, 'lock.js'));
writeFileSync(join(SITE, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Site lock: ${pages} pages and ${data} data files encrypted; ${access.users.length} logins.`);
