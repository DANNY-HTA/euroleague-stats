// HTA LAB sign-in. The page content is encrypted; a valid username + password unwraps the site key,
// which then decrypts this page (and every data file the page loads). Sign out clears the key.
(function () {
  const STORE = 'hta-site-key';
  const holder = document.getElementById('hta-locked');
  const ROOT = holder ? holder.dataset.root || '' : '';
  const enc = new TextEncoder();
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } };

  let keyP = null;
  const useKey = (raw) => { keyP = crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['decrypt']); return keyP; };
  async function open(sealed) {
    const b = unb64(sealed);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await keyP, b.subarray(12));
    const stream = new Blob([pt]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  }

  // Data files (.json on this site) are encrypted too: decrypt them transparently for the page's scripts.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const r = await nativeFetch(input, init);
    try {
      const u = new URL(r.url || (typeof input === 'string' ? input : input.url), location.href);
      if (u.origin !== location.origin || !/\.json$/i.test(u.pathname) || !keyP) return r;
      const t = await r.clone().text();
      if (!t.startsWith('{"htaLocked"')) return r;
      const body = await open(JSON.parse(t).d);
      return new Response(body, { status: r.status, statusText: r.statusText, headers: { 'Content-Type': 'application/json' } });
    } catch { return r; }
  };

  async function reveal() {
    const p = JSON.parse(await open(holder.textContent.trim()));
    const ta = document.createElement('textarea'); ta.innerHTML = p.t; document.title = ta.value;
    const tmp = document.createElement('body'); tmp.innerHTML = '<x ' + p.a + '></x>';
    for (const at of tmp.firstChild.attributes) document.body.setAttribute(at.name, at.value);
    document.body.classList.remove('hta-locked-page');
    document.body.innerHTML = p.b;
    // Scripts inserted with innerHTML do not run: recreate them, in order, waiting for external ones.
    for (const old of [...document.body.querySelectorAll('script')]) {
      const t = (old.type || '').toLowerCase();
      if (t && t !== 'module' && !t.includes('javascript')) continue;
      const s = document.createElement('script');
      for (const at of old.attributes) s.setAttribute(at.name, at.value);
      s.async = false;
      if (s.src) { const done = new Promise((res) => { s.onload = s.onerror = res; }); old.replaceWith(s); await done; }
      else { s.textContent = old.textContent; old.replaceWith(s); }
    }
    document.dispatchEvent(new Event('DOMContentLoaded'));
    if (location.hash) { const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el) el.scrollIntoView(); }
    addSignOut();
  }

  function addSignOut() {
    const nav = document.querySelector('header.top nav') || document.querySelector('header nav');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hta-signout'; b.textContent = 'Sign out';
    b.style.cssText = 'border:1px solid rgba(255,255,255,.6);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font:600 12px/1 Inter,system-ui,sans-serif;cursor:pointer;margin-left:6px';
    b.addEventListener('click', () => { set(STORE, null); set('hta-site-user', null); location.reload(); });
    (nav || document.body).appendChild(b);
  }

  function loginScreen(msg) {
    document.body.innerHTML = `<style>
.hl-wrap{min-height:100vh;display:grid;place-items:center;background:#0b0b0c;font-family:Inter,system-ui,sans-serif;padding:20px}
.hl-card{width:100%;max-width:360px;background:#fff;border-radius:14px;padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.hl-card h1{margin:0 0 4px;font:800 28px/1 'Barlow Condensed',Inter,sans-serif;letter-spacing:.04em;color:#c8102e}
.hl-card p{margin:0 0 18px;color:#666;font-size:14px}
.hl-card label{display:block;font-size:12px;font-weight:600;color:#333;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em}
.hl-card input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #ccc;border-radius:8px;font-size:16px}
.hl-card button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:8px;background:#c8102e;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.hl-card button[disabled]{opacity:.6;cursor:wait}
.hl-err{color:#c8102e;font-size:13px;min-height:1.2em;margin-top:10px}
</style><div class="hl-wrap"><form class="hl-card" autocomplete="on">
<h1>HTA LAB</h1><p>Hapoel Tel Aviv basketball staff. Sign in to continue.</p>
<label for="hl-u">Username</label><input id="hl-u" name="username" autocomplete="username" autocapitalize="none" required value="${(get('hta-site-user') || '').replace(/"/g, '')}">
<label for="hl-p">Password</label><input id="hl-p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button><div class="hl-err" role="alert">${msg || ''}</div></form></div>`;
    const form = document.querySelector('.hl-card'), err = form.querySelector('.hl-err'), btn = form.querySelector('button');
    (form.querySelector('#hl-u').value ? form.querySelector('#hl-p') : form.querySelector('#hl-u')).focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const u = form.querySelector('#hl-u').value.trim().toLowerCase(), pw = form.querySelector('#hl-p').value;
        const acc = await (await nativeFetch(ROOT + 'access.json', { cache: 'no-store' })).json();
        const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('hta:' + u)));
        const row = acc.users.find((x) => x.id === id);
        if (!row) throw new Error('bad');
        const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
        const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(row.salt), iterations: row.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const w = unb64(row.w);
        const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: w.subarray(0, 12), additionalData: enc.encode(id) }, kek, w.subarray(12)));
        const k = b64(raw);
        useKey(k); await reveal();
        set(STORE, k); set('hta-site-user', u);
      } catch (x) {
        keyP = null; btn.disabled = false; btn.textContent = 'Sign in';
        err.textContent = 'Wrong username or password.';
      }
    });
  }

  if (!holder) return; // public page (e.g. the setup page): only the fetch helper is needed
  const saved = get(STORE);
  if (saved) {
    useKey(saved);
    reveal().catch(() => { set(STORE, null); keyP = null; loginScreen('Please sign in again.'); });
  } else loginScreen();
})();
