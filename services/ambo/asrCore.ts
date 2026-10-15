// asrCore — the on-device Whisper engine itself (transformers.js + ONNX Runtime).
//
// Runs wherever it is imported: normally inside asr.worker.ts (so inference, feature
// extraction and model downloads never touch the UI or audio threads), or on the main
// thread when Workers are unavailable. asrEngine.ts is the public face; nothing else
// should import this directly.
//
// Why the session keys matter: transformers.js v4 names the Whisper sessions `model`
// (the encoder file `encoder_model*.onnx`) and `decoder_model_merged`. A per-file
// dtype/device object MUST use those keys. Keyed as `encoder_model`, the encoder dtype
// silently falls back to fp32 — which is how this app ended up downloading a 2.5 GB fp32
// Turbo encoder from Hugging Face instead of the fp16 files sitting in /models.
//
// Split placement: the encoder may run on a different device from the decoder — the
// encoder on an NPU through WebNN (`webnn-npu`, when Chrome exposes `navigator.ml`) while
// the autoregressive decoder stays on WebGPU. WebNN compiles static graphs, so the plan
// then carries `freeDimensionOverrides` to pin the encoder's symbolic input dims
// (batch_size / feature_size / encoder_sequence_length on the onnx-community exports).

export type AsrDevice = 'webgpu' | 'wasm' | 'webnn-npu';
export interface AsrLoadPlan {
  tier: 'quick' | 'best' | 'live';  // 'live' = the smaller model that takes the live passes on slow GPUs
  model: string;              // HF id, e.g. onnx-community/whisper-base.en
  /** Decoder device — and the encoder's too unless `encoderDevice` says otherwise. */
  device: AsrDevice;
  /** Where the encoder runs when it differs from `device` (e.g. 'webnn-npu' with a 'webgpu' decoder). */
  encoderDevice?: AsrDevice;
  encoderDtype: string;       // fp16 | fp32 | q8 …
  decoderDtype: string;       // fp16 | q4 | q4f16 | q8 …
  /** ONNX Runtime free-dimension overrides (WebNN needs static shapes). Applied to every session of the model. */
  freeDimensionOverrides?: Record<string, number>;
  label: string;              // human label for the UI
}
/** The device the encoder session runs on. */
export const encoderDeviceOf = (plan: AsrLoadPlan): AsrDevice => plan.encoderDevice || plan.device;
export interface AsrChunkOut { text: string; start: number; end: number }
export interface AsrResult { text: string; chunks: AsrChunkOut[]; ms: number }
export type ProgressFn = (file: string, progress: number) => void;

// Static import: the worker is bundled as a single file, so no code-splitting inside it.
import * as transformers from '@huggingface/transformers';

let tfP: Promise<any> | null = null;
async function tf(): Promise<any> {
  if (!tfP) tfP = (async () => {
    const m: any = transformers;
    try {
      m.env.allowLocalModels = true;
      m.env.localModelPath = '/models/';
      m.env.allowRemoteModels = true;
      m.env.useBrowserCache = true;
    } catch { /* read-only env in some bundles */ }
    try { m.env.backends.onnx.webgpu.powerPreference = 'high-performance'; } catch { /* */ }
    try { m.env.backends.onnx.logLevel = 'error'; } catch { /* */ }
    // A single-page dev/prod server answers ANY unknown path with index.html (200, text/html).
    // transformers.js takes that as "the local file exists" and hands the HTML to ONNX Runtime
    // ("protobuf parsing failed"). Turn an HTML answer for a model path into the 404 it is, so
    // the library falls through to the Hugging Face CDN for files not bundled under /models.
    try {
      const realFetch = m.env.fetch || fetch;
      m.env.fetch = async (url: any, init?: any) => {
        const res = await realFetch(url, init);
        const u = String(url);
        if (res.ok && /\.(onnx|onnx_data|json|txt)(\?|$)/.test(u) && /text\/html/i.test(res.headers.get('content-type') || '')) {
          console.warn('[asr] local model path answered with HTML, treating as missing:', u);
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }
        console.debug('[asr] fetch', res.status, res.headers.get('content-type') || '', u);
        return res;
      };
    } catch { /* */ }
    return m;
  })();
  return tfP;
}

interface Loaded { pipe: any; plan: AsrLoadPlan; multilingual: boolean; warmMs: number }
const loaded = new Map<string, Loaded>();

const isEnglishOnly = (model: string) => /\.en(?:$|[-_/])/.test(model);

/** Load one tier. Idempotent per tier; a second call with a different plan replaces it. */
export async function loadTier(plan: AsrLoadPlan, onProgress?: ProgressFn): Promise<{ warmMs: number }> {
  const cur = loaded.get(plan.tier);
  if (cur && cur.plan.model === plan.model && cur.plan.device === plan.device && encoderDeviceOf(cur.plan) === encoderDeviceOf(plan)) return { warmMs: cur.warmMs };
  const t = await tf();
  // Session keys for Seq2Seq in transformers.js v4 (+ v3's names so either resolves).
  const encDevice = encoderDeviceOf(plan);
  const dtype = {
    model: plan.encoderDtype, encoder_model: plan.encoderDtype,
    decoder_model_merged: plan.decoderDtype,
  };
  const device = {
    model: encDevice, encoder_model: encDevice,
    decoder_model_merged: plan.device,
  };
  // transformers.js hands `session_options` to EVERY session of the model. The free-dimension
  // names below exist only on the encoder input (the decoder's are `decoder_sequence_length`,
  // `encoder_sequence_length_out` …), and ORT ignores overrides for names a graph lacks, so
  // pinning them is harmless for the WebGPU decoder.
  const session_options: Record<string, any> | undefined = plan.freeDimensionOverrides
    ? { freeDimensionOverrides: { ...plan.freeDimensionOverrides } }
    : undefined;
  const seen = new Map<string, number>();
  const progress_callback = (d: any) => {
    if (d?.status === 'progress' && typeof d.progress === 'number') {
      seen.set(String(d.file || ''), d.progress);
      let sum = 0; for (const v of seen.values()) sum += v;
      onProgress?.(String(d.file || ''), Math.min(1, sum / (seen.size * 100)));
    }
  };
  const pipe = await t.pipeline('automatic-speech-recognition', plan.model, {
    device,
    dtype,
    ...(session_options ? { session_options } : {}),
    progress_callback,
  });
  if (encDevice !== plan.device) console.info(`[asr] ${plan.label}: encoder on ${encDevice}, decoder on ${plan.device}`);
  const multilingual = !isEnglishOnly(plan.model) && (pipe?.model?.generation_config?.is_multilingual !== false);
  const entry: Loaded = { pipe, plan, multilingual, warmMs: 0 };
  // Warm the graph (shader compile / first-run allocation) so the first real utterance is fast.
  const t0 = now();
  try { await run(entry, new Float32Array(16000), false); } catch { /* warm-up failure is not fatal */ }
  entry.warmMs = Math.round(now() - t0);
  loaded.set(plan.tier, entry);
  return { warmMs: entry.warmMs };
}

export function hasTier(tier: string): boolean { return loaded.has(tier); }
export function unloadTier(tier: string): void {
  const e = loaded.get(tier);
  loaded.delete(tier);
  try { e?.pipe?.dispose?.(); } catch { /* */ }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

async function run(e: Loaded, pcm: Float32Array, timestamps: boolean): Promise<AsrResult> {
  const t0 = now();
  const long = pcm.length > 16000 * 30;
  const opts: any = {
    return_timestamps: timestamps,
    chunk_length_s: long ? 30 : undefined,
    stride_length_s: long ? 5 : undefined,
  };
  if (e.multilingual) { opts.language = 'english'; opts.task = 'transcribe'; }
  const out = await e.pipe(pcm, opts);
  const o = Array.isArray(out) ? out[0] : out;
  const text = String(o?.text || '').trim();
  const chunks: AsrChunkOut[] = (o?.chunks || [])
    .map((c: any) => ({
      text: String(c.text || ''),
      start: Number(c.timestamp?.[0] ?? 0),
      end: Number(c.timestamp?.[1] ?? c.timestamp?.[0] ?? pcm.length / 16000),
    }))
    .filter((c: AsrChunkOut) => c.text.trim().length > 0);
  if (!chunks.length && text) chunks.push({ text, start: 0, end: pcm.length / 16000 });
  return { text, chunks, ms: Math.round(now() - t0) };
}

// One inference at a time (ONNX Runtime web sessions must not run concurrently), with two
// lanes: live caption passes always go before background jobs (track lyric extraction).
type Job = { tier: string; pcm: Float32Array; timestamps: boolean; resolve: (r: AsrResult) => void; reject: (e: unknown) => void };
const live: Job[] = [], bg: Job[] = [];
let running = false;
function pump(): void {
  if (running) return;
  const job = live.shift() || bg.shift();
  if (!job) return;
  running = true;
  const e = loaded.get(job.tier);
  (e ? run(e, job.pcm, job.timestamps) : Promise.reject(new Error(`ASR tier "${job.tier}" is not loaded`)))
    .then(job.resolve, job.reject)
    .finally(() => { running = false; pump(); });
}

export function transcribe(tier: string, pcm: Float32Array, opts: { timestamps?: boolean; background?: boolean } = {}): Promise<AsrResult> {
  return new Promise<AsrResult>((resolve, reject) => {
    (opts.background ? bg : live).push({ tier, pcm, timestamps: !!opts.timestamps, resolve, reject });
    pump();
  });
}

/** Drop queued live passes that are no longer wanted (a newer pass supersedes them). */
export function pendingLive(): number { return live.length; }
