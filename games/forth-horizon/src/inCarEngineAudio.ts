// Authentic in-car RPM-locked multi-cylinder engine audio engine.
// Driven directly by live physics RPM, gear ratio, shift cut, throttle load, turbo boost,
// and redline limiter — zero pass-by Doppler and zero repeating rev-up loops.
// Each of the 24 engine banks from engineAudio.ts has its own physical firing-order Fourier
// harmonics, dual intake/exhaust formant body resonators, combustion air-bite modulation,
// forced-induction spool/BOV flutter, upshift ignition-cut bark, and downshift rev-match blip.
import type { CarSpec } from './manufacturers';
import type { CarState } from './physics';
import { getEngineBank } from './engineAudio';

interface EngineAcousticProfile {
  /** Base firing pulses per revolution (cylinders / 2 for 4-stroke; 1.5 for 2-rotor rotary) */
  pulsesPerRev: number;
  /** Sub-order harmonic (e.g. 0.5 for cross-plane V8 uneven lub-dub, 0.5 for I5 warble, 0.667 for I6) */
  subOrder: number;
  /** Harmonic amplitude ratios [h1, h2, h3, h4, h5, h6, h7, h8] for custom PeriodicWave */
  harmonics: number[];
  /** Secondary upper-order harmonic multipliers for mechanical rasp/scream */
  raspMult: number;
  /** Close-mic intake plenum formant center (Hz) at idle -> redline */
  intakeHz: [number, number];
  /** Close-mic exhaust resonator formant center (Hz) at idle -> redline */
  exhaustHz: [number, number];
  /** Warmth / cabin bass shelf gain (dB) */
  cabinBassDb: number;
  /** Saturation drive (1.0 = smooth muted commuter, 4.2 = raw race exhaust) */
  drive: number;
  /** Combustion pulse air-noise level (0.04 = quiet cabin, 0.28 = raw race/diesel) */
  mechNoise: number;
  /** Forced induction character */
  forced: 'none' | 'supercharger' | 'turbo' | 'diesel-turbo';
  /** Base master level for this engine type (everyday quiet cars sit lower stock!) */
  baseGain: number;
  /** Exhaust upshift/overrun pop intensity (0 = none on quiet stock commuters, 1 = crisp motorsport crack) */
  shiftPop: number;
}

const PROFILES: Record<string, EngineAcousticProfile> = {
  // ---- HERO / RACE / SUPER / HYPERCARS ----
  sc_v8_blower: {
    pulsesPerRev: 4.0,
    subOrder: 0.5, // cross-plane American V8 uneven firing rumble
    harmonics: [1.0, 0.72, 0.58, 0.42, 0.28, 0.18, 0.12, 0.07],
    raspMult: 1.5,
    intakeHz: [145, 520],
    exhaustHz: [280, 1180],
    cabinBassDb: 7.5,
    drive: 3.1,
    mechNoise: 0.18,
    forced: 'supercharger',
    baseGain: 0.42,
    shiftPop: 0.85,
  },
  hypercar_tt_v8: {
    pulsesPerRev: 4.0,
    subOrder: 0.5,
    harmonics: [0.82, 1.0, 0.48, 0.62, 0.34, 0.28, 0.18, 0.12], // crisp flat-plane twin-turbo V8 snarl
    raspMult: 2.0,
    intakeHz: [195, 760],
    exhaustHz: [360, 1620],
    cabinBassDb: 5.5,
    drive: 3.4,
    mechNoise: 0.20,
    forced: 'turbo',
    baseGain: 0.42,
    shiftPop: 0.95,
  },
  supercar_v10: {
    pulsesPerRev: 5.0,
    subOrder: 0.5, // iconic 2.5 + 5.0 uneven-bank exotic V10 howl
    harmonics: [0.76, 0.94, 0.44, 0.68, 0.52, 0.32, 0.22, 0.14],
    raspMult: 1.5,
    intakeHz: [220, 880],
    exhaustHz: [420, 1950],
    cabinBassDb: 4.5,
    drive: 3.2,
    mechNoise: 0.19,
    forced: 'none',
    baseGain: 0.43,
    shiftPop: 0.90,
  },
  supercar_v12: {
    pulsesPerRev: 6.0,
    subOrder: 0.5, // soaring 6th-order opera V12 scream
    harmonics: [0.70, 0.88, 0.64, 0.52, 0.42, 0.34, 0.22, 0.15],
    raspMult: 2.0,
    intakeHz: [250, 960],
    exhaustHz: [460, 2150],
    cabinBassDb: 4.2,
    drive: 3.0,
    mechNoise: 0.18,
    forced: 'none',
    baseGain: 0.44,
    shiftPop: 0.88,
  },
  megacar_w16: {
    pulsesPerRev: 8.0,
    subOrder: 0.25, // deep locomotive W16 quad-turbo thunder + turbine rush
    harmonics: [1.0, 0.78, 0.55, 0.48, 0.34, 0.25, 0.18, 0.12],
    raspMult: 1.5,
    intakeHz: [165, 680],
    exhaustHz: [320, 1550],
    cabinBassDb: 8.5,
    drive: 3.3,
    mechNoise: 0.24,
    forced: 'turbo',
    baseGain: 0.45,
    shiftPop: 0.92,
  },
  muscle_v8: {
    pulsesPerRev: 4.0,
    subOrder: 0.5, // deep throaty Detroit muscle V8 burble
    harmonics: [1.0, 0.82, 0.62, 0.38, 0.24, 0.14, 0.08, 0.04],
    raspMult: 1.5,
    intakeHz: [120, 440],
    exhaustHz: [230, 960],
    cabinBassDb: 9.0,
    drive: 3.2,
    mechNoise: 0.17,
    forced: 'none',
    baseGain: 0.42,
    shiftPop: 0.78,
  },
  sports_car_gt: {
    pulsesPerRev: 4.0,
    subOrder: 0.5,
    harmonics: [0.92, 0.88, 0.56, 0.46, 0.30, 0.20, 0.12, 0.07],
    raspMult: 1.5,
    intakeHz: [165, 620],
    exhaustHz: [320, 1420],
    cabinBassDb: 6.2,
    drive: 2.9,
    mechNoise: 0.16,
    forced: 'none',
    baseGain: 0.40,
    shiftPop: 0.75,
  },
  perf_coupe_i6: {
    pulsesPerRev: 3.0,
    subOrder: 0.5, // balanced metallic straight-six howl
    harmonics: [0.95, 0.76, 0.66, 0.40, 0.28, 0.20, 0.12, 0.08],
    raspMult: 2.0,
    intakeHz: [185, 680],
    exhaustHz: [340, 1580],
    cabinBassDb: 5.2,
    drive: 2.7,
    mechNoise: 0.15,
    forced: 'turbo',
    baseGain: 0.39,
    shiftPop: 0.72,
  },
  turbo_i5: {
    pulsesPerRev: 2.5,
    subOrder: 0.5, // asymmetric Group-B rally inline-5 warble
    harmonics: [0.96, 0.64, 0.72, 0.38, 0.46, 0.22, 0.16, 0.09],
    raspMult: 1.5,
    intakeHz: [170, 620],
    exhaustHz: [310, 1420],
    cabinBassDb: 5.8,
    drive: 3.0,
    mechNoise: 0.18,
    forced: 'turbo',
    baseGain: 0.40,
    shiftPop: 0.90,
  },
  sports_sedan_20t: {
    pulsesPerRev: 2.0,
    subOrder: 0.5, // crisp touring 2.0T inline-4
    harmonics: [0.95, 0.78, 0.46, 0.38, 0.22, 0.14, 0.08, 0.05],
    raspMult: 2.0,
    intakeHz: [175, 580],
    exhaustHz: [310, 1320],
    cabinBassDb: 4.8,
    drive: 2.5,
    mechNoise: 0.14,
    forced: 'turbo',
    baseGain: 0.37,
    shiftPop: 0.68,
  },
  rotary_twin: {
    pulsesPerRev: 3.0,
    subOrder: 0.667, // high-revving twin-rotor eccentric buzz
    harmonics: [0.85, 0.92, 0.78, 0.54, 0.42, 0.30, 0.22, 0.14],
    raspMult: 1.5,
    intakeHz: [260, 1020],
    exhaustHz: [480, 2200],
    cabinBassDb: 3.5,
    drive: 3.5,
    mechNoise: 0.20,
    forced: 'turbo',
    baseGain: 0.40,
    shiftPop: 0.96,
  },

  // ---- UTILITY / LUXURY / EVERYDAY STOCK (Quiet & Refined until Upgraded!) ----
  v8_lux_suv: {
    pulsesPerRev: 4.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.58, 0.32, 0.18, 0.09, 0.05, 0.02, 0.01],
    raspMult: 1.5,
    intakeHz: [115, 340],
    exhaustHz: [195, 680],
    cabinBassDb: 6.5,
    drive: 1.7,
    mechNoise: 0.08,
    forced: 'none',
    baseGain: 0.31,
    shiftPop: 0.15,
  },
  v6_suv_sport: {
    pulsesPerRev: 3.0,
    subOrder: 0.5,
    harmonics: [0.95, 0.62, 0.40, 0.22, 0.12, 0.06, 0.03, 0.01],
    raspMult: 1.5,
    intakeHz: [140, 440],
    exhaustHz: [250, 880],
    cabinBassDb: 5.0,
    drive: 2.0,
    mechNoise: 0.10,
    forced: 'turbo',
    baseGain: 0.33,
    shiftPop: 0.28,
  },
  pickup_v8: {
    pulsesPerRev: 4.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.68, 0.42, 0.24, 0.13, 0.07, 0.04, 0.02],
    raspMult: 1.5,
    intakeHz: [110, 350],
    exhaustHz: [190, 740],
    cabinBassDb: 7.5,
    drive: 2.1,
    mechNoise: 0.12,
    forced: 'none',
    baseGain: 0.34,
    shiftPop: 0.18,
  },
  crossover_turbo: {
    pulsesPerRev: 2.0,
    subOrder: 0.5,
    harmonics: [0.95, 0.52, 0.26, 0.14, 0.06, 0.03, 0.01, 0.01],
    raspMult: 2.0,
    intakeHz: [145, 420],
    exhaustHz: [240, 760],
    cabinBassDb: 3.8,
    drive: 1.5,
    mechNoise: 0.07,
    forced: 'turbo',
    baseGain: 0.27,
    shiftPop: 0.06,
  },
  suv_v6_stock: {
    pulsesPerRev: 3.0,
    subOrder: 0.5,
    harmonics: [0.96, 0.50, 0.24, 0.12, 0.05, 0.02, 0.01, 0.01],
    raspMult: 1.5,
    intakeHz: [125, 360],
    exhaustHz: [210, 660],
    cabinBassDb: 4.5,
    drive: 1.4,
    mechNoise: 0.06,
    forced: 'none',
    baseGain: 0.26,
    shiftPop: 0.0,
  },
  v6_sedan: {
    pulsesPerRev: 3.0,
    subOrder: 0.5,
    harmonics: [0.96, 0.48, 0.22, 0.10, 0.04, 0.02, 0.01, 0.01],
    raspMult: 1.5,
    intakeHz: [130, 380],
    exhaustHz: [220, 690],
    cabinBassDb: 4.0,
    drive: 1.35,
    mechNoise: 0.06,
    forced: 'none',
    baseGain: 0.25,
    shiftPop: 0.0,
  },
  i4_commuter: {
    pulsesPerRev: 2.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.46, 0.20, 0.10, 0.04, 0.02, 0.01, 0.0],
    raspMult: 2.0,
    intakeHz: [135, 380],
    exhaustHz: [220, 640],
    cabinBassDb: 3.0,
    drive: 1.25,
    mechNoise: 0.05,
    forced: 'none',
    baseGain: 0.22,
    shiftPop: 0.0,
  },
  hatch_i4: {
    pulsesPerRev: 2.0,
    subOrder: 0.5,
    harmonics: [0.98, 0.54, 0.26, 0.14, 0.06, 0.03, 0.01, 0.0],
    raspMult: 2.0,
    intakeHz: [145, 420],
    exhaustHz: [240, 720],
    cabinBassDb: 3.2,
    drive: 1.4,
    mechNoise: 0.06,
    forced: 'none',
    baseGain: 0.24,
    shiftPop: 0.04,
  },
  hybrid_i4: {
    pulsesPerRev: 2.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.36, 0.14, 0.06, 0.02, 0.01, 0.0, 0.0],
    raspMult: 2.0,
    intakeHz: [120, 320],
    exhaustHz: [195, 560],
    cabinBassDb: 2.5,
    drive: 1.15,
    mechNoise: 0.04,
    forced: 'none',
    baseGain: 0.19,
    shiftPop: 0.0,
  },
  diesel_van: {
    pulsesPerRev: 2.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.65, 0.42, 0.32, 0.24, 0.18, 0.14, 0.10],
    raspMult: 2.0,
    intakeHz: [105, 310],
    exhaustHz: [180, 620],
    cabinBassDb: 7.0,
    drive: 2.2,
    mechNoise: 0.22,
    forced: 'diesel-turbo',
    baseGain: 0.30,
    shiftPop: 0.0,
  },
  diesel_pickup: {
    pulsesPerRev: 4.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.72, 0.46, 0.34, 0.26, 0.18, 0.14, 0.10],
    raspMult: 1.5,
    intakeHz: [95, 300],
    exhaustHz: [170, 640],
    cabinBassDb: 8.5,
    drive: 2.4,
    mechNoise: 0.25,
    forced: 'diesel-turbo',
    baseGain: 0.33,
    shiftPop: 0.0,
  },
  diesel_truck_a: {
    pulsesPerRev: 3.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.74, 0.48, 0.36, 0.28, 0.20, 0.15, 0.10],
    raspMult: 1.5,
    intakeHz: [88, 280],
    exhaustHz: [155, 580],
    cabinBassDb: 9.0,
    drive: 2.5,
    mechNoise: 0.27,
    forced: 'diesel-turbo',
    baseGain: 0.34,
    shiftPop: 0.0,
  },
  diesel_semi: {
    pulsesPerRev: 3.0,
    subOrder: 0.5,
    harmonics: [1.0, 0.78, 0.52, 0.38, 0.30, 0.22, 0.16, 0.12],
    raspMult: 1.5,
    intakeHz: [78, 250],
    exhaustHz: [140, 520],
    cabinBassDb: 10.0,
    drive: 2.6,
    mechNoise: 0.29,
    forced: 'diesel-turbo',
    baseGain: 0.36,
    shiftPop: 0.0,
  },
};

function makeAsymmetricDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    // Slight asymmetry produces rich even + odd warm exhaust harmonics (zero harsh digital buzz)
    const shifted = x * drive + 0.14 * drive * x * x;
    curve[i] = Math.tanh(shifted) / Math.tanh(drive);
  }
  return curve;
}

interface SteadyClipBank {
  idle: AudioBuffer;
  mid: AudioBuffer;
  high: AudioBuffer;
  decel: AudioBuffer;
}

/**
 * Extracts the steadiest, highest-energy micro-window (~0.32s) from a real engine clip
 * and overlap-add crossfades it into a seamless, click-free, zero-pitch-drift steady loop.
 * This eliminates repeating rev-up ramps and pass-by Doppler sweeps while preserving 100%
 * of the real recorded combustion, valvetrain, intake, and exhaust timbre!
 */
function extractSteadyLoop(ctx: AudioContext, raw: AudioBuffer): AudioBuffer {
  const sr = raw.sampleRate;
  const ch0 = raw.getChannelData(0);
  const ch1 = raw.numberOfChannels > 1 ? raw.getChannelData(1) : null;
  const total = ch0.length;

  // Build mono analysis signal
  const mono = new Float32Array(total);
  if (ch1) {
    for (let i = 0; i < total; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
  } else {
    mono.set(ch0);
  }

  // Target ~0.34s loop body + ~0.09s equal-power overlap splice (fits comfortably inside ~1.4s clips)
  const xfade = Math.min(Math.floor(sr * 0.09), Math.floor(total * 0.14));
  const body = Math.min(Math.floor(sr * 0.34), Math.max(Math.floor(sr * 0.16), total - xfade * 2));
  const winLen = body + xfade;
  if (total <= winLen + 64) return raw;

  // Compute 25ms frame RMS + Zero-Crossing Rate (proxy for instantaneous pitch stability)
  const hop = Math.max(128, Math.floor(sr * 0.025));
  const nFrames = Math.floor((total - hop) / hop);
  const rms = new Float32Array(nFrames);
  const zcr = new Float32Array(nFrames);
  let maxRms = 1e-6;
  for (let f = 0; f < nFrames; f++) {
    const o = f * hop;
    let sumSq = 0;
    let zc = 0;
    let prev = mono[o];
    for (let i = 0; i < hop; i++) {
      const v = mono[o + i];
      sumSq += v * v;
      if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zc++;
      prev = v;
    }
    const r = Math.sqrt(sumSq / hop);
    rms[f] = r;
    zcr[f] = zc / hop;
    if (r > maxRms) maxRms = r;
  }

  // Slide window over interior (skip first/last 5% fade edges) to find minimal pitch+level drift with strong signal
  const winFrames = Math.max(2, Math.floor(winLen / hop));
  const startF = Math.max(0, Math.floor(nFrames * 0.05));
  const endF = Math.max(startF + 1, Math.min(nFrames - winFrames, Math.floor(nFrames * 0.95) - winFrames));

  let bestFrame = startF;
  let bestScore = Infinity;
  for (let f = startF; f < endF; f++) {
    let meanR = 0, meanZ = 0;
    for (let k = 0; k < winFrames; k++) { meanR += rms[f + k]; meanZ += zcr[f + k]; }
    meanR /= winFrames;
    meanZ /= winFrames;
    const relR = meanR / maxRms;
    if (relR < 0.32) continue; // skip quiet tails / silence
    let varR = 0, varZ = 0;
    for (let k = 0; k < winFrames; k++) {
      const dr = (rms[f + k] - meanR) / (meanR + 1e-5);
      const dz = (zcr[f + k] - meanZ) / (meanZ + 1e-5);
      varR += dr * dr;
      varZ += dz * dz;
    }
    // Strongly penalize pitch drift (ZCR slope/variance) & amplitude ramps, lightly reward energetic pocket
    const drift = (varZ / winFrames) * 2.8 + (varR / winFrames) * 1.6;
    const score = drift - relR * 0.25;
    if (score < bestScore) {
      bestScore = score;
      bestFrame = f;
    }
  }

  const s0 = Math.min(total - winLen, bestFrame * hop);
  const outBuf = ctx.createBuffer(1, body, sr);
  const dst = outBuf.getChannelData(0);

  // Copy steady core and overlap-add tail [s0+body .. s0+body+xfade] onto head [0 .. xfade] with equal-power Hann window
  for (let i = 0; i < body; i++) dst[i] = mono[s0 + i];
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade;
    const wHead = Math.sin(t * Math.PI * 0.5);
    const wTail = Math.cos(t * Math.PI * 0.5);
    dst[i] = mono[s0 + i] * wHead + mono[s0 + body + i] * wTail;
  }

  // Remove DC offset and normalize RMS to a consistent -13 dBFS so idle/mid/high/decel crossfade cleanly
  let dc = 0;
  for (let i = 0; i < body; i++) dc += dst[i];
  dc /= body;
  let sq = 0;
  for (let i = 0; i < body; i++) {
    const v = dst[i] - dc;
    dst[i] = v;
    sq += v * v;
  }
  const curRms = Math.sqrt(sq / body);
  const targetRms = 0.22;
  const norm = curRms > 1e-4 ? Math.min(4.0, targetRms / curRms) : 1.0;
  for (let i = 0; i < body; i++) {
    dst[i] = Math.max(-0.98, Math.min(0.98, dst[i] * norm));
  }
  return outBuf;
}

export class InCarEngineSynth {
  private ctx: AudioContext;
  private out: GainNode;
  private noiseBuf: AudioBuffer;

  // Hybrid mix buses: real steady-state recorded clip layers (primary voice) + phase-locked harmonic sub-foundation
  private synthBus: GainNode;
  private clipBus: GainNode;
  private clipLowShelf: BiquadFilterNode;
  private clipPresence: BiquadFilterNode;
  private clipLp: BiquadFilterNode;
  private clipShaper: WaveShaperNode;

  // 4 RPM-locked real recorded sample layers (dual-phase staggered voices eliminate any loop periodicity on long straights!)
  private clipIdleGain: GainNode;
  private clipMidGain: GainNode;
  private clipHighGain: GainNode;
  private clipDecelGain: GainNode;
  private clipIdleSrcs: AudioBufferSourceNode[] = [];
  private clipMidSrcs: AudioBufferSourceNode[] = [];
  private clipHighSrcs: AudioBufferSourceNode[] = [];
  private clipDecelSrcs: AudioBufferSourceNode[] = [];
  private clipLoadedBank = '';
  private clipReady = false;
  private clipCache = new Map<string, Promise<SteadyClipBank | null>>();

  // Motorsport straight-cut gearbox / differential whine (Track/Rally/Race/Elohim cars only)
  private transOsc: OscillatorNode;
  private transBand: BiquadFilterNode;
  private transGain: GainNode;

  // Core oscillators (firing order fundamental, uneven sub-order, mechanical upper rasp)
  private oscMain: OscillatorNode;
  private oscSub: OscillatorNode;
  private oscRasp: OscillatorNode;
  private mainGain: GainNode;
  private subGain: GainNode;
  private raspGain: GainNode;

  // Firing-rate modulated intake/combustion air texture (gives raw organic mechanical bite)
  private airSrc: AudioBufferSourceNode;
  private airBand: BiquadFilterNode;
  private airModGain: GainNode;
  private airModOsc: OscillatorNode;
  private airModDepth: GainNode;
  private airLevel: GainNode;

  // Dual close-mic body resonators (intake plenum + exhaust header) -> asymmetric exhaust drive -> cabin EQ
  private intakeRes: BiquadFilterNode;
  private exhaustRes: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private cabinBass: BiquadFilterNode;
  private masterLp: BiquadFilterNode;

  // Forced induction (supercharger whine / turbo spool)
  private forcedOsc: OscillatorNode;
  private forcedGain: GainNode;

  private activeBankId = '';
  private profile: EngineAcousticProfile = PROFILES.sc_v8_blower;
  private lastGear = 0;
  private lastThrottle = 0;
  private lastBoost = 0;
  private lastPopAt = 0;
  private lastBovAt = 0;
  private limiterPhase = 0;

  constructor(ctx: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer) {
    this.ctx = ctx;
    this.noiseBuf = noiseBuffer;

    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);

    // Hybrid buses: synthBus starts at 1.0 until real clips finish decoding (~30ms), then smoothly hands primary voice to clipBus
    this.synthBus = ctx.createGain();
    this.synthBus.gain.value = 1.0;
    this.synthBus.connect(this.out);

    this.clipBus = ctx.createGain();
    this.clipBus.gain.value = 0.0;

    this.clipLowShelf = ctx.createBiquadFilter();
    this.clipLowShelf.type = 'lowshelf';
    this.clipLowShelf.frequency.value = 135;
    this.clipLowShelf.gain.value = 4.5;

    this.clipPresence = ctx.createBiquadFilter();
    this.clipPresence.type = 'peaking';
    this.clipPresence.frequency.value = 950;
    this.clipPresence.Q.value = 1.1;
    this.clipPresence.gain.value = 2.0;

    this.clipLp = ctx.createBiquadFilter();
    this.clipLp.type = 'lowpass';
    this.clipLp.frequency.value = 3200;
    this.clipLp.Q.value = 0.75;

    this.clipShaper = ctx.createWaveShaper();
    this.clipShaper.curve = makeAsymmetricDriveCurve(1.45);
    this.clipShaper.oversample = '2x';

    this.clipIdleGain = ctx.createGain();
    this.clipMidGain = ctx.createGain();
    this.clipHighGain = ctx.createGain();
    this.clipDecelGain = ctx.createGain();
    this.clipIdleGain.gain.value = 0;
    this.clipMidGain.gain.value = 0;
    this.clipHighGain.gain.value = 0;
    this.clipDecelGain.gain.value = 0;

    this.clipIdleGain.connect(this.clipShaper);
    this.clipMidGain.connect(this.clipShaper);
    this.clipHighGain.connect(this.clipShaper);
    this.clipDecelGain.connect(this.clipShaper);
    this.clipShaper.connect(this.clipLowShelf);
    this.clipLowShelf.connect(this.clipPresence);
    this.clipPresence.connect(this.clipLp);
    this.clipLp.connect(this.clipBus);
    this.clipBus.connect(this.out);

    // Warm cabin low-shelf + close-mic rolloff (eliminates harsh synthetic high-frequency fizz)
    this.cabinBass = ctx.createBiquadFilter();
    this.cabinBass.type = 'lowshelf';
    this.cabinBass.frequency.value = 115;
    this.cabinBass.gain.value = 6.5;

    this.masterLp = ctx.createBiquadFilter();
    this.masterLp.type = 'lowpass';
    this.masterLp.frequency.value = 1600;
    this.masterLp.Q.value = 0.9;

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeAsymmetricDriveCurve(2.8);
    this.shaper.oversample = '2x';

    // Parallel intake plenum + exhaust pipe formant filters
    this.intakeRes = ctx.createBiquadFilter();
    this.intakeRes.type = 'peaking';
    this.intakeRes.frequency.value = 220;
    this.intakeRes.Q.value = 2.4;
    this.intakeRes.gain.value = 8.5;

    this.exhaustRes = ctx.createBiquadFilter();
    this.exhaustRes.type = 'peaking';
    this.exhaustRes.frequency.value = 540;
    this.exhaustRes.Q.value = 1.9;
    this.exhaustRes.gain.value = 6.5;

    this.intakeRes.connect(this.exhaustRes);
    this.exhaustRes.connect(this.shaper);
    this.shaper.connect(this.cabinBass);
    this.cabinBass.connect(this.masterLp);
    this.masterLp.connect(this.synthBus);

    // Oscillators
    this.oscMain = ctx.createOscillator();
    this.oscSub = ctx.createOscillator();
    this.oscRasp = ctx.createOscillator();

    this.mainGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.raspGain = ctx.createGain();
    this.mainGain.gain.value = 0.55;
    this.subGain.gain.value = 0.38;
    this.raspGain.gain.value = 0.16;

    this.oscMain.connect(this.mainGain).connect(this.intakeRes);
    this.oscSub.connect(this.subGain).connect(this.intakeRes);
    this.oscRasp.connect(this.raspGain).connect(this.intakeRes);

    // Firing-rate amplitude-modulated mechanical combustion/intake air noise
    this.airSrc = ctx.createBufferSource();
    this.airSrc.buffer = noiseBuffer;
    this.airSrc.loop = true;

    this.airBand = ctx.createBiquadFilter();
    this.airBand.type = 'bandpass';
    this.airBand.frequency.value = 620;
    this.airBand.Q.value = 1.25;

    this.airModGain = ctx.createGain();
    this.airModGain.gain.value = 0.55;

    this.airModOsc = ctx.createOscillator();
    this.airModOsc.type = 'sine';
    this.airModOsc.frequency.value = 60;
    this.airModDepth = ctx.createGain();
    this.airModDepth.gain.value = 0.45;
    this.airModOsc.connect(this.airModDepth).connect(this.airModGain.gain);

    this.airLevel = ctx.createGain();
    this.airLevel.gain.value = 0.12;

    this.airSrc.connect(this.airBand).connect(this.airModGain).connect(this.airLevel).connect(this.intakeRes);

    // Forced induction whine (supercharger / turbo spool)
    this.forcedOsc = ctx.createOscillator();
    this.forcedOsc.type = 'sine';
    this.forcedOsc.frequency.value = 900;
    this.forcedGain = ctx.createGain();
    this.forcedGain.gain.value = 0.0;
    this.forcedOsc.connect(this.forcedGain).connect(this.out);

    // Straight-cut motorsport transmission / differential whine (Track/Rally/Race/Elohim cars)
    this.transOsc = ctx.createOscillator();
    this.transOsc.type = 'triangle';
    this.transOsc.frequency.value = 420;
    this.transBand = ctx.createBiquadFilter();
    this.transBand.type = 'bandpass';
    this.transBand.frequency.value = 1400;
    this.transBand.Q.value = 3.2;
    this.transGain = ctx.createGain();
    this.transGain.gain.value = 0.0;
    this.transOsc.connect(this.transBand).connect(this.transGain).connect(this.out);

    this.oscMain.start();
    this.oscSub.start();
    this.oscRasp.start();
    this.airSrc.start();
    this.airModOsc.start();
    this.forcedOsc.start();
    this.transOsc.start();

    this.applyBank('sc_v8_blower', 0);
  }

  private applyBank(bankId: string, upgradeLevel: number): void {
    const key = `${bankId}#${upgradeLevel}`;
    if (this.activeBankId === key) return;
    this.activeBankId = key;
    const prof = PROFILES[bankId] ?? PROFILES.sports_car_gt;
    this.profile = prof;

    // Build custom Fourier PeriodicWave matching this engine's exact cylinder harmonic spectrum
    const h = prof.harmonics;
    const upgBright = 1 + upgradeLevel * 0.14;
    const real = new Float32Array(h.length + 1);
    const imag = new Float32Array(h.length + 1);
    for (let i = 0; i < h.length; i++) {
      // Slightly boost upper harmonics when player equips sport/race exhaust upgrades
      imag[i + 1] = h[i] * (i >= 2 ? upgBright : 1.0);
    }
    const waveMain = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.oscMain.setPeriodicWave(waveMain);

    // Warm rounded sub-order wave (gives the deep uneven V8 / I5 pulse without harsh buzz)
    const subReal = new Float32Array(5);
    const subImag = new Float32Array([0, 1.0, 0.35, 0.14, 0.05]);
    this.oscSub.setPeriodicWave(this.ctx.createPeriodicWave(subReal, subImag));

    // Mechanical upper rasp wave
    const raspReal = new Float32Array(6);
    const raspImag = new Float32Array([0, 0.4, 0.85, 0.62, 0.38, 0.22]);
    this.oscRasp.setPeriodicWave(this.ctx.createPeriodicWave(raspReal, raspImag));

    const drive = Math.min(4.2, prof.drive + upgradeLevel * 0.26);
    this.shaper.curve = makeAsymmetricDriveCurve(drive);
    this.cabinBass.gain.value = prof.cabinBassDb;
    this.clipLowShelf.gain.value = Math.min(7.5, prof.cabinBassDb * 0.65);
    this.clipShaper.curve = makeAsymmetricDriveCurve(1.15 + Math.min(1.6, (prof.drive - 1.0) * 0.45 + upgradeLevel * 0.14));

    if (this.clipLoadedBank !== bankId) {
      this.clipLoadedBank = bankId;
      void this.activateClipBank(bankId);
    }
  }

  private fetchClipBank(bankId: string): Promise<SteadyClipBank | null> {
    const cached = this.clipCache.get(bankId);
    if (cached) return cached;
    const meta = getEngineBank(bankId);
    if (!meta?.basePath) return Promise.resolve(null);

    const p = (async (): Promise<SteadyClipBank | null> => {
      try {
        const loadOne = async (name: string): Promise<AudioBuffer> => {
          const res = await fetch(`${meta.basePath}/${name}.mp3`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          const decoded = await this.ctx.decodeAudioData(ab);
          return extractSteadyLoop(this.ctx, decoded);
        };
        const [idle, mid, high, decel] = await Promise.all([
          loadOne('idle'),
          loadOne('mid'),
          loadOne('high'),
          loadOne('decel'),
        ]);
        return { idle, mid, high, decel };
      } catch {
        return null;
      }
    })();
    this.clipCache.set(bankId, p);
    return p;
  }

  private stopClipSources(): void {
    for (const arr of [this.clipIdleSrcs, this.clipMidSrcs, this.clipHighSrcs, this.clipDecelSrcs]) {
      for (const s of arr) {
        try { s.stop(); s.disconnect(); } catch { /* already stopped */ }
      }
      arr.length = 0;
    }
  }

  private async activateClipBank(bankId: string): Promise<void> {
    const bank = await this.fetchClipBank(bankId);
    if (!bank || this.clipLoadedBank !== bankId) return;

    this.stopClipSources();
    // Dual-phase staggered playback (0% and 50% loop phase + +-0.45% micro-detune) completely eliminates
    // any audible 3Hz loop periodicity on sustained straightaways while preserving 100% real combustion timbre!
    const startDualLoop = (buf: AudioBuffer, target: GainNode): AudioBufferSourceNode[] => {
      const half = buf.duration * 0.5;
      const out: AudioBufferSourceNode[] = [];
      for (let v = 0; v < 2; v++) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = v === 0 ? 0.996 : 1.004;
        const vg = this.ctx.createGain();
        vg.gain.value = 0.68; // equal-power sum (~0.96 RMS)
        src.connect(vg).connect(target);
        src.start(0, v === 0 ? 0 : half);
        out.push(src);
      }
      return out;
    };
    this.clipIdleSrcs = startDualLoop(bank.idle, this.clipIdleGain);
    this.clipMidSrcs = startDualLoop(bank.mid, this.clipMidGain);
    this.clipHighSrcs = startDualLoop(bank.high, this.clipHighGain);
    this.clipDecelSrcs = startDualLoop(bank.decel, this.clipDecelGain);
    this.clipReady = true;

    const now = this.ctx.currentTime;
    // Smoothly hand primary acoustic voice to real steady-state engine clips, keeping synth as warm RPM-locked sub-foundation
    this.clipBus.gain.setTargetAtTime(0.94, now, 0.08);
    this.synthBus.gain.setTargetAtTime(0.30, now, 0.08);
  }

  /** Crisp close-mic DSG/sequential upshift exhaust bark or downshift overrun crackle */
  private triggerShiftBark(now: number, intensity: number, isUpshift: boolean): void {
    if (intensity < 0.08) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isUpshift ? 240 + Math.random() * 140 : 420 + Math.random() * 260, now);
    bp.Q.value = isUpshift ? 1.8 : 2.6;
    const g = this.ctx.createGain();
    const peak = Math.min(0.42, intensity * (isUpshift ? 0.32 : 0.22));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isUpshift ? 0.11 : 0.16));
    src.connect(bp).connect(g).connect(this.out);
    src.start(now, Math.random() * 0.6);
    src.stop(now + 0.19);
  }

  /** Authentic turbo compressor surge / BOV flutter ("stu-tu-tu") on boost lift-off or upshift */
  private triggerTurboFlutter(now: number, boost: number): void {
    const pulses = boost > 0.65 ? 3 : 2;
    for (let i = 0; i < pulses; i++) {
      const t0 = now + i * 0.052;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200 - i * 320, t0);
      bp.Q.value = 5.5;
      const g = this.ctx.createGain();
      const amp = Math.min(0.18, boost * 0.16 * (1 - i * 0.25));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.048);
      src.connect(bp).connect(g).connect(this.out);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + 0.055);
    }
  }

  public update(state: CarState, spec: CarSpec, throttle: number, bankId: string, dt = 0.016): void {
    const now = this.ctx.currentTime;
    const upgLvl = spec.engine.soundUpgradeLevel ?? 0;
    this.applyBank(bankId, upgLvl);

    const prof = this.profile;
    const meta = getEngineBank(bankId);
    const idleRpm = Math.max(650, spec.engine.idleRpm);
    const redlineRpm = Math.max(idleRpm + 1500, spec.engine.redlineRpm);
    const rpm = Math.max(idleRpm * 0.85, Math.min(redlineRpm * 1.03, state.rpm));
    const rpmFrac = Math.min(1, Math.max(0, (rpm - idleRpm) / (redlineRpm - idleRpm)));

    // True cylinder firing frequency (Hz) locked 1:1 to live simulated RPM
    // Example: 6000 RPM V8 (4 pulses/rev) -> 400 Hz firing fundamental, 200 Hz cross-plane sub-order!
    // Scaled by 0.5 for deep chesty cockpit fundamental alignment with real exhaust Helmholtz resonance
    const firingHz = Math.max(22, (rpm / 60) * prof.pulsesPerRev * 0.5);
    const subHz = Math.max(16, firingHz * prof.subOrder);
    const raspHz = firingHz * prof.raspMult;

    // Subtle mechanical idle lope (authentic cammed idle tremor at low RPM)
    const idleLope = (1 - Math.min(1, rpmFrac * 4.5)) * (prof.drive > 2.5 ? 0.025 : 0.008) * Math.sin(now * 28.0);
    const tc = 0.018; // ultra-responsive pitch tracking (~18ms) — instant gear-shift snap!
    this.oscMain.frequency.setTargetAtTime(firingHz * (1 + idleLope), now, tc);
    this.oscSub.frequency.setTargetAtTime(subHz * (1 + idleLope * 1.4), now, tc);
    this.oscRasp.frequency.setTargetAtTime(raspHz, now, tc);
    this.airModOsc.frequency.setTargetAtTime(Math.min(180, firingHz), now, 0.025);

    // Rev-limiter staccato bounce when pinned at redline (grid revving or gear top)
    let limiterCut = 1.0;
    if (rpm >= redlineRpm - 140 && throttle > 0.45) {
      this.limiterPhase = (this.limiterPhase + dt * 16.5) % 1;
      limiterCut = this.limiterPhase < 0.52 ? 1.0 : 0.16;
    } else {
      this.limiterPhase = 0;
    }

    // Detect real gear shifts (upshift ignition cut + exhaust bark; downshift rev-match blip!)
    const gear = state.gear;
    const popScale = Math.min(1, prof.shiftPop + upgLvl * 0.18);
    if (this.lastGear > 0 && gear > 0 && gear !== this.lastGear) {
      if (gear > this.lastGear) {
        // Upshift!
        this.triggerShiftBark(now, popScale * (0.65 + throttle * 0.35), true);
        if (prof.forced === 'turbo' && state.turboBoost > 0.35 && now - this.lastBovAt > 0.35) {
          this.lastBovAt = now;
          this.triggerTurboFlutter(now, state.turboBoost);
        }
      } else {
        // Downshift rev-match blip!
        this.triggerShiftBark(now, popScale * 0.72, false);
      }
    }
    this.lastGear = gear;

    // Throttle lift-off overrun crackle & turbo BOV flutter (performance/upgraded cars only)
    const liftOff = this.lastThrottle > 0.48 && throttle < 0.14 && rpmFrac > 0.40;
    if (liftOff) {
      if (popScale > 0.25 && now - this.lastPopAt > 0.48) {
        this.lastPopAt = now;
        this.triggerShiftBark(now, popScale * 0.65, false);
      }
      if (prof.forced === 'turbo' && this.lastBoost > 0.42 && now - this.lastBovAt > 0.42) {
        this.lastBovAt = now;
        this.triggerTurboFlutter(now, this.lastBoost);
      }
    }
    this.lastThrottle = throttle;
    this.lastBoost = state.turboBoost;

    // Shift torque ignition-cut dip (crisp 90ms drop during gear change)
    const shiftCut = state.shiftTimer > 0 ? 0.26 : 1.0;

    // Throttle load opens up intake plenum resonance & upper mechanical rasp; coasting sounds deep/hollow
    const load = Math.min(1, Math.max(0, throttle));
    const aggBoost = Math.min(1, ((meta?.aggression ?? 2) + upgLvl * 0.65) / 4);

    const intakeF = prof.intakeHz[0] + (prof.intakeHz[1] - prof.intakeHz[0]) * (0.28 * load + 0.72 * rpmFrac);
    const exhaustF = prof.exhaustHz[0] + (prof.exhaustHz[1] - prof.exhaustHz[0]) * (0.20 * load + 0.80 * rpmFrac);
    this.intakeRes.frequency.setTargetAtTime(intakeF, now, 0.025);
    this.intakeRes.gain.setTargetAtTime(3.5 + load * 7.5 + aggBoost * 2.5, now, 0.03);
    this.exhaustRes.frequency.setTargetAtTime(exhaustF, now, 0.025);
    this.exhaustRes.gain.setTargetAtTime(3.0 + rpmFrac * 6.0 + load * 3.0, now, 0.03);

    // Master lowpass tracks throttle load & RPM (prevents any harsh synthetic buzz at low RPM or idle)
    const lpMin = 380 + aggBoost * 240;
    const lpMax = 1450 + aggBoost * 2400;
    const lpHz = lpMin + (lpMax - lpMin) * (0.18 + load * 0.42 + rpmFrac * 0.48);
    // When real clips are active, keep synth sub-foundation warm & chesty underneath so real clips shine on top!
    this.masterLp.frequency.setTargetAtTime((this.clipReady ? Math.min(lpHz, 520 + rpmFrac * 420) : lpHz) * shiftCut, now, 0.025);

    // Update 4-layer dual-phase RPM-locked real recorded engine clips (idle -> mid -> high + off-throttle decel overrun)
    if (this.clipReady && this.clipIdleSrcs.length && this.clipMidSrcs.length && this.clipHighSrcs.length && this.clipDecelSrcs.length) {
      // Pitch-locked playbackRate kept inside natural 0.72x..1.48x window so real recordings never sound chipmunky
      const idleRate = 0.84 + rpmFrac * 1.12 + idleLope * 0.6;
      const midRate = 0.72 + rpmFrac * 0.90;
      const highRate = 0.64 + rpmFrac * 0.66;
      const decelRate = 0.72 + rpmFrac * 0.78;
      const setDual = (srcs: AudioBufferSourceNode[], rate: number, tcRate: number) => {
        if (srcs[0]) srcs[0].playbackRate.setTargetAtTime(rate * 0.9955, now, tcRate);
        if (srcs[1]) srcs[1].playbackRate.setTargetAtTime(rate * 1.0045, now, tcRate);
      };
      setDual(this.clipIdleSrcs, idleRate, 0.022);
      setDual(this.clipMidSrcs, midRate, 0.020);
      setDual(this.clipHighSrcs, highRate, 0.018);
      setDual(this.clipDecelSrcs, decelRate, 0.024);

      // Equal-power RPM crossfade weights: idle [0..0.42], mid [0.14..0.86], high [0.50..1.00]
      const smooth = (a: number, b: number, x: number): number => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      const wIdle = Math.cos(smooth(0.14, 0.42, rpmFrac) * Math.PI * 0.5);
      const wMidIn = Math.sin(smooth(0.14, 0.36, rpmFrac) * Math.PI * 0.5);
      const wMidOut = Math.cos(smooth(0.56, 0.86, rpmFrac) * Math.PI * 0.5);
      const wMid = wMidIn * wMidOut;
      const wHigh = Math.sin(smooth(0.48, 0.76, rpmFrac) * Math.PI * 0.5);

      // Off-throttle engine-braking / overrun crossfade into real decel.mp3 clip
      const decelMix = (1 - load) * smooth(0.18, 0.46, rpmFrac) * 0.72;
      const onMix = 1 - decelMix * 0.65;

      this.clipIdleGain.gain.setTargetAtTime(wIdle * onMix * (0.85 + load * 0.25), now, 0.028);
      this.clipMidGain.gain.setTargetAtTime(wMid * onMix * (0.82 + load * 0.32), now, 0.025);
      this.clipHighGain.gain.setTargetAtTime(wHigh * onMix * (0.86 + load * 0.34), now, 0.022);
      this.clipDecelGain.gain.setTargetAtTime(decelMix, now, 0.035);

      // Dynamic throttle-reactive cabin/exhaust EQ on the real recorded clips (smooth at cruise, wide open at WOT)
      const clipCutMin = 1250 + aggBoost * 650;
      const clipCutMax = 3800 + aggBoost * 4200;
      const clipCut = clipCutMin + (clipCutMax - clipCutMin) * (0.22 + load * 0.48 + rpmFrac * 0.38);
      this.clipLp.frequency.setTargetAtTime(clipCut * (0.65 + 0.35 * shiftCut), now, 0.025);
      this.clipPresence.frequency.setTargetAtTime(480 + rpmFrac * 1350 + load * 320, now, 0.03);
      this.clipPresence.gain.setTargetAtTime(0.5 + load * 4.2 + aggBoost * 2.0, now, 0.03);
    }

    // Balance fundamental, uneven sub-order rumble, upper mechanical rasp, and air-intake growl
    this.mainGain.gain.setTargetAtTime(0.48 + load * 0.28, now, 0.025);
    this.subGain.gain.setTargetAtTime(0.42 * (1 - rpmFrac * 0.28) + load * 0.16, now, 0.025);
    this.raspGain.gain.setTargetAtTime((0.06 + rpmFrac * 0.24 + load * 0.14) * (0.45 + aggBoost * 0.75), now, 0.025);

    this.airBand.frequency.setTargetAtTime(280 + rpmFrac * 1500 + load * 450, now, 0.03);
    this.airLevel.gain.setTargetAtTime(prof.mechNoise * (0.35 + load * 0.75 + rpmFrac * 0.55), now, 0.03);

    // Forced induction (authentic supercharger whine or turbo spool whistle)
    if (prof.forced === 'supercharger' || spec.engine.aspiration === 'Supercharged') {
      this.forcedOsc.frequency.setTargetAtTime(560 + rpmFrac * 2450, now, 0.02);
      this.forcedGain.gain.setTargetAtTime((0.008 + load * 0.048) * (0.25 + rpmFrac * 0.85) * shiftCut, now, 0.025);
    } else if (prof.forced === 'turbo' || prof.forced === 'diesel-turbo' || spec.engine.aspiration === 'Twin-Turbo') {
      const baseWhine = prof.forced === 'diesel-turbo' ? 1150 : 1650;
      this.forcedOsc.frequency.setTargetAtTime(baseWhine + state.turboBoost * 2600 + rpmFrac * 500, now, 0.03);
      this.forcedGain.gain.setTargetAtTime(state.turboBoost * (prof.forced === 'diesel-turbo' ? 0.045 : 0.032) * shiftCut, now, 0.035);
    } else {
      this.forcedGain.gain.setTargetAtTime(0, now, 0.04);
    }

    // Motorsport straight-cut transmission / differential whine (Track/Rally/Race/Elohim cars; silent on quiet stock commuters)
    const isMotorsportGearbox = spec.vehicleClass === 'track' || spec.vehicleClass === 'rally' || upgLvl >= 3 || (meta?.aggression ?? 0) >= 4;
    if (isMotorsportGearbox && Math.abs(state.speedMps) > 4) {
      const spdFrac = Math.min(1, Math.abs(state.speedMps) / Math.max(45, spec.topSpeedMps));
      const whineHz = 360 + spdFrac * 1950 + rpmFrac * 340;
      this.transOsc.frequency.setTargetAtTime(whineHz, now, 0.025);
      this.transBand.frequency.setTargetAtTime(whineHz * 1.15, now, 0.03);
      const gearLoad = 0.35 + load * 0.65;
      this.transGain.gain.setTargetAtTime(0.028 * spdFrac * gearLoad * shiftCut, now, 0.03);
    } else {
      this.transGain.gain.setTargetAtTime(0, now, 0.04);
    }

    // Master engine bus gain (respects quiet stock everyday cars vs aggressive supercars + upgrades)
    const upgVol = 1 + upgLvl * 0.09;
    const totalVol = prof.baseGain * upgVol * (0.42 + load * 0.36 + rpmFrac * 0.34) * shiftCut * limiterCut;
    this.out.gain.setTargetAtTime(totalVol, now, 0.022);
  }

  public setMuted(silent: boolean): void {
    if (silent) this.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04);
  }
}
