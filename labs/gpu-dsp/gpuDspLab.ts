// Browser WebGPU harness for Chora's GPU DSP kernels. Runs the exact WGSL files the native crate
// uses (rust/plajah-gpu-dsp/src/shaders), checks them against a JS port of the CPU reference, and
// benchmarks render-ahead blocks. Results land in the page and on window.gpuDspLab.
import modalWgsl from '../../rust/plajah-gpu-dsp/src/shaders/modal.wgsl?raw';
import convWgsl from '../../rust/plajah-gpu-dsp/src/shaders/conv.wgsl?raw';

const SR = 48000;
const GROUP = 64;
const $ = (id: string) => document.getElementById(id)!;
const log = (s: string) => { $('log').textContent += s + '\n'; };

type Results = { adapter: string; match: Record<string, number>; bench: Record<string, unknown>[] };
const results: Results = { adapter: '', match: {}, bench: [] };
(window as any).gpuDspLab = results;

function noise(seed: number, n: number): Float32Array {
  let s = Math.max(1, Math.imul(seed, 2654435761) >>> 0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    out[i] = (s / 4294967295) * 2 - 1;
  }
  return out;
}

function relErr(a: Float32Array, b: Float32Array): number {
  let peak = 1e-12, e = 0;
  for (let i = 0; i < b.length; i++) { peak = Math.max(peak, Math.abs(b[i])); e = Math.max(e, Math.abs(a[i] - b[i])); }
  return e / peak;
}

// ---------------------------------------------------------------- GPU plumbing

let device: GPUDevice;

function storage(bytes: number, extra = 0): GPUBuffer {
  return device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extra });
}
function uniform(bytes: number): GPUBuffer {
  return device.createBuffer({ size: bytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}
function pipe(module: GPUShaderModule, entry: string): GPUComputePipeline {
  return device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: entry } });
}
function bind(p: GPUComputePipeline, all: [number, GPUBuffer][], used: number[]): GPUBindGroup {
  return device.createBindGroup({
    layout: p.getBindGroupLayout(0),
    entries: all.filter(([b]) => used.includes(b)).map(([binding, buffer]) => ({ binding, resource: { buffer } })),
  });
}
async function readback(src: GPUBuffer, bytes: number, enc: GPUCommandEncoder, staging: GPUBuffer): Promise<Float32Array> {
  enc.copyBufferToBuffer(src, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ, 0, bytes);
  const out = new Float32Array(staging.getMappedRange(0, bytes).slice(0));
  staging.unmap();
  return out;
}

// ---------------------------------------------------------------- Modal bank

type Mode = { f: number; t60: number; g: number };
type ModalLayout = { coef: Float32Array; groupBank: Uint32Array; bankGroups: Uint32Array; banks: number; groups: number };

function modalLayout(banks: Mode[][]): ModalLayout {
  const coef: number[] = [], groupBank: number[] = [], bankGroups: number[] = [];
  banks.forEach((modes, b) => {
    const groups = Math.max(1, Math.ceil(modes.length / GROUP));
    bankGroups.push(groupBank.length, groups);
    for (let i = 0; i < groups; i++) groupBank.push(b);
    for (const m of modes) {
      const w = (2 * Math.PI * m.f) / SR, r = Math.pow(10, -3 / (Math.max(1e-4, m.t60) * SR));
      coef.push(r * Math.cos(w), r * Math.sin(w), m.g, 0);
    }
    while (coef.length < groupBank.length * GROUP * 4) coef.push(0);
  });
  return { coef: new Float32Array(coef), groupBank: new Uint32Array(groupBank), bankGroups: new Uint32Array(bankGroups), banks: banks.length, groups: groupBank.length };
}

/** JS port of ModalCpu::render: same recurrence, same 8-lane + tree sum. */
function modalCpu(L: ModalLayout, state: Float32Array, x: Float32Array, n: number): Float32Array {
  const out = new Float32Array(L.banks * n);
  const c = new Float32Array(GROUP), s = new Float32Array(GROUP), k = new Float32Array(GROUP);
  const re = new Float32Array(GROUP), im = new Float32Array(GROUP), lane = new Float32Array(8);
  for (let g = 0; g < L.groups; g++) {
    const m0 = g * GROUP, bank = L.groupBank[g];
    for (let t = 0; t < GROUP; t++) {
      c[t] = L.coef[(m0 + t) * 4]; s[t] = L.coef[(m0 + t) * 4 + 1]; k[t] = L.coef[(m0 + t) * 4 + 2];
      re[t] = state[(m0 + t) * 2]; im[t] = state[(m0 + t) * 2 + 1];
    }
    for (let i = 0; i < n; i++) {
      const xi = x[bank * n + i];
      for (let t = 0; t < GROUP; t++) {
        const nre = (c[t] * re[t] - s[t] * im[t]) + k[t] * xi;
        im[t] = s[t] * re[t] + c[t] * im[t];
        re[t] = nre;
      }
      lane.fill(0);
      for (let j = 0; j < GROUP; j += 8) for (let q = 0; q < 8; q++) lane[q] += im[j + q];
      out[bank * n + i] += ((lane[0] + lane[1]) + (lane[2] + lane[3])) + ((lane[4] + lane[5]) + (lane[6] + lane[7]));
    }
    for (let t = 0; t < GROUP; t++) { state[(m0 + t) * 2] = re[t]; state[(m0 + t) * 2 + 1] = im[t]; }
  }
  return out;
}

class ModalGpu {
  params = uniform(16); excite: GPUBuffer; out: GPUBuffer; staging: GPUBuffer;
  modes: GPUComputePipeline; reduce: GPUComputePipeline; bm: GPUBindGroup; br: GPUBindGroup;
  constructor(public L: ModalLayout, maxN: number) {
    const modes = L.groups * GROUP;
    const coef = storage(modes * 16), state = storage(modes * 8), gb = storage(L.groups * 4), bg = storage(L.banks * 8);
    const partial = storage(L.groups * maxN * 4);
    this.excite = storage(L.banks * maxN * 4);
    this.out = storage(L.banks * maxN * 4, GPUBufferUsage.COPY_SRC);
    this.staging = device.createBuffer({ size: L.banks * maxN * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(coef, 0, L.coef);
    device.queue.writeBuffer(gb, 0, L.groupBank);
    device.queue.writeBuffer(bg, 0, L.bankGroups);
    const module = device.createShaderModule({ code: modalWgsl });
    this.modes = pipe(module, 'modes');
    this.reduce = pipe(module, 'reduce');
    const all: [number, GPUBuffer][] = [[0, this.params], [1, coef], [2, state], [3, gb], [4, this.excite], [5, partial], [6, bg], [7, this.out]];
    this.bm = bind(this.modes, all, [0, 1, 2, 3, 4, 5]);
    this.br = bind(this.reduce, all, [0, 5, 6, 7]);
  }
  render(x: Float32Array, n: number): Promise<Float32Array> {
    const L = this.L;
    device.queue.writeBuffer(this.params, 0, new Uint32Array([n, L.groups, L.banks, 0]));
    device.queue.writeBuffer(this.excite, 0, x);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.modes); pass.setBindGroup(0, this.bm); pass.dispatchWorkgroups(L.groups);
    pass.setPipeline(this.reduce); pass.setBindGroup(0, this.br); pass.dispatchWorkgroups(Math.ceil(n / 256), L.banks);
    pass.end();
    return readback(this.out, L.banks * n * 4, enc, this.staging);
  }
}

// ---------------------------------------------------------------- FFT + convolution

/** Mirrors fft.rs / fft_in_place in conv.wgsl. Interleaved re/im. */
class Fft {
  log2n: number; tw: Float32Array; rev: Uint32Array;
  constructor(public n: number) {
    this.log2n = Math.log2(n);
    this.tw = new Float32Array(n);
    for (let j = 0; j < n / 2; j++) { const a = (-2 * Math.PI * j) / n; this.tw[2 * j] = Math.cos(a); this.tw[2 * j + 1] = Math.sin(a); }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < this.log2n; b++) r |= ((i >> b) & 1) << (this.log2n - 1 - b); this.rev[i] = r; }
  }
  inPlace(buf: Float32Array) {
    const { n, tw } = this;
    for (let s = 1; s <= this.log2n; s++) {
      const half = 1 << (s - 1), stride = n >> s;
      for (let b = 0; b < n / 2; b++) {
        const j = b & (half - 1), i0 = ((b >> (s - 1)) << s) + j, i1 = i0 + half;
        const wr = tw[2 * j * stride], wi = tw[2 * j * stride + 1];
        const xr = buf[2 * i1], xi = buf[2 * i1 + 1];
        const vr = xr * wr - xi * wi, vi = xr * wi + xi * wr;
        const ar = buf[2 * i0], ai = buf[2 * i0 + 1];
        buf[2 * i0] = ar + vr; buf[2 * i0 + 1] = ai + vi;
        buf[2 * i1] = ar - vr; buf[2 * i1 + 1] = ai - vi;
      }
    }
  }
  forwardReal(win: Float32Array, buf: Float32Array, bins: Float32Array, off: number) {
    for (let i = 0; i < this.n; i++) { buf[2 * i] = win[this.rev[i]]; buf[2 * i + 1] = 0; }
    this.inPlace(buf);
    bins.set(buf.subarray(0, this.n + 2), off);
  }
  inverseTail(bins: Float32Array, off: number, buf: Float32Array, out: Float32Array, outOff: number) {
    const n = this.n, nb = n / 2 + 1;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j < nb) { buf[2 * i] = bins[off + 2 * j]; buf[2 * i + 1] = -bins[off + 2 * j + 1]; }
      else { buf[2 * i] = bins[off + 2 * (n - j)]; buf[2 * i + 1] = bins[off + 2 * (n - j) + 1]; }
    }
    this.inPlace(buf);
    const scale = 1 / n;
    for (let i = 0; i < n / 2; i++) out[outOff + i] = buf[2 * (n / 2 + i)] * scale;
  }
}

function convShader(fftN: number): string {
  return `const FFT_N: u32 = ${fftN}u;\nconst LOG2_N: u32 = ${Math.log2(fftN)}u;\nconst WG: u32 = ${Math.min(256, fftN / 2)}u;\nconst BINS: u32 = ${fftN / 2 + 1}u;\n${convWgsl}`;
}

/** IR spectra [ch][P][bins] (interleaved), as ConvIr::new. */
function irSpectra(B: number, irs: Float32Array[]) {
  const fft = new Fft(2 * B), bins = B + 1;
  const P = Math.max(1, ...irs.map((h) => Math.ceil(h.length / B)));
  const spec = new Float32Array(irs.length * P * bins * 2);
  const win = new Float32Array(2 * B), buf = new Float32Array(4 * B);
  irs.forEach((h, ch) => {
    for (let p = 0; p < P; p++) {
      win.fill(0);
      win.set(h.subarray(p * B, Math.min(h.length, (p + 1) * B)));
      fft.forwardReal(win, buf, spec, (ch * P + p) * bins * 2);
    }
  });
  return { P, spec, fft };
}

/** JS port of ConvCpu (block-by-block UPOLS). */
class ConvCpu {
  fdl: Float32Array; head = 0; prev: Float32Array; buf: Float32Array; win: Float32Array; acc: Float32Array;
  constructor(public B: number, public chs: number, public P: number, public H: Float32Array, public fft: Fft) {
    const bins = B + 1;
    this.fdl = new Float32Array(chs * P * bins * 2);
    this.prev = new Float32Array(chs * B);
    this.buf = new Float32Array(4 * B); this.win = new Float32Array(2 * B); this.acc = new Float32Array(bins * 2);
  }
  process(x: Float32Array, M: number): Float32Array {
    const { B, P } = this, bins = B + 1, total = M * B, out = new Float32Array(this.chs * total);
    for (let m = 0; m < M; m++) {
      this.head = (this.head + 1) % P;
      for (let ch = 0; ch < this.chs; ch++) {
        this.win.set(this.prev.subarray(ch * B, ch * B + B), 0);
        const xs = x.subarray(ch * total + m * B, ch * total + m * B + B);
        this.win.set(xs, B);
        this.prev.set(xs, ch * B);
        this.fft.forwardReal(this.win, this.buf, this.fdl, (ch * P + this.head) * bins * 2);
        const acc = this.acc; acc.fill(0);
        for (let p = 0; p < P; p++) {
          const xo = (ch * P + ((this.head + P - p) % P)) * bins * 2, ho = (ch * P + p) * bins * 2;
          for (let k = 0; k < 2 * bins; k += 2) {
            const a = this.fdl[xo + k], b = this.fdl[xo + k + 1], c = this.H[ho + k], d = this.H[ho + k + 1];
            acc[k] += a * c - b * d; acc[k + 1] += a * d + b * c;
          }
        }
        this.fft.inverseTail(acc, 0, this.buf, out, ch * total + m * B);
      }
    }
    return out;
  }
}

class ConvGpu {
  params = uniform(32); input: GPUBuffer; out: GPUBuffer; staging: GPUBuffer;
  pipes: GPUComputePipeline[]; binds: GPUBindGroup[]; ring: number; next = 0; prev: Float32Array; primed = false;
  constructor(public B: number, public chs: number, public P: number, H: Float32Array, fft: Fft, public maxM: number) {
    const bins = B + 1;
    this.ring = P - 1 + maxM;
    const tw = storage(fft.tw.byteLength);
    device.queue.writeBuffer(tw, 0, fft.tw);
    this.input = storage(chs * (P + maxM) * B * 4);
    const spectra = storage(chs * this.ring * bins * 8), ir = storage(H.byteLength), yspec = storage(chs * maxM * bins * 8);
    this.out = storage(chs * maxM * B * 4, GPUBufferUsage.COPY_SRC);
    this.staging = device.createBuffer({ size: chs * maxM * B * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ir, 0, H);
    const module = device.createShaderModule({ code: convShader(2 * B) });
    this.pipes = ['fwd', 'mac', 'inv'].map((e) => pipe(module, e));
    const all: [number, GPUBuffer][] = [[0, this.params], [1, tw], [2, this.input], [3, spectra], [4, ir], [5, yspec], [6, this.out]];
    this.binds = [bind(this.pipes[0], all, [0, 1, 2, 3]), bind(this.pipes[1], all, [0, 3, 4, 5]), bind(this.pipes[2], all, [0, 1, 5, 6])];
    this.prev = new Float32Array(chs * B);
  }
  process(x: Float32Array, M: number): Promise<Float32Array> {
    const { B, P, chs } = this, total = M * B;
    // First call: the ring is empty, so transform P - 1 segments of (silent) history too.
    const lead = this.primed ? B : P * B, segs = M + (this.primed ? 0 : P - 1);
    const slot0 = (this.next + this.ring - (segs - M)) % this.ring;
    const staged = new Float32Array(chs * (lead + total));
    for (let ch = 0; ch < chs; ch++) {
      staged.set(this.prev.subarray(ch * B, ch * B + B), ch * (lead + total) + lead - B);
      staged.set(x.subarray(ch * total, ch * total + total), ch * (lead + total) + lead);
      this.prev.set(x.subarray(ch * total + total - B, ch * total + total), ch * B);
    }
    device.queue.writeBuffer(this.params, 0, new Uint32Array([B, P, this.ring, segs, slot0, M, this.next, chs]));
    device.queue.writeBuffer(this.input, 0, staged);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipes[0]); pass.setBindGroup(0, this.binds[0]); pass.dispatchWorkgroups(segs, chs);
    pass.setPipeline(this.pipes[1]); pass.setBindGroup(0, this.binds[1]); pass.dispatchWorkgroups(Math.ceil((B + 1) / 64), M, chs);
    pass.setPipeline(this.pipes[2]); pass.setBindGroup(0, this.binds[2]); pass.dispatchWorkgroups(M, chs);
    pass.end();
    this.next = (this.next + M) % this.ring;
    this.primed = true;
    return readback(this.out, chs * total * 4, enc, this.staging);
  }
}

// ---------------------------------------------------------------- Runs

function modalBanks(banks: number, per: number, f0 = 50, step = 13): Mode[][] {
  return Array.from({ length: banks }, (_, b) =>
    Array.from({ length: per }, (_, i) => ({ f: Math.min(20000, (f0 + step * b) * (1 + i * 0.913)), t60: 0.3 + 4 / (1 + i * 0.03), g: 1 / (1 + i * 0.05) })));
}

function decayingIrs(chs: number, len: number): Float32Array[] {
  return Array.from({ length: chs }, (_, c) => { const h = noise(10 + c, len); for (let i = 0; i < len; i++) h[i] *= Math.exp(-i / (len * 0.25)); return h; });
}

async function matchChecks() {
  // Modal: 6 banks × 100 modes (padded groups), 4 blocks with an impulse then noise.
  const L = modalLayout(modalBanks(6, 100, 60, 37)), n = 2048;
  const gpu = new ModalGpu(L, n), state = new Float32Array(L.groups * GROUP * 2);
  let worst = 0;
  for (let blk = 0; blk < 4; blk++) {
    const x = noise(blk * 31 + 7, L.banks * n).map((v) => v * 0.01);
    if (blk === 0) for (let b = 0; b < L.banks; b++) x[b * n] = 1;
    worst = Math.max(worst, relErr(await gpu.render(x, n), modalCpu(L, state, x, n)));
  }
  results.match.modal = worst;
  // Convolution: B = 256, stereo, ~9.1 partitions, uneven calls.
  const B = 256, chs = 2, irs = decayingIrs(chs, 256 * 9 + 17), { P, spec, fft } = irSpectra(B, irs);
  const cpu = new ConvCpu(B, chs, P, spec, fft), cg = new ConvGpu(B, chs, P, spec, fft, 8);
  worst = 0;
  for (const [call, M] of [3, 8, 1, 5].entries()) {
    const x = noise(call + 50, chs * M * B);
    worst = Math.max(worst, relErr(await cg.process(x, M), cpu.process(x, M)));
  }
  results.match.conv = worst;
  log(`match (max error / peak): modal ${results.match.modal.toExponential(2)}, conv ${results.match.conv.toExponential(2)}`);
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

async function timeGpu(run: () => Promise<unknown>, reps = 12) {
  for (let i = 0; i < 2; i++) await run();
  const t: number[] = [];
  for (let i = 0; i < reps; i++) { const t0 = performance.now(); await run(); t.push(performance.now() - t0); }
  return { med: median(t), max: Math.max(...t) };
}

function row(name: string, audioMs: number, cpuMs: number, g: { med: number; max: number }) {
  const r = { name, audioMs, cpuMs, cpuRT: (cpuMs / audioMs) * 100, gpuMs: g.med, gpuWorstMs: g.max, gpuRT: (g.med / audioMs) * 100, speedup: cpuMs / g.med };
  results.bench.push(r);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${name}</td><td>${audioMs.toFixed(0)}</td><td>${cpuMs.toFixed(1)} (${r.cpuRT.toFixed(0)}%)</td><td>${g.med.toFixed(2)} (${r.gpuRT.toFixed(1)}%)</td><td>${g.max.toFixed(2)}</td><td>${r.speedup.toFixed(1)}×</td>`;
  $('rows').appendChild(tr);
}

async function bench() {
  const n = 8192, audioMs = (n / SR) * 1000;
  // Warm the JS reference so the timings below are JIT-compiled code, not the interpreter.
  { const L = modalLayout(modalBanks(4, 64)); modalCpu(L, new Float32Array(L.groups * GROUP * 2), noise(3, L.banks * n), n); }
  { const { P, spec, fft } = irSpectra(512, decayingIrs(1, 512 * 8)); new ConvCpu(512, 1, P, spec, fft).process(noise(4, 512 * 16), 16); }
  for (const [banks, per] of [[16, 64], [16, 256], [64, 256], [128, 512]]) {
    const L = modalLayout(modalBanks(banks, per)), x = noise(1, L.banks * n);
    const state = new Float32Array(L.groups * GROUP * 2);
    const t0 = performance.now(); modalCpu(L, state, x, n); const cpuMs = performance.now() - t0;
    const gpu = new ModalGpu(L, n);
    row(`modal ${L.groups * GROUP} modes (${banks}×${per})`, audioMs, cpuMs, await timeGpu(() => gpu.render(x, n)));
    await new Promise((r) => setTimeout(r, 0));
  }
  const B = 512, M = 16;
  for (const [secs, chs, label] of [[2, 2, '2 s stereo reverb'], [6, 2, '6 s stereo hall'], [2, 16, '8 stereo sends × 2 s'], [10, 4, '10 s true-stereo']] as const) {
    const irs = decayingIrs(chs, secs * SR), { P, spec, fft } = irSpectra(B, irs), x = noise(2, chs * M * B);
    const cpu = new ConvCpu(B, chs, P, spec, fft);
    const t0 = performance.now(); cpu.process(x, M); const cpuMs = performance.now() - t0;
    const g = new ConvGpu(B, chs, P, spec, fft, M);
    row(`conv ${label} (P=${P})`, audioMs, cpuMs, await timeGpu(() => g.process(x, M)));
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function main() {
  const power = (new URLSearchParams(location.search).get('power') ?? 'high-performance') as GPUPowerPreference;
  if (!('gpu' in navigator)) { log('WebGPU is not available in this browser.'); (results as any).error = 'no-webgpu'; return; }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: power });
  if (!adapter) { log('No WebGPU adapter.'); (results as any).error = 'no-adapter'; return; }
  // adapter.info is newer than the repo's @webgpu/types.
  const info: { vendor?: string; architecture?: string; description?: string } = (adapter as any).info ?? {};
  results.adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') + ` (${power})`;
  $('adapter').textContent = results.adapter;
  device = await adapter.requestDevice({
    requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
  });
  device.lost.then((l) => log(`device lost: ${l.message}`));
  device.addEventListener('uncapturederror', (e) => log(`GPU error: ${(e as GPUUncapturedErrorEvent).error.message}`));
  await matchChecks();
  await bench();
  (results as any).done = true;
  log('done');
}

main().catch((e) => { log(String(e?.stack ?? e)); (results as any).error = String(e); });
