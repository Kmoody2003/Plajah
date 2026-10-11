// persistWorker — PNG-encodes layer pixels off the main thread for Image Studio persistence.
// A 4k layer's Paeth filter + deflate is ~150–400 ms of JS; doing it in the studio's idle
// save would hitch painting. The caller posts a COPY of the pixels (transferred), so later
// strokes never race the encoder. Same encoder as the engine (codecs.encodePng): exact,
// straight-alpha, sRGB/P3 tagged. encodeInline() is the no-Worker fallback.

import { encodePng } from '../../../services/tela/raster/codecs';
import type { Bitmap8 } from '../../../services/tela/raster/buffer';

export interface PersistJob { id: number; width: number; height: number; data: Uint8ClampedArray; colorSpace?: 'srgb' | 'display-p3' }
export const encodeInline = (j: Omit<PersistJob, 'id'>) => encodePng({ width: j.width, height: j.height, data: j.data } as Bitmap8, { colorSpace: j.colorSpace });

declare const self: any;
const WGS = (globalThis as any).WorkerGlobalScope;
if (WGS && typeof self !== 'undefined' && self instanceof WGS) {
  self.onmessage = async (e: MessageEvent<PersistJob>) => {
    const { id } = e.data;
    try { const png = await encodeInline(e.data); self.postMessage({ id, ok: true, png }, [png.buffer]); }
    catch (err) { self.postMessage({ id, ok: false, error: String(err) }); }
  };
}

let worker: Worker | null = null, seq = 0; const pending = new Map<number, (r: Uint8Array | Error) => void>();
/** Encode a layer bitmap / mask-as-bitmap to PNG bytes (worker when available). */
export function encodeForPersist(bm: Bitmap8, colorSpace?: 'srgb' | 'display-p3'): Promise<Uint8Array> {
  const data = new Uint8ClampedArray(bm.data); // snapshot: painting may continue while we encode
  if (!worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./persistWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; png?: Uint8Array; error?: string }>) => { const f = pending.get(e.data.id); pending.delete(e.data.id); f?.(e.data.ok ? e.data.png! : new Error(e.data.error)); };
      worker.onerror = () => { for (const f of pending.values()) f(new Error('persist worker crashed')); pending.clear(); worker?.terminate(); worker = null; };
    } catch { worker = null; }
  }
  if (!worker) return encodeInline({ width: bm.width, height: bm.height, data, colorSpace });
  const id = ++seq, w = worker;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, r => (r instanceof Error ? reject(r) : resolve(r)));
    w.postMessage({ id, width: bm.width, height: bm.height, data, colorSpace } satisfies PersistJob, [data.buffer]);
  }).catch(() => encodeInline({ width: bm.width, height: bm.height, data: new Uint8ClampedArray(bm.data), colorSpace }));
}
