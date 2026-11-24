// playkit/world/canopyArchitecture.ts
//
// Universal Plajah Canopy, Sculpted Stone & Walk-In CAD/BIM Architecture Kit.
// Built on the FULL Plajah geometry stack so 1st-party games (Vesselbound/Rift Realm,
// Era Clash 3D, Ravencrest, Kith, Firstlight) AND 3rd-party creator worlds share the exact
// same high-craft procedural & architectural primitives — zero `isFirstParty` branches:
//
//   1. NURBS Loft / Revolve (`services/cad/nurbs.ts`)
//      - Swept living canopy support boughs flaring from giant trunks beneath elevated decks
//      - Curved timber knee-braces & under-deck radial truss ribs
//      - True curved gothic & round stone arch vaults (replacing crooked box-block arches)
//      - Revolved ornate hanging lantern cages with finial caps & iron bands
//
//   2. Catmull-Clark SubD + Semi-Sharp Edge Creases (`services/argilla/poly/subd.ts`)
//      - Sculpted organic trunk collars clasping where elevated decks meet living trees
//      - Chamfered, beveled carved-stone crenel merlons (replacing raw box merlons)
//      - Sculpted stone corbels & molded pillar capitals
//
//   3. Walk-In CAD/BIM Buildings (`services/gamestudio/pipelines/architecturePipeline.ts` + `bimTo3D`)
//      - Real enterable treehouses, canopy outposts & watch shelters with code-checked walkable
//        doorways (>= 1.15 m x 2.25 m), recessed mullioned windows, interior floor slabs,
//        timber corner pilasters, overhanging pitched eaves with NURBS knee-braces, ridge beams,
//        and baked SH9 interior bounce probe anchors.
//
// All base geometries are deterministically cached by parameter signature so placing 20+ canopy
// platforms and treehouses takes milliseconds and batches into the caller's existing StaticKit
// draw calls with zero extra shader compilations.

import * as THREE from 'three/webgpu';
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
import { emptyModel, type CadModel, type WallOpening } from '../../services/cad/model';
import { bimTo3D } from '../../services/cad/bim3d';
import type { IndexedTriMesh } from '../../services/gamestudio/compiler/schema';
import type { Vec3 } from '../physics/runtime';

// ── Shared Geometry Conversion & Caching Helpers ────────────────────────────────────────────────

const baseGeoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = baseGeoCache.get(key);
  if (!g) {
    g = build();
    baseGeoCache.set(key, g);
  }
  return g.clone();
}

export function clearCanopyArchitectureCache(): void {
  for (const g of baseGeoCache.values()) g.dispose();
  baseGeoCache.clear();
  bimHutCache.clear();
  bimTowerCache.clear();
}

/** Convert an IndexedTriMesh (from NURBS or SubD) to a Three.js BufferGeometry with pos/normal/uv. */
export function triMeshToThreeGeo(mesh: IndexedTriMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  if (mesh.normals && mesh.normals.length === mesh.positions.length) {
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
  }
  if (mesh.uvs && mesh.uvs.length > 0) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(mesh.uvs), 2));
  } else {
    const vc = mesh.positions.length / 3;
    const uvs = new Float32Array(vc * 2);
    for (let i = 0; i < vc; i++) {
      uvs[i * 2] = mesh.positions[i * 3] * 0.5;
      uvs[i * 2 + 1] = mesh.positions[i * 3 + 1] * 0.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  if (!mesh.normals) g.computeVertexNormals();
  return g;
}

/** Build a closed radial ring of NURBS control points around a point `c` along frame `(right, up)`. */
function nurbsRing(
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number,
  ux: number, uy: number, uz: number,
  radX: number, radY: number,
  sides: number,
  fluteAmp = 0,
  fluteFreq = 5,
  phase = 0,
): NurbsPoint[] {
  const pts: NurbsPoint[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const flute = 1 + fluteAmp * Math.sin(a * fluteFreq + phase);
    const ca = Math.cos(a) * radX * flute;
    const sa = Math.sin(a) * radY * flute;
    pts.push([
      cx + rx * ca + ux * sa,
      cy + ry * ca + uy * sa,
      cz + rz * ca + uz * sa,
      1.0,
    ]);
  }
  return pts;
}

/** Helper to transform a cloned BufferGeometry into world space (rotate Y then translate). */
function placeWorld(
  geo: THREE.BufferGeometry,
  x: number, y: number, z: number,
  yaw = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(sx, sy, sz),
  );
  geo.applyMatrix4(m);
  return geo;
}

// ── 1. NURBS Canopy Support Structures (Living Boughs, Timber Knee-Braces, Gothic Arches, Lanterns) ──

export interface NurbsSupportBoughOpts {
  /** Radial reach from trunk center to outer deck underside (m). */
  reachM: number;
  /** Vertical drop from deck underside down to trunk junction (m). */
  dropM: number;
  /** Starting radius where bough erupts from the trunk (m). */
  baseRadiusM?: number;
  /** Tip radius where bough cradles the outer rim beam (m). */
  tipRadiusM?: number;
  /** Optional subtle organic lateral sweep (m) so neighboring boughs feel alive. */
  swayM?: number;
  /** Low-detail mode for mobile/iGPU tiers. */
  lowTier?: boolean;
}

/**
 * Build a swept, fluted NURBS living support bough (local origin at trunk attach point,
 * extending outward along +Z to `reachM` and upward along +Y to `dropM`).
 * Replaces straight `LineCurve3` stick struts under canopy decks with dramatic curving tree limbs.
 */
export function buildNurbsSupportBough(opts: NurbsSupportBoughOpts): THREE.BufferGeometry {
  const reach = Math.max(1.8, opts.reachM);
  const drop = Math.max(1.5, opts.dropM);
  const r0 = opts.baseRadiusM ?? Math.max(0.32, Math.min(1.1, reach * 0.085));
  const r1 = opts.tipRadiusM ?? r0 * 0.42;
  const sway = opts.swayM ?? 0;
  const lo = Boolean(opts.lowTier);
  const key = `bough:${reach.toFixed(1)}:${drop.toFixed(1)}:${r0.toFixed(2)}:${r1.toFixed(2)}:${sway.toFixed(2)}:${lo ? 1 : 0}`;

  return cachedGeo(key, () => {
    // 5 cross-section stations along an S-curved organic cantilever bough:
    // rises steeply out of the trunk shoulder, sweeps gracefully beneath the deck joists,
    // and cradles the rim beam with an upward knuckle.
    const stations: Array<{
      p: [number, number, number];
      t: [number, number, number];
      radW: number;
      radH: number;
      flute: number;
    }> = [
      { p: [0, 0, 0], t: [0, 0.85, 0.52], radW: r0 * 1.18, radH: r0 * 1.38, flute: 0.14 },
      { p: [sway * 0.35, drop * 0.42, reach * 0.24], t: [0, 0.72, 0.69], radW: r0 * 0.92, radH: r0 * 1.05, flute: 0.11 },
      { p: [sway * 0.85, drop * 0.76, reach * 0.54], t: [0, 0.46, 0.89], radW: r0 * 0.72, radH: r0 * 0.78, flute: 0.09 },
      { p: [sway * 0.55, drop * 0.94, reach * 0.82], t: [0, 0.22, 0.97], radW: r1 * 1.25, radH: r1 * 1.3, flute: 0.07 },
      { p: [0, drop, reach], t: [0, 0.08, 1.0], radW: r1, radH: r1 * 0.9, flute: 0.04 },
    ];

    const sides = lo ? 6 : 9;
    const profiles: NurbsPoint[][] = stations.map((st, idx) => {
      const len = Math.hypot(st.t[0], st.t[1], st.t[2]) || 1;
      const ty = st.t[1] / len, tz = st.t[2] / len;
      // Right = +X, Up = perpendicular in YZ plane
      return nurbsRing(
        st.p[0], st.p[1], st.p[2],
        1, 0, 0,
        0, tz, -ty,
        st.radW, st.radH,
        sides, st.flute, 5, idx * 0.55,
      );
    });

    const surf = loftNurbsSurface(profiles, 3, 2);
    const mesh = tessellateNurbsSurface(surf, {
      segsU: lo ? 6 : 10,
      segsV: lo ? 6 : 10,
      adaptiveTolerance: lo ? 0.08 : 0.035,
    });
    // Scale UVs to metres so world bark texture tiles crisply along the limb
    if (mesh.uvs) {
      const lenApprox = Math.hypot(reach, drop);
      for (let i = 0; i < mesh.uvs.length; i += 2) {
        mesh.uvs[i] = mesh.uvs[i] * lenApprox * 0.45;
        mesh.uvs[i + 1] = mesh.uvs[i + 1] * (Math.PI * 2 * r0) * 0.45;
      }
    }
    return triMeshToThreeGeo(mesh);
  });
}

export interface NurbsKneeBraceOpts {
  /** Horizontal span along +Z (m). */
  spanM: number;
  /** Vertical rise along +Y (m). */
  riseM: number;
  /** Timber beam width (X) and depth (radial thickness) in metres. */
  widthM?: number;
  depthM?: number;
  lowTier?: boolean;
}

/**
 * Build a carved curved timber knee-brace (concavely arched lower chord, chamfered square
 * timber cross-section) via NURBS lofting. Used under decks, porches, towers, and balconies.
 */
export function buildNurbsKneeBrace(opts: NurbsKneeBraceOpts): THREE.BufferGeometry {
  const span = Math.max(0.6, opts.spanM);
  const rise = Math.max(0.6, opts.riseM);
  const hw = (opts.widthM ?? 0.24) * 0.5;
  const hd = (opts.depthM ?? 0.28) * 0.5;
  const lo = Boolean(opts.lowTier);
  const key = `brace:${span.toFixed(2)}:${rise.toFixed(2)}:${hw.toFixed(2)}:${hd.toFixed(2)}:${lo ? 1 : 0}`;

  return cachedGeo(key, () => {
    // Concave gothic arch knee-brace profile from (0, 0, 0) up & out to (0, rise, span)
    const pts: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, rise * 0.48, span * 0.16],
      [0, rise * 0.82, span * 0.52],
      [0, rise, span],
    ];
    const profiles: NurbsPoint[][] = pts.map(([px, py, pz], idx) => {
      const prev = pts[Math.max(0, idx - 1)];
      const next = pts[Math.min(pts.length - 1, idx + 1)];
      const dy = next[1] - prev[1], dz = next[2] - prev[2];
      const len = Math.hypot(dy, dz) || 1;
      const ny = dz / len, nz = -dy / len;
      const swell = idx === 0 || idx === pts.length - 1 ? 1.15 : 0.92;
      const w = hw * swell, d = hd * swell;
      // Chamfered rectangular timber cross-section (5 points closed)
      return [
        [px - w, py - ny * d, pz - nz * d, 1],
        [px + w, py - ny * d, pz - nz * d, 1],
        [px + w, py + ny * d, pz + nz * d, 1],
        [px - w, py + ny * d, pz + nz * d, 1],
        [px - w, py - ny * d, pz - nz * d, 1],
      ];
    });

    const surf = loftNurbsSurface(profiles, 2, 1);
    const mesh = tessellateNurbsSurface(surf, {
      segsU: lo ? 5 : 8,
      segsV: 4,
      adaptiveTolerance: 0.04,
    });
    return triMeshToThreeGeo(mesh);
  });
}

export interface NurbsArchOpts {
  /** Clear opening width between piers (m). */
  widthM: number;
  /** Arch crown rise above springing height (m). */
  riseM: number;
  /** Front-to-back masonry depth (m). */
  depthM: number;
  /** Arch rib thickness radially (m). */
  ribThicknessM?: number;
  /** Pointed gothic arch vs semicircular Romanesque arch. */
  pointed?: boolean;
  /** Fraction [0..1] of the arch intact from the left pier (for ruined/broken arches). */
  intactFraction?: number;
  lowTier?: boolean;
}

/**
 * Build a true sculpted NURBS stone arch rib (pointed gothic or semicircular) with beveled
 * molded soffit & extrados — replaces jagged rotated `kit.box` arch segments.
 */
export function buildNurbsStoneArch(opts: NurbsArchOpts): THREE.BufferGeometry {
  const W = Math.max(1.5, opts.widthM);
  const R = Math.max(0.8, opts.riseM);
  const D = Math.max(0.4, opts.depthM);
  const T = opts.ribThicknessM ?? Math.max(0.42, W * 0.14);
  const pointed = opts.pointed !== false;
  const frac = Math.max(0.25, Math.min(1, opts.intactFraction ?? 1));
  const lo = Boolean(opts.lowTier);
  const key = `arch:${W.toFixed(1)}:${R.toFixed(1)}:${D.toFixed(1)}:${T.toFixed(2)}:${pointed ? 1 : 0}:${frac.toFixed(2)}:${lo ? 1 : 0}`;

  return cachedGeo(key, () => {
    const stations = lo ? 7 : 11;
    const profiles: NurbsPoint[][] = [];
    const halfW = W * 0.5 + T * 0.35;
    const halfD = D * 0.5;

    for (let i = 0; i <= stations; i++) {
      const u = (i / stations) * frac;
      const ang = Math.PI * u;
      const cx = -Math.cos(ang) * halfW;
      const cy = pointed ? Math.pow(Math.sin(ang), 0.72) * R : Math.sin(ang) * R;
      // Outward radial direction perpendicular to arch curve
      const rx = -Math.cos(ang);
      const ry = Math.sin(ang);
      const rLen = Math.hypot(rx, ry) || 1;
      const nx = rx / rLen, ny = ry / rLen;
      // Subtle keystone swell near crown (u ~ 0.5)
      const keystone = 1 + 0.22 * Math.exp(-Math.pow((u - 0.5) * 7, 2));
      const ht = T * 0.5 * keystone;
      const bd = halfD * (0.94 + 0.08 * keystone);
      const ch = ht * 0.25;

      // Molded chamfered stone voussoir cross-section (7 points closed)
      profiles.push([
        [cx - nx * ht, cy - ny * ht, -bd * 0.82, 1],
        [cx - nx * (ht - ch), cy - ny * (ht - ch), -bd, 1],
        [cx + nx * ht, cy + ny * ht, -bd, 1],
        [cx + nx * ht, cy + ny * ht, bd, 1],
        [cx - nx * (ht - ch), cy - ny * (ht - ch), bd, 1],
        [cx - nx * ht, cy - ny * ht, bd * 0.82, 1],
        [cx - nx * ht, cy - ny * ht, -bd * 0.82, 1],
      ]);
    }

    const surf = loftNurbsSurface(profiles, 2, 1);
    const mesh = tessellateNurbsSurface(surf, {
      segsU: lo ? 8 : 14,
      segsV: 6,
      adaptiveTolerance: 0.03,
    });
    return triMeshToThreeGeo(mesh);
  });
}

/**
 * Build an ornate hanging canopy lantern cage via NURBS surface of revolution (`revolveNurbsSurface`).
 * Returns both the wrought-iron/bronze frame housing AND the glowing inner lantern core.
 */
export function buildNurbsLanternGeometry(
  scale = 1,
  lowTier = false,
): { frame: THREE.BufferGeometry; core: THREE.BufferGeometry } {
  const s = Math.max(0.4, scale);
  const kFrame = `lantern-frame:${s.toFixed(2)}:${lowTier ? 1 : 0}`;
  const kCore = `lantern-core:${s.toFixed(2)}:${lowTier ? 1 : 0}`;

  const frame = cachedGeo(kFrame, () => {
    // Revolved top hood + finial + bottom bowl silhouette (open middle waist reveals glowing core!)
    const capProfile: NurbsPoint[] = [
      [0.01 * s, 0.44 * s, 0, 1],
      [0.06 * s, 0.38 * s, 0, 1],
      [0.24 * s, 0.28 * s, 0, 1],
      [0.28 * s, 0.20 * s, 0, 1],
      [0.20 * s, 0.16 * s, 0, 1],
      [0.19 * s, -0.18 * s, 0, 1],
      [0.24 * s, -0.24 * s, 0, 1],
      [0.14 * s, -0.34 * s, 0, 1],
      [0.02 * s, -0.42 * s, 0, 1],
    ];
    const segs = lowTier ? 6 : 8;
    const surf = revolveNurbsSurface(capProfile, segs, Math.PI * 2);
    const mesh = tessellateNurbsSurface(surf, {
      segsU: segs,
      segsV: lowTier ? 6 : 10,
      adaptiveTolerance: 0.02,
    });
    return triMeshToThreeGeo(mesh);
  });

  const core = cachedGeo(kCore, () => {
    const coreProfile: NurbsPoint[] = [
      [0.02 * s, 0.16 * s, 0, 1],
      [0.17 * s, 0.13 * s, 0, 1],
      [0.20 * s, 0.0 * s, 0, 1],
      [0.16 * s, -0.14 * s, 0, 1],
      [0.02 * s, -0.17 * s, 0, 1],
    ];
    const segs = lowTier ? 6 : 8;
    const surf = revolveNurbsSurface(coreProfile, segs, Math.PI * 2);
    const mesh = tessellateNurbsSurface(surf, { segsU: segs, segsV: 5, adaptiveTolerance: 0.02 });
    return triMeshToThreeGeo(mesh);
  });

  return { frame, core };
}

// ── 2. Catmull-Clark SubD Sculpted Architectural Details (Trunk Collars, Merlons, Corbels) ─────

/** Build a closed quad-mesh box cage with optional tapered top & semi-sharp edge creases. */
function makeCreasedPrismCage(
  botW: number, botD: number, topW: number, topD: number, h: number,
  creaseWeight: number,
): { mesh: PolyMesh; creases: CreaseMap } {
  const bw = botW * 0.5, bd = botD * 0.5, tw = topW * 0.5, td = topD * 0.5;
  const verts: V3[] = [
    [-bw, 0, -bd], [bw, 0, -bd], [bw, 0, bd], [-bw, 0, bd],
    [-tw, h, -td], [tw, h, -td], [tw, h, td], [-tw, h, td],
  ];
  const faces: number[][] = [
    [0, 3, 2, 1], // bottom
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // -Z
    [1, 2, 6, 5], // +X
    [2, 3, 7, 6], // +Z
    [3, 0, 4, 7], // -X
  ];
  const creases: CreaseMap = new Map();
  // Keep bottom base edges crisp so blocks seat cleanly, semi-sharp bevel on top & verticals
  for (let i = 0; i < 4; i++) {
    creases.set(edgeKey(i, (i + 1) % 4), 2.0);
    creases.set(edgeKey(4 + i, 4 + ((i + 1) % 4)), creaseWeight);
    creases.set(edgeKey(i, 4 + i), creaseWeight * 0.85);
  }
  return { mesh: { verts, faces }, creases };
}

/**
 * Build a beveled, weathered stone crenel merlon via Catmull-Clark SubD with semi-sharp creases.
 * Replaces sharp primitive `kit.box` blocks around crenellated canopy decks!
 */
export function buildSubdCrenelMerlon(
  widthM: number,
  heightM: number,
  depthM: number,
  lowTier = false,
): THREE.BufferGeometry {
  const key = `merlon:${widthM.toFixed(2)}:${heightM.toFixed(2)}:${depthM.toFixed(2)}:${lowTier ? 1 : 0}`;
  return cachedGeo(key, () => {
    const { mesh, creases } = makeCreasedPrismCage(
      widthM, depthM, widthM * 0.86, depthM * 0.88, heightM, 0.75,
    );
    const subd = subdivideCatmullClark(mesh, lowTier ? 1 : 2, creases);
    return triMeshToThreeGeo(polyMeshToIndexedTriMesh(subd.mesh));
  });
}

/**
 * Build a sculpted, organic trunk-clasping collar ring via Catmull-Clark SubD.
 * Wraps cleanly where an elevated canopy deck clasps a living giant oak trunk.
 */
export function buildSubdTrunkCollar(
  innerRadiusM: number,
  outerRadiusM: number,
  heightM: number,
  lowTier = false,
): THREE.BufferGeometry {
  const ir = Math.max(0.5, innerRadiusM);
  const or = Math.max(ir + 0.35, outerRadiusM);
  const h = Math.max(0.35, heightM);
  const key = `collar:${ir.toFixed(2)}:${or.toFixed(2)}:${h.toFixed(2)}:${lowTier ? 1 : 0}`;

  return cachedGeo(key, () => {
    const segs = lowTier ? 8 : 12;
    const verts: V3[] = [];
    const faces: number[][] = [];
    const creases: CreaseMap = new Map();

    // 4-point cross-section around ring: inner-bot, outer-bot (flared skirt), outer-top, inner-top
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const rib = 1 + (i % 2 === 0 ? 0.08 : -0.03);
      const rIn = ir;
      const rOutTop = or * rib;
      const rOutBot = (ir + (or - ir) * 0.55) * rib;
      verts.push(
        [ca * rIn, -h, sa * rIn],             // 0: inner bottom
        [ca * rOutBot, -h * 0.85, sa * rOutBot], // 1: outer lower bevel
        [ca * rOutTop, 0.04, sa * rOutTop],   // 2: outer top rim (just proud of deck)
        [ca * rIn, 0.14, sa * rIn],           // 3: inner bark clasp lip
      );
    }

    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      const b0 = i * 4, b1 = n * 4;
      faces.push(
        [b0 + 0, b1 + 0, b1 + 1, b0 + 1], // bottom underside
        [b0 + 1, b1 + 1, b1 + 2, b0 + 2], // sculpted outer bracket skirt
        [b0 + 2, b1 + 2, b1 + 3, b0 + 3], // top bevel lip
        [b0 + 3, b1 + 3, b1 + 0, b0 + 0], // inner trunk clasp
      );
      // Semi-sharp crease along the outer rim so the timber flange stays architectural
      creases.set(edgeKey(b0 + 2, b1 + 2), 0.9);
      creases.set(edgeKey(b0 + 3, b1 + 3), 0.7);
    }

    const subd = subdivideCatmullClark({ verts, faces }, 1, creases);
    return triMeshToThreeGeo(polyMeshToIndexedTriMesh(subd.mesh));
  });
}

/**
 * Build a sculpted stone pillar capital / corbel block via Catmull-Clark SubD with creased abacus.
 */
export function buildSubdCorbelCapital(
  radiusM: number,
  heightM: number,
  lowTier = false,
): THREE.BufferGeometry {
  const key = `capital:${radiusM.toFixed(2)}:${heightM.toFixed(2)}:${lowTier ? 1 : 0}`;
  return cachedGeo(key, () => {
    const { mesh, creases } = makeCreasedPrismCage(
      radiusM * 1.65, radiusM * 1.65, radiusM * 2.25, radiusM * 2.25, heightM, 1.15,
    );
    const subd = subdivideCatmullClark(mesh, lowTier ? 1 : 2, creases);
    return triMeshToThreeGeo(polyMeshToIndexedTriMesh(subd.mesh));
  });
}

// ── 3. Walk-In CAD/BIM Canopy Treehouses & Forest Shelters (`bimTo3D`) ──────────────────────────

export interface BimTreehouseOpts {
  widthM: number;
  depthM: number;
  heightM: number;
  /** Whether the front wall has a real code-checked walkable doorway (>= 1.15 m x 2.25 m). */
  hasDoor?: boolean;
  /** Whether interior windows & hearth emit warm amber sanctuary light. */
  lit?: boolean;
  /** Add cantilevered front porch + carved NURBS eave brackets. */
  hasPorch?: boolean;
  lowTier?: boolean;
}

export interface CompiledCanopyTreehouse {
  /** Solid exterior/interior BIM walls & timber frame (collidable; doorway cutout is physically open!). */
  wallGeos: THREE.BufferGeometry[];
  /** Pitched roof eaves, rafters, ridge beam, corner pilasters & NURBS knee-braces. */
  roofAndTrimGeos: THREE.BufferGeometry[];
  /** Walkable floor slab & porch decking. */
  floorGeos: THREE.BufferGeometry[];
  /** Recessed glowing mullioned window panes & hearth light core (non-solid). */
  windowGlowGeos: THREE.BufferGeometry[];
  /** Decorative iron/metal hinges, ridge finials & bracket plates (non-solid). */
  metalTrimGeos: THREE.BufferGeometry[];
  /** Local-space doorway clearance dimensions verified for capsule entry. */
  doorwayClearanceM: { width: number; height: number } | null;
  /** Local-space SH9 GI interior bounce probe & lantern anchor point. */
  interiorLightOffset: Vec3;
  /** Underlying Plajah CAD/BIM 3D model compiled by `bimTo3D()`. */
  bim3d: CadModel;
}

const bimHutCache = new Map<string, CompiledCanopyTreehouse>();

/**
 * Compile a walk-in CAD/BIM Canopy Treehouse using Plajah's real `bimTo3D()` kernel +
 * NURBS eave knee-braces + Catmull-Clark SubD ridge finial!
 *
 * Local coordinate convention (matches `kit.ts` `hut()`):
 * - Origin `(0, 0, 0)` at center of floor footprint, resting on `y = 0`.
 * - Front door faces `+Z` (matching `fx = Math.sin(yaw), fz = Math.cos(yaw)`).
 */
export function buildBimCanopyTreehouse(opts: BimTreehouseOpts): CompiledCanopyTreehouse {
  const W = Math.max(2.6, opts.widthM);
  const D = Math.max(2.2, opts.depthM);
  const H = Math.max(2.4, opts.heightM);
  const hasDoor = opts.hasDoor !== false;
  const lit = opts.lit !== false;
  const hasPorch = opts.hasPorch ?? W >= 3.2;
  const lo = Boolean(opts.lowTier);
  const key = `bimhut:${W.toFixed(1)}:${D.toFixed(1)}:${H.toFixed(1)}:${hasDoor ? 1 : 0}:${lit ? 1 : 0}:${hasPorch ? 1 : 0}:${lo ? 1 : 0}`;

  let cached = bimHutCache.get(key);
  if (!cached) {
    const thick = 0.24;
    const plan = emptyModel(`CanopyTreehouse_${key}`, 'ifc', 'plajah-canopy-kit');
    plan.units = 'm';
    const upm = 0.001;

    // Code-checked walkable doorway clearance (>= 1.15 m wide x 2.15 m tall, clamped gracefully on tiny huts)
    const doorW = Math.min(W * 0.44, Math.max(1.15, W * 0.34));
    const doorH = Math.min(H - 0.22, Math.max(2.15, H * 0.82));
    const winSill = Math.min(0.95, H * 0.34);
    const winHead = Math.min(H - 0.32, Math.max(winSill + 0.72, H * 0.74));
    const winW = Math.max(0.65, Math.min(1.1, D * 0.36));

    // In CAD coordinates (X right, Y depth -> after Z-up->Y-up conversion: x' = x - W/2, z' = -(y - D/2)):
    // Front wall is at y = 0 -> maps to z' = +D/2 (facing +Z!).
    const frontOpenings: WallOpening[] = [];
    if (hasDoor) {
      frontOpenings.push({
        id: 'd_front',
        kind: 'door',
        at: W * 0.5 - doorW * 0.5,
        width: doorW,
        head: doorH,
      });
    } else {
      frontOpenings.push({
        id: 'w_front',
        kind: 'window',
        at: W * 0.5 - winW * 0.5,
        width: winW,
        sill: winSill,
        head: winHead,
      });
    }
    if (W >= 3.6 && hasDoor) {
      const sideW = 0.58;
      frontOpenings.push(
        { id: 'w_fl', kind: 'window', at: 0.35, width: sideW, sill: winSill, head: winHead },
        { id: 'w_fr', kind: 'window', at: W - 0.35 - sideW, width: sideW, sill: winSill, head: winHead },
      );
    }

    const sideOpenings: WallOpening[] = [
      { id: 'w_side', kind: 'window', at: D * 0.5 - winW * 0.5, width: winW, sill: winSill, head: winHead },
    ];
    const backOpenings: WallOpening[] = [
      { id: 'w_back', kind: 'window', at: W * 0.5 - winW * 0.5, width: winW, sill: winSill, head: winHead },
    ];

    const addWall = (ax: number, ay: number, bx: number, by: number, openings: WallOpening[]) => {
      plan.entities.push({
        type: 'wall',
        layer: 'A-WALL',
        a: [ax, ay, 0],
        b: [bx, by, 0],
        thickness: thick,
        height: H,
        openings,
        unitsPerMm: upm,
      });
    };

    addWall(0, 0, W, 0, frontOpenings);
    addWall(W, 0, W, D, sideOpenings);
    addWall(W, D, 0, D, backOpenings);
    addWall(0, D, 0, 0, sideOpenings.map((o, i) => ({ ...o, id: `w_west_${i}` })));
    plan.entities.push({
      type: 'room',
      layer: 'A-ROOM',
      at: [W * 0.5, D * 0.5, 0],
      name: 'Sanctuary Chamber',
      number: '01',
      height: H,
      unitsPerMm: upm,
    });

    const bim3d = bimTo3D(plan);
    const elemById = new Map(bim3d.elements.map((e) => [e.id, e]));

    const wallGeos: THREE.BufferGeometry[] = [];
    const roofAndTrimGeos: THREE.BufferGeometry[] = [];
    const floorGeos: THREE.BufferGeometry[] = [];
    const windowGlowGeos: THREE.BufferGeometry[] = [];
    const metalTrimGeos: THREE.BufferGeometry[] = [];

    for (const m of bim3d.meshes) {
      const el = m.elementId ? elemById.get(m.elementId) : undefined;
      const cls = el?.cls ?? m.layer ?? 'IfcWall';
      // Skip `IfcDoor` leaf so the doorway is physically open & walkable!
      if (cls === 'IfcDoor') continue;

      const vc = m.positions.length / 3;
      const yUpPos = new Float32Array(m.positions.length);
      for (let i = 0; i < vc; i++) {
        // Center around (0, 0, 0) in game Y-up coordinates
        yUpPos[i * 3] = m.positions[i * 3] - W * 0.5;
        yUpPos[i * 3 + 1] = m.positions[i * 3 + 2];
        yUpPos[i * 3 + 2] = -(m.positions[i * 3 + 1] - D * 0.5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(yUpPos, 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
      g.computeVertexNormals();

      if (cls === 'IfcWindow') {
        if (lit) windowGlowGeos.push(g);
      } else if (cls === 'IfcSlab') {
        floorGeos.push(g);
      } else {
        wallGeos.push(g);
      }
    }

    // Heavy timber corner pilasters + doorway lintel & jambs (framed architectural depth!)
    const postW = 0.24;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.BoxGeometry(postW, H + 0.12, postW);
        post.translate(sx * (W * 0.5 + 0.02), (H + 0.12) * 0.5, sz * (D * 0.5 + 0.02));
        roofAndTrimGeos.push(post);
      }
    }
    if (hasDoor) {
      // Framed entry architrave & lintel beam
      const lintel = new THREE.BoxGeometry(doorW + 0.42, 0.22, thick + 0.16);
      lintel.translate(0, doorH + 0.08, D * 0.5);
      roofAndTrimGeos.push(lintel);
      for (const sx of [-1, 1]) {
        const jamb = new THREE.BoxGeometry(0.16, doorH, thick + 0.12);
        jamb.translate(sx * (doorW * 0.5 + 0.06), doorH * 0.5, D * 0.5);
        roofAndTrimGeos.push(jamb);
      }
    }

    // Overhanging pitched timber roof with gable fascia, ridge beam & sculpted NURBS eave knee-braces
    const roofPitch = 0.56; // ~32 deg storybook Fable pitch
    const eaveOverhang = 0.58;
    const slopeRun = W * 0.5 + eaveOverhang;
    const ridgeRise = Math.tan(roofPitch) * (W * 0.5);
    const slopeLen = Math.hypot(slopeRun, Math.tan(roofPitch) * slopeRun);
    const roofDepth = D + (hasPorch ? 1.55 : 0.95);
    const roofZShift = hasPorch ? 0.28 : 0;

    for (const s of [-1, 1]) {
      const panel = new THREE.BoxGeometry(slopeLen, 0.18, roofDepth);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * roofPitch);
      const cx = s * (slopeRun * 0.5 - 0.06);
      const cy = H + ridgeRise - Math.tan(roofPitch) * (slopeRun * 0.5) + 0.12;
      panel.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, roofZShift), q, new THREE.Vector3(1, 1, 1)));
      roofAndTrimGeos.push(panel);
    }

    // Solid gable triangles closing front & back under the pitched eaves
    for (const sz of [-1, 1]) {
      const shape = new THREE.Shape([
        new THREE.Vector2(-W * 0.5, 0),
        new THREE.Vector2(W * 0.5, 0),
        new THREE.Vector2(0, ridgeRise + 0.06),
      ]);
      const gable = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
      gable.translate(0, H - 0.02, sz * (D * 0.5) - 0.11);
      wallGeos.push(gable);
    }

    // Heavy timber ridge beam projecting proud of front & rear gables + iron ridge cap
    const ridge = new THREE.BoxGeometry(0.24, 0.26, roofDepth + 0.45);
    ridge.translate(0, H + ridgeRise + 0.16, roofZShift);
    roofAndTrimGeos.push(ridge);

    const ridgeCap = new THREE.BoxGeometry(0.32, 0.09, roofDepth + 0.52);
    ridgeCap.translate(0, H + ridgeRise + 0.31, roofZShift);
    metalTrimGeos.push(ridgeCap);

    // NURBS curved timber knee-braces supporting the overhanging eaves on both sides!
    const braceBase = buildNurbsKneeBrace({ spanM: 0.62, riseM: 0.72, widthM: 0.16, depthM: 0.18, lowTier: lo });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const b = braceBase.clone();
        placeWorld(b, sx * (W * 0.5), H - 0.72, sz * (D * 0.36), sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        roofAndTrimGeos.push(b);
      }
    }

    // Optional cantilevered front entry porch awning posts & braces
    if (hasPorch) {
      const porchD = 0.95;
      const porchFloor = new THREE.BoxGeometry(W + 0.25, 0.16, porchD);
      porchFloor.translate(0, 0.08, D * 0.5 + porchD * 0.5);
      floorGeos.push(porchFloor);

      for (const sx of [-1, 1]) {
        const px = sx * (W * 0.5 - 0.05);
        const pz = D * 0.5 + porchD - 0.12;
        const pPost = new THREE.BoxGeometry(0.18, H, 0.18);
        pPost.translate(px, H * 0.5, pz);
        roofAndTrimGeos.push(pPost);

        const pBrace = braceBase.clone();
        placeWorld(pBrace, px, H - 0.72, pz, Math.PI);
        roofAndTrimGeos.push(pBrace);
      }
    }

    // Recessed wooden cross-mullions over side windows for handcrafted silhouette
    for (const sx of [-1, 1]) {
      const mx = sx * (W * 0.5 + 0.04);
      const my = (winSill + winHead) * 0.5;
      const mVert = new THREE.BoxGeometry(0.08, winHead - winSill, 0.07);
      mVert.translate(mx, my, 0);
      const mHoriz = new THREE.BoxGeometry(0.08, 0.07, winW);
      mHoriz.translate(mx, my, 0);
      metalTrimGeos.push(mVert, mHoriz);
    }

    cached = {
      wallGeos,
      roofAndTrimGeos,
      floorGeos,
      windowGlowGeos,
      metalTrimGeos,
      doorwayClearanceM: hasDoor ? { width: doorW, height: doorH } : null,
      interiorLightOffset: [0, H * 0.72, 0],
      bim3d,
    };
    bimHutCache.set(key, cached);
  }

  // Return fresh clones so callers can transform freely into world space
  return {
    wallGeos: cached.wallGeos.map((g) => g.clone()),
    roofAndTrimGeos: cached.roofAndTrimGeos.map((g) => g.clone()),
    floorGeos: cached.floorGeos.map((g) => g.clone()),
    windowGlowGeos: cached.windowGlowGeos.map((g) => g.clone()),
    metalTrimGeos: cached.metalTrimGeos.map((g) => g.clone()),
    doorwayClearanceM: cached.doorwayClearanceM ? { ...cached.doorwayClearanceM } : null,
    interiorLightOffset: [...cached.interiorLightOffset] as Vec3,
    bim3d: cached.bim3d,
  };
}

// ── 4. High-Level Canopy Deck Substructure Bundle (Drop-In Upgrade for Any Game) ────────────────

export interface CanopyDeckSubstructureOpts {
  centerX: number;
  centerZ: number;
  deckY: number;
  deckRadiusM: number;
  trunkRadiusM: number;
  /** Number of primary living support boughs flaring beneath the deck. */
  boughCount?: number;
  /** Include sculpted SubD trunk collar clasping the tree. */
  includeCollar?: boolean;
  /** Include curved NURBS timber knee-braces & under-deck circumferential ring truss. */
  includeTimberTruss?: boolean;
  lowTier?: boolean;
  seed?: number;
}

export interface CanopyDeckSubstructureResult {
  /** Organic bark geometries (living boughs + collar) -> merge into smooth-normal bark mesh. */
  barkSupportGeos: THREE.BufferGeometry[];
  /** Architectural dark-timber geometries (curved knee-braces + under-deck truss chords). */
  timberTrussGeos: THREE.BufferGeometry[];
}

/**
 * Generate the full structural underside of a canopy deck:
 * - Swept NURBS living support boughs erupting from the trunk to cradle the deck rim
 * - Catmull-Clark SubD sculpted trunk collar
 * - Curved NURBS timber knee-braces + circumferential structural ring beam
 */
export function buildCanopyDeckSubstructure(opts: CanopyDeckSubstructureOpts): CanopyDeckSubstructureResult {
  const { centerX, centerZ, deckY, deckRadiusM: R, trunkRadiusM: tr } = opts;
  const lo = Boolean(opts.lowTier);
  const boughCount = opts.boughCount ?? (R >= 16 ? (lo ? 8 : 12) : (lo ? 5 : 6));
  const dropM = Math.min(R * 0.82, Math.max(4.5, R * 0.62));
  const reachM = Math.max(1.8, R - tr * 0.72 - 0.55);
  const seed = opts.seed ?? (centerX * 0.13 + centerZ * 0.29);

  const barkSupportGeos: THREE.BufferGeometry[] = [];
  const timberTrussGeos: THREE.BufferGeometry[] = [];

  // 1. Sculpted SubD trunk collar hugging the living trunk at deck level
  if (opts.includeCollar !== false) {
    const collar = buildSubdTrunkCollar(tr * 0.92, tr + Math.min(1.55, Math.max(0.75, R * 0.12)), Math.min(1.6, tr * 0.55), lo);
    placeWorld(collar, centerX, deckY - 0.35, centerZ, seed);
    barkSupportGeos.push(collar);
  }

  // 2. Swept NURBS living support boughs cradling the deck underside
  const baseBough = buildNurbsSupportBough({
    reachM,
    dropM,
    baseRadiusM: Math.max(0.32, Math.min(1.05, tr * 0.28)),
    tipRadiusM: Math.max(0.16, Math.min(0.42, tr * 0.11)),
    swayM: Math.min(0.65, reachM * 0.06),
    lowTier: lo,
  });

  for (let k = 0; k < boughCount; k++) {
    const a = (k / boughCount) * Math.PI * 2 + 0.35 + (seed % 0.7);
    const sx = centerX + Math.sin(a) * (tr * 0.72);
    const sz = centerZ + Math.cos(a) * (tr * 0.72);
    const g = baseBough.clone();
    // Mirror alternating boughs subtly along local X for natural asymmetry
    placeWorld(g, sx, deckY - 0.42 - dropM, sz, a, k % 2 === 0 ? 1 : -1, 1, 1);
    barkSupportGeos.push(g);
  }

  // 3. Architectural NURBS timber knee-braces & under-deck circumferential ring truss
  if (opts.includeTimberTruss !== false) {
    const braceSpan = Math.min(3.2, Math.max(1.3, reachM * 0.42));
    const braceRise = Math.min(3.0, Math.max(1.3, dropM * 0.44));
    const baseBrace = buildNurbsKneeBrace({
      spanM: braceSpan,
      riseM: braceRise,
      widthM: Math.min(0.34, Math.max(0.2, R * 0.022)),
      depthM: Math.min(0.38, Math.max(0.24, R * 0.025)),
      lowTier: lo,
    });
    const braceCount = boughCount;
    for (let k = 0; k < braceCount; k++) {
      // Interleave timber knee-braces halfway between living boughs!
      const a = ((k + 0.5) / braceCount) * Math.PI * 2 + 0.35 + (seed % 0.7);
      const sx = centerX + Math.sin(a) * (tr + 0.15);
      const sz = centerZ + Math.cos(a) * (tr + 0.15);
      const b = baseBrace.clone();
      placeWorld(b, sx, deckY - 0.44 - braceRise, sz, a);
      timberTrussGeos.push(b);
    }

    // Circumferential octagonal/polygonal timber ring beam binding all bough tips together
    const ringR = Math.max(tr + 1.1, R - 1.15);
    const segs = R >= 14 ? 16 : 8;
    const beamLen = 2 * ringR * Math.sin(Math.PI / segs) + 0.22;
    const beamH = Math.min(0.46, Math.max(0.28, R * 0.028));
    for (let k = 0; k < segs; k++) {
      const a = ((k + 0.5) / segs) * Math.PI * 2;
      const g = new THREE.BoxGeometry(beamLen, beamH, 0.28);
      placeWorld(g, centerX + Math.sin(a) * ringR, deckY - 0.58, centerZ + Math.cos(a) * ringR, a);
      timberTrussGeos.push(g);
    }
  }

  return { barkSupportGeos, timberTrussGeos };
}

// ── 5. Walk-In Multi-Story CAD/BIM Stone Towers & NURBS Arched Bridges (Settlement / Gorge / Ruins) ──

export interface BimStoneTowerOpts {
  widthM: number;
  heightM: number;
  /** Balcony deck height above base (m, default 8). */
  balconyHeightM?: number;
  lowTier?: boolean;
}

export interface CompiledStoneTower {
  /** Solid CAD/BIM stone masonry walls, battlements, corner quoins & floor slab (doorway is physically open!). */
  stoneGeos: THREE.BufferGeometry[];
  /** Timber deck, cantilevered balcony, rooftop platform & curved NURBS knee-braces. */
  timberGeos: THREE.BufferGeometry[];
  /** Recessed glowing mullioned windows (non-solid). */
  windowGlowGeos: THREE.BufferGeometry[];
  /** Iron window mullions, door hardware & parapet brackets (non-solid). */
  metalGeos: THREE.BufferGeometry[];
  /** Local-space doorway clearance verified for capsule entry. */
  doorwayClearanceM: { width: number; height: number };
  /** Interior hearth/GI probe anchor. */
  interiorProbeOffset: Vec3;
}

const bimTowerCache = new Map<string, CompiledStoneTower>();

/**
 * Compile a multi-story walk-in CAD/BIM Stone Tower (`bimTo3D()`) with:
 * - Ground-floor open arched entry doorway (>= 1.4 m x 2.5 m)
 * - Stacked stories of recessed illuminated mullioned windows (no flat glowing stickers!)
 * - Catmull-Clark SubD battlement merlons + carved corner buttress quoins
 * - Cantilevered timber balcony supported by curved NURBS knee-braces
 */
export function buildBimStoneTower(opts: BimStoneTowerOpts): CompiledStoneTower {
  const W = Math.max(5.5, opts.widthM);
  const H = Math.max(8, opts.heightM);
  const balH = Math.min(H - 3.5, Math.max(4, opts.balconyHeightM ?? 8));
  const lo = Boolean(opts.lowTier);
  const key = `bimtower:${W.toFixed(1)}:${H.toFixed(1)}:${balH.toFixed(1)}:${lo ? 1 : 0}`;

  let cached = bimTowerCache.get(key);
  if (!cached) {
    const thick = 0.52;
    const plan = emptyModel(`StoneTower_${key}`, 'ifc', 'plajah-canopy-kit');
    plan.units = 'm';
    const upm = 0.001;
    const doorW = Math.min(W * 0.34, 1.85);
    const doorH = 2.65;
    const stories = Math.max(2, Math.floor(H / 4.2));
    const storyH = H / stories;

    const frontOps: WallOpening[] = [
      { id: 'd_entry', kind: 'door', at: W * 0.5 - doorW * 0.5, width: doorW, head: doorH },
    ];
    const sideOps: WallOpening[] = [];
    const backOps: WallOpening[] = [];

    for (let st = 1; st < stories; st++) {
      const sill = st * storyH + 0.85;
      const head = Math.min(H - 0.8, sill + 1.55);
      if (head - sill < 0.7) continue;
      frontOps.push(
        { id: `wf_${st}_l`, kind: 'window', at: W * 0.2 - 0.45, width: 0.95, sill, head },
        { id: `wf_${st}_r`, kind: 'window', at: W * 0.8 - 0.5, width: 0.95, sill, head },
      );
      sideOps.push(
        { id: `ws_${st}_l`, kind: 'window', at: W * 0.25 - 0.45, width: 0.95, sill, head },
        { id: `ws_${st}_r`, kind: 'window', at: W * 0.75 - 0.5, width: 0.95, sill, head },
      );
      backOps.push({ id: `wb_${st}`, kind: 'window', at: W * 0.5 - 0.55, width: 1.1, sill, head });
    }

    const addWall = (ax: number, ay: number, bx: number, by: number, ops: WallOpening[]) => {
      plan.entities.push({
        type: 'wall', layer: 'A-WALL', a: [ax, ay, 0], b: [bx, by, 0],
        thickness: thick, height: H, openings: ops, unitsPerMm: upm,
      });
    };
    addWall(0, 0, W, 0, frontOps);
    addWall(W, 0, W, W, sideOps);
    addWall(W, W, 0, W, backOps);
    addWall(0, W, 0, 0, sideOps.map((o, i) => ({ ...o, id: `ww_${i}` })));
    plan.entities.push({
      type: 'room', layer: 'A-ROOM', at: [W * 0.5, W * 0.5, 0],
      name: 'Tower Keep', number: 'T1', height: H, unitsPerMm: upm,
    });

    const bim3d = bimTo3D(plan);
    const elemById = new Map(bim3d.elements.map((e) => [e.id, e]));
    const stoneGeos: THREE.BufferGeometry[] = [];
    const timberGeos: THREE.BufferGeometry[] = [];
    const windowGlowGeos: THREE.BufferGeometry[] = [];
    const metalGeos: THREE.BufferGeometry[] = [];

    for (const m of bim3d.meshes) {
      const el = m.elementId ? elemById.get(m.elementId) : undefined;
      const cls = el?.cls ?? m.layer ?? 'IfcWall';
      if (cls === 'IfcDoor') continue; // keep entry physically walkable!
      const vc = m.positions.length / 3;
      const yUpPos = new Float32Array(m.positions.length);
      for (let i = 0; i < vc; i++) {
        yUpPos[i * 3] = m.positions[i * 3] - W * 0.5;
        yUpPos[i * 3 + 1] = m.positions[i * 3 + 2];
        yUpPos[i * 3 + 2] = -(m.positions[i * 3 + 1] - W * 0.5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(yUpPos, 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
      g.computeVertexNormals();
      if (cls === 'IfcWindow') windowGlowGeos.push(g);
      else stoneGeos.push(g);
    }

    // Carved stone battered plinth & sculpted corner pilasters
    const plinth = new THREE.BoxGeometry(W + 0.8, 1.2, W + 0.8);
    plinth.translate(0, 0.4, 0);
    stoneGeos.push(plinth);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const quoin = new THREE.BoxGeometry(0.68, H + 0.4, 0.68);
        quoin.translate(sx * (W * 0.5 + 0.08), (H + 0.4) * 0.5, sz * (W * 0.5 + 0.08));
        stoneGeos.push(quoin);
      }
    }

    // NURBS stone entry arch framing the ground-floor doorway
    const doorArch = buildNurbsStoneArch({
      widthM: doorW, riseM: 0.72, depthM: thick + 0.35, ribThicknessM: 0.34, pointed: true, lowTier: lo,
    });
    placeWorld(doorArch, 0, doorH - 0.12, W * 0.5 + 0.05, 0);
    stoneGeos.push(doorArch);

    // Rooftop timber crown deck + Catmull-Clark SubD battlement merlons + curved NURBS corbel braces
    const deckSlab = new THREE.BoxGeometry(W + 1.8, 0.45, W + 1.8);
    deckSlab.translate(0, H, 0);
    timberGeos.push(deckSlab);

    const merlon = buildSubdCrenelMerlon(1.15, 0.85, 0.65, lo);
    const crownBrace = buildNurbsKneeBrace({ spanM: 0.95, riseM: 1.4, widthM: 0.24, depthM: 0.26, lowTier: lo });
    for (let side = 0; side < 4; side++) {
      const yaw = side * (Math.PI * 0.5);
      for (const off of [-W * 0.36, 0, W * 0.36]) {
        const mg = merlon.clone();
        const mPos = new THREE.Vector3(off, H + 0.2, W * 0.5 + 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        placeWorld(mg, mPos.x, mPos.y, mPos.z, yaw);
        stoneGeos.push(mg);

        const bg = crownBrace.clone();
        const bPos = new THREE.Vector3(off, H - 1.55, W * 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        placeWorld(bg, bPos.x, bPos.y, bPos.z, yaw);
        timberGeos.push(bg);
      }
    }

    // Cantilevered mid-level timber balcony supported by curved NURBS knee-braces (facing +Z)
    const balW = W * 0.86, balD = 2.4;
    const balDeck = new THREE.BoxGeometry(balW, 0.28, balD);
    balDeck.translate(0, balH, W * 0.5 + balD * 0.5);
    timberGeos.push(balDeck);

    const balBrace = buildNurbsKneeBrace({ spanM: balD - 0.25, riseM: 2.1, widthM: 0.24, depthM: 0.26, lowTier: lo });
    for (const bx of [-balW * 0.4, 0, balW * 0.4]) {
      const bg = balBrace.clone();
      placeWorld(bg, bx, balH - 2.2, W * 0.5, 0);
      timberGeos.push(bg);
    }
    // Iron balcony railing posts & top bar
    for (const bx of [-balW * 0.48, -balW * 0.16, balW * 0.16, balW * 0.48]) {
      const post = new THREE.BoxGeometry(0.1, 1.05, 0.1);
      post.translate(bx, balH + 0.55, W * 0.5 + balD - 0.1);
      metalGeos.push(post);
    }
    const railBar = new THREE.BoxGeometry(balW, 0.08, 0.08);
    railBar.translate(0, balH + 1.05, W * 0.5 + balD - 0.1);
    metalGeos.push(railBar);

    cached = {
      stoneGeos,
      timberGeos,
      windowGlowGeos,
      metalGeos,
      doorwayClearanceM: { width: doorW, height: doorH },
      interiorProbeOffset: [0, 2.2, 0],
    };
    bimTowerCache.set(key, cached);
  }

  return {
    stoneGeos: cached.stoneGeos.map((g) => g.clone()),
    timberGeos: cached.timberGeos.map((g) => g.clone()),
    windowGlowGeos: cached.windowGlowGeos.map((g) => g.clone()),
    metalGeos: cached.metalGeos.map((g) => g.clone()),
    doorwayClearanceM: { ...cached.doorwayClearanceM },
    interiorProbeOffset: [...cached.interiorProbeOffset] as Vec3,
  };
}

export interface NurbsArchBridgeOpts {
  /** Total span length along local +Z (m). */
  lengthM: number;
  /** Clear deck width along local X (m). */
  widthM: number;
  /** Vertical drop from deck underside to river pier footing (m). */
  pierHeightM: number;
  lowTier?: boolean;
}

export interface CompiledNurbsBridge {
  /** Solid walkable deck + twin swept NURBS under-arch ribs + stone side parapets + SubD pier capital. */
  stoneGeos: THREE.BufferGeometry[];
  /** Glowing cyan cyber-conduit rails & under-arch energy ribs (non-solid). */
  glowGeos: THREE.BufferGeometry[];
  /** Metal stanchion caps & expansion strips (non-solid). */
  metalGeos: THREE.BufferGeometry[];
}

/**
 * Build a sculpted twin-arch NURBS stone-and-conduit bridge span (local origin at deck center `y = 0`,
 * running along local Z from `-lengthM/2` to `+lengthM/2`). Replaces flat `kit.box` spans like Digital Bridge!
 */
export function buildNurbsArchBridge(opts: NurbsArchBridgeOpts): CompiledNurbsBridge {
  const L = Math.max(12, opts.lengthM);
  const W = Math.max(3.6, opts.widthM);
  const H = Math.max(4, opts.pierHeightM);
  const lo = Boolean(opts.lowTier);

  const stoneGeos: THREE.BufferGeometry[] = [];
  const glowGeos: THREE.BufferGeometry[] = [];
  const metalGeos: THREE.BufferGeometry[] = [];

  // Walkable stone deck slab with chamfered overhang cornice
  const deck = new THREE.BoxGeometry(W, 0.72, L);
  deck.translate(0, -0.36, 0);
  stoneGeos.push(deck);

  const cornice = new THREE.BoxGeometry(W + 0.55, 0.24, L + 0.2);
  cornice.translate(0, -0.14, 0);
  stoneGeos.push(cornice);

  // Twin swept NURBS masonry arch ribs spanning each half of the river!
  const halfSpan = L * 0.48;
  const archRise = Math.min(H * 0.65, halfSpan * 0.34);
  const archRib = buildNurbsStoneArch({
    widthM: halfSpan - 1.4,
    riseM: archRise,
    depthM: W * 0.86,
    ribThicknessM: 0.75,
    pointed: false,
    lowTier: lo,
  });
  for (const sz of [-1, 1]) {
    const g = archRib.clone();
    // Rotate arch from XY plane into YZ plane (spanning along bridge Z axis)
    placeWorld(g, 0, -0.72 - archRise, sz * (halfSpan * 0.5), Math.PI * 0.5);
    stoneGeos.push(g);
  }

  // Sculpted Catmull-Clark SubD central pier capital + buttressed cutwater pier
  const pierCap = buildSubdCorbelCapital(W * 0.44, 1.15, lo);
  placeWorld(pierCap, 0, -0.72 - archRise - 0.9, 0, 0);
  stoneGeos.push(pierCap);

  const pierShaft = new THREE.CylinderGeometry(W * 0.42, W * 0.52, H + 2, 10);
  pierShaft.translate(0, -0.72 - archRise - 0.9 - (H + 2) * 0.5, 0);
  stoneGeos.push(pierShaft);

  // Molded stone parapet plinths, beveled stanchions, iron caps & glowing cyan conduit rails
  const postCount = Math.max(5, Math.round(L / 6.5) + 1);
  const merlonCap = buildSubdCrenelMerlon(0.52, 0.32, 0.52, lo);
  for (const sx of [-1, 1]) {
    const ox = sx * (W * 0.5 - 0.24);
    const curb = new THREE.BoxGeometry(0.46, 0.32, L);
    curb.translate(ox, 0.16, 0);
    stoneGeos.push(curb);

    // Twin parallel glowing cyber-conduit rails running full span
    for (const ry of [0.68, 1.04]) {
      const rail = new THREE.BoxGeometry(0.14, 0.1, L);
      rail.translate(ox, ry, 0);
      glowGeos.push(rail);
    }
    // Under-cornice cyan guide strip
    const underStrip = new THREE.BoxGeometry(0.1, 0.14, L);
    underStrip.translate(sx * (W * 0.5 + 0.28), -0.14, 0);
    glowGeos.push(underStrip);

    for (let i = 0; i < postCount; i++) {
      const pz = -L * 0.48 + (i / (postCount - 1)) * (L * 0.96);
      const post = new THREE.BoxGeometry(0.44, 1.18, 0.44);
      post.translate(ox, 0.59, pz);
      stoneGeos.push(post);

      const cap = merlonCap.clone();
      placeWorld(cap, ox, 1.14, pz, 0);
      metalGeos.push(cap);
    }
  }

  return { stoneGeos, glowGeos, metalGeos };
}

// ── 6. Vaulted NURBS Cavern / Cathedral Ribs, SubD Cyber-Fantasy Consoles & NURBS Portal Rings ──

export interface NurbsVaultRibsOpts {
  /** Clear interior span width across local X (m). */
  spanWidthM: number;
  /** Hall length along local Z (m). */
  hallLengthM: number;
  /** Springing height from floor to where arches begin curving (m). */
  springHeightM: number;
  /** Vault arch rise from springing height to apex crown (m). */
  vaultRiseM: number;
  /** Number of transverse gothic rib bays along local Z. */
  bays?: number;
  pointed?: boolean;
  lowTier?: boolean;
}

/**
 * Build a full bay sequence of swept pointed-gothic NURBS vault arches + longitudinal ridge rib
 * + Catmull-Clark SubD boss keystones & wall springer corbels.
 * Transforms box-walled underground halls (Crystal Vault, Rift Vault, Cathedrals) into vaulted architecture!
 */
export function buildNurbsVaultRibs(opts: NurbsVaultRibsOpts): {
  stoneGeos: THREE.BufferGeometry[];
  accentGeos: THREE.BufferGeometry[];
} {
  const W = Math.max(6, opts.spanWidthM);
  const L = Math.max(8, opts.hallLengthM);
  const spr = Math.max(2, opts.springHeightM);
  const rise = Math.max(2.5, opts.vaultRiseM);
  const bays = Math.max(2, opts.bays ?? Math.max(3, Math.round(L / 6.5)));
  const lo = Boolean(opts.lowTier);

  const stoneGeos: THREE.BufferGeometry[] = [];
  const accentGeos: THREE.BufferGeometry[] = [];

  const ribBase = buildNurbsStoneArch({
    widthM: W,
    riseM: rise,
    depthM: 0.95,
    ribThicknessM: 0.72,
    pointed: opts.pointed !== false,
    lowTier: lo,
  });
  const corbelBase = buildSubdCorbelCapital(0.58, 0.72, lo);
  const bossBase = buildSubdCrenelMerlon(0.95, 0.55, 0.95, lo);

  for (let i = 0; i < bays; i++) {
    const z = bays === 1 ? 0 : -L * 0.44 + (i / (bays - 1)) * (L * 0.88);
    const rib = ribBase.clone();
    placeWorld(rib, 0, spr, z, 0);
    stoneGeos.push(rib);

    // Carved SubD wall springer corbels on both piers
    for (const sx of [-1, 1]) {
      const c = corbelBase.clone();
      placeWorld(c, sx * (W * 0.5 + 0.15), spr - 0.55, z, 0);
      stoneGeos.push(c);
    }

    // Carved SubD boss keystone at the vault apex
    const boss = bossBase.clone();
    placeWorld(boss, 0, spr + rise - 0.25, z, 0);
    accentGeos.push(boss);
  }

  // Longitudinal central spine rib linking every vault boss along the nave
  const spine = new THREE.BoxGeometry(0.55, 0.48, L * 0.92);
  spine.translate(0, spr + rise + 0.05, 0);
  stoneGeos.push(spine);

  return { stoneGeos, accentGeos };
}

/**
 * Build a beveled Catmull-Clark SubD cyber-fantasy terminal console pedestal (local base at y = 0,
 * angled control desk facing +Z). Replaces plain box consoles in Titan Tree, Mire & Crystal Vault.
 */
export function buildSubdCarvedConsole(
  widthM = 1.45,
  heightM = 1.05,
  depthM = 0.78,
  lowTier = false,
): THREE.BufferGeometry {
  const key = `console:${widthM.toFixed(2)}:${heightM.toFixed(2)}:${depthM.toFixed(2)}:${lowTier ? 1 : 0}`;
  return cachedGeo(key, () => {
    const hw = widthM * 0.5, hd = depthM * 0.5;
    // Tapered sci-fi/fantasy lectern cage: flared base, sloped display hood
    const verts: V3[] = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
      [-hw * 0.88, heightM * 0.78, -hd * 0.82], [hw * 0.88, heightM * 0.78, -hd * 0.82],
      [hw * 0.92, heightM, hd * 0.65], [-hw * 0.92, heightM, hd * 0.65],
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
      creases.set(edgeKey(i, (i + 1) % 4), 2.0);
      creases.set(edgeKey(4 + i, 4 + ((i + 1) % 4)), 1.1);
      creases.set(edgeKey(i, 4 + i), 0.7);
    }
    const subd = subdivideCatmullClark({ verts, faces }, lowTier ? 1 : 2, creases);
    return triMeshToThreeGeo(polyMeshToIndexedTriMesh(subd.mesh));
  });
}

/**
 * Build a sculpted fluted NURBS monolith portal ring with molded outer facets & glowing inner collar
 * (replaces plain TorusGeometry donuts on ancient cyber-fantasy portals!).
 * Local origin at portal ring center `(0, 0, 0)`, ring lying in XY plane facing +Z.
 */
export function buildNurbsPortalFrame(
  radiusM = 4.2,
  tubeRadiusM = 0.72,
  lowTier = false,
): { stoneFrame: THREE.BufferGeometry; runeRing: THREE.BufferGeometry } {
  const R = Math.max(1.8, radiusM);
  const tr = Math.max(0.28, tubeRadiusM);
  const kStone = `portal-stone:${R.toFixed(2)}:${tr.toFixed(2)}:${lowTier ? 1 : 0}`;
  const kRune = `portal-rune:${R.toFixed(2)}:${tr.toFixed(2)}:${lowTier ? 1 : 0}`;

  const stoneFrame = cachedGeo(kStone, () => {
    const stations = lowTier ? 14 : 22;
    const profiles: NurbsPoint[][] = [];
    for (let i = 0; i <= stations; i++) {
      const a = (i / stations) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Radial swell at cardinal & diagonal monolith nodes (every 45 deg)
      const nodeSwell = 1 + 0.16 * Math.cos(a * 8);
      const rOut = R + tr * nodeSwell;
      const rIn = R - tr * 0.72;
      const hd = tr * 0.82 * nodeSwell;
      const ch = tr * 0.28;
      // Molded octagonal monolith stone ring cross-section (7 points closed)
      profiles.push([
        [ca * rIn, sa * rIn, -hd * 0.65, 1],
        [ca * (rIn + ch), sa * (rIn + ch), -hd, 1],
        [ca * rOut, sa * rOut, -hd * 0.88, 1],
        [ca * rOut, sa * rOut, hd * 0.88, 1],
        [ca * (rIn + ch), sa * (rIn + ch), hd, 1],
        [ca * rIn, sa * rIn, hd * 0.65, 1],
        [ca * rIn, sa * rIn, -hd * 0.65, 1],
      ]);
    }
    const surf = loftNurbsSurface(profiles, 2, 1);
    const mesh = tessellateNurbsSurface(surf, {
      segsU: lowTier ? 18 : 32,
      segsV: 6,
      adaptiveTolerance: 0.03,
    });
    return triMeshToThreeGeo(mesh);
  });

  const runeRing = cachedGeo(kRune, () => {
    const stations = lowTier ? 14 : 20;
    const profiles: NurbsPoint[][] = [];
    const r0 = R - tr * 0.74, r1 = R - tr * 0.52, hd = tr * 0.22;
    for (let i = 0; i <= stations; i++) {
      const a = (i / stations) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      profiles.push([
        [ca * r0, sa * r0, -hd, 1],
        [ca * r1, sa * r1, -hd, 1],
        [ca * r1, sa * r1, hd, 1],
        [ca * r0, sa * r0, hd, 1],
        [ca * r0, sa * r0, -hd, 1],
      ]);
    }
    const surf = loftNurbsSurface(profiles, 2, 1);
    const mesh = tessellateNurbsSurface(surf, { segsU: lowTier ? 16 : 24, segsV: 4, adaptiveTolerance: 0.04 });
    return triMeshToThreeGeo(mesh);
  });

  return { stoneFrame, runeRing };
}
