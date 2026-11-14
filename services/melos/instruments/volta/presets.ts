import { VOLTA, voltaDefaults } from './params';

export type VoltaCategory = 'vintage' | 'westcoast' | 'modern' | 'hybrid';

export const VOLTA_CATEGORY_ORDER: VoltaCategory[] = ['vintage', 'westcoast', 'modern', 'hybrid'];

export const VOLTA_CATEGORY_LABELS: Record<VoltaCategory, string> = {
  vintage: "Vintage '74 Analog",
  westcoast: 'West-Coast & TZ-FM',
  modern: 'Modern Cytomic Hybrid',
  hybrid: 'Super-Synth Morph',
};

export type VoltaMacro = 'morph' | 'cutoff' | 'resonance' | 'fold' | 'sag' | 'ensemble';

export const VOLTA_MACRO_ORDER: VoltaMacro[] = [
  'morph',
  'cutoff',
  'resonance',
  'fold',
  'sag',
  'ensemble',
];

export const VOLTA_MACRO_LABELS: Record<VoltaMacro, string> = {
  morph: 'Era Morph',
  cutoff: 'Filter Cutoff',
  resonance: 'Resonance',
  fold: 'Fold / TZ-FM',
  sag: 'PSU Sag / Drive',
  ensemble: 'Chorus / Space',
};

export const VOLTA_MACRO_HINTS: Record<VoltaMacro, string> = {
  morph: 'Cross-morphs between 1974 discrete BJT transistor ladder and 2026 Cytomic hybrid core.',
  cutoff: 'Sweeps primary Ladder and Modern SVF cutoff frequencies simultaneously.',
  resonance: 'Boosts transistor ladder feedback and Cytomic SVF Q together.',
  fold: 'Engages West-Coast Buchla wavefolder and Thru-Zero linear FM sidebands.',
  sag: 'Drives Shockley diodes, BJT differential pairs, and 12V reservoir rail sag.',
  ensemble: 'Blends dual-era stereo BBD / quadrature ensemble width.',
};

export interface VoltaPreset {
  id: string;
  name: string;
  category: VoltaCategory;
  era: string;
  circuitNotes: string;
  params: Record<number, number>;
  macros: Record<VoltaMacro, number>;
}

const mk = (
  id: string,
  name: string,
  category: VoltaCategory,
  era: string,
  circuitNotes: string,
  overrides: Record<number, number>,
  macros?: Partial<Record<VoltaMacro, number>>,
): VoltaPreset => ({
  id,
  name,
  category,
  era,
  circuitNotes,
  params: { ...voltaDefaults(), ...overrides },
  macros: {
    morph: overrides[VOLTA.VINTAGE_MORPH] ?? 0.35,
    cutoff: 0.5,
    resonance: 0.35,
    fold: overrides[VOLTA.WAVEFOLD] ?? 0.15,
    sag: overrides[VOLTA.DIODE_CLIP] ?? 0.25,
    ensemble: overrides[VOLTA.CHORUS] ?? 0.28,
    ...macros,
  },
});

export function expandVoltaMacros(
  base: Record<number, number>,
  m: Record<VoltaMacro, number>,
): Record<number, number> {
  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const out = { ...voltaDefaults(), ...base };

  // Era Morph replaces target morph smoothly
  out[VOLTA.VINTAGE_MORPH] = clamp(m.morph);

  // Cutoff offset relative to center (0.5)
  const cDelta = (m.cutoff - 0.5) * 0.65;
  out[VOLTA.LADDER_CUTOFF] = clamp(out[VOLTA.LADDER_CUTOFF] + cDelta, 0.02, 0.99);
  out[VOLTA.SVF_CUTOFF] = clamp(out[VOLTA.SVF_CUTOFF] + cDelta * 0.9, 0.02, 0.99);

  // Resonance relative to neutral 0.35
  const rDelta = (m.resonance - 0.35) * 0.72;
  out[VOLTA.LADDER_RES] = clamp(out[VOLTA.LADDER_RES] + rDelta, 0, 0.96);
  out[VOLTA.SVF_RES] = clamp(out[VOLTA.SVF_RES] + rDelta * 0.85, 0, 0.96);

  // Fold / FM blend
  const fDelta = (m.fold - 0.15) * 0.85;
  out[VOLTA.WAVEFOLD] = clamp(out[VOLTA.WAVEFOLD] + fDelta * 0.85);
  out[VOLTA.FM_TZ] = clamp(out[VOLTA.FM_TZ] + Math.max(0, fDelta) * 0.45);

  // PSU Sag / Diode Drive
  const sDelta = (m.sag - 0.25) * 0.8;
  out[VOLTA.DIODE_CLIP] = clamp(out[VOLTA.DIODE_CLIP] + sDelta * 0.7);
  out[VOLTA.LADDER_DRIVE] = clamp(out[VOLTA.LADDER_DRIVE] + sDelta * 0.65);
  out[VOLTA.PSU_SAG] = clamp(out[VOLTA.PSU_SAG] + sDelta * 0.75);

  // Ensemble width
  out[VOLTA.CHORUS] = clamp(m.ensemble);
  return out;
}

export const VOLTA_PRESETS: VoltaPreset[] = [
  // ── Vintage '74 Analog ───────────────────────────────────────────────────
  mk(
    'volta-model-d-bass',
    'Model D Sub Bass',
    'vintage',
    '1974 Discrete BJT',
    'Pure 4-stage differential-pair transistor ladder driven hard with -1 sub square and leaky reservoir rail sag.',
    {
      [VOLTA.TOPOLOGY]: 3,
      [VOLTA.VINTAGE_MORPH]: 0.05,
      [VOLTA.OSC1_WAVE]: 0,
      [VOLTA.OSC2_WAVE]: 0,
      [VOLTA.OSC2_DETUNE]: 0.58,
      [VOLTA.OSC_MIX]: 0.48,
      [VOLTA.SUB_LVL]: 0.68,
      [VOLTA.SUB_OCT]: 0,
      [VOLTA.LADDER_CUTOFF]: 0.42,
      [VOLTA.LADDER_RES]: 0.36,
      [VOLTA.LADDER_DRIVE]: 0.58,
      [VOLTA.DIODE_CLIP]: 0.34,
      [VOLTA.PSU_SAG]: 0.48,
      [VOLTA.OTA_DRIFT]: 0.35,
      [VOLTA.BIAS_TEMP]: 0.52,
      [VOLTA.FILT_ENV_AMT]: 0.78,
      [VOLTA.AMP_ATK]: 0.02,
      [VOLTA.AMP_DEC]: 0.34,
      [VOLTA.AMP_SUS]: 0.65,
      [VOLTA.AMP_REL]: 0.18,
      [VOLTA.FLT_ATK]: 0.01,
      [VOLTA.FLT_DEC]: 0.28,
      [VOLTA.FLT_SUS]: 0.16,
      [VOLTA.CHORUS]: 0.08,
      [VOLTA.VOICE_MODE]: 2,
      [VOLTA.GLIDE]: 0.08,
    },
    { morph: 0.05, sag: 0.48, ensemble: 0.08 },
  ),
  mk(
    'volta-prophet-brass',
    'Prophet ’78 Analog Brass',
    'vintage',
    '1978 Curtis BJT',
    'Detuned Super-Analog sawtooth pair swelling into a resonant ladder with gentle thermal drift and PWM bloom.',
    {
      [VOLTA.TOPOLOGY]: 3,
      [VOLTA.VINTAGE_MORPH]: 0.12,
      [VOLTA.OSC1_WAVE]: 4,
      [VOLTA.OSC2_WAVE]: 0,
      [VOLTA.OSC2_DETUNE]: 0.62,
      [VOLTA.OSC_MIX]: 0.42,
      [VOLTA.SUB_LVL]: 0.22,
      [VOLTA.LADDER_CUTOFF]: 0.56,
      [VOLTA.LADDER_RES]: 0.22,
      [VOLTA.LADDER_DRIVE]: 0.35,
      [VOLTA.OTA_DRIFT]: 0.44,
      [VOLTA.PSU_SAG]: 0.34,
      [VOLTA.FILT_ENV_AMT]: 0.74,
      [VOLTA.AMP_ATK]: 0.16,
      [VOLTA.AMP_DEC]: 0.44,
      [VOLTA.AMP_SUS]: 0.82,
      [VOLTA.AMP_REL]: 0.32,
      [VOLTA.FLT_ATK]: 0.18,
      [VOLTA.FLT_DEC]: 0.46,
      [VOLTA.FLT_SUS]: 0.35,
      [VOLTA.CHORUS]: 0.38,
      [VOLTA.WIDTH]: 0.72,
    },
    { morph: 0.12, ensemble: 0.38 },
  ),
  mk(
    'volta-juno-strings',
    'Juno MN3009 Ensemble Pad',
    'vintage',
    '1982 BBD Poly',
    'Warm pulse-width square + sub oscillator bathed in MN3009 bucket-brigade stereo chorus.',
    {
      [VOLTA.TOPOLOGY]: 2,
      [VOLTA.VINTAGE_MORPH]: 0.18,
      [VOLTA.OSC1_WAVE]: 1,
      [VOLTA.OSC1_PW]: 0.62,
      [VOLTA.OSC2_WAVE]: 4,
      [VOLTA.OSC2_DETUNE]: 0.55,
      [VOLTA.OSC_MIX]: 0.35,
      [VOLTA.SUB_LVL]: 0.45,
      [VOLTA.LADDER_CUTOFF]: 0.54,
      [VOLTA.LADDER_RES]: 0.14,
      [VOLTA.LADDER_DRIVE]: 0.22,
      [VOLTA.LFO_RATE]: 0.24,
      [VOLTA.LFO_DEPTH]: 0.42,
      [VOLTA.LFO_DEST]: 2,
      [VOLTA.AMP_ATK]: 0.36,
      [VOLTA.AMP_SUS]: 0.88,
      [VOLTA.AMP_REL]: 0.52,
      [VOLTA.CHORUS]: 0.76,
      [VOLTA.WIDTH]: 0.82,
    },
    { morph: 0.18, ensemble: 0.76 },
  ),

  // ── West-Coast & Thru-Zero FM ────────────────────────────────────────────
  mk(
    'volta-buchla-pluck',
    'Buchla 259 Wavefold Pluck',
    'westcoast',
    '1973 West-Coast',
    'Triangle core slammed through 4-stage asymmetric sine wavefolder and crisp resonant SVF pluck.',
    {
      [VOLTA.TOPOLOGY]: 1,
      [VOLTA.VINTAGE_MORPH]: 0.48,
      [VOLTA.OSC1_WAVE]: 2,
      [VOLTA.OSC2_WAVE]: 3,
      [VOLTA.OSC2_SEMI]: 0.65,
      [VOLTA.OSC_MIX]: 0.25,
      [VOLTA.SUB_LVL]: 0.2,
      [VOLTA.WAVEFOLD]: 0.82,
      [VOLTA.FOLD_SYM]: 0.66,
      [VOLTA.LADDER_CUTOFF]: 0.68,
      [VOLTA.SVF_CUTOFF]: 0.76,
      [VOLTA.SVF_RES]: 0.34,
      [VOLTA.SVF_MODE]: 0.08,
      [VOLTA.FILT_ENV_AMT]: 0.82,
      [VOLTA.AMP_ATK]: 0.0,
      [VOLTA.AMP_DEC]: 0.38,
      [VOLTA.AMP_SUS]: 0.08,
      [VOLTA.AMP_REL]: 0.3,
      [VOLTA.FLT_ATK]: 0.0,
      [VOLTA.FLT_DEC]: 0.28,
      [VOLTA.FLT_SUS]: 0.05,
      [VOLTA.CHORUS]: 0.22,
    },
    { morph: 0.48, fold: 0.82, ensemble: 0.22 },
  ),
  mk(
    'volta-tzfm-bell',
    'Thru-Zero Phase Bell',
    'westcoast',
    'Precision TZ-FM',
    'True bidirectional linear FM (VCO2 → VCO1) preserving pitch accuracy into Cytomic notch/bandpass.',
    {
      [VOLTA.TOPOLOGY]: 4,
      [VOLTA.VINTAGE_MORPH]: 0.88,
      [VOLTA.OSC1_WAVE]: 3,
      [VOLTA.OSC2_WAVE]: 3,
      [VOLTA.OSC2_SEMI]: 0.79, // +14 st irrational bell overtone ratio
      [VOLTA.OSC2_DETUNE]: 0.68,
      [VOLTA.OSC_MIX]: 0.18,
      [VOLTA.SUB_LVL]: 0.12,
      [VOLTA.FM_TZ]: 0.62,
      [VOLTA.WAVEFOLD]: 0.34,
      [VOLTA.SVF_CUTOFF]: 0.84,
      [VOLTA.SVF_RES]: 0.26,
      [VOLTA.SVF_MODE]: 0.12,
      [VOLTA.OTA_DRIFT]: 0.06,
      [VOLTA.PSU_SAG]: 0.05,
      [VOLTA.AMP_ATK]: 0.01,
      [VOLTA.AMP_DEC]: 0.62,
      [VOLTA.AMP_SUS]: 0.18,
      [VOLTA.AMP_REL]: 0.56,
      [VOLTA.CHORUS]: 0.45,
      [VOLTA.WIDTH]: 0.78,
    },
    { morph: 0.88, fold: 0.62, sag: 0.08, ensemble: 0.45 },
  ),
  mk(
    'volta-serge-wave-bass',
    'Serge Asymmetric Acid Bass',
    'westcoast',
    'Discrete West-East',
    'Saw+Sub biased with DC offset into wavefolder + diode clipper before 24dB BJT ladder growl.',
    {
      [VOLTA.TOPOLOGY]: 0,
      [VOLTA.VINTAGE_MORPH]: 0.26,
      [VOLTA.OSC1_WAVE]: 0,
      [VOLTA.OSC2_WAVE]: 1,
      [VOLTA.OSC2_SEMI]: 0.25,
      [VOLTA.OSC_MIX]: 0.42,
      [VOLTA.SUB_LVL]: 0.6,
      [VOLTA.SUB_OCT]: 1,
      [VOLTA.WAVEFOLD]: 0.58,
      [VOLTA.FOLD_SYM]: 0.76,
      [VOLTA.LADDER_CUTOFF]: 0.46,
      [VOLTA.LADDER_RES]: 0.52,
      [VOLTA.LADDER_DRIVE]: 0.68,
      [VOLTA.DIODE_CLIP]: 0.58,
      [VOLTA.FILT_ENV_AMT]: 0.84,
      [VOLTA.VOICE_MODE]: 1,
    },
    { morph: 0.26, fold: 0.58, sag: 0.62 },
  ),

  // ── Modern Cytomic Hybrid ────────────────────────────────────────────────
  mk(
    'volta-cytomic-acid',
    'Cytomic 2026 Hyper Acid',
    'modern',
    'Modern ZDF Hybrid',
    'High-Q zero-delay-feedback Cytomic LP/BP filter with aggressive wavefold & Shockley diode overdrive.',
    {
      [VOLTA.TOPOLOGY]: 4,
      [VOLTA.VINTAGE_MORPH]: 0.92,
      [VOLTA.OSC1_WAVE]: 1,
      [VOLTA.OSC1_PW]: 0.34,
      [VOLTA.OSC2_WAVE]: 0,
      [VOLTA.OSC_MIX]: 0.38,
      [VOLTA.WAVEFOLD]: 0.46,
      [VOLTA.SVF_CUTOFF]: 0.48,
      [VOLTA.SVF_RES]: 0.78,
      [VOLTA.SVF_MODE]: 0.08,
      [VOLTA.DIODE_CLIP]: 0.48,
      [VOLTA.FILT_ENV_AMT]: 0.9,
      [VOLTA.AMP_ATK]: 0.01,
      [VOLTA.AMP_DEC]: 0.32,
      [VOLTA.AMP_SUS]: 0.42,
      [VOLTA.FLT_ATK]: 0.01,
      [VOLTA.FLT_DEC]: 0.24,
      [VOLTA.FLT_SUS]: 0.1,
      [VOLTA.GLIDE]: 0.09,
      [VOLTA.VOICE_MODE]: 2,
      [VOLTA.CHORUS]: 0.14,
    },
    { morph: 0.92, resonance: 0.78, fold: 0.46, sag: 0.48 },
  ),
  mk(
    'volta-glass-notch',
    'Glass Cytomic Notch Pad',
    'modern',
    '2026 Precision ZDF',
    'Crystalline dual Super-Analog stack swept smoothly through Cytomic High-Pass / Notch phase morph.',
    {
      [VOLTA.TOPOLOGY]: 2,
      [VOLTA.VINTAGE_MORPH]: 0.85,
      [VOLTA.OSC1_WAVE]: 4,
      [VOLTA.OSC2_WAVE]: 2,
      [VOLTA.OSC2_SEMI]: 0.65,
      [VOLTA.OSC2_DETUNE]: 0.59,
      [VOLTA.OSC_MIX]: 0.44,
      [VOLTA.SUB_LVL]: 0.25,
      [VOLTA.FM_TZ]: 0.18,
      [VOLTA.SVF_CUTOFF]: 0.66,
      [VOLTA.SVF_RES]: 0.44,
      [VOLTA.SVF_MODE]: 0.82, // HP->Notch shimmer
      [VOLTA.LFO_RATE]: 0.22,
      [VOLTA.LFO_DEPTH]: 0.36,
      [VOLTA.LFO_DEST]: 0,
      [VOLTA.AMP_ATK]: 0.38,
      [VOLTA.AMP_SUS]: 0.9,
      [VOLTA.AMP_REL]: 0.58,
      [VOLTA.CHORUS]: 0.64,
      [VOLTA.WIDTH]: 0.88,
    },
    { morph: 0.85, ensemble: 0.64 },
  ),

  // ── Super-Synth Morph ────────────────────────────────────────────────────
  mk(
    'volta-super-monolith',
    'VOLTA Dual-Era Monolith',
    'hybrid',
    '1974 ↔ 2026 Flagship',
    'Flagship Super-Synth patch: parallel Discrete BJT Ladder warmth morphing into Cytomic SVF bite + Wavefold.',
    {
      [VOLTA.TOPOLOGY]: 2,
      [VOLTA.VINTAGE_MORPH]: 0.42,
      [VOLTA.OSC1_WAVE]: 4,
      [VOLTA.OSC2_WAVE]: 0,
      [VOLTA.OSC2_DETUNE]: 0.6,
      [VOLTA.OSC_MIX]: 0.48,
      [VOLTA.SUB_LVL]: 0.42,
      [VOLTA.FM_TZ]: 0.12,
      [VOLTA.WAVEFOLD]: 0.28,
      [VOLTA.LADDER_CUTOFF]: 0.64,
      [VOLTA.LADDER_RES]: 0.28,
      [VOLTA.LADDER_DRIVE]: 0.38,
      [VOLTA.SVF_CUTOFF]: 0.78,
      [VOLTA.SVF_RES]: 0.24,
      [VOLTA.SVF_MODE]: 0.18,
      [VOLTA.DIODE_CLIP]: 0.28,
      [VOLTA.OTA_DRIFT]: 0.3,
      [VOLTA.PSU_SAG]: 0.28,
      [VOLTA.FILT_ENV_AMT]: 0.74,
      [VOLTA.CHORUS]: 0.4,
      [VOLTA.WIDTH]: 0.74,
    },
    { morph: 0.42, fold: 0.28, sag: 0.3, ensemble: 0.4 },
  ),
  mk(
    'volta-thermal-tube-keys',
    'Thermal Tube Electric Keys',
    'hybrid',
    'Discrete Bias 58°C',
    'Warm high-Vt transistor differential pairs blended with gentle TZ-FM tine bark and reservoir rail bloom.',
    {
      [VOLTA.TOPOLOGY]: 0,
      [VOLTA.VINTAGE_MORPH]: 0.32,
      [VOLTA.OSC1_WAVE]: 2,
      [VOLTA.OSC2_WAVE]: 3,
      [VOLTA.OSC2_SEMI]: 0.75,
      [VOLTA.OSC_MIX]: 0.28,
      [VOLTA.FM_TZ]: 0.24,
      [VOLTA.BIAS_TEMP]: 0.78,
      [VOLTA.DIODE_CLIP]: 0.36,
      [VOLTA.PSU_SAG]: 0.38,
      [VOLTA.LADDER_CUTOFF]: 0.66,
      [VOLTA.SVF_CUTOFF]: 0.74,
      [VOLTA.AMP_ATK]: 0.01,
      [VOLTA.AMP_DEC]: 0.56,
      [VOLTA.AMP_SUS]: 0.32,
      [VOLTA.AMP_REL]: 0.38,
      [VOLTA.CHORUS]: 0.42,
    },
    { morph: 0.32, fold: 0.24, sag: 0.38, ensemble: 0.42 },
  ),
];

export const DEFAULT_VOLTA_PRESET = VOLTA_PRESETS.find((p) => p.id === 'volta-super-monolith') ?? VOLTA_PRESETS[0];
