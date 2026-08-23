// The session runner — what turns a seed into twenty minutes of sound and light.
//
// Shared by both hosts. Stillness Deep wraps it with an entry screen and an ending; the
// generative channel wraps it with a burst controller and hands it a different seed. Neither
// owns it, and it owns no UI.
//
// Everything it plays comes from `emotionalEngine`. It never analyses its own output, so the
// visuals cannot drift away from the audio and an offline render is identical to a live one.
//
// It runs the suite as an ENSEMBLE rather than as one instrument that changes patch. Several
// layers sound at once and crossfade as the arc moves:
//
//   ISON    the drone. Never leaves, and re-voices only when the pitch collection mutates —
//           it is the thing everything else is heard against, so it must not compete.
//   CANTUS  the voice. Carries the harmony through Settling and Return.
//   PNEUMA  breath. Carries Depth, because it is the emptiest thing in the suite.
//   VELA    a struck body, and ONLY at the Turn. One gesture in twenty minutes.
//
// Each layer is its own Instrument through its own gain node. That is the honest way to
// crossfade: swapping a patch under a sounding voice cuts its tail, and a modal body's tail is
// most of what it is.

import { Instrument, SpatialLayout } from '../../melos/beats/engine/InstrumentHost';
import { StillnessDriverSampler } from '../../../components/plajahPixels/engine/stillnessDrivers';
import { createSession, drawEphemeralSeed, type ArrivalMood, type Session, type SessionState } from './emotionalEngine';
import { turnGesture, velaParamsFor, velaSessionSetup } from './velaMapping';
import { createPlayer, type Player } from './velaPlayer';
import { velaDriftSetup } from '../../melos/instruments/vela/patch';
import { ensembleFor, findSuitePreset, type SuiteInstrument } from '../../melos/instruments/vela/suite';

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
  onFrame?: (state: SessionState, sampler: StillnessDriverSampler) => void;
  onEnded?: () => void;
}

/** How far ahead notes are scheduled. Two seconds is well past any postMessage jitter. */
const LOOKAHEAD_SEC = 2;
/** Parameter updates. 20 Hz is far faster than anything in this session moves. */
const PARAM_INTERVAL_SEC = 0.05;
/**
 * Time constant for a layer's level.
 *
 * Long on purpose. The ensemble's own levels already move slowly and this sits on top of them:
 * an instrument that becomes audible in under a couple of seconds reads as an entrance, and the
 * arc is meant to contain exactly one of those.
 */
const LAYER_FADE_TAU = 2.5;

interface Layer {
  inst: Instrument;
  gain: GainNode;
  presetId: string;
  /** Voice ids currently sounding, so a re-voice can release them. */
  held: number[];
}

export class StillnessSession {
  readonly session: Session;
  readonly sampler = new StillnessDriverSampler();

  private ctx: AudioContext;
  private destination: AudioNode;
  private layers = new Map<SuiteInstrument, Layer>();
  private pending = new Set<SuiteInstrument>();
  private startedAt = 0;
  private raf: number | null = null;
  private running = false;

  private player: Player | null = null;
  private nextEvent = 0;
  private turnFired = false;
  private lastParamAt = -1;
  /** The pitch collection last handed to the drone, so it re-voices only when it moves. */
  private droneSet = '';

  private onFrame?: RunnerOptions['onFrame'];
  private onEnded?: RunnerOptions['onEnded'];

  /**
   * The seed for this session.
   *
   * For a Sola burst this is the only copy that exists, and it must not be persisted, logged or
   * attached to an analytics event — the design depends on the moment being genuinely
   * unrecoverable rather than merely un-offered. Deliberately not a public field for that
   * reason; `isEphemeral` is what callers are allowed to know.
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

  /** Which instruments are sounding right now, and how present each is. For the UI. */
  get ensemble(): Array<{ instrument: SuiteInstrument; presetId: string; level: number }> {
    return [...this.layers.entries()].map(([instrument, l]) => ({
      instrument, presetId: l.presetId, level: +l.gain.gain.value.toFixed(3),
    }));
  }

  async start(offsetSec = 0): Promise<void> {
    if (this.running) return;
    const state = this.session.at(offsetSec);

    this.player = createPlayer(this.seed, this.session.durationSec, (t) => this.session.at(t));

    // Bring up whatever the arc calls for at this moment. Joining mid-session is a first-class
    // case — on the channel you tune in whenever you tune in.
    for (const layer of ensembleFor(state.phase, state.depth, state.arousal)) {
      await this.ensureLayer(layer.instrument, layer.presetId, state, layer.level);
    }

    this.running = true;
    this.turnFired = offsetSec >= this.session.turnAt;
    this.startedAt = this.ctx.currentTime - offsetSec;
    const evs = this.player.events();
    this.nextEvent = evs.findIndex((e) => e.at > offsetSec);
    if (this.nextEvent < 0) this.nextEvent = evs.length;
    this.tick();
  }

  /** Create a layer if it does not exist, load its patch, and set its level. */
  private async ensureLayer(
    kind: SuiteInstrument,
    presetId: string,
    state: SessionState,
    level: number,
  ): Promise<void> {
    let layer = this.layers.get(kind);
    if (!layer) {
      // Guard against the rAF loop asking for the same layer again while the first request is
      // still awaiting the worklet — two Instruments for one part would double its level and
      // leave one of them unreachable.
      if (this.pending.has(kind)) return;
      this.pending.add(kind);
      try {
        const inst = await Instrument.create(this.ctx, {
          onError: (m) => console.warn('[stillness]', kind, m),
        });
        const gain = this.ctx.createGain();
        // Start silent and fade up. A layer that arrives at full level is an entrance.
        gain.gain.value = 0;
        inst.output.connect(gain);
        gain.connect(this.destination);
        inst.setSpatial({ layout: SpatialLayout.Stereo });
        await inst.whenReady();
        inst.setParams(velaSessionSetup(state.depth));
        inst.setParams(velaDriftSetup());
        layer = { inst, gain, presetId: '', held: [] };
        this.layers.set(kind, layer);
      } finally {
        this.pending.delete(kind);
      }
      // The session may have been torn down while the worklet was loading.
      if (!this.running && this.startedAt !== 0) {
        layer.inst.dispose();
        layer.gain.disconnect();
        this.layers.delete(kind);
        return;
      }
    }
    this.loadPreset(layer, presetId, state);
    layer.gain.gain.setTargetAtTime(level, this.ctx.currentTime, LAYER_FADE_TAU);
  }

  /** Apply a preset, then re-apply the session's continuous parameters on top of it, so a patch
   *  change never overwrites where the arc currently is. */
  private loadPreset(layer: Layer, presetId: string, state: SessionState): void {
    if (presetId === layer.presetId) return;
    const found = findSuitePreset(presetId);
    if (!found) return;
    layer.presetId = presetId;
    layer.inst.setParams(
      Object.entries(found.preset.params).map(([id, v]) => [Number(id), v] as [number, number]),
    );
    layer.inst.setParams(velaParamsFor(state));
  }

  private tick = (): void => {
    if (!this.running) return;
    const t = this.elapsed;
    const state = this.session.at(t);

    // ── the ensemble ────────────────────────────────────────────────────────
    const wanted = ensembleFor(state.phase, state.depth, state.arousal);
    const present = new Set(wanted.map((l) => l.instrument));
    for (const l of wanted) {
      // `void` rather than await: this runs inside a rAF callback, and a layer still spinning up
      // simply joins on a later frame.
      void this.ensureLayer(l.instrument, l.presetId, state, l.level);
    }
    // Anything no longer wanted fades out rather than stopping. Its tail is part of the sound.
    for (const [kind, layer] of this.layers) {
      if (!present.has(kind)) layer.gain.gain.setTargetAtTime(0, this.ctx.currentTime, LAYER_FADE_TAU);
    }

    // Continuous parameters go to every layer — the arc moves all of them together.
    if (t - this.lastParamAt >= PARAM_INTERVAL_SEC) {
      this.lastParamAt = t;
      const params = velaParamsFor(state);
      for (const layer of this.layers.values()) layer.inst.setParams(params);
    }

    // ── the drone ───────────────────────────────────────────────────────────
    // Re-voiced only when the pitch collection mutates, and held indefinitely. A drone that
    // re-articulates on a schedule is a pad; the point is that it is simply already there.
    const set = this.player?.setAt(t) ?? [];
    const key = set.join(',');
    const ison = this.layers.get('ison');
    if (key && ison && key !== this.droneSet) {
      this.droneSet = key;
      for (const id of ison.held) {
        try { ison.inst.noteOff(id, true); } catch { /* already gone */ }
      }
      ison.held = [];
      const root = Math.round(38 - state.depth * 6);
      // Two notes: the lowest of the collection and one from higher up. Any more and the drone
      // starts making harmonic claims that the voices above it should be making.
      for (const pc of [set[0], set[Math.min(set.length - 1, 2)]]) {
        if (pc === undefined) continue;
        ison.held.push(
          ison.inst.noteOn(root + pc, 0.5, this.ctx.currentTime, this.ctx.currentTime, this.ctx.sampleRate),
        );
      }
    }

    // ── the harmony ─────────────────────────────────────────────────────────
    const events = this.player?.events() ?? [];
    while (this.nextEvent < events.length && events[this.nextEvent].at <= t + LOOKAHEAD_SEC) {
      const e = events[this.nextEvent];
      // Whichever voice layer is most present carries the chord. Sending it to all of them would
      // just be the same harmony three times at three timbres.
      const lead = this.leadVoiceLayer(wanted);
      if (lead) {
        const spread = e.voicing.notes.length > 1 ? 1 / (e.voicing.notes.length - 1) : 0;
        e.voicing.notes.forEach((note, i) => {
          const pan = Math.max(-1, Math.min(1, e.voicing.pan + (i * spread - 0.5) * 0.7));
          this.voice(lead, note, e.voicing.velocity, pan, e.voicing.holdSec, e.at - t);
        });
      }
      this.nextEvent++;
    }

    // ── the Turn ────────────────────────────────────────────────────────────
    if (!this.turnFired && t >= this.session.turnAt - LOOKAHEAD_SEC) {
      this.turnFired = true;
      const vela = this.layers.get('vela');
      if (vela) {
        const g = turnGesture(this.session.at(this.session.turnAt));
        this.voice(vela, g.note, g.velocity, g.pan, 14, this.session.turnAt - t);
      }
    }

    this.sampler.update(state, performance.now());
    this.onFrame?.(state, this.sampler);

    if (t >= this.session.durationSec) {
      this.finish();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** The most present voice layer — never the drone, which holds rather than articulates. */
  private leadVoiceLayer(wanted: ReturnType<typeof ensembleFor>): Layer | null {
    let best: { kind: SuiteInstrument; level: number } | null = null;
    for (const l of wanted) {
      if (l.instrument === 'ison' || l.instrument === 'vela') continue;
      if (!best || l.level > best.level) best = { kind: l.instrument, level: l.level };
    }
    return best ? this.layers.get(best.kind) ?? null : null;
  }

  /** Voice one note on a layer, `delaySec` from now, releasing after `durationSec`. */
  private voice(
    layer: Layer, note: number, velocity: number, pan: number, durationSec: number, delaySec: number,
  ): void {
    const when = this.ctx.currentTime + Math.max(0, delaySec);
    layer.inst.setSpatial({ position: [pan, 0.2, -1] });
    const voiceId = layer.inst.noteOn(note, velocity, when, this.ctx.currentTime, this.ctx.sampleRate);
    // Note-off does not silence a modal voice — it lifts the exciter, and the body rings on. So
    // the duration here is how long energy is fed in, not how long the note lasts.
    window.setTimeout(() => {
      try { layer.inst.noteOff(voiceId, true); } catch { /* disposed mid-session */ }
    }, (Math.max(0, delaySec) + durationSec) * 1000);
  }

  private finish(): void {
    // Never cut. The last voices ring out on their own — an envelope fade here would flatten the
    // one thing the instruments exist to do.
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    for (const layer of this.layers.values()) layer.inst.allNotesOff(false);
    this.onEnded?.();
  }

  /** Stop and release everything. `hard` also flushes each Veil's tail. */
  dispose(hard = false): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    for (const layer of this.layers.values()) {
      layer.inst.allNotesOff(hard);
      if (hard) {
        layer.inst.dispose();
        layer.gain.disconnect();
      } else {
        // Let the tails finish before tearing the nodes down.
        layer.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
        const l = layer;
        window.setTimeout(() => { l.inst.dispose(); l.gain.disconnect(); }, 6000);
      }
    }
    this.layers.clear();
  }

  /**
   * The state this session will be in at a future moment.
   *
   * This is what makes the channel's handoff possible: a device rendering its own unique burst
   * can compute exactly where the shared stream will be at the crossfade second and steer toward
   * it — so the fade happens between two things already in the same breath phase, at the same
   * depth, at the same brightness.
   */
  stateAt(absoluteElapsedSec: number): SessionState {
    return this.session.at(absoluteElapsedSec);
  }
}
