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
  /** Drive for both banks, from sample 0 (shorter than `frames` = silence after). SOMA's strikes fit
   *  in the first block; TONOS's bridge force runs the whole note (every block gets its slice). */
  excite: Float32Array;
}

export interface ModalBatchResult {
  /** Per job: channel-major stereo, length 2·frames. */
  outputs: Float32Array[];
  gpuMs: number;
}

import { acquireF32Scratch, bucketByFrames, releaseF32Scratch } from './deepUtil';

type Gpu = { device: GPUDevice; modes: GPUComputePipeline; reduce: GPUComputePipeline; label: string };
let gpuPromise: Promise<Gpu | null> | null = null;

type PoolSlot = 'params' | 'coef' | 'state' | 'gb' | 'bg' | 'exA' | 'exZ' | 'partial' | 'out' | 'result';
interface ModalPool {
  buffers: Partial<Record<PoolSlot, { buf: GPUBuffer; size: number; usage: number }>>;
  reduceBind: GPUBindGroup | null;
  exZReady: boolean;
  gen: number;
  modeBinds: Map<number, GPUBindGroup>;
  modeBindsGen: number;
  modeBindsSliceBytes: number;
  paramsU32: Uint32Array;
  chain: Promise<void>;
}
const gpuPools = new WeakMap<GPUDevice, ModalPool>();

function getPool(device: GPUDevice): ModalPool {
  let pool = gpuPools.get(device);
  if (!pool) {
    pool = {
      buffers: {},
      reduceBind: null,
      exZReady: false,
      gen: 1,
      modeBinds: new Map(),
      modeBindsGen: 0,
      modeBindsSliceBytes: 0,
      paramsU32: new Uint32Array(4),
      chain: Promise.resolve(),
    };
    gpuPools.set(device, pool);
    void device.lost?.then(() => releaseDevicePool(device));
  }
  return pool;
}

function releaseDevicePool(device: GPUDevice): void {
  const pool = gpuPools.get(device);
  if (!pool) return;
  for (const k of Object.keys(pool.buffers) as PoolSlot[]) {
    pool.buffers[k]?.buf.destroy();
    delete pool.buffers[k];
  }
  pool.reduceBind = null;
  pool.modeBinds.clear();
  pool.exZReady = false;
  pool.gen++;
}

function acquirePoolBuffer(device: GPUDevice, pool: ModalPool, slot: PoolSlot, bytes: number, usage: number): GPUBuffer {
  const aligned = Math.max(16, Math.ceil(bytes / 16) * 16);
  const cur = pool.buffers[slot];
  if (cur && cur.size >= aligned && (cur.usage & usage) === usage) return cur.buf;
  if (cur) cur.buf.destroy();
  const grow = Math.max(aligned, cur ? Math.ceil(aligned * 1.25) : aligned);
  const buf = device.createBuffer({ size: grow, usage });
  pool.buffers[slot] = { buf, size: grow, usage };
  if (slot === 'params' || slot === 'partial' || slot === 'out') pool.reduceBind = null;
  if (slot !== 'result' && slot !== 'out') {
    pool.gen++;
    if (slot === 'exZ') pool.exZReady = false;
  }
  return buf;
}

/** Destroy all pooled WebGPU buffers held for the modal compute runner (for explicit memory reclamation). */
export async function releaseModalGpuPool(): Promise<void> {
  if (!gpuPromise) return;
  const g = await gpuPromise.catch(() => null);
  if (g) releaseDevicePool(g.device);
}
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
  const pool = getPool(gpu.device);
  let resolveRun!: () => void;
  const prev = pool.chain;
  pool.chain = new Promise<void>((r) => { resolveRun = r; });
  await prev;
  try {
    const indexed = jobs.map((job, index) => ({ job, index }));
    const buckets = bucketByFrames(indexed, (x) => x.job.frames, 1.65);
    const outputs = new Array<Float32Array>(jobs.length);
    let gpuMs = 0;
    for (const { items } of buckets) {
      const sub = await renderModalBucket(gpu, pool, items.map((x) => x.job));
      if (!sub) return null;
      gpuMs += sub.gpuMs;
      items.forEach((item, k) => {
        outputs[item.index] = sub.outputs[k]!;
      });
    }
    return { outputs, gpuMs };
  } finally {
    resolveRun();
  }
}

async function renderModalBucket(gpu: Gpu, pool: ModalPool, jobs: ModalJob[]): Promise<ModalBatchResult | null> {
  const { device } = gpu;
  const t0 = performance.now();

  // Layout: job j owns banks 2j (L) and 2j+1 (R), each with jobs[j].groups contiguous groups.
  const banks = jobs.length * 2;
  const totalGroups = jobs.reduce((a, j) => a + 2 * j.groups, 0);
  const coef = acquireF32Scratch(totalGroups * GROUP * 4);
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

  // Excitation: [block][bank][BLOCK] for the blocks any job still drives; later blocks read a zero
  // buffer. A strike (SOMA) needs one block; a held string (TONOS) needs them all.
  const exBlocks = Math.min(blocks, Math.max(1, ...jobs.map((j) => Math.ceil(j.excite.length / BLOCK))));
  const exFloats = exBlocks * banks * BLOCK;
  const excite0 = acquireF32Scratch(exFloats);
  excite0.fill(0, 0, exFloats);
  jobs.forEach((job, j) => {
    for (let b = 0; b < exBlocks; b++) {
      const a = b * BLOCK, n = Math.min(BLOCK, job.excite.length - a);
      if (n <= 0) break;
      const src = job.excite.subarray(a, a + n);
      excite0.set(src, (b * banks + 2 * j) * BLOCK);
      excite0.set(src, (b * banks + 2 * j + 1) * BLOCK);
    }
  });
  const sliceBytes = banks * BLOCK * 4;
  const coefBytes = totalGroups * GROUP * 4 * 4;
  const exBytes = exFloats * 4;

  const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, C = GPUBufferUsage.COPY_SRC;
  const created: GPUBuffer[] = [];
  const params = acquirePoolBuffer(device, pool, 'params', 16, GPUBufferUsage.UNIFORM | D);
  const coefBuf = acquirePoolBuffer(device, pool, 'coef', coefBytes, S | D);
  const state = acquirePoolBuffer(device, pool, 'state', totalGroups * GROUP * 8, S | D);
  const gbBuf = acquirePoolBuffer(device, pool, 'gb', groupBank.byteLength, S | D);
  const bgBuf = acquirePoolBuffer(device, pool, 'bg', bankGroups.byteLength, S | D);
  const exA = acquirePoolBuffer(device, pool, 'exA', exBytes, S | D);
  const exZ = acquirePoolBuffer(device, pool, 'exZ', sliceBytes, S | D);
  const partial = acquirePoolBuffer(device, pool, 'partial', totalGroups * BLOCK * 4, S);
  const out = acquirePoolBuffer(device, pool, 'out', banks * BLOCK * 4, S | C);
  const result = acquirePoolBuffer(device, pool, 'result', blocks * banks * BLOCK * 4, GPUBufferUsage.MAP_READ | D);
  const q = device.queue;
  pool.paramsU32[0] = BLOCK;
  pool.paramsU32[1] = totalGroups;
  pool.paramsU32[2] = banks;
  pool.paramsU32[3] = 0;
  try {
    q.writeBuffer(params, 0, pool.paramsU32);
    q.writeBuffer(coefBuf, 0, coef.subarray(0, totalGroups * GROUP * 4));
    q.writeBuffer(gbBuf, 0, groupBank);
    q.writeBuffer(bgBuf, 0, bankGroups);
    q.writeBuffer(exA, 0, excite0.subarray(0, exFloats));
  } finally {
    releaseF32Scratch(coef);
    releaseF32Scratch(excite0);
  }
  // state and exZ start zeroed (WebGPU zero-initialises buffers).

  const bindModes = (ex: GPUBuffer, offset: number) => device.createBindGroup({
    layout: gpu.modes.getBindGroupLayout(0),
    entries: [params, coefBuf, state, gbBuf, ex, partial].map((buffer, binding) => ({
      binding, resource: binding === 4 ? { buffer, offset, size: sliceBytes } : { buffer },
    })),
  });
  // Slice offsets are multiples of 16 KB, well past minStorageBufferOffsetAlignment (≤ 256).
  if (pool.modeBindsGen !== pool.gen || pool.modeBindsSliceBytes !== sliceBytes) {
    pool.modeBinds.clear();
    pool.modeBindsGen = pool.gen;
    pool.modeBindsSliceBytes = sliceBytes;
  }
  const bmA: GPUBindGroup[] = [];
  for (let b = 0; b < exBlocks; b++) {
    let bg = pool.modeBinds.get(b);
    if (!bg) {
      bg = bindModes(exA, b * sliceBytes);
      pool.modeBinds.set(b, bg);
    }
    bmA.push(bg);
  }
  let bmZ = pool.modeBinds.get(-1);
  if (!bmZ) {
    bmZ = bindModes(exZ, 0);
    pool.modeBinds.set(-1, bmZ);
  }
  const br = pool.reduceBind ?? (pool.reduceBind = device.createBindGroup({
    layout: gpu.reduce.getBindGroupLayout(0),
    entries: [[0, params], [5, partial], [6, bgBuf], [7, out]].map(([binding, buffer]) => ({ binding: binding as number, resource: { buffer: buffer as GPUBuffer } })),
  }));

  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  const enc = device.createCommandEncoder();
  enc.clearBuffer(state, 0, totalGroups * GROUP * 8);
  if (!pool.exZReady) {
    enc.clearBuffer(exZ);
    pool.exZReady = true;
  }
  for (let b = 0; b < blocks; b++) {
    const pass = enc.beginComputePass();
    pass.setPipeline(gpu.modes);
    pass.setBindGroup(0, b < exBlocks ? bmA[b] : bmZ);
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
    releaseDevicePool(device);
    created.forEach((b) => b.destroy());
    console.warn('[soma deep] GPU batch failed', (oom || invalid)?.message);
    return null;
  }
  try {
    await result.mapAsync(GPUMapMode.READ);
  } catch {
    releaseDevicePool(device);
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
