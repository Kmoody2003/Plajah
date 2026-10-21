// Melos Beats — voice → notes, the pure half. YIN pitch detection on short frames and a streaming
// note segmenter that turns a pitch track into note-ons, note-offs and a continuous glide value.
// No Web Audio here: the live capture (voiceCapture.ts) feeds frames in, the tests feed synthetic
// tones — same code either way.
//
// Segmenter rules (what makes singing read as notes rather than wobble):
//   • a note starts after a few consecutive voiced frames agree on a pitch (onset is back-dated to
//     the first of them, so timing isn't late by the confirmation window);
//   • it ends after a short unvoiced gap (release), so a breath between words doesn't chop a note;
//   • it changes only when the pitch moves past a threshold and STAYS there (legato re-articulation),
//     so vibrato and scoops don't spray notes;
//   • a brief jump of an octave is treated as a detection error and ignored.

export interface PitchFrame {
  t: number;          // seconds (the audio-clock time the frame describes)
  f0: number | null;  // Hz, null when unvoiced
  clarity: number;    // 0..1 (1 − YIN's aperiodicity)
  rmsDb: number;      // frame level
}

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** RMS level of a frame in dBFS. */
export function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, x.length) + 1e-12);
}

/** Average-decimate by an integer factor (cheap anti-alias for voice-range pitch tracking). */
export function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += x[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

/**
 * YIN (de Cheveigné & Kawahara 2002): difference function, cumulative mean normalisation, absolute
 * threshold, parabolic interpolation. Returns null when nothing periodic enough is found.
 */
export function yin(x: Float32Array, sampleRate: number, minHz = 65, maxHz = 1100, threshold = 0.15): { f0: number; clarity: number } | null {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(x.length / 2), Math.ceil(sampleRate / minHz));
  if (tauMax <= tauMin + 2) return null;
  const W = x.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float32Array(tauMax + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; c[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < threshold) {
      while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // No dip under the threshold: take the global minimum if it's still reasonably periodic.
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.35) return null;
    tau = best;
  }
  // parabolic interpolation around the dip
  const a = c[tau - 1] ?? c[tau], b = c[tau], e = c[tau + 1] ?? c[tau];
  const denom = a + e - 2 * b;
  const shift = Math.abs(denom) > 1e-9 ? (a - e) / (2 * denom) : 0;
  const period = tau + Math.max(-1, Math.min(1, shift));
  return { f0: sampleRate / period, clarity: Math.max(0, Math.min(1, 1 - b)) };
}

export type SegEvent =
  | { type: 'on'; t: number; midi: number; vel: number }
  | { type: 'off'; t: number }
  | { type: 'pitch'; t: number; midi: number };   // continuous (fractional) pitch while a note sounds

export interface SegmenterOptions {
  clarity: number;        // minimum clarity to count as voiced
  gateDb: number;         // minimum level to count as voiced
  confirmFrames: number;  // frames that must agree before a note starts
  releaseSec: number;     // unvoiced time that ends a note
  changeSemis: number;    // pitch move that re-articulates (legato)
  changeFrames: number;   // frames the new pitch must hold
  minNoteSec: number;     // shorter notes are dropped
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  clarity: 0.72, gateDb: -48, confirmFrames: 3, releaseSec: 0.09, changeSemis: 0.75, changeFrames: 4, minNoteSec: 0.07,
};

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

/** Streaming note segmentation over pitch frames. Feed frames in time order; collect events. */
export class NoteSegmenter {
  private o: SegmenterOptions;
  private pend: PitchFrame[] = [];       // voiced frames waiting to confirm an onset
  private cur: { midi: number; t0: number; lastVoiced: number; peakDb: number } | null = null;
  private drift: PitchFrame[] = [];      // frames disagreeing with the current note
  private recent: number[] = [];         // recent fractional midis (for smoothing)

  constructor(opts: Partial<SegmenterOptions> = {}) { this.o = { ...DEFAULT_SEGMENTER, ...opts }; }

  setOptions(opts: Partial<SegmenterOptions>): void { this.o = { ...this.o, ...opts }; }

  /** Is a note sounding (for UI)? */
  active(): number | null { return this.cur ? this.cur.midi : null; }

  push(f: PitchFrame): SegEvent[] {
    const out: SegEvent[] = [];
    const voiced = f.f0 !== null && f.clarity >= this.o.clarity && f.rmsDb >= this.o.gateDb;
    const m = voiced ? hzToMidi(f.f0!) : null;

    if (!this.cur) {
      if (m === null) { this.pend = []; return out; }
      this.pend.push(f);
      if (this.pend.length > this.o.confirmFrames) this.pend.shift();
      if (this.pend.length === this.o.confirmFrames) {
        const ms = this.pend.map((p) => hzToMidi(p.f0!));
        if (Math.max(...ms) - Math.min(...ms) < 0.8) {
          const midi = Math.round(median(ms));
          const peak = Math.max(...this.pend.map((p) => p.rmsDb));
          this.cur = { midi, t0: this.pend[0].t, lastVoiced: f.t, peakDb: peak };
          this.recent = ms.slice();
          out.push({ type: 'on', t: this.pend[0].t, midi, vel: velFromDb(peak) });
          this.pend = [];
        }
      }
      return out;
    }

    // A note is sounding.
    if (m === null) {
      if (f.t - this.cur.lastVoiced >= this.o.releaseSec) out.push(...this.end(this.cur.lastVoiced));
      return out;
    }
    // Octave slips of the detector: fold a near-octave jump back toward the current note.
    let mm = m;
    const d = mm - this.cur.midi;
    if (Math.abs(Math.abs(d) - 12) < 0.6 && this.drift.length < this.o.changeFrames) mm -= Math.sign(d) * 12;
    this.cur.lastVoiced = f.t;
    this.recent.push(mm);
    if (this.recent.length > 5) this.recent.shift();
    const smooth = median(this.recent);
    if (Math.abs(smooth - this.cur.midi) >= this.o.changeSemis) {
      this.drift.push(f);
      if (this.drift.length >= this.o.changeFrames) {
        const ms = this.drift.map((p) => hzToMidi(p.f0!));
        const newMidi = Math.round(median(ms));
        if (newMidi !== this.cur.midi) {
          const t = this.drift[0].t;
          out.push(...this.end(t));
          const peak = Math.max(...this.drift.map((p) => p.rmsDb));
          this.cur = { midi: newMidi, t0: t, lastVoiced: f.t, peakDb: peak };
          this.recent = ms.slice(-3);
          out.push({ type: 'on', t, midi: newMidi, vel: velFromDb(peak) });
        }
        this.drift = [];
      }
    } else {
      this.drift = [];
    }
    if (this.cur) out.push({ type: 'pitch', t: f.t, midi: smooth });
    return out;
  }

  /** Close any sounding note (stop / panel closed). */
  flush(t: number): SegEvent[] { return this.cur ? this.end(Math.max(this.cur.lastVoiced, Math.min(t, this.cur.lastVoiced + this.o.releaseSec))) : []; }

  private end(t: number): SegEvent[] {
    const c = this.cur!;
    this.cur = null;
    this.drift = [];
    this.recent = [];
    // Notes shorter than minNoteSec still close here; eventsToNotes / the recorder drop them.
    return [{ type: 'off', t: Math.max(t, c.t0) }];
  }
}

/** Level → velocity: −48 dB ≈ 30, −6 dB ≈ 127. */
export function velFromDb(db: number): number {
  return Math.max(1, Math.min(127, Math.round(30 + ((db + 48) / 42) * 97)));
}

/** Run a whole buffer through YIN + the segmenter (offline, tests and "analyse a take"). */
export function trackBuffer(x: Float32Array, sampleRate: number, opts: Partial<SegmenterOptions> = {}, hopSec = 0.01, winSec = 0.04): SegEvent[] {
  const seg = new NoteSegmenter(opts);
  const hop = Math.round(hopSec * sampleRate), win = Math.round(winSec * sampleRate);
  const factor = sampleRate >= 32000 ? 3 : 1;
  const events: SegEvent[] = [];
  for (let i = 0; i + win <= x.length; i += hop) {
    const frame = x.subarray(i, i + win);
    const ds = decimate(frame, factor);
    const r = yin(ds, sampleRate / factor);
    const t = (i + win / 2) / sampleRate;
    events.push(...seg.push({ t, f0: r?.f0 ?? null, clarity: r?.clarity ?? 0, rmsDb: rmsDb(frame) }));
  }
  events.push(...seg.flush(x.length / sampleRate));
  return events;
}

/** Pair ons/offs into notes (seconds), dropping notes shorter than `minSec`. */
export function eventsToNotes(events: SegEvent[], minSec = DEFAULT_SEGMENTER.minNoteSec): { t0: number; t1: number; midi: number; vel: number }[] {
  const out: { t0: number; t1: number; midi: number; vel: number }[] = [];
  let open: { t0: number; midi: number; vel: number } | null = null;
  for (const e of events) {
    if (e.type === 'on') open = { t0: e.t, midi: e.midi, vel: e.vel };
    else if (e.type === 'off' && open) {
      if (e.t - open.t0 >= minSec) out.push({ t0: open.t0, t1: e.t, midi: open.midi, vel: open.vel });
      open = null;
    }
  }
  return out;
}
