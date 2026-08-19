// The Pressing — the Melos mastering chain.
//
// Native Web Audio on purpose, same reasoning as Spectra (spectraEq.ts:1-12): the chain is
// static or slowly automated, so biquads + a WaveShaper are the right, standard tools. The
// signal path is the canonical mastering order (docs/MASTER_SUITE_RESEARCH.md §1):
//
//   input → HP → LP → tilt (low+high shelf) → head bump → tape drive (asym waveshaper,
//   4x oversampled, DC-blocked) → M/S width (bass kept mono below `monoBelowHz`) → analyser → out
//
// Glue compression and the brickwall limiter stay in graph.ts where they already live — this
// device slots into the master insert rack between them and the Spectra EQ.
//
// Era profiles are DSP reconstructions of each decade's mastering practice (research digest §5,
// sources therein). Pre-1990 loudness figures are equivalent-loudness estimates — LUFS didn't
// exist — which is why the UI presents them as "pressing notes", not measurements.

export type NoiseType = 'none' | 'hiss' | 'crackle';

export interface EraProfile {
  id: string;
  year: string;          // what the sleeve says: '1972', 'Now'
  decade: string;
  label: string;         // 'Tape & Console'
  discColor: string;     // sleeve center label
  hpHz: number;          // program bandwidth
  lpHz: number;
  tiltDb: number;        // broad spectral tilt, + = brighter (high shelf @ 8k, low shelf inverse)
  headBumpHz: number;    // 0 = none — tape machine LF bump
  headBumpDb: number;
  drive: number;         // 0..1 saturation amount (maps THD of the era's medium)
  driveAsym: number;     // 0..0.4 asymmetry — even-harmonic (tube/tape) character
  width: number;         // 1 = untouched, 0 = mono, >1 wider (80s+)
  monoBelowHz: number;   // vinyl-era elliptical filter; 0 = off
  glue: boolean;         // era used bus compression
  noiseType: NoiseType;  // the medium's noise bed: shellac crackle, tape hiss, digital silence
  noiseDb: number;       // bed level (research digest §5 SNR figures); -100 = silent
  wowPct: number;        // wow/flutter pitch deviation % (0.5 = spring-motor 78, 0 = digital)
  targetLufs: number;    // pressing note only (not enforced in v1)
  targetDr: number;      // pressing note only
  notes: string;         // the sleeve's liner text — real engineering, reads human
}

export const ERA_PROFILES: EraProfile[] = [
  { id: 'e1928', year: '1928', decade: '1920s', label: 'Electrical 78', discColor: '#8a6d3b',
    hpHz: 100, lpHz: 5000, tiltDb: -2, headBumpHz: 0, headBumpDb: 0,
    drive: 0.55, driveAsym: 0.30, width: 0, monoBelowHz: 0, glue: false, noiseType: 'crackle', noiseDb: -28, wowPct: 0.5, targetLufs: -18, targetDr: 14,
    notes: 'Western Electric cutterhead: nothing above 5 kHz survives the lacquer. Performers ride their own dynamics — the horn is the compressor.' },
  { id: 'e1948', year: '1948', decade: '1940s', label: 'Tape Arrives', discColor: '#a08246',
    hpHz: 40, lpHz: 13000, tiltDb: -1.5, headBumpHz: 0, headBumpDb: 0,
    drive: 0.35, driveAsym: 0.22, width: 0, monoBelowHz: 0, glue: false, noiseType: 'crackle', noiseDb: -40, wowPct: 0.25, targetLufs: -18, targetDr: 15,
    notes: 'The Ampex 200A brings 30 Hz–15 kHz to disc for the first time. Catch-only limiting, two or three dB on the loudest bars.' },
  { id: 'e1958', year: '1958', decade: '1950s', label: 'First Stereo', discColor: '#B8860B',
    hpHz: 30, lpHz: 15000, tiltDb: -0.5, headBumpHz: 80, headBumpDb: 1.5,
    drive: 0.30, driveAsym: 0.25, width: 0.5, monoBelowHz: 300, glue: false, noiseType: 'crackle', noiseDb: -50, wowPct: 0.12, targetLufs: -17, targetDr: 14,
    notes: 'RIAA is four years old, stereo LPs are months old. Vari-mu tubes lean on the peaks slowly; a Pultec bump at the bottom, silk at the top.' },
  { id: 'e1966', year: '1966', decade: '1960s', label: 'Mod Mono', discColor: '#D40055',
    hpHz: 50, lpHz: 15000, tiltDb: 0.5, headBumpHz: 60, headBumpDb: 1,
    drive: 0.40, driveAsym: 0.28, width: 0.7, monoBelowHz: 200, glue: true, noiseType: 'hiss', noiseDb: -48, wowPct: 0.1, targetLufs: -15, targetDr: 13,
    notes: 'Midrange forward and mono-brave — cut to compete on AM radio. The Fairchild pumps a little and nobody minds; that pump IS the record.' },
  { id: 'e1972', year: '1972', decade: '1970s', label: 'Tape & Console', discColor: '#FF8C00',
    hpHz: 30, lpHz: 16000, tiltDb: -1, headBumpHz: 60, headBumpDb: 1.8,
    drive: 0.32, driveAsym: 0.20, width: 1, monoBelowHz: 150, glue: true, noiseType: 'hiss', noiseDb: -56, wowPct: 0.05, targetLufs: -16, targetDr: 14,
    notes: '30 ips with a head bump at 60 Hz, console glue at 2:1, the top rolled gently past 12 k. This decade never met a brickwall — leave the peaks alone.' },
  { id: 'e1985', year: '1985', decade: '1980s', label: 'Digital Sheen', discColor: '#00DAF3',
    hpHz: 20, lpHz: 20000, tiltDb: 2, headBumpHz: 0, headBumpDb: 0,
    drive: 0.08, driveAsym: 0.05, width: 1.15, monoBelowHz: 100, glue: true, noiseType: 'none', noiseDb: -100, wowPct: 0, targetLufs: -15, targetDr: 13,
    notes: 'The PCM-1630 era: silence between notes for the first time, a bright shelf at the top, and CDs that peak at −6 dB because nobody was fighting yet.' },
  { id: 'e1997', year: '1997', decade: '1990s', label: 'Big & Loud', discColor: '#6B0099',
    hpHz: 20, lpHz: 20000, tiltDb: 1, headBumpHz: 70, headBumpDb: 1.5,
    drive: 0.18, driveAsym: 0.10, width: 1.1, monoBelowHz: 100, glue: true, noiseType: 'none', noiseDb: -100, wowPct: 0, targetLufs: -12, targetDr: 10,
    notes: 'The L1 exists and the war is on. Smiley EQ — big bottom, bright top — and three or four dB shaved off every chorus. Still breathing, barely.' },
  { id: 'e2013', year: '2013', decade: '2010s', label: 'Sub & Wide', discColor: '#D0BCFF',
    hpHz: 25, lpHz: 20000, tiltDb: 1.5, headBumpHz: 45, headBumpDb: 2,
    drive: 0.15, driveAsym: 0.08, width: 1.25, monoBelowHz: 80, glue: true, noiseType: 'none', noiseDb: -100, wowPct: 0, targetLufs: -8, targetDr: 6,
    notes: '808 fundamentals at full level, sides pushed past where vinyl could follow, a soothed and airy top. Loud, but the ceiling is −1 dBTP now.' },
  { id: 'now', year: 'Now', decade: '2020s', label: 'Streaming', discColor: '#06D6A0',
    hpHz: 25, lpHz: 20000, tiltDb: 0.5, headBumpHz: 0, headBumpDb: 0,
    drive: 0.10, driveAsym: 0.06, width: 1.1, monoBelowHz: 70, glue: true, noiseType: 'none', noiseDb: -100, wowPct: 0, targetLufs: -10, targetDr: 9,
    notes: 'Normalization ended the war. Wide but mono-compatible, sub controlled to 30 Hz, dynamics partly back. The era character is the absence of artifacts.' },
];

export const eraById = (id: string | null | undefined): EraProfile | null =>
  ERA_PROFILES.find((e) => e.id === id) ?? null;

// The four staff engineers. Deterministic taste today (each is a bias applied on top of the
// pressing); the assistant/ML tier slots in behind the same interface later. Their character
// is real mastering doctrine, not flavor text — see research digest §2.
export interface EngineerProfile {
  id: string;
  name: string;
  style: string;
  signature: string;     // the thing they'd say — shown under the name
  apply(s: MasteringState): void;
}

export const ENGINEERS: EngineerProfile[] = [
  { id: 'ray', name: 'Ray', style: 'Analog soul · tape, glue, patience', signature: '“leave the peaks alone”',
    apply(s) { s.drive = Math.min(1, s.drive + 0.12); s.driveAsym = Math.max(s.driveAsym, 0.18); s.glue = true; s.tiltDb -= 0.5; } },
  { id: 'nova', name: 'Nova', style: 'Streaming-modern · clarity, punch', signature: '“loud but alive”',
    apply(s) { s.tiltDb += 1; s.drive = Math.max(0.06, s.drive * 0.6); s.width = Math.min(1.2, s.width + 0.08); s.glue = true; } },
  { id: 'kaia', name: 'Kaia', style: 'Club master · low end, drive', signature: '“the sub is sacred”',
    apply(s) { s.headBumpHz = s.headBumpHz || 50; s.headBumpDb = Math.max(s.headBumpDb, 2.2); s.monoBelowHz = Math.max(s.monoBelowHz, 90); s.drive = Math.min(1, s.drive + 0.08); } },
  { id: 'june', name: 'June', style: 'Era specialist · restoration', signature: '“1972 had rules”',
    apply() { /* June plays the pressing exactly as written — she IS the era profile. */ } },
];

export interface MasteringState {
  on: boolean;
  eraId: string | null;      // provenance — which pressing these params came from
  engineerId: string | null;
  authenticity: number;      // 0..1 — how hard the era profile is applied (0.7 default)
  // The live params (era × authenticity × engineer, then hand-adjustable):
  hpHz: number; lpHz: number;
  tiltDb: number;
  headBumpHz: number; headBumpDb: number;
  drive: number; driveAsym: number;
  width: number; monoBelowHz: number;
  glue: boolean;
  // The medium's texture — optional so docs saved before it existed stay valid.
  noiseType?: NoiseType; noiseDb?: number; wowPct?: number;
}

export function defaultMastering(): MasteringState {
  return {
    on: false, eraId: null, engineerId: null, authenticity: 0.7,
    hpHz: 20, lpHz: 20000, tiltDb: 0, headBumpHz: 0, headBumpDb: 0,
    drive: 0, driveAsym: 0, width: 1, monoBelowHz: 0, glue: false,
    noiseType: 'none', noiseDb: -100, wowPct: 0,
  };
}

/** Blend a value toward its era target by `authenticity` (0 = untouched, 1 = full pressing). */
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Write an era's pressing onto the state at the given authenticity, then let the engineer bias it. */
export function applyEra(s: MasteringState, era: EraProfile, authenticity = s.authenticity): MasteringState {
  const t = Math.max(0, Math.min(1, authenticity));
  const flat = defaultMastering();
  const next: MasteringState = {
    ...s, on: true, eraId: era.id, authenticity: t,
    // Bandwidth narrows on a log-ish blend so 50% of "5 kHz" doesn't sound like 12.5 kHz linear.
    hpHz: Math.round(Math.exp(lerp(Math.log(flat.hpHz), Math.log(era.hpHz), t))),
    lpHz: Math.round(Math.exp(lerp(Math.log(flat.lpHz), Math.log(era.lpHz), t))),
    tiltDb: lerp(0, era.tiltDb, t),
    headBumpHz: era.headBumpHz, headBumpDb: lerp(0, era.headBumpDb, t),
    drive: lerp(0, era.drive, t), driveAsym: lerp(0, era.driveAsym, t),
    width: lerp(1, era.width, t), monoBelowHz: Math.round(lerp(0, era.monoBelowHz, t)),
    glue: t > 0.25 ? era.glue : s.glue,
    // The bed fades 24 dB further down as authenticity backs off; wow scales linearly.
    noiseType: era.noiseType,
    noiseDb: era.noiseType === 'none' ? -100 : Math.max(-100, era.noiseDb - (1 - t) * 24),
    wowPct: era.wowPct * t,
  };
  const eng = ENGINEERS.find((e) => e.id === s.engineerId);
  eng?.apply(next);
  return next;
}

// ── The live device ──────────────────────────────────────────────────────────

/**
 * Asymmetric tanh transfer for the drive stage: `tanh(g·(x+b)) − tanh(g·b)`. The bias b puts
 * even harmonics (tube/tape character) into an otherwise odd-only curve; the offset subtraction
 * re-centers it so the DC blocker only cleans residue, not a step.
 */
function makeDriveCurve(drive: number, asym: number, n = 2048): Float32Array {
  const curve = new Float32Array(n);
  const g = 1 + drive * 6;           // drive 0..1 → gain 1..7 into the shaper
  const b = asym * 0.5;
  const norm = Math.tanh(g * (1 + b)) - Math.tanh(g * b); // keep unity-ish peaks
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = (Math.tanh(g * (x + b)) - Math.tanh(g * b)) / Math.max(1e-6, norm);
  }
  return curve;
}

/**
 * Generated noise beds — the medium's floor. 4 s stereo loops, decorrelated channels.
 * 'hiss': one-pole low-passed white noise (tape). 'crackle': the same hiss 12 dB down plus
 * sparse random ticks with 1–3 ms exponential ring (shellac/vinyl). Injected BEFORE the
 * bandwidth filters so the era's own medium shapes its noise, like the real thing.
 */
function makeNoiseBuffer(ctx: BaseAudioContext, type: Exclude<NoiseType, 'none'>): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 4);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    const hissLevel = type === 'hiss' ? 1 : 0.25;
    for (let i = 0; i < len; i++) {
      y += 0.22 * ((Math.random() * 2 - 1) - y); // ~2 kHz-ish one-pole tilt at 48k
      d[i] = y * hissLevel;
    }
    if (type === 'crackle') {
      const ticks = Math.floor(4 * 28); // ~28 ticks/s — a played 78, not a ruined one
      for (let t = 0; t < ticks; t++) {
        const at = Math.floor(Math.random() * (len - 200));
        const amp = (Math.random() * 0.9 + 0.1) * (Math.random() < 0.5 ? -1 : 1);
        const ring = 30 + Math.floor(Math.random() * 110); // 0.6–3 ms
        for (let i = 0; i < ring; i++) d[at + i] += amp * Math.exp(-i / (ring / 5)) * (1 - (2 * (i % 2)) * 0.3);
      }
    }
  }
  return buf;
}

/**
 * The mastering insert. Follows SpectraEQ's shape exactly (input/output GainNodes, setState,
 * dispose) so BeatsEngine and graph.ts treat both devices the same way. Everything including
 * the texture stage is native nodes with AudioParam automation, so the offline render prints
 * the identical pressing (wow/flutter = LFO-modulated DelayNode, noise = looped buffer).
 */
export class MasteringChain {
  readonly input: GainNode;
  readonly output: GainNode;
  /** Post-chain spectrum tap for the Project view scopes. */
  readonly analyser: AnalyserNode;
  private ctx: BaseAudioContext;

  // Texture stage: program → wow delay (pitch wobble) joins the tone path; the noise bed sums
  // in at the same point so the era's bandwidth filters shape both.
  private wowDelay: DelayNode;
  private wowOsc: OscillatorNode;
  private wowDepth: GainNode;
  private flutterOsc: OscillatorNode;
  private flutterDepth: GainNode;
  private wowOn = false;
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;
  private noiseType: NoiseType = 'none';

  private hp: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private tiltLow: BiquadFilterNode;
  private tiltHigh: BiquadFilterNode;
  private bump: BiquadFilterNode;
  private preDrive: GainNode;
  private shaper: WaveShaperNode;
  private dcBlock: BiquadFilterNode;
  // M/S width matrix. Mid feeds both outputs; side (bass-filtered, width-scaled) adds to L,
  // subtracts from R. All native gains — sample-accurate and free.
  private split: ChannelSplitterNode;
  private midL: GainNode; private midR: GainNode;
  private sideL: GainNode; private sideRInv: GainNode;
  private sideHp: BiquadFilterNode;
  private sideGain: GainNode;
  private merge: ChannelMergerNode;

  private bypassed = true;
  private lastCurveKey = '';

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.75;

    // Wow/flutter: 3 ms base line delay, wobbled by two LFOs (wow ~0.9 Hz + flutter ~6.7 Hz at
    // 30%). Depth in seconds for X% pitch deviation at rate f is (X/100)/(2πf).
    this.wowDelay = ctx.createDelay(0.05); this.wowDelay.delayTime.value = 0.003;
    this.wowOsc = ctx.createOscillator(); this.wowOsc.frequency.value = 0.9;
    this.wowDepth = ctx.createGain(); this.wowDepth.gain.value = 0;
    this.flutterOsc = ctx.createOscillator(); this.flutterOsc.frequency.value = 6.7;
    this.flutterDepth = ctx.createGain(); this.flutterDepth.gain.value = 0;
    this.wowOsc.connect(this.wowDepth); this.wowDepth.connect(this.wowDelay.delayTime);
    this.flutterOsc.connect(this.flutterDepth); this.flutterDepth.connect(this.wowDelay.delayTime);
    this.wowOsc.start(0); this.flutterOsc.start(0);
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;

    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.Q.value = 0.71;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.71;
    this.tiltLow = ctx.createBiquadFilter(); this.tiltLow.type = 'lowshelf'; this.tiltLow.frequency.value = 250;
    this.tiltHigh = ctx.createBiquadFilter(); this.tiltHigh.type = 'highshelf'; this.tiltHigh.frequency.value = 8000;
    this.bump = ctx.createBiquadFilter(); this.bump.type = 'peaking'; this.bump.Q.value = 1.1;
    this.preDrive = ctx.createGain();
    this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '4x';
    this.dcBlock = ctx.createBiquadFilter(); this.dcBlock.type = 'highpass'; this.dcBlock.frequency.value = 5; this.dcBlock.Q.value = 0.5;

    this.split = ctx.createChannelSplitter(2);
    this.midL = ctx.createGain(); this.midL.gain.value = 0.5;   // M = (L+R)/2
    this.midR = ctx.createGain(); this.midR.gain.value = 0.5;
    this.sideL = ctx.createGain(); this.sideL.gain.value = 0.5; // S = (L−R)/2
    this.sideRInv = ctx.createGain(); this.sideRInv.gain.value = -0.5;
    this.sideHp = ctx.createBiquadFilter(); this.sideHp.type = 'highpass'; this.sideHp.Q.value = 0.5;
    this.sideGain = ctx.createGain(); this.sideGain.gain.value = 1;
    this.merge = ctx.createChannelMerger(2);

    // Texture joins the tone path at the top: wowed program + noise bed both enter the
    // bandwidth filters, so a 1928 pressing's crackle is 5 kHz-capped like everything else.
    this.wowDelay.connect(this.hp);
    this.noiseGain.connect(this.hp);
    // Tone path: hp → lp → tilt → bump → drive stage
    this.hp.connect(this.lp); this.lp.connect(this.tiltLow); this.tiltLow.connect(this.tiltHigh);
    this.tiltHigh.connect(this.bump);
    this.bump.connect(this.preDrive); this.preDrive.connect(this.shaper); this.shaper.connect(this.dcBlock);
    // Width matrix: dcBlock → split → mid/side sums → merge
    this.dcBlock.connect(this.split);
    const mid = this.ctx.createGain();
    this.split.connect(this.midL, 0); this.split.connect(this.midR, 1);
    this.midL.connect(mid); this.midR.connect(mid);
    const side = this.ctx.createGain();
    this.split.connect(this.sideL, 0); this.split.connect(this.sideRInv, 1);
    this.sideL.connect(side); this.sideRInv.connect(side);
    side.connect(this.sideHp); this.sideHp.connect(this.sideGain);
    // L = M + S, R = M − S
    mid.connect(this.merge, 0, 0); mid.connect(this.merge, 0, 1);
    this.sideGain.connect(this.merge, 0, 0);
    const sideInvOut = this.ctx.createGain(); sideInvOut.gain.value = -1;
    this.sideGain.connect(sideInvOut); sideInvOut.connect(this.merge, 0, 1);
    this.merge.connect(this.analyser); this.analyser.connect(this.output);

    // Start bypassed until setState turns it on.
    this.input.connect(this.output);
  }

  setState(s: MasteringState): void {
    const wantBypass = !s.on;
    const wantWow = !wantBypass && (s.wowPct ?? 0) > 0.001;
    if (wantBypass !== this.bypassed || wantWow !== this.wowOn) {
      try { this.input.disconnect(); } catch { /* */ }
      if (wantBypass) this.input.connect(this.output);
      else if (wantWow) this.input.connect(this.wowDelay); // 3 ms line delay only when the era wobbles
      else this.input.connect(this.hp);
      this.bypassed = wantBypass;
      this.wowOn = wantWow;
    }
    if (wantBypass) {
      this.noiseGain.gain.value = 0; // the bed must not leak through the always-wired tone path
      return;
    }

    // Wow/flutter depths from the era's pitch-deviation %.
    const wow = Math.max(0, Math.min(1.5, s.wowPct ?? 0));
    this.wowDepth.gain.value = (wow / 100) / (2 * Math.PI * 0.9);
    this.flutterDepth.gain.value = (0.3 * (wow / 100)) / (2 * Math.PI * 6.7);

    // Noise bed.
    const noiseType = s.noiseType ?? 'none';
    const noiseDb = s.noiseDb ?? -100;
    if (noiseType !== 'none' && noiseDb > -95) {
      if (this.noiseType !== noiseType || !this.noiseSrc) this.rebuildNoise(noiseType);
      this.noiseGain.gain.value = Math.pow(10, noiseDb / 20);
    } else {
      this.noiseGain.gain.value = 0;
    }

    const clampHz = (v: number) => Math.max(16, Math.min(20000, v));
    this.hp.frequency.value = clampHz(s.hpHz);
    this.lp.frequency.value = clampHz(s.lpHz);
    // Tilt as complementary shelves so the mid stays anchored.
    this.tiltLow.gain.value = -s.tiltDb / 2;
    this.tiltHigh.gain.value = s.tiltDb / 2;
    if (s.headBumpHz > 0 && Math.abs(s.headBumpDb) > 0.05) {
      this.bump.frequency.value = clampHz(s.headBumpHz);
      this.bump.gain.value = s.headBumpDb;
    } else this.bump.gain.value = 0;

    // The waveshaper curve only rebuilds when drive/asym actually change (it allocates).
    const key = `${s.drive.toFixed(3)}:${s.driveAsym.toFixed(3)}`;
    if (key !== this.lastCurveKey) {
      this.lastCurveKey = key;
      if (s.drive < 0.005) { this.shaper.curve = null; this.preDrive.gain.value = 1; }
      else {
        this.shaper.curve = makeDriveCurve(s.drive, s.driveAsym);
        // Slight input pad so hot program hits the sweet part of the curve, not the flats.
        this.preDrive.gain.value = 0.9;
      }
    }

    this.sideGain.gain.value = Math.max(0, Math.min(2, s.width));
    this.sideHp.frequency.value = s.monoBelowHz > 0 ? clampHz(s.monoBelowHz) : 16;
  }

  private rebuildNoise(type: Exclude<NoiseType, 'none'>): void {
    if (this.noiseSrc) { try { this.noiseSrc.stop(); this.noiseSrc.disconnect(); } catch { /* */ } }
    const src = this.ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(this.ctx, type);
    src.loop = true;
    src.connect(this.noiseGain);
    src.start(0);
    this.noiseSrc = src;
    this.noiseType = type;
  }

  /** Post-chain magnitude spectrum for the scopes (dB values, analyser bin layout). */
  spectrum(target: Float32Array): void {
    this.analyser.getFloatFrequencyData(target);
  }
  get binCount(): number { return this.analyser.frequencyBinCount; }
  get sampleRate(): number { return this.ctx.sampleRate; }

  dispose(): void {
    try { this.wowOsc.stop(); this.flutterOsc.stop(); this.noiseSrc?.stop(); } catch { /* */ }
    const nodes: (AudioNode | null)[] = [
      this.input, this.output, this.analyser, this.hp, this.lp, this.tiltLow, this.tiltHigh,
      this.bump, this.preDrive, this.shaper, this.dcBlock, this.split, this.midL, this.midR,
      this.sideL, this.sideRInv, this.sideHp, this.sideGain, this.merge,
      this.wowDelay, this.wowOsc, this.wowDepth, this.flutterOsc, this.flutterDepth,
      this.noiseSrc, this.noiseGain,
    ];
    for (const n of nodes) { try { n?.disconnect(); } catch { /* */ } }
  }
}
