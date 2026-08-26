// worksheetReprint — DOM/canvas glue over worksheetReprintCore.
//
// Turns a worksheet photo into (a) a flattened, flatbed-quality working image, and (b) clean
// per-region artwork: line-art regions are re-inked from the binary ink mask and traced into
// pen-editable splines; color regions are traced from the flattened crop; and when tracing
// fails the fallback is a paper-knocked-out cutout of the FLATTENED image — never a grey
// photograph rectangle pasted onto the white rebuilt page.

import { traceBitmapToTela } from './telaImageTrace';
import {
  buildInkMap, classifyRegionArt, flattenWorksheetPixels,
  computeHomography, findPaperQuadFromMask, orderQuadCorners,
  type InkBox, type InkRegion, type RegionArtProfile,
} from './worksheetReprintCore';
import type { TelaVectorObject } from '../types';

export interface FlattenedWorksheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dataUrl: string;
  imageData: ImageData;
  ink: Uint8Array;
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read the worksheet image.'));
    image.src = src;
  });
}

/** Flatten paper + lighting once; every later pass (OCR, tracing, fallbacks) reads this. */
export async function flattenWorksheet(src: string, maxEdge = 1700): Promise<FlattenedWorksheet> {
  const image = await loadImageEl(src);
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas processing is unavailable in this browser.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  flattenWorksheetPixels(imageData.data, width, height);
  ctx.putImageData(imageData, 0, 0);
  const ink = buildInkMap(imageData.data, width, height);
  return { canvas, ctx, width, height, dataUrl: canvas.toDataURL('image/jpeg', .92), imageData, ink };
}

/**
 * Real photos frame the worksheet against a desk, keyboard, or a hand — dark clutter that
 * flattening turns into ink and that bridges the whole page into one connected blob. This isolates
 * the paper: it builds a downscaled bright-paper mask, flood-fills the EXTERIOR background inward
 * from the image borders (so interior ink holes on the page are kept, only off-page clutter is
 * marked), then crops to the paper and paints every exterior pixel white. Tilted-paper photos leave
 * dark triangles in the corners that an axis-aligned crop can't remove — white-out does.
 */
export function cropToPaper(flat: FlattenedWorksheet): FlattenedWorksheet {
  const { width: W, height: H, imageData } = flat;
  const d = imageData.data;
  const step = Math.max(1, Math.round(Math.max(W, H) / 400));
  const mw = Math.ceil(W / step), mh = Math.ceil(H / step);
  const paper = new Uint8Array(mw * mh); // 1 = bright paper
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const x = Math.min(W - 1, mx * step), y = Math.min(H - 1, my * step);
    const i = (y * W + x) * 4;
    const lum = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
    const chroma = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    paper[my * mw + mx] = lum > 165 && chroma < 46 ? 1 : 0;
  }
  // Flood the EXTERIOR: dark cells reachable from any border cell. Interior ink holes (dark cells
  // enclosed by paper) are never reached, so they stay part of the page.
  const exterior = new Uint8Array(mw * mh);
  const queue: number[] = [];
  const pushIf = (p: number) => { if (p >= 0 && p < paper.length && !exterior[p] && !paper[p]) { exterior[p] = 1; queue.push(p); } };
  for (let x = 0; x < mw; x++) { pushIf(x); pushIf((mh - 1) * mw + x); }
  for (let y = 0; y < mh; y++) { pushIf(y * mw); pushIf(y * mw + mw - 1); }
  while (queue.length) {
    const q = queue.pop()!; const qx = q % mw, qy = (q / mw) | 0;
    pushIf(qy * mw + qx - 1); pushIf(qy * mw + qx + 1);
    pushIf((qy - 1) * mw + qx); pushIf((qy + 1) * mw + qx);
  }
  // Paper region = not exterior. Compute its bbox and pixel count.
  let x0 = mw, y0 = mh, x1 = 0, y1 = 0, paperCells = 0;
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    if (exterior[my * mw + mx]) continue;
    paperCells++;
    if (mx < x0) x0 = mx; if (mx > x1) x1 = mx; if (my < y0) y0 = my; if (my > y1) y1 = my;
  }
  const exteriorFrac = 1 - paperCells / (mw * mh);
  const margin = Math.round(Math.min(W, H) * .004);
  let cx0 = Math.max(0, x0 * step - margin), cy0 = Math.max(0, y0 * step - margin);
  let cx1 = Math.min(W, (x1 + 1) * step + margin), cy1 = Math.min(H, (y1 + 1) * step + margin);
  const cw = cx1 - cx0, ch = cy1 - cy0;
  // If almost the whole frame is paper, nothing to do.
  if (exteriorFrac < .02 && cw > W * .95 && ch > H * .95) return flat;
  if (cw < W * .35 || ch < H * .35) return flat; // detection failed — don't wreck the page
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(flat.canvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
  const cropData = ctx.getImageData(0, 0, cw, ch);
  const cd = cropData.data;
  // White-out exterior pixels (map each to its downscaled cell). Dilate the paper region by one
  // cell so the paper's own edge isn't clipped.
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const mx = Math.min(mw - 1, ((cx0 + x) / step) | 0), my = Math.min(mh - 1, ((cy0 + y) / step) | 0);
    let isExterior = exterior[my * mw + mx] === 1;
    if (isExterior) {
      // keep if any 4-neighbour cell is paper (dilation guard against clipping the edge)
      if ((mx > 0 && !exterior[my * mw + mx - 1]) || (mx < mw - 1 && !exterior[my * mw + mx + 1]) ||
          (my > 0 && !exterior[(my - 1) * mw + mx]) || (my < mh - 1 && !exterior[(my + 1) * mw + mx])) isExterior = false;
    }
    if (isExterior) { const i = (y * cw + x) * 4; cd[i] = 255; cd[i + 1] = 255; cd[i + 2] = 255; }
  }
  ctx.putImageData(cropData, 0, 0);
  const ink = buildInkMap(cropData.data, cw, ch);
  return { canvas, ctx, width: cw, height: ch, dataUrl: canvas.toDataURL('image/jpeg', .92), imageData: cropData, ink };
}

/**
 * Perspective-correct a flattened worksheet: find the paper's four corners and warp that
 * (possibly keystoned) quadrilateral to a flat rectangle. This handles photos shot at an angle,
 * which the small-angle deskew cannot. Returns null when no confident, meaningfully-skewed quad is
 * found — the caller then falls back to the axis-aligned cropToPaper. Strong validation keeps a bad
 * corner guess (from background clutter) from distorting an already-good page.
 */
export function warpToPage(flat: FlattenedWorksheet): FlattenedWorksheet | null {
  const { width: W, height: H, imageData } = flat;
  const d = imageData.data;
  const step = Math.max(1, Math.round(Math.max(W, H) / 300));
  const mw = Math.ceil(W / step), mh = Math.ceil(H / step);
  const mask = new Uint8Array(mw * mh);
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const x = Math.min(W - 1, mx * step), y = Math.min(H - 1, my * step);
    const i = (y * W + x) * 4;
    const lum = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
    const chroma = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    mask[my * mw + mx] = lum > 165 && chroma < 46 ? 1 : 0;
  }
  const raw = findPaperQuadFromMask(mask, mw, mh, step);
  if (!raw) return null;
  const [tl, tr, br, bl] = orderQuadCorners(raw);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const wTop = dist(tl, tr), wBot = dist(bl, br), hL = dist(tl, bl), hR = dist(tr, br);
  const minEdge = Math.min(wTop, wBot, hL, hR);
  if (minEdge < Math.min(W, H) * 0.2) return null; // degenerate
  // convexity: all cross products of consecutive edges share a sign
  const quad = [tl, tr, br, bl];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4], c = quad[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) { if (sign === 0) sign = Math.sign(cross); else if (Math.sign(cross) !== sign) return null; }
  }
  // shoelace area vs frame
  const area = Math.abs((tl[0] * tr[1] - tr[0] * tl[1]) + (tr[0] * br[1] - br[0] * tr[1]) + (br[0] * bl[1] - bl[0] * br[1]) + (bl[0] * tl[1] - tl[0] * bl[1])) / 2;
  if (area < W * H * 0.25) return null;
  // only warp when it actually corrects something: crops real background, or a real perspective skew.
  const widthSkew = Math.abs(wTop - wBot) / Math.max(wTop, wBot);
  const heightSkew = Math.abs(hL - hR) / Math.max(hL, hR);
  const cropsBackground = area < W * H * 0.9;
  if (widthSkew < 0.05 && heightSkew < 0.05 && !cropsBackground) return null;

  const outW = Math.max(2, Math.round(Math.max(wTop, wBot)));
  const outH = Math.max(2, Math.round(Math.max(hL, hR)));
  const cap = 1700, s = Math.min(1, cap / Math.max(outW, outH));
  const OW = Math.max(2, Math.round(outW * s)), OH = Math.max(2, Math.round(outH * s));
  // inverse homography: output-rectangle pixel → source coordinate.
  const Hinv = computeHomography([[0, 0], [OW, 0], [OW, OH], [0, OH]], [tl, tr, br, bl]);
  const out = new ImageData(OW, OH);
  const od = out.data, W4 = W * 4;
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const w = Hinv[6] * x + Hinv[7] * y + Hinv[8];
    const sx = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / w;
    const sy = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / w;
    const oi = (y * OW + x) * 4;
    if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) { od[oi] = od[oi + 1] = od[oi + 2] = 255; od[oi + 3] = 255; continue; }
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    const i00 = y0 * W4 + x0 * 4, i10 = i00 + 4, i01 = i00 + W4, i11 = i01 + 4;
    for (let c = 0; c < 3; c++) {
      const top = d[i00 + c] * (1 - fx) + d[i10 + c] * fx;
      const bot = d[i01 + c] * (1 - fx) + d[i11 + c] * fx;
      od[oi + c] = top * (1 - fy) + bot * fy;
    }
    od[oi + 3] = 255;
  }
  const canvas = document.createElement('canvas'); canvas.width = OW; canvas.height = OH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.putImageData(out, 0, 0);
  const ink = buildInkMap(out.data, OW, OH);
  return { canvas, ctx, width: OW, height: OH, dataUrl: canvas.toDataURL('image/jpeg', .92), imageData: out, ink };
}

/**
 * Re-render an already-flattened worksheet at a new rotation (any degrees; 90/180/270 for
 * orientation, small values for deskew) and rebuild its ink map. Rotating the flattened
 * canvas — not the raw photo — keeps paper white and ink crisp through the transform.
 */
export function rotateWorksheet(flat: FlattenedWorksheet, degrees: number): FlattenedWorksheet {
  const norm = ((degrees % 360) + 360) % 360;
  if (norm === 0) return flat;
  const rad = norm * Math.PI / 180;
  const swap = norm === 90 || norm === 270;
  const w = swap ? flat.height : flat.width;
  const h = swap ? flat.width : flat.height;
  // For non-orthogonal angles the rotated content needs a bounding box big enough to hold it.
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const outW = Math.round(flat.width * cos + flat.height * sin);
  const outH = Math.round(flat.width * sin + flat.height * cos);
  const width = (norm % 90 === 0) ? w : outW;
  const height = (norm % 90 === 0) ? h : outH;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rad);
  ctx.drawImage(flat.canvas, -flat.width / 2, -flat.height / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const ink = buildInkMap(imageData.data, width, height);
  return { canvas, ctx, width, height, dataUrl: canvas.toDataURL('image/jpeg', .92), imageData, ink };
}

const pad2 = (region: InkBox, width: number, height: number, pad: number) => {
  const x = Math.max(0, Math.floor(region.x - pad)), y = Math.max(0, Math.floor(region.y - pad));
  return { x, y, w: Math.min(width - x, Math.ceil(region.w + pad * 2)), h: Math.min(height - y, Math.ceil(region.h + pad * 2)) };
};

/** Crop the flattened page and knock the paper out to transparency — the graceful fallback. */
export function paperKnockoutCrop(flat: FlattenedWorksheet, region: InkBox): { dataUrl: string; x: number; y: number; width: number; height: number } {
  const box = pad2(region, flat.width, flat.height, 2);
  const canvas = document.createElement('canvas'); canvas.width = box.w; canvas.height = box.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(flat.canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const pixels = ctx.getImageData(0, 0, box.w, box.h);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
    const chroma = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    if (lum > 234 && chroma < 26) d[i + 3] = 0;
    else if (lum > 214 && chroma < 26) d[i + 3] = Math.round(255 * (234 - lum) / 20); // feathered edge
  }
  ctx.putImageData(pixels, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), x: box.x, y: box.y, width: box.w, height: box.h };
}

/**
 * Crop a 0–100% answer box from the flattened page into a clean data URL for handwriting OCR.
 * The page is already flattened to white so the crop matches TrOCR's clean-handwriting training
 * distribution; a small vertical pad catches ascenders/descenders that overflow the box, and the
 * crop is scaled up to a comfortable reading height.
 */
export function cropPercentBox(flat: FlattenedWorksheet, box: { x: number; y: number; width: number; height: number }, padPct = 0.4): string {
  const padY = box.height * padPct, padX = box.width * 0.02;
  const x0 = Math.max(0, Math.round((box.x - padX) / 100 * flat.width));
  const y0 = Math.max(0, Math.round((box.y - padY) / 100 * flat.height));
  const x1 = Math.min(flat.width, Math.round((box.x + box.width + padX) / 100 * flat.width));
  const y1 = Math.min(flat.height, Math.round((box.y + box.height + padY) / 100 * flat.height));
  const w = Math.max(2, x1 - x0), h = Math.max(2, y1 - y0);
  const targetH = Math.min(96, Math.max(48, h));
  const scale = targetH / h;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w * scale)); canvas.height = Math.max(2, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(flat.canvas, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/**
 * Crop just the STUDENT HANDWRITING from a field's answer area for handwriting OCR. Unlike a plain
 * crop, this re-inks the region from the binary ink map and strips long straight runs (the printed
 * answer rules / underlines) that otherwise dominate the crop and make the recogniser hallucinate.
 * The result is clean dark handwriting on white — TrOCR's training distribution.
 */
export function cropHandwriting(flat: FlattenedWorksheet, box: { x: number; y: number; width: number; height: number }, padPct = 0.35): string {
  const padY = box.height * padPct, padX = box.width * 0.01;
  const x0 = Math.max(0, Math.round((box.x - padX) / 100 * flat.width));
  const y0 = Math.max(0, Math.round((box.y - padY) / 100 * flat.height));
  const x1 = Math.min(flat.width, Math.round((box.x + box.width + padX) / 100 * flat.width));
  const y1 = Math.min(flat.height, Math.round((box.y + box.height + padY) / 100 * flat.height));
  const w = Math.max(2, x1 - x0), h = Math.max(2, y1 - y0);
  // local ink (from the page ink map), then strip near-full-width horizontal runs (answer rules).
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ink[y * w + x] = flat.ink[(y0 + y) * flat.width + (x0 + x)] ? 1 : 0;
  const ruleMin = Math.max(12, Math.round(w * 0.55));
  for (let y = 0; y < h; y++) {
    let run = 0, start = -1;
    for (let x = 0; x <= w; x++) {
      if (x < w && ink[y * w + x]) { if (start < 0) start = x; run++; }
      else { if (run >= ruleMin) for (let k = start; k < x; k++) { ink[y * w + k] = 0; if (y + 1 < h) ink[(y + 1) * w + k] = 0; if (y > 0) ink[(y - 1) * w + k] = 0; } start = -1; run = 0; }
    }
  }
  const targetH = Math.min(96, Math.max(48, h));
  const scale = targetH / h;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w * scale)); canvas.height = Math.max(2, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // render the cleaned ink as dark strokes on white, scaled up.
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sctx = src.getContext('2d')!; const img = sctx.createImageData(w, h);
  for (let p = 0; p < ink.length; p++) { const v = ink[p] ? 22 : 255; const i = p * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 4; img.data[i + 3] = 255; }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export interface RegionTraceResult {
  objects: TelaVectorObject[];
  status: 'TRACED_MASK' | 'TRACED_BOX';
  profile: RegionArtProfile;
  /** Crop origin in flattened-page coordinates, for positioning the returned objects. */
  crop: InkBox;
  /** The tracer's working bitmap size; object coords are in this space. */
  traceWidth: number;
  traceHeight: number;
}

/**
 * Trace one artwork region into editable Tela paths.
 * LINE_ART re-inks the region from the binary ink map (pure ink color on pure white) so the
 * tracer sees print, not photograph. COLOR traces the flattened crop with paper dropped.
 */
export async function traceWorksheetRegion(flat: FlattenedWorksheet, region: InkRegion): Promise<RegionTraceResult> {
  const profile = classifyRegionArt(flat.imageData.data, flat.width, flat.height, region, flat.ink);
  const crop = pad2(region, flat.width, flat.height, 3);
  const canvas = document.createElement('canvas'); canvas.width = crop.w; canvas.height = crop.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let status: RegionTraceResult['status'] = 'TRACED_MASK';

  if (profile.style === 'LINE_ART') {
    // Re-ink: binary mask → crisp two-tone bitmap. Camera noise cannot reach the tracer.
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, crop.w, crop.h);
    const out = ctx.getImageData(0, 0, crop.w, crop.h);
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
      if (!flat.ink[(crop.y + y) * flat.width + (crop.x + x)]) continue;
      const i = (y * crop.w + x) * 4;
      out.data[i] = 20; out.data[i + 1] = 16; out.data[i + 2] = 24; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  } else {
    status = 'TRACED_BOX';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, crop.w, crop.h);
    ctx.drawImage(flat.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  }

  // COLOR uses the LOGO preset: flat worksheet clip-art wants few, confident color shapes —
  // the DETAILED 12-color mode turns residual JPEG noise into dozens of speckle paths.
  const trace = await traceBitmapToTela(canvas.toDataURL('image/png'), profile.style === 'LINE_ART' ? 'LINE_ART' : 'LOGO', {
    layerMode: 'EDITABLE_CONTOURS', maxLayers: 48, maxNodesPerLayer: 360, dropPaperWhite: profile.style === 'COLOR',
  });
  const paths = trace.objects.filter(object => object.kind === 'PATH' && object.svgPathData);
  const luminanceOf = (fill: string) => {
    const nums = fill.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
      || (fill.startsWith('#') && fill.length >= 7 ? [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16)) : null);
    return nums && nums.length === 3 ? nums[0] * .2126 + nums[1] * .7152 + nums[2] * .0722 : 0;
  };
  const recolored = profile.style === 'LINE_ART'
    ? paths.map(object => ({ ...object, fill: luminanceOf(object.fill) > 180 ? '#ffffff' : profile.inkColor }))
    : paths;
  return { objects: recolored, status, profile, crop: { ...crop }, traceWidth: trace.width, traceHeight: trace.height };
}
