// "Ask the Brain": questions answered by Claude from HTA LAB's own data.
// The Anthropic API key is typed in by the user and kept only in this browser (localStorage); it is sent only
// to api.anthropic.com. The site's data (JSON files of this site) goes along with each question as context.
(function () {
  const app = document.getElementById('brain-app');
  if (!app) return;
  const LEAGUES = JSON.parse(document.getElementById('brain-leagues').textContent); // [key, name, dir, logo]
  const KEY = 'hta-brain-key', MODEL = 'hta-brain-model';
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = new Map();
  const getJson = async (url) => { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return cache.get(url); };
  const picked = new Set(['el', 'il']);
  const history = []; // [{q, a}]

  // ---- data -> compact text for the model ----
  const csv = (rows) => rows.map((r) => r.map((v) => (v == null ? '' : String(v).replace(/[,\n]/g, ' '))).join(',')).join('\n');
  async function leagueText(k) {
    const L = LEAGUES.find((x) => x[0] === k); if (!L) return '';
    const [ps, ts] = await Promise.all([getJson(L[2] + 'player-stats.json'), getJson(L[2] + 'team-stats.json')]);
    let out = `\n### ${L[1]}\n`;
    if (ts) {
      out += `Team stats (${ts.season}; per game; ratings per 100 possessions; rank = league standing):\n` + csv([['code', 'team', 'standing', ...ts.keys], ...ts.teams]) + '\n';
      out += 'Results (date,round,home,home pts,away,away pts):\n' + csv(ts.games) + '\n';
      if (ts.upcoming?.length) out += 'Next games (UTC,home,away):\n' + csv(ts.upcoming) + '\n';
    }
    if (ps) {
      const I = Object.fromEntries(ps.tk.map((k2, i) => [k2, i]));
      const rows = ps.players.filter((p) => p[10] > 0).map((p) => {
        const gp = p[10], t = p[15], pg = (k2) => +(t[I[k2]] / gp).toFixed(1), pct = (m, a) => (t[I[a]] ? +(100 * t[I[m]] / t[I[a]]).toFixed(1) : '');
        const fga = t[I.fga2] + t[I.fga3], tsa = fga + 0.44 * t[I.fta];
        return [p[0], p[2], p[4], p[5] || '', p[7] ?? '', p[8] || '', gp, p[11], +(p[12] / gp).toFixed(1), pg('pts'), pg('reb'), pg('oreb'), pg('ast'), pg('stl'), pg('blk'), pg('tov'), pg('pf'), pg('fd'), pct('fgm2', 'fga2'), pct('fgm3', 'fga3'), +(t[I.fga3] / gp).toFixed(1), pct('ftm', 'fta'), tsa ? +(100 * t[I.pts] / (2 * tsa)).toFixed(1) : '', p[16] ?? '', pg('pir'), +(p[13] / gp).toFixed(1), p[19]?.[0] ?? 0];
      });
      out += `Players (per game; totals in GP/GS; offensive fouls drawn = season total):\n` + csv([['player', 'team', 'pos', 'height', 'age', 'country', 'GP', 'GS', 'MIN', 'PTS', 'REB', 'OREB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'FD', '2P%', '3P%', '3PA', 'FT%', 'TS%', 'USG%', 'PIR', '+/-', 'off. fouls drawn'], ...rows]) + '\n';
    }
    return out;
  }
  async function hapoelText() {
    const h = await getJson('hapoel-brain.json'); if (!h) return '';
    let out = `### Hapoel Tel Aviv (data as of ${h.built})\nTeam stats:\n${csv([h.teamStats.cols, ...h.teamStats.rows])}\n`;
    out += `Hapoel players by competition:\n${csv([h.playerCols, ...h.players])}\n`;
    out += `Hapoel games (newest first). Box score per player: ${h.boxKeys}:\n` + h.games.map((g) => `${g.date} ${g.comp} rd ${g.round} ${g.venue} vs ${g.opp}: ${g.result} ${g.score} (quarters ${JSON.stringify(g.quarters)}) | ${g.box}`).join('\n') + '\n';
    out += `Hapoel schedule (competition, UTC time, home/away, opponent, result):\n${csv(h.schedule)}\n`;
    return out;
  }
  // Leagues the question mentions (league names or any of their team names/codes) are added automatically.
  const WORDS = { el: ['euroleague', 'euro league'], ec: ['eurocup', 'euro cup'], il: ['israel', 'winner league', 'ligat'], lba: ['italy', 'italian', 'serie a', 'lba', 'legabasket'], acb: ['spain', 'spanish', 'acb', 'endesa'], bbl: ['germany', 'german', 'bbl', 'bundesliga'], gr: ['greece', 'greek', 'gbl', 'esake'], nbl: ['australia', 'nbl', 'new zealand'], aba: ['aba', 'adriatic'], vtb: ['vtb', 'russia', 'united league'] };
  async function autoLeagues(q) {
    const s = q.toLowerCase(), found = new Set();
    for (const [k, ws] of Object.entries(WORDS)) if (ws.some((w) => s.includes(w))) found.add(k);
    await Promise.all(LEAGUES.map(async ([k, , dir]) => {
      const ts = await getJson(dir + 'team-stats.json'); if (!ts) return;
      for (const t of ts.teams) { const name = String(t[1]).toLowerCase(); const words = name.split(/\s+/).filter((w) => w.length >= 5); if (s.includes(name) || words.some((w) => new RegExp(`\\b${w}\\b`).test(s))) { found.add(k); break; } }
    }));
    return found;
  }

  // ---- tiny markdown for the answers ----
  function md(text) {
    const lines = String(text).split('\n'); let html = '', inList = false, table = [];
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
    const flushTable = () => { if (!table.length) return; const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())); html += `<div class="scroll"><table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; table = []; };
    for (const l of lines) {
      if (/^\s*\|.*\|\s*$/.test(l)) { if (inList) { html += '</ul>'; inList = false; } table.push(l); continue; }
      flushTable();
      if (/^\s*[-*] /.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (/^#{1,4} /.test(l)) html += `<h4>${inline(l.replace(/^#+ /, ''))}</h4>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    flushTable(); if (inList) html += '</ul>';
    return html;
  }

  // ---- UI ----
  function render() {
    const key = store.get(KEY);
    app.innerHTML = `
<div class="brain-key">${key ? `<span>✓ API key saved in this browser.</span> <button type="button" class="btn ghost" data-a="forget">Remove key</button>` : `<label>Anthropic API key <input type="password" autocomplete="off" placeholder="sk-ant-…" data-a="key"></label> <button type="button" class="btn" data-a="save">Save on this device</button>
<p class="muted small">Create a key yourself at console.anthropic.com (API keys). It stays only in this browser and is sent only to Anthropic with your questions. Each question costs a few cents on your Anthropic account.</p>`}</div>
<div class="brain-leagues"><span class="muted small">Data to use:</span> <label class="chip-check"><input type="checkbox" checked disabled> Hapoel</label>${LEAGUES.map(([k, n, , logo]) => `<label class="chip-check"><input type="checkbox" data-lg="${k}"${picked.has(k) ? ' checked' : ''}> ${logo ? `<img src="${esc(logo)}" alt="" width="18" height="18">` : ''}${esc(n)}</label>`).join('')}</div>
<div class="brain-thread">${history.map((h) => `<div class="brain-q"><strong>You:</strong> ${esc(h.q)}</div><div class="brain-a">${h.a == null ? '<p class="muted">Thinking…</p>' : h.err ? `<p class="neg">${esc(h.a)}</p>` : md(h.a)}</div>`).join('')}</div>
<form class="brain-ask"><textarea rows="3" placeholder="e.g. Who are Hapoel's best lineups in the last 5 EuroLeague games? · Compare Olympiacos' defense with ours · Which ACB guards shoot 40% from three on 4+ attempts?" data-a="q"></textarea>
<div class="brain-row"><select data-a="model"><option value="claude-sonnet-5-5">Claude Sonnet 5.5 — fast</option><option value="claude-opus-5-5">Claude Opus 5.5 — deepest</option></select>
<button type="submit" class="btn"${key ? '' : ' disabled'}>Ask the Brain</button>${history.length ? ' <button type="button" class="btn ghost" data-a="clear">New conversation</button>' : ''}</div></form>`;
    const sel = app.querySelector('[data-a="model"]'); sel.value = store.get(MODEL) || 'claude-sonnet-5-5'; sel.addEventListener('change', () => store.set(MODEL, sel.value));
    app.querySelector('[data-a="save"]')?.addEventListener('click', () => { const v = app.querySelector('[data-a="key"]').value.trim(); if (v) { store.set(KEY, v); render(); } });
    app.querySelector('[data-a="forget"]')?.addEventListener('click', () => { store.set(KEY, ''); render(); });
    app.querySelector('[data-a="clear"]')?.addEventListener('click', () => { history.length = 0; render(); });
    app.querySelectorAll('[data-lg]').forEach((c) => c.addEventListener('change', () => { if (c.checked) picked.add(c.dataset.lg); else picked.delete(c.dataset.lg); }));
    app.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const q = app.querySelector('[data-a="q"]').value.trim(); if (q) ask(q); });
  }

  async function ask(q) {
    const key = store.get(KEY); if (!key) return;
    const turn = { q, a: null }; history.push(turn); render();
    try {
      for (const k of await autoLeagues(q)) picked.add(k);
      const parts = [await hapoelText(), ...(await Promise.all([...picked].map(leagueText)))];
      const data = parts.join('\n');
      const system = `You are "the Brain" of HTA LAB, the analytics site of Hapoel Tel Aviv's basketball coaching staff (EuroLeague and the Israeli Winner League). Answer the coach's questions using ONLY the data below, which comes from the official league box scores and play-by-play on the site. If the data does not contain the answer, say so plainly and say what data would be needed; never invent numbers, players or games. Be concise and practical, like a staff analyst: lead with the answer, give the key numbers, use a small markdown table when comparing. Per-game numbers unless the coach asks for totals. Season 2026–27; today is ${new Date().toISOString().slice(0, 10)}.\n\n=== HTA LAB DATA ===\n${data}`;
      const messages = []; // the site data (system) is cached for 5 minutes, so follow-up questions cost much less
      for (const h of history) { messages.push({ role: 'user', content: h.q }); if (h !== turn && h.a && !h.err) messages.push({ role: 'assistant', content: h.a }); }
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: store.get(MODEL) || 'claude-sonnet-5-5', max_tokens: 2500, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 401 ? 'The API key was not accepted — check it, or remove it and paste it again.' : r.status === 429 ? 'Too many questions at once or the account limit was reached — wait a minute and try again.' : (j.error?.message || 'The Brain could not answer (HTTP ' + r.status + ').'));
      turn.a = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '(no answer)';
    } catch (err) { turn.a = String(err.message || err); turn.err = true; }
    render();
    app.querySelector('.brain-thread')?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  render();
})();
