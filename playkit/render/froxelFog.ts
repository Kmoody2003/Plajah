// playkit/render/froxelFog.ts
//
// Froxel Volumetric Fog System (3D frustum-aligned voxel grid for cheap volumetric shafts,
// Fable-style forest mist, cathedral godrays, and glowing cyber-rune atmospheric scatter).

import type { QualityTier } from '../core/engine';
import type { Vec3 } from '../physics/runtime';

export interface FroxelGridConfig {
  width: number;
  height: number;
  depthSlices: number;
  near: number;
  far: number;
  baseDensity: number;
  heightFalloff: number;
  anisotropyG: number; // Henyey-Greenstein phase g ∈ [-0.9..0.9]
  fogColor: Vec3;
}

export const FROXEL_TIER_CONFIGS: Record<QualityTier, FroxelGridConfig> = {
  low: { width: 64, height: 36, depthSlices: 32, near: 0.5, far: 90, baseDensity: 0.012, heightFalloff: 0.14, anisotropyG: 0.55, fogColor: [0.16, 0.2, 0.3] },
  medium: { width: 96, height: 54, depthSlices: 48, near: 0.5, far: 120, baseDensity: 0.014, heightFalloff: 0.12, anisotropyG: 0.62, fogColor: [0.16, 0.2, 0.3] },
  high: { width: 128, height: 72, depthSlices: 64, near: 0.4, far: 160, baseDensity: 0.015, heightFalloff: 0.12, anisotropyG: 0.68, fogColor: [0.16, 0.2, 0.3] },
  ultra: { width: 160, height: 90, depthSlices: 64, near: 0.3, far: 220, baseDensity: 0.015, heightFalloff: 0.12, anisotropyG: 0.72, fogColor: [0.16, 0.2, 0.3] },
};

/** Henyey-Greenstein scattering phase function (forward-scattering sun/torch halo). */
export function henyeyGreenstein(cosTheta: number, g: number): number {
  const g2 = g * g;
  const denom = Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * cosTheta), 1.5);
  return (1 - g2) / (4 * Math.PI * denom);
}

/** Exponential depth-to-froxel-slice coordinate in [0..depthSlices - 1]. */
export function froxelSliceForDepth(depthM: number, cfg: FroxelGridConfig): number {
  if (depthM <= cfg.near) return 0;
  if (depthM >= cfg.far) return cfg.depthSlices - 1;
  const t = Math.log(depthM / cfg.near) / Math.log(cfg.far / cfg.near);
  return Math.max(0, Math.min(cfg.depthSlices - 1, Math.floor(t * cfg.depthSlices)));
}

/** Evaluate analytical Beer-Lambert transmittance + single-scatter in-scattering along a ray segment. */
export function evaluateFogTransmittance(
  worldHeightM: number,
  distanceM: number,
  cosSunAngle: number,
  cfg: FroxelGridConfig,
): { transmittance: number; inScatter: Vec3 } {
  const heightDensity = cfg.baseDensity * Math.exp(-Math.max(0, worldHeightM) * cfg.heightFalloff);
  const opticalDepth = heightDensity * Math.max(0, distanceM);
  const transmittance = Math.exp(-opticalDepth);
  const phase = henyeyGreenstein(cosSunAngle, cfg.anisotropyG);
  const scatterAmount = (1 - transmittance) * (0.4 + phase * 1.4);
  return {
    transmittance,
    inScatter: [
      cfg.fogColor[0] * scatterAmount,
      cfg.fogColor[1] * scatterAmount,
      cfg.fogColor[2] * scatterAmount,
    ],
  };
}

/** WGSL Compute Shader for Froxel volumetric fog front-to-back transmittance accumulation. */
export const WGSL_FROXEL_ACCUMULATE = /* wgsl */ `
struct FroxelUniforms {
  dims: vec3<u32>,
  nearPlane: f32,
  farPlane: f32,
  baseDensity: f32,
  anisotropyG: f32,
  pad: f32,
};
@group(0) @binding(0) var<uniform> F: FroxelUniforms;
@group(0) @binding(1) var scatterIn: texture_3d<f32>;
@group(0) @binding(2) var accumOut: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn accumulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= F.dims.x || gid.y >= F.dims.y) { return; }
  var accumLight = vec3<f32>(0.0);
  var transmittance = 1.0;
  let ratio = F.farPlane / max(0.01, F.nearPlane);
  for (var z: u32 = 0u; z < F.dims.z; z = z + 1u) {
    let t0 = f32(z) / f32(F.dims.z);
    let t1 = f32(z + 1u) / f32(F.dims.z);
    let sliceThickness = F.nearPlane * (pow(ratio, t1) - pow(ratio, t0));
    let sampleVal = textureLoad(scatterIn, vec3<i32>(i32(gid.x), i32(gid.y), i32(z)), 0);
    let sigmaT = max(0.0, sampleVal.a);
    let sliceTrans = exp(-sigmaT * sliceThickness);
    accumLight = accumLight + transmittance * sampleVal.rgb * (1.0 - sliceTrans) / max(1e-4, sigmaT);
    transmittance = transmittance * sliceTrans;
    textureStore(accumOut, vec3<i32>(i32(gid.x), i32(gid.y), i32(z)), vec4<f32>(accumLight, transmittance));
  }
}
`;
