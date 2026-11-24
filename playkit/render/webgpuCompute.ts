// playkit/render/webgpuCompute.ts
//
// Live WebGPU Compute Pipeline Dispatcher for Plajah's Phase 4 WGSL Compute Shaders:
//   - Clustered Forward+ Light Binning (`WGSL_CLUSTER_CULL_SHADER`)
//   - GPU Frustum Instance Culling (`WGSL_GPU_FRUSTUM_CULL`)
//   - Froxel Volumetric Fog Transmittance Accumulation (`WGSL_FROXEL_ACCUMULATE`)
//   - Studio Ray-Traced SH9 Irradiance Probe Baking (`WGSL_STUDIO_SH9_BAKER`)
//
// Gracefully detects `GPUDevice` availability (works natively on WebGPU Chrome/Edge/Desktop/Android,
// and cleanly reports `available: false` for automatic CPU fallback on WebGL2 / Node).

import { WGSL_CLUSTER_CULL_SHADER } from './clusteredLights';
import { WGSL_GPU_FRUSTUM_CULL } from './gpuCuller';
import { WGSL_FROXEL_ACCUMULATE } from './froxelFog';
import { WGSL_STUDIO_SH9_BAKER } from '../../services/gamestudio/compiler/lightBaker';

export type PlaykitComputeKernelId = 'cluster-cull' | 'frustum-cull' | 'froxel-accumulate' | 'studio-sh9-bake';

export interface ComputeKernelMeta {
  id: PlaykitComputeKernelId;
  entryPoint: string;
  workgroupSize: [number, number, number];
  wgsl: string;
}

export const PLAYKIT_COMPUTE_KERNELS: Record<PlaykitComputeKernelId, ComputeKernelMeta> = {
  'cluster-cull': {
    id: 'cluster-cull',
    entryPoint: 'cullLights',
    workgroupSize: [64, 1, 1],
    wgsl: WGSL_CLUSTER_CULL_SHADER,
  },
  'frustum-cull': {
    id: 'frustum-cull',
    entryPoint: 'cullInstances',
    workgroupSize: [64, 1, 1],
    wgsl: WGSL_GPU_FRUSTUM_CULL,
  },
  'froxel-accumulate': {
    id: 'froxel-accumulate',
    entryPoint: 'accumulate',
    workgroupSize: [8, 8, 1],
    wgsl: WGSL_FROXEL_ACCUMULATE,
  },
  'studio-sh9-bake': {
    id: 'studio-sh9-bake',
    entryPoint: 'bakeProbes',
    workgroupSize: [64, 1, 1],
    wgsl: WGSL_STUDIO_SH9_BAKER,
  },
};

export interface ComputeDispatchSpec {
  kernel: PlaykitComputeKernelId;
  uniformData: ArrayBufferView;
  storageInputs: Array<{ binding: number; data: ArrayBufferView }>;
  storageOutputByteLength: number;
  storageOutputBinding: number;
  dispatchCount: [number, number, number];
}

export class PlaykitWebGpuCompute {
  private device: GPUDevice | null = null;
  private pipelines = new Map<PlaykitComputeKernelId, GPUComputePipeline>();

  get available(): boolean {
    return this.device !== null;
  }

  /** Acquire a WebGPU GPUDevice (or attach an existing device shared from Three.js WebGPURenderer). */
  async init(existingDevice?: GPUDevice | null): Promise<boolean> {
    if (existingDevice) {
      this.device = existingDevice;
      return true;
    }
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return false;
      this.device = await adapter.requestDevice();
      return true;
    } catch {
      return false;
    }
  }

  /** Lazily compile and cache a WGSL compute pipeline on the active GPUDevice. */
  getOrCreatePipeline(id: PlaykitComputeKernelId): GPUComputePipeline | null {
    if (!this.device) return null;
    const cached = this.pipelines.get(id);
    if (cached) return cached;

    const meta = PLAYKIT_COMPUTE_KERNELS[id];
    const module = this.device.createShaderModule({ label: `playkit:${id}`, code: meta.wgsl });
    const pipeline = this.device.createComputePipeline({
      label: `playkit:pipe:${id}`,
      layout: 'auto',
      compute: { module, entryPoint: meta.entryPoint },
    });
    this.pipelines.set(id, pipeline);
    return pipeline;
  }

  /**
   * Dispatch a compute kernel with uniform + storage buffers and read back the output Float32Array.
   * Returns null when WebGPU is unavailable so callers seamlessly run their CPU parity path.
   */
  async dispatchAndReadbackFloat32(spec: ComputeDispatchSpec): Promise<Float32Array | null> {
    const dev = this.device;
    if (!dev) return null;
    const pipeline = this.getOrCreatePipeline(spec.kernel);
    if (!pipeline) return null;

    const usage = globalThis.GPUBufferUsage;
    const align4 = (n: number) => Math.max(16, Math.ceil(n / 16) * 16);

    const uniformBuf = dev.createBuffer({
      size: align4(spec.uniformData.byteLength),
      usage: usage.UNIFORM | usage.COPY_DST,
    });
    dev.queue.writeBuffer(uniformBuf, 0, spec.uniformData.buffer as ArrayBuffer, spec.uniformData.byteOffset, spec.uniformData.byteLength);

    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: uniformBuf } }];
    const tempBuffers: GPUBuffer[] = [uniformBuf];

    for (const inp of spec.storageInputs) {
      const buf = dev.createBuffer({
        size: align4(inp.data.byteLength),
        usage: usage.STORAGE | usage.COPY_DST,
      });
      dev.queue.writeBuffer(buf, 0, inp.data.buffer as ArrayBuffer, inp.data.byteOffset, inp.data.byteLength);
      entries.push({ binding: inp.binding, resource: { buffer: buf } });
      tempBuffers.push(buf);
    }

    const outSize = align4(spec.storageOutputByteLength);
    const outBuf = dev.createBuffer({ size: outSize, usage: usage.STORAGE | usage.COPY_SRC });
    const readBuf = dev.createBuffer({ size: outSize, usage: usage.MAP_READ | usage.COPY_DST });
    entries.push({ binding: spec.storageOutputBinding, resource: { buffer: outBuf } });
    tempBuffers.push(outBuf, readBuf);

    const bindGroup = dev.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(spec.dispatchCount[0], spec.dispatchCount[1], spec.dispatchCount[2]);
    pass.end();
    enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, outSize);
    dev.queue.submit([enc.finish()]);

    await readBuf.mapAsync(globalThis.GPUMapMode.READ);
    const copy = new Float32Array(readBuf.getMappedRange().slice(0, spec.storageOutputByteLength));
    readBuf.unmap();
    for (const b of tempBuffers) b.destroy();
    return copy;
  }

  /** Compute workgroup count helper matching each kernel's `@workgroup_size`. */
  static workgroupsFor(id: PlaykitComputeKernelId, itemsX: number, itemsY = 1, itemsZ = 1): [number, number, number] {
    const wg = PLAYKIT_COMPUTE_KERNELS[id].workgroupSize;
    return [
      Math.max(1, Math.ceil(itemsX / wg[0])),
      Math.max(1, Math.ceil(itemsY / wg[1])),
      Math.max(1, Math.ceil(itemsZ / wg[2])),
    ];
  }

  dispose(): void {
    this.pipelines.clear();
    this.device = null;
  }
}
