// AURA parameter ids — the TypeScript mirror of the block-1700 constants in
// rust/plajah-audio/src/params.rs, plus the shared subtractive voice (0..999), Space/Tape Echo
// (1600+), and Veil reverb (1200+).
//
// Keep this file and params.rs in lockstep; the ABI version (11) in InstrumentHost guards
// against a stale .wasm, and AURA_PARAM_META below is what the UI reads to label and scale a knob.

import { P as ONDA_P, O, F, E, L, osc, flt, env, lfo, MOD_SOURCE } from '../onda/params';

export { O, F, E, L, osc, flt, env, lfo, MOD_SOURCE };
export const P = ONDA_P;

/** AURA vintage analogue circuitry — block 1700 in rust/plajah-audio/src/params.rs. */
export const A = {
  /** Hard oscillator sync (Osc 1 resets Osc 2 phase). 0 = off, 1 = full hard sync. */
  OSC_SYNC: 1700,
  /** Cross-Mod / Poly-Mod: Osc 2 audio-rate FM onto Osc 1 pitch. */
  XMOD_PITCH: 1701,
  /** Cross-Mod / Poly-Mod: Osc 2 audio-rate FM onto Filter 1 cutoff. */
  XMOD_FILTER: 1702,
  /** Balanced Ring Modulator (Osc 1 × Osc 2). */
  RING_MOD: 1703,
  /** Vintage circuit age & voice-card component tolerance (per-voice trimpot variance + thermal wander). */
  AURA: 1704,
  /** Discrete transistor & transformer preamp warmth (asymmetric harmonic saturation). */
  WARMTH: 1705,

  /** BBD 3-Phase String Ensemble / Chorus (1974 ARP Solina / Juno-60 style). */
  ENS_ON: 1710,
  ENS_MODE: 1711, // 0 = Solina 3-Phase Ensemble, 1 = Juno I, 2 = Juno II Symphonic
  ENS_DEPTH: 1712,
  ENS_MIX: 1713,

  /** 6-Stage Vintage Analog All-Pass Phaser (Small Stone / Compact Phasing 'A' Krautrock sweep). */
  PH_ON: 1720,
  PH_RATE: 1721,
  PH_DEPTH: 1722,
  PH_FEEDBACK: 1723,
  PH_MIX: 1724,

  /** Master 15 IPS Magnetic Tape & Mains Floor. */
  TAPE_SAT: 1730,
  HUM: 1731,
  CRACKLE: 1732,

  /** Rhythmic Analog VCA / Lowpass Gate Chopper (Tempo-Synced & Probabilistic). */
  GATE_ON: 1740,
  GATE_RATE: 1741,
  GATE_DEPTH: 1742,
  GATE_SHAPE: 1743, // 0 = Pulse, 1 = Saw Ramp, 2 = Probabilistic Random Gate

  /** Per-Note & Sustain Analog Flux / Source of Uncertainty (Buchla 266 / S&H). */
  FLUX_ON: 1750,
  FLUX_AMT: 1751,
  FLUX_RATE: 1752,
  FLUX_MODE: 1753, // 0 = S&H Filter, 1 = Buchla Drift, 2 = Cosmic Glitch
} as const;

/** Tape Echo & Delay (shared engine block 1600). */
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

/** Spring / Plate / Hall Space (shared Veil block 1200). */
export const RV = {
  SIZE: 1200,
  DECAY: 1201,
  DIFFUSION: 1202,
  SHIMMER: 1203,
  SHIMMER_IVL: 1204,
  BLUR: 1205,
  FREEZE: 1206,
  MIX: 1207,
} as const;

export const ANALOG_SHAPES = ['Saw', 'Pulse', 'Triangle', 'Sine'] as const;
export const OSC_MODES = ['Vintage Bank', 'Pure VCO'] as const;
export const VOICE_MODES = ['Poly', 'Mono', 'Legato'] as const;
export const SUB_OCTAVES = ['-1 Oct (16\')', '-2 Oct (32\')'] as const;
export const NOISE_COLORS = ['White', 'Pink'] as const;
export const FILTER_TYPES = ['24dB Ladder', '12dB SEM SVF'] as const;
export const SVF_MODES = ['Lowpass', 'Bandpass', 'Highpass', 'Notch', 'Peak'] as const;
export const FILTER_ROUTINGS = ['Series', 'Parallel'] as const;
export const ENS_MODES = ['Solina 3-Phase', 'Juno I', 'Juno II'] as const;
export const LFO_SHAPES = ['Sine', 'Triangle', 'Saw', 'Square', 'S&H', 'Drift'] as const;
export const GATE_SHAPES = ['Pulse', 'Saw Ramp', 'Random Step'] as const;
export const FLUX_MODES = ['S&H Filter', 'Buchla Drift', 'Cosmic Glitch'] as const;
export const DELAY_DIVS = ['1/16', '1/8', '1/8D', '1/4', '1/4D', '1/2'] as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const bipolar = (v: number) => `${v > 0.5 ? '+' : ''}${Math.round((v - 0.5) * 200)}%`;
const semis = (v: number) => `${(v - 0.5) * 48 >= 0 ? '+' : ''}${Math.round((v - 0.5) * 48)} st`;
const cents = (v: number) => `${(v - 0.5) * 200 >= 0 ? '+' : ''}${Math.round((v - 0.5) * 200)} ct`;
const cutoffHz = (v: number) => {
  const f = 20 * Math.pow(1000, Math.max(0, Math.min(1, v)));
  return f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;
};
const envTime = (v: number) => {
  const t = 0.001 + 12 * v * v * v;
  return t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`;
};
const lfoHz = (v: number) => {
  const f = 0.01 * Math.pow(4000, Math.max(0, Math.min(1, v)));
  return f >= 10 ? `${f.toFixed(1)} Hz` : `${f.toFixed(2)} Hz`;
};
const phaserHz = (v: number) => `${(0.04 * Math.pow(112.5, Math.max(0, Math.min(1, v)))).toFixed(2)} Hz`;
const ms = (v: number, lo: number, hi: number) => `${Math.round(lo + (hi - lo) * v)} ms`;
const pick = <T extends readonly string[]>(list: T) => (v: number) =>
  list[Math.max(0, Math.min(list.length - 1, Math.round(v)))] ?? '—';

export interface AuraParamMeta {
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
): AuraParamMeta => ({ id, label, hint, format, options, toggle });

export const AURA_PARAM_META: Record<number, AuraParamMeta> = {
  // Master & Voice Architecture
  [P.MASTER_GAIN]: meta(P.MASTER_GAIN, 'Output Trim', 'Master console output gain.', pct),
  [P.VOICE_MODE]: meta(P.VOICE_MODE, 'Keyboard Mode', 'Polyphonic voice cards, Monophonic priority, or Legato single-trigger.', pick(VOICE_MODES), VOICE_MODES),
  [P.GLIDE]: meta(P.GLIDE, 'Portamento', 'RC capacitor glide slew between notes.', (v) => `${Math.round(v * 2000)} ms`),
  [P.ANALOG_DRIFT]: meta(P.ANALOG_DRIFT, 'VCO Drift', 'Per-oscillator pitch detune offset.', pct),
  [P.UNISON_COUNT]: meta(P.UNISON_COUNT, 'Unison Stack', 'Stacked voice cards per note.', (v) => `${Math.round(1 + v * 15)}`),
  [P.UNISON_DETUNE]: meta(P.UNISON_DETUNE, 'Stack Spread', 'Detune spread across unison voice cards.', pct),
  [P.UNISON_WIDTH]: meta(P.UNISON_WIDTH, 'Stereo Pan', 'Azimuth pan width across unison voices.', pct),

  // VCO 1 (Master Oscillator)
  [osc(0, O.ENABLE)]: meta(osc(0, O.ENABLE), 'VCO 1 On', 'Engage Voltage-Controlled Oscillator 1.', undefined, undefined, true),
  [osc(0, O.LEVEL)]: meta(osc(0, O.LEVEL), 'VCO 1 Level', 'Mixer level into the filter bus.', pct),
  [osc(0, O.MODE)]: meta(osc(0, O.MODE), 'VCO 1 Source', 'Vintage hardware wave bank vs. pure PolyBLEP analog.', pick(OSC_MODES), OSC_MODES),
  [osc(0, O.ANALOG_SHAPE)]: meta(osc(0, O.ANALOG_SHAPE), 'VCO 1 Wave', 'Classic VCO waveform.', pick(ANALOG_SHAPES), ANALOG_SHAPES),
  [osc(0, O.MORPH)]: meta(osc(0, O.MORPH), 'Wave Contour', 'Sweeps the vintage wave bank spectrum.', pct),
  [osc(0, O.PULSE_WIDTH)]: meta(osc(0, O.PULSE_WIDTH), 'Pulse Width', 'Duty cycle for rectangular pulse waves.', pct),
  [osc(0, O.COARSE)]: meta(osc(0, O.COARSE), 'VCO 1 Range', 'Coarse pitch in semitones (-24 to +24).', semis),
  [osc(0, O.FINE)]: meta(osc(0, O.FINE), 'VCO 1 Fine', 'Fine tuning in cents.', cents),
  [osc(0, O.DRIVE)]: meta(osc(0, O.DRIVE), 'VCO 1 Fold', 'Pre-filter wavefolder / mixer overdrive.', pct),

  // VCO 2 (Sync Slave / Cross-Modulator)
  [osc(1, O.ENABLE)]: meta(osc(1, O.ENABLE), 'VCO 2 On', 'Engage Voltage-Controlled Oscillator 2.', undefined, undefined, true),
  [osc(1, O.LEVEL)]: meta(osc(1, O.LEVEL), 'VCO 2 Level', 'Mixer level (can be 0% when used purely for Sync/FM/Ring).', pct),
  [osc(1, O.MODE)]: meta(osc(1, O.MODE), 'VCO 2 Source', 'Vintage hardware wave bank vs. pure PolyBLEP analog.', pick(OSC_MODES), OSC_MODES),
  [osc(1, O.ANALOG_SHAPE)]: meta(osc(1, O.ANALOG_SHAPE), 'VCO 2 Wave', 'Classic VCO waveform.', pick(ANALOG_SHAPES), ANALOG_SHAPES),
  [osc(1, O.MORPH)]: meta(osc(1, O.MORPH), 'Contour 2', 'Sweeps VCO 2 vintage wave bank.', pct),
  [osc(1, O.PULSE_WIDTH)]: meta(osc(1, O.PULSE_WIDTH), 'PW 2', 'Pulse width for VCO 2.', pct),
  [osc(1, O.COARSE)]: meta(osc(1, O.COARSE), 'VCO 2 Pitch', 'Coarse pitch — sweep this under Hard Sync for tearing leads.', semis),
  [osc(1, O.FINE)]: meta(osc(1, O.FINE), 'VCO 2 Detune', 'Fine tuning for warm two-oscillator beating.', cents),

  // VCO 3 + Sub + Noise
  [osc(2, O.ENABLE)]: meta(osc(2, O.ENABLE), 'VCO 3 On', 'Engage third oscillator (Minimoog / modular 3-VCO stack).', undefined, undefined, true),
  [osc(2, O.LEVEL)]: meta(osc(2, O.LEVEL), 'VCO 3 Level', 'Mixer level for VCO 3.', pct),
  [osc(2, O.MODE)]: meta(osc(2, O.MODE), 'VCO 3 Source', undefined, pick(OSC_MODES), OSC_MODES),
  [osc(2, O.ANALOG_SHAPE)]: meta(osc(2, O.ANALOG_SHAPE), 'VCO 3 Wave', undefined, pick(ANALOG_SHAPES), ANALOG_SHAPES),
  [osc(2, O.COARSE)]: meta(osc(2, O.COARSE), 'VCO 3 Pitch', 'Tune to +7st or -12st for classic 3-VCO chords & basses.', semis),
  [osc(2, O.FINE)]: meta(osc(2, O.FINE), 'VCO 3 Detune', undefined, cents),
  [P.SUB_LEVEL]: meta(P.SUB_LEVEL, 'Sub Osc', 'Flip-flop divide-down sub-oscillator.', pct),
  [P.SUB_OCTAVE]: meta(P.SUB_OCTAVE, 'Sub Octave', '16\' (-1 oct) or 32\' (-2 oct) divide-down.', pick(SUB_OCTAVES), SUB_OCTAVES),
  [P.SUB_SHAPE]: meta(P.SUB_SHAPE, 'Sub Wave', undefined, pick(ANALOG_SHAPES), ANALOG_SHAPES),
  [P.NOISE_LEVEL]: meta(P.NOISE_LEVEL, 'Noise Gen', 'Transistor junction noise generator (wind, breath, percussion).', pct),
  [P.NOISE_COLOR]: meta(P.NOISE_COLOR, 'Noise Color', 'White (bright) or Pink (-3dB/oct warm).', pick(NOISE_COLORS), NOISE_COLORS),

  // Vintage Cross-Modulation & Circuitry (Block 1700)
  [A.OSC_SYNC]: meta(A.OSC_SYNC, 'Hard Sync', 'VCO 1 resets VCO 2 phase. Sweep VCO 2 pitch for tearing 70s sync leads.', pct),
  [A.XMOD_PITCH]: meta(A.XMOD_PITCH, 'Poly-Mod Pitch', 'VCO 2 audio-rate FM onto VCO 1 pitch (Prophet/ARP clang & bells).', pct),
  [A.XMOD_FILTER]: meta(A.XMOD_FILTER, 'Poly-Mod VCF', 'VCO 2 audio-rate FM onto Filter 1 cutoff (modular filter growl).', pct),
  [A.RING_MOD]: meta(A.RING_MOD, 'Ring Mod', 'Balanced multiplier (VCO 1 × VCO 2) — BBC Radiophonic & CS-80 metallic tones.', pct),
  [A.AURA]: meta(A.AURA, 'Vintage Aura', 'Per-voice trimpot tolerance, capacitor variance, and slow thermal pitch/filter drift.', pct),
  [A.WARMTH]: meta(A.WARMTH, 'Preamp Warmth', 'Discrete transistor & transformer saturation before the filter.', pct),

  // Dual Vintage Filters (24dB Transistor Ladder + 12dB Oberheim SEM State-Variable)
  [P.FILTER_ROUTING]: meta(P.FILTER_ROUTING, 'VCF Routing', 'Series (Ladder into SEM) or Parallel dual-filter blend.', pick(FILTER_ROUTINGS), FILTER_ROUTINGS),
  [flt(0, F.ENABLE)]: meta(flt(0, F.ENABLE), 'VCF 1 On', undefined, undefined, undefined, true),
  [flt(0, F.TYPE)]: meta(flt(0, F.TYPE), 'VCF 1 Topology', '24dB/oct Moog Transistor Ladder vs. 12dB/oct State-Variable.', pick(FILTER_TYPES), FILTER_TYPES),
  [flt(0, F.MODE)]: meta(flt(0, F.MODE), 'SEM Mode 1', 'Response when VCF 1 is in 12dB SEM SVF mode.', pick(SVF_MODES), SVF_MODES),
  [flt(0, F.CUTOFF)]: meta(flt(0, F.CUTOFF), 'Cutoff', 'Primary filter cutoff frequency (20 Hz – 20 kHz).', cutoffHz),
  [flt(0, F.RES)]: meta(flt(0, F.RES), 'Resonance', 'Filter emphasis — self-oscillates at high settings.', pct),
  [flt(0, F.ENV_AMT)]: meta(flt(0, F.ENV_AMT), 'Env Contour', 'Bipolar VCF Envelope (Env 2) modulation depth.', bipolar),
  [flt(0, F.DRIVE)]: meta(flt(0, F.DRIVE), 'Ladder Drive', 'Overdrives the transistor ladder feedback loop.', pct),
  [flt(0, F.KEYTRACK)]: meta(flt(0, F.KEYTRACK), 'Kbd Track', 'Tracks cutoff with keyboard pitch.', pct),

  [flt(1, F.ENABLE)]: meta(flt(1, F.ENABLE), 'VCF 2 On', 'Secondary formant / high-pass / SEM filter.', undefined, undefined, true),
  [flt(1, F.TYPE)]: meta(flt(1, F.TYPE), 'VCF 2 Topology', undefined, pick(FILTER_TYPES), FILTER_TYPES),
  [flt(1, F.MODE)]: meta(flt(1, F.MODE), 'VCF 2 Mode', 'Use Highpass or Bandpass for CS-80 & string-machine resonators.', pick(SVF_MODES), SVF_MODES),
  [flt(1, F.CUTOFF)]: meta(flt(1, F.CUTOFF), 'VCF 2 Cutoff', undefined, cutoffHz),
  [flt(1, F.RES)]: meta(flt(1, F.RES), 'VCF 2 Reso', undefined, pct),
  [flt(1, F.ENV_AMT)]: meta(flt(1, F.ENV_AMT), 'VCF 2 Env', undefined, bipolar),

  // Envelopes (VCA Env 1, VCF Env 2) & LFO 1
  [env(0, E.ATTACK)]: meta(env(0, E.ATTACK), 'VCA Attack', 'Amplifier attack time.', envTime),
  [env(0, E.DECAY)]: meta(env(0, E.DECAY), 'VCA Decay', 'Amplifier decay time.', envTime),
  [env(0, E.SUSTAIN)]: meta(env(0, E.SUSTAIN), 'VCA Sustain', 'Amplifier sustain level.', pct),
  [env(0, E.RELEASE)]: meta(env(0, E.RELEASE), 'VCA Release', 'Amplifier release time.', envTime),

  [env(1, E.ATTACK)]: meta(env(1, E.ATTACK), 'VCF Attack', 'Filter envelope attack time.', envTime),
  [env(1, E.DECAY)]: meta(env(1, E.DECAY), 'VCF Decay', 'Filter envelope decay time.', envTime),
  [env(1, E.SUSTAIN)]: meta(env(1, E.SUSTAIN), 'VCF Sustain', 'Filter envelope sustain level.', pct),
  [env(1, E.RELEASE)]: meta(env(1, E.RELEASE), 'VCF Release', 'Filter envelope release time.', envTime),

  [lfo(0, L.SHAPE)]: meta(lfo(0, L.SHAPE), 'LFO 1 Wave', 'Primary modulation oscillator shape.', pick(LFO_SHAPES), LFO_SHAPES),
  [lfo(0, L.RATE)]: meta(lfo(0, L.RATE), 'LFO 1 Rate', 'Primary LFO speed.', lfoHz),
  [lfo(1, L.SHAPE)]: meta(lfo(1, L.SHAPE), 'LFO 2 Wave', 'Secondary modulation oscillator shape.', pick(LFO_SHAPES), LFO_SHAPES),
  [lfo(1, L.RATE)]: meta(lfo(1, L.RATE), 'LFO 2 Rate', 'Secondary LFO speed.', lfoHz),

  // BBD String Ensemble & 6-Stage Phaser
  [A.ENS_ON]: meta(A.ENS_ON, 'BBD Ensemble', 'Engage 1970s Bucket-Brigade Chorus / String Ensemble.', undefined, undefined, true),
  [A.ENS_MODE]: meta(A.ENS_MODE, 'Ensemble Type', 'Solina 3-phase String Ensemble, Juno I, or Juno II Symphonic.', pick(ENS_MODES), ENS_MODES),
  [A.ENS_DEPTH]: meta(A.ENS_DEPTH, 'Ensemble Depth', 'Modulation excursion of the BBD delay lines.', pct),
  [A.ENS_MIX]: meta(A.ENS_MIX, 'Ensemble Mix', 'Dry / BBD Ensemble balance.', pct),

  [A.PH_ON]: meta(A.PH_ON, 'Analog Phaser', 'Engage 6-stage all-pass Krautrock phaser.', undefined, undefined, true),
  [A.PH_RATE]: meta(A.PH_RATE, 'Phaser Rate', 'Sweep rate of the 6-stage all-pass network.', phaserHz),
  [A.PH_DEPTH]: meta(A.PH_DEPTH, 'Phaser Depth', 'Frequency span of the phaser notches.', pct),
  [A.PH_FEEDBACK]: meta(A.PH_FEEDBACK, 'Phaser Color', 'Resonant feedback across the 6 all-pass stages.', pct),
  [A.PH_MIX]: meta(A.PH_MIX, 'Phaser Mix', 'Dry / Phaser balance.', pct),

  // Tape Echo, Tempo Delay, Spring/Hall Reverb & Master Tape / Mains Floor
  [SP.EC_ON]: meta(SP.EC_ON, 'Tape Echo', 'Free-running magnetic tape echo (RE-201 / Echoplex style).', undefined, undefined, true),
  [SP.EC_TIME]: meta(SP.EC_TIME, 'Tape Speed', 'Delay time between record and playback heads.', (v) => ms(v, 40, 900)),
  [SP.EC_FB]: meta(SP.EC_FB, 'Intensity', 'Tape echo regeneration / repeats (self-oscillates near 100%).', pct),
  [SP.EC_WOW]: meta(SP.EC_WOW, 'Capstan Wow', 'Mechanical capstan wow & flutter pitch modulation.', pct),
  [SP.EC_DRIVE]: meta(SP.EC_DRIVE, 'Tape Drive', 'Magnetic saturation inside the echo feedback loop.', pct),
  [SP.EC_DEGRADE]: meta(SP.EC_DEGRADE, 'Tape Wear', 'Bandwidth narrowing per echo repeat.', pct),
  [SP.EC_MIX]: meta(SP.EC_MIX, 'Echo Mix', 'Tape echo wet level.', pct),

  [SP.DL_ON]: meta(SP.DL_ON, 'Stereo Delay', 'Tempo-synced stereo bucket-brigade / digital delay.', undefined, undefined, true),
  [SP.DL_DIV]: meta(SP.DL_DIV, 'Delay Division', 'Tempo division of the stereo delay.', (v) => DELAY_DIVS[Math.min(DELAY_DIVS.length - 1, Math.floor(v * DELAY_DIVS.length))] ?? '1/8D'),
  [SP.DL_FB]: meta(SP.DL_FB, 'Delay Feedback', 'Stereo delay regeneration.', pct),
  [SP.DL_TONE]: meta(SP.DL_TONE, 'Delay Tone', 'Damping filter inside the delay feedback loop.', pct),
  [SP.DL_PING]: meta(SP.DL_PING, 'Ping-Pong', 'Cross-coupled stereo ping-pong bounce.', undefined, undefined, true),
  [SP.DL_MIX]: meta(SP.DL_MIX, 'Delay Mix', 'Stereo delay wet level.', pct),

  [RV.SIZE]: meta(RV.SIZE, 'Chamber Size', 'Spring tank through to concert hall.', pct),
  [RV.DECAY]: meta(RV.DECAY, 'Reverb Decay', 'Reverb tail length.', pct),
  [RV.SHIMMER]: meta(RV.SHIMMER, 'Harmonic Halo', 'Octave feedback shimmer in the reverb tank.', pct),
  [RV.MIX]: meta(RV.MIX, 'Reverb Mix', 'Reverb wet level.', pct),

  [A.TAPE_SAT]: meta(A.TAPE_SAT, '15 IPS Tape', 'Master magnetic tape compression, 72 Hz head bump, and HF smoothing.', pct),
  [A.HUM]: meta(A.HUM, '60Hz Mains Hum', 'Authentic transformer mains hum and discrete transistor floor.', pct),
  [A.CRACKLE]: meta(A.CRACKLE, 'Oxide Dust', 'Subtle magnetic oxide / vinyl surface crackle.', pct),

  // Rhythmic VCA / Lowpass Gate Chopper & Per-Note/Sustain Analog Flux
  [A.GATE_ON]: meta(A.GATE_ON, 'Pulse Gate', 'Engage tempo-synced VCA / Lowpass Gate chopper.', undefined, undefined, true),
  [A.GATE_RATE]: meta(A.GATE_RATE, 'Gate Rate', 'Chopper rate from slow quarter notes up to 16th-note pulse trains.', (v) => `${(1.25 * Math.pow(12, Math.max(0, Math.min(1, v)))).toFixed(1)} Hz`),
  [A.GATE_DEPTH]: meta(A.GATE_DEPTH, 'Gate Depth', 'Depth of VCA & Lowpass Gate rhythmic chopping.', pct),
  [A.GATE_SHAPE]: meta(A.GATE_SHAPE, 'Gate Shape', 'Square Pulse, Sawtooth Ramp, or Probabilistic Random Step gate.', pick(GATE_SHAPES), GATE_SHAPES),

  [A.FLUX_ON]: meta(A.FLUX_ON, 'Analog Flux', 'Engage per-note & sustain randomness (Buchla 266 Source of Uncertainty / S&H).', undefined, undefined, true),
  [A.FLUX_AMT]: meta(A.FLUX_AMT, 'Flux Depth', 'Intensity of random per-note & sustain timbral/pitch modulation.', pct),
  [A.FLUX_RATE]: meta(A.FLUX_RATE, 'Flux Clock', 'Clock speed of the sustain Sample & Hold / fluctuating random voltage.', (v) => `${(0.6 * Math.pow(24, Math.max(0, Math.min(1, v)))).toFixed(1)} Hz`),
  [A.FLUX_MODE]: meta(A.FLUX_MODE, 'Flux Mode', 'S&H Filter steps, smooth Buchla Drift, or Cosmic Glitch.', pick(FLUX_MODES), FLUX_MODES),
  [P.BEND_RANGE]: meta(P.BEND_RANGE, 'Pitch Bend', 'Pitch bend wheel range in semitones.', (v) => `±${Math.max(1, Math.round(v * 24))} st`),
};

export const AURA_DEFAULTS: Readonly<Record<number, number>> = Object.freeze({
  [P.MASTER_GAIN]: 0.72,
  [P.GLIDE]: 0,
  [P.VOICE_MODE]: 0,
  [P.BEND_RANGE]: 2 / 24,
  [P.ANALOG_DRIFT]: 0.28,
  [P.UNISON_COUNT]: 0,
  [P.UNISON_DETUNE]: 0.18,
  [P.UNISON_WIDTH]: 0.7,
  [P.UNISON_BLEND]: 0.6,

  [osc(0, O.ENABLE)]: 1,
  [osc(0, O.LEVEL)]: 0.8,
  [osc(0, O.PAN)]: 0.5,
  [osc(0, O.COARSE)]: 0.5,
  [osc(0, O.FINE)]: 0.5,
  [osc(0, O.MORPH)]: 0,
  [osc(0, O.PHASE)]: 1, // free-running analog phase by default
  [osc(0, O.TABLE)]: 0,
  [osc(0, O.MODE)]: 1, // pure VCO by default
  [osc(0, O.ANALOG_SHAPE)]: 0,
  [osc(0, O.PULSE_WIDTH)]: 0.5,
  [osc(0, O.DRIVE)]: 0,
  [osc(0, O.DRIVE_MODE)]: 0,

  [osc(1, O.ENABLE)]: 0,
  [osc(1, O.LEVEL)]: 0,
  [osc(1, O.PAN)]: 0.5,
  [osc(1, O.COARSE)]: 0.5,
  [osc(1, O.FINE)]: 0.5,
  [osc(1, O.MORPH)]: 0,
  [osc(1, O.PHASE)]: 1,
  [osc(1, O.TABLE)]: 0,
  [osc(1, O.MODE)]: 1,
  [osc(1, O.ANALOG_SHAPE)]: 0,
  [osc(1, O.PULSE_WIDTH)]: 0.5,
  [osc(1, O.DRIVE)]: 0,
  [osc(1, O.DRIVE_MODE)]: 0,

  [osc(2, O.ENABLE)]: 0,
  [osc(2, O.LEVEL)]: 0,
  [osc(2, O.PAN)]: 0.5,
  [osc(2, O.COARSE)]: 0.5,
  [osc(2, O.FINE)]: 0.5,
  [osc(2, O.MORPH)]: 0,
  [osc(2, O.PHASE)]: 1,
  [osc(2, O.TABLE)]: 0,
  [osc(2, O.MODE)]: 1,
  [osc(2, O.ANALOG_SHAPE)]: 0,
  [osc(2, O.PULSE_WIDTH)]: 0.5,
  [osc(2, O.DRIVE)]: 0,
  [osc(2, O.DRIVE_MODE)]: 0,

  [P.SUB_LEVEL]: 0,
  [P.SUB_SHAPE]: 1,
  [P.SUB_OCTAVE]: 0,
  [P.NOISE_LEVEL]: 0,
  [P.NOISE_COLOR]: 1,
  [P.FILTER_ROUTING]: 0,

  [flt(0, F.ENABLE)]: 1,
  [flt(0, F.TYPE)]: 0,
  [flt(0, F.MODE)]: 0,
  [flt(0, F.CUTOFF)]: 0.65,
  [flt(0, F.RES)]: 0.18,
  [flt(0, F.DRIVE)]: 0.15,
  [flt(0, F.KEYTRACK)]: 0.35,
  [flt(0, F.ENV_AMT)]: 0.65,

  [flt(1, F.ENABLE)]: 0,
  [flt(1, F.TYPE)]: 1,
  [flt(1, F.MODE)]: 2,
  [flt(1, F.CUTOFF)]: 0.2,
  [flt(1, F.RES)]: 0.15,
  [flt(1, F.DRIVE)]: 0,
  [flt(1, F.KEYTRACK)]: 0.2,
  [flt(1, F.ENV_AMT)]: 0.5,

  [env(0, E.ATTACK)]: 0.02,
  [env(0, E.DECAY)]: 0.25,
  [env(0, E.SUSTAIN)]: 0.8,
  [env(0, E.RELEASE)]: 0.2,

  [env(1, E.ATTACK)]: 0.02,
  [env(1, E.DECAY)]: 0.3,
  [env(1, E.SUSTAIN)]: 0.4,
  [env(1, E.RELEASE)]: 0.22,

  [env(2, E.ATTACK)]: 0.01,
  [env(2, E.DECAY)]: 0.35,
  [env(2, E.SUSTAIN)]: 0.2,
  [env(2, E.RELEASE)]: 0.2,

  [lfo(0, L.SHAPE)]: 0,
  [lfo(0, L.RATE)]: 0.38,
  [lfo(1, L.SHAPE)]: 1,
  [lfo(1, L.RATE)]: 0.22,

  [A.OSC_SYNC]: 0,
  [A.XMOD_PITCH]: 0,
  [A.XMOD_FILTER]: 0,
  [A.RING_MOD]: 0,
  [A.AURA]: 0.25,
  [A.WARMTH]: 0.3,

  [A.ENS_ON]: 0,
  [A.ENS_MODE]: 0,
  [A.ENS_DEPTH]: 0.6,
  [A.ENS_MIX]: 0.45,

  [A.PH_ON]: 0,
  [A.PH_RATE]: 0.22,
  [A.PH_DEPTH]: 0.7,
  [A.PH_FEEDBACK]: 0.55,
  [A.PH_MIX]: 0.4,

  [A.TAPE_SAT]: 0.2,
  [A.HUM]: 0.05,
  [A.CRACKLE]: 0.0,

  [A.GATE_ON]: 0,
  [A.GATE_RATE]: 0.5,
  [A.GATE_DEPTH]: 0.72,
  [A.GATE_SHAPE]: 0,

  [A.FLUX_ON]: 0,
  [A.FLUX_AMT]: 0.45,
  [A.FLUX_RATE]: 0.42,
  [A.FLUX_MODE]: 0,

  [SP.DL_ON]: 0,
  [SP.DL_DIV]: 0.45,
  [SP.DL_FB]: 0.42,
  [SP.DL_TONE]: 0.52,
  [SP.DL_PING]: 1,
  [SP.DL_MIX]: 0.28,

  [SP.EC_ON]: 0,
  [SP.EC_TIME]: 0.28,
  [SP.EC_FB]: 0.4,
  [SP.EC_WOW]: 0.3,
  [SP.EC_DRIVE]: 0.4,
  [SP.EC_DEGRADE]: 0.25,
  [SP.EC_MIX]: 0.22,

  [RV.SIZE]: 0.5,
  [RV.DECAY]: 0.45,
  [RV.DIFFUSION]: 0.65,
  [RV.SHIMMER]: 0,
  [RV.BLUR]: 0.1,
  [RV.MIX]: 0.15,
});

export const auraDefault = (id: number): number => AURA_DEFAULTS[id] ?? 0.5;

export const AURA_DISCRETE_IDS: ReadonlySet<number> = new Set<number>([
  ...Object.values(AURA_PARAM_META).filter((m) => m.options || m.toggle).map((m) => m.id),
  P.VOICE_MODE, P.SUB_SHAPE, P.SUB_OCTAVE, P.NOISE_COLOR, P.FILTER_ROUTING,
  osc(0, O.ENABLE), osc(0, O.MODE), osc(0, O.TABLE), osc(0, O.ANALOG_SHAPE), osc(0, O.DRIVE_MODE),
  osc(1, O.ENABLE), osc(1, O.MODE), osc(1, O.TABLE), osc(1, O.ANALOG_SHAPE), osc(1, O.DRIVE_MODE),
  osc(2, O.ENABLE), osc(2, O.MODE), osc(2, O.TABLE), osc(2, O.ANALOG_SHAPE), osc(2, O.DRIVE_MODE),
  flt(0, F.ENABLE), flt(0, F.TYPE), flt(0, F.MODE),
  flt(1, F.ENABLE), flt(1, F.TYPE), flt(1, F.MODE),
]);

export const auraParamLabel = (id: number): string => AURA_PARAM_META[id]?.label ?? `P${id}`;
export const formatAuraParam = (id: number, v: number): string =>
  AURA_PARAM_META[id]?.format?.(v) ?? v.toFixed(2);
