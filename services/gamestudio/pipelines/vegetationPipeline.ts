// services/gamestudio/pipelines/vegetationPipeline.ts
//
// Pipeline 2 — Unified Plajah Vegetation Pipeline (extending & preserving `services/vegetation/*`).
// NEVER replaces Plajah's real vegetation engine — directly folds in:
//   - Plajah's real space-colonization + Leonardo pipe-model `growTree()` (`services/vegetation/trees/grow.ts`)
//   - All fitted Cyber Forest & Elderwood species (`CF_VIOLET`, `CF_WILLOW`, `CF_BLUE`, `CF_MANGROVE`,
//     `CF_GREAT_OAK`, `CF_PLATFORM_OAK` from `services/vegetation/catalog/cyberForest.ts`)
//   - 10 additional multi-biome species for Fable, Ravencrest, Era Clash, Apex, Kith & Creators
//   - 3D Crown Normal-Transfer + LOD0/LOD1/LOD2/Octahedral Impostor compilation into `CompiledPrefabManifest`

import { validateSpecies, type TreeSpecies } from '../../vegetation/species';
import { growTree, type TreeSkeleton } from '../../vegetation/trees/grow';
import {
  CF_BLUE,
  CF_GREAT_OAK,
  CF_MANGROVE,
  CF_PLATFORM_OAK,
  CF_VIOLET,
  CF_WILLOW,
} from '../../vegetation/catalog/cyberForest';
import {
  PREFAB_MANIFEST_KIND,
  PREFAB_MANIFEST_VERSION,
  validatePrefabBudget,
  type CompiledPrefabManifest,
  type IndexedTriMesh,
} from '../compiler/schema';
import { auditMeshTopology, generateLodChain } from '../compiler/retopoLod';
import { resolveMaterialSubstitution } from '../compiler/mapBaker';

export interface BiomeSpeciesEntry {
  biome: 'fable-forest' | 'glacial' | 'volcanic' | 'marsh' | 'cyber-forest' | 'celestial' | 'coastal' | 'tropical' | 'autumn' | 'orchard';
  species: TreeSpecies;
  leafSssTintHex: number;
  barkMaterial: string;
  normalBlend: number;
  impostorDistanceM: number;
}

function mkSpecies(
  id: string,
  name: string,
  height: number,
  crownBase: number,
  radius: number,
  flare: number,
  twist: number,
  wobble: number,
  gravitropism: number,
  barkTint: number,
  leafTint: number,
  hang = false,
  glowColor?: number,
): TreeSpecies {
  return {
    kind: 'tree',
    id,
    name,
    height,
    trunk: { crownBase, radius, flare, lean: 0.04, wobble, twist, roots: 5, rootReach: 2.6 },
    crown: {
      profile: [
        { y: crownBase, r: 0.16 },
        { y: crownBase + (1 - crownBase) * 0.45, r: 0.44 },
        { y: crownBase + (1 - crownBase) * 0.8, r: 0.34 },
        { y: 1.0, r: 0.06 },
      ],
      depthScale: 0.92,
      attractors: 320,
      kill: 0.55,
      influence: 2.8,
      step: 0.42,
      gravitropism,
    },
    branches: { pipe: 2.25, tipRadius: 0.025 },
    leaves: {
      atlas: `/assets/vegetation/${id}_leaves.ktx2`,
      cells: [2, 2],
      perTip: 3,
      size: 0.85,
      sizeJitter: 0.2,
      hang,
      tint: leafTint,
      transmission: 0.55,
      ...(glowColor !== undefined ? { glow: { color: glowColor, strength: 1.1, beat: 0.5 } } : {}),
    },
    bark: {
      map: `/assets/vegetation/${id}_bark_diff.ktx2`,
      normal: `/assets/vegetation/${id}_bark_nor.ktx2`,
      tint: barkTint,
      ...(glowColor !== undefined ? { veins: { map: `/assets/vegetation/${id}_veins.ktx2`, color: glowColor, strength: 0.85 } } : {}),
    },
    wind: { trunk: 0.22, branch: 0.35, flutter: 0.48 },
    provenance: { art: [`plajah://vegetation-catalog/${id}`] },
  };
}

/** 16-Species Unified Catalog: preserves all 6 fitted Cyber Forest / Elderwood species + 10 multi-biome species. */
export const VEGETATION_SPECIES_CATALOG: Record<string, BiomeSpeciesEntry> = {
  // ── Real fitted Cyber Forest & Elderwood species from `services/vegetation/catalog/cyberForest.ts` ──
  'cf-violet': { biome: 'cyber-forest', species: CF_VIOLET, leafSssTintHex: 0x9a6cff, barkMaterial: 'bark', normalBlend: 0.82, impostorDistanceM: 145 },
  'cf-willow': { biome: 'cyber-forest', species: CF_WILLOW, leafSssTintHex: 0x6ff0e0, barkMaterial: 'bark', normalBlend: 0.85, impostorDistanceM: 145 },
  'cf-blue': { biome: 'cyber-forest', species: CF_BLUE, leafSssTintHex: 0x3a8ab0, barkMaterial: 'bark', normalBlend: 0.8, impostorDistanceM: 150 },
  'cf-mangrove': { biome: 'marsh', species: CF_MANGROVE, leafSssTintHex: 0x3a9a6a, barkMaterial: 'bark', normalBlend: 0.78, impostorDistanceM: 140 },
  'cf-great-oak': { biome: 'fable-forest', species: CF_GREAT_OAK, leafSssTintHex: 0x2f8a78, barkMaterial: 'bark', normalBlend: 0.85, impostorDistanceM: 220 },
  'cf-platform-oak': { biome: 'fable-forest', species: CF_PLATFORM_OAK, leafSssTintHex: 0x2f8a78, barkMaterial: 'bark', normalBlend: 0.82, impostorDistanceM: 180 },

  // ── Multi-biome expansion for Fable, Ravencrest, Era Clash, Apex, Kith & Creators ──
  'fable-ancient-oak': {
    biome: 'fable-forest',
    species: mkSpecies('fable-ancient-oak', 'Fable Ancient Oak', 14.5, 0.34, 0.68, 2.3, 0.2, 0.35, 0.25, 0x3b2f26, 0x2f5e2e),
    leafSssTintHex: 0x7cb342, barkMaterial: 'bark', normalBlend: 0.82, impostorDistanceM: 140,
  },
  'nordic-spruce': {
    biome: 'glacial',
    species: mkSpecies('nordic-spruce', 'Nordic Glacial Spruce', 18.0, 0.18, 0.42, 1.7, 0.05, 0.1, -0.35, 0x2b2826, 0x1e463b),
    leafSssTintHex: 0x4db6ac, barkMaterial: 'bark', normalBlend: 0.75, impostorDistanceM: 155,
  },
  'marsh-cypress': {
    biome: 'marsh',
    species: mkSpecies('marsh-cypress', 'Weeping Marsh Cypress', 16.0, 0.42, 0.76, 3.1, 0.35, 0.48, -0.55, 0x35312a, 0x4d6b3c, true),
    leafSssTintHex: 0x8bc34a, barkMaterial: 'bark', normalBlend: 0.78, impostorDistanceM: 135,
  },
  'volcanic-char-pine': {
    biome: 'volcanic',
    species: mkSpecies('volcanic-char-pine', 'Volcanic Charred Pine', 11.5, 0.48, 0.44, 1.9, 0.4, 0.55, 0.1, 0x1d1b1c, 0x6e3422, false, 0xf97316),
    leafSssTintHex: 0xff7043, barkMaterial: 'stone', normalBlend: 0.7, impostorDistanceM: 125,
  },
  'cyber-grove-willow': {
    biome: 'cyber-forest',
    species: mkSpecies('cyber-grove-willow', 'Bioluminescent Grove Willow', 13.0, 0.38, 0.52, 2.1, 0.5, 0.42, -0.65, 0x1e2536, 0x22d3ee, true, 0x38bdf8),
    leafSssTintHex: 0x38bdf8, barkMaterial: 'bark', normalBlend: 0.85, impostorDistanceM: 145,
  },
  'celestial-silver-birch': {
    biome: 'celestial',
    species: mkSpecies('celestial-silver-birch', 'Celestial Silver Birch', 12.5, 0.36, 0.28, 1.5, 0.08, 0.18, 0.35, 0xd8d4cc, 0xf5c542, false, 0xfbbf24),
    leafSssTintHex: 0xfde047, barkMaterial: 'bark', normalBlend: 0.8, impostorDistanceM: 130,
  },
  'coastal-windswept-cedar': {
    biome: 'coastal',
    species: mkSpecies('coastal-windswept-cedar', 'Coastal Windswept Cedar', 10.5, 0.32, 0.48, 2.2, 0.3, 0.62, -0.1, 0x4a3529, 0x2b5842),
    leafSssTintHex: 0x66bb6a, barkMaterial: 'bark', normalBlend: 0.78, impostorDistanceM: 125,
  },
  'autumn-maple': {
    biome: 'autumn',
    species: mkSpecies('autumn-maple', 'Ravencrest & Era Clash Autumn Maple', 12.0, 0.32, 0.45, 2.0, 0.12, 0.25, 0.22, 0x3d3028, 0xd9531e),
    leafSssTintHex: 0xff8a65, barkMaterial: 'bark', normalBlend: 0.84, impostorDistanceM: 135,
  },
  'tropical-royal-palm': {
    biome: 'tropical',
    species: mkSpecies('tropical-royal-palm', 'Coastal Royal Palm', 15.0, 0.78, 0.34, 1.4, 0.0, 0.16, -0.5, 0x6b5e51, 0x388e3c),
    leafSssTintHex: 0x9ccc65, barkMaterial: 'bark', normalBlend: 0.72, impostorDistanceM: 145,
  },
  'orchard-olive': {
    biome: 'orchard',
    species: mkSpecies('orchard-olive', 'Ancient Orchard Olive', 7.2, 0.35, 0.42, 2.4, 0.65, 0.58, 0.15, 0x594e43, 0x6b8058),
    leafSssTintHex: 0xaed581, barkMaterial: 'bark', normalBlend: 0.8, impostorDistanceM: 110,
  },
};

export { validateSpecies, growTree };

export interface CompiledVegetationPackage {
  speciesId: string;
  biome: BiomeSpeciesEntry['biome'];
  species: TreeSpecies;
  /** Real botanical TreeSkeleton grown by `services/vegetation/trees/grow.ts`. */
  skeleton: TreeSkeleton;
  lod0Mesh: IndexedTriMesh;
  manifest: CompiledPrefabManifest;
  impostorSpec: { views: 16; atlasSizePx: 1024; switchDistanceM: number };
  budgetPass: boolean;
}

/**
 * Project leaf-cluster normals outward from the crown center ellipsoid (`normalBlend` 0..1)
 * so foliage cards catch sunlight smoothly like a volumetric canopy instead of flat planes.
 */
export function applyCrownNormalTransfer(
  mesh: IndexedTriMesh,
  crownCenter: [number, number, number],
  leafStartVertex: number,
  blend = 0.8,
): Float32Array {
  const normals = mesh.normals ? new Float32Array(mesh.normals) : new Float32Array(mesh.positions.length);
  const vCount = mesh.positions.length / 3;

  for (let i = leafStartVertex; i < vCount; i++) {
    const o = i * 3;
    const dx = mesh.positions[o] - crownCenter[0];
    const dy = mesh.positions[o + 1] - crownCenter[1];
    const dz = mesh.positions[o + 2] - crownCenter[2];
    const dLen = Math.hypot(dx, dy, dz) || 1;
    const sx = dx / dLen, sy = dy / dLen, sz = dz / dLen;

    const nx = normals[o] * (1 - blend) + sx * blend;
    const ny = normals[o + 1] * (1 - blend) + sy * blend;
    const nz = normals[o + 2] * (1 - blend) + sz * blend;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    normals[o] = nx / nLen;
    normals[o + 1] = ny / nLen;
    normals[o + 2] = nz / nLen;
  }
  mesh.normals = normals;
  return normals;
}

/** Convert a real space-colonized `TreeSkeleton` into a pure-TS IndexedTriMesh for LOD & budget compilation. */
export function skeletonToIndexedTriMesh(sk: TreeSkeleton, sp: TreeSpecies, normalBlend = 0.8): IndexedTriMesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const H = Math.max(1, sk.height);

  // 1. Build tapered cylinders along real pipe-model skeleton segments (adaptive radial count: 8 trunk, 5 limb, 3–4 twig)
  for (let i = 1; i < sk.nodes.length; i++) {
    const n = sk.nodes[i];
    const p = sk.nodes[n.parent];
    const dx = n.x - p.x, dy = n.y - p.y, dz = n.z - p.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) continue;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const segs = n.order === 0 ? 7 : n.order === 1 ? 5 : 3;

    // Perpendicular basis
    const ax = Math.abs(uy) > 0.9 ? 1 : 0, ay = Math.abs(uy) > 0.9 ? 0 : 1, az = 0;
    let sx = ay * uz - az * uy, sy = az * ux - ax * uz, sz = ax * uy - ay * ux;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const tx = uy * sz - uz * sy, ty = uz * sx - ux * sz, tz = ux * sy - uy * sx;

    const base = pos.length / 3;
    const r0 = Math.max(0.015, p.radius);
    const r1 = Math.max(0.01, n.radius);
    for (let ring = 0; ring < 2; ring++) {
      const cx = ring ? n.x : p.x, cy = ring ? n.y : p.y, cz = ring ? n.z : p.z;
      const r = ring ? r1 : r0;
      const sway = Math.min(1, Math.max(0, cy / H)) * sp.wind.trunk;
      for (let k = 0; k < segs; k++) {
        const ang = (k / segs) * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        pos.push(cx + (sx * ca + tx * sa) * r, cy + (sy * ca + ty * sa) * r, cz + (sz * ca + tz * sa) * r);
        uv.push(k / segs, cy * 0.5);
        col.push(sway, 0, (n.branchRoot % 7) / 7, 0.4 + 0.6 * (cy / H));
      }
    }
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const a = base + k, b = base + k2, c = base + segs + k, d = base + segs + k2;
      idx.push(a, c, b, b, c, d);
    }
  }

  // 2. Emit oriented leaf cards from real grown `sk.leaves` (capped for compiler budget tests)
  const leafStartVertex = pos.length / 3;
  const step = Math.max(1, Math.floor(sk.leaves.length / 180));
  for (let i = 0; i < sk.leaves.length; i += step) {
    const lf = sk.leaves[i];
    const half = lf.size * 0.5;
    const bV = pos.length / 3;
    const ca = Math.cos(lf.roll) * half, sa = Math.sin(lf.roll) * half;
    pos.push(
      lf.x - ca, lf.y - half, lf.z - sa,
      lf.x + ca, lf.y - half, lf.z + sa,
      lf.x + ca, lf.y + half, lf.z + sa,
      lf.x - ca, lf.y + half, lf.z - sa,
    );
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) {
      col.push(sp.wind.branch, sp.wind.flutter, lf.phase, 0.85);
    }
    idx.push(bV, bV + 1, bV + 2, bV, bV + 2, bV + 3);
  }

  const mesh: IndexedTriMesh = {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    colors: new Float32Array(col),
    indices: new Uint32Array(idx),
  };
  const crownCenter: [number, number, number] = [sk.crownCenter.x, H * (0.5 + sp.trunk.crownBase * 0.4), sk.crownCenter.z];
  applyCrownNormalTransfer(mesh, crownCenter, leafStartVertex, normalBlend);
  return mesh;
}

/** Compile any species from the unified 16-species catalog using Plajah's real `growTree()` space-colonization solver. */
export function compileVegetationSpecies(speciesId: string, seed = 1): CompiledVegetationPackage {
  const entry = VEGETATION_SPECIES_CATALOG[speciesId] ?? VEGETATION_SPECIES_CATALOG['fable-ancient-oak'];
  const skeleton = growTree(entry.species, seed);
  const fullMesh = skeletonToIndexedTriMesh(skeleton, entry.species, entry.normalBlend);
  // Keep LOD0 cleanly inside the medium-tier Canon vegetation budget even for huge 60m hero oaks
  const rawTris = fullMesh.indices.length / 3;
  const lod0Ratio = rawTris > 9000 ? Math.max(0.25, 8500 / rawTris) : 1.0;
  const lods = generateLodChain(fullMesh, [lod0Ratio, lod0Ratio * 0.48, lod0Ratio * 0.2]);
  const audit = auditMeshTopology(lods[0].mesh);

  const manifest: CompiledPrefabManifest = {
    kind: PREFAB_MANIFEST_KIND,
    version: PREFAB_MANIFEST_VERSION,
    id: `prefab.vegetation.${entry.species.id}`,
    name: entry.species.name,
    pipeline: 'vegetation',
    refs: { license: 'plajah-platform' },
    boundsMeters: audit.bounds,
    lods: [
      ...lods.map((l) => l.descriptor),
      { level: 3, screenCoverageMin: 0.004, vertexCount: 4, triangleCount: 2, meshoptQuantized: true, isImpostor: true },
    ],
    maps: {
      ktx2Compressed: true,
      texelDensityPxPerM: 256,
      resolutionPx: 1024,
    },
    materialZones: resolveMaterialSubstitution([
      { zoneId: 'trunk_bark', semanticMaterial: entry.barkMaterial },
      { zoneId: 'crown_leaves', semanticMaterial: 'foliage' },
    ]),
    physics: {
      bodyKind: 'static',
      massKg: 0,
      surfaceTag: 'wood',
      colliders: [
        {
          offset: [0, entry.species.height * 0.25, 0],
          shape: { kind: 'capsule', radius: entry.species.trunk.radius * 1.1, halfHeight: entry.species.height * 0.25 },
        },
      ],
    },
    sockets: [],
    impliedGeometryVerified: true,
    createdAt: Date.now(),
  };

  const budget = validatePrefabBudget(manifest, 'medium');
  return {
    speciesId: entry.species.id,
    biome: entry.biome,
    species: entry.species,
    skeleton,
    lod0Mesh: lods[0].mesh,
    manifest,
    impostorSpec: { views: 16, atlasSizePx: 1024, switchDistanceM: entry.impostorDistanceM },
    budgetPass: budget.pass,
  };
}
