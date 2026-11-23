// HAPOEL – INTERNAL
// Documents are encrypted in the browser (AES-GCM 256, key from the team password
// with PBKDF2-SHA256) before they are uploaded, and decrypted in the browser after
// the password is typed. The password and the unlocked documents never leave the device.
(function () {
  'use strict';
  const CFG = window.HTA_INTERNAL || {};
  const root = document.getElementById('internal-app');
  if (!root || !window.crypto?.subtle) {
    if (root) root.textContent = 'This browser cannot open the internal section. Please use an up-to-date Chrome, Safari, Edge or Firefox.';
    return;
  }
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  const b64 = (bytes) => { let s = ''; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const SESSION = 'hta-internal-key';

  async function deriveKey(password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(CFG.salt), iterations: CFG.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptDoc(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
  }
  async function decryptDoc(key, text) {
    const o = JSON.parse(text);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function listFiles() {
    try { const r = await fetch('internal/index.json', { cache: 'no-store' }); return r.ok ? await r.json() : []; } catch { return []; }
  }
  async function fetchText(name) { const r = await fetch('internal/' + encodeURIComponent(name), { cache: 'no-store' }); if (!r.ok) throw new Error('missing'); return r.text(); }
  async function saveKey(key) { try { sessionStorage.setItem(SESSION, b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))); } catch { /* private mode */ } }
  async function loadKey() {
    try { const raw = sessionStorage.getItem(SESSION); return raw ? crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']) : null; } catch { return null; }
  }
  const forget = () => { try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ } };

  /** Checks a key against the existing documents. true = right password (or no documents yet). */
  async function checkKey(key, files) {
    if (!files.length) return true;
    try { await decryptDoc(key, await fetchText(files[0])); return true; } catch { return false; }
  }

  function lockScreen(onKey, { confirm = false, note = '' } = {}) {
    const pw = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, minlength: '12' });
    const pw2 = confirm ? el('input', { type: 'password', id: 'pw2', autocomplete: 'new-password', required: true }) : null;
    const msg = el('p', { class: 'form-msg', role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'btn' }, 'Unlock');
    const form = el('form', { class: 'lock card', onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = '';
      if (pw.value.length < 12) { msg.textContent = 'The team password is at least 12 characters.'; return; }
      if (pw2 && pw.value !== pw2.value) { msg.textContent = 'The two passwords are different.'; return; }
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const key = await deriveKey(pw.value);
        const ok = await onKey(key);
        if (!ok) { msg.textContent = 'Wrong password.'; btn.disabled = false; btn.textContent = 'Unlock'; pw.select(); }
      } catch (err) { msg.textContent = 'Something went wrong: ' + err.message; btn.disabled = false; btn.textContent = 'Unlock'; }
    } },
    el('div', { class: 'lock-icon', 'aria-hidden': 'true' }),
    el('h2', {}, 'Staff only'),
    el('p', { class: 'muted' }, note || 'Enter the team password. Documents are unlocked on this device only.'),
    el('label', { for: 'pw' }, 'Team password'), pw,
    pw2 ? el('label', { for: 'pw2' }, 'Type it again') : null, pw2,
    btn, msg);
    root.replaceChildren(form);
    pw.focus();
  }

  // ---------------- Vault (reading) ----------------
  async function vault() {
    const files = await listFiles();
    const open = async (key) => {
      if (!(await checkKey(key, files))) return false;
      await saveKey(key);
      showDocs(key, files);
      return true;
    };
    const k = await loadKey();
    if (k && await open(k)) return;
    forget();
    lockScreen(open);
  }

  async function showDocs(key, files) {
    root.replaceChildren(el('p', { class: 'muted' }, 'Unlocking documents…'));
    const docs = [];
    for (const f of files) {
      try { const d = await decryptDoc(key, await fetchText(f)); d._file = f; docs.push(d); } catch { /* other password or damaged: skip */ }
    }
    docs.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)));
    let cat = '', q = '';
    const list = el('div', { class: 'docs' });
    const cats = ['All', ...new Set(docs.map((d) => d.category).filter(Boolean))];
    const chips = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Category' }, cats.map((c) => el('button', { type: 'button', 'aria-pressed': c === 'All' ? 'true' : 'false', onclick: (e) => {
      cat = c === 'All' ? '' : c; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); render();
    } }, c)));
    const search = el('input', { type: 'search', placeholder: 'Search titles, opponents, notes…', 'aria-label': 'Search documents', oninput: (e) => { q = e.target.value.toLowerCase(); render(); } });
    const viewer = el('div', { class: 'viewer', hidden: true });

    function render() {
      const shown = docs.filter((d) => (!cat || d.category === cat) && (!q || [d.title, d.opponent, d.author, d.category, d.text, d.fileName].join(' ').toLowerCase().includes(q)));
      list.replaceChildren(...(shown.length ? shown.map(card) : [el('p', { class: 'muted' }, docs.length ? 'Nothing matches.' : 'No documents yet. Use “Add document” to add the first one.')]));
    }
    function card(d) {
      return el('article', { class: 'doc' },
        el('div', { class: 'doc-top' }, el('span', { class: 'chip hot' }, d.category || 'Document'), el('span', { class: 'muted small' }, d.date || '')),
        el('h3', {}, d.title || 'Untitled'),
        el('p', { class: 'muted small' }, [d.opponent ? 'Opponent: ' + d.opponent : '', d.author ? 'By ' + d.author : '', d.fileName ? d.fileName : 'Note'].filter(Boolean).join(' · ')),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => openDoc(d) }, d.kind === 'file' ? 'Open file' : 'Read'));
    }
    function openDoc(d) {
      if (d.kind === 'file') {
        const blob = new Blob([unb64(d.data)], { type: d.mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        if (/^(application\/pdf|image\/|text\/plain|video\/)/.test(d.mime || '')) window.open(url, '_blank', 'noopener');
        else { const a = el('a', { href: url, download: d.fileName || 'document' }); document.body.append(a); a.click(); a.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (!d.text) return;
      }
      viewer.hidden = false;
      viewer.replaceChildren(
        el('div', { class: 'viewer-head' }, el('div', {}, el('span', { class: 'chip hot' }, d.category || 'Document'), el('h2', {}, d.title || 'Untitled'), el('p', { class: 'muted' }, [d.date, d.opponent && 'Opponent: ' + d.opponent, d.author && 'By ' + d.author].filter(Boolean).join(' · '))),
          el('button', { type: 'button', class: 'btn ghost', onclick: () => { viewer.hidden = true; } }, 'Close')),
        el('div', { class: 'viewer-body' }, d.text || ''));
      viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    root.replaceChildren(
      el('div', { class: 'vault-bar' }, chips, el('div', { class: 'vault-actions' }, search,
        el('a', { class: 'btn', href: 'internal-upload.html' }, '+ Add document'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { forget(); location.reload(); } }, 'Lock'))),
      el('p', { class: 'muted small' }, `${docs.length} document${docs.length === 1 ? '' : 's'} unlocked on this device.` + (files.length > docs.length ? ` ${files.length - docs.length} could not be opened with this password.` : '')),
      viewer, list);
    render();
  }

  // ---------------- Upload (encrypting) ----------------
  async function upload() {
    const files = await listFiles();
    const go = async (key) => { if (!(await checkKey(key, files))) return false; await saveKey(key); uploadForm(key); return true; };
    const k = await loadKey();
    if (k && await go(k)) return;
    forget();
    lockScreen(go, files.length ? {} : { confirm: true, note: 'No documents yet, so this sets the team password. Use a long passphrase of at least 12 characters, for example four random words and a number. Everyone on the staff will use the same password.' });
  }

  function uploadForm(key) {
    const today = new Date().toISOString().slice(0, 10);
    const f = {
      category: el('select', { id: 'u-cat' }, (CFG.categories || ['Other']).map((c) => el('option', { value: c }, c))),
      title: el('input', { id: 'u-title', required: true, maxlength: '140' }),
      opponent: el('input', { id: 'u-opp', maxlength: '80', list: 'u-teams' }),
      author: el('input', { id: 'u-author', maxlength: '80' }),
      date: el('input', { id: 'u-date', type: 'date', value: today }),
      text: el('textarea', { id: 'u-text', rows: '10', placeholder: 'Write notes here, or attach a file below (or both).' }),
      file: el('input', { id: 'u-file', type: 'file' })
    };
    const teams = el('datalist', { id: 'u-teams' }, (CFG.teams || []).map((t) => el('option', { value: t })));
    const msg = el('div', { class: 'form-msg', role: 'status' });
    const field = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id }, label), input, hint ? el('span', { class: 'muted small' }, hint) : null);
    const form = el('form', { class: 'card upload', onsubmit: async (e) => {
      e.preventDefault(); msg.replaceChildren();
      const file = f.file.files[0];
      if (!f.text.value.trim() && !file) { msg.textContent = 'Write a note or attach a file.'; return; }
      if (file && file.size > 18 * 1024 * 1024) { msg.textContent = 'That file is over 18 MB. Please compress it or split it.'; return; }
      const payload = { v: 1, kind: file ? 'file' : 'note', title: f.title.value.trim(), category: f.category.value, opponent: f.opponent.value.trim(), author: f.author.value.trim(), date: f.date.value || today, text: f.text.value, created: new Date().toISOString() };
      if (file) { payload.fileName = file.name; payload.mime = file.type; payload.data = b64(new Uint8Array(await file.arrayBuffer())); }
      const out = await encryptDoc(key, payload);
      const name = `${payload.date}-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}.enc`;
      const url = URL.createObjectURL(new Blob([out], { type: 'application/octet-stream' }));
      const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      msg.replaceChildren(el('div', { class: 'done' },
        el('h3', {}, '✓ Locked and downloaded'),
        el('p', {}, `Your browser saved the locked file `, el('strong', {}, name), ` (usually in Downloads). It can only be opened with the team password.`),
        el('ol', {}, el('li', {}, 'Open the upload folder on GitHub (button below).'), el('li', {}, 'Drag the .enc file onto the page.'), el('li', {}, 'Click “Commit changes”. It appears in the internal section in about 3 minutes.')),
        el('a', { class: 'btn', href: CFG.uploadUrl, target: '_blank', rel: 'noopener' }, 'Open upload folder on GitHub →'),
        el('p', { class: 'muted small' }, 'Only ever upload .enc files. Never upload the original document: the GitHub folder is public.')));
      form.reset(); f.date.value = today;
    } },
    el('h2', {}, 'Add a document'),
    el('p', { class: 'muted' }, 'Your document is locked with the team password here in the browser. Only the locked file is uploaded.'),
    el('div', { class: 'grid2' }, field('u-cat', 'Category', f.category), field('u-date', 'Date', f.date)),
    field('u-title', 'Title', f.title),
    el('div', { class: 'grid2' }, field('u-opp', 'Opponent (optional)', f.opponent), field('u-author', 'Author (optional)', f.author)),
    teams,
    field('u-text', 'Notes', f.text),
    field('u-file', 'Attach a file (optional)', f.file, 'PDF, image, Word, Excel, PowerPoint or video clip, up to 18 MB.'),
    el('div', { class: 'row-btns' }, el('button', { type: 'submit', class: 'btn' }, 'Lock and download'), el('a', { class: 'btn ghost', href: 'internal.html' }, 'Back to documents')),
    msg);
    root.replaceChildren(form);
  }

  (root.dataset.mode === 'upload' ? upload : vault)().catch((err) => { root.textContent = 'Could not load the internal section: ' + err.message; });
})();
