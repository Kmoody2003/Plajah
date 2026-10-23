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
