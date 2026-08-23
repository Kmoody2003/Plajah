// The session runner — what turns a seed into twenty minutes of sound and light.
//
// Shared by both hosts. Stillness Deep wraps it with an entry screen and an ending; the
// generative channel wraps it with a burst controller and hands it a different seed. Neither
// owns it, and it owns no UI.
//
// Everything it plays comes from `emotionalEngine`. It never analyses its own output, so the
// visuals cannot drift away from the audio and an offline render is identical to a live one.

import { Instrument, SpatialLayout } from '../../melos/beats/engine/InstrumentHost';
import { StillnessDriverSampler } from '../../../components/plajahPixels/engine/stillnessDrivers';
import { createSession, drawEphemeralSeed, type ArrivalMood, type Session, type SessionState } from './emotionalEngine';
import { bloomNoteFor, turnGesture, velaParamsFor, velaSessionSetup } from './velaMapping';

export interface RunnerOptions {
  ctx: AudioContext;
  destination: AudioNode;
  durationSec: number;
  arrival?: ArrivalMood;
  /**
   * Omit for a Sola burst: the seed is then drawn from entropy, held in this object, and
   * written nowhere. Pass one only for the shared stream, where the whole point is that every
   * viewer resolves the same number.
   */
  seed?: number;
  /** Called each frame with the current state. The UI and Pixels both read from here. */
  onFrame?: (state: SessionState, sampler: StillnessDriverSampler) => void;
  onEnded?: () => void;
}

/** How far ahead notes are scheduled. Two seconds is well past any postMessage jitter. */
const LOOKAHEAD_SEC = 2;
/** Parameter updates. 20 Hz is far faster than anything in this session moves. */
const PARAM_INTERVAL_SEC = 0.05;

export class StillnessSession {
  readonly session: Session;
  readonly sampler = new StillnessDriverSampler();

  private inst: Instrument | null = null;
  private ctx: AudioContext;
  private destination: AudioNode;
  private startedAt = 0;
  private raf: number | null = null;
  private running = false;
  private nextBloom = 0;
  private turnFired = false;
  private lastParamAt = -1;
  private onFrame?: RunnerOptions['onFrame'];
  private onEnded?: RunnerOptions['onEnded'];

  /**
   * The seed for this session.
   *
   * For a Sola burst this is the only copy that exists, and it must not be persisted, logged or
   * attached to an analytics event — the design depends on the moment being genuinely
   * unrecoverable rather than merely un-offered. It is deliberately not exposed as a public
   * field for that reason; `isEphemeral` is what callers are allowed to know.
   */
  private readonly seed: number;
  readonly isEphemeral: boolean;

  constructor(opts: RunnerOptions) {
    this.ctx = opts.ctx;
    this.destination = opts.destination;
    this.onFrame = opts.onFrame;
    this.onEnded = opts.onEnded;
    this.isEphemeral = opts.seed === undefined;
    this.seed = opts.seed ?? drawEphemeralSeed();
    this.session = createSession({
      seed: this.seed,
      durationSec: opts.durationSec,
      arrival: opts.arrival,
    });
  }

  /** Elapsed seconds, from the audio clock rather than rAF — a backgrounded tab throttles rAF,
   *  and a session that silently slows down when you look away is worse than none. */
  get elapsed(): number {
    return this.running ? Math.max(0, this.ctx.currentTime - this.startedAt) : 0;
  }

  async start(offsetSec = 0): Promise<void> {
    if (this.running) return;
    const inst = await Instrument.create(this.ctx, {
      onError: (m) => console.warn('[stillness] instrument error', m),
    });
    inst.output.connect(this.destination);
    inst.setSpatial({ layout: SpatialLayout.Stereo });
    await inst.whenReady();

    const state = this.session.at(offsetSec);
    inst.setParams(velaSessionSetup(state.depth));
    inst.setParams(velaParamsFor(state));

    this.inst = inst;
    this.running = true;
    this.turnFired = offsetSec >= this.session.turnAt;
    // Joining mid-session is a first-class case, not an edge case: on the channel you tune in
    // whenever you tune in, and the state is a pure function of elapsed time, so there is
    // nothing to catch up.
    this.startedAt = this.ctx.currentTime - offsetSec;
    this.nextBloom = this.session.blooms().findIndex((e) => e.t > offsetSec);
    if (this.nextBloom < 0) this.nextBloom = this.session.blooms().length;
    this.tick();
  }

  private tick = (): void => {
    if (!this.running || !this.inst) return;
    const t = this.elapsed;
    const state = this.session.at(t);

    // Continuous parameters.
    if (t - this.lastParamAt >= PARAM_INTERVAL_SEC) {
      this.lastParamAt = t;
      this.inst.setParams(velaParamsFor(state));
    }

    // Blooms, scheduled a little ahead so message latency never shows up as timing.
    const events = this.session.blooms();
    while (this.nextBloom < events.length && events[this.nextBloom].t <= t + LOOKAHEAD_SEC) {
      const e = events[this.nextBloom];
      const at = this.session.at(e.t);
      const n = bloomNoteFor({ ...at, bloomPan: e.pan }, this.nextBloom, this.session.seed);
      this.voice(n.note, n.velocity, n.pan, n.durationSec, e.t - t);
      this.nextBloom++;
    }

    // The Turn: one gesture, and the only real transient in the session.
    if (!this.turnFired && t >= this.session.turnAt - LOOKAHEAD_SEC) {
      this.turnFired = true;
      const g = turnGesture(this.session.at(this.session.turnAt));
      this.voice(g.note, g.velocity, g.pan, 14, this.session.turnAt - t);
    }

    this.sampler.update(state, performance.now());
    this.onFrame?.(state, this.sampler);

    if (t >= this.session.durationSec) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Voice one note, `delaySec` from now, releasing after `durationSec`. */
  private voice(note: number, velocity: number, pan: number, durationSec: number, delaySec: number): void {
    const inst = this.inst;
    if (!inst) return;
    const when = this.ctx.currentTime + Math.max(0, delaySec);
    inst.setSpatial({ position: [pan, 0.2, -1] });
    const voiceId = inst.noteOn(note, velocity, when, this.ctx.currentTime, this.ctx.sampleRate);
    // Note-off does not silence a modal voice — it lifts the bow, and the body rings on. So the
    // duration here is how long energy is fed in, not how long the note lasts.
    window.setTimeout(() => {
      try { inst.noteOff(voiceId, true); } catch { /* disposed mid-session */ }
    }, (Math.max(0, delaySec) + durationSec) * 1000);
  }

  private finish(): void {
    // Never cut. The last voice rings out on its own — an envelope fade here would flatten the
    // one thing the instrument exists to do.
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.inst?.allNotesOff(false);
    this.onEnded?.();
  }

  /** Stop and release everything. `hard` also flushes the Veil's tail. */
  dispose(hard = false): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.inst) {
      this.inst.allNotesOff(hard);
      // Give the tail a moment before tearing the node down, unless asked to stop hard.
      const inst = this.inst;
      this.inst = null;
      if (hard) inst.dispose();
      else window.setTimeout(() => inst.dispose(), 4000);
    }
  }

  /**
   * The state this session will be in at a future moment.
   *
   * This is what makes the channel's handoff possible: a device rendering its own unique burst
   * can compute exactly where the shared stream will be at the crossfade second, and steer
   * toward it — so the fade happens between two things already in the same breath phase, at the
   * same depth, at the same brightness.
   */
  stateAt(absoluteElapsedSec: number): SessionState {
    return this.session.at(absoluteElapsedSec);
  }
}
