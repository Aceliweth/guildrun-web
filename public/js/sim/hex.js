// 7x8 Odd-R Hex Grid utilities, world coordinate mapping, AoE collisors, and backwards multi-source Dijkstra pathfinding.

export const BOARD_WIDTH = 7;
export const BOARD_HEIGHT = 8;
const SQRT3 = Math.sqrt(3);
const CELL_INNER_RADIUS = 0.8660254037844386; // sqrt(3)/2
const CELL_OUTER_RADIUS = 1.0;

// Odd-R neighbor offsets: [dx, dy]
// HexDirection enum: 1:Left, 2:TopLeft, 3:TopRight, 4:Right, 5:DownRight, 6:DownLeft
const EVEN_ROW_NEIGHBORS = [
  [-1, 0],  // Left
  [-1, 1],  // TopLeft
  [0, 1],   // TopRight
  [1, 0],   // Right
  [0, -1],  // DownRight
  [-1, -1], // DownLeft
];

const ODD_ROW_NEIGHBORS = [
  [-1, 0],  // Left
  [0, 1],   // TopLeft
  [1, 1],   // TopRight
  [1, 0],   // Right
  [1, -1],  // DownRight
  [0, -1],  // DownLeft
];

export function toAxial(x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const q = ix - ((iy - (iy & 1)) >> 1);
  const r = iy;
  return { q, r };
}

export function hexDistanceCoords(ax, ay, bx, by) {
  const ix1 = Math.round(ax);
  const iy1 = Math.round(ay);
  const ix2 = Math.round(bx);
  const iy2 = Math.round(by);
  const aq = ix1 - ((iy1 - (iy1 & 1)) >> 1);
  const ar = iy1;
  const bq = ix2 - ((iy2 - (iy2 & 1)) >> 1);
  const br = iy2;
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) >> 1;
}

export function hexDistance(a, b) {
  if (!a || !b) return 999;
  const ax = a.cellX ?? a.x ?? 0;
  const ay = a.cellY ?? a.y ?? 0;
  const bx = b.cellX ?? b.x ?? 0;
  const by = b.cellY ?? b.y ?? 0;
  return hexDistanceCoords(ax, ay, bx, by);
}

export function cellToWorld(x, y) {
  // Smoothly blend odd-row shift when y is fractional
  const r0 = Math.floor(y);
  const frac = y - r0;
  const shift0 = (r0 & 1) !== 0 ? CELL_INNER_RADIUS : 0;
  const shift1 = ((r0 + 1) & 1) !== 0 ? CELL_INNER_RADIUS : 0;
  const xOffset = shift0 + (shift1 - shift0) * frac;
  const worldX = x * (CELL_INNER_RADIUS * 2) + xOffset;
  const worldZ = y * (CELL_OUTER_RADIUS * 1.5);
  return { x: worldX, z: worldZ };
}

export function worldDistanceSq(a, b) {
  const wa = cellToWorld(a.x ?? a.cellX ?? 0, a.y ?? a.cellY ?? 0);
  const wb = cellToWorld(b.x ?? b.cellX ?? 0, b.y ?? b.cellY ?? 0);
  const dx = wa.x - wb.x;
  const dz = wa.z - wb.z;
  return dx * dx + dz * dz;
}

export function isValidCell(x, y, width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function getNeighbors(x, y, width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const offsets = (iy & 1) !== 0 ? ODD_ROW_NEIGHBORS : EVEN_ROW_NEIGHBORS;
  const res = [];
  for (let i = 0; i < 6; i++) {
    const nx = ix + offsets[i][0];
    const ny = iy + offsets[i][1];
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      res.push({ x: nx, y: ny, dir: i + 1 });
    }
  }
  return res;
}

export function buildBlockedSet(units, ignoreUid = null) {
  const blocked = new Set();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u || u.hp <= 0 || u.state === 'Dead' || u.uid === ignoreUid) continue;
    blocked.add(`${u.cellX},${u.cellY}`);
    if (u.nextCellX != null && u.nextCellY != null) {
      blocked.add(`${u.nextCellX},${u.nextCellY}`);
    }
  }
  return blocked;
}

export function findNearestAvailableCell(prefX, prefY, units, width = BOARD_WIDTH, height = BOARD_HEIGHT, ignoreUid = null) {
  const blocked = buildBlockedSet(units, ignoreUid);
  const cx = Math.max(0, Math.min(width - 1, Math.round(prefX)));
  const cy = Math.max(0, Math.min(height - 1, Math.round(prefY)));
  if (!blocked.has(`${cx},${cy}`)) return { x: cx, y: cy };

  let best = null;
  let bestDist = 999;
  let bestWorldDist = Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (blocked.has(`${x},${y}`)) continue;
      const hd = hexDistanceCoords(cx, cy, x, y);
      const wd = worldDistanceSq({ x: cx, y: cy }, { x, y });
      if (hd < bestDist || (hd === bestDist && wd < bestWorldDist)) {
        bestDist = hd;
        bestWorldDist = wd;
        best = { x, y };
      }
    }
  }
  return best || { x: cx, y: cy };
}

/**
 * Backwards multi-source Dijkstra / BFS pathfinding into attack range of target,
 * with greedy hex step fallback if all in-range cells are currently blocked.
 */
export function findNextStep(entity, target, units, width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  const startX = entity.cellX;
  const startY = entity.cellY;
  const targetX = target.cellX;
  const targetY = target.cellY;
  const range = Math.max(1, Math.round(entity.stats?.AttackRange || 1));

  if (hexDistanceCoords(startX, startY, targetX, targetY) <= range) {
    return null;
  }

  const blocked = buildBlockedSet(units, entity.uid);
  const startKey = `${startX},${startY}`;

  // Collect all unblocked cells within AttackRange of target
  const distMap = new Map();
  const queue = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (key !== startKey && blocked.has(key)) continue;
      if (hexDistanceCoords(x, y, targetX, targetY) <= range) {
        distMap.set(key, 0);
        queue.push({ x, y, d: 0 });
      }
    }
  }

  // Multi-source BFS backwards toward start
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.x === startX && cur.y === startY) break;
    const neighbors = getNeighbors(cur.x, cur.y, width, height);
    for (let i = 0; i < neighbors.length; i++) {
      const nb = neighbors[i];
      const nKey = `${nb.x},${nb.y}`;
      if (nKey !== startKey && blocked.has(nKey)) continue;
      if (!distMap.has(nKey)) {
        distMap.set(nKey, cur.d + 1);
        queue.push({ x: nb.x, y: nb.y, d: cur.d + 1 });
      }
    }
  }

  // Pick neighbor of start with smallest BFS distance (tie-break by Euclidean world distance to target)
  const startNeighbors = getNeighbors(startX, startY, width, height);
  let bestStep = null;
  let bestBfs = Infinity;
  let bestWorld = Infinity;

  for (let i = 0; i < startNeighbors.length; i++) {
    const nb = startNeighbors[i];
    const nKey = `${nb.x},${nb.y}`;
    if (blocked.has(nKey)) continue;
    const d = distMap.get(nKey);
    if (d !== undefined) {
      const wd = worldDistanceSq(nb, { x: targetX, y: targetY });
      if (d < bestBfs || (d === bestBfs && wd < bestWorld)) {
        bestBfs = d;
        bestWorld = wd;
        bestStep = { x: nb.x, y: nb.y };
      }
    }
  }

  if (bestStep) return bestStep;

  // Greedy fallback when target is completely surrounded
  const curHexDist = hexDistanceCoords(startX, startY, targetX, targetY);
  let greedyStep = null;
  let bestHex = curHexDist;
  let greedyWorld = worldDistanceSq({ x: startX, y: startY }, { x: targetX, y: targetY });

  for (let i = 0; i < startNeighbors.length; i++) {
    const nb = startNeighbors[i];
    if (blocked.has(`${nb.x},${nb.y}`)) continue;
    const hd = hexDistanceCoords(nb.x, nb.y, targetX, targetY);
    const wd = worldDistanceSq(nb, { x: targetX, y: targetY });
    if (hd < bestHex || (hd === bestHex && wd < greedyWorld)) {
      bestHex = hd;
      greedyWorld = wd;
      greedyStep = { x: nb.x, y: nb.y };
    }
  }

  return greedyStep;
}

/**
 * Checks if `unit` is inside `aoeEntry` centered at `centerCell` ({x, y}).
 */
export function isUnitInsideAoe(unit, centerCell, aoeEntry) {
  if (!unit || unit.hp <= 0 || !centerCell) return false;
  if (!aoeEntry || !Array.isArray(aoeEntry.Collisors) || aoeEntry.Collisors.length === 0) {
    return hexDistanceCoords(unit.x, unit.y, centerCell.x, centerCell.y) <= 2;
  }

  const uw = cellToWorld(unit.x, unit.y);
  const cw = cellToWorld(centerCell.x, centerCell.y);

  for (let i = 0; i < aoeEntry.Collisors.length; i++) {
    const col = aoeEntry.Collisors[i];
    const cType = col.CollisorType || col.type;
    const ox = col.Center?.X || 0;
    const oz = col.Center?.Y || 0;
    const dx = uw.x - (cw.x + ox);
    const dz = uw.z - (cw.z + oz);

    if (cType === 'Circle' || cType === 'CircleCollisor') {
      // Convert world radius (where 1 hex width = sqrt(3) ~ 1.732)
      const r = (col.Radius || 2.0) * 1.15;
      if (dx * dx + dz * dz <= r * r) return true;
    } else if (cType === 'Rect' || cType === 'RectCollisor') {
      const halfW = ((col.Size?.X || 4.0) * 1.15) / 2;
      const halfH = ((col.Size?.Y || 4.0) * 1.15) / 2;
      if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfH) return true;
    }
  }
  return false;
}
