// ONDA parameter ids — the TypeScript mirror of rust/plajah-audio/src/params.rs.
//
// These ids are the whole contract: a UI knob, a preset field and a modulation destination are
// the same number. Keep the two files in lockstep; the ABI version in InstrumentHost guards
// against a stale .wasm, and `PARAM_META` below is what the UI reads to label and scale a knob.

export const P = {
  MASTER_GAIN: 0,
  GLIDE: 1,
  VOICE_MODE: 2,
  BEND_RANGE: 3,
  ANALOG_DRIFT: 4,
  UNISON_COUNT: 5,
  UNISON_DETUNE: 6,
  UNISON_WIDTH: 7,
  UNISON_BLEND: 8,
  SUB_LEVEL: 400,
  SUB_SHAPE: 401,
  SUB_OCTAVE: 402,
  NOISE_LEVEL: 410,
  NOISE_COLOR: 411,
  FILTER_ROUTING: 490,
} as const;

const OSC_BASE = 100, OSC_STRIDE = 100;
export const O = {
  ENABLE: 0, LEVEL: 1, PAN: 2, COARSE: 3, FINE: 4, MORPH: 5, PHASE: 6,
  TABLE: 7, MODE: 8, ANALOG_SHAPE: 9, PULSE_WIDTH: 10, DRIVE: 11, DRIVE_MODE: 12,
} as const;
export const osc = (index: number, p: number): number => OSC_BASE + index * OSC_STRIDE + p;

const FLT_BASE = 500, FLT_STRIDE = 100;
export const F = {
  ENABLE: 0, TYPE: 1, MODE: 2, CUTOFF: 3, RES: 4, DRIVE: 5, KEYTRACK: 6, ENV_AMT: 7, MIX: 8,
} as const;
export const flt = (index: number, p: number): number => FLT_BASE + index * FLT_STRIDE + p;

const ENV_BASE = 700, ENV_STRIDE = 10;
export const E = { ATTACK: 0, DECAY: 1, SUSTAIN: 2, RELEASE: 3 } as const;
export const env = (index: number, p: number): number => ENV_BASE + index * ENV_STRIDE + p;

const LFO_BASE = 800, LFO_STRIDE = 10;
export const L = { SHAPE: 0, RATE: 1, SYNC: 2, BIPOLAR: 3, RETRIGGER: 4, FADE: 5 } as const;
export const lfo = (index: number, p: number): number => LFO_BASE + index * LFO_STRIDE + p;

export const MACRO_BASE = 900;

/** Modulation sources — mirrors `modmatrix::ModSource`. */
export const MOD_SOURCE = {
  None: 0, Env1: 1, Env2: 2, Env3: 3,
  Lfo1: 8, Lfo2: 9, Lfo3: 10,
  Velocity: 16, KeyTrack: 17, ModWheel: 18,
  Pressure: 19, Timbre: 20, PitchBend: 21, RandomPerVoice: 22,
  Macro1: 24, Macro2: 25, Macro3: 26, Macro4: 27,
  Macro5: 28, Macro6: 29, Macro7: 30, Macro8: 31,
} as const;

export const MOD_SOURCE_LABELS: Record<number, string> = {
  1: 'Env 1', 2: 'Env 2', 3: 'Env 3',
  8: 'LFO 1', 9: 'LFO 2', 10: 'LFO 3',
  16: 'Velocity', 17: 'Key track', 18: 'Mod wheel',
  19: 'Pressure', 20: 'Slide', 21: 'Pitch bend', 22: 'Random',
  24: 'Macro 1', 25: 'Macro 2', 26: 'Macro 3', 27: 'Macro 4',
  28: 'Macro 5', 29: 'Macro 6', 30: 'Macro 7', 31: 'Macro 8',
};

export interface ParamMeta {
  id: number;
  label: string;
  /** How to render the stored 0..1 value as text. */
  format?: (v: number) => string;
  /** Stepped controls (enums, toggles) shouldn't render as continuous knobs. */
  options?: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => {
  const f = 20 * Math.pow(1000, Math.max(0, Math.min(1, v)));
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
};
const secs = (v: number) => {
  const t = 0.001 + 12 * v * v * v;
  return t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`;
};
const semis = (v: number) => `${((v - 0.5) * 48).toFixed(0)} st`;

/** Only the parameters the UI actually surfaces need meta; the rest are set from presets. */
export const PARAM_META: Record<number, ParamMeta> = {
  [P.MASTER_GAIN]: { id: P.MASTER_GAIN, label: 'Level', format: pct },
  [P.GLIDE]: { id: P.GLIDE, label: 'Glide', format: (v) => `${(v * 2000).toFixed(0)} ms` },
  [P.UNISON_COUNT]: { id: P.UNISON_COUNT, label: 'Voices', format: (v) => `${Math.round(1 + v * 15)}` },
  [P.UNISON_DETUNE]: { id: P.UNISON_DETUNE, label: 'Detune', format: pct },
  [P.UNISON_WIDTH]: { id: P.UNISON_WIDTH, label: 'Width', format: pct },
  [P.SUB_LEVEL]: { id: P.SUB_LEVEL, label: 'Sub', format: pct },
  [P.NOISE_LEVEL]: { id: P.NOISE_LEVEL, label: 'Noise', format: pct },
  [osc(0, O.MORPH)]: { id: osc(0, O.MORPH), label: 'Morph', format: pct },
  [osc(0, O.COARSE)]: { id: osc(0, O.COARSE), label: 'Pitch', format: semis },
  [osc(0, O.DRIVE)]: { id: osc(0, O.DRIVE), label: 'Drive', format: pct },
  [flt(0, F.CUTOFF)]: { id: flt(0, F.CUTOFF), label: 'Cutoff', format: hz },
  [flt(0, F.RES)]: { id: flt(0, F.RES), label: 'Reso', format: pct },
  [flt(0, F.ENV_AMT)]: { id: flt(0, F.ENV_AMT), label: 'Env amt', format: (v) => `${((v - 0.5) * 200).toFixed(0)}%` },
  [env(0, E.ATTACK)]: { id: env(0, E.ATTACK), label: 'Attack', format: secs },
  [env(0, E.DECAY)]: { id: env(0, E.DECAY), label: 'Decay', format: secs },
  [env(0, E.SUSTAIN)]: { id: env(0, E.SUSTAIN), label: 'Sustain', format: pct },
  [env(0, E.RELEASE)]: { id: env(0, E.RELEASE), label: 'Release', format: secs },
};

export const paramLabel = (id: number): string => PARAM_META[id]?.label ?? `P${id}`;
export const formatParam = (id: number, v: number): string =>
  PARAM_META[id]?.format?.(v) ?? v.toFixed(2);
