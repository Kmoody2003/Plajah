// vocalSeparator — near-studio vocal isolation in the browser with ONNX Runtime.
//
// Model: UVR "Kim_Vocal_2" (MDX-Net, ~67 MB, downloaded once from Hugging Face and cached by the
// browser). It is a spectrogram model, so this file does the DSP around it exactly as UVR does:
//   44.1 kHz stereo → STFT (n_fft 7680, hop 1024, Hann, centred) → first 3072 bins as
//   [L.re, L.im, R.re, R.im] × 256 frames → model → vocal spectrogram → inverse STFT.
// Chunks are 261 120 samples (5.9 s) with n_fft/2 trimmed from each side, so the centres
// concatenate seamlessly. Runs on WebGPU when available, otherwise WASM.
//
// Output is delivered chunk by chunk so transcription can start on the first seconds of vocals
// while the rest of the song is still being separated.

export const MDX = { nFft: 7680, hop: 1024, dimF: 3072, dimT: 256, sr: 44100, compensate: 1.009 } as const;
export const CHUNK = MDX.hop * (MDX.dimT - 1);          // 261120
const TRIM = MDX.nFft / 2;                              // 3840
const GEN = CHUNK - MDX.nFft;                           // 253440 new samples per chunk
export const MODEL_URLS = [
  'https://huggingface.co/seanghay/uvr_models/resolve/main/Kim_Vocal_2.onnx',
  'https://huggingface.co/Politrees/UVR_resources/resolve/main/models/MDXNet/Kim_Vocal_2.onnx',
  'https://huggingface.co/Derur/UVR-models/resolve/main/Kim_Vocal_2.onnx',
];

// ── FFT (radix-2 core + Bluestein for the non power-of-two n_fft) ───────────
class Fft2 {
  readonly n: number; private rev: Uint32Array; private cos: Float64Array; private sin: Float64Array;
  constructor(n: number) {
    this.n = n; this.rev = new Uint32Array(n);
    const bits = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
    this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / n); this.sin[i] = -Math.sin(2 * Math.PI * i / n); }
  }
  /** In-place forward transform. `inverse` conjugates the twiddles (no 1/n scaling). */
  run(re: Float64Array, im: Float64Array, inverse = false) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const wr = this.cos[t], wi = inverse ? -this.sin[t] : this.sin[t];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

export class FftN {
  readonly n: number; private m: number; private core: Fft2;
  private wr: Float64Array; private wi: Float64Array;       // chirp  e^{-iπ k²/n}
  private br: Float64Array; private bi: Float64Array;       // FFT of the conjugate chirp, padded
  private ar: Float64Array; private ai: Float64Array;
  constructor(n: number) {
    this.n = n; let m = 1; while (m < 2 * n - 1) m <<= 1; this.m = m; this.core = new Fft2(m);
    this.wr = new Float64Array(n); this.wi = new Float64Array(n);
    for (let k = 0; k < n; k++) { const a = Math.PI * ((k * k) % (2 * n)) / n; this.wr[k] = Math.cos(a); this.wi[k] = -Math.sin(a); }
    this.br = new Float64Array(m); this.bi = new Float64Array(m);
    this.br[0] = this.wr[0]; this.bi[0] = -this.wi[0];
    for (let k = 1; k < n; k++) { this.br[k] = this.br[m - k] = this.wr[k]; this.bi[k] = this.bi[m - k] = -this.wi[k]; }
    this.core.run(this.br, this.bi);
    this.ar = new Float64Array(m); this.ai = new Float64Array(m);
  }
  /** Forward DFT of (re, im), length n, in place. */
  forward(re: Float64Array, im: Float64Array) {
    const { n, m, ar, ai, wr, wi, br, bi } = this;
    ar.fill(0); ai.fill(0);
    for (let k = 0; k < n; k++) { ar[k] = re[k] * wr[k] - im[k] * wi[k]; ai[k] = re[k] * wi[k] + im[k] * wr[k]; }
    this.core.run(ar, ai);
    for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
    this.core.run(ar, ai, true);
    for (let k = 0; k < n; k++) { const r = ar[k] / m, i = ai[k] / m; re[k] = r * wr[k] - i * wi[k]; im[k] = r * wi[k] + i * wr[k]; }
  }
  /** Inverse DFT with 1/n scaling, in place (via conjugation). */
  inverse(re: Float64Array, im: Float64Array) {
    for (let k = 0; k < this.n; k++) im[k] = -im[k];
    this.forward(re, im);
    const s = 1 / this.n;
    for (let k = 0; k < this.n; k++) { re[k] *= s; im[k] = -im[k] * s; }
  }
}

// ── STFT / iSTFT (stereo handled as one complex signal: z = L + i·R) ────────
let fft: FftN | null = null;
let hann: Float64Array | null = null;
function init() {
  if (fft) return;
  fft = new FftN(MDX.nFft);
  hann = new Float64Array(MDX.nFft);
  for (let i = 0; i < MDX.nFft; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / MDX.nFft);
}

const reflect = (i: number, n: number) => { if (i < 0) i = -i; if (i >= n) i = 2 * (n - 1) - i; return i; };

/** [L, R] of CHUNK samples → model input [4, dimF, dimT] (flat). */
export function stftChunk(L: Float32Array, R: Float32Array): Float32Array {
  init();
  const { nFft, hop, dimF, dimT } = MDX, n = L.length;
  const out = new Float32Array(4 * dimF * dimT);
  const re = new Float64Array(nFft), im = new Float64Array(nFft);
  for (let t = 0; t < dimT; t++) {
    const s = t * hop - nFft / 2;
    for (let i = 0; i < nFft; i++) { const j = reflect(s + i, n); re[i] = L[j] * hann![i]; im[i] = R[j] * hann![i]; }
    fft!.forward(re, im);
    for (let k = 0; k < dimF; k++) {
      const k2 = (nFft - k) % nFft;
      const xr = re[k], xi = im[k], yr = re[k2], yi = -im[k2];       // X[k], conj(X[N-k])
      const lr = (xr + yr) / 2, li = (xi + yi) / 2;                   // spectrum of L
      const rr = (xi - yi) / 2, ri = -(xr - yr) / 2;                  // spectrum of R  = (X - conj)/(2i)
      out[(0 * dimF + k) * dimT + t] = lr; out[(1 * dimF + k) * dimT + t] = li;
      out[(2 * dimF + k) * dimT + t] = rr; out[(3 * dimF + k) * dimT + t] = ri;
    }
  }
  return out;
}

/** Model output [4, dimF, dimT] → CHUNK samples of L and R. */
export function istftChunk(spec: Float32Array): [Float32Array, Float32Array] {
  init();
  const { nFft, hop, dimF, dimT } = MDX;
  const total = hop * (dimT - 1) + nFft;
  const accL = new Float64Array(total), accR = new Float64Array(total), norm = new Float64Array(total);
  const re = new Float64Array(nFft), im = new Float64Array(nFft);
  for (let t = 0; t < dimT; t++) {
    re.fill(0); im.fill(0);
    for (let k = 0; k < dimF; k++) {
      const lr = spec[(0 * dimF + k) * dimT + t], li = spec[(1 * dimF + k) * dimT + t];
      const rr = spec[(2 * dimF + k) * dimT + t], ri = spec[(3 * dimF + k) * dimT + t];
      // Z[k] = L[k] + i·R[k]; mirrored bins use the conjugate-symmetric spectra of real L and R.
      re[k] += lr - ri; im[k] += li + rr;
      if (k > 0) { const k2 = nFft - k; re[k2] += lr + ri; im[k2] += -li + rr; }
    }
    fft!.inverse(re, im);
    const o = t * hop;
    for (let i = 0; i < nFft; i++) { const w = hann![i]; accL[o + i] += re[i] * w; accR[o + i] += im[i] * w; norm[o + i] += w * w; }
  }
  const L = new Float32Array(CHUNK), R = new Float32Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) {
    const p = i + nFft / 2, d = norm[p] > 1e-8 ? norm[p] : 1;
    L[i] = accL[p] / d; R[i] = accR[p] / d;
  }
  return [L, R];
}

// ── ONNX session ────────────────────────────────────────────────────────────
let sessionPromise: Promise<{ ort: any; session: any; provider: string }> | null = null;

async function fetchModel(onProgress: (p: number) => void): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (const url of MODEL_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 66_759_214;
      const reader = res.body.getReader(); const parts: Uint8Array[] = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(Math.min(1, got / total)); }
      const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      return out.buffer;
    } catch (e) { lastErr = e; }
  }
  throw new Error('Could not download the vocal separation model: ' + String((lastErr as Error)?.message || lastErr));
}

/** Cache the model in the Cache API so it is downloaded once. */
async function cachedModel(onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const key = MODEL_URLS[0];
  try {
    if (typeof caches !== 'undefined') {
      const c = await caches.open('ambo-models-v1');
      const hit = await c.match(key);
      if (hit) { onProgress(1); return await hit.arrayBuffer(); }
      const buf = await fetchModel(onProgress);
      try { await c.put(key, new Response(buf.slice(0))); } catch { /* quota */ }
      return buf;
    }
  } catch { /* fall through */ }
  return fetchModel(onProgress);
}

export function loadSeparator(onStatus: (msg: string, p: number) => void, ortOverride?: any): Promise<{ ort: any; session: any; provider: string }> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    onStatus('Downloading vocal model…', 0);
    const model = await cachedModel(p => onStatus(`Downloading vocal model ${Math.round(p * 100)}%`, p));
    onStatus('Starting vocal model…', 1);
    let ort = ortOverride;
    if (!ort) { try { ort = await import('onnxruntime-web/webgpu'); } catch { ort = await import('onnxruntime-web'); } }
    try { if (ort?.env?.webgpu) ort.env.webgpu.powerPreference = 'high-performance'; } catch { /* */ }
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    const tries: string[][] = hasGpu ? [['webgpu'], ['wasm']] : [['wasm']];
    let lastErr: unknown;
    for (const providers of tries) {
      try {
        const session = await ort.InferenceSession.create(model, { executionProviders: providers, graphOptimizationLevel: 'all' });
        return { ort, session, provider: providers[0] };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  })().catch(e => { sessionPromise = null; throw e; });
  return sessionPromise;
}

/** Resample interleaved stereo to 44.1 kHz. */
async function toStereo44k(buf: AudioBuffer): Promise<[Float32Array, Float32Array]> {
  if (buf.sampleRate === MDX.sr && buf.numberOfChannels >= 2) return [buf.getChannelData(0), buf.getChannelData(1)];
  const len = Math.ceil(buf.duration * MDX.sr);
  const ctx = new OfflineAudioContext(2, len, MDX.sr);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
  const r = await ctx.startRendering();
  return [r.getChannelData(0), r.numberOfChannels > 1 ? r.getChannelData(1) : r.getChannelData(0)];
}

export interface VocalSegment { startSec: number; left: Float32Array; right: Float32Array; sr: number }

/**
 * Separate the vocals of a decoded track, delivering each ~5.7 s segment as soon as it is ready.
 * `isAlive` lets the caller cancel between chunks.
 */
export async function separateVocals(
  buf: AudioBuffer,
  onSegment: (seg: VocalSegment) => void | Promise<void>,
  onStatus: (msg: string, p: number) => void,
  isAlive: () => boolean = () => true,
): Promise<{ provider: string }> {
  const { ort, session, provider } = await loadSeparator(onStatus);
  const inName: string = session.inputNames[0], outName: string = session.outputNames[0];
  const [L, R] = await toStereo44k(buf);
  const n = L.length;
  // UVR scheme: pad TRIM zeros each side, window `CHUNK` with step GEN, keep the centre GEN.
  const padded = (src: Float32Array, start: number): Float32Array => {
    const out = new Float32Array(CHUNK);
    for (let i = 0; i < CHUNK; i++) { const j = start + i - TRIM; out[i] = j >= 0 && j < n ? src[j] : 0; }
    return out;
  };
  const chunks = Math.max(1, Math.ceil(n / GEN));
  for (let c = 0; c < chunks; c++) {
    if (!isAlive()) return { provider };
    const start = c * GEN;
    const input = stftChunk(padded(L, start), padded(R, start));
    const out = await session.run({ [inName]: new ort.Tensor('float32', input, [1, 4, MDX.dimF, MDX.dimT]) });
    const spec = out[outName].data as Float32Array;
    const [vl, vr] = istftChunk(spec);
    const keep = Math.min(GEN, n - start);
    const left = new Float32Array(keep), right = new Float32Array(keep);
    for (let i = 0; i < keep; i++) { left[i] = vl[i + TRIM] * MDX.compensate; right[i] = vr[i + TRIM] * MDX.compensate; }
    onStatus('Isolating vocals…', (c + 1) / chunks);
    await onSegment({ startSec: start / MDX.sr, left, right, sr: MDX.sr });
    await new Promise(r => setTimeout(r, 0));
  }
  return { provider };
}
