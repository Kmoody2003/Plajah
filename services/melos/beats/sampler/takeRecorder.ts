// MEKA Sampler — the take recorder (Maschine's Record page). Pure: it is fed blocks of PCM and
// decides when a take starts and stops.
//
//   'threshold' — armed; the take starts when the input crosses the threshold, keeping a short
//                 pre-roll so the attack isn't clipped.
//   'immediate' — starts on the first block.
//   'sync'      — starts when the caller says the transport started (`transportStarted`).
// A take stops on `stop()`, at the length limit, or (sync) after the set number of bars.

export type RecordMode = 'threshold' | 'immediate' | 'sync';
export type TakeState = 'idle' | 'armed' | 'recording' | 'done';

export interface TakeOptions {
  mode: RecordMode;
  sampleRate: number;
  channels: number;
  thresholdDb?: number;   // threshold mode, dBFS (default -30)
  preRollSec?: number;    // kept before the threshold crossing (default 0.03)
  maxSec?: number;        // hard stop (default 60)
  lengthSec?: number;     // sync mode: stop after this long (e.g. bars at the song tempo)
}

export interface Take { channels: Float32Array[]; sampleRate: number; length: number }

export class TakeRecorder {
  state: TakeState = 'armed';
  private readonly o: Required<Omit<TakeOptions, 'lengthSec'>> & { lengthSec?: number };
  private chunks: Float32Array[][] = [];
  private recorded = 0;
  private pre: Float32Array[][] = [];
  private preLen = 0;
  private started = false;
  /** Peak level of the last block, dBFS — for the meter. */
  levelDb = -100;

  constructor(opts: TakeOptions) {
    this.o = { thresholdDb: -30, preRollSec: 0.03, maxSec: 60, ...opts };
    if (opts.mode === 'immediate') this.started = true;
  }

  /** Sync mode: the transport just started. */
  transportStarted(): void { if (this.o.mode === 'sync' && this.state === 'armed') this.started = true; }

  /** Feed one block (one Float32Array per channel, equal lengths). */
  push(block: Float32Array[]): void {
    if (this.state === 'done' || !block.length) return;
    const n = block[0].length;
    let peak = 0;
    for (const ch of block) for (let i = 0; i < n; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    this.levelDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const copy = block.map((c) => c.slice());

    if (!this.started && this.o.mode === 'threshold' && this.levelDb >= this.o.thresholdDb) this.started = true;
    if (!this.started) {
      // Keep a rolling pre-roll so the attack that crossed the threshold is in the take.
      this.pre.push(copy);
      this.preLen += n;
      const keep = Math.ceil(this.o.preRollSec * this.o.sampleRate);
      while (this.pre.length > 1 && this.preLen - this.pre[0][0].length >= keep) this.preLen -= this.pre.shift()![0].length;
      return;
    }
    if (this.state === 'armed') {
      this.state = 'recording';
      if (this.o.mode === 'threshold') {
        // Pre-roll: only the tail of it, preRollSec long.
        const keep = Math.ceil(this.o.preRollSec * this.o.sampleRate);
        let drop = Math.max(0, this.preLen - keep);
        for (const b of this.pre) {
          const len = b[0].length;
          if (drop >= len) { drop -= len; continue; }
          const part = b.map((c) => c.subarray(drop));
          this.chunks.push(part); this.recorded += part[0].length; drop = 0;
        }
      }
      this.pre = []; this.preLen = 0;
    }
    const limit = Math.round(Math.min(this.o.maxSec, this.o.lengthSec ?? Infinity) * this.o.sampleRate);
    const room = limit - this.recorded;
    const take = Math.min(room, n);
    if (take > 0) { this.chunks.push(take === n ? copy : copy.map((c) => c.subarray(0, take))); this.recorded += take; }
    if (this.recorded >= limit) this.state = 'done';
  }

  /** Seconds recorded so far. */
  get seconds(): number { return this.recorded / this.o.sampleRate; }

  stop(): void { this.state = 'done'; }

  /** The take, or null if nothing was recorded. */
  result(): Take | null {
    if (!this.recorded) return null;
    const channels = Array.from({ length: this.o.channels }, () => new Float32Array(this.recorded));
    let at = 0;
    for (const b of this.chunks) {
      for (let c = 0; c < this.o.channels; c++) channels[c].set(b[Math.min(c, b.length - 1)], at);
      at += b[0].length;
    }
    return { channels, sampleRate: this.o.sampleRate, length: this.recorded };
  }
}

/** Trim silence (below `db`) from both ends of a take, keeping `padSec` of margin. */
export function trimSilence(t: Take, db = -60, padSec = 0.005): { start: number; end: number } {
  const thr = Math.pow(10, db / 20);
  const loud = (i: number) => t.channels.some((c) => Math.abs(c[i]) > thr);
  let s = 0; while (s < t.length && !loud(s)) s++;
  let e = t.length - 1; while (e > s && !loud(e)) e--;
  const pad = Math.round(padSec * t.sampleRate);
  return { start: Math.max(0, s - pad), end: Math.min(t.length, e + 1 + pad) };
}
