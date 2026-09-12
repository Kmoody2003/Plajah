// depthMatte — monocular depth as a mask/aux source (W4 step 2), via transformers.js
// (already a dependency) running Depth Anything V2 (small) on WebGPU with a wasm fallback.
// Same two entry points as subjectMatte: exact per-frame (export) and last-known (live).
// The depth canvas is grayscale, NEAR = white. `depthRangeCanvas()` turns it into a mask by
// a near/far window with feather (so "blur everything behind the subject" is one effect + mask).
let loading: Promise<any> | null = null;
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function depthMatteStatus() { return status; }

const MODEL = 'onnx-community/depth-anything-v2-small';

export function loadDepthEstimator(): Promise<any> {
  if (loading) return loading;
  status = 'loading';
  loading = (async () => {
    try {
      const tf: any = await import('@huggingface/transformers');
      const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      let pipe: any = null;
      for (const device of hasGpu ? ['webgpu', 'wasm'] : ['wasm']) {
        try { pipe = await tf.pipeline('depth-estimation', MODEL, { device, dtype: device === 'webgpu' ? 'fp16' : 'q8' }); break; }
        catch (e) { console.warn('[depthMatte] device', device, 'failed:', (e as Error)?.message || e); }
      }
      status = pipe ? 'ready' : 'failed';
      return pipe;
    } catch (e) { console.warn('[depthMatte] load failed:', (e as Error)?.message || e); status = 'failed'; return null; }
  })();
  return loading;
}

function workFrame(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, maxW = 384): HTMLCanvasElement | null {
  const sw = (el as any).videoWidth || (el as any).naturalWidth || (el as any).width || 0;
  const sh = (el as any).videoHeight || (el as any).naturalHeight || (el as any).height || 0;
  if (!sw || !sh) return null;
  const s = Math.min(1, maxW / sw); const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(sw * s)); c.height = Math.max(2, Math.round(sh * s));
  const ctx = c.getContext('2d'); if (!ctx) return null; ctx.drawImage(el, 0, 0, c.width, c.height); return c;
}

/** Run the estimator on an element; returns a grayscale depth canvas (near = white) at w×h. */
async function estimate(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number, into?: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const pipe = await loadDepthEstimator(); if (!pipe) return null;
  const frame = workFrame(el); if (!frame) return null;
  try {
    const tf: any = await import('@huggingface/transformers');
    const image = await tf.RawImage.fromCanvas(frame);
    const result = await pipe(image);
    const depth = result?.depth; if (!depth) return null;
    // depth is a RawImage (1 channel, 0..255, larger = nearer for Depth Anything's relative output)
    const small = depth.toCanvas ? depth.toCanvas() : null;
    const out = into || document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d'); if (!ctx) return null;
    if (small) { ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, w, h); }
    else {
      const dw = depth.width, dh = depth.height, data = depth.data; const tmp = document.createElement('canvas'); tmp.width = dw; tmp.height = dh; const tctx = tmp.getContext('2d')!; const img = tctx.createImageData(dw, dh);
      for (let i = 0; i < dw * dh; i++) { const v = data[i]; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      tctx.putImageData(img, 0, 0); ctx.drawImage(tmp, 0, 0, w, h);
    }
    return out;
  } catch (e) { console.warn('[depthMatte] estimate failed:', (e as Error)?.message || e); return null; }
}

export async function estimateDepth(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number): Promise<HTMLCanvasElement | null> { return estimate(el, w, h); }

interface LiveEntry { canvas: HTMLCanvasElement | null; busy: boolean; last: number; }
const live = new WeakMap<object, LiveEntry>();
const LIVE_INTERVAL_MS = 250; // depth is heavier than segmentation; ~4 fps live, last map reused

export function estimateDepthLatest(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number): HTMLCanvasElement | null {
  let entry = live.get(el);
  if (!entry) { entry = { canvas: null, busy: false, last: 0 }; live.set(el, entry); }
  const now = performance.now();
  if (!entry.busy && now - entry.last > LIVE_INTERVAL_MS) {
    entry.busy = true; entry.last = now;
    const snapshot = workFrame(el);
    if (!snapshot) { entry.busy = false; return entry.canvas; }
    estimate(snapshot, w, h, entry.canvas || undefined).then(c => { if (c) entry!.canvas = c; entry!.busy = false; }).catch(() => { entry!.busy = false; });
  }
  return entry.canvas;
}

/** Depth canvas → mask canvas: white where depth ∈ [near, far] (0..1, near = 1 = closest), soft edges by `feather`. */
export function depthRangeCanvas(depth: HTMLCanvasElement, near: number, far: number, feather: number, into?: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = depth.width, h = depth.height;
  const src = depth.getContext('2d')?.getImageData(0, 0, w, h); if (!src) return null;
  const out = into || document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const lo = Math.min(near, far), hi = Math.max(near, far), f = Math.max(1e-3, feather);
  const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-6, e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < w * h; i++) {
    const d = src.data[i * 4] / 255;                       // 1 = near
    const inside = smooth(lo - f, lo, d) * (1 - smooth(hi, hi + f, d));
    const v = Math.round(inside * 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
