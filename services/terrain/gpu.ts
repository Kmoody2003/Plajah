// Plajah Terrain — GPU bake (docs/plajah-terrain.md, phase 2).
//
// Compiles a terrain graph to a WebGPU compute kernel (TSL) that fills a height grid, then reads it back. The maths
// mirrors noise.ts / graph.ts line for line (same integer hash, same shapes), so a GPU bake and a CPU bake of one graph
// agree to f32 rounding. Graphs with `fn` nodes can't run here: bakeRegion() falls back to the CPU for those.
import * as THREE from 'three/webgpu';
import { Fn, abs, clamp, cos, exp, float, floor, instanceIndex, instancedArray, int, max, min, sin, sqrt, uint, uniform } from 'three/tsl';
import { H1, H2, H3, M1, M2 } from './noise';
import { gpuReady, type GraphNode, type Ref, type TerrainGraph, compileGraph, type HeightFns } from './graph';
import type { GridRegion } from './field';

// TSL nodes are dynamically typed; keep the builder readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const ss = (a: number, b: number, x: N) => { const t = clamp(x.sub(a).div(b - a), 0, 1); return t.mul(t).mul(float(3).sub(t.mul(2))); };
const clamp01 = (v: N) => clamp(v, 0, 1);

function hash2(ix: N, iz: N, seed: number): N {
  let h: N = uint(ix).mul(uint(H1)).bitXor(uint(iz).mul(uint(H2))).bitXor(uint(Math.imul(seed | 0, H3) >>> 0));
  h = h.bitXor(h.shiftRight(uint(15))).mul(uint(M1));
  h = h.bitXor(h.shiftRight(uint(12))).mul(uint(M2));
  return h.bitXor(h.shiftRight(uint(15)));
}
const unit = (h: N) => float(h.shiftRight(uint(8))).div(16777216);
const fade = (t: N) => t.mul(t).mul(t).mul(t.mul(t.mul(6).sub(15)).add(10));
const bilerp = (a: N, b: N, c: N, d: N, u: N, v: N) => a.add(b.sub(a).mul(u)).add(c.sub(a).mul(v)).add(a.sub(b).sub(c).add(d).mul(u).mul(v));

function valueNoise(x: N, z: N, seed: number): N {
  const fx = floor(x).toVar(), fz = floor(z).toVar(), xi = int(fx).toVar(), zi = int(fz).toVar();
  const u = fade(x.sub(fx)).toVar(), v = fade(z.sub(fz)).toVar();
  const a = unit(hash2(xi, zi, seed)), b = unit(hash2(xi.add(1), zi, seed)), c = unit(hash2(xi, zi.add(1), seed)), d = unit(hash2(xi.add(1), zi.add(1), seed));
  return bilerp(a, b, c, d, u, v).mul(2).sub(1);
}

function gradientNoise(x: N, z: N, seed: number): N {
  const fx = floor(x).toVar(), fz = floor(z).toVar(), xi = int(fx).toVar(), zi = int(fz).toVar();
  const xf = x.sub(fx).toVar(), zf = z.sub(fz).toVar(), u = fade(xf).toVar(), v = fade(zf).toVar();
  const g = (i: number, j: number, dx: N, dz: N) => {
    const a = float(hash2(xi.add(i), zi.add(j), seed).bitAnd(uint(7))).mul(Math.PI / 4).toVar();
    return cos(a).mul(dx).add(sin(a).mul(dz));
  };
  const a = g(0, 0, xf, zf), b = g(1, 0, xf.sub(1), zf), c = g(0, 1, xf, zf.sub(1)), d = g(1, 1, xf.sub(1), zf.sub(1));
  return bilerp(a, b, c, d, u, v).mul(1.41);
}

function cellularNoise(x: N, z: N, seed: number): N {
  const fx = floor(x).toVar(), fz = floor(z).toVar(), xi = int(fx).toVar(), zi = int(fz).toVar();
  let best: N = float(8);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const hx = xi.add(i), hz = zi.add(j);
    const px = fx.add(i).add(unit(hash2(hx, hz, seed))), pz = fz.add(j).add(unit(hash2(hx, hz, seed + 1)));
    const dx = px.sub(x), dz = pz.sub(z);
    best = min(best, dx.mul(dx).add(dz.mul(dz)));
  }
  return min(float(1), sqrt(best)).mul(2).sub(1);
}

const BASE = { value: valueNoise, perlin: gradientNoise, cellular: cellularNoise };

function fractal(x: N, z: N, o: { kind?: keyof typeof BASE; mode?: string; octaves?: number; lacunarity?: number; gain?: number; seed?: number }): N {
  const f = BASE[o.kind ?? 'perlin'], mode = o.mode ?? 'fbm', oct = Math.max(1, Math.min(10, Math.round(o.octaves ?? 5)));
  const lac = o.lacunarity ?? 2, gain = o.gain ?? 0.5, seed = o.seed ?? 0;
  let sum: N = float(0), amp = 1, norm = 0, fr = 1;
  for (let k = 0; k < oct; k++) {
    const n = f(x.mul(fr).add(k * 19.19), z.mul(fr).sub(k * 7.73), seed + k * 101).toVar();
    const term = mode === 'ridged' ? float(1).sub(abs(n)).toVar().pow2() : mode === 'billow' ? abs(n).mul(2).sub(1) : n;
    sum = sum.add(term.mul(amp));
    norm += amp; amp *= gain; fr *= lac;
  }
  return sum.div(norm);
}

/** Build the TSL expression for the graph's output at (x, z). */
export function graphNode(g: TerrainGraph, x: N, z: N): N {
  if (!gpuReady(g)) throw new Error(`terrain graph${g.name ? ` "${g.name}"` : ''} has CPU-only (fn / raster) nodes`);
  const at = (X: N, Z: N) => {
    const memo = new Map<string, N>();
    const ref = (r: Ref): N => (typeof r === 'number' ? float(r) : node(r));
    const node = (id: string): N => {
      if (!memo.has(id)) memo.set(id, build(g.nodes[id]).toVar());
      return memo.get(id);
    };
    const build = (n: GraphNode): N => {
      switch (n.type) {
        case 'const': return float(n.value);
        case 'noise': {
          const ox = n.offset?.[0] ?? 0, oz = n.offset?.[1] ?? 0;
          return fractal(X.add(ox).mul(n.freq), Z.add(oz).mul(n.freq), n).mul(n.amp ?? 1);
        }
        case 'warp': {
          const fr = n.freq, oct = n.octaves ?? 3, s = n.seed ?? 0;
          const wx = X.add(fractal(X.mul(fr), Z.mul(fr), { octaves: oct, seed: s }).mul(n.amount)).toVar();
          const wz = Z.add(fractal(X.mul(fr), Z.mul(fr), { octaves: oct, seed: s + 7 }).mul(n.amount)).toVar();
          return at(wx, wz)(n.input);
        }
        case 'combine': {
          const ins = n.inputs.map(ref);
          if (n.op === 'add') return ins.reduce((s, v) => s.add(v));
          if (n.op === 'mul') return ins.reduce((s, v) => s.mul(v));
          if (n.op === 'sub') return ins.reduce((s, v) => s.sub(v));
          if (n.op === 'min') return ins.reduce((s, v) => min(s, v));
          return ins.reduce((s, v) => max(s, v));
        }
        case 'scale': return ref(n.input).mul(n.scale ?? 1).add(n.bias ?? 0);
        case 'mix': { const a = ref(n.a); return a.add(ref(n.b).sub(a).mul(clamp01(ref(n.t)))); }
        case 'curve': {
          const v = ref(n.input), p = n.points;
          let y: N = float(p[0][1]);
          for (let k = 0; k < p.length - 1; k++) y = y.add(clamp01(v.sub(p[k][0]).div(p[k + 1][0] - p[k][0])).mul(p[k + 1][1] - p[k][1]));
          return y;
        }
        case 'terrace': {
          const t = ref(n.input).div(n.step).toVar(), k = floor(t), f = t.sub(k), sharp = Math.max(1, n.sharpness ?? 2);
          return k.add(ss(0, 1, clamp01(f.sub(0.5).mul(sharp).add(0.5)))).mul(n.step);
        }
        case 'clamp': return clamp(ref(n.input), n.min, n.max);
        case 'mask': return ss(n.from, n.to, ref(n.input));
        case 'radial': {
          const dx = X.sub(n.center[0]), dz = Z.sub(n.center[1]), d = sqrt(dx.mul(dx).add(dz.mul(dz))).div(n.radius).toVar();
          const sh = n.shape ?? 'hill', fo = n.falloff ?? 0.25;
          const s = sh === 'mesa' ? float(1).sub(ss(1 - fo, 1, d))
            : sh === 'crater' ? ss(0, 0.9, d).sub(1).add(exp(d.sub(1).div(0.18).pow2().negate()).mul(0.45))
            : float(1).sub(ss(0, 1, d));
          return s.mul(n.height);
        }
        case 'path': {
          const p = n.points;
          let best: N = float(1e9);
          for (let i = 0; i < p.length - 1; i++) {
            const [ax, az] = p[i], vx = p[i + 1][0] - ax, vz = p[i + 1][1] - az, L2 = vx * vx + vz * vz || 1;
            const t = clamp01(X.sub(ax).mul(vx).add(Z.sub(az).mul(vz)).div(L2));
            const ex = X.sub(ax).sub(t.mul(vx)), ez = Z.sub(az).sub(t.mul(vz));
            best = min(best, sqrt(ex.mul(ex).add(ez.mul(ez))));
          }
          const w = n.width, fo = n.falloff ?? 10;
          return float(1).sub(ss(w / 2, w / 2 + fo, best)).mul(n.depth);
        }
        case 'distance': { const dx = X.sub(n.center[0]), dz = Z.sub(n.center[1]); return sqrt(dx.mul(dx).add(dz.mul(dz))); }
        case 'fn': case 'raster': throw new Error(`${n.type} nodes are CPU only`);
      }
    };
    return ref;
  };
  return at(x, z)(g.output);
}

/** One compiled bake kernel per (renderer, graph, grid size, cell): the region's corner is a uniform, so streaming many
 *  tiles compiles the graph's shader once. Bakes on one kernel run one after another (they share its buffer). */
interface Baker { n: number; buf: N; kernel: N; ux: N; uz: N; chain: Promise<unknown> }
const bakers = new WeakMap<THREE.WebGPURenderer, WeakMap<TerrainGraph, Map<string, Baker>>>();

function bakerFor(renderer: THREE.WebGPURenderer, g: TerrainGraph, n: number, cell: number): Baker {
  let byGraph = bakers.get(renderer); if (!byGraph) { byGraph = new WeakMap(); bakers.set(renderer, byGraph); }
  let byGrid = byGraph.get(g); if (!byGrid) { byGrid = new Map(); byGraph.set(g, byGrid); }
  const key = `${n}:${cell}`;
  let b = byGrid.get(key);
  if (!b) {
    const count = n * n, buf = instancedArray(count, 'float'), ux = uniform(0), uz = uniform(0);
    const kernel = Fn(() => {
      const i = instanceIndex;
      const x = ux.add(float(i.mod(uint(n))).mul(cell)).toVar();
      const z = uz.add(float(i.div(uint(n))).mul(cell)).toVar();
      buf.element(i).assign(graphNode(g, x, z));
    })().compute(count);
    b = { n, buf, kernel, ux, uz, chain: Promise.resolve() };
    byGrid.set(key, b);
  }
  return b;
}

/** Bake one grid region of a graph on the GPU; returns the (size/cell + 1)² heights, row by row (z outer). */
export function bakeGraphGPU(renderer: THREE.WebGPURenderer, g: TerrainGraph, r: GridRegion): Promise<Float32Array> {
  const n = Math.round(r.size / r.cell) + 1, b = bakerFor(renderer, g, n, r.cell);
  const run = b.chain.then(async () => {
    b.ux.value = r.x0; b.uz.value = r.z0;
    await renderer.computeAsync(b.kernel);
    const ab = await renderer.getArrayBufferAsync(b.buf.value as unknown as THREE.StorageBufferAttribute);
    return new Float32Array(ab).slice(0, n * n);
  });
  b.chain = run.catch(() => undefined);
  return run;
}

/** Bake a region: GPU when a renderer is given and the graph has no CPU-only nodes, CPU otherwise. */
export async function bakeRegion(g: TerrainGraph, r: GridRegion, opts: { renderer?: THREE.WebGPURenderer | null; fns?: HeightFns } = {}) {
  if (opts.renderer && gpuReady(g)) {
    try { return { data: await bakeGraphGPU(opts.renderer, g, r), gpu: true }; } catch (e) { console.warn('[terrain] GPU bake failed, using the CPU', e); }
  }
  const f = compileGraph(g, opts.fns), n = Math.round(r.size / r.cell) + 1, data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[i + j * n] = f(r.x0 + i * r.cell, r.z0 + j * r.cell);
  return { data, gpu: false };
}
