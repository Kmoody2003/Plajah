/**
 * npuLane.ts — reads a picture for Argilla on the NPU, through the loopback engine in engines/argilla-npu.
 *
 * Desktop first, like the other local engines: the native shell starts it (ARGILLA_NPU_ENSURE), and the
 * dev server does on a dev build. A picture that already has transparency needs no engine for its outline.
 */

import { ensureNativeArgillaNpu, installNativeArgillaNpu, isWindowsApp } from '../windowsBridgeService';
import type { ClayFieldSnapshot } from './engine';
import type { PictureClayOptions, PictureMaps } from './pictureClay';
import { largestShape } from './pictureClay';
import type { ObjectReading } from './understand/vocabulary';
import { wholeSubject } from './understand/wholeSubject';
import { composeViews, SheetBox, suggestBoxes } from './creature/sheetClay';

export const NPU_URL = 'http://127.0.0.1:51125';
const CUTOUT_SIZE = 320;
const DEPTH_SIZE = 518;
const RECOGNIZE_SIZE = 224;

export interface PictureReading extends PictureMaps {
  /** Where each step ran, for the note in the studio. */
  device: string;
  ms: { cutout?: number; depth?: number; recognize?: number };
  /** What the picture looks like to the vision model, by codex id. Absent when that model isn't installed. */
  scores?: Record<string, number>;
  /** What the vision model thinks this is, best first, from everything it can name. */
  objects?: ObjectReading[];
  /** The part of the picture the depth map covers. */
  depthBox?: { u0: number; v0: number; u1: number; v1: number };
}

async function answers() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    return (await fetch(`${NPU_URL}/health`, { signal: ctrl.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The desktop app can read pictures here, once the person agrees to set it up. */
export class NeedsSetup extends Error {
  constructor(readonly megabytes: number) { super('Reading pictures needs a one-time setup on this PC.'); }
}

/** Downloads the engine's env and models through the desktop app. */
export async function setUpLane(onProgress?: (label: string, fraction: number) => void) {
  const done = await installNativeArgillaNpu(onProgress);
  if (!done.success) throw new Error(done.error || 'Setup did not finish.');
}

async function ensureLane(maxWaitMs = 30_000) {
  if (await answers()) return true;
  try {
    if (isWindowsApp()) {
      const started = await ensureNativeArgillaNpu();
      if (started.needsInstall) throw new NeedsSetup(started.installMegabytes ?? 0);
      if (!started.success) return false;
    } else {
      const started = await (await fetch('/api/local-ai/argilla-npu/ensure', { method: 'POST' })).json();
      if (!started?.success) return false;
    }
  } catch (error) {
    if (error instanceof NeedsSetup) throw error;
    return false;
  }
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await answers()) return true;
  }
  return false;
}

function squash(image: ImageBitmap, size: number) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  // Models see a neutral grey behind transparent pixels, not black.
  context.fillStyle = '#808080';
  context.fillRect(0, 0, size, size);
  // A big picture shrunk without care shimmers, and depth reads that as edges.
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size, size);
  const rgba = context.getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2];
  }
  return rgb;
}

/** The picture's own transparency as a mask, when it really has some. */
function alphaMask(image: ImageBitmap, size: number) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, size, size);
  const rgba = context.getImageData(0, 0, size, size).data;
  const mask = new Float32Array(size * size);
  let clear = 0, solid = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = rgba[i * 4 + 3];
    mask[i] = a / 255;
    if (a < 16) clear++;
    if (a > 240) solid++;
  }
  return clear > mask.length * 0.02 && solid > mask.length * 0.01 ? mask : null;
}

async function post(path: string, body: Uint8Array) {
  const res = await fetch(`${NPU_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    throw new Error(failure?.error || `The NPU engine answered ${res.status}`);
  }
  return {
    bytes: await res.arrayBuffer(),
    device: res.headers.get('X-Device') || 'unknown',
    ms: Number(res.headers.get('X-Infer-Ms')) || undefined,
  };
}

/** What the vision model sees in a whole subject: which kind of thing it is. */
export async function readKind(image: ImageBitmap) {
  const seen = await post('/read-kind', squash(image, RECOGNIZE_SIZE));
  return JSON.parse(new TextDecoder().decode(seen.bytes)).kinds as Record<string, number>;
}

/** What the vision model sees in one part: names and materials. */
export async function readPart(image: ImageBitmap) {
  const seen = await post('/read-part', squash(image, RECOGNIZE_SIZE));
  return JSON.parse(new TextDecoder().decode(seen.bytes)) as { parts: Record<string, number>; materials: Record<string, number>; inKind?: Record<string, number> };
}

/** Runs the bake in a worker. Each call has its own, so a slider can't get an older answer. */
export function bakePicture(maps: PictureMaps, options: Omit<PictureClayOptions, 'onProgress'>) {
  return new Promise<ClayFieldSnapshot>((resolve, reject) => {
    const worker = new Worker(new URL('./pictureClay.worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = ({ data }) => {
      done();
      if (data.field) resolve(data.field);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => { done(); reject(new Error(event.message || 'Could not shape the clay.')); };
    worker.postMessage({ maps, options });
  });
}

/** A small grey copy of a sheet, for finding its panels. */
export async function sheetBoxes(file: Blob): Promise<SheetBox[]> {
  const image = await createImageBitmap(file);
  try {
    const k = 960 / Math.max(image.width, image.height);
    const width = Math.round(image.width * k), height = Math.round(image.height * k);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11) / 255;
    return suggestBoxes(gray, width, height);
  } finally {
    image.close();
  }
}

/** Cuts out each view of a sheet on its own: one pass over a whole designed sheet only finds the biggest figure. */
export async function readSheet(file: Blob, boxes: SheetBox[]): Promise<PictureReading & { views: ReturnType<typeof composeViews>['views'] }> {
  const image = await createImageBitmap(file);
  try {
    if (!(await ensureLane())) throw new Error('Reading a character sheet runs in the Plajah desktop app.');
    const crop = (box: SheetBox) => {
      const canvas = new OffscreenCanvas(Math.max(1, Math.round((box.u1 - box.u0) * image.width)), Math.max(1, Math.round((box.v1 - box.v0) * image.height)));
      canvas.getContext('2d')!.drawImage(image, -box.u0 * image.width, -box.v0 * image.height);
      return canvas.transferToImageBitmap();
    };
    const cuts = [];
    let scores: Record<string, number> | undefined;
    let device = 'unknown';
    for (const box of boxes) {
      const piece = crop(box);
      const cut = await post('/cutout', squash(piece, CUTOUT_SIZE));
      device = cut.device;
      if (box.role === 'front') {
        try { scores = JSON.parse(new TextDecoder().decode((await post('/recognize', squash(piece, RECOGNIZE_SIZE))).bytes)).scores; } catch { /* words still work */ }
      }
      piece.close();
      const bytes = new Uint8Array(cut.bytes);
      cuts.push({ box, size: CUTOUT_SIZE, mask: Float32Array.from(bytes, (v) => v / 255) });
    }
    const size = 1024;
    const { mask, views } = composeViews(cuts, size);
    return { mask, maskSize: size, aspect: image.width / image.height, device, ms: {}, scores, views };
  } finally {
    image.close();
  }
}

/** A whole frame for a scene: depth over everything, not close up on one subject. */
export async function readFrame(file: Blob) {
  const image = await createImageBitmap(file);
  try {
    if (!(await ensureLane())) throw new Error('Building a scene from a picture runs in the Plajah desktop app.');
    const depth = await post('/depth', squash(image, DEPTH_SIZE));
    const cut = await post('/cutout', squash(image, CUTOUT_SIZE));
    const bytes = new Uint8Array(cut.bytes);
    const raw = Float32Array.from(bytes, (v) => v / 255);
    // The main subject's missed parts come back, and anything else the cut-out was sure of stays its own subject.
    const whole = wholeSubject(raw, CUTOUT_SIZE, new Float32Array(depth.bytes), DEPTH_SIZE, squash(image, CUTOUT_SIZE)).mask;
    return {
      depth: new Float32Array(depth.bytes), depthSize: DEPTH_SIZE,
      mask: whole.map((m, i) => (raw[i] >= 0.5 ? Math.max(m, raw[i]) : m)), maskSize: CUTOUT_SIZE, aspect: image.width / image.height,
    };
  } finally {
    image.close();
  }
}

/** Cut-out and depth for a picture. Throws a readable message when it can't be read at all. */
export async function readPicture(file: Blob): Promise<PictureReading> {
  const image = await createImageBitmap(file);
  try {
    const aspect = image.width / image.height;
    const alpha = alphaMask(image, CUTOUT_SIZE);
    const online = await ensureLane();
    if (!online) {
      if (alpha) return { mask: alpha, maskSize: CUTOUT_SIZE, aspect, device: 'none', ms: {} };
      throw new Error('Reading a picture runs in the Plajah desktop app. Here, use a PNG with a transparent background.');
    }
    let mask = alpha;
    let cutoutMs: number | undefined;
    if (!mask) {
      const cut = await post('/cutout', squash(image, CUTOUT_SIZE));
      cutoutMs = cut.ms;
      const bytes = new Uint8Array(cut.bytes);
      mask = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) mask[i] = bytes[i] / 255;
      // The cut-out keeps what catches the eye and can drop whole parts. Depth over the whole frame finds them again.
      const frame = await post('/depth', squash(image, DEPTH_SIZE));
      mask = wholeSubject(mask, CUTOUT_SIZE, new Float32Array(frame.bytes), DEPTH_SIZE, squash(image, CUTOUT_SIZE)).mask;
    }
    // Depth is read close up on the subject: the model's 518 samples then all land on the thing, not the room around it.
    const shape = largestShape(mask, CUTOUT_SIZE);
    const pad = 0.04;
    const depthBox = shape
      ? { u0: Math.max(0, shape.u0 - pad), v0: Math.max(0, shape.v0 - pad), u1: Math.min(1, shape.u1 + pad), v1: Math.min(1, shape.v1 + pad) }
      : { u0: 0, v0: 0, u1: 1, v1: 1 };
    const closeUp = new OffscreenCanvas(Math.max(1, Math.round((depthBox.u1 - depthBox.u0) * image.width)), Math.max(1, Math.round((depthBox.v1 - depthBox.v0) * image.height)));
    closeUp.getContext('2d')!.drawImage(image, -depthBox.u0 * image.width, -depthBox.v0 * image.height);
    const piece = closeUp.transferToImageBitmap();
    const depth = await post('/depth', squash(piece, DEPTH_SIZE));
    let scores: Record<string, number> | undefined;
    let objects: ObjectReading[] | undefined;
    let recognizeMs: number | undefined;
    try {
      const seen = await post('/recognize', squash(piece, RECOGNIZE_SIZE));
      const answer = JSON.parse(new TextDecoder().decode(seen.bytes));
      scores = answer.scores;
      objects = answer.objects;
      recognizeMs = seen.ms;
    } catch { /* An older setup has no vision model; words still work. */ }
    piece.close();
    return {
      mask, maskSize: CUTOUT_SIZE, depth: new Float32Array(depth.bytes), depthSize: DEPTH_SIZE, aspect,
      device: depth.device, ms: { cutout: cutoutMs, depth: depth.ms, recognize: recognizeMs }, scores, objects, depthBox,
    };
  } finally {
    image.close();
  }
}
