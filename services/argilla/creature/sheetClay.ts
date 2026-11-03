/**
 * sheetClay.ts — a character sheet into clay.
 *
 * A sheet shows the same body from several sides, and the body has to fit every outline at once. Each height is
 * built as rounded sections sized from what the views show there.
 * That is real geometry from real views, where a single picture can only guess at the back.
 */

import { BRICK_STRIDE, BRICK_VOXELS } from '../brickPool';
import type { ClayFieldSnapshot } from '../engine';
import { blur, distanceSquared, largestShape, sample } from '../pictureClay';

export interface SheetView { u0: number; v0: number; u1: number; v1: number; role: 'front' | 'side' | 'back' }

/** Finds the figures on a sheet: separate columns of subject that are about as tall as each other. */
export function detectViews(mask: Float32Array, size: number, aspect: number): SheetView[] {
  const columns = new Int32Array(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mask[x + y * size] >= 0.5) columns[x]++;
  const runs: { x0: number; x1: number; v0: number; v1: number; area: number }[] = [];
  const noise = size * 0.01;
  let start = -1;
  for (let x = 0; x <= size; x++) {
    const on = x < size && columns[x] > noise;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      let y0 = size, y1 = 0, area = 0;
      for (let cx = start; cx < x; cx++) for (let y = 0; y < size; y++) if (mask[cx + y * size] >= 0.5) { area++; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      runs.push({ x0: start, x1: x, v0: y0 / size, v1: (y1 + 1) / size, area });
      start = -1;
    }
  }
  const tallest = Math.max(0, ...runs.map((r) => r.v1 - r.v0));
  const figures = runs
    .filter((r) => r.x1 - r.x0 > size * 0.03 && r.v1 - r.v0 > tallest * 0.6)
    .sort((a, b) => b.area - a.area).slice(0, 3)
    .sort((a, b) => a.x0 - b.x0);
  if (figures.length < 2) return [];
  void aspect;
  // The side view is the narrowest figure. Of the others, sheets put the front first.
  const narrowest = figures.reduce((best, r) => (r.x1 - r.x0 < best.x1 - best.x0 ? r : best));
  const rest = figures.filter((r) => r !== narrowest);
  const view = (r: (typeof figures)[number], role: SheetView['role']): SheetView => ({ u0: r.x0 / size, u1: r.x1 / size, v0: r.v0, v1: r.v1, role });
  return [view(rest[0], 'front'), view(narrowest, 'side'), ...(rest[1] ? [view(rest[1], 'back')] : [])];
}

export interface SheetBox { u0: number; v0: number; u1: number; v1: number; role: SheetView['role'] }

/**
 * Finds a designed sheet's framed panels from their straight lines, and keeps the tall ones: close-ups and material
 * swatches are wider than a standing figure. Falls back to even thirds, and the person can always move the boxes.
 */
export function suggestBoxes(gray: Float32Array, width: number, height: number): SheetBox[] {
  const edgeX = (x: number, y: number) => Math.abs(gray[x + 1 + y * width] - gray[x + y * width]) > 0.035;
  const edgeY = (x: number, y: number) => Math.abs(gray[x + (y + 1) * width] - gray[x + y * width]) > 0.035;
  const peaks = (values: number[], need: number) => {
    const out: number[] = [];
    values.forEach((v, i) => { if (v >= need && (!out.length || i - out[out.length - 1] > 3)) out.push(i); });
    // A detailed picture is full of edges, and every pair of pairs gets tested: only the strongest lines can be frames.
    return out.sort((a, b) => values[b] - values[a]).slice(0, 12).sort((a, b) => a - b);
  };
  const columns = Array.from({ length: width - 1 }, (_, x) => { let n = 0; for (let y = 0; y < height; y++) if (edgeX(x, y)) n++; return n; });
  const rows = Array.from({ length: height - 1 }, (_, y) => { let n = 0; for (let x = 0; x < width; x++) if (edgeY(x, y)) n++; return n; });
  const xs = peaks(columns, height * 0.2), ys = peaks(rows, width * 0.15);
  // How much of a line really is there along a stretch: a frame is unbroken, a figure's edge is not.
  // A gap in a line means two panels side by side, not one big one, so any real break disqualifies it.
  const solid = (from: number, to: number, on: (i: number) => boolean) => {
    const allowed = Math.max(3, (to - from) * 0.012);
    let n = 0, gap = 0;
    for (let i = from; i < to; i++) { if (on(i)) { n++; gap = 0; } else if (++gap > allowed) return 0; }
    return n / Math.max(1, to - from);
  };
  const vLine = (x: number, y0: number, y1: number) => solid(y0, y1, (y) => edgeX(x, y) || edgeX(Math.max(0, x - 1), y) || edgeX(Math.min(width - 2, x + 1), y));
  const hLine = (y: number, x0: number, x1: number) => solid(x0, x1, (x) => edgeY(x, y) || edgeY(x, Math.max(0, y - 1)) || edgeY(x, Math.min(height - 2, y + 1)));
  const panels: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) for (let c = 0; c < ys.length; c++) for (let d = c + 1; d < ys.length; d++) {
    const x0 = xs[a], x1 = xs[b], y0 = ys[c], y1 = ys[d];
    const w = x1 - x0, h = y1 - y0;
    if (w < width * 0.12 || h < height * 0.25 || h < w * 0.9) continue;
    if (vLine(x0, y0, y1) > 0.7 && vLine(x1, y0, y1) > 0.7 && hLine(y0, x0, x1) > 0.7 && hLine(y1, x0, x1) > 0.7) panels.push({ x0, x1, y0, y1 });
  }
  // Largest first, skipping anything that overlaps a panel already taken.
  panels.sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0));
  const kept: typeof panels = [];
  for (const p of panels) if (!kept.some((k) => p.x0 < k.x1 && k.x0 < p.x1 && p.y0 < k.y1 && k.y0 < p.y1)) kept.push(p);
  const three = kept.slice(0, 3).sort((p, q) => p.x0 - q.x0);
  if (three.length < 2) {
    return [
      { role: 'front', u0: 0.02, v0: 0.05, u1: 0.33, v1: 0.95 },
      { role: 'side', u0: 0.35, v0: 0.05, u1: 0.65, v1: 0.95 },
      { role: 'back', u0: 0.67, v0: 0.05, u1: 0.98, v1: 0.95 },
    ];
  }
  const narrowest = three.reduce((best, p) => (p.x1 - p.x0 < best.x1 - best.x0 ? p : best));
  const rest = three.filter((p) => p !== narrowest);
  const box = (p: (typeof panels)[number], role: SheetView['role']): SheetBox => ({ role, u0: p.x0 / width, u1: p.x1 / width, v0: p.y0 / height, v1: p.y1 / height });
  const found = [box(rest[0], 'front'), box(narrowest, 'side'), ...(rest[1] ? [box(rest[1], 'back')] : [])];
  // A fainter frame can be missed. Room beside the side panel, at its height, is usually the back view.
  if (!rest[1] && rest[0].x0 < narrowest.x0) {
    const side = found[1];
    const room = 0.98 - side.u1;
    if (room >= (side.u1 - side.u0) * 0.8) found.push({ role: 'back', u0: side.u1 + 0.008, u1: 0.98, v0: side.v0, v1: side.v1 });
  }
  return found;
}

/** Lays per-view cut-outs into one map, and tightens each view to its figure. */
export function composeViews(cuts: { box: SheetBox; mask: Float32Array; size: number }[], size: number): { mask: Float32Array; views: SheetView[] } {
  const mask = new Float32Array(size * size);
  const views: SheetView[] = [];
  for (const { box, mask: cut, size: cutSize } of cuts) {
    const shape = largestShape(cut, cutSize);
    if (!shape) throw new Error(`Nothing clear was found in the ${box.role} box.`);
    const x0 = Math.floor(box.u0 * size), x1 = Math.ceil(box.u1 * size), y0 = Math.floor(box.v0 * size), y1 = Math.ceil(box.v1 * size);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - x0) / (x1 - x0), v = (y + 0.5 - y0) / (y1 - y0);
      const cx = Math.min(cutSize - 1, Math.floor(u * cutSize)), cy = Math.min(cutSize - 1, Math.floor(v * cutSize));
      mask[x + y * size] = shape.label[cx + cy * cutSize] === shape.best ? 1 : 0;
    }
    const w = box.u1 - box.u0, h = box.v1 - box.v0;
    views.push({ role: box.role, u0: box.u0 + shape.u0 * w, u1: box.u0 + shape.u1 * w, v0: box.v0 + shape.v0 * h, v1: box.v0 + shape.v1 * h });
  }
  return { mask, views };
}

interface Form {
  /** Signed distance to the outline in this view's plane. */
  S: Float32Array;
  /** Half-width and middle of the stretch of body each pixel's row passes through. */
  A: Float32Array;
  C: Float32Array;
  centre: number;
}

const M = 256;
/** A carved body keeps real surface on all sides and costs more bricks than a plan's, so it stands a little smaller. */
export const SHEET_FLOOR = -0.72, SHEET_TOP = 0.72;
const FLOOR = SHEET_FLOOR, TOP = SHEET_TOP;

/** One view at a shared scale: every figure on a sheet spans the same height. */
function formFromView(mask: Float32Array, size: number, aspect: number, view: SheetView): Form {
  const box = new Float32Array(size * size);
  for (let y = Math.floor(view.v0 * size); y < Math.ceil(view.v1 * size); y++) {
    for (let x = Math.floor(view.u0 * size); x < Math.ceil(view.u1 * size); x++) box[x + y * size] = mask[x + y * size];
  }
  const shape = largestShape(box, size);
  if (!shape) throw new Error('One of the views on this sheet could not be read.');
  const scale = (TOP - FLOOR) / (shape.v1 - shape.v0);
  const uc = (shape.u0 + shape.u1) / 2;
  const pixel = 2 / M;
  const inside = new Uint8Array(M * M);
  const keep = new Float32Array(size * size);
  for (let i = 0; i < keep.length; i++) keep[i] = shape.label[i] === shape.best ? 1 : 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = (i + 0.5) * pixel - 1, y = 1 - (j + 0.5) * pixel;
    const u = uc + x / (scale * aspect), v = shape.v0 + (TOP - y) / scale;
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    inside[i + j * M] = sample(keep, size, u, v) >= 0.5 ? 1 : 0;
  }
  const toInside = distanceSquared((i) => !inside[i], M);
  const toOutside = distanceSquared((i) => !!inside[i], M);
  const signed = new Float32Array(M * M);
  for (let i = 0; i < signed.length; i++) signed[i] = (Math.sqrt(toOutside[i]) - Math.sqrt(toInside[i])) * pixel;
  // Smoothing the outline drops thin clutter like chains and frays, which aren't body.
  const S = blur(signed, M, 8);
  for (let i = 0; i < inside.length; i++) inside[i] = S[i] < 0 ? 1 : 0;

  // Each row is split into runs of body. Empty pixels take the nearest run, so the values never jump at a rim.
  const A = new Float32Array(M * M), C = new Float32Array(M * M);
  let sum = 0, n = 0;
  for (let j = 0; j < M; j++) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= M; i++) {
      const on = i < M && inside[i + j * M];
      if (on && start < 0) start = i;
      if (!on && start >= 0) { runs.push([start, i]); start = -1; }
    }
    if (!runs.length) continue;
    for (let i = 0; i < M; i++) {
      let best = runs[0], gap = Infinity;
      for (const run of runs) {
        const d = i < run[0] ? run[0] - i : i >= run[1] ? i - run[1] + 1 : 0;
        if (d < gap) { gap = d; best = run; }
      }
      A[i + j * M] = ((best[1] - best[0]) / 2) * pixel;
      C[i + j * M] = ((best[0] + best[1]) / 2) * pixel - 1;
      if (inside[i + j * M]) { sum += (i + 0.5) * pixel - 1; n++; }
    }
  }
  // Rows with no body borrow from the row beside them, then everything is eased: a hard change row to row is a rib.
  for (let j = 1; j < M; j++) for (let i = 0; i < M; i++) if (!A[i + j * M] && A[i + (j - 1) * M]) { A[i + j * M] = A[i + (j - 1) * M]; C[i + j * M] = C[i + (j - 1) * M]; }
  for (let j = M - 2; j >= 0; j--) for (let i = 0; i < M; i++) if (!A[i + j * M] && A[i + (j + 1) * M]) { A[i + j * M] = A[i + (j + 1) * M]; C[i + j * M] = C[i + (j + 1) * M]; }
  return { S, A: blur(A, M, 4), C: blur(C, M, 4), centre: n ? sum / n : 0 };
}

export interface SheetClayOptions { grid: number; band: number; onProgress?: (fraction: number) => void }

export function sheetToClay(mask: Float32Array, size: number, aspect: number, views: SheetView[], options: SheetClayOptions): ClayFieldSnapshot {
  const { grid, band, onProgress } = options;
  const front = views.find((v) => v.role === 'front'), side = views.find((v) => v.role === 'side');
  if (!front || !side) throw new Error('A character sheet needs at least a front and a side view.');
  const frontForm = formFromView(mask, size, aspect, front);
  const sideForm = formFromView(mask, size, aspect, side);
  const back = views.find((v) => v.role === 'back');
  const backForm = back ? formFromView(mask, size, aspect, back) : null;
  onProgress?.(0.3);

  /**
   * Every height is a set of ellipses: as wide as the front view's run here, as deep as the side view's, and a limb
   * thinner than the body gets a limb's depth rather than the whole torso's. The outlines still trim the result.
   */
  const combine = (x: number, fS: number, fA: number, fC: number, z: number, sS: number, sA: number, sC: number, bS: number) => {
    const a = Math.max(fA, 0.004), b = Math.max(Math.min(sA, a * 1.35), 0.004);
    const ellipse = (Math.hypot((x - fC) / a, (z - sC) / b) - 1) * Math.min(a, b);
    return Math.max(ellipse, fS, sS, bS);
  };

  const voxel = 2 / (grid * BRICK_VOXELS), cell = 2 / grid;
  const count = BRICK_STRIDE ** 3;
  const near = band * 0.999;
  const states = new Uint8Array(grid ** 3);
  const cells: number[] = [];
  const blocks: Float32Array[] = [];
  const margin = cell * 0.87 + band;
  const n2 = BRICK_STRIDE * BRICK_STRIDE;
  const fS = new Float32Array(n2), fA = new Float32Array(n2), fC = new Float32Array(n2), bS = new Float32Array(n2);
  const sS = new Float32Array(n2), sA = new Float32Array(n2), sC = new Float32Array(n2);
  for (let gy = 0; gy < grid; gy++) {
    onProgress?.(0.3 + 0.7 * (gy / grid));
    const mvCell = (1 - ((gy + 0.5) * cell - 1)) / 2;
    for (let gx = 0; gx < grid; gx++) {
      const x = (gx + 0.5) * cell - 1;
      const u = (x + frontForm.centre + 1) / 2;
      const cS = sample(frontForm.S, M, u, mvCell);
      const cB = backForm ? sample(backForm.S, M, (-x + backForm.centre + 1) / 2, mvCell) : -Infinity;
      // Past every point of this column: nothing here can reach the surface whatever z is.
      if (cS > margin || cB > margin) continue;
      const cA = sample(frontForm.A, M, u, mvCell), cC = sample(frontForm.C, M, u, mvCell);
      for (let gz = 0; gz < grid; gz++) {
        const z = (gz + 0.5) * cell - 1;
        const su = (z + sideForm.centre + 1) / 2;
        const mid = combine(x + frontForm.centre, cS, cA, cC, z + sideForm.centre, sample(sideForm.S, M, su, mvCell), sample(sideForm.A, M, su, mvCell), sample(sideForm.C, M, su, mvCell), cB);
        const id = gx + grid * (gy + grid * gz);
        if (mid > margin) continue;
        if (mid < -margin) { states[id] = 1; continue; }
        const ox = gx * cell - 1 - voxel, oy = gy * cell - 1 - voxel, oz = gz * cell - 1 - voxel;
        for (let j = 0; j < BRICK_STRIDE; j++) {
          const mv = (1 - (oy + j * voxel)) / 2;
          for (let i = 0; i < BRICK_STRIDE; i++) {
            const at = i + j * BRICK_STRIDE;
            const hx = ox + i * voxel, hz = oz + i * voxel;
            const fu = (hx + frontForm.centre + 1) / 2, ssu = (hz + sideForm.centre + 1) / 2;
            fS[at] = sample(frontForm.S, M, fu, mv); fA[at] = sample(frontForm.A, M, fu, mv); fC[at] = sample(frontForm.C, M, fu, mv);
            sS[at] = sample(sideForm.S, M, ssu, mv); sA[at] = sample(sideForm.A, M, ssu, mv); sC[at] = sample(sideForm.C, M, ssu, mv);
            bS[at] = backForm ? sample(backForm.S, M, (-hx + backForm.centre + 1) / 2, mv) : -Infinity;
          }
        }
        const values = new Float32Array(count);
        let min = Infinity, max = -Infinity, n = 0;
        for (let k = 0; k < BRICK_STRIDE; k++) for (let j = 0; j < BRICK_STRIDE; j++) for (let i = 0; i < BRICK_STRIDE; i++) {
          const a = i + j * BRICK_STRIDE, c = k + j * BRICK_STRIDE;
          const v = combine(ox + i * voxel + frontForm.centre, fS[a], fA[a], fC[a], oz + k * voxel + sideForm.centre, sS[c], sA[c], sC[c], bS[a]);
          const clamped = Math.max(-band, Math.min(band, v));
          values[n++] = clamped;
          if (clamped < min) min = clamped;
          if (clamped > max) max = clamped;
        }
        if (min >= near) continue;
        if (max <= -near) { states[id] = 1; continue; }
        cells.push(id);
        blocks.push(values);
      }
    }
  }
  const values = new Float32Array(cells.length * count);
  blocks.forEach((b, i) => values.set(b, i * count));
  return { grid, band, states, cells: new Uint32Array(cells), values };
}
