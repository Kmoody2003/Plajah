// TONOS parameter ids — the TypeScript mirror of the block-2000 constants in
// rust/plajah-audio/src/params.rs (TN_*). Keep the two in lockstep; DSP_ABI_VERSION (17) in
// InstrumentHost guards against a stale .wasm.

import { P as ONDA_P } from '../onda/params';
import { RV } from '../soma/params';

export const P = ONDA_P;
export { RV };

export const TN = {
  ENABLE: 2000,
  INSTRUMENT: 2001,
  POSITION: 2002,
  FORCE: 2003,
  HARDNESS: 2004,
  BOW_SPEED: 2005,
  TENSION: 2006,
  MATERIAL: 2007,
  DAMPING: 2008,
  JAWARI: 2009,
  SYMP: 2010,
  SYMP_KEY: 2011,
  SYMP_SCALE: 2012,
  BODY: 2013,
  BODY_SIZE: 2014,
  SKIN_TENSION: 2015,
  RATTLE: 2016,
  NONLIN: 2017,
  COURSE_DETUNE: 2018,
  SLIDE: 2019,
  VIB_DEPTH: 2020,
  VIB_RATE: 2021,
  TREMOLO: 2022,
  WIDTH: 2023,
  HARMONIC: 2024,
  MUTE: 2025,
  RELEASE_DAMP: 2026,
  VEL_SENS: 2027,
  LEGATO: 2028,
} as const;

/** Params that hold an index, not a 0..1 amount. */
export const TONOS_INDEX_PARAMS: readonly number[] = [TN.INSTRUMENT, TN.MATERIAL, TN.SYMP_KEY, TN.SYMP_SCALE, TN.HARMONIC];

/** Mirrors MATERIALS in tonos.rs: density (kg/m³), Young's modulus (Pa), loss angle, floor Q⁻¹. */
export const TONOS_MATERIALS = [
  { name: 'Steel', rho: 7850, e: 2.0e11, delta: 1.5e-4, q0: 2.0e-5 },
  { name: 'Bronze-wound', rho: 9000, e: 6.0e10, delta: 6.0e-4, q0: 5.0e-5 },
  { name: 'Nylon', rho: 1140, e: 5.0e9, delta: 2.0e-2, q0: 4.0e-4 },
  { name: 'Gut', rho: 1300, e: 6.5e9, delta: 1.6e-2, q0: 5.0e-4 },
  { name: 'Silk', rho: 1340, e: 1.0e10, delta: 3.0e-2, q0: 8.0e-4 },
  { name: 'Horsehair', rho: 1300, e: 1.2e9, delta: 3.5e-2, q0: 1.5e-3 },
  { name: 'Polyester (tetron)', rho: 1380, e: 1.0e10, delta: 1.2e-2, q0: 3.0e-4 },
  { name: 'Nylon-wrapped steel', rho: 5500, e: 4.0e10, delta: 4.0e-3, q0: 1.0e-4 },
  { name: 'Brass', rho: 8500, e: 1.0e11, delta: 3.0e-4, q0: 3.0e-5 },
] as const;

/** Mirrors SYMP_SCALE_NAMES in tonos.rs. */
export const TONOS_SYMP_SCALES = ['Yaman', 'Bilawal (major)', 'Kafi (Dorian)', 'Bhairav', 'Todi', 'Hijaz', 'Pentatonic minor', 'Chromatic', 'Fifths'] as const;
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export type TonosGroup = 'string' | 'touch' | 'bridge' | 'body' | 'hand';

export interface TonosParamMeta {
  id: number;
  label: string;
  hint: string;
  group: TonosGroup;
  /** Only where this applies. */
  when?: 'bowed' | 'plucked' | 'struck' | 'jawari' | 'rattle' | 'skin' | 'courses' | 'harmonic' | 'sympathetic';
  options?: readonly string[];
}

export const TONOS_PARAM_META: TonosParamMeta[] = [
  { id: TN.TENSION, label: 'Tension & gauge', hint: 'Tighter, heavier string at the same pitch: more push back on the finger, brighter, more inharmonic, a smaller swing for the same pluck.', group: 'string' },
  { id: TN.MATERIAL, label: 'String material', hint: 'Swap what the strings are made of. Density sets the gauge, stiffness the inharmonicity, internal friction how fast the highs die.', group: 'string', options: ['As built', ...TONOS_MATERIALS.map((m) => m.name)] },
  { id: TN.DAMPING, label: 'Internal friction', hint: 'How lossy the string material is (0.5 = the real material).', group: 'string' },
  { id: TN.NONLIN, label: 'Tension modulation', hint: 'A big swing stretches the string and raises its tension — the pitch glide of a hard pluck on a slack string. 0.5 = physical.', group: 'string' },
  { id: TN.COURSE_DETUNE, label: 'Course detune', hint: 'How far apart the strings of a doubled or tripled course are tuned — their beating through the bridge gives the two-stage decay.', group: 'string', when: 'courses' },
  { id: TN.POSITION, label: 'Position', hint: 'Where the finger, plectrum, hammer or bow meets the string, measured from the bridge (0.5 = where players do). Nearer the bridge is brighter and thinner.', group: 'touch' },
  { id: TN.FORCE, label: 'Force', hint: 'How hard the pluck pulls, the hammer\'s weight, or the bow\'s pressure (kept inside the playable window).', group: 'touch' },
  { id: TN.HARDNESS, label: 'Hardness', hint: 'Flesh → nail → plectrum: a narrower contact releases more highs. On hammers, the tip; on bows, the rosin\'s grip.', group: 'touch' },
  { id: TN.BOW_SPEED, label: 'Bow / wheel speed', hint: 'Faster bowing is louder and brighter; too fast for the pressure and it gets raucous.', group: 'touch', when: 'bowed' },
  { id: TN.VEL_SENS, label: 'Velocity response', hint: 'How much playing harder changes the pluck, strike or bow.', group: 'touch' },
  { id: TN.HARMONIC, label: 'Harmonic', hint: 'Đàn bầu: which node the palm touches (auto picks the one nearest the rod\'s rest).', group: 'touch', when: 'harmonic', options: ['Auto', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'] },
  { id: TN.JAWARI, label: 'Jawari', hint: 'How the string lies on the curved bridge. 0 = the thread lifts it clear (a plain tone); up = it wraps onto the bridge each swing — the buzzing, blooming jawari.', group: 'bridge', when: 'jawari' },
  { id: TN.RATTLE, label: 'Rattle', hint: 'How loosely the sesse, sersal or chien sits: loose buzzes on every note, tight only on the hardest. 0 = off.', group: 'bridge', when: 'rattle' },
  { id: TN.SYMP, label: 'Sympathetic strings', hint: 'Unplayed strings tuned to a raga or scale, ringing with whatever the played strings put into the bridge.', group: 'bridge' },
  { id: TN.SYMP_KEY, label: 'Sympathetic key', hint: 'The tonic the sympathetic strings are tuned from.', group: 'bridge', when: 'sympathetic', options: NOTE_NAMES },
  { id: TN.SYMP_SCALE, label: 'Sympathetic tuning', hint: 'Which notes the sympathetic strings are tuned to.', group: 'bridge', when: 'sympathetic', options: TONOS_SYMP_SCALES },
  { id: TN.BODY, label: 'Bridge mobility', hint: 'How freely the body lets the bridge move. More = more body in the sound and shorter notes (energy leaves the string faster). 0.5 = as built.', group: 'body' },
  { id: TN.BODY_SIZE, label: 'Body size', hint: 'A bigger body moves its resonances lower.', group: 'body' },
  { id: TN.SKIN_TENSION, label: 'Skin tension', hint: 'Tighten or slacken the skin belly — its modes move with √tension.', group: 'body', when: 'skin' },
  { id: TN.WIDTH, label: 'Stereo width', hint: 'Spread low and high notes across the stereo field.', group: 'body' },
  { id: TN.VIB_DEPTH, label: 'Vibrato', hint: 'The left hand\'s vibrato (more with the mod wheel). Pitch bend changes tension, like pressing behind a bridge or deflecting a string.', group: 'hand' },
  { id: TN.VIB_RATE, label: 'Vibrato rate', hint: '3.5 to 8 wobbles a second.', group: 'hand' },
  { id: TN.SLIDE, label: 'Slide time', hint: 'Legato: how long the finger takes to slide to the next note on the same string.', group: 'hand' },
  { id: TN.LEGATO, label: 'Legato', hint: 'A note played into a held one slides there on the same string (bowed: in one bow). Notes played together stay a chord.', group: 'hand' },
  { id: TN.TREMOLO, label: 'Tremolo picking', hint: 'Re-pluck while the note is held — pipa lunzhi, bouzouki and balalaika tremolo. On the hurdy-gurdy: the wrist\'s coups on the wheel. 0 = off.', group: 'hand' },
  { id: TN.MUTE, label: 'Mute', hint: 'The edge of the hand resting on the strings near the bridge.', group: 'hand', when: 'plucked' },
  { id: TN.RELEASE_DAMP, label: 'Damp on release', hint: 'How firmly the player stops the string when you let go. Harps and zithers usually ring on.', group: 'hand' },
];

/** Mirrors Params::defaults in params.rs for the TONOS block (enabled). */
export const TONOS_DEFAULTS: Readonly<Record<number, number>> = Object.freeze({
  [P.MASTER_GAIN]: 0.8,
  [P.BEND_RANGE]: 2 / 24,
  [TN.ENABLE]: 1,
  [TN.INSTRUMENT]: 0,
  [TN.POSITION]: 0.5,
  [TN.FORCE]: 0.5,
  [TN.HARDNESS]: 0.5,
  [TN.BOW_SPEED]: 0.5,
  [TN.TENSION]: 0.5,
  [TN.MATERIAL]: 0,
  [TN.DAMPING]: 0.5,
  [TN.JAWARI]: 0.8,
  [TN.SYMP]: 0,
  [TN.SYMP_KEY]: 0,
  [TN.SYMP_SCALE]: 0,
  [TN.BODY]: 0.5,
  [TN.BODY_SIZE]: 0.5,
  [TN.SKIN_TENSION]: 0.5,
  [TN.RATTLE]: 0.4,
  [TN.NONLIN]: 0.5,
  [TN.COURSE_DETUNE]: 0.5,
  [TN.SLIDE]: 0.2,
  [TN.VIB_DEPTH]: 0.2,
  [TN.VIB_RATE]: 0.5,
  [TN.TREMOLO]: 0,
  [TN.WIDTH]: 0.5,
  [TN.HARMONIC]: 0,
  [TN.MUTE]: 0,
  [TN.RELEASE_DAMP]: 0.3,
  [TN.VEL_SENS]: 0.85,
  [TN.LEGATO]: 1,
  [RV.MIX]: 0.14,
  [RV.SIZE]: 0.5,
  // Veil rt60 = 0.5 + decay²·59.5 s: 0.12 is a ~1.4 s room, not a pad reverb.
  [RV.DECAY]: 0.12,
});
