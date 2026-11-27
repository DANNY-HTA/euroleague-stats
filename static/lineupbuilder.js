// Lineup builder: pick up to five players; see the five together, every smaller group inside it, and an estimate.
(function () {
  const el = document.getElementById('lb-data'), app = document.getElementById('lb-app');
  if (!el || !app) return;
  const D = JSON.parse(el.textContent);
  const name = Object.fromEntries(D.players.map(([id, n]) => [id, n]));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mm = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const pick = new Set();
  const stat = (r) => { if (!r) return null; const [secs, pf, pa, poss, oposs, g] = r, P = (poss + oposs) / 2; return { secs, pf, pa, pm: pf - pa, P, ortg: P ? 100 * pf / P : null, drtg: P ? 100 * pa / P : null, net: P ? 100 * (pf - pa) / P : null, g }; };
  const combos = (arr, k) => { const out = []; const rec = (s, acc) => { if (acc.length === k) { out.push(acc); return; } for (let i = s; i < arr.length; i++) rec(i + 1, [...acc, arr[i]]); }; rec(0, []); return out; };
  const f1 = (v, sign) => (v == null || !Number.isFinite(v) ? '–' : (sign && v > 0 ? '+' : '') + v.toFixed(1));
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const teamNet = (() => { const [secs, pf, pa, poss, oposs] = D.tot, P = (poss + oposs) / 2; return P ? 100 * (pf - pa) / P : 0; })();
  function render() {
    const sel = [...pick].sort();
    const chips = D.players.map(([id, n, min]) => `<button type="button" class="lb-chip" data-id="${esc(id)}" aria-pressed="${pick.has(id)}"${!pick.has(id) && pick.size >= 5 ? ' disabled' : ''}>${esc(n)} <small>${min}′</small></button>`).join('');
    let out = '';
    if (sel.length >= 2) {
      const exact = stat(D.U[sel.length]?.[sel.join(',')]);
      // smaller groups inside the selection
      const groups = [];
      for (let k = Math.min(4, sel.length - (sel.length === 5 ? 1 : 0)); k >= 2; k--) for (const c of combos(sel, k)) { const s = stat(D.U[k][c.join(',')]); groups.push({ k, c, s }); }
      if (sel.length < 5 && !groups.some((g) => g.k === sel.length)) { /* exact handled above */ }
      // estimate: minutes-weighted net of the pairs and trios inside the group (shrunk towards the team when minutes are few)
      const parts = groups.filter((g) => g.s && g.k <= 3 && g.s.secs >= 300);
      const w = parts.reduce((a, g) => a + g.s.secs * (g.k === 3 ? 1.5 : 1), 0);
      const raw = w ? parts.reduce((a, g) => a + g.s.net * g.s.secs * (g.k === 3 ? 1.5 : 1), 0) / w : null;
      const shrink = w ? w / (w + 6000) : 0, est = raw == null ? null : teamNet + (raw - teamNet) * shrink;
      out = `<div class="lb-res">
<div class="lb-big"><span>${sel.length === 5 ? 'These five together' : `These ${sel.length} together`}</span>${exact ? `<strong class="${cls(exact.net)}">${f1(exact.net, true)}</strong><small>net per 100 · ${mm(exact.secs)} in ${exact.g} games · ${exact.pf}–${exact.pa} (${exact.pm > 0 ? '+' : ''}${exact.pm}) · ORtg ${f1(exact.ortg)} / DRtg ${f1(exact.drtg)}</small>` : '<strong class="muted">Never on the court together</strong>'}</div>
<div class="lb-big"><span>Estimate from the pairs and trios inside</span>${est != null ? `<strong class="${cls(est)}">${f1(est, true)}</strong><small>net per 100 · based on ${Math.round(w / 60)} weighted minutes; ${exact && exact.secs >= 600 ? 'the real number above is the better guide' : 'pulled towards the team average when the minutes are few'}</small>` : '<strong class="muted">Not enough minutes</strong>'}</div>
<div class="lb-big"><span>Hapoel overall</span><strong class="${cls(teamNet)}">${f1(teamNet, true)}</strong><small>net per 100 in these games</small></div>
</div>
<h3>Every group inside your selection</h3><div class="scroll"><table class="rtab"><thead><tr><th>Players</th><th class="num">Size</th><th class="num">MIN</th><th class="num">Games</th><th class="num">+/-</th><th class="num">ORtg</th><th class="num">DRtg</th><th class="num">Net</th></tr></thead><tbody>
${groups.sort((a, b) => b.k - a.k || (b.s?.secs || 0) - (a.s?.secs || 0)).map(({ k, c, s }) => `<tr><td class="small">${c.map((id) => esc(name[id])).join(' · ')}</td><td class="num">${k}</td>${s ? `<td class="num">${mm(s.secs)}</td><td class="num">${s.g}</td><td class="num ${cls(s.pm)}">${s.pm > 0 ? '+' : ''}${s.pm}</td><td class="num">${f1(s.ortg)}</td><td class="num">${f1(s.drtg)}</td><td class="num ${cls(s.net)}"><strong>${f1(s.net, true)}</strong></td>` : '<td colspan="6" class="muted">never together</td>'}</tr>`).join('')}
</tbody></table></div>`;
      // the best fifth player for 4 picked
      if (sel.length === 4) {
        const cand = D.players.map(([id]) => id).filter((id) => !pick.has(id)).map((id) => { const k = [...sel, id].sort().join(','); return { id, s: stat(D.U[5][k]) }; }).filter((x) => x.s && x.s.secs >= 60).sort((a, b) => b.s.net - a.s.net);
        if (cand.length) out += `<h3>Who to add as the fifth</h3><div class="scroll"><table class="rtab"><thead><tr><th>Fifth player</th><th class="num">MIN together</th><th class="num">+/-</th><th class="num">Net</th></tr></thead><tbody>${cand.map((x) => `<tr><td>${esc(name[x.id])}</td><td class="num">${mm(x.s.secs)}</td><td class="num ${cls(x.s.pm)}">${x.s.pm > 0 ? '+' : ''}${x.s.pm}</td><td class="num ${cls(x.s.net)}"><strong>${f1(x.s.net, true)}</strong></td></tr>`).join('')}</tbody></table></div>`;
      }
    } else out = '<p class="muted">Pick at least two players.</p>';
    app.innerHTML = `<p class="muted">Tap players to add or remove them (up to five). Minutes next to each name = his minutes in these games. ${pick.size ? '<button type="button" class="btn ghost small" id="lb-clear">Clear</button>' : ''}</p><div class="lb-chips">${chips}</div>${out}`;
    app.querySelectorAll('.lb-chip').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.id; if (pick.has(id)) pick.delete(id); else if (pick.size < 5) pick.add(id); render(); }));
    app.querySelector('#lb-clear')?.addEventListener('click', () => { pick.clear(); render(); });
  }
  render();
})();
