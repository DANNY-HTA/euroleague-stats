// HTA LAB staff store: player availability marks, keys to the game and season goals.
// Everything is encrypted in the browser with the team password (the same key as Hapoel Internal and Scouting)
// and stored as one file, scouting/plan.enc, in the site's repository. Saving needs the staff GitHub key
// that Scouting uses on this device. Pages call HTAStaff.ready() and then apply the marks.
(function () {
  'use strict';
  const CFG = window.HTA_STAFF_CFG || {};
  const ROOT = CFG.root || '';
  const SESSION = 'hta-internal-key', TOKEN = 'hta-github-token';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  const pkey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const getToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };

  async function deriveKey(pw) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(CFG.salt), iterations: CFG.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptJson(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))); return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) }); }
  async function decryptJson(key, text) { const o = JSON.parse(text); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct)))); }
  async function saveKey(key) { try { sessionStorage.setItem(SESSION, b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))); } catch { /* private mode */ } }
  async function loadKey() { try { const raw = sessionStorage.getItem(SESSION); return raw ? crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']) : null; } catch { return null; } }
  async function keyOk(key) {
    try { const list = await (await fetch(ROOT + 'internal/index.json', { cache: 'no-store' })).json(); if (!list.length) return true; await decryptJson(key, await (await fetch(ROOT + 'internal/' + encodeURIComponent(list[0]), { cache: 'no-store' })).text()); return true; } catch { return false; }
  }
  async function gh(path, opts = {}, auth = true) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) };
    if (auth && getToken()) headers.Authorization = 'Bearer ' + getToken();
    let r; try { r = await fetch('https://api.github.com/repos/' + CFG.repo + path, { ...opts, cache: 'no-store', headers }); } catch { throw new Error('could not reach GitHub. Check the internet connection'); }
    if (r.status === 404 && opts.allow404) return null;
    if (!r.ok) throw new Error(r.status === 401 ? 'the staff GitHub key on this device is not valid any more (connect it again on the Scouting page)' : r.status === 403 ? 'the staff GitHub key on this device cannot save (see the Scouting page)' : 'GitHub answered ' + r.status);
    return r.status === 204 ? null : r.json();
  }
  async function readRemote() {
    const path = '/contents/' + CFG.path + '?ref=' + (CFG.branch || 'main');
    let meta = null; const auth = !!getToken();
    try { meta = await gh(path, { allow404: true }, auth); } catch { meta = await gh(path, { allow404: true }, false); }
    if (!meta) return null;
    if (meta.content && meta.encoding === 'base64') return dec.decode(unb64(meta.content.replace(/\n/g, '')));
    const blob = await gh('/git/blobs/' + meta.sha, {}, auth); return dec.decode(unb64(blob.content.replace(/\n/g, '')));
  }
  async function writeRemote(text, message) {
    const branch = CFG.branch || 'main';
    const ref = await gh('/git/ref/heads/' + branch), head = await gh('/git/commits/' + ref.object.sha);
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(enc.encode(text)), encoding: 'base64' }) });
    const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: [{ path: CFG.path, mode: '100644', type: 'blob', sha: blob.sha }] }) });
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
    await gh('/git/refs/heads/' + branch, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  }
  const empty = () => ({ v: 1, avail: {}, keys: {}, goals: {} });
  /** Record by record, the newest change wins (each record carries updatedAt). */
  function merge(a, b) { const o = empty(); for (const k of ['avail', 'keys', 'goals']) { const ids = new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})]); for (const id of ids) { const x = a[k]?.[id], y = b[k]?.[id]; o[k][id] = !x ? y : !y ? x : (x.updatedAt || '') >= (y.updatedAt || '') ? x : y; } } return o; }

  let KEY = null, PLAN = null, readyP = null;
  const listeners = [];
  async function open(key) {
    const text = await readRemote();
    PLAN = text ? merge(empty(), await decryptJson(key, text)) : empty();
    KEY = key; listeners.forEach((f) => f(PLAN));
    return PLAN;
  }
  const S = {
    pkey,
    get plan() { return PLAN; },
    get unlocked() { return !!KEY; },
    canSave: () => !!getToken(),
    onChange(f) { listeners.push(f); if (PLAN) f(PLAN); },
    /** Resolves with the plan when this device already has the team key this session, otherwise with null. */
    ready() { if (!readyP) readyP = (async () => { const k = await loadKey(); if (!k) return null; try { return await open(k); } catch { return null; } })(); return readyP; },
    async unlock(pw) { const key = await deriveKey(pw); if (!(await keyOk(key))) throw new Error('Wrong password.'); await saveKey(key); readyP = Promise.resolve(await open(key)); return PLAN; },
    /** mutate(plan) changes records (and sets updatedAt); the newest file is read first so nobody's change is lost. */
    async save(mutate, message) {
      if (!KEY) throw new Error('unlock first');
      if (!getToken()) throw new Error('this device is not connected to save. Connect it once on the Scouting page (Connect this device)');
      const text = await readRemote(); const remote = text ? await decryptJson(KEY, text) : empty();
      const next = merge(empty(), remote); mutate(next);
      await writeRemote(await encryptJson(KEY, next), message || 'Staff plan update');
      PLAN = next; listeners.forEach((f) => f(PLAN)); return PLAN;
    },
    /** A small "unlock" form; calls done(plan) after the right password. */
    unlockForm(done, text) {
      const pw = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Team password' }), msg = el('span', { class: 'muted small' });
      return el('form', { class: 'staff-unlock', onsubmit: async (e) => { e.preventDefault(); msg.textContent = 'Checking…'; try { done(await S.unlock(pw.value)); } catch (err) { msg.textContent = err.message; } } },
        el('span', { class: 'small' }, text || 'Staff marks (injuries, keys to the game) are locked.'), pw, el('button', { class: 'btn small', type: 'submit' }, 'Unlock'), msg);
    },
    STATUS: { out: 'Out', doubt: 'Doubtful', ok: 'Available' }
  };
  window.HTAStaff = S;

  // ---- Apply availability marks to any page that tags players (data-pname / data-pnames) ----
  function apply(plan) {
    const av = plan?.avail || {}, MEDIA = window.HTA_MEDIA || {};
    // the staff's own mark wins (including "available"); otherwise the media report, if the page has one
    const eff = (k) => { const s = av[k]; if (s && s.status && s.status !== 'cleared') return { ...s, src: 'staff' }; const m = MEDIA[k]; return m ? { ...m, src: 'media' } : null; };
    const label = (e) => (e.src === 'media' && e.label ? e.label : S.STATUS[e.status]) + (e.src === 'media' ? ' · media' : '');
    document.querySelectorAll('[data-pname]').forEach((n) => {
      const e = eff(n.dataset.pname), s = e?.status; n.classList.toggle('av-out', s === 'out'); n.classList.toggle('av-doubt', s === 'doubt');
      n.querySelectorAll('.av-badge').forEach((b) => b.remove());
      if (s === 'out' || s === 'doubt') { const host = n.querySelector('header strong, td') || n; host.append(el('span', { class: 'av-badge av-' + s, title: e.note || '' }, label(e))); }
    });
    document.querySelectorAll('[data-pnames]').forEach((n) => { const bad = n.dataset.pnames.split('|').some((k) => eff(k)?.status === 'out'); n.classList.toggle('av-out', bad); });
    const note = document.getElementById('avail-note');
    if (note) {
      const here = [...new Set([...document.querySelectorAll('[data-pname]')].map((n) => n.dataset.pname))];
      const list = here.map((k) => eff(k)).filter((e) => e && (e.status === 'out' || e.status === 'doubt'));
      note.replaceChildren(list.length ? el('p', { class: 'note-warn' }, 'Not fully available: ', list.map((v, i) => [i ? ', ' : '', el('strong', {}, v.name), ` (${(v.src === 'media' && v.label ? v.label : S.STATUS[v.status]).toLowerCase()}${v.src === 'media' ? ', media report' : ', staff'}${v.note ? ': ' + v.note.replace(/ \(media, [^)]*\)$/, '') : ''})`]), '. Out players are crossed out below.') : el('p', { class: 'muted small' }, 'No players on this page are marked out. ', el('a', { href: ROOT + 'injuries.html' }, 'Injury report')));
      if (!plan) note.append(S.unlockForm(() => {}, 'Unlock to add the staff’s own marks:'));
    }
  }
  function boot() {
    const note = document.getElementById('avail-note');
    apply(null);
    S.onChange(apply);
    S.ready().then((plan) => { if (!plan) apply(null); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
