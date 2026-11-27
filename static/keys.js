// Keys to the game and season goals: staff targets (encrypted through HTAStaff), graded from hapoel-games.json.
(function () {
  'use strict';
  const S = window.HTAStaff, root = document.getElementById('keys-app'); if (!S || !root) return;
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  const now = () => new Date().toISOString(), uid = () => Math.random().toString(36).slice(2, 10);
  const STAT = { pts: [2, 'points'], reb: [3, 'rebounds'], ast: [4, 'assists'], min: [5, 'minutes'] };
  let D = null, PLAN = null; const msg = el('p', { class: 'small', role: 'status' });
  const M = () => new Map(D.metrics.map((m) => [m[0], m]));
  const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const label = (it) => it.kind === 'player' ? `${it.pname} ${STAT[it.stat][1]} ${it.op === 'le' ? '≤' : '≥'} ${it.target}` : `${M().get(it.metric)?.[1] || it.metric} ${it.op === 'le' ? '≤' : '≥'} ${it.target}`;
  const valueIn = (g, it) => { if (it.kind === 'player') { const p = g.pl[it.pk]; return p ? p[STAT[it.stat][0]] : 0; } return g.m[it.metric]; };
  const met = (v, it) => (v == null ? null : it.op === 'le' ? v <= it.target : v >= it.target);
  const gameFor = (k) => { const byCode = D.games.find((g) => g.c === k.c && String(g.code) === String(k.gc)); if (byCode) return byCode; const t = Date.parse(k.utc || ''); return D.games.find((g) => g.c === k.c && g.oppCode === k.oppCode && Math.abs(Date.parse(g.date + 'T12:00:00Z') - t) < 2.5 * 86400000) || null; };
  async function save(mut, what) { msg.textContent = 'Saving…'; try { await S.save(mut, what); msg.textContent = 'Saved.'; } catch (e) { msg.textContent = 'Not saved: ' + e.message; } }

  function keyForm(u) {
    const kind = el('select', {}, el('option', { value: 'team' }, 'Team number'), el('option', { value: 'player' }, 'A player')), metric = el('select', {}, D.metrics.map((m) => el('option', { value: m[0] }, m[1])));
    const pl = el('select', {}, el('optgroup', { label: u.opp }, u.players.map((p) => el('option', { value: p[0] + '|' + p[1] }, `${p[1]} (${p[2]} ppg)`))), el('optgroup', { label: 'Hapoel' }, D.hapPlayers.map(([k, n]) => el('option', { value: k + '|' + n }, n))));
    const stat = el('select', {}, Object.entries(STAT).map(([k, [, l]]) => el('option', { value: k }, l)));
    const op = el('select', {}, el('option', { value: 'le' }, 'at most'), el('option', { value: 'ge' }, 'at least')), target = el('input', { type: 'number', step: '0.1', required: true, style: 'width:6em' });
    const sync = () => { const p = kind.value === 'player'; metric.hidden = p; pl.hidden = !p; stat.hidden = !p; if (!p) { const m = M().get(metric.value); op.value = m && m[2] ? 'ge' : 'le'; } else op.value = 'le'; };
    kind.addEventListener('change', sync); metric.addEventListener('change', sync); sync();
    return el('form', { class: 'key-add', onsubmit: (e) => { e.preventDefault(); const t = Number(target.value); if (!Number.isFinite(t)) return; const [pk, pname] = pl.value.split('|');
      const item = kind.value === 'player' ? { id: uid(), kind: 'player', pk, pname, stat: stat.value, op: op.value, target: t } : { id: uid(), kind: 'team', metric: metric.value, op: op.value, target: t };
      const id = `${u.c}:${u.gc}`; save((plan) => { const r = plan.keys[id] || { c: u.c, gc: u.gc, utc: u.utc, opp: u.opp, oppCode: u.oppCode, items: [] }; plan.keys[id] = { ...r, items: [...(r.items || []), item], updatedAt: now() }; }, `Key to the game vs ${u.opp}`); } },
      kind, metric, pl, stat, op, target, el('button', { class: 'btn small', type: 'submit' }, 'Add key'));
  }
  function upcoming() {
    return el('section', { class: 'card' }, el('h2', {}, 'Next games — set the keys'), D.upcoming.length ? D.upcoming.map((u) => { const k = PLAN.keys[`${u.c}:${u.gc}`]; const items = (k?.items || []);
      return el('div', { class: 'key-game' }, el('h3', {}, `${u.home ? 'vs' : 'at'} ${u.opp} `, el('small', { class: 'muted' }, `${u.comp} · ${(u.utc || '').slice(0, 10)}`)),
        items.length ? el('ol', { class: 'key-list' }, items.map((it) => el('li', {}, label(it), ' ', el('button', { type: 'button', class: 'btn ghost small', onclick: () => save((plan) => { const r = plan.keys[`${u.c}:${u.gc}`]; plan.keys[`${u.c}:${u.gc}`] = { ...r, items: r.items.filter((x) => x.id !== it.id), updatedAt: now() }; }, 'Remove a key') }, 'Remove')))) : el('p', { class: 'muted small' }, 'No keys yet.'),
        items.length < 6 ? keyForm(u) : null); }) : el('p', { class: 'muted' }, 'No upcoming games in the schedule.'));
  }
  function graded() {
    const done = Object.values(PLAN.keys).filter((k) => k?.items?.length).map((k) => ({ k, g: gameFor(k) })).filter((x) => x.g).sort((a, b) => b.g.date.localeCompare(a.g.date));
    return el('section', { class: 'card' }, el('h2', {}, 'Graded after the game'), done.length ? done.map(({ k, g }) => { const res = k.items.map((it) => { const v = valueIn(g, it); return { it, v, ok: met(v, it) }; }); const n = res.filter((r) => r.ok).length;
      return el('div', { class: 'key-game' }, el('h3', {}, el('a', { href: g.href }, `${g.date} ${g.home ? 'vs' : 'at'} ${g.opp} — ${g.res}`), ' ', el('span', { class: 'chip ' + (n * 2 >= res.length ? 'hot' : '') }, `${n} of ${res.length} keys met`)),
        el('table', { class: 'rtab' }, el('tbody', {}, res.map((r) => el('tr', {}, el('td', {}, label(r.it)), el('td', { class: 'num' }, el('strong', {}, fmt(r.v))), el('td', {}, el('strong', { class: r.ok ? 'pos' : 'neg' }, r.ok ? '✓ Met' : '✗ Missed')))))));
    }) : el('p', { class: 'muted' }, 'Keys you set for a game are graded here once its box score is in.'));
  }
  function goals() {
    const list = Object.entries(PLAN.goals).filter(([, g]) => g && !g.deleted);
    const metric = el('select', {}, D.metrics.map((m) => el('option', { value: m[0] }, m[1]))), op = el('select', {}, el('option', { value: 'le' }, 'at most'), el('option', { value: 'ge' }, 'at least')), target = el('input', { type: 'number', step: '0.1', required: true, style: 'width:6em' }), comp = el('select', {}, el('option', { value: '' }, 'Both competitions'), [...new Set(D.games.map((g) => g.c))].map((c) => el('option', { value: c }, D.games.find((g) => g.c === c).comp)));
    const sync = () => { const m = M().get(metric.value); op.value = m && m[2] ? 'ge' : 'le'; }; metric.addEventListener('change', sync); sync();
    const rows = list.map(([id, gl]) => { const gs = D.games.filter((g) => !gl.comp || g.c === gl.comp); const vals = gs.map((g) => ({ g, v: g.m[gl.metric] })).filter((x) => x.v != null); const hit = vals.filter((x) => met(x.v, gl)).length; const avg = vals.length ? vals.reduce((a, x) => a + x.v, 0) / vals.length : null; const l5 = vals.slice(-5); const a5 = l5.length ? l5.reduce((a, x) => a + x.v, 0) / l5.length : null;
      return el('tr', {}, el('td', {}, el('strong', {}, label({ ...gl, kind: 'team' })), gl.comp ? el('span', { class: 'muted small' }, ' · ' + (gs[0]?.comp || gl.comp)) : null), el('td', { class: 'num' }, el('strong', { class: met(avg, gl) ? 'pos' : 'neg' }, fmt(avg))), el('td', { class: 'num' }, fmt(a5)), el('td', { class: 'num' }, `${hit}/${vals.length}`),
        el('td', {}, el('span', { class: 'goal-strip' }, vals.slice(-15).map((x) => el('i', { class: met(x.v, gl) ? 'ok' : 'no', title: `${x.g.date} ${x.g.opp}: ${fmt(x.v)}` })))), el('td', {}, el('button', { type: 'button', class: 'btn ghost small', onclick: () => save((plan) => { plan.goals[id] = { ...gl, deleted: true, updatedAt: now() }; }, 'Remove a season goal') }, 'Remove'))); });
    return el('section', { class: 'card' }, el('h2', {}, 'Season goals'), rows.length ? el('div', { class: 'scroll' }, el('table', { class: 'rtab' }, el('thead', {}, el('tr', {}, ['Goal', 'Season avg', 'Last 5', 'Games met', 'Last 15 games', ''].map((h) => el('th', {}, h)))), el('tbody', {}, rows))) : el('p', { class: 'muted' }, 'No season goals yet.'),
      el('h3', {}, 'Add a season goal'), el('form', { class: 'key-add', onsubmit: (e) => { e.preventDefault(); const t = Number(target.value); if (!Number.isFinite(t)) return; save((plan) => { plan.goals[uid()] = { metric: metric.value, op: op.value, target: t, comp: comp.value, updatedAt: now() }; }, 'Season goal'); } }, metric, op, target, comp, el('button', { class: 'btn small', type: 'submit' }, 'Add goal')));
  }
  function draw() { if (!D || !PLAN) return; root.replaceChildren(S.canSave() ? null : el('p', { class: 'note-warn' }, 'This device can read the targets but not save them. Connect it once on the Scouting page (Connect this device).'), msg, upcoming(), graded(), goals()); }
  fetch('hapoel-games.json', { cache: 'no-store' }).then((r) => r.json()).then((d) => { D = d; draw(); S.onChange((p) => { PLAN = p; draw(); });
    S.ready().then((p) => { if (!p) root.replaceChildren(S.unlockForm(() => {}, 'Keys and goals are staff-only. Enter the team password:')); }); }).catch((e) => { root.textContent = 'Could not load the games: ' + e.message; });
})();
