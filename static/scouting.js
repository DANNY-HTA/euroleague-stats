// HTA LAB — SCOUTING
// A private scouting database for the staff: every EuroLeague and EuroCup player with official stats,
// plus any player in the world added by hand or imported from CSV / Excel exports, with folders, notes,
// ratings and status.
//
// Privacy: the scouting database (notes, folders, imported players) is encrypted in the browser with the
// team password (AES-GCM 256, key from PBKDF2-SHA256, same key as HAPOEL – INTERNAL) and stored as one
// file, scouting/db.enc, in the site's repository. Nothing readable ever leaves the device.
(function () {
  'use strict';
  const CFG = window.HTA_SCOUT || {};
  const root = document.getElementById('scouting-app');
  if (!root || !window.crypto?.subtle) { if (root) root.textContent = 'This browser cannot open the scouting section. Please use an up-to-date Chrome, Safari, Edge or Firefox.'; return; }

  // ---------- helpers ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  const b64 = (bytes) => { let s = ''; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s.replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v); else if (k === 'value') n.value = v; else if (k === 'checked') n.checked = !!v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const put = (node, ...kids) => node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const now = () => new Date().toISOString();
  const f1 = (v) => (v == null || v === '' || !Number.isFinite(+v) ? '–' : (+v).toFixed(1));
  const pct = (m, a) => (a > 0 ? (100 * m) / a : null);
  const num = (v) => { if (v == null) return null; const s = String(v).trim().replace(',', '.').replace('%', ''); if (s === '' || s === '-' || s === '–') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
  const SESSION = 'hta-internal-key', TOKEN = 'hta-github-token', WHO = 'hta-scout-initials';
  const getToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch { /* ignore */ } };
  const getWho = () => { try { return localStorage.getItem(WHO) || ''; } catch { return ''; } };
  const setWho = (t) => { try { localStorage.setItem(WHO, t); } catch { /* ignore */ } };
  const STATUSES = ['', 'Watch', 'Target', 'Priority', 'Contacted', 'Signed', 'Pass'];
  const LEAGUE_NAME = { EL: 'EuroLeague', EC: 'EuroCup', IL: 'Winner League (Israel)', IT: 'Serie A (Italy)', ES: 'Liga Endesa (Spain)' };
  const LEAGUE_DIR = { IL: 'il/', IT: 'lba/', ES: 'acb/' };

  // ---------- crypto ----------
  async function deriveKey(password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(CFG.salt), iterations: CFG.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptJson(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    return JSON.stringify({ v: 2, iv: b64(iv), ct: b64(ct) });
  }
  async function decryptJson(key, text) { const o = JSON.parse(text); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct)))); }
  async function saveKey(key) { try { sessionStorage.setItem(SESSION, b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))); } catch { /* private mode */ } }
  async function loadKey() { try { const raw = sessionStorage.getItem(SESSION); return raw ? crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']) : null; } catch { return null; } }
  /** Checks a key against the encrypted internal documents (so a typo can never create a second database). */
  async function keyMatchesInternal(key) {
    try {
      const list = await (await fetch('internal/index.json', { cache: 'no-store' })).json();
      if (!list.length) return true;
      await decryptJson(key, await (await fetch('internal/' + encodeURIComponent(list[0]), { cache: 'no-store' })).text());
      return true;
    } catch { return false; }
  }

  // ---------- GitHub storage ----------
  async function gh(path, opts = {}, auth = true) {
    let r;
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) };
    if (auth && getToken()) headers.Authorization = 'Bearer ' + getToken();
    try { r = await fetch('https://api.github.com/repos/' + CFG.repo + path, { ...opts, cache: 'no-store', headers }); }
    catch { throw new Error('could not reach GitHub. Check the internet connection'); }
    if (r.status === 404 && opts.allow404) return null;
    if (!r.ok) {
      let detail = ''; try { detail = (await r.json()).message || ''; } catch { /* none */ }
      const why = r.status === 401 ? 'GitHub does not recognise this key (mistyped, expired or deleted)'
        : r.status === 403 && /rate limit/i.test(detail) ? 'GitHub is limiting requests from this network for a while. Connecting this device with the staff key removes the limit'
        : r.status === 403 ? 'this key cannot write to the site. On GitHub: Repository access → Only select repositories → ' + String(CFG.repo).split('/')[1] + ', and Permissions → Contents → “Read and write”'
        : r.status === 404 ? 'this key cannot see ' + CFG.repo + ' (it must be created for the hta-lab account)' : 'GitHub answered ' + r.status;
      throw new Error(why + (detail && !why.includes(detail) ? ` (GitHub: “${detail}”)` : ''));
    }
    return r.status === 204 ? null : r.json();
  }
  /** Returns { sha, text } of scouting/db.enc, or { sha: null, text: null } when there is no database yet. */
  async function readRemote() {
    // The repository is public, so reading works without a key. A saved key is used when it works
    // (higher GitHub limits); an old, expired or wrong key never blocks reading.
    const path = '/contents/' + CFG.path + '?ref=' + (CFG.branch || 'main');
    let meta, auth = !!getToken();
    if (auth) { try { meta = await gh(path, { allow404: true }, true); if (!meta) auth = false; } catch { auth = false; } }
    if (!auth) meta = await gh(path, { allow404: true }, false);
    if (!meta) return { sha: null, text: null };
    if (meta.content && meta.encoding === 'base64' && meta.size <= 900000) return { sha: meta.sha, text: dec.decode(unb64(meta.content)) };
    const blob = await gh('/git/blobs/' + meta.sha, {}, auth);
    return { sha: meta.sha, text: dec.decode(unb64(blob.content)) };
  }
  async function writeRemote(text, message) {
    const branch = CFG.branch || 'main';
    const ref = await gh('/git/ref/heads/' + branch);
    const head = await gh('/git/commits/' + ref.object.sha);
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(enc.encode(text)), encoding: 'base64' }) });
    const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: [{ path: CFG.path, mode: '100644', type: 'blob', sha: blob.sha }] }) });
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
    await gh('/git/refs/heads/' + branch, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    return blob.sha;
  }

  // ---------- state ----------
  const emptyDb = () => ({ v: 1, players: {}, folders: {} });
  let KEY = null, DB = emptyDb(), SHA = null, dirty = false, saving = false, POOL = [], POOL_BY = new Map();
  const S = { view: 'all', folder: null, q: '', league: '', team: '', pos: '', ageMax: '', minGp: '', minMin: '', status: '', sort: 'ppg', dir: -1, limit: 150, sel: new Set(), open: null };

  /** Merge two databases record by record: the newest change wins; deletions are kept as tombstones. */
  function merge(a, b) {
    const out = emptyDb();
    for (const kind of ['players', 'folders']) {
      const ids = new Set([...Object.keys(a[kind] || {}), ...Object.keys(b[kind] || {})]);
      for (const id of ids) {
        const x = a[kind]?.[id], y = b[kind]?.[id];
        out[kind][id] = !x ? y : !y ? x : (x.updatedAt || '') >= (y.updatedAt || '') ? x : y;
      }
      // notes are merged inside players so two people writing at once both keep their notes
      if (kind === 'players') for (const id of ids) {
        const x = a.players?.[id], y = b.players?.[id];
        if (x && y) { const m = new Map(); for (const n of [...(x.notes || []), ...(y.notes || [])]) { const had = m.get(n.id); m.set(n.id, had?.deleted ? had : n); } out.players[id] = { ...out.players[id], notes: [...m.values()].sort((p, q) => (p.t < q.t ? 1 : -1)) }; }
      }
    }
    return out;
  }

  // ---------- players (pool + private records) ----------
  const POOL_KEYS = ['src', 'pid', 'name', 'team', 'teamName', 'pos', 'height', 'age', 'nat', 'gp', 'mpg', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'tpg', 'fgm2', 'fga2', 'fgm3', 'fga3', 'ftm', 'fta', 'ts', 'usg', 'pir', 'orpg', 'drpg', 'crest'];
  function fromPool(row) {
    const o = Object.fromEntries(POOL_KEYS.map((k, i) => [k, row[i]]));
    return {
      id: o.src + ':' + o.pid, src: o.src, league: LEAGUE_NAME[o.src] || o.src, name: o.name, team: o.teamName, teamCode: o.team, crest: o.crest, pos: o.pos, height: o.height, age: o.age, nat: o.nat,
      stats: { season: CFG.seasonLabel || '', gp: o.gp, mpg: o.mpg, ppg: o.ppg, rpg: o.rpg, apg: o.apg, spg: o.spg, bpg: o.bpg, tpg: o.tpg, p2: pct(o.fgm2, o.fga2), p3: pct(o.fgm3, o.fga3), p3a: o.gp ? o.fga3 / o.gp : null, ft: pct(o.ftm, o.fta), ts: o.ts, usg: o.usg, pir: o.pir, orpg: o.orpg, drpg: o.drpg },
      official: true, season: LEAGUE_DIR[o.src] ? '2026-27' : null, href: o.src === 'EL' || LEAGUE_DIR[o.src] ? (LEAGUE_DIR[o.src] || '') + 'player-' + String(o.pid).replace(/[^A-Za-z0-9]/g, '') + '.html' : null
    };
  }
  function allPlayers() {
    const out = [];
    const recs = DB.players;
    for (const p of POOL) { const r = recs[p.id]; if (r?.deleted) { out.push({ ...p, rec: null }); continue; } out.push({ ...p, rec: r || null }); }
    for (const r of Object.values(recs)) if (!r.deleted && !POOL_BY.has(r.id)) out.push({ id: r.id, src: r.src || 'M', league: r.league || '', name: r.name, team: r.team || '', pos: r.pos || '', height: num(r.height), age: num(r.age), nat: r.nat || '', stats: r.stats || {}, official: false, rec: r });
    return out;
  }
  const recOf = (id) => DB.players[id] && !DB.players[id].deleted ? DB.players[id] : null;
  function touchRec(id, base) {
    let r = recOf(id);
    if (!r) { r = { id, notes: [], rating: 0, status: '', tags: [], links: [], ...(base || {}) }; DB.players[id] = r; }
    r.updatedAt = now(); markDirty(); return r;
  }
  const folders = () => Object.values(DB.folders).filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
  const foldersOf = (id) => folders().filter((f) => f.ids.includes(id));
  function addToFolder(fid, ids) { const f = DB.folders[fid]; if (!f) return; for (const id of ids) if (!f.ids.includes(id)) f.ids.push(id); f.updatedAt = now(); markDirty(); }

  // ---------- saving ----------
  let saveTimer = null;
  const status = el('span', { class: 'sc-status', role: 'status' });
  function markDirty() { dirty = true; paintStatus(); clearTimeout(saveTimer); if (getToken()) saveTimer = setTimeout(save, 2500); }
  function paintStatus(msg) {
    status.className = 'sc-status ' + (msg ? 'err' : saving ? 'saving' : dirty ? 'dirty' : 'ok');
    status.textContent = msg || (saving ? 'Saving…' : dirty ? (getToken() ? 'Unsaved changes — saving shortly' : 'Unsaved changes — connect this device to save') : SHA ? '✓ Saved for the whole staff' : 'Nothing saved yet');
  }
  async function save() {
    if (!dirty || saving) return;
    if (!getToken()) { paintStatus(); openConnect(); return; }
    saving = true; paintStatus();
    try {
      const remote = await readRemote();
      if (remote.sha && remote.sha !== SHA) DB = merge(DB, await decryptJson(KEY, remote.text));
      const text = await encryptJson(KEY, DB);
      SHA = await writeRemote(text, `Scouting update (${getWho() || 'staff'})`);
      dirty = false; saving = false; paintStatus(); render();
    } catch (err) { saving = false; paintStatus('Not saved: ' + err.message + '. Your changes are still here — try Save again.'); }
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- lock ----------
  function lock(note) {
    const pw = el('input', { type: 'password', id: 'sc-pw', autocomplete: 'current-password', required: true });
    const msg = el('p', { class: 'form-msg', role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'btn' }, 'Unlock');
    put(root, el('form', { class: 'lock card', onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.textContent = 'Checking…';
      try { const key = await deriveKey(pw.value); if (await open(key)) return; lock('Wrong password.'); return; }
      catch (err) { msg.textContent = 'Something went wrong: ' + err.message; }
      btn.disabled = false; btn.textContent = 'Unlock'; pw.select();
    } }, el('div', { class: 'lock-icon', 'aria-hidden': 'true' }), el('h2', {}, 'Staff only'), el('p', { class: 'muted' }, 'Enter the team password. Scouting notes are decrypted on this device only.'), el('label', { for: 'sc-pw' }, 'Team password'), pw, btn, msg));
    if (note) msg.textContent = note;
    pw.focus();
  }
  async function open(key) {
    put(root, el('p', { class: 'muted' }, 'Opening the scouting database…'));
    let remote;
    try { remote = await readRemote(); } catch (err) { put(root, el('div', { class: 'card' }, el('p', { class: 'form-msg' }, 'Could not load the scouting database: ' + err.message + '.'), el('button', { class: 'btn', onclick: () => open(key) }, 'Try again'))); return true; }
    if (remote.text) { try { DB = await decryptJson(key, remote.text); } catch { return false; } }
    else if (!(await keyMatchesInternal(key))) return false;
    KEY = key; SHA = remote.sha; await saveKey(key);
    try { const pool = await (await fetch('scouting-pool.json', { cache: 'no-store' })).json(); POOL = pool.players.map(fromPool); CFG.poolNote = pool.note; } catch { POOL = []; }
    POOL_BY = new Map(POOL.map((p) => [p.id, p]));
    DB.players ||= {}; DB.folders ||= {};
    shell(); return true;
  }

  // ---------- layout ----------
  const side = el('nav', { class: 'sc-side', 'aria-label': 'Scouting folders' });
  const main = el('div', { class: 'sc-main' });
  const drawer = el('aside', { class: 'sc-drawer', hidden: true, 'aria-label': 'Player' });
  const modal = el('div', { class: 'sc-modal', hidden: true, role: 'dialog', 'aria-modal': 'true' });
  function shell() {
    const who = el('input', { type: 'text', maxlength: '24', placeholder: 'Your name / initials', value: getWho(), 'aria-label': 'Your name or initials (shown on your notes)', onchange: (e) => setWho(e.target.value.trim()) });
    put(root, 
      el('div', { class: 'sc-top card' }, el('div', { class: 'sc-top-l' }, status, el('button', { type: 'button', class: 'btn', onclick: save }, 'Save now')),
        el('div', { class: 'sc-top-r' }, who, el('button', { type: 'button', class: 'btn ghost', onclick: () => openAdd() }, '+ Add player'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openImport() }, 'Import CSV / Excel'), el('button', { type: 'button', class: 'btn ghost', onclick: () => openConnect() }, getToken() ? '✓ Device connected' : 'Connect this device'))),
      el('div', { class: 'sc-layout' }, side, main), drawer, modal);
    paintStatus(); render();
  }
  function render() { renderSide(); renderMain(); if (S.open) renderDrawer(); }

  function renderSide() {
    const all = allPlayers();
    const scouted = all.filter((p) => p.rec && (p.rec.notes?.length || p.rec.rating || p.rec.status || foldersOf(p.id).length || !p.official)).length;
    const item = (view, folder, label, n, color) => el('button', { type: 'button', class: 'sc-f' + (S.view === view && S.folder === folder ? ' on' : ''), onclick: () => { S.view = view; S.folder = folder; S.sel.clear(); S.limit = 150; render(); } },
      el('span', { class: 'dot', style: color ? `background:${color}` : null }), el('span', { class: 'nm' }, label), el('span', { class: 'n' }, String(n)));
    const fs = folders();
    put(side, ...[
      el('h3', {}, 'Database'),
      item('all', null, 'All players', all.length), item('scouted', null, 'My scouted players', scouted),
      item('manual', null, 'Added / imported', all.filter((p) => !p.official).length),
      el('h3', {}, 'Folders'),
      fs.length ? fs.map((f) => item('folder', f.id, f.name, f.ids.filter((id) => all.some((p) => p.id === id)).length, f.color)) : el('p', { class: 'muted small' }, 'No folders yet.'),
      el('button', { type: 'button', class: 'btn ghost sc-newf', onclick: () => { const name = prompt('Folder name (e.g. “PG targets 2027”)'); if (!name?.trim()) return; const id = uid('F'); DB.folders[id] = { id, name: name.trim(), color: ['#d7182a', '#14161b', '#e8a317', '#2f6fdb', '#0f7a3a', '#7a3dd1'][fs.length % 6], ids: [], updatedAt: now() }; markDirty(); S.view = 'folder'; S.folder = id; render(); } }, '+ New folder'),
      el('p', { class: 'muted small sc-note' }, CFG.poolNote || '')].flat(Infinity).filter(Boolean));
  }

  const COLS = [['name', 'Player', 't'], ['league', 'League', 't'], ['team', 'Team', 't'], ['pos', 'Pos', 't'], ['age', 'Age', 'i'], ['height', 'Ht', 'i'], ['gp', 'GP', 'i'], ['mpg', 'MIN'], ['ppg', 'PTS'], ['rpg', 'REB'], ['apg', 'AST'], ['spg', 'STL'], ['bpg', 'BLK'], ['tpg', 'TOV'],
    ['p2', '2P%'], ['p3', '3P%'], ['p3a', '3PA'], ['ft', 'FT%'], ['ts', 'TS%'], ['pir', 'PIR'], ['rating', '★', 'i'], ['status', 'Status', 't']];
  const val = (p, k) => (['name', 'league', 'team', 'pos', 'age', 'height', 'nat'].includes(k) ? p[k] : k === 'rating' ? (p.rec?.rating || 0) : k === 'status' ? (p.rec?.status || '') : num(p.stats?.[k]));
  function filtered() {
    let list = allPlayers();
    if (S.view === 'scouted') list = list.filter((p) => p.rec && (p.rec.notes?.length || p.rec.rating || p.rec.status || foldersOf(p.id).length || !p.official));
    if (S.view === 'manual') list = list.filter((p) => !p.official);
    if (S.view === 'folder') { const f = DB.folders[S.folder]; const ids = new Set(f?.ids || []); list = list.filter((p) => ids.has(p.id)); }
    const q = S.q.toLowerCase();
    return list.filter((p) => (!q || (p.name + ' ' + p.team + ' ' + (p.nat || '') + ' ' + (p.rec?.tags || []).join(' ')).toLowerCase().includes(q))
      && (!S.league || p.league === S.league) && (!S.team || p.team === S.team) && (!S.pos || (p.pos || '').startsWith(S.pos))
      && (!S.ageMax || (p.age != null && p.age <= +S.ageMax)) && (!S.minGp || (num(p.stats?.gp) || 0) >= +S.minGp) && (!S.minMin || (num(p.stats?.mpg) || 0) >= +S.minMin)
      && (!S.status || (p.rec?.status || '') === S.status));
  }
  function renderMain() {
    const list = filtered();
    list.sort((a, b) => { const x = val(a, S.sort), y = val(b, S.sort); if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir; });
    const all = allPlayers();
    const opts = (k) => [...new Set(all.map((p) => p[k]).filter(Boolean))].sort();
    const f = S.view === 'folder' ? DB.folders[S.folder] : null;
    const title = f ? f.name : { all: 'All players', scouted: 'My scouted players', manual: 'Added and imported players' }[S.view];
    const set = (k) => (e) => { S[k] = e.target.value; S.limit = 150; renderMain(); };
    const fsel = (k, label, options) => el('label', {}, label, ' ', el('select', { onchange: set(k), 'aria-label': label }, options.map(([v, t]) => el('option', { value: v, selected: S[k] === v ? true : null }, t))));
    const search = el('input', { type: 'search', placeholder: 'Search name, team, country, tag…', value: S.q, 'aria-label': 'Search', oninput: (e) => { S.q = e.target.value; S.limit = 150; renderRows(); } });
    const bulkSel = el('select', { 'aria-label': 'Add selected players to folder' }, el('option', { value: '' }, 'Add selected to folder…'), folders().map((x) => el('option', { value: x.id }, x.name)));
    bulkSel.addEventListener('change', () => { if (!bulkSel.value || !S.sel.size) return; addToFolder(bulkSel.value, [...S.sel]); S.sel.clear(); render(); });
    const tbody = el('tbody');
    const more = el('div');
    function renderRows() {
      const L = filtered().sort((a, b) => { const x = val(a, S.sort), y = val(b, S.sort); if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir; });
      count.textContent = `${L.length} player${L.length === 1 ? '' : 's'}`;
      put(tbody, ...L.slice(0, S.limit).map((p) => el('tr', { class: S.open === p.id ? 'on' : null },
        el('td', {}, el('input', { type: 'checkbox', 'aria-label': 'Select ' + p.name, checked: S.sel.has(p.id), onchange: (e) => { e.target.checked ? S.sel.add(p.id) : S.sel.delete(p.id); } })),
        COLS.map(([k, , kind]) => {
          if (k === 'name') return el('td', { class: 'nm' }, el('button', { type: 'button', class: 'link', onclick: () => { S.open = p.id; renderDrawer(); renderRows(); } }, p.name), p.rec?.notes?.length ? el('span', { class: 'sc-nb', title: p.rec.notes.length + ' notes' }, String(p.rec.notes.length)) : null);
          if (k === 'team') return el('td', {}, p.crest ? el('img', { class: 'crest', src: p.crest, alt: '', width: '16', height: '16', loading: 'lazy' }) : null, ' ', p.team || '–');
          if (k === 'rating') return el('td', { class: 'num stars' }, p.rec?.rating ? '★'.repeat(p.rec.rating) : '');
          if (k === 'status') return el('td', {}, p.rec?.status ? el('span', { class: 'sc-st st-' + p.rec.status.toLowerCase() }, p.rec.status) : '');
          const v = val(p, k);
          return el('td', { class: kind === 't' ? null : 'num' }, kind === 't' ? (v || '–') : kind === 'i' ? (v == null ? '–' : String(Math.round(v))) : f1(v));
        }))));
      put(more, L.length > S.limit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { S.limit += 300; renderRows(); } }, `Show more (${L.length - S.limit} left)`) : '');
    }
    const count = el('span', { class: 'muted small' });
    const head = el('tr', {}, el('th', {}), COLS.map(([k, l, kind]) => el('th', { scope: 'col', class: kind === 't' ? null : 'num', 'aria-sort': S.sort === k ? (S.dir < 0 ? 'descending' : 'ascending') : null },
      el('button', { type: 'button', onclick: () => { if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = kind === 't' ? 1 : -1; } renderMain(); } }, l))));
    put(main, 
      el('div', { class: 'card sc-head' },
        el('div', { class: 'sc-title' }, el('h2', {}, title), f ? el('div', { class: 'row-btns' },
          el('button', { type: 'button', class: 'btn ghost', onclick: () => { const n = prompt('Rename folder', f.name); if (n?.trim()) { f.name = n.trim(); f.updatedAt = now(); markDirty(); render(); } } }, 'Rename'),
          el('button', { type: 'button', class: 'btn ghost', onclick: () => exportCsv(list, f.name) }, 'Export CSV'),
          el('button', { type: 'button', class: 'btn ghost', onclick: () => printFolder(list, f) }, 'Print / PDF'),
          el('button', { type: 'button', class: 'btn ghost danger', onclick: () => { if (!confirm(`Delete the folder “${f.name}”? The players and their notes stay in the database.`)) return; f.deleted = true; f.updatedAt = now(); markDirty(); S.view = 'all'; S.folder = null; render(); } }, 'Delete folder')) : el('button', { type: 'button', class: 'btn ghost', onclick: () => exportCsv(list, title) }, 'Export CSV')),
        el('div', { class: 'filters sc-filters' }, search,
          fsel('league', 'League', [['', 'All'], ...opts('league').map((x) => [x, x])]),
          fsel('team', 'Team', [['', 'All teams'], ...opts('team').map((x) => [x, x])]),
          fsel('pos', 'Position', [['', 'All'], ['G', 'Guard'], ['F', 'Forward'], ['C', 'Center']]),
          fsel('ageMax', 'Age', [['', 'Any'], ['21', '≤ 21'], ['23', '≤ 23'], ['25', '≤ 25'], ['28', '≤ 28'], ['31', '≤ 31']]),
          fsel('minGp', 'Games', [['', 'Any'], ['3', '3+'], ['5', '5+'], ['10', '10+']]),
          fsel('minMin', 'Minutes', [['', 'Any'], ['10', '10+'], ['15', '15+'], ['20', '20+'], ['25', '25+']]),
          fsel('status', 'Status', [['', 'Any'], ...STATUSES.filter(Boolean).map((x) => [x, x])])),
        el('div', { class: 'sc-bulk' }, count, bulkSel, f ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { if (!S.sel.size) return; f.ids = f.ids.filter((id) => !S.sel.has(id)); f.updatedAt = now(); S.sel.clear(); markDirty(); render(); } }, 'Remove selected from folder') : null)),
      el('div', { class: 'card' }, el('div', { class: 'scroll sc-scroll' }, el('table', { class: 'sc-table' }, el('thead', {}, head), tbody)), more,
        el('p', { class: 'muted small' }, 'Per game. EuroLeague and EuroCup stats are official and update every night; other players show the stats you added or imported. Click a name to open the player card.')));
    renderRows();
  }

  // ---------- player card ----------
  function renderDrawer() {
    const p = allPlayers().find((x) => x.id === S.open);
    if (!p) { drawer.hidden = true; return; }
    drawer.hidden = false;
    const r = p.rec;
    const s = p.stats || {};
    const stat = (l, v) => el('div', { class: 'sc-s' }, el('span', {}, l), el('b', {}, v));
    const statusSel = el('select', { 'aria-label': 'Status', onchange: (e) => { touchRec(p.id, p.official ? {} : null).status = e.target.value; render(); } }, STATUSES.map((x) => el('option', { value: x, selected: (r?.status || '') === x ? true : null }, x || '— status —')));
    const stars = el('div', { class: 'sc-stars', role: 'group', 'aria-label': 'Rating' }, [1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', 'aria-label': n + ' stars', class: (r?.rating || 0) >= n ? 'on' : null, onclick: () => { const rec = touchRec(p.id); rec.rating = rec.rating === n ? 0 : n; render(); } }, '★')));
    const noteBox = el('textarea', { rows: '4', placeholder: 'Write a scouting note… (strengths, weaknesses, fit, contract, agent, video timestamps)' });
    const tagIn = el('input', { type: 'text', placeholder: 'Add tag and press Enter (e.g. shooter, defender, EU passport)', onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const t = e.target.value.trim(); if (!t) return; const rec = touchRec(p.id); rec.tags = [...new Set([...(rec.tags || []), t])]; render(); } });
    const linkIn = el('input', { type: 'url', placeholder: 'Paste a video or profile link and press Enter', onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const u = safeUrl(e.target.value.trim()); if (!u) { alert('Please paste a full link starting with https://'); return; } const rec = touchRec(p.id); rec.links = [...(rec.links || []), u]; render(); } });
    put(drawer, 
      el('div', { class: 'sc-dh' }, el('div', {}, el('h2', {}, p.name), el('p', { class: 'muted' }, [p.team, p.league, p.pos, p.age ? p.age + ' yrs' : null, p.height ? p.height + ' cm' : null, p.nat].filter(Boolean).join(' · '))),
        el('button', { type: 'button', class: 'sc-x', 'aria-label': 'Close', onclick: () => { S.open = null; drawer.hidden = true; renderMain(); } }, '×')),
      p.href ? el('p', {}, el('a', { href: p.href }, 'Full HTA LAB player page →')) : null,
      el('div', { class: 'sc-row' }, statusSel, stars),
      el('h3', {}, `Stats${s.season ? ' · ' + s.season : ''}${p.official ? ' (official, per game)' : ''}`),
      el('div', { class: 'sc-stats' }, stat('GP', s.gp ?? '–'), stat('MIN', f1(s.mpg)), stat('PTS', f1(s.ppg)), stat('REB', f1(s.rpg)), stat('AST', f1(s.apg)), stat('STL', f1(s.spg)), stat('BLK', f1(s.bpg)), stat('TOV', f1(s.tpg)),
        stat('2P%', f1(s.p2)), stat('3P%', f1(s.p3)), stat('3PA', f1(s.p3a)), stat('FT%', f1(s.ft)), stat('TS%', f1(s.ts)), stat('USG%', f1(s.usg)), stat('PIR', f1(s.pir))),
      !p.official ? el('button', { type: 'button', class: 'btn ghost', onclick: () => openAdd(p) }, 'Edit details and stats') : null,
      el('h3', {}, 'Folders'),
      el('div', { class: 'sc-chips' }, folders().length ? folders().map((f) => el('label', { class: 'chip-check' }, el('input', { type: 'checkbox', checked: f.ids.includes(p.id), onchange: (e) => { if (e.target.checked) addToFolder(f.id, [p.id]); else { f.ids = f.ids.filter((x) => x !== p.id); f.updatedAt = now(); markDirty(); } if (!recOf(p.id) && p.official) touchRec(p.id); render(); } }), ' ', f.name)) : el('span', { class: 'muted small' }, 'Create a folder on the left first.')),
      el('h3', {}, 'Tags'), el('div', { class: 'sc-chips' }, (r?.tags || []).map((t) => el('span', { class: 'chip' }, t, el('button', { type: 'button', 'aria-label': 'Remove tag ' + t, onclick: () => { const rec = touchRec(p.id); rec.tags = rec.tags.filter((x) => x !== t); render(); } }, '×')))), tagIn,
      el('h3', {}, 'Video & links'), el('ul', { class: 'sc-links' }, (r?.links || []).map((u, i) => el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u.replace(/^https?:\/\//, '').slice(0, 60)), el('button', { type: 'button', 'aria-label': 'Remove link', onclick: () => { const rec = touchRec(p.id); rec.links = rec.links.filter((_, j) => j !== i); render(); } }, '×')))), linkIn,
      el('h3', {}, 'Scouting notes'), noteBox,
      el('button', { type: 'button', class: 'btn', onclick: () => { const t = noteBox.value.trim(); if (!t) return; const rec = touchRec(p.id, p.official ? null : null); rec.notes = [{ id: uid('N'), t: now(), by: getWho() || 'Staff', text: t }, ...(rec.notes || [])]; render(); } }, 'Add note'),
      el('ol', { class: 'sc-notes' }, (r?.notes || []).filter((n) => !n.deleted).map((n) => el('li', {}, el('div', { class: 'meta' }, el('strong', {}, n.by || 'Staff'), ' · ', new Date(n.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        el('button', { type: 'button', class: 'link small', onclick: () => { if (!confirm('Delete this note?')) return; n.deleted = true; touchRec(p.id); render(); } }, 'delete')), el('p', {}, n.text)))),
      !p.official ? el('button', { type: 'button', class: 'btn ghost danger', onclick: () => { if (!confirm(`Delete ${p.name} and all notes about him?`)) return; const rec = touchRec(p.id); rec.deleted = true; for (const f of folders()) f.ids = f.ids.filter((x) => x !== p.id); S.open = null; drawer.hidden = true; render(); } }, 'Delete player') : null);
  }

  // ---------- add / edit player ----------
  const FIELDS = [['name', 'Name *'], ['team', 'Team'], ['league', 'League'], ['nat', 'Nationality'], ['pos', 'Position (G / F / C or PG, SG…)'], ['age', 'Age'], ['height', 'Height (cm)']];
  const SFIELDS = [['season', 'Season'], ['gp', 'GP'], ['mpg', 'MIN'], ['ppg', 'PTS'], ['rpg', 'REB'], ['apg', 'AST'], ['spg', 'STL'], ['bpg', 'BLK'], ['tpg', 'TOV'], ['p2', '2P%'], ['p3', '3P%'], ['p3a', '3PA'], ['ft', 'FT%'], ['ts', 'TS%'], ['usg', 'USG%'], ['pir', 'PIR']];
  function openModal(...kids) { modal.hidden = false; put(modal, el('div', { class: 'sc-mbox card' }, el('button', { type: 'button', class: 'sc-x', 'aria-label': 'Close', onclick: () => { modal.hidden = true; } }, '×'), kids)); }
  function openAdd(p) {
    const r = p ? recOf(p.id) : null;
    const inputs = {};
    const field = ([k, l], v, small) => { inputs[k] = el('input', { type: 'text', value: v ?? '', id: 'sc-' + k }); return el('div', { class: small ? 'sc-fi sm' : 'sc-fi' }, el('label', { for: 'sc-' + k }, l), inputs[k]); };
    const msg = el('p', { class: 'form-msg', role: 'alert' });
    openModal(el('h2', {}, p ? 'Edit ' + p.name : 'Add a player'), el('p', { class: 'muted small' }, 'Any player in the world. Stats are per game; leave blank what you don’t know.'),
      el('div', { class: 'sc-grid' }, FIELDS.map((f) => field(f, r?.[f[0]]))),
      el('h3', {}, 'Stats (per game)'), el('div', { class: 'sc-grid sm' }, SFIELDS.map((f) => field(f, r?.stats?.[f[0]], true))), msg,
      el('button', { type: 'button', class: 'btn', onclick: () => {
        const name = inputs.name.value.trim(); if (!name) { msg.textContent = 'The name is required.'; return; }
        const id = p ? p.id : uid('M:');
        const rec = touchRec(id, { src: 'M' });
        for (const [k] of FIELDS) rec[k] = inputs[k].value.trim();
        rec.stats = Object.fromEntries(SFIELDS.map(([k]) => [k, k === 'season' ? inputs[k].value.trim() : num(inputs[k].value)]));
        if (!p && S.view === 'folder' && S.folder) addToFolder(S.folder, [id]);
        modal.hidden = true; S.open = id; render();
      } }, p ? 'Save changes' : 'Add player'));
    inputs.name.focus();
  }

  // ---------- import CSV / Excel ----------
  const SYN = {
    name: ['player', 'name', 'player name', 'full name', 'giocatore', 'jugador'], team: ['team', 'club', 'squadra', 'equipo'], league: ['league', 'competition', 'comp', 'lega', 'liga'],
    nat: ['nationality', 'nat', 'country', 'nazionalità'], pos: ['position', 'pos', 'role', 'ruolo'], age: ['age', 'età', 'edad'], height: ['height', 'ht', 'h', 'altezza', 'height (cm)'],
    season: ['season', 'year', 'stagione'], gp: ['gp', 'g', 'games', 'games played', 'pg', 'partite'], mpg: ['min', 'mpg', 'minutes', 'mins', 'min/g'], ppg: ['pts', 'ppg', 'points', 'punti'],
    rpg: ['reb', 'rpg', 'rebounds', 'tot reb', 'tr', 'rimbalzi'], apg: ['ast', 'apg', 'assists', 'as'], spg: ['stl', 'spg', 'steals', 'st'], bpg: ['blk', 'bpg', 'blocks', 'bs'],
    tpg: ['tov', 'to', 'turnovers', 'tpg'], p2: ['2p%', '2pt%', '2fg%', 'fg2%', '2p %'], p3: ['3p%', '3pt%', '3fg%', 'fg3%', '3p %'], p3a: ['3pa', '3pta', '3fga', '3p att'], ft: ['ft%', 'ft %', 'tl%'],
    ts: ['ts%', 'ts', 'true shooting'], usg: ['usg%', 'usg', 'usage'], pir: ['pir', 'val', 'eff', 'efficiency', 'index', 'valutazione']
  };
  const norm = (h) => String(h || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  function guessMap(headers) {
    const map = {};
    for (const [k, list] of Object.entries(SYN)) { const i = headers.findIndex((h) => list.includes(norm(h))); if (i >= 0) map[k] = i; }
    if (map.name == null) { const i = headers.findIndex((h) => /name|player/.test(norm(h))); if (i >= 0) map.name = i; }
    return map;
  }
  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const d = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === d) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  /** Minimal .xlsx reader (first sheet) using the browser's built-in decompression. */
  async function parseXlsx(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not an Excel (.xlsx) file');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const files = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, off }; p += 46 + nl + xl + cl;
    }
    const read = async (name) => {
      const f = files[name]; if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(ds).arrayBuffer());
    };
    const sheetName = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
    if (!sheetName) throw new Error('no sheet found in this Excel file');
    const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
    const ssText = await read('xl/sharedStrings.xml');
    const shared = ssText ? [...xml(ssText).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
    const sheet = xml(await read(sheetName));
    const col = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
    const rows = [];
    for (const r of sheet.getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        row[col(c.getAttribute('r') || 'A1')] = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent).join('') : v;
      }
      rows.push(Array.from(row, (x) => x ?? ''));
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  function openImport() {
    const file = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', id: 'sc-file' });
    const area = el('div');
    const msg = el('p', { class: 'form-msg', role: 'alert' });
    file.addEventListener('change', async () => {
      msg.textContent = ''; put(area, );
      const f = file.files[0]; if (!f) return;
      let rows;
      try { rows = /\.xlsx$/i.test(f.name) ? await parseXlsx(await f.arrayBuffer()) : parseCsv(await f.text()); }
      catch (err) { msg.textContent = 'Could not read this file: ' + err.message + '. Save it as CSV (File → Save as → CSV) and try again.'; return; }
      if (rows.length < 2) { msg.textContent = 'No rows found in this file.'; return; }
      // header row = first row with a name-like column
      let hi = rows.findIndex((r) => guessMap(r).name != null); if (hi < 0) hi = 0;
      const headers = rows[hi].map(String), data = rows.slice(hi + 1);
      const map = guessMap(headers);
      const keys = [...FIELDS, ...SFIELDS].map(([k, l]) => [k, l.replace(' *', '')]);
      const selects = Object.fromEntries(keys.map(([k]) => [k, el('select', { 'aria-label': k }, el('option', { value: '' }, '— not in file —'), headers.map((h, i) => el('option', { value: String(i), selected: map[k] === i ? true : null }, h || `Column ${i + 1}`)))]));
      const target = el('select', { 'aria-label': 'Folder' }, el('option', { value: '' }, 'No folder'), el('option', { value: '__new' }, 'New folder named after the file'), folders().map((x) => el('option', { value: x.id, selected: S.folder === x.id ? true : null }, x.name)));
      const leagueDefault = el('input', { type: 'text', placeholder: 'e.g. Lega Basket Serie A', 'aria-label': 'League for all rows' });
      const seasonDefault = el('input', { type: 'text', placeholder: 'e.g. 2026-27', 'aria-label': 'Season for all rows' });
      put(area, 
        el('p', {}, el('strong', {}, `${data.length} rows found.`), ' Check which column is which (we guessed from the headers):'),
        el('div', { class: 'sc-map' }, keys.map(([k, l]) => el('label', {}, l, selects[k]))),
        el('div', { class: 'sc-grid' }, el('div', { class: 'sc-fi' }, el('label', {}, 'League for rows without one'), leagueDefault), el('div', { class: 'sc-fi' }, el('label', {}, 'Season for rows without one'), seasonDefault), el('div', { class: 'sc-fi' }, el('label', {}, 'Put the players in'), target)),
        el('p', { class: 'muted small' }, 'Percentages can be 45.2, 45.2% or 0.452. Players already in the database with the same name and team are updated, not duplicated. Imported data is encrypted and visible only to the staff.'),
        el('button', { type: 'button', class: 'btn', onclick: () => {
          const m = Object.fromEntries(keys.map(([k]) => [k, selects[k].value === '' ? null : +selects[k].value]));
          if (m.name == null) { msg.textContent = 'Choose which column has the player names.'; return; }
          let fid = target.value;
          if (fid === '__new') { fid = uid('F'); DB.folders[fid] = { id: fid, name: f.name.replace(/\.[^.]+$/, ''), color: '#2f6fdb', ids: [], updatedAt: now() }; }
          const existing = new Map(Object.values(DB.players).filter((r) => !r.deleted && !POOL_BY.has(r.id)).map((r) => [(r.name + '|' + (r.team || '')).toLowerCase(), r.id]));
          const ids = []; let added = 0, updated = 0;
          for (const row of data) {
            const get = (k) => (m[k] == null ? '' : String(row[m[k]] ?? '').trim());
            const name = get('name'); if (!name) continue;
            const team = get('team');
            const key = (name + '|' + team).toLowerCase();
            const id = existing.get(key) || uid('M:');
            const rec = touchRec(id, { src: 'I' });
            existing.has(key) ? updated++ : added++; existing.set(key, id);
            rec.name = name; rec.team = team; rec.league = get('league') || leagueDefault.value.trim() || rec.league || ''; rec.nat = get('nat') || rec.nat || ''; rec.pos = get('pos') || rec.pos || ''; rec.age = get('age') || rec.age || ''; rec.height = get('height') || rec.height || '';
            const st = {};
            for (const [k] of SFIELDS) { if (k === 'season') { st.season = get('season') || seasonDefault.value.trim(); continue; } let v = num(get(k)); if (v != null && ['p2', 'p3', 'ft', 'ts', 'usg'].includes(k) && v > 0 && v <= 1) v = Math.round(v * 1000) / 10; st[k] = v; }
            rec.stats = st; ids.push(id);
          }
          if (fid) addToFolder(fid, ids);
          modal.hidden = true; S.view = fid ? 'folder' : 'manual'; S.folder = fid || null; render();
          alert(`Imported: ${added} new players, ${updated} updated.` + (getToken() ? ' Saving for the staff…' : ' Connect this device to save it for the staff.'));
        } }, 'Import players'));
    });
    openModal(el('h2', {}, 'Import players from CSV or Excel'), el('p', { class: 'muted' }, 'Use exports from TeamKeys or any tool your club subscribes to. One row per player. The file is read on this device and stored encrypted — never public.'),
      el('label', { for: 'sc-file' }, 'Choose a .csv or .xlsx file'), file, msg, area);
  }

  // ---------- export / print ----------
  function exportCsv(list, name) {
    const head = ['Name', 'League', 'Team', 'Position', 'Age', 'Height', 'Nationality', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV', '2P%', '3P%', '3PA', 'FT%', 'TS%', 'PIR', 'Rating', 'Status', 'Tags', 'Latest note'];
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const r1 = (v) => (v == null || !Number.isFinite(+v) ? '' : (+v).toFixed(1));
    const lines = [head.join(',')].concat(list.map((p) => { const s = p.stats || {}, r = p.rec || {}; return [p.name, p.league, p.team, p.pos, p.age, p.height, p.nat, s.gp, r1(s.mpg), r1(s.ppg), r1(s.rpg), r1(s.apg), r1(s.spg), r1(s.bpg), r1(s.tpg), r1(s.p2), r1(s.p3), r1(s.p3a), r1(s.ft), r1(s.ts), r1(s.pir), r.rating || '', r.status || '', (r.tags || []).join(' / '), (r.notes || []).filter((n) => !n.deleted)[0]?.text || ''].map(q).join(','); }));
    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: (name || 'scouting').replace(/[^\w\- ]+/g, '') + '.csv' });
    document.body.append(a); a.click(); a.remove();
  }
  function printFolder(list, f) {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups for this site to print the folder.'); return; }
    const d = w.document;
    d.title = f.name + ' — HTA LAB scouting';
    const st = d.createElement('style'); st.textContent = 'body{font:12px/1.4 system-ui,sans-serif;margin:16mm;color:#14161b}h1{font-size:22px;margin:0 0 4px;border-bottom:3px solid #d7182a;padding-bottom:6px}.p{break-inside:avoid;border-bottom:1px solid #ddd;padding:10px 0}.p h2{font-size:15px;margin:0}.m{color:#666}.s{margin:4px 0;font-variant-numeric:tabular-nums}.n{margin:4px 0 0 12px}@page{size:A4;margin:12mm}';
    d.head.append(st);
    const h = d.createElement('h1'); h.textContent = f.name + ' — ' + list.length + ' players'; d.body.append(h);
    for (const p of list) {
      const s = p.stats || {}, r = p.rec || {}, box = d.createElement('div'); box.className = 'p';
      const add = (tag, cls, text) => { const x = d.createElement(tag); if (cls) x.className = cls; x.textContent = text; box.append(x); };
      add('h2', '', p.name + (r.rating ? '  ' + '★'.repeat(r.rating) : '') + (r.status ? '  [' + r.status + ']' : ''));
      add('div', 'm', [p.team, p.league, p.pos, p.age ? p.age + ' yrs' : '', p.height ? p.height + ' cm' : '', p.nat].filter(Boolean).join(' · '));
      add('div', 's', `GP ${s.gp ?? '–'} · MIN ${f1(s.mpg)} · PTS ${f1(s.ppg)} · REB ${f1(s.rpg)} · AST ${f1(s.apg)} · STL ${f1(s.spg)} · BLK ${f1(s.bpg)} · TOV ${f1(s.tpg)} · 2P% ${f1(s.p2)} · 3P% ${f1(s.p3)} (${f1(s.p3a)} att) · FT% ${f1(s.ft)} · PIR ${f1(s.pir)}`);
      if (r.tags?.length) add('div', 'm', 'Tags: ' + r.tags.join(', '));
      for (const n of (r.notes || []).filter((x) => !x.deleted)) add('div', 'n', `${n.by || 'Staff'}, ${new Date(n.t).toLocaleDateString('en-GB')}: ${n.text}`);
      d.body.append(box);
    }
    w.setTimeout(() => w.print(), 300);
  }

  // ---------- connect device ----------
  function openConnect() {
    const input = el('input', { type: 'password', id: 'sc-token', autocomplete: 'off', placeholder: 'github_pat_…' });
    const msg = el('p', { class: 'form-msg', role: 'status' });
    openModal(el('h2', {}, 'Connect this device'), el('p', { class: 'muted' }, 'Needed once per device to save scouting changes for the whole staff. Viewing works without it.'),
      el('ol', {}, el('li', {}, 'On GitHub, signed in with access to hta-lab, open ', el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'new fine-grained key'), '.'),
        el('li', {}, el('strong', {}, 'Resource owner: hta-lab'), ' · Repository access: ', el('strong', {}, 'Only select repositories → hta-lab.github.io')),
        el('li', {}, el('strong', {}, 'Permissions → Contents → Read and write'), '. Generate, copy the key, paste it below.')),
      el('label', { for: 'sc-token' }, 'GitHub access key'), input,
      el('div', { class: 'row-btns' }, el('button', { type: 'button', class: 'btn', onclick: async () => {
        const t = input.value.trim(); if (!t) return; const old = getToken(); setToken(t); msg.textContent = 'Checking…';
        try { const r = await gh(''); if (r.permissions && r.permissions.push === false) throw new Error('this key is read-only (Contents must be “Read and write”, for hta-lab.github.io)'); msg.textContent = '✓ Connected.'; input.value = ''; modal.hidden = true; shell(); if (dirty) save(); }
        catch (err) { setToken(old); msg.textContent = 'Not connected: ' + err.message + '.'; }
      } }, 'Connect'), getToken() ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { setToken(''); modal.hidden = true; shell(); } }, 'Disconnect this device') : null), msg);
    input.focus();
  }

  // ---------- start ----------
  (async () => { const k = await loadKey(); if (k && await open(k)) return; lock(); })();
})();
