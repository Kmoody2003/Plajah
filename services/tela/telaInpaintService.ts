/**
 * telaInpaintService.ts — Non-Destructive Inpainting & Generative Fill for Tela.
 *
 * Architecture Guarantee:
 * Never modifies or destroys the underlying base photo/raster layer.
 * Always synthesizes into a NEW dedicated `TelaImageLayer` with a soft feathered
 * alpha mask, prompt metadata, and non-destructive blend modes.
 *
 * 2026-10-10: the default path is now REAL content-aware fill — multi-scale PatchMatch
 * with EM voting (services/tela/raster/patchmatch.ts), run in the raster Web Worker.
 * (The previous build painted a blurred radial gradient.) A cloud generative provider can
 * be registered with setGenerativeFillProvider(); it is used only when one is registered
 * AND the request carries a prompt — otherwise the local algorithm always runs.
 */

import type { TelaImageLayer } from '../../types';
import type { Bitmap8, Mask8 } from './raster/buffer';

export interface InpaintParams {
  sourceImageUrl: string;
  maskDataUrl?: string; // Black & white or alpha mask
  maskRect?: { x: number; y: number; width: number; height: number };
  prompt?: string;
  referenceImageUrl?: string;
  featherRadius?: number;
  strength?: number;
  /** Force the local content-aware algorithm even when a generative provider exists. */
  local?: boolean;
  /** Optional "sampling area": white = may be copied from. */
  sourceAreaDataUrl?: string;
  seed?: number;
}

export interface InpaintResult {
  newLayer: TelaImageLayer;
  seed: number;
  promptApplied: string;
  /** 'patchmatch' (local) or the provider's id. */
  engine?: string;
  ms?: number;
}

/** Cloud generative-fill hook: returns a full-canvas image (data/object URL) for the masked area. */
export type GenerativeFillProvider = {
  id: string;
  fill(input: { image: Blob; mask: Blob; prompt: string; referenceImageUrl?: string; width: number; height: number; seed: number; strength?: number }): Promise<string>;
};
let provider: GenerativeFillProvider | null = null;
export function setGenerativeFillProvider(p: GenerativeFillProvider | null) { provider = p; }
export function getGenerativeFillProvider() { return provider; }

/**
 * Generate a soft feathered mask canvas data URL from rectangular or contour coordinates.
 */
export function generateFeatheredMask(
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number },
  feather = 12
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, width, height);
  const rad = Math.max(2, feather);
  ctx.save();
  ctx.filter = `blur(${rad}px)`;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  return canvas.toDataURL('image/png');
}

async function loadBitmap(url: string, w: number, h: number): Promise<Bitmap8> {
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h); return { width: w, height: h, data: id.data };
}
/** Mask from a data URL: coverage = alpha × luminance (white-on-transparent and B/W masks both work). */
function maskFromBitmap(bm: Bitmap8): Mask8 {
  const m: Mask8 = { width: bm.width, height: bm.height, data: new Uint8Array(bm.width * bm.height) };
  for (let i = 0; i < m.data.length; i++) { const k = i * 4; m.data[i] = Math.round((0.299 * bm.data[k] + 0.587 * bm.data[k + 1] + 0.114 * bm.data[k + 2]) * bm.data[k + 3] / 255); }
  return m;
}
function bitmapToDataUrl(bm: Bitmap8): string {
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bm.data), bm.width, bm.height), 0, 0);
  return c.toDataURL('image/png');
}
const toBlob = (bm: Bitmap8) => new Promise<Blob>(r => { const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bm.data), bm.width, bm.height), 0, 0); c.toBlob(b => r(b!), 'image/png'); });

/**
 * Executes a Non-Destructive Generative Fill / Inpaint request.
 * Synthesizes a new layer positioned over the selection area.
 */
export async function executeGenerativeInpaint(
  params: InpaintParams,
  canvasDims: { width: number; height: number }
): Promise<InpaintResult> {
  const seed = params.seed ?? Math.floor(Math.random() * 1000000);
  const prompt = params.prompt?.trim() || '';
  const promptApplied = prompt || 'Content-aware fill (PatchMatch)';
  const W = Math.max(1, Math.round(canvasDims.width)), H = Math.max(1, Math.round(canvasDims.height));
  const t0 = performance.now();

  const rect = params.maskRect || { x: 0.1 * W, y: 0.1 * H, width: 0.8 * W, height: 0.8 * H };
  const maskUrl = params.maskDataUrl || generateFeatheredMask(W, H, rect, params.featherRadius || 10);

  const source = await loadBitmap(params.sourceImageUrl, W, H);
  const hole = maskFromBitmap(await loadBitmap(maskUrl, W, H));
  let synthesizedDataUrl: string; let engine = 'patchmatch';

  if (provider && prompt && !params.local) {
    synthesizedDataUrl = await provider.fill({ image: await toBlob(source), mask: await toBlob({ width: W, height: H, data: Uint8ClampedArray.from({ length: W * H * 4 }, (_, i) => (i % 4 === 3 ? 255 : hole.data[i >> 2])) }), prompt, referenceImageUrl: params.referenceImageUrl, width: W, height: H, seed, strength: params.strength });
    engine = provider.id;
  } else {
    // Content-aware fill synthesizes every pixel the mask touches; the feathered mask then
    // blends the new layer over the untouched base.
    const binary: Mask8 = { width: W, height: H, data: hole.data.map(v => (v > 8 ? 255 : 0)) };
    const sourceMask = params.sourceAreaDataUrl ? maskFromBitmap(await loadBitmap(params.sourceAreaDataUrl, W, H)) : undefined;
    const { rasterWorker } = await import('./raster/workerClient');
    const filled = await rasterWorker().run('contentAwareFill', { image: source, hole: binary, opts: { seed, sourceMask } });
    synthesizedDataUrl = bitmapToDataUrl(filled);
  }

  const newLayer: TelaImageLayer = {
    id: `lyr_inpaint_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${engine === 'patchmatch' ? 'Content-Aware Fill' : 'Gen Fill'}: ${promptApplied.slice(0, 24)}…`,
    src: synthesizedDataUrl,
    visible: true,
    opacity: 1,
    blend: 'normal',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    intrinsicWidth: W,
    intrinsicHeight: H,
    adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 },
    mask: { kind: 'ALPHA_IMAGE', enabled: true, src: maskUrl, invert: false },
  };

  return { newLayer, seed, promptApplied, engine, ms: Math.round(performance.now() - t0) };
}
