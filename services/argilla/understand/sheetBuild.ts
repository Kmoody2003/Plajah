/**
 * sheetBuild.ts — build a model from a multi-view asset sheet (Plajah 3D capability B, docs/plajah-3d-game-assets.md).
 *
 * House sheet format: one subject drawn orthographically several times on a plain background, in a grid — front, left
 * side, right side (row 1), back, top-down plan, profile (row 2) — then components, a cutaway and close-up insets. There
 * are no panel frames (sheetClay.suggestBoxes looks for frames), so views are found as figures on the background.
 *
 * Steps: find the views → cut each one out (pale and thin parts kept: wings, rope, glass, leaf tips — a matte that only
 * keeps the bold mass makes the generator build a sheet or a loose part) → generate the shape from the front cut-out,
 * main piece only → paint it from every view (tela-3d /tela3d/paint-views) → check each view's outline overlap.
 */

import { imageToModel, paintFromViews, PaintViewName } from '../../tela/tela3dService';

export type SheetRole = 'front' | 'left' | 'right' | 'back' | 'top' | 'profile' | 'detail';

export interface Raster { data: Uint8ClampedArray; width: number; height: number }

export interface SheetFigure {
  /** Pixel box in the sheet. */
  x0: number; y0: number; x1: number; y1: number;
  area: number;
  role: SheetRole;
  row: number;
}

/** The background colour: median of a thin border all round. */
export function backgroundOf(img: Raster): [number, number, number] {
  const { data, width: w, height: h } = img;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const take = (x: number, y: number) => { const i = (x + y * w) * 4; rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); };
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.006));
  for (let x = 0; x < w; x += 2) for (let k = 0; k < band; k++) { take(x, k); take(x, h - 1 - k); }
  for (let y = 0; y < h; y += 2) for (let k = 0; k < band; k++) { take(k, y); take(w - 1 - k, y); }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/** Distance of every pixel from the background colour (0–441). */
function distanceMap(img: Raster, bg: [number, number, number]) {
  const { data, width: w, height: h } = img, out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] - bg[0], g = data[i * 4 + 1] - bg[1], b = data[i * 4 + 2] - bg[2];
    out[i] = Math.sqrt(r * r + g * g + b * b);
  }
  return out;
}

/** 8-connected components of a binary mask. */
function components(mask: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1), boxes: { x0: number; y0: number; x1: number; y1: number; area: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = boxes.length, b = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
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
    boxes.push(b);
  }
  return { label, boxes };
}

/**
 * The figures on a sheet, in reading order, with the house roles for the first six (row 1: front, left, right;
 * row 2: back, top, profile). Everything else is 'detail'. Roles are a guess the person can change; the build checks
 * each view's outline against the shape and reports a poor match.
 */
export function findSheetViews(img: Raster, threshold = 18): SheetFigure[] {
  // Work at ~600 px wide: figures are big; small specks and insets are filtered by area.
  const k = Math.max(1, Math.floor(img.width / 600)), w = Math.floor(img.width / k), h = Math.floor(img.height / k);
  const bg = backgroundOf(img), dist = distanceMap(img, bg);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) m = Math.max(m, dist[x * k + i + (y * k + j) * img.width]);
    mask[x + y * w] = m > threshold ? 1 : 0;
  }
  // close small gaps so a figure with thin parts (rope rails, branches) stays one piece
  const closed = new Uint8Array(mask);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!mask[x + y * w]) {
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += mask[x + dx + (y + dy) * w];
    if (n >= 3) closed[x + y * w] = 1;
  }
  const { boxes } = components(closed, w, h);
  const big = boxes.filter((b) => b.area > w * h * 0.004);
  // merge pieces of one figure: boxes that overlap or nearly touch
  const merged: typeof big = [];
  for (const b of big.sort((p, q) => q.area - p.area)) {
    const near = merged.find((m) => b.x0 <= m.x1 + 4 && m.x0 <= b.x1 + 4 && b.y0 <= m.y1 + 4 && m.y0 <= b.y1 + 4);
    if (near) { near.x0 = Math.min(near.x0, b.x0); near.y0 = Math.min(near.y0, b.y0); near.x1 = Math.max(near.x1, b.x1); near.y1 = Math.max(near.y1, b.y1); near.area += b.area; }
    else merged.push({ ...b });
  }
  // rows: figures whose vertical centres are within half the median height of each other
  const figs = merged.filter((b) => b.area > w * h * 0.01);
  const hMed = figs.map((b) => b.y1 - b.y0).sort((a, b) => a - b)[figs.length >> 1] ?? h;
  figs.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows: (typeof figs)[] = [];
  for (const f of figs) {
    const cy = (f.y0 + f.y1) / 2, row = rows.find((r) => Math.abs((r[0].y0 + r[0].y1) / 2 - cy) < hMed * 0.5);
    if (row) row.push(f); else rows.push([f]);
  }
  const HOUSE: SheetRole[] = ['front', 'left', 'right', 'back', 'top', 'profile'];
  const out: SheetFigure[] = [];
  rows.forEach((r, ri) => r.sort((a, b) => a.x0 - b.x0).forEach((f) => {
    const role = out.length < HOUSE.length && ri < 2 ? HOUSE[out.length] : 'detail';
    out.push({ x0: f.x0 * k, y0: f.y0 * k, x1: Math.min(img.width, (f.x1 + 1) * k), y1: Math.min(img.height, (f.y1 + 1) * k), area: f.area * k * k, role, row: ri });
  }));
  return out;
}

/**
 * One view on transparency. Alpha comes from the distance to the background (soft ramp), so pale and thin parts stay;
 * holes inside the figure are filled and only the main piece is kept. A margin of background is left round it.
 */
export function cutFigure(img: Raster, fig: Pick<SheetFigure, 'x0' | 'y0' | 'x1' | 'y1'>, threshold = 14, margin = 0.04): Raster {
  const bg = backgroundOf(img);
  const mx = Math.round((fig.x1 - fig.x0) * margin), my = Math.round((fig.y1 - fig.y0) * margin);
  const x0 = Math.max(0, fig.x0 - mx), y0 = Math.max(0, fig.y0 - my), x1 = Math.min(img.width, fig.x1 + mx), y1 = Math.min(img.height, fig.y1 + my);
  const w = x1 - x0, h = y1 - y0, out = new Uint8ClampedArray(w * h * 4), on = new Uint8Array(w * h), a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (x0 + x + (y0 + y) * img.width) * 4, di = (x + y * w) * 4;
    const r = img.data[si] - bg[0], g = img.data[si + 1] - bg[1], b = img.data[si + 2] - bg[2], d = Math.sqrt(r * r + g * g + b * b);
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2];
    a[x + y * w] = Math.min(1, Math.max(0, (d - threshold * 0.5) / (threshold * 1.5)));
    on[x + y * w] = d > threshold ? 1 : 0;
  }
  // fill holes: background reachable from the border stays background, everything else is subject
  const outside = new Uint8Array(w * h), stack: number[] = [];
  const seed = (p: number) => { if (!on[p] && !outside[p]) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed(x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(w - 1 + y * w); }
  while (stack.length) {
    const p = stack.pop()!, x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
  }
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = outside[i] ? 0 : 1;
  const { label, boxes } = components(solid, w, h);
  const main = boxes.reduce((best, b, i) => (b.area > boxes[best].area ? i : best), 0);
  for (let i = 0; i < w * h; i++) {
    const keep = boxes.length && label[i] === main;
    out[i * 4 + 3] = keep ? Math.round(255 * (outside[i] ? a[i] : 1)) : 0;
  }
  // Edge pixels are part background colour, and the painter projects them onto the silhouette as a grey fringe:
  // give every pixel that isn't fully solid the colour of the solid pixels next to it, a ring at a time.
  const solidColour = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solidColour[i] = out[i * 4 + 3] === 255 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = new Uint8Array(solidColour);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = x + y * w;
      if (solidColour[p]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = p + dx + dy * w;
        if (solidColour[q]) { r += out[q * 4]; g += out[q * 4 + 1]; b += out[q * 4 + 2]; n++; }
      }
      if (n) { out[p * 4] = r / n; out[p * 4 + 1] = g / n; out[p * 4 + 2] = b / n; next[p] = 1; }
    }
    solidColour.set(next);
  }
  return { data: out, width: w, height: h };
}

export async function rasterOf(file: Blob): Promise<Raster> {
  const bmp = await createImageBitmap(file);
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  return { data: d.data, width: d.width, height: d.height };
}

export async function rasterToPng(r: Raster, mirror = false): Promise<Blob> {
  const c = new OffscreenCanvas(r.width, r.height), g = c.getContext('2d')!;
  g.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  if (!mirror) return c.convertToBlob({ type: 'image/png' });
  const m = new OffscreenCanvas(r.width, r.height), mg = m.getContext('2d')!;
  mg.translate(r.width, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0);
  return m.convertToBlob({ type: 'image/png' });
}

export interface SheetBuildOptions {
  /** Override the guessed roles: figure index → role. */
  roles?: Record<number, SheetRole>;
  /** Which view the shape is generated from (default the front). */
  shapeFrom?: SheetRole;
  faces?: number;
  textureSize?: number;
  /** Views whose silhouette overlap falls below this are reported (and listed in `weak`). */
  minOverlap?: number;
  onStage?: (label: string) => void;
}

export interface SheetBuild {
  glb: Blob;
  figures: SheetFigure[];
  cutouts: Partial<Record<SheetRole, Blob>>;
  paintedShare: number;
  overlap: Record<string, number>;
  weak: string[];
  seconds: number;
}

/** Sheet → generated shape → painted from every view. The views that don't line up are named in `weak`. */
export async function buildFromSheet(sheet: Blob, options: SheetBuildOptions = {}): Promise<SheetBuild> {
  const t0 = performance.now(), stage = options.onStage ?? (() => {});
  stage('Finding the views on the sheet');
  const img = await rasterOf(sheet);
  const figures = findSheetViews(img);
  for (const [i, role] of Object.entries(options.roles ?? {})) if (figures[+i]) figures[+i].role = role;
  const cut: Partial<Record<SheetRole, Raster>> = {};
  for (const f of figures) if (f.role !== 'detail' && !cut[f.role]) cut[f.role] = cutFigure(img, f);
  const from = options.shapeFrom ?? 'front';
  if (!cut[from]) throw new Error(`No ${from} view found on the sheet`);
  const cutouts: Partial<Record<SheetRole, Blob>> = {};
  for (const [role, r] of Object.entries(cut)) cutouts[role as SheetRole] = await rasterToPng(r!);
  stage('Generating the shape from the ' + from + ' view');
  const shape = await imageToModel(cutouts[from]!, 'hunyuan_mini', { quality: 'detail', octreeResolution: 380, steps: 5, faceLimit: 300000, keepLargest: true });
  stage('Painting it from every view');
  const views: Partial<Record<PaintViewName, Blob>> = {};
  for (const role of ['front', 'back', 'left', 'right', 'top'] as const) if (cutouts[role]) views[role] = cutouts[role];
  // a sheet without a back: the mirrored front is the right outline and, for thin symmetric parts, the right paint
  if (!views.back && cut.front) views.back = await rasterToPng(cut.front, true);
  const paint = (v: typeof views) => paintFromViews(shape.glb, v, { faces: options.faces ?? 60000, res: options.textureSize ?? 2048 });
  let painted = await paint(views);
  const min = options.minOverlap ?? 0.6;
  const weakNames = Object.entries(painted.overlap).filter(([k, v]) => v < min && k !== from).map(([k]) => k);
  const weak = weakNames.map((k) => `${k} ${painted.overlap[k].toFixed(2)}`);
  if (weakNames.length) {
    // A view that doesn't line up with the shape isn't that side of it (a floor plan in the top slot, a profile in a side
    // slot, a mis-guessed role): painting it on smears the wrong picture over the model. Paint again without it.
    stage('Repainting without ' + weakNames.join(', '));
    for (const k of weakNames) delete views[k as PaintViewName];
    const first = painted.overlap;
    painted = await paint(views);
    painted.overlap = { ...first, ...painted.overlap };
  }
  return { glb: painted.glb, figures, cutouts, paintedShare: painted.paintedShare, overlap: painted.overlap, weak, seconds: (performance.now() - t0) / 1000 };
}
