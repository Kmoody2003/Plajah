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
];

export const PRESET_CATEGORIES = [...new Set(FACTORY_PRESETS.map((p) => p.category))];
export const PRESET_TAGS = [...new Set(FACTORY_PRESETS.flatMap((p) => p.tags))].sort();

export const findPreset = (name: string): OndaPatch | undefined =>
  FACTORY_PRESETS.find((p) => p.name === name);
