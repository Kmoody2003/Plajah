// samMatte — a PROMPTED, TRACKED object matte (W4, the item the log filed as "Crossover SAM2,
// no server endpoint, genuinely blocked"). It is not blocked: Segment Anything runs in the
// browser through transformers.js (already a dependency, same runtime as depthMatte), so no
// server is needed. SlimSAM is the segmenter — a distilled SAM small enough for the web.
//
// What makes this different from subjectMatte (MediaPipe person/background): SAM is PROMPTED. You
// point at ONE object and it mattes THAT object, not "the person". The TRACKED part is free —
// the prompt point is a normalized image-space point that the caller moves with the clip's
// VectorTrack (point or planar) exactly the way a shape mask's centre follows a track, so the
// object stays selected as it moves. Honest naming: this is SAM-image + a tracked prompt, which
// delivers the tracked-object matte; it is not SAM2's learned video memory. The user-facing
// result — pick an object, it's matted across the clip — is the same.
//
// Two entry points, matching subjectMatte / depthMatte:
//   • segmentSam(el, point, w, h)       — async, exact: the OFFLINE renderer, per frame.
//   • segmentSamLatest(el, point, w, h) — sync last-known + throttled refresh: the live monitor.
// The matte is grayscale (white = the selected object), feather/invert applied by the caller.
import type { Point2 } from './forgeBindings';

let loading: Promise<any> | null = null;
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function samMatteStatus() { return status; }

// SlimSAM: a 77M-parameter distillation of SAM, the standard web-runnable Segment Anything.
const MODEL = 'Xenova/slimsam-77-uniform';

interface SamHandle { model: any; processor: any; tf: any }

export function loadSam(): Promise<SamHandle | null> {
  if (loading) return loading;
  status = 'loading';
  loading = (async () => {
    try {
      const tf: any = await import('@huggingface/transformers');
      const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      let model: any = null;
      for (const device of hasGpu ? ['webgpu', 'wasm'] : ['wasm']) {
        try { model = await tf.SamModel.from_pretrained(MODEL, { device, dtype: device === 'webgpu' ? 'fp16' : 'q8' }); break; }
        catch (e) { console.warn('[samMatte] device', device, 'failed:', (e as Error)?.message || e); }
      }
      if (!model) { status = 'failed'; return null; }
      const processor = await tf.AutoProcessor.from_pretrained(MODEL);
      status = 'ready';
      return { model, processor, tf } as SamHandle;
    } catch (e) { console.warn('[samMatte] load failed:', (e as Error)?.message || e); status = 'failed'; return null; }
  })();
  return loading;
}

/** Downscaled work canvas so the encoder sees a bounded input (SAM upsamples internally). */
function workFrame(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, maxW = 640): { canvas: HTMLCanvasElement; sw: number; sh: number } | null {
  const sw = (el as any).videoWidth || (el as any).naturalWidth || (el as any).width || 0;
  const sh = (el as any).videoHeight || (el as any).naturalHeight || (el as any).height || 0;
  if (!sw || !sh) return null;
  const s = Math.min(1, maxW / sw);
  const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(sw * s)); c.height = Math.max(2, Math.round(sh * s));
  const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(el, 0, 0, c.width, c.height);
  return { canvas: c, sw: c.width, sh: c.height };
}

/**
 * Boolean mask tensor → grayscale canvas (white = object) at w×h, with optional feather.
 * SAM returns up to three candidate masks (whole / part / sub-part); we keep the one the model
 * scored highest, which is the whole-object mask far more often than not.
 */
function maskToCanvas(maskTensor: any, scores: number[] | Float32Array, fw: number, fh: number, w: number, h: number, feather = 0, into?: HTMLCanvasElement): HTMLCanvasElement | null {
  if (!maskTensor?.data) return null;
  const dims = maskTensor.dims || [];                          // [1, numMasks, H, W] or [numMasks, H, W]
  const nm = dims.length === 4 ? dims[1] : dims[0];
  const mh = dims[dims.length - 2], mw = dims[dims.length - 1];
  if (!nm || !mw || !mh) return null;
  let best = 0; for (let i = 1; i < nm; i++) if ((scores?.[i] ?? 0) > (scores?.[best] ?? 0)) best = i;
  const plane = mw * mh, off = best * plane;
  const data = maskTensor.data as Uint8Array | Int8Array | Float32Array | boolean[];
  const small = document.createElement('canvas'); small.width = mw; small.height = mh;
  const sctx = small.getContext('2d'); if (!sctx) return null;
  const img = sctx.createImageData(mw, mh);
  for (let i = 0; i < plane; i++) { const on = !!(data as any)[off + i]; const v = on ? 255 : 0; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  sctx.putImageData(img, 0, 0);
  const out = into || document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d'); if (!octx) return null;
  octx.clearRect(0, 0, w, h);
  const blurPx = feather * Math.min(w, h);
  if (blurPx > 0.5 && 'filter' in octx) (octx as any).filter = `blur(${blurPx.toFixed(2)}px)`;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(small, 0, 0, w, h);
  if ('filter' in octx) (octx as any).filter = 'none';
  return out;
}

async function runSam(handle: SamHandle, frame: HTMLCanvasElement, point: Point2, w: number, h: number, feather: number, into?: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const { model, processor, tf } = handle;
  const raw = await tf.RawImage.fromCanvas(frame);
  // Prompt in PIXELS of the work frame. SAM's processor consumes [batch][points][x,y].
  const px = Math.max(0, Math.min(frame.width - 1, Math.round(point.x * frame.width)));
  const py = Math.max(0, Math.min(frame.height - 1, Math.round(point.y * frame.height)));
  const inputs = await processor(raw, { input_points: [[[px, py]]], input_labels: [[1]] });
  const outputs = await model(inputs);
  const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const scores = outputs.iou_scores?.data ? Array.from(outputs.iou_scores.data as Float32Array) : [];
  return maskToCanvas(masks?.[0], scores, frame.width, frame.height, w, h, feather, into);
}

/** Exact per-frame object matte (offline export). Returns null if the model is unavailable. */
export async function segmentSam(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, point: Point2, w: number, h: number, feather = 0): Promise<HTMLCanvasElement | null> {
  const handle = await loadSam(); if (!handle) return null;
  const wf = workFrame(el); if (!wf) return null;
  try { return await runSam(handle, wf.canvas, point, w, h, feather); }
  catch (e) { console.warn('[samMatte] segment failed:', (e as Error)?.message || e); return null; }
}

// ── Live path: last-known matte per element, refreshed on a throttle ────────────────────────
// SAM's encoder is heavier than the selfie segmenter, so the live interval is longer; frames in
// between reuse the last matte, and a moving prompt still tracks because each refresh re-prompts
// at the point's CURRENT tracked position.
interface LiveEntry { canvas: HTMLCanvasElement | null; busy: boolean; last: number; }
const live = new WeakMap<object, LiveEntry>();
const LIVE_INTERVAL_MS = 240; // ~4 fps of inference

export function segmentSamLatest(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, point: Point2, w: number, h: number, feather = 0): HTMLCanvasElement | null {
  let entry = live.get(el);
  if (!entry) { entry = { canvas: null, busy: false, last: 0 }; live.set(el, entry); }
  const now = performance.now();
  if (!entry.busy && now - entry.last > LIVE_INTERVAL_MS) {
    entry.busy = true; entry.last = now;
    const wf = workFrame(el);
    if (!wf) { entry.busy = false; return entry.canvas; }
    loadSam().then(handle => {
      if (!handle) { entry!.busy = false; return; }
      runSam(handle, wf.canvas, point, w, h, feather, entry!.canvas || undefined)
        .then(c => { if (c) entry!.canvas = c; })
        .catch(e => console.warn('[samMatte] live segment failed:', (e as Error)?.message || e))
        .finally(() => { entry!.busy = false; });
    });
  }
  return entry.canvas;
}
