// Shot zones (browser-safe: used by the site build and by the live page).
export const ZONES = [
  ['rim', 'At the rim (restricted area)'], ['paint', 'Paint (not at the rim)'], ['mid', 'Mid-range'], ['c3', 'Corner 3'], ['ab3', 'Above-the-break 3']
];
// finer zones for the chart badges: [key, group, label x, label y]
export const SUB = [['rim', 'rim', 0, 40], ['paint', 'paint', 0, 290], ['midL', 'mid', -470, 200], ['midC', 'mid', 0, 520], ['midR', 'mid', 470, 200],
  ['c3L', 'c3', -645, -40], ['c3R', 'c3', 645, -40], ['ab3L', 'ab3', -560, 600], ['ab3C', 'ab3', 0, 820], ['ab3R', 'ab3', 560, 600]];

export function zoneOf(x, y, is3) {
  const ang = Math.atan2(x, Math.max(y, 1)) * 180 / Math.PI;
  if (is3) { if (y <= 150 && Math.abs(x) >= 600) return x < 0 ? 'c3L' : 'c3R'; return Math.abs(ang) <= 25 ? 'ab3C' : ang < 0 ? 'ab3L' : 'ab3R'; }
  if (Math.hypot(x, y) <= 125) return 'rim';
  if (Math.abs(x) <= 245 && y <= 422) return 'paint';
  return Math.abs(ang) <= 25 ? 'midC' : ang < 0 ? 'midL' : 'midR';
}
export const groupOf = (sub) => SUB.find((s) => s[0] === sub)?.[1] || sub;

