// raster/workerClient — promise API over rasterWorker with transferable buffers and an
// inline fallback (no Worker: node, SSR, CSP-restricted embeds).
//
//   const out = await rasterWorker().run('contentAwareFill', { image, hole }, { transfer: true });
//
// transfer:true moves the input buffers to the worker (the caller must not reuse them);
// default copies (structured clone) so callers keep their pixels.

import { RASTER_OPS, transferables, type RasterOp } from './rasterWorker';

type Args<K extends RasterOp> = Parameters<(typeof RASTER_OPS)[K]>[0];
type Result<K extends RasterOp> = ReturnType<(typeof RASTER_OPS)[K]>;

export class RasterWorkerClient {
  private worker: Worker | null = null; private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  lastMs = 0;
  constructor(private factory?: () => Worker) {}
  private ensure(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = this.factory ? this.factory() : new Worker(new URL('./rasterWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string; ms?: number }>) => {
        const p = this.pending.get(e.data.id); if (!p) return; this.pending.delete(e.data.id); this.lastMs = e.data.ms || 0;
        if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
      };
      this.worker.onerror = ev => { for (const p of this.pending.values()) p.reject(new Error(ev.message || 'raster worker crashed')); this.pending.clear(); this.worker?.terminate(); this.worker = null; };
      return this.worker;
    } catch { return null; }
  }
  run<K extends RasterOp>(op: K, args: Args<K>, opts: { transfer?: boolean; inline?: boolean } = {}): Promise<Result<K>> {
    const w = opts.inline ? null : this.ensure();
    if (!w) { const t0 = Date.now(); const r = (RASTER_OPS[op] as (a: any) => Result<K>)(args); this.lastMs = Date.now() - t0; return Promise.resolve(r); }
    const id = ++this.seq;
    return new Promise<Result<K>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, op, args }, opts.transfer ? transferables(args) : []);
    });
  }
  dispose() { this.worker?.terminate(); this.worker = null; for (const p of this.pending.values()) p.reject(new Error('disposed')); this.pending.clear(); }
}
let shared: RasterWorkerClient | null = null;
export const rasterWorker = () => (shared ??= new RasterWorkerClient());
