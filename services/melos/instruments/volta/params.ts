// VOLTA parameter ids — the TypeScript mirror of VOLTA_BASE (2500..2599) in
// rust/plajah-audio/src/params.rs.

export const VOLTA_BASE = 2500;

export const VL = {
  ENABLE: 0,
  TOPOLOGY: 1,
  VINTAGE_MORPH: 2,
  OSC1_WAVE: 3,
  OSC1_PW: 4,
  OSC2_WAVE: 5,
  OSC2_SEMI: 6,
  OSC2_DETUNE: 7,
  OSC_MIX: 8,
  SUB_LVL: 9,
  SUB_OCT: 10,
  NOISE_LVL: 11,
  FM_TZ: 12,
  WAVEFOLD: 13,
  FOLD_SYM: 14,
  LADDER_CUTOFF: 15,
  LADDER_RES: 16,
  LADDER_DRIVE: 17,
  SVF_CUTOFF: 18,
  SVF_RES: 19,
  SVF_MODE: 20,
  DIODE_CLIP: 21,
  OTA_DRIFT: 22,
  PSU_SAG: 23,
  BIAS_TEMP: 24,
  FILT_ENV_AMT: 25,
  KEY_TRACK: 26,
  AMP_ATK: 27,
  AMP_DEC: 28,
  AMP_SUS: 29,
  AMP_REL: 30,
  FLT_ATK: 31,
  FLT_DEC: 32,
  FLT_SUS: 33,
  FLT_REL: 34,
  LFO_RATE: 35,
  LFO_DEPTH: 36,
  LFO_DEST: 37,
  GLIDE: 38,
  BEND_RANGE: 39,
  CHORUS: 40,
  WIDTH: 41,
  VEL_SENS: 42,
  UNISON: 43,
  VOICE_MODE: 44,
} as const;

export const VOLTA = {
  ENABLE: VOLTA_BASE + VL.ENABLE,
  TOPOLOGY: VOLTA_BASE + VL.TOPOLOGY,
  VINTAGE_MORPH: VOLTA_BASE + VL.VINTAGE_MORPH,
  OSC1_WAVE: VOLTA_BASE + VL.OSC1_WAVE,
  OSC1_PW: VOLTA_BASE + VL.OSC1_PW,
  OSC2_WAVE: VOLTA_BASE + VL.OSC2_WAVE,
  OSC2_SEMI: VOLTA_BASE + VL.OSC2_SEMI,
  OSC2_DETUNE: VOLTA_BASE + VL.OSC2_DETUNE,
  OSC_MIX: VOLTA_BASE + VL.OSC_MIX,
  SUB_LVL: VOLTA_BASE + VL.SUB_LVL,
  SUB_OCT: VOLTA_BASE + VL.SUB_OCT,
  NOISE_LVL: VOLTA_BASE + VL.NOISE_LVL,
  FM_TZ: VOLTA_BASE + VL.FM_TZ,
  WAVEFOLD: VOLTA_BASE + VL.WAVEFOLD,
  FOLD_SYM: VOLTA_BASE + VL.FOLD_SYM,
  LADDER_CUTOFF: VOLTA_BASE + VL.LADDER_CUTOFF,
  LADDER_RES: VOLTA_BASE + VL.LADDER_RES,
  LADDER_DRIVE: VOLTA_BASE + VL.LADDER_DRIVE,
  SVF_CUTOFF: VOLTA_BASE + VL.SVF_CUTOFF,
  SVF_RES: VOLTA_BASE + VL.SVF_RES,
  SVF_MODE: VOLTA_BASE + VL.SVF_MODE,
  DIODE_CLIP: VOLTA_BASE + VL.DIODE_CLIP,
  OTA_DRIFT: VOLTA_BASE + VL.OTA_DRIFT,
  PSU_SAG: VOLTA_BASE + VL.PSU_SAG,
  BIAS_TEMP: VOLTA_BASE + VL.BIAS_TEMP,
  FILT_ENV_AMT: VOLTA_BASE + VL.FILT_ENV_AMT,
  KEY_TRACK: VOLTA_BASE + VL.KEY_TRACK,
  AMP_ATK: VOLTA_BASE + VL.AMP_ATK,
  AMP_DEC: VOLTA_BASE + VL.AMP_DEC,
  AMP_SUS: VOLTA_BASE + VL.AMP_SUS,
  AMP_REL: VOLTA_BASE + VL.AMP_REL,
  FLT_ATK: VOLTA_BASE + VL.FLT_ATK,
  FLT_DEC: VOLTA_BASE + VL.FLT_DEC,
  FLT_SUS: VOLTA_BASE + VL.FLT_SUS,
  FLT_REL: VOLTA_BASE + VL.FLT_REL,
  LFO_RATE: VOLTA_BASE + VL.LFO_RATE,
  LFO_DEPTH: VOLTA_BASE + VL.LFO_DEPTH,
  LFO_DEST: VOLTA_BASE + VL.LFO_DEST,
  GLIDE: VOLTA_BASE + VL.GLIDE,
  BEND_RANGE: VOLTA_BASE + VL.BEND_RANGE,
  CHORUS: VOLTA_BASE + VL.CHORUS,
  WIDTH: VOLTA_BASE + VL.WIDTH,
  VEL_SENS: VOLTA_BASE + VL.VEL_SENS,
  UNISON: VOLTA_BASE + VL.UNISON,
  VOICE_MODE: VOLTA_BASE + VL.VOICE_MODE,
} as const;

export const VOLTA_TOPOLOGIES = [
  'Series (Ladder → SVF)',
  'Parallel Split',
  'Dual Era Morph',
  "Vintage '74 Ladder",
  "Modern '26 Cytomic SVF",
] as const;

export const VOLTA_WAVES = ['Sawtooth', 'Pulse / PWM', 'Triangle', 'Sine', 'Super-Analog Pair'] as const;
export const VOLTA_LFO_DESTS = ['Filter Cutoff', 'Pitch / Vibrato', 'Wavefold / PWM', 'Thru-Zero FM'] as const;
export const VOLTA_VOICE_MODES = ['Poly', 'Mono Retrig', 'Legato'] as const;

export const voltaDefaults = (): Record<number, number> => ({
  [VOLTA.ENABLE]: 1,
  [VOLTA.TOPOLOGY]: 2,
  [VOLTA.VINTAGE_MORPH]: 0.35,
  [VOLTA.OSC1_WAVE]: 0,
  [VOLTA.OSC1_PW]: 0.5,
  [VOLTA.OSC2_WAVE]: 0,
  [VOLTA.OSC2_SEMI]: 0.5,
  [VOLTA.OSC2_DETUNE]: 0.56,
  [VOLTA.OSC_MIX]: 0.45,
  [VOLTA.SUB_LVL]: 0.35,
  [VOLTA.SUB_OCT]: 0,
  [VOLTA.NOISE_LVL]: 0.03,
  [VOLTA.FM_TZ]: 0,
  [VOLTA.WAVEFOLD]: 0.15,
  [VOLTA.FOLD_SYM]: 0.5,
  [VOLTA.LADDER_CUTOFF]: 0.62,
  [VOLTA.LADDER_RES]: 0.24,
  [VOLTA.LADDER_DRIVE]: 0.32,
  [VOLTA.SVF_CUTOFF]: 0.74,
  [VOLTA.SVF_RES]: 0.18,
  [VOLTA.SVF_MODE]: 0,
  [VOLTA.DIODE_CLIP]: 0.22,
  [VOLTA.OTA_DRIFT]: 0.28,
  [VOLTA.PSU_SAG]: 0.22,
  [VOLTA.BIAS_TEMP]: 0.38,
  [VOLTA.FILT_ENV_AMT]: 0.72,
  [VOLTA.KEY_TRACK]: 0.45,
  [VOLTA.AMP_ATK]: 0.08,
  [VOLTA.AMP_DEC]: 0.38,
  [VOLTA.AMP_SUS]: 0.76,
  [VOLTA.AMP_REL]: 0.28,
  [VOLTA.FLT_ATK]: 0.06,
  [VOLTA.FLT_DEC]: 0.42,
  [VOLTA.FLT_SUS]: 0.36,
  [VOLTA.FLT_REL]: 0.34,
  [VOLTA.LFO_RATE]: 0.36,
  [VOLTA.LFO_DEPTH]: 0.12,
  [VOLTA.LFO_DEST]: 0,
  [VOLTA.GLIDE]: 0.06,
  [VOLTA.BEND_RANGE]: 0,
  [VOLTA.CHORUS]: 0.28,
  [VOLTA.WIDTH]: 0.55,
  [VOLTA.VEL_SENS]: 0.72,
  [VOLTA.UNISON]: 0.2,
  [VOLTA.VOICE_MODE]: 0,
});

export interface VoltaParamMeta {
  id: number;
  label: string;
  format: (v: number) => string;
  options?: readonly string[];
  hint?: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => {
  const f = 20 * Math.pow(1000, Math.max(0, Math.min(1, v)));
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
};
const envSec = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  const t = 0.001 + 12 * c * c * c;
  return t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`;
};
const lfoHz = (v: number) => `${(0.08 * Math.pow(400, Math.max(0, Math.min(1, v)))).toFixed(2)} Hz`;
const semiFmt = (v: number) => {
  const s = Math.round((v - 0.5) * 48);
  return s === 0 ? '0 st' : `${s > 0 ? '+' : ''}${s} st`;
};
const centFmt = (v: number) => {
  const c = Math.round((v - 0.5) * 100);
  return c === 0 ? '0 ct' : `${c > 0 ? '+' : ''}${c} ct`;
};
const svfModeFmt = (v: number) => {
  const m = Math.max(0, Math.min(1, v)) * 3;
  if (m < 0.35) return 'LP';
  if (m < 0.75) return 'LP→BP';
  if (m < 1.35) return 'BP';
  if (m < 1.75) return 'BP→HP';
  if (m < 2.35) return 'HP';
  if (m < 2.75) return 'HP→Notch';
  return 'Notch';
};

export const VOLTA_PARAM_META: Record<number, VoltaParamMeta> = {
  [VOLTA.TOPOLOGY]: { id: VOLTA.TOPOLOGY, label: 'Topology', options: VOLTA_TOPOLOGIES, format: (v) => VOLTA_TOPOLOGIES[Math.round(v)] ?? 'Dual', hint: 'Signal routing across the discrete BJT ladder and modern Cytomic ZDF filter.' },
  [VOLTA.VINTAGE_MORPH]: { id: VOLTA.VINTAGE_MORPH, label: 'Era Morph', format: (v) => `${Math.round((1 - v) * 100)}% '74 / ${Math.round(v * 100)}% '26`, hint: 'Continuously morphs between 1974 discrete transistor circuit and 2026 Cytomic hybrid.' },
  [VOLTA.OSC1_WAVE]: { id: VOLTA.OSC1_WAVE, label: 'VCO 1 Wave', options: VOLTA_WAVES, format: (v) => VOLTA_WAVES[Math.round(v)] ?? 'Saw' },
  [VOLTA.OSC1_PW]: { id: VOLTA.OSC1_PW, label: 'Pulse Width', format: (v) => `${Math.round((0.08 + 0.84 * v) * 100)}%` },
  [VOLTA.OSC2_WAVE]: { id: VOLTA.OSC2_WAVE, label: 'VCO 2 Wave', options: VOLTA_WAVES, format: (v) => VOLTA_WAVES[Math.round(v)] ?? 'Saw' },
  [VOLTA.OSC2_SEMI]: { id: VOLTA.OSC2_SEMI, label: 'VCO 2 Semi', format: semiFmt },
  [VOLTA.OSC2_DETUNE]: { id: VOLTA.OSC2_DETUNE, label: 'VCO 2 Fine', format: centFmt },
  [VOLTA.OSC_MIX]: { id: VOLTA.OSC_MIX, label: 'VCO Balance', format: (v) => `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}` },
  [VOLTA.SUB_LVL]: { id: VOLTA.SUB_LVL, label: 'Sub Level', format: pct },
  [VOLTA.SUB_OCT]: { id: VOLTA.SUB_OCT, label: 'Sub Octave', options: ['-1 Oct', '-2 Oct'], format: (v) => (v > 0.5 ? '-2 Oct' : '-1 Oct') },
  [VOLTA.NOISE_LVL]: { id: VOLTA.NOISE_LVL, label: 'Shot Noise', format: pct },
  [VOLTA.FM_TZ]: { id: VOLTA.FM_TZ, label: 'Thru-Zero FM', format: pct, hint: 'Bidirectional linear phase modulation from VCO 2 to VCO 1 keeping fundamental locked.' },
  [VOLTA.WAVEFOLD]: { id: VOLTA.WAVEFOLD, label: 'Wavefold', format: pct, hint: '2x oversampled Buchla/Serge multi-stage sine wavefolder.' },
  [VOLTA.FOLD_SYM]: { id: VOLTA.FOLD_SYM, label: 'Fold Bias', format: (v) => `${Math.round((v - 0.5) * 200)}%`, hint: 'DC symmetry offset before folding: introduces rich 2nd-order even harmonics.' },
  [VOLTA.LADDER_CUTOFF]: { id: VOLTA.LADDER_CUTOFF, label: 'Ladder Cutoff', format: hz, hint: '4-stage discrete BJT differential-pair low-pass cutoff frequency.' },
  [VOLTA.LADDER_RES]: { id: VOLTA.LADDER_RES, label: 'Ladder Res', format: pct, hint: 'Zener-clamped transistor ladder feedback emphasis.' },
  [VOLTA.LADDER_DRIVE]: { id: VOLTA.LADDER_DRIVE, label: 'Ladder Drive', format: pct, hint: 'Input differential-pair saturation before ladder capacitors.' },
  [VOLTA.SVF_CUTOFF]: { id: VOLTA.SVF_CUTOFF, label: 'SVF Cutoff', format: hz, hint: 'Modern Cytomic zero-delay-feedback filter cutoff.' },
  [VOLTA.SVF_RES]: { id: VOLTA.SVF_RES, label: 'SVF Q', format: pct },
  [VOLTA.SVF_MODE]: { id: VOLTA.SVF_MODE, label: 'SVF Morph', format: svfModeFmt, hint: 'Smooth morph across Low-Pass → Band-Pass → High-Pass → Notch.' },
  [VOLTA.DIODE_CLIP]: { id: VOLTA.DIODE_CLIP, label: 'Diode Stage', format: pct, hint: 'Asymmetric 1N4148 / germanium BJT soft-clipping output stage.' },
  [VOLTA.OTA_DRIFT]: { id: VOLTA.OTA_DRIFT, label: 'OTA Drift', format: pct, hint: 'Component resistor tolerance and LM13700 thermal pitch/cutoff wander.' },
  [VOLTA.PSU_SAG]: { id: VOLTA.PSU_SAG, label: 'PSU Rail Sag', format: pct, hint: '12V reservoir capacitor droop and recharge under polyphonic transient load.' },
  [VOLTA.BIAS_TEMP]: { id: VOLTA.BIAS_TEMP, label: 'Temp (Vt)', format: (v) => `${Math.round(20 + v * 48)}°C`, hint: 'Transistor thermal voltage Vt shift warming saturation knees.' },
  [VOLTA.FILT_ENV_AMT]: { id: VOLTA.FILT_ENV_AMT, label: 'Env → Filter', format: (v) => `${Math.round((v - 0.5) * 200)}%` },
  [VOLTA.KEY_TRACK]: { id: VOLTA.KEY_TRACK, label: 'Key Track', format: pct },
  [VOLTA.AMP_ATK]: { id: VOLTA.AMP_ATK, label: 'Amp Attack', format: envSec },
  [VOLTA.AMP_DEC]: { id: VOLTA.AMP_DEC, label: 'Amp Decay', format: envSec },
  [VOLTA.AMP_SUS]: { id: VOLTA.AMP_SUS, label: 'Amp Sustain', format: pct },
  [VOLTA.AMP_REL]: { id: VOLTA.AMP_REL, label: 'Amp Release', format: envSec },
  [VOLTA.FLT_ATK]: { id: VOLTA.FLT_ATK, label: 'Filt Attack', format: envSec },
  [VOLTA.FLT_DEC]: { id: VOLTA.FLT_DEC, label: 'Filt Decay', format: envSec },
  [VOLTA.FLT_SUS]: { id: VOLTA.FLT_SUS, label: 'Filt Sustain', format: pct },
  [VOLTA.FLT_REL]: { id: VOLTA.FLT_REL, label: 'Filt Release', format: envSec },
  [VOLTA.LFO_RATE]: { id: VOLTA.LFO_RATE, label: 'LFO Rate', format: lfoHz },
  [VOLTA.LFO_DEPTH]: { id: VOLTA.LFO_DEPTH, label: 'LFO Depth', format: pct },
  [VOLTA.LFO_DEST]: { id: VOLTA.LFO_DEST, label: 'LFO Target', options: VOLTA_LFO_DESTS, format: (v) => VOLTA_LFO_DESTS[Math.round(v)] ?? 'Cutoff' },
  [VOLTA.GLIDE]: { id: VOLTA.GLIDE, label: 'Glide', format: (v) => `${Math.round(v * 1500)} ms` },
  [VOLTA.BEND_RANGE]: { id: VOLTA.BEND_RANGE, label: 'Bend Range', format: (v) => `±${Math.round(2 + v * 22)} st` },
  [VOLTA.CHORUS]: { id: VOLTA.CHORUS, label: 'Ensemble', format: pct, hint: 'Morphs between vintage MN3009 BBD chorus and wide modern quadrature ensemble.' },
  [VOLTA.WIDTH]: { id: VOLTA.WIDTH, label: 'Stereo Spread', format: pct },
  [VOLTA.VEL_SENS]: { id: VOLTA.VEL_SENS, label: 'Velocity Sens', format: pct },
  [VOLTA.UNISON]: { id: VOLTA.UNISON, label: 'Dual-Core Stack', format: pct },
  [VOLTA.VOICE_MODE]: { id: VOLTA.VOICE_MODE, label: 'Voice Mode', options: VOLTA_VOICE_MODES, format: (v) => VOLTA_VOICE_MODES[Math.round(v)] ?? 'Poly' },
};
