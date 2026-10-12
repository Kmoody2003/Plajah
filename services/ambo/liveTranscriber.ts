// liveTranscriber — words from a live source, for Ambo.
//
// One transcriber feeds every "listen to the room" feature: auto-scripture,
// live lyrics / captions on screen, visualizers. Sources:
//
//   mic     the default microphone through the best native/Web Speech engine
//           (low latency, streams words as they stabilise)
//   device  a specific audio input (mixer feed, USB interface)    ┐ on-device Whisper
//   stream  any MediaStream (an NDI/SRT/stream audio track,        ├ with an energy VAD,
//           the account's live stream, the program mix)            ┘ one utterance at a time
//
// The Web Speech engine can only hear the system default mic, so anything else
// takes the Whisper path. That path is slower (an utterance at a time) and
// downloads models once; the caller is told through onStatus.

import { ensureAsr, getAsr, getAsrInfo, getQuickAsr, probeHardware, subscribeAsr } from './asrEngine';

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
const PASS_MS = 300;            // min gap between interim passes
const SILENCE_FINAL_MS = 600;   // pause that ends an utterance
const MAX_UTTER_S = 9;          // hard cap so lines keep moving under continuous sound
const MIN_UTTER_S = 0.3;
const PREROLL_S = 0.35;

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
const cleanAsr = (t: string) => t.replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ').replace(/\s+/g, ' ').trim();

/** Whisper path: streaming captions from any MediaStream. */
async function startWhisper(stream: MediaStream, ev: TranscriberEvents, ownsStream: boolean): Promise<TranscriberHandle> {
  ev.onStatus?.('Loading accelerated speech model…');
  const unsubInfo = subscribeAsr(() => {
    const i = getAsrInfo();
    if (i.loading) ev.onProgress?.(0.2 + 0.7 * i.progress, `Downloading ${i.loading} ${Math.round(i.progress * 100)}%`);
  });
  try { await ensureAsr(); }
  catch (e) { unsubInfo(); ev.onError?.(`Speech model failed to load: ${String((e as Error)?.message || e)}`); throw e; }

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
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const sink = ctx.createGain(); sink.gain.value = 0;      // keeps the processor pulling without playing anything
  // speech conditioning: rumble/handling noise out, level evened out (AGC-like) before VAD + model
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -38; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const makeup = ctx.createGain(); makeup.gain.value = 2.4;
  src.connect(hp); hp.connect(comp); comp.connect(makeup); makeup.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser);
  const SR = ctx.sampleRate;

  // 16 kHz utterance buffer (grown in place) + a short pre-roll ring so word onsets aren't clipped.
  let utt = new Float32Array(16000 * (MAX_UTTER_S + 2)), uttLen = 0;
  const pre = new Float32Array(Math.floor(16000 * PREROLL_S)); let preLen = 0;
  let speaking = false, silenceMs = 0, stopped = false, busy = false;
  let lastPassLen = 0, lastPassAt = 0;
  let floor = 0.003;                                      // adaptive noise floor
  const asm = new DeltaWordAssembler();
  let lastLabel = '';

  const statusEngine = () => {
    const f = getAsr(), q = getQuickAsr();
    if (!f) return;
    const label = q && q !== f ? `${f.info.label} (final) + ${q.info.label} (live)` : f.info.label;
    if (label !== lastLabel) { lastLabel = label; ev.onStatus?.(`Listening · ${label}`); }
  };
  statusEngine();

  /** Bring an utterance to a steady level (peak ≈ 0.9, at most ×8) — quiet talkers transcribe far better. */
  const normalise = (pcm: Float32Array) => {
    let peak = 0; for (let i = 0; i < pcm.length; i++) { const a = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (a > peak) peak = a; }
    if (peak < 0.003) return pcm;
    const g = Math.min(8, 0.9 / peak);
    if (Math.abs(g - 1) < 0.05) return pcm;
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  };

  // finished utterances waiting for their final pass, each with its own assembler
  const finals: Array<{ pcm: Float32Array; asm: DeltaWordAssembler }> = [];
  let curAsm = asm;

  const runFinal = async () => {
    const engine = getAsr();
    if (!engine || busy || !finals.length) return;
    const job = finals.shift()!;
    busy = true;
    try {
      const { text: raw } = await engine.transcribe(job.pcm);
      if (stopped) return;
      const text = cleanAsr(raw);
      const bad = isWhisperHallucination(text);
      ev.onWords(bad ? '' : job.asm.final(text), true);
      statusEngine();
    } catch (e) {
      ev.onError?.(String((e as Error)?.message || e));
    } finally {
      busy = false;
      if (!stopped && finals.length) void runFinal();
    }
  };

  const runInterim = async () => {
    // live passes on the fast tier (NPU encoder when present), finished lines on the most accurate one (GPU Turbo)
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
      // only if this utterance is still the live one (a final may have closed it meanwhile — then its
      // final pass, queued behind us, re-reads the whole utterance with the same assembler)
      if (!isWhisperHallucination(text)) { const delta = a.partial(text); if (delta) ev.onWords(delta, false); }
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
    if (uttLen >= 16000 * MIN_UTTER_S) finals.push({ pcm: normalise(utt.slice(0, uttLen)), asm: curAsm });
    uttLen = 0; lastPassLen = 0;
    void runFinal();
  };

  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    // Track the noise floor slowly upward, quickly downward; "voice" = clearly above it.
    floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002;
    const voiced = rms > Math.max(0.006, floor * 2.4);
    const frameMs = (input.length / SR) * 1000;
    ev.onLevel?.(Math.min(1, rms * 12), voiced);
    const s16 = resampleTo16k(input, SR);

    if (voiced || speaking) {
      if (!speaking) {                                    // utterance onset: fresh assembler, start with the pre-roll
        speaking = true; curAsm = new DeltaWordAssembler(); lastPassLen = 0; lastPassAt = 0;
        utt.set(pre.subarray(0, preLen), 0); uttLen = preLen;
      }
      if (uttLen + s16.length > utt.length) { const g = new Float32Array(utt.length * 2); g.set(utt.subarray(0, uttLen)); utt = g; }
      utt.set(s16, uttLen); uttLen += s16.length;
      silenceMs = voiced ? 0 : silenceMs + frameMs;
      if (silenceMs > SILENCE_FINAL_MS || uttLen > 16000 * MAX_UTTER_S) finalize();
      else if (!busy && uttLen - lastPassLen > 16000 * 0.25 && performance.now() - lastPassAt > PASS_MS) void runInterim();
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
      try { proc.disconnect(); src.disconnect(); hp.disconnect(); comp.disconnect(); makeup.disconnect(); sink.disconnect(); analyser.disconnect(); ctx.close(); } catch { /* */ }
      if (ownsStream) stream.getTracks().forEach(t => t.stop());
    },
  };
}

// ── shared word tap ─────────────────────────────────────────────────────────
// Every running session also publishes its words here. Features that only need
// to HEAR (song follow, typographic visualizers) tap in instead of opening a
// second session — two Web Speech sessions cannot share the mic.
export type TranscriptTap = (text: string, final: boolean, sessionId: number) => void;
const taps = new Set<TranscriptTap>();
const activeSessions = new Map<number, string>();
let sessionSeq = 0;
const tapSubs = new Set<() => void>();
const emitSessions = () => tapSubs.forEach(fn => { try { fn(); } catch { /* */ } });
export const subscribeTranscript = (fn: TranscriptTap) => { taps.add(fn); return () => { taps.delete(fn); }; };
/** Labels of the sessions currently listening (who owns the mic). */
export const activeTranscriptions = () => [...activeSessions.values()];
export const subscribeTranscriptionSessions = (fn: () => void) => { tapSubs.add(fn); return () => { tapSubs.delete(fn); }; };

export async function startLiveTranscription(source: TranscribeSource, ev: TranscriberEvents, lang = 'en-US', label = 'Listening'): Promise<TranscriberHandle> {
  const id = ++sessionSeq;
  const tapped: TranscriberEvents = {
    ...ev,
    onWords: (text, final) => {
      ev.onWords(text, final);
      taps.forEach(fn => { try { fn(text, final, id); } catch { /* */ } });
    },
  };
  const h = await startLiveTranscriptionRaw(source, tapped, lang);
  activeSessions.set(id, label); emitSessions();
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
  private emittedCount = new Map<number, number>();
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  public analyser: AnalyserNode | null = null;
  private meterRaf = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private source: TranscribeSource,
    private ev: TranscriberEvents,
    private lang = 'en-US',
  ) {}

  async start(): Promise<void> {
    this.active = true;
    await this.setupAudioMeter();
    this.spawnRecognition();
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
    this.emittedCount.clear();

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
        const already = this.emittedCount.get(idx) || 0;

        if (res.isFinal) {
          if (words.length > already) {
            const delta = words.slice(already).join(' ');
            this.ev.onWords(delta, true);
          } else {
            this.ev.onWords('', true);
          }
          this.emittedCount.delete(idx);
        } else {
          if (words.length > already) {
            const delta = words.slice(already).join(' ');
            this.emittedCount.set(idx, words.length);
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
      const audioTrack = this.stream?.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        try { r.start(audioTrack); } catch { r.start(); }
      } else {
        r.start();
      }
    } catch {
      if (this.active) {
        this.restartTimer = setTimeout(() => this.spawnRecognition(), 200);
      }
    }
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
type NativeSpeechMsg = { type: string; text?: string; state?: string; code?: string; message?: string };
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

async function startLiveTranscriptionRaw(source: TranscribeSource, ev: TranscriberEvents, lang = 'en-US'): Promise<TranscriberHandle> {
  const isWinNative = windowsSpeechAvailable();
  const isAndroidNative = androidSpeechAvailable();
  const isDesktop = isDesktopNative();
  const hasSR = !isDesktop && typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // 1. On Windows Desktop app (WebView2 / WinUI): Windows 11's native on-device speech engine, which only hears the
  // system default mic. A specific input device or an explicit stream can't be routed to it → Whisper on that audio.
  if (isWinNative && source.kind === 'mic') {
    let gotWords = false, fellBack = false, closed = false, nativeListening = false;
    let speechMs = 0, lastLevelAt = 0;
    let whisper: TranscriberHandle | null = null;
    let recognizer: AmboWindowsSpeechRecognizer;
    // 'windows' forces the built-in Windows engine (CPU); default = accelerated Whisper once loaded.
    const forceWindows = (() => { try { return localStorage.getItem('ambo-asr-engine') === 'windows'; } catch { return false; } })();

    const fallback = async (reason: string) => {
      if (fellBack || closed) return;
      fellBack = true;
      console.warn('[liveTranscriber] Windows speech → accelerated Whisper:', reason);
      ev.onStatus?.(reason === 'upgrade' ? 'Switching to accelerated Whisper…' : 'Windows speech unavailable — using accelerated Whisper…');
      recognizer.stopNative();
      try {
        let stream = recognizer.getStream();
        let owns = false;
        if (!stream) { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); owns = true; }
        const w = await startWhisper(stream, { ...ev, onLevel: undefined }, owns);
        if (closed) { w.stop(); return; }
        whisper = w;
      } catch (e) {
        ev.onError?.(`Live transcription could not start (${reason}): ${String((e as Error)?.message || e)}`);
      }
    };

    recognizer = new AmboWindowsSpeechRecognizer(source, {
      ...ev,
      onStatus: (s) => {
        if (/^Listening/.test(s)) nativeListening = true;
        if (!fellBack) ev.onStatus?.(s);
      },
      onWords: (t, f) => { if (fellBack) return; if (t.trim()) gotWords = true; ev.onWords(t, f); },
      onLevel: (level, speaking) => {
        ev.onLevel?.(level, speaking);
        const now = performance.now();
        // only count speech the native engine was actually listening to (it can take seconds to start)
        if (nativeListening && lastLevelAt && speaking && !gotWords) speechMs += now - lastLevelAt;
        lastLevelAt = now;
        if (!gotWords && !fellBack && speechMs > 8000) void fallback('no words recognised');
      },
      onError: (m) => { if (!fellBack) void fallback(m); },
    }, lang);

    // Load the accelerated model in parallel; switch to it the moment it is usable.
    if (!forceWindows) {
      void probeHardware().then(hw => {
        if (!hw.gpu && !hw.npu) return;                   // no accelerator: Windows speech stays primary
        ev.onProgress?.(0.1, 'Loading accelerated speech model…');
        return ensureAsr().then(() => { if (!closed && !fellBack) void fallback('upgrade'); });
      }).catch(e => console.warn('[liveTranscriber] accelerated ASR unavailable, staying on Windows speech', e));
    }
    await recognizer.start();
    return {
      engine: 'speech',
      // the meter (and so the analyser) stays alive across a Whisper fallback
      analyser: recognizer.analyser,
      stop: () => {
        closed = true;
        try { whisper?.stop(); } catch { /* */ }
        recognizer.stop();
      },
    };
  }
  if (isWinNative && source.kind === 'device') {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) { ev.onError?.('Could not open that audio input'); throw e; }
    return startWhisper(stream, ev, true);
  }
  if (isWinNative && source.kind === 'stream') {
    return startWhisper(source.stream, ev, false);
  }

  // 2. On Android APK (Capacitor), use Android's on-device speech recognition via PlajahSpeech!
  if (isAndroidNative && source.kind === 'mic') {
    const recognizer = new AmboAndroidSpeechRecognizer(source, ev, lang);
    await recognizer.start();
    return {
      engine: 'speech',
      analyser: recognizer.analyser,
      stop: () => recognizer.stop(),
    };
  }

  // 3. MediaStreams (browser fallback only)
  if (source.kind === 'stream') {
    return startWhisper(source.stream, ev, false);
  }

  // 3. Fallback on other desktop platforms
  if (isDesktop) {
    const constraints: MediaStreamConstraints = {
      audio: source.kind === 'device'
        ? { deviceId: { exact: source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: false, noiseSuppression: false },
    };
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { ev.onError?.('Microphone access was blocked'); throw e; }
    return startWhisper(stream, ev, true);
  }

  // 3. In web browsers with Web Speech support, use AmboLiveSpeechRecognizer for low-latency streaming
  if (hasSR && source.kind === 'mic') {
    let currentHandle: TranscriberHandle | null = null;
    let fallbackTriggered = false;

    const recognizer = new AmboLiveSpeechRecognizer(source, {
      ...ev,
      onError: (msg) => {
        if (!fallbackTriggered && (msg.includes('network') || msg.includes('unavailable'))) {
          fallbackTriggered = true;
          recognizer.stop();
          ev.onStatus?.('Using local transcriber…');
          navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
            .then(st => startWhisper(st, ev, true))
            .then(wh => { currentHandle = wh; })
            .catch(e => ev.onError?.(String(e?.message || e)));
          return;
        }
        ev.onError?.(msg);
      },
    }, lang);

    await recognizer.start();
    currentHandle = {
      engine: 'speech',
      analyser: recognizer.analyser,
      stop: () => {
        recognizer.stop();
        if (currentHandle && currentHandle.stop !== recognizer.stop) {
          try { currentHandle.stop(); } catch { /* */ }
        }
      },
    };
    return currentHandle;
  }

  // Fallback to Whisper when browser has no Web Speech support or for device inputs
  const constraints: MediaStreamConstraints = {
    audio: source.kind === 'device'
      ? { deviceId: { exact: source.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false },
  };
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
  catch (e) { ev.onError?.('Microphone access was blocked'); throw e; }
  return startWhisper(stream, ev, true);
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
