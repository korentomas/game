export type SaveState = { x: number; y: number; z: number; visited: string[] };

const KEY_PREFIX = 'voxel_ship_seed_';

export function loadState(seed: string): SaveState | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + seed);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(seed: string, pos: { x: number; y: number; z: number }) {
  const current = loadState(seed) ?? { x: 0, y: 0, z: 0, visited: [] };
  current.x = pos.x; current.y = pos.y; current.z = pos.z;
  try {
    localStorage.setItem(KEY_PREFIX + seed, JSON.stringify(current));
  } catch {}
}

export function recordVisitedChunk(seed: string, cx: number, cz: number) {
  const current = loadState(seed) ?? { x: 0, y: 0, z: 0, visited: [] };
  const k = `${cx},${cz}`;
  if (!current.visited.includes(k)) current.visited.push(k);
  try {
    localStorage.setItem(KEY_PREFIX + seed, JSON.stringify(current));
  } catch {}
}
