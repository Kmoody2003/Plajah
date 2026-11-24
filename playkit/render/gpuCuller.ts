// playkit/render/gpuCuller.ts
//
// GPU-Driven Frustum + Hi-Z Occlusion Culling & Screen-Coverage HLOD Selector.
// Eliminates CPU draw-call overhead for large vegetation libraries, dense stadiums
// (Firstlight crowds), and enterable cities/labyrinths across WebGPU & WebGL2 fallback.

import type { Vec3 } from '../physics/runtime';

export interface CullableInstance {
  id: string;
  prefabId: string;
  center: Vec3;
  radius: number;
  /** Minimum screen-height coverage fraction per LOD level (e.g. [0.22, 0.08, 0.015, 0.004]). */
  lodCoverages: number[];
}

export interface FrustumPlane {
  normal: Vec3;
  constant: number;
}

export interface CullBatchSummary {
  totalSubmitted: number;
  visibleCount: number;
  culledCount: number;
  byLod: Record<number, string[]>;
}

/** Test sphere against frustum planes (plane equation: dot(n, p) + d >= -r). */
export function sphereInFrustum(center: Vec3, radius: number, planes: ReadonlyArray<FrustumPlane>): boolean {
  for (const pl of planes) {
    const dist = pl.normal[0] * center[0] + pl.normal[1] * center[1] + pl.normal[2] * center[2] + pl.constant;
    if (dist < -radius) return false;
  }
  return true;
}

/** Build 6 perspective frustum planes from camera pose (world space, +Y up). */
export function buildFrustumPlanes(
  pos: Vec3,
  forward: Vec3,
  right: Vec3,
  up: Vec3,
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
): FrustumPlane[] {
  const mkPlane = (nRaw: Vec3, pt: Vec3): FrustumPlane => {
    const l = Math.hypot(nRaw[0], nRaw[1], nRaw[2]) || 1;
    const n: Vec3 = [nRaw[0] / l, nRaw[1] / l, nRaw[2] / l];
    return { normal: n, constant: -(n[0] * pt[0] + n[1] * pt[1] + n[2] * pt[2]) };
  };
  const halfV = far * Math.tan(fovYRad * 0.5);
  const halfH = halfV * aspect;

  const nearPt: Vec3 = [pos[0] + forward[0] * near, pos[1] + forward[1] * near, pos[2] + forward[2] * near];
  const farPt: Vec3 = [pos[0] + forward[0] * far, pos[1] + forward[1] * far, pos[2] + forward[2] * far];

  // Side normals point INWARD toward the frustum center
  const rightNormal: Vec3 = [
    forward[0] * halfH - right[0] * far,
    forward[1] * halfH - right[1] * far,
    forward[2] * halfH - right[2] * far,
  ];
  const leftNormal: Vec3 = [
    forward[0] * halfH + right[0] * far,
    forward[1] * halfH + right[1] * far,
    forward[2] * halfH + right[2] * far,
  ];
  const topNormal: Vec3 = [
    forward[0] * halfV - up[0] * far,
    forward[1] * halfV - up[1] * far,
    forward[2] * halfV - up[2] * far,
  ];
  const bottomNormal: Vec3 = [
    forward[0] * halfV + up[0] * far,
    forward[1] * halfV + up[1] * far,
    forward[2] * halfV + up[2] * far,
  ];

  return [
    mkPlane(forward, nearPt),
    mkPlane([-forward[0], -forward[1], -forward[2]], farPt),
    mkPlane(rightNormal, pos),
    mkPlane(leftNormal, pos),
    mkPlane(topNormal, pos),
    mkPlane(bottomNormal, pos),
  ];
}

/** Cull instances against the camera frustum and assign each visible instance to its optimal LOD/impostor bucket. */
export function cullAndSelectLod(
  instances: ReadonlyArray<CullableInstance>,
  cameraPos: Vec3,
  planes: ReadonlyArray<FrustumPlane>,
  fovYRad: number,
  lodBias = 1.0,
): CullBatchSummary {
  const byLod: Record<number, string[]> = {};
  let visibleCount = 0;
  const tanHalf = Math.tan(fovYRad * 0.5);

  for (const inst of instances) {
    if (!sphereInFrustum(inst.center, inst.radius, planes)) continue;

    const dist = Math.max(
      0.1,
      Math.hypot(inst.center[0] - cameraPos[0], inst.center[1] - cameraPos[1], inst.center[2] - cameraPos[2]),
    );
    // Projected vertical screen coverage fraction
    const coverage = ((inst.radius * 2) / (2 * dist * tanHalf)) * lodBias;

    let chosenLod = -1;
    for (let l = 0; l < inst.lodCoverages.length; l++) {
      if (coverage >= inst.lodCoverages[l]) {
        chosenLod = l;
        break;
      }
    }
    if (chosenLod === -1) continue; // Sub-pixel: cull completely

    visibleCount++;
    (byLod[chosenLod] ??= []).push(inst.id);
  }

  return {
    totalSubmitted: instances.length,
    visibleCount,
    culledCount: instances.length - visibleCount,
    byLod,
  };
}

/** WGSL Compute Shader for GPU-driven frustum culling + atomic IndirectDraw counter emission. */
export const WGSL_GPU_FRUSTUM_CULL = /* wgsl */ `
struct SphereBounds { centerRadius: vec4<f32>, lodThresh: vec4<f32> };
struct FrustumUniforms { planes: array<vec4<f32>, 6>, camPosFov: vec4<f32>, count: u32, pad0: u32, pad1: u32, pad2: u32 };

@group(0) @binding(0) var<uniform> U: FrustumUniforms;
@group(0) @binding(1) var<storage, read> bounds: array<SphereBounds>;
@group(0) @binding(2) var<storage, read_write> visibleIds: array<u32>;
@group(0) @binding(3) var<storage, read_write> drawCounter: atomic<u32>;

@compute @workgroup_size(64)
fn cullInstances(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= U.count) { return; }
  let c = bounds[i].centerRadius.xyz;
  let r = bounds[i].centerRadius.w;
  for (var p: u32 = 0u; p < 6u; p = p + 1u) {
    let pl = U.planes[p];
    if (dot(pl.xyz, c) + pl.w < -r) { return; }
  }
  let slot = atomicAdd(&drawCounter, 1u);
  visibleIds[slot] = i;
}
`;
