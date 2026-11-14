// Browser WebGPU host for the modal resonator bank — the same modal.wgsl the native crate runs
// (rust/plajah-gpu-dsp). Renders a batch of independent jobs (each a stereo pair of banks) in
// 4096-sample blocks: one command buffer, state carried on the GPU between blocks, one readback.
//
// Works anywhere WebGPU does (Chrome/Edge, the WebView2 desktop app, Safari) and on any vendor.
// It is never on the audio thread: results are rendered ahead and cached (see somaDeep.ts).

import modalWgsl from '../../../../../rust/plajah-gpu-dsp/src/shaders/modal.wgsl?raw';

const GROUP = 64;
const BLOCK = 4096;

export interface ModalJob {
  /** (c, s, gain, 0) per kernel mode: bank L's groups·64 modes, then bank R's. */
  coef: Float32Array;
  groups: number;
  frames: number;
  /** Drive for both banks, from sample 0 (shorter than `frames` = silence after). */
  excite: Float32Array;
}

export interface ModalBatchResult {
  /** Per job: channel-major stereo, length 2·frames. */
  outputs: Float32Array[];
  gpuMs: number;
}

type Gpu = { device: GPUDevice; modes: GPUComputePipeline; reduce: GPUComputePipeline; label: string };
let gpuPromise: Promise<Gpu | null> | null = null;
let failed = false;

/** The shared device, or null when this browser/machine has no usable WebGPU. */
export function modalGpu(): Promise<Gpu | null> {
  if (failed) return Promise.resolve(null);
  if (!gpuPromise) {
    gpuPromise = (async () => {
      const gpu = (globalThis.navigator as Navigator & { gpu?: GPU })?.gpu;
      if (!gpu) return null;
      // Integrated GPUs share memory with the CPU — no PCIe readback — and measured faster than a
      // laptop dGPU for these bursts (docs/CHORA_GPU_AUDIO_SCOPE.md). Browsers may ignore the hint.
      const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
      if (!adapter) return null;
      const device = await adapter.requestDevice({
        requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
      });
      device.lost.then(() => { failed = true; gpuPromise = null; });
      const module = device.createShaderModule({ code: modalWgsl });
      const mk = (entryPoint: string) => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
      const [modes, reduce] = await Promise.all([
        device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'modes' } }).catch(() => mk('modes')),
        device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'reduce' } }).catch(() => mk('reduce')),
      ]);
      const info = (adapter as GPUAdapter & { info?: { vendor?: string; architecture?: string; description?: string } }).info ?? {};
      return { device, modes, reduce, label: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'WebGPU' };
    })().catch(() => { failed = true; return null; });
  }
  return gpuPromise;
}

export function modalGpuFailed(): boolean {
  return failed;
}

/** Render every job; resolves null when the GPU is unavailable or errors (callers fall back). */
export async function renderModalBatch(jobs: ModalJob[]): Promise<ModalBatchResult | null> {
  const gpu = await modalGpu();
  if (!gpu || !jobs.length) return null;
  const { device } = gpu;
  const t0 = performance.now();

  // Layout: job j owns banks 2j (L) and 2j+1 (R), each with jobs[j].groups contiguous groups.
  const banks = jobs.length * 2;
  const totalGroups = jobs.reduce((a, j) => a + 2 * j.groups, 0);
  const coef = new Float32Array(totalGroups * GROUP * 4);
  const groupBank = new Uint32Array(totalGroups);
  const bankGroups = new Uint32Array(banks * 2);
  let g0 = 0;
  jobs.forEach((job, j) => {
    coef.set(job.coef, g0 * GROUP * 4);
    for (let b = 0; b < 2; b++) {
      const first = g0 + b * job.groups;
      groupBank.fill(2 * j + b, first, first + job.groups);
      bankGroups[2 * (2 * j + b)] = first;
      bankGroups[2 * (2 * j + b) + 1] = job.groups;
    }
    g0 += 2 * job.groups;
  });
  const frames = Math.max(...jobs.map((j) => j.frames));
  const blocks = Math.ceil(frames / BLOCK);

  // Excitation lives in block 0 only (strikes are a few ms); later blocks read a zero buffer.
  const excite0 = new Float32Array(banks * BLOCK);
  jobs.forEach((job, j) => {
    const n = Math.min(BLOCK, job.excite.length);
    excite0.set(job.excite.subarray(0, n), (2 * j) * BLOCK);
    excite0.set(job.excite.subarray(0, n), (2 * j + 1) * BLOCK);
  });

  const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, C = GPUBufferUsage.COPY_SRC;
  const created: GPUBuffer[] = [];
  const buf = (size: number, usage: number) => { const b = device.createBuffer({ size: Math.max(16, size), usage }); created.push(b); return b; };
  const params = buf(16, GPUBufferUsage.UNIFORM | D);
  const coefBuf = buf(coef.byteLength, S | D);
  const state = buf(totalGroups * GROUP * 8, S | D);
  const gbBuf = buf(groupBank.byteLength, S | D);
  const bgBuf = buf(bankGroups.byteLength, S | D);
  const exA = buf(excite0.byteLength, S | D);
  const exZ = buf(excite0.byteLength, S | D);
  const partial = buf(totalGroups * BLOCK * 4, S);
  const out = buf(banks * BLOCK * 4, S | C);
  const result = buf(blocks * banks * BLOCK * 4, GPUBufferUsage.MAP_READ | D);
  const q = device.queue;
  q.writeBuffer(params, 0, new Uint32Array([BLOCK, totalGroups, banks, 0]));
  q.writeBuffer(coefBuf, 0, coef);
  q.writeBuffer(gbBuf, 0, groupBank);
  q.writeBuffer(bgBuf, 0, bankGroups);
  q.writeBuffer(exA, 0, excite0);
  // state and exZ start zeroed (WebGPU zero-initialises buffers).

  const bindModes = (ex: GPUBuffer) => device.createBindGroup({
    layout: gpu.modes.getBindGroupLayout(0),
    entries: [params, coefBuf, state, gbBuf, ex, partial].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const bmA = bindModes(exA), bmZ = bindModes(exZ);
  const br = device.createBindGroup({
    layout: gpu.reduce.getBindGroupLayout(0),
    entries: [[0, params], [5, partial], [6, bgBuf], [7, out]].map(([binding, buffer]) => ({ binding: binding as number, resource: { buffer: buffer as GPUBuffer } })),
  });

  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  const enc = device.createCommandEncoder();
  for (let b = 0; b < blocks; b++) {
    const pass = enc.beginComputePass();
    pass.setPipeline(gpu.modes);
    pass.setBindGroup(0, b === 0 ? bmA : bmZ);
    pass.dispatchWorkgroups(totalGroups);
    pass.setPipeline(gpu.reduce);
    pass.setBindGroup(0, br);
    pass.dispatchWorkgroups(BLOCK / 256, banks);
    pass.end();
    enc.copyBufferToBuffer(out, 0, result, b * banks * BLOCK * 4, banks * BLOCK * 4);
  }
  q.submit([enc.finish()]);
  const oom = await device.popErrorScope();
  const invalid = await device.popErrorScope();
  if (oom || invalid) {
    created.forEach((b) => b.destroy());
    console.warn('[soma deep] GPU batch failed', (oom || invalid)?.message);
    return null;
  }
  try {
    await result.mapAsync(GPUMapMode.READ);
  } catch {
    created.forEach((b) => b.destroy());
    return null;
  }
  const all = new Float32Array(result.getMappedRange());
  // De-interleave [block][bank][BLOCK] into per-job channel-major stereo.
  const outputs = jobs.map((job, j) => {
    const o = new Float32Array(2 * job.frames);
    for (let ch = 0; ch < 2; ch++) {
      const bank = 2 * j + ch;
      for (let b = 0; b * BLOCK < job.frames; b++) {
        const n = Math.min(BLOCK, job.frames - b * BLOCK);
        const src = (b * banks + bank) * BLOCK;
        o.set(all.subarray(src, src + n), ch * job.frames + b * BLOCK);
      }
    }
    return o;
  });
  result.unmap();
  created.forEach((b) => b.destroy());
  return { outputs, gpuMs: performance.now() - t0 };
}
