// Shared hex-grid geometry (pointy-top, "odd-r" offset rows). Row 0 is drawn at the bottom (player side).
// APPROX: the sim's world hex coords are assumed to be (col,row) offset coords on the same grid;
// fractional coords are interpolated (odd-row shift blended) for smooth movement.
const SQ3 = Math.sqrt(3);

export function boardDims(W, H, size) {
  return { width: (W + 0.5) * SQ3 * size, height: (H - 1) * 1.5 * size + 2 * size };
}

export function fitSize(W, H, cw, ch) {
  return Math.max(8, Math.min(cw / ((W + 0.5) * SQ3), ch / ((H - 1) * 1.5 + 2)));
}

function rowShift(row) {
  const r0 = Math.floor(row);
  const f = row - r0;
  const s0 = (r0 & 1) ? 0.5 : 0;
  const s1 = ((r0 + 1) & 1) ? 0.5 : 0;
  return s0 + (s1 - s0) * f;
}

export function hexCenter(col, row, size, H) {
  const w = SQ3 * size;
  return { x: w / 2 + (col + rowShift(row)) * w, y: (H - 1 - row) * 1.5 * size + size };
}

export function hexPath(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 90);
    const x = cx + size * Math.cos(a);
    const y = cy + size * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function boardInfo(data) {
  const b = data?.board || {};
  const W = b.width || 7;
  const H = b.height || 8;
  const playerRows = Array.isArray(b.playerRows) && b.playerRows.length ? b.playerRows : Array.from({ length: Math.floor(H / 2) }, (_, i) => i);
  return { W, H, playerRows };
}

/** Mirror stage enemies onto the upper-right enemy half of the stone circle. */
export function mirrorEnemies(enemies, H, playerRows) {
  const pr = new Set(playerRows);
  const allInPlayer = enemies.length && enemies.every((e) => e.y != null && pr.has(e.y));
  return enemies.map((e, i) => {
    let ny = e.y == null ? (H - 3 - Math.floor(i / 3)) : (allInPlayer ? H - 1 - e.y : e.y);
    if (ny < 5) ny = Math.min(H - 2, ny + 2);
    let nx = e.x == null ? (4 + (i % 2)) : e.x;
    if (enemies.length === 1 && nx <= 3) nx = 4;
    return { ...e, x: nx, y: ny };
  });
}
