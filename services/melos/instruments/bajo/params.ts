// BAJO parameter ids — the TypeScript mirror of the block-1400 constants in
// rust/plajah-audio/src/params.rs.
//
// Same contract as ONDA and VELA: one integer id is simultaneously a knob, a preset field and a
// modulation destination. Keep this file and params.rs in lockstep; the ABI version in
// InstrumentHost guards against a stale .wasm, and PARAM_META below is what the UI reads to
// label and scale a control.
//
// BAJO shares ONDA's voice — oscillators, sub, noise, filters, envelopes, unison — and adds five
// sections of its own. Only the additions live here; the shared ids are re-exported from ONDA so
// there is exactly one definition of "filter cutoff" in the codebase.

import { P as ONDA_P, O, F, E, osc, flt, env } from '../onda/params';

export { O, F, E, osc, flt, env };
export const P = ONDA_P;

/** The string engine — Karplus-Strong, per voice. */
export const S = {
  LEVEL: 1400,
  DAMP: 1401,
  TONE: 1402,
  PICK: 1403,
  BOW: 1404,
  BODY: 1405,
} as const;

/** Throat — the vowel formant bank. */
export const T = {
  AMOUNT: 1420,
  VOWEL: 1421,
  Q: 1422,
} as const;

/** Wobble — the per-step rate lane LFO. */
export const W = {
  ENABLE: 1440,
  SHAPE: 1441,
  SKEW: 1442,
  SMOOTH: 1443,
  PHASE: 1444,
  FREE: 1445,
  RATE: 1446,
  LANE: 1448, // 1448..1463, one slot per 16th note
  DEST1: 1464,
  DEPTH1: 1465,
  DEST2: 1466,
  DEPTH2: 1467,
} as const;

export const LANE_LEN = 16;
export const laneParam = (step: number): number => W.LANE + step;

/** Ghost Gate. */
export const G = {
  ENABLE: 1480,
  DEPTH: 1481,
  SLEW: 1482,
  SPILL: 1483,
  SWING: 1484,
  RATE: 1485,
  SPLIT: 1486,
  GRID: 1488, // band-major: GRID + band * 16 + step
} as const;

export const GATE_BANDS = 4;
export const GATE_STEPS = 16;
export const gridParam = (band: number, step: number): number => G.GRID + band * GATE_STEPS + step;
export const BAND_LABELS = ['Sub', 'Low', 'Mid', 'Air'] as const;

/** Scorch — three serial distortion stages. */
export const SC = {
  ALG: 0,
  DRIVE: 1,
  BIAS: 2,
  TONE: 3,
  MIX: 4,
  INPUT: 1590,
  FOCUS: 1591,
  SAFE: 1592,
  SUB: 1593,
  OUTPUT: 1594,
} as const;
export const SC_STAGES = 3;
export const scorch = (stage: number, p: number): number => 1560 + stage * 8 + p;

/** Space — dimension, ping-pong delay, tape echo. Reverb is VELA's Veil, reused. */
export const SP = {
  CH_ON: 1600,
  CH_RATE: 1601,
  CH_DEPTH: 1602,
  CH_MIX: 1603,
  DL_ON: 1608,
  DL_DIV: 1609,
  DL_FB: 1610,
  DL_TONE: 1611,
  DL_PING: 1612,
  DL_MIX: 1613,
  EC_ON: 1616,
  EC_TIME: 1617,
  EC_FB: 1618,
  EC_WOW: 1619,
  EC_DRIVE: 1620,
  EC_DEGRADE: 1621,
  EC_MIX: 1622,
} as const;

/** The Veil, reused as BAJO's reverb. Ids from VELA's block. */
export const RV = {
  SIZE: 1200,
  DECAY: 1201,
  DIFFUSION: 1202,
  BLUR: 1205,
  MIX: 1207,
} as const;

/** Mono fold — a bass that images its sub disappears the moment anyone sums to mono. */
export const MONO_BELOW = 1650;

export const WOB_SHAPES = [
  'Sine', 'Triangle', 'Saw down', 'Saw up', 'Square', 'Sample+hold', 'Growl', 'Fold', 'Trapezoid',
] as const;

export const WOB_DESTS = [
  'Cutoff', 'Pitch', 'Vowel', 'Amp', 'Morph', 'Drive', 'Reso', 'Pan',
] as const;

/** Rate lane divisions. Index into these is what a lane slot stores. */
export const LANE_DIVS = [
  '1/1', '1/2', '1/2T', '1/4', '1/4.', '1/4T', '1/8', '1/8.', '1/8T', '1/16', '1/16T', '1/32', '1/64',
] as const;

export const SCORCH_ALGS = [
  'Saturate', 'Tube', 'Diode', 'Fuzz', 'Fold', 'Ruin', 'Crush', 'Rectify', 'Sine fold', 'Tape', 'Hard',
] as const;

export const DELAY_DIVS = ['1/2', '1/4', '1/4.', '1/4T', '1/8', '1/8.', '1/8T', '1/16'] as const;
export const GATE_RATES = ['1/8', '1/16', '1/32'] as const;
export const ANALOG_SHAPES = ['Saw', 'Square', 'Triangle', 'Sine'] as const;

// ── formatting ───────────────────────────────────────────────────────────────

const pct = (v: number) => `${Math.round(v * 100)}%`;
const bipolar = (v: number) => `${v > 0.5 ? '+' : ''}${Math.round((v - 0.5) * 200)}`;
const hz = (v: number, lo: number, hi: number) => {
  const f = lo + (hi - lo) * v;
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
};
const ms = (v: number, lo: number, hi: number) => `${Math.round(lo + (hi - lo) * v)} ms`;
const pick = <T extends readonly string[]>(list: T) => (v: number) =>
  list[Math.max(0, Math.min(list.length - 1, Math.round(v)))] ?? '—';

export interface BajoParamMeta {
  id: number;
  label: string;
  /** Short line for the tooltip — what the control is FOR, not what it does mechanically. */
  hint?: string;
  format?: (v: number) => string;
  /** Stepped controls render as a select, not a knob. */
  options?: readonly string[];
  /** Toggles render as a switch. */
  toggle?: boolean;
}

const meta = (
  id: number,
  label: string,
  hint?: string,
  format?: (v: number) => string,
  options?: readonly string[],
  toggle?: boolean,
): BajoParamMeta => ({ id, label, hint, format, options, toggle });

export const BAJO_PARAM_META: Record<number, BajoParamMeta> = {
  [S.LEVEL]: meta(S.LEVEL, 'String', 'Karplus-Strong. The acoustic half — no oscillator involved.', pct),
  [S.DAMP]: meta(S.DAMP, 'Damp', 'How fast the string loses its highs. Muted funk stab to ringing fretless.', pct),
  [S.TONE]: meta(S.TONE, 'Tone', 'Pickup position and string age.', pct),
  [S.PICK]: meta(S.PICK, 'Pick', 'Soft wide finger through to bright narrow plectrum.', pct),
  [S.BOW]: meta(S.BOW, 'Bow', 'Replaces the pluck with continuous excitation — arco.', pct),
  [S.BODY]: meta(S.BODY, 'Body', 'Solid-body electric through to hollow upright.', pct),

  [T.AMOUNT]: meta(T.AMOUNT, 'Throat', 'Vowel formants over the voice sum. This is the talking bass.', pct),
  [T.VOWEL]: meta(T.VOWEL, 'Vowel', 'Sweeps A · E · I · O · U.', pct),
  [T.Q]: meta(T.Q, 'Q', 'How tight the formants are.', pct),

  [W.ENABLE]: meta(W.ENABLE, 'Wobble', undefined, undefined, undefined, true),
  [W.SHAPE]: meta(W.SHAPE, 'Shape', undefined, pick(WOB_SHAPES), WOB_SHAPES),
  [W.SKEW]: meta(W.SKEW, 'Skew', 'Warps the shape either side of its midpoint.', bipolar),
  [W.SMOOTH]: meta(W.SMOOTH, 'Smooth', 'Rounds the corners off a hard shape.', pct),
  [W.PHASE]: meta(W.PHASE, 'Phase', undefined, pct),
  [W.FREE]: meta(W.FREE, 'Free run', 'Ignore the lane and run at a fixed rate.', undefined, undefined, true),
  [W.RATE]: meta(W.RATE, 'Rate', undefined, (v) => `${(0.05 * Math.pow(800, v)).toFixed(2)} Hz`),
  [W.DEST1]: meta(W.DEST1, 'Dest 1', undefined, pick(WOB_DESTS), WOB_DESTS),
  [W.DEPTH1]: meta(W.DEPTH1, 'Depth 1', undefined, pct),
  [W.DEST2]: meta(W.DEST2, 'Dest 2', 'A second destination is what turns a wobble into a morph.', pick(WOB_DESTS), WOB_DESTS),
  [W.DEPTH2]: meta(W.DEPTH2, 'Depth 2', undefined, pct),

  [G.ENABLE]: meta(G.ENABLE, 'Ghost Gate', undefined, undefined, undefined, true),
  [G.DEPTH]: meta(G.DEPTH, 'Depth', 'How far a closed step actually closes.', pct),
  [G.SLEW]: meta(G.SLEW, 'Slew', 'Edge time. Short is a stutter, long is a pump.', (v) => ms(v, 0.8, 55)),
  [G.SPILL]: meta(G.SPILL, 'Spill', 'Closed steps ride into the reverb instead of muting.', pct),
  [G.SWING]: meta(G.SWING, 'Swing', undefined, pct),
  [G.RATE]: meta(G.RATE, 'Rate', undefined, pick(GATE_RATES), GATE_RATES),
  [G.SPLIT]: meta(G.SPLIT, 'Split', 'Shifts every crossover together.', (v) => `${(0.5 * Math.pow(4, v)).toFixed(2)}x`),

  [SC.INPUT]: meta(SC.INPUT, 'Input', undefined, (v) => `${(0.25 + v * 1.75).toFixed(2)}x`),
  [SC.FOCUS]: meta(SC.FOCUS, 'Focus', 'Chooses which part of the spectrum burns.', bipolar),
  [SC.SAFE]: meta(SC.SAFE, 'Sub safe', 'The low band skips the stages and comes back clean.', undefined, undefined, true),
  [SC.SUB]: meta(SC.SUB, 'Safe below', undefined, (v) => hz(v, 30, 300)),
  [SC.OUTPUT]: meta(SC.OUTPUT, 'Output', undefined, (v) => `${(0.25 + v * 1.75).toFixed(2)}x`),

  [SP.CH_ON]: meta(SP.CH_ON, 'Dimension', undefined, undefined, undefined, true),
  [SP.CH_RATE]: meta(SP.CH_RATE, 'Rate', undefined, (v) => `${(0.05 + v * 5.95).toFixed(2)} Hz`),
  [SP.CH_DEPTH]: meta(SP.CH_DEPTH, 'Depth', undefined, pct),
  [SP.CH_MIX]: meta(SP.CH_MIX, 'Mix', undefined, pct),
  [SP.DL_ON]: meta(SP.DL_ON, 'Delay', undefined, undefined, undefined, true),
  [SP.DL_DIV]: meta(SP.DL_DIV, 'Time', undefined, pick(DELAY_DIVS), DELAY_DIVS),
  [SP.DL_FB]: meta(SP.DL_FB, 'Feedback', undefined, pct),
  [SP.DL_TONE]: meta(SP.DL_TONE, 'Tone', undefined, (v) => hz(v, 300, 14000)),
  [SP.DL_PING]: meta(SP.DL_PING, 'Ping-pong', undefined, undefined, undefined, true),
  [SP.DL_MIX]: meta(SP.DL_MIX, 'Mix', undefined, pct),
  [SP.EC_ON]: meta(SP.EC_ON, 'Tape echo', undefined, undefined, undefined, true),
  [SP.EC_TIME]: meta(SP.EC_TIME, 'Time', undefined, (v) => ms(v, 40, 900)),
  [SP.EC_FB]: meta(SP.EC_FB, 'Repeats', undefined, pct),
  [SP.EC_WOW]: meta(SP.EC_WOW, 'Wow', 'The reason a tape echo does not sound digital.', pct),
  [SP.EC_DRIVE]: meta(SP.EC_DRIVE, 'Saturate', undefined, pct),
  [SP.EC_DEGRADE]: meta(SP.EC_DEGRADE, 'Degrade', undefined, pct),
  [SP.EC_MIX]: meta(SP.EC_MIX, 'Mix', undefined, pct),

  // The Veil's size is continuous (0..1 -> a 0.25x..2.8x line-length multiplier), NOT a menu
  // of named rooms. Presenting it as an enum is what had these presets writing 5 into a 0..1
  // parameter and asking for a thirteen-times-oversized room.
  [RV.SIZE]: meta(RV.SIZE, 'Size', 'Small booth through to cathedral.', pct),
  [RV.DECAY]: meta(RV.DECAY, 'Decay', undefined, pct),
  [RV.MIX]: meta(RV.MIX, 'Reverb', undefined, pct),

  [MONO_BELOW]: meta(MONO_BELOW, 'Mono below', 'Folds the low end to centre.', (v) => (v <= 0.001 ? 'off' : hz(v, 20, 320))),
};

for (let st = 0; st < SC_STAGES; st++) {
  BAJO_PARAM_META[scorch(st, SC.ALG)] = meta(scorch(st, SC.ALG), `Stage ${st + 1}`, undefined, pick(SCORCH_ALGS), SCORCH_ALGS);
  BAJO_PARAM_META[scorch(st, SC.DRIVE)] = meta(scorch(st, SC.DRIVE), 'Drive', undefined, pct);
  BAJO_PARAM_META[scorch(st, SC.BIAS)] = meta(scorch(st, SC.BIAS), 'Bias', 'Asymmetry — where even harmonics come from.', bipolar);
  BAJO_PARAM_META[scorch(st, SC.TONE)] = meta(scorch(st, SC.TONE), 'Tone', undefined, bipolar);
  BAJO_PARAM_META[scorch(st, SC.MIX)] = meta(scorch(st, SC.MIX), 'Mix', undefined, pct);
}

// ── the shared ONDA controls BAJO's editor surfaces ──────────────────────────
//
// BAJO's editor draws only what it can name, so without these the Engine section rendered
// nothing and the Filter section showed the Throat alone. These are ONDA's ids with BAJO's
// labels and BAJO's units — the same knob, described for someone building a bass.

/** 0..1 -> 20 Hz .. 20 kHz, matching `cutoff_hz` in params.rs. */
const cutoffHz = (v: number) => {
  const f = 20 * Math.pow(1000, Math.max(0, Math.min(1, v)));
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
};
/** 0..1 -> 1 ms .. 12 s, matching `env_time` in params.rs. */
const envTime = (v: number) => {
  const t = 0.001 + 12 * v * v * v;
  return t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`;
};
const semis = (v: number) => `${(v - 0.5) * 48 >= 0 ? '+' : ''}${Math.round((v - 0.5) * 48)} st`;
const cents = (v: number) => `${(v - 0.5) * 200 >= 0 ? '+' : ''}${Math.round((v - 0.5) * 200)} c`;

export const VOICE_MODES = ['Poly', 'Mono', 'Legato'] as const;
export const SUB_OCTAVES = ['-1 oct', '-2 oct'] as const;

const sharedMeta: BajoParamMeta[] = [
  meta(osc(0, O.LEVEL), 'Osc A', 'The main oscillator.', pct),
  meta(osc(0, O.ANALOG_SHAPE), 'Shape', undefined, pick(ANALOG_SHAPES), ANALOG_SHAPES),
  meta(osc(0, O.COARSE), 'Coarse', undefined, semis),
  meta(osc(0, O.FINE), 'Fine', undefined, cents),
  meta(osc(1, O.LEVEL), 'Osc B', 'A second oscillator — detune it a hair against A for a reese.', pct),
  meta(osc(1, O.ANALOG_SHAPE), 'Shape B', undefined, pick(ANALOG_SHAPES), ANALOG_SHAPES),
  meta(osc(1, O.COARSE), 'Coarse B', undefined, semis),
  meta(osc(1, O.FINE), 'Fine B', 'The detune that makes a reese beat.', cents),
  meta(P.UNISON_COUNT, 'Voices', undefined, (v) => `${Math.round(1 + v * 15)}`),
  meta(P.UNISON_DETUNE, 'Detune', undefined, pct),
  meta(P.UNISON_WIDTH, 'Width', undefined, pct),
  meta(P.SUB_LEVEL, 'Sub', 'The octave below. On most bass patches this IS the bass.', pct),
  meta(P.SUB_OCTAVE, 'Sub oct', undefined, pick(SUB_OCTAVES), SUB_OCTAVES),
  meta(P.SUB_SHAPE, 'Sub shape', undefined, pick(ANALOG_SHAPES), ANALOG_SHAPES),
  meta(P.NOISE_LEVEL, 'Noise', undefined, pct),
  meta(P.GLIDE, 'Glide', 'Time to slide between notes. The 808 control.', (v) => `${Math.round(v * 2000)} ms`),
  meta(P.VOICE_MODE, 'Voice', 'Bass is monophonic more often than not.', pick(VOICE_MODES), VOICE_MODES),
  meta(flt(0, F.CUTOFF), 'Cutoff', undefined, cutoffHz),
  meta(flt(0, F.RES), 'Reso', undefined, pct),
  meta(flt(0, F.ENV_AMT), 'Env amt', 'How hard Env 2 opens the filter.', bipolar),
  meta(flt(0, F.DRIVE), 'Filter drive', undefined, pct),
  meta(flt(0, F.KEYTRACK), 'Key trk', 'Keeps the tone even as you play up the neck.', pct),
  meta(env(0, E.ATTACK), 'Attack', undefined, envTime),
  meta(env(0, E.DECAY), 'Decay', 'On an 808 this is the whole sound.', envTime),
  meta(env(0, E.SUSTAIN), 'Sustain', undefined, pct),
  meta(env(0, E.RELEASE), 'Release', undefined, envTime),
  meta(env(1, E.ATTACK), 'F.Attack', undefined, envTime),
  meta(env(1, E.DECAY), 'F.Decay', undefined, envTime),
  meta(env(1, E.SUSTAIN), 'F.Sustain', undefined, pct),
  meta(env(1, E.RELEASE), 'F.Release', undefined, envTime),
];
for (const m of sharedMeta) BAJO_PARAM_META[m.id] = m;

/**
 * The engine's own defaults, mirroring `defaults()` in rust/plajah-audio/src/params.rs.
 *
 * A patch states only what it changes — "anything absent keeps the engine default" — so anything
 * reasoning about a whole patch has to know what absent MEANS. Two things do: Crossform, which
 * otherwise holds a parameter still when only one of the two patches mentions it (blending an
 * upright bass into a riddim patch left the string engine at full and the gate stuck on), and the
 * editor, which otherwise draws a control at the middle of its range rather than where the engine
 * actually has it.
 */
export const BAJO_DEFAULTS: Readonly<Record<number, number>> = Object.freeze({
  // shared voice
  [P.MASTER_GAIN]: 0.7, [P.GLIDE]: 0, [P.VOICE_MODE]: 0, [P.ANALOG_DRIFT]: 0.25,
  [P.UNISON_COUNT]: 0, [P.UNISON_DETUNE]: 0.18, [P.UNISON_WIDTH]: 0.7, [P.UNISON_BLEND]: 0.6,
  [osc(0, O.ENABLE)]: 1, [osc(0, O.LEVEL)]: 0.8, [osc(0, O.COARSE)]: 0.5, [osc(0, O.FINE)]: 0.5,
  [osc(0, O.MORPH)]: 0, [osc(0, O.TABLE)]: 0, [osc(0, O.MODE)]: 0, [osc(0, O.ANALOG_SHAPE)]: 0,
  [osc(0, O.PULSE_WIDTH)]: 0.5, [osc(0, O.DRIVE)]: 0,
  [osc(1, O.ENABLE)]: 0, [osc(1, O.LEVEL)]: 0, [osc(1, O.COARSE)]: 0.5, [osc(1, O.FINE)]: 0.5,
  [osc(1, O.MORPH)]: 0, [osc(1, O.TABLE)]: 0, [osc(1, O.MODE)]: 0, [osc(1, O.ANALOG_SHAPE)]: 0,
  [osc(1, O.PULSE_WIDTH)]: 0.5, [osc(1, O.DRIVE)]: 0,
  [P.SUB_LEVEL]: 0, [P.SUB_SHAPE]: 0, [P.SUB_OCTAVE]: 0,
  [P.NOISE_LEVEL]: 0, [P.NOISE_COLOR]: 0, [P.FILTER_ROUTING]: 0,
  [flt(0, F.ENABLE)]: 1, [flt(0, F.TYPE)]: 0, [flt(0, F.MODE)]: 0, [flt(0, F.CUTOFF)]: 1,
  [flt(0, F.RES)]: 0.1, [flt(0, F.DRIVE)]: 0, [flt(0, F.KEYTRACK)]: 0, [flt(0, F.ENV_AMT)]: 0.5,
  [flt(1, F.ENABLE)]: 0, [flt(1, F.CUTOFF)]: 1, [flt(1, F.RES)]: 0.1, [flt(1, F.ENV_AMT)]: 0.5,
  [env(0, E.ATTACK)]: 0, [env(0, E.DECAY)]: 0.2, [env(0, E.SUSTAIN)]: 0.8, [env(0, E.RELEASE)]: 0.15,
  [env(1, E.ATTACK)]: 0, [env(1, E.DECAY)]: 0.2, [env(1, E.SUSTAIN)]: 0.8, [env(1, E.RELEASE)]: 0.15,
  // BAJO's own block — every one of these is a bypass, which is what keeps ONDA/KERA/VELA
  // bit-identical with the whole 1400 range present.
  [S.LEVEL]: 0, [S.DAMP]: 0.35, [S.TONE]: 0.5, [S.PICK]: 0.35, [S.BOW]: 0, [S.BODY]: 0.5,
  [T.AMOUNT]: 0, [T.VOWEL]: 0.2, [T.Q]: 0.35,
  [W.ENABLE]: 0, [W.SHAPE]: 0, [W.SKEW]: 0.5, [W.SMOOTH]: 0.1, [W.PHASE]: 0,
  [W.FREE]: 0, [W.RATE]: 0.35, [W.DEST1]: 0, [W.DEPTH1]: 0, [W.DEST2]: 5, [W.DEPTH2]: 0,
  [G.ENABLE]: 0, [G.DEPTH]: 1, [G.SLEW]: 0.12, [G.SPILL]: 0.4, [G.SWING]: 0,
  [G.RATE]: 1, [G.SPLIT]: 0.5,
  [scorch(0, SC.ALG)]: 0, [scorch(0, SC.DRIVE)]: 0, [scorch(0, SC.BIAS)]: 0.5, [scorch(0, SC.TONE)]: 0.5, [scorch(0, SC.MIX)]: 1,
  [scorch(1, SC.ALG)]: 0, [scorch(1, SC.DRIVE)]: 0, [scorch(1, SC.BIAS)]: 0.5, [scorch(1, SC.TONE)]: 0.5, [scorch(1, SC.MIX)]: 1,
  [scorch(2, SC.ALG)]: 0, [scorch(2, SC.DRIVE)]: 0, [scorch(2, SC.BIAS)]: 0.5, [scorch(2, SC.TONE)]: 0.5, [scorch(2, SC.MIX)]: 1,
  [SC.INPUT]: 0.5, [SC.FOCUS]: 0.5, [SC.SAFE]: 1, [SC.SUB]: 0.3, [SC.OUTPUT]: 0.5,
  [SP.CH_ON]: 0, [SP.CH_RATE]: 0.3, [SP.CH_DEPTH]: 0.4, [SP.CH_MIX]: 0.3,
  [SP.DL_ON]: 0, [SP.DL_DIV]: 4, [SP.DL_FB]: 0.35, [SP.DL_TONE]: 0.6, [SP.DL_PING]: 1, [SP.DL_MIX]: 0.22,
  [SP.EC_ON]: 0, [SP.EC_TIME]: 0.26, [SP.EC_FB]: 0.4, [SP.EC_WOW]: 0.25,
  [SP.EC_DRIVE]: 0.4, [SP.EC_DEGRADE]: 0.2, [SP.EC_MIX]: 0.2,
  [RV.SIZE]: 0.5, [RV.DECAY]: 0.45, [RV.DIFFUSION]: 0.6, [RV.BLUR]: 0, [RV.MIX]: 0,
  [MONO_BELOW]: 0,
});

/** The engine's default for an id, or 0.5 for anything not listed. */
export const bajoDefault = (id: number): number => BAJO_DEFAULTS[id] ?? 0.5;

/**
 * Parameters the engine reads as an index or a flag, not as a quantity.
 *
 * Crossform has to know these: interpolating halfway between "Saw" and "Square" gives you
 * neither, and half a toggle is not a state. They snap at the midpoint instead.
 */
export const BAJO_DISCRETE_IDS: ReadonlySet<number> = new Set<number>([
  // BAJO's own stepped and toggled controls
  ...Object.values(BAJO_PARAM_META).filter((m) => m.options || m.toggle).map((m) => m.id),
  // ONDA's shared ones, which have no BAJO metadata entry to be caught by the line above
  P.VOICE_MODE, P.SUB_SHAPE, P.SUB_OCTAVE, P.NOISE_COLOR, P.FILTER_ROUTING,
  osc(0, O.ENABLE), osc(0, O.MODE), osc(0, O.TABLE), osc(0, O.ANALOG_SHAPE), osc(0, O.DRIVE_MODE),
  osc(1, O.ENABLE), osc(1, O.MODE), osc(1, O.TABLE), osc(1, O.ANALOG_SHAPE), osc(1, O.DRIVE_MODE),
  flt(0, F.ENABLE), flt(0, F.TYPE), flt(0, F.MODE),
  flt(1, F.ENABLE), flt(1, F.TYPE), flt(1, F.MODE),
]);

export const bajoParamLabel = (id: number): string => BAJO_PARAM_META[id]?.label ?? `P${id}`;
export const formatBajoParam = (id: number, v: number): string =>
  BAJO_PARAM_META[id]?.format?.(v) ?? v.toFixed(2);

/** Ids that belong to BAJO's own blocks — used to keep a BAJO patch from writing ONDA's space. */
export const isBajoParam = (id: number): boolean => id >= 1400 && id <= 1663;
