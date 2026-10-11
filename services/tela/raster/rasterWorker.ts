// raster/rasterWorker — CPU-heavy raster ops off the main thread. Messages carry plain
// typed arrays; pixel buffers are TRANSFERRED both ways (zero-copy). The same op table
// runs inline (workerClient's fallback, node tests) so behaviour never depends on where
// it ran.

import type { Bitmap8, Mask8, RasterF } from './buffer';
import type { Filter } from './model';
import { contentAwareFill, type ContentAwareOptions } from './patchmatch';
import { spotHealMask, spotHeal } from './retouch';
import { applyFilter, type FilterContext } from './filters';
import { resizeBitmap, warpMesh, contentAwareScale, transformAffine, distortCorners, type ResampleFilter, type WarpMesh } from './transform';
import { magicWand, quickSelect, refineEdge, colorRange, featherSelection, type Selection, type WandOptions, type RefineOptions } from './selection';

export const RASTER_OPS = {
  contentAwareFill: (a: { image: Bitmap8; hole: Mask8; opts?: ContentAwareOptions }) => contentAwareFill(a.image, a.hole, a.opts),
  spotHealMask: (a: { image: Bitmap8; mask: Mask8; seed?: number }) => spotHealMask(a.image, a.mask, { seed: a.seed }),
  spotHeal: (a: { image: Bitmap8; x: number; y: number; r: number }) => spotHeal(a.image, a.x, a.y, a.r),
  filter: (a: { raster: RasterF; filter: Filter; ctx?: FilterContext }) => applyFilter(a.raster, a.filter, a.ctx),
  resize: (a: { image: Bitmap8; width: number; height: number; filter?: ResampleFilter }) => resizeBitmap(a.image, a.width, a.height, a.filter),
  transformAffine: (a: { image: Bitmap8; m: [number, number, number, number, number, number]; width: number; height: number; filter?: ResampleFilter }) => transformAffine(a.image, a.m, { width: a.width, height: a.height, filter: a.filter }),
  distort: (a: { image: Bitmap8; corners: [number, number][]; width: number; height: number }) => distortCorners(a.image, a.corners, { width: a.width, height: a.height }),
  warp: (a: { image: Bitmap8; mesh: WarpMesh; width: number; height: number }) => warpMesh(a.image, a.mesh, { width: a.width, height: a.height }),
  contentAwareScale: (a: { image: Bitmap8; width: number; height: number; protect?: Uint8Array }) => contentAwareScale(a.image, a.width, a.height, a.protect),
  magicWand: (a: { image: Bitmap8; x: number; y: number; opts: WandOptions }) => magicWand(a.image, a.x, a.y, a.opts),
  quickSelect: (a: { image: Bitmap8; stroke: { x: number; y: number }[]; brushSize: number; base?: Selection | null; subtract?: boolean }) => quickSelect(a.image, a.stroke, { brushSize: a.brushSize }, a.base ?? null, a.subtract),
  refineEdge: (a: { selection: Selection; image: Bitmap8; opts: RefineOptions }) => refineEdge(a.selection, a.image, a.opts),
  colorRange: (a: { image: Bitmap8; samples: [number, number, number][]; fuzziness: number }) => colorRange(a.image, a.samples, a.fuzziness),
  feather: (a: { selection: Selection; radius: number }) => featherSelection(a.selection, a.radius),
} as const;
export type RasterOp = keyof typeof RASTER_OPS;

/** Collect transferable buffers from a result (typed-array .data / .data.buffer). */
export function transferables(v: unknown, out: Transferable[] = []): Transferable[] {
  if (!v || typeof v !== 'object') return out;
  if (ArrayBuffer.isView(v)) { if (!out.includes(v.buffer as ArrayBuffer)) out.push(v.buffer as ArrayBuffer); return out; }
  for (const k of Object.keys(v as object)) transferables((v as any)[k], out);
  return out;
}

declare const self: any;
const WGS = (globalThis as any).WorkerGlobalScope;
if (WGS && typeof self !== 'undefined' && self instanceof WGS) {
  self.onmessage = (e: MessageEvent<{ id: number; op: RasterOp; args: any }>) => {
    const { id, op, args } = e.data;
    try {
      const t0 = performance.now(); const result = (RASTER_OPS[op] as (a: any) => unknown)(args);
      self.postMessage({ id, ok: true, result, ms: performance.now() - t0 }, transferables(result));
    } catch (err) { self.postMessage({ id, ok: false, error: String((err as Error)?.stack || err) }); }
  };
}
