// previewCache — the fast flattened-raster path for everything that SHOWS an Image device
// without editing it: Page/Board posture, TelaEmbed (Post Man letters, articles, books),
// print/HTML export and Fabula. None of them should spin up a WebGL compositor per frame.
//
// Resolution order for a device with a raster doc:
//   1. device.rasterPreview whose key matches the raster (persisted by the studio: an OPFS
//      asset on this device and/or a durable URL that works for other people);
//   2. an in-memory composite for that key (LRU, shared by every view in the tab);
//   3. a live studio controller for the device (GPU flatten, ~ms) — registered below;
//   4. a CPU flatten (RasterSession without a canvas) at preview resolution, once per key.
// While (3)/(4) run, the stale preview (or the legacy CSS layers) stays on screen.
//
// The key is a hash of the raster JSON + rev: any structural edit or pixel step changes it,
// and nothing else does (selection, view, tool state never invalidate). Pure parts tested.

import type { TelaImageDevice } from '../../../types';
import type { RasterDocument } from '../../../services/tela/raster/model';

export const PREVIEW_MAX_SIDE = 2048;

// ── Keys ────────────────────────────────────────────────────────────────────────────────────
const keyMemo = new WeakMap<object, string>();
export function fnv1a(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
export function rasterJsonKey(raster: RasterDocument): string {
  let k = keyMemo.get(raster); if (k) return k;
  const json = JSON.stringify(raster); k = `${fnv1a(json)}${json.length.toString(36)}`; keyMemo.set(raster, k); return k;
}
/** The preview key for a device state (null for legacy devices without a raster doc). */
export function previewKey(d: Pick<TelaImageDevice, 'raster' | 'rasterRev'>): string | null {
  return d.raster ? `${rasterJsonKey(d.raster)}@${d.rasterRev || '0'}` : null;
}
export const isPreviewFresh = (d: Pick<TelaImageDevice, 'raster' | 'rasterRev' | 'rasterPreview'>) => !!d.raster && !!d.rasterPreview && d.rasterPreview.key === previewKey(d);
export function previewSize(w: number, h: number, maxSide = PREVIEW_MAX_SIDE) { const s = Math.min(1, maxSide / Math.max(1, w, h)); return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s }; }

// ── LRU of composites (object URLs) ─────────────────────────────────────────────────────────
export class PreviewLru<V> {
  private map = new Map<string, V>();
  constructor(public capacity = 24, private onEvict?: (v: V, key: string) => void) {}
  get(k: string) { const v = this.map.get(k); if (v !== undefined) { this.map.delete(k); this.map.set(k, v); } return v; }
  has(k: string) { return this.map.has(k); }
  set(k: string, v: V) { if (this.map.has(k)) this.map.delete(k); this.map.set(k, v); while (this.map.size > this.capacity) { const [ok, ov] = this.map.entries().next().value as [string, V]; this.map.delete(ok); this.onEvict?.(ov, ok); } }
  get size() { return this.map.size; }
}

export type PreviewSource =
  | { kind: 'stored'; key: string; src?: string; assetId?: string }
  | { kind: 'memory'; key: string; url: string }
  | { kind: 'compute'; key: string; stale?: { src?: string; assetId?: string; url?: string } }
  | { kind: 'legacy' };
/** Decide how to show a device (pure; the component then loads / computes). */
export function resolvePreview(d: Pick<TelaImageDevice, 'raster' | 'rasterRev' | 'rasterPreview'>, memory: { get(k: string): string | undefined }): PreviewSource {
  const key = previewKey(d); if (!key) return { kind: 'legacy' };
  if (d.rasterPreview && d.rasterPreview.key === key && (d.rasterPreview.src || d.rasterPreview.assetId)) return { kind: 'stored', key, src: d.rasterPreview.src, assetId: d.rasterPreview.assetId };
  const url = memory.get(key); if (url) return { kind: 'memory', key, url };
  return { kind: 'compute', key, stale: d.rasterPreview ? { src: d.rasterPreview.src, assetId: d.rasterPreview.assetId } : undefined };
}

// ── Browser side ────────────────────────────────────────────────────────────────────────────
const revoke = (url: string) => { try { URL.revokeObjectURL(url); } catch { /* noop */ } };
const memory = new PreviewLru<string>(24, revoke);
const inflight = new Map<string, Promise<string | null>>();
/** Live studios register a fast GPU flattener for their device (previewCache never imports the studio). */
const liveProviders = new Map<string, (maxSide: number) => Promise<Blob | null>>();
export function registerLivePreview(deviceId: string, fn: ((maxSide: number) => Promise<Blob | null>) | null) { if (fn) liveProviders.set(deviceId, fn); else liveProviders.delete(deviceId); }
export const previewMemory = { get: (k: string) => memory.get(k) };
/** Seed the memory cache (the studio does this when it persists, so embeds never recompute). */
export function putPreview(key: string, blob: Blob) { const url = URL.createObjectURL(blob); memory.set(key, url); return url; }

async function cpuComposite(raster: RasterDocument, maxSide: number): Promise<Blob | null> {
  const { RasterSession, encodeBitmap } = await import('../../../services/tela/raster');
  const s = RasterSession.fromDocument(structuredClone(raster)); await s.assets.load(s.doc);
  const { scale } = previewSize(raster.width, raster.height, maxSide);
  // A throwaway GPU context is far faster than the CPU reference; it is disposed at once.
  try { if (typeof OffscreenCanvas !== 'undefined') s.attachCanvas(new OffscreenCanvas(1, 1)); } catch { /* CPU */ }
  try {
    const bm = s.flatten({ scale, dither: true });
    return await encodeBitmap(bm, { format: 'webp', quality: 0.92, colorSpace: raster.colorSpace });
  } finally { s.dispose(); }
}

/** Object URL of the composite for this device state (deduped per key). */
export function computePreview(d: TelaImageDevice, maxSide = PREVIEW_MAX_SIDE): Promise<string | null> {
  const key = previewKey(d); if (!key || !d.raster) return Promise.resolve(null);
  const hit = memory.get(key); if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    const raster = d.raster, live = liveProviders.get(d.id);
    p = (async () => {
      try {
        const blob = (live && await live(maxSide).catch(() => null)) || await cpuComposite(raster, maxSide);
        return blob ? putPreview(key, blob) : null;
      } catch (e) { console.warn('[TelaImage] preview composite failed', e); return null; }
      finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
  }
  return p;
}

/**
 * For Fabula and other canvas consumers: an ImageBitmap of the device's composite (raster
 * devices) — resolved once per state, never a GPU session per frame. Legacy devices → null
 * (they keep their own CSS-layer path).
 */
export async function getImageDeviceBitmap(d: TelaImageDevice, maxSide = PREVIEW_MAX_SIDE): Promise<ImageBitmap | null> {
  const src = resolvePreview(d, previewMemory);
  if (src.kind === 'legacy') return null;
  let url: string | null | undefined = src.kind === 'memory' ? src.url : src.kind === 'stored' ? src.src : undefined;
  if (src.kind === 'stored' && !url && src.assetId) { const { getTelaAssetUrl } = await import('../../../services/tela/telaAssetStore'); url = await getTelaAssetUrl(src.assetId); }
  if (!url) url = await computePreview(d, maxSide);
  if (!url) return null;
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}
