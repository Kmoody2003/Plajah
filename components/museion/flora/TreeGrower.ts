// ═══════════════════════════════════════════════════════════════════════════
// TreeGrower — the Living Forest's procedural tree engine.
//
// WHY THIS EXISTS. The Canopy gallery wants hundreds of species, each one
// recognisable in silhouette, rotatable, and growable from seed. Shipping a GLB
// per species would cost hundreds of megabytes; growing them from parameters
// costs bytes. So a tree here is a small parameter set, not an asset.
//
// PURE BY DESIGN. This module imports nothing — no three.js, no React. It emits
// a skeleton (tapered segments + leaf placements) that the renderer turns into
// geometry. That keeps the growth maths unit-testable in node, which matters:
// 3D work is otherwise unverifiable without a compositing browser.
//
// DETERMINISTIC. Same params + same seed → byte-identical skeleton, every time.
// A species must not re-roll into a different tree on re-render, and tests need
// a fixed subject. Randomness comes only from the seeded PRNG below.
//
// GROWTH. Every segment records `bornAt` (0..1). Sampling at growth g reveals
// the trunk first and the twigs last, each easing in — so one skeleton animates
// seed → mature under a scrubber without regenerating.
// ═══════════════════════════════════════════════════════════════════════════

/** A tapered branch segment in local space (metres, +Y up, origin at the base). */
export interface Segment {
  x0: number; y0: number; z0: number;   // start
  x1: number; y1: number; z1: number;   // end
  r0: number; r1: number;               // radius at start / end
  depth: number;                        // 0 = trunk
  bornAt: number;                       // growth value at which it starts extending
}

/** A leaf/needle/frond placement at a twig tip. */
export interface Leaf {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;   // outward facing direction (normalised)
  scale: number;
  bornAt: number;
  tint: number;                         // 0..1 → per-leaf colour variance
}

export interface TreeSkeleton {
  segments: Segment[];
  leaves: Leaf[];
  height: number;                       // tallest point actually produced
  species: string;
}

/** What makes an oak an oak. Everything the grower needs, and nothing else. */
export interface TreeParams {
  species: string;
  trunkHeight: number;        // metres of the first segment
  trunkRadius: number;
  depth: number;              // recursion levels (trunk = 0)
  splits: [number, number];   // children per branch, min..max
  branchAngle: number;        // degrees off the parent axis
  angleJitter: number;        // degrees of random spread
  lengthFalloff: number;      // child length = parent * this
  radiusFalloff: number;      // child radius = parent * this
  gravitropism: number;       // + bends up (poplar), − bends down (willow)
  twist: number;              // degrees of roll between sibling branches
  leafSize: number;
  leafDensity: number;        // leaves per terminal twig
  leafShape: 'broad' | 'needle' | 'palmate' | 'scale' | 'frond';
  barkColor: string;
  leafColor: string;
  /** Autumn target — the seasonal shader ramps toward this. */
  autumnColor?: string;
  /** Fraction of the crown that is bare trunk (a palm is nearly all trunk). */
  bareTrunk?: number;
}

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;

/** Rotate v around an arbitrary unit axis (Rodrigues). */
function rotAxis(v: [number, number, number], axis: [number, number, number], ang: number): [number, number, number] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const [x, y, z] = v, [ux, uy, uz] = axis;
  const dot = ux * x + uy * y + uz * z;
  return [
    x * c + (uy * z - uz * y) * s + ux * dot * (1 - c),
    y * c + (uz * x - ux * z) * s + uy * dot * (1 - c),
    z * c + (ux * y - uy * x) * s + uz * dot * (1 - c),
  ];
}

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Any unit vector perpendicular to d (stable — avoids the parallel-axis degeneracy). */
function perp(d: [number, number, number]): [number, number, number] {
  const ref: [number, number, number] = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm([
    d[1] * ref[2] - d[2] * ref[1],
    d[2] * ref[0] - d[0] * ref[2],
    d[0] * ref[1] - d[1] * ref[0],
  ]);
}

/**
 * Grow the full skeleton. `seed` selects one individual of the species — same
 * seed always yields the same tree, different seeds populate a varied forest.
 */
export function growTree(params: TreeParams, seed = 1): TreeSkeleton {
  const rand = rng(seed);
  const segments: Segment[] = [];
  const leaves: Leaf[] = [];
  const maxDepth = Math.max(0, Math.round(params.depth));
  let height = 0;

  const grow = (
    origin: [number, number, number],
    dir: [number, number, number],
    length: number,
    radius: number,
    depth: number,
  ) => {
    const end: [number, number, number] = [
      origin[0] + dir[0] * length,
      origin[1] + dir[1] * length,
      origin[2] + dir[2] * length,
    ];
    // The trunk is fully grown by 40%; each further level takes an even share of
    // the rest, so a sapling reads as a small tree rather than a scaled model.
    const bornAt = depth === 0 ? 0 : 0.4 * (depth / Math.max(1, maxDepth)) + 0.2 * ((depth - 1) / Math.max(1, maxDepth));
    const childR = radius * params.radiusFalloff;

    segments.push({
      x0: origin[0], y0: origin[1], z0: origin[2],
      x1: end[0], y1: end[1], z1: end[2],
      r0: radius, r1: childR,
      depth, bornAt: Math.min(0.92, bornAt),
    });
    if (end[1] > height) height = end[1];

    if (depth >= maxDepth) {
      // Terminal twig — hang leaves off the tip.
      const n = Math.max(0, Math.round(params.leafDensity));
      for (let i = 0; i < n; i++) {
        const spread = params.leafSize * 0.9;
        const off = perp(dir);
        const roll = rand() * Math.PI * 2;
        const o = rotAxis(off, dir, roll);
        const t = 0.55 + rand() * 0.45;              // cluster toward the tip
        leaves.push({
          x: origin[0] + dir[0] * length * t + o[0] * spread * (rand() - 0.5),
          y: origin[1] + dir[1] * length * t + o[1] * spread * (rand() - 0.5),
          z: origin[2] + dir[2] * length * t + o[2] * spread * (rand() - 0.5),
          dx: o[0], dy: o[1], dz: o[2],
          scale: params.leafSize * (0.75 + rand() * 0.5),
          bornAt: Math.min(0.96, bornAt + 0.06),
          tint: rand(),
        });
      }
      return;
    }

    const [smin, smax] = params.splits;
    const count = Math.max(1, Math.round(smin + rand() * (smax - smin)));
    const axis = perp(dir);
    for (let i = 0; i < count; i++) {
      // Fan the children around the parent, then tilt them off its axis.
      const roll = (i / count) * Math.PI * 2 + params.twist * DEG * depth + rand() * 0.35;
      const spin = rotAxis(axis, dir, roll);
      const ang = (params.branchAngle + (rand() - 0.5) * params.angleJitter) * DEG;
      let child = norm(rotAxis(dir, spin, ang));
      // Gravitropism bends the tip up (poplar) or down (willow) after the split.
      child = norm([child[0], child[1] + params.gravitropism * 0.35, child[2]]);
      grow(end, child, length * params.lengthFalloff * (0.85 + rand() * 0.3), childR, depth + 1);
    }
  };

  const start: [number, number, number] = [0, 0, 0];
  const up: [number, number, number] = norm([
    (rand() - 0.5) * 0.06, 1, (rand() - 0.5) * 0.06,   // a hair off-vertical: nothing in a forest is plumb
  ]);
  grow(start, up, params.trunkHeight, params.trunkRadius, 0);
  return { segments, leaves, height, species: params.species };
}

/**
 * A skeleton sampled at growth g (0 = seed, 1 = mature). Segments not yet born
 * are dropped; the ones in progress are foreshortened and thinned, so growth
 * reads as extension rather than a uniform scale-up.
 */
export function skeletonAtGrowth(sk: TreeSkeleton, g: number): TreeSkeleton {
  const t = g < 0 ? 0 : g > 1 ? 1 : g;
  const GROW_SPAN = 0.26;                 // how long one level takes to extend
  const segments: Segment[] = [];
  let height = 0;

  for (const s of sk.segments) {
    const f = (t - s.bornAt) / GROW_SPAN;
    if (f <= 0) continue;
    const e = f >= 1 ? 1 : f * f * (3 - 2 * f);        // smoothstep
    const x1 = s.x0 + (s.x1 - s.x0) * e;
    const y1 = s.y0 + (s.y1 - s.y0) * e;
    const z1 = s.z0 + (s.z1 - s.z0) * e;
    segments.push({
      ...s,
      x1, y1, z1,
      r0: s.r0 * (0.35 + 0.65 * e),
      r1: s.r1 * (0.35 + 0.65 * e),
    });
    if (y1 > height) height = y1;
  }

  const leaves = sk.leaves
    .filter((l) => t > l.bornAt)
    .map((l) => {
      const f = (t - l.bornAt) / GROW_SPAN;
      const e = f >= 1 ? 1 : f * f * (3 - 2 * f);
      return { ...l, scale: l.scale * e };
    });

  return { segments, leaves, height, species: sk.species };
}

/** Vertex/triangle cost of a skeleton — the renderer budgets instances with this. */
export function skeletonCost(sk: TreeSkeleton, radialSegments = 5): { vertices: number; leaves: number } {
  return { vertices: sk.segments.length * radialSegments * 2, leaves: sk.leaves.length };
}

// ── the archetypes ──────────────────────────────────────────────────────────
// Phase I ships five silhouettes that read as different trees across the hall.
// Adding a species is a parameter block, not an asset.

export const TREE_SPECIES: Record<string, TreeParams> = {
  oak: {
    species: 'oak',
    trunkHeight: 3.2, trunkRadius: 0.42, depth: 5,
    splits: [2, 3], branchAngle: 38, angleJitter: 26,
    lengthFalloff: 0.74, radiusFalloff: 0.66,
    gravitropism: 0.05, twist: 34,
    leafSize: 0.34, leafDensity: 5, leafShape: 'broad',
    barkColor: '#4a3b2a', leafColor: '#3f7d3a', autumnColor: '#b3541e',
  },
  birch: {
    species: 'birch',
    trunkHeight: 4.6, trunkRadius: 0.2, depth: 5,
    splits: [2, 2], branchAngle: 26, angleJitter: 18,
    lengthFalloff: 0.78, radiusFalloff: 0.7,
    gravitropism: -0.12, twist: 46,          // slender, weeping tips
    leafSize: 0.22, leafDensity: 6, leafShape: 'broad',
    barkColor: '#d8d2c4', leafColor: '#7ab648', autumnColor: '#e0b62c',
  },
  pine: {
    species: 'pine',
    trunkHeight: 6.0, trunkRadius: 0.34, depth: 4,
    splits: [4, 5], branchAngle: 68, angleJitter: 12,
    lengthFalloff: 0.62, radiusFalloff: 0.58,
    gravitropism: -0.06, twist: 72,          // whorled, near-horizontal tiers
    leafSize: 0.3, leafDensity: 8, leafShape: 'needle',
    barkColor: '#5a3f2b', leafColor: '#2f5d3f',
  },
  willow: {
    species: 'willow',
    trunkHeight: 3.0, trunkRadius: 0.36, depth: 5,
    splits: [2, 3], branchAngle: 30, angleJitter: 22,
    lengthFalloff: 0.8, radiusFalloff: 0.62,
    gravitropism: -0.55, twist: 28,          // the signature fall
    leafSize: 0.26, leafDensity: 7, leafShape: 'broad',
    barkColor: '#5c4a33', leafColor: '#6f9c4a', autumnColor: '#c9b84c',
  },
  baobab: {
    species: 'baobab',
    trunkHeight: 4.0, trunkRadius: 1.15, depth: 3,
    splits: [3, 4], branchAngle: 44, angleJitter: 30,
    lengthFalloff: 0.52, radiusFalloff: 0.42,
    gravitropism: 0.22, twist: 40,           // fat bottle trunk, stubby crown
    leafSize: 0.2, leafDensity: 3, leafShape: 'palmate',
    barkColor: '#8b7a63', leafColor: '#5b8f46',
    bareTrunk: 0.7,
  },
};

/** Species ids in gallery order. */
export const TREE_SPECIES_IDS = Object.keys(TREE_SPECIES);
