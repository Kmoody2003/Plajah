/**
 * shaders.ts — WGSL for Argilla: brush stamps, ray-marched viewport, pointer pick, brick summary.
 *
 * Every brush either moves the whole distance profile semi-Lagrangian (clay, carve, move, inflate,
 * pinch, crease), blends toward a true distance (flatten), or diffuses (smooth). None of them unions
 * a primitive into the stored field: the band is only a few voxels wide, so a wide blend against
 * saturated samples would swell everything near the primitive. Wide blends happen in the bake pass,
 * where every primitive's true distance is known.
 */

import { BRICK_STRIDE, BRICK_VOXELS, COARSE_CELLS } from './brickPool';

export const BRUSH_OP = {
  smooth: 2, flatten: 3, grab: 4, inflate: 5, pinch: 6, crease: 7,
} as const;
export type BrushOp = keyof typeof BRUSH_OP;

const fieldCommon = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
const GRID = ${grid}i;
const SLOTS = ${slotsPerSide}i;
const STRIDE = ${BRICK_STRIDE}i;
const VOXELS = ${BRICK_VOXELS}i;
const COARSE = ${COARSE_CELLS}i;
const BAND = ${band.toFixed(6)};
const VOXEL = ${(2 / (grid * BRICK_VOXELS)).toFixed(8)};
const CELL = ${(2 / grid).toFixed(8)};
const ATLAS = ${(slotsPerSide * BRICK_STRIDE).toFixed(1)};

fn slotOrigin(slot: u32) -> vec3i {
  let s = i32(slot);
  return vec3i(s % SLOTS, (s / SLOTS) % SLOTS, s / (SLOTS * SLOTS)) * STRIDE;
}
`;

export const stampShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
struct Stamp {
  a: vec4f,        // xyz, radius
  b: vec4f,
  dir: vec4f,      // normal or move, w = strength
  op: u32,
  count: u32,
  blend: f32,
  pad: f32,
};
struct Brick { cell: vec3i, slot: u32 };

@group(0) @binding(0) var<uniform> stamp: Stamp;
@group(0) @binding(1) var<storage, read> bricks: array<Brick>;
@group(0) @binding(2) var field: texture_storage_3d<r32float, read_write>;
@group(0) @binding(3) var before: texture_3d<f32>;
@group(0) @binding(4) var page: texture_3d<u32>;

fn smin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return min(a, b); }
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

fn beforeAt(v: vec3i) -> f32 {
  let g = clamp(v, vec3i(0), vec3i(GRID * VOXELS));
  let cell = min(g / VOXELS, vec3i(GRID - 1));
  let entry = textureLoad(page, cell, 0).r;
  if (entry == 0u) { return BAND; }
  if (entry == 1u) { return -BAND; }
  let local = g - cell * VOXELS;
  return textureLoad(before, slotOrigin(entry - 2u) + vec3i(1) + local, 0).r;
}

fn beforeSample(p: vec3f) -> f32 {
  let g = (p + vec3f(1.0)) / VOXEL;
  let i = vec3i(floor(g));
  let f = g - vec3f(i);
  let c00 = mix(beforeAt(i), beforeAt(i + vec3i(1, 0, 0)), f.x);
  let c10 = mix(beforeAt(i + vec3i(0, 1, 0)), beforeAt(i + vec3i(1, 1, 0)), f.x);
  let c01 = mix(beforeAt(i + vec3i(0, 0, 1)), beforeAt(i + vec3i(1, 0, 1)), f.x);
  let c11 = mix(beforeAt(i + vec3i(0, 1, 1)), beforeAt(i + vec3i(1, 1, 1)), f.x);
  return mix(mix(c00, c10, f.y), mix(c01, c11, f.y), f.z);
}

fn beforeGradient(v: vec3i) -> vec3f {
  let g = vec3f(
    beforeAt(v + vec3i(1, 0, 0)) - beforeAt(v - vec3i(1, 0, 0)),
    beforeAt(v + vec3i(0, 1, 0)) - beforeAt(v - vec3i(0, 1, 0)),
    beforeAt(v + vec3i(0, 0, 1)) - beforeAt(v - vec3i(0, 0, 1)),
  );
  let l = length(g);
  return select(vec3f(0.0), g / l, l > 1e-6);
}

@compute @workgroup_size(${BRICK_STRIDE}, ${BRICK_STRIDE}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x / u32(STRIDE);
  if (index >= stamp.count) { return; }
  let brick = bricks[index];
  let local = vec3i(i32(id.x) % STRIDE, i32(id.y), i32(id.z));
  let texel = slotOrigin(brick.slot) + local;
  let lattice = brick.cell * VOXELS + local - vec3i(1);
  let p = vec3f(lattice) * VOXEL - vec3f(1.0);
  let a = stamp.a.xyz;
  let r = stamp.a.w;

  let dist = length(p - a);
  if (dist >= r) { return; }
  let t = dist / r;
  let falloff = (1.0 - t * t) * (1.0 - t * t);
  let strength = stamp.dir.w;
  var next: f32;
  switch (stamp.op) {
    case 2u: { // smooth
      let c = beforeAt(lattice);
      let n = beforeAt(lattice + vec3i(1, 0, 0)) + beforeAt(lattice - vec3i(1, 0, 0))
            + beforeAt(lattice + vec3i(0, 1, 0)) + beforeAt(lattice - vec3i(0, 1, 0))
            + beforeAt(lattice + vec3i(0, 0, 1)) + beforeAt(lattice - vec3i(0, 0, 1));
      next = mix(c, n / 6.0, clamp(strength * falloff, 0.0, 1.0));
    }
    case 3u: { // flatten toward the plane through the hit
      let c = beforeAt(lattice);
      next = mix(c, dot(p - a, stamp.dir.xyz), clamp(strength * falloff, 0.0, 1.0));
    }
    case 4u: { next = beforeSample(p - stamp.dir.xyz * falloff); } // grab
    case 5u: { next = beforeSample(p - beforeGradient(lattice) * strength * falloff); } // inflate
    case 6u: { next = beforeSample(p + (p - a) * strength * falloff); } // pinch
    default: { // crease: pinch toward the stroke and cut a fine line
      let pulled = beforeSample(p + (p - a) * abs(strength) * falloff);
      let cut = length(p - a) - r * 0.18;
      next = -smin(-pulled, cut, r * 0.2);
    }
  }
  textureStore(field, texel, vec4f(clamp(next, -BAND, BAND)));
}
`;

const marchCommon = /* wgsl */ `
struct View {
  invViewProj: mat4x4f,
  eye: vec4f,
  brush: vec4f,      // xyz, radius; radius 0 hides the ring
  brushNormal: vec4f,
  size: vec2f,
  look: f32,         // shading look index
  band: f32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var field: texture_3d<f32>;
@group(0) @binding(2) var page: texture_3d<u32>;
@group(0) @binding(3) var coarse: texture_3d<u32>;
@group(0) @binding(4) var linear: sampler;

struct Hit { found: bool, p: vec3f, steps: u32 };

fn sampleEntry(entry: u32, cell: vec3i, g: vec3f) -> f32 {
  let local = (g - vec3f(cell)) * f32(VOXELS);
  let texel = vec3f(slotOrigin(entry - 2u)) + vec3f(1.5) + local;
  return textureSampleLevel(field, linear, texel / ATLAS, 0.0).r;
}

fn fieldAt(p: vec3f) -> f32 {
  let g = (p + vec3f(1.0)) / CELL;
  let cell = clamp(vec3i(floor(g)), vec3i(0), vec3i(GRID - 1));
  let entry = textureLoad(page, cell, 0).r;
  if (entry == 0u) { return BAND; }
  if (entry == 1u) { return -BAND; }
  return sampleEntry(entry, cell, g);
}

fn boxExit(o: vec3f, invD: vec3f, lo: vec3f, hi: vec3f) -> f32 {
  let t = max((lo - o) * invD, (hi - o) * invD);
  return min(min(t.x, t.y), t.z);
}

fn march(ro: vec3f, rd: vec3f) -> Hit {
  var hit: Hit;
  hit.found = false;
  let invD = 1.0 / select(rd, vec3f(1e-6), abs(rd) < vec3f(1e-6));
  let t0 = (vec3f(-1.0) - ro) * invD;
  let t1 = (vec3f(1.0) - ro) * invD;
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  var t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  let end = min(min(tmax.x, tmax.y), tmax.z);
  if (t >= end) { return hit; }
  t += 1e-4;
  var last = BAND;
  var lastT = t;
  for (var i = 0u; i < 192u; i++) {
    hit.steps = i;
    if (t >= end) { return hit; }
    let p = ro + rd * t;
    let g = (p + vec3f(1.0)) / CELL;
    let cell = clamp(vec3i(floor(g)), vec3i(0), vec3i(GRID - 1));
    let coarseCell = cell / COARSE;
    if (textureLoad(coarse, coarseCell, 0).r == 0u) {
      let lo = vec3f(coarseCell * COARSE) * CELL - vec3f(1.0);
      t += boxExit(p, invD, lo, lo + vec3f(f32(COARSE) * CELL)) + 1e-4;
      last = BAND;
      continue;
    }
    let entry = textureLoad(page, cell, 0).r;
    if (entry == 0u) {
      let lo = vec3f(cell) * CELL - vec3f(1.0);
      t += boxExit(p, invD, lo, lo + vec3f(CELL)) + 1e-4;
      last = BAND;
      continue;
    }
    if (entry == 1u) {
      hit.found = true;
      hit.p = p;
      return hit;
    }
    let d = sampleEntry(entry, cell, g);
    if (d < VOXEL * 0.05) {
      // Secant refine between the last positive sample and this one.
      var at = t;
      if (last > 0.0 && last < BAND && d < 0.0) { at = lastT + (t - lastT) * last / (last - d); }
      hit.found = true;
      hit.p = ro + rd * at;
      return hit;
    }
    last = d;
    lastT = t;
    t += max(d * 0.9, VOXEL * 0.4);
  }
  return hit;
}

fn normalAt(p: vec3f, curvature: ptr<function, f32>) -> vec3f {
  let e = VOXEL;
  let xp = fieldAt(p + vec3f(e, 0.0, 0.0)); let xn = fieldAt(p - vec3f(e, 0.0, 0.0));
  let yp = fieldAt(p + vec3f(0.0, e, 0.0)); let yn = fieldAt(p - vec3f(0.0, e, 0.0));
  let zp = fieldAt(p + vec3f(0.0, 0.0, e)); let zn = fieldAt(p - vec3f(0.0, 0.0, e));
  let c = fieldAt(p);
  *curvature = (xp + xn + yp + yn + zp + zn - 6.0 * c) / e;
  return normalize(vec3f(xp - xn, yp - yn, zp - zn) + vec3f(1e-7));
}
`;

export const viewShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
${marchCommon}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let x = f32((i << 1u) & 2u);
  let y = f32(i & 2u);
  return vec4f(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}

fn looks(n: vec3f, v: vec3f, cavity: f32, look: f32) -> vec3f {
  // A studio clay read: key, sky fill, rim, and curvature so forms show without any lighting setup.
  let key = normalize(vec3f(0.55, 0.75, 0.45));
  let h = normalize(key + v);
  let ndl = max(dot(n, key), 0.0);
  let sky = 0.5 + 0.5 * n.y;
  let rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  var base = vec3f(0.62, 0.60, 0.58);
  var gloss = 0.18;
  var power = 32.0;
  if (look == 1.0) { base = vec3f(0.56, 0.16, 0.13); gloss = 0.45; power = 48.0; } // wax
  if (look == 2.0) { base = vec3f(0.72, 0.45, 0.27); gloss = 0.08; power = 14.0; } // terracotta
  if (look == 3.0) { base = vec3f(0.86, 0.85, 0.86); gloss = 0.3; power = 90.0; }  // porcelain
  if (look == 4.0) { base = vec3f(0.42, 0.31, 0.18); gloss = 0.7; power = 60.0; }  // bronze
  var c = base * (0.2 + 0.72 * ndl + 0.3 * sky);
  c += vec3f(gloss) * pow(max(dot(n, h), 0.0), power);
  c += base * 0.35 * rim;
  c *= clamp(1.0 + cavity, 0.45, 1.25);
  return c;
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = frag.xy / view.size * 2.0 - vec2f(1.0);
  let far = view.invViewProj * vec4f(uv.x, -uv.y, 1.0, 1.0);
  let ro = view.eye.xyz;
  let rd = normalize(far.xyz / far.w - ro);
  let hit = march(ro, rd);
  if (!hit.found) {
    let g = 0.075 + 0.05 * (1.0 - length(uv) * 0.6);
    return vec4f(vec3f(g), 1.0);
  }
  var curvature = 0.0;
  let n = normalAt(hit.p, &curvature);
  var c = looks(n, -rd, clamp(-curvature * 0.9, -0.55, 0.25), view.look);
  if (view.brush.w > 0.0) {
    let d = length(hit.p - view.brush.xyz) / view.brush.w;
    let ring = smoothstep(0.03, 0.0, abs(d - 1.0));
    c = mix(c, vec3f(0.0, 0.85, 0.95), ring * 0.85);
    c += vec3f(0.0, 0.05, 0.06) * step(d, 1.0);
  }
  return vec4f(pow(c, vec3f(1.0 / 2.2)), 1.0);
}
`;

export const pickShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
${marchCommon}

struct Ray { origin: vec4f, dir: vec4f };
@group(1) @binding(0) var<uniform> ray: Ray;
@group(1) @binding(1) var<storage, read_write> result: array<vec4f, 2>;

@compute @workgroup_size(1)
fn main() {
  let hit = march(ray.origin.xyz, ray.dir.xyz);
  if (!hit.found) {
    result[0] = vec4f(0.0);
    return;
  }
  var curvature = 0.0;
  result[1] = vec4f(normalAt(hit.p, &curvature), 0.0);
  result[0] = vec4f(hit.p, 1.0);
}
`;

/** Min and max of every listed brick, used to give back bricks a stroke left entirely solid or empty. */
export const summaryShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
@group(0) @binding(0) var field: texture_3d<f32>;
@group(0) @binding(1) var<storage, read> slots: array<u32>;
@group(0) @binding(2) var<storage, read_write> out: array<vec2f>;

@compute @workgroup_size(16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&slots)) { return; }
  let o = slotOrigin(slots[i]);
  var lo = 1e9;
  var hi = -1e9;
  for (var z = 0; z < STRIDE; z++) { for (var y = 0; y < STRIDE; y++) { for (var x = 0; x < STRIDE; x++) {
    let v = textureLoad(field, o + vec3i(x, y, z), 0).r;
    lo = min(lo, v);
    hi = max(hi, v);
  } } }
  out[i] = vec2f(lo, hi);
}
`;

/** Evaluates a whole recipe of tapered capsules with true smooth blends into the listed bricks. */
export const bakeShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
struct Prim { a: vec4f, b: vec4f, op: f32, blend: f32, pad0: f32, pad1: f32, pad2: vec4f };
struct Brick { cell: vec3i, slot: u32 };
struct Bake { count: u32, prims: u32, pad0: u32, pad1: u32 };

@group(0) @binding(0) var<uniform> bake: Bake;
@group(0) @binding(1) var<storage, read> bricks: array<Brick>;
@group(0) @binding(2) var<storage, read> prims: array<Prim>;
@group(0) @binding(3) var field: texture_storage_3d<r32float, write>;

fn roundCone(p: vec3f, a: vec3f, b: vec3f, r1: f32, r2: f32) -> f32 {
  let ba = b - a;
  let l2 = dot(ba, ba);
  if (l2 < 1e-10) { return length(p - a) - max(r1, r2); }
  let rr = r1 - r2;
  let a2 = l2 - rr * rr;
  let il2 = 1.0 / l2;
  let pa = p - a;
  let y = dot(pa, ba);
  let z = y - l2;
  let v = pa * l2 - ba * y;
  let x2 = dot(v, v);
  let y2 = y * y * l2;
  let z2 = z * z * l2;
  let k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) { return sqrt(x2 + z2) * il2 - r2; }
  if (sign(y) * a2 * y2 < k) { return sqrt(x2 + y2) * il2 - r1; }
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0) { return min(a, b); }
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

@compute @workgroup_size(${BRICK_STRIDE}, ${BRICK_STRIDE}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x / u32(STRIDE);
  if (index >= bake.count) { return; }
  let brick = bricks[index];
  let local = vec3i(i32(id.x) % STRIDE, i32(id.y), i32(id.z));
  let p = vec3f(brick.cell * VOXELS + local - vec3i(1)) * VOXEL - vec3f(1.0);
  var d = 1e3;
  for (var i = 0u; i < bake.prims; i++) {
    let prim = prims[i];
    let c = roundCone(p, prim.a.xyz, prim.b.xyz, prim.a.w, prim.b.w);
    if (prim.op > 0.5) { d = -smin(-d, c, prim.blend); } else { d = smin(d, c, prim.blend); }
  }
  textureStore(field, slotOrigin(brick.slot) + local, vec4f(clamp(d, -BAND, BAND)));
}
`;

export const FILL_EMPTY = 0xffffffff;
export const FILL_SOLID = 0xfffffffe;

/** Copies or fills many bricks in one dispatch. One call per brick from JS costs far more than the GPU work. */
export const copyShader = (grid: number, slotsPerSide: number, band: number) => /* wgsl */ `
${fieldCommon(grid, slotsPerSide, band)}
@group(0) @binding(0) var fromTex: texture_3d<f32>;
@group(0) @binding(1) var toTex: texture_storage_3d<r32float, write>;
@group(0) @binding(2) var<storage, read> jobs: array<vec2u>;
@group(0) @binding(3) var<uniform> count: u32;

@compute @workgroup_size(${BRICK_STRIDE}, ${BRICK_STRIDE}, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x / u32(STRIDE);
  if (index >= count) { return; }
  let job = jobs[index];
  let local = vec3i(i32(id.x) % STRIDE, i32(id.y), i32(id.z));
  var value = BAND;
  if (job.x == 0xfffffffeu) { value = -BAND; }
  else if (job.x != 0xffffffffu) { value = textureLoad(fromTex, slotOrigin(job.x) + local, 0).r; }
  textureStore(toTex, slotOrigin(job.y) + local, vec4f(value));
}
`;
