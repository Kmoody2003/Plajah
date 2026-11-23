// Plajah Terrain — ground meshes off the main thread (docs/plajah-terrain.md, phase 6).
//
// The worker keeps a mirror of the streamed field (the far grid, plus the fine tiles as they arrive and leave) and builds
// patch arrays on request, handing them back as transferables. The main thread only wraps them in a BufferGeometry.
// Messages are ordered, so a build sees exactly the tiles the main thread had when it asked (its `fine` flag holds).
//
// In a browser:  new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' })  (Vite bundles it).
// WorkerMesher (the main-thread side) works with any {postMessage, onmessage} pair, so tests run it in-process.
import { HeightGrid } from './field';
import { chunkArrays, type ChunkArrays } from './chunkArrays';
import { TileSurface, type StreamedHeightField } from './streamField';

interface GridMsg { x0: number; z0: number; size: number; cell: number; data: Float32Array }
export type MeshWorkerIn =
  | ({ t: 'far'; bx0: number; bz0: number; tile: number } & GridMsg)
  | ({ t: 'tile' } & GridMsg)
  | { t: 'evict'; x0: number; z0: number }
  | { t: 'build'; id: number; cx: number; cz: number; C: number; seg: number; skirt: number; uvScale?: number };
export type MeshWorkerOut = { t: 'built'; id: number; a: ChunkArrays } | { t: 'error'; id: number; message: string };

/** The worker's message handler (exported so tests and fallbacks can run it in-process). */
export function createMeshWorkerHandler(post: (m: MeshWorkerOut, transfer: ArrayBuffer[]) => void) {
  let S: TileSurface | null = null;
  return (m: MeshWorkerIn) => {
    if (m.t === 'far') { S = new TileSurface(new HeightGrid(m.x0, m.z0, m.size, m.cell, m.data), { x0: m.bx0, z0: m.bz0 }, m.tile); return; }
    if (!S) return;
    if (m.t === 'tile') { const g = new HeightGrid(m.x0, m.z0, m.size, m.cell, m.data); S.tiles.set(S.keyAt(m.x0 + 1e-3, m.z0 + 1e-3), g); return; }
    if (m.t === 'evict') { S.tiles.delete(S.keyAt(m.x0 + 1e-3, m.z0 + 1e-3)); return; }
    try {
      const a = chunkArrays(S, m.cx, m.cz, m.C, m.seg, m.skirt, { uvScale: m.uvScale, gridNormals: true });
      post({ t: 'built', id: m.id, a }, [a.pos.buffer as ArrayBuffer, a.nor.buffer as ArrayBuffer, a.uv.buffer as ArrayBuffer, a.index.buffer as ArrayBuffer]);
    } catch (e) { post({ t: 'error', id: m.id, message: String(e) }, []); }
  };
}

// running as a worker: wire the handler to the worker scope
declare const WorkerGlobalScope: { new (): unknown } | undefined;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof (WorkerGlobalScope as unknown as typeof Object)) {
  const scope = self as unknown as { postMessage(m: unknown, t: ArrayBuffer[]): void; onmessage: ((e: { data: MeshWorkerIn }) => void) | null };
  const handle = createMeshWorkerHandler((m, t) => scope.postMessage(m, t));
  scope.onmessage = (e) => handle(e.data);
}

export interface WorkerLike {
  postMessage(m: unknown, transfer?: ArrayBuffer[]): void;
  onmessage: ((e: { data: MeshWorkerOut }) => void) | null;
  terminate?(): void;
}

/** Main-thread side: mirrors the field into the worker and turns build requests into promises. */
export class WorkerMesher {
  private next = 1;
  private jobs = new Map<number, { resolve: (a: ChunkArrays) => void; reject: (e: Error) => void }>();
  private off: () => void;
  get inFlight() { return this.jobs.size; }

  constructor(private worker: WorkerLike, field: StreamedHeightField) {
    worker.onmessage = (e) => {
      const m = e.data, j = this.jobs.get(m.id);
      if (!j) return;
      this.jobs.delete(m.id);
      if (m.t === 'built') j.resolve(m.a); else j.reject(new Error(m.message));
    };
    const f = field.far, b = field.bounds;
    worker.postMessage({ t: 'far', x0: f.x0, z0: f.z0, size: f.size, cell: f.cell, data: f.data, bx0: b.x0, bz0: b.z0, tile: field.tile } satisfies MeshWorkerIn);
    const sendTile = (g: HeightGrid) => worker.postMessage({ t: 'tile', x0: g.x0, z0: g.z0, size: g.size, cell: g.cell, data: g.data } satisfies MeshWorkerIn);
    for (const g of field.residentGrids()) sendTile(g);
    this.off = field.listen({ onTile: sendTile, onEvict: (x0, z0) => worker.postMessage({ t: 'evict', x0, z0 } satisfies MeshWorkerIn) });
  }

  build(cx: number, cz: number, C: number, seg: number, skirt: number, uvScale?: number): Promise<ChunkArrays> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      this.worker.postMessage({ t: 'build', id, cx, cz, C, seg, skirt, uvScale } satisfies MeshWorkerIn);
    });
  }

  dispose() { this.off(); for (const j of this.jobs.values()) j.reject(new Error('mesher disposed')); this.jobs.clear(); this.worker.terminate?.(); }
}
