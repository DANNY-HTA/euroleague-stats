// Head-to-head: pick two teams and compare them side by side.
(function () {
  'use strict';
  const root = document.getElementById('matchup-app');
  if (!root) return;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'style') n.setAttribute('style', v); else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
  const ord = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  fetch('matchup.json').then((r) => r.json()).then((D) => {
    const byCode = Object.fromEntries(D.teams.map((t) => [t.code, t]));
    const params = new URLSearchParams(location.search);
    let a = byCode[params.get('a')] ? params.get('a') : D.defaultA, b = byCode[params.get('b')] ? params.get('b') : D.defaultB;
    const opts = D.teams.slice().sort((x, y) => x.name.localeCompare(y.name)).map((t) => [t.code, t.name]);
    const sel = (id, val, onchange) => el('select', { id, 'aria-label': id === 'ma' ? 'First team' : 'Second team', onchange }, opts.map(([c, n]) => { const o = el('option', { value: c }, n); if (c === val) o.selected = true; return o; }));
    const out = el('div', { class: 'mu-out' });
    const pickA = sel('ma', a, (e) => { a = e.target.value; draw(); });
    const pickB = sel('mb', b, (e) => { b = e.target.value; draw(); });
    const swap = el('button', { type: 'button', class: 'btn ghost', onclick: () => { [a, b] = [b, a]; pickA.value = a; pickB.value = b; draw(); } }, '⇄ Swap');
    root.replaceChildren(el('div', { class: 'card mu-pick' }, el('div', { class: 'mu-sel' }, pickA, swap, pickB)), out);

    const crest = (t, cls) => t.crest ? el('img', { class: cls, src: t.crest, alt: '' }) : el('span', { class: 'code' }, t.tv);

    function draw() {
      const A = byCode[a], B = byCode[b];
      history.replaceState(null, '', `?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      if (a === b) { out.replaceChildren(el('p', { class: 'card' }, 'Pick two different teams.')); return; }
      // Season meetings
      const meets = D.games.filter((g) => (g.h === a && g.v === b) || (g.h === b && g.v === a));
      // Side-by-side rows
      const rows = D.metrics.map(([k, label, highGood, hint]) => {
        const va = A[k], vb = B[k];
        const aBetter = highGood == null ? null : highGood ? va > vb : va < vb;
        const max = Math.max(Math.abs(va), Math.abs(vb)) || 1;
        const bar = (v, win, side) => el('div', { class: `mu-bar ${side}` }, el('span', { class: win ? 'win' : '', style: `width:${Math.max(4, 100 * Math.abs(v) / max).toFixed(1)}%` }));
        return el('div', { class: 'mu-row' },
          el('div', { class: 'mu-val l' + (aBetter === true ? ' best' : '') }, f1(va), el('small', {}, ord(A.ranks[k]))),
          bar(va, aBetter === true, 'l'),
          el('div', { class: 'mu-lab' }, label, hint ? el('small', {}, hint) : null),
          bar(vb, aBetter === false, 'r'),
          el('div', { class: 'mu-val r' + (aBetter === false ? ' best' : '') }, f1(vb), el('small', {}, ord(B.ranks[k]))));
      });
      // Where the edges are: one team's strength against the other's weakness (ranks out of N).
      const N = D.teams.length, edges = [];
      const vs = (X, Y, ok, yk, text) => { if (X.ranks[ok] <= 6 && Y.ranks[yk] >= N - 6) edges.push(text(X, Y)); };
      for (const [X, Y] of [[A, B], [B, A]]) {
        vs(X, Y, 'efg', 'efgD', (x, y) => `${x.name} shoot well (${ord(x.ranks.efg)} in eFG%), and ${y.name} struggle to stop shots (${ord(y.ranks.efgD)}).`);
        vs(X, Y, 'orebPct', 'drebPct', (x, y) => `${x.name} crash the offensive glass (${ord(x.ranks.orebPct)}) against a weak defensive-rebounding team (${y.name}, ${ord(y.ranks.drebPct)}).`);
        vs(X, Y, 'tov100D', 'tov100', (x, y) => `${x.name} force turnovers (${ord(x.ranks.tov100D)}), and ${y.name} are loose with the ball (${ord(y.ranks.tov100)}).`);
        vs(X, Y, 'threePct', 'threePctD', (x, y) => `${x.name} shoot threes well (${ord(x.ranks.threePct)}), and ${y.name} give up good three-point shooting (${ord(y.ranks.threePctD)}).`);
        vs(X, Y, 'ftr', 'ftrD', (x, y) => `${x.name} get to the line (${ord(x.ranks.ftr)}), and ${y.name} foul a lot (${ord(y.ranks.ftrD)}).`);
      }
      if (Math.abs(A.pace - B.pace) > 2.5) {
        const fast = A.pace > B.pace ? A : B, slow = fast === A ? B : A;
        edges.push(`Tempo battle: ${fast.name} play fast (${f1(fast.pace)} possessions per 40), ${slow.name} slow (${f1(slow.pace)}).`);
      }
      const side = (T) => el('div', { class: 'card mu-team' },
        el('div', { class: 'mu-team-head' }, crest(T, 'crest big'), el('div', {}, el('a', { href: T.href }, el('h2', {}, T.name)), el('p', { class: 'muted' }, `${T.w}–${T.l} · ${ord(T.rank)} in the standings · Last 5: ${T.form}`))),
        el('h3', {}, 'Key players'),
        el('table', {}, el('thead', {}, el('tr', {}, ['Player', 'MIN', 'PTS', 'REB', 'AST', 'PIR'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
          el('tbody', {}, T.players.map((p) => el('tr', {}, el('td', {}, el('a', { href: p.href }, p.name)), el('td', { class: 'num' }, f1(p.mpg)), el('td', { class: 'num' }, f1(p.ppg)), el('td', { class: 'num' }, f1(p.rpg)), el('td', { class: 'num' }, f1(p.apg)), el('td', { class: 'num' }, f1(p.pir)))))));
      out.replaceChildren(
        el('section', { class: 'mu-hero' },
          el('a', { class: 'mu-side', href: A.href }, crest(A, 'mu-crest'), el('strong', {}, A.name), el('span', {}, `${A.w}–${A.l}`)),
          el('div', { class: 'mu-vs' }, 'VS'),
          el('a', { class: 'mu-side', href: B.href }, crest(B, 'mu-crest'), el('strong', {}, B.name), el('span', {}, `${B.w}–${B.l}`))),
        el('section', { class: 'card' }, el('h2', {}, 'This season'),
          meets.length ? el('ul', { class: 'notes' }, meets.map((g) => {
            const home = byCode[g.h], away = byCode[g.v], hw = g.hs > g.vs;
            return el('li', {}, `${g.date} · Round ${g.round}: ${home.name} ${g.hs}–${g.vs} ${away.name} (${hw ? home.name : away.name} won)`);
          })) : el('p', { class: 'muted' }, 'They have not played each other yet this season.')),
        el('section', { class: 'card' }, el('h2', {}, 'Side by side'), el('p', { class: 'muted' }, 'Red marks the better team in each row. Small numbers are league ranks.'),
          el('div', { class: 'mu-grid' }, el('div', { class: 'mu-row head' }, el('div', { class: 'mu-val l' }, A.tv), el('div'), el('div'), el('div'), el('div', { class: 'mu-val r' }, B.tv)), rows)),
        el('section', { class: 'card' }, el('h2', {}, 'Where the edges are'), el('p', { class: 'muted' }, 'One team’s strength (top 6) meeting the other’s weakness (bottom 6).'),
          edges.length ? el('ul', { class: 'notes' }, edges.map((t) => el('li', {}, t))) : el('p', { class: 'muted' }, 'No big mismatches: these teams are even on the main factors.')),
        el('div', { class: 'row' }, side(A), side(B)));
    }
    draw();
  }).catch(() => { root.textContent = 'Could not load the matchup data.'; });
})();
