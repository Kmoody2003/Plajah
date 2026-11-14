// SOMA parameter ids — the TypeScript mirror of the block-1800 physical-modeling constants in
// rust/plajah-audio/src/params.rs, plus Master (0..9), Space/Echo (1600+), and Veil acoustic
// hall/chamber reverb (1200+).
//
// Keep this file and params.rs in lockstep; DSP_ABI_VERSION (14) in InstrumentHost guards
// against a stale .wasm, and SOMA_PARAM_META below drives the physical instrument UI.

import { P as ONDA_P } from '../onda/params';

export const P = ONDA_P;

/** SOMA Multi-Physics Acoustic Percussion & Chamber Simulator — block 1800 in params.rs. */
export const SM = {
  /** Master enable for the SOMA physical-modeling voice path (1 = active, 0 = bypass). */
  ENABLE: 1800,

  // ── Domain I: Striker & Hand Articulation (1801..1807) ────────────────────
  /** 0=Felt Mallet, 1=Open Hand, 2=Hand Slap, 3=Muted Hand, 4=Curved Stick/Bachi, 5=Finger/Rim. */
  STRIKER_TYPE: 1801,
  /** Striker felt/flesh compression stiffness & nonlinear Hertzian exponent. */
  STRIKER_HARDNESS: 1802,
  /** Striker effective mass & contact duration against the moving membrane. */
  STRIKER_MASS: 1803,
  /** Radial strike location r/a from 0.0 (dead center) to 0.95 (bearing rim edge). */
  STRIKE_POS: 1804,
  /** Azimuthal strike angle around the circular drumhead (projects dipole stereo image). */
  STRIKE_ANGLE: 1805,
  /** Velocity-to-hardness compression coupling (harder hits compress felt/flesh and brighten modes). */
  VEL_HARDNESS: 1806,
  /** Skin surface friction, cupped-hand air pocket pop & brush texture on impact. */
  HAND_BRUSH: 1807,

  // ── Domain II: 2D Circular Membrane Physics (1810..1818) ──────────────────
  /** Physical drumhead diameter (0..1 -> 6" / 15 cm Bongo up to 36" / 91 cm Orchestral Timpani/Taiko). */
  HEAD_DIAMETER: 1810,
  /** 0=Calfskin Vellum, 1=Thick Goat Skin, 2=Thin Goat Skin, 3=Rawhide/Mule, 4=Heavy Cowhide, 5=Mylar. */
  SKIN_MATERIAL: 1811,
  /** Intrinsic membrane viscoelastic decay time (0.06 s .. 12.0 s). */
  MEMBRANE_DECAY: 1812,
  /** High-frequency internal skin loss (damps upper Bessel partials relative to the fundamental). */
  MEMBRANE_DAMP_HF: 1813,
  /** External radiation & kettle air-mass loading (shifts Bessel modes from vacuum into harmonic alignment). */
  AIR_LOAD: 1814,
  /** Nonlinear membrane deflection tension stretch (pitch bloom / glissando on heavy strikes). */
  TENSION_NONLIN: 1815,
  /** Continuous real-time tension pedal / talking-drum cord squeeze (0.5 = 0 st, 0..1 = -12..+12 st). */
  TENSION_PEDAL: 1816,
  /** Sympathetic snare wire, Djembe Sega metal rings, or Bendir gut string buzz against the skin. */
  BUZZ_AMOUNT: 1817,
  /** Keyboard chromatic pitch tracking across MIDI notes (0..100%). */
  KEYTRACK: 1818,

  // ── Domain III & IV: Coupled Air Cavity, Shell & Radiation (1820..1828) ───
  /** 0=Kettle Bowl, 1=Goblet Helmholtz, 2=Stave Barrel, 3=Hourglass Dual-Head, 4=Taiko Barrel, 5=Open Hoop. */
  CAVITY_TYPE: 1820,
  /** Internal air chamber depth & enclosed volume. */
  CAVITY_VOLUME: 1821,
  /** Bidirectional pressure coupling between the internal air wave and the underside of the skin. */
  CAVITY_COUPLING: 1822,
  /** Helmholtz neck aperture / bottom port opening / sympathetic bottom head tuning ratio. */
  PORT_TUNING: 1823,
  /** 0=Carved Hardwood (Lenke/Iroko), 1=Hammered Copper, 2=Oak Staves, 3=Fired Clay, 4=Birch/Maple Hoop. */
  SHELL_MATERIAL: 1824,
  /** Structural vibration excitation & radiation level of the wood/metal shell walls. */
  SHELL_RESONANCE: 1825,
  /** High-SPL adiabatic air compression & wood chamber saturation warmth. */
  SHELL_WARMTH: 1826,
  /** Microphone & listener perspective: 0 = Close Batter Skin, 0.5 = Balanced Player, 1.0 = Deep Port & Shell. */
  MIC_PERSPECTIVE: 1827,
  /** Early stage/floor boundary reflections around the physical drum body. */
  ROOM_EARLY: 1828,
} as const;

/** Shared Acoustic Space & Delay (block 1600). */
export const SP = {
  DL_ON: 1608,
  DL_DIV: 1609,
  DL_FB: 1610,
  DL_TONE: 1611,
  DL_PING: 1612,
  DL_MIX: 1613,
} as const;

/** Shared Concert Hall / Acoustic Chamber Reverb (Veil block 1200). */
export const RV = {
  SIZE: 1200,
  DECAY: 1201,
  DIFFUSION: 1202,
  SHIMMER: 1203,
  BLUR: 1205,
  MIX: 1207,
} as const;

export const STRIKER_TYPES = [
  'Felt Mallet',
  'Open Hand',
  'Hand Slap / Pop',
  'Muted / Pressed',
  'Curved Stick / Bachi',
  'Finger / Rim',
] as const;

export const SKIN_MATERIALS = [
  'Calfskin Vellum',
  'Thick Goat Skin',
  'Thin Goat Skin',
  'Rawhide / Mule',
  'Heavy Cowhide',
  'Mylar Film',
] as const;

export const CAVITY_TYPES = [
  'Sealed Kettle Bowl',
  'Goblet Helmholtz Neck',
  'Tapered Stave Barrel',
  'Hourglass Dual-Head',
  'Deep Taiko Barrel',
  'Open Hoop / Frame',
] as const;

export const SHELL_MATERIALS = [
  'Carved Hardwood (Lenke)',
  'Hammered Copper Kettle',
  'Bent Oak / Ash Staves',
  'Fired Clay / Ceramic',
  'Birch / Maple Hoop',
] as const;

export const DELAY_DIVS = ['1/16', '1/8', '1/8D', '1/4', '1/4D', '1/2'] as const;

/** Exact 16 circular membrane Bessel eigenmodes (m, n) mirrored from soma.rs for UI wave visualization. */
export interface BesselModeInfo {
  index: number;
  m: number;
  n: number;
  label: string;
  besselRoot: number;
  timpaniRatio: number;
  openDrumRatio: number;
}

export const BESSEL_MODES: readonly BesselModeInfo[] = [
  { index: 0,  m: 0, n: 1, label: '(0,1)', besselRoot: 2.4048256, timpaniRatio: 0.842, openDrumRatio: 1.000 },
  { index: 1,  m: 1, n: 1, label: '(1,1)', besselRoot: 3.8317060, timpaniRatio: 1.000, openDrumRatio: 1.558 },
  { index: 2,  m: 2, n: 1, label: '(2,1)', besselRoot: 5.1356223, timpaniRatio: 1.502, openDrumRatio: 2.094 },
  { index: 3,  m: 0, n: 2, label: '(0,2)', besselRoot: 5.5200781, timpaniRatio: 1.695, openDrumRatio: 2.268 },
  { index: 4,  m: 3, n: 1, label: '(3,1)', besselRoot: 6.3801619, timpaniRatio: 1.992, openDrumRatio: 2.612 },
  { index: 5,  m: 1, n: 2, label: '(1,2)', besselRoot: 7.0155867, timpaniRatio: 2.290, openDrumRatio: 2.885 },
  { index: 6,  m: 4, n: 1, label: '(4,1)', besselRoot: 7.5883424, timpaniRatio: 2.440, openDrumRatio: 3.118 },
  { index: 7,  m: 2, n: 2, label: '(2,2)', besselRoot: 8.4172441, timpaniRatio: 2.815, openDrumRatio: 3.465 },
  { index: 8,  m: 0, n: 3, label: '(0,3)', besselRoot: 8.6537279, timpaniRatio: 2.910, openDrumRatio: 3.568 },
  { index: 9,  m: 5, n: 1, label: '(5,1)', besselRoot: 8.7714838, timpaniRatio: 2.895, openDrumRatio: 3.615 },
  { index: 10, m: 3, n: 2, label: '(3,2)', besselRoot: 9.7610231, timpaniRatio: 3.310, openDrumRatio: 4.025 },
  { index: 11, m: 6, n: 1, label: '(6,1)', besselRoot: 9.9361095, timpaniRatio: 3.345, openDrumRatio: 4.102 },
  { index: 12, m: 1, n: 3, label: '(1,3)', besselRoot: 10.173468, timpaniRatio: 3.520, openDrumRatio: 4.198 },
  { index: 13, m: 4, n: 2, label: '(4,2)', besselRoot: 11.064710, timpaniRatio: 3.830, openDrumRatio: 4.568 },
  { index: 14, m: 7, n: 1, label: '(7,1)', besselRoot: 11.086370, timpaniRatio: 3.790, openDrumRatio: 4.582 },
  { index: 15, m: 2, n: 3, label: '(2,3)', besselRoot: 11.619841, timpaniRatio: 4.060, openDrumRatio: 4.805 },
];

/** Evaluates the Bessel function of the first kind J_m(x) — matches rust/plajah-audio/src/soma.rs. */
export function besselJ(m: number, x: number): number {
  const xc = Math.max(0, x);
  if (xc < 1e-6) return m === 0 ? 1 : 0;
  const halfX = 0.5 * xc;
  const negQuarterX2 = -halfX * halfX;
  let term = 1;
  for (let k = 1; k <= m; k++) term *= halfX / k;
  let sum = term;
  for (let s = 1; s <= 16; s++) {
    term *= negQuarterX2 / (s * (s + m));
    sum += term;
    if (Math.abs(term) < 1e-7 * Math.abs(sum)) break;
  }
  return sum;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * SOMA's Hall Decay is a real room: 0.4 s (dry studio) to 4 s (stone temple). The engine reverb it
 * drives is the Veil — the pad reverb, whose own decay spans 0.5..60 s (rt60 = 0.5 + d² · 59.5).
 * Sent through untranslated, a 0.64 "temple" setting was a 25-second tail, and every drum hit
 * piled onto a drone that never died away.
 */
export const hallDecaySec = (v: number): number => 0.4 + 3.6 * Math.max(0, Math.min(1, v));
export const veilDecayForHall = (v: number): number => Math.sqrt(Math.max(0, hallDecaySec(v) - 0.5) / 59.5);
const hallSec = (v: number) => `${hallDecaySec(v).toFixed(1)} s`;
const headInches = (v: number) => {
  const inches = 6 + v * 30;
  const cm = Math.round(inches * 2.54);
  return `${inches.toFixed(1)}" (${cm} cm)`;
};
const strikeRadius = (v: number) => {
  const r = Math.round(Math.min(0.95, Math.max(0, v)) * 100);
  if (r < 12) return `${r}% (Center)`;
  if (r < 50) return `${r}% (Mid-Belly)`;
  if (r < 78) return `${r}% (Playing Spot)`;
  return `${r}% (Rim Edge)`;
};
const azimuthDeg = (v: number) => `${Math.round((v - 0.5) * 180)}°`;
const decayTime = (v: number) => {
  const t = 0.06 + 11.94 * Math.pow(Math.max(0, Math.min(1, v)), 2.4);
  return t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`;
};
const pedalSemis = (v: number) => {
  const st = (v - 0.5) * 24;
  return `${st >= 0 ? '+' : ''}${st.toFixed(1)} st`;
};
const cavityLiters = (v: number) => {
  const l = 2 + Math.pow(Math.max(0, Math.min(1, v)), 1.8) * 180;
  return `${l.toFixed(0)} L`;
};
const pick = <T extends readonly string[]>(list: T) => (v: number) =>
  list[Math.max(0, Math.min(list.length - 1, Math.round(v)))] ?? '—';

export interface SomaParamMeta {
  id: number;
  label: string;
  hint?: string;
  format?: (v: number) => string;
  options?: readonly string[];
  toggle?: boolean;
}

const meta = (
  id: number,
  label: string,
  hint?: string,
  format?: (v: number) => string,
  options?: readonly string[],
  toggle?: boolean,
): SomaParamMeta => ({ id, label, hint, format, options, toggle });

export const SOMA_PARAM_META: Record<number, SomaParamMeta> = {
  // Striker & Hand Articulation
  [SM.STRIKER_TYPE]: meta(
    SM.STRIKER_TYPE,
    'Articulation',
    'Physical striker or hand playing style colliding with the drumhead.',
    pick(STRIKER_TYPES),
    STRIKER_TYPES,
  ),
  [SM.STRIKER_HARDNESS]: meta(
    SM.STRIKER_HARDNESS,
    'Felt / Flesh Hardness',
    'Hertzian contact stiffness — soft wool felt / fleshy palm through to hard wood.',
    pct,
  ),
  [SM.STRIKER_MASS]: meta(
    SM.STRIKER_MASS,
    'Striker Mass',
    'Striker inertia — heavier mallets/hands stay in contact longer and drive deep low modes.',
    pct,
  ),
  [SM.STRIKE_POS]: meta(
    SM.STRIKE_POS,
    'Strike Position (r/a)',
    'Radial strike point from dead center (0% — axisymmetric thud) to rim edge (95% — bright multipole partials).',
    strikeRadius,
  ),
  [SM.STRIKE_ANGLE]: meta(
    SM.STRIKE_ANGLE,
    'Strike Azimuth',
    'Angle around the circular head — projects non-axisymmetric (m >= 1) dipole stereo width.',
    azimuthDeg,
  ),
  [SM.VEL_HARDNESS]: meta(
    SM.VEL_HARDNESS,
    'Velocity Compression',
    'Nonlinear felt/flesh compression: harder hits shorten contact time and excite higher Bessel modes.',
    pct,
  ),
  [SM.HAND_BRUSH]: meta(
    SM.HAND_BRUSH,
    'Skin Slap & Brush',
    'Cupped-hand air pocket pop and skin surface friction transient on impact.',
    pct,
  ),

  // 2D Circular Membrane Physics
  [SM.HEAD_DIAMETER]: meta(
    SM.HEAD_DIAMETER,
    'Head Diameter',
    'Physical drumhead diameter (6" Bongo to 36" Orchestral Bass Timpani / Nagado-Daiko).',
    headInches,
  ),
  [SM.SKIN_MATERIAL]: meta(
    SM.SKIN_MATERIAL,
    'Skin Material',
    'Membrane density, bending stiffness dispersion, and viscoelastic internal loss.',
    pick(SKIN_MATERIALS),
    SKIN_MATERIALS,
  ),
  [SM.MEMBRANE_DECAY]: meta(
    SM.MEMBRANE_DECAY,
    'Membrane Sustain',
    'Intrinsic T60 ring time of the stretched membrane.',
    decayTime,
  ),
  [SM.MEMBRANE_DAMP_HF]: meta(
    SM.MEMBRANE_DAMP_HF,
    'HF Skin Damping',
    'Viscoelastic high-frequency loss — controls how quickly upper Bessel modes decay.',
    pct,
  ),
  [SM.AIR_LOAD]: meta(
    SM.AIR_LOAD,
    'Air-Mass Loading',
    'Virtual air mass & kettle baffle shift: aligns Bessel roots into harmonic fifths & octaves.',
    pct,
  ),
  [SM.TENSION_NONLIN]: meta(
    SM.TENSION_NONLIN,
    'Deflection Pitch Bloom',
    'Nonlinear tension stretch under large membrane excursion (characteristic pitch drop on heavy hits).',
    pct,
  ),
  [SM.TENSION_PEDAL]: meta(
    SM.TENSION_PEDAL,
    'Tension Pedal / Cords',
    'Live Timpani foot pedal or West African Talking-Drum underarm cord squeeze (-12 to +12 st while ringing!).',
    pedalSemis,
  ),
  [SM.BUZZ_AMOUNT]: meta(
    SM.BUZZ_AMOUNT,
    'Snare / Sega Buzz',
    'Sympathetic metal snare wires, Djembe Sega rattle rings, or Bendir gut strings vibrating against the skin.',
    pct,
  ),
  [SM.KEYTRACK]: meta(
    SM.KEYTRACK,
    'Key Tracking',
    '100% = chromatic melodic tuning across MIDI keys; lower values create graduations across a drum kit.',
    pct,
  ),

  // Coupled Air Cavity & Wood/Metal Shell Chamber
  [SM.CAVITY_TYPE]: meta(
    SM.CAVITY_TYPE,
    'Chamber Geometry',
    'Internal acoustic air cavity coupled to the underside of the drumhead.',
    pick(CAVITY_TYPES),
    CAVITY_TYPES,
  ),
  [SM.CAVITY_VOLUME]: meta(
    SM.CAVITY_VOLUME,
    'Chamber Volume',
    'Internal air volume & shell depth — governs Helmholtz neck pitch and waveguide delay.',
    cavityLiters,
  ),
  [SM.CAVITY_COUPLING]: meta(
    SM.CAVITY_COUPLING,
    'Air ↔ Skin Coupling',
    'Bidirectional pressure feedback between internal chamber air waves and the underside of the membrane.',
    pct,
  ),
  [SM.PORT_TUNING]: meta(
    SM.PORT_TUNING,
    'Port / Reso Tuning',
    'Helmholtz bottom port aperture (Djembe/Conga) or sympathetic bottom head tuning (Talking Drum/Taiko).',
    pct,
  ),
  [SM.SHELL_MATERIAL]: meta(
    SM.SHELL_MATERIAL,
    'Shell Material',
    'Physical material of the drum chamber wall (Lenke Hardwood, Hammered Copper, Oak Staves, Clay, Birch).',
    pick(SHELL_MATERIALS),
    SHELL_MATERIALS,
  ),
  [SM.SHELL_RESONANCE]: meta(
    SM.SHELL_RESONANCE,
    'Shell Wall Modes',
    'Structural vibration of the carved wood or hammered copper shell excited by rim shear & internal air pressure.',
    pct,
  ),
  [SM.SHELL_WARMTH]: meta(
    SM.SHELL_WARMTH,
    'Chamber Air Warmth',
    'High-SPL adiabatic air compression inside the chamber at fortissimo dynamics.',
    pct,
  ),

  // Radiation & Room Acoustics
  [SM.MIC_PERSPECTIVE]: meta(
    SM.MIC_PERSPECTIVE,
    'Mic Perspective',
    '0% = Close Batter Skin, 50% = Balanced Player Position, 100% = Deep Bottom Air Port & Shell Body.',
    pct,
  ),
  [SM.ROOM_EARLY]: meta(
    SM.ROOM_EARLY,
    'Stage Floor Reflections',
    'Early acoustic boundary reflections from the stage floor and studio walls.',
    pct,
  ),
  [RV.SIZE]: meta(RV.SIZE, 'Hall Size', 'Acoustic concert hall / recording room dimensions.', pct),
  [RV.DECAY]: meta(RV.DECAY, 'Hall Decay', 'Concert hall reverberation tail (RT60).', hallSec),
  [RV.DIFFUSION]: meta(RV.DIFFUSION, 'Wall Diffusion', 'Acoustic dispersion of the hall surfaces.', pct),
  [RV.MIX]: meta(RV.MIX, 'Hall Ambience', 'Wet balance of the acoustic hall.', pct),

  [SP.DL_ON]: meta(SP.DL_ON, 'Rhythmic Echo', 'Tempo-synced stereo acoustic echo.', undefined, undefined, true),
  [SP.DL_DIV]: meta(
    SP.DL_DIV,
    'Echo Division',
    'Tempo division of the rhythmic echo.',
    (v) => DELAY_DIVS[Math.min(DELAY_DIVS.length - 1, Math.floor(v * DELAY_DIVS.length))] ?? '1/8D',
  ),
  [SP.DL_FB]: meta(SP.DL_FB, 'Echo Repeats', 'Regeneration of the rhythmic echo.', pct),
  [SP.DL_TONE]: meta(SP.DL_TONE, 'Echo Damping', 'High-frequency absorption per repeat.', pct),
  [SP.DL_PING]: meta(SP.DL_PING, 'Stereo Bounce', 'Left/right alternating stereo echo.', undefined, undefined, true),
  [SP.DL_MIX]: meta(SP.DL_MIX, 'Echo Mix', 'Rhythmic echo wet level.', pct),

  [P.MASTER_GAIN]: meta(P.MASTER_GAIN, 'Output Trim', 'Master studio output level.', pct),
  [P.BEND_RANGE]: meta(P.BEND_RANGE, 'Pitch Bend Range', 'Pitch wheel / MPE tension bend range.', (v) => `±${Math.max(2, Math.round(v * 24))} st`),
};

export const SOMA_DEFAULTS: Readonly<Record<number, number>> = Object.freeze({
  [P.MASTER_GAIN]: 0.78,
  [P.BEND_RANGE]: 7 / 24,
  [SM.ENABLE]: 1,
  [SM.STRIKER_TYPE]: 0,
  [SM.STRIKER_HARDNESS]: 0.45,
  [SM.STRIKER_MASS]: 0.55,
  [SM.STRIKE_POS]: 0.62,
  [SM.STRIKE_ANGLE]: 0.5,
  [SM.VEL_HARDNESS]: 0.65,
  [SM.HAND_BRUSH]: 0.25,

  [SM.HEAD_DIAMETER]: 0.62,
  [SM.SKIN_MATERIAL]: 0,
  [SM.MEMBRANE_DECAY]: 0.58,
  [SM.MEMBRANE_DAMP_HF]: 0.42,
  [SM.AIR_LOAD]: 0.78,
  [SM.TENSION_NONLIN]: 0.25,
  [SM.TENSION_PEDAL]: 0.5,
  [SM.BUZZ_AMOUNT]: 0,
  [SM.KEYTRACK]: 1.0,

  [SM.CAVITY_TYPE]: 0,
  [SM.CAVITY_VOLUME]: 0.65,
  [SM.CAVITY_COUPLING]: 0.68,
  [SM.PORT_TUNING]: 0.48,
  [SM.SHELL_MATERIAL]: 1,
  [SM.SHELL_RESONANCE]: 0.48,
  [SM.SHELL_WARMTH]: 0.35,
  [SM.MIC_PERSPECTIVE]: 0.45,
  [SM.ROOM_EARLY]: 0.28,

  [RV.SIZE]: 0.58,
  [RV.DECAY]: 0.42,
  [RV.DIFFUSION]: 0.68,
  [RV.SHIMMER]: 0,
  [RV.BLUR]: 0.15,
  [RV.MIX]: 0.18,

  [SP.DL_ON]: 0,
  [SP.DL_DIV]: 2,
  [SP.DL_FB]: 0.32,
  [SP.DL_TONE]: 0.55,
  [SP.DL_PING]: 1,
  [SP.DL_MIX]: 0.18,
});

export const SOMA_DISCRETE_IDS: ReadonlySet<number> = new Set<number>([
  SM.ENABLE,
  SM.STRIKER_TYPE,
  SM.SKIN_MATERIAL,
  SM.CAVITY_TYPE,
  SM.SHELL_MATERIAL,
  SP.DL_ON,
  SP.DL_DIV,
  SP.DL_PING,
]);

export function somaDefault(id: number): number {
  return SOMA_DEFAULTS[id] ?? 0;
}

export function formatSomaParam(id: number, value: number): string {
  const m = SOMA_PARAM_META[id];
  if (m?.format) return m.format(value);
  return `${Math.round(value * 100)}%`;
}
