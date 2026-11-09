// Layer rasters: slices drawn into bit grids so supports, brims and resin masks can use plain
// image operations (dilate, subtract, OR) instead of polygon booleans.

import type { Loop, P2 } from './geom2d';

export interface Grid { w: number; h: number; x0: number; y0: number; cell: number; bits: Uint8Array }

export const makeGrid = (x0: number, y0: number, x1: number, y1: number, cell: number): Grid => {
  const w = Math.max(1, Math.ceil((x1 - x0) / cell)), h = Math.max(1, Math.ceil((y1 - y0) / cell));
  return { w, h, x0, y0, cell, bits: new Uint8Array(w * h) };
};
export const blank = (g: Grid): Grid => ({ ...g, bits: new Uint8Array(g.w * g.h) });

/** Fill loops with the even-odd rule (holes stay empty), sampling each cell at its centre. */
export function rasterize(g: Grid, loops: Loop[]): Grid {
  const out = blank(g);
  for (let r = 0; r < g.h; r++) {
    const y = g.y0 + (r + 0.5) * g.cell; const xs: number[] = [];
    for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[j], b = l[i]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.cell - 0.5)), c1 = Math.min(g.w - 1, Math.floor((xs[k + 1] - g.x0) / g.cell - 0.5));
      for (let c = c0; c <= c1; c++) out.bits[r * g.w + c] = 1;
    }
  }
  return out;
}

/** Grow set cells by `rad` cells (square neighbourhood, separable). Negative shrinks. */
export function dilate(g: Grid, rad: number): Grid {
  if (rad === 0) return g;
  const shrink = rad < 0; const R = Math.abs(rad); const src = shrink ? g.bits.map(v => 1 - v) : g.bits;
  const tmp = new Uint8Array(g.w * g.h), out = new Uint8Array(g.w * g.h);
  for (let r = 0; r < g.h; r++) { let run = -1e9; for (let c = 0; c < g.w; c++) { if (src[r * g.w + c]) run = c; if (c - run <= R) tmp[r * g.w + c] = 1; } run = 1e9; for (let c = g.w - 1; c >= 0; c--) { if (src[r * g.w + c]) run = c; if (run - c <= R) tmp[r * g.w + c] = 1; } }
  for (let c = 0; c < g.w; c++) { let run = -1e9; for (let r = 0; r < g.h; r++) { if (tmp[r * g.w + c]) run = r; if (r - run <= R) out[r * g.w + c] = 1; } run = 1e9; for (let r = g.h - 1; r >= 0; r--) { if (tmp[r * g.w + c]) run = r; if (run - r <= R) out[r * g.w + c] = 1; } }
  return { ...g, bits: shrink ? out.map(v => 1 - v) : out };
}
export const or = (a: Grid, b: Grid): Grid => ({ ...a, bits: a.bits.map((v, i) => v | b.bits[i]) });
export const minus = (a: Grid, b: Grid): Grid => ({ ...a, bits: a.bits.map((v, i) => v & (1 - b.bits[i])) });
export const count = (g: Grid) => g.bits.reduce((s, v) => s + v, 0);

/** Zig-zag lines over set cells: every `every`-th row, alternating direction, along X or Y. */
export function hatch(g: Grid, spacing: number, alongY = false): P2[][] {
  const lines: P2[][] = []; const step = Math.max(1, Math.round(spacing / g.cell)); let flip = false;
  const n1 = alongY ? g.w : g.h, n2 = alongY ? g.h : g.w;
  for (let a = Math.floor(step / 2); a < n1; a += step) {
    const segs: P2[][] = []; let start = -1;
    for (let b = 0; b <= n2; b++) {
      const on = b < n2 && g.bits[alongY ? b * g.w + a : a * g.w + b] === 1;
      if (on && start < 0) start = b;
      if (!on && start >= 0) {
        if (b - start >= 2) {
          const p = (bb: number): P2 => alongY ? [g.x0 + (a + 0.5) * g.cell, g.y0 + bb * g.cell] : [g.x0 + bb * g.cell, g.y0 + (a + 0.5) * g.cell];
          segs.push([p(start + 0.5), p(b - 0.5)]);
        }
        start = -1;
      }
    }
    if (flip) segs.reverse().forEach(s => s.reverse()); flip = !flip; lines.push(...segs);
  }
  return lines;
}

/** Outline loops of set cells (marching squares on cell edges), for brims and previews. */
export function cellsToRects(g: Grid): Loop[] {
  // Merge runs per row into rectangles; good enough for previews and support footprints.
  const out: Loop[] = [];
  for (let r = 0; r < g.h; r++) {
    let s = -1;
    for (let c = 0; c <= g.w; c++) {
      const on = c < g.w && g.bits[r * g.w + c] === 1;
      if (on && s < 0) s = c;
      if (!on && s >= 0) { const x0 = g.x0 + s * g.cell, x1 = g.x0 + c * g.cell, y0 = g.y0 + r * g.cell, y1 = y0 + g.cell; out.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); s = -1; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- supports

export interface SupportOptions {
  /** Faces steeper than this from vertical need support (degrees). */
  overhang: number; layer: number; cell?: number;
  /** Horizontal gap kept between support and the part (mm). */
  xyGap?: number;
  /** Empty layers left between the top of the support and the part. */
  zGapLayers?: number;
  /** 'everywhere' rests support on the part too; 'buildplate' only grows from the bed. */
  mode?: 'everywhere' | 'buildplate';
}

/**
 * Support regions per layer. Working top-down: an overhang is the part of layer i+1 that layer i
 * (grown by the allowed overhang step) does not hold up. Support columns carry each overhang down
 * until they reach the bed, or rest on the part in 'everywhere' mode.
 */
export function supportGrids(layers: Array<{ z: number; loops: Loop[] }>, bounds: { min: P2; max: P2 }, o: SupportOptions): { grids: Grid[]; area: number[]; cell: number } {
  const cell = o.cell ?? 0.5; const pad = 4;
  const base = makeGrid(bounds.min[0] - pad, bounds.min[1] - pad, bounds.max[0] + pad, bounds.max[1] + pad, cell);
  const model = layers.map(L => rasterize(base, L.loops));
  const step = Math.max(0, Math.round(o.layer * Math.tan((90 - o.overhang) * Math.PI / 180) / cell)) || 0;
  const gap = Math.max(1, Math.round((o.xyGap ?? 0.7) / cell)); const zGap = o.zGapLayers ?? 1;
  const grids: Grid[] = layers.map(() => blank(base)); const cols: Grid[] = layers.map(() => blank(base));
  const ended: Grid[] = layers.map(() => blank(base)); const pending: Grid[] = []; // overhangs waiting out the z gap
  let col = blank(base);
  for (let i = layers.length - 2; i >= 0; i--) {
    const over = minus(model[i + 1], dilate(model[i], step));
    pending.unshift(over);
    // Overhangs join the column after the z gap.
    if (pending.length > zGap) col = or(col, pending.pop()!);
    ended[i] = { ...col, bits: col.bits.map((v, k) => v & model[i].bits[k]) }; // columns landing on the part here
    col = minus(col, model[i]);
    cols[i] = col; grids[i] = minus(col, dilate(model[i], gap));
  }
  if (o.mode === 'buildplate') {
    // Drop every column that lands on the part: walk up from each landing and clear it.
    let kill = blank(base);
    for (let i = 0; i < layers.length; i++) {
      if (i > 0) kill = or(kill, ended[i - 1]);
      kill = { ...kill, bits: kill.bits.map((v, k) => v & cols[i].bits[k]) };
      grids[i] = minus(grids[i], kill);
    }
  }
  return { grids, area: grids.map(g => count(g) * cell * cell), cell };
}

// ---------------------------------------------------------------- tree supports

export interface TreeNode { x: number; y: number; r: number }
interface Branch { x: number; y: number; r: number; alive: boolean; landed: boolean; nodes: Array<[number, number, number, number]>; feeds: Branch[] }

/**
 * Tree supports: contact points sampled on each overhang, carried down as branches that lean toward
 * their neighbours and merge (thickening as they join), steer around the part, and end on the bed
 * (or on the part in 'everywhere' mode). In 'buildplate' mode a branch that cannot avoid the part is
 * removed together with every branch that merged into it. Returns per-layer circles plus their raster.
 */
export function treeSupports(layers: Array<{ z: number; loops: Loop[] }>, bounds: { min: P2; max: P2 }, o: SupportOptions & { tip?: number; spacing?: number; angle?: number; maxRadius?: number }): { nodes: TreeNode[][]; grids: Grid[]; area: number[]; cell: number } {
  const cell = o.cell ?? 0.5; const pad = 6;
  const base = makeGrid(bounds.min[0] - pad, bounds.min[1] - pad, bounds.max[0] + pad, bounds.max[1] + pad, cell);
  const model = layers.map(L => rasterize(base, L.loops));
  const gapCells = Math.max(1, Math.round((o.xyGap ?? 0.7) / cell));
  const keepOut = model.map(m => dilate(m, gapCells));
  const step = Math.max(0, Math.round(o.layer * Math.tan((90 - o.overhang) * Math.PI / 180) / cell)) || 0;
  const zGap = o.zGapLayers ?? 1; const tip = o.tip ?? 0.8; const spacing = o.spacing ?? 2.5; const lean = o.layer * Math.tan((o.angle ?? 40) * Math.PI / 180); const maxR = o.maxRadius ?? 4;
  const grow = o.layer * Math.tan(4 * Math.PI / 180);
  const blocked = (g: Grid, x: number, y: number, r: number) => {
    const c0 = Math.floor((x - r - g.x0) / g.cell), c1 = Math.floor((x + r - g.x0) / g.cell), r0 = Math.floor((y - r - g.y0) / g.cell), r1 = Math.floor((y + r - g.y0) / g.cell);
    for (let rr = Math.max(0, r0); rr <= Math.min(g.h - 1, r1); rr++) for (let cc = Math.max(0, c0); cc <= Math.min(g.w - 1, c1); cc++) {
      const cx = g.x0 + (cc + 0.5) * g.cell, cy = g.y0 + (rr + 0.5) * g.cell; if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r && g.bits[rr * g.w + cc]) return true;
    }
    return false;
  };
  const branches: Branch[] = []; let live: Branch[] = [];
  const lattice = Math.max(1, Math.round(spacing / cell));
  for (let i = layers.length - 2; i >= 0; i--) {
    // New contact points under overhangs of layer i+1, starting zGap layers lower.
    const over = minus(model[i + 1], dilate(model[i], step)); const start = i - zGap + 1;
    if (start >= 0 && count(over) > 0) {
      let added = 0; let firstCell = -1;
      for (let r = 0; r < over.h; r++) for (let c = 0; c < over.w; c++) {
        if (!over.bits[r * over.w + c]) continue; if (firstCell < 0) firstCell = r * over.w + c;
        if (r % lattice || c % lattice) continue;
        const b: Branch = { x: base.x0 + (c + 0.5) * cell, y: base.y0 + (r + 0.5) * cell, r: tip, alive: true, landed: false, nodes: [], feeds: [] };
        b.nodes.push([start, b.x, b.y, b.r]); branches.push(b); live.push(b); added++;
      }
      if (!added && firstCell >= 0) { const b: Branch = { x: base.x0 + (firstCell % over.w + 0.5) * cell, y: base.y0 + (Math.floor(firstCell / over.w) + 0.5) * cell, r: tip, alive: true, landed: false, nodes: [[start, 0, 0, tip]], feeds: [] }; b.nodes[0][1] = b.x; b.nodes[0][2] = b.y; branches.push(b); live.push(b); }
    }
    // Carry every live branch from layer i+1 down to layer i (new ones already sit at their start layer).
    const L = i;
    for (const b of live) {
      if (b.nodes[b.nodes.length - 1][0] <= L) continue; // just created at or below this layer
      // Lean toward the nearest other branch to merge, and grow slightly.
      let tx = b.x, ty = b.y, bd = Infinity;
      for (const q of live) { if (q === b) continue; const d = Math.hypot(q.x - b.x, q.y - b.y); if (d < bd && d < 12) { bd = d; tx = q.x; ty = q.y; } }
      let nx = b.x, ny = b.y; if (bd < Infinity) { const d = Math.max(1e-9, bd); const m = Math.min(lean, d / 2); nx += (tx - b.x) / d * m; ny += (ty - b.y) / d * m; }
      const nr = Math.min(maxR, b.r + grow);
      if (blocked(keepOut[L], nx, ny, nr)) {
        // Steer: try eight directions at growing distances; otherwise this branch ends here.
        let moved = false;
        for (const dist of [lean, lean * 2, lean * 3]) {
          for (let k = 0; k < 8 && !moved; k++) { const ax = b.x + Math.cos(k * Math.PI / 4) * dist, ay = b.y + Math.sin(k * Math.PI / 4) * dist; if (!blocked(keepOut[L], ax, ay, nr)) { nx = ax; ny = ay; moved = true; } }
          if (moved) break;
        }
        if (!moved) { b.alive = false; b.landed = true; continue; }
      }
      b.x = nx; b.y = ny; b.r = nr; b.nodes.push([L, nx, ny, nr]);
    }
    live = live.filter(b => b.alive);
    // Merge branches that touch: the survivor takes the area-weighted position and combined section.
    for (let a = 0; a < live.length; a++) for (let c = a + 1; c < live.length; c++) {
      const p = live[a], q = live[c]; if (!p.alive || !q.alive) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) < (p.r + q.r) * 0.5) {
        const wp = p.r * p.r, wq = q.r * q.r; p.x = (p.x * wp + q.x * wq) / (wp + wq); p.y = (p.y * wp + q.y * wq) / (wp + wq); p.r = Math.min(maxR, Math.sqrt(wp + wq));
        const last = p.nodes[p.nodes.length - 1]; if (last[0] === L) { last[1] = p.x; last[2] = p.y; last[3] = p.r; }
        q.alive = false; p.feeds.push(q);
      }
    }
    live = live.filter(b => b.alive);
  }
  // Build-plate-only: drop every branch resting on the part, and everything feeding it.
  if (o.mode === 'buildplate') {
    const kill = (b: Branch) => { b.nodes = []; for (const f of b.feeds) kill(f); };
    for (const b of branches) if (b.landed) kill(b);
  }
  const nodes: TreeNode[][] = layers.map(() => []);
  for (const b of branches) for (const [l, x, y, r] of b.nodes) if (l >= 0 && l < layers.length) nodes[l].push({ x, y, r });
  const grids = nodes.map((list, l) => {
    const g = blank(base);
    for (const n of list) {
      const c0 = Math.max(0, Math.floor((n.x - n.r - g.x0) / cell)), c1 = Math.min(g.w - 1, Math.floor((n.x + n.r - g.x0) / cell));
      const r0 = Math.max(0, Math.floor((n.y - n.r - g.y0) / cell)), r1 = Math.min(g.h - 1, Math.floor((n.y + n.r - g.y0) / cell));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) { const cx = g.x0 + (cc + 0.5) * cell, cy = g.y0 + (rr + 0.5) * cell; if ((cx - n.x) ** 2 + (cy - n.y) ** 2 <= n.r * n.r) g.bits[rr * g.w + cc] = 1; }
    }
    return minus(g, keepOut[l]);
  });
  return { nodes, grids, area: grids.map(g => count(g) * cell * cell), cell };
}
