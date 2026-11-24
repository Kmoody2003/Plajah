// services/gamestudio/compiler/schema.ts
//
// Unified Compiled Prefab Manifest (`plajah.prefab`).
// Every asset leaving Argilla (Organics/Sculpt), Vegetation (Trees/Foliage), or CAD/BIM
// (Buildings-with-Interiors, Vehicles, Furniture, Props) compiles to this exact contract
// so both first-party and creator games consume high-detail assets at 60 fps across platforms.

import type { QualityTier } from '../../../playkit/core/engine';
import type { ColliderShape, JointSpec, Vec3 } from '../../../playkit/physics/runtime';
import type { PropClassSpec, StandardSocketName } from '../../../playkit/character/organicRig';

export const PREFAB_MANIFEST_KIND = 'plajah.prefab';
export const PREFAB_MANIFEST_VERSION = 1;

export type AssetPipelineKind = 'organic' | 'vegetation' | 'architecture' | 'hard-surface' | '2d-sprite' | 'parlor-stage';

export interface IndexedTriMesh {
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  /** Optional RGBA vertex colors (e.g. wind bending / foliage phase / AO). */
  colors?: Float32Array;
}

export interface LodLevelDescriptor {
  level: 0 | 1 | 2 | 3;
  screenCoverageMin: number;
  vertexCount: number;
  triangleCount: number;
  meshoptQuantized: boolean;
  isImpostor?: boolean;
}

export interface BakedMapBundle {
  albedoDelightedUrl?: string;
  normalUrl?: string;
  /** Packed AO (R), Roughness (G), Displacement/Height (B) — matches Ravencrest `materials.ts`. */
  ardUrl?: string;
  curvatureUrl?: string;
  thicknessUrl?: string;
  bentNormalUrl?: string;
  lightmapUrl?: string;
  ktx2Compressed: boolean;
  texelDensityPxPerM: number;
  resolutionPx: 512 | 1024 | 2048;
}

export interface MaterialZoneAssignment {
  zoneId: string;
  semanticMaterial: string;
  pbrLibraryId: string;
  detailNormalId: string;
  detailTiling: number;
  edgeWearAmount: number;
  creviceGrimeAmount: number;
  subsurfaceScatter?: boolean;
  parallaxDepth?: number;
}

export interface PrefabPhysicsSpec {
  bodyKind: 'static' | 'dynamic' | 'kinematic';
  massKg: number;
  surfaceTag: string;
  colliders: Array<{ offset: Vec3; shape: ColliderShape }>;
  joints?: JointSpec[];
  destructible?: { hp: number; fracturePrefabId?: string };
}

export interface PrefabSocketDef {
  name: StandardSocketName;
  position: Vec3;
  rotationEuler: Vec3;
  acceptedCategories: string[];
}

export interface CompiledPrefabManifest {
  kind: typeof PREFAB_MANIFEST_KIND;
  version: typeof PREFAB_MANIFEST_VERSION;
  id: string;
  name: string;
  pipeline: AssetPipelineKind;
  /** Source document refs so "regenerate" preserves creator edits & attribution. */
  refs: {
    sourceDocId?: string;
    sourceImageHash?: string;
    authorUid?: string;
    license?: string;
  };
  boundsMeters: { min: Vec3; max: Vec3 };
  lods: LodLevelDescriptor[];
  maps: BakedMapBundle;
  materialZones: MaterialZoneAssignment[];
  physics: PrefabPhysicsSpec;
  sockets: PrefabSocketDef[];
  propClass?: PropClassSpec;
  /** True when the asset went through implied-geometry extraction (never a flat projected primitive). */
  impliedGeometryVerified: boolean;
  createdAt: number;
}

export interface PrefabBudgetReport {
  pass: boolean;
  tier: QualityTier;
  warnings: string[];
  errors: string[];
}

const MAX_LOD0_TRIS: Record<AssetPipelineKind, Record<QualityTier, number>> = {
  organic: { low: 14_000, medium: 28_000, high: 55_000, ultra: 95_000 },
  vegetation: { low: 4_500, medium: 10_000, high: 22_000, ultra: 45_000 },
  architecture: { low: 18_000, medium: 40_000, high: 90_000, ultra: 180_000 },
  'hard-surface': { low: 10_000, medium: 24_000, high: 50_000, ultra: 100_000 },
  '2d-sprite': { low: 64, medium: 128, high: 256, ultra: 512 },
  'parlor-stage': { low: 16_000, medium: 35_000, high: 80_000, ultra: 150_000 },
};

/** Enforce Ravencrest Canon + Mobile budgets before a prefab enters the Plajah Asset Vault. */
export function validatePrefabBudget(manifest: CompiledPrefabManifest, tier: QualityTier = 'medium'): PrefabBudgetReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!manifest.impliedGeometryVerified && manifest.pipeline !== '2d-sprite') {
    errors.push('Asset has not passed implied-geometry verification (flat texture projection is disallowed).');
  }

  const lod0 = manifest.lods.find((l) => l.level === 0);
  if (!lod0) {
    errors.push('Missing LOD0 geometry.');
  } else {
    const cap = MAX_LOD0_TRIS[manifest.pipeline][tier];
    if (lod0.triangleCount > cap) {
      errors.push(`LOD0 triangle count (${lod0.triangleCount}) exceeds ${tier}-tier ${manifest.pipeline} budget (${cap}).`);
    }
    if (manifest.pipeline !== '2d-sprite' && manifest.lods.length < 2) {
      warnings.push('Only 1 LOD level present; generate at least LOD0 + LOD1 for smooth distance scaling.');
    }
  }

  if (manifest.pipeline !== '2d-sprite' && !manifest.maps.ktx2Compressed) {
    warnings.push('Textures are not KTX2-compressed; mobile memory and LTE download times will be higher.');
  }

  if (manifest.maps.texelDensityPxPerM < 128 && manifest.pipeline !== '2d-sprite') {
    warnings.push(`Low texel density (${manifest.maps.texelDensityPxPerM} px/m); pair with micro-detail normal maps.`);
  }

  if (manifest.physics.colliders.length === 0 && manifest.pipeline !== '2d-sprite') {
    errors.push('Prefab has zero physics colliders.');
  }

  return { pass: errors.length === 0, tier, warnings, errors };
}
