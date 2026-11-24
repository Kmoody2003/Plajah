// services/gamestudio/compiler/mapBaker.ts
//
// High-to-Low Texture & Material Map Baker + Albedo Delighter + Semantic PBR Substitution.
// Eliminates "flat image textures" by:
//   1) Delighting source photo/concept albedo (stripping baked directional shadows & hotspots)
//   2) Baking geometric Tangent-Space Normals, Curvature (edge wear), Cavity/AO, and Thickness (SSS)
//      into Plajah's packed ARD (AO / Roughness / Displacement) + Normal maps
//   3) Resolving semantic material zones to high-res tileable PBR library sets + micro-detail normals.

import type { IndexedTriMesh, MaterialZoneAssignment } from './schema';
import { computeSmoothNormals } from './retopoLod';

export interface BakedMapBuffers {
  width: number;
  height: number;
  /** RGB tangent-space normal map (128, 128, 255 = flat +Z). */
  normalRgba: Uint8Array;
  /** Packed ARD: R = AO/Cavity, G = Roughness, B = Height/Displacement, A = Thickness (SSS). */
  ardThicknessRgba: Uint8Array;
  /** Single-channel curvature map (128 = flat, >128 convex edge, <128 concave crevice). */
  curvature: Uint8Array;
}

export interface SemanticMaterialRecipe {
  pbrLibraryId: string;
  detailNormalId: string;
  detailTiling: number;
  baseRoughness: number;
  edgeWearAmount: number;
  creviceGrimeAmount: number;
  subsurfaceScatter?: boolean;
  parallaxDepth?: number;
}

export const SEMANTIC_PBR_LIBRARY: Record<string, SemanticMaterialRecipe> = {
  stone: { pbrLibraryId: 'weathered_ashlar_stone', detailNormalId: 'micro_stone_grain', detailTiling: 14, baseRoughness: 0.82, edgeWearAmount: 0.45, creviceGrimeAmount: 0.65, parallaxDepth: 0.035 },
  'mossy-slate': { pbrLibraryId: 'fable_moss_slate', detailNormalId: 'micro_moss_rock', detailTiling: 12, baseRoughness: 0.86, edgeWearAmount: 0.35, creviceGrimeAmount: 0.82, parallaxDepth: 0.04 },
  marble: { pbrLibraryId: 'carved_celestial_marble', detailNormalId: 'micro_vein_stone', detailTiling: 16, baseRoughness: 0.32, edgeWearAmount: 0.2, creviceGrimeAmount: 0.25, parallaxDepth: 0.015 },
  'forged-gold': { pbrLibraryId: 'runic_forged_gold', detailNormalId: 'micro_brushed_metal', detailTiling: 20, baseRoughness: 0.26, edgeWearAmount: 0.55, creviceGrimeAmount: 0.35 },
  'brushed-steel': { pbrLibraryId: 'machined_steel_plate', detailNormalId: 'micro_brushed_metal', detailTiling: 22, baseRoughness: 0.34, edgeWearAmount: 0.6, creviceGrimeAmount: 0.3 },
  wood: { pbrLibraryId: 'aged_timber_planks', detailNormalId: 'micro_wood_grain', detailTiling: 14, baseRoughness: 0.76, edgeWearAmount: 0.4, creviceGrimeAmount: 0.55, parallaxDepth: 0.025 },
  skin: { pbrLibraryId: 'organic_skin_base', detailNormalId: 'micro_skin_pores', detailTiling: 28, baseRoughness: 0.48, edgeWearAmount: 0.0, creviceGrimeAmount: 0.12, subsurfaceScatter: true },
  linen: { pbrLibraryId: 'woven_cloak_linen', detailNormalId: 'micro_cloth_weave', detailTiling: 32, baseRoughness: 0.88, edgeWearAmount: 0.25, creviceGrimeAmount: 0.35, subsurfaceScatter: true },
  bark: { pbrLibraryId: 'rough_oak_bark', detailNormalId: 'micro_bark_fissure', detailTiling: 12, baseRoughness: 0.92, edgeWearAmount: 0.3, creviceGrimeAmount: 0.7, parallaxDepth: 0.045 },
  foliage: { pbrLibraryId: 'botanical_leaf_atlas', detailNormalId: 'micro_leaf_vein', detailTiling: 8, baseRoughness: 0.58, edgeWearAmount: 0.0, creviceGrimeAmount: 0.15, subsurfaceScatter: true },
};

/**
 * Strip low-frequency baked directional shadows and specular hotspots from a photo/art
 * RGBA buffer while preserving hue, saturation, and local texture contrast.
 */
export function delightAlbedo(rgba: Uint8Array, width: number, height: number, strength = 0.72): Uint8Array {
  const n = width * height;
  const lum = new Float32Array(n);
  let meanLum = 0;

  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = y;
    meanLum += y;
  }
  meanLum /= Math.max(1, n);

  // Separable wide box blur (approximates low-frequency incident illumination envelope)
  const rad = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) / 8)));
  const tmp = new Float32Array(n);
  const env = new Float32Array(n);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let k = -rad; k <= rad; k++) {
        const xx = Math.max(0, Math.min(width - 1, x + k));
        s += lum[y * width + xx];
        c++;
      }
      tmp[y * width + x] = s / c;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let k = -rad; k <= rad; k++) {
        const yy = Math.max(0, Math.min(height - 1, y + k));
        s += tmp[yy * width + x];
        c++;
      }
      env[y * width + x] = s / c;
    }
  }

  const out = new Uint8Array(rgba.length);
  const targetEnv = Math.max(0.22, Math.min(0.68, meanLum));
  for (let i = 0; i < n; i++) {
    const localEnv = Math.max(0.08, env[i]);
    const gain = 1 + (targetEnv / localEnv - 1) * strength;
    const clampedGain = Math.max(0.45, Math.min(2.2, gain));
    out[i * 4] = Math.max(0, Math.min(255, Math.round(rgba[i * 4] * clampedGain)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 1] * clampedGain)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgba[i * 4 + 2] * clampedGain)));
    out[i * 4 + 3] = rgba[i * 4 + 3];
  }
  return out;
}

/**
 * Bake per-vertex geometric curvature, cavity/AO, height, and thickness from high-res geometry
 * onto a UV-space Normal + packed ARD/Thickness + Curvature map set.
 */
export function bakeSurfaceMaps(
  mesh: IndexedTriMesh,
  size = 64,
  baseRoughness = 0.65,
): BakedMapBuffers {
  const normals = mesh.normals ?? computeSmoothNormals(mesh);
  const vCount = mesh.positions.length / 3;

  // Build vertex adjacency to measure discrete mean curvature & cavity AO
  const neighbors: number[][] = Array.from({ length: vCount }, () => []);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    neighbors[a].push(b, c);
    neighbors[b].push(a, c);
    neighbors[c].push(a, b);
  }

  // Compute centroid for radial thickness heuristic
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < vCount; i++) {
    cx += mesh.positions[i * 3];
    cy += mesh.positions[i * 3 + 1];
    cz += mesh.positions[i * 3 + 2];
  }
  cx /= Math.max(1, vCount); cy /= Math.max(1, vCount); cz /= Math.max(1, vCount);
  let maxR = 1e-4;
  for (let i = 0; i < vCount; i++) {
    const r = Math.hypot(mesh.positions[i * 3] - cx, mesh.positions[i * 3 + 1] - cy, mesh.positions[i * 3 + 2] - cz);
    if (r > maxR) maxR = r;
  }

  const vCurv = new Float32Array(vCount);
  const vAo = new Float32Array(vCount);
  const vThick = new Float32Array(vCount);

  for (let i = 0; i < vCount; i++) {
    const px = mesh.positions[i * 3], py = mesh.positions[i * 3 + 1], pz = mesh.positions[i * 3 + 2];
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    const nbs = neighbors[i];
    if (nbs.length === 0) {
      vCurv[i] = 0.5; vAo[i] = 1; vThick[i] = 0.5;
      continue;
    }
    let avgX = 0, avgY = 0, avgZ = 0;
    for (const j of nbs) {
      avgX += mesh.positions[j * 3];
      avgY += mesh.positions[j * 3 + 1];
      avgZ += mesh.positions[j * 3 + 2];
    }
    avgX /= nbs.length; avgY /= nbs.length; avgZ /= nbs.length;
    // Positive dot => vertex protrudes outward (convex edge); negative => concave crevice
    const dot = (px - avgX) * nx + (py - avgY) * ny + (pz - avgZ) * nz;
    const curvNorm = Math.max(0, Math.min(1, 0.5 + dot * 6.0));
    vCurv[i] = curvNorm;
    vAo[i] = Math.max(0.2, Math.min(1, 0.8 + (curvNorm - 0.5) * 0.75));
    const r = Math.hypot(px - cx, py - cy, pz - cz) / maxR;
    vThick[i] = Math.max(0.1, Math.min(1, 1 - r * 0.65));
  }

  const pxCount = size * size;
  const normalRgba = new Uint8Array(pxCount * 4);
  const ardThicknessRgba = new Uint8Array(pxCount * 4);
  const curvature = new Uint8Array(pxCount);

  // Neutral background fill (flat tangent normal + clean ARD)
  for (let i = 0; i < pxCount; i++) {
    normalRgba[i * 4] = 128; normalRgba[i * 4 + 1] = 128; normalRgba[i * 4 + 2] = 255; normalRgba[i * 4 + 3] = 255;
    ardThicknessRgba[i * 4] = 230;
    ardThicknessRgba[i * 4 + 1] = Math.round(baseRoughness * 255);
    ardThicknessRgba[i * 4 + 2] = 128;
    ardThicknessRgba[i * 4 + 3] = 140;
    curvature[i] = 128;
  }

  // Splat vertex/triangle attributes into UV atlas (using planar fallback if UVs absent)
  for (let i = 0; i < vCount; i++) {
    const u = mesh.uvs ? mesh.uvs[i * 2] : ((mesh.positions[i * 3] - cx) / (maxR * 2) + 0.5);
    const v = mesh.uvs ? mesh.uvs[i * 2 + 1] : ((mesh.positions[i * 3 + 1] - cy) / (maxR * 2) + 0.5);
    const tx = Math.max(0, Math.min(size - 1, Math.floor((((u % 1) + 1) % 1) * size)));
    const ty = Math.max(0, Math.min(size - 1, Math.floor((((v % 1) + 1) % 1) * size)));
    const p = ty * size + tx;

    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    normalRgba[p * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    normalRgba[p * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    normalRgba[p * 4 + 2] = Math.round((Math.abs(nz) * 0.5 + 0.5) * 255);
    normalRgba[p * 4 + 3] = 255;

    const rough = Math.max(0.08, Math.min(0.98, baseRoughness + (0.5 - vCurv[i]) * 0.25));
    ardThicknessRgba[p * 4] = Math.round(vAo[i] * 255);
    ardThicknessRgba[p * 4 + 1] = Math.round(rough * 255);
    ardThicknessRgba[p * 4 + 2] = Math.round(vCurv[i] * 255);
    ardThicknessRgba[p * 4 + 3] = Math.round(vThick[i] * 255);
    curvature[p] = Math.round(vCurv[i] * 255);
  }

  return { width: size, height: size, normalRgba, ardThicknessRgba, curvature };
}

/** Resolve semantic surface zones into layered PBR library assignments with micro-detail normals. */
export function resolveMaterialSubstitution(zones: Array<{ zoneId: string; semanticMaterial: string }>): MaterialZoneAssignment[] {
  return zones.map((z) => {
    const key = z.semanticMaterial.toLowerCase();
    const recipe = SEMANTIC_PBR_LIBRARY[key] ?? SEMANTIC_PBR_LIBRARY.stone;
    return {
      zoneId: z.zoneId,
      semanticMaterial: z.semanticMaterial,
      pbrLibraryId: recipe.pbrLibraryId,
      detailNormalId: recipe.detailNormalId,
      detailTiling: recipe.detailTiling,
      edgeWearAmount: recipe.edgeWearAmount,
      creviceGrimeAmount: recipe.creviceGrimeAmount,
      subsurfaceScatter: recipe.subsurfaceScatter,
      parallaxDepth: recipe.parallaxDepth,
    };
  });
}
