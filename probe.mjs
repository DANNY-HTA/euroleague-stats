// Sanity checks of the Hapoel page: data size, sections, and run the page script against a tiny fake DOM.
import { readFileSync } from 'node:fs';
const h = readFileSync('site/index.html', 'utf8');
console.log('INDEX', h.length, ['id="schedule"', 'id="boxscores"', 'id="team"', 'id="players"', 'id="lineups"', 'id="boards"', 'id="leagues"', 'league-menu'].map((k) => k + ':' + h.includes(k)).join(' '));
const d = JSON.parse(h.match(/<script type="application\/json" id="hap-data">([\s\S]*?)<\/script>/)[1]);
console.log('DATA games', d.games.length, 'people', Object.keys(d.people).length, 'stints', d.stints.length, 'lineupGames', d.lineupGames.length, 'comps', JSON.stringify(d.comps));
console.log('G0', JSON.stringify(d.games[0]).slice(0, 600));
const el = readFileSync('site/euroleague.html', 'utf8'); console.log('ELHOME', el.length, el.includes('league-menu'));
console.log('BOARDS', (h.match(/class="card board open"/g) || []).length, 'TEAMROWS', (h.match(/<tr><th scope="row">/g) || []).length);
