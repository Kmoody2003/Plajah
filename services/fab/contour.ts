// Iso-contours of a scalar field over the plane: marching squares on a sampled grid, each crossing then
// refined by bisection on the exact function, so contours are as accurate as the function itself.
// Used by waterline finishing (the drop-cutter height) and adaptive clearing (distance to the walls).

import type { Loop, P2 } from './geom2d';

export interface FieldGrid { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number; v: Float64Array }
export interface Box { x0: number; y0: number; x1: number; y1: number }

export function sampleGrid(fn: (x: number, y: number) => number, box: Box, res: number): FieldGrid {
  const nx = Math.max(2, Math.ceil((box.x1 - box.x0) / res) + 1), ny = Math.max(2, Math.ceil((box.y1 - box.y0) / res) + 1);
  const dx = (box.x1 - box.x0) / (nx - 1), dy = (box.y1 - box.y0) / (ny - 1); const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fn(box.x0 + i * dx, box.y0 + j * dy);
  return { nx, ny, x0: box.x0, y0: box.y0, dx, dy, v };
}

/** Closed contours of fn = level around the region fn > level, with that region on their left
 *  (outer contours counter-clockwise, holes clockwise). The grid rim counts as outside, so every contour closes. */
export function contoursOf(G: FieldGrid, fn: (x: number, y: number) => number, level: number, tol = 1e-5): Loop[] {
  const { nx, ny } = G; const X = (i: number) => G.x0 + i * G.dx, Y = (j: number) => G.y0 + j * G.dy;
  const inside = (i: number, j: number) => i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && G.v[j * nx + i] > level;
  const memo = new Map<string, P2>();
  const ek = (i0: number, j0: number, i1: number, j1: number) => (i0 < i1 || j0 < j1 ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`);
  const cross = (i0: number, j0: number, i1: number, j1: number): P2 => {
    const key = ek(i0, j0, i1, j1); const got = memo.get(key); if (got) return got;
    let a: P2 = [X(i0), Y(j0)], b: P2 = [X(i1), Y(j1)]; if (!inside(i0, j0)) [a, b] = [b, a];
    for (let it = 0; it < 30; it++) { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < tol) break; const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (fn(m[0], m[1]) > level) a = m; else b = m; }
    const p: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; memo.set(key, p); return p;
  };
  const segs: Array<[P2, P2, string, string]> = [];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const; const In = c.map(([a, b]) => inside(a, b));
    if (In.every(Boolean) || !In.some(Boolean)) continue;
    const key = (k: number) => { const A = c[E[k][0]], B = c[E[k][1]]; return ek(A[0], A[1], B[0], B[1]); };
    const pt = (k: number) => { const A = c[E[k][0]], B = c[E[k][1]]; return cross(A[0], A[1], B[0], B[1]); };
    // Corners run counter-clockwise; a contour enters where outside turns to inside and leaves at the next
    // inside-to-outside edge, so saddles keep their inside corners apart.
    const outs: number[] = [], ins: number[] = [];
    for (let k = 0; k < 4; k++) { const a = In[E[k][0]], b = In[E[k][1]]; if (a && !b) outs.push(k); else if (!a && b) ins.push(k); }
    for (const k of ins) { let m = (k + 1) % 4; while (!outs.includes(m)) m = (m + 1) % 4; segs.push([pt(m), pt(k), key(m), key(k)]); }
  }
  const byStart = new Map<string, number>(); segs.forEach((s, i) => byStart.set(s[2], i));
  const used = new Uint8Array(segs.length); const loops: Loop[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; const loop: Loop = []; let k: number | undefined = i;
    while (k !== undefined && !used[k]) { used[k] = 1; loop.push(segs[k][0]); k = byStart.get(segs[k][3]); }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
