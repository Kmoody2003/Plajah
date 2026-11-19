// services/tela/tela3dService.ts — image → 3D model (GLB) on the user's own GPU. No cloud credits.
//
// The engine is the Tela 3D runtime (engines/tela-3d, 127.0.0.1:51124): Stable Fast 3D (textured, default),
// TripoSR (fast fallback) and Hunyuan3D-2mini (most detailed shape, untextured). Desktop first: inside the
// Plajah app the native shell starts the runtime (TELA3D_ENSURE); on the dev/web build the local server's
// /api/local-ai/tela3d/ensure does. Without either there is no 3D generation — there is no cloud fallback.

import { ensureNativeTela3d, isWindowsApp } from '../windowsBridgeService';

export const TELA3D_URL = 'http://127.0.0.1:51124';

export type Tela3dBackend = 'auto' | 'sf3d' | 'triposr' | 'hunyuan_mini';

export interface Tela3dBackendInfo {
  id: Exclude<Tela3dBackend, 'auto'>;
  label: string;
  installed: boolean;
  textured: boolean;
  license: string;
}

export interface Tela3dStatus {
  online: boolean;
  detail: string;
  backends: Tela3dBackendInfo[];
  backgroundRemoval: boolean;
  gpuTempC?: number | null;
  busy?: boolean;
}

export interface Tela3dOptions {
  /** 'fast' prefers SF3D → TripoSR; 'detail' prefers Hunyuan3D-2mini. Ignored when a backend is named. */
  quality?: 'fast' | 'detail';
  textureResolution?: number;
  foregroundRatio?: number;
  seed?: number;
  steps?: number;
  octreeResolution?: number;
  faceLimit?: number;
  mcResolution?: number;
  /** Keep only the biggest connected piece (sheet builds: stray bits of the background or the next view). */
  keepLargest?: boolean;
}

export interface Tela3dResult {
  glb: Blob;
  backend: string;
  backendLabel: string;
  textured: boolean;
  vertices: number;
  faces: number;
  ms: number;
}

async function health(timeoutMs = 1500): Promise<Record<string, any> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TELA3D_URL}/health`, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the desktop app (or the local dev server) to start the runtime. */
async function startRuntime(): Promise<string | null> {
  try {
    if (isWindowsApp()) {
      const r = await ensureNativeTela3d();
      return r.success ? null : r.error || 'The desktop app could not start Tela 3D';
    }
    const res = await fetch('/api/local-ai/tela3d/ensure', { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    return r?.success ? null : r?.error || 'Tela 3D needs the Plajah desktop app on a PC with an NVIDIA GPU';
  } catch {
    return 'Tela 3D needs the Plajah desktop app on a PC with an NVIDIA GPU';
  }
}

function toStatus(h: Record<string, any>): Tela3dStatus {
  const backends: Tela3dBackendInfo[] = Array.isArray(h.backends) ? h.backends : [];
  const ready = backends.filter((b) => b.installed).map((b) => b.label);
  return {
    online: true,
    detail: ready.length ? `Local GPU · ${ready.join(' · ')}` : 'Local GPU runtime up, but no 3D weights are installed',
    backends,
    backgroundRemoval: !!h.backgroundRemoval,
    gpuTempC: h.gpuTempC,
    busy: !!h.busy,
  };
}

export async function checkTela3d(): Promise<Tela3dStatus> {
  const h = await health();
  if (h) return toStatus(h);
  return { online: false, detail: 'Tela 3D runtime offline', backends: [], backgroundRemoval: false };
}

/** Make sure the runtime is up, starting it if needed (first boot imports torch: ~20–40 s). */
export async function ensureTela3d(maxWaitMs = 60_000): Promise<Tela3dStatus> {
  const first = await health();
  if (first) return toStatus(first);
  const err = await startRuntime();
  if (err) return { online: false, detail: err, backends: [], backgroundRemoval: false };
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const h = await health();
    if (h) return toStatus(h);
  }
  return { online: false, detail: 'Tela 3D runtime did not answer — check D:\\Plajah Runtime', backends: [], backgroundRemoval: false };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Every region SAM finds in a picture, as run lengths over a small grid. */
export async function findRegions(image: Blob) {
  const status = await ensureTela3d();
  if (!status.online) throw new Error(status.detail);
  const res = await fetch(`${TELA3D_URL}/tela3d/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: await blobToDataUrl(image) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.parts) throw new Error(data?.error || `Tela 3D answered ${res.status}`);
  return data as { width: number; height: number; parts: { runs: number[]; score: number; stability: number }[]; seconds: number };
}

/** Which way a picture looked at the model: a named side, the top-down plan, or a camera turned `yaw:<degrees>` about +Y. */
export type PaintViewName = 'front' | 'back' | 'left' | 'right' | 'top' | `yaw:${number}`;

/**
 * Paint a mesh from several views of the art (a character or prop sheet, or frames of a motion video): each texel takes
 * the view that sees it most squarely, the rest is filled across the surface. Cut-outs on transparency work best.
 */
export async function paintFromViews(mesh: Blob, views: Partial<Record<PaintViewName, Blob | string>>, options: { faces?: number; res?: number; minFacing?: number; recenter?: boolean } = {}) {
  const status = await ensureTela3d();
  if (!status.online) throw new Error(status.detail);
  const t0 = performance.now();
  const viewData: Record<string, string> = {};
  for (const [name, v] of Object.entries(views)) if (v) viewData[name] = typeof v === 'string' ? v : await blobToDataUrl(v);
  const res = await fetch(`${TELA3D_URL}/tela3d/paint-views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { mesh: await blobToDataUrl(mesh), views: viewData, ...options } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.glbBase64) throw new Error(data?.error || `Tela 3D answered ${res.status}`);
  const bytes = Uint8Array.from(atob(data.glbBase64), (c) => c.charCodeAt(0));
  const share = Number(/(\d+(?:\.\d+)?)%/.exec(String(data.painted ?? ''))?.[1] ?? NaN);
  /** How well each view's outline matched the mesh (0–1); a low one means a wrong view or role. */
  const overlap = (data.overlap ?? {}) as Record<string, number>;
  return { glb: new Blob([bytes], { type: 'model/gltf-binary' }), paintedShare: share / 100, overlap, ms: Math.round(performance.now() - t0) };
}

export interface ReshapeReport {
  views: Record<string, { overlapBefore: number; overlapAfter?: number; skipped?: boolean; filledToArt?: number; carved?: number; extruded?: number; reliefMm?: number }>;
  /** Depth (Z) stretch measured from the side and plan views, and each view's own estimate. */
  depthScale: number;
  depthEstimates: Record<string, number>;
  groups: Record<string, { views: string[]; cut: number; skipped?: boolean }>;
  outlineCut: number;
  grown: number;
  /** Share of the final surface that is the generator's own (unchanged) surface. */
  snapped: number;
  volumeChange: number;
  faces: number;
  voxel: number;
}

/**
 * Geometry from the art. The generator saw one view; every other view on the sheet is a measurement:
 * - proportions: the depth the side and plan views measure (median of their estimates);
 * - outlines, by vote: views along the same axis must agree before anything is cut (generated sheets aren't to one scale);
 * - parts the outlines show but the shape dropped are grown in;
 * - sunken areas are raised to the drawn surface (Depth Anything V2's broad relief at the shape's outer envelope);
 * - each view's fine relief (logs, trims, recesses) from the same vision model is extruded / carved, except on the view
 *   the shape came from (`shapeFrom`), whose detail the generator already has; the generator's surface is kept wherever
 *   nothing changed. `outlineOnly` views shape the outline but not the relief (a mirrored front standing in for a back).
 */
export async function reshapeFromViews(mesh: Blob, views: Partial<Record<PaintViewName, Blob | string>>, options: { outlineOnly?: string[]; shapeFrom?: string; res?: number; faces?: number; grow?: number; relief?: number; fillToArt?: number; minOverlap?: number; depth?: boolean } = {}) {
  const status = await ensureTela3d();
  if (!status.online) throw new Error(status.detail);
  const t0 = performance.now();
  const viewData: Record<string, string> = {};
  for (const [name, v] of Object.entries(views)) if (v) viewData[name] = typeof v === 'string' ? v : await blobToDataUrl(v);
  const res = await fetch(`${TELA3D_URL}/tela3d/reshape-views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { mesh: await blobToDataUrl(mesh), views: viewData, ...options } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.glbBase64) throw new Error(data?.error || `Tela 3D answered ${res.status}`);
  const bytes = Uint8Array.from(atob(data.glbBase64), (c) => c.charCodeAt(0));
  return { glb: new Blob([bytes], { type: 'model/gltf-binary' }), report: data.report as ReshapeReport, log: (data.log ?? []) as string[], ms: Math.round(performance.now() - t0) };
}

/**
 * Let go of the resident model after a batch. `exit` also shuts the engine down: Windows keeps the commit of a big weights
 * load (~12 GB) until the process ends, and ensureTela3d starts it again on the next job.
 */
export async function releaseTela3d(exit = false) {
  const res = await fetch(`${TELA3D_URL}/tela3d/release`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: { exit } }),
  }).catch(() => null);
  return !!res?.ok;
}

/** One image (ideally the object on a transparent or plain background) → a GLB. */
export async function imageToModel(image: Blob | string, backend: Tela3dBackend = 'auto', options: Tela3dOptions = {}): Promise<Tela3dResult> {
  const status = await ensureTela3d();
  if (!status.online) throw new Error(status.detail);
  const t0 = performance.now();
  const dataUrl = typeof image === 'string' ? image : await blobToDataUrl(image);
  const { quality, ...rest } = options;
  const res = await fetch(`${TELA3D_URL}/tela3d/image-to-mesh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, backend, quality: quality || 'fast', options: rest }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.glbBase64) throw new Error(data?.error || `Tela 3D answered ${res.status}`);
  const bytes = Uint8Array.from(atob(data.glbBase64), (c) => c.charCodeAt(0));
  return {
    glb: new Blob([bytes], { type: 'model/gltf-binary' }),
    backend: data.backendUsed,
    backendLabel: data.backendLabel,
    textured: !!data.textured,
    vertices: data.vertices,
    faces: data.faces,
    ms: Math.round(performance.now() - t0),
  };
}
