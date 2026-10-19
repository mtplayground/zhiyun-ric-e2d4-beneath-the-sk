/** Face-local normalized units. Shared by generator diagnostics and pose fallback. */
export const POSITION_TOLERANCE = 1e-6;

/** Connected components under Euclidean proximity; checks neighboring hash cells. */
export function positionGroups(positions, tolerance = POSITION_TOLERANCE) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Invalid position tolerance');
  const parent = positions.map((_, i) => i), cells = new Map();
  const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  positions.forEach((p, i) => {
    if (p.length !== 3 || !p.every(Number.isFinite)) throw new Error('Invalid position');
    const cell = p.map(v => Math.floor(v / tolerance));
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      for (const j of cells.get([cell[0]+x,cell[1]+y,cell[2]+z].join(',')) ?? []) {
        if (Math.hypot(...p.map((v,k) => v-positions[j][k])) <= tolerance) parent[root(i)] = root(j);
      }
    }
    const key = cell.join(',');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const groups = new Map();
  positions.forEach((_, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  return [...groups.values()];
}
