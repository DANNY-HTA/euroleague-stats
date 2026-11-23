// HAPOEL – INTERNAL
// Documents are encrypted in the browser (AES-GCM 256, key from the team password with
// PBKDF2-SHA256) before they leave the device, and decrypted in the browser after the
// password is typed. Large files are split into encrypted 8 MB parts.
//
// Stored files:  <id>.enc      encrypted description (title, category, notes, file info)
//                <id>-<n>.part encrypted pieces of the attached file (12-byte IV + ciphertext)
(function () {
  'use strict';
  const CFG = window.HTA_INTERNAL || {};
  const root = document.getElementById('internal-app');
  if (!root || !window.crypto?.subtle) {
    if (root) root.textContent = 'This browser cannot open the internal section. Please use an up-to-date Chrome, Safari, Edge or Firefox.';
    return;
  }
  const PART = 8 * 1024 * 1024, MAX_FILE = 60 * 1024 * 1024, MIN_PW = 8;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  const b64 = (bytes) => { let s = ''; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const mb = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const SESSION = 'hta-internal-key', TOKEN = 'hta-github-token';

  // ---------- crypto ----------
  async function deriveKey(password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(CFG.salt), iterations: CFG.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptJson(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    return JSON.stringify({ v: 2, iv: b64(iv), ct: b64(ct) });
  }
  async function decryptJson(key, text) {
    const o = JSON.parse(text);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function encryptPart(key, id, n, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${id}:${n}`) }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
  }
  async function decryptPart(key, id, n, buf) {
    const b = new Uint8Array(buf);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: enc.encode(`${id}:${n}`) }, key, b.subarray(12)));
  }

  // ---------- storage helpers ----------
  async function listFiles() { try { const r = await fetch('internal/index.json', { cache: 'no-store' }); return r.ok ? await r.json() : []; } catch { return []; } }
  async function fetchText(name) { const r = await fetch('internal/' + encodeURIComponent(name), { cache: 'no-store' }); if (!r.ok) throw new Error('missing'); return r.text(); }
  async function fetchBuf(name) { const r = await fetch('internal/' + encodeURIComponent(name), { cache: 'no-store' }); if (!r.ok) throw new Error('missing ' + name); return r.arrayBuffer(); }
  async function saveKey(key) { try { sessionStorage.setItem(SESSION, b64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))); } catch { /* private mode */ } }
  async function loadKey() { try { const raw = sessionStorage.getItem(SESSION); return raw ? crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']) : null; } catch { return null; } }
  const forget = () => { try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ } };
  const getToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch { /* ignore */ } };
  async function checkKey(key, files) { if (!files.length) return true; try { await decryptJson(key, await fetchText(files[0])); return true; } catch { return false; } }

  // ---------- GitHub upload (one commit with all files) ----------
  async function gh(path, opts = {}) {
    const r = await fetch('https://api.github.com/repos/' + CFG.repo + path, {
      ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + getToken(), 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    if (!r.ok) {
      const why = r.status === 401 ? 'the GitHub key is wrong or expired' : r.status === 403 || r.status === 404 ? 'the GitHub key has no permission to write to the site (it needs Contents: Read and write on ' + CFG.repo + ')' : 'GitHub answered ' + r.status;
      throw new Error(why);
    }
    return r.status === 204 ? null : r.json();
  }
  async function uploadFiles(files, message, progress) {
    const ref = await gh('/git/ref/heads/main');
    const head = await gh('/git/commits/' + ref.object.sha);
    const tree = [];
    for (let i = 0; i < files.length; i++) {
      progress(`Uploading ${i + 1} of ${files.length}…`);
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(files[i].bytes), encoding: 'base64' }) });
      tree.push({ path: 'internal/' + files[i].name, mode: '100644', type: 'blob', sha: blob.sha });
    }
    progress('Saving…');
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  }

  // ---------- lock screen ----------
  function lockScreen(onKey, { confirm = false, note = '' } = {}) {
    const pw = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
    const pw2 = confirm ? el('input', { type: 'password', id: 'pw2', autocomplete: 'new-password', required: true }) : null;
    const msg = el('p', { class: 'form-msg', role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'btn' }, 'Unlock');
    const form = el('form', { class: 'lock card', onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = '';
      if (pw.value.length < MIN_PW) { msg.textContent = `The team password is at least ${MIN_PW} characters.`; return; }
      if (pw2 && pw.value !== pw2.value) { msg.textContent = 'The two passwords are different.'; return; }
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const ok = await onKey(await deriveKey(pw.value));
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

  // ---------- documents ----------
  async function vault() {
    const files = await listFiles();
    const open = async (key) => { if (!(await checkKey(key, files))) return false; await saveKey(key); showDocs(key, files); return true; };
    const k = await loadKey();
    if (k && await open(k)) return;
    forget(); lockScreen(open);
  }

  /** Unlocks an attached file and returns a local link to it (no pop-ups: browsers block those after a wait). */
  async function unlockFile(key, d, status) {
    let parts;
    if (d.data) parts = [unb64(d.data)];
    else {
      parts = [];
      for (let n = 1; n <= d.parts; n++) { status(`Opening… ${n} of ${d.parts}`); parts.push(await decryptPart(key, d.id, n, await fetchBuf(`${d.id}-${n}.part`))); }
    }
    return URL.createObjectURL(new Blob(parts, { type: d.mime || 'application/octet-stream' }));
  }

  async function showDocs(key, files) {
    root.replaceChildren(el('p', { class: 'muted' }, 'Unlocking documents…'));
    const docs = [];
    for (const f of files) { try { const d = await decryptJson(key, await fetchText(f)); d._file = f; docs.push(d); } catch { /* other password or damaged */ } }
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
      const btn = el('button', { type: 'button', class: 'btn ghost' }, d.kind === 'file' ? 'Open file' : 'Read');
      btn.addEventListener('click', async () => {
        if (d.kind !== 'file') { showDoc(d, null); return; }
        const label = btn.textContent; btn.disabled = true;
        try { showDoc(d, await unlockFile(key, d, (t) => { btn.textContent = t; })); }
        catch (err) { alertBox('Could not open the file: ' + err.message); }
        btn.disabled = false; btn.textContent = label;
      });
      return el('article', { class: 'doc' },
        el('div', { class: 'doc-top' }, el('span', { class: 'chip hot' }, d.category || 'Document'), el('span', { class: 'muted small' }, d.date || '')),
        el('h3', {}, d.title || 'Untitled'),
        el('p', { class: 'muted small' }, [d.opponent ? 'Opponent: ' + d.opponent : '', d.author ? 'By ' + d.author : '', d.fileName ? `${d.fileName}${d.size ? ' · ' + mb(d.size) : ''}` : 'Note'].filter(Boolean).join(' · ')),
        btn);
    }
    function alertBox(t) { viewer.hidden = false; viewer.replaceChildren(el('p', { class: 'form-msg' }, t)); }
    let lastUrl = null;
    function showDoc(d, url) {
      if (lastUrl && lastUrl !== url) URL.revokeObjectURL(lastUrl);
      lastUrl = url;
      const mime = d.mime || '';
      let preview = null;
      if (url && mime === 'application/pdf') preview = el('iframe', { class: 'pdf-frame', src: url, title: d.title || 'Document' });
      else if (url && mime.startsWith('image/')) preview = el('img', { class: 'img-frame', src: url, alt: d.title || '' });
      else if (url && mime.startsWith('video/')) preview = el('video', { class: 'img-frame', src: url, controls: true });
      viewer.hidden = false;
      viewer.replaceChildren(...[
        el('div', { class: 'viewer-head' },
          el('div', {}, el('span', { class: 'chip hot' }, d.category || 'Document'), el('h2', {}, d.title || 'Untitled'),
            el('p', { class: 'muted' }, [d.date, d.opponent && 'Opponent: ' + d.opponent, d.author && 'By ' + d.author].filter(Boolean).join(' · '))),
          el('div', { class: 'row-btns' },
            url ? el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Open in new tab') : null,
            url ? el('a', { class: 'btn ghost', href: url, download: d.fileName || 'document' }, 'Download') : null,
            el('button', { type: 'button', class: 'btn ghost', onclick: () => { viewer.hidden = true; } }, 'Close'))),
        d.text ? el('div', { class: 'viewer-body' }, d.text) : null,
        preview,
        url && !preview ? el('p', { class: 'muted' }, 'This file type can’t be shown in the page. Use Download to open it.') : null].filter(Boolean));
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

  // ---------- adding documents ----------
  async function upload() {
    const files = await listFiles();
    const go = async (key) => { if (!(await checkKey(key, files))) return false; await saveKey(key); uploadForm(key); return true; };
    const k = await loadKey();
    if (k && await go(k)) return;
    forget();
    lockScreen(go, files.length ? {} : { confirm: true, note: 'No documents yet, so this sets the team password. Everyone on the staff will use the same password.' });
  }

  function tokenPanel(onDone) {
    const input = el('input', { type: 'password', id: 'gh-token', autocomplete: 'off', placeholder: 'github_pat_…' });
    const msg = el('p', { class: 'form-msg', role: 'status' });
    return el('details', { class: 'card gh', open: !getToken() },
      el('summary', {}, getToken() ? '✓ This device can upload directly. Change or disconnect' : 'Connect this device for one-click upload (once per device)'),
      el('ol', {},
        el('li', {}, 'Sign in to GitHub as a staff member with access to the site, then ', el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'create a fine-grained access key'), '.'),
        el('li', {}, `Name: “HTA LAB upload”. Repository access: Only select repositories → ${String(CFG.repo).split('/')[1]}.`),
        el('li', {}, 'Permissions → Repository permissions → Contents: Read and write. Then Generate token and copy it.'),
        el('li', {}, 'Paste it below. It is saved in this browser only.')),
      el('label', { for: 'gh-token' }, 'GitHub access key'), input,
      el('div', { class: 'row-btns' },
        el('button', { type: 'button', class: 'btn', onclick: async () => {
          const t = input.value.trim(); if (!t) return;
          setToken(t); msg.textContent = 'Checking…';
          try { const r = await gh(''); if (!r.permissions?.push) throw new Error('this key cannot write to the site'); msg.textContent = '✓ Connected. You can now upload with one click.'; input.value = ''; onDone(); }
          catch (err) { setToken(''); msg.textContent = 'Not connected: ' + err.message + '.'; }
        } }, 'Connect'),
        getToken() ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { setToken(''); onDone(); } }, 'Disconnect this device') : null),
      msg);
  }

  function uploadForm(key) {
    const today = new Date().toISOString().slice(0, 10);
    const f = {
      category: el('select', { id: 'u-cat' }, (CFG.categories || ['Other']).map((c) => el('option', { value: c }, c))),
      title: el('input', { id: 'u-title', maxlength: '140' }),
      opponent: el('input', { id: 'u-opp', maxlength: '80', list: 'u-teams' }),
      author: el('input', { id: 'u-author', maxlength: '80' }),
      date: el('input', { id: 'u-date', type: 'date', value: today }),
      text: el('textarea', { id: 'u-text', rows: '8', placeholder: 'Write notes here, or attach a file above (or both).' }),
      file: el('input', { id: 'u-file', type: 'file' })
    };
    f.category.value = 'Scouting report';
    f.file.addEventListener('change', () => {
      const file = f.file.files[0];
      if (file && !f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+-\s+/g, ' – ');
    });
    const teams = el('datalist', { id: 'u-teams' }, (CFG.teams || []).map((t) => el('option', { value: t })));
    const msg = el('div', { class: 'form-msg', role: 'status' });
    const field = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id }, label), input, hint ? el('span', { class: 'muted small' }, hint) : null);
    const connected = !!getToken();
    const upBtn = el('button', { type: 'submit', class: 'btn', value: 'upload', disabled: !connected }, connected ? '⬆ Upload' : '⬆ Upload (connect this device first)');
    const dlBtn = el('button', { type: 'submit', class: 'btn ghost', value: 'download' }, 'Lock and download instead');

    async function build() {
      const file = f.file.files[0];
      if (!f.title.value.trim()) throw new Error('Add a title.');
      if (!f.text.value.trim() && !file) throw new Error('Write a note or attach a file.');
      if (file && file.size > MAX_FILE) throw new Error(`That file is ${mb(file.size)}. The limit is ${mb(MAX_FILE)}: please compress it or split it.`);
      const id = `${f.date.value || today}-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
      const meta = { v: 2, id, kind: file ? 'file' : 'note', title: f.title.value.trim(), category: f.category.value, opponent: f.opponent.value.trim(), author: f.author.value.trim(), date: f.date.value || today, text: f.text.value, created: new Date().toISOString() };
      const out = [];
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        meta.fileName = file.name; meta.mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : ''); meta.size = file.size; meta.parts = Math.max(1, Math.ceil(bytes.length / PART));
        for (let n = 1; n <= meta.parts; n++) {
          msg.textContent = `Locking… ${n} of ${meta.parts}`;
          out.push({ name: `${id}-${n}.part`, bytes: await encryptPart(key, id, n, bytes.subarray((n - 1) * PART, n * PART)) });
        }
      }
      out.unshift({ name: `${id}.enc`, bytes: enc.encode(await encryptJson(key, meta)) });
      return { meta, out };
    }

    const form = el('form', { class: 'card upload', onsubmit: async (e) => {
      e.preventDefault(); msg.replaceChildren();
      const how = e.submitter?.value || 'upload';
      upBtn.disabled = true; dlBtn.disabled = true;
      try {
        const { meta, out } = await build();
        if (how === 'upload') {
          await uploadFiles(out, `Internal: add locked document (${meta.category})`, (t) => { msg.textContent = t; });
          msg.replaceChildren(el('div', { class: 'done' }, el('h3', {}, '✓ Uploaded'),
            el('p', {}, `“${meta.title}” is locked and saved. It appears in the internal section in about 3 minutes.`),
            el('div', { class: 'row-btns' }, el('a', { class: 'btn', href: 'internal.html' }, 'Back to documents'))));
        } else {
          for (const o of out) {
            const url = URL.createObjectURL(new Blob([o.bytes], { type: 'application/octet-stream' }));
            const a = el('a', { href: url, download: o.name }); document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          }
          msg.replaceChildren(el('div', { class: 'done' }, el('h3', {}, `✓ Locked: ${out.length} file${out.length > 1 ? 's' : ''} downloaded`),
            el('ol', {}, el('li', {}, 'Open the upload folder on GitHub (button below).'), el('li', {}, `Drag all ${out.length} downloaded file${out.length > 1 ? 's' : ''} onto the page.`), el('li', {}, 'Click “Commit changes”. It appears in about 3 minutes.')),
            el('a', { class: 'btn', href: CFG.uploadUrl, target: '_blank', rel: 'noopener' }, 'Open upload folder on GitHub →'),
            el('p', { class: 'muted small' }, 'Only upload the locked .enc and .part files, never the original: the GitHub folder is public.')));
        }
        form.reset(); f.date.value = today; f.category.value = 'Scouting report';
      } catch (err) { msg.textContent = err.message; }
      upBtn.disabled = !getToken(); dlBtn.disabled = false;
    } },
    el('h2', {}, 'Add a document'),
    el('p', { class: 'muted' }, 'Your document is locked with the team password here in the browser. Only the locked file leaves this device.'),
    field('u-file', 'File (optional)', f.file, `PDF, image, Word, Excel, PowerPoint or video, up to ${mb(MAX_FILE)}.`),
    el('div', { class: 'grid2' }, field('u-cat', 'Category', f.category), field('u-date', 'Date', f.date)),
    field('u-title', 'Title', f.title),
    el('div', { class: 'grid2' }, field('u-opp', 'Opponent (optional)', f.opponent), field('u-author', 'Author (optional)', f.author)),
    teams,
    field('u-text', 'Notes (optional)', f.text),
    el('div', { class: 'row-btns' }, upBtn, dlBtn, el('a', { class: 'btn ghost', href: 'internal.html' }, 'Back to documents')),
    msg);
    root.replaceChildren(tokenPanel(() => uploadForm(key)), form);
  }

  (root.dataset.mode === 'upload' ? upload : vault)().catch((err) => { root.textContent = 'Could not load the internal section: ' + err.message; });
})();
