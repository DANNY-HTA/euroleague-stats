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
    root.replaceChildren(el('div', { class: 'card mu-pick no-print' }, el('div', { class: 'mu-sel' }, pickA, swap, pickB), el('p', { class: 'mu-pdf' }, el('button', { type: 'button', class: 'btn', onclick: () => window.print() }, 'Download as PDF'), el('span', { class: 'muted small' }, ' Opens the print window: choose “Save as PDF”.'))), out);

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
      // more rows: situations, quarters (with league ranks)
      const xrow = ([k, label, highGood, hint]) => {
        const va = A.x[k], vb = B.x[k]; if (va == null || vb == null) return null;
        const aBetter = highGood == null || va === vb ? null : highGood ? va > vb : va < vb;
        const max = Math.max(Math.abs(va), Math.abs(vb)) || 1;
        const bar = (v, win, sd) => el('div', { class: `mu-bar ${sd}` }, el('span', { class: win ? 'win' : '', style: `width:${Math.max(4, 100 * Math.abs(v) / max).toFixed(1)}%` }));
        const fmt = (v) => (k.startsWith('ato') ? v.toFixed(2) : k.startsWith('q') || k === 'clutchNet' ? (v > 0 ? '+' : '') + v.toFixed(1) : v.toFixed(1));
        return el('div', { class: 'mu-row' },
          el('div', { class: 'mu-val l' + (aBetter === true ? ' best' : '') }, fmt(va), el('small', {}, A.x.xr[k] ? ord(A.x.xr[k]) : '')),
          bar(va, aBetter === true, 'l'), el('div', { class: 'mu-lab' }, label, hint ? el('small', {}, hint) : null), bar(vb, aBetter === false, 'r'),
          el('div', { class: 'mu-val r' + (aBetter === false ? ' best' : '') }, fmt(vb), el('small', {}, B.x.xr[k] ? ord(B.x.xr[k]) : '')));
      };
      const xr = (D.xmetrics || []).map(xrow).filter(Boolean);
      // more edges from situations
      for (const [P, Q] of [[A, B], [B, A]]) {
        const r = (T, k) => T.x.xr?.[k];
        const e2 = (k1, k2, text) => { if (r(P, k1) && r(Q, k2) && r(P, k1) <= 6 && r(Q, k2) >= N - 6) edges.push(text); };
        e2('paint', 'paintA', `${P.name} score inside (${ord(r(P, 'paint'))} in paint points), and ${Q.name} give up the paint (${ord(r(Q, 'paintA'))}).`);
        e2('offTO', 'offTOA', `${P.name} live off turnovers (${ord(r(P, 'offTO'))}), and ${Q.name} give up a lot of points off turnovers (${ord(r(Q, 'offTOA'))}).`);
        e2('fb', 'fbA', `${P.name} run (${ord(r(P, 'fb'))} in fast-break points), and ${Q.name} struggle in transition defense (${ord(r(Q, 'fbA'))}).`);
        e2('second', 'secondA', `${P.name} get second chances (${ord(r(P, 'second'))}), and ${Q.name} allow them (${ord(r(Q, 'secondA'))}).`);
      }
      for (let i = edges.length - 1; i >= 0; i--) if (edges[i] == null) edges.splice(i, 1);
      // shot profile: one team's offense against the other's defense
      const zt = (O, Dd) => { const zo = O.x.zones?.off, zd = Dd.x.zones?.def; if (!zo || !zd) return null; return el('table', { class: 'mu-z' }, el('thead', {}, el('tr', {}, ['Zone', `${O.tv} FG%`, `${O.tv} share`, `${Dd.tv} allow FG%`, `${Dd.tv} allow share`, 'League FG%'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', {}, zo.map((r, i) => { const d = zd[i]; const hot = r[1] != null && d[1] != null && r[1] >= r[3] + 3 && d[1] >= d[3] + 3; return el('tr', { class: hot ? 'mu-hot' : '' }, el('td', {}, r[0]), el('td', { class: 'num' }, r[1] == null ? '–' : r[1].toFixed(1)), el('td', { class: 'num' }, r[2].toFixed(1) + '%'), el('td', { class: 'num' }, d[1] == null ? '–' : d[1].toFixed(1)), el('td', { class: 'num' }, d[2].toFixed(1) + '%'), el('td', { class: 'num muted' }, r[3] == null ? '–' : r[3].toFixed(1))); }))); };
      const svgBox = (html) => { const d = el('div', { class: 'mu-court' }); d.innerHTML = html; return d; };
      const shotSec = A.x.zones && B.x.zones ? el('section', { class: 'card mu-shots' }, el('h2', {}, 'Shot profile'), el('p', { class: 'muted' }, 'Each offense next to the defense it will face. Zone colours compare with the league average; highlighted rows = the offense shoots well there AND the defense allows a good percentage there.'),
        [[A, B], [B, A]].map(([O, Dd]) => el('div', { class: 'mu-shot-pair' }, el('h3', {}, `${O.name} offense vs ${Dd.name} defense`), el('div', { class: 'shot-two' }, el('figure', {}, el('figcaption', {}, `${O.tv} shots`), svgBox(O.x.zones.svgOff)), el('figure', {}, el('figcaption', {}, `${Dd.tv} allows`), svgBox(Dd.x.zones.svgDef))), el('div', { class: 'scroll' }, zt(O, Dd))))) : null;
      // position battles
      const grp = (pos) => /guard/i.test(pos) ? 'Guards' : /center/i.test(pos) ? 'Centers' : /forward/i.test(pos) ? 'Forwards' : null;
      const battle = ['Guards', 'Forwards', 'Centers'].map((G) => {
        const pa = (A.roster || []).filter((p) => grp(p.pos) === G).slice(0, 3), pb = (B.roster || []).filter((p) => grp(p.pos) === G).slice(0, 3);
        if (!pa.length && !pb.length) return null;
        const card = (p) => el('div', { class: 'mu-pc' }, el('a', { href: p.href }, el('strong', {}, p.name)), el('span', { class: 'muted small' }, `${p.mpg} min · ${p.ppg} pts · ${p.rpg} reb · ${p.apg} ast`), el('span', { class: 'small' }, `TS ${p.ts ?? '–'}% · USG ${p.usg ?? '–'}% · PIR ${p.pir}${p.onoff != null ? ` · on/off ${p.onoff > 0 ? '+' : ''}${p.onoff}` : ''}`));
        return el('div', { class: 'mu-bt' }, el('h3', {}, G), el('div', { class: 'mu-bt-row' }, el('div', {}, pa.map(card)), el('div', { class: 'mu-bt-vs' }, 'vs'), el('div', {}, pb.map(card))));
      }).filter(Boolean);
      // full player tables
      const COLS = [['GP', (p) => `${p.gp} (${p.gs})`], ['MIN', (p) => p.mpg], ['PTS', (p) => p.ppg], ['REB', (p) => p.rpg], ['AST', (p) => p.apg], ['STL', (p) => p.spg], ['BLK', (p) => p.bpg], ['TOV', (p) => p.tpg], ['2P%', (p) => p.p2 ?? '–'], ['3P%', (p) => p.p3 ?? '–'], ['3PA', (p) => p.a3], ['FT%', (p) => p.ft ?? '–'], ['TS%', (p) => p.ts ?? '–'], ['USG%', (p) => p.usg ?? '–'], ['PIR', (p) => p.pir], ['+/-', (p) => (p.pm > 0 ? '+' : '') + p.pm], ['On/off', (p) => (p.onoff == null ? '–' : (p.onoff > 0 ? '+' : '') + p.onoff)], ['Impact', (p) => (p.imp == null ? '–' : (p.imp > 0 ? '+' : '') + p.imp)], ['Clutch pts', (p) => p.clutch ?? '–']];
      const pTable = (T) => el('div', { class: 'mu-ptab' }, el('h3', {}, T.name), el('div', { class: 'scroll' }, el('table', { class: 'mu-pl' }, el('thead', {}, el('tr', {}, el('th', {}, 'Player'), el('th', {}, 'Pos'), COLS.map(([h]) => el('th', { class: 'num' }, h)))),
        el('tbody', {}, (T.roster || []).map((p) => el('tr', {}, el('td', {}, el('a', { href: p.href }, p.name)), el('td', { class: 'small muted' }, (p.pos || '').slice(0, 1)), COLS.map(([, f]) => el('td', { class: 'num' }, String(f(p))))))))));
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
            return el('li', {}, el('a', { href: g.href }, `${g.date} · Round ${g.round}: ${home.name} ${g.hs}–${g.vs} ${away.name}`), ` (${hw ? home.name : away.name} won)`);
          })) : el('p', { class: 'muted' }, 'They have not played each other yet this season.')),
        el('section', { class: 'card' }, el('h2', {}, 'Side by side'), el('p', { class: 'muted' }, 'Red marks the better team in each row. Small numbers are league ranks.'),
          el('div', { class: 'mu-grid' }, el('div', { class: 'mu-row head' }, el('div', { class: 'mu-val l' }, A.tv), el('div'), el('div'), el('div'), el('div', { class: 'mu-val r' }, B.tv)), rows)),
        xr.length ? el('section', { class: 'card' }, el('h2', {}, 'Game flow, clutch and quarters'), el('p', { class: 'muted' }, 'Per game, from the play-by-play and the official shot data. Small numbers are league ranks (1st = best).'),
          el('div', { class: 'mu-grid' }, el('div', { class: 'mu-row head' }, el('div', { class: 'mu-val l' }, A.tv), el('div'), el('div'), el('div'), el('div', { class: 'mu-val r' }, B.tv)), xr)) : null,
        shotSec,
        el('section', { class: 'card' }, el('h2', {}, 'Where the edges are'), el('p', { class: 'muted' }, 'One team’s strength (top 6) meeting the other’s weakness (bottom 6).'),
          edges.length ? el('ul', { class: 'notes' }, edges.map((t) => el('li', {}, t))) : el('p', { class: 'muted' }, 'No big mismatches: these teams are even on the main factors.')),
        battle.length ? el('section', { class: 'card mu-battles' }, el('h2', {}, 'Position battles'), el('p', { class: 'muted' }, 'The top players at each position by minutes. TS = true shooting, USG = usage, on/off = team net rating with him on the court minus off.'), battle) : null,
        el('div', { class: 'row' }, side(A), side(B)),
        el('section', { class: 'card mu-players' }, el('h2', {}, 'Every player'), el('p', { class: 'muted' }, 'Per game. On/off = team net rating per 100 possessions with him on minus off; Impact = adjusted plus-minus; Clutch pts = season total in the last 5 minutes of close games.'), pTable(A), pTable(B)));
    }
    draw();
  }).catch(() => { root.textContent = 'Could not load the matchup data.'; });
})();
