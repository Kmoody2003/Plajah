// SOMA — 36 Physical-Modeling Acoustic Percussion & Chamber Presets across 6 World & Orchestral Families.
//
// Every preset configures the 4 coupled physical domains in rust/plajah-audio/src/soma.rs:
//   1. Striker / Hand Contact Mechanics (mallet, open hand, slap, muted palm, curved stick, finger)
//   2. 2D Circular Membrane Bessel Eigenmodes (diameter, skin material, air-load, nonlinear tension)
//   3. Coupled Air Cavity (Kettle, Goblet Helmholtz, Stave Barrel, Hourglass Dual-Head, Taiko, Hoop)
//   4. Wood / Copper / Clay Shell Wall Structural Modes & Radiation Perspective

import { P, SM, SP, RV, SOMA_DEFAULTS } from './params';

export type SomaCategory =
  | 'timpani'
  | 'west-african'
  | 'afro-cuban'
  | 'taiko-concert'
  | 'middle-eastern-india'
  | 'frame-ancient';

export const SOMA_CATEGORY_ORDER: SomaCategory[] = [
  'timpani',
  'west-african',
  'afro-cuban',
  'taiko-concert',
  'middle-eastern-india',
  'frame-ancient',
];

export const SOMA_CATEGORY_LABELS: Record<SomaCategory, string> = {
  'timpani': 'Orchestral Timpani (Kettle)',
  'west-african': 'West African (Djembe · Talking Drum · Batá)',
  'afro-cuban': 'Afro-Cuban (Conga · Quinto · Bongo)',
  'taiko-concert': 'Taiko & Concert Hall Percussion',
  'middle-eastern-india': 'Goblet, Ceramic & Harmonic (Darbuka · Tabla)',
  'frame-ancient': 'Frame Drums (Bodhrán · Bendir · Tar)',
};

export type SomaMacro =
  | 'strikePos'
  | 'hardness'
  | 'tension'
  | 'chamber'
  | 'shellBody'
  | 'hallSpace';

export interface SomaPreset {
  id: string;
  name: string;
  category: SomaCategory;
  origin: string;
  acoustics: string;
  description: string;
  defaultNote: number;
  params: Record<number, number>;
  macros: Record<SomaMacro, number>;
}

function buildParams(overrides: Record<number, number>): Record<number, number> {
  return {
    ...SOMA_DEFAULTS,
    [SM.ENABLE]: 1,
    ...overrides,
  };
}

/**
 * Expands the 6 physical performance macros onto the underlying SOMA engine parameters.
 */
export function expandSomaMacros(
  base: Record<number, number>,
  macros: Record<SomaMacro, number>,
): Record<number, number> {
  const out: Record<number, number> = { ...base, [SM.ENABLE]: 1 };
  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

  // 1. Strike Position Macro (0..1 -> Center 0.0 to Rim 0.92, centered around preset's strike position)
  const posDelta = (macros.strikePos - 0.5) * 0.75;
  out[SM.STRIKE_POS] = clamp((base[SM.STRIKE_POS] ?? 0.62) + posDelta, 0.0, 0.94);

  // 2. Striker Hardness & Slap Snap Macro
  const hardDelta = (macros.hardness - 0.5) * 0.7;
  out[SM.STRIKER_HARDNESS] = clamp((base[SM.STRIKER_HARDNESS] ?? 0.45) + hardDelta);
  out[SM.HAND_BRUSH] = clamp((base[SM.HAND_BRUSH] ?? 0.25) + hardDelta * 0.45);

  // 3. Tension Pedal / Talking-Drum Cord Squeeze Macro
  const tensionDelta = (macros.tension - 0.5) * 0.75;
  out[SM.TENSION_PEDAL] = clamp((base[SM.TENSION_PEDAL] ?? 0.5) + tensionDelta);

  // 4. Air Chamber Coupling & Depth Macro
  const chDelta = (macros.chamber - 0.5) * 0.65;
  out[SM.CAVITY_COUPLING] = clamp((base[SM.CAVITY_COUPLING] ?? 0.68) + chDelta);
  out[SM.CAVITY_VOLUME] = clamp((base[SM.CAVITY_VOLUME] ?? 0.65) + chDelta * 0.35);

  // 5. Shell Wall Resonance & Chamber Warmth Macro
  const bodyDelta = (macros.shellBody - 0.5) * 0.7;
  out[SM.SHELL_RESONANCE] = clamp((base[SM.SHELL_RESONANCE] ?? 0.48) + bodyDelta);
  out[SM.SHELL_WARMTH] = clamp((base[SM.SHELL_WARMTH] ?? 0.35) + bodyDelta * 0.5);

  // 6. Hall & Stage Ambience Macro
  const spaceDelta = (macros.hallSpace - 0.5) * 0.65;
  out[RV.MIX] = clamp((base[RV.MIX] ?? 0.18) + spaceDelta * 0.65);
  out[SM.ROOM_EARLY] = clamp((base[SM.ROOM_EARLY] ?? 0.28) + spaceDelta * 0.5);

  return out;
}

export const SOMA_PRESETS: SomaPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ORCHESTRAL TIMPANI (Sealed Parabolic Copper Kettle + Calfskin Vellum)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'timpani-29-dresden',
    name: '29" Dresden Copper Timpani',
    category: 'timpani',
    origin: 'Dresden / Leipzig Symphonic Kettle',
    acoustics: '29" Calfskin Vellum · Sealed Hammered Copper Bowl · Wool Felt Mallet at r/a = 65%',
    description: 'Classic orchestral 29" pedal timpani. Air-mass loading and the sealed copper kettle align the (1,1), (2,1), and (3,1) Bessel modes into a pure harmonic root, fifth, and octave.',
    defaultNote: 48, // C3
    params: buildParams({
      [SM.STRIKER_TYPE]: 0, // Felt Mallet
      [SM.STRIKER_HARDNESS]: 0.44,
      [SM.STRIKER_MASS]: 0.58,
      [SM.STRIKE_POS]: 0.65,
      [SM.VEL_HARDNESS]: 0.72,
      [SM.HAND_BRUSH]: 0.12,
      [SM.HEAD_DIAMETER]: 0.74, // ~28.5"
      [SM.SKIN_MATERIAL]: 0,    // Calfskin Vellum
      [SM.MEMBRANE_DECAY]: 0.68,
      [SM.MEMBRANE_DAMP_HF]: 0.38,
      [SM.AIR_LOAD]: 0.92,
      [SM.TENSION_NONLIN]: 0.18,
      [SM.TENSION_PEDAL]: 0.5,
      [SM.KEYTRACK]: 1.0,
      [SM.CAVITY_TYPE]: 0,      // Sealed Kettle Bowl
      [SM.CAVITY_VOLUME]: 0.72,
      [SM.CAVITY_COUPLING]: 0.74,
      [SM.PORT_TUNING]: 0.48,
      [SM.SHELL_MATERIAL]: 1,   // Hammered Copper Kettle
      [SM.SHELL_RESONANCE]: 0.52,
      [SM.SHELL_WARMTH]: 0.32,
      [SM.MIC_PERSPECTIVE]: 0.42,
      [SM.ROOM_EARLY]: 0.35,
      [RV.SIZE]: 0.72,
      [RV.DECAY]: 0.55,
      [RV.MIX]: 0.24,
    }),
    macros: { strikePos: 0.5, hardness: 0.48, tension: 0.5, chamber: 0.62, shellBody: 0.52, hallSpace: 0.55 },
  },
  {
    id: 'timpani-32-profondo',
    name: '32" Symphonic Bass Timpani',
    category: 'timpani',
    origin: 'Berlin / Vienna Orchestral Low Kettle',
    acoustics: '32" Heavy Calfskin · 150L Parabolic Copper Kettle · Soft Cartwheel Felt Rollers',
    description: 'Monumental 32" bass timpani tuned for the D2–A2 register. Soft cartwheel felt mallets and a cavernous copper kettle deliver subterranean orchestral authority.',
    defaultNote: 41, // F2
    params: buildParams({
      [SM.STRIKER_TYPE]: 0,
      [SM.STRIKER_HARDNESS]: 0.30,
      [SM.STRIKER_MASS]: 0.76,
      [SM.STRIKE_POS]: 0.62,
      [SM.VEL_HARDNESS]: 0.68,
      [SM.HAND_BRUSH]: 0.10,
      [SM.HEAD_DIAMETER]: 0.88, // 32.4"
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.76,
      [SM.MEMBRANE_DAMP_HF]: 0.46,
      [SM.AIR_LOAD]: 0.95,
      [SM.TENSION_NONLIN]: 0.24,
      [SM.CAVITY_TYPE]: 0,
      [SM.CAVITY_VOLUME]: 0.88,
      [SM.CAVITY_COUPLING]: 0.82,
      [SM.SHELL_MATERIAL]: 1,
      [SM.SHELL_RESONANCE]: 0.58,
      [SM.SHELL_WARMTH]: 0.44,
      [SM.MIC_PERSPECTIVE]: 0.52,
      [SM.ROOM_EARLY]: 0.40,
      [RV.SIZE]: 0.80,
      [RV.DECAY]: 0.62,
      [RV.MIX]: 0.28,
    }),
    macros: { strikePos: 0.5, hardness: 0.36, tension: 0.5, chamber: 0.74, shellBody: 0.60, hallSpace: 0.62 },
  },
  {
    id: 'timpani-23-piccolo',
    name: '23" Viennese Piccolo Timpani',
    category: 'timpani',
    origin: 'Musikverein Hand-Crank High Kettle',
    acoustics: '23" Tight Goat/Calf Vellum · Shallow Copper Bowl · Flannel Core Mallet',
    description: 'High-tension 23" piccolo timpani for Beethoven, Mahler, and Mozart scores. Articulate attack with singing upper (2,1) and (3,1) partials.',
    defaultNote: 53, // F3
    params: buildParams({
      [SM.STRIKER_TYPE]: 0,
      [SM.STRIKER_HARDNESS]: 0.62,
      [SM.STRIKER_MASS]: 0.42,
      [SM.STRIKE_POS]: 0.68,
      [SM.HEAD_DIAMETER]: 0.56, // ~22.8"
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.58,
      [SM.MEMBRANE_DAMP_HF]: 0.30,
      [SM.AIR_LOAD]: 0.88,
      [SM.TENSION_NONLIN]: 0.14,
      [SM.CAVITY_TYPE]: 0,
      [SM.CAVITY_VOLUME]: 0.52,
      [SM.CAVITY_COUPLING]: 0.66,
      [SM.SHELL_MATERIAL]: 1,
      [SM.SHELL_RESONANCE]: 0.54,
      [SM.MIC_PERSPECTIVE]: 0.38,
    }),
    macros: { strikePos: 0.54, hardness: 0.62, tension: 0.5, chamber: 0.52, shellBody: 0.54, hallSpace: 0.48 },
  },
  {
    id: 'timpani-pedal-gliss',
    name: 'Pedal Glissando & Bloom Kettle',
    category: 'timpani',
    origin: '20th-Century Avant-Garde Symphonic Timpani',
    acoustics: '28" Elastic Calfskin · High Nonlinear Deflection Tension · Live Foot-Pedal Sweep',
    description: 'Configured for Bartók-style pedal glissandi and dramatic fortissimo pitch bloom. Move the Tension Pedal slider or Pitch Wheel while the membrane rings to glide pitch continuously.',
    defaultNote: 45, // A2
    params: buildParams({
      [SM.STRIKER_TYPE]: 0,
      [SM.STRIKER_HARDNESS]: 0.52,
      [SM.STRIKER_MASS]: 0.62,
      [SM.STRIKE_POS]: 0.66,
      [SM.HEAD_DIAMETER]: 0.72,
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.78,
      [SM.MEMBRANE_DAMP_HF]: 0.32,
      [SM.AIR_LOAD]: 0.90,
      [SM.TENSION_NONLIN]: 0.68, // dramatic deflection pitch bloom
      [SM.CAVITY_TYPE]: 0,
      [SM.CAVITY_VOLUME]: 0.74,
      [SM.CAVITY_COUPLING]: 0.78,
      [SM.SHELL_MATERIAL]: 1,
      [SM.SHELL_RESONANCE]: 0.60,
    }),
    macros: { strikePos: 0.52, hardness: 0.52, tension: 0.5, chamber: 0.68, shellBody: 0.60, hallSpace: 0.58 },
  },
  {
    id: 'timpani-staccato-wood',
    name: 'Baroque Hardwood Stick Timpani',
    category: 'timpani',
    origin: '18th-Century Cavalry & Baroque Kettle Drum',
    acoustics: '24" Thick Calfskin · Unwrapped Boxwood Beaters · Rim-Zone Strike (r/a = 74%)',
    description: 'Historical Baroque timpani struck with bare turned-wood beaters near the rim. Explosive, dry military crack and rich non-axisymmetric overtones.',
    defaultNote: 50, // D3
    params: buildParams({
      [SM.STRIKER_TYPE]: 4, // Curved Stick / Wood Beater
      [SM.STRIKER_HARDNESS]: 0.78,
      [SM.STRIKER_MASS]: 0.44,
      [SM.STRIKE_POS]: 0.74,
      [SM.HAND_BRUSH]: 0.18,
      [SM.HEAD_DIAMETER]: 0.60,
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.48,
      [SM.MEMBRANE_DAMP_HF]: 0.28,
      [SM.AIR_LOAD]: 0.85,
      [SM.TENSION_NONLIN]: 0.15,
      [SM.CAVITY_TYPE]: 0,
      [SM.CAVITY_VOLUME]: 0.58,
      [SM.CAVITY_COUPLING]: 0.64,
      [SM.SHELL_MATERIAL]: 1,
      [SM.SHELL_RESONANCE]: 0.64,
    }),
    macros: { strikePos: 0.62, hardness: 0.78, tension: 0.5, chamber: 0.55, shellBody: 0.64, hallSpace: 0.45 },
  },
  {
    id: 'timpani-cymbal-shell',
    name: 'Copper Bearing-Edge Resonator',
    category: 'timpani',
    origin: 'Extended Symphonic Percussion Technique',
    acoustics: 'Outer Bearing Edge Strike (r/a = 88%) · Maximum Hammered Copper Wall Modes',
    description: 'Struck right against the outer copper bearing edge where the (0,1) fundamental vanishes and the high-order (4,1)–(7,1) modes excite the hammered copper bowl directly.',
    defaultNote: 52, // E3
    params: buildParams({
      [SM.STRIKER_TYPE]: 4,
      [SM.STRIKER_HARDNESS]: 0.72,
      [SM.STRIKER_MASS]: 0.35,
      [SM.STRIKE_POS]: 0.88,
      [SM.HEAD_DIAMETER]: 0.68,
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.72,
      [SM.MEMBRANE_DAMP_HF]: 0.20,
      [SM.AIR_LOAD]: 0.82,
      [SM.CAVITY_TYPE]: 0,
      [SM.CAVITY_VOLUME]: 0.70,
      [SM.CAVITY_COUPLING]: 0.60,
      [SM.SHELL_MATERIAL]: 1,
      [SM.SHELL_RESONANCE]: 0.88,
      [SM.MIC_PERSPECTIVE]: 0.65,
    }),
    macros: { strikePos: 0.85, hardness: 0.72, tension: 0.5, chamber: 0.58, shellBody: 0.88, hallSpace: 0.60 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. WEST AFRICAN DRUMS (Carved Lenke Djembe, Talking Drum, Dundun, Batá)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'djembe-lenke-master',
    name: 'Carved Lenke Master Djembe (Open Tone)',
    category: 'west-african',
    origin: 'Mali / Guinea Mandinka Goblet Drum',
    acoustics: '13" Mali Goat Skin · Hand-Carved Lenke Hardwood Goblet · Helmholtz Throat Port',
    description: 'Authentic West African master djembe carved from dense Lenke hardwood. Striking with open fingers at r/a = 60% couples the singing (1,1) skin tone to the deep Helmholtz air plug in the goblet neck.',
    defaultNote: 55, // G3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1, // Open Hand
      [SM.STRIKER_HARDNESS]: 0.56,
      [SM.STRIKER_MASS]: 0.52,
      [SM.STRIKE_POS]: 0.60,
      [SM.VEL_HARDNESS]: 0.70,
      [SM.HAND_BRUSH]: 0.34,
      [SM.HEAD_DIAMETER]: 0.24, // ~13.2"
      [SM.SKIN_MATERIAL]: 1,    // Thick Goat Skin
      [SM.MEMBRANE_DECAY]: 0.44,
      [SM.MEMBRANE_DAMP_HF]: 0.40,
      [SM.AIR_LOAD]: 0.68,
      [SM.TENSION_NONLIN]: 0.34,
      [SM.KEYTRACK]: 0.85,
      [SM.CAVITY_TYPE]: 1,      // Goblet Helmholtz Neck
      [SM.CAVITY_VOLUME]: 0.64,
      [SM.CAVITY_COUPLING]: 0.84,
      [SM.PORT_TUNING]: 0.46,
      [SM.SHELL_MATERIAL]: 0,   // Carved Hardwood (Lenke)
      [SM.SHELL_RESONANCE]: 0.68,
      [SM.SHELL_WARMTH]: 0.45,
      [SM.MIC_PERSPECTIVE]: 0.52,
      [SM.ROOM_EARLY]: 0.32,
      [RV.SIZE]: 0.45,
      [RV.DECAY]: 0.35,
      [RV.MIX]: 0.16,
    }),
    macros: { strikePos: 0.5, hardness: 0.56, tension: 0.5, chamber: 0.78, shellBody: 0.68, hallSpace: 0.42 },
  },
  {
    id: 'djembe-slap-sega',
    name: 'Bamako Djembe Slap + Sega Rings',
    category: 'west-african',
    origin: 'Bamako Ceremonial Djembe with Kessing-Kessing / Sega Rattles',
    acoustics: 'High-Tension Goat Skin · Whipped Hand Slap (r/a = 76%) · Sympathetic Metal Sega Rings',
    description: 'Explosive West African djembe slap with traditional metal Sega rattle rings mounted around the tension crown. Cupped-hand impact damps (0,1) while firing razor-sharp (1,1)–(4,1) rim partials.',
    defaultNote: 60, // C4
    params: buildParams({
      [SM.STRIKER_TYPE]: 2, // Hand Slap / Pop
      [SM.STRIKER_HARDNESS]: 0.78,
      [SM.STRIKER_MASS]: 0.34,
      [SM.STRIKE_POS]: 0.76,
      [SM.VEL_HARDNESS]: 0.82,
      [SM.HAND_BRUSH]: 0.68,
      [SM.HEAD_DIAMETER]: 0.23,
      [SM.SKIN_MATERIAL]: 1,
      [SM.MEMBRANE_DECAY]: 0.38,
      [SM.MEMBRANE_DAMP_HF]: 0.26,
      [SM.AIR_LOAD]: 0.64,
      [SM.TENSION_NONLIN]: 0.38,
      [SM.BUZZ_AMOUNT]: 0.42, // Sega metal rattle rings
      [SM.KEYTRACK]: 0.80,
      [SM.CAVITY_TYPE]: 1,
      [SM.CAVITY_VOLUME]: 0.60,
      [SM.CAVITY_COUPLING]: 0.72,
      [SM.PORT_TUNING]: 0.55,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.74,
      [SM.SHELL_WARMTH]: 0.48,
      [SM.MIC_PERSPECTIVE]: 0.35,
    }),
    macros: { strikePos: 0.68, hardness: 0.78, tension: 0.5, chamber: 0.65, shellBody: 0.74, hallSpace: 0.38 },
  },
  {
    id: 'djembe-gun-bass',
    name: 'Djembe Deep Gun Bass (Center Hit)',
    category: 'west-african',
    origin: 'Mandinka Djembe Central Palm Strike',
    acoustics: 'Dead-Center Palm Impact (r/a = 10%) · Pure (0,1) Axisymmetric Mode → 62 Hz Helmholtz Port',
    description: 'Striking the djembe dead center with a flat relaxed palm nulls the upper dipole modes and drives the entire membrane like a piston into the goblet Helmholtz throat, producing a chest-rattling sub-bass "Gun" tone.',
    defaultNote: 43, // G2
    params: buildParams({
      [SM.STRIKER_TYPE]: 1, // Open Hand
      [SM.STRIKER_HARDNESS]: 0.32,
      [SM.STRIKER_MASS]: 0.82,
      [SM.STRIKE_POS]: 0.10, // Center of the head!
      [SM.VEL_HARDNESS]: 0.50,
      [SM.HAND_BRUSH]: 0.20,
      [SM.HEAD_DIAMETER]: 0.26,
      [SM.SKIN_MATERIAL]: 1,
      [SM.MEMBRANE_DECAY]: 0.52,
      [SM.MEMBRANE_DAMP_HF]: 0.58,
      [SM.AIR_LOAD]: 0.75,
      [SM.TENSION_NONLIN]: 0.46,
      [SM.KEYTRACK]: 0.75,
      [SM.CAVITY_TYPE]: 1,
      [SM.CAVITY_VOLUME]: 0.78,
      [SM.CAVITY_COUPLING]: 0.94,
      [SM.PORT_TUNING]: 0.32,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.62,
      [SM.SHELL_WARMTH]: 0.58,
      [SM.MIC_PERSPECTIVE]: 0.82, // Emphasize bottom Helmholtz port radiation!
    }),
    macros: { strikePos: 0.12, hardness: 0.34, tension: 0.5, chamber: 0.90, shellBody: 0.62, hallSpace: 0.40 },
  },
  {
    id: 'talking-drum-gangan',
    name: 'Yoruba GanGan Talking Drum',
    category: 'west-african',
    origin: 'Nigeria / Benin / Ghana Hourglass Tension Drum (Dùndún / Tamanin)',
    acoustics: 'Dual Opposing Thin Goat Skins · Hourglass Hardwood Waist · Curved Tamanin Stick + Live Cord Squeeze',
    description: 'West African hourglass talking drum with two opposing goat skins linked by leather tension cords. Strike and sweep the Tension Pedal / Mod Wheel / Pitch Bend to mimic the tonal contours of human speech in real time.',
    defaultNote: 53, // F3
    params: buildParams({
      [SM.STRIKER_TYPE]: 4, // Curved Stick (Tamanin)
      [SM.STRIKER_HARDNESS]: 0.64,
      [SM.STRIKER_MASS]: 0.45,
      [SM.STRIKE_POS]: 0.42,
      [SM.VEL_HARDNESS]: 0.68,
      [SM.HAND_BRUSH]: 0.22,
      [SM.HEAD_DIAMETER]: 0.14, // ~10"
      [SM.SKIN_MATERIAL]: 2,    // Thin Goat Skin
      [SM.MEMBRANE_DECAY]: 0.66,
      [SM.MEMBRANE_DAMP_HF]: 0.32,
      [SM.AIR_LOAD]: 0.72,
      [SM.TENSION_NONLIN]: 0.52,
      [SM.TENSION_PEDAL]: 0.5,
      [SM.KEYTRACK]: 1.0,
      [SM.CAVITY_TYPE]: 3,      // Hourglass Dual-Head
      [SM.CAVITY_VOLUME]: 0.52,
      [SM.CAVITY_COUPLING]: 0.88,
      [SM.PORT_TUNING]: 0.54,
      [SM.SHELL_MATERIAL]: 0,   // Carved Hardwood
      [SM.SHELL_RESONANCE]: 0.64,
      [SM.SHELL_WARMTH]: 0.42,
      [SM.MIC_PERSPECTIVE]: 0.54,
      [P.BEND_RANGE]: 12 / 24,  // +-12 semitones pitch bend for full talking-drum range
    }),
    macros: { strikePos: 0.42, hardness: 0.64, tension: 0.5, chamber: 0.82, shellBody: 0.64, hallSpace: 0.42 },
  },
  {
    id: 'dundun-dununba',
    name: 'Mande Dununba Bass Cylinder',
    category: 'west-african',
    origin: 'Upper Guinea / Mali Dual-Head Bass Drum',
    acoustics: '18" Thick Cow/Goat Skins · Carved Dugout Hardwood Cylinder · Heavy Stick',
    description: 'The largest drum of the West African Dundun family. A heavy wooden beater excites the top head, sending a low-frequency pressure wave down the hollowed log to drive the sympathetic bottom skin.',
    defaultNote: 40, // E2
    params: buildParams({
      [SM.STRIKER_TYPE]: 4,
      [SM.STRIKER_HARDNESS]: 0.58,
      [SM.STRIKER_MASS]: 0.74,
      [SM.STRIKE_POS]: 0.48,
      [SM.HEAD_DIAMETER]: 0.42, // ~18.6"
      [SM.SKIN_MATERIAL]: 4,    // Cowhide / Thick Rawhide
      [SM.MEMBRANE_DECAY]: 0.64,
      [SM.MEMBRANE_DAMP_HF]: 0.48,
      [SM.AIR_LOAD]: 0.80,
      [SM.TENSION_NONLIN]: 0.36,
      [SM.CAVITY_TYPE]: 3,      // Dual-Head coupled cylinder
      [SM.CAVITY_VOLUME]: 0.82,
      [SM.CAVITY_COUPLING]: 0.86,
      [SM.PORT_TUNING]: 0.42,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.72,
      [SM.SHELL_WARMTH]: 0.52,
      [SM.MIC_PERSPECTIVE]: 0.60,
    }),
    macros: { strikePos: 0.48, hardness: 0.58, tension: 0.5, chamber: 0.84, shellBody: 0.72, hallSpace: 0.46 },
  },
  {
    id: 'bata-iya-sacred',
    name: 'Yoruba Batá Iyá (Mother Drum)',
    category: 'west-african',
    origin: 'Nigeria / Cuba Bi-Conical Hourglass Drum',
    acoustics: 'Asymmetric Enu & Chachá Rawhide Heads · Tapered Hardwood Body · Chaworo Bell Rattle',
    description: 'The lead mother drum (Iyá) of the sacred Batá trio. Features a bi-conical hardwood chamber coupling a deep Enu bass head with a high-tension Chachá slap head and subtle bronze Chaworo rattle.',
    defaultNote: 50, // D3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.62,
      [SM.STRIKER_MASS]: 0.54,
      [SM.STRIKE_POS]: 0.58,
      [SM.HAND_BRUSH]: 0.38,
      [SM.HEAD_DIAMETER]: 0.22,
      [SM.SKIN_MATERIAL]: 3, // Rawhide
      [SM.MEMBRANE_DECAY]: 0.48,
      [SM.MEMBRANE_DAMP_HF]: 0.36,
      [SM.AIR_LOAD]: 0.70,
      [SM.TENSION_NONLIN]: 0.30,
      [SM.BUZZ_AMOUNT]: 0.18, // Chaworo rim bells/buzz
      [SM.CAVITY_TYPE]: 3,
      [SM.CAVITY_VOLUME]: 0.66,
      [SM.CAVITY_COUPLING]: 0.80,
      [SM.PORT_TUNING]: 0.68,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.70,
    }),
    macros: { strikePos: 0.56, hardness: 0.62, tension: 0.5, chamber: 0.76, shellBody: 0.70, hallSpace: 0.40 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AFRO-CUBAN STAVE DRUMS (Conga, Quinto, Tumba, Bongos)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'conga-habana-open',
    name: 'Havana Oak Stave Conga (Open Tone)',
    category: 'afro-cuban',
    origin: 'Havana / Matanzas Cuban Tumbadora',
    acoustics: '11.75" Thick Rawhide / Mule Skin · Tapered Bent Oak Stave Barrel · Open Bottom Port',
    description: 'Classic Cuban 11.75" conga drum played with an open four-finger strike near the rim crown. The tapered oak stave barrel reinforces the warm midrange wood formants and singing (1,1) fundamental.',
    defaultNote: 55, // G3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1, // Open Hand
      [SM.STRIKER_HARDNESS]: 0.54,
      [SM.STRIKER_MASS]: 0.56,
      [SM.STRIKE_POS]: 0.60,
      [SM.VEL_HARDNESS]: 0.66,
      [SM.HAND_BRUSH]: 0.28,
      [SM.HEAD_DIAMETER]: 0.19, // 11.7"
      [SM.SKIN_MATERIAL]: 3,    // Rawhide / Mule
      [SM.MEMBRANE_DECAY]: 0.46,
      [SM.MEMBRANE_DAMP_HF]: 0.48,
      [SM.AIR_LOAD]: 0.74,
      [SM.TENSION_NONLIN]: 0.26,
      [SM.KEYTRACK]: 0.90,
      [SM.CAVITY_TYPE]: 2,      // Tapered Stave Barrel
      [SM.CAVITY_VOLUME]: 0.68,
      [SM.CAVITY_COUPLING]: 0.78,
      [SM.PORT_TUNING]: 0.50,
      [SM.SHELL_MATERIAL]: 2,   // Bent Oak / Ash Staves
      [SM.SHELL_RESONANCE]: 0.66,
      [SM.SHELL_WARMTH]: 0.42,
      [SM.MIC_PERSPECTIVE]: 0.48,
    }),
    macros: { strikePos: 0.56, hardness: 0.54, tension: 0.5, chamber: 0.72, shellBody: 0.66, hallSpace: 0.38 },
  },
  {
    id: 'quinto-slap-sec',
    name: 'Solar Quinto Dry Slap (Galleta)',
    category: 'afro-cuban',
    origin: 'Cuban Rumba Guaguancó Lead Quinto',
    acoustics: '11" High-Tension Mule Skin · Cupped Hand Slap at r/a = 72% · Crisp Stave Reflection',
    description: 'High-pitched lead quinto tuned for rumba guaguancó solos. Cupped-hand slap articulation compresses a tiny air pocket against the rawhide, firing a gunshot-like woody crack.',
    defaultNote: 62, // D4
    params: buildParams({
      [SM.STRIKER_TYPE]: 2, // Hand Slap / Pop
      [SM.STRIKER_HARDNESS]: 0.80,
      [SM.STRIKER_MASS]: 0.36,
      [SM.STRIKE_POS]: 0.72,
      [SM.VEL_HARDNESS]: 0.80,
      [SM.HAND_BRUSH]: 0.64,
      [SM.HEAD_DIAMETER]: 0.17, // 11"
      [SM.SKIN_MATERIAL]: 3,
      [SM.MEMBRANE_DECAY]: 0.34,
      [SM.MEMBRANE_DAMP_HF]: 0.34,
      [SM.AIR_LOAD]: 0.68,
      [SM.TENSION_NONLIN]: 0.32,
      [SM.CAVITY_TYPE]: 2,
      [SM.CAVITY_VOLUME]: 0.58,
      [SM.CAVITY_COUPLING]: 0.72,
      [SM.PORT_TUNING]: 0.58,
      [SM.SHELL_MATERIAL]: 2,
      [SM.SHELL_RESONANCE]: 0.72,
      [SM.SHELL_WARMTH]: 0.46,
      [SM.MIC_PERSPECTIVE]: 0.34,
    }),
    macros: { strikePos: 0.68, hardness: 0.80, tension: 0.5, chamber: 0.64, shellBody: 0.72, hallSpace: 0.34 },
  },
  {
    id: 'tumba-palma-bass',
    name: '12.5" Tumba Deep Palm Bass',
    category: 'afro-cuban',
    origin: 'Afro-Cuban Low Tumbadora / Salidor',
    acoustics: '12.5" Buffalo Rawhide · Wide Belly Oak Barrel · Center Palm Strike (r/a = 18%)',
    description: 'Deep 12.5" tumba struck near the center of the head with a full palm. Excites the fundamental (0,1) mode and pumps warm 65 Hz quarter-wave air out the bottom of the oak barrel.',
    defaultNote: 45, // A2
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.36,
      [SM.STRIKER_MASS]: 0.78,
      [SM.STRIKE_POS]: 0.18,
      [SM.HAND_BRUSH]: 0.22,
      [SM.HEAD_DIAMETER]: 0.22, // 12.6"
      [SM.SKIN_MATERIAL]: 3,
      [SM.MEMBRANE_DECAY]: 0.54,
      [SM.MEMBRANE_DAMP_HF]: 0.56,
      [SM.AIR_LOAD]: 0.78,
      [SM.TENSION_NONLIN]: 0.38,
      [SM.CAVITY_TYPE]: 2,
      [SM.CAVITY_VOLUME]: 0.78,
      [SM.CAVITY_COUPLING]: 0.88,
      [SM.PORT_TUNING]: 0.38,
      [SM.SHELL_MATERIAL]: 2,
      [SM.SHELL_RESONANCE]: 0.68,
      [SM.SHELL_WARMTH]: 0.52,
      [SM.MIC_PERSPECTIVE]: 0.74,
    }),
    macros: { strikePos: 0.18, hardness: 0.36, tension: 0.5, chamber: 0.85, shellBody: 0.68, hallSpace: 0.40 },
  },
  {
    id: 'conga-muff-quemado',
    name: 'Muted Conga Quemado (Pressed Palm)',
    category: 'afro-cuban',
    origin: 'Son Montuno / Salsa Tumbao Articulation',
    acoustics: 'Pressed-Hand Post-Strike Contact Damping · Stiffened Rawhide Pitch Shift',
    description: 'Models the essential "toned muff" / quemado stroke where the hand stays pressed into the skin after impact, absorbing sustain energy and raising effective membrane stiffness.',
    defaultNote: 57, // A3
    params: buildParams({
      [SM.STRIKER_TYPE]: 3, // Muted / Pressed Hand
      [SM.STRIKER_HARDNESS]: 0.62,
      [SM.STRIKER_MASS]: 0.64,
      [SM.STRIKE_POS]: 0.52,
      [SM.HAND_BRUSH]: 0.36,
      [SM.HEAD_DIAMETER]: 0.19,
      [SM.SKIN_MATERIAL]: 3,
      [SM.MEMBRANE_DECAY]: 0.32,
      [SM.MEMBRANE_DAMP_HF]: 0.52,
      [SM.AIR_LOAD]: 0.72,
      [SM.TENSION_NONLIN]: 0.24,
      [SM.CAVITY_TYPE]: 2,
      [SM.CAVITY_VOLUME]: 0.66,
      [SM.CAVITY_COUPLING]: 0.68,
      [SM.SHELL_MATERIAL]: 2,
      [SM.SHELL_RESONANCE]: 0.58,
    }),
    macros: { strikePos: 0.52, hardness: 0.62, tension: 0.5, chamber: 0.62, shellBody: 0.58, hallSpace: 0.32 },
  },
  {
    id: 'bongo-macho-martillo',
    name: 'Bongo Macho (Martillo Rim Snap)',
    category: 'afro-cuban',
    origin: 'Oriente de Cuba Son Bongo (7" Macho)',
    acoustics: '7" Tightly Cranked Rawhide · Shallow Mahogany Hoop · Index Finger Rim Strike (r/a = 80%)',
    description: 'The small 7" high-pitched macho head of Cuban bongos. Played at the bearing edge with snapping fingertips, exciting bright multipole modes over a shallow open mahogany shell.',
    defaultNote: 67, // G4
    params: buildParams({
      [SM.STRIKER_TYPE]: 5, // Finger / Rim
      [SM.STRIKER_HARDNESS]: 0.76,
      [SM.STRIKER_MASS]: 0.28,
      [SM.STRIKE_POS]: 0.80,
      [SM.HAND_BRUSH]: 0.42,
      [SM.HEAD_DIAMETER]: 0.04, // ~7.2"
      [SM.SKIN_MATERIAL]: 3,
      [SM.MEMBRANE_DECAY]: 0.28,
      [SM.MEMBRANE_DAMP_HF]: 0.30,
      [SM.AIR_LOAD]: 0.55,
      [SM.TENSION_NONLIN]: 0.22,
      [SM.CAVITY_TYPE]: 5,      // Open Hoop / Shallow Frame
      [SM.CAVITY_VOLUME]: 0.24,
      [SM.CAVITY_COUPLING]: 0.48,
      [SM.SHELL_MATERIAL]: 0,   // Carved Mahogany/Hardwood
      [SM.SHELL_RESONANCE]: 0.68,
      [SM.MIC_PERSPECTIVE]: 0.32,
    }),
    macros: { strikePos: 0.76, hardness: 0.76, tension: 0.5, chamber: 0.45, shellBody: 0.68, hallSpace: 0.34 },
  },
  {
    id: 'bongo-hembra-open',
    name: 'Bongo Hembra (Warm Open Tone)',
    category: 'afro-cuban',
    origin: 'Oriente de Cuba Son Bongo (8.5" Hembra)',
    acoustics: '8.5" Calf/Mule Skin · Tapered Cedar Hoop · Two-Finger Open Stroke',
    description: 'The larger 8.5" hembra bongo head with warm woody midrange projection and lively pitch deflection when struck hard.',
    defaultNote: 60, // C4
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.60,
      [SM.STRIKER_MASS]: 0.38,
      [SM.STRIKE_POS]: 0.64,
      [SM.HAND_BRUSH]: 0.32,
      [SM.HEAD_DIAMETER]: 0.08, // ~8.4"
      [SM.SKIN_MATERIAL]: 0,    // Calfskin
      [SM.MEMBRANE_DECAY]: 0.36,
      [SM.MEMBRANE_DAMP_HF]: 0.36,
      [SM.AIR_LOAD]: 0.60,
      [SM.TENSION_NONLIN]: 0.32,
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.30,
      [SM.CAVITY_COUPLING]: 0.56,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.64,
    }),
    macros: { strikePos: 0.62, hardness: 0.60, tension: 0.5, chamber: 0.54, shellBody: 0.64, hallSpace: 0.36 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. TAIKO & CONCERT HALL PERCUSSION (Nagado-Daiko, Gran Cassa, Field Snare)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'nagado-daiko-odaiko',
    name: 'O-Daiko Temple Barrel Drum',
    category: 'taiko-concert',
    origin: 'Japanese Festival & Temple Nagado-Daiko',
    acoustics: '34" Heavy Cowhide Heads · Hollowed Keyaki Barrel · Hardwood Bachi Sticks',
    description: 'Massive Japanese Nagado-Daiko barrel drum. Thick cowhide tacked over a hollowed Keyaki wood chamber compresses a huge internal air column against the opposing resonant skin, producing seismic low-end bloom.',
    defaultNote: 38, // D2
    params: buildParams({
      [SM.STRIKER_TYPE]: 4, // Curved Stick / Hardwood Bachi
      [SM.STRIKER_HARDNESS]: 0.66,
      [SM.STRIKER_MASS]: 0.78,
      [SM.STRIKE_POS]: 0.44,
      [SM.VEL_HARDNESS]: 0.76,
      [SM.HAND_BRUSH]: 0.20,
      [SM.HEAD_DIAMETER]: 0.92, // ~33.6"
      [SM.SKIN_MATERIAL]: 4,    // Heavy Cowhide
      [SM.MEMBRANE_DECAY]: 0.74,
      [SM.MEMBRANE_DAMP_HF]: 0.42,
      [SM.AIR_LOAD]: 0.88,
      [SM.TENSION_NONLIN]: 0.48,
      [SM.CAVITY_TYPE]: 4,      // Deep Taiko Dual-Head Barrel
      [SM.CAVITY_VOLUME]: 0.90,
      [SM.CAVITY_COUPLING]: 0.92,
      [SM.PORT_TUNING]: 0.46,
      [SM.SHELL_MATERIAL]: 2,   // Oak / Keyaki Barrel
      [SM.SHELL_RESONANCE]: 0.76,
      [SM.SHELL_WARMTH]: 0.56,
      [SM.MIC_PERSPECTIVE]: 0.58,
      [SM.ROOM_EARLY]: 0.42,
      [RV.SIZE]: 0.82,
      [RV.DECAY]: 0.64,
      [RV.MIX]: 0.28,
    }),
    macros: { strikePos: 0.44, hardness: 0.66, tension: 0.5, chamber: 0.88, shellBody: 0.76, hallSpace: 0.64 },
  },
  {
    id: 'shime-daiko-tense',
    name: 'Shime-Daiko Rope-Tensioned Drum',
    category: 'taiko-concert',
    origin: 'Japanese Noh & Kabuki Ensemble Taiko',
    acoustics: '14" High-Tension Corded Cowhide · Shallow Keyaki Ring · Bachi Stick Crack',
    description: 'High-pitched rope-tensioned Shime-Daiko. Extremely taut cowhide skin struck with hardwood bachi sticks delivers razor-sharp rhythmic precision.',
    defaultNote: 62, // D4
    params: buildParams({
      [SM.STRIKER_TYPE]: 4,
      [SM.STRIKER_HARDNESS]: 0.84,
      [SM.STRIKER_MASS]: 0.46,
      [SM.STRIKE_POS]: 0.52,
      [SM.HEAD_DIAMETER]: 0.27, // ~14"
      [SM.SKIN_MATERIAL]: 4,
      [SM.MEMBRANE_DECAY]: 0.36,
      [SM.MEMBRANE_DAMP_HF]: 0.26,
      [SM.AIR_LOAD]: 0.62,
      [SM.TENSION_NONLIN]: 0.22,
      [SM.CAVITY_TYPE]: 3,
      [SM.CAVITY_VOLUME]: 0.36,
      [SM.CAVITY_COUPLING]: 0.72,
      [SM.PORT_TUNING]: 0.66,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.70,
    }),
    macros: { strikePos: 0.52, hardness: 0.84, tension: 0.5, chamber: 0.62, shellBody: 0.70, hallSpace: 0.44 },
  },
  {
    id: 'concert-gran-cassa',
    name: 'Symphonic 36" Gran Cassa',
    category: 'taiko-concert',
    origin: 'Orchestral Concert Bass Drum (Verdi / Stravinsky)',
    acoustics: '36" Loose Calfskin Heads · Deep Birch/Mahogany Shell · Heavy Lambswool Beater',
    description: 'Full-scale 36" orchestral Gran Cassa. A heavy lambswool beater excites both loosely tensioned calfskin heads across a massive air volume, filling the concert hall with tectonic sub-bass.',
    defaultNote: 36, // C2
    params: buildParams({
      [SM.STRIKER_TYPE]: 0, // Felt/Wool Mallet
      [SM.STRIKER_HARDNESS]: 0.24,
      [SM.STRIKER_MASS]: 0.88,
      [SM.STRIKE_POS]: 0.42,
      [SM.VEL_HARDNESS]: 0.64,
      [SM.HEAD_DIAMETER]: 1.0,  // 36"
      [SM.SKIN_MATERIAL]: 0,    // Calfskin
      [SM.MEMBRANE_DECAY]: 0.84,
      [SM.MEMBRANE_DAMP_HF]: 0.54,
      [SM.AIR_LOAD]: 0.94,
      [SM.TENSION_NONLIN]: 0.36,
      [SM.CAVITY_TYPE]: 4,      // Deep Dual-Head Concert Barrel
      [SM.CAVITY_VOLUME]: 0.96,
      [SM.CAVITY_COUPLING]: 0.90,
      [SM.PORT_TUNING]: 0.34,
      [SM.SHELL_MATERIAL]: 4,   // Birch/Maple Ply Shell
      [SM.SHELL_RESONANCE]: 0.64,
      [SM.SHELL_WARMTH]: 0.52,
      [SM.MIC_PERSPECTIVE]: 0.64,
      [SM.ROOM_EARLY]: 0.46,
      [RV.SIZE]: 0.88,
      [RV.DECAY]: 0.70,
      [RV.MIX]: 0.32,
    }),
    macros: { strikePos: 0.42, hardness: 0.26, tension: 0.5, chamber: 0.92, shellBody: 0.64, hallSpace: 0.72 },
  },
  {
    id: 'orchestral-field-snare',
    name: 'Orchestral Concert Snare (Gut Wires)',
    category: 'taiko-concert',
    origin: 'Symphonic & Military Field Drum',
    acoustics: '14" Coated Batter Head · Birch Ply Shell · Sympathetic Gut Snare Wires',
    description: 'Concert snare drum with physical gut/wire snare coupling against the resonant head. Strike near the center for fat orchestral body or near the rim for crisp rudimental buzz.',
    defaultNote: 58, // Bb3
    params: buildParams({
      [SM.STRIKER_TYPE]: 4, // Stick
      [SM.STRIKER_HARDNESS]: 0.78,
      [SM.STRIKER_MASS]: 0.36,
      [SM.STRIKE_POS]: 0.54,
      [SM.HAND_BRUSH]: 0.48,
      [SM.HEAD_DIAMETER]: 0.27, // 14"
      [SM.SKIN_MATERIAL]: 5,    // Mylar / Coated Film
      [SM.MEMBRANE_DECAY]: 0.38,
      [SM.MEMBRANE_DAMP_HF]: 0.32,
      [SM.AIR_LOAD]: 0.66,
      [SM.TENSION_NONLIN]: 0.18,
      [SM.BUZZ_AMOUNT]: 0.76,   // Snare wires active!
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.42,
      [SM.CAVITY_COUPLING]: 0.68,
      [SM.SHELL_MATERIAL]: 4,   // Birch/Maple Ply
      [SM.SHELL_RESONANCE]: 0.62,
    }),
    macros: { strikePos: 0.54, hardness: 0.78, tension: 0.5, chamber: 0.62, shellBody: 0.62, hallSpace: 0.44 },
  },
  {
    id: 'concert-tom-mahogany',
    name: 'Symphonic Mahogany Concert Tom',
    category: 'taiko-concert',
    origin: 'Studio & Orchestral Single-Headed Concert Tom',
    acoustics: '16" Calf/Mylar Membrane · Open-Bottom Mahogany Cylinder · Felt/Stick Mallet',
    description: 'Rich, melodic 16" open-bottom mahogany concert tom. The open cylindrical chamber projects a clean fundamental and warm wooden shell formants.',
    defaultNote: 48, // C3
    params: buildParams({
      [SM.STRIKER_TYPE]: 0,
      [SM.STRIKER_HARDNESS]: 0.58,
      [SM.STRIKER_MASS]: 0.48,
      [SM.STRIKE_POS]: 0.56,
      [SM.HEAD_DIAMETER]: 0.33, // 16"
      [SM.SKIN_MATERIAL]: 5,
      [SM.MEMBRANE_DECAY]: 0.54,
      [SM.MEMBRANE_DAMP_HF]: 0.36,
      [SM.AIR_LOAD]: 0.74,
      [SM.TENSION_NONLIN]: 0.24,
      [SM.CAVITY_TYPE]: 2,
      [SM.CAVITY_VOLUME]: 0.58,
      [SM.CAVITY_COUPLING]: 0.74,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.60,
    }),
    macros: { strikePos: 0.56, hardness: 0.58, tension: 0.5, chamber: 0.68, shellBody: 0.60, hallSpace: 0.46 },
  },
  {
    id: 'gong-drum-boobam',
    name: '22" Deep Chamber Gong Drum',
    category: 'taiko-concert',
    origin: '20th-Century Orchestral Gong Drum / Octoban Tube',
    acoustics: '22" Overhung Calfskin · Long Stave Resonator Tube · Pronounced Pitch Glide',
    description: 'Single-headed 22" gong drum coupled to a deep acoustic tube resonator, delivering a thunderous attack with a singing low-end air column.',
    defaultNote: 42, // F#2
    params: buildParams({
      [SM.STRIKER_TYPE]: 0,
      [SM.STRIKER_HARDNESS]: 0.48,
      [SM.STRIKER_MASS]: 0.68,
      [SM.STRIKE_POS]: 0.48,
      [SM.HEAD_DIAMETER]: 0.53, // 22"
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.68,
      [SM.MEMBRANE_DAMP_HF]: 0.40,
      [SM.AIR_LOAD]: 0.82,
      [SM.TENSION_NONLIN]: 0.42,
      [SM.CAVITY_TYPE]: 1,
      [SM.CAVITY_VOLUME]: 0.84,
      [SM.CAVITY_COUPLING]: 0.88,
      [SM.PORT_TUNING]: 0.40,
      [SM.SHELL_MATERIAL]: 2,
      [SM.SHELL_RESONANCE]: 0.66,
    }),
    macros: { strikePos: 0.48, hardness: 0.48, tension: 0.5, chamber: 0.84, shellBody: 0.66, hallSpace: 0.54 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. GOBLET, CERAMIC & HARMONIC HAND DRUMS (Darbuka, Tabla, Mridangam, Udu)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'darbuka-cairo-doum',
    name: 'Cairo Clay Darbuka (Doum Bass)',
    category: 'middle-eastern-india',
    origin: 'Egyptian Nile-Clay Tabla / Goblet Drum',
    acoustics: '9" Thin Goat/Fish Skin · Fired Ceramic Goblet · Central Doum Strike',
    description: 'Traditional Egyptian fired-clay darbuka. Striking near the center ("Doum") couples the thin membrane to the ceramic goblet throat, producing a remarkably deep, round bass pulse from a compact shell.',
    defaultNote: 48, // C3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.52,
      [SM.STRIKER_MASS]: 0.50,
      [SM.STRIKE_POS]: 0.24,
      [SM.HAND_BRUSH]: 0.26,
      [SM.HEAD_DIAMETER]: 0.10, // 9"
      [SM.SKIN_MATERIAL]: 2,    // Thin Goat Skin
      [SM.MEMBRANE_DECAY]: 0.52,
      [SM.MEMBRANE_DAMP_HF]: 0.34,
      [SM.AIR_LOAD]: 0.72,
      [SM.TENSION_NONLIN]: 0.36,
      [SM.CAVITY_TYPE]: 1,      // Goblet Helmholtz Neck
      [SM.CAVITY_VOLUME]: 0.54,
      [SM.CAVITY_COUPLING]: 0.90,
      [SM.PORT_TUNING]: 0.38,
      [SM.SHELL_MATERIAL]: 3,   // Fired Clay / Ceramic
      [SM.SHELL_RESONANCE]: 0.72,
      [SM.MIC_PERSPECTIVE]: 0.62,
    }),
    macros: { strikePos: 0.24, hardness: 0.52, tension: 0.5, chamber: 0.85, shellBody: 0.72, hallSpace: 0.42 },
  },
  {
    id: 'darbuka-tek-ka',
    name: 'Istanbul Copper Darbuka (Tek / Ka Rim)',
    category: 'middle-eastern-india',
    origin: 'Turkish Spun-Copper Goblet Doumbek',
    acoustics: '8.75" Mylar/Goat Head · Rounded Copper Bearing Edge · Fingertip Rim Snap (r/a = 84%)',
    description: 'Turkish copper darbuka struck at the outer rounded rim with a single ring finger ("Tek" / "Ka"). Produces the unmistakable crystalline metallic ring of Anatolian percussion.',
    defaultNote: 64, // E4
    params: buildParams({
      [SM.STRIKER_TYPE]: 5, // Finger / Rim
      [SM.STRIKER_HARDNESS]: 0.82,
      [SM.STRIKER_MASS]: 0.22,
      [SM.STRIKE_POS]: 0.84,
      [SM.HAND_BRUSH]: 0.38,
      [SM.HEAD_DIAMETER]: 0.09,
      [SM.SKIN_MATERIAL]: 5, // Mylar
      [SM.MEMBRANE_DECAY]: 0.46,
      [SM.MEMBRANE_DAMP_HF]: 0.18,
      [SM.AIR_LOAD]: 0.64,
      [SM.TENSION_NONLIN]: 0.18,
      [SM.CAVITY_TYPE]: 1,
      [SM.CAVITY_VOLUME]: 0.46,
      [SM.CAVITY_COUPLING]: 0.68,
      [SM.PORT_TUNING]: 0.62,
      [SM.SHELL_MATERIAL]: 1, // Copper
      [SM.SHELL_RESONANCE]: 0.82,
      [SM.MIC_PERSPECTIVE]: 0.36,
    }),
    macros: { strikePos: 0.82, hardness: 0.82, tension: 0.5, chamber: 0.62, shellBody: 0.82, hallSpace: 0.44 },
  },
  {
    id: 'tabla-dayan-na',
    name: 'Benares Sheesham Dayan (Harmonic Rim)',
    category: 'middle-eastern-india',
    origin: 'North Indian Classical Tabla (Right-Hand Timber Shell)',
    acoustics: '5.5" Goat Skin with Central Syahi Mass Load · Sealed Rosewood Cavity · Harmonic Partials',
    description: 'Models the acoustic miracle of the Indian Tabla Dayan: central Syahi iron-paste loading and a sealed Sheesham hardwood cavity shift the circular membrane modes into bell-like harmonic overtones.',
    defaultNote: 62, // D4
    params: buildParams({
      [SM.STRIKER_TYPE]: 5, // Finger / Rim ("Na" / "Tin")
      [SM.STRIKER_HARDNESS]: 0.74,
      [SM.STRIKER_MASS]: 0.30,
      [SM.STRIKE_POS]: 0.68,
      [SM.HAND_BRUSH]: 0.16,
      [SM.HEAD_DIAMETER]: 0.02, // ~6.5"
      [SM.SKIN_MATERIAL]: 2,    // Thin Goat Skin
      [SM.MEMBRANE_DECAY]: 0.68,
      [SM.MEMBRANE_DAMP_HF]: 0.22,
      [SM.AIR_LOAD]: 0.98,      // Syahi + closed cavity harmonic alignment
      [SM.TENSION_NONLIN]: 0.12,
      [SM.KEYTRACK]: 1.0,
      [SM.CAVITY_TYPE]: 0,      // Sealed Cavity
      [SM.CAVITY_VOLUME]: 0.38,
      [SM.CAVITY_COUPLING]: 0.72,
      [SM.SHELL_MATERIAL]: 0,   // Dense Sheesham Hardwood
      [SM.SHELL_RESONANCE]: 0.66,
    }),
    macros: { strikePos: 0.66, hardness: 0.74, tension: 0.5, chamber: 0.68, shellBody: 0.66, hallSpace: 0.42 },
  },
  {
    id: 'mridangam-carnatic',
    name: 'Carnatic Jackwood Mridangam',
    category: 'middle-eastern-india',
    origin: 'South Indian Classical Double-Conical Barrel Drum',
    acoustics: 'Hollowed Jackwood Barrel · Harmonic Weighted Skin · Coupled Bass & Treble Heads',
    description: 'South Indian classical Mridangam carved from jackfruit wood. Combines harmonic membrane tuning with a resonant dual-head wooden barrel.',
    defaultNote: 55, // G3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.68,
      [SM.STRIKER_MASS]: 0.42,
      [SM.STRIKE_POS]: 0.62,
      [SM.HEAD_DIAMETER]: 0.12,
      [SM.SKIN_MATERIAL]: 1,
      [SM.MEMBRANE_DECAY]: 0.62,
      [SM.MEMBRANE_DAMP_HF]: 0.28,
      [SM.AIR_LOAD]: 0.92,
      [SM.TENSION_NONLIN]: 0.22,
      [SM.CAVITY_TYPE]: 3,
      [SM.CAVITY_VOLUME]: 0.62,
      [SM.CAVITY_COUPLING]: 0.82,
      [SM.PORT_TUNING]: 0.52,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.74,
    }),
    macros: { strikePos: 0.60, hardness: 0.68, tension: 0.5, chamber: 0.78, shellBody: 0.74, hallSpace: 0.44 },
  },
  {
    id: 'daf-persian-rings',
    name: 'Persian Daf Frame Drum (Chain Rings)',
    category: 'middle-eastern-india',
    origin: 'Kurdish / Persian Sufi Frame Drum',
    acoustics: '20" Goat Skin · Hardwood Hoop · Internal Metal Halqeh Chain Rings',
    description: 'Large Persian Daf frame drum lined inside the wooden rim with hundreds of tiny metal rings that erupt in a silvery wave when the membrane is struck violently.',
    defaultNote: 50, // D3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.60,
      [SM.STRIKER_MASS]: 0.48,
      [SM.STRIKE_POS]: 0.58,
      [SM.HAND_BRUSH]: 0.36,
      [SM.HEAD_DIAMETER]: 0.46, // 20"
      [SM.SKIN_MATERIAL]: 2,
      [SM.MEMBRANE_DECAY]: 0.54,
      [SM.MEMBRANE_DAMP_HF]: 0.32,
      [SM.AIR_LOAD]: 0.62,
      [SM.TENSION_NONLIN]: 0.34,
      [SM.BUZZ_AMOUNT]: 0.58,   // Internal chain rings
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.32,
      [SM.CAVITY_COUPLING]: 0.52,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.60,
    }),
    macros: { strikePos: 0.58, hardness: 0.60, tension: 0.5, chamber: 0.52, shellBody: 0.60, hallSpace: 0.48 },
  },
  {
    id: 'udu-igbo-clay',
    name: 'Igbo Fired Clay Udu Vessel',
    category: 'middle-eastern-india',
    origin: 'Southeastern Nigeria Ceramic Water-Jug Drum',
    acoustics: 'Spherical Fired Clay Chamber · Direct Hand-Palm Helmholtz Neck Excitation',
    description: 'Models the liquid sub-bass air pop of the Nigerian Igbo Udu pot coupled with crisp ceramic shell wall resonances.',
    defaultNote: 45, // A2
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.42,
      [SM.STRIKER_MASS]: 0.68,
      [SM.STRIKE_POS]: 0.14,
      [SM.HAND_BRUSH]: 0.30,
      [SM.HEAD_DIAMETER]: 0.18,
      [SM.SKIN_MATERIAL]: 2,
      [SM.MEMBRANE_DECAY]: 0.56,
      [SM.MEMBRANE_DAMP_HF]: 0.44,
      [SM.AIR_LOAD]: 0.86,
      [SM.TENSION_NONLIN]: 0.58,
      [SM.CAVITY_TYPE]: 1,      // Helmholtz neck resonator
      [SM.CAVITY_VOLUME]: 0.72,
      [SM.CAVITY_COUPLING]: 0.96,
      [SM.PORT_TUNING]: 0.36,
      [SM.SHELL_MATERIAL]: 3,   // Fired Clay / Ceramic
      [SM.SHELL_RESONANCE]: 0.84,
      [SM.MIC_PERSPECTIVE]: 0.76,
    }),
    macros: { strikePos: 0.16, hardness: 0.42, tension: 0.5, chamber: 0.92, shellBody: 0.84, hallSpace: 0.50 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. FRAME DRUMS & ANCIENT MEMBRANOPHONES (Bodhrán, Bendir, Tar, Kanjira)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'bodhran-kerry-tipper',
    name: 'Kerry Goatskin Bodhrán (Tipper)',
    category: 'frame-ancient',
    origin: 'Irish Traditional 18" Steamed-Ash Frame Drum',
    acoustics: '18" Heavy Goat Skin · Open Ash Hoop · Hardwood Cipín Beater + Back-Hand Pitch Modulation',
    description: 'Traditional Irish 18" Bodhrán struck with a double-ended wooden tipper (Cipín). Use the Tension Pedal / Mod Wheel to press the back hand into the skin for melodic Celtic bass lines.',
    defaultNote: 47, // B2
    params: buildParams({
      [SM.STRIKER_TYPE]: 4, // Wooden Cipín Tipper
      [SM.STRIKER_HARDNESS]: 0.56,
      [SM.STRIKER_MASS]: 0.52,
      [SM.STRIKE_POS]: 0.52,
      [SM.HAND_BRUSH]: 0.28,
      [SM.HEAD_DIAMETER]: 0.40, // 18"
      [SM.SKIN_MATERIAL]: 1,    // Thick Goat Skin
      [SM.MEMBRANE_DECAY]: 0.50,
      [SM.MEMBRANE_DAMP_HF]: 0.44,
      [SM.AIR_LOAD]: 0.68,
      [SM.TENSION_NONLIN]: 0.34,
      [SM.CAVITY_TYPE]: 5,      // Open Hoop
      [SM.CAVITY_VOLUME]: 0.34,
      [SM.CAVITY_COUPLING]: 0.54,
      [SM.SHELL_MATERIAL]: 2,   // Steamed Ash
      [SM.SHELL_RESONANCE]: 0.62,
      [SM.SHELL_WARMTH]: 0.40,
    }),
    macros: { strikePos: 0.52, hardness: 0.56, tension: 0.5, chamber: 0.54, shellBody: 0.62, hallSpace: 0.44 },
  },
  {
    id: 'bendir-atlas-gut',
    name: 'Moroccan Atlas Bendir (Gut Snare)',
    category: 'frame-ancient',
    origin: 'Amazigh / North African Snared Frame Drum',
    acoustics: '16" Stretched Goat Skin · Hardwood Frame · Underside Gut Snare Strings',
    description: 'North African Bendir with two gut strings stretched tightly across the underside of the goat skin, adding a warm, earthy desert buzz to every stroke.',
    defaultNote: 50, // D3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.58,
      [SM.STRIKER_MASS]: 0.46,
      [SM.STRIKE_POS]: 0.58,
      [SM.HAND_BRUSH]: 0.32,
      [SM.HEAD_DIAMETER]: 0.34, // 16"
      [SM.SKIN_MATERIAL]: 1,
      [SM.MEMBRANE_DECAY]: 0.48,
      [SM.MEMBRANE_DAMP_HF]: 0.36,
      [SM.AIR_LOAD]: 0.64,
      [SM.TENSION_NONLIN]: 0.28,
      [SM.BUZZ_AMOUNT]: 0.64,   // Gut snare strings
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.30,
      [SM.CAVITY_COUPLING]: 0.50,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.58,
    }),
    macros: { strikePos: 0.58, hardness: 0.58, tension: 0.5, chamber: 0.50, shellBody: 0.58, hallSpace: 0.46 },
  },
  {
    id: 'tar-nubian-deep',
    name: '22" Nubian Tar Frame Drum',
    category: 'frame-ancient',
    origin: 'Upper Egypt / Sudan / Arabian Peninsula Frame Drum',
    acoustics: '22" Calfskin Vellum · Shallow Cedar Hoop · Deep Axisymmetric Dum & Rim Tak',
    description: 'Large 22" Tar frame drum with long, resonant low-frequency sustain. Strike near the center for a deep meditative "Dum" or drag to the outer edge for a woody "Tak".',
    defaultNote: 45, // A2
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.46,
      [SM.STRIKER_MASS]: 0.60,
      [SM.STRIKE_POS]: 0.38,
      [SM.HAND_BRUSH]: 0.24,
      [SM.HEAD_DIAMETER]: 0.54, // 22"
      [SM.SKIN_MATERIAL]: 0,    // Calfskin
      [SM.MEMBRANE_DECAY]: 0.66,
      [SM.MEMBRANE_DAMP_HF]: 0.38,
      [SM.AIR_LOAD]: 0.72,
      [SM.TENSION_NONLIN]: 0.26,
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.36,
      [SM.CAVITY_COUPLING]: 0.58,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.62,
    }),
    macros: { strikePos: 0.38, hardness: 0.46, tension: 0.5, chamber: 0.56, shellBody: 0.62, hallSpace: 0.52 },
  },
  {
    id: 'shamanic-cedar-beater',
    name: '24" Cedar Hoop & Buckskin Beater',
    category: 'frame-ancient',
    origin: 'Pacific Northwest / Circumpolar Frame Drum',
    acoustics: '24" Elk/Deer Rawhide · Steam-Bent Red Cedar Hoop · Soft Buckskin Mallet',
    description: 'Wide 24" rawhide frame drum struck with a soft buckskin-padded beater. Produces a warm, enveloping pulse with slow dipole beating across the circular head.',
    defaultNote: 43, // G2
    params: buildParams({
      [SM.STRIKER_TYPE]: 0, // Soft Beater
      [SM.STRIKER_HARDNESS]: 0.34,
      [SM.STRIKER_MASS]: 0.68,
      [SM.STRIKE_POS]: 0.34,
      [SM.HAND_BRUSH]: 0.18,
      [SM.HEAD_DIAMETER]: 0.60, // 24"
      [SM.SKIN_MATERIAL]: 3,    // Rawhide
      [SM.MEMBRANE_DECAY]: 0.72,
      [SM.MEMBRANE_DAMP_HF]: 0.46,
      [SM.AIR_LOAD]: 0.76,
      [SM.TENSION_NONLIN]: 0.32,
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.40,
      [SM.CAVITY_COUPLING]: 0.62,
      [SM.SHELL_MATERIAL]: 2,
      [SM.SHELL_RESONANCE]: 0.66,
      [RV.SIZE]: 0.76,
      [RV.DECAY]: 0.58,
      [RV.MIX]: 0.28,
    }),
    macros: { strikePos: 0.34, hardness: 0.34, tension: 0.5, chamber: 0.60, shellBody: 0.66, hallSpace: 0.62 },
  },
  {
    id: 'kanjira-lizard-frame',
    name: 'South Indian Kanjira (Pitch Bend)',
    category: 'frame-ancient',
    origin: 'Tamil Nadu Carnatic 7" Jackwood Frame Drum',
    acoustics: '7" Flexible Skin · High Deflection Pitch Glissando · Single Brass Coin Jingle',
    description: 'Small, ultra-expressive Carnatic Kanjira frame drum. Dampened with water so the skin has huge nonlinear pitch deflection and responds dramatically to finger pressure.',
    defaultNote: 55, // G3
    params: buildParams({
      [SM.STRIKER_TYPE]: 5,
      [SM.STRIKER_HARDNESS]: 0.68,
      [SM.STRIKER_MASS]: 0.36,
      [SM.STRIKE_POS]: 0.56,
      [SM.HEAD_DIAMETER]: 0.04, // 7"
      [SM.SKIN_MATERIAL]: 2,
      [SM.MEMBRANE_DECAY]: 0.44,
      [SM.MEMBRANE_DAMP_HF]: 0.30,
      [SM.AIR_LOAD]: 0.66,
      [SM.TENSION_NONLIN]: 0.76, // huge pitch inflection on hard strokes
      [SM.BUZZ_AMOUNT]: 0.24,    // single brass jingle pair
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.22,
      [SM.CAVITY_COUPLING]: 0.52,
      [SM.SHELL_MATERIAL]: 0,
      [SM.SHELL_RESONANCE]: 0.64,
    }),
    macros: { strikePos: 0.56, hardness: 0.68, tension: 0.5, chamber: 0.52, shellBody: 0.64, hallSpace: 0.38 },
  },
  {
    id: 'ocean-frame-brush',
    name: 'Brushed Vellum Ritual Frame',
    category: 'frame-ancient',
    origin: 'Mediterranean & Studio Textural Frame Drum',
    acoustics: '20" Calfskin Vellum · High Brush Skin Friction · Resonant Hoop Modes',
    description: 'Combines palm-brush skin friction with a warm 20" vellum membrane and resonant wooden hoop for intimate cinematic percussion underscores.',
    defaultNote: 48, // C3
    params: buildParams({
      [SM.STRIKER_TYPE]: 1,
      [SM.STRIKER_HARDNESS]: 0.48,
      [SM.STRIKER_MASS]: 0.50,
      [SM.STRIKE_POS]: 0.66,
      [SM.HAND_BRUSH]: 0.85,
      [SM.HEAD_DIAMETER]: 0.46,
      [SM.SKIN_MATERIAL]: 0,
      [SM.MEMBRANE_DECAY]: 0.62,
      [SM.MEMBRANE_DAMP_HF]: 0.34,
      [SM.AIR_LOAD]: 0.70,
      [SM.TENSION_NONLIN]: 0.22,
      [SM.CAVITY_TYPE]: 5,
      [SM.CAVITY_VOLUME]: 0.38,
      [SM.CAVITY_COUPLING]: 0.56,
      [SM.SHELL_MATERIAL]: 4,
      [SM.SHELL_RESONANCE]: 0.62,
      [RV.SIZE]: 0.72,
      [RV.DECAY]: 0.56,
      [RV.MIX]: 0.26,
    }),
    macros: { strikePos: 0.66, hardness: 0.48, tension: 0.5, chamber: 0.56, shellBody: 0.62, hallSpace: 0.58 },
  },
];

export const DEFAULT_SOMA_PRESET: SomaPreset = SOMA_PRESETS[0]!;
