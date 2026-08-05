// demucsClient.ts — ON-DEVICE (private) Demucs stem separation via ONNX Runtime Web.
//
// Runs the whole neural separation IN THE BROWSER — the audio never leaves the user's
// machine (the privacy win). It's heavy: a large model + minutes of CPU/GPU, so it's gated
// to capable, non-TV devices and shown as opt-in with a "runs on your hardware" warning.
// A faster server version (Cloud Run) is planned for everyone; this is the private path.
//
// REQUIRES an htdemucs ONNX model (waveform-in → 4-stems-out) vendored at MODEL_URL. Because
// the model is ~90 MB it is NOT committed — drop it at `public/models/demucs/` (see the
// deploy notes). Everything degrades gracefully: if the model/runtime/inference fails, the
// caller falls back to the instant quickStems / cloud path. This inference path is written to
// the standard htdemucs ONNX I/O but is UNVERIFIED here (needs the model + a device to test).

export interface LocalStemsResult { vocals: Blob; drums: Blob; bass: Blob; other: Blob; }
export type DemucsTier = 'good' | 'low' | 'blocked';

// Where the model + ORT wasm live. Same-origin by default (vendor the files); overridable.
const MODEL_URL = '/models/demucs/htdemucs.onnx';
const ORT_WASM_BASE = '/models/demucs/ort/';        // copy onnxruntime-web/dist/*.wasm here
const SR = 44100;                                    // Demucs operates at 44.1 kHz stereo
const SEGMENT = Math.round(7.8 * SR);                // 7.8 s segments (Demucs default)
const OVERLAP = Math.round(SEGMENT * 0.25);          // 25% overlap, linear cross-fade
// htdemucs source order in the model output.
const SOURCE_ORDER = ['drums', 'bass', 'other', 'vocals'] as const;

/** Is on-device separation appropriate here? Blocks TVs; warns on mobile / low-end. */
export function demucsCapability(): { tier: DemucsTier; reason: string } {
  if (typeof navigator === 'undefined') return { tier: 'blocked', reason: 'Unavailable.' };
  const ua = navigator.userAgent || '';
  if (/\b(SmartTV|Smart-TV|GoogleTV|Google TV|AndroidTV|Android TV|Tizen|Web0S|WebOS|BRAVIA|AppleTV|Apple TV|CrKey|Chromecast|AFT[A-Za-z]|Roku|HbbTV|NetCast|VIDAA)\b/i.test(ua))
    return { tier: 'blocked', reason: 'On-device separation isn’t supported on TV devices — a server version is coming soon.' };
  const cores = navigator.hardwareConcurrency || 2;
  const mem = (navigator as any).deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (mobile || cores < 4 || mem < 4)
    return { tier: 'low', reason: 'This runs a large AI model on your device — expect a few minutes and some heat. A faster server version is coming soon.' };
  return { tier: 'good', reason: '' };
}

// ── ORT session (lazy, once) ──────────────────────────────────────────────────
let sessionPromise: Promise<any> | null = null;
async function getSession(): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort: any = await import('onnxruntime-web');
      try { ort.env.wasm.wasmPaths = ORT_WASM_BASE; } catch { /* use default */ }
      try { ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2); } catch { /* */ }
      const providers: string[] = [];
      try { if ((navigator as any).gpu) providers.push('webgpu'); } catch { /* */ }
      providers.push('wasm');
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: providers });
    })().catch(e => { sessionPromise = null; throw e; });
  }
  return sessionPromise;
}

/** Has a model been vendored? (HEAD check — avoids a doomed run + a 90 MB 404.) */
export async function isDemucsModelAvailable(): Promise<boolean> {
  try { const r = await fetch(MODEL_URL, { method: 'HEAD' }); return r.ok; } catch { return false; }
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
async function decodeStereo44k(url: string): Promise<{ L: Float32Array; R: Float32Array; n: number }> {
  const resp = await fetch(url);
  const ab = await resp.arrayBuffer();
  const AC = (window.AudioContext || (window as any).webkitAudioContext);
  const dctx = new AC();
  const decoded = await dctx.decodeAudioData(ab);
  dctx.close();
  const OAC = (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext);
  const len = Math.ceil(decoded.duration * SR);
  const off = new OAC(2, Math.max(1, len), SR);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  const L = Float32Array.from(r.getChannelData(0));
  const R = Float32Array.from(r.numberOfChannels > 1 ? r.getChannelData(1) : r.getChannelData(0));
  return { L, R, n: L.length };
}

function toWav(L: Float32Array, R: Float32Array): Blob {
  const n = L.length, buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), rr = Math.max(-1, Math.min(1, R[i]));
    dv.setInt16(o, l < 0 ? l * 0x8000 : l * 0x7fff, true); o += 2;
    dv.setInt16(o, rr < 0 ? rr * 0x8000 : rr * 0x7fff, true); o += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Separate a track into 4 stems fully on-device. Chunks the audio into overlapping segments,
 * runs each through the ONNX model, and cross-fades them back together. onProgress is 0..1.
 * Throws on any failure so the caller can fall back. Model I/O assumed: input [1,2,length]
 * (stereo waveform), output [1,4,2,length] (drums,bass,other,vocals × stereo).
 */
export async function separateStemsLocal(url: string, onProgress?: (p: number) => void): Promise<LocalStemsResult> {
  const ort: any = await import('onnxruntime-web');
  const session = await getSession();
  const inputName = session.inputNames?.[0] || 'mix';
  const { L, R, n } = await decodeStereo44k(url);

  // Output accumulators (4 sources × stereo) + a window-sum for the cross-fade normalization.
  const outL: Float32Array[] = SOURCE_ORDER.map(() => new Float32Array(n));
  const outR: Float32Array[] = SOURCE_ORDER.map(() => new Float32Array(n));
  const wsum = new Float32Array(n);

  const step = SEGMENT - OVERLAP;
  const segCount = Math.max(1, Math.ceil((n - OVERLAP) / step));
  for (let s = 0; s < segCount; s++) {
    const start = s * step;
    const segLen = Math.min(SEGMENT, n - start);
    if (segLen <= 0) break;
    // [1, 2, SEGMENT] input tensor (zero-padded tail).
    const data = new Float32Array(2 * SEGMENT);
    for (let i = 0; i < segLen; i++) { data[i] = L[start + i]; data[SEGMENT + i] = R[start + i]; }
    const input = new ort.Tensor('float32', data, [1, 2, SEGMENT]);
    const result = await session.run({ [inputName]: input });
    const outName = session.outputNames?.[0] || Object.keys(result)[0];
    const out = result[outName];               // expected dims [1,4,2,SEGMENT]
    const od = out.data as Float32Array;
    const perSource = 2 * SEGMENT;
    // Triangular window for smooth overlap-add.
    for (let i = 0; i < segLen; i++) {
      const w = Math.min(i + 1, segLen - i, OVERLAP) / OVERLAP;
      const gi = start + i;
      wsum[gi] += w;
      for (let k = 0; k < 4; k++) {
        outL[k][gi] += od[k * perSource + i] * w;
        outR[k][gi] += od[k * perSource + SEGMENT + i] * w;
      }
    }
    onProgress?.((s + 1) / segCount);
  }
  // Normalize by the window sum.
  for (let i = 0; i < n; i++) {
    const w = wsum[i] || 1;
    for (let k = 0; k < 4; k++) { outL[k][i] /= w; outR[k][i] /= w; }
  }

  const idx = (name: string) => SOURCE_ORDER.indexOf(name as any);
  return {
    drums: toWav(outL[idx('drums')], outR[idx('drums')]),
    bass: toWav(outL[idx('bass')], outR[idx('bass')]),
    other: toWav(outL[idx('other')], outR[idx('other')]),
    vocals: toWav(outL[idx('vocals')], outR[idx('vocals')]),
  };
}
