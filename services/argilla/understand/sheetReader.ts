/**
 * sheetReader.ts — read a multi-view asset sheet: where each drawing is, what kind it is, and which side it shows.
 *
 * The Elderwood batch (docs/plajah-3d-game-assets.md) showed reading the sheet is the weakest link of build-from-sheet:
 * drawings that touch (canopies, ground debris, panel frames) were read as one, bounding-box merging made boxes overlap,
 * close-up material insets were taken for views, roles came from reading order instead of what a drawing shows, and kit
 * sheets with several objects were treated as one object. This reader replaces that:
 *
 * 1. Panels and insets. A big filled rectangle is either a panel (its inner border is one flat colour: the drawings sit
 *    on it, so it's read again as a sheet of its own, with that colour as background) or a full-bleed close-up (textured
 *    to the edge: never a view).
 * 2. Drawings by recursive XY cuts. A sheet is a grid; a drawing ends where a column or row band is (nearly) empty, even
 *    if a few leaves, a cable of debris or a branch tip cross it. Gutter lines (full-span thin bands) are cuts too. A wide
 *    gap crossed by one continuous thin line is a structure (a zipline cable, a rope bridge), not a gap.
 * 3. Kinds and roles from geometry. Elevations of one object are drawn to one scale, so they share a pixel height: the
 *    biggest height group is the object's elevations. The front is the first broad one; the back is the elevation with
 *    the front's width whose outline best matches the front mirrored; the sides are the pair whose widths agree and whose
 *    outlines mirror each other; other elevations are extra (3/4, profile). The plan is the drawing whose box is front
 *    width × side width. Big non-elevations are cutaways; small ones are kit parts; short wide strips are labels.
 * 4. Warnings: no back, no sides, several objects (a kit sheet), elevations not to one scale.
 */

import type { Raster } from './sheetBuild';

export type FigureKind = 'view' | 'plan' | 'cutaway' | 'inset' | 'part' | 'label';
export type ViewRole = 'front' | 'back' | 'left' | 'right' | 'top' | 'extra';

export interface ReadFigure {
  /** Box in sheet pixels. */
  x0: number; y0: number; x1: number; y1: number;
  /** Foreground pixels (sheet scale). */
  area: number;
  kind: FigureKind;
  role?: ViewRole;
  /** Background colour around this drawing (a panel's colour inside a panel). */
  bg: [number, number, number];
  /** Reading-order index. */
  order: number;
  /** Why it got its kind / role. */
  why: string;
}

export interface SheetReading {
  figures: ReadFigure[];
  /** Pixel height the object's elevations share (sheet scale). */
  elevationHeight: number;
  warnings: string[];
  /** Several objects with their own elevation groups (a kit sheet). */
  kit: boolean;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Block extends Box { bg: [number, number, number]; panel?: boolean }

const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1] ?? 0; };

function borderColour(img: Raster, b: Box, inset: number, band: number): { mean: [number, number, number]; spread: number } {
  const { data, width } = img, rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const take = (x: number, y: number) => { const i = (x + y * width) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
  const x0 = b.x0 + inset, y0 = b.y0 + inset, x1 = b.x1 - inset, y1 = b.y1 - inset;
  if (x1 - x0 < 4 || y1 - y0 < 4) return { mean: [0, 0, 0], spread: 999 };
  const st = Math.max(1, Math.round((x1 - x0 + y1 - y0) / 400));
  for (let x = x0; x < x1; x += st) for (let k = 0; k < band; k++) { take(x, y0 + k); take(x, y1 - 1 - k); }
  for (let y = y0; y < y1; y += st) for (let k = 0; k < band; k++) { take(x0 + k, y); take(x1 - 1 - k, y); }
  const mean: [number, number, number] = [median(rs), median(gs), median(bs)];
  // spread: 80th percentile distance from the median colour (robust to a drawing touching the border here and there)
  const d = rs.map((r, i) => Math.hypot(r - mean[0], gs[i] - mean[1], bs[i] - mean[2])).sort((p, q) => p - q);
  return { mean, spread: d[Math.floor(d.length * 0.8)] ?? 999 };
}

/** Sheet background: median of a thin border all round. */
function sheetBackground(img: Raster): [number, number, number] {
  return borderColour(img, { x0: 0, y0: 0, x1: img.width, y1: img.height }, 0, Math.max(2, Math.round(Math.min(img.width, img.height) * 0.006))).mean;
}

/**
 * Working-resolution foreground mask of a region: colour far from the background OR texture. Generated sheets have a
 * flat (or smoothly shaded) background, and grey stone on a grey sheet is close in colour but never flat.
 */
export function maskOf(img: Raster, k: number, b: Box, bg: [number, number, number], threshold: number) {
  const w = Math.max(1, Math.floor((b.x1 - b.x0) / k)), h = Math.max(1, Math.floor((b.y1 - b.y0) / k));
  const m = new Uint8Array(w * h), lum = new Float32Array(w * h), { data, width } = img;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 0, l = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const p = (b.x0 + x * k + i + (b.y0 + y * k + j) * width) * 4;
      const d = Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]);
      if (d > best) best = d;
      l += data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11;
    }
    lum[x + y * w] = l / (k * k);
    m[x + y * w] = best > threshold * 0.8 ? 1 : best > threshold * 0.3 ? 2 : 0;
  }
  // texture: local standard deviation of luminance over 3×3
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (m[x + y * w] !== 2) continue;
    m[x + y * w] = 0;
    let s = 0, s2 = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = lum[x + dx + (y + dy) * w]; s += v; s2 += v * v; }
    const sd = Math.sqrt(Math.max(0, s2 / 9 - (s / 9) ** 2));
    if (sd > 5) m[x + y * w] = 1;
  }
  for (let i = 0; i < m.length; i++) if (m[i] === 2) m[i] = 0;
  return { m, w, h };
}

/** Binary closing with a square of radius r (joins a drawing's thin parts: rails, rope, leaf tips). */
export function close(m: Uint8Array, w: number, h: number, r: number) {
  const pass = (src: Uint8Array, dil: boolean) => {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dil ? 0 : 1;
      for (let d = -r; d <= r; d++) { const xx = x + d; const s = xx < 0 || xx >= w ? (dil ? 0 : 1) : src[xx + y * w]; if (dil ? s : !s) { v = dil ? 1 : 0; break; } }
      tmp[x + y * w] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dil ? 0 : 1;
      for (let d = -r; d <= r; d++) { const yy = y + d; const s = yy < 0 || yy >= h ? (dil ? 0 : 1) : tmp[x + yy * w]; if (dil ? s : !s) { v = dil ? 1 : 0; break; } }
      out[x + y * w] = v;
    }
    return out;
  };
  return pass(pass(m, true), false);
}

function components(mask: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1), out: (Box & { area: number })[] = [], stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = out.length, b = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    label[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p / w) | 0;
      b.area++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = nx + ny * w;
        if (mask[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
    out.push(b);
  }
  return { label, boxes: out };
}

/** Recursive XY cut of a mask region (working pixels). Returns leaf boxes that hold foreground. */
function xyCut(m: Uint8Array, w: number, h: number, b: Box, minGap: number, depth = 0): Box[] {
  // shrink to content
  let x0 = b.x1, y0 = b.y1, x1 = b.x0 - 1, y1 = b.y0 - 1, n = 0;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (m[x + y * w]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!n) return [];
  const box = { x0, y0, x1, y1 };
  if (depth > 12) return [box];
  type Cut = { axis: 'x' | 'y'; at: number; from: number; to: number; score: number };
  const cuts: Cut[] = [];
  for (const axis of ['x', 'y'] as const) {
    const lo = axis === 'x' ? x0 : y0, hi = axis === 'x' ? x1 : y1, span = axis === 'x' ? y1 - y0 + 1 : x1 - x0 + 1;
    const prof = new Float32Array(hi - lo + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m[x + y * w]) prof[(axis === 'x' ? x : y) - lo]++;
    const sm = prof.map((_, i) => (prof[Math.max(0, i - 1)] + prof[i] + prof[Math.min(prof.length - 1, i + 1)]) / 3);
    const empty = Math.max(1, span * 0.02), full = span * 0.9;
    const scan = (test: (v: number) => boolean, kind: 'gap' | 'line') => {
      let i = 0;
      while (i < sm.length) {
        if (!test(sm[i])) { i++; continue; }
        let j = i; while (j + 1 < sm.length && test(sm[j + 1])) j++;
        const len = j - i + 1, interior = i > 0 && j < sm.length - 1;
        // a gutter line is thin with near-empty bands on both sides (a roof ridge or chimney is tall with full ones)
        const pad = Math.max(3, len * 2);
        const sideLow = kind === 'gap' || (i - pad >= 0 && j + pad < sm.length && sm[i - pad] < span * 0.3 && sm[j + pad] < span * 0.3);
        if (interior && sideLow && (kind === 'gap' ? len >= minGap : len <= Math.max(3, (hi - lo) * 0.03))) {
          // A wide gap crossed by one continuous thin line is a structure (cable, rope bridge), not a gap.
          let crossed = false;
          if (kind === 'gap' && len > (hi - lo + 1) * 0.15) {
            const a = lo + i, z = lo + j;
            for (let t = (axis === 'x' ? y0 : x0); t <= (axis === 'x' ? y1 : x1) && !crossed; t++) {
              let on = 0;
              for (let s = a; s <= z; s++) {
                let hit = false;                                  // ±1 px tolerance for a sagging line
                for (let d = -1; d <= 1 && !hit; d++) {
                  const tt = t + d; if (tt < 0) continue;
                  hit = axis === 'x' ? (tt < h && !!m[s + tt * w]) : (tt < w && !!m[tt + s * w]);
                }
                if (hit) on++;
              }
              if (on >= (z - a + 1) * 0.85) crossed = true;
            }
          }
          if (!crossed) cuts.push({ axis, at: lo + ((i + j) >> 1), from: lo + i, to: lo + j, score: kind === 'line' ? 1e6 + len : len / (hi - lo + 1) });
        }
        i = j + 1;
      }
    };
    scan((v) => v <= empty, 'gap');
    // A valley: a band that isn't empty (ground debris, a vine crossing between two drawings) but is far thinner than the
    // drawings on both sides of it.
    {
      const shallow = span * 0.08, n = sm.length;
      let i = 0;
      while (i < n) {
        if (sm[i] > shallow || sm[i] <= empty) { i++; continue; }
        let j = i; while (j + 1 < n && sm[j + 1] <= shallow) j++;
        const len = j - i + 1, win = Math.max(4, len * 3);
        if (i > 0 && j < n - 1 && len >= minGap) {
          const side = (a: number, b: number) => { const v: number[] = []; for (let t = Math.max(0, a); t < Math.min(n, b); t++) v.push(sm[t]); return median(v); };
          const left = side(i - win, i), right = side(j + 1, j + 1 + win);
          let peak = 0; for (let t = i; t <= j; t++) peak = Math.max(peak, sm[t]);
          if (peak <= 0.2 * Math.min(left, right)) cuts.push({ axis, at: lo + ((i + j) >> 1), from: lo + i, to: lo + j, score: len / (hi - lo + 1) * 0.5 });
        }
        i = j + 1;
      }
    }
    scan((v) => v >= full, 'line');
  }
  if (!cuts.length) return [box];
  const c = cuts.sort((p, q) => q.score - p.score)[0];
  const a = c.axis === 'x' ? { ...box, x1: c.from - 1 } : { ...box, y1: c.from - 1 };
  const z = c.axis === 'x' ? { ...box, x0: c.to + 1 } : { ...box, y0: c.to + 1 };
  return [...xyCut(m, w, h, a, minGap, depth + 1), ...xyCut(m, w, h, z, minGap, depth + 1)];
}

/** Silhouette of a figure resized to a square grid (for mirror matching). */
function silhouette(img: Raster, f: ReadFigure, n = 48, threshold = 12) {
  const out = new Uint8Array(n * n), { data, width } = img, bw = f.x1 - f.x0, bh = f.y1 - f.y0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx = Math.min(f.x1 - 1, f.x0 + Math.floor((x + 0.5) * bw / n)), sy = Math.min(f.y1 - 1, f.y0 + Math.floor((y + 0.5) * bh / n));
    const p = (sx + sy * width) * 4;
    out[x + y * n] = Math.hypot(data[p] - f.bg[0], data[p + 1] - f.bg[1], data[p + 2] - f.bg[2]) > threshold ? 1 : 0;
  }
  return out;
}
function iou(a: Uint8Array, b: Uint8Array, n: number, mirrorB: boolean) {
  let i = 0, u = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = a[x + y * n], q = b[(mirrorB ? n - 1 - x : x) + y * n];
    if (p && q) i++; if (p || q) u++;
  }
  return u ? i / u : 0;
}

export function readSheet(img: Raster, threshold = 18): SheetReading {
  const k = Math.max(1, Math.round(img.width / 800));
  const sheetBg = sheetBackground(img);
  const found: { box: Box; bg: [number, number, number]; kind?: FigureKind; why: string }[] = [];
  const warnings: string[] = [];

  // 1 + 2: blocks (the sheet, then any panels inside it), each cut into drawings.
  const queue: Block[] = [{ x0: 0, y0: 0, x1: img.width, y1: img.height, bg: sheetBg }];
  let guard = 0;
  while (queue.length && guard++ < 64) {
    const blk = queue.shift()!;
    const { m, w, h } = maskOf(img, k, blk, blk.bg, threshold);
    // drop specks (floating particles, leaves) so they don't bridge gaps
    const { label, boxes } = components(m, w, h);
    const speck = w * h * 0.00015;
    for (let i = 0; i < m.length; i++) if (m[i] && boxes[label[i]].area < speck) m[i] = 0;
    // panels and insets: big, mostly filled rectangles
    for (const c of boxes) {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (bw * bh < w * h * 0.015 || c.area < bw * bh * 0.82 || bw * bh > w * h * 0.97) continue;
      // a panel or a close-up has straight edges: its outermost rows and columns are filled edge to edge
      const fill = (xa: number, ya: number, xb: number, yb: number) => {
        let on = 0, n = 0;
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { n++; if (m[x + y * w]) on++; }
        return on / Math.max(1, n);
      };
      const e = 1;
      if (Math.min(fill(c.x0, c.y0 + e, c.x1, c.y0 + e), fill(c.x0, c.y1 - e, c.x1, c.y1 - e), fill(c.x0 + e, c.y0, c.x0 + e, c.y1), fill(c.x1 - e, c.y0, c.x1 - e, c.y1)) < 0.9) continue;
      const sb: Box = { x0: blk.x0 + c.x0 * k, y0: blk.y0 + c.y0 * k, x1: blk.x0 + (c.x1 + 1) * k, y1: blk.y0 + (c.y1 + 1) * k };
      const inset = Math.max(2, Math.round(Math.min(sb.x1 - sb.x0, sb.y1 - sb.y0) * 0.02));
      const rim = borderColour(img, sb, inset, Math.max(2, inset));
      // blank it out of this block either way
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) m[x + y * w] = 0;
      if (rim.spread < 14) queue.push({ ...sb, x0: sb.x0 + inset, y0: sb.y0 + inset, x1: sb.x1 - inset, y1: sb.y1 - inset, bg: rim.mean, panel: true });
      else found.push({ box: sb, bg: blk.bg, kind: 'inset', why: 'filled rectangle, textured to its edge (close-up)' });
    }
    const cm = close(m, w, h, Math.max(1, Math.round(w * 0.004)));
    const leaves = xyCut(cm, w, h, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }, Math.max(3, Math.round(w * 0.006)));
    // Inside each leaf: separate drawings by connected pieces (layouts that straight cuts can't split), then fold small
    // pieces (a ladder beside its platform, a lamp hanging off a beam) into their nearest bigger neighbour. One pass,
    // against the pieces' own boxes: a merged box never grows into the next drawing.
    const { label: cl } = components(cm, w, h);
    const near = Math.max(2, Math.round(w * 0.012));
    for (const l of leaves) {
      const ids = new Map<number, Box & { area: number }>();
      for (let y = l.y0; y <= l.y1; y++) for (let x = l.x0; x <= l.x1; x++) {
        const id = cl[x + y * w]; if (id < 0) continue;
        let b = ids.get(id);
        if (!b) { b = { x0: x, y0: y, x1: x, y1: y, area: 0 }; ids.set(id, b); }
        b.area++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      }
      const pieces = [...ids.values()].filter((b) => b.area > w * h * 0.0002).sort((a, b) => b.area - a.area);
      const owner = pieces.map((_, i) => i);
      const root = (i: number): number => (owner[i] === i ? i : (owner[i] = root(owner[i])));
      const boxArea = (b: Box) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
      for (let j = pieces.length - 1; j > 0; j--) {
        const b = pieces[j];
        let bestI = -1, bestGap = Infinity;
        for (let i = 0; i < j; i++) {
          const a = pieces[i];
          const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
          const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          const inside = ix > 0 && iy > 0 && ix * iy >= 0.5 * boxArea(b);          // sits inside a bigger drawing's box
          const gap = inside ? -1 : Math.max(gx, gy);
          if ((inside || (gap <= near && b.area < a.area * 0.3)) && gap < bestGap) { bestGap = gap; bestI = i; }
        }
        if (bestI >= 0) owner[j] = root(bestI);
      }
      const groups = new Map<number, Box & { area: number }>();
      pieces.forEach((p, i) => {
        const r = root(i), g = groups.get(r);
        if (!g) groups.set(r, { ...p });
        else { g.x0 = Math.min(g.x0, p.x0); g.y0 = Math.min(g.y0, p.y0); g.x1 = Math.max(g.x1, p.x1); g.y1 = Math.max(g.y1, p.y1); g.area += p.area; }
      });
      for (const p of groups.values()) {
        found.push({ box: { x0: blk.x0 + p.x0 * k, y0: blk.y0 + p.y0 * k, x1: Math.min(img.width, blk.x0 + (p.x1 + 1) * k), y1: Math.min(img.height, blk.y0 + (p.y1 + 1) * k) }, bg: blk.bg, why: blk.panel ? 'drawing inside a panel' : 'drawing' });
      }
    }
  }

  // foreground area per box, reading order
  const sheetArea = img.width * img.height;
  const figs: ReadFigure[] = found.map((f) => {
    let area = 0; const { data, width } = img, st = 2;
    for (let y = f.box.y0; y < f.box.y1; y += st) for (let x = f.box.x0; x < f.box.x1; x += st) {
      const p = (x + y * width) * 4;
      if (Math.hypot(data[p] - f.bg[0], data[p + 1] - f.bg[1], data[p + 2] - f.bg[2]) > threshold) area += st * st;
    }
    return { ...f.box, area, kind: f.kind ?? 'part', bg: f.bg, order: 0, why: f.why };
  }).filter((f) => f.kind === 'inset' || f.area > sheetArea * 0.0006);
  // reading order: rows by vertical overlap, then left to right
  figs.sort((a, b) => a.y0 - b.y0);
  const rows: ReadFigure[][] = [];
  for (const f of figs) {
    const r = rows.find((row) => row.some((g) => Math.min(g.y1, f.y1) - Math.max(g.y0, f.y0) > 0.4 * Math.min(g.y1 - g.y0, f.y1 - f.y0)));
    if (r) r.push(f); else rows.push([f]);
  }
  let order = 0;
  for (const r of rows) for (const f of r.sort((a, b) => a.x0 - b.x0)) f.order = order++;
  figs.sort((a, b) => a.order - b.order);

  // close-ups that were joined to something (a divider line) when the rectangles were looked for: a drawing whose box is
  // filled edge to edge, with straight filled edges, is a full-bleed picture, not a view
  {
    const { data, width } = img;
    const on = (x: number, y: number, bg: [number, number, number]) => { const p = (x + y * width) * 4; return Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]) > threshold * 0.6; };
    for (const f of figs) {
      if (f.kind !== 'part') continue;
      const bw = f.x1 - f.x0, bh = f.y1 - f.y0;
      if (bw < 20 || bh < 20) continue;
      const line = (xa: number, ya: number, xb: number, yb: number) => {
        let n = 0, k2 = 0; const steps = 60;
        for (let s = 0; s <= steps; s++) { const x = Math.round(xa + (xb - xa) * s / steps), y = Math.round(ya + (yb - ya) * s / steps); n++; if (on(x, y, f.bg)) k2++; }
        return k2 / n;
      };
      const e = Math.max(2, Math.round(Math.min(bw, bh) * 0.03));
      const edges = Math.min(line(f.x0 + e, f.y0 + e, f.x1 - e, f.y0 + e), line(f.x0 + e, f.y1 - e, f.x1 - e, f.y1 - e), line(f.x0 + e, f.y0 + e, f.x0 + e, f.y1 - e), line(f.x1 - e, f.y0 + e, f.x1 - e, f.y1 - e));
      if (edges >= 0.9 && f.area >= 0.85 * bw * bh) { f.kind = 'inset'; f.why = 'box filled edge to edge with straight edges (close-up)'; }
    }
  }
  // labels: short wide strips
  for (const f of figs) {
    const bw = f.x1 - f.x0, bh = f.y1 - f.y0;
    if (f.kind === 'part' && bh < img.height * 0.045 && bw > bh * 3 && f.area < sheetArea * 0.01) { f.kind = 'label'; f.why = 'short wide strip (printed label)'; }
  }

  // 3: elevations = the biggest group of drawings sharing one pixel height
  const cand = figs.filter((f) => f.kind === 'part' && f.area > sheetArea * 0.008);
  // The main object is drawn biggest: of the height groups with 3+ drawings, the tallest; else the biggest group.
  // (A kit sheet has more crates and barrels than rack views, but the rack is drawn tallest.)
  const groups = cand.map((f) => cand.filter((g) => Math.abs((g.y1 - g.y0) - (f.y1 - f.y0)) <= 0.12 * (f.y1 - f.y0)));
  const tall = groups.filter((g) => g.length >= 3);
  const hOf = (g: ReadFigure[]) => median(g.map((f) => f.y1 - f.y0));
  let best: ReadFigure[] = [];
  if (tall.length) best = tall.reduce((a, b) => (hOf(b) > hOf(a) * 1.05 || (hOf(b) > hOf(a) * 0.95 && b.length > a.length) ? b : a));
  else for (const g of groups) if (g.length * 1e9 + g.reduce((s2, x) => s2 + x.area, 0) > best.length * 1e9 + best.reduce((s2, x) => s2 + x.area, 0)) best = g;
  const elevationHeight = best.length ? median(best.map((f) => f.y1 - f.y0)) : 0;
  if (best.length < 2) warnings.push('no group of drawings at one height: elevations not found, the biggest drawing is used as the front');
  const elev = best.length ? best : cand.length ? [cand.reduce((a, b) => (b.area > a.area ? b : a))] : [];
  for (const f of elev) { f.kind = 'view'; f.role = 'extra'; f.why = `elevation (height ${f.y1 - f.y0} px, group of ${elev.length})`; }

  // kit: another group of 2+ drawings at a different height, of decent size
  const rest = cand.filter((f) => !elev.includes(f));
  const other = rest.filter((f) => rest.filter((g) => Math.abs((g.y1 - g.y0) - (f.y1 - f.y0)) <= 0.1 * (f.y1 - f.y0)).length >= 2 && f.area > sheetArea * 0.01);
  const kit = other.length >= 2 && !other.some((f) => Math.abs((f.y1 - f.y0) - elevationHeight) <= 0.1 * elevationHeight);

  if (elev.length) {
    const width = (f: ReadFigure) => f.x1 - f.x0;
    // The front is the first elevation (house layout: the sheet opens with the front view).
    const front = elev[0];
    front.role = 'front'; front.why += '; first elevation → front';
    const sil = new Map(elev.map((f) => [f, silhouette(img, f)] as const));
    const others = elev.filter((f) => f !== front);
    // Back and sides are chosen together: the back mirrors the front (and has its width), the sides mirror each other.
    // Choosing the back alone mistakes a side of a boxy object (a cabin) for the back; together, the true pair wins.
    const mir = (a: ReadFigure, b: ReadFigure) => iou(sil.get(a)!, sil.get(b)!, 48, true);
    const backs: (ReadFigure | undefined)[] = [undefined, ...others.filter((f) => Math.abs(width(f) - width(front)) <= 0.15 * width(front) && mir(front, f) > 0.55)];
    let back: ReadFigure | undefined, pair: [ReadFigure, ReadFigure] | undefined, bestScore = -1, backScore = 0, pairScore = 0;
    for (const b of backs) {
      const pool = others.filter((f) => f !== b);
      const pairs: ([ReadFigure, ReadFigure] | undefined)[] = [undefined];
      for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
        const p = pool[i], q = pool[j];
        if (Math.abs(width(p) - width(q)) <= 0.15 * Math.max(width(p), width(q)) && mir(p, q) > 0.5) pairs.push([p, q]);
      }
      for (const pq of pairs) {
        const sb = b ? mir(front, b) : 0, sp = pq ? mir(pq[0], pq[1]) : 0;
        // house layout prior: the back comes after the sides in reading order
        const prior = b && pq && b.order > Math.max(pq[0].order, pq[1].order) ? 0.05 : 0;
        const score = (b ? sb - 0.45 : 0) + (pq ? sp - 0.4 : 0) + prior;
        if (score > bestScore) { bestScore = score; back = b; pair = pq; backScore = sb; pairScore = sp; }
      }
    }
    if (back) { back.role = 'back'; back.why += `; front's width, mirrors the front (${backScore.toFixed(2)}) → back`; }
    const pool = others.filter((f) => f !== back);
    if (pair) {
      const [l, r] = pair.sort((a, b) => a.order - b.order);
      l.role = 'left'; r.role = 'right';
      l.why += `; mirrors ${r.order} (${pairScore.toFixed(2)}) → left`; r.why += `; mirrors ${l.order} → right`;
    } else {
      // one side only: a narrower elevation than the front
      const lone = pool.filter((f) => Math.abs(width(f) - width(front)) > 0.15 * width(front)).sort((a, b) => a.order - b.order)[0];
      if (lone) { lone.role = 'left'; lone.why += '; the only elevation of another width → left'; warnings.push('only one side view'); }
      else warnings.push('no side views');
    }
    if (!back) warnings.push('no back view (the front mirrored stands in)');
    for (const f of elev) if (f.role === 'extra') f.why += '; another elevation (3/4 or profile) → extra';

    // plan: a non-elevation whose box is front width × side width (either way round)
    const side = elev.find((f) => f.role === 'left' || f.role === 'right');
    const depthGuess = side ? width(side) : undefined;
    let plan: ReadFigure | undefined, planErr = 0.22;
    // A plan can be drawn as tall as the elevations (a square cabin): an "extra" that looks like no named view counts too.
    const named = elev.filter((f) => f.role && f.role !== 'extra');
    const lookalike = (f: ReadFigure) => named.some((g) => Math.max(iou(sil.get(f)!, sil.get(g)!, 48, false), iou(sil.get(f)!, sil.get(g)!, 48, true)) > 0.55);
    for (const f of [...rest, ...elev.filter((g) => g.role === 'extra' && !lookalike(g))]) {
      const bw = width(f), bh = f.y1 - f.y0;
      for (const [u, v] of [[bw, bh], [bh, bw]]) {
        const e1 = Math.abs(u - width(front)) / width(front);
        const e2 = depthGuess ? Math.abs(v - depthGuess) / depthGuess : Math.abs(bh - bw) / Math.max(bw, bh) * 0.5;
        const e = Math.max(e1, e2);
        if (e < planErr) { planErr = e; plan = f; }
      }
    }
    if (plan) { plan.kind = 'plan'; plan.role = 'top'; plan.why = `box matches front width × ${depthGuess ? 'side width' : 'a square'} (${planErr.toFixed(2)}) → plan`; }
  }
  // the rest: big ones are cutaways / other drawings, small ones kit parts
  for (const f of figs) if (f.kind === 'part') {
    if (f.area > sheetArea * 0.02 && (f.y1 - f.y0) >= elevationHeight * 0.7) { f.kind = 'cutaway'; f.why = 'large drawing that is not an elevation (cutaway / other view)'; }
    else f.why = 'small drawing (kit part / detail)';
  }
  if (kit) warnings.push('several objects on this sheet (kit): only the main object is built');
  const spread = elev.length > 1 ? (Math.max(...elev.map((f) => f.y1 - f.y0)) - Math.min(...elev.map((f) => f.y1 - f.y0))) / elevationHeight : 0;
  if (spread > 0.15) warnings.push('elevations not to one scale');
  return { figures: figs, elevationHeight, warnings, kit };
}
