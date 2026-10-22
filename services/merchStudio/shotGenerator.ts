// services/merchStudio/shotGenerator.ts — turns a 3D stage capture into a finished product photo.
//
// The 3D render is the reference: it is the init image, so the set's composition, light direction
// and colour carry into the result, and `strength` decides how far the model may wander from it.
// The product itself is never regenerated — the mask marks only the set as repaintable, and the
// product pixels from the render are composited back on top, so the artwork in the photo is exactly
// the artwork that prints.
//
// Runs on the on-device Tela runtime (engines/tela-diffusion, :51123), the same engine as Tela's
// generative fill. There is no cloud fallback: with the runtime offline the 3D render is the shot.

import { sidecarInpaintBody, TELA_RUNTIME_URL } from '../tela/telaInpaintService';
import type { StageCapture } from './stage';

const ENDPOINTS = [`${TELA_RUNTIME_URL}/tela/inpaint`, 'http://127.0.0.1:51122/tela/inpaint'];

export interface EngineStatus {
  online: boolean;
  detail: string;
}

export async function checkShotEngine(): Promise<EngineStatus> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${TELA_RUNTIME_URL}/health`, { signal: ctrl.signal });
    if (!res.ok) return { online: false, detail: `Runtime answered ${res.status}` };
    const body = await res.json().catch(() => ({}));
    const device = typeof body?.device === 'string' ? body.device : '';
    return { online: true, detail: device ? `Local GPU · ${device}` : 'Local GPU runtime' };
  } catch {
    return { online: false, detail: 'Local GPU runtime offline (engines/tela-diffusion)' };
  } finally {
    clearTimeout(timer);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/** Product mask → luminance in alpha (white product = opaque). */
function maskToAlpha(mask: HTMLImageElement, w: number, h: number, blurPx: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.filter = 'none';
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i];
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/**
 * The repaint mask the runtime gets: white = set (regenerate), black = product (keep). The product
 * hole is shrunk ~2 px so the model also repaints the anti-aliased rim and blends the contact edge.
 */
export async function buildSetMask(maskUrl: string, w: number, h: number): Promise<string> {
  const mask = await loadImage(maskUrl);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.filter = 'blur(2px)';
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.filter = 'none';
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const keep = d.data[i] > 235; // only the solid core of the product survives
    const v = keep ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}

/** Puts the rendered product back over a generated image, with a 1 px soft edge. */
export async function lockProductPixels(generatedUrl: string, capture: StageCapture): Promise<string> {
  const { width: w, height: h } = capture;
  const [gen, beauty, mask] = await Promise.all([loadImage(generatedUrl), loadImage(capture.beauty), loadImage(capture.mask)]);
  const product = document.createElement('canvas');
  product.width = w; product.height = h;
  const pctx = product.getContext('2d')!;
  pctx.drawImage(beauty, 0, 0, w, h);
  pctx.globalCompositeOperation = 'destination-in';
  pctx.drawImage(maskToAlpha(mask, w, h, 0.6), 0, 0);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(gen, 0, 0, w, h);
  ctx.drawImage(product, 0, 0);
  return out.toDataURL('image/png');
}

export interface GenerateShotInput {
  capture: StageCapture;
  prompt: string;
  negativePrompt: string;
  strength: number;
  seed?: number;
  /** Keep the rendered product pixels exactly (default true). */
  lockProduct?: boolean;
}

export interface GenerateShotResult {
  dataUrl: string;
  seed: number;
  engine: string;
  ms: number;
}

export async function generateShot(input: GenerateShotInput): Promise<GenerateShotResult> {
  const { capture } = input;
  const t0 = performance.now();
  const seed = input.seed ?? Math.floor(Math.random() * 2_000_000_000);
  const setMask = await buildSetMask(capture.mask, capture.width, capture.height);
  const body = sidecarInpaintBody(capture.beauty, setMask, {
    prompt: input.prompt,
    userPrompt: input.prompt,
    seed,
    strength: input.strength,
    width: capture.width,
    height: capture.height,
    inpaintMode: 'guided',
  });
  const task = body.task as Record<string, unknown>;
  task.negativePrompt = input.negativePrompt;
  // The stage's depth pass rides along for depth-conditioned models; today's runtime ignores it.
  task.controlImages = { depth: capture.depth };

  let lastError = 'Local GPU runtime offline';
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { lastError = `${ep} answered ${res.status}`; continue; }
      const data = await res.json();
      const url: string | undefined = data?.mediaUrl || data?.imageDataUrl;
      if (!url) { lastError = data?.error || 'Runtime returned no image'; continue; }
      const dataUrl = input.lockProduct === false ? url : await lockProductPixels(url, capture);
      return { dataUrl, seed, engine: typeof data.modelUsed === 'string' ? data.modelUsed : 'local GPU', ms: Math.round(performance.now() - t0) };
    } catch (e) {
      lastError = (e as Error)?.message || lastError;
    }
  }
  throw new Error(lastError);
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
