// playkit/world/architecturalForms.ts
//
// Renderer-Agnostic Plajah Architectural, Marine & Botanical Geometry Builders.
// 100% Pure TypeScript (zero `three` or `three/webgpu` imports — returns `IndexedTriMesh`),
// so WebGL games (Plajah Motorsport: Apex / `games/forth-horizon`), WebGPU games
// (Vesselbound / Era Clash / Ravencrest / Kith / Firstlight), Game Studio, and 3rd-party
// creator projects ALL run the exact same NURBS, Catmull-Clark SubD, CAD/BIM, and
// Space-Colonization Vegetation kernels!

import {
  loftNurbsSurface,
  revolveNurbsSurface,
  tessellateNurbsSurface,
  type NurbsPoint,
} from '../../services/cad/nurbs';
import {
  polyMeshToIndexedTriMesh,
  subdivideCatmullClark,
  type CreaseMap,
} from '../../services/argilla/poly/subd';
import { edgeKey, type PolyMesh, type V3 } from '../../services/argilla/poly/polyMesh';
import type { IndexedTriMesh } from '../../services/gamestudio/compiler/schema';
import { computeSmoothNormals } from '../../services/gamestudio/compiler/retopoLod';
import { compileBuildingWithInteriors } from '../../services/gamestudio/pipelines/architecturePipeline';
import {
  VEGETATION_SPECIES_CATALOG,
  applyCrownNormalTransfer,
  growTree,
} from '../../services/gamestudio/pipelines/vegetationPipeline';

// ── 1. NURBS Architectural & Marine Forms (Opera Sails, Tensile Canopies, Yacht Hulls, Cupolas) ──

/**
 * Build a sweeping double-curved ribbed NURBS sail shell (Sydney Opera / civic pavilion style).
 * Local origin at base center `(0, 0, 0)`, soaring upward to `heightM` and opening toward `+Z`.
 */
export function buildNurbsSailShellMesh(opts: {
  widthM: number;
  heightM: number;
  depthM: number;
  segsU?: number;
  segsV?: number;
}): IndexedTriMesh {
  const hw = Math.max(2, opts.widthM) * 0.5;
  const H = Math.max(3, opts.heightM);
  const D = Math.max(2, opts.depthM);

  // 4 ribs sweeping from rear anchor (-Z) up into a pointed cantilevered prow (+Z)
  const profiles: NurbsPoint[][] = [
    // Base rear spine foot
    [
      [-hw * 0.55, 0, -D * 0.45, 1],
      [-hw * 0.35, H * 0.14, -D * 0.48, 1.1],
      [0, H * 0.22, -D * 0.5, 1.25],
      [hw * 0.35, H * 0.14, -D * 0.48, 1.1],
      [hw * 0.55, 0, -D * 0.45, 1],
    ],
    // Mid-belly vault swell
    [
      [-hw * 0.96, 0, -D * 0.08, 1],
      [-hw * 0.68, H * 0.54, -D * 0.05, 1.2],
      [0, H * 0.72, -D * 0.02, 1.35],
      [hw * 0.68, H * 0.54, -D * 0.05, 1.2],
      [hw * 0.96, 0, -D * 0.08, 1],
    ],
    // Dramatic forward soaring crown
    [
      [-hw * 0.92, 0, D * 0.28, 1],
      [-hw * 0.56, H * 0.78, D * 0.34, 1.25],
      [0, H * 1.0, D * 0.42, 1.45],
      [hw * 0.56, H * 0.78, D * 0.34, 1.25],
      [hw * 0.92, 0, D * 0.28, 1],
    ],
    // Cantilevered sculptural prow lip
    [
      [-hw * 0.65, H * 0.06, D * 0.48, 1],
      [-hw * 0.32, H * 0.68, D * 0.56, 1.15],
      [0, H * 0.94, D * 0.66, 1.35],
      [hw * 0.32, H * 0.68, D * 0.56, 1.15],
      [hw * 0.65, H * 0.06, D * 0.48, 1],
    ],
  ];

  const surf = loftNurbsSurface(profiles, 3, 2);
  return tessellateNurbsSurface(surf, {
    segsU: opts.segsU ?? 10,
    segsV: opts.segsV ?? 12,
    adaptiveTolerance: 0.08,
  });
}

/**
 * Build a double-curved hyperbolic-paraboloid tensile stage canopy via NURBS lofting.
 * Local origin at roof deck center `(0, 0, 0)`, spanning `widthM` (X) by `depthM` (Z).
 */
export function buildNurbsTensileCanopyMesh(opts: {
  widthM: number;
  depthM: number;
  archRiseM: number;
  segsU?: number;
  segsV?: number;
}): IndexedTriMesh {
  const hw = Math.max(4, opts.widthM) * 0.5;
  const hd = Math.max(4, opts.depthM) * 0.5;
  const rise = Math.max(1.5, opts.archRiseM);

  const profiles: NurbsPoint[][] = [
    // Rear stage edge (lower anchor with gentle central crown)
    [
      [-hw, 0, -hd, 1],
      [-hw * 0.48, rise * 0.48, -hd, 1.15],
      [0, rise * 0.68, -hd, 1.2],
      [hw * 0.48, rise * 0.48, -hd, 1.15],
      [hw, 0, -hd, 1],
    ],
    // Mid-stage hyperbolic saddle (dips slightly at center, lifts at wings)
    [
      [-hw * 1.06, rise * 0.25, 0, 1],
      [-hw * 0.5, rise * 0.84, 0, 1.2],
      [0, rise * 0.92, 0, 1.25],
      [hw * 0.5, rise * 0.84, 0, 1.2],
      [hw * 1.06, rise * 0.25, 0, 1],
    ],
    // Front crowd-facing cantilever brow (soars high to frame the stage!)
    [
      [-hw * 1.12, rise * 0.35, hd * 1.12, 1],
      [-hw * 0.52, rise * 1.08, hd * 1.18, 1.25],
      [0, rise * 1.32, hd * 1.25, 1.35],
      [hw * 0.52, rise * 1.08, hd * 1.18, 1.25],
      [hw * 1.12, rise * 0.35, hd * 1.12, 1],
    ],
  ];

  const surf = loftNurbsSurface(profiles, 2, 2);
  return tessellateNurbsSurface(surf, {
    segsU: opts.segsU ?? 8,
    segsV: opts.segsV ?? 12,
    adaptiveTolerance: 0.06,
  });
}

/**
 * Build a smooth flared double-curved superyacht hull via NURBS lofting along +Z (bow at +len/2).
 */
export function buildNurbsYachtHullMesh(opts: {
  lengthM: number;
  beamM?: number;
  freeboardM?: number;
}): IndexedTriMesh {
  const L = Math.max(12, opts.lengthM);
  const B = opts.beamM ?? L * 0.21;
  const H = opts.freeboardM ?? L * 0.085;
  const hb = B * 0.5;
  const hl = L * 0.5;

  // 5 naval stations from stern transom (-hl) to flared raked bow (+hl)
  const stations: Array<{ z: number; beam: number; chineY: number; sheerY: number; keelY: number }> = [
    { z: -hl, beam: hb * 0.86, chineY: H * 0.12, sheerY: H * 0.78, keelY: -H * 0.28 },
    { z: -hl * 0.35, beam: hb * 1.0, chineY: H * 0.06, sheerY: H * 0.86, keelY: -H * 0.36 },
    { z: hl * 0.25, beam: hb * 0.92, chineY: H * 0.14, sheerY: H * 0.96, keelY: -H * 0.34 },
    { z: hl * 0.72, beam: hb * 0.44, chineY: H * 0.32, sheerY: H * 1.14, keelY: -H * 0.18 },
    { z: hl, beam: 0.08, chineY: H * 0.72, sheerY: H * 1.28, keelY: H * 0.24 },
  ];

  const profiles: NurbsPoint[][] = stations.map((s) => [
    [-s.beam, s.sheerY, s.z, 1],
    [-s.beam * 0.82, s.chineY, s.z, 1.15],
    [0, s.keelY, s.z, 1.3],
    [s.beam * 0.82, s.chineY, s.z, 1.15],
    [s.beam, s.sheerY, s.z, 1],
  ]);

  const surf = loftNurbsSurface(profiles, 3, 2);
  return tessellateNurbsSurface(surf, { segsU: 10, segsV: 8, adaptiveTolerance: 0.06 });
}

/**
 * Build a revolved, gracefully ogival NURBS conservatory cupola / civic dome.
 */
export function buildNurbsCupolaDomeMesh(opts: {
  radiusM: number;
  heightM: number;
  segments?: number;
}): IndexedTriMesh {
  const R = Math.max(2, opts.radiusM);
  const H = Math.max(2, opts.heightM);
  const segs = Math.max(8, opts.segments ?? 16);

  const profile: NurbsPoint[] = [
    [R, 0, 0, 1],
    [R * 0.98, H * 0.34, 0, 1.15],
    [R * 0.74, H * 0.68, 0, 1.2],
    [R * 0.34, H * 0.92, 0, 1.15],
    [R * 0.14, H * 0.98, 0, 1.1],
    [R * 0.14, H * 1.12, 0, 1.0],
    [0.04, H * 1.24, 0, 1.0],
  ];
  const surf = revolveNurbsSurface(profile, segs, Math.PI * 2);
  return tessellateNurbsSurface(surf, { segsU: segs, segsV: 10, adaptiveTolerance: 0.06 });
}

// ── 2. Catmull-Clark SubD Classical Column Capitals & Sculpted Civic Moldings ────────────────────

/**
 * Build a Catmull-Clark SubD classical column capital with semi-sharp abacus & flaring echinus.
 */
export function buildSubdClassicalCapitalMesh(opts: {
  radiusM: number;
  heightM: number;
  levels?: number;
}): IndexedTriMesh {
  const r = Math.max(0.25, opts.radiusM);
  const h = Math.max(0.3, opts.heightM);
  const b = r * 0.95;
  const t = r * 1.48;
  const verts: V3[] = [
    [-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b],
    [-t, h, -t], [t, h, -t], [t, h, t], [-t, h, t],
  ];
  const faces: number[][] = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const creases: CreaseMap = new Map();
  for (let i = 0; i < 4; i++) {
    creases.set(edgeKey(i, (i + 1) % 4), 1.8);
    creases.set(edgeKey(4 + i, 4 + ((i + 1) % 4)), 1.6);
    creases.set(edgeKey(i, 4 + i), 0.55);
  }
  const subd = subdivideCatmullClark({ verts, faces }, opts.levels ?? 2, creases);
  return polyMeshToIndexedTriMesh(subd.mesh);
}

// ── 3. Renderer-Agnostic CAD/BIM Building-With-Interiors Compiler (Grand Civic / Showroom) ───────

export interface BimCivicShellMeshes {
  walls: IndexedTriMesh[];
  slabs: IndexedTriMesh[];
  windows: IndexedTriMesh[];
  doors: IndexedTriMesh[];
  roomCount: number;
  walkabilityPass: boolean;
}

/**
 * Compile a multi-story CAD/BIM civic hall with real interior room partitions, recessed window
 * openings, and walkable doorways via Plajah's `compileBuildingWithInteriors()` (`bimTo3D()`).
 * Output meshes are centered horizontally around `(0, 0, 0)` with base at `y = 0`, in game Y-up coords.
 */
export function buildBimCivicInteriorShell(opts: {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  stories: number;
  storyHeightM: number;
}): BimCivicShellMeshes {
  const W = Math.max(8, opts.widthM);
  const D = Math.max(8, opts.depthM);
  const pkg = compileBuildingWithInteriors({
    id: opts.id,
    name: opts.name,
    program: 'stadium-suite',
    style: 'modern-arena',
    footprintWidthM: W,
    footprintDepthM: D,
    stories: Math.max(1, Math.min(4, opts.stories)),
    storyHeightM: opts.storyHeightM,
    wallThicknessM: 0.45,
  });

  const elemById = new Map(pkg.bim3d.elements.map((e) => [e.id, e]));
  const walls: IndexedTriMesh[] = [];
  const slabs: IndexedTriMesh[] = [];
  const windows: IndexedTriMesh[] = [];
  const doors: IndexedTriMesh[] = [];

  for (const m of pkg.bim3d.meshes) {
    const el = m.elementId ? elemById.get(m.elementId) : undefined;
    const cls = el?.cls ?? m.layer ?? 'IfcWall';
    const vc = m.positions.length / 3;
    const pos = new Float32Array(m.positions.length);
    const uvs = new Float32Array(vc * 2);
    for (let i = 0; i < vc; i++) {
      const x = m.positions[i * 3] - W * 0.5;
      const y = m.positions[i * 3 + 2];
      const z = -(m.positions[i * 3 + 1] - D * 0.5);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      uvs[i * 2] = (x + z) * 0.25;
      uvs[i * 2 + 1] = y * 0.25;
    }
    const tri: IndexedTriMesh = {
      positions: pos,
      uvs,
      indices: new Uint32Array(m.indices),
    };
    tri.normals = computeSmoothNormals(tri);

    if (cls === 'IfcWindow') windows.push(tri);
    else if (cls === 'IfcDoor') doors.push(tri);
    else if (cls === 'IfcSlab') slabs.push(tri);
    else walls.push(tri);
  }

  return {
    walls,
    slabs,
    windows,
    doors,
    roomCount: pkg.rooms.length,
    walkabilityPass: pkg.walkabilityPass,
  };
}

// ── 4. Renderer-Agnostic Grown Botanical Tree Variant Meshes (for Apex WebGL & Creator Worlds) ──

export interface GrownTreeVariantMeshes {
  speciesId: string;
  conifer: boolean;
  barkType: 'pine' | 'oak' | 'birch';
  leafType: 'pine' | 'oak' | 'ash' | 'aspen';
  /** Normalized unit-height (0..1) wood/branch skeleton geometry. */
  bark: IndexedTriMesh;
  /** Normalized unit-height (0..1) crown-normal-transferred foliage cards. */
  leaves: IndexedTriMesh;
  /** Width-to-height ratio of the grown crown. */
  widthRatio: number;
}

/**
 * Grow a real botanical tree using Plajah's Space-Colonization + Leonardo Pipe-Model grower
 * (`services/vegetation/trees/grow.ts`) and emit normalized unit-height `bark` and `leaves`
 * `IndexedTriMesh` buffers with 3D crown normal transfer — works identically in WebGL (Apex
 * `EzTreeField`) and WebGPU games!
 */
export function buildPlaykitGrownTreeVariantMeshes(
  speciesId: string,
  seed: number,
  maxLeafCards = 260,
): GrownTreeVariantMeshes | null {
  const entry = VEGETATION_SPECIES_CATALOG[speciesId];
  if (!entry) return null;

  const sp = entry.species;
  const sk = growTree(sp, seed);
  const H = Math.max(1, sk.height);

  // 1) Build tapered wood tubes from real pipe-model skeleton segments
  const bPos: number[] = [];
  const bUv: number[] = [];
  const bIdx: number[] = [];
  let maxHoriz = 0.25;

  for (let i = 1; i < sk.nodes.length; i++) {
    const n = sk.nodes[i];
    const p = sk.nodes[n.parent];
    const dx = n.x - p.x, dy = n.y - p.y, dz = n.z - p.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) continue;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const segs = n.order === 0 ? 7 : n.order === 1 ? 5 : 3;

    const ax = Math.abs(uy) > 0.9 ? 1 : 0, ay = Math.abs(uy) > 0.9 ? 0 : 1, az = 0;
    let sx = ay * uz - az * uy, sy = az * ux - ax * uz, sz = ax * uy - ay * ux;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const tx = uy * sz - uz * sy, ty = uz * sx - ux * sz, tz = ux * sy - uy * sx;

    const base = bPos.length / 3;
    const r0 = Math.max(0.015, p.radius);
    const r1 = Math.max(0.01, n.radius);
    for (let ring = 0; ring < 2; ring++) {
      const cx = ring ? n.x : p.x, cy = ring ? n.y : p.y, cz = ring ? n.z : p.z;
      const r = ring ? r1 : r0;
      for (let k = 0; k < segs; k++) {
        const ang = (k / segs) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const vx = (cx + (sx * ca + tx * sa) * r) / H;
        const vy = Math.max(0, (cy + (sy * ca + ty * sa) * r) / H);
        const vz = (cz + (sz * ca + tz * sa) * r) / H;
        maxHoriz = Math.max(maxHoriz, Math.hypot(vx, vz));
        bPos.push(vx, vy, vz);
        bUv.push((k / segs) * 2, vy * H * 0.4);
      }
    }
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const a = base + k, b = base + k2, c = base + segs + k, d = base + segs + k2;
      bIdx.push(a, c, b, b, c, d);
    }
  }

  const bark: IndexedTriMesh = {
    positions: new Float32Array(bPos),
    uvs: new Float32Array(bUv),
    indices: new Uint32Array(bIdx),
  };
  bark.normals = computeSmoothNormals(bark);

  // 2) Build oriented crossed foliage clusters from grown `sk.leaves` with spherical crown normal transfer
  const lPos: number[] = [];
  const lUv: number[] = [];
  const lIdx: number[] = [];
  const step = Math.max(1, Math.floor(sk.leaves.length / maxLeafCards));

  for (let i = 0; i < sk.leaves.length; i += step) {
    const lf = sk.leaves[i];
    const half = (lf.size * 0.65) / H;
    const cx = lf.x / H, cy = lf.y / H, cz = lf.z / H;
    maxHoriz = Math.max(maxHoriz, Math.hypot(cx, cz) + half);

    // Emit two crossed quads per cluster so canopies look volumetric from every camera angle
    for (let q = 0; q < 2; q++) {
      const ang = lf.roll + q * (Math.PI * 0.5);
      const ca = Math.cos(ang) * half, sa = Math.sin(ang) * half;
      const bV = lPos.length / 3;
      lPos.push(
        cx - ca, cy - half, cz - sa,
        cx + ca, cy - half, cz + sa,
        cx + ca, cy + half, cz + sa,
        cx - ca, cy + half, cz - sa,
      );
      lUv.push(0, 0, 1, 0, 1, 1, 0, 1);
      lIdx.push(bV, bV + 1, bV + 2, bV, bV + 2, bV + 3);
    }
  }

  const leaves: IndexedTriMesh = {
    positions: new Float32Array(lPos),
    uvs: new Float32Array(lUv),
    indices: new Uint32Array(lIdx),
  };
  leaves.normals = computeSmoothNormals(leaves);
  applyCrownNormalTransfer(leaves, [0, 0.68, 0], 0, entry.normalBlend);

  const conifer = /spruce|pine|redwood|cypress|cedar/i.test(sp.id + ' ' + sp.name);
  const barkType: 'pine' | 'oak' | 'birch' =
    conifer ? 'pine' : /birch|aspen/i.test(sp.id + ' ' + sp.name) ? 'birch' : 'oak';
  const leafType: 'pine' | 'oak' | 'ash' | 'aspen' =
    conifer ? 'pine' : /birch|aspen|maple/i.test(sp.id + ' ' + sp.name) ? 'aspen' : 'oak';

  return {
    speciesId: sp.id,
    conifer,
    barkType,
    leafType,
    bark,
    leaves,
    widthRatio: Math.min(1.4, maxHoriz * 2),
  };
}
