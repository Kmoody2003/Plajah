// Plajah Terrain — streaming for big worlds (docs/plajah-terrain.md, phase 6).
//
// A 4–8 km world can't bake its whole fine grid up front (8 km at 2 m = 16 M samples). Instead:
//   far grid     the whole world once at a coarse cell (8 km at 16 m = 501²): distant ground, and the fallback;
//   fine tiles   square tiles at the fine cell, baked round the player in time slices (a few ms a frame, nearest
//                first) and evicted behind them, so memory stays flat however far you walk;
//   chunks       ground meshes within view distance, rebuilt when the fine tile under them arrives.
// surface() reads the fine tile when it's ready and the far grid otherwise; it never calls the (slow) height graph.
// The field lives in streamField.ts (three-free); this file adds the chunk manager, which needs three.
import * as THREE from 'three/webgpu';
import { chunkGeometry, geometryFromArrays, type ChunkLod, type ChunkOptions } from './chunks';
import type { ChunkArrays } from './chunkArrays';
import { StreamedHeightField } from './streamField';
import type { WorkerMesher } from './meshWorker';

export { StreamedHeightField, TileSurface, type StreamOptions, type TileListener } from './streamField';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface StreamingChunkOptions extends Pick<ChunkOptions, 'holed' | 'mayHaveHoles' | 'uvScale' | 'lowTier'> {
  chunk?: number;
  /** Detail levels nearest first; the last range is the view distance. */
  lods?: ChunkLod[];
  /** Mesh building budget per update (ms); at least one build always runs when one is due. */
  buildBudgetMs?: number;
  /** Build meshes on a worker (meshWorker.ts) instead of the main thread; holes are not supported there. */
  mesher?: WorkerMesher | null;
  /** Worker jobs in flight at once (nearest first; a short queue keeps the order fresh as the camera moves). */
  maxInFlight?: number;
  name?: string;
}

interface Live { cx: number; cz: number; lod: number; mesh: THREE.Mesh; fine: boolean }

/** Ground meshes round the camera over a streamed field: built in view distance, dropped beyond, rebuilt fine. */
export class StreamingChunks {
  readonly group = new THREE.Group();
  readonly chunk: number; readonly lods: ChunkLod[];
  private live = new Map<number, Live>();
  stats = { built: 0, disposed: 0 };

  constructor(private field: StreamedHeightField, private material: THREE.Material, private o: StreamingChunkOptions = {}) {
    this.chunk = o.chunk ?? 100;
    this.lods = o.lods ?? [{ seg: 50, range: 200 }, { seg: 20, range: 600 }, { seg: 8, range: 1800 }];
    this.group.name = o.name ?? 'terrain-stream';
    // tiles should hold whole chunks (tile a multiple of chunk, bounds on the chunk grid) so a chunk is all fine or all far
    if (field.tile % this.chunk !== 0) console.warn(`[terrain] stream tile ${field.tile} m is not a multiple of the ${this.chunk} m chunk`);
  }

  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }
  get liveChunks() { return this.live.size; }
  get liveVertices() { let n = 0; for (const l of this.live.values()) n += l.mesh.geometry.attributes.position.count; return n; }

  private want: { k: number; cx: number; cz: number; lod: number; d: number }[] = [];
  private wx = Infinity; private wz = Infinity;

  private flight = new Map<number, { lod: number; fine: boolean }>();
  get inFlight() { return this.flight.size; }

  update(cam: { x: number; z: number }) {
    const C = this.chunk, budget = this.o.buildBudgetMs ?? 3;
    // the wanted set only changes when the camera has moved a little: recompute every C/8
    if (Math.hypot(cam.x - this.wx, cam.z - this.wz) > C / 8) { this.plan(cam); this.wx = cam.x; this.wz = cam.z; }
    const mesher = this.o.holed ? null : this.o.mesher ?? null, cap = this.o.maxInFlight ?? 8;
    const t0 = now();
    for (const w of this.want) {
      const l = this.live.get(w.k), fineNow = this.field.fineAt(w.cx, w.cz);
      if (l && l.lod === w.lod && l.fine === fineNow) continue;     // up to date (a tile arriving or leaving flips fine)
      if (mesher) {
        const f = this.flight.get(w.k);
        if (f && f.lod === w.lod && f.fine === fineNow) continue;   // already on its way
        if (this.flight.size >= cap) break;
        this.request(mesher, w.k, w.cx, w.cz, w.lod, fineNow);
        continue;
      }
      this.build(w.k, w.cx, w.cz, w.lod, fineNow, l);
      if (now() - t0 > budget) break;
    }
  }

  private segFor(lod: number) { const s = this.lods[lod].seg; return this.o.lowTier ? Math.max(6, Math.round(s * 0.6)) : s; }

  private request(mesher: WorkerMesher, k: number, cx: number, cz: number, lod: number, fine: boolean) {
    const job = { lod, fine };
    this.flight.set(k, job);
    mesher.build(cx, cz, this.chunk, this.segFor(lod), lod > 0 ? 3 : 1.2, this.o.uvScale).then((a) => {
      if (this.flight.get(k) !== job) return;                      // superseded by a newer request
      this.flight.delete(k);
      const w = this.want.find((x) => x.k === k);
      if (!w || w.lod !== lod) return;                             // no longer wanted at this detail
      this.place(k, cx, cz, lod, fine, geometryFromArrays(a), this.live.get(k));
    }, () => { if (this.flight.get(k) === job) this.flight.delete(k); });
  }

  private plan(cam: { x: number; z: number }) {
    const C = this.chunk, L = this.lods, view = L[L.length - 1].range;
    const i0 = Math.floor((cam.x - view) / C), i1 = Math.floor((cam.x + view) / C), j0 = Math.floor((cam.z - view) / C), j1 = Math.floor((cam.z + view) / C);
    const want: { k: number; cx: number; cz: number; lod: number; d: number }[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * C, cz = (j + 0.5) * C, d = Math.max(0, Math.hypot(cx - cam.x, cz - cam.z) - C * 0.7);
      if (d > view) continue;
      want.push({ k: this.key(i, j), cx, cz, lod: L.findIndex((l) => d <= l.range), d });
    }
    want.sort((a, b) => a.d - b.d);
    const keep = new Set(want.map((w) => w.k));
    for (const [k, l] of this.live) if (!keep.has(k)) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); this.live.delete(k); this.stats.disposed++; }
    for (const k of this.flight.keys()) if (!keep.has(k)) this.flight.delete(k);
    this.want = want;
  }

  private build(k: number, cx: number, cz: number, lod: number, fine: boolean, old?: Live) {
    const g = chunkGeometry(this.field, cx, cz, this.chunk, this.segFor(lod), lod > 0 ? 3 : 1.2, { ...this.o, gridNormals: true });
    this.place(k, cx, cz, lod, fine, g, old);
  }

  private place(k: number, cx: number, cz: number, lod: number, fine: boolean, g: THREE.BufferGeometry, old?: Live) {
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = `${this.group.name}-${cx}-${cz}-${lod}`;
    if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); this.stats.disposed++; }
    this.group.add(mesh);
    this.live.set(k, { cx, cz, lod, mesh, fine });
    this.stats.built++;
  }

  dispose() { for (const l of this.live.values()) l.mesh.geometry.dispose(); this.live.clear(); this.group.clear(); }
}
