// liveTranscriber — words from a live source, for Ambo.
//
// One transcriber feeds every "listen to the room" feature: auto-scripture,
// live lyrics / captions on screen, visualizers. Sources:
//
//   mic     the default microphone
//   device  a specific audio input (mixer feed, USB interface)
//   stream  any MediaStream (an NDI/SRT/stream audio track, the account's live stream, the program mix)
//
// Every source runs the on-device Whisper chain (asrEngine.ts — GPU-accelerated, in a
// Worker). On the default mic the platform's quick recogniser (Web Speech / the Windows
// host's) bridges the seconds the model takes to load, then hands over, so the scripture
// listener always hears ONE engine. Without a GPU the quick recogniser stays primary and
// the CPU Whisper backstops it. Model loading is reported through onStatus/onProgress.

import { ensureAsr, getAsr, getLiveAsr, getQuickAsr, probeHardware, subscribeAsr } from './asrEngine';

export type TranscribeSource =
  | { kind: 'mic' }
  | { kind: 'device'; deviceId: string }
  | { kind: 'stream'; stream: MediaStream };

export interface TranscriberEvents {
  /** NEW words since the last call (stable words, or a whole finished utterance). */
  onWords: (text: string, final: boolean) => void;
  onStatus?: (s: string) => void;
  onProgress?: (progress: number, label: string) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  onError?: (message: string) => void;
}

export interface TranscriberHandle {
  stop: () => void;
  engine: 'speech' | 'whisper';
  /**
   * The incoming audio, for a live waveform. Null when a native engine owns
   * the mic and only reports a level (draw from onLevel instead).
   */
  analyser: AnalyserNode | null;
}

import { DeltaWordAssembler } from './streamingOnnxTranscriber';
import { androidSpeechAvailable } from '../voca/vocaSpeech';

// ── streaming Whisper (GPU / NPU accelerated, see asrEngine.ts) ─────────────
// Live-caption style: the current utterance is re-transcribed about every half second while it is
// spoken, so words appear as they are said and correct themselves; it is finalised on a pause (or
// at a length cap, for continuous singing/music) and a new utterance begins.
const PASS_MS = 550;            // min gap between interim passes so WASM isn't starved by overlapping interim jobs
const SILENCE_FLUSH_MS = 150;   // brief pause that flushes held-back trailing word
const SILENCE_FINAL_MS = 400;   // pause that ends an utterance
const MAX_UTTER_S = 3.8;        // crisp rolling phrase window under continuous singing/music
const MIN_UTTER_S = 0.25;
const PREROLL_S = 0.5;

function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return input;
  const ratio = fromRate / 16000;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  // linear interpolation (the old nearest-sample decimation aliased badly and hurt accuracy)
  for (let i = 0; i < n; i++) {
    const x = i * ratio, i0 = Math.floor(x), f = x - i0;
    out[i] = (input[i0] || 0) * (1 - f) + (input[i0 + 1] || 0) * f;
  }
  return out;
}

/** Check if running inside desktop app environment (WebView2 / WinUI) */
export const isDesktopNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!((window as any).chrome?.webview || (window as any).Windows || (window as any).__TAURI__);
};

export function isWhisperHallucination(text: string): boolean {
  if (!text || text.length < 2) return true;
  const t = text.trim().toLowerCase();
  if (/^(?:thanks? for watching|thank you(?:\s+very\s+much)?|subtitles? by|subscribe|all rights reserved|see you (?:in the )?next|bye[- ]bye|please like and subscribe|translated by|copyright|closed captions?|amara\.org|mbc|listening|the end|you)[\s.!,]*$/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && words.every(w => w === words[0])) return true;
  if (words.length >= 6 && new Set(words).size <= Math.ceil(words.length / 4)) return true;     // loops
  if (/^[\[({♪\s*]+(?:music|applause|laughter|silence|audio|singing|cheering|blank_audio)*[\])}♪\s*]+$/i.test(t)) return true;
  return false;
}
const cleanAsr = (t: string) =>
  t
    .replace(/\[(?:music|applause|laughter|silence|audio|singing|instrumental|cheering|blank_audio|inaudible)[^\]]*\]/gi, ' ')
    .replace(/\((?:music|applause|laughter|silence|audio|singing|instrumental|cheering|blank_audio|inaudible)[^)]*\)/gi, ' ')
    .replace(/♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function encodePcm16kToWavBase64(pcm16k: Float32Array, sampleRate = 16000): string {
  const numSamples = pcm16k.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm16k[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64');
}

let choraGeminiServerAvailable: boolean | null = null;

export type SignalChainMode = 'speech' | 'music';

/**
 * Chora's primary audio window transcription engine: sends a 16 kHz WAV window to
 * `/api/ai/captions-window` (`gemini-3.6-flash` multimodal audio transcription).
 * Returns `null` if the endpoint is unreachable so callers seamlessly fall back to on-device Whisper.
 */
export async function transcribeWindowWithChoraGemini(
  pcm16k: Float32Array,
  meta: { title?: string; artist?: string; kind?: string } = {},
): Promise<Array<{ time: number; text: string }> | null> {
  if (choraGeminiServerAvailable === false) return null;
  if (pcm16k.length < 2400) return [];
  const windowSec = Math.max(1, pcm16k.length / 16000);
  try {
    const audioBase64 = encodePcm16kToWavBase64(pcm16k, 16000);
    const res = await fetch('/api/ai/captions-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: 'audio/wav',
        title: meta.title || (meta.kind === 'speech' ? 'Live Sermon & Scripture Reading' : 'Live Worship Audio'),
        artist: meta.artist || '',
        kind: meta.kind || 'music',
        windowSec,
      }),
    });
    if (res.status === 404 || res.status === 503) {
      choraGeminiServerAvailable = false;
      return null;
    }
    if (!res.ok) return null;
    choraGeminiServerAvailable = true;
    const data = await res.json().catch(() => ({}));
    if (!Array.isArray(data?.captions)) return null;
    return data.captions
      .map((c: any) => ({
        time: Number(c?.time ?? 0),
        text: cleanAsr(String(c?.text ?? '')),
      }))
      .filter((c: { time: number; text: string }) => c.text && !isWhisperHallucination(c.text));
  } catch {
    return null;
  }
}

// ── SIGNAL CHAIN 1: SPEECH / SCRIPTURE SIGNAL CHAIN (`mode: 'speech'`) ───────
// Dedicated to spoken sermon / pulpit audio and Auto Scripture detection.
//
// How it listens: audio is captured in an AudioWorklet (off the main thread), downmixed,
// conditioned (85 Hz rumble filter + gentle speech compressor) and gated by an adaptive
// energy VAD into one rolling utterance at a time. While the speaker talks, the current
// utterance is re-transcribed every ~⅓ s (words appear as they are said and correct
// themselves); a sentence pause finalises it. Whisper always pads its input to 30 s, so a
// pass costs the same whether the window is 1 s or 9 s — longer windows simply give the
// model more context, which is where the accuracy comes from. Under continuous speech the
// window is cut at the quietest moment of its last two seconds, never mid-word.
const SPEECH = {
  PASS_MS: 320,            // min gap between live passes
  NEW_AUDIO_S: 0.25,       // new audio needed before another live pass
  TAIL_FLUSH_MS: 200,      // short pause → flush the held-back trailing word
  SILENCE_FINAL_MS: 650,   // pause that ends an utterance (a sentence, a reference)
  MAX_UTTER_S: 9,          // rolling window cap under continuous speech
  MIN_UTTER_S: 0.35,
  PREROLL_S: 0.4,          // audio kept from before the VAD opened so onsets aren't clipped
  TRAIL_SILENCE_MS: 220,   // silence appended after the last voiced frame (word tails)
};

// Capture worklet: posts 1024-frame blocks (L, and R when the input is stereo).
const CAPTURE_WORKLET = `
class PjSpeechCapture extends AudioWorkletProcessor {
  constructor() { super(); this.n = 0; this.L = new Float32Array(1024); this.R = new Float32Array(1024); this.stereo = false; }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp[0]) return true;
    const L = inp[0], R = inp[1];
    for (let i = 0; i < L.length; i++) {
      this.L[this.n] = L[i];
      if (R) { this.R[this.n] = R[i]; this.stereo = true; }
      if (++this.n === 1024) {
        const l = this.L, r = this.stereo ? this.R : null;
        this.port.postMessage({ l, r }, r ? [l.buffer, r.buffer] : [l.buffer]);
        this.L = new Float32Array(1024); this.R = new Float32Array(1024); this.n = 0; this.stereo = false;
      }
    }
    return true;
  }
}
registerProcessor('pj-speech-capture', PjSpeechCapture);
`;
let captureWorkletUrl: string | null = null;
const captureWorkletModules = new WeakSet<BaseAudioContext>();

/**
 * Tap a node's audio as blocks on the main thread via an AudioWorklet; falls back to a
 * ScriptProcessorNode where worklets are unavailable. Returns a disconnect function.
 */
async function tapAudio(ctx: AudioContext, from: AudioNode, onBlock: (L: Float32Array, R: Float32Array | null) => void): Promise<() => void> {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      if (!captureWorkletModules.has(ctx)) {
        if (!captureWorkletUrl) captureWorkletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(captureWorkletUrl);
        captureWorkletModules.add(ctx);
      }
      const node = new AudioWorkletNode(ctx, 'pj-speech-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'clamped-max' });
      node.port.onmessage = (e) => { const d = e.data; if (d && d.l) onBlock(d.l, d.r || null); };
      // Must reach the destination or the graph never pulls it; the sink keeps it silent.
      const sink = ctx.createGain(); sink.gain.value = 0;
      from.connect(node); node.connect(sink); sink.connect(ctx.destination);
      return () => { try { node.port.onmessage = null; node.disconnect(); sink.disconnect(); } catch { /* */ } };
    } catch (e) {
      console.warn('[liveTranscriber] AudioWorklet unavailable, using ScriptProcessor', e);
    }
  }
  const proc = ctx.createScriptProcessor(2048, 2, 1);
  proc.onaudioprocess = (e) => {
    e.outputBuffer.getChannelData(0).fill(0);
    const n = e.inputBuffer.numberOfChannels;
    onBlock(new Float32Array(e.inputBuffer.getChannelData(0)), n > 1 ? new Float32Array(e.inputBuffer.getChannelData(1)) : null);
  };
  from.connect(proc); proc.connect(ctx.destination);
  return () => { try { proc.onaudioprocess = null; proc.disconnect(); } catch { /* */ } };
}

/** Mono from a stereo block: a single-channel USB interface (one dead side) must not be phase-cancelled. */
function downmix(L: Float32Array, R: Float32Array | null, out: Float32Array): Float32Array {
  const buf = out.length === L.length ? out : new Float32Array(L.length);
  if (!R) { buf.set(L); return buf; }
  let eL = 0, eR = 0;
  for (let i = 0; i < L.length; i++) { eL += L[i] * L[i]; eR += R[i] * R[i]; }
  if (eL > eR * 6) buf.set(L);
  else if (eR > eL * 6) buf.set(R);
  else for (let i = 0; i < L.length; i++) buf[i] = (L[i] + R[i]) * 0.5;
  return buf;
}

async function startSpeechWhisper(stream: MediaStream, ev: TranscriberEvents, ownsStream: boolean): Promise<TranscriberHandle> {
  ev.onStatus?.('Loading speech model…');
  const unsubInfo = subscribeAsr(i => {
    if (i?.loading) ev.onProgress?.(0.2 + 0.7 * i.progress, `Loading ${i.loading} ${Math.round(i.progress * 100)}%`);
    if (i?.error && !getAsr()) ev.onError?.(`Speech model failed to load: ${i.error}`);
  });
  void ensureAsr().catch(() => { /* reported through subscribeAsr */ });

  const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
  if (!AC) throw new Error('WebAudio AudioContext is not supported');
  const ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const resumeCtx = () => { if (ctx.state === 'suspended') void ctx.resume().catch(() => {}); };
  try {
    window.addEventListener('pointerdown', resumeCtx, { once: true, passive: true });
    window.addEventListener('keydown', resumeCtx, { once: true, passive: true });
  } catch { /* */ }

  const src = ctx.createMediaStreamSource(stream);
  // Speech conditioning: 85 Hz rumble filter + gentle AGC-style compressor + make-up gain.
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -34; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
  const makeup = ctx.createGain(); makeup.gain.value = 2.2;
  src.connect(hp); hp.connect(comp); comp.connect(makeup);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; makeup.connect(analyser);
  const SR = ctx.sampleRate;

  let utt = new Float32Array(Math.ceil(16000 * (SPEECH.MAX_UTTER_S + 2))), uttLen = 0;
  const pre = new Float32Array(Math.floor(16000 * SPEECH.PREROLL_S)); let preLen = 0;
  let frames: Array<{ start: number; rms: number }> = [];      // per-block energy, for quiet-point splits
  let speaking = false, silenceMs = 0, stopped = false, liveBusy = false;
  let lastPassLen = 0, lastPassAt = 0;
  let floor = 0.0025;
  let curAsm = new DeltaWordAssembler();
  // Assemblers whose utterance has had its final pass — a live pass that lands after that is stale.
  const closedAsm = new WeakSet<DeltaWordAssembler>();
  let lastLabel = '';
  let lastPassMs = 0;
  const monoBuf = new Float32Array(1024);
  let untap: (() => void) | null = null;

  const statusEngine = () => {
    const e = getLiveAsr();
    if (e) {
      const f = getAsr();
      const label = f && f !== e ? `${e.info.label} (live) + ${f.info.label} (final)` : e.info.label;
      if (label !== lastLabel) { lastLabel = label; ev.onStatus?.(`Listening · ${label}`); }
      return;
    }
    if (choraGeminiServerAvailable) {
      const lbl = 'Speech ASR';
      if (lbl !== lastLabel) { lastLabel = lbl; ev.onStatus?.(`Listening · ${lbl}`); }
    }
  };
  statusEngine();

  /** Clean linear speech peak normaliser (peak ≈ 0.9, up to 8× for quiet speakers). */
  const normaliseSpeech = (pcm: Float32Array) => {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) { const a = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (a > peak) peak = a; }
    if (peak < 0.0025) return pcm;
    const g = Math.min(8, 0.9 / peak);
    if (Math.abs(g - 1) < 0.05) return pcm;
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * g;
    return out;
  };

  // Finished utterances get a final pass, in order, on the best engine. The worker serialises
  // inference, so this runs alongside live passes without blocking them on the main thread.
  let finalChain: Promise<void> = Promise.resolve();
  const runFinal = async (job: { pcm: Float32Array; asm: DeltaWordAssembler }) => {
    try {
      const engine = getAsr() || await ensureAsr().catch(() => null);
      if (stopped) return;
      if (engine) {
        const { text: raw } = await engine.transcribe(job.pcm);
        if (stopped) return;
        const text = cleanAsr(raw);
        closedAsm.add(job.asm);
        if (text && !isWhisperHallucination(text)) {
          // Only words beyond what the live passes already put on screen — never a re-emit
          // of a sentence the room has already read.
          const out = job.asm.emittedCount() ? job.asm.finalTail(text) : text;
          ev.onWords(out || '', true);
        } else {
          ev.onWords('', true);
        }
        statusEngine();
        return;
      }
      // Fallback: server speech window if no local engine could load.
      const geminiCaps = await transcribeWindowWithChoraGemini(job.pcm, { kind: 'speech', title: 'Live Sermon & Scripture Reading' });
      if (stopped) return;
      const joined = geminiCaps?.map(c => c.text).join(' ').trim() || '';
      closedAsm.add(job.asm);
      if (joined && !isWhisperHallucination(joined)) {
        const out = job.asm.emittedCount() ? job.asm.finalTail(joined) : joined;
        ev.onWords(out || '', true);
        statusEngine();
        return;
      }
      ev.onWords('', true);
    } catch (e) {
      ev.onError?.(String((e as Error)?.message || e));
    }
  };

  const runLive = async (flushTail = false) => {
    const engine = getLiveAsr();
    if (!engine || liveBusy) return;
    const len = uttLen;
    if (len < 16000 * SPEECH.MIN_UTTER_S) return;
    liveBusy = true;
    lastPassLen = len; lastPassAt = performance.now();
    const a = curAsm;
    const pcm = normaliseSpeech(utt.slice(0, len));
    try {
      const { text: raw, ms } = await engine.transcribe(pcm);
      lastPassMs = ms;
      // A pass that lands after its utterance's FINAL pass is stale. One that lands after the
      // utterance merely ended (a short sentence on slow hardware) is still the earliest words
      // the room can get — emit them whole; the final pass then only adds what is missing.
      if (stopped || closedAsm.has(a)) return;
      const stale = a !== curAsm;
      const text = cleanAsr(raw);
      if (text && !isWhisperHallucination(text)) {
        let delta = a.partial(text);
        if (stale || flushTail || silenceMs >= SPEECH.TAIL_FLUSH_MS) {
          const tail = a.flushPending();
          if (tail) delta = delta ? `${delta} ${tail}` : tail;
        }
        if (delta) ev.onWords(delta, false);
      }
      statusEngine();
    } catch (e) {
      ev.onError?.(String((e as Error)?.message || e));
    } finally {
      liveBusy = false;
    }
  };

  /** Close the current utterance at `cut` samples; whatever follows starts the next one. */
  const finalize = (cut = uttLen) => {
    if (cut >= 16000 * SPEECH.MIN_UTTER_S) {
      const job = { pcm: normaliseSpeech(utt.slice(0, cut)), asm: curAsm };
      finalChain = finalChain.then(() => runFinal(job));
    } else {
      closedAsm.add(curAsm);
    }
    const rest = cut < uttLen ? utt.slice(cut, uttLen) : null;
    curAsm = new DeltaWordAssembler(); lastPassLen = 0; lastPassAt = 0;
    if (rest && rest.length) {
      utt.set(rest, 0); uttLen = rest.length;
      frames = frames.filter(f => f.start >= cut).map(f => ({ start: f.start - cut, rms: f.rms }));
    } else {
      uttLen = 0; speaking = false; silenceMs = 0; frames = [];
    }
  };

  /** Under continuous speech: cut at the quietest block of the last two seconds (never mid-word). */
  const splitLong = () => {
    const minCut = 16000 * 1.5, from = uttLen - 16000 * 2;
    let best: { start: number; rms: number } | null = null;
    for (const f of frames) if (f.start >= Math.max(minCut, from) && (!best || f.rms < best.rms)) best = f;
    finalize(best ? best.start : uttLen);
  };

  const onBlock = (L: Float32Array, R: Float32Array | null) => {
    if (stopped) return;
    const input = downmix(L, R, monoBuf);
    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    floor = Math.min(0.01, rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.999 + rms * 0.001);
    const voiced = rms > Math.max(0.003, floor * 1.65);
    const frameMs = (input.length / SR) * 1000;
    ev.onLevel?.(Math.min(1, rms * 14), voiced);
    const s16 = resampleTo16k(input, SR);

    if (voiced || speaking) {
      if (!speaking) {
        speaking = true; silenceMs = 0;
        utt.set(pre.subarray(0, preLen), 0); uttLen = preLen; frames = [];
      }
      // Keep a little trailing silence (word tails), not long dead stretches.
      if (voiced || silenceMs <= SPEECH.TRAIL_SILENCE_MS) {
        if (uttLen + s16.length > utt.length) { const g = new Float32Array(utt.length * 2); g.set(utt.subarray(0, uttLen)); utt = g; }
        frames.push({ start: uttLen, rms });
        utt.set(s16, uttLen); uttLen += s16.length;
      }
      silenceMs = voiced ? 0 : silenceMs + frameMs;
      const now = performance.now();
      if (silenceMs > SPEECH.SILENCE_FINAL_MS) {
        finalize();
      } else if (uttLen > 16000 * SPEECH.MAX_UTTER_S) {
        splitLong();
      } else if (!liveBusy && silenceMs >= SPEECH.TAIL_FLUSH_MS && uttLen > lastPassLen) {
        void runLive(true);                                   // a pause: get the last word out now
      } else if (!liveBusy && silenceMs >= SPEECH.TAIL_FLUSH_MS) {
        const tail = curAsm.flushPending();
        if (tail) ev.onWords(tail, false);
      } else if (!liveBusy && uttLen - lastPassLen > 16000 * SPEECH.NEW_AUDIO_S && now - lastPassAt > SPEECH.PASS_MS) {
        void runLive(false);
      }
    }
    // keep the pre-roll ring current
    if (s16.length >= pre.length) { pre.set(s16.subarray(s16.length - pre.length)); preLen = pre.length; }
    else {
      const keep = Math.min(preLen, pre.length - s16.length);
      pre.copyWithin(0, preLen - keep, preLen); pre.set(s16, keep); preLen = keep + s16.length;
    }
  };

  untap = await tapAudio(ctx, makeup, onBlock);

  return {
    engine: 'whisper',
    analyser,
    stop: () => {
      stopped = true;
      unsubInfo();
      try { untap?.(); } catch { /* */ }
      try { src.disconnect(); hp.disconnect(); comp.disconnect(); makeup.disconnect(); analyser.disconnect(); ctx.close(); } catch { /* */ }
      if (ownsStream) stream.getTracks().forEach(t => t.stop());
    },
  };
}

// ── SIGNAL CHAIN 2: MUSIC / LYRIC SIGNAL CHAIN (`mode: 'music'`) ─────────────
// Dedicated to live worship singing, DJ decks, and full music mixes:
// - Stereo Mid/Side center-channel vocal isolation (`centerIso`)
// - Vocal formant band-pass (185 Hz – 4500 Hz) + 2.1 kHz presence boost + soft-knee limiter
// - Chora Gemini 3.6-Flash music transcription (`kind: 'music'`) + Vocal-Isolated Whisper
async function startMusicWhisper(stream: MediaStream, ev: TranscriberEvents, ownsStream: boolean): Promise<TranscriberHandle> {
  ev.onStatus?.('Connecting Chora Audio ASR + Whisper ONNX…');
  const unsubInfo = subscribeAsr(i => {
    if (i?.loading) ev.onProgress?.(0.2 + 0.7 * i.progress, `Downloading ${i.loading} ${Math.round(i.progress * 100)}%`);
  });
  // Warm on-device Whisper in parallel without blocking immediate audio capture for Chora Gemini ASR
  void ensureAsr().catch(() => { /* Chora Gemini or retry handles it */ });

  const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
  if (!AC) throw new Error('WebAudio AudioContext is not supported');
  const ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const resumeCtx = () => { if (ctx.state === 'suspended') void ctx.resume().catch(() => {}); };
  try {
    window.addEventListener('pointerdown', resumeCtx, { once: true, passive: true });
    window.addEventListener('keydown', resumeCtx, { once: true, passive: true });
  } catch { /* */ }

  const src = ctx.createMediaStreamSource(stream);
  // Vocal formant conditioning: strip bass/kick (<185 Hz) and cymbals (>4500 Hz), boost 2.1 kHz vocal intelligibility
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 185; hp.Q.value = 0.8;
  const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 175; hp2.Q.value = 0.7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; lp.Q.value = 0.8;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2100; presence.gain.value = 3.8; presence.Q.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26; comp.knee.value = 10; comp.ratio.value = 3.2; comp.attack.value = 0.008; comp.release.value = 0.14;
  const makeup = ctx.createGain(); makeup.gain.value = 1.65;
  const proc = ctx.createScriptProcessor(2048, 2, 1);
  src.connect(hp); hp.connect(hp2); hp2.connect(lp); lp.connect(presence); presence.connect(comp); comp.connect(makeup); makeup.connect(proc); proc.connect(ctx.destination);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; makeup.connect(analyser);
  const SR = ctx.sampleRate;
  const centerBuf = new Float32Array(2048);

  // 16 kHz utterance buffer (grown in place) + a short pre-roll ring so word onsets aren't clipped.
  let utt = new Float32Array(16000 * (MAX_UTTER_S + 2)), uttLen = 0;
  const pre = new Float32Array(Math.floor(16000 * PREROLL_S)); let preLen = 0;
  let speaking = false, silenceMs = 0, stopped = false, busy = false;
  let lastPassLen = 0, lastPassAt = 0;
  let floor = 0.003;                                      // adaptive noise floor (capped so music never masks vocals)
  const asm = new DeltaWordAssembler();
  let lastLabel = '';
  let emittedInCurrentUtt = false;

  const statusEngine = () => {
    if (choraGeminiServerAvailable) {
      const lbl = 'Chora Gemini 3.6-Flash + Whisper ONNX';
      if (lbl !== lastLabel) { lastLabel = lbl; ev.onStatus?.(`Listening · ${lbl}`); }
      return;
    }
    const f = getAsr(), q = getQuickAsr();
    if (!f) return;
    const label = q && q !== f ? `${f.info.label} (final) + ${q.info.label} (live)` : f.info.label;
    if (label !== lastLabel) { lastLabel = label; ev.onStatus?.(`Listening · ${label}`); }
  };
  statusEngine();

  /** Bring an utterance to a clean, unclipped level (peak ≈ 0.85, soft-limited so drum transients never clip vocals). */
  const normalise = (pcm: Float32Array) => {
    let sumSq = 0, peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const v = pcm[i];
      sumSq += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    if (peak < 0.0025) return pcm;
    const rmsVal = Math.sqrt(sumSq / Math.max(1, pcm.length));
    const targetGain = Math.min(6, Math.max(0.8, 0.16 / Math.max(0.01, rmsVal)));
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.tanh(pcm[i] * targetGain);
    }
    return pcm;
  };

  // finished utterances waiting for their final pass, each with its own assembler
  const finals: Array<{ pcm: Float32Array; asm: DeltaWordAssembler; hadInterim: boolean }> = [];
  let curAsm = asm;

  const runFinal = async () => {
    if (busy || !finals.length) return;
    const job = finals.shift()!;
    busy = true;
    try {
      // 1. Primary: Local Hardware-Accelerated Whisper (WebGPU / NPU)
      const engine = getAsr() || await ensureAsr().catch(() => null);
      if (engine && !stopped) {
        const { text: raw } = await engine.transcribe(job.pcm);
        if (stopped) return;
        const text = cleanAsr(raw);
        const bad = isWhisperHallucination(text);
        if (text && !bad) {
          let out = job.asm.final(text);
          if (!out && !job.hadInterim) out = text;
          ev.onWords(out || '', true);
        } else {
          ev.onWords('', true);
        }
        statusEngine();
        return;
      }

      // 2. Fallback: Server audio window transcription
      const geminiCaps = await transcribeWindowWithChoraGemini(job.pcm, { kind: 'music', title: 'Live Worship Audio' });
      if (stopped) return;
      if (geminiCaps && geminiCaps.length > 0) {
        const joined = geminiCaps.map(c => c.text).join(' ').trim();
        if (joined && !isWhisperHallucination(joined)) {
          let out = job.asm.final(joined);
          if (!out && !job.hadInterim) out = joined;
          ev.onWords(out || '', true);
          statusEngine();
          return;
        }
      }
      ev.onWords('', true);
    } catch (e) {
      ev.onError?.(String((e as Error)?.message || e));
    } finally {
      busy = false;
      if (!stopped && finals.length) void runFinal();
    }
  };

  const runInterim = async (flushTail = false) => {
    const engine = getQuickAsr();
    if (!engine || busy || finals.length) return;
    const len = uttLen;
    if (len < 16000 * MIN_UTTER_S) return;
    busy = true;
    lastPassLen = len; lastPassAt = performance.now();
    const a = curAsm;
    const pcm = normalise(utt.slice(0, len));
    try {
      const { text: raw } = await engine.transcribe(pcm);
      if (stopped) return;
      const text = cleanAsr(raw);
      if (!isWhisperHallucination(text)) {
        let delta = a.partial(text);
        if (flushTail || silenceMs >= SILENCE_FLUSH_MS || len > 16000 * 1.2) {
          const tail = a.flushPending();
          if (tail) delta = delta ? `${delta} ${tail}` : tail;
        }
        if (delta) {
          emittedInCurrentUtt = true;
          ev.onWords(delta, false);
        }
      }
      statusEngine();
    } catch (e) {
      ev.onError?.(String((e as Error)?.message || e));
    } finally {
      busy = false;
      if (!stopped && finals.length) void runFinal();
    }
  };

  const finalize = () => {
    speaking = false; silenceMs = 0;
    if (uttLen >= 16000 * MIN_UTTER_S) {
      // Preserve last PREROLL_S samples into pre-roll so continuous singing across MAX_UTTER_S never clips a word
      const keepOverlap = Math.min(pre.length, uttLen);
      pre.set(utt.subarray(uttLen - keepOverlap, uttLen), 0);
      preLen = keepOverlap;
      finals.push({ pcm: normalise(utt.slice(0, uttLen)), asm: curAsm, hadInterim: emittedInCurrentUtt });
    }
    uttLen = 0; lastPassLen = 0; emittedInCurrentUtt = false;
    void runFinal();
  };

  proc.onaudioprocess = (e) => {
    const outChan = e.outputBuffer.getChannelData(0);
    outChan.fill(0);
    if (stopped) return;
    const nCh = e.inputBuffer.numberOfChannels;
    const L = e.inputBuffer.getChannelData(0);
    const input = centerBuf.length === L.length ? centerBuf : new Float32Array(L.length);
    if (nCh > 1) {
      const R = e.inputBuffer.getChannelData(1);
      let midE = 1e-6, sideE = 1e-6;
      for (let i = 0; i < L.length; i++) {
        const m = (L[i] + R[i]) * 0.5;
        const s = (L[i] - R[i]) * 0.5;
        midE += m * m;
        sideE += s * s;
      }
      const sideRatio = Math.sqrt(sideE / midE);
      const panGate = sideRatio > 0.15 ? Math.max(0.22, 1 - sideRatio * 0.65) : 1.0;
      for (let i = 0; i < L.length; i++) {
        const m = (L[i] + R[i]) * 0.5;
        const s = Math.abs(L[i] - R[i]) * 0.5;
        const instSuppress = m >= 0 ? Math.max(0, m - s * 0.45) : Math.min(0, m + s * 0.45);
        input[i] = m * 0.35 + instSuppress * 0.65 * panGate;
      }
    } else {
      input.set(L);
    }

    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    // Cap noise floor at 0.012 so continuous music accompaniment never raises the floor above the vocals
    floor = Math.min(0.012, rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.999 + rms * 0.001);
    const voiced = rms > Math.max(0.0035, floor * 1.75);
    const frameMs = (input.length / SR) * 1000;
    ev.onLevel?.(Math.min(1, rms * 12), voiced);
    const s16 = resampleTo16k(input, SR);

    if (voiced || speaking) {
      if (!speaking) {                                    // utterance onset: fresh assembler, start with the pre-roll
        speaking = true; curAsm = new DeltaWordAssembler(); lastPassLen = 0; lastPassAt = 0; emittedInCurrentUtt = false;
        utt.set(pre.subarray(0, preLen), 0); uttLen = preLen;
      }
      // Avoid appending long stretches of dead silence (>180ms) to the utterance buffer
      if (voiced || silenceMs <= 180) {
        if (uttLen + s16.length > utt.length) { const g = new Float32Array(utt.length * 2); g.set(utt.subarray(0, uttLen)); utt = g; }
        utt.set(s16, uttLen); uttLen += s16.length;
      }
      silenceMs = voiced ? 0 : silenceMs + frameMs;
      if (silenceMs > SILENCE_FINAL_MS || uttLen > 16000 * MAX_UTTER_S) {
        finalize();
      } else if (!busy && silenceMs >= SILENCE_FLUSH_MS && uttLen > lastPassLen) {
        void runInterim(true);
      } else if (!busy && silenceMs >= SILENCE_FLUSH_MS) {
        const tail = curAsm.flushPending();
        if (tail) { emittedInCurrentUtt = true; ev.onWords(tail, false); }
      } else if (!busy && uttLen - lastPassLen > 16000 * 0.45 && performance.now() - lastPassAt > PASS_MS) {
        void runInterim(false);
      }
    }
    // keep the pre-roll ring current
    if (s16.length >= pre.length) { pre.set(s16.subarray(s16.length - pre.length)); preLen = pre.length; }
    else {
      const keep = Math.min(preLen, pre.length - s16.length);
      pre.copyWithin(0, preLen - keep, preLen); pre.set(s16, keep); preLen = keep + s16.length;
    }
  };

  return {
    engine: 'whisper',
    analyser,
    stop: () => {
      stopped = true;
      unsubInfo();
      try { proc.disconnect(); src.disconnect(); hp.disconnect(); hp2.disconnect(); lp.disconnect(); presence.disconnect(); comp.disconnect(); makeup.disconnect(); analyser.disconnect(); ctx.close(); } catch { /* */ }
      if (ownsStream) stream.getTracks().forEach(t => t.stop());
    },
  };
}

// ── shared word tap (mode-aware so Speech & Music signal chains stay separate) ──
export type TranscriptTap = (text: string, final: boolean, sessionId: number, mode?: SignalChainMode) => void;
const taps = new Set<TranscriptTap>();
const activeSessions = new Map<number, { label: string; mode: SignalChainMode }>();
let sessionSeq = 0;
const tapSubs = new Set<() => void>();
const emitSessions = () => tapSubs.forEach(fn => { try { fn(); } catch { /* */ } });
export const subscribeTranscript = (fn: TranscriptTap) => { taps.add(fn); return () => { taps.delete(fn); }; };
/** Labels of the sessions currently listening (filtered by signal chain mode if specified). */
export const activeTranscriptions = (mode?: SignalChainMode) =>
  [...activeSessions.values()]
    .filter(s => !mode || s.mode === mode)
    .map(s => s.label);
export const subscribeTranscriptionSessions = (fn: () => void) => { tapSubs.add(fn); return () => { tapSubs.delete(fn); }; };

/**
 * Start the Speech Signal Chain (tuned for spoken sermons, scripture references, and verse reading).
 */
export async function startSpeechTranscription(
  source: TranscribeSource,
  ev: TranscriberEvents,
  lang = 'en-US',
  label = 'Auto scripture',
): Promise<TranscriberHandle> {
  return startLiveTranscription(source, ev, lang, label, 'speech');
}

/**
 * Start the Music Signal Chain (tuned for sung worship lyrics, vocal isolation, and music mixes).
 */
export async function startMusicTranscription(
  source: TranscribeSource,
  ev: TranscriberEvents,
  lang = 'en-US',
  label = 'Song follow',
): Promise<TranscriberHandle> {
  return startLiveTranscription(source, ev, lang, label, 'music');
}

export async function startLiveTranscription(
  source: TranscribeSource,
  ev: TranscriberEvents,
  lang = 'en-US',
  label = 'Listening',
  mode: SignalChainMode = 'speech',
): Promise<TranscriberHandle> {
  const id = ++sessionSeq;
  const tapped: TranscriberEvents = {
    ...ev,
    onWords: (text, final) => {
      ev.onWords(text, final);
      taps.forEach(fn => { try { fn(text, final, id, mode); } catch { /* */ } });
    },
  };
  const h = mode === 'music'
    ? await startMusicTranscriptionRaw(source, tapped, lang)
    : await startSpeechTranscriptionRaw(source, tapped, lang);
  activeSessions.set(id, { label, mode }); emitSessions();
  return {
    engine: h.engine,
    analyser: h.analyser,
    stop: () => { h.stop(); if (activeSessions.delete(id)) emitSessions(); },
  };
}

// ── Ambo live speech recognizer ─────────────────────────────────────────────
// Real-time streaming recognizer for live worship and sermon speech.
// Unlike children's reading check engines, this immediately emits interim words,
// never drops words on pauses, auto-restarts seamlessly, and provides a boosted
// AnalyserNode for clear, responsive waveforms.

class AmboLiveSpeechRecognizer {
  private rec: any = null;
  private active = false;
  private seq = 0;
  private emittedWords = new Map<number, string[]>();
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  public analyser: AnalyserNode | null = null;
  private meterRaf = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private source: TranscribeSource,
    private ev: TranscriberEvents,
    private lang = 'en-US',
    private mode: SignalChainMode = 'speech',
  ) {}

  async start(): Promise<void> {
    this.active = true;
    await this.setupAudioMeter();
    this.spawnRecognition();
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  private async setupAudioMeter(): Promise<void> {
    try {
      if (this.source.kind === 'mic') {
        const audioConstraints = this.mode === 'speech'
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: true };
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      } else if (this.source.kind === 'device') {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: this.source.deviceId },
            echoCancellation: this.mode === 'speech',
            noiseSuppression: this.mode === 'speech',
            autoGainControl: this.mode === 'speech',
          },
        });
      } else if (this.source.kind === 'stream') {
        this.stream = this.source.stream;
      }
    } catch (e) {
      this.ev.onError?.('Microphone access was blocked or unavailable');
      throw e;
    }

    if (!this.stream) return;

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.audioCtx = new AC();
      const srcNode = this.audioCtx.createMediaStreamSource(this.stream);
      const gainNode = this.audioCtx.createGain();
      // Boost input gain into analyser so standard speaking voices produce bold, clear scope motion
      gainNode.gain.value = 2.4;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.35;
      srcNode.connect(gainNode);
      gainNode.connect(this.analyser);

      const buf = new Float32Array(this.analyser.fftSize);
      const poll = () => {
        if (!this.active) return;
        this.analyser?.getFloatTimeDomainData(buf);
        let sum = 0, peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const s = buf[i];
          sum += s * s;
          const a = s < 0 ? -s : s;
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sum / buf.length);
        const speaking = rms > 0.006 || peak > 0.015;
        const level = Math.min(1, Math.pow(rms * 12 + peak * 1.8, 0.7));
        this.ev.onLevel?.(level, speaking);
        this.meterRaf = requestAnimationFrame(poll);
      };
      this.meterRaf = requestAnimationFrame(poll);
    } catch {
      // AudioContext meter fallback
    }
  }

  private spawnRecognition(): void {
    if (!this.active) return;
    const SR = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
      : null;

    if (!SR) {
      this.ev.onError?.('Speech recognition is not supported in this browser. Try Chrome, Edge or Safari.');
      return;
    }

    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    const seq = ++this.seq;
    this.emittedWords.clear();

    r.onstart = () => {
      if (seq === this.seq) this.ev.onStatus?.('Listening');
    };

    r.onresult = (e: any) => {
      if (seq !== this.seq || !this.active) return;
      for (let idx = e.resultIndex; idx < e.results.length; idx++) {
        const res = e.results[idx];
        const transcript = (res[0]?.transcript || '').trim();
        if (!transcript) continue;
        const words = transcript.split(/\s+/).filter(Boolean);
        const prev = this.emittedWords.get(idx) || [];
        let start = prev.length;
        if (prev.length > 0) {
          const checkFrom = Math.max(0, prev.length - 2);
          for (let i = checkFrom; i < prev.length && i < words.length; i++) {
            if (prev[i]?.toLowerCase() !== words[i]?.toLowerCase()) {
              start = i;
              break;
            }
          }
        }

        if (res.isFinal) {
          if (words.length > start) {
            const delta = words.slice(start).join(' ');
            this.ev.onWords(delta, true);
          } else {
            this.ev.onWords('', true);
          }
          this.emittedWords.delete(idx);
        } else {
          if (words.length > start) {
            const delta = words.slice(start).join(' ');
            this.emittedWords.set(idx, words);
            this.ev.onWords(delta, false);
          }
        }
      }
    };

    r.onerror = (e: any) => {
      const err = e?.error;
      if (err === 'no-speech' || err === 'aborted') return;
      if (err === 'not-allowed') {
        this.active = false;
        this.ev.onError?.('Microphone permission blocked. Please allow mic access in your browser.');
        return;
      }
      if (err === 'network' || err === 'service-not-allowed') {
        this.active = false;
        this.ev.onError?.('Web speech network service unavailable');
        return;
      }
    };

    r.onend = () => {
      if (!this.active) return;
      // Seamless immediate restart on browser pause/endpoint
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (this.active) this.spawnRecognition();
      }, 80);
    };

    this.rec = r;
    try {
      // CRITICAL: On 'mic' or 'device', always call r.start() with NO arguments.
      // Passing audioTrack from a MediaStream also wired to WebAudio ScriptProcessorNode
      // causes Chromium webkitSpeechRecognition to silently emit zero results.
      if (this.source.kind === 'stream') {
        const audioTrack = this.stream?.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState === 'live') {
          try { r.start(audioTrack); } catch { r.start(); }
        } else {
          r.start();
        }
      } else {
        r.start();
      }
    } catch {
      if (this.active) {
        this.restartTimer = setTimeout(() => this.spawnRecognition(), 200);
      }
    }
  }

  /** Release the recogniser but keep the mic stream + level meter (the Whisper chain shares them). */
  stopRecognitionOnly(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.rec) {
      this.rec.onstart = this.rec.onresult = this.rec.onerror = this.rec.onend = null;
      try { this.rec.abort(); } catch { /* */ }
      this.rec = null;
    }
    this.emittedWords.clear();
  }

  stop(): void {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    if (this.rec) {
      this.rec.onstart = this.rec.onresult = this.rec.onerror = this.rec.onend = null;
      try { this.rec.abort(); } catch { /* */ }
      this.rec = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* */ }
      this.audioCtx = null;
    }
    if (this.stream && this.source.kind !== 'stream') {
      try { this.stream.getTracks().forEach(t => t.stop()); } catch { /* */ }
    }
    this.stream = null;
    this.analyser = null;
  }
}

export const windowsSpeechAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as any).chrome?.webview;

// ── shared native session ───────────────────────────────────────────────────
// The Windows host owns ONE speech recogniser, but several features (auto-scripture, live captions, lyrics)
// may listen at once. Subscribers share it; it starts with the first and stops with the last.
type NativeSpeechMsg = { type: string; text?: string; alts?: string[]; state?: string; code?: string; message?: string };
const nativeSubs = new Set<(m: NativeSpeechMsg) => void>();
let nativeBridge: ((e: any) => void) | null = null;
const NATIVE_SEED_WORDS = [
  'jesus', 'lord', 'god', 'father', 'spirit', 'holy', 'amen', 'hallelujah', 'praise',
  'worship', 'glory', 'mercy', 'grace', 'faith', 'love', 'blessing', 'bible', 'scripture',
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth',
  'samuel', 'kings', 'chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs',
  'ecclesiastes', 'song', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel', 'hosea',
  'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai',
  'zechariah', 'malachi', 'matthew', 'mark', 'luke', 'john', 'acts', 'romans', 'corinthians',
  'galatians', 'ephesians', 'philippians', 'colossians', 'thessalonians', 'timothy', 'titus',
  'philemon', 'hebrews', 'james', 'peter', 'jude', 'revelation', 'chapter', 'verse',
  'sing', 'shout', 'rejoice', 'hosanna', 'salvation', 'cross', 'savior', 'worthy',
  'heaven', 'earth', 'king', 'kingdom', 'throne', 'peace', 'joy', 'hope', 'life',
  'tithes', 'offering', 'giving', 'generosity', 'welcome', 'church', 'prayer',
];
function postNative(o: object) {
  try { (window as any).chrome?.webview?.postMessage(JSON.stringify(o)); } catch { /* host gone */ }
}
function nativeSubscribe(lang: string, fn: (m: NativeSpeechMsg) => void): () => void {
  nativeSubs.add(fn);
  if (!nativeBridge) {
    nativeBridge = (e: any) => {
      let m: any;
      try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (typeof m?.type !== 'string' || !m.type.startsWith('SPEECH_')) return;
      nativeSubs.forEach(s => { try { s(m); } catch { /* */ } });
    };
    (window as any).chrome?.webview?.addEventListener('message', nativeBridge);
  }
  if (nativeSubs.size === 1) {
    // Seeding vocabulary helps if the host ever has to fall back to a list grammar; strict = never do that
    // silently for free-form speech — report the failure so we can switch to Whisper.
    postNative({ type: 'SPEECH_START', lang, words: NATIVE_SEED_WORDS, strict: true });
  }
  return () => {
    if (!nativeSubs.delete(fn)) return;
    if (nativeSubs.size === 0) {
      postNative({ type: 'SPEECH_STOP' });
      if (nativeBridge) {
        try { (window as any).chrome?.webview?.removeEventListener('message', nativeBridge); } catch { /* */ }
        nativeBridge = null;
      }
    }
  };
}

class AmboWindowsSpeechRecognizer {
  private active = false;
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  public analyser: AnalyserNode | null = null;
  private meterRaf = 0;
  private assembler = new DeltaWordAssembler();
  private unsub: (() => void) | null = null;
  private metering = false;

  private handler = (m: NativeSpeechMsg) => {
    if (!this.active) return;

    if (m.type === 'SPEECH_PARTIAL') {
      const delta = this.assembler.partial(m.text || '');
      if (delta) {
        this.ev.onWords(delta, false);
      }
    } else if (m.type === 'SPEECH_FINAL') {
      const delta = this.assembler.final(m.text || '');
      if (delta) {
        this.ev.onWords(delta, true);
      } else {
        this.ev.onWords('', true);
      }
    } else if (m.type === 'SPEECH_STATE') {
      if (m.state === 'starting') {
        this.assembler.reset();
        this.ev.onStatus?.('Starting…');
      } else if (m.state === 'listening') {
        this.ev.onStatus?.('Listening (Windows Native)');
      }
    } else if (m.type === 'SPEECH_ERROR') {
      if (m.code === 'privacy') {
        this.ev.onError?.('Turn on Online speech recognition in Windows Settings → Privacy & Security → Speech, or allow mic permissions.');
      } else {
        this.ev.onError?.(m.message || 'Speech recognition stopped');
      }
    }
  };

  constructor(
    private source: TranscribeSource,
    private ev: TranscriberEvents,
    private lang = 'en-US',
  ) {}

  /** The mic stream used for the level meter — handed to the Whisper fallback so it can share it. */
  getStream(): MediaStream | null { return this.stream; }

  async start(): Promise<void> {
    this.active = true;
    this.metering = true;
    this.assembler.reset();
    // Windows on-device speech engine
    this.unsub = nativeSubscribe(this.lang, this.handler);

    // Start parallel audio meter for live waveform
    await this.setupAudioMeter();
  }

  /** Release the native speech session but keep the mic stream + meter running. */
  stopNative(): void {
    this.active = false;
    this.assembler.reset();
    try { this.unsub?.(); } catch { /* */ }
    this.unsub = null;
  }

  private async setupAudioMeter(): Promise<void> {
    try {
      if (this.source.kind === 'mic') {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } else if (this.source.kind === 'device') {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: this.source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } else if (this.source.kind === 'stream') {
        this.stream = this.source.stream;
      }
    } catch {
      // Audio meter optional if mic permission is held by host
      return;
    }

    if (!this.stream) return;

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.audioCtx = new AC();
      const srcNode = this.audioCtx.createMediaStreamSource(this.stream);
      const gainNode = this.audioCtx.createGain();
      // Generous gain boost so regular speaking voice produces vivid, clear waveform scope
      gainNode.gain.value = 3.2;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.3;
      srcNode.connect(gainNode);
      gainNode.connect(this.analyser);

      const buf = new Float32Array(this.analyser.fftSize);
      const poll = () => {
        if (!this.metering) return;
        this.analyser?.getFloatTimeDomainData(buf);
        let sum = 0, peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const s = buf[i];
          sum += s * s;
          const a = s < 0 ? -s : s;
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sum / buf.length);
        const speaking = rms > 0.005 || peak > 0.012;
        const level = Math.min(1, Math.pow(rms * 14 + peak * 2.0, 0.75));
        this.ev.onLevel?.(level, speaking);
        this.meterRaf = requestAnimationFrame(poll);
      };
      this.meterRaf = requestAnimationFrame(poll);
    } catch {
      // AudioContext meter fallback
    }
  }

  stop(): void {
    this.stopNative();
    this.metering = false;
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* */ }
      this.audioCtx = null;
    }
    if (this.stream && this.source.kind !== 'stream') {
      try { this.stream.getTracks().forEach(t => t.stop()); } catch { /* */ }
    }
    this.stream = null;
    this.analyser = null;
  }
}

/** Android APK: native on-device speech recognition via Capacitor PlajahSpeech plugin */
class AmboAndroidSpeechRecognizer {
  private active = false;
  private plugin: any = null;
  private subs: any[] = [];
  private assembler = new DeltaWordAssembler();
  public analyser: AnalyserNode | null = null;
  private floor = 0.05;

  constructor(
    private source: TranscribeSource,
    private ev: TranscriberEvents,
    private lang = 'en-US',
  ) {
    const C = typeof window !== 'undefined' ? (window as any).Capacitor : null;
    this.plugin = C?.Plugins?.PlajahSpeech ?? C?.registerPlugin?.('PlajahSpeech');
  }

  async start(): Promise<void> {
    if (!this.plugin) {
      throw new Error('PlajahSpeech plugin is not available on this Android build');
    }
    this.active = true;
    this.assembler.reset();

    const on = async (evName: string, cb: (d: any) => void) => {
      this.subs.push(await this.plugin.addListener(evName, cb));
    };

    await on('partial', (d: any) => {
      if (!this.active) return;
      const delta = this.assembler.partial(d?.text || '');
      if (delta) this.ev.onWords(delta, false);
    });

    await on('final', (d: any) => {
      if (!this.active) return;
      const delta = this.assembler.final(d?.text || '');
      if (delta) this.ev.onWords(delta, true);
      else this.ev.onWords('', true);
    });

    await on('level', (d: any) => {
      if (!this.active) return;
      const l = Number(d?.level) || 0;
      this.floor = l < this.floor ? l : this.floor * 0.995 + l * 0.005;
      this.ev.onLevel?.(l, l > Math.max(0.18, this.floor * 2.2));
    });

    await on('state', (d: any) => {
      if (!this.active) return;
      const st = d?.state;
      if (st === 'starting') {
        this.assembler.reset();
        this.ev.onStatus?.('Starting (Android Native)…');
      } else if (st === 'listening') {
        this.ev.onStatus?.('Listening (Android Native)');
      }
    });

    await on('error', (d: any) => {
      this.ev.onError?.(d?.message || 'Android speech recognition stopped');
    });

    try {
      await this.plugin.start({ lang: this.lang });
    } catch (e: any) {
      this.ev.onError?.(e?.message || 'Failed to start Android speech');
    }
  }

  stop(): void {
    this.active = false;
    try { this.plugin?.stop(); } catch { /* */ }
    this.subs.forEach(s => s?.remove?.());
    this.subs = [];
    this.assembler.reset();
  }
}

/**
 * SPEECH SIGNAL CHAIN RAW LAUNCHER (`mode: 'speech'`)
 * Dedicated to Sermon, Ambo Scripture Auto-Detection, and Spoken Captions.
 *
 * Engine policy: on a machine with a usable GPU the on-device Whisper chain is THE engine.
 * The platform's quick recogniser (Web Speech in a browser, the Windows host's recogniser
 * in the desktop app) only bridges the seconds it takes Whisper to load, then is released
 * so one engine feeds the scripture listener. Without a GPU the quick recogniser stays
 * primary and Whisper (CPU) backstops it.
 */
async function startSpeechTranscriptionRaw(source: TranscribeSource, ev: TranscriberEvents, lang = 'en-US'): Promise<TranscriberHandle> {
  const isWinNative = windowsSpeechAvailable();
  const isAndroidNative = androidSpeechAvailable();
  const isDesktop = isDesktopNative();
  const hasSR = !isDesktop && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // 1. Explicit MediaStream (a routed bus, NDI/SRT audio, a test harness stream)
  if (source.kind === 'stream') {
    return startSpeechWhisper(source.stream, ev, false);
  }

  // Shared "quick recogniser bridges, Whisper takes over" wiring for 2. and 5.
  const bridged = async (
    quick: { start: () => Promise<void>; getStream: () => MediaStream | null; release: () => void; stop: () => void; analyser: () => AnalyserNode | null },
    wire: (onWords: (t: string, f: boolean) => void, onStatus: (s: string) => void, onError: (m: string) => void) => void,
  ): Promise<TranscriberHandle> => {
    const hw = await probeHardware();
    const localPrimary = hw.gpu && hw.gpuF16;
    let closed = false, released = false;
    let lastQuickWordAt = 0, lastEmittedNorm = '', lastEmittedAt = 0;
    let whisper: TranscriberHandle | null = null;

    const releaseQuick = () => {
      if (released) return;
      released = true;
      try { quick.release(); } catch { /* */ }
    };
    const emit = (text: string, final: boolean, fromQuick: boolean) => {
      if (closed) return;
      if (fromQuick && localPrimary && getLiveAsr()) { releaseQuick(); return; }   // Whisper is up: single engine from here
      const cleaned = text.trim();
      if (!cleaned) { if (final) ev.onWords('', true); return; }
      const now = performance.now();
      if (fromQuick) lastQuickWordAt = now;
      else if (!released && now - lastQuickWordAt < 2200) return;                 // bridging: quick words are already on screen
      const norm = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (norm && norm === lastEmittedNorm && now - lastEmittedAt < 2500) return;
      if (norm) { lastEmittedNorm = norm; lastEmittedAt = now; }
      ev.onWords(cleaned, final);
    };

    wire(
      (t, f) => emit(t, f, true),
      s => { if (!closed && !released) ev.onStatus?.(s); },
      m => { if (!whisper) ev.onError?.(m); else console.warn('[liveTranscriber:speech] quick recogniser:', m); },
    );
    await quick.start();

    const sharedStream = quick.getStream();
    if (sharedStream) {
      try {
        whisper = await startSpeechWhisper(sharedStream, {
          onWords: (t, f) => emit(t, f, false),
          onStatus: s => {
            if (closed) return;
            if (localPrimary && /^Listening ·/.test(s)) releaseQuick();
            if (released || localPrimary) ev.onStatus?.(s);
          },
          onProgress: ev.onProgress,
          onError: m => { if (!closed) ev.onError?.(m); },
        }, false);
        if (closed) { try { whisper.stop(); } catch { /* */ } }
      } catch (err) {
        console.warn('[liveTranscriber:speech] on-device Whisper unavailable:', err);
      }
    }

    return {
      engine: whisper && localPrimary ? 'whisper' : 'speech',
      analyser: quick.analyser() || whisper?.analyser || null,
      stop: () => {
        closed = true;
        try { whisper?.stop(); } catch { /* */ }
        quick.stop();
      },
    };
  };

  // 2. Windows desktop app (WebView2 / WinUI) on the default mic
  if (isWinNative && source.kind === 'mic') {
    let rec: AmboWindowsSpeechRecognizer | null = null;
    return bridged({
      start: async () => { await rec!.start(); },
      getStream: () => rec?.getStream() || null,
      release: () => rec?.stopNative(),
      stop: () => rec?.stop(),
      analyser: () => rec?.analyser || null,
    }, (onWords, onStatus, onError) => {
      rec = new AmboWindowsSpeechRecognizer(source, { ...ev, onWords, onStatus, onError }, lang);
    });
  }

  // 3. Windows desktop app on a specific audio input
  if (isWinNative && source.kind === 'device') {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: source.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) { ev.onError?.('Could not open that audio input'); throw e; }
    return startSpeechWhisper(stream, ev, true);
  }

  // 4. Android APK (Capacitor)
  if (isAndroidNative && source.kind === 'mic') {
    const recognizer = new AmboAndroidSpeechRecognizer(source, ev, lang);
    await recognizer.start();
    return {
      engine: 'speech',
      analyser: recognizer.analyser,
      stop: () => recognizer.stop(),
    };
  }

  // 5. Browser with the Web Speech API on the mic
  if (hasSR && source.kind === 'mic') {
    let rec: AmboLiveSpeechRecognizer | null = null;
    return bridged({
      start: async () => { await rec!.start(); },
      getStream: () => rec?.getStream() || null,
      release: () => rec?.stopRecognitionOnly(),
      stop: () => rec?.stop(),
      analyser: () => rec?.analyser || null,
    }, (onWords, onStatus, onError) => {
      rec = new AmboLiveSpeechRecognizer(source, { ...ev, onWords, onStatus, onError }, lang, 'speech');
    });
  }

  // 6. Everything else: Whisper on the mic / chosen input
  const constraints: MediaStreamConstraints = {
    audio: source.kind === 'device'
      ? { deviceId: { exact: source.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  };
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
  catch (e) { ev.onError?.('Microphone access was blocked'); throw e; }
  return startSpeechWhisper(stream, ev, true);
}

/**
 * MUSIC SIGNAL CHAIN RAW LAUNCHER (`mode: 'music'`)
 * Dedicated to Live Worship Lyrics, Song Follow, and Vocal-Isolated Music Transcription.
 * Disables speech noise-suppression (which clips sustained singing) and routes audio
 * through the stereo center-channel vocal isolator + 185Hz-4500Hz vocal formant chain.
 */
async function startMusicTranscriptionRaw(source: TranscribeSource, ev: TranscriberEvents, lang = 'en-US'): Promise<TranscriberHandle> {
  const isDesktop = isDesktopNative();
  const hasSR = !isDesktop && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  if (source.kind === 'stream') {
    return startMusicWhisper(source.stream, ev, false);
  }

  if (hasSR && source.kind === 'mic') {
    let whisperCompanion: TranscriberHandle | null = null;
    let closed = false;
    let lastEmittedNorm = '';
    let lastEmittedAt = 0;

    const dedupEmit = (text: string, final: boolean) => {
      if (closed) return;
      const cleaned = text.trim();
      if (!cleaned) return;
      const norm = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const now = performance.now();
      if (norm && norm === lastEmittedNorm && now - lastEmittedAt < 2800) {
        return;
      }
      if (norm) {
        lastEmittedNorm = norm;
        lastEmittedAt = now;
      }
      ev.onWords(cleaned, final);
    };

    const recognizer = new AmboLiveSpeechRecognizer(source, {
      ...ev,
      onWords: (t, f) => dedupEmit(t, f),
      onError: (msg) => {
        if (!whisperCompanion) {
          ev.onError?.(msg);
        }
      },
    }, lang, 'music');

    await recognizer.start();

    const sharedStream = recognizer.getStream();
    if (sharedStream) {
      void startMusicWhisper(sharedStream, {
        onWords: (t, f) => dedupEmit(t, f),
        onStatus: (s) => {
          if (!closed) ev.onStatus?.(`${s} + Web Speech`);
        },
        onProgress: ev.onProgress,
      }, false).then(wh => {
        if (closed) {
          try { wh.stop(); } catch { /* */ }
        } else {
          whisperCompanion = wh;
        }
      }).catch(err => {
        console.warn('[liveTranscriber:music] Companion Music Whisper on mic unavailable:', err);
      });
    }

    return {
      engine: 'whisper',
      analyser: recognizer.analyser,
      stop: () => {
        closed = true;
        recognizer.stop();
        if (whisperCompanion) {
          try { whisperCompanion.stop(); } catch { /* */ }
        }
      },
    };
  }

  const constraints: MediaStreamConstraints = {
    audio: source.kind === 'device'
      ? { deviceId: { exact: source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  };
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
  catch (e) { ev.onError?.('Microphone access was blocked'); throw e; }
  return startMusicWhisper(stream, ev, true);
}

/** Audio inputs the operator can pick from (labels need a prior permission grant). */
export async function listAudioInputs(): Promise<Array<{ deviceId: string; label: string }>> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput' && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
  } catch { return []; }
}

/**
 * Browsers hide input names until the page has used a mic once. Open and close
 * one briefly so the source list shows "Behringer X32 USB", not "Audio input 3".
 */
export async function unlockAudioInputLabels(): Promise<Array<{ deviceId: string; label: string }>> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
  } catch { /* denied: the list still works, just unnamed */ }
  return listAudioInputs();
}

/** True when the browser is still hiding input names. */
export const inputLabelsHidden = (inputs: Array<{ label: string }>) => inputs.length > 0 && inputs.every(d => /^Audio input \d+$/.test(d.label));
