// Melos Beats — live voice capture. The mic (or any AudioNode, for tests and the lab) runs through
// an AnalyserNode in the engine's own AudioContext, so every event is stamped on the SAME clock
// the transport uses; the host converts those times to beats with BeatsEngine.beatAt().
//
//   sing    — YIN pitch (pitchTrack.ts) every 10 ms → NoteSegmenter → live on/off/pitch events
//             (to play the synth) + finished notes (to record).
//   beatbox — level onsets (beatbox.ts) → a 40 ms fingerprint → rules or your taught templates →
//             drum hits.
// Times are back-dated by the analysis window and the input latency, so a note recorded while the
// click plays lands where you sang it, not where the analysis noticed it.

import { BeatsEngine } from '../engine/BeatsEngine';
import { decimate, NoteSegmenter, rmsDb, yin, type SegEvent, type SegmenterOptions } from './pitchTrack';
import { classifyHit, hitFeatures, OnsetDetector, type DrumClass, type HitFeatures, type MouthModel } from './beatbox';

export type VoiceMode = 'sing' | 'beatbox';

export interface VoiceStatus {
  running: boolean;
  levelDb: number;
  /** Fractional MIDI pitch being sung (sing mode), or null. */
  pitch: number | null;
  /** The note currently held (sing mode), or null. */
  note: number | null;
  error?: string;
}

export interface VoiceHandlers {
  /** Live note on/off + continuous pitch (sing). */
  onSing?: (e: SegEvent) => void;
  /** A finished sung note, times on the audio clock (sing). */
  onNote?: (n: { t0: number; t1: number; midi: number; vel: number }) => void;
  /** A beatbox hit (beatbox). `features` is exposed for "teach it your mouth". */
  onHit?: (h: { t: number; cls: DrumClass; confidence: number; vel: number; features: HitFeatures }) => void;
  onStatus?: (s: VoiceStatus) => void;
}

const TICK_MS = 10;
const WIN_SEC = 0.04;

export class VoiceCapture {
  private static _inst: VoiceCapture | null = null;
  static get(): VoiceCapture { return (this._inst ??= new VoiceCapture()); }

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private src: AudioNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = new Float32Array(2048);
  private seg = new NoteSegmenter();
  private onset = new OnsetDetector();
  private pendingHit: { t: number; db: number } | null = null;
  private openNote: { t0: number; midi: number; vel: number } | null = null;
  private mode: VoiceMode = 'sing';
  private handlers: VoiceHandlers = {};
  private model: MouthModel | null = null;
  private status: VoiceStatus = { running: false, levelDb: -100, pitch: null, note: null };
  private minNoteSec = 0.07;
  private segOverrides: Partial<SegmenterOptions> = {};

  setHandlers(h: VoiceHandlers): void { this.handlers = h; }
  setMode(m: VoiceMode): void { this.flushNote(); this.mode = m; }
  setModel(m: MouthModel | null): void { this.model = m; }
  /** 0 (strict) … 1 (sensitive): voicing gate + clarity for singing, gate + rise for beatbox. */
  setSensitivity(s01: number): void {
    const s = Math.max(0, Math.min(1, s01));
    this.segOverrides = { gateDb: -36 - s * 24, clarity: 0.82 - s * 0.2 };
    this.seg.setOptions(this.segOverrides);
    this.onset.setOptions({ gateDb: -30 - s * 24, riseDb: 12 - s * 6 });
  }
  isRunning(): boolean { return !!this.timer; }

  /** Start listening — to the mic by default, or to `source` (an AudioNode in the engine context). */
  async start(source?: AudioNode): Promise<void> {
    if (this.timer) return;
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) throw new Error('Audio is not available');
    this.ctx = ctx;
    try {
      if (source) this.src = source;
      else {
        // Raw voice: no echo cancelling / noise gating / AGC — they smear pitch and kill transients.
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        this.src = ctx.createMediaStreamSource(this.stream);
      }
    } catch (e) {
      const msg = (e as { name?: string })?.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Could not open the microphone';
      this.emitStatus({ ...this.status, running: false, error: msg });
      throw new Error(msg);
    }
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.src.connect(this.analyser); // analysis only — never to the speakers (no feedback)
    this.seg = new NoteSegmenter(this.segOverrides);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emitStatus({ running: true, levelDb: -100, pitch: null, note: null });
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.flushNote();
    try { this.src?.disconnect(this.analyser!); } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.src = null; this.analyser = null;
    this.emitStatus({ running: false, levelDb: -100, pitch: null, note: null });
  }

  /** Seconds between a sound reaching the mic and the analyser seeing it (estimate). */
  private inputLatency(): number {
    const base = (this.ctx as unknown as { baseLatency?: number })?.baseLatency ?? 0.01;
    return Math.min(0.06, base + 0.01);
  }

  private tick(): void {
    const ctx = this.ctx, an = this.analyser;
    if (!ctx || !an) return;
    an.getFloatTimeDomainData(this.buf);
    const sr = ctx.sampleRate;
    const now = ctx.currentTime - this.inputLatency();
    const win = Math.min(this.buf.length, Math.round(WIN_SEC * sr));
    const frame = this.buf.subarray(this.buf.length - win);
    const db = rmsDb(frame);

    if (this.mode === 'sing') {
      const factor = sr >= 32000 ? 3 : 1;
      const r = yin(decimate(frame, factor), sr / factor);
      const t = now - WIN_SEC / 2;
      const events = this.seg.push({ t, f0: r?.f0 ?? null, clarity: r?.clarity ?? 0, rmsDb: db });
      for (const e of events) this.route(e);
      const pitch = r && r.clarity > 0.6 && db > -60 ? 69 + 12 * Math.log2(r.f0 / 440) : null;
      this.emitStatus({ running: true, levelDb: db, pitch, note: this.seg.active() });
      return;
    }

    // beatbox: onsets on a short (10 ms) level, then fingerprint once 40 ms of the hit is in.
    const shortWin = this.buf.subarray(this.buf.length - Math.round(0.01 * sr));
    const sdb = rmsDb(shortWin);
    if (this.onset.push(now, sdb)) this.pendingHit = { t: now - 0.005, db: sdb };
    if (this.pendingHit && now - this.pendingHit.t >= WIN_SEC) {
      const back = Math.round((now - this.pendingHit.t) * sr);
      const start = Math.max(0, this.buf.length - back);
      const seg = this.buf.slice(start, Math.min(this.buf.length, start + win));
      const features = hitFeatures(seg, sr);
      const { cls, confidence } = classifyHit(features, this.model);
      const vel = Math.max(20, Math.min(127, Math.round(40 + (this.pendingHit.db + 40) * 2.6)));
      this.handlers.onHit?.({ t: this.pendingHit.t, cls, confidence, vel, features });
      this.pendingHit = null;
    }
    this.emitStatus({ running: true, levelDb: sdb, pitch: null, note: null });
  }

  private route(e: SegEvent): void {
    this.handlers.onSing?.(e);
    if (e.type === 'on') {
      this.openNote = { t0: e.t, midi: e.midi, vel: e.vel };
    } else if (e.type === 'off' && this.openNote) {
      if (e.t - this.openNote.t0 >= this.minNoteSec) this.handlers.onNote?.({ t0: this.openNote.t0, t1: e.t, midi: this.openNote.midi, vel: this.openNote.vel });
      this.openNote = null;
    }
  }

  private flushNote(): void {
    if (!this.ctx) return;
    for (const e of this.seg.flush(this.ctx.currentTime)) this.route(e);
  }

  private emitStatus(s: VoiceStatus): void { this.status = s; this.handlers.onStatus?.(s); }
}
