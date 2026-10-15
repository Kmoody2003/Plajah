// samMatte — Prompted, Tracked Video Object Alpha Matting with Hair/Fringe Isolation,
// Inter-Strand Background Pass-Through Hole Punching, and Motion-Compensated Temporal Stabilization.
//
// Combines:
//  1. Prompted SAM segmentation (or Geodesic Color-Manifold fallback when offline)
//  2. 5-Stage Ultra-Fine Compositing Alpha Matting (`refineAlphaMatteAndDecontaminate`):
//     - Adaptive Trimap & High-Frequency Hair/Fringe Structure Tensor
//     - CIE L*a*b* Inter-Strand Background Pass-Through Hole Punching
//     - Shared Color-Line Analytical Alpha Unmixing
//     - Full 3x3 RGB Covariance Multi-Scale Color Guided Filter
//  3. Motion-Compensated Temporal Matte Stabilization across video frames so fine hair
//     strands and fabric fringes track smoothly without temporal flicker.

import type { Point2 } from './forgeBindings';
import {
  refineAlphaMatteAndDecontaminate,
  colorGuidedFilterRGB,
} from '../matting/alphaMattingEngine';

let loading: Promise<any> | null = null;
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function samMatteStatus() {
  return status;
}

const MODEL = 'Xenova/slimsam-77-uniform';

interface SamHandle {
  model: any;
  processor: any;
  tf: any;
}

interface TemporalMatteState {
  alphaFloat: Float32Array;
  coarseMask: Uint8Array;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  lastPoint: Point2;
}

const temporalCache = new WeakMap<object, TemporalMatteState>();

export function loadSam(): Promise<SamHandle | null> {
  if (loading) return loading;
  status = 'loading';
  loading = (async () => {
    try {
      const tf: any = await import('@huggingface/transformers');
      const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      let model: any = null;
      for (const device of hasGpu ? ['webgpu', 'wasm'] : ['wasm']) {
        try {
          model = await tf.SamModel.from_pretrained(MODEL, {
            device,
            dtype: device === 'webgpu' ? 'fp16' : 'q8',
          });
          break;
        } catch (e) {
          console.warn('[samMatte] device', device, 'failed:', (e as Error)?.message || e);
        }
      }
      if (!model) {
        status = 'failed';
        return null;
      }
      const processor = await tf.AutoProcessor.from_pretrained(MODEL);
      status = 'ready';
      return { model, processor, tf } as SamHandle;
    } catch (e) {
      console.warn('[samMatte] load failed, using Geodesic + Alpha Matting fallback:', (e as Error)?.message || e);
      status = 'failed';
      return null;
    }
  })();
  return loading;
}

/** Downscaled work canvas so the encoder sees a bounded input (SAM upsamples internally). */
function workFrame(
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  maxW = 640
): { canvas: HTMLCanvasElement; sw: number; sh: number } | null {
  const sw = (el as any).videoWidth || (el as any).naturalWidth || (el as any).width || 0;
  const sh = (el as any).videoHeight || (el as any).naturalHeight || (el as any).height || 0;
  if (!sw || !sh) return null;
  const s = Math.min(1, maxW / sw);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(sw * s));
  c.height = Math.max(2, Math.round(sh * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, c.width, c.height);
  return { canvas: c, sw: c.width, sh: c.height };
}

/** Shifts a float or uint8 mask by (dxPx, dyPx) to motion-compensate temporal priors. */
function shiftBufferFloat(
  src: Float32Array,
  w: number,
  h: number,
  dxPx: number,
  dyPx: number
): Float32Array {
  const dx = Math.round(dxPx);
  const dy = Math.round(dyPx);
  if (dx === 0 && dy === 0) return src;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    const dstRow = y * w;
    const srcRow = sy * w;
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < w) {
        out[dstRow + x] = src[srcRow + sx];
      }
    }
  }
  return out;
}

function shiftBufferU8(
  src: Uint8Array,
  w: number,
  h: number,
  dxPx: number,
  dyPx: number
): Uint8Array {
  const dx = Math.round(dxPx);
  const dy = Math.round(dyPx);
  if (dx === 0 && dy === 0) return src;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    const dstRow = y * w;
    const srcRow = sy * w;
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < w) {
        out[dstRow + x] = src[srcRow + sx];
      }
    }
  }
  return out;
}

export interface SamPromptOptions {
  point?: Point2;
  points?: Array<{ x: number; y: number; label?: number }>;
  box?: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0..1
}

export type SamPrompt = Point2 | SamPromptOptions;

function extractPrimaryPoint(prompt: SamPrompt): Point2 {
  if ('points' in prompt && prompt.points && prompt.points.length > 0) {
    return { x: prompt.points[0].x, y: prompt.points[0].y };
  }
  if ('box' in prompt && prompt.box) {
    return { x: (prompt.box[0] + prompt.box[2]) * 0.5, y: (prompt.box[1] + prompt.box[3]) * 0.5 };
  }
  if ('point' in prompt && prompt.point) {
    return prompt.point;
  }
  return prompt as Point2;
}

/**
 * Deterministic Geodesic Color-Manifold coarse mask generator when neural SAM weights are offline.
 */
function geodesicCoarseVideoMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  pt: Point2
): { coarseMask: Uint8Array; softProb: Float32Array } {
  const n = w * h;
  const coarseMask = new Uint8Array(n);
  const softProb = new Float32Array(n);

  const px = Math.max(0, Math.min(w - 1, Math.round(pt.x * w)));
  const py = Math.max(0, Math.min(h - 1, Math.round(pt.y * h)));

  let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const nx = Math.max(0, Math.min(w - 1, px + dx));
      const ny = Math.max(0, Math.min(h - 1, py + dy));
      const i4 = (ny * w + nx) * 4;
      sr += rgba[i4];
      sg += rgba[i4 + 1];
      sb += rgba[i4 + 2];
      cnt++;
    }
  }
  const fgR = sr / cnt, fgG = sg / cnt, fgB = sb / cnt;

  // Border background samples
  const bgSamples: Array<[number, number, number]> = [];
  const step = Math.max(4, Math.floor(w / 12));
  for (let x = 0; x < w; x += step) {
    const t4 = x * 4;
    const b4 = ((h - 1) * w + x) * 4;
    bgSamples.push([rgba[t4], rgba[t4 + 1], rgba[t4 + 2]]);
    bgSamples.push([rgba[b4], rgba[b4 + 1], rgba[b4 + 2]]);
  }

  const diagSq = w * w + h * h;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      const p4 = idx * 4;
      const r = rgba[p4], g = rgba[p4 + 1], b = rgba[p4 + 2];
      const dFg =
        (r - fgR) * (r - fgR) +
        (g - fgG) * (g - fgG) +
        (b - fgB) * (b - fgB) +
        (((x - px) * (x - px) + (y - py) * (y - py)) / diagSq) * 1100;

      let dBg = 1e12;
      for (let i = 0; i < bgSamples.length; i++) {
        const s = bgSamples[i];
        const dc = (r - s[0]) * (r - s[0]) + (g - s[1]) * (g - s[1]) + (b - s[2]) * (b - s[2]);
        if (dc < dBg) dBg = dc;
      }

      const p = dBg / (dFg + dBg + 1e-5);
      softProb[idx] = p;
      coarseMask[idx] = p >= 0.48 ? 255 : 0;
    }
  }

  return { coarseMask, softProb };
}

/**
 * Renders the refined 8-bit alpha matte into an HTMLCanvasElement.
 */
function renderAlphaToCanvas(
  alpha: Uint8Array,
  w: number,
  h: number,
  feather: number,
  into?: HTMLCanvasElement
): HTMLCanvasElement | null {
  const out = into || document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return null;

  const imgData = octx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i];
    const p4 = i * 4;
    imgData.data[p4] = v;
    imgData.data[p4 + 1] = v;
    imgData.data[p4 + 2] = v;
    imgData.data[p4 + 3] = 255;
  }
  octx.putImageData(imgData, 0, 0);

  const blurPx = feather * Math.min(w, h);
  if (blurPx > 0.5 && 'filter' in octx) {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d')!.putImageData(imgData, 0, 0);
    octx.clearRect(0, 0, w, h);
    (octx as any).filter = `blur(${blurPx.toFixed(2)}px)`;
    octx.drawImage(tmp, 0, 0);
    (octx as any).filter = 'none';
  }
  return out;
}

async function runSamWithCompositingMatting(
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  handle: SamHandle | null,
  frame: HTMLCanvasElement,
  prompt: SamPrompt,
  w: number,
  h: number,
  feather: number,
  into?: HTMLCanvasElement
): Promise<HTMLCanvasElement | null> {
  // Extract native w x h RGBA of current video frame for hair/fringe & pass-through matting
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = w;
  fullCanvas.height = h;
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullCtx) return null;
  fullCtx.drawImage(el, 0, 0, w, h);
  const fullRgba = fullCtx.getImageData(0, 0, w, h).data;

  const primaryPt = extractPrimaryPoint(prompt);
  let coarseMask = new Uint8Array(w * h);
  let softProb: Float32Array | undefined;
  let gotNeuralMask = false;

  if (handle) {
    try {
      const { model, processor, tf } = handle;
      const raw = await tf.RawImage.fromCanvas(frame);

      let inputPoints: number[][] = [];
      let inputLabels: number[] = [];

      if ('points' in prompt && prompt.points && prompt.points.length > 0) {
        inputPoints = prompt.points.map((p) => [
          Math.max(0, Math.min(frame.width - 1, Math.round(p.x * frame.width))),
          Math.max(0, Math.min(frame.height - 1, Math.round(p.y * frame.height))),
        ]);
        inputLabels = prompt.points.map((p) => p.label ?? 1);
      } else if ('box' in prompt && prompt.box) {
        const [bx1, by1, bx2, by2] = prompt.box;
        inputPoints = [
          [
            Math.max(0, Math.min(frame.width - 1, Math.round(bx1 * frame.width))),
            Math.max(0, Math.min(frame.height - 1, Math.round(by1 * frame.height))),
          ],
          [
            Math.max(0, Math.min(frame.width - 1, Math.round(bx2 * frame.width))),
            Math.max(0, Math.min(frame.height - 1, Math.round(by2 * frame.height))),
          ],
        ];
        inputLabels = [2, 3];
      } else {
        const px = Math.max(0, Math.min(frame.width - 1, Math.round((primaryPt.x ?? 0.5) * frame.width)));
        const py = Math.max(0, Math.min(frame.height - 1, Math.round((primaryPt.y ?? 0.5) * frame.height)));
        inputPoints = [[px, py]];
        inputLabels = [1];
      }

      const inputs = await processor(raw, { input_points: [inputPoints], input_labels: [inputLabels] });
      const outputs = await model(inputs);
      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes
      );
      const scores = outputs.iou_scores?.data ? Array.from(outputs.iou_scores.data as Float32Array) : [];
      const maskTensor = masks?.[0];

      if (maskTensor?.data) {
        const dims = maskTensor.dims || [];
        const nm = dims.length === 4 ? dims[1] : dims[0];
        const mh = dims[dims.length - 2];
        const mw = dims[dims.length - 1];
        if (nm && mw && mh) {
          let best = 0;
          for (let i = 1; i < nm; i++) {
            if ((scores?.[i] ?? 0) > (scores?.[best] ?? 0)) best = i;
          }
          const plane = mw * mh;
          const off = best * plane;
          const data = maskTensor.data as Uint8Array | Int8Array | Float32Array | boolean[];

          for (let y = 0; y < h; y++) {
            const sy = Math.min(mh - 1, Math.floor((y / h) * mh));
            const rowOut = y * w;
            const rowSam = sy * mw;
            for (let x = 0; x < w; x++) {
              const sx = Math.min(mw - 1, Math.floor((x / w) * mw));
              const on = !!(data as any)[off + rowSam + sx];
              coarseMask[rowOut + x] = on ? 255 : 0;
            }
          }
          gotNeuralMask = true;
        }
      }
    } catch (e) {
      console.warn('[samMatte] neural inference fallback:', e);
    }
  }

  if (!gotNeuralMask) {
    const geo = geodesicCoarseVideoMask(fullRgba, w, h, primaryPt);
    coarseMask = geo.coarseMask;
    softProb = geo.softProb;
  }

  // Motion-compensated temporal prior from previous frame
  const prevState = temporalCache.get(el);
  let motionCompensatedPrevAlpha: Float32Array | undefined;
  if (prevState && prevState.width === w && prevState.height === h) {
    const dxPx = (primaryPt.x - prevState.lastPoint.x) * w;
    const dyPx = (primaryPt.y - prevState.lastPoint.y) * h;
    motionCompensatedPrevAlpha = shiftBufferFloat(prevState.alphaFloat, w, h, dxPx, dyPx);
  }

  // Run 5-stage Compositing Alpha Matting (Hair/Fringe isolation + Inter-strand Pass-Through Hole Punching)
  const matting = refineAlphaMatteAndDecontaminate(fullRgba, coarseMask, w, h, {
    baseEdgeRadius: 3,
    hairFringeRadius: 16,
    passThroughSensitivity: 0.76,
    decontaminateColors: 0,
    softProbabilities: softProb,
    previousAlpha: motionCompensatedPrevAlpha,
    previousImageRgba: prevState?.width === w && prevState?.height === h ? prevState.rgba : undefined,
    temporalWeight: 0.32,
  });

  temporalCache.set(el, {
    alphaFloat: matting.alphaFloat,
    coarseMask,
    rgba: new Uint8ClampedArray(fullRgba),
    width: w,
    height: h,
    lastPoint: { x: primaryPt.x, y: primaryPt.y },
  });

  return renderAlphaToCanvas(matting.alpha, w, h, feather, into);
}

/** Exact per-frame object matte with hair/fringe isolation & pass-through removal (offline export). */
export async function segmentSam(
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  prompt: SamPrompt,
  w: number,
  h: number,
  feather = 0
): Promise<HTMLCanvasElement | null> {
  const wf = workFrame(el);
  if (!wf) return null;
  const handle = await loadSam();
  try {
    return await runSamWithCompositingMatting(el, handle, wf.canvas, prompt, w, h, feather);
  } catch (e) {
    console.warn('[samMatte] segment failed:', (e as Error)?.message || e);
    return null;
  }
}

// ── Live path: last-known matte per element, refreshed on a throttle + motion-compensated guided propagation ──
interface LiveEntry {
  canvas: HTMLCanvasElement | null;
  busy: boolean;
  last: number;
}
const live = new WeakMap<object, LiveEntry>();
const LIVE_INTERVAL_MS = 220;

export function segmentSamLatest(
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  point: Point2,
  w: number,
  h: number,
  feather = 0
): HTMLCanvasElement | null {
  let entry = live.get(el);
  if (!entry) {
    entry = { canvas: null, busy: false, last: 0 };
    live.set(el, entry);
  }
  const now = performance.now();

  if (!entry.busy && now - entry.last > LIVE_INTERVAL_MS) {
    entry.busy = true;
    entry.last = now;
    const wf = workFrame(el);
    if (!wf) {
      entry.busy = false;
      return entry.canvas;
    }
    loadSam().then((handle) => {
      runSamWithCompositingMatting(el, handle, wf.canvas, point, w, h, feather, entry!.canvas || undefined)
        .then((c) => {
          if (c) entry!.canvas = c;
        })
        .catch((e) => console.warn('[samMatte] live segment failed:', (e as Error)?.message || e))
        .finally(() => {
          entry!.busy = false;
        });
    });
  } else if (entry.canvas) {
    // Between neural SAM refreshes, if the tracked point moved, motion-compensate the cached matte
    // and lock hair/fringe edges to the live video frame using our 3x3 RGB Color Guided Filter!
    const prevState = temporalCache.get(el);
    if (prevState && prevState.width === w && prevState.height === h) {
      const dxPx = (point.x - prevState.lastPoint.x) * w;
      const dyPx = (point.y - prevState.lastPoint.y) * h;
      if (Math.hypot(dxPx, dyPx) >= 1.2) {
        const shiftedAlpha = shiftBufferFloat(prevState.alphaFloat, w, h, dxPx, dyPx);
        const shiftedCoarse = shiftBufferU8(prevState.coarseMask, w, h, dxPx, dyPx);
        const liveCanvas = document.createElement('canvas');
        liveCanvas.width = w;
        liveCanvas.height = h;
        const lctx = liveCanvas.getContext('2d', { willReadFrequently: true });
        if (lctx) {
          lctx.drawImage(el, 0, 0, w, h);
          const liveRgba = lctx.getImageData(0, 0, w, h).data;
          const guided = colorGuidedFilterRGB(liveRgba, shiftedAlpha, w, h, 3, 1e-4);
          const u8 = new Uint8Array(w * h);
          for (let i = 0; i < u8.length; i++) {
            u8[i] = Math.max(0, Math.min(255, Math.round(guided[i] * 255)));
          }
          prevState.alphaFloat = guided;
          prevState.coarseMask = shiftedCoarse;
          prevState.lastPoint = { x: point.x, y: point.y };
          renderAlphaToCanvas(u8, w, h, feather, entry.canvas);
        }
      }
    }
  }
  return entry.canvas;
}
