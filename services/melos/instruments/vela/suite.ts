// The meditation instrument suite.
//
// Four instruments, one engine. They share plajah-audio's block-1000 parameter space and the
// same editor, and they are still four separate entries in the picker with four separate preset
// banks — which is the honest arrangement rather than a compromise. A Kontakt library and its
// engine have the same relationship: what makes an instrument an instrument is its identity,
// its voicing and what it is FOR, not whether it ships its own oscillator.
//
// Each one leans on a capability the others mostly leave alone, so they are genuinely different
// tools rather than four preset folders:
//
//   VELA    struck and resonant bodies. Inharmonicity, decay, position.
//   CANTUS  voices. Formants and the overtone spotlight — chant and throat singing.
//   ISON    drones. Named for the held note under Byzantine chant. Beating, long morph,
//           and a pitch set rather than a melody.
//   PNEUMA  breath. Blown exciter, air noise, portamento — temple flutes and wind.
//
// They also blend. In a Stillness session they fade across one another as the arc moves rather
// than one instrument playing throughout, which is most of what makes a generated session sound
// arranged. See ensembleFor() at the bottom.

import { M, MASTER_GAIN, V, X } from './params';
import { VELA_PRESETS } from './presets';
import type { VelaMacro, VelaPreset } from './presets';

export type SuiteInstrument = 'vela' | 'cantus' | 'ison' | 'pneuma';

export interface SuiteIdentity {
  id: SuiteInstrument;
  name: string;
  /** One line under the name in the picker — what it is, in plain terms. */
  blurb: string;
  /** Longer, for the panel. */
  purpose: string;
  accent: string;
  /** The four macro labels for THIS instrument. Same four engine targets, named for what they
   *  do here — "Air" means something different on a drone than on a flute. */
  macroLabels: Record<VelaMacro, string>;
  /** Editor controls this instrument leads with, before the full list. */
  featured: number[];
}

export const SUITE: Record<SuiteInstrument, SuiteIdentity> = {
  vela: {
    id: 'vela', name: 'VELA',
    blurb: 'Modal resonator. Bowls, gongs, bowed glass — notes that ring for as long as you let them.',
    purpose: 'Struck and resonant bodies. The generalist of the suite: anything that is hit, bowed or rubbed.',
    accent: '#D0BCFF',
    macroLabels: { air: 'Air', body: 'Body', shimmer: 'Shimmer', drift: 'Drift' },
    featured: [M.INHARM, M.DECAY, M.POSITION, M.MATERIAL],
  },
  cantus: {
    id: 'cantus', name: 'CANTUS',
    blurb: 'Voices. Monastic chant, choir and overtone singing — the vocal tract rather than the bell.',
    purpose:
      'Sustained partials shaped by formants, with a movable emphasis on one harmonic. That emphasis is what throat singing physically is: a drone held steady while the mouth amplifies a single overtone until the ear splits it off into a second voice.',
    accent: '#E9C46A',
    macroLabels: { air: 'Breath', body: 'Throat', shimmer: 'Overtone', drift: 'Waver' },
    featured: [M.FORMANT, M.FORMANT_SHIFT, M.SPOTLIGHT, M.SPOTLIGHT_POS],
  },
  ison: {
    id: 'ison', name: 'ISON',
    blurb: 'Drones. The held note under a chant — shruti box, tanpura, organ bourdon.',
    purpose:
      'Named for the sustained tone Byzantine cantors hold beneath the melody. It is not a pad: a drone does not arrive or leave, it is simply already there, and everything else is heard against it.',
    accent: '#8AB0A0',
    macroLabels: { air: 'Pressure', body: 'Weight', shimmer: 'Halo', drift: 'Wander' },
    featured: [M.BEAT, M.BEAT_RATE, M.MORPH_TIME, M.ANIMA],
  },
  pneuma: {
    id: 'pneuma', name: 'PNEUMA',
    blurb: 'Breath. Temple flutes, ney, wind through a space that is mostly empty.',
    purpose:
      'The exciter carries this one, not the body. Air noise is the sound and the pitch is only just present — closer to a room being breathed through than to an instrument being played.',
    accent: '#9EC5E8',
    macroLabels: { air: 'Breath', body: 'Column', shimmer: 'Room', drift: 'Sway' },
    featured: [X.PRESSURE, X.GRAIN, X.PULSE, M.VIBRATO],
  },
};

export const SUITE_ORDER: SuiteInstrument[] = ['vela', 'cantus', 'ison', 'pneuma'];

// ── Preset-bank helpers, shared with presets.ts ──────────────────────────────

const body = (
  partials: number, inharm: number, spread: number, decay: number, tilt: number,
  material: number, position: number, keytrack: number,
) => ({
  [M.ENABLE]: 1, [M.PARTIALS]: partials, [M.INHARM]: inharm, [M.SPREAD]: spread,
  [M.DECAY]: decay, [M.DECAY_TILT]: tilt, [M.MATERIAL]: material,
  [M.POSITION]: position, [M.KEYTRACK]: keytrack,
});
const life = (anima: number, beat: number, beatRate: number, pulse: number, pulseRate: number) => ({
  [M.ANIMA]: anima, [M.BEAT]: beat, [M.BEAT_RATE]: beatRate,
  [X.PULSE]: pulse, [X.PULSE_RATE]: pulseRate,
});
const evolve = (swell: number, morph: number, morphTime: number) => ({
  [M.SWELL]: swell, [M.MORPH]: morph, [M.MORPH_TIME]: morphTime,
});
const breath = (type: number, pressure: number, grain: number, tone: number, velTilt: number) => ({
  [X.TYPE]: type, [X.PRESSURE]: pressure, [X.GRAIN]: grain, [X.TONE]: tone, [X.VEL_TILT]: velTilt,
});
const sung = (formant: number, vowel: number, bloom: number, blend = false) => ({
  [M.MODE]: blend ? 2 : 1, [M.FORMANT]: formant, [M.FORMANT_SHIFT]: vowel, [M.BLOOM]: bloom,
});
/** The overtone spotlight: depth, which partial, how many neighbours come with it. */
const overtone = (amount: number, pos: number, width: number) => ({
  [M.SPOTLIGHT]: amount, [M.SPOTLIGHT_POS]: pos, [M.SPOTLIGHT_WIDTH]: width,
});
const waver = (depth: number, rate: number) => ({ [M.VIBRATO]: depth, [M.VIBRATO_RATE]: rate });
/** Period doubling — the kargyraa rasp. */
const buzz = (amount: number) => ({ [M.SUBHARM]: amount });
const veil = (
  mix: number, size: number, decay: number, diffusion: number,
  shimmer = 0, interval = 0, blur = 0,
) => ({
  [V.MIX]: mix, [V.SIZE]: size, [V.DECAY]: decay, [V.DIFFUSION]: diffusion,
  [V.SHIMMER]: shimmer, [V.SHIMMER_IVL]: interval, [V.BLUR]: blur,
});
const trim = (g: number) => ({ [MASTER_GAIN]: g });

const macros = (air: number, bodyM: number, shimmer: number, drift: number): Record<VelaMacro, number> =>
  ({ air, body: bodyM, shimmer, drift });

// ── CANTUS ───────────────────────────────────────────────────────────────────

export const CANTUS_PRESETS: VelaPreset[] = [
  {
    id: 'cantus-plainsong', name: 'Plainsong', family: 'voices',
    blurb: 'unison chant · ah · slow waver',
    description:
      'A line of voices on one note. The waver is deliberately narrow and slow — a monastic pitch drift rather than a trained vibrato, which is most of what separates chant from choral singing.',
    params: {
      ...body(0.5, 0.004, 0.3, 0.5, 0.5, 6, 0.5, 0.25),
      ...sung(0.82, 0.6, 0.4), ...overtone(0, 0.4, 0.25), ...waver(0.16, 0.22),
      ...breath(0, 0.5, 0.3, 0.34, 0.3), ...life(0.5, 0.3, 0.7, 0.35, 0.12),
      ...evolve(0.4, 0.54, 0.3), ...veil(0.66, 0.86, 0.72, 0.85, 0.12), ...trim(0.42),
    },
    macros: macros(0.5, 0.2, 0.2, 0.4),
  },
  {
    id: 'cantus-overtone', name: 'Overtone', family: 'voices',
    blurb: 'throat singing · harmonic 13',
    description:
      'The demonstration piece — and it only works LOW. Play C2 or below: at C4 the fundamental is already 260 Hz and there are barely any harmonics left in the range where the ear picks out an isolated overtone. Hold one low note and sweep the Overtone partial.',
    params: {
      ...body(1.0, 0.0, 0.03, 0.55, 0.45, 6, 0.42, 0.15),
      ...sung(0.34, 0.3, 0.1), ...overtone(0.95, 0.22, 0.05), ...waver(0.08, 0.3),
      ...buzz(0.0), ...breath(0, 0.55, 0.25, 0.4, 0.3), ...life(0.3, 0.12, 0.5, 0.3, 0.1),
      ...evolve(0.2, 0.66, 0.35), ...veil(0.4, 0.7, 0.6, 0.8, 0.06), ...trim(0.4),
    },
    macros: macros(0.55, 0.15, 0.8, 0.3),
  },
  {
    id: 'cantus-kargyraa', name: 'Kargyraa', family: 'voices',
    blurb: 'throat singing · buzz · play C2',
    description:
      'The deep rasping Tuvan style. The buzz is period doubling — the ventricular folds vibrating at half the rate of the vocal folds, which fills the spectrum with half-integer partials that no filter can imitate because they are simply not there in a normal harmonic series. Play it as low as the keyboard goes.',
    params: {
      ...body(1.0, 0.0, 0.04, 0.58, 0.42, 6, 0.38, 0.1),
      ...sung(0.62, 0.26, 0.15), ...overtone(0.7, 0.3, 0.08), ...waver(0.1, 0.24),
      ...buzz(0.72), ...breath(0, 0.6, 0.3, 0.36, 0.3), ...life(0.35, 0.18, 0.4, 0.35, 0.1),
      ...evolve(0.18, 0.6, 0.3), ...veil(0.44, 0.72, 0.62, 0.8, 0.08), ...trim(0.4),
    },
    macros: macros(0.55, 0.2, 0.6, 0.3),
  },
  {
    id: 'cantus-byzantine', name: 'Byzantine', family: 'voices',
    blurb: 'nasal · narrow · oh',
    description:
      'Tighter and more nasal than the Western choir — fewer partials, a narrower throat, and a formant sitting low. Made to sit ON a drone rather than to fill space by itself.',
    params: {
      ...body(0.5, 0.006, 0.14, 0.48, 0.55, 6, 0.42, 0.3),
      ...sung(0.92, 0.34, 0.35), ...overtone(0.35, 0.3, 0.14), ...waver(0.24, 0.3),
      ...breath(0, 0.52, 0.34, 0.36, 0.35), ...life(0.45, 0.35, 0.8, 0.4, 0.14),
      ...evolve(0.3, 0.6, 0.28), ...veil(0.56, 0.74, 0.62, 0.8, 0.08), ...trim(0.44),
    },
    macros: macros(0.5, 0.25, 0.3, 0.35),
  },
  {
    id: 'cantus-vault', name: 'Vault', family: 'voices',
    blurb: 'choir in a stone room · 45 s morph',
    description:
      'Many voices, far away, in something with a very long tail. The vowel moves across the note, so a held chord slowly changes what it is saying.',
    params: {
      ...body(0.75, 0.006, 0.34, 0.55, 0.5, 6, 0.5, 0.35),
      ...sung(0.7, 0.2, 0.6), ...overtone(0.18, 0.5, 0.3), ...waver(0.12, 0.2),
      ...breath(1, 0.5, 0.45, 0.32, 0.3), ...life(0.65, 0.25, 0.55, 0.45, 0.06),
      ...evolve(0.62, 0.82, 0.6), ...veil(0.78, 0.92, 0.84, 0.9, 0.28, 1, 0.2), ...trim(0.4),
    },
    macros: macros(0.48, 0.22, 0.4, 0.6),
  },
  {
    id: 'cantus-sygyt', name: 'Sygyt Whistle', family: 'voices',
    blurb: 'steppe whistle-throat · razor overtone',
    description:
      'The crystalline steppe whistle technique: the tongue seals against the hard palate so the fundamental recedes and a razor-narrow upper harmonic sings out like a flute floating above a human chest.',
    params: {
      ...body(1.0, 0.0, 0.02, 0.56, 0.44, 6, 0.46, 0.12),
      ...sung(0.48, 0.72, 0.12), ...overtone(0.92, 0.34, 0.04), ...waver(0.09, 0.28),
      ...buzz(0.12), ...breath(0, 0.56, 0.22, 0.44, 0.32), ...life(0.28, 0.14, 0.48, 0.28, 0.1),
      ...evolve(0.22, 0.64, 0.34), ...veil(0.46, 0.74, 0.64, 0.82, 0.1), ...trim(0.4),
    },
    macros: macros(0.54, 0.18, 0.82, 0.32),
  },
  {
    id: 'cantus-hildegard-abbey', name: 'Abbey Soprano', family: 'voices',
    blurb: 'soaring melisma · high stone nave',
    description:
      'Inspired by 12th-century Rhenish convent acoustics: a bright, pure head-voice vowel with a gentle upper-harmonic halo that blooms into a vaulted limestone ceiling.',
    params: {
      ...body(0.68, 0.004, 0.22, 0.54, 0.48, 6, 0.48, 0.32),
      ...sung(0.84, 0.68, 0.45), ...overtone(0.48, 0.38, 0.16), ...waver(0.18, 0.26),
      ...breath(0, 0.48, 0.28, 0.38, 0.3), ...life(0.48, 0.24, 0.62, 0.36, 0.11),
      ...evolve(0.46, 0.62, 0.42), ...veil(0.72, 0.9, 0.8, 0.88, 0.18, 1, 0.14), ...trim(0.42),
    },
    macros: macros(0.5, 0.22, 0.42, 0.45),
  },
  {
    id: 'cantus-polyphonic-vespers', name: 'Georgian Triad', family: 'voices',
    blurb: 'open chest resonance · rich fifths',
    description:
      'Grounded in Caucasus three-part vocal timbre: open pharyngeal vowels, firm chest partials, and enough harmonic spotlight for stacked fourths and fifths to ring with acoustic combination tones.',
    params: {
      ...body(0.62, 0.005, 0.2, 0.52, 0.52, 6, 0.44, 0.28),
      ...sung(0.88, 0.46, 0.38), ...overtone(0.46, 0.28, 0.18), ...waver(0.2, 0.24),
      ...breath(0, 0.54, 0.3, 0.36, 0.34), ...life(0.42, 0.32, 0.68, 0.38, 0.12),
      ...evolve(0.34, 0.58, 0.32), ...veil(0.6, 0.8, 0.68, 0.84, 0.1), ...trim(0.43),
    },
    macros: macros(0.52, 0.26, 0.36, 0.38),
  },
  {
    id: 'cantus-seraphim-alto', name: 'Seraphim Alto', family: 'pad',
    blurb: 'luminous vowel cloud · octave halo',
    description:
      'Warm alto choral formants suspended in a slow-breathing shimmer veil, bridging intimate human breath with cinematic scoring choir.',
    params: {
      ...body(0.72, 0.005, 0.3, 0.56, 0.48, 6, 0.5, 0.34),
      ...sung(0.78, 0.52, 0.54), ...overtone(0.54, 0.44, 0.22), ...waver(0.15, 0.21),
      ...breath(1, 0.5, 0.38, 0.35, 0.3), ...life(0.58, 0.28, 0.58, 0.42, 0.08),
      ...evolve(0.56, 0.74, 0.52), ...veil(0.74, 0.88, 0.82, 0.88, 0.24, 1, 0.18), ...trim(0.41),
    },
    macros: macros(0.5, 0.24, 0.48, 0.54),
  },
  {
    id: 'cantus-tuva-khoomei', name: 'Steppe Khoomei', family: 'voices',
    blurb: 'clear steppe whistle · warm baritone',
    description:
      'Classic Tuvan Khoomei throat balance: a round, stable baritone fundamental beneath a sharply focused mid-high harmonic whistle.',
    params: {
      ...body(0.92, 0.0, 0.04, 0.56, 0.46, 6, 0.42, 0.16),
      ...sung(0.56, 0.64, 0.16), ...overtone(0.86, 0.26, 0.06), ...waver(0.11, 0.26),
      ...buzz(0.08), ...breath(0, 0.56, 0.26, 0.42, 0.3), ...life(0.32, 0.16, 0.45, 0.32, 0.11),
      ...evolve(0.24, 0.64, 0.36), ...veil(0.48, 0.74, 0.64, 0.82, 0.08), ...trim(0.42),
    },
    macros: macros(0.54, 0.2, 0.78, 0.34),
  },
  {
    id: 'cantus-sardinia-tenores', name: 'Sardinian Tenores', family: 'voices',
    blurb: 'guttural quint · rustic island bass',
    description:
      'Sardinian Canto a tenore guttural voicing: earthy glottal subharmonics with an assertive chest vowel spotlight built for dry stone rooms.',
    params: {
      ...body(0.88, 0.002, 0.08, 0.52, 0.48, 6, 0.36, 0.2),
      ...sung(0.76, 0.42, 0.24), ...overtone(0.64, 0.32, 0.1), ...waver(0.14, 0.24),
      ...buzz(0.58), ...breath(0, 0.62, 0.34, 0.38, 0.36), ...life(0.38, 0.22, 0.52, 0.36, 0.12),
      ...evolve(0.22, 0.58, 0.32), ...veil(0.46, 0.68, 0.58, 0.78, 0.06), ...trim(0.42),
    },
    macros: macros(0.56, 0.24, 0.58, 0.34),
  },
  {
    id: 'cantus-balkan-open-throat', name: 'Rhodope Open Choir', family: 'voices',
    blurb: 'bright chest vowel · fifth spotlight',
    description:
      'Cutting Bulgarian chest-voice polyphony with forward nasal brilliance and sparkling close-interval combination overtones.',
    params: {
      ...body(0.66, 0.004, 0.18, 0.5, 0.5, 6, 0.4, 0.32),
      ...sung(0.9, 0.76, 0.36), ...overtone(0.52, 0.36, 0.12), ...waver(0.22, 0.32),
      ...breath(0, 0.58, 0.28, 0.44, 0.38), ...life(0.44, 0.34, 0.66, 0.4, 0.14),
      ...evolve(0.28, 0.6, 0.34), ...veil(0.58, 0.76, 0.66, 0.82, 0.1), ...trim(0.43),
    },
    macros: macros(0.56, 0.24, 0.48, 0.38),
  },
];

// ── ISON ─────────────────────────────────────────────────────────────────────

export const ISON_PRESETS: VelaPreset[] = [
  {
    id: 'ison-shruti', name: 'Shruti', family: 'sustained',
    blurb: 'reed drone · strong beat',
    description:
      'A shruti box: two reeds slightly out of tune with each other, forever. The beating is the instrument — turn it off and it becomes an organ.',
    params: {
      ...body(0.5, 0.01, 0.45, 0.6, 0.5, 3, 0.4, 0.15),
      ...sung(0.3, 0.5, 0.35), ...overtone(0, 0.4, 0.25), ...waver(0.05, 0.15),
      ...breath(1, 0.55, 0.4, 0.4, 0.2), ...life(0.4, 0.75, 0.2, 0.3, 0.05),
      ...evolve(0.5, 0.52, 0.5), ...veil(0.5, 0.7, 0.62, 0.78, 0.08), ...trim(0.42),
    },
    macros: macros(0.5, 0.3, 0.2, 0.3),
  },
  {
    id: 'ison-tanpura', name: 'Tanpura', family: 'sustained',
    blurb: 'plucked drone · long halo',
    description:
      'Struck rather than blown, but the strikes are so close together and the tail so long that it reads as continuous. The halo is the point — each note is still sounding when the next arrives.',
    params: {
      ...body(1.0, 0.03, 0.2, 0.82, 0.34, 0, 0.22, 0.25),
      ...sung(0.16, 0.55, 0.3, true), ...overtone(0.3, 0.34, 0.12), ...waver(0, 0.3),
      ...breath(2, 0.6, 0.35, 0.5, 0.5), ...life(0.55, 0.4, 0.14, 0.2, 0.07),
      ...evolve(0, 0.58, 0.4), ...veil(0.68, 0.8, 0.78, 0.84, 0.3, 1), ...trim(0.34),
    },
    macros: macros(0.5, 0.4, 0.4, 0.4),
  },
  {
    id: 'ison-bourdon', name: 'Bourdon', family: 'sustained',
    blurb: 'organ drone · immovable',
    description:
      'The lowest, stillest thing in the suite. Almost no movement by design — everything else in a session is heard against this, so it must not compete.',
    params: {
      ...body(0.25, 0.006, 0.16, 0.7, 0.62, 3, 0.5, 0.2),
      ...sung(0.42, 0.24, 0.5), ...overtone(0, 0.4, 0.25), ...waver(0.04, 0.1),
      ...breath(1, 0.5, 0.28, 0.22, 0.2), ...life(0.28, 0.2, 0.09, 0.22, 0.04),
      ...evolve(0.66, 0.5, 0.7), ...veil(0.56, 0.84, 0.7, 0.78, 0.05), ...trim(0.5),
    },
    macros: macros(0.45, 0.35, 0.12, 0.25),
  },
  {
    id: 'ison-cavern', name: 'Cavern', family: 'soundscape',
    blurb: 'drone that opens over 70 s',
    description:
      'Starts as a bourdon and slowly becomes a room. The longest morph in the suite — leave it running and check back in a minute.',
    params: {
      ...body(0.75, 0.05, 0.4, 0.75, 0.44, 2, 0.5, 0.12),
      ...sung(0.5, 0.16, 0.7, true), ...overtone(0.22, 0.6, 0.3), ...waver(0.06, 0.12),
      ...breath(0, 0.44, 0.55, 0.3, 0.25), ...life(0.75, 0.4, 0.06, 0.45, 0.03),
      ...evolve(0.7, 0.84, 0.9), ...veil(0.76, 0.94, 0.86, 0.88, 0.22, 3, 0.3), ...trim(0.36),
    },
    macros: macros(0.45, 0.45, 0.3, 0.7),
  },
  {
    id: 'ison-harmonium-bellows', name: 'Harmonium Bellows', family: 'sustained',
    blurb: 'teakwood pump-reed · warm beating',
    description:
      'Hand-pumped brass free-reeds inside an aged teak cabinet: two unison banks tuned three cents apart breathe gently on a geological timescale.',
    params: {
      ...body(0.58, 0.008, 0.38, 0.66, 0.48, 3, 0.42, 0.18),
      ...sung(0.34, 0.44, 0.4), ...overtone(0.04, 0.36, 0.24), ...waver(0.04, 0.12),
      ...breath(1, 0.54, 0.34, 0.38, 0.22), ...life(0.38, 0.68, 0.16, 0.28, 0.04),
      ...evolve(0.58, 0.56, 0.76), ...veil(0.52, 0.74, 0.66, 0.8, 0.08), ...trim(0.44),
    },
    macros: macros(0.5, 0.34, 0.2, 0.34),
  },
  {
    id: 'ison-cathedral-32ft', name: '32-Foot Sub-Bourdon', family: 'sustained',
    blurb: 'wooden pedal pipe · tectonic floor',
    description:
      'Modeled on a 32-foot stopped wooden organ pipe whose pitch is felt in the floorboards as much as heard in the nave, evolving over eighty seconds without ever stealing attention.',
    params: {
      ...body(0.3, 0.004, 0.18, 0.76, 0.64, 3, 0.5, 0.15),
      ...sung(0.38, 0.2, 0.52), ...overtone(0.0, 0.4, 0.25), ...waver(0.03, 0.08),
      ...breath(1, 0.48, 0.3, 0.2, 0.18), ...life(0.26, 0.28, 0.08, 0.2, 0.03),
      ...evolve(0.72, 0.54, 0.84), ...veil(0.62, 0.9, 0.78, 0.82, 0.06), ...trim(0.5),
    },
    macros: macros(0.44, 0.42, 0.14, 0.28),
  },
  {
    id: 'ison-hurdy-bourdon', name: 'Rosin Wheel Drone', family: 'sustained',
    blurb: 'continuous gut wheel · rustic fifth',
    description:
      'A rosined pearwood wheel turning steadily against gut bourdon strings, rich in odd-even bowed harmonics and slow organic beating.',
    params: {
      ...body(0.68, 0.014, 0.32, 0.68, 0.46, 3, 0.34, 0.2),
      ...sung(0.28, 0.48, 0.36), ...overtone(0.08, 0.32, 0.2), ...waver(0.06, 0.14),
      ...breath(0, 0.58, 0.38, 0.44, 0.24), ...life(0.46, 0.64, 0.18, 0.26, 0.05),
      ...evolve(0.54, 0.62, 0.78), ...veil(0.54, 0.76, 0.68, 0.8, 0.12, 2), ...trim(0.42),
    },
    macros: macros(0.52, 0.38, 0.24, 0.4),
  },
  {
    id: 'ison-monolith-sub', name: 'Basalt Monolith', family: 'soundscape',
    blurb: 'mineral horizon · 90 s drift',
    description:
      'Dark stone-like modal partials locked in glacial beating beneath a fifth-interval shimmer veil, built for ambient scoring and deep meditation beds.',
    params: {
      ...body(0.64, 0.036, 0.36, 0.78, 0.48, 4, 0.48, 0.14),
      ...sung(0.46, 0.18, 0.64, true), ...overtone(0.08, 0.52, 0.28), ...waver(0.05, 0.1),
      ...breath(0, 0.46, 0.48, 0.28, 0.22), ...life(0.66, 0.52, 0.07, 0.38, 0.03),
      ...evolve(0.74, 0.8, 0.88), ...veil(0.74, 0.92, 0.84, 0.88, 0.2, 2, 0.26), ...trim(0.38),
    },
    macros: macros(0.46, 0.44, 0.28, 0.64),
  },
  {
    id: 'ison-didgeridoo-ochre', name: 'Eucalyptus Earth Drone', family: 'sustained',
    blurb: 'hollow trunk · woody overtone rumble',
    description:
      'Termite-hollowed hardwood air column with slow vowel-formant shifts across an ancient continuous chest pulse.',
    params: {
      ...body(0.6, 0.018, 0.28, 0.66, 0.52, 3, 0.36, 0.18),
      ...sung(0.74, 0.3, 0.54), ...overtone(0.18, 0.24, 0.16), ...waver(0.05, 0.14),
      ...breath(1, 0.6, 0.46, 0.34, 0.26), ...life(0.44, 0.58, 0.18, 0.32, 0.08),
      ...evolve(0.44, 0.72, 0.74), ...veil(0.56, 0.76, 0.68, 0.8, 0.08), ...trim(0.44),
    },
    macros: macros(0.54, 0.38, 0.2, 0.36),
  },
  {
    id: 'ison-sitar-jawari-bed', name: 'Jawari Bridge Bed', family: 'sustained',
    blurb: 'buzzing bone bridge · sympathetic fifths',
    description:
      'Gently bowed and repeatedly brushed flat-bridge sympathetic bed — shimmering upper overtones hovering softly over a fixed tonic.',
    params: {
      ...body(0.9, 0.026, 0.22, 0.76, 0.38, 0, 0.26, 0.22),
      ...sung(0.32, 0.56, 0.42, true), ...overtone(0.28, 0.38, 0.14), ...waver(0.02, 0.2),
      ...breath(2, 0.58, 0.32, 0.48, 0.44), ...life(0.52, 0.46, 0.15, 0.24, 0.06),
      ...evolve(0.34, 0.64, 0.68), ...veil(0.68, 0.82, 0.78, 0.84, 0.28, 1), ...trim(0.36),
    },
    macros: macros(0.52, 0.4, 0.42, 0.42),
  },
  {
    id: 'ison-glacial-harmonic', name: 'Glacial Glass Floor', family: 'soundscape',
    blurb: 'crystal bourdon · slow octave tide',
    description:
      'Pure glass partials shifting imperceptibly in pitch and octave shimmer over a ninety-second meditation arc.',
    params: {
      ...body(0.54, 0.02, 0.32, 0.8, 0.42, 1, 0.44, 0.16),
      ...sung(0.38, 0.28, 0.66, true), ...overtone(0.12, 0.48, 0.26), ...waver(0.04, 0.1),
      ...breath(1, 0.46, 0.42, 0.3, 0.2), ...life(0.68, 0.48, 0.06, 0.34, 0.03),
      ...evolve(0.76, 0.86, 0.92), ...veil(0.78, 0.92, 0.86, 0.88, 0.32, 1, 0.24), ...trim(0.38),
    },
    macros: macros(0.46, 0.4, 0.44, 0.66),
  },
];

// ── PNEUMA ───────────────────────────────────────────────────────────────────

export const PNEUMA_PRESETS: VelaPreset[] = [
  {
    id: 'pneuma-ney', name: 'Ney', family: 'sustained',
    blurb: 'reed flute · breath-forward',
    description:
      'More air than tone. The ney is played across the rim rather than through a mouthpiece, so the breath noise is not an artefact of the sound — it is most of the sound.',
    params: {
      ...body(0.25, 0.006, 0.24, 0.34, 0.6, 5, 0.36, 0.5),
      ...sung(0.55, 0.5, 0.3), ...overtone(0.2, 0.28, 0.2), ...waver(0.2, 0.34),
      ...breath(1, 0.66, 0.88, 0.5, 0.4), ...life(0.5, 0.16, 0.4, 0.55, 0.2),
      ...evolve(0.24, 0.6, 0.24), ...veil(0.5, 0.68, 0.52, 0.78, 0.06), ...trim(0.5),
    },
    macros: macros(0.75, 0.16, 0.16, 0.35),
  },
  {
    id: 'pneuma-shakuhachi', name: 'Shakuhachi', family: 'sustained',
    blurb: 'bamboo · hard breath · wide waver',
    description:
      'Grainier and more physical. The wide, slow waver is the player bending the note with their head rather than their fingers.',
    params: {
      ...body(0.25, 0.02, 0.2, 0.36, 0.58, 3, 0.3, 0.5),
      ...sung(0.4, 0.62, 0.25), ...overtone(0.3, 0.2, 0.16), ...waver(0.42, 0.26),
      ...breath(1, 0.72, 0.92, 0.58, 0.5), ...life(0.45, 0.18, 0.5, 0.6, 0.24),
      ...evolve(0.16, 0.64, 0.2), ...veil(0.46, 0.6, 0.48, 0.74, 0.05), ...trim(0.46),
    },
    macros: macros(0.8, 0.2, 0.14, 0.3),
  },
  {
    id: 'pneuma-hall', name: 'Hall', family: 'soundscape',
    blurb: 'wind through a large empty space',
    description:
      'Barely pitched at all. The body is nearly gone and what is left is air moving through something big — the emptiest thing in the suite.',
    params: {
      ...body(0.25, 0.04, 0.55, 0.3, 0.66, 5, 0.5, 0.2),
      ...sung(0.86, 0.14, 0.6), ...overtone(0.1, 0.5, 0.4), ...waver(0.1, 0.14),
      ...breath(1, 0.5, 0.96, 0.34, 0.3), ...life(0.78, 0.12, 0.2, 0.7, 0.05),
      ...evolve(0.6, 0.46, 0.62), ...veil(0.74, 0.92, 0.8, 0.86, 0.12, 3, 0.34), ...trim(0.5),
    },
    macros: macros(0.7, 0.2, 0.2, 0.6),
  },
  {
    id: 'pneuma-bansuri-bamboo', name: 'Bansuri Mist', family: 'sustained',
    blurb: 'North Indian bamboo · silky jet air',
    description:
      'Thin-walled Assam bamboo transverse flute: soft embouchure jet noise wraps a round fundamental that glides effortlessly across night ragas.',
    params: {
      ...body(0.22, 0.008, 0.18, 0.38, 0.56, 3, 0.42, 0.52),
      ...sung(0.48, 0.54, 0.32), ...overtone(0.16, 0.24, 0.18), ...waver(0.24, 0.3),
      ...breath(1, 0.64, 0.86, 0.46, 0.42), ...life(0.46, 0.14, 0.38, 0.58, 0.18),
      ...evolve(0.26, 0.58, 0.28), ...veil(0.54, 0.72, 0.58, 0.8, 0.08), ...trim(0.48),
    },
    macros: macros(0.74, 0.2, 0.2, 0.36),
  },
  {
    id: 'pneuma-xiao-courtyard', name: 'Vertical Xiao', family: 'sustained',
    blurb: 'purple bamboo · intimate notch breath',
    description:
      'End-blown Chinese xiao flute with a delicate V-notch edge: hushed, inward, and rich in breath turbulence for quiet solo lines.',
    params: {
      ...body(0.2, 0.012, 0.22, 0.35, 0.6, 3, 0.38, 0.48),
      ...sung(0.52, 0.44, 0.28), ...overtone(0.18, 0.26, 0.18), ...waver(0.18, 0.28),
      ...breath(1, 0.6, 0.9, 0.42, 0.38), ...life(0.48, 0.15, 0.42, 0.56, 0.16),
      ...evolve(0.28, 0.56, 0.3), ...veil(0.52, 0.7, 0.56, 0.78, 0.06), ...trim(0.48),
    },
    macros: macros(0.76, 0.18, 0.18, 0.34),
  },
  {
    id: 'pneuma-andean-zampona', name: 'Highland Panpipe', family: 'sustained',
    blurb: 'closed cane tubes · chuff & wind',
    description:
      'Stopped cane panpipes blown across the top rim at high altitude — crisp turbulent air burst followed by odd-harmonic hollow cane warmth.',
    params: {
      ...body(0.24, 0.016, 0.28, 0.32, 0.62, 3, 0.48, 0.46),
      ...sung(0.6, 0.48, 0.34), ...overtone(0.14, 0.3, 0.22), ...waver(0.28, 0.36),
      ...breath(1, 0.7, 0.88, 0.52, 0.48), ...life(0.52, 0.18, 0.46, 0.62, 0.22),
      ...evolve(0.18, 0.62, 0.24), ...veil(0.58, 0.78, 0.64, 0.82, 0.1), ...trim(0.46),
    },
    macros: macros(0.78, 0.22, 0.22, 0.38),
  },
  {
    id: 'pneuma-sirocco-canyon', name: 'Canyon Sirocco', family: 'soundscape',
    blurb: 'desert sandstone wind · ghostly fifths',
    description:
      'Warm desert wind whistling across carved red-rock apertures — almost pure breath sculpted by slow resonant cavities.',
    params: {
      ...body(0.18, 0.032, 0.48, 0.32, 0.64, 4, 0.5, 0.24),
      ...sung(0.8, 0.22, 0.56), ...overtone(0.12, 0.46, 0.36), ...waver(0.14, 0.16),
      ...breath(1, 0.54, 0.94, 0.38, 0.32), ...life(0.72, 0.14, 0.22, 0.68, 0.06),
      ...evolve(0.56, 0.52, 0.58), ...veil(0.72, 0.9, 0.78, 0.86, 0.14, 2, 0.3), ...trim(0.5),
    },
    macros: macros(0.74, 0.2, 0.24, 0.56),
  },
  {
    id: 'pneuma-kaval-shepherd', name: 'Balkan Rim Kaval', family: 'sustained',
    blurb: 'plumwood rim · smoky mountain air',
    description:
      'An open-tube Bulgarian kaval played slightly tilted across its rim — rich low breath noise over sweet wooden fundamental warmth.',
    params: {
      ...body(0.24, 0.01, 0.22, 0.36, 0.58, 3, 0.34, 0.5),
      ...sung(0.52, 0.46, 0.28), ...overtone(0.22, 0.24, 0.18), ...waver(0.26, 0.32),
      ...breath(1, 0.68, 0.88, 0.48, 0.44), ...life(0.48, 0.16, 0.42, 0.58, 0.2),
      ...evolve(0.22, 0.6, 0.26), ...veil(0.52, 0.72, 0.56, 0.78, 0.06), ...trim(0.48),
    },
    macros: macros(0.76, 0.18, 0.18, 0.34),
  },
  {
    id: 'pneuma-fujara-overtone', name: 'Carpathian Fujara', family: 'sustained',
    blurb: 'tall overtone flute · deep wooden sigh',
    description:
      'Towering Slovak shepherd bass flute: heavy breath attack opening into gentle wooden overtones floating in mountain air.',
    params: {
      ...body(0.26, 0.008, 0.26, 0.38, 0.62, 3, 0.4, 0.44),
      ...sung(0.44, 0.38, 0.34), ...overtone(0.28, 0.32, 0.16), ...waver(0.18, 0.22),
      ...breath(1, 0.64, 0.9, 0.44, 0.46), ...life(0.5, 0.18, 0.36, 0.62, 0.16),
      ...evolve(0.3, 0.58, 0.32), ...veil(0.6, 0.8, 0.64, 0.82, 0.08), ...trim(0.48),
    },
    macros: macros(0.78, 0.22, 0.22, 0.36),
  },
  {
    id: 'pneuma-ocarina-clay', name: 'Vessel Clay Ocarina', family: 'sustained',
    blurb: 'spherical terracotta · pure airy breath',
    description:
      'Fired-clay spherical vessel flute with soft, intimate breath onset and almost pure rounded vessel pitch.',
    params: {
      ...body(0.18, 0.004, 0.16, 0.34, 0.54, 4, 0.44, 0.56),
      ...sung(0.42, 0.58, 0.24), ...overtone(0.1, 0.22, 0.2), ...waver(0.28, 0.38),
      ...breath(1, 0.58, 0.86, 0.4, 0.36), ...life(0.42, 0.12, 0.32, 0.56, 0.22),
      ...evolve(0.2, 0.54, 0.24), ...veil(0.56, 0.74, 0.6, 0.8, 0.05), ...trim(0.5),
    },
    macros: macros(0.7, 0.16, 0.2, 0.32),
  },
];

/**
 * Find a preset by id across every bank in the suite.
 *
 * The ensemble refers to presets by id alone — a layer says "play cantus-overtone", not "play
 * entry 2 of the CANTUS bank" — so the lookup has to span all four rather than requiring the
 * caller to already know which instrument owns it.
 */
export function findSuitePreset(id: string): { instrument: SuiteInstrument; preset: VelaPreset } | null {
  for (const inst of SUITE_ORDER) {
    const bank = inst === 'vela' ? VELA_PRESETS : presetsFor(inst);
    const preset = bank.find((p) => p.id === id);
    if (preset) return { instrument: inst, preset };
  }
  return null;
}

export function presetsFor(instrument: SuiteInstrument): VelaPreset[] {
  switch (instrument) {
    case 'cantus': return CANTUS_PRESETS;
    case 'ison': return ISON_PRESETS;
    case 'pneuma': return PNEUMA_PRESETS;
    default: return [];
  }
}

// ── The ensemble ─────────────────────────────────────────────────────────────

export interface EnsembleLayer {
  instrument: SuiteInstrument;
  presetId: string;
  /** 0..1 how present this layer right now. */
  level: number;
}

/**
 * Which instruments are sounding, and how much, at a given point in a session.
 *
 * The drone is the only constant — everything else is heard against it, and it fades but never
 * fully leaves until Return. Voices carry Settling, breath carries Depth because it is the
 * emptiest thing available, and the body appears only at the Turn, which is the one struck
 * gesture in twenty minutes.
 *
 * Layers CROSSFADE rather than switch. An instrument appearing at full level is an event, and
 * the arc has exactly one of those in it on purpose.
 */
export function ensembleFor(phase: string, depth: number, arousal: number): EnsembleLayer[] {
  const fade = (centre: number, width: number) =>
    Math.max(0, 1 - Math.abs(depth - centre) / width);

  const layers: EnsembleLayer[] = [
    {
      instrument: 'ison',
      presetId: depth > 0.6 ? 'ison-cavern' : 'ison-shruti',
      // Always there, and always UNDER. Everything else is heard against the drone, so it has
      // to sit below whichever voice is carrying — at its first tuning it ran 0.44 against
      // voices at 0.31 through the whole middle of the session, which is the drone competing
      // rather than supporting. It thins with depth rather than ducking.
      level: 0.40 - depth * 0.14,
    },
    {
      instrument: 'cantus',
      // The calm register is the ETHEREAL CHOIR (Vault), not the overtone whistle. `cantus-overtone`
      // is a demonstration piece — an isolated high harmonic — and sitting on it for most of a
      // session reads as a constant high whine rather than a voice. Plainsong carries the more
      // aroused moments; the whistle stays in the bank for deliberate use, never as the bed.
      presetId: arousal > 0.6 ? 'cantus-plainsong' : 'cantus-vault',
      level: fade(0.35, 0.5) * 0.85,
    },
    {
      instrument: 'pneuma',
      presetId: depth > 0.7 ? 'pneuma-hall' : 'pneuma-ney',
      level: fade(0.85, 0.55) * 0.8,
    },
  ];

  if (phase === 'turn') {
    layers.push({ instrument: 'vela', presetId: 'himalayan-bronze', level: 0.9 });
  }
  if (phase === 'return') {
    // ADJUST the existing voice layer rather than pushing a second one. Two entries for the
    // same instrument is not a blend — downstream keys layers by instrument, so the second
    // simply replaces the first and the level lurches at the phase boundary.
    const voice = layers.find((l) => l.instrument === 'cantus');
    if (voice) {
      // Preset only — no level floor. Depth is falling through Return, so `fade` brings the
      // voice back up on its own; clamping it to a minimum on top of that was a 0.22 step at
      // the phase boundary, which is exactly the lurch this is supposed to avoid.
      //
      // The PATCH change is still a content switch rather than a fade. That is the runner's job
      // to cross over, not something a level curve can express — see StillnessSession.
      voice.presetId = 'cantus-vault';
    }
  }
  return layers.filter((l) => l.level > 0.02);
}
