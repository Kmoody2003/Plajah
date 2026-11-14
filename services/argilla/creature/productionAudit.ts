/**
 * productionAudit.ts — Console-grade PBR texture synthesis & GLB / Forge asset budget auditor
 * for Plajah's 3D asset pipeline (Era Clash 3D, Argilla sculpts, Character Forge).
 *
 * Bridges offline TypeScript asset generation with Xbox Series X-tier production checks:
 *  1. `heightToNormalMap`: Sobel tangent-space OpenGL normal map generator from scalar micro-height fields.
 *  2. `packORMTexture`: packs linear AO (R), Roughness (G), Metalness (B) into glTF-compliant RGBA buffers.
 *  3. `auditForgeCharacter`: inspects triangle counts, skin weight normalization, degenerate triangles,
 *     UV coverage, material PBR features (sheen/clearcoat/anisotropy), and VRAM texture memory against target budgets.
 */
import type { ForgeCharacter } from './exportCreature';

export type BudgetTier = 'xbox-series-x' | 'console-60fps' | 'handheld';

export interface ProductionBudget {
  tier: BudgetTier;
  maxTriangles: number;
  maxDrawPrimitives: number;
  maxMaterials: number;
  maxTextureBytes: number;
  maxBoneCount: number;
  requireNormalizedSkinWeights: boolean;
  minUvCoverageRatio: number;
}

export const PRODUCTION_BUDGETS: Record<BudgetTier, ProductionBudget> = {
  'xbox-series-x': {
    tier: 'xbox-series-x',
    maxTriangles: 140_000,
    maxDrawPrimitives: 64,
    maxMaterials: 48,
    maxTextureBytes: 48 * 1024 * 1024,
    maxBoneCount: 128,
    requireNormalizedSkinWeights: true,
    minUvCoverageRatio: 0.75,
  },
  'console-60fps': {
    tier: 'console-60fps',
    maxTriangles: 75_000,
    maxDrawPrimitives: 36,
    maxMaterials: 32,
    maxTextureBytes: 24 * 1024 * 1024,
    maxBoneCount: 96,
    requireNormalizedSkinWeights: true,
    minUvCoverageRatio: 0.65,
  },
  handheld: {
    tier: 'handheld',
    maxTriangles: 28_000,
    maxDrawPrimitives: 18,
    maxMaterials: 16,
    maxTextureBytes: 8 * 1024 * 1024,
    maxBoneCount: 64,
    requireNormalizedSkinWeights: true,
    minUvCoverageRatio: 0.5,
  },
};

export interface ForgeAuditReport {
  name: string;
  tier: BudgetTier;
  passed: boolean;
  metrics: {
    triangles: number;
    vertices: number;
    primitives: number;
    materials: number;
    bones: number;
    sockets: number;
    imageBytes: number;
    uvCoverageRatio: number;
    degenerateTriangles: number;
    unnormalizedSkinVertices: number;
    pbrAdvancedMaterials: number;
  };
  bounds: { min: [number, number, number]; max: [number, number, number]; height: number };
  warnings: string[];
  errors: string[];
}

/** Converts a scalar heightfield (0..1 per pixel) into a tangent-space OpenGL normal map RGBA buffer. */
export function heightToNormalMap(heights: Float32Array, width: number, height: number, strength = 2.0): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const sample = (x: number, y: number) => heights[((y + height) % height) * width + ((x + width) % width)];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 3x3 Sobel kernel for smooth mip-stable gradients without staircase ringing.
      const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y), r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dX * strength * 0.25;
      let ny = -dY * strength * 0.25;
      let nz = 1.0;
      const invLen = 1 / (Math.hypot(nx, ny, nz) || 1);
      nx *= invLen; ny *= invLen; nz *= invLen;
      const i = (y * width + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Packs glTF 2.0 ORM linear texture channels into RGBA8:
 *   R = Ambient Occlusion (0..1)
 *   G = Roughness (0..1)
 *   B = Metalness (0..1)
 *   A = 255
 */
export function packORMTexture(
  ao: Float32Array | number,
  roughness: Float32Array | number,
  metalness: Float32Array | number,
  width: number,
  height: number,
): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = clamp255(typeof ao === 'number' ? ao : ao[i] ?? 1);
    out[o + 1] = clamp255(typeof roughness === 'number' ? roughness : roughness[i] ?? 0.5);
    out[o + 2] = clamp255(typeof metalness === 'number' ? metalness : metalness[i] ?? 0);
    out[o + 3] = 255;
  }
  return out;
}

/** Audits a compiled ForgeCharacter against console production budgets and mesh/skinning correctness rules. */
export function auditForgeCharacter(char: ForgeCharacter, tier: BudgetTier = 'xbox-series-x'): ForgeAuditReport {
  const budget = PRODUCTION_BUDGETS[tier];
  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  let uvPrimitives = 0;
  let degenerateTriangles = 0;
  let unnormalizedSkinVertices = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const inspectPrim = (prim: ForgeCharacter['skinned'][number]['prims'][number], checkSkin: boolean) => {
    primitives++;
    if (prim.uv) uvPrimitives++;
    const pos = prim.positions;
    const vCount = pos.length / 3;
    vertices += vCount;
    for (let i = 0; i < vCount; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
      if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
      if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    }
    if (checkSkin && prim.weights) {
      for (let i = 0; i < vCount; i++) {
        const s = (prim.weights[i * 4] ?? 0) + (prim.weights[i * 4 + 1] ?? 0) + (prim.weights[i * 4 + 2] ?? 0) + (prim.weights[i * 4 + 3] ?? 0);
        if (Math.abs(s - 1) > 0.025) unnormalizedSkinVertices++;
      }
    }
    const idx = prim.indices;
    if (idx) {
      const triCount = Math.floor(idx.length / 3);
      triangles += triCount;
      for (let t = 0; t < triCount; t++) {
        const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
        const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
        const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
        const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        if (cx * cx + cy * cy + cz * cz < 1e-14) degenerateTriangles++;
      }
    } else {
      triangles += Math.floor(vCount / 3);
    }
  };

  for (const s of char.skinned) for (const p of s.prims) inspectPrim(p, true);
  for (const r of char.rigid) for (const p of r.prims) inspectPrim(p, false);
  for (const sock of char.sockets ?? []) for (const m of sock.meshes) for (const p of m.prims) inspectPrim(p, false);

  const imageBytes = char.images.reduce((sum, im) => sum + im.byteLength, 0);
  const uvCoverageRatio = primitives > 0 ? uvPrimitives / primitives : 1;
  const pbrAdvancedMaterials = char.materials.filter((m) => m.clearcoat || m.sheen || m.anisotropy || m.normal || m.occlusion).length;

  const warnings: string[] = [];
  const errors: string[] = [];

  if (triangles > budget.maxTriangles) errors.push(`Triangle count ${triangles} exceeds ${tier} budget ${budget.maxTriangles}`);
  if (primitives > budget.maxDrawPrimitives) warnings.push(`Primitive/draw count ${primitives} exceeds ${tier} target ${budget.maxDrawPrimitives}`);
  if (char.materials.length > budget.maxMaterials) warnings.push(`Material count ${char.materials.length} exceeds ${tier} target ${budget.maxMaterials}`);
  if (imageBytes > budget.maxTextureBytes) errors.push(`Embedded texture bytes ${imageBytes} exceeds budget ${budget.maxTextureBytes}`);
  if (char.bones.length > budget.maxBoneCount) warnings.push(`Bone count ${char.bones.length} exceeds ${tier} bone limit ${budget.maxBoneCount}`);
  if (budget.requireNormalizedSkinWeights && unnormalizedSkinVertices > 0) {
    errors.push(`${unnormalizedSkinVertices} skinned vertices have non-unit bone weight sums`);
  }
  if (uvCoverageRatio < budget.minUvCoverageRatio) {
    warnings.push(`UV coverage ratio ${(uvCoverageRatio * 100).toFixed(0)}% is below ${(budget.minUvCoverageRatio * 100).toFixed(0)}%`);
  }
  if (degenerateTriangles > triangles * 0.01) {
    warnings.push(`${degenerateTriangles} degenerate sliver triangles detected`);
  }

  return {
    name: char.name,
    tier,
    passed: errors.length === 0,
    metrics: {
      triangles,
      vertices,
      primitives,
      materials: char.materials.length,
      bones: char.bones.length,
      sockets: char.sockets?.length ?? 0,
      imageBytes,
      uvCoverageRatio,
      degenerateTriangles,
      unnormalizedSkinVertices,
      pbrAdvancedMaterials,
    },
    bounds: {
      min: Number.isFinite(min[0]) ? min : [0, 0, 0],
      max: Number.isFinite(max[0]) ? max : [0, 0, 0],
      height: Number.isFinite(max[1] - min[1]) ? max[1] - min[1] : 0,
    },
    warnings,
    errors,
  };
}
