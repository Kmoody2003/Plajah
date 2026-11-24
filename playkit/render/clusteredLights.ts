// playkit/render/clusteredLights.ts
//
// WebGPU Clustered Forward+ Lighting (replaces the 4–14 light pool ceiling with up to 256
// dynamic point/spot lights binned into a 3D frustum cluster grid in WGSL compute + CPU fallback).

import type { Vec3 } from '../physics/runtime';

export interface DynamicLight {
  id: string;
  kind: 'point' | 'spot';
  position: Vec3;
  color: Vec3;
  intensity: number;
  range: number;
  /** Spot direction (unit) and outer cone cosine, ignored for point lights. */
  direction?: Vec3;
  outerConeCos?: number;
  castShadow?: boolean;
}

export interface ClusterGridConfig {
  tilesX: number;
  tilesY: number;
  slicesZ: number;
  maxLightsPerCluster: number;
  maxTotalLights: number;
  near: number;
  far: number;
}

export const DEFAULT_CLUSTER_CONFIG: ClusterGridConfig = {
  tilesX: 16,
  tilesY: 9,
  slicesZ: 24,
  maxLightsPerCluster: 32,
  maxTotalLights: 256,
  near: 0.1,
  far: 180,
};

export interface ClusterBinningResult {
  totalClusters: number;
  activeLightCount: number;
  /** Number of lights assigned to each cluster index (length = tilesX * tilesY * slicesZ). */
  clusterCounts: Uint16Array;
  /** Flat light index table of size totalClusters * maxLightsPerCluster. */
  clusterLightIndices: Uint16Array;
  /** Packed GPU float buffer (8 floats per light: pos.xyz, range, color.rgb, intensity). */
  gpuLightBuffer: Float32Array;
}

export class ClusteredLightManager {
  readonly config: ClusterGridConfig;
  private lights = new Map<string, DynamicLight>();

  constructor(config?: Partial<ClusterGridConfig>) {
    this.config = { ...DEFAULT_CLUSTER_CONFIG, ...config };
  }

  upsert(light: DynamicLight): void {
    this.lights.set(light.id, { ...light, position: [...light.position], color: [...light.color] });
  }

  remove(id: string): boolean {
    return this.lights.delete(id);
  }

  clear(): void {
    this.lights.clear();
  }

  get count(): number {
    return this.lights.size;
  }

  /** Map view-space positive depth `z` to logarithmic cluster Z-slice [0 .. slicesZ - 1]. */
  depthToSlice(viewDepth: number): number {
    const { near, far, slicesZ } = this.config;
    if (viewDepth <= near) return 0;
    if (viewDepth >= far) return slicesZ - 1;
    const t = Math.log(viewDepth / near) / Math.log(far / near);
    return Math.max(0, Math.min(slicesZ - 1, Math.floor(t * slicesZ)));
  }

  /**
   * Bin all active lights into the 3D frustum grid (CPU reference path & WebGL2 fallback;
   * matches `WGSL_CLUSTER_CULL_SHADER` layout 1:1 for WebGPU compute dispatch).
   */
  binForCamera(cameraPos: Vec3, cameraForward: Vec3, cameraRight: Vec3, cameraUp: Vec3, fovYRad = Math.PI * 0.4, aspect = 16 / 9): ClusterBinningResult {
    const { tilesX, tilesY, slicesZ, maxLightsPerCluster, maxTotalLights, near, far } = this.config;
    const totalClusters = tilesX * tilesY * slicesZ;
    const clusterCounts = new Uint16Array(totalClusters);
    const clusterLightIndices = new Uint16Array(totalClusters * maxLightsPerCluster);

    const active = [...this.lights.values()].slice(0, maxTotalLights);
    const gpuLightBuffer = new Float32Array(active.length * 8);
    const tanHalfY = Math.tan(fovYRad * 0.5);
    const tanHalfX = tanHalfY * aspect;

    for (let li = 0; li < active.length; li++) {
      const l = active[li];
      gpuLightBuffer[li * 8] = l.position[0];
      gpuLightBuffer[li * 8 + 1] = l.position[1];
      gpuLightBuffer[li * 8 + 2] = l.position[2];
      gpuLightBuffer[li * 8 + 3] = l.range;
      gpuLightBuffer[li * 8 + 4] = l.color[0];
      gpuLightBuffer[li * 8 + 5] = l.color[1];
      gpuLightBuffer[li * 8 + 6] = l.color[2];
      gpuLightBuffer[li * 8 + 7] = l.intensity;

      // Transform light position into camera view space (+Z = forward depth)
      const dx = l.position[0] - cameraPos[0];
      const dy = l.position[1] - cameraPos[1];
      const dz = l.position[2] - cameraPos[2];
      const vx = dx * cameraRight[0] + dy * cameraRight[1] + dz * cameraRight[2];
      const vy = dx * cameraUp[0] + dy * cameraUp[1] + dz * cameraUp[2];
      const vz = dx * cameraForward[0] + dy * cameraForward[1] + dz * cameraForward[2];

      if (vz + l.range < near || vz - l.range > far) continue;

      const zMin = Math.max(near, vz - l.range);
      const zMax = Math.min(far, vz + l.range);
      const sMin = this.depthToSlice(zMin);
      const sMax = this.depthToSlice(zMax);

      // Project light sphere conservatively onto NDC [-1..1]
      const projZ = Math.max(near, vz);
      const halfW = projZ * tanHalfX;
      const halfH = projZ * tanHalfY;
      const ndcMinX = (vx - l.range) / halfW;
      const ndcMaxX = (vx + l.range) / halfW;
      const ndcMinY = (vy - l.range) / halfH;
      const ndcMaxY = (vy + l.range) / halfH;

      if (ndcMaxX < -1 || ndcMinX > 1 || ndcMaxY < -1 || ndcMinY > 1) continue;

      const txMin = Math.max(0, Math.min(tilesX - 1, Math.floor((ndcMinX * 0.5 + 0.5) * tilesX)));
      const txMax = Math.max(0, Math.min(tilesX - 1, Math.floor((ndcMaxX * 0.5 + 0.5) * tilesX)));
      const tyMin = Math.max(0, Math.min(tilesY - 1, Math.floor((ndcMinY * 0.5 + 0.5) * tilesY)));
      const tyMax = Math.max(0, Math.min(tilesY - 1, Math.floor((ndcMaxY * 0.5 + 0.5) * tilesY)));

      for (let sz = sMin; sz <= sMax; sz++) {
        for (let ty = tyMin; ty <= tyMax; ty++) {
          for (let tx = txMin; tx <= txMax; tx++) {
            const cIdx = (sz * tilesY + ty) * tilesX + tx;
            const cCount = clusterCounts[cIdx];
            if (cCount < maxLightsPerCluster) {
              clusterLightIndices[cIdx * maxLightsPerCluster + cCount] = li;
              clusterCounts[cIdx] = cCount + 1;
            }
          }
        }
      }
    }

    return {
      totalClusters,
      activeLightCount: active.length,
      clusterCounts,
      clusterLightIndices,
      gpuLightBuffer,
    };
  }
}

/** WGSL Compute Shader for GPU-side frustum cluster light culling (up to 256 dynamic lights). */
export const WGSL_CLUSTER_CULL_SHADER = /* wgsl */ `
struct Light { posRange: vec4<f32>, colorIntensity: vec4<f32> };
struct ClusterBounds { minPt: vec4<f32>, maxPt: vec4<f32> };
struct Params { lightCount: u32, maxPerCluster: u32, totalClusters: u32, pad: u32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var<storage, read> bounds: array<ClusterBounds>;
@group(0) @binding(3) var<storage, read_write> counts: array<u32>;
@group(0) @binding(4) var<storage, read_write> indices: array<u32>;

fn sphereIntersectsAabb(center: vec3<f32>, radius: f32, bmin: vec3<f32>, bmax: vec3<f32>) -> bool {
  let clamped = clamp(center, bmin, bmax);
  let d = center - clamped;
  return dot(d, d) <= radius * radius;
}

@compute @workgroup_size(64)
fn cullLights(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cid = gid.x;
  if (cid >= P.totalClusters) { return; }
  let b = bounds[cid];
  var n: u32 = 0u;
  let base = cid * P.maxPerCluster;
  for (var i: u32 = 0u; i < P.lightCount; i = i + 1u) {
    let l = lights[i];
    if (sphereIntersectsAabb(l.posRange.xyz, l.posRange.w, b.minPt.xyz, b.maxPt.xyz)) {
      if (n < P.maxPerCluster) {
        indices[base + n] = i;
        n = n + 1u;
      }
    }
  }
  counts[cid] = n;
}
`;
