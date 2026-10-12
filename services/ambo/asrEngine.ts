// asrEngine — hardware-accelerated on-device speech recognition (Whisper) for Ambo.
//
// Two tiers, loaded progressively so captions start fast and then get better:
//   1. QUICK  — Whisper base. Its encoder (fixed 30 s input → perfect for an NPU) runs on the
//               Intel AI Boost NPU through WebNN (DirectML on Windows); the small decoder runs on
//               the GPU. Falls back to GPU-only, then CPU.
//   2. BEST   — Whisper large-v3-turbo on the discrete GPU (WebGPU → D3D12 on the RTX), fp16
//               encoder + 4-bit decoder: near-studio accuracy, many times faster than real time.
//               Downloaded once in the background (cached by the browser), swapped in live.
//
// Consumers call `getAsr()` for the best engine ready right now and `ensureAsr()` to start loading.
// `getAsrInfo()` says which model and which silicon is actually doing the work (shown in the UI).

export type AsrTier = 'best' | 'quick';
export interface AsrInfo {
  tier: AsrTier | 'none';
  model: string;
  /** e.g. "NPU encoder + GPU decoder", "GPU (WebGPU)", "CPU (WASM)" */
  device: string;
  /** Human label, e.g. "Whisper Turbo · NVIDIA GPU". */
  label: string;
  loading: string;          // what is downloading right now ('' when idle)
  progress: number;         // 0..1 of the current download
  error: string;
}
export interface AsrChunk { text: string; start: number; end: number }
export interface AsrEngine {
  info: AsrInfo;
  /** `background` jobs (track lyrics) yield to live caption passes. */
  transcribe(pcm16k: Float32Array, opts?: { timestamps?: boolean; background?: boolean }): Promise<{ text: string; chunks: AsrChunk[] }>;
}

export interface HwProbe { gpu: boolean; gpuName: string; gpuF16: boolean; discrete: boolean; npu: boolean }

let info: AsrInfo = { tier: 'none', model: '', device: '', label: 'Not loaded', loading: '', progress: 0, error: '' };
const subs = new Set<() => void>();
const setInfo = (p: Partial<AsrInfo>) => { info = { ...info, ...p }; subs.forEach(f => { try { f(); } catch { /* */ } }); };
export const getAsrInfo = () => info;
export const subscribeAsr = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

let quick: AsrEngine | null = null;
let best: AsrEngine | null = null;
/** The best engine loaded so far (null until the quick tier is ready). */
export const getAsr = (): AsrEngine | null => best || quick;
/** The fast tier (NPU encoder when available) — used for the rapid interim passes. */
export const getQuickAsr = (): AsrEngine | null => quick || best;

// ── hardware probe ──────────────────────────────────────────────────────────
let probeP: Promise<HwProbe> | null = null;
export function probeHardware(): Promise<HwProbe> {
  if (probeP) return probeP;
  probeP = (async () => {
    const r: HwProbe = { gpu: false, gpuName: '', gpuF16: false, discrete: false, npu: false };
    try {
      const gpu = (navigator as any).gpu;
      const ad = gpu && await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (ad) {
        r.gpu = true;
        r.gpuF16 = ad.features?.has?.('shader-f16') ?? false;
        const i = ad.info || (await ad.requestAdapterInfo?.().catch(() => null)) || {};
        r.gpuName = [i.vendor, i.architecture, i.description].filter(Boolean).join(' ').trim();
        r.discrete = /nvidia|amd|radeon|geforce|rtx/i.test(r.gpuName) || (ad.limits?.maxBufferSize ?? 0) > 2 ** 31;
      }
    } catch { /* no WebGPU */ }
    try {
      const ml = (navigator as any).ml;
      if (ml?.createContext) { const ctx = await ml.createContext({ deviceType: 'npu' }); r.npu = !!ctx; }
    } catch { /* no WebNN NPU */ }
    console.info('[asr] hardware', r);
    return r;
  })();
  return probeP;
}

// ── loading ─────────────────────────────────────────────────────────────────
let tfP: Promise<any> | null = null;
async function tf(): Promise<any> {
  if (!tfP) tfP = (async () => {
    const m: any = await import('@huggingface/transformers');
    try { m.env.backends.onnx.webgpu = { ...(m.env.backends.onnx.webgpu || {}), powerPreference: 'high-performance' }; } catch { /* */ }
    try { m.env.allowLocalModels = false; } catch { /* */ }
    return m;
  })();
  return tfP;
}

const vendorLabel = (hw: HwProbe) => /nvidia|geforce|rtx/i.test(hw.gpuName) ? 'NVIDIA GPU' : /amd|radeon/i.test(hw.gpuName) ? 'AMD GPU' : /intel/i.test(hw.gpuName) ? 'Intel GPU' : 'GPU';

function wrap(pipe: any, meta: Omit<AsrInfo, 'loading' | 'progress' | 'error'>): AsrEngine {
  // One inference at a time per engine, two lanes: live captions first, background (track lyrics) after.
  type Job = { run: () => Promise<void> };
  const live: Job[] = [], bg: Job[] = [];
  let running = false;
  const pump = () => {
    if (running) return;
    const job = live.shift() || bg.shift();
    if (!job) return;
    running = true;
    void job.run().finally(() => { running = false; pump(); });
  };
  return {
    info: { ...meta, loading: '', progress: 0, error: '' },
    transcribe(pcm, opts = {}) {
      return new Promise((resolve, reject) => {
        const run = async () => {
          try {
            const out = await pipe(pcm, {
              language: 'english', task: 'transcribe',
              return_timestamps: !!opts.timestamps,
              chunk_length_s: pcm.length > 16000 * 30 ? 30 : undefined,
              stride_length_s: pcm.length > 16000 * 30 ? 5 : undefined,
            });
            const o = Array.isArray(out) ? out[0] : out;
            const chunks: AsrChunk[] = (o?.chunks || []).map((c: any) => ({
              text: String(c.text || ''), start: Number(c.timestamp?.[0] ?? 0), end: Number(c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0),
            }));
            resolve({ text: String(o?.text || '').trim(), chunks });
          } catch (e) { reject(e); }
        };
        (opts.background ? bg : live).push({ run });
        pump();
      });
    },
  };
}

const progressCb = (label: string) => (d: any) => {
  if (d?.status === 'progress' && typeof d.progress === 'number') setInfo({ loading: label, progress: Math.min(1, d.progress / 100) });
};

/** Warm the graph so the first real utterance isn't slow (shader compile / NPU graph build). */
async function warm(e: AsrEngine) { try { await e.transcribe(new Float32Array(16000)); } catch { /* */ } }

let quickP: Promise<AsrEngine> | null = null;
function loadQuick(hw: HwProbe): Promise<AsrEngine> {
  if (quickP) return quickP;
  quickP = (async () => {
    const t = await tf();
    const model = 'onnx-community/whisper-base';
    type Cfg = { device: any; dtype: any; label: string; session_options?: any };
    const cfgs: Cfg[] = [];
    if (hw.npu) cfgs.push({
      device: { encoder_model: 'webnn-npu', decoder_model_merged: hw.gpu ? 'webgpu' : 'wasm' },
      dtype: { encoder_model: 'fp16', decoder_model_merged: hw.gpu ? 'q4' : 'q8' },
      session_options: { freeDimensionOverrides: { batch_size: 1 } },
      label: `NPU encoder + ${hw.gpu ? 'GPU' : 'CPU'} decoder`,
    });
    if (hw.gpu) cfgs.push({ device: 'webgpu', dtype: { encoder_model: hw.gpuF16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' }, label: `${vendorLabel(hw)} (WebGPU)` });
    cfgs.push({ device: 'wasm', dtype: 'q8', label: 'CPU (WASM)' });
    let lastErr: unknown;
    for (const c of cfgs) {
      try {
        setInfo({ loading: 'Whisper base', progress: 0 });
        const pipe = await t.pipeline('automatic-speech-recognition', model, {
          device: c.device, dtype: c.dtype, session_options: c.session_options, progress_callback: progressCb('Whisper base'),
        });
        const e = wrap(pipe, { tier: 'quick', model, device: c.label, label: `Whisper Base · ${c.label}` });
        await warm(e);
        quick = e;
        if (!best) setInfo({ ...e.info, loading: info.loading === 'Whisper base' ? '' : info.loading });
        return e;
      } catch (err) { lastErr = err; console.warn('[asr] quick config failed', c.label, err); }
    }
    throw lastErr || new Error('No speech model could be loaded');
  })().catch(e => { quickP = null; setInfo({ error: String((e as Error)?.message || e) }); throw e; });
  return quickP;
}

let bestP: Promise<AsrEngine | null> | null = null;
function loadBest(hw: HwProbe): Promise<AsrEngine | null> {
  if (bestP) return bestP;
  // Large-v3-turbo needs a real GPU with fp16; on anything less the quick tier IS the best tier.
  if (!hw.gpu || !hw.gpuF16) return (bestP = Promise.resolve(null));
  bestP = (async () => {
    const t = await tf();
    const model = 'onnx-community/whisper-large-v3-turbo';
    try {
      setInfo({ loading: 'Whisper Turbo', progress: 0 });
      const pipe = await t.pipeline('automatic-speech-recognition', model, {
        device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' }, progress_callback: progressCb('Whisper Turbo'),
      });
      const e = wrap(pipe, { tier: 'best', model, device: `${vendorLabel(hw)} (WebGPU)`, label: `Whisper Turbo · ${vendorLabel(hw)}` });
      await warm(e);
      best = e;
      setInfo({ ...e.info, loading: '' });
      return e;
    } catch (err) {
      console.warn('[asr] turbo unavailable', err);
      setInfo({ loading: '' });
      return null;
    }
  })();
  return bestP;
}

/**
 * Start loading (idempotent). Resolves as soon as ANY engine is usable — the quick one — while the
 * turbo model keeps downloading in the background and replaces it when ready.
 */
export async function ensureAsr(): Promise<AsrEngine> {
  const hw = await probeHardware();
  const q = loadQuick(hw);
  void loadBest(hw);
  if (best) return best;
  return q;
}

/** Resolves with turbo when available (or the quick engine on hardware that can't run turbo). */
export async function ensureBestAsr(): Promise<AsrEngine> {
  const hw = await probeHardware();
  const b = await loadBest(hw);
  return b || loadQuick(hw);
}
