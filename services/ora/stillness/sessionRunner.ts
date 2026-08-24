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
import { createPlayer, type Player, type PlayerEvent } from './velaPlayer';
import { velaDriftSetup } from '../../melos/instruments/vela/patch';
import { ensembleFor, findSuitePreset, type SuiteInstrument } from '../../melos/instruments/vela/suite';
import { M, X, V, MASTER_GAIN } from '../../melos/instruments/vela/params';
import { HEADSET_GAIN, spatialPlacement } from './xrSession';

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
  /**
   * Place voices for a head-tracked listener rather than for a pair of speakers.
   *
   * On a screen, a metre in front is simply where "there" is. In a headset it is wrong twice:
   * it sits inside the vergence-comfort minimum, and it puts the sound in the one place a
   * session should not come from — in front of you, addressing you.
   */
  spatial?: 'screen' | 'headset';
  /**
   * Extra textures the generative channel layers on top of a bare session. All default OFF so
   * Stillness Deep's twenty-minute arc — and every test that pins it — is unchanged; the channel
   * turns them on because it is a different thing, meant to be lived in for hours rather than
   * moved through once.
   *
   *   arp        a slow, sparse arpeggiation — chords rolled one note at a time rather than struck
   *              together, drifting in and out. Uses the voice layer already sounding, no new body.
   *   pulse      a muted, felt low pulse on the breath, appearing sparingly. Soft-attacked and
   *              heavily veiled so it is never a hit — the "beat you feel but do not notice".
   *   gentleTurn the Turn as a slow bowed swell instead of a struck bell. A sudden transient is a
   *              gesture in a session you chose to enter and a jump-scare on a channel left on.
   */
  arp?: boolean;
  pulse?: boolean;
  gentleTurn?: boolean;
}

/**
 * How far ahead notes are scheduled.
 *
 * Four seconds, not two — the scheduler runs on a timer rather than rAF (see `tick`), and a
 * backgrounded tab throttles timers to roughly one call a second. Everything is scheduled against
 * the audio clock, so jitter in WHEN the timer fires never reaches the sound; the only thing that
 * matters is that each firing queues enough to bridge the gap to the next one, with margin.
 */
const LOOKAHEAD_SEC = 4;
/** Parameter updates. 20 Hz is far faster than anything in this session moves. */
const PARAM_INTERVAL_SEC = 0.05;
/**
 * The scheduler's timer period, foregrounded. 50 ms is imperceptible for fields that move over
 * seconds, and unlike rAF a timer keeps running when the tab is hidden — which is the whole point
 * for a channel that is left on. A page playing audio is exempt from the browser's intensive
 * timer throttling, so the worst this drops to in the background is ~1 Hz, still inside LOOKAHEAD.
 */
const TICK_MS = 50;
/** Smallest gain change worth scheduling. Below this the target has not really moved, and writing
 *  it anyway just appends an automation event the audio thread has to walk forever after. */
const LEVEL_EPSILON = 0.004;
/** Smallest continuous-parameter change worth sending across the thread. */
const PARAM_EPSILON = 1e-3;
/**
 * Time constant for a layer's level.
 *
 * Long on purpose. The ensemble's own levels already move slowly and this sits on top of them:
 * an instrument that becomes audible in under a couple of seconds reads as an entrance, and the
 * arc is meant to contain exactly one of those.
 */
const LAYER_FADE_TAU = 2.5;

/**
 * The muted pulse's patch — a low frame-drum body, nearly harmonic so it reads as a pitched thud
 * rather than a gong, with the highs dying fast and a real amplitude attack (SWELL) so the onset
 * is felt rather than clicked. Heavily veiled and blurred on top. This is the "muted, soft" the
 * design asks for: at its per-hit velocity of ~0.12 it is a pressure in the chest, not a sound to
 * notice — and it can never spike, because the master limiter sits downstream of everything.
 */
const PULSE_PATCH: Array<[number, number]> = [
  [MASTER_GAIN, 0.5],
  [M.ENABLE, 1], [M.PARTIALS, 0.3], [M.INHARM, 0.03], [M.SPREAD, 0.15],
  [M.DECAY, 0.28], [M.DECAY_TILT, 0.72], [M.MATERIAL, 4], [M.POSITION, 0.5], [M.KEYTRACK, 0.2],
  [M.MODE, 0], [M.SWELL, 0.22],
  [X.TYPE, 2], [X.PRESSURE, 0.5], [X.GRAIN, 0.2], [X.TONE, 0.1], [X.VEL_TILT, 0.4],
  [V.MIX, 0.7], [V.SIZE, 0.7], [V.DECAY, 0.5], [V.DIFFUSION, 0.82], [V.BLUR, 0.32],
];

/** A deterministic 0..1 from two integers — no shared mutable state, so the answer never depends
 *  on call order, which is what keeps an offline render identical to a live one. */
function hashUnit(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

interface Layer {
  inst: Instrument;
  gain: GainNode;
  presetId: string;
  /** Voice ids currently sounding, so a re-voice can release them. */
  held: number[];
  /**
   * The last level handed to `setTargetAtTime`. Without this the fade was re-scheduled on every
   * tick even when the target had not moved, appending an automation event ~60 times a second —
   * hundreds of thousands over an hour, all of which the audio thread walks on every block until
   * it starves and the sound breaks up. This is the single biggest cause of the after-an-hour
   * dropouts, so the level is only ever written when it has actually changed.
   */
  target: number;
  /** Last continuous-parameter values sent to the worklet, so only genuinely-changed params cross
   *  the thread. 14 params × 20 Hz × 4 layers is ~290k messages an hour otherwise. */
  lastParams: Map<number, number>;
}

export class StillnessSession {
  readonly session: Session;
  readonly sampler = new StillnessDriverSampler();

  private ctx: AudioContext;
  private destination: AudioNode;
  private layers = new Map<SuiteInstrument, Layer>();
  private pending = new Set<SuiteInstrument>();
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private player: Player | null = null;
  private nextEvent = 0;
  private turnFired = false;
  private lastParamAt = -1;
  /** The pitch collection last handed to the drone, so it re-voices only when it moves. */
  private droneSet = '';

  // ── Channel textures (all off unless the option asks for them) ────────────────
  private readonly arpEnabled: boolean;
  private readonly pulseEnabled: boolean;
  private readonly gentleTurn: boolean;
  /** The muted pulse's own instrument, created lazily the first time a pulse is due. */
  private pulse: Layer | null = null;
  private pulsePending = false;
  /** Breath cycles counted, so the pulse lands at most once per breath and can skip some. */
  private pulseCycles = 0;
  private lastBreathPhase = 1;

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
  private readonly headset: boolean;
  private trim: GainNode | null = null;

  constructor(opts: RunnerOptions) {
    this.ctx = opts.ctx;
    this.arpEnabled = opts.arp === true;
    this.pulseEnabled = opts.pulse === true;
    this.gentleTurn = opts.gentleTurn === true;
    this.headset = opts.spatial === 'headset';
    if (this.headset) {
      // One node, so the mix survives the move out to headset distance. See HEADSET_GAIN.
      const trim = opts.ctx.createGain();
      trim.gain.value = HEADSET_GAIN;
      trim.connect(opts.destination);
      this.destination = trim;
      this.trim = trim;
    } else {
      this.destination = opts.destination;
    }
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
    // A timer, not requestAnimationFrame. rAF pauses the moment the tab is hidden or the screen
    // dims — the normal state of a channel left on — which starves the scheduler and is half of
    // why the sound dropped in and out. A timer keeps feeding the audio clock regardless.
    this.tick();
    this.timer = setInterval(this.tick, TICK_MS);
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
        layer = { inst, gain, presetId: '', held: [], target: 0, lastParams: new Map() };
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
    this.setLevel(layer, level);
  }

  /**
   * Move a layer's level, but only when the target has actually changed.
   *
   * Every write is an automation event Web Audio keeps forever, so re-scheduling an unchanged
   * fade on every tick is what made the audio thread choke after an hour. The tau still makes the
   * move gradual — a layer never simply appears, which is also the no-jump-scare rule.
   */
  private setLevel(layer: Layer, level: number): void {
    if (Math.abs(level - layer.target) < LEVEL_EPSILON) return;
    layer.target = level;
    layer.gain.gain.setTargetAtTime(level, this.ctx.currentTime, LAYER_FADE_TAU);
  }

  /** Send only the continuous params that moved since last time. See `Layer.lastParams`. */
  private sendParams(layer: Layer, params: Array<[number, number]>): void {
    const changed: Array<[number, number]> = [];
    for (const [id, v] of params) {
      const prev = layer.lastParams.get(id);
      if (prev === undefined || Math.abs(prev - v) > PARAM_EPSILON) {
        layer.lastParams.set(id, v);
        changed.push([id, v]);
      }
    }
    if (changed.length) layer.inst.setParams(changed);
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
    // The preset has just overwritten the engine's parameter state, so the dedupe cache is stale;
    // clear it and let the next continuous update re-establish the arc's values on top.
    layer.lastParams.clear();
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
    // setLevel() dedupes, so once a layer has reached zero this stops re-scheduling it.
    for (const [kind, layer] of this.layers) {
      if (!present.has(kind)) this.setLevel(layer, 0);
    }

    // Continuous parameters go to every layer — the arc moves all of them together, but only the
    // values that actually changed cross the thread.
    if (t - this.lastParamAt >= PARAM_INTERVAL_SEC) {
      this.lastParamAt = t;
      const params = velaParamsFor(state);
      for (const layer of this.layers.values()) this.sendParams(layer, params);
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
        // A rolled chord — arpeggiation — when the channel asks for it and this particular event
        // is one of the sparse few chosen for it. Not a run: the notes of the collection are laid
        // down one at a time, a breath's fraction apart, so a held cluster becomes a slow rising
        // figure that then hangs. Deterministic from the seed, so live and offline agree.
        const notes = this.arpNotes(e, this.nextEvent);
        const rolled = notes.length !== e.voicing.notes.length || this.arpRolls(this.nextEvent);
        const step = rolled ? Math.max(0.45, state.breathRate / 7) : 0;
        const spread = notes.length > 1 ? 1 / (notes.length - 1) : 0;
        // Rolled notes are a touch quieter and held a touch longer, so the figure shimmers into a
        // chord rather than reading as separate attacks.
        const vel = e.voicing.velocity * (rolled ? 0.82 : 1);
        notes.forEach((note, i) => {
          const pan = Math.max(-1, Math.min(1, e.voicing.pan + (i * spread - 0.5) * 0.7));
          this.voice(lead, note, vel, pan, e.voicing.holdSec + step * (notes.length - i), e.at - t + i * step);
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
        if (this.gentleTurn) {
          // The channel version: a slow bowed swell, not a struck bell. A real attack (SWELL) and
          // the gentlest exciter (Rub) turn the one transient of the session into something that
          // rises into the field over a couple of seconds — a gesture you feel arrive rather than
          // a sound that arrives at you. Half the velocity, and fed for far longer so it blooms.
          this.sendParams(vela, [[M.SWELL, 0.6], [M.MODE, 2], [X.TYPE, 3], [X.PRESSURE, 0.4]]);
          this.voice(vela, g.note, g.velocity * 0.5, g.pan, 22, this.session.turnAt - t);
        } else {
          this.voice(vela, g.note, g.velocity, g.pan, 14, this.session.turnAt - t);
        }
      }
    }

    // ── the muted pulse ───────────────────────────────────────────────────────
    if (this.pulseEnabled) this.tickPulse(t, state);

    this.sampler.update(state, performance.now());
    this.onFrame?.(state, this.sampler);

    if (t >= this.session.durationSec) {
      this.finish();
    }
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

  // ── Arpeggiation ─────────────────────────────────────────────────────────────

  /** Whether this chord is one of the sparse few rolled into an arpeggio rather than struck as a
   *  block. Deterministic, and suppressed if the previous event also rolled — so the rolling
   *  drifts in and out rather than hardening into a pattern, which is the "subtle" the design
   *  wants. */
  private arpRolls(index: number): boolean {
    if (!this.arpEnabled) return false;
    return hashUnit(this.seed ^ 0x1a2b, index) < 0.34 && hashUnit(this.seed ^ 0x1a2b, index - 1) >= 0.34;
  }

  /** The notes to lay down for an event. A rolled two-note voicing is given an octave to rise
   *  into so the figure actually goes somewhere; anything else is voiced as written. */
  private arpNotes(e: PlayerEvent, index: number): number[] {
    if (!this.arpRolls(index)) return e.voicing.notes;
    const notes = [...e.voicing.notes];
    if (notes.length > 0 && notes.length <= 2) notes.push(notes[0] + 12);
    return notes;
  }

  // ── The muted pulse ──────────────────────────────────────────────────────────

  /** Whether the pulse bed is present right now. Sparse by design: on for some ~75 s blocks and
   *  off for others, and never during Arrival (the field is still establishing) or at the extreme
   *  ends of depth (too shallow to need it, too deep to want anything struck at all). */
  private pulseActive(t: number, state: SessionState): boolean {
    if (state.phase === 'arrival') return false;
    if (state.depth < 0.18 || state.depth > 0.9) return false;
    const block = Math.floor(t / 75);
    return hashUnit(this.seed ^ 0x50f7, block) < 0.42;
  }

  /** A muted, felt low pulse on the breath. Called every tick when enabled; it brings its own bed
   *  in and out on a long fade and, while present, lands one soft note at the bottom of a breath —
   *  every second or third one, never every one. Soft-attacked and heavily veiled, so it is the
   *  beat you feel rather than the beat you hear. */
  private tickPulse(t: number, state: SessionState): void {
    // A wrap of breath phase from near 1 back toward 0 is the bottom of the cycle — where a
    // heartbeat lands. Count cycles so at most one pulse fires per breath.
    const phase = state.breathPhase;
    const wrapped = phase + 0.4 < this.lastBreathPhase;
    this.lastBreathPhase = phase;
    if (wrapped) this.pulseCycles++;

    const active = this.pulseActive(t, state);
    void this.ensurePulse();
    if (this.pulse) this.setLevel(this.pulse, active ? 1 : 0);
    if (!active || !wrapped || !this.pulse) return;

    // Every second breath near the surface, every third deep in — sparser where the session is
    // already emptiest. An occasional extra skip keeps even that from being a fixed metre.
    const every = state.depth > 0.55 ? 3 : 2;
    if (this.pulseCycles % every !== 0) return;
    if (hashUnit(this.seed ^ 0x70f5, this.pulseCycles) > 0.85) return;

    const root = Math.round(33 - state.depth * 5); // very low — A1-ish, felt more than pitched
    const velocity = 0.12 + (1 - state.depth) * 0.05;
    this.voice(this.pulse, root, velocity, 0, 1.2 + state.openness * 1.4, 0);
  }

  /** Create the pulse's own instrument the first time one is due. Guarded like `ensureLayer`. */
  private async ensurePulse(): Promise<void> {
    if (this.pulse || this.pulsePending) return;
    this.pulsePending = true;
    try {
      const inst = await Instrument.create(this.ctx, {
        onError: (m) => console.warn('[stillness] pulse', m),
      });
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      inst.output.connect(gain);
      gain.connect(this.destination);
      inst.setSpatial({ layout: SpatialLayout.Stereo });
      await inst.whenReady();
      inst.setParams(PULSE_PATCH);
      this.pulse = { inst, gain, presetId: 'pulse', held: [], target: 0, lastParams: new Map() };
    } finally {
      this.pulsePending = false;
    }
    // Torn down while the worklet was loading.
    if (!this.running && this.pulse) {
      this.pulse.inst.dispose();
      this.pulse.gain.disconnect();
      this.pulse = null;
    }
  }

  /** Voice one note on a layer, `delaySec` from now, releasing after `durationSec`. */
  private voice(
    layer: Layer, note: number, velocity: number, pan: number, durationSec: number, delaySec: number,
  ): void {
    const when = this.ctx.currentTime + Math.max(0, delaySec);
    layer.inst.setSpatial({
      position: this.headset
        ? spatialPlacement(pan, this.sampler.uniforms().uDepth)
        : [pan, 0.2, -1],
    });
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
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const layer of this.layers.values()) layer.inst.allNotesOff(false);
    this.pulse?.inst.allNotesOff(false);
    this.onEnded?.();
  }

  /** Stop and release everything. `hard` also flushes each Veil's tail. */
  dispose(hard = false): void {
    this.running = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const layer of this.layers.values()) {
      layer.inst.allNotesOff(hard);
      if (hard) {
        layer.inst.dispose();
        layer.gain.disconnect();
      } else {
        // Let the tails finish before tearing the nodes down.
        layer.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
        const l = layer;
        window.setTimeout(() => { l.inst.dispose(); l.gain.disconnect(); this.trim?.disconnect(); }, 6000);
      }
    }
    // The pulse rides the same teardown as the ensemble layers.
    const pulse = this.pulse;
    this.pulse = null;
    if (pulse) {
      pulse.inst.allNotesOff(hard);
      if (hard) {
        pulse.inst.dispose();
        pulse.gain.disconnect();
      } else {
        pulse.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
        window.setTimeout(() => { pulse.inst.dispose(); pulse.gain.disconnect(); }, 6000);
      }
    }
    if (hard) this.trim?.disconnect();
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
