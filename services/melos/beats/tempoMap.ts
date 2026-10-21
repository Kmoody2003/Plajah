// Melos Beats — the song's time axis. Every position in the groove doc is in BEATS (quarter
// notes); this module owns the two maps that turn beats into wall time and into bars:
//
//   TempoMap  — beats ↔ seconds. `doc.bpm` is the tempo at beat 0; `doc.tempoMap` adds changes
//               after it. A point with `ramp` glides linearly (in beats) to the next point —
//               the Bitwig/Studio One tempo-track ramp. No points = one constant tempo, exactly
//               the pre-tempo-track behaviour, so old docs play identically.
//   MeterMap  — beats ↔ bars. `doc.meter` holds time-signature changes keyed by bar index;
//               none = 4/4 everywhere. A bar of n/d is n × 4/d beats long.
//
// Both are pure and compiled once per doc edit (`signature` lets the engine skip recompiles), so
// the scheduler, the offline render and every ruler agree on where a beat lands.

import type { GrooveDoc } from './grooveDoc';

export interface TempoPoint {
  beat: number;     // > 0 — the tempo at beat 0 is doc.bpm
  bpm: number;      // 20–300
  /** Glide linearly from this tempo to the next point's (else the tempo jumps at the next point). */
  ramp?: boolean;
}

export interface MeterChange {
  bar: number;      // 0-based bar index where this signature starts
  num: number;      // 1–32
  den: number;      // 1, 2, 4, 8, 16, 32
}

const clampBpm = (b: number) => Math.max(20, Math.min(300, Number.isFinite(b) ? b : 120));

interface TempoSeg {
  beat: number;     // segment start (beats)
  sec: number;      // song seconds at segment start
  bpm0: number;     // tempo at segment start
  bpm1: number;     // tempo at segment end (== bpm0 unless ramping)
  len: number;      // segment length in beats (Infinity for the last)
}

export class TempoMap {
  readonly signature: string;
  readonly isConstant: boolean;
  private segs: TempoSeg[];

  private constructor(baseBpm: number, points: TempoPoint[]) {
    const pts = points
      .filter((p) => Number.isFinite(p.beat) && p.beat > 1e-9)
      .map((p) => ({ beat: p.beat, bpm: clampBpm(p.bpm), ramp: !!p.ramp }))
      .sort((a, b) => a.beat - b.beat);
    // Beat 0 is always doc.bpm. Its ramp flag would live on doc, so "ramp from the start" is
    // expressed by a point at a tiny beat — not needed in practice; beat 0 steps.
    const knots = [{ beat: 0, bpm: clampBpm(baseBpm), ramp: false }, ...pts];
    const segs: TempoSeg[] = [];
    let sec = 0;
    for (let i = 0; i < knots.length; i++) {
      const k = knots[i];
      const next = knots[i + 1];
      const len = next ? next.beat - k.beat : Infinity;
      const bpm1 = next && k.ramp ? next.bpm : k.bpm;
      segs.push({ beat: k.beat, sec, bpm0: k.bpm, bpm1, len });
      if (next) sec += segSeconds(k.bpm, bpm1, len, len);
    }
    this.segs = segs;
    this.isConstant = segs.length === 1;
    this.signature = JSON.stringify(knots);
  }

  static fromDoc(doc: Pick<GrooveDoc, 'bpm' | 'tempoMap'>): TempoMap {
    return new TempoMap(doc.bpm || 120, doc.tempoMap ?? []);
  }

  /** Constant-tempo map (offline helpers, tests). */
  static constant(bpm: number): TempoMap { return new TempoMap(bpm, []); }

  private segAtBeat(b: number): TempoSeg {
    const s = this.segs;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].beat <= b) lo = mid; else hi = mid - 1; }
    return s[lo];
  }

  private segAtSec(t: number): TempoSeg {
    const s = this.segs;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].sec <= t) lo = mid; else hi = mid - 1; }
    return s[lo];
  }

  /** Song seconds at a beat (beat 0 = 0s). Negative beats (count-in) extrapolate the first tempo. */
  beatToSec(b: number): number {
    if (b <= 0) return b * 60 / this.segs[0].bpm0;
    const g = this.segAtBeat(b);
    return g.sec + segSeconds(g.bpm0, g.bpm1, g.len, b - g.beat);
  }

  /** Beat at a song-seconds position — the inverse of beatToSec. */
  secToBeat(t: number): number {
    if (t <= 0) return t * this.segs[0].bpm0 / 60;
    const g = this.segAtSec(t);
    const dt = t - g.sec;
    if (g.bpm0 === g.bpm1 || !Number.isFinite(g.len)) return g.beat + dt * g.bpm0 / 60;
    // bpm(x) = a + kx over the segment → t(x) = (60/k)·ln(1 + kx/a) → x = a(e^{kt/60} − 1)/k
    const a = g.bpm0, k = (g.bpm1 - g.bpm0) / g.len;
    return g.beat + Math.min(g.len, a * (Math.exp(k * dt / 60) - 1) / k);
  }

  /** Instantaneous tempo at a beat. */
  bpmAt(b: number): number {
    const g = this.segAtBeat(Math.max(0, b));
    if (g.bpm0 === g.bpm1 || !Number.isFinite(g.len)) return g.bpm0;
    return g.bpm0 + (g.bpm1 - g.bpm0) * Math.min(1, (b - g.beat) / g.len);
  }

  /** Seconds between two beat positions (a note's duration at its place in the song). */
  secBetween(fromBeat: number, toBeat: number): number {
    return this.beatToSec(toBeat) - this.beatToSec(fromBeat);
  }
}

/** Seconds to travel `x` beats into a segment whose tempo goes bpm0 → bpm1 over `len` beats. */
function segSeconds(bpm0: number, bpm1: number, len: number, x: number): number {
  if (bpm0 === bpm1 || !Number.isFinite(len) || len <= 0) return x * 60 / bpm0;
  const k = (bpm1 - bpm0) / len;
  return (60 / k) * Math.log((bpm0 + k * x) / bpm0);
}

// ── Meter ────────────────────────────────────────────────────────────────────

export interface BarInfo {
  bar: number;          // 0-based bar index
  num: number;
  den: number;
  startBeat: number;    // where the bar starts
  lenBeats: number;     // bar length in beats
  unitBeats: number;    // one count of the signature (4/den beats) — the metronome click
  beatInBar: number;    // offset of the queried beat into the bar (beats)
}

interface MeterSeg { bar: number; beat: number; num: number; den: number; barLen: number }

const VALID_DEN = [1, 2, 4, 8, 16, 32];

export class MeterMap {
  readonly signature: string;
  readonly isConstant: boolean;
  private segs: MeterSeg[];

  private constructor(changes: MeterChange[]) {
    const byBar = new Map<number, MeterChange>();
    for (const c of changes) {
      if (!Number.isFinite(c.bar) || c.bar < 0) continue;
      const num = Math.max(1, Math.min(32, Math.round(c.num)));
      const den = VALID_DEN.includes(c.den) ? c.den : 4;
      byBar.set(Math.round(c.bar), { bar: Math.round(c.bar), num, den });
    }
    if (!byBar.has(0)) byBar.set(0, { bar: 0, num: 4, den: 4 });
    const sorted = [...byBar.values()].sort((a, b) => a.bar - b.bar);
    const segs: MeterSeg[] = [];
    let beat = 0;
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      const barLen = c.num * 4 / c.den;
      if (i > 0) { const p = segs[i - 1]; beat = p.beat + (c.bar - p.bar) * p.barLen; }
      segs.push({ bar: c.bar, beat, num: c.num, den: c.den, barLen });
    }
    this.segs = segs;
    this.isConstant = segs.length === 1 && segs[0].num === 4 && segs[0].den === 4;
    this.signature = JSON.stringify(sorted);
  }

  static fromDoc(doc: Pick<GrooveDoc, 'meter'>): MeterMap { return new MeterMap(doc.meter ?? []); }

  private segAtBeat(b: number): MeterSeg {
    const s = this.segs;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].beat <= b + 1e-9) lo = mid; else hi = mid - 1; }
    return s[lo];
  }

  private segAtBar(bar: number): MeterSeg {
    const s = this.segs;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].bar <= bar) lo = mid; else hi = mid - 1; }
    return s[lo];
  }

  /** The bar containing a beat. Beats before 0 fold into bar 0's signature (count-in). */
  at(beat: number): BarInfo {
    const g = this.segAtBeat(Math.max(0, beat));
    const into = Math.max(0, beat) - g.beat;
    const k = Math.floor(into / g.barLen + 1e-9);
    const startBeat = g.beat + k * g.barLen;
    return {
      bar: g.bar + k, num: g.num, den: g.den,
      startBeat, lenBeats: g.barLen, unitBeats: 4 / g.den,
      beatInBar: beat - startBeat,
    };
  }

  /** Beat where a (0-based) bar starts. */
  barToBeat(bar: number): number {
    const g = this.segAtBar(Math.max(0, bar));
    return g.beat + (Math.max(0, bar) - g.bar) * g.barLen;
  }

  /** Fractional bar position of a beat (bar 2.5 = halfway through the third bar). */
  beatToBar(beat: number): number {
    const b = this.at(beat);
    return b.bar + b.beatInBar / b.lenBeats;
  }

  /** Signature in force at a bar (for the ruler / meter editor). */
  signatureAtBar(bar: number): { num: number; den: number } {
    const g = this.segAtBar(Math.max(0, bar));
    return { num: g.num, den: g.den };
  }

  /** Is this beat exactly on a bar line? */
  isBarLine(beat: number): boolean { return Math.abs(this.at(beat).beatInBar) < 1e-6; }

  /** Bar starts within [fromBeat, toBeat). */
  bars(fromBeat: number, toBeat: number): BarInfo[] {
    const out: BarInfo[] = [];
    let b = this.at(Math.max(0, fromBeat));
    if (b.startBeat < fromBeat - 1e-9) b = this.at(b.startBeat + b.lenBeats);
    for (let guard = 0; guard < 100000 && b.startBeat < toBeat - 1e-9; guard++) {
      out.push(b);
      b = this.at(b.startBeat + b.lenBeats);
    }
    return out;
  }

  /** "Bar.Beat.Tick"-style readout (1-based, like every DAW): 5.3.2 */
  formatPosition(beat: number, ticksPerUnit = 4): string {
    const b = this.at(beat);
    const units = b.beatInBar / b.unitBeats;
    const u = Math.floor(units + 1e-9);
    const t = Math.floor((units - u) * ticksPerUnit + 1e-9);
    return `${b.bar + 1}.${u + 1}.${t + 1}`;
  }
}

/** Compiled maps for a doc, memoised on the doc's tempo/meter signature. */
let cache: { doc: GrooveDoc | null; tSig: string; mSig: string; tempo: TempoMap; meter: MeterMap } | null = null;

export function songTime(doc: GrooveDoc): { tempo: TempoMap; meter: MeterMap } {
  const tSig = `${doc.bpm}|${JSON.stringify(doc.tempoMap ?? [])}`;
  const mSig = JSON.stringify(doc.meter ?? []);
  if (!cache || cache.doc !== doc || cache.tSig !== tSig || cache.mSig !== mSig) {
    cache = { doc, tSig, mSig, tempo: TempoMap.fromDoc(doc), meter: MeterMap.fromDoc(doc) };
  }
  return { tempo: cache.tempo, meter: cache.meter };
}
