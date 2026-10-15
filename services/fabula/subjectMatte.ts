// subjectMatte — the first ML mask source (W4): a person/subject matte from MediaPipe's
// selfie segmenter, exposed as a mask canvas any Forge effect can use (mask.kind = 'subject').
//
// Loading follows the house convention (faceTracker.ts / matteEngine.ts): lazy CDN import of
// @mediapipe/tasks-vision, GPU delegate with CPU fallback, nothing bundled. Two entry points:
//   • segmentSubject(el, w, h)       — async, exact: used by the OFFLINE renderer per frame.
//   • segmentSubjectLatest(el, w, h) — sync: returns the most recent matte for this element and
//                                      schedules a refresh (throttled) — used by the live monitor.
// The matte is a grayscale canvas (white = subject). Feather/invert are applied by the caller.
export type SegmenterHandle = { segmentForVideo: (el: any, ts: number) => any; segment: (el: any) => any; close?: () => void };

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

let loading: Promise<SegmenterHandle | null> | null = null;
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function subjectMatteStatus() { return status; }

export function loadSubjectSegmenter(): Promise<SegmenterHandle | null> {
  if (loading) return loading;
  status = 'loading';
  loading = (async () => {
    try {
      const vision: any = await import(/* @vite-ignore */ CDN);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      let seg: any = null;
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          seg = await vision.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
          break;
        } catch (e) { console.warn('[subjectMatte] delegate', delegate, 'failed:', (e as Error)?.message || e); }
      }
      status = seg ? 'ready' : 'failed';
      return seg as SegmenterHandle | null;
    } catch (e) { console.warn('[subjectMatte] load failed:', (e as Error)?.message || e); status = 'failed'; return null; }
  })();
  return loading;
}

import { refineAlphaMatteAndDecontaminate } from '../matting/alphaMattingEngine';

/** Confidence mask → compositing-refined hair/fringe & pass-through alpha matte at w×h. */
function maskToCanvas(
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  result: any,
  w: number,
  h: number,
  into?: HTMLCanvasElement
): HTMLCanvasElement | null {
  const m = result?.confidenceMasks?.[0];
  if (!m) return null;
  const mw = m.width, mh = m.height;
  const data: Float32Array = typeof m.getAsFloat32Array === 'function' ? m.getAsFloat32Array() : m.data;
  if (!data) return null;

  // Upsample soft probabilities and coarse mask to native w x h
  const n = w * h;
  const coarseMask = new Uint8Array(n);
  const softProb = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mh - 1, Math.floor((y / h) * mh));
    const rowOut = y * w;
    const rowIn = sy * mw;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(mw - 1, Math.floor((x / w) * mw));
      const p = Math.max(0, Math.min(1, data[rowIn + sx] ?? 0));
      softProb[rowOut + x] = p;
      coarseMask[rowOut + x] = p >= 0.48 ? 255 : 0;
    }
  }
  try { m.close?.(); } catch { /* */ }

  const out = into || document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return null;

  // Extract native frame RGB and refine hair strands, fringes, and pass-through background gaps
  octx.drawImage(el, 0, 0, w, h);
  const frameRgba = octx.getImageData(0, 0, w, h).data;
  const matting = refineAlphaMatteAndDecontaminate(frameRgba, coarseMask, w, h, {
    baseEdgeRadius: 3,
    hairFringeRadius: 16,
    passThroughSensitivity: 0.76,
    decontaminateColors: 0,
    softProbabilities: softProb,
  });

  const img = octx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    const v = matting.alpha[i];
    const p4 = i * 4;
    img.data[p4] = v;
    img.data[p4 + 1] = v;
    img.data[p4 + 2] = v;
    img.data[p4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Downscaled work canvas so the model sees ≤ 512px wide input. */
function workFrame(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement | null {
  const sw = (el as any).videoWidth || (el as any).naturalWidth || (el as any).width || 0;
  const sh = (el as any).videoHeight || (el as any).naturalHeight || (el as any).height || 0;
  if (!sw || !sh) return null;
  const s = Math.min(1, 512 / sw); const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(sw * s)); c.height = Math.max(2, Math.round(sh * s));
  const ctx = c.getContext('2d'); if (!ctx) return null; ctx.drawImage(el, 0, 0, c.width, c.height); return c;
}

/** Exact per-frame matte (offline export). Returns null if the model is unavailable. */
export async function segmentSubject(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number): Promise<HTMLCanvasElement | null> {
  const seg = await loadSubjectSegmenter(); if (!seg) return null;
  const frame = workFrame(el); if (!frame) return null;
  try { return maskToCanvas(el, seg.segment(frame), w, h); } catch (e) { console.warn('[subjectMatte] segment failed:', (e as Error)?.message || e); return null; }
}

// ── Live path: last-known matte per element, refreshed on a throttle ────────────────────────
interface LiveEntry { canvas: HTMLCanvasElement | null; busy: boolean; last: number; }
const live = new WeakMap<object, LiveEntry>();
const LIVE_INTERVAL_MS = 66; // ~15 fps of inference; frames in between reuse the last matte

export function segmentSubjectLatest(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number): HTMLCanvasElement | null {
  let entry = live.get(el);
  if (!entry) { entry = { canvas: null, busy: false, last: 0 }; live.set(el, entry); }
  const now = performance.now();
  if (!entry.busy && now - entry.last > LIVE_INTERVAL_MS) {
    entry.busy = true; entry.last = now;
    const frame = workFrame(el);
    if (!frame) { entry.busy = false; return entry.canvas; }
    loadSubjectSegmenter().then(seg => {
      if (!seg) { entry!.busy = false; return; }
      try { const c = maskToCanvas(el, seg.segment(frame), w, h, entry!.canvas || undefined); if (c) entry!.canvas = c; }
      catch (e) { console.warn('[subjectMatte] live segment failed:', (e as Error)?.message || e); }
      entry!.busy = false;
    });
  }
  return entry.canvas;
}
