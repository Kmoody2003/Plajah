// Score sequencer: a lookahead scheduler for `Score` cues. It is pure logic (no AudioContext): it asks a clock for "now", and hands
// timed note events to an `emit` callback, so it is testable with a fake clock and shared by live playback and offline renders.
//
//   * tracks of notes in beats, looped as one cue (a track can opt out with loop:false and plays only in the first pass)
//   * seeded variation (humanise timing, drop notes): a pure function of (seed, pass, track, note), so a given seed always sounds the same
//   * tempo scale with ramps ("the lullaby slows as the book ends")
//   * crossfade between cues; hooks tell the engine when to fade run gains

import type { Score, ScoreNote } from '../contracts';
import { rngFrom } from './dsp';

export interface ScoreEvent {
  /** absolute time in the clock's timeline, seconds */
  time: number;
  durSec: number;
  runId: number;
  trackIndex: number;
  instrument: string;
  note: string | number;
  vel: number;
  gain: number;
  pan: number;
  pass: number;
  beat: number;
}

export interface PassEvent { beat: number; trackIndex: number; note: ScoreNote; jitterSec: number }

/** Expand one pass of a score into sorted events with seeded variation applied. Deterministic. */
export function expandPass(score: Score, pass: number): PassEvent[] {
  const v = score.variation;
  const out: PassEvent[] = [];
  score.tracks.forEach((tr, ti) => {
    if (pass > 0 && tr.loop === false) return;
    tr.notes.forEach((n, ni) => {
      let jitter = 0;
      if (v && (v.dropout || v.humanizeMs)) {
        const r = rngFrom(v.seed ?? 1, pass, ti, ni);
        const drop = r(); const j = r();
        if (v.dropout && drop < v.dropout) return;
        if (v.humanizeMs) jitter = (j * 2 - 1) * v.humanizeMs / 1000;
      }
      out.push({ beat: pass * score.lengthBeats + n.t, trackIndex: ti, note: n, jitterSec: jitter });
    });
  });
  return out.sort((a, b) => a.beat - b.beat || a.trackIndex - b.trackIndex);
}

export interface TempoCurve { scaleAt(time: number): number }

export class RunCursor {
  pass = 0;
  curBeat = 0;
  curTime: number;
  private events: PassEvent[];
  private idx = 0;
  private pending: { ev: PassEvent; time: number } | null = null;
  /** true when every track is one-shot and has finished (the cue has nothing more to play) */
  finished = false;
  constructor(private score: Score, startTime: number, private tempo: TempoCurve) {
    this.curTime = startTime;
    this.events = expandPass(score, 0);
  }
  private advanceTo(beat: number) {
    const base = this.score.tempo || 100;
    while (this.curBeat < beat - 1e-9) {
      const db = Math.min(0.25, beat - this.curBeat);
      this.curTime += db * 60 / Math.max(10, base * this.tempo.scaleAt(this.curTime));
      this.curBeat += db;
    }
    this.curBeat = beat;
  }
  secPerBeat(time = this.curTime): number { return 60 / Math.max(10, (this.score.tempo || 100) * this.tempo.scaleAt(time)); }
  /** Pull events whose time is <= until. */
  pull(until: number): Array<{ pe: PassEvent; time: number }> {
    const out: Array<{ pe: PassEvent; time: number }> = [];
    for (let guard = 0; guard < 4096; guard++) {
      if (!this.pending) {
        if (this.idx >= this.events.length) {
          // roll to the next pass; one-shot cues (all tracks loop:false) end instead
          const anyLoop = this.score.tracks.some((t) => t.loop !== false);
          if (!anyLoop || this.score.lengthBeats <= 0) { this.finished = true; break; }
          this.pass++; this.events = expandPass(this.score, this.pass); this.idx = 0;
          if (!this.events.length) { this.advanceTo((this.pass + 1) * this.score.lengthBeats); if (this.curTime > until) break; }
          continue;
        }
        const ev = this.events[this.idx++];
        this.advanceTo(Math.max(this.curBeat, ev.beat));
        this.pending = { ev, time: this.curTime + ev.jitterSec };
      }
      // events are time-ordered by beat; jitter can only move them a few ms
      if (this.pending.time - 0.05 > until && this.curTime > until) break;
      if (this.pending.time > until) break;
      out.push({ pe: this.pending.ev, time: this.pending.time });
      this.pending = null;
    }
    return out;
  }
}

/** Expand a whole cue to timed events for an offline render (no clock). */
export function expandScore(score: Score, untilSec: number, o: { startTime?: number; tempoScale?: number; tempo?: TempoCurve } = {}): ScoreEvent[] {
  const tempo = o.tempo ?? { scaleAt: () => o.tempoScale ?? 1 };
  const cur = new RunCursor(score, o.startTime ?? 0, tempo);
  const evs: ScoreEvent[] = [];
  for (const { pe, time } of cur.pull(untilSec)) evs.push(toEvent(score, pe, time, 0, cur.secPerBeat(time), cur.pass));
  return evs;
}

function toEvent(score: Score, pe: PassEvent, time: number, runId: number, spb: number, pass: number): ScoreEvent {
  const tr = score.tracks[pe.trackIndex];
  return {
    time, durSec: Math.max(0.02, pe.note.d * spb), runId, trackIndex: pe.trackIndex, instrument: tr.instrument, note: pe.note.n,
    vel: pe.note.v ?? 0.7, gain: tr.gain ?? 1, pan: tr.pan ?? 0, pass, beat: pe.beat,
  };
}

// ───────────── live sequencer ─────────────
export interface Run { id: number; scoreId: string; state: 'active' | 'fading'; startedAt: number; endsAt?: number }
export interface SequencerHooks {
  now(): number;
  emit(ev: ScoreEvent, run: Run): void;
  /** a new run began; fade its gain in over fadeInSec */
  onStart?(run: Run, fadeInSec: number): void;
  /** the run was asked to stop; fade out over fadeOutSec, then call onEnd */
  onStop?(run: Run, fadeOutSec: number): void;
  onEnd?(run: Run): void;
  timer?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
}

export class Sequencer {
  private scores = new Map<string, Score>();
  private runs: Array<{ run: Run; cursor: RunCursor }> = [];
  private nextId = 1;
  private handle: unknown = null;
  private ramp = { from: 1, to: 1, t0: 0, t1: 0 };
  readonly lookaheadSec: number;
  readonly tickMs: number;
  constructor(private hooks: SequencerHooks, o: { lookaheadSec?: number; tickMs?: number } = {}) {
    this.lookaheadSec = o.lookaheadSec ?? 0.3; this.tickMs = o.tickMs ?? 40;
  }

  register(scores: Record<string, Score>) { for (const [k, v] of Object.entries(scores)) this.scores.set(k, { ...v, id: v.id || k }); }
  has(id: string) { return this.scores.has(id); }
  get activeRuns(): Run[] { return this.runs.map((r) => r.run); }
  get currentCue(): string | null { const a = this.runs.find((r) => r.run.state === 'active'); return a ? a.run.scoreId : null; }

  private tempo: TempoCurve = {
    scaleAt: (time) => {
      const r = this.ramp;
      if (time >= r.t1 || r.t1 <= r.t0) return r.to;
      if (time <= r.t0) return r.from;
      return r.from + (r.to - r.from) * ((time - r.t0) / (r.t1 - r.t0));
    },
  };
  get tempoScale(): number { return this.tempo.scaleAt(this.hooks.now()); }

  setTempoScale(scale: number, rampMs = 0) {
    const now = this.hooks.now();
    const from = this.tempo.scaleAt(now);
    const to = Math.max(0.2, Math.min(3, scale));
    this.ramp = { from, to, t0: now, t1: now + Math.max(0, rampMs) / 1000 };
  }

  play(id: string, o: { fadeMs?: number } = {}): Run | null {
    const score = this.scores.get(id);
    if (!score) return null;
    if (this.runs.some((r) => r.run.state === 'active' && r.run.scoreId === id)) return null;   // already playing: don't restart
    const fade = Math.max(0, o.fadeMs ?? 600) / 1000;
    const now = this.hooks.now();
    for (const r of this.runs) if (r.run.state === 'active') this.fadeOut(r, fade, now);
    const run: Run = { id: this.nextId++, scoreId: id, state: 'active', startedAt: now };
    const cursor = new RunCursor(score, now + 0.06, this.tempo);
    this.runs.push({ run, cursor });
    this.hooks.onStart?.(run, fade);
    this.ensureTimer();
    this.tick();
    return run;
  }

  stop(o: { fadeMs?: number } = {}) {
    const fade = Math.max(0, o.fadeMs ?? 800) / 1000;
    const now = this.hooks.now();
    for (const r of this.runs) if (r.run.state === 'active') this.fadeOut(r, fade, now);
  }

  /** Immediately drop every run without fades (dispose). */
  clear() {
    for (const r of this.runs) this.hooks.onEnd?.(r.run);
    this.runs = [];
    this.cancelTimer();
  }

  private fadeOut(r: { run: Run; cursor: RunCursor }, fadeSec: number, now: number) {
    r.run.state = 'fading'; r.run.endsAt = now + fadeSec + 0.05;
    this.hooks.onStop?.(r.run, fadeSec);
  }

  /** One scheduling pass: schedule everything that starts before now + lookahead. Exposed so tests can drive it with a fake clock. */
  tick() {
    const now = this.hooks.now();
    const until = now + this.lookaheadSec;
    const keep: typeof this.runs = [];
    for (const r of this.runs) {
      if (r.run.state === 'fading' && r.run.endsAt != null && now >= r.run.endsAt) { this.hooks.onEnd?.(r.run); continue; }
      if (r.cursor.curTime < now - 0.5) r.cursor.curTime = now;                      // we fell behind (tab throttled): re-anchor, don't burst
      const score = this.scores.get(r.run.scoreId);
      if (score) {
        for (const { pe, time } of r.cursor.pull(until)) {
          if (time < now - 0.05) continue;                                             // too late to be musical: skip
          this.hooks.emit(toEvent(score, pe, Math.max(now, time), r.run.id, r.cursor.secPerBeat(time), r.cursor.pass), r.run);
        }
        if (r.cursor.finished && r.run.state === 'active') { r.run.state = 'fading'; r.run.endsAt = now + 2; this.hooks.onStop?.(r.run, 1.5); }
      }
      keep.push(r);
    }
    this.runs = keep;
    if (!this.runs.length) this.cancelTimer();
  }

  private ensureTimer() {
    if (this.handle != null) return;
    const set = this.hooks.timer?.set ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const loop = () => { this.handle = null; this.tick(); if (this.runs.length) this.handle = set(loop, this.tickMs); };
    this.handle = set(loop, this.tickMs);
  }
  private cancelTimer() {
    if (this.handle == null) return;
    (this.hooks.timer?.clear ?? ((h: unknown) => clearTimeout(h as any)))(this.handle);
    this.handle = null;
  }
}
