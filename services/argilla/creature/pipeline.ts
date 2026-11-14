/**
 * pipeline.ts — the steps from "what is this" to a living model, and how a picture lands on the body.
 */

import type { ClayFieldSnapshot } from '../engine';
import type { PictureReading } from '../npuLane';
import { largestShape } from '../pictureClay';
import type { Anatomy } from './anatomy';
import type { SurfaceBrief } from './codex';
import type { CreatureModel, FinishOptions, PaintView, PicturePaint } from './finish';
import { SHEET_FLOOR, SHEET_TOP, type SheetView } from './sheetClay';

/** Carves a sheet in a worker. */
export function sheetInWorker(mask: Float32Array, size: number, aspect: number, views: SheetView[], grid: number, band: number) {
  return new Promise<ClayFieldSnapshot>((resolve, reject) => {
    const worker = new Worker(new URL('./sheetClay.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { worker.terminate(); if (data.field) resolve(data.field); else reject(new Error(data.error)); };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Could not read this sheet.')); };
    worker.postMessage({ mask, size, aspect, views, grid, band });
  });
}

const DOMAIN = { floor: SHEET_FLOOR, top: SHEET_TOP };

/** Paints a sheet's views on from all round: the carved body already lines up with each one. */
export async function sheetPaint(file: Blob, views: SheetView[], reading: PictureReading): Promise<PicturePaint> {
  const bitmap = await createImageBitmap(file);
  try {
    const k = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * k), height = Math.round(bitmap.height * k);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const span = DOMAIN.top - DOMAIN.floor;
    const paintViews: PaintView[] = views.map((view) => {
      const halfU = ((view.u1 - view.u0) * reading.aspect * span) / (view.v1 - view.v0) / 2;
      return { role: view.role, box: view, h0: -halfU, h1: halfU, y0: DOMAIN.floor, y1: DOMAIN.top };
    });
    return { rgba, width, height, box: { u0: 0, v0: 0, u1: 1, v1: 1 }, worldBox: { x0: 9, x1: 10, y0: 9, y1: 10 }, views: paintViews, mask: reading.mask, maskSize: reading.maskSize };
  } finally {
    bitmap.close();
  }
}

/** Runs the finish in a worker and reports each stage. */
export function finishInWorker(
  field: ClayFieldSnapshot, anatomy: Anatomy, surface: SurfaceBrief, options: Omit<FinishOptions, 'onProgress'>,
  onProgress?: (fraction: number, label: string) => void,
) {
  return new Promise<CreatureModel>((resolve, reject) => {
    const worker = new Worker(new URL('./finish.worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = ({ data }) => {
      if (data.label) { onProgress?.(data.fraction, data.label); return; }
      done();
      if (data.model) resolve(data.model);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => { done(); reject(new Error(event.message || 'Could not finish this creature.')); };
    worker.postMessage({ field, anatomy, surface, options });
  });
}

export interface PictureFraming {
  /** True when the subject runs off the bottom of the frame, so the body below is invented. */
  cropped: boolean;
  /** Fraction of the subject's height that is head, or 1 when no neck could be found. */
  headShare: number;
  box: { u0: number; v0: number; u1: number; v1: number };
  headBox: { u0: number; v0: number; u1: number; v1: number };
}

/**
 * Finds what the frame shows: a full figure or a crop, and where the head is. The neck is the first place the
 * outline narrows below the crown and then widens. Good enough to place paint, and honest in the note when the
 * outline gives no answer.
 */
export function readFraming(mask: Float32Array, size: number): PictureFraming | null {
  const shape = largestShape(mask, size);
  if (!shape) return null;
  const y0 = Math.floor(shape.v0 * size), y1 = Math.ceil(shape.v1 * size);
  const rows: { w: number; x0: number; x1: number }[] = [];
  for (let y = y0; y < y1; y++) {
    let x0 = size, x1 = -1;
    for (let x = 0; x < size; x++) if (shape.label[x + y * size] === shape.best) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    rows.push({ w: x1 >= x0 ? x1 - x0 + 1 : 0, x0, x1 });
  }
  const tall = rows.length;
  const smooth = rows.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(tall - 1, i + 3); k++) { sum += rows[k].w; n++; }
    return sum / n;
  });
  let neck = -1, peak = 0;
  for (let i = Math.floor(tall * 0.08); i < Math.floor(tall * 0.7); i++) {
    peak = Math.max(peak, smooth[i]);
    const later = Math.max(...smooth.slice(i, Math.min(tall, i + Math.floor(tall * 0.2))));
    if (smooth[i] < peak * 0.82 && later > smooth[i] * 1.25) { neck = i; break; }
  }
  // A whole figure is much taller than wide, with a narrower base than its top half. Anything else is a crop,
  // even when the cut-out stopped short of the frame.
  const tallness = ((shape.v1 - shape.v0) / Math.max(1e-3, shape.u1 - shape.u0));
  const cropped = shape.v1 > 0.97 || tallness < 1.7;
  // No neck in the outline: a head-and-shoulders crop that fills the frame is mostly head.
  const headRows = neck > 0 ? neck : cropped ? Math.floor(tall * 0.72) : Math.floor(tall * 0.18);
  let hx0 = size, hx1 = 0;
  for (let i = 0; i < headRows; i++) { if (rows[i].w) { hx0 = Math.min(hx0, rows[i].x0); hx1 = Math.max(hx1, rows[i].x1 + 1); } }
  return {
    cropped,
    headShare: headRows / tall,
    box: { u0: shape.u0, v0: shape.v0, u1: shape.u1, v1: shape.v1 },
    headBox: { u0: hx0 / size, v0: shape.v0, u1: hx1 / size, v1: shape.v0 + (headRows / size) },
  };
}

/** Fits a picture onto a body: a crop paints the head, a full figure paints everything. */
export async function picturePaint(file: Blob, reading: PictureReading | null, anatomy: Anatomy): Promise<PicturePaint | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 1024;
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * k), height = Math.round(bitmap.height * k);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const framing = reading ? readFraming(reading.mask, reading.maskSize) : null;
    const head = anatomy.byName.head;
    const r = head.radius;
    const muzzleTip = anatomy.byName.muzzle.tip;
    if (framing && framing.cropped) {
      const reach = Math.max(r * 1.25, Math.abs(muzzleTip[0] - head.at[0]) + r);
      const aspect = ((framing.headBox.u1 - framing.headBox.u0) * (reading?.aspect ?? 1)) / Math.max(1e-3, framing.headBox.v1 - framing.headBox.v0);
      const halfY = Math.max(r * 1.55, reach);
      const halfX = halfY * aspect;
      return {
        rgba, width, height, box: framing.headBox,
        worldBox: { x0: head.at[0] - halfX, x1: head.at[0] + halfX, y0: head.at[1] - halfY * 0.95, y1: head.at[1] + halfY * 1.05 },
        mask: reading?.mask, maskSize: reading?.maskSize, depth: reading?.depth, depthSize: reading?.depthSize,
      };
    }
    if (framing) {
      const top = anatomy.bones.reduce((m, b) => Math.max(m, b.tip[1], b.at[1]), -1);
      const tall = top - anatomy.floor;
      const aspect = ((framing.box.u1 - framing.box.u0) * (reading?.aspect ?? 1)) / Math.max(1e-3, framing.box.v1 - framing.box.v0);
      const halfX = (tall * aspect) / 2;
      return {
        rgba, width, height, box: framing.box,
        worldBox: { x0: -halfX, x1: halfX, y0: anatomy.floor, y1: top },
        mask: reading?.mask, maskSize: reading?.maskSize, depth: reading?.depth, depthSize: reading?.depthSize,
      };
    }
    // No outline to place it by, so the picture only gives the coat its colours.
    return { rgba, width, height, box: { u0: 0, v0: 0, u1: 1, v1: 1 }, worldBox: { x0: 9, x1: 10, y0: 9, y1: 10 } };
  } finally {
    bitmap.close();
  }
}
