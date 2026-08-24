// BAJO's factory bank.
//
// Ported from the Phase-0 Web Audio prototype, retuned for the Rust core. The prototype's five
// wavetable families are not here yet — these patches use the analog oscillators, because on a
// bass the character lives in the unison, the filter, Scorch and the Throat far more than in the
// table. (The Reese/Growl tables are a follow-up; see BAJO_NOTES.md.)
//
// Values are the engine's normalised 0..1 space. The helpers at the top convert from real units,
// so a preset reads as "cutoff 420 Hz" rather than as "0.466" — which is the difference between
// a bank someone can edit and a bank of magic numbers.

import { P, O, F, E, osc, flt, env, S, T, W, G, SC, SP, RV, MONO_BELOW, scorch } from './params';

export type BajoMacro = 'weight' | 'grit' | 'wobble' | 'space';

export interface BajoPreset {
  id: string;
  name: string;
  genre: string;
  description: string;
  /** 'phys' patches lead with the string engine — the acoustic end of the range. */
  family: 'synth' | 'phys';
  params: Record<number, number>;
  macros: Record<BajoMacro, number>;
  /** Wavetable id per oscillator slot. Absent or '' leaves that oscillator analog. */
  tables?: string[];
  /** Morph-pad wiring. Absent falls back to cutoff on X, Scorch drive on Y. */
  padX?: Array<{ id: number; lo: number; hi: number }>;
  padY?: Array<{ id: number; lo: number; hi: number }>;
  lane?: number[];
  grid?: number[][];
}

// ── unit helpers ─────────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Hz → the engine's exponential cutoff space (20 Hz .. 20 kHz). */
const cut = (hz: number) => clamp01(Math.log(hz / 20) / Math.log(1000));
/** Seconds → the engine's cubic envelope-time space (1 ms .. 12 s). */
const sec = (t: number) => clamp01(Math.cbrt(Math.max(0, t - 0.001) / 12));
/** Semitones → the ±24 coarse space. */
const semi = (n: number) => clamp01(0.5 + n / 48);
/** A bipolar −1..+1 control stored as 0..1. */
const bi = (v: number) => clamp01(0.5 + v / 2);
/** Hz → the sub-safe split space (30..300 Hz). */
const subHz = (hz: number) => clamp01((hz - 30) / 270);
/** Hz → the mono-fold space (20..320 Hz). */
const monoHz = (hz: number) => clamp01((hz - 20) / 300);
/** ms → the tape-echo time space (40..900 ms). */
const ecMs = (ms: number) => clamp01((ms - 40) / 860);

/** Lane shorthand: one character per 16th, indexing LANE_DIVS. */
const lane = (s: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 16; i++) out.push(Math.max(0, '0123456789abc'.indexOf(s[i] ?? '6')));
  return out;
};
/** Gate grid shorthand: four 16-character rows, Sub / Low / Mid / Air. */
const grid = (rows: [string, string, string, string]): number[][] =>
  rows.map((r) => Array.from({ length: 16 }, (_, i) => (r[i] === '1' ? 1 : 0)));

/** The shared skeleton every patch starts from, so a preset only states what it changes. */
const base = (): Record<number, number> => ({
  [P.MASTER_GAIN]: 0.7,
  [P.VOICE_MODE]: 1, // mono — bass is monophonic far more often than not
  [P.GLIDE]: 0.02,
  [P.UNISON_COUNT]: 0,
  [P.UNISON_DETUNE]: 0.15,
  [P.UNISON_WIDTH]: 0.5,
  [osc(0, O.ENABLE)]: 1,
  [osc(0, O.MODE)]: 1, // analog
  [osc(0, O.ANALOG_SHAPE)]: 0, // saw
  [osc(0, O.LEVEL)]: 0.8,
  [osc(0, O.COARSE)]: semi(0),
  [osc(1, O.ENABLE)]: 0,
  [osc(1, O.MODE)]: 1,
  [osc(1, O.ANALOG_SHAPE)]: 0, // saw
  [osc(1, O.LEVEL)]: 0,
  [osc(1, O.COARSE)]: semi(0),
  [osc(1, O.FINE)]: 0.5,
  [P.SUB_LEVEL]: 0.5,
  [P.SUB_SHAPE]: 3, // sine
  [P.SUB_OCTAVE]: 0,
  [P.NOISE_LEVEL]: 0,
  [flt(0, F.ENABLE)]: 1,
  [flt(0, F.TYPE)]: 0, // ladder
  [flt(0, F.CUTOFF)]: cut(900),
  [flt(0, F.RES)]: 0.15,
  [flt(0, F.ENV_AMT)]: bi(0.3),
  [flt(0, F.KEYTRACK)]: 0.25,
  [flt(0, F.DRIVE)]: 0.2,
  [env(0, E.ATTACK)]: sec(0.004),
  [env(0, E.DECAY)]: sec(0.5),
  [env(0, E.SUSTAIN)]: 0.85,
  [env(0, E.RELEASE)]: sec(0.25),
  [env(1, E.ATTACK)]: sec(0.002),
  [env(1, E.DECAY)]: sec(0.3),
  [env(1, E.SUSTAIN)]: 0.4,
  [env(1, E.RELEASE)]: sec(0.25),
  [SC.SAFE]: 1,
  [SC.SUB]: subHz(95),
  [MONO_BELOW]: monoHz(120),
});

const preset = (
  id: string,
  name: string,
  genre: string,
  family: 'synth' | 'phys',
  description: string,
  params: Record<number, number>,
  macros: Record<BajoMacro, number>,
  extra?: {
    lane?: number[]; grid?: number[][]; tables?: string[];
    padX?: Array<{ id: number; lo: number; hi: number }>;
    padY?: Array<{ id: number; lo: number; hi: number }>;
  },
): BajoPreset => ({
  id, name, genre, family, description,
  params: { ...base(), ...params },
  macros,
  tables: extra?.tables,
  lane: extra?.lane,
  grid: extra?.grid,
  padX: extra?.padX,
  padY: extra?.padY,
});

/** A pad destination. Terse because these are written by the dozen. */
const pd = (id: number, lo: number, hi: number) => ({ id, lo, hi });

/**
 * Put an oscillator on a wavetable at a morph position.
 *
 * The analog oscillator stays the right answer for a plain sine or saw — it is exact and cheaper.
 * These four families are what the analog shapes cannot do: a phase-smeared Reese, a formant
 * that climbs the harmonic series, a folder that gains harmonics as it opens, an inharmonic comb.
 */
const wt = (slot: number, morph: number): Record<number, number> => ({
  [osc(slot, O.ENABLE)]: 1,
  [osc(slot, O.MODE)]: 0, // wavetable
  [osc(slot, O.MORPH)]: clamp01(morph),
});
export const TBL = {
  analog: 'bajo-analog',
  reese: 'bajo-reese',
  growl: 'bajo-growl',
  fold: 'bajo-fold',
  metal: 'bajo-metal',
} as const;

export const BAJO_PRESETS: BajoPreset[] = [
  // ── Dubstep ────────────────────────────────────────────────────────────────
  preset('yeti-growl', 'Yeti Growl', 'Dubstep', 'synth',
    'Formant growl on an eighth-to-sixteenth lane. The one that talks.',
    {
      ...wt(0, 0.52),
      [P.UNISON_COUNT]: 0.14, [P.UNISON_DETUNE]: 0.2, [P.UNISON_WIDTH]: 0.35,
      [P.SUB_LEVEL]: 0.7,
      [flt(0, F.CUTOFF)]: cut(420), [flt(0, F.RES)]: 0.55, [flt(0, F.DRIVE)]: 0.45,
      [flt(0, F.ENV_AMT)]: bi(0.35),
      [env(0, E.DECAY)]: sec(0.6), [env(0, E.SUSTAIN)]: 0.95, [env(0, E.RELEASE)]: sec(0.14),
      [T.AMOUNT]: 0.55, [T.VOWEL]: 0.35, [T.Q]: 0.5,
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.06,
      [W.DEST1]: 0, [W.DEPTH1]: 0.85, [W.DEST2]: 2, [W.DEPTH2]: 0.5,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.45, [scorch(0, SC.BIAS)]: bi(0.25),
      [scorch(1, SC.ALG)]: 4, [scorch(1, SC.DRIVE)]: 0.35, [scorch(1, SC.MIX)]: 0.7,
      [SC.FOCUS]: bi(0.4), [SC.SUB]: subHz(90),
      [RV.SIZE]: 0.34, [RV.MIX]: 0.1,
    },
    { weight: 0.7, grit: 0.55, wobble: 0.85, space: 0.15 },
    { padX: [pd(T.VOWEL, 0.05, 0.95)], padY: [pd(W.DEPTH1, 0.25, 1), pd(scorch(1, SC.DRIVE), 0.1, 0.75)],
      tables: [TBL.growl],
      lane: lane('6666999966668b8b') }),

  preset('riddim-snarl', 'Riddim Snarl', 'Dubstep', 'synth',
    'Square rip through the Ghost Gate. Sub solid, everything above it chopped.',
    {
      ...wt(1, 0.3),
      [osc(0, O.ANALOG_SHAPE)]: 1, [osc(0, O.PULSE_WIDTH)]: 0.35,
      [P.UNISON_COUNT]: 0.07,
      [P.SUB_LEVEL]: 0.75,
      [flt(0, F.CUTOFF)]: cut(520), [flt(0, F.RES)]: 0.62, [flt(0, F.DRIVE)]: 0.6,
      [env(0, E.DECAY)]: sec(0.4), [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: sec(0.08),
      [W.ENABLE]: 1, [W.SHAPE]: 8, [W.SMOOTH]: 0.02, [W.DEST1]: 0, [W.DEPTH1]: 0.9,
      [G.ENABLE]: 1, [G.DEPTH]: 1, [G.SLEW]: 0.06, [G.SPILL]: 0.45,
      [scorch(0, SC.ALG)]: 5, [scorch(0, SC.DRIVE)]: 0.55, [scorch(0, SC.BIAS)]: bi(0.3),
      [scorch(1, SC.ALG)]: 6, [scorch(1, SC.DRIVE)]: 0.3, [scorch(1, SC.MIX)]: 0.45,
      [SC.FOCUS]: bi(0.55), [SC.SUB]: subHz(105),
      [RV.SIZE]: 0.5, [RV.MIX]: 0.14,
    },
    { weight: 0.75, grit: 0.7, wobble: 0.9, space: 0.2 },
    { padX: [pd(flt(0, F.CUTOFF), cut(180), cut(3200))], padY: [pd(G.SPILL, 0, 0.9)],
     
      tables: ['', TBL.metal],
      lane: lane('9999bbbb99996666'),
      grid: grid(['1111111111111111', '1010110110101101', '1100101011001010', '1010010110100101']),
    }),

  preset('neuro-reese', 'Neuro Reese', 'Dubstep', 'synth',
    'Wide detuned drone with the wobble on cutoff and drive at once.',
    {
      ...wt(0, 0.55), ...wt(1, 0.62),
      [P.UNISON_COUNT]: 0.27, [P.UNISON_DETUNE]: 0.42, [P.UNISON_WIDTH]: 0.8,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.LEVEL)]: 0.5, [osc(1, O.FINE)]: 0.36,
      [P.SUB_LEVEL]: 0.5,
      [flt(0, F.CUTOFF)]: cut(700), [flt(0, F.RES)]: 0.35, [flt(0, F.DRIVE)]: 0.5,
      [env(0, E.DECAY)]: sec(0.8), [env(0, E.SUSTAIN)]: 0.95,
      [W.ENABLE]: 1, [W.SHAPE]: 1, [W.SMOOTH]: 0.2,
      [W.DEST1]: 0, [W.DEPTH1]: 0.5, [W.DEST2]: 5, [W.DEPTH2]: 0.35,
      [scorch(0, SC.ALG)]: 2, [scorch(0, SC.DRIVE)]: 0.5,
      [scorch(1, SC.ALG)]: 4, [scorch(1, SC.DRIVE)]: 0.4, [scorch(1, SC.MIX)]: 0.6,
      [SC.FOCUS]: bi(0.5), [SC.SUB]: subHz(80),
      [SP.CH_ON]: 1, [SP.CH_DEPTH]: 0.5, [SP.CH_MIX]: 0.3,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.12,
    },
    { weight: 0.6, grit: 0.6, wobble: 0.5, space: 0.25 },
    { padX: [pd(osc(0, O.MORPH), 0.1, 0.95)], padY: [pd(scorch(1, SC.DRIVE), 0.05, 0.85), pd(flt(0, F.RES), 0.1, 0.7)],
      tables: [TBL.reese, TBL.reese],
      lane: lane('9999999966669999') }),

  preset('talkbox-wob', 'Talkbox Wob', 'Dubstep', 'synth',
    'The wobble drives the vowel, not the filter. Pure mouth.',
    {
      ...wt(0, 0.35),
      [P.UNISON_COUNT]: 0.14, [P.SUB_LEVEL]: 0.65,
      [flt(0, F.CUTOFF)]: cut(900), [flt(0, F.RES)]: 0.25, [flt(0, F.DRIVE)]: 0.3,
      [T.AMOUNT]: 0.85, [T.VOWEL]: 0.4, [T.Q]: 0.65,
      [env(0, E.DECAY)]: sec(0.6), [env(0, E.SUSTAIN)]: 0.95,
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.15,
      [W.DEST1]: 2, [W.DEPTH1]: 0.9, [W.DEST2]: 0, [W.DEPTH2]: 0.35,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.35,
      [SC.SUB]: subHz(85),
      [SP.DL_ON]: 1, [SP.DL_DIV]: 4, [SP.DL_FB]: 0.3, [SP.DL_MIX]: 0.15,
      [RV.MIX]: 0.12,
    },
    { weight: 0.65, grit: 0.35, wobble: 0.9, space: 0.25 },
    { padX: [pd(T.VOWEL, 0, 1)], padY: [pd(T.Q, 0.1, 0.9), pd(W.DEPTH1, 0.3, 1)],
      tables: [TBL.growl],
      lane: lane('6666666699999999') }),

  preset('colossus', 'Colossus', 'Dubstep', 'synth',
    'Half-time lurch on half-note and quarter-note lane slots.',
    {
      ...wt(0, 0.28),
      [P.UNISON_COUNT]: 0.07,
      [P.SUB_LEVEL]: 0.95,
      [flt(0, F.CUTOFF)]: cut(280), [flt(0, F.RES)]: 0.45, [flt(0, F.DRIVE)]: 0.4,
      [env(0, E.ATTACK)]: sec(0.02), [env(0, E.DECAY)]: sec(1.2), [env(0, E.SUSTAIN)]: 0.95,
      [env(0, E.RELEASE)]: sec(0.35),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.3, [W.DEST1]: 0, [W.DEPTH1]: 0.8,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.4, [scorch(0, SC.BIAS)]: bi(0.2),
      [SC.SUB]: subHz(70),
      [RV.SIZE]: 0.74, [RV.MIX]: 0.2, [MONO_BELOW]: monoHz(150),
    },
    { weight: 0.9, grit: 0.45, wobble: 0.8, space: 0.3 },
    { tables: [TBL.fold],
      lane: lane('1111333311116666') }),
  preset('screech-metal', 'Screech Metal', 'Dubstep', 'synth',
    'Inharmonic comb, sample-and-hold on the morph. The nastiest thing here.',
    {
      ...wt(0, 0.6), ...wt(1, 0.55),
      [osc(0, O.LEVEL)]: 0.7,
      [osc(1, O.LEVEL)]: 0.4, [osc(1, O.COARSE)]: semi(17),
      [P.SUB_LEVEL]: 0.55,
      [flt(0, F.CUTOFF)]: cut(1800), [flt(0, F.RES)]: 0.55, [flt(0, F.ENV_AMT)]: bi(0.5),
      [flt(0, F.DRIVE)]: 0.55,
      [env(0, E.ATTACK)]: sec(0.002), [env(0, E.DECAY)]: sec(0.5), [env(0, E.SUSTAIN)]: 0.85,
      [env(0, E.RELEASE)]: sec(0.1),
      // Sample-and-hold onto the morph: the comb spacing jumps per step instead of sweeping,
      // which is what makes it read as a machine rather than as a filter.
      [W.ENABLE]: 1, [W.SHAPE]: 5, [W.SMOOTH]: 0,
      [W.DEST1]: 4, [W.DEPTH1]: 0.7, [W.DEST2]: 0, [W.DEPTH2]: 0.6,
      [scorch(0, SC.ALG)]: 3, [scorch(0, SC.DRIVE)]: 0.55,
      [scorch(1, SC.ALG)]: 5, [scorch(1, SC.DRIVE)]: 0.4, [scorch(1, SC.MIX)]: 0.55,
      [scorch(2, SC.ALG)]: 6, [scorch(2, SC.DRIVE)]: 0.3, [scorch(2, SC.MIX)]: 0.35,
      [SC.FOCUS]: bi(0.7), [SC.SUB]: subHz(110),
      [RV.SIZE]: 0.34, [RV.MIX]: 0.12,
    },
    { weight: 0.55, grit: 0.8, wobble: 0.75, space: 0.15 },
    { padX: [pd(osc(0, O.MORPH), 0, 1)], padY: [pd(flt(0, F.CUTOFF), cut(300), cut(9000))],
      tables: [TBL.metal, TBL.metal],
      lane: lane('bbbb9999bbbb6666') }),


  preset('sub-drop', 'Sub Drop', 'Dubstep', 'synth',
    'Pure sine that dives. Nothing above 200 Hz to get in the way.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.45,
      [P.SUB_LEVEL]: 1, [P.GLIDE]: 0.18,
      [flt(0, F.CUTOFF)]: cut(180), [flt(0, F.RES)]: 0.05, [flt(0, F.ENV_AMT)]: bi(0),
      [env(0, E.DECAY)]: sec(2.5), [env(0, E.SUSTAIN)]: 0.6, [env(0, E.RELEASE)]: sec(0.5),
      [W.ENABLE]: 1, [W.SHAPE]: 2, [W.SMOOTH]: 0.6, [W.DEST1]: 1, [W.DEPTH1]: 0.35,
      [scorch(0, SC.ALG)]: 9, [scorch(0, SC.DRIVE)]: 0.15, [scorch(0, SC.MIX)]: 0.4,
      [SC.SUB]: subHz(60), [MONO_BELOW]: monoHz(200),
    },
    { weight: 1, grit: 0.15, wobble: 0.35, space: 0.05 },
    { lane: lane('0000000011111111') }),

  // ── EDM ────────────────────────────────────────────────────────────────────
  preset('festival-donk', 'Festival Donk', 'EDM', 'synth',
    'Short, hard, mono. Gets out of the way of the kick.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 1, [osc(0, O.PULSE_WIDTH)]: 0.42,
      [P.UNISON_COUNT]: 0.07, [P.SUB_LEVEL]: 0.6,
      [flt(0, F.CUTOFF)]: cut(1100), [flt(0, F.RES)]: 0.3, [flt(0, F.ENV_AMT)]: bi(0.65),
      [flt(0, F.DRIVE)]: 0.4,
      [env(0, E.ATTACK)]: sec(0.001), [env(0, E.DECAY)]: sec(0.16), [env(0, E.SUSTAIN)]: 0,
      [env(0, E.RELEASE)]: sec(0.09),
      [env(1, E.DECAY)]: sec(0.09), [env(1, E.SUSTAIN)]: 0,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.4,
      [SC.SUB]: subHz(95),
      [SP.CH_ON]: 1, [SP.CH_DEPTH]: 0.3, [SP.CH_MIX]: 0.2, [RV.MIX]: 0.1,
    },
    { weight: 0.6, grit: 0.45, wobble: 0, space: 0.15 }),

  preset('future-growl', 'Future Growl', 'EDM', 'synth',
    'Chopped festival bass. The gate does the rhythm, not the envelope.',
    {
      ...wt(0, 0.42), ...wt(1, 0.4),
      [P.UNISON_COUNT]: 0.2, [P.UNISON_DETUNE]: 0.3, [P.UNISON_WIDTH]: 0.6,
      [P.SUB_LEVEL]: 0.6,
      [flt(0, F.CUTOFF)]: cut(850), [flt(0, F.RES)]: 0.42, [flt(0, F.DRIVE)]: 0.45,
      [T.AMOUNT]: 0.35, [T.VOWEL]: 0.5,
      [env(0, E.DECAY)]: sec(0.35), [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: sec(0.1),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.1,
      [W.DEST1]: 0, [W.DEPTH1]: 0.6, [W.DEST2]: 2, [W.DEPTH2]: 0.4,
      [G.ENABLE]: 1, [G.DEPTH]: 0.9, [G.SLEW]: 0.1, [G.SPILL]: 0.35,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.4,
      [scorch(1, SC.ALG)]: 4, [scorch(1, SC.DRIVE)]: 0.3, [scorch(1, SC.MIX)]: 0.55,
      [SC.FOCUS]: bi(0.35), [RV.SIZE]: 0.5, [RV.MIX]: 0.14,
    },
    { weight: 0.6, grit: 0.5, wobble: 0.6, space: 0.2 },
    {
      tables: [TBL.growl, TBL.reese],
      lane: lane('9999666699996666'),
      grid: grid(['1111111111111111', '1101110111011101', '1010101011101010', '1001101010011010']),
    }),

  preset('slap-house', 'Slap House Pluck', 'EDM', 'synth',
    'Tuned pluck with a long glide between notes.',
    {
      [P.UNISON_COUNT]: 0.14, [P.UNISON_DETUNE]: 0.18, [P.GLIDE]: 0.04,
      [P.SUB_LEVEL]: 0.55,
      [flt(0, F.CUTOFF)]: cut(760), [flt(0, F.RES)]: 0.25, [flt(0, F.ENV_AMT)]: bi(0.55),
      [env(0, E.DECAY)]: sec(0.4), [env(0, E.SUSTAIN)]: 0.15, [env(0, E.RELEASE)]: sec(0.14),
      [env(1, E.DECAY)]: sec(0.16), [env(1, E.SUSTAIN)]: 0.1,
      [scorch(0, SC.ALG)]: 0, [scorch(0, SC.DRIVE)]: 0.3,
      [SP.DL_ON]: 1, [SP.DL_DIV]: 4, [SP.DL_FB]: 0.25, [SP.DL_MIX]: 0.12,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.16,
    },
    { weight: 0.55, grit: 0.3, wobble: 0, space: 0.3 }),
  preset('big-room-saw', 'Big Room Saw', 'EDM', 'synth',
    'Six voices of unison across the drop. Wide, and unapologetic about it.',
    {
      ...wt(0, 0.5), ...wt(1, 0.5),
      [osc(0, O.LEVEL)]: 0.85,
      [osc(1, O.LEVEL)]: 0.4, [osc(1, O.COARSE)]: semi(-12),
      [P.UNISON_COUNT]: 0.34, [P.UNISON_DETUNE]: 0.34, [P.UNISON_WIDTH]: 0.85,
      [P.SUB_LEVEL]: 0.5,
      [flt(0, F.CUTOFF)]: cut(1400), [flt(0, F.RES)]: 0.15, [flt(0, F.ENV_AMT)]: bi(0.35),
      [flt(0, F.DRIVE)]: 0.35,
      [env(0, E.DECAY)]: sec(0.5), [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: sec(0.15),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.35, [W.DEST1]: 0, [W.DEPTH1]: 0.3,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.35,
      [scorch(1, SC.ALG)]: 0, [scorch(1, SC.DRIVE)]: 0.25,
      [SC.FOCUS]: bi(0.3), [SC.SUB]: subHz(100),
      [SP.CH_ON]: 1, [SP.CH_DEPTH]: 0.5, [SP.CH_MIX]: 0.35,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.18,
    },
    { weight: 0.55, grit: 0.4, wobble: 0.3, space: 0.3 },
    { tables: [TBL.analog, TBL.analog],
      lane: lane('3333333366663333') }),


  // ── House ──────────────────────────────────────────────────────────────────
  preset('deep-round', 'Deep House Round', 'House', 'synth',
    'Warm, filtered, polite. Sits under a chord and stays there.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 2, [P.UNISON_COUNT]: 0.07,
      [P.SUB_LEVEL]: 0.6, [P.SUB_SHAPE]: 2,
      [flt(0, F.TYPE)]: 1, [flt(0, F.CUTOFF)]: cut(420), [flt(0, F.RES)]: 0.15,
      [flt(0, F.DRIVE)]: 0.15, [P.GLIDE]: 0.03,
      [env(0, E.DECAY)]: sec(0.5), [env(0, E.SUSTAIN)]: 0.5, [env(0, E.RELEASE)]: sec(0.2),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.2, [scorch(0, SC.MIX)]: 0.7,
      [SC.SUB]: subHz(80), [RV.SIZE]: 0.24, [RV.MIX]: 0.12,
    },
    { weight: 0.6, grit: 0.2, wobble: 0, space: 0.18 }),
  preset('organ-bass', 'Organ Bass', 'House', 'synth',
    'Two sines an octave apart. A drawbar, not a synth.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.6,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 3, [osc(1, O.LEVEL)]: 0.45,
      [osc(1, O.COARSE)]: semi(12),
      [P.SUB_LEVEL]: 0.7, [P.SUB_SHAPE]: 3, [P.NOISE_LEVEL]: 0.02,
      [flt(0, F.TYPE)]: 1, [flt(0, F.CUTOFF)]: cut(1400), [flt(0, F.RES)]: 0.08,
      [flt(0, F.ENV_AMT)]: bi(0.15), [flt(0, F.DRIVE)]: 0.2,
      [env(0, E.DECAY)]: sec(0.3), [env(0, E.SUSTAIN)]: 0.85, [env(0, E.RELEASE)]: sec(0.12),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.3, [scorch(0, SC.MIX)]: 0.6,
      [SP.CH_ON]: 1, [SP.CH_RATE]: 0.13, [SP.CH_DEPTH]: 0.35, [SP.CH_MIX]: 0.25,
      [RV.SIZE]: 0.34, [RV.MIX]: 0.14,
    },
    { weight: 0.7, grit: 0.3, wobble: 0, space: 0.22 }),


  preset('acid-303', 'Acid 303', 'House', 'synth',
    'Resonant squelch. Glide on, envelope hard into the filter.',
    {
      [P.VOICE_MODE]: 2, [P.GLIDE]: 0.035,
      [P.SUB_LEVEL]: 0.35,
      [flt(0, F.TYPE)]: 1, [flt(0, F.CUTOFF)]: cut(300), [flt(0, F.RES)]: 0.85,
      [flt(0, F.ENV_AMT)]: bi(0.8), [flt(0, F.DRIVE)]: 0.5,
      [env(0, E.DECAY)]: sec(0.35), [env(0, E.SUSTAIN)]: 0.7, [env(0, E.RELEASE)]: sec(0.1),
      [env(1, E.DECAY)]: sec(0.28), [env(1, E.SUSTAIN)]: 0,
      [scorch(0, SC.ALG)]: 2, [scorch(0, SC.DRIVE)]: 0.45,
      [scorch(1, SC.ALG)]: 1, [scorch(1, SC.DRIVE)]: 0.3, [scorch(1, SC.MIX)]: 0.6,
      [SC.FOCUS]: bi(0.4), [SC.SUB]: subHz(70),
      [SP.DL_ON]: 1, [SP.DL_DIV]: 4, [SP.DL_FB]: 0.42, [SP.DL_MIX]: 0.2, [RV.MIX]: 0.1,
    },
    { weight: 0.4, grit: 0.55, wobble: 0, space: 0.25 }),

  preset('amapiano-log', 'Amapiano Log', 'House', 'synth',
    'Log-drum pluck: heavy sub, fast filter envelope, real glide.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 2, [P.GLIDE]: 0.06,
      [P.SUB_LEVEL]: 0.75, [P.SUB_SHAPE]: 2,
      [flt(0, F.CUTOFF)]: cut(340), [flt(0, F.RES)]: 0.5, [flt(0, F.ENV_AMT)]: bi(0.8),
      [env(0, E.ATTACK)]: sec(0.001), [env(0, E.DECAY)]: sec(0.3), [env(0, E.SUSTAIN)]: 0,
      [env(0, E.RELEASE)]: sec(0.18),
      [env(1, E.DECAY)]: sec(0.14), [env(1, E.SUSTAIN)]: 0,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.3,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.16, [SP.DL_ON]: 1, [SP.DL_DIV]: 4, [SP.DL_MIX]: 0.1,
    },
    { weight: 0.75, grit: 0.3, wobble: 0, space: 0.25 }),

  preset('garage-wub', 'Garage Wub', 'House', 'synth',
    'Two-step organ wub — an eighth-note lane with sixteenths on the back half.',
    {
      [P.UNISON_COUNT]: 0.07, [P.SUB_LEVEL]: 0.6,
      [flt(0, F.CUTOFF)]: cut(600), [flt(0, F.RES)]: 0.4, [flt(0, F.DRIVE)]: 0.35,
      [env(0, E.DECAY)]: sec(0.4), [env(0, E.SUSTAIN)]: 0.85,
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.2, [W.DEST1]: 0, [W.DEPTH1]: 0.55,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.3,
      [SC.SUB]: subHz(85), [RV.SIZE]: 0.34, [RV.MIX]: 0.14,
    },
    { weight: 0.6, grit: 0.35, wobble: 0.55, space: 0.2 },
    { lane: lane('6666999966669999') }),

  // ── Hip hop ────────────────────────────────────────────────────────────────
  preset('808-cathedral', '808 Cathedral', 'Hip hop', 'synth',
    'Long sine 808 with a glide. Everything else gets out of the way.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.45,
      [P.SUB_LEVEL]: 1, [P.GLIDE]: 0.05,
      [flt(0, F.CUTOFF)]: cut(220), [flt(0, F.RES)]: 0.06, [flt(0, F.ENV_AMT)]: bi(0.25),
      [env(0, E.DECAY)]: sec(2.2), [env(0, E.SUSTAIN)]: 0.35, [env(0, E.RELEASE)]: sec(0.6),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.22, [scorch(0, SC.MIX)]: 0.55,
      [SC.SUB]: subHz(65),
      [RV.SIZE]: 0.74, [RV.MIX]: 0.1, [MONO_BELOW]: monoHz(180),
    },
    { weight: 1, grit: 0.2, wobble: 0, space: 0.2 }),

  preset('distorted-808', 'Distorted 808', 'Hip hop', 'synth',
    'Rage 808 — three stages deep, and the fundamental still survives it.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.6,
      [P.SUB_LEVEL]: 0.95, [P.GLIDE]: 0.04,
      [flt(0, F.CUTOFF)]: cut(520), [flt(0, F.RES)]: 0.15, [flt(0, F.DRIVE)]: 0.55,
      [env(0, E.DECAY)]: sec(1.6), [env(0, E.SUSTAIN)]: 0.4, [env(0, E.RELEASE)]: sec(0.4),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.6, [scorch(0, SC.BIAS)]: bi(0.35),
      [scorch(1, SC.ALG)]: 3, [scorch(1, SC.DRIVE)]: 0.5, [scorch(1, SC.MIX)]: 0.75,
      [scorch(2, SC.ALG)]: 10, [scorch(2, SC.DRIVE)]: 0.3, [scorch(2, SC.MIX)]: 0.5,
      [SC.FOCUS]: bi(0.6), [SC.SUB]: subHz(80), [SC.OUTPUT]: 0.42,
      [MONO_BELOW]: monoHz(190),
    },
    { weight: 0.95, grit: 0.85, wobble: 0, space: 0.05 }),

  preset('memphis-sine', 'Memphis Sine', 'Hip hop', 'synth',
    'Dark and round, through a tape echo that is doing most of the work.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.5,
      [P.SUB_LEVEL]: 0.9, [P.SUB_SHAPE]: 2, [P.GLIDE]: 0.03,
      [flt(0, F.CUTOFF)]: cut(260), [flt(0, F.RES)]: 0.1,
      [env(0, E.DECAY)]: sec(1.1), [env(0, E.SUSTAIN)]: 0.4, [env(0, E.RELEASE)]: sec(0.35),
      [scorch(0, SC.ALG)]: 9, [scorch(0, SC.DRIVE)]: 0.28, [scorch(0, SC.MIX)]: 0.5,
      [SP.EC_ON]: 1, [SP.EC_TIME]: ecMs(330), [SP.EC_FB]: 0.38, [SP.EC_WOW]: 0.4,
      [SP.EC_DRIVE]: 0.5, [SP.EC_DEGRADE]: 0.35, [SP.EC_MIX]: 0.18,
      [RV.SIZE]: 0.42, [RV.MIX]: 0.12, [MONO_BELOW]: monoHz(170),
    },
    { weight: 0.9, grit: 0.25, wobble: 0, space: 0.35 }),

  preset('funk-moog', 'Funk Moog', 'Hip hop', 'synth',
    'Fingered ladder funk. Legato, so a repeated note does not retrigger.',
    {
      [P.VOICE_MODE]: 2, [P.GLIDE]: 0.015,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.LEVEL)]: 0.35, [osc(1, O.COARSE)]: semi(-12),
      [P.SUB_LEVEL]: 0.45,
      [flt(0, F.CUTOFF)]: cut(520), [flt(0, F.RES)]: 0.5, [flt(0, F.ENV_AMT)]: bi(0.7),
      [flt(0, F.KEYTRACK)]: 0.5, [flt(0, F.DRIVE)]: 0.35,
      [env(0, E.DECAY)]: sec(0.4), [env(0, E.SUSTAIN)]: 0.6, [env(0, E.RELEASE)]: sec(0.15),
      [env(1, E.DECAY)]: sec(0.22), [env(1, E.SUSTAIN)]: 0.15,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.35, [scorch(0, SC.BIAS)]: bi(0.15),
      [SC.SUB]: subHz(75), [RV.SIZE]: 0.24, [RV.MIX]: 0.1,
    },
    { weight: 0.5, grit: 0.4, wobble: 0, space: 0.12 }),
  preset('phonk-drift', 'Phonk Drift', 'Hip hop', 'synth',
    'Cowbell-adjacent metal over a saturated sub, through a degraded tape echo.',
    {
      ...wt(0, 0.32),
      [osc(0, O.LEVEL)]: 0.6,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.ANALOG_SHAPE)]: 3, [osc(1, O.LEVEL)]: 0.4,
      [osc(1, O.COARSE)]: semi(-12),
      [P.SUB_LEVEL]: 0.8, [P.GLIDE]: 0.03,
      [flt(0, F.CUTOFF)]: cut(600), [flt(0, F.RES)]: 0.3, [flt(0, F.ENV_AMT)]: bi(0.4),
      [flt(0, F.DRIVE)]: 0.45,
      [env(0, E.ATTACK)]: sec(0.002), [env(0, E.DECAY)]: sec(0.9), [env(0, E.SUSTAIN)]: 0.35,
      [env(0, E.RELEASE)]: sec(0.3),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.5,
      [scorch(1, SC.ALG)]: 6, [scorch(1, SC.DRIVE)]: 0.25, [scorch(1, SC.MIX)]: 0.4,
      [SC.FOCUS]: bi(0.5), [SC.SUB]: subHz(85),
      [SP.EC_ON]: 1, [SP.EC_TIME]: ecMs(250), [SP.EC_FB]: 0.3, [SP.EC_DEGRADE]: 0.5,
      [SP.EC_MIX]: 0.15,
      [RV.SIZE]: 0.42, [RV.MIX]: 0.12,
    },
    { weight: 0.8, grit: 0.5, wobble: 0, space: 0.25 },
    { tables: [TBL.metal] }),


  // ── D&B ────────────────────────────────────────────────────────────────────
  preset('reese-wide', 'Reese Wide', 'D&B', 'synth',
    'The original detuned drone. Two oscillators a hair apart, and let it beat.',
    {
      ...wt(0, 0.35), ...wt(1, 0.48),
      [P.UNISON_COUNT]: 0.2, [P.UNISON_DETUNE]: 0.5, [P.UNISON_WIDTH]: 0.9,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.LEVEL)]: 0.55, [osc(1, O.FINE)]: 0.32,
      [P.SUB_LEVEL]: 0.45,
      [flt(0, F.CUTOFF)]: cut(900), [flt(0, F.RES)]: 0.2, [flt(0, F.DRIVE)]: 0.35,
      [env(0, E.DECAY)]: sec(1), [env(0, E.SUSTAIN)]: 0.95, [env(0, E.RELEASE)]: sec(0.25),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.SMOOTH]: 0.4,
      [W.DEST1]: 0, [W.DEPTH1]: 0.35, [W.DEST2]: 5, [W.DEPTH2]: 0.25,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.35,
      [SC.SUB]: subHz(80), [SP.CH_ON]: 1, [SP.CH_DEPTH]: 0.4, [SP.CH_MIX]: 0.25,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.14,
    },
    { weight: 0.55, grit: 0.4, wobble: 0.35, space: 0.25 },
    { tables: [TBL.reese, TBL.reese],
      lane: lane('3333666633336666') }),
  preset('jump-up-wob', 'Jump Up Wob', 'D&B', 'synth',
    'Bouncy sixteenth rip with the throat half open. Rude on purpose.',
    {
      ...wt(0, 0.62),
      [osc(0, O.LEVEL)]: 0.85,
      [P.UNISON_COUNT]: 0.07, [P.UNISON_DETUNE]: 0.2,
      [P.SUB_LEVEL]: 0.6,
      [flt(0, F.CUTOFF)]: cut(700), [flt(0, F.RES)]: 0.58, [flt(0, F.ENV_AMT)]: bi(0.4),
      [flt(0, F.DRIVE)]: 0.5,
      [T.AMOUNT]: 0.4, [T.VOWEL]: 0.6,
      [env(0, E.ATTACK)]: sec(0.002), [env(0, E.DECAY)]: sec(0.3), [env(0, E.SUSTAIN)]: 0.9,
      [env(0, E.RELEASE)]: sec(0.08),
      [W.ENABLE]: 1, [W.SHAPE]: 3, [W.SMOOTH]: 0.05, [W.DEST1]: 0, [W.DEPTH1]: 0.8,
      [scorch(0, SC.ALG)]: 3, [scorch(0, SC.DRIVE)]: 0.5,
      [scorch(1, SC.ALG)]: 4, [scorch(1, SC.DRIVE)]: 0.35, [scorch(1, SC.MIX)]: 0.55,
      [SC.FOCUS]: bi(0.45), [SC.SUB]: subHz(90),
      [RV.SIZE]: 0.34, [RV.MIX]: 0.1,
    },
    { weight: 0.6, grit: 0.65, wobble: 0.8, space: 0.12 },
    { tables: [TBL.growl],
      lane: lane('9999999999996666') }),


  // ── Cinematic ──────────────────────────────────────────────────────────────
  preset('braam', 'Braam Engine', 'Cinematic', 'synth',
    'Brass-adjacent trailer hit. Slow attack, long tail, wide.',
    {
      [P.UNISON_COUNT]: 0.27, [P.UNISON_DETUNE]: 0.26, [P.UNISON_WIDTH]: 0.7,
      [osc(1, O.ENABLE)]: 1, [osc(1, O.LEVEL)]: 0.4, [osc(1, O.COARSE)]: semi(-12),
      [P.SUB_LEVEL]: 0.7, [P.NOISE_LEVEL]: 0.05,
      [flt(0, F.CUTOFF)]: cut(700), [flt(0, F.RES)]: 0.25, [flt(0, F.ENV_AMT)]: bi(0.5),
      [env(0, E.ATTACK)]: sec(0.12), [env(0, E.DECAY)]: sec(2), [env(0, E.SUSTAIN)]: 0.7,
      [env(0, E.RELEASE)]: sec(1.4),
      [env(1, E.ATTACK)]: sec(0.09), [env(1, E.DECAY)]: sec(1.2), [env(1, E.SUSTAIN)]: 0.5,
      [W.ENABLE]: 1, [W.SHAPE]: 1, [W.FREE]: 1, [W.RATE]: 0.53, [W.SMOOTH]: 0.5,
      [W.DEST1]: 1, [W.DEPTH1]: 0.18,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.35, [scorch(0, SC.BIAS)]: bi(0.2),
      [SC.SUB]: subHz(75),
      [RV.SIZE]: 0.9, [RV.DECAY]: 0.8, [RV.MIX]: 0.3,
    },
    { weight: 0.7, grit: 0.35, wobble: 0.18, space: 0.55 }),

  preset('trailer-sub', 'Trailer Sub Hit', 'Cinematic', 'synth',
    'The drop under the logo. Long glide down, nothing but weight.',
    {
      [osc(0, O.ANALOG_SHAPE)]: 3, [osc(0, O.LEVEL)]: 0.45, [osc(0, O.COARSE)]: semi(-12),
      [P.SUB_LEVEL]: 1, [P.GLIDE]: 0.34,
      [flt(0, F.CUTOFF)]: cut(140), [flt(0, F.RES)]: 0.05, [flt(0, F.ENV_AMT)]: bi(0.1),
      [env(0, E.ATTACK)]: sec(0.02), [env(0, E.DECAY)]: sec(5), [env(0, E.SUSTAIN)]: 0.5,
      [env(0, E.RELEASE)]: sec(2.5),
      [scorch(0, SC.ALG)]: 9, [scorch(0, SC.DRIVE)]: 0.12, [scorch(0, SC.MIX)]: 0.3,
      [SC.SUB]: subHz(45),
      [RV.SIZE]: 0.9, [RV.DECAY]: 0.95, [RV.MIX]: 0.22, [MONO_BELOW]: monoHz(220),
    },
    { weight: 1, grit: 0.1, wobble: 0, space: 0.45 }),
  preset('dune-drone', 'Dune Drone', 'Cinematic', 'synth',
    'A bed that never settles. The wobble moves the vowel once every six seconds.',
    {
      ...wt(0, 0.35), ...wt(1, 0.45),
      [osc(0, O.LEVEL)]: 0.6,
      [osc(1, O.LEVEL)]: 0.35, [osc(1, O.COARSE)]: semi(-12),
      [P.UNISON_COUNT]: 0.2, [P.UNISON_DETUNE]: 0.34, [P.UNISON_WIDTH]: 0.9,
      [P.SUB_LEVEL]: 0.6, [P.NOISE_LEVEL]: 0.08, [P.NOISE_COLOR]: 1,
      [flt(0, F.CUTOFF)]: cut(420), [flt(0, F.RES)]: 0.25, [flt(0, F.ENV_AMT)]: bi(0.15),
      [flt(0, F.DRIVE)]: 0.25,
      [T.AMOUNT]: 0.3, [T.VOWEL]: 0.5, [T.Q]: 0.2,
      [env(0, E.ATTACK)]: sec(0.9), [env(0, E.DECAY)]: sec(3), [env(0, E.SUSTAIN)]: 0.9,
      [env(0, E.RELEASE)]: sec(2.4),
      // Free-run, not the lane: a drone that locks to the grid stops being a drone.
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.FREE]: 1, [W.RATE]: 0.18, [W.SMOOTH]: 0.7,
      [W.DEST1]: 2, [W.DEPTH1]: 0.4,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.3,
      [scorch(1, SC.ALG)]: 8, [scorch(1, SC.DRIVE)]: 0.2, [scorch(1, SC.MIX)]: 0.3,
      [SC.SUB]: subHz(70),
      [RV.SIZE]: 0.74, [RV.DECAY]: 0.85, [RV.MIX]: 0.34,
    },
    { weight: 0.6, grit: 0.3, wobble: 0.4, space: 0.6 },
    { padX: [pd(osc(0, O.MORPH), 0, 1)], padY: [pd(T.VOWEL, 0, 1)],
      tables: [TBL.fold, TBL.growl] }),


  preset('cello-menace', 'Cello Menace', 'Cinematic', 'phys',
    'Bowed string, leaning on the body. The string engine doing dread.',
    {
      [osc(0, O.LEVEL)]: 0.12, [P.SUB_LEVEL]: 0.25,
      [S.LEVEL]: 0.95, [S.BOW]: 0.85, [S.DAMP]: 0.28, [S.TONE]: 0.55,
      [S.BODY]: 0.7, [S.PICK]: 0.2,
      [flt(0, F.CUTOFF)]: cut(2200), [flt(0, F.RES)]: 0.1, [flt(0, F.DRIVE)]: 0.2,
      [env(0, E.ATTACK)]: sec(0.25), [env(0, E.DECAY)]: sec(1.5), [env(0, E.SUSTAIN)]: 0.9,
      [env(0, E.RELEASE)]: sec(0.8),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.FREE]: 1, [W.RATE]: 0.55, [W.SMOOTH]: 0.5,
      [W.DEST1]: 1, [W.DEPTH1]: 0.1,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.18, [scorch(0, SC.MIX)]: 0.4,
      [SC.SUB]: subHz(60), [RV.SIZE]: 0.42, [RV.MIX]: 0.28,
    },
    { weight: 0.4, grit: 0.2, wobble: 0.1, space: 0.5 }),

  // ── Design ─────────────────────────────────────────────────────────────────
  preset('alien-larynx', 'Alien Larynx', 'Design', 'synth',
    'Sample-and-hold into the vowel bank. Never says the same thing twice.',
    {
      ...wt(0, 0.7), ...wt(1, 0.55),
      [P.UNISON_COUNT]: 0.14, [P.SUB_LEVEL]: 0.4,
      [flt(0, F.TYPE)]: 1, [flt(0, F.MODE)]: 1, [flt(0, F.CUTOFF)]: cut(800),
      [flt(0, F.RES)]: 0.6, [flt(0, F.DRIVE)]: 0.5,
      [T.AMOUNT]: 0.9, [T.VOWEL]: 0.5, [T.Q]: 0.8,
      [env(0, E.DECAY)]: sec(0.8), [env(0, E.SUSTAIN)]: 0.9, [env(0, E.RELEASE)]: sec(0.3),
      [W.ENABLE]: 1, [W.SHAPE]: 5, [W.SMOOTH]: 0,
      [W.DEST1]: 2, [W.DEPTH1]: 0.9, [W.DEST2]: 6, [W.DEPTH2]: 0.55,
      [scorch(0, SC.ALG)]: 2, [scorch(0, SC.DRIVE)]: 0.5,
      [scorch(1, SC.ALG)]: 7, [scorch(1, SC.DRIVE)]: 0.4, [scorch(1, SC.MIX)]: 0.5,
      [SC.FOCUS]: bi(0.5),
      [SP.DL_ON]: 1, [SP.DL_DIV]: 5, [SP.DL_FB]: 0.5, [SP.DL_MIX]: 0.25,
      [RV.SIZE]: 0.42, [RV.MIX]: 0.24,
    },
    { weight: 0.4, grit: 0.6, wobble: 0.9, space: 0.5 },
    { padX: [pd(T.VOWEL, 0, 1)], padY: [pd(T.Q, 0, 1)],
      tables: [TBL.growl, TBL.metal],
      lane: lane('9b9b6a6a9999bbbb') }),
  preset('gravity-well', 'Gravity Well', 'Design', 'synth',
    'Everything falls. Half-second glide, inverted filter envelope, pitch dragged down.',
    {
      ...wt(0, 0.5), ...wt(1, 0.55),
      [osc(0, O.LEVEL)]: 0.7,
      [osc(1, O.LEVEL)]: 0.4, [osc(1, O.COARSE)]: semi(-12),
      [P.UNISON_COUNT]: 0.14, [P.UNISON_DETUNE]: 0.38,
      [P.SUB_LEVEL]: 0.65, [P.GLIDE]: 0.3,
      [flt(0, F.CUTOFF)]: cut(900), [flt(0, F.RES)]: 0.35,
      // Negative env amount: the filter CLOSES as the note sounds, which is why it reads as
      // collapsing rather than as opening up.
      [flt(0, F.ENV_AMT)]: bi(-0.6), [flt(0, F.DRIVE)]: 0.4,
      [env(0, E.ATTACK)]: sec(0.02), [env(0, E.DECAY)]: sec(3), [env(0, E.SUSTAIN)]: 0.7,
      [env(0, E.RELEASE)]: sec(1.2),
      [env(1, E.ATTACK)]: sec(0.01), [env(1, E.DECAY)]: sec(2.2), [env(1, E.SUSTAIN)]: 0.1,
      [W.ENABLE]: 1, [W.SHAPE]: 2, [W.FREE]: 1, [W.RATE]: 0.33, [W.SMOOTH]: 0.5,
      [W.DEST1]: 1, [W.DEPTH1]: 0.5,
      [scorch(0, SC.ALG)]: 4, [scorch(0, SC.DRIVE)]: 0.45,
      [scorch(1, SC.ALG)]: 9, [scorch(1, SC.DRIVE)]: 0.3, [scorch(1, SC.MIX)]: 0.5,
      [SC.SUB]: subHz(60),
      [RV.SIZE]: 0.9, [RV.DECAY]: 0.8, [RV.MIX]: 0.3,
    },
    { weight: 0.65, grit: 0.55, wobble: 0.5, space: 0.55 },
    { padX: [pd(flt(0, F.CUTOFF), cut(80), cut(6000))], padY: [pd(W.DEPTH1, 0, 1)],
      tables: [TBL.fold, TBL.fold] }),


  preset('modem-wreck', 'Modem Wreck', 'Design', 'synth',
    'Bitcrushed data bass, gated at a thirty-second and spilling hard.',
    {
      ...wt(0, 0.85), ...wt(1, 0.4),
      [osc(1, O.ENABLE)]: 1, [osc(1, O.LEVEL)]: 0.45, [osc(1, O.COARSE)]: semi(7),
      [P.SUB_LEVEL]: 0.5, [P.NOISE_LEVEL]: 0.1,
      [flt(0, F.CUTOFF)]: cut(1600), [flt(0, F.RES)]: 0.45, [flt(0, F.DRIVE)]: 0.5,
      [env(0, E.ATTACK)]: sec(0.001), [env(0, E.DECAY)]: sec(0.4), [env(0, E.SUSTAIN)]: 0.85,
      [env(0, E.RELEASE)]: sec(0.06),
      [W.ENABLE]: 1, [W.SHAPE]: 5, [W.SMOOTH]: 0,
      [W.DEST1]: 0, [W.DEPTH1]: 0.85, [W.DEST2]: 5, [W.DEPTH2]: 0.7,
      [G.ENABLE]: 1, [G.DEPTH]: 1, [G.SLEW]: 0.02, [G.SPILL]: 0.6, [G.RATE]: 2,
      [scorch(0, SC.ALG)]: 6, [scorch(0, SC.DRIVE)]: 0.6,
      [scorch(1, SC.ALG)]: 5, [scorch(1, SC.DRIVE)]: 0.45, [scorch(1, SC.MIX)]: 0.6,
      [SC.FOCUS]: bi(0.6),
      [SP.DL_ON]: 1, [SP.DL_DIV]: 7, [SP.DL_FB]: 0.55, [SP.DL_MIX]: 0.24,
      [RV.MIX]: 0.16,
    },
    { weight: 0.5, grit: 0.8, wobble: 0.85, space: 0.4 },
    { padX: [pd(scorch(0, SC.DRIVE), 0.1, 1)], padY: [pd(G.SPILL, 0, 1)],
     
      tables: [TBL.metal, TBL.reese],
      lane: lane('bbbbbbbbaaaa9999'),
      grid: grid(['1111111111111111', '1101011010110101', '1011010110101101', '1110101011010110']),
    }),

  preset('tectonic', 'Tectonic', 'Design', 'synth',
    'Earth-movement rumble. Slow, wide, and mostly felt.',
    {
      ...wt(0, 0.2), ...wt(1, 0.45),
      [osc(0, O.COARSE)]: semi(-12),
      [P.UNISON_COUNT]: 0.14, [P.UNISON_DETUNE]: 0.6,
      [P.SUB_LEVEL]: 0.9, [P.NOISE_LEVEL]: 0.12,
      [flt(0, F.CUTOFF)]: cut(240), [flt(0, F.RES)]: 0.25, [flt(0, F.DRIVE)]: 0.35,
      [env(0, E.ATTACK)]: sec(0.5), [env(0, E.DECAY)]: sec(4), [env(0, E.SUSTAIN)]: 0.85,
      [env(0, E.RELEASE)]: sec(2),
      [W.ENABLE]: 1, [W.SHAPE]: 5, [W.FREE]: 1, [W.RATE]: 0.32, [W.SMOOTH]: 0.4,
      [W.DEST1]: 0, [W.DEPTH1]: 0.3,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.4,
      [scorch(1, SC.ALG)]: 4, [scorch(1, SC.DRIVE)]: 0.25, [scorch(1, SC.MIX)]: 0.35,
      [SC.SUB]: subHz(50),
      [RV.SIZE]: 0.9, [RV.DECAY]: 1, [RV.MIX]: 0.26, [MONO_BELOW]: monoHz(240),
    },
    { weight: 1, grit: 0.45, wobble: 0.3, space: 0.5 },
    { tables: [TBL.fold, TBL.growl] }),

  // ── Acoustic — the string engine leads ─────────────────────────────────────
  preset('upright-jazz', 'Upright Jazz', 'Acoustic', 'phys',
    'Plucked double bass. Body wide open, damping doing the room.',
    {
      [osc(0, O.LEVEL)]: 0.06, [P.SUB_LEVEL]: 0.2, [P.VOICE_MODE]: 2, [P.GLIDE]: 0.01,
      [S.LEVEL]: 1, [S.BOW]: 0, [S.DAMP]: 0.42, [S.TONE]: 0.42, [S.BODY]: 0.8, [S.PICK]: 0.22,
      [flt(0, F.CUTOFF)]: cut(2600), [flt(0, F.RES)]: 0.05, [flt(0, F.DRIVE)]: 0.12,
      [env(0, E.ATTACK)]: sec(0.004), [env(0, E.DECAY)]: sec(1.4), [env(0, E.SUSTAIN)]: 0.15,
      [env(0, E.RELEASE)]: sec(0.35),
      [scorch(0, SC.ALG)]: 9, [scorch(0, SC.DRIVE)]: 0.1, [scorch(0, SC.MIX)]: 0.25,
      [SC.SUB]: subHz(60), [RV.SIZE]: 0.24, [RV.MIX]: 0.14,
    },
    { weight: 0.35, grit: 0.1, wobble: 0, space: 0.2 },
    { padX: [pd(S.DAMP, 0.15, 0.8)], padY: [pd(S.BODY, 0, 1)] }),

  preset('fingered-electric', 'Fingered Electric', 'Acoustic', 'phys',
    'P-bass played soft. The one that sits in a mix without being asked to.',
    {
      [osc(0, O.LEVEL)]: 0.1, [P.SUB_LEVEL]: 0.28, [P.VOICE_MODE]: 2, [P.GLIDE]: 0.008,
      [S.LEVEL]: 0.95, [S.BOW]: 0, [S.DAMP]: 0.3, [S.TONE]: 0.55, [S.BODY]: 0.5, [S.PICK]: 0.3,
      [flt(0, F.CUTOFF)]: cut(3200), [flt(0, F.RES)]: 0.08, [flt(0, F.DRIVE)]: 0.18,
      [env(0, E.ATTACK)]: sec(0.003), [env(0, E.DECAY)]: sec(1.8), [env(0, E.SUSTAIN)]: 0.2,
      [env(0, E.RELEASE)]: sec(0.3),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.18, [scorch(0, SC.MIX)]: 0.4,
      [SC.SUB]: subHz(70), [RV.SIZE]: 0.24, [RV.MIX]: 0.1,
    },
    { weight: 0.4, grit: 0.18, wobble: 0, space: 0.15 }),

  preset('picked-p-bass', 'Picked P-Bass', 'Acoustic', 'phys',
    'Plectrum attack, bright, a little dirt on it.',
    {
      [osc(0, O.LEVEL)]: 0.12, [P.SUB_LEVEL]: 0.3, [P.VOICE_MODE]: 2, [P.GLIDE]: 0.005,
      [S.LEVEL]: 0.95, [S.BOW]: 0, [S.DAMP]: 0.22, [S.TONE]: 0.72, [S.BODY]: 0.42, [S.PICK]: 0.85,
      [flt(0, F.CUTOFF)]: cut(4200), [flt(0, F.RES)]: 0.1, [flt(0, F.DRIVE)]: 0.28,
      [env(0, E.ATTACK)]: sec(0.002), [env(0, E.DECAY)]: sec(1.2), [env(0, E.SUSTAIN)]: 0.25,
      [env(0, E.RELEASE)]: sec(0.22),
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.3, [scorch(0, SC.MIX)]: 0.5,
      [SC.SUB]: subHz(75), [RV.SIZE]: 0.24, [RV.MIX]: 0.09,
    },
    { weight: 0.4, grit: 0.3, wobble: 0, space: 0.12 }),

  preset('fretless-glass', 'Fretless Glass', 'Acoustic', 'phys',
    'Sings, and glides between notes because the delay line really is retuning.',
    {
      [osc(0, O.LEVEL)]: 0.1, [P.SUB_LEVEL]: 0.3, [P.GLIDE]: 0.09,
      [S.LEVEL]: 0.95, [S.BOW]: 0.35, [S.DAMP]: 0.2, [S.TONE]: 0.6, [S.BODY]: 0.65, [S.PICK]: 0.15,
      [flt(0, F.CUTOFF)]: cut(2800), [flt(0, F.RES)]: 0.12, [flt(0, F.DRIVE)]: 0.15,
      [env(0, E.ATTACK)]: sec(0.03), [env(0, E.DECAY)]: sec(2), [env(0, E.SUSTAIN)]: 0.55,
      [env(0, E.RELEASE)]: sec(0.6),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.FREE]: 1, [W.RATE]: 0.55, [W.SMOOTH]: 0.6,
      [W.DEST1]: 1, [W.DEPTH1]: 0.07,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.15, [scorch(0, SC.MIX)]: 0.35,
      [SC.SUB]: subHz(65),
      [SP.CH_ON]: 1, [SP.CH_RATE]: 0.06, [SP.CH_DEPTH]: 0.25, [SP.CH_MIX]: 0.18,
      [RV.SIZE]: 0.5, [RV.MIX]: 0.2,
    },
    { weight: 0.4, grit: 0.15, wobble: 0.07, space: 0.35 },
    { padX: [pd(P.GLIDE, 0.005, 0.25)], padY: [pd(S.BOW, 0, 0.9)] }),

  preset('bowed-contrabass', 'Bowed Contrabass', 'Acoustic', 'phys',
    'Arco, full section weight. Continuous excitation, not a pluck.',
    {
      [osc(0, O.LEVEL)]: 0.08, [P.SUB_LEVEL]: 0.35, [P.VOICE_MODE]: 2, [P.GLIDE]: 0.04,
      [S.LEVEL]: 1, [S.BOW]: 1, [S.DAMP]: 0.3, [S.TONE]: 0.48, [S.BODY]: 0.85, [S.PICK]: 0.1,
      [flt(0, F.CUTOFF)]: cut(1900), [flt(0, F.RES)]: 0.08, [flt(0, F.DRIVE)]: 0.14,
      [env(0, E.ATTACK)]: sec(0.22), [env(0, E.DECAY)]: sec(2), [env(0, E.SUSTAIN)]: 0.85,
      [env(0, E.RELEASE)]: sec(0.9),
      [W.ENABLE]: 1, [W.SHAPE]: 0, [W.FREE]: 1, [W.RATE]: 0.54, [W.SMOOTH]: 0.6,
      [W.DEST1]: 1, [W.DEPTH1]: 0.06,
      [scorch(0, SC.ALG)]: 1, [scorch(0, SC.DRIVE)]: 0.14, [scorch(0, SC.MIX)]: 0.3,
      [SC.SUB]: subHz(55), [RV.SIZE]: 0.42, [RV.MIX]: 0.3,
    },
    { weight: 0.45, grit: 0.14, wobble: 0.06, space: 0.5 },
    { padX: [pd(S.BODY, 0.2, 1)], padY: [pd(RV.MIX, 0.08, 0.55)] }),
];

export const DEFAULT_BAJO_PRESET = BAJO_PRESETS[0];

export const BAJO_GENRES = Array.from(new Set(BAJO_PRESETS.map((p) => p.genre)));

export const findBajoPreset = (id: string): BajoPreset | undefined =>
  BAJO_PRESETS.find((p) => p.id === id);

/**
 * Expand the four Play-surface macros into engine parameters.
 *
 * Done here rather than sent as macro values, because the engine has no idea what "Grit" means.
 * Each macro moves several parameters along a shaped curve, and the curves matter: a linear Grit
 * would spend most of its travel past the point where the patch has already stopped being a bass.
 */
export function expandBajoMacros(
  bas: Record<number, number>,
  macros: Record<BajoMacro, number>,
): Record<number, number> {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const weight = c(macros.weight);
  const grit = c(macros.grit);
  const wobble = c(macros.wobble);
  const space = c(macros.space);
  const at = (id: number, fallback: number) => bas[id] ?? fallback;
  const out: Record<number, number> = { ...bas };

  // Weight: sub level, where sub-safe splits, and how high the mono fold reaches. One control
  // for "how much of this instrument is below 100 Hz".
  out[P.SUB_LEVEL] = c(at(P.SUB_LEVEL, 0.5) * 0.35 + weight * 0.72);
  out[SC.SUB] = c(0.15 + weight * 0.3);
  out[MONO_BELOW] = c(0.2 + weight * 0.4);

  // Grit: squared, because the top of Scorch's range is where the useful bass tone stops and
  // the buzz starts — a linear macro would put half its travel in the unusable half.
  const g2 = grit * grit;
  out[scorch(0, SC.DRIVE)] = c(at(scorch(0, SC.DRIVE), 0) * 0.4 + g2 * 0.7);
  out[scorch(1, SC.DRIVE)] = c(at(scorch(1, SC.DRIVE), 0) * 0.5 + g2 * 0.5);
  out[scorch(2, SC.DRIVE)] = c(at(scorch(2, SC.DRIVE), 0) * 0.6 + g2 * 0.3);
  out[SC.FOCUS] = c(at(SC.FOCUS, 0.5) + grit * 0.18);

  // Wobble: depth on both slots, and the smoothing that decides whether it snarls or sways.
  // Enable follows depth — a wobble control with the section switched off is a dead knob.
  if (wobble > 0.001) out[W.ENABLE] = 1;
  out[W.DEPTH1] = c(at(W.DEPTH1, 0) * wobble * 1.15);
  out[W.DEPTH2] = c(at(W.DEPTH2, 0) * wobble * 1.15);
  out[W.SMOOTH] = c(at(W.SMOOTH, 0.1) * (1.15 - wobble * 0.5));

  // Space: reverb and delay together, so the wet knob is never inaudible.
  out[RV.MIX] = c(at(RV.MIX, 0.1) * 0.4 + space * 0.55);
  if (at(SP.DL_ON, 0) > 0.5) out[SP.DL_MIX] = c(at(SP.DL_MIX, 0.2) * 0.5 + space * 0.35);
  if (at(SP.EC_ON, 0) > 0.5) out[SP.EC_MIX] = c(at(SP.EC_MIX, 0.2) * 0.5 + space * 0.3);

  return out;
}
