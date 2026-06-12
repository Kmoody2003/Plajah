// ─── Basic Pitch backend (Spotify CNN, optional studio-grade transcription) ───
// A learned polyphonic audio→MIDI model. This is the most accurate backend, but
// it pulls in TensorFlow.js (~MBs) + a model download, so EVERYTHING here is
// behind dynamic import — tfjs never lands in the main bundle or the SSR server,
// and audioTranscription only loads this module when the 'basic-pitch' backend is
// explicitly selected. Any failure (no WebGL, model 404, decode error) throws and
// the caller falls back to the dependency-free poly-dsp engine.

import { decodeMono } from './audioBeatDetection';

export interface BPNote { startSec: number; durSec: number; midi: number; velocity: number }

// Vendored same-origin so it works offline / behind a firewall (public/models/…).
const MODEL_URL = '/models/basic-pitch/model.json';
const BP_RATE = 22050;                 // the model's required input rate

/** Resample mono PCM to 22.05 kHz using an OfflineAudioContext (browser-accurate). */
async function resampleTo22k(data: Float32Array, srcRate: number): Promise<Float32Array> {
  if (srcRate === BP_RATE) return data;
  const Ctx: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const outLen = Math.max(1, Math.ceil((data.length * BP_RATE) / srcRate));
  const offline = new Ctx(1, outLen, BP_RATE);
  const buf = offline.createBuffer(1, data.length, srcRate);   // source at native rate
  buf.copyToChannel(data, 0);
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

let _backendReady = false;
async function ensureTfBackend(tf: any): Promise<void> {
  if (_backendReady) return;
  // Prefer WebGL; fall back to CPU (slower but always works, e.g. headless).
  try { await tf.setBackend('webgl'); await tf.ready(); }
  catch { try { await tf.setBackend('cpu'); await tf.ready(); } catch { /* tf.ready below */ } }
  await tf.ready();
  _backendReady = true;
}

export interface BasicPitchOptions {
  signal?: AbortSignal;
  onProgress?: (stage: string, pct: number) => void;
  /** Reuse already-decoded mono PCM to skip a second fetch/decode. */
  pcm?: { data: Float32Array; sampleRate: number };
  /** Detection thresholds (Spotify defaults shown). */
  onsetThreshold?: number;     // 0.5
  frameThreshold?: number;     // 0.3
  minNoteLenFrames?: number;   // 11 (~128 ms)
}

export async function transcribeWithBasicPitch(url: string, opts: BasicPitchOptions = {}): Promise<BPNote[]> {
  opts.onProgress?.('loading model', 0.08);

  // Lazy-load the heavy deps only now.
  const tf = await import('@tensorflow/tfjs');
  await ensureTfBackend(tf);
  const { BasicPitch, outputToNotesPoly, addPitchBendsToNoteEvents, noteFramesToTime } =
    await import('@spotify/basic-pitch');

  opts.onProgress?.('decoding', 0.18);
  const { data, sampleRate } = opts.pcm ?? await decodeMono(url, opts.signal);
  if (opts.signal?.aborted) throw new Error('aborted');
  const audio = await resampleTo22k(data, sampleRate);

  const basicPitch = new BasicPitch(MODEL_URL);
  const frames: number[][] = [], onsets: number[][] = [], contours: number[][] = [];
  await basicPitch.evaluateModel(
    audio,
    (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
    (p: number) => opts.onProgress?.('transcribing', 0.2 + 0.75 * p),
  );
  if (opts.signal?.aborted) throw new Error('aborted');

  const notes = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(
        frames,
        onsets,
        opts.onsetThreshold ?? 0.5,
        opts.frameThreshold ?? 0.3,
        opts.minNoteLenFrames ?? 11,
      ),
    ),
  );

  opts.onProgress?.('done', 1);
  return notes.map(n => ({
    startSec: n.startTimeSeconds,
    durSec: n.durationSeconds,
    midi: Math.round(n.pitchMidi),
    velocity: Math.max(0, Math.min(1, n.amplitude)),
  }));
}
