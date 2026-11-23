// Player details (age, height, position, nationality) from the official
// EuroLeague roster feed. Photos are deliberately not stored or used.

/** Box-score ids look like "P007200   ", roster codes like "007200". */
export const normId = (v) => String(v ?? '').trim().replace(/^P/i, '').toUpperCase();

const normName = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/** Raw roster feed -> slim list of players (no images). */
export function slimPeople(raw) {
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.people) ? raw.people : [];
  return rows
    .filter((e) => e?.type === 'J' && e.person)
    .map((e) => ({
      code: String(e.person.code ?? '').trim(),
      name: e.person.name || '',
      birthDate: e.person.birthDate ? String(e.person.birthDate).slice(0, 10) : null,
      height: Number(e.person.height) || null,
      weight: Number(e.person.weight) || null,
      country: e.person.country?.name || null,
      birthCountry: e.person.birthCountry?.name || null,
      position: e.positionName || null,
      dorsal: e.dorsal ? String(e.dorsal).trim() : null,
      club: e.club?.code || null,
      active: e.active !== false,
      startDate: e.startDate ? String(e.startDate).slice(0, 10) : null
    }));
}

/**
 * Index the roster. A player can appear more than once (e.g. after a transfer);
 * the active entry, then the most recent one, wins.
 */
export function indexPeople(list) {
  const byId = new Map(), byName = new Map();
  const better = (a, b) => (!a ? b : (b.active && !a.active) || (b.active === a.active && (b.startDate || '') > (a.startDate || '')) ? b : a);
  for (const p of list || []) {
    const id = normId(p.code);
    if (id) byId.set(id, better(byId.get(id), p));
    const n = normName(p.name);
    if (n) byName.set(n, better(byName.get(n), p));
  }
  return { byId, byName };
}

/** Find the roster entry for a box-score player: by id first, then by exact name. */
export function findPerson(index, player) {
  return index.byId.get(normId(player.id)) || index.byName.get(normName(player.rawName || '')) || null;
}

/** Age in whole years on a given date ("YYYY-MM-DD"). */
export function ageOn(birthDate, onDate) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 14 && age <= 60 ? age : null;
}
