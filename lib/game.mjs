// One game in detail, from the official play-by-play: a readable play log,
// the score through the game, lead changes and runs, and assist connections.
import { flattenPlays } from './pbp.mjs';
import { formatName } from './parse.mjs';

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const POINTS = { '2FGM': 2, '3FGM': 3, FTM: 1 };
const LABEL = {
  '2FGM': 'Two-pointer made', '2FGA': 'Two-pointer missed', '3FGM': 'Three-pointer made', '3FGA': 'Three-pointer missed',
  FTM: 'Free throw made', FTA: 'Free throw missed', O: 'Offensive rebound', D: 'Defensive rebound', AS: 'Assist',
  TO: 'Turnover', ST: 'Steal', FV: 'Block', AG: 'Shot blocked', CM: 'Foul', RV: 'Foul drawn', OF: 'Offensive foul',
  IN: 'In', OUT: 'Out', TOUT: 'Timeout', TOUT_TV: 'TV timeout', BP: 'Start of period', EP: 'End of period', JB: 'Jump ball',
  CMU: 'Unsportsmanlike foul', CMT: 'Technical foul', CMD: 'Disqualifying foul', B: 'Bench foul', C: 'Coach foul', CCH: 'Coach challenge'
};
// Filter groups for the play-by-play
export const GROUP = {
  '2FGM': 'made', '3FGM': 'made', '2FGA': 'missed', '3FGA': 'missed', FTM: 'ft', FTA: 'ft', O: 'reb', D: 'reb', AS: 'ast',
  TO: 'tov', ST: 'tov', FV: 'blk', AG: 'blk', CM: 'foul', RV: 'foul', OF: 'foul', CMU: 'foul', CMT: 'foul', CMD: 'foul', B: 'foul', C: 'foul',
  IN: 'sub', OUT: 'sub', TOUT: 'timeout', TOUT_TV: 'timeout'
};

function clockText(raw, period) {
  const m = String(raw ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : (period <= 4 ? '10:00' : '05:00');
}

/**
 * Readable play log. Each play: [period, clock, side ('H'|'A'|''), playerId, typeCode, homeScore, awayScore]
 * Scores are the running score after the play. Built from our own count of made shots,
 * so it always agrees with the official final score for games that passed the box-score check.
 */
export function playLog(game, pbp) {
  const H = game.home.code, A = game.away.code;
  const raw = [];
  const keys = ['FirstQuarter', 'SecondQuarter', 'ThirdQuarter', 'ForthQuarter'];
  keys.forEach((k, i) => (pbp?.[k] || []).forEach((r) => raw.push({ r, period: i + 1 })));
  let ot = 4;
  for (const r of pbp?.ExtraTime || []) { if (trim(r.PLAYTYPE) === 'BP') ot++; raw.push({ r, period: Math.max(5, ot) }); }
  const flat = flattenPlays(pbp);
  let hs = 0, as = 0;
  const out = [], names = {};
  raw.forEach(({ r, period }, i) => {
    const type = trim(r.PLAYTYPE) || '';
    const team = trim(r.CODETEAM) || '';
    const side = team === H ? 'H' : team === A ? 'A' : '';
    const pid = trim(r.PLAYER_ID) || '';
    if (pid && r.PLAYER && !names[pid]) names[pid] = formatName(r.PLAYER);
    if (POINTS[type]) { if (side === 'H') hs += POINTS[type]; else if (side === 'A') as += POINTS[type]; }
    out.push([period, clockText(r.MARKERTIME, period), side, pid, type, hs, as, flat[i]?.t ?? 0]);
  });
  return { plays: out, names };
}

/** Lead changes, ties, biggest leads, longest scoring runs and the score-margin line for the flow chart. */
export function flowStats(plays) {
  let leader = 0, leadChanges = 0, ties = 0, maxH = 0, maxA = 0;
  let runSide = '', runPts = 0, best = { H: 0, A: 0 };
  let lastH = 0, lastA = 0, prevM = 0;
  const line = [[0, 0]];
  for (const [, , side, , type, hs, as, t] of plays) {
    if (!POINTS[type]) continue;
    const pts = (hs - lastH) + (as - lastA);
    lastH = hs; lastA = as;
    const m = hs - as;
    line.push([t, m]);
    const now = m > 0 ? 1 : m < 0 ? -1 : 0;
    // a tie is counted each time the game becomes level; a lead change each time a team goes ahead after the other team led last
    if (now === 0 && prevM !== 0) ties++;
    if (now !== 0 && leader !== 0 && now !== leader) leadChanges++;
    if (now !== 0) leader = now;
    prevM = m;
    maxH = Math.max(maxH, m); maxA = Math.max(maxA, -m);
    if (side === runSide) runPts += pts; else { runSide = side; runPts = pts; }
    if (side) best[side] = Math.max(best[side], runPts);
  }
  return { leadChanges, ties, maxLead: { H: maxH, A: maxA }, bestRun: best, line };
}

/** Assister → scorer pairs: an assist is credited to the made shot just before it by the same team. */
export function connections(plays) {
  const pairs = new Map();
  for (let i = 1; i < plays.length; i++) {
    const [, clock, side, pid, type] = plays[i];
    if (type !== 'AS' || !pid) continue;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      const [, c2, s2, p2, t2] = plays[j];
      if ((t2 === '2FGM' || t2 === '3FGM') && s2 === side && c2 === clock && p2) {
        const key = `${side}|${pid}|${p2}`;
        if (!pairs.has(key)) pairs.set(key, { side, from: pid, to: p2, n: 0, pts: 0 });
        const e = pairs.get(key); e.n++; e.pts += t2 === '3FGM' ? 3 : 2;
        break;
      }
    }
  }
  return [...pairs.values()].sort((a, b) => b.pts - a.pts || b.n - a.n);
}

export { LABEL };

/**
 * Offensive fouls (charges, illegal screens, push-offs: the feed does not tell them apart).
 * Each 'OF' is committed by one team and drawn by the other; the defender who drew it is the
 * 'RV' (foul drawn) entry recorded at the same moment.
 * Returns { committed: {H, A}, drawn: {H, A}, drawers: Map playerId -> count, events: [...] }
 * events[].side is the team that DREW the foul.
 */
export function offensiveFouls(plays) {
  const committed = { H: 0, A: 0 }, drawn = { H: 0, A: 0 }, drawers = new Map(), events = [];
  plays.forEach(([per, clock, side, pid, type, hs, as], i) => {
    if (type !== 'OF' || !side) return;
    const other = side === 'H' ? 'A' : 'H';
    committed[side]++; drawn[other]++;
    let by = null;
    for (let j = Math.max(0, i - 3); j <= Math.min(plays.length - 1, i + 3); j++) {
      const q = plays[j];
      if (q[4] === 'RV' && q[2] === other && q[0] === per && q[1] === clock && q[3]) { by = q[3]; drawers.set(by, (drawers.get(by) || 0) + 1); break; }
    }
    events.push({ period: per, clock, side: other, drawnBy: by, committedBy: pid || null, hs, as });
  });
  return { committed, drawn, drawers, events };
}

/** Details for the team comparison: ties and lead changes (who did it), points off turnovers, after steals, second chance. */
export function flowDetail(plays) {
  const ties = [], changes = [], pts = { H: { offTO: 0, afterSteal: 0, second: 0 }, A: { offTO: 0, afterSteal: 0, second: 0 } };
  const tag = { H: {}, A: {} };
  let lastH = 0, lastA = 0, prevM = 0, leader = 0, per = 0;
  for (const [period, clock, side, pid, type, hs, as] of plays) {
    if (side !== 'H' && side !== 'A') continue;
    if (period !== per) { per = period; tag.H = {}; tag.A = {}; }
    const op = side === 'H' ? 'A' : 'H';
    if (type === 'TO') tag[op] = { to: true, st: tag[op].st };
    else if (type === 'ST') tag[side] = { ...tag[side], to: true, st: true };
    else if (type === 'D') tag[side] = {};
    else if (type === 'O') tag[side] = { ...tag[side], sc: true };
    const p = POINTS[type];
    if (!p) continue;
    const got = (hs - lastH) + (as - lastA); lastH = hs; lastA = as;
    if (got > 0) {
      if (tag[side].to) pts[side].offTO += got;
      if (tag[side].st) pts[side].afterSteal += got;
      if (tag[side].sc) pts[side].second += got;
      tag[op] = {};
    }
    const m = hs - as, now = m > 0 ? 1 : m < 0 ? -1 : 0;
    const row = { period, clock, side, pid, type, hs, as };
    if (now === 0 && prevM !== 0) ties.push(row);
    if (now !== 0 && leader !== 0 && now !== leader) changes.push(row);
    if (now !== 0) leader = now;
    prevM = m;
  }
  return { ties, changes, pts };
}
