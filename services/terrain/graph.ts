// Plajah Terrain — the terrain graph (docs/plajah-terrain.md, phase 2).
//
// A world's height as data: named nodes (noise, combine, curve, terrace, stamps, carved paths, masks…) wired by id,
// one of them the output. It is JSON, so Game Studio and Tela can edit it and a world can be saved, shared and diffed.
// compileGraph() turns it into a height function for the CPU (collision, tools, tests); gpu.ts compiles the same graph
// to a WebGPU compute bake. A game can keep hand-written height code as an `fn` node (CPU only).
import { fractal, type FractalMode, type NoiseKind } from './noise';

/** A node input: another node's id, or a number. */
export type Ref = string | number;

export type GraphNode =
  | { type: 'const'; value: number }
  /** Fractal noise at `freq` cycles per metre, times `amp`. fbm / billow −amp…amp, ridged 0…amp. */
  | { type: 'noise'; kind?: NoiseKind; mode?: FractalMode; freq: number; amp?: number; octaves?: number; lacunarity?: number; gain?: number; seed?: number; offset?: [number, number] }
  /** Reads `input` at coordinates pushed `amount` metres by a pair of noise fields (domain warp). */
  | { type: 'warp'; input: Ref; amount: number; freq: number; octaves?: number; seed?: number }
  | { type: 'combine'; op: 'add' | 'sub' | 'mul' | 'min' | 'max'; inputs: Ref[] }
  /** input · scale + bias. */
  | { type: 'scale'; input: Ref; scale?: number; bias?: number }
  /** a + (b − a) · t, t clamped 0…1. */
  | { type: 'mix'; a: Ref; b: Ref; t: Ref }
  /** Piecewise-linear remap through [in, out] points (in ascending), flat beyond the ends. */
  | { type: 'curve'; input: Ref; points: [number, number][] }
  /** Steps every `step` metres; `sharpness` ≥ 1 (1 = smooth slopes, 8 = near-vertical risers). */
  | { type: 'terrace'; input: Ref; step: number; sharpness?: number }
  | { type: 'clamp'; input: Ref; min: number; max: number }
  /** smoothstep(from, to, input): 0…1. */
  | { type: 'mask'; input: Ref; from: number; to: number }
  /** A round stamp: hill (dome), mesa (flat top, `falloff` = edge width as a share of the radius), crater (bowl + rim). */
  | { type: 'radial'; center: [number, number]; radius: number; height: number; shape?: 'hill' | 'mesa' | 'crater'; falloff?: number }
  /** Carve depth along a polyline: `depth` inside `width`, fading to 0 over `falloff` metres. Subtract it from the land. */
  | { type: 'path'; points: [number, number][]; width: number; depth: number; falloff?: number }
  /** Distance from a point in metres (for masks: "mountains beyond 800 m"). */
  | { type: 'distance'; center: [number, number] }
  /** A height function the game registers by name (CPU only). */
  | { type: 'fn'; name: string }
  /** A baked raster layer (e.g. an erosion delta) registered by name, sampled bilinearly, times `scale` (CPU only for now). */
  | { type: 'raster'; name: string; scale?: number };

export interface TerrainGraph {
  version: 1;
  name?: string;
  nodes: Record<string, GraphNode>;
  output: string;
}

export type HeightFns = Record<string, (x: number, z: number) => number>;
/** Raster layers by name: anything with a bilinear at(x, z) (a HeightGrid from raster.ts). */
export type Rasters = Record<string, { at(x: number, z: number): number }>;

/** Problems with a graph (unknown inputs, cycles, bad parameters); empty when it is sound. */
export function validateGraph(g: TerrainGraph, fns: HeightFns = {}, rasters: Rasters = {}): string[] {
  const errs: string[] = [];
  if (!g.nodes[g.output]) errs.push(`output "${g.output}" is not a node`);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errs.push(`cycle: ${[...path, id].join(' → ')}`); return; }
    const n = g.nodes[id];
    if (!n) { errs.push(`"${path[path.length - 1]}" reads unknown node "${id}"`); return; }
    state.set(id, 1);
    for (const r of refs(n)) if (typeof r === 'string') visit(r, [...path, id]);
    state.set(id, 2);
  };
  for (const [id, n] of Object.entries(g.nodes)) {
    visit(id, []);
    if (n.type === 'noise' && !(n.freq > 0)) errs.push(`${id}: freq must be > 0`);
    if (n.type === 'warp' && !(n.freq > 0)) errs.push(`${id}: freq must be > 0`);
    if (n.type === 'terrace' && !(n.step > 0)) errs.push(`${id}: step must be > 0`);
    if (n.type === 'curve' && (n.points.length < 2 || n.points.some((p, i) => i > 0 && p[0] <= n.points[i - 1][0]))) errs.push(`${id}: curve needs ≥ 2 points with ascending inputs`);
    if (n.type === 'path' && n.points.length < 2) errs.push(`${id}: path needs ≥ 2 points`);
    if (n.type === 'radial' && !(n.radius > 0)) errs.push(`${id}: radius must be > 0`);
    if (n.type === 'combine' && n.inputs.length < 1) errs.push(`${id}: combine needs inputs`);
    if (n.type === 'fn' && !fns[n.name]) errs.push(`${id}: no height function "${n.name}" registered`);
    if (n.type === 'raster' && !rasters[n.name]) errs.push(`${id}: no raster "${n.name}" registered`);
  }
  return errs;
}

/** The ids a node reads. */
export function refs(n: GraphNode): Ref[] {
  switch (n.type) {
    case 'warp': case 'scale': case 'curve': case 'terrace': case 'clamp': case 'mask': return [n.input];
    case 'combine': return n.inputs;
    case 'mix': return [n.a, n.b, n.t];
    default: return [];
  }
}

/** True when every node can run on the GPU (no `fn` or `raster` nodes reachable from the output). */
export function gpuReady(g: TerrainGraph) {
  const seen = new Set<string>();
  const walk = (r: Ref): boolean => {
    if (typeof r === 'number' || seen.has(r)) return true;
    seen.add(r);
    const n = g.nodes[r];
    return !!n && n.type !== 'fn' && n.type !== 'raster' && refs(n).every(walk);
  };
  return walk(g.output);
}

type F = (x: number, z: number) => number;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Shared shape maths (gpu.ts mirrors these exactly). */
export const shapes = {
  /** Piecewise-linear: y0 + Σ Δy · clamp((v − x_k) / Δx). */
  curve(v: number, pts: [number, number][]) {
    let y = pts[0][1];
    for (let k = 0; k < pts.length - 1; k++) y += (pts[k + 1][1] - pts[k][1]) * clamp01((v - pts[k][0]) / (pts[k + 1][0] - pts[k][0]));
    return y;
  },
  terrace(v: number, step: number, sharp: number) {
    const t = v / step, k = Math.floor(t), f = t - k;
    return (k + smoothstep(0, 1, clamp01((f - 0.5) * sharp + 0.5))) * step;
  },
  radial(d: number, shape: string, falloff: number) {
    if (shape === 'mesa') return 1 - smoothstep(1 - falloff, 1, d);
    if (shape === 'crater') return -(1 - smoothstep(0, 0.9, d)) + 0.45 * Math.exp(-(((d - 1) / 0.18) ** 2));
    return 1 - smoothstep(0, 1, d);
  },
  path(d: number, width: number, falloff: number) { return 1 - smoothstep(width / 2, width / 2 + falloff, d); },
};

/** Distance from (x, z) to a polyline. */
export function polylineDistance(pts: [number, number][], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (L2 || 1));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Compile a graph to a CPU height function. Throws with the validation errors if the graph is unsound. */
export function compileGraph(g: TerrainGraph, fns: HeightFns = {}, rasters: Rasters = {}): F {
  const errs = validateGraph(g, fns, rasters);
  if (errs.length) throw new Error(`terrain graph${g.name ? ` "${g.name}"` : ''}: ${errs.join('; ')}`);
  const memo = new Map<string, F>();
  const ref = (r: Ref): F => (typeof r === 'number' ? () => r : node(r));
  const node = (id: string): F => {
    const hit = memo.get(id); if (hit) return hit;
    const f = build(g.nodes[id]);
    memo.set(id, f);
    return f;
  };
  const build = (n: GraphNode): F => {
    switch (n.type) {
      case 'const': { const v = n.value; return () => v; }
      case 'noise': {
        const o = { kind: n.kind, mode: n.mode, octaves: n.octaves, lacunarity: n.lacunarity, gain: n.gain, seed: n.seed };
        const fr = n.freq, amp = n.amp ?? 1, ox = n.offset?.[0] ?? 0, oz = n.offset?.[1] ?? 0;
        return (x, z) => fractal((x + ox) * fr, (z + oz) * fr, o) * amp;
      }
      case 'warp': {
        const inp = ref(n.input), fr = n.freq, a = n.amount, oct = n.octaves ?? 3, s = n.seed ?? 0;
        return (x, z) => inp(x + a * fractal(x * fr, z * fr, { octaves: oct, seed: s }), z + a * fractal(x * fr, z * fr, { octaves: oct, seed: s + 7 }));
      }
      case 'combine': {
        const ins = n.inputs.map(ref), op = n.op;
        if (op === 'add') return (x, z) => { let s = 0; for (const f of ins) s += f(x, z); return s; };
        if (op === 'mul') return (x, z) => { let s = 1; for (const f of ins) s *= f(x, z); return s; };
        if (op === 'sub') return (x, z) => { let s = ins[0](x, z); for (let k = 1; k < ins.length; k++) s -= ins[k](x, z); return s; };
        if (op === 'min') return (x, z) => { let s = Infinity; for (const f of ins) s = Math.min(s, f(x, z)); return s; };
        return (x, z) => { let s = -Infinity; for (const f of ins) s = Math.max(s, f(x, z)); return s; };
      }
      case 'scale': { const inp = ref(n.input), k = n.scale ?? 1, b = n.bias ?? 0; return (x, z) => inp(x, z) * k + b; }
      case 'mix': { const a = ref(n.a), b = ref(n.b), t = ref(n.t); return (x, z) => { const va = a(x, z); return va + (b(x, z) - va) * clamp01(t(x, z)); }; }
      case 'curve': { const inp = ref(n.input), p = n.points; return (x, z) => shapes.curve(inp(x, z), p); }
      case 'terrace': { const inp = ref(n.input), s = n.step, k = Math.max(1, n.sharpness ?? 2); return (x, z) => shapes.terrace(inp(x, z), s, k); }
      case 'clamp': { const inp = ref(n.input), lo = n.min, hi = n.max; return (x, z) => Math.min(hi, Math.max(lo, inp(x, z))); }
      case 'mask': { const inp = ref(n.input), a = n.from, b = n.to; return (x, z) => smoothstep(a, b, inp(x, z)); }
      case 'radial': {
        const [cx, cz] = n.center, r = n.radius, h = n.height, sh = n.shape ?? 'hill', fo = n.falloff ?? 0.25;
        return (x, z) => h * shapes.radial(Math.hypot(x - cx, z - cz) / r, sh, fo);
      }
      case 'path': { const p = n.points, w = n.width, d = n.depth, fo = n.falloff ?? 10; return (x, z) => d * shapes.path(polylineDistance(p, x, z), w, fo); }
      case 'distance': { const [cx, cz] = n.center; return (x, z) => Math.hypot(x - cx, z - cz); }
      case 'fn': return fns[n.name];
      case 'raster': { const r = rasters[n.name], k = n.scale ?? 1; return k === 1 ? (x, z) => r.at(x, z) : (x, z) => r.at(x, z) * k; }
    }
  };
  return node(g.output);
}
