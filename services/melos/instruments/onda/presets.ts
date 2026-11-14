// ONDA factory bank.
//
// Presets are the difference between a synth people respect and a synth people love, so these
// are authored as typed data — diffable, reviewable, and editable without a binary tool.
// Coverage spans the four directions asked for: house/techno/amapiano/808, broad & versatile,
// cinematic/scoring, and sound-design.

import { E, F, L, MOD_SOURCE, O, P, env, flt, lfo, osc } from './params';
import { DEFAULT_MACROS, newPatch, type OndaPatch } from './patch';

type Build = Partial<Omit<OndaPatch, 'id' | 'version'>> & { params?: Record<number, number> };

function preset(name: string, category: string, tags: string[], b: Build): OndaPatch {
  const p = newPatch(name, category);
  p.tags = tags;
  p.author = 'Plajah';
  if (b.tables) p.tables = b.tables;
  if (b.params) p.params = b.params;
  if (b.routes) p.routes = b.routes;
  p.macros = (b.macros ?? DEFAULT_MACROS).map((m) => ({ ...m }));
  if (b.spatial) p.spatial = b.spatial;
  return p;
}

// Shorthands so the tables below read as sound design rather than arithmetic.
const A = (v: number) => ({ [env(0, E.ATTACK)]: v });
const cut = (v: number) => ({ [flt(0, F.CUTOFF)]: v });

export const FACTORY_PRESETS: OndaPatch[] = [
  // ── Bass ───────────────────────────────────────────────────────────────────
  preset('808 Deep', 'Bass', ['808', 'sub', 'hiphop', 'trap'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.02, [osc(0, O.LEVEL)]: 0.55,
      [P.SUB_LEVEL]: 0.95, [P.SUB_OCTAVE]: 0.0,
      [P.UNISON_COUNT]: 0.0, [P.VOICE_MODE]: 1.0, [P.GLIDE]: 0.06,
      ...cut(0.32), [flt(0, F.RES)]: 0.12, [flt(0, F.DRIVE)]: 0.35,
      [flt(0, F.ENV_AMT)]: 0.62,
      ...A(0.0), [env(0, E.DECAY)]: 0.62, [env(0, E.SUSTAIN)]: 0.25, [env(0, E.RELEASE)]: 0.42,
    },
    macros: [
      { name: 'Glide', value: 0.3 }, { name: 'Drive', value: 0.35 }, { name: 'Decay', value: 0.62 },
      { name: 'Tone', value: 0.32 }, { name: 'Attack', value: 0 }, { name: 'Release', value: 0.42 },
      { name: 'Sub', value: 0.95 }, { name: 'Space', value: 0 },
    ],
  }),
  preset('Reese Wide', 'Bass', ['reese', 'dnb', 'techno', 'detuned'], {
    tables: ['reese'],
    params: {
      [osc(0, O.MORPH)]: 0.7, [P.UNISON_COUNT]: 0.35, [P.UNISON_DETUNE]: 0.42, [P.UNISON_WIDTH]: 0.85,
      ...cut(0.42), [flt(0, F.RES)]: 0.28, [flt(0, F.DRIVE)]: 0.4,
      [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: 0.2,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.22 },
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.5 },
    ],
  }),
  preset('Amapiano Log', 'Bass', ['amapiano', 'log drum', 'house'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.12, [P.SUB_LEVEL]: 0.7, [P.VOICE_MODE]: 1.0, [P.GLIDE]: 0.12,
      ...cut(0.38), [flt(0, F.RES)]: 0.34, [flt(0, F.ENV_AMT)]: 0.78, [flt(0, F.DRIVE)]: 0.22,
      ...A(0.0), [env(0, E.DECAY)]: 0.34, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.22,
      [env(1, E.DECAY)]: 0.22, [env(1, E.SUSTAIN)]: 0.0,
    },
  }),
  preset('Acid Line', 'Bass', ['acid', '303', 'techno'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.62, [P.VOICE_MODE]: 2.0, [P.GLIDE]: 0.1,
      ...cut(0.3), [flt(0, F.RES)]: 0.82, [flt(0, F.ENV_AMT)]: 0.85, [flt(0, F.DRIVE)]: 0.55,
      [env(1, E.DECAY)]: 0.3, [env(1, E.SUSTAIN)]: 0.0,
      [env(0, E.SUSTAIN)]: 0.8, [env(0, E.RELEASE)]: 0.12,
    },
    routes: [{ source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.6 }],
  }),

  // ── Lead ───────────────────────────────────────────────────────────────────
  preset('Supersaw', 'Lead', ['trance', 'edm', 'wide', 'unison'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.66, [P.UNISON_COUNT]: 0.5, [P.UNISON_DETUNE]: 0.3, [P.UNISON_WIDTH]: 1.0,
      [P.UNISON_BLEND]: 0.8, ...cut(0.78), [flt(0, F.RES)]: 0.14,
      [env(0, E.SUSTAIN)]: 0.95, [env(0, E.RELEASE)]: 0.28,
    },
    routes: [{ source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.35 }],
  }),
  preset('Big Room Lead', 'Lead', ['big room', 'edm', 'festival', 'saw'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.72, [osc(0, O.DRIVE)]: 0.32,
      [P.UNISON_COUNT]: 0.45, [P.UNISON_DETUNE]: 0.24, [P.UNISON_WIDTH]: 0.92, [P.UNISON_BLEND]: 0.7,
      ...cut(0.9), [flt(0, F.RES)]: 0.1, [flt(0, F.DRIVE)]: 0.3,
      ...A(0.0), [env(0, E.SUSTAIN)]: 0.92, [env(0, E.RELEASE)]: 0.18,
    },
    routes: [{ source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.3 }],
  }),
  preset('Hoover', 'Lead', ['hoover', 'rave', 'hardstyle', 'pwm'], {
    tables: ['pulse-pwm'],
    params: {
      [osc(0, O.MORPH)]: 0.5, [osc(0, O.PULSE_WIDTH)]: 0.35, [osc(0, O.DRIVE)]: 0.4,
      [P.UNISON_COUNT]: 0.35, [P.UNISON_DETUNE]: 0.42, [P.UNISON_WIDTH]: 0.8, [P.GLIDE]: 0.08,
      ...cut(0.62), [flt(0, F.RES)]: 0.3, [flt(0, F.DRIVE)]: 0.4,
      [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: 0.2,
      [lfo(0, L.RATE)]: 0.42, [lfo(0, L.SHAPE)]: 0.0,
    },
    routes: [{ source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.3 }],
  }),
  preset('Festival Pluck', 'Pluck', ['pluck', 'edm', 'festival', 'stab'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.62, [P.UNISON_COUNT]: 0.3, [P.UNISON_DETUNE]: 0.2, [P.UNISON_WIDTH]: 0.8,
      ...cut(0.5), [flt(0, F.RES)]: 0.22, [flt(0, F.ENV_AMT)]: 0.8, [flt(0, F.DRIVE)]: 0.25,
      ...A(0.0), [env(0, E.DECAY)]: 0.28, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.2,
      [env(1, E.DECAY)]: 0.24, [env(1, E.SUSTAIN)]: 0.0,
    },
  }),
  preset('Future Bass Chord', 'Keys', ['future bass', 'edm', 'supersaw', 'chord'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.66, [P.UNISON_COUNT]: 0.6, [P.UNISON_DETUNE]: 0.34, [P.UNISON_WIDTH]: 1.0, [P.UNISON_BLEND]: 0.85,
      ...cut(0.8), [flt(0, F.RES)]: 0.14,
      [env(0, E.ATTACK)]: 0.08, [env(0, E.SUSTAIN)]: 0.95, [env(0, E.RELEASE)]: 0.3,
      [lfo(0, L.RATE)]: 0.3, [lfo(0, L.SHAPE)]: 0.0,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.35 },
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.3 },
    ],
  }),
  preset('Vowel Lead', 'Lead', ['formant', 'talking', 'expressive'], {
    tables: ['formant-vowel'],
    params: {
      [osc(0, O.MORPH)]: 0.3, [P.UNISON_COUNT]: 0.15, [P.UNISON_DETUNE]: 0.14,
      ...cut(0.85), [flt(0, F.RES)]: 0.2, [env(0, E.SUSTAIN)]: 0.9,
    },
    routes: [
      { source: MOD_SOURCE.ModWheel, dest: osc(0, O.MORPH), depth: 0.7 },
      // Slide (MPE) also drives the vowel, so this preset is expressive on MPE hardware today.
      { source: MOD_SOURCE.Timbre, dest: osc(0, O.MORPH), depth: 0.5 },
    ],
  }),
  preset('Metal Bell', 'Lead', ['fm', 'bell', 'inharmonic'], {
    tables: ['fm-metal'],
    params: {
      [osc(0, O.MORPH)]: 0.4, ...cut(0.9),
      ...A(0.0), [env(0, E.DECAY)]: 0.5, [env(0, E.SUSTAIN)]: 0.1, [env(0, E.RELEASE)]: 0.45,
    },
    routes: [{ source: MOD_SOURCE.Env2, dest: osc(0, O.MORPH), depth: -0.4 }],
  }),

  // ── Keys / Pluck ───────────────────────────────────────────────────────────
  preset('Glass Keys', 'Keys', ['bright', 'shimmer', 'clean'], {
    tables: ['glass'],
    params: {
      [osc(0, O.MORPH)]: 0.25, [P.UNISON_COUNT]: 0.1, [P.UNISON_DETUNE]: 0.1,
      ...cut(0.82), ...A(0.0), [env(0, E.DECAY)]: 0.45, [env(0, E.SUSTAIN)]: 0.35, [env(0, E.RELEASE)]: 0.35,
    },
  }),
  preset('House Stab', 'Keys', ['house', 'stab', 'chord'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.72, [P.UNISON_COUNT]: 0.2, [P.UNISON_DETUNE]: 0.18,
      ...cut(0.5), [flt(0, F.RES)]: 0.42, [flt(0, F.ENV_AMT)]: 0.72,
      ...A(0.0), [env(0, E.DECAY)]: 0.26, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.18,
      [env(1, E.DECAY)]: 0.2, [env(1, E.SUSTAIN)]: 0.0,
    },
  }),
  preset('Bloom Pluck', 'Pluck', ['pluck', 'short', 'melodic'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.55, ...cut(0.6), [flt(0, F.ENV_AMT)]: 0.68,
      ...A(0.0), [env(0, E.DECAY)]: 0.3, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.2,
    },
  }),

  // ── Pad / Atmosphere (cinematic) ───────────────────────────────────────────
  preset('Wide Warm Pad', 'Pad', ['warm', 'lush', 'cinematic'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.35, [P.UNISON_COUNT]: 0.45, [P.UNISON_DETUNE]: 0.22, [P.UNISON_WIDTH]: 0.95,
      ...cut(0.52), [flt(0, F.RES)]: 0.1,
      [env(0, E.ATTACK)]: 0.42, [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: 0.6,
      [lfo(0, 1 /* RATE */)]: 0.16,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.16 },
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.12 },
    ],
  }),
  preset('Vowel Choir', 'Pad', ['choir', 'formant', 'cinematic', 'scoring'], {
    tables: ['formant-vowel'],
    params: {
      [osc(0, O.MORPH)]: 0.45, [P.UNISON_COUNT]: 0.5, [P.UNISON_DETUNE]: 0.16, [P.UNISON_WIDTH]: 1.0,
      ...cut(0.66), [env(0, E.ATTACK)]: 0.5, [env(0, E.SUSTAIN)]: 0.95, [env(0, E.RELEASE)]: 0.68,
    },
    routes: [{ source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.2 }],
    spatial: { position: [0, 0.3, -1.6] },
  }),
  preset('Deep Drone', 'Atmosphere', ['drone', 'dark', 'cinematic', 'tension'], {
    tables: ['fold'],
    params: {
      [osc(0, O.MORPH)]: 0.2, [osc(0, O.COARSE)]: 0.25, [P.SUB_LEVEL]: 0.6,
      [P.UNISON_COUNT]: 0.4, [P.UNISON_DETUNE]: 0.26, [P.UNISON_WIDTH]: 1.0,
      ...cut(0.36), [flt(0, F.RES)]: 0.24,
      [env(0, E.ATTACK)]: 0.55, [env(0, E.SUSTAIN)]: 1.0, [env(0, E.RELEASE)]: 0.75,
      [lfo(0, 1)]: 0.06,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.3 },
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.12 },
    ],
  }),
  preset('Air Texture', 'Atmosphere', ['noise', 'air', 'texture', 'scoring'], {
    tables: ['glass'],
    params: {
      [osc(0, O.MORPH)]: 0.8, [osc(0, O.LEVEL)]: 0.35,
      [P.NOISE_LEVEL]: 0.4, [P.NOISE_COLOR]: 1.0,
      [P.UNISON_COUNT]: 0.3, [P.UNISON_WIDTH]: 1.0,
      ...cut(0.72), [env(0, E.ATTACK)]: 0.6, [env(0, E.SUSTAIN)]: 0.85, [env(0, E.RELEASE)]: 0.7,
    },
  }),

  // ── Sound design ───────────────────────────────────────────────────────────
  preset('Folded Chaos', 'FX', ['experimental', 'fold', 'aggressive'], {
    tables: ['fold'],
    params: {
      [osc(0, O.MORPH)]: 0.5, [osc(0, O.DRIVE)]: 0.6, [osc(0, O.DRIVE_MODE)]: 3.0,
      ...cut(0.6), [flt(0, F.RES)]: 0.55, [flt(0, F.DRIVE)]: 0.5,
      [env(0, E.SUSTAIN)]: 0.8, [lfo(0, 1)]: 0.62,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.75 },
      { source: MOD_SOURCE.Lfo2, dest: flt(0, F.CUTOFF), depth: 0.4 },
    ],
  }),
  preset('Morph Sweep', 'FX', ['riser', 'transition', 'experimental'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.0, [P.UNISON_COUNT]: 0.4, [P.UNISON_DETUNE]: 0.3,
      ...cut(0.5), [flt(0, F.RES)]: 0.4,
      [env(0, E.ATTACK)]: 0.62, [env(0, E.SUSTAIN)]: 1.0, [env(0, E.RELEASE)]: 0.4,
      [env(1, E.ATTACK)]: 0.68, [env(1, E.SUSTAIN)]: 1.0,
    },
    routes: [
      { source: MOD_SOURCE.Env2, dest: osc(0, O.MORPH), depth: 1.0 },
      { source: MOD_SOURCE.Env2, dest: flt(0, F.CUTOFF), depth: 0.45 },
    ],
  }),
  preset('Pulse Motion', 'FX', ['rhythmic', 'pwm', 'movement'], {
    tables: ['pulse-pwm'],
    params: {
      [osc(0, O.MORPH)]: 0.4, [P.UNISON_COUNT]: 0.2,
      ...cut(0.62), [flt(0, F.RES)]: 0.3,
      [env(0, E.SUSTAIN)]: 0.9, [lfo(0, 2 /* SYNC */)]: 0.5, [lfo(0, 0 /* SHAPE */)]: 3.0,
    },
    routes: [{ source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.5 }],
  }),

  // ── Production Flagship Expansion (Multi-Genre & Analog/Wavetable Hybrid) ──
  preset('Detroit Electro Bass', 'Bass', ['electro', 'detroit', 'analog', 'funk', 'punchy'], {
    tables: ['pulse-pwm'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 1, [osc(0, O.PULSE_WIDTH)]: 0.34,
      [osc(0, O.DRIVE)]: 0.28, [osc(0, O.DRIVE_MODE)]: 2,
      [P.SUB_LEVEL]: 0.72, [P.SUB_SHAPE]: 0, [P.SUB_OCTAVE]: 0,
      [P.VOICE_MODE]: 1, [P.GLIDE]: 0.04, [P.ANALOG_DRIFT]: 0.35,
      [flt(0, F.TYPE)]: 1, ...cut(0.36), [flt(0, F.RES)]: 0.48, [flt(0, F.DRIVE)]: 0.38, [flt(0, F.ENV_AMT)]: 0.76,
      ...A(0.0), [env(0, E.DECAY)]: 0.32, [env(0, E.SUSTAIN)]: 0.18, [env(0, E.RELEASE)]: 0.18,
      [env(1, E.ATTACK)]: 0.0, [env(1, E.DECAY)]: 0.22, [env(1, E.SUSTAIN)]: 0.0, [env(1, E.RELEASE)]: 0.14,
    },
    routes: [
      { source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.28 },
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.45 },
    ],
  }),
  preset('Melodic Techno Rolling Sub', 'Bass', ['melodic techno', 'afterlife', 'rolling', 'bass'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.58, [osc(0, O.LEVEL)]: 0.85,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.MODE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 0, [osc(1, O.COARSE)]: 0.5, [osc(1, O.FINE)]: 0.54, [osc(1, O.LEVEL)]: 0.45,
      [P.SUB_LEVEL]: 0.82, [P.VOICE_MODE]: 1, [P.ANALOG_DRIFT]: 0.28,
      [flt(0, F.TYPE)]: 1, ...cut(0.28), [flt(0, F.RES)]: 0.24, [flt(0, F.DRIVE)]: 0.42, [flt(0, F.ENV_AMT)]: 0.68,
      ...A(0.0), [env(0, E.DECAY)]: 0.26, [env(0, E.SUSTAIN)]: 0.12, [env(0, E.RELEASE)]: 0.16,
      [env(1, E.DECAY)]: 0.19, [env(1, E.SUSTAIN)]: 0.0,
    },
    routes: [
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.55 },
      { source: MOD_SOURCE.ModWheel, dest: flt(0, F.ENV_AMT), depth: 0.25 },
    ],
  }),
  preset('Synthwave Outrun Lead', 'Lead', ['synthwave', 'outrun', '80s', 'analog', 'retro'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 0, [osc(0, O.DRIVE)]: 0.24, [osc(0, O.DRIVE_MODE)]: 2,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.MODE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 1, [osc(1, O.PULSE_WIDTH)]: 0.42, [osc(1, O.FINE)]: 0.55, [osc(1, O.LEVEL)]: 0.65,
      [P.UNISON_COUNT]: 0.25, [P.UNISON_DETUNE]: 0.18, [P.UNISON_WIDTH]: 0.72,
      [P.VOICE_MODE]: 2, [P.GLIDE]: 0.14, [P.ANALOG_DRIFT]: 0.48,
      [flt(0, F.TYPE)]: 1, ...cut(0.68), [flt(0, F.RES)]: 0.26, [flt(0, F.DRIVE)]: 0.32, [flt(0, F.KEYTRACK)]: 0.65,
      ...A(0.01), [env(0, E.DECAY)]: 0.42, [env(0, E.SUSTAIN)]: 0.85, [env(0, E.RELEASE)]: 0.34,
      [lfo(0, L.RATE)]: 0.46, [lfo(0, L.FADE)]: 0.35,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.08 },
      { source: MOD_SOURCE.ModWheel, dest: flt(0, F.CUTOFF), depth: 0.3 },
    ],
  }),
  preset('Neo-Soul Glide Sine', 'Lead', ['neosoul', 'rnb', 'west coast', 'glide', 'smooth'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.14, [osc(0, O.DRIVE)]: 0.18, [osc(0, O.DRIVE_MODE)]: 2,
      [P.SUB_LEVEL]: 0.35, [P.VOICE_MODE]: 2, [P.GLIDE]: 0.24, [P.ANALOG_DRIFT]: 0.25,
      ...cut(0.56), [flt(0, F.RES)]: 0.18, [flt(0, F.KEYTRACK)]: 0.8,
      ...A(0.02), [env(0, E.DECAY)]: 0.4, [env(0, E.SUSTAIN)]: 0.88, [env(0, E.RELEASE)]: 0.28,
      [lfo(0, L.RATE)]: 0.44, [lfo(0, L.FADE)]: 0.4,
    },
    routes: [
      { source: MOD_SOURCE.ModWheel, dest: osc(0, O.MORPH), depth: 0.35 },
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.06 },
    ],
  }),
  preset('Silk Electric Tines', 'Keys', ['epiano', 'rhodes', 'neosoul', 'jazz', 'warm'], {
    tables: ['glass'],
    params: {
      [osc(0, O.MORPH)]: 0.12, [osc(0, O.LEVEL)]: 0.82, [osc(0, O.DRIVE)]: 0.16, [osc(0, O.DRIVE_MODE)]: 2,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.COARSE)]: 0.75, [osc(1, O.MORPH)]: 0.38, [osc(1, O.LEVEL)]: 0.22,
      [P.ANALOG_DRIFT]: 0.22,
      ...cut(0.54), [flt(0, F.RES)]: 0.08, [flt(0, F.ENV_AMT)]: 0.32, [flt(0, F.KEYTRACK)]: 0.6,
      ...A(0.002), [env(0, E.DECAY)]: 0.58, [env(0, E.SUSTAIN)]: 0.28, [env(0, E.RELEASE)]: 0.42,
      [env(1, E.DECAY)]: 0.18, [env(1, E.SUSTAIN)]: 0.0,
      [lfo(0, L.RATE)]: 0.36,
    },
    routes: [
      { source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.34 },
      { source: MOD_SOURCE.Velocity, dest: osc(1, O.LEVEL), depth: 0.28 },
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.PAN), depth: 0.26 },
    ],
  }),
  preset('Warm Jazz Poly-Keys', 'Keys', ['poly', 'analog', 'chords', 'jazz', 'lofi'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 0, [osc(0, O.LEVEL)]: 0.75,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.MODE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 2, [osc(1, O.FINE)]: 0.53, [osc(1, O.LEVEL)]: 0.55,
      [P.ANALOG_DRIFT]: 0.52, [P.UNISON_COUNT]: 0.12, [P.UNISON_DETUNE]: 0.12, [P.UNISON_WIDTH]: 0.65,
      [flt(0, F.TYPE)]: 1, ...cut(0.46), [flt(0, F.RES)]: 0.18, [flt(0, F.DRIVE)]: 0.24, [flt(0, F.ENV_AMT)]: 0.42, [flt(0, F.KEYTRACK)]: 0.55,
      ...A(0.015), [env(0, E.DECAY)]: 0.48, [env(0, E.SUSTAIN)]: 0.52, [env(0, E.RELEASE)]: 0.38,
      [env(1, E.ATTACK)]: 0.01, [env(1, E.DECAY)]: 0.36, [env(1, E.SUSTAIN)]: 0.15,
      [lfo(0, L.RATE)]: 0.22, [lfo(0, L.PER_VOICE)]: 1,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.05 },
      { source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.25 },
    ],
  }),
  preset('Lo-Fi Tape Clav', 'Keys', ['lofi', 'clav', 'funk', 'vintage', 'tape'], {
    tables: ['pulse-pwm'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 1, [osc(0, O.PULSE_WIDTH)]: 0.18, [osc(0, O.DRIVE)]: 0.32, [osc(0, O.DRIVE_MODE)]: 2,
      [P.NOISE_LEVEL]: 0.06, [P.NOISE_COLOR]: 1, [P.ANALOG_DRIFT]: 0.6,
      [flt(0, F.MODE)]: 2, ...cut(0.58), [flt(0, F.RES)]: 0.34, [flt(0, F.ENV_AMT)]: 0.48, [flt(0, F.MIX)]: 0.82,
      ...A(0.001), [env(0, E.DECAY)]: 0.34, [env(0, E.SUSTAIN)]: 0.16, [env(0, E.RELEASE)]: 0.2,
      [env(1, E.DECAY)]: 0.16, [env(1, E.SUSTAIN)]: 0.0,
      [lfo(0, L.RATE)]: 0.18,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.07 },
      { source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.32 },
    ],
  }),
  preset('UKG 2-Step Organ Pluck', 'Pluck', ['ukg', 'garage', 'house', 'organ', '2-step'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.28, [osc(0, O.LEVEL)]: 0.85,
      [P.SUB_LEVEL]: 0.68, [P.SUB_SHAPE]: 0, [P.SUB_OCTAVE]: 0,
      ...cut(0.44), [flt(0, F.RES)]: 0.22, [flt(0, F.DRIVE)]: 0.28, [flt(0, F.ENV_AMT)]: 0.64,
      ...A(0.001), [env(0, E.DECAY)]: 0.26, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.18,
      [env(1, E.DECAY)]: 0.18, [env(1, E.SUSTAIN)]: 0.0,
    },
    routes: [{ source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.3 }],
  }),
  preset('Kalimba Glass Mallet', 'Pluck', ['mallet', 'kalimba', 'afrobeats', 'tropical', 'organic'], {
    tables: ['fm-metal'],
    params: {
      [osc(0, O.MORPH)]: 0.16, [osc(0, O.LEVEL)]: 0.78,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.COARSE)]: 0.75, [osc(1, O.MORPH)]: 0.55, [osc(1, O.LEVEL)]: 0.26,
      [P.NOISE_LEVEL]: 0.12,
      ...cut(0.68), [flt(0, F.RES)]: 0.14, [flt(0, F.ENV_AMT)]: 0.52, [flt(0, F.KEYTRACK)]: 0.75,
      ...A(0.0), [env(0, E.DECAY)]: 0.36, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.32,
      [env(1, E.DECAY)]: 0.08, [env(1, E.SUSTAIN)]: 0.0,
    },
    routes: [
      { source: MOD_SOURCE.Env2, dest: osc(1, O.LEVEL), depth: 0.45 },
      { source: MOD_SOURCE.Velocity, dest: flt(0, F.CUTOFF), depth: 0.28 },
    ],
  }),
  preset('Progressive Deadmau Pluck', 'Pluck', ['progressive house', 'pluck', 'chord', 'warm'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 0,
      [P.UNISON_COUNT]: 0.38, [P.UNISON_DETUNE]: 0.22, [P.UNISON_WIDTH]: 0.9, [P.ANALOG_DRIFT]: 0.32,
      [flt(0, F.TYPE)]: 1, ...cut(0.32), [flt(0, F.RES)]: 0.18, [flt(0, F.DRIVE)]: 0.3, [flt(0, F.ENV_AMT)]: 0.74,
      ...A(0.0), [env(0, E.DECAY)]: 0.34, [env(0, E.SUSTAIN)]: 0.08, [env(0, E.RELEASE)]: 0.28,
      [env(1, E.DECAY)]: 0.28, [env(1, E.SUSTAIN)]: 0.0, [env(1, E.RELEASE)]: 0.24,
    },
    routes: [
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.62 },
      { source: MOD_SOURCE.Macro2, dest: env(1, E.DECAY), depth: 0.4 },
    ],
  }),
  preset('CS-80 Blade Scoring Brass', 'Pad', ['cs80', 'vangelis', 'cinematic', 'brass', 'scoring'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MODE)]: 1, [osc(0, O.ANALOG_SHAPE)]: 0, [osc(0, O.DRIVE)]: 0.22, [osc(0, O.DRIVE_MODE)]: 2,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.MODE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 0, [osc(1, O.FINE)]: 0.56, [osc(1, O.LEVEL)]: 0.72,
      [P.SUB_LEVEL]: 0.28, [P.ANALOG_DRIFT]: 0.58, [P.UNISON_COUNT]: 0.25, [P.UNISON_DETUNE]: 0.18, [P.UNISON_WIDTH]: 0.88,
      [flt(0, F.TYPE)]: 1, ...cut(0.44), [flt(0, F.RES)]: 0.2, [flt(0, F.DRIVE)]: 0.28, [flt(0, F.ENV_AMT)]: 0.52, [flt(0, F.KEYTRACK)]: 0.5,
      [env(0, E.ATTACK)]: 0.24, [env(0, E.DECAY)]: 0.55, [env(0, E.SUSTAIN)]: 0.86, [env(0, E.RELEASE)]: 0.58,
      [env(1, E.ATTACK)]: 0.28, [env(1, E.DECAY)]: 0.52, [env(1, E.SUSTAIN)]: 0.45, [env(1, E.RELEASE)]: 0.5,
      [lfo(0, L.RATE)]: 0.38, [lfo(0, L.FADE)]: 0.45,
    },
    routes: [
      { source: MOD_SOURCE.Pressure, dest: flt(0, F.CUTOFF), depth: 0.45 },
      { source: MOD_SOURCE.ModWheel, dest: flt(0, F.CUTOFF), depth: 0.4 },
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.FINE), depth: 0.06 },
    ],
    spatial: { position: [0, 0.2, -1.4] },
  }),
  preset('Velvet R&B Lush Pad', 'Pad', ['rnb', 'pop', 'warm', 'lush', 'chords'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.36, [P.UNISON_COUNT]: 0.42, [P.UNISON_DETUNE]: 0.18, [P.UNISON_WIDTH]: 0.92,
      [P.SUB_LEVEL]: 0.3, [P.ANALOG_DRIFT]: 0.35,
      [flt(0, F.TYPE)]: 1, ...cut(0.42), [flt(0, F.RES)]: 0.14, [flt(0, F.DRIVE)]: 0.18,
      [env(0, E.ATTACK)]: 0.32, [env(0, E.DECAY)]: 0.5, [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: 0.56,
      [lfo(0, L.RATE)]: 0.14, [lfo(0, L.PER_VOICE)]: 1,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.18 },
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.12 },
    ],
  }),
  preset('Arctic Shimmer Bed', 'Atmosphere', ['ambient', 'crystalline', 'cinematic', 'nordic'], {
    tables: ['glass'],
    params: {
      [osc(0, O.MORPH)]: 0.62, [osc(1, O.ENABLE)]: 1, [osc(1, O.COARSE)]: 0.75, [osc(1, O.MORPH)]: 0.3, [osc(1, O.LEVEL)]: 0.48,
      [P.UNISON_COUNT]: 0.5, [P.UNISON_DETUNE]: 0.24, [P.UNISON_WIDTH]: 1.0,
      ...cut(0.74), [flt(0, F.RES)]: 0.22,
      [env(0, E.ATTACK)]: 0.58, [env(0, E.SUSTAIN)]: 0.92, [env(0, E.RELEASE)]: 0.76,
      [lfo(0, L.RATE)]: 0.1, [lfo(1, L.RATE)]: 0.07,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.28 },
      { source: MOD_SOURCE.Lfo2, dest: osc(1, O.MORPH), depth: -0.24 },
    ],
    spatial: { position: [0, 0.5, -1.8] },
  }),
  preset('Sub-Orbital Tension', 'Atmosphere', ['thriller', 'sci-fi', 'scoring', 'dark', 'evolving'], {
    tables: ['reese'],
    params: {
      [osc(0, O.MORPH)]: 0.44, [osc(0, O.DRIVE)]: 0.35, [osc(0, O.DRIVE_MODE)]: 3,
      [P.SUB_LEVEL]: 0.65, [P.NOISE_LEVEL]: 0.16, [P.NOISE_COLOR]: 1,
      [P.UNISON_COUNT]: 0.45, [P.UNISON_DETUNE]: 0.32, [P.UNISON_WIDTH]: 1.0, [P.ANALOG_DRIFT]: 0.45,
      [flt(0, F.MODE)]: 2, ...cut(0.38), [flt(0, F.RES)]: 0.42, [flt(0, F.DRIVE)]: 0.36, [flt(0, F.MIX)]: 0.78,
      [env(0, E.ATTACK)]: 0.52, [env(0, E.SUSTAIN)]: 0.96, [env(0, E.RELEASE)]: 0.72,
      [lfo(0, L.RATE)]: 0.08,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.26 },
      { source: MOD_SOURCE.ModWheel, dest: osc(0, O.MORPH), depth: 0.45 },
    ],
  }),
  preset('Cyberpunk 16th Pulse', 'Arp', ['cyberpunk', 'arp', 'midtempo', 'darksynth', 'sequenced'], {
    tables: ['fold'],
    params: {
      [osc(0, O.MORPH)]: 0.32, [osc(0, O.DRIVE)]: 0.42, [osc(0, O.DRIVE_MODE)]: 1,
      [P.SUB_LEVEL]: 0.55, [P.UNISON_COUNT]: 0.22, [P.UNISON_DETUNE]: 0.2, [P.UNISON_WIDTH]: 0.78,
      [flt(0, F.TYPE)]: 1, ...cut(0.34), [flt(0, F.RES)]: 0.36, [flt(0, F.DRIVE)]: 0.44, [flt(0, F.ENV_AMT)]: 0.66,
      ...A(0.0), [env(0, E.DECAY)]: 0.22, [env(0, E.SUSTAIN)]: 0.2, [env(0, E.RELEASE)]: 0.16,
      [lfo(0, L.SHAPE)]: 2, [lfo(0, L.SYNC)]: 0.62, [lfo(0, L.BIPOLAR)]: 0,
    },
    routes: [
      { source: MOD_SOURCE.Lfo1, dest: flt(0, F.CUTOFF), depth: 0.42 },
      { source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.3 },
    ],
  }),
  preset('Cinematic Braam Impact', 'FX', ['braam', 'trailer', 'zimmer', 'brass', 'impact'], {
    tables: ['reese'],
    params: {
      [osc(0, O.MORPH)]: 0.78, [osc(0, O.COARSE)]: 0.25, [osc(0, O.DRIVE)]: 0.58, [osc(0, O.DRIVE_MODE)]: 1,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.MODE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 1, [osc(1, O.FINE)]: 0.58, [osc(1, O.LEVEL)]: 0.85,
      [P.SUB_LEVEL]: 0.88, [P.UNISON_COUNT]: 0.65, [P.UNISON_DETUNE]: 0.38, [P.UNISON_WIDTH]: 1.0, [P.ANALOG_DRIFT]: 0.5,
      [flt(0, F.TYPE)]: 1, ...cut(0.52), [flt(0, F.RES)]: 0.26, [flt(0, F.DRIVE)]: 0.55, [flt(0, F.ENV_AMT)]: 0.48,
      [env(0, E.ATTACK)]: 0.03, [env(0, E.DECAY)]: 0.68, [env(0, E.SUSTAIN)]: 0.75, [env(0, E.RELEASE)]: 0.62,
      [env(1, E.ATTACK)]: 0.05, [env(1, E.DECAY)]: 0.58, [env(1, E.SUSTAIN)]: 0.2,
    },
    routes: [
      { source: MOD_SOURCE.Env2, dest: osc(0, O.MORPH), depth: 0.35 },
      { source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.45 },
    ],
    spatial: { position: [0, 0, -1.2] },
  }),
  preset('Subharmonic House Chord', 'Keys', ['house', 'deep', 'chords', 'stabs'], {
    tables: ['analog-sweep'],
    params: {
      [osc(0, O.MORPH)]: 0.44, [osc(1, O.ENABLE)]: 1, [osc(1, O.COARSE)]: 0.6458, [osc(1, O.MORPH)]: 0.36, [osc(1, O.LEVEL)]: 0.64,
      [P.UNISON_COUNT]: 0.22, [P.UNISON_DETUNE]: 0.16, [P.UNISON_WIDTH]: 0.82,
      [flt(0, F.TYPE)]: 1, ...cut(0.46), [flt(0, F.RES)]: 0.22, [flt(0, F.ENV_AMT)]: 0.68,
      ...A(0.002), [env(0, E.DECAY)]: 0.28, [env(0, E.SUSTAIN)]: 0.18, [env(0, E.RELEASE)]: 0.24,
    },
    routes: [{ source: MOD_SOURCE.Macro1, dest: flt(0, F.CUTOFF), depth: 0.55 }],
  }),
  preset('Liquid DnB Reese', 'Bass', ['dnb', 'liquid', 'reese', 'sub'], {
    tables: ['reese'],
    params: {
      [osc(0, O.MORPH)]: 0.48, [P.SUB_LEVEL]: 0.78, [P.VOICE_MODE]: 2.0, [P.GLIDE]: 0.14,
      [P.UNISON_COUNT]: 0.38, [P.UNISON_DETUNE]: 0.34, [P.UNISON_WIDTH]: 0.88,
      ...cut(0.38), [flt(0, F.RES)]: 0.26, [flt(0, F.DRIVE)]: 0.32,
      [env(0, E.SUSTAIN)]: 0.92, [env(0, E.RELEASE)]: 0.32,
    },
    routes: [{ source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.28 }],
  }),
  preset('Bell Mallet Marimba', 'Pluck', ['pluck', 'mallet', 'percussive', 'organic'], {
    tables: ['glass'],
    params: {
      [osc(0, O.MORPH)]: 0.34, [P.UNISON_COUNT]: 0.1, [flt(0, F.TYPE)]: 1, ...cut(0.58), [flt(0, F.RES)]: 0.18, [flt(0, F.ENV_AMT)]: 0.52,
      ...A(0.0), [env(0, E.DECAY)]: 0.36, [env(0, E.SUSTAIN)]: 0.0, [env(0, E.RELEASE)]: 0.32,
    },
  }),
  preset('Cathedral Glass Drone', 'Atmosphere', ['drone', 'glass', 'cinematic', 'ambient'], {
    tables: ['harmonic-bloom'],
    params: {
      [osc(0, O.MORPH)]: 0.54, [P.UNISON_COUNT]: 0.44, [P.UNISON_DETUNE]: 0.22, [P.UNISON_WIDTH]: 1.0,
      ...cut(0.62), [flt(0, F.RES)]: 0.2,
      [env(0, E.ATTACK)]: 0.64, [env(0, E.SUSTAIN)]: 0.94, [env(0, E.RELEASE)]: 0.78,
      [lfo(0, L.RATE)]: 0.09,
    },
    routes: [{ source: MOD_SOURCE.Lfo1, dest: osc(0, O.MORPH), depth: 0.32 }],
  }),
  preset('Hyperpop Glitch Lead', 'Lead', ['hyperpop', 'bright', 'fm', 'digital'], {
    tables: ['fold'],
    params: {
      [osc(0, O.MORPH)]: 0.74, [osc(0, O.DRIVE)]: 0.46, [osc(0, O.DRIVE_MODE)]: 1,
      [P.VOICE_MODE]: 2.0, [P.GLIDE]: 0.09, [P.UNISON_COUNT]: 0.26, [P.UNISON_DETUNE]: 0.24,
      ...cut(0.86), [flt(0, F.RES)]: 0.3, [flt(0, F.ENV_AMT)]: 0.48,
      ...A(0.0), [env(0, E.DECAY)]: 0.26, [env(0, E.SUSTAIN)]: 0.64, [env(0, E.RELEASE)]: 0.18,
    },
  }),
];

export const PRESET_CATEGORIES = [...new Set(FACTORY_PRESETS.map((p) => p.category))];
export const PRESET_TAGS = [...new Set(FACTORY_PRESETS.flatMap((p) => p.tags))].sort();

export const findPreset = (name: string): OndaPatch | undefined =>
  FACTORY_PRESETS.find((p) => p.name === name);
