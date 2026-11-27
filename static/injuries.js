// Injury report: staff marks (out / doubtful / available + note), saved encrypted through HTAStaff (staff.js).
(function () {
  'use strict';
  const S = window.HTAStaff; const host = document.getElementById('inj-staff'); if (!S || !host) return;
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  let POOL = []; try { POOL = JSON.parse(document.getElementById('inj-pool').textContent); } catch { /* none */ }
  const byKey = new Map(POOL.map((r) => [r[0], r]));
  const msg = el('p', { class: 'small', role: 'status' });
  async function setMark(key, name, team, status, note) {
    msg.textContent = 'Saving…';
    try {
      await S.save((plan) => { if (status) plan.avail[key] = { name, team, status, note: note || '', updatedAt: new Date().toISOString() }; else plan.avail[key] = { name, team, status: 'cleared', note: '', updatedAt: new Date().toISOString() }; }, `Availability: ${name} ${status || 'cleared'}`);
      msg.textContent = 'Saved. Everyone on the staff sees it the next time they open a page.';
    } catch (e) { msg.textContent = 'Not saved: ' + e.message; }
  }
  function statusSelect(cur, onPick) {
    const s = el('select', { 'aria-label': 'Staff mark', onchange: () => onPick(s.value) }, [['', '–'], ['out', 'Out'], ['doubt', 'Doubtful'], ['ok', 'Available']].map(([v, l]) => el('option', { value: v, selected: v === (cur || '') }, l)));
    return s;
  }
  function render(plan) {
    const av = plan.avail || {};
    const active = Object.entries(av).filter(([, v]) => v.status === 'out' || v.status === 'doubt' || v.status === 'ok').sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''));
    const name = el('input', { list: 'inj-names', placeholder: 'Player name', autocomplete: 'off' }), st = statusSelect('out', () => {}), note = el('input', { placeholder: 'Note (e.g. ankle, back next week)', maxlength: 140 });
    const add = el('form', { class: 'inj-add', onsubmit: (e) => { e.preventDefault(); const typed = name.value.trim(); if (!typed) return; const k = S.pkey(typed), r = byKey.get(k); setMark(k, r ? r[1] : typed, r ? r[3] : '', st.value, note.value.trim()); } },
      el('datalist', { id: 'inj-names' }, POOL.map((r) => el('option', { value: r[1] }, r[3]))), name, st, note, el('button', { class: 'btn small', type: 'submit' }, 'Save mark'));
    host.replaceChildren(
      active.length ? el('table', { class: 'rtab' }, el('thead', {}, el('tr', {}, ['Player', 'Team', 'Mark', 'Note', 'Updated', ''].map((h) => el('th', {}, h)))), el('tbody', {}, active.map(([k, v]) => el('tr', { class: 'av-' + v.status }, el('td', {}, el('strong', {}, v.name)), el('td', {}, v.team || ''), el('td', {}, S.STATUS[v.status]), el('td', { class: 'small' }, v.note || ''), el('td', { class: 'small muted' }, (v.updatedAt || '').slice(0, 10)), el('td', {}, el('button', { class: 'btn ghost small', type: 'button', onclick: () => setMark(k, v.name, v.team, '', '') }, 'Clear')))))) : el('p', { class: 'muted' }, 'No marks yet.'),
      el('h3', {}, 'Add or change a mark'), add, S.canSave() ? null : el('p', { class: 'note-warn' }, 'This device can read the marks but not save them. Connect it once on the Scouting page (Connect this device), then come back.'), msg);
    // a quick mark on every row of the report
    document.querySelectorAll('tr[data-pname] .staff-cell').forEach((c) => { const tr = c.closest('tr'), k = tr.dataset.pname, r = byKey.get(k); c.replaceChildren(statusSelect(av[k]?.status === 'cleared' ? '' : av[k]?.status, (v) => setMark(k, r ? r[1] : tr.querySelector('strong')?.textContent || k, r ? r[3] : '', v, av[k]?.note || ''))); });
  }
  S.onChange(render);
  S.ready().then((plan) => { if (!plan) host.replaceChildren(S.unlockForm(() => {}, 'Enter the team password to see and add staff marks:')); });
})();
