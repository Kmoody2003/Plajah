// asrEngine — hardware-accelerated on-device speech recognition (Whisper) for Ambo.
//
// Inference runs in Workers (asr.worker.ts → asrCore.ts) so the UI and the audio capture
// never stall; this module is the main-thread handle with the API the rest of Ambo uses:
// `ensureAsr()` to start loading, `getAsr()` for the best engine ready right now,
// `getLiveAsr()` for the one to use for sub-second live passes, `getAsrInfo()` for the UI.
//
// Two tiers, loaded ONE AFTER THE OTHER (loading both at once halved each download and
// made the first captions take minutes), each in ITS OWN worker — this ONNX Runtime build
// refuses to create a second Whisper decoder session in an instance that already built one.
//   quick  Whisper base.en (English-only: markedly better than multilingual base on English
//          speech — book names, numbers). GPU via WebGPU; CPU (WASM) when there is none.
//   best   Whisper small.en on an integrated GPU, large-v3-turbo on a discrete one. Loaded
//          in the background and used for the final pass of each utterance.
//
// Every loaded engine is SELF-CHECKED on a bundled one-second clip before it is trusted.
// fp16 Whisper encoders produce garbage on some GPUs (Intel Arc/Xe via WebGPU: every pass
// came back as "I"), so when fp16 fails the check the engine is rebuilt with an fp32
// encoder; the verdict is remembered per GPU so later sessions skip straight to what works.
//
// NPU (experimental): when Chrome exposes WebNN with an NPU (`navigator.ml`, behind
// chrome://flags/#web-machine-learning-neural-network on Intel Core Ultra), the quick and
// live tiers first try the encoder on the NPU (fp16, static shapes) with the q4 decoder on
// WebGPU, so the encoder's share of each pass stops competing with the visualizer for the
// GPU. The same self-check gates it; its verdict is remembered as `pj.asr.npu.<gpu>`.

import { encoderDeviceOf, type AsrLoadPlan } from './asrCore';

export type AsrTier = 'best' | 'quick';
export interface AsrInfo {
  tier: AsrTier | 'none';
  model: string;
  /** e.g. "Intel GPU (WebGPU)", "CPU (WASM)" */
  device: string;
  /** Human label, e.g. "Whisper Small.en · NVIDIA GPU". */
  label: string;
  loading: string;          // what is downloading right now ('' when idle)
  progress: number;         // 0..1 of the current download
  error: string;
}
export interface AsrChunk { text: string; start: number; end: number }
export interface AsrEngine {
  info: AsrInfo;
  /** Milliseconds one pass takes on this machine (measured on the self-check clip). */
  passMs: number;
  /** `background` jobs (track lyrics) yield to live caption passes. */
  transcribe(pcm16k: Float32Array, opts?: { timestamps?: boolean; background?: boolean }): Promise<{ text: string; chunks: AsrChunk[]; ms: number }>;
  /** Release the model and its worker. */
  dispose?: () => void;
}

export interface HwProbe { gpu: boolean; gpuName: string; gpuF16: boolean; discrete: boolean; npu: boolean }

let info: AsrInfo = { tier: 'none', model: '', device: '', label: 'Not loaded', loading: '', progress: 0, error: '' };
const subs = new Set<(i: AsrInfo) => void>();
const setInfo = (p: Partial<AsrInfo>) => { info = { ...info, ...p }; subs.forEach(f => { try { f(info); } catch { /* */ } }); };
export const getAsrInfo = () => info;
export const subscribeAsr = (fn: (i: AsrInfo) => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

let quick: AsrEngine | null = null;
let best: AsrEngine | null = null;
/** The best engine loaded so far (null until the quick tier is ready). */
export const getAsr = (): AsrEngine | null => best || quick;
/** The fast tier. */
export const getQuickAsr = (): AsrEngine | null => quick || best;
/** Live passes need an answer well inside a second; the best tier is used only when it is that fast. */
export const LIVE_PASS_BUDGET_MS = 700;
/** A best tier slower than this per pass is not worth the GPU time it steals from live passes. */
export const BEST_PASS_LIMIT_MS = 3000;
export const getLiveAsr = (): AsrEngine | null => (best && best.passMs <= LIVE_PASS_BUDGET_MS ? best : quick) || best;

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
        r.discrete = /nvidia|amd|radeon|geforce|rtx|rx\s?\d/i.test(r.gpuName);
      }
    } catch { /* no WebGPU */ }
    try {
      // WebNN: `navigator.ml.createContext({ deviceType: 'npu' })` resolves only when an NPU
      // backend is actually available (Intel AI Boost today). Non-fatal: no flag → no `ml`.
      const ml = (navigator as any).ml;
      if (ml?.createContext) {
        const ctx = await Promise.race([
          ml.createContext({ deviceType: 'npu' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('WebNN probe timed out')), 4000)),
        ]);
        r.npu = !!ctx;
        try { (ctx as any)?.destroy?.(); } catch { /* */ }
      }
    } catch (e) { console.info('[asr] no WebNN NPU:', String((e as Error)?.message || e)); }
    console.info('[asr] hardware', r);
    return r;
  })();
  return probeP;
}

const vendorLabel = (hw: HwProbe) => /nvidia|geforce|rtx/i.test(hw.gpuName) ? 'NVIDIA GPU' : /amd|radeon/i.test(hw.gpuName) ? 'AMD GPU' : /intel/i.test(hw.gpuName) ? 'Intel GPU' : 'GPU';

// fp16 verdict per GPU, remembered across sessions.
const fp16Key = (hw: HwProbe) => `pj.asr.fp16.${hw.gpuName || 'gpu'}`;
const fp16Verdict = (hw: HwProbe): 'ok' | 'bad' | null => { try { return (localStorage.getItem(fp16Key(hw)) as any) || null; } catch { return null; } };
const rememberFp16 = (hw: HwProbe, v: 'ok' | 'bad') => { try { localStorage.setItem(fp16Key(hw), v); } catch { /* */ } };
// NPU (WebNN) verdict, keyed by GPU too: the decoder half of the plan runs there.
const npuKey = (hw: HwProbe) => `pj.asr.npu.${hw.gpuName || 'gpu'}`;
const npuVerdict = (hw: HwProbe): 'ok' | 'bad' | null => { try { return (localStorage.getItem(npuKey(hw)) as any) || null; } catch { return null; } };
const rememberNpu = (hw: HwProbe, v: 'ok' | 'bad') => { try { localStorage.setItem(npuKey(hw), v); } catch { /* */ } };
const onNpu = (plan: AsrLoadPlan) => encoderDeviceOf(plan) === 'webnn-npu';
/**
 * WebNN compiles a static graph, so the encoder's symbolic dims are pinned: one 30 s window of
 * 80 log-mel bins (the onnx-community base.en / tiny.en exports name them exactly so).
 */
const WHISPER_80_MEL_SHAPES = { batch_size: 1, feature_size: 80, encoder_sequence_length: 3000 };

/** Candidate plans for a tier, in the order to try them. */
function candidates(tier: AsrTier | 'live', hw: HwProbe): AsrLoadPlan[] {
  const gpu = hw.gpu;
  const fp16 = gpu && hw.gpuF16 && fp16Verdict(hw) !== 'bad';
  const v = vendorLabel(hw);
  const out: AsrLoadPlan[] = [];
  if (tier === 'quick' || tier === 'live') {
    // 'live' is the smaller model used for the live passes on hardware where base.en is too slow.
    const live = tier === 'live';
    const m = live ? 'onnx-community/whisper-tiny.en' : 'onnx-community/whisper-base.en';
    const label = `Whisper ${live ? 'Tiny.en' : 'Base.en'} · ${v}`;
    // NPU first: fp16 encoder on the NPU through WebNN, q4 decoder on WebGPU. The self-check
    // decides whether it stays; a failure falls through to the GPU plans below.
    if (gpu && hw.npu && npuVerdict(hw) !== 'bad') {
      out.push({ tier, model: m, device: 'webgpu', encoderDevice: 'webnn-npu', encoderDtype: 'fp16', decoderDtype: 'q4', freeDimensionOverrides: WHISPER_80_MEL_SHAPES, label: `Whisper ${live ? 'Tiny.en' : 'Base.en'} · Intel NPU + ${v}` });
    }
    if (gpu && fp16) out.push({ tier, model: m, device: 'webgpu', encoderDtype: 'fp16', decoderDtype: 'q4', label });
    if (gpu) out.push({ tier, model: m, device: 'webgpu', encoderDtype: 'fp32', decoderDtype: 'q4', label });
    if (!live) out.push({ tier, model: m, device: 'wasm', encoderDtype: 'fp32', decoderDtype: 'q4', label: 'Whisper Base.en · CPU' });
    return out;
  }
  if (!gpu) return out;                                   // no GPU: the quick tier is the best tier
  if (hw.discrete) {
    const m = 'onnx-community/whisper-large-v3-turbo', label = `Whisper Turbo · ${v}`;
    if (fp16) out.push({ tier, model: m, device: 'webgpu', encoderDtype: 'fp16', decoderDtype: 'q4', label });
  }
  const m = 'onnx-community/whisper-small.en', label = `Whisper Small.en · ${v}`;
  if (fp16) out.push({ tier, model: m, device: 'webgpu', encoderDtype: 'fp16', decoderDtype: 'q4', label });
  out.push({ tier, model: m, device: 'webgpu', encoderDtype: 'fp32', decoderDtype: 'q4', label });
  return out;
}

// ── worker bridge (one worker per engine; in-thread fallback when Workers are unavailable) ──
type Pending = { resolve: (v: any) => void; reject: (e: unknown) => void };
interface Bridge {
  load(plan: AsrLoadPlan, onProgress: (file: string, progress: number) => void): Promise<void>;
  transcribe(tier: AsrTier | 'live', pcm: Float32Array, opts: { timestamps?: boolean; background?: boolean }): Promise<{ text: string; chunks: AsrChunk[]; ms: number }>;
  dispose(): void;
}

let coreP: Promise<typeof import('./asrCore')> | null = null;
const core = () => coreP || (coreP = import('./asrCore'));

function makeBridge(): Bridge {
  let w: Worker | null = null;
  try {
    if (typeof Worker === 'undefined') throw new Error('no Worker');
    w = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    console.warn('[asr] Workers unavailable — running Whisper on the main thread', e);
  }
  if (!w) {
    return {
      load: (plan, onProgress) => core().then(c => c.loadTier(plan, onProgress)).then(() => undefined),
      transcribe: (tier, pcm, opts) => core().then(c => c.transcribe(tier, pcm, opts)),
      dispose: () => { void core().then(c => { c.unloadTier('quick'); c.unloadTier('best'); }); },
    };
  }
  const worker = w;
  const pending = new Map<number, Pending>();
  const progress = new Map<number, (file: string, p: number) => void>();
  let seq = 0;
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data || {};
    if (m.type === 'progress') { progress.get(m.id)?.(m.file, m.progress); return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id); progress.delete(m.id);
    if (m.type === 'loaded') p.resolve(undefined);
    else if (m.type === 'result') p.resolve({ text: m.text, chunks: m.chunks, ms: m.ms });
    else p.reject(new Error(m.error || 'ASR worker error'));
  };
  worker.onerror = (ev) => {
    const err = new Error((ev as ErrorEvent)?.message || 'ASR worker crashed');
    console.warn('[asr] worker error', err.message);
    pending.forEach(p => p.reject(err)); pending.clear(); progress.clear();
  };
  return {
    load: (plan, onProgress) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject }); progress.set(id, onProgress);
      worker.postMessage({ type: 'load', id, plan });
    }),
    transcribe: (tier, pcm, opts) => new Promise((resolve, reject) => {
      const id = ++seq;
      const buf = new Float32Array(pcm);                   // copy: the caller keeps its buffer
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'transcribe', id, tier, pcm: buf, timestamps: !!opts.timestamps, background: !!opts.background }, [buf.buffer]);
    }),
    dispose: () => { try { worker.terminate(); } catch { /* */ } pending.clear(); progress.clear(); },
  };
}

// ── self-check ──────────────────────────────────────────────────────────────
// A short bundled clip ("The Lord is my shepherd"). An engine that cannot hear it is not
// trusted — fp16 on a GPU that mangles it, a broken download, a bad export.
let checkClipP: Promise<Float32Array | null> | null = null;
function selfCheckClip(): Promise<Float32Array | null> {
  if (checkClipP) return checkClipP;
  checkClipP = (async () => {
    try {
      const r = await fetch('/models/asr-selfcheck.wav', { cache: 'force-cache' });
      if (!r.ok || !/audio|octet|wav/i.test(r.headers.get('content-type') || 'audio')) return null;
      const b = await r.arrayBuffer();
      if (b.byteLength < 100 || new TextDecoder().decode(new Uint8Array(b, 0, 4)) !== 'RIFF') return null;
      const v = new DataView(b);
      let off = 12, dataOff = -1, dataLen = 0, rate = 16000, ch = 1, bits = 16;
      while (off + 8 <= b.byteLength) {
        const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
        const len = v.getUint32(off + 4, true);
        if (id === 'fmt ') { ch = v.getUint16(off + 10, true); rate = v.getUint32(off + 12, true); bits = v.getUint16(off + 22, true); }
        if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
        off += 8 + len + (len & 1);
      }
      if (dataOff < 0 || bits !== 16) return null;
      const n = Math.floor(dataLen / 2 / ch);
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = v.getInt16(dataOff + i * 2 * ch, true) / 32768;
      if (rate === 16000) return pcm;
      const ratio = rate / 16000, m = Math.floor(n / ratio), out = new Float32Array(m);
      for (let i = 0; i < m; i++) { const x = i * ratio, i0 = Math.floor(x), f = x - i0; out[i] = (pcm[i0] || 0) * (1 - f) + (pcm[i0 + 1] || 0) * f; }
      return out;
    } catch { return null; }
  })();
  return checkClipP;
}
const SELF_CHECK_WORDS = ['lord', 'shepherd'];
const hears = (text: string) => { const t = text.toLowerCase(); return SELF_CHECK_WORDS.some(w => t.includes(w)); };

// ── loading ─────────────────────────────────────────────────────────────────
const shortName = (plan: AsrLoadPlan) => plan.label.split('·')[0].trim();

/** Try the candidates in order in fresh workers; the first that loads AND passes the self-check wins. */
async function loadTier(tier: AsrTier | 'live', hw: HwProbe): Promise<AsrEngine | null> {
  const plans = candidates(tier, hw);
  const clip = await selfCheckClip();
  let lastErr: unknown = null;
  for (const plan of plans) {
    const bridge = makeBridge();
    const name = shortName(plan);
    setInfo({ loading: name, progress: 0, error: '' });
    try {
      await bridge.load(plan, (_f, p) => { if (info.loading === name) setInfo({ progress: p }); });
      let passMs = 0;
      if (clip) {
        const r = await bridge.transcribe(tier, clip, {});
        passMs = r.ms;
        if (!hears(r.text)) {
          console.warn(`[asr] ${plan.label} (${plan.encoderDtype} encoder on ${encoderDeviceOf(plan)}) failed the self-check: heard "${r.text}"`);
          // An NPU miss says nothing about fp16 on the GPU — keep the two verdicts apart.
          if (onNpu(plan)) rememberNpu(hw, 'bad');
          else if (plan.encoderDtype === 'fp16') rememberFp16(hw, 'bad');
          bridge.dispose();
          continue;
        }
        // One more pass: the first can still include shader compilation.
        passMs = Math.min(passMs, (await bridge.transcribe(tier, clip, {})).ms);
      }
      if (onNpu(plan)) rememberNpu(hw, 'ok');
      else if (plan.encoderDtype === 'fp16') rememberFp16(hw, 'ok');
      const device = onNpu(plan) ? `Intel NPU (WebNN) + ${vendorLabel(hw)} (WebGPU)` : plan.device === 'webgpu' ? `${vendorLabel(hw)} (WebGPU)` : 'CPU (WASM)';
      const engine: AsrEngine = {
        info: { tier: tier === 'live' ? 'quick' : tier, model: plan.model, device, label: plan.label, loading: '', progress: 0, error: '' },
        passMs,
        transcribe: (pcm, opts = {}) => bridge.transcribe(tier, pcm, opts),
        dispose: () => bridge.dispose(),
      };
      console.info(`[asr] ${plan.label} ready · ${plan.encoderDtype} encoder on ${encoderDeviceOf(plan)} / ${plan.decoderDtype} decoder on ${plan.device} · ${passMs} ms per pass`);
      return engine;
    } catch (err) {
      lastErr = err;
      console.warn('[asr] could not load', plan.label, `${plan.encoderDtype}@${encoderDeviceOf(plan)}`, `${plan.decoderDtype}@${plan.device}`, err);
      // A load failure on the NPU (no WebNN EP in this ORT build, unsupported op ...) is as final
      // as a mis-hear: remember it so later sessions go straight to the GPU plans.
      if (onNpu(plan)) rememberNpu(hw, 'bad');
      bridge.dispose();
    }
  }
  if (lastErr && tier === 'quick') throw lastErr;
  return null;
}

let quickP: Promise<AsrEngine> | null = null;
let bestP: Promise<AsrEngine | null> | null = null;

function loadQuick(hw: HwProbe): Promise<AsrEngine> {
  if (quickP) return quickP;
  quickP = (async () => {
    const e = await loadTier('quick', hw);
    if (!e) throw new Error('No speech model could be loaded');
    quick = e;
    if (!best) setInfo({ ...e.info, loading: '', progress: 0 });
    return e;
  })().catch(e => { quickP = null; setInfo({ loading: '', error: String((e as Error)?.message || e) }); throw e; });
  return quickP;
}

/**
 * Slow hardware (an integrated GPU running fp32, ~2 s per base.en pass): tiny.en takes over the
 * live passes at about half the time, and base.en becomes the final-pass tier. Resolves to the
 * engine that should be the best tier from here (base.en), or null to go on loading a bigger one.
 */
async function rebalanceForSlowHardware(hw: HwProbe): Promise<AsrEngine | null> {
  const base = quick;
  if (!base || base.passMs <= LIVE_PASS_BUDGET_MS || !hw.gpu) return null;
  const tiny = await loadTier('live', hw).catch(() => null);
  if (!tiny || tiny.passMs > base.passMs * 0.75) { tiny?.dispose?.(); return null; }
  console.info(`[asr] slow GPU: ${tiny.info.label} takes the live passes (${tiny.passMs} ms), ${base.info.label} the final passes (${base.passMs} ms)`);
  quick = tiny;
  return base;
}

function loadBest(hw: HwProbe): Promise<AsrEngine | null> {
  if (bestP) return bestP;
  bestP = (async () => {
    // Strictly after the quick tier: no bandwidth or GPU contention while captions start.
    try { await loadQuick(hw); } catch { return null; }
    const promoted = await rebalanceForSlowHardware(hw);
    if (promoted) {
      best = { ...promoted, info: { ...promoted.info, tier: 'best' } };
      setInfo({ ...best.info, loading: '', progress: 0 });
      return best;
    }
    if (!candidates('best', hw).length) return null;
    let e = await loadTier('best', hw);
    // A best tier that takes seconds per pass would only hog the GPU the live passes need
    // (an integrated GPU running fp32): the quick tier IS the best tier on that hardware.
    if (e && e.passMs > BEST_PASS_LIMIT_MS) {
      console.info(`[asr] ${e.info.label} is too slow here (${e.passMs} ms per pass) — staying on ${quick?.info.label}`);
      e.dispose?.();
      e = null;
    }
    if (e) {
      best = e;
      setInfo({ ...e.info, loading: '', progress: 0 });
    } else if (quick) {
      setInfo({ ...quick.info, loading: '', progress: 0 });
    }
    return e;
  })();
  return bestP;
}

/**
 * Start loading (idempotent). Resolves as soon as ANY engine is usable — the quick one — while
 * the better model keeps downloading in the background and takes over the final passes.
 */
export async function ensureAsr(): Promise<AsrEngine> {
  const hw = await probeHardware();
  const q = loadQuick(hw);
  void loadBest(hw);
  if (best) return best;
  return q;
}

/** Resolves with the best tier when available (or the quick engine on hardware that can't run it). */
export async function ensureBestAsr(): Promise<AsrEngine> {
  const hw = await probeHardware();
  const b = await loadBest(hw);
  return b || loadQuick(hw);
}
