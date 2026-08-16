// Motion — one modulator, seven shapes.
//
// Bitwig ships ~30 modulator devices. Enormously capable, and a list you must learn before you
// can start. Melos ships ONE object with a shape slot: you learn it once and the second one is
// free. The seven shapes cover what those thirty do.
//
// A Motion belongs to the CHAIN, not to a device — so one Motion can drive the arp's gate, the
// synth's cutoff and (later) the delay's feedback at the same time. This file is the model and
// the compiler that turns Motions into the engine's existing route/slot machinery; the engine
// never learns the word "Motion".

export type MotionShape = 'curve' | 'steps' | 'envelope' | 'random' | 'follow' | 'play' | 'macro';

export interface MotionShapeDef {
  id: MotionShape;
  name: string;
  /** Why you would reach for it — shown under the name, and reused verbatim in lessons. */
  hint: string;
  /** What it replaces in a Bitwig-shaped mental model, for people arriving from there. */
  familiar: string;
}

export const MOTION_SHAPES: MotionShapeDef[] = [
  { id: 'curve', name: 'Curve', familiar: 'LFO / Ramp',
    hint: 'A cycle that repeats. Free-running or locked to the tempo.' },
  { id: 'steps', name: 'Steps', familiar: 'Step modulator',
    hint: 'A row of values it walks through, one per step.' },
  { id: 'envelope', name: 'Envelope', familiar: 'ADSR / Segments',
    hint: 'A shape that plays once per note. Each note gets its own.' },
  { id: 'random', name: 'Random', familiar: 'Random / Chaos',
    hint: 'Never the same twice — but seeded, so a bounce still matches what you heard.' },
  { id: 'follow', name: 'Follow', familiar: 'Envelope follower / sidechain',
    hint: 'Follows how loud something else is. This is how ducking works.' },
  { id: 'play', name: 'Play', familiar: 'Expressions / Keytrack',
    hint: 'What you are doing: how hard you hit, how high you played, pressure, slide.' },
  { id: 'macro', name: 'Macro', familiar: 'Macro-4',
    hint: 'A knob you name yourself and put on the front panel.' },
];

export type PlaySource = 'velocity' | 'key' | 'pressure' | 'timbre' | 'wheel' | 'bend' | 'random';

export const PLAY_SOURCES: { id: PlaySource; name: string; hint: string }[] = [
  { id: 'velocity', name: 'Velocity', hint: 'How hard the note was played.' },
  { id: 'key', name: 'Key position', hint: 'Higher notes give more. Brightness usually wants this.' },
  { id: 'pressure', name: 'Pressure', hint: 'How hard you lean in after the note starts (MPE).' },
  { id: 'timbre', name: 'Slide', hint: 'Sideways movement on an MPE controller.' },
  { id: 'wheel', name: 'Mod wheel', hint: 'The wheel on your keyboard.' },
  { id: 'bend', name: 'Pitch bend', hint: 'The bend wheel, as a modulation source.' },
  { id: 'random', name: 'Per note', hint: 'A different random value for every note played.' },
];

/** One destination this Motion drives. */
export interface MotionRoute {
  /** Engine parameter id — the same space the Arp's locks and the UI knobs use. */
  paramId: number;
  /** -1..1, scaled by the destination's own range. Negative inverts. */
  depth: number;
  /** Optional second Motion that scales this route (Massive/Serum "via"). */
  viaMotionId?: string;
}

export interface Motion {
  id: string;
  /** User-facing name. Defaults to the shape, but "Wobble" beats "LFO 2". */
  name: string;
  shape: MotionShape;
  /** Arc colour on every knob it touches — how you tell two Motions apart at a glance. */
  color: string;

  // ── timing (curve / steps / random) ──
  /** Hz when free-running. */
  rate: number;
  /** Beats per cycle. 0 = free-running. */
  syncBeats: number;
  phase: number;
  bipolar: boolean;
  retrigger: boolean;
  /** Seconds of fade-in — delayed vibrato is old and still musical. */
  fade: number;
  /** Extra smoothing on the output, 0..1. */
  smooth: number;

  // ── shape payloads ──
  /** `curve`: a drawn cycle, 33 points with the last wrapping to the first. */
  curve?: number[];
  /** `steps`: values walked one per step. */
  steps?: number[];
  /** `envelope`: ADSR in normalised units; the deep editor swaps this for breakpoints. */
  envelope?: { attack: number; decay: number; sustain: number; release: number };
  /** `random`: seeded so renders reproduce. */
  seed?: number;
  /** `random`: 0 = stepped, 1 = smooth drift. */
  glide?: number;
  /** `follow`: which track's level to follow. Empty = this track. */
  followTrackId?: string;
  /** `play`. */
  playSource?: PlaySource;
  /** `macro`: which of the eight front-panel knobs. */
  macroIndex?: number;

  /** Per-voice Motions give every note its own copy; global ones are shared. */
  perVoice: boolean;
  routes: MotionRoute[];
}

export const MOTION_COLORS = ['#00DAF3', '#D0BCFF', '#FF8C00', '#06D6A0', '#FF6E9E', '#F59E0B'];

let motionCounter = 0;
export function newMotion(shape: MotionShape = 'curve', index = 0): Motion {
  motionCounter += 1;
  const def = MOTION_SHAPES.find((s) => s.id === shape)!;
  return {
    id: `mo_${Date.now().toString(36)}${motionCounter.toString(36)}`,
    name: def.name,
    shape,
    color: MOTION_COLORS[index % MOTION_COLORS.length],
    rate: 0.35,
    syncBeats: 0,
    phase: 0,
    bipolar: shape === 'curve',
    retrigger: true,
    fade: 0,
    smooth: 0,
    curve: shape === 'curve' ? undefined : undefined,
    steps: shape === 'steps' ? Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? 1 : 0)) : undefined,
    envelope: shape === 'envelope' ? { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.25 } : undefined,
    seed: shape === 'random' ? (Math.random() * 0xffff) | 0 : undefined,
    glide: shape === 'random' ? 0 : undefined,
    playSource: shape === 'play' ? 'velocity' : undefined,
    macroIndex: shape === 'macro' ? index % 8 : undefined,
    // Envelopes and per-note sources are per-voice by nature; cycles are shared by default.
    perVoice: shape === 'envelope' || shape === 'play',
    routes: [],
  };
}

// ── Compiling Motions onto the engine ────────────────────────────────────────
// The engine has fixed slots (6 envelopes, 6 LFOs, macros, and the play sources). The compiler
// assigns each Motion a slot and emits the parameter writes + routes. Anything that doesn't fit
// is reported rather than silently dropped — a Motion that quietly stops working is worse than
// one that says it couldn't.

/** Mirrors `ModSource` in rust/plajah-audio/src/modmatrix.rs. */
export const MOD_SOURCE = {
  None: 0,
  Env1: 1, Env2: 2, Env3: 3, Env4: 4, Env5: 5, Env6: 6,
  Lfo1: 8, Lfo2: 9, Lfo3: 10, Lfo4: 11, Lfo5: 12, Lfo6: 13,
  Velocity: 16, KeyTrack: 17, ModWheel: 18, Pressure: 19, Timbre: 20, PitchBend: 21,
  RandomPerVoice: 22,
  Macro1: 24, Macro2: 25, Macro3: 26, Macro4: 27, Macro5: 28, Macro6: 29, Macro7: 30, Macro8: 31,
} as const;

export const NUM_ENV_SLOTS = 6;
export const NUM_LFO_SLOTS = 6;

const PLAY_TO_SOURCE: Record<PlaySource, number> = {
  velocity: MOD_SOURCE.Velocity,
  key: MOD_SOURCE.KeyTrack,
  pressure: MOD_SOURCE.Pressure,
  timbre: MOD_SOURCE.Timbre,
  wheel: MOD_SOURCE.ModWheel,
  bend: MOD_SOURCE.PitchBend,
  random: MOD_SOURCE.RandomPerVoice,
};

/** Param-id helpers, mirroring rust/plajah-audio/src/params.rs. */
const ENV_BASE = 700, ENV_STRIDE = 10;
const LFO_BASE = 800, LFO_STRIDE = 10;
const envParam = (i: number, p: number) => ENV_BASE + i * ENV_STRIDE + p;
const lfoParam = (i: number, p: number) => LFO_BASE + i * LFO_STRIDE + p;
const E_ATTACK = 0, E_DECAY = 1, E_SUSTAIN = 2, E_RELEASE = 3;
const L_SHAPE = 0, L_RATE = 1, L_SYNC = 2, L_BIPOLAR = 3, L_RETRIGGER = 4, L_FADE = 5;

/** Envelope slot 0 is the amp envelope and is never handed to a Motion. */
const FIRST_FREE_ENV = 1;

export interface CompiledMotions {
  /** Parameter writes configuring the slots. */
  params: Array<[number, number]>;
  /** Route writes: [index, source, dest, depth, via]. */
  routes: Array<[number, number, number, number, number]>;
  /** Which engine source each Motion ended up on, for the UI to show. */
  assigned: Map<string, number>;
  /** Motions that could not be placed, with why. Surfaced in the UI, never swallowed. */
  unplaced: Array<{ motionId: string; reason: string }>;
}

/**
 * Turn a chain's Motions into engine writes.
 *
 * Deliberately pure so it can be unit-tested and so the UI can preview what would happen before
 * committing — no engine handle required.
 */
export function compileMotions(motions: Motion[]): CompiledMotions {
  const params: Array<[number, number]> = [];
  const routes: Array<[number, number, number, number, number]> = [];
  const assigned = new Map<string, number>();
  const unplaced: Array<{ motionId: string; reason: string }> = [];

  let envSlot = FIRST_FREE_ENV;
  let lfoSlot = 0;

  for (const m of motions) {
    // Annotated: MOD_SOURCE is `as const`, so inference would pin this to the literal 0.
    let source: number = MOD_SOURCE.None;

    switch (m.shape) {
      case 'envelope': {
        if (envSlot >= NUM_ENV_SLOTS) {
          unplaced.push({ motionId: m.id, reason: `No envelope slots left (${NUM_ENV_SLOTS - FIRST_FREE_ENV} available)` });
          continue;
        }
        const e = m.envelope || { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.25 };
        params.push([envParam(envSlot, E_ATTACK), e.attack]);
        params.push([envParam(envSlot, E_DECAY), e.decay]);
        params.push([envParam(envSlot, E_SUSTAIN), e.sustain]);
        params.push([envParam(envSlot, E_RELEASE), e.release]);
        source = MOD_SOURCE.Env1 + envSlot;
        envSlot += 1;
        break;
      }
      case 'curve':
      case 'steps':
      case 'random': {
        if (lfoSlot >= NUM_LFO_SLOTS) {
          unplaced.push({ motionId: m.id, reason: `No cycle slots left (${NUM_LFO_SLOTS} available)` });
          continue;
        }
        // The engine's LFO shapes: 0 sine, 1 tri, 2 saw, 3 square, 4 sample&hold, 5 custom.
        const shapeIndex = m.shape === 'random' ? 4 : m.shape === 'steps' ? 5 : 0;
        params.push([lfoParam(lfoSlot, L_SHAPE), shapeIndex]);
        params.push([lfoParam(lfoSlot, L_RATE), m.rate]);
        params.push([lfoParam(lfoSlot, L_SYNC), m.syncBeats]);
        params.push([lfoParam(lfoSlot, L_BIPOLAR), m.bipolar ? 1 : 0]);
        params.push([lfoParam(lfoSlot, L_RETRIGGER), m.retrigger ? 1 : 0]);
        params.push([lfoParam(lfoSlot, L_FADE), m.fade]);
        source = MOD_SOURCE.Lfo1 + lfoSlot;
        lfoSlot += 1;
        break;
      }
      case 'play':
        source = PLAY_TO_SOURCE[m.playSource || 'velocity'];
        break;
      case 'macro':
        source = MOD_SOURCE.Macro1 + Math.max(0, Math.min(7, m.macroIndex ?? 0));
        break;
      case 'follow':
        // Needs an analyser feeding a parameter from the host side; the engine has no such
        // source yet. Reported rather than silently doing nothing.
        unplaced.push({ motionId: m.id, reason: 'Follow needs the sidechain input, which is not built yet' });
        continue;
      default:
        continue;
    }

    assigned.set(m.id, source);
  }

  // Routes are emitted after every assignment so a "via" can reference any Motion, not just an
  // earlier one.
  let routeIndex = 0;
  for (const m of motions) {
    const source = assigned.get(m.id);
    if (source === undefined) continue;
    for (const r of m.routes) {
      if (routeIndex >= 32) {
        unplaced.push({ motionId: m.id, reason: 'Out of route slots (32 max)' });
        break;
      }
      const via = r.viaMotionId ? assigned.get(r.viaMotionId) ?? 0 : 0;
      routes.push([routeIndex++, source, r.paramId, r.depth, via]);
    }
  }
  // Clear any stale routes left from a previous compile.
  for (let i = routeIndex; i < 32; i++) routes.push([i, 0, 0, 0, 0]);

  return { params, routes, assigned, unplaced };
}

/** Total modulation reaching one parameter — what the knob's arc draws. */
export function depthFor(motions: Motion[], paramId: number): { depth: number; color: string }[] {
  const out: { depth: number; color: string }[] = [];
  for (const m of motions) {
    for (const r of m.routes) {
      if (r.paramId === paramId && Math.abs(r.depth) > 0.0005) out.push({ depth: r.depth, color: m.color });
    }
  }
  return out;
}

/** Add or update a route — the drag-onto-a-knob gesture. */
export function setRoute(motion: Motion, paramId: number, depth: number): void {
  const existing = motion.routes.find((r) => r.paramId === paramId);
  if (Math.abs(depth) < 0.0005) {
    motion.routes = motion.routes.filter((r) => r.paramId !== paramId);
    return;
  }
  if (existing) existing.depth = depth;
  else motion.routes.push({ paramId, depth });
}
