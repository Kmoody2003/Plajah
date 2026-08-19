// The Amp Rack — model tables.
//
// Pure data, no imports, so devices.ts can own the live node without a circular import.
//
// NAMING: every amp here is an original voicing named generically ("British Stack", "Cali
// Rectified"). Circuit topologies aren't protectable but trademarks are, so we never ship a
// real manufacturer's name or panel art — the industry convention, and the legal advice from
// docs/MASTER_SUITE_RESEARCH.md §7.
//
// VOICING, NOT CIRCUIT SOLVING: these are physically-motivated voicings — cascaded triode
// waveshapers with inter-stage coupling, the classic three-knob tone stack topology (bass shelf
// / mid peak / treble shelf with each amp's characteristic fixed scoop), power-amp sag, and a
// filter-network cabinet. That is not a WDF/DK circuit solve or a neural capture; the neural
// (NAM) lane is the planned upgrade and slots in behind the same AmpRig state.

export interface AmpModel {
  id: string;
  label: string;
  blurb: string;
  /** Cascaded gain stages — more stages = more compression and harmonic density. */
  stages: number;
  /** How hard the Gain knob drives each stage. */
  driveScale: number;
  /** Asymmetry per stage — even-harmonic content (tube character). */
  asym: number;
  /** Inter-stage coupling high-pass (Hz): higher = tighter, less flub under gain. */
  couplingHz: number;
  /** Bright cap across the gain pot — the sparkle that fades as you turn up. */
  brightDb: number;
  // The tone stack's fixed voicing (before the player's knobs move it).
  bassHz: number;
  midHz: number;
  midQ: number;
  /** The stack's built-in mid scoop at flat settings — the Fender/Recto signature. */
  scoopDb: number;
  trebleHz: number;
  presenceHz: number;
  resonanceHz: number;
  /** Power-supply droop under load: 0 = stiff (modern), 1 = spongy (vintage rectifier). */
  sag: number;
  outputTrimDb: number;
}

export const AMP_MODELS: AmpModel[] = [
  { id: 'studio', label: 'Studio Clean', blurb: 'Pristine pedal platform — headroom for days',
    stages: 1, driveScale: 1.6, asym: 0.08, couplingHz: 30, brightDb: 1.5,
    bassHz: 90, midHz: 600, midQ: 0.7, scoopDb: 0, trebleHz: 3200, presenceHz: 5000, resonanceHz: 90, sag: 0.1, outputTrimDb: 0 },
  { id: 'tweed', label: 'American Tweed', blurb: 'Early breakup, mid-forward, touch sensitive',
    stages: 2, driveScale: 3.4, asym: 0.26, couplingHz: 48, brightDb: 2,
    bassHz: 100, midHz: 500, midQ: 0.6, scoopDb: -1.5, trebleHz: 2600, presenceHz: 4200, resonanceHz: 100, sag: 0.75, outputTrimDb: -1 },
  { id: 'blackface', label: 'American Clean', blurb: 'Scooped and sparkling, tight bottom',
    stages: 2, driveScale: 2.4, asym: 0.14, couplingHz: 38, brightDb: 3.5,
    bassHz: 80, midHz: 420, midQ: 0.8, scoopDb: -5, trebleHz: 3400, presenceHz: 5600, resonanceHz: 80, sag: 0.35, outputTrimDb: 0 },
  { id: 'plexi', label: 'British Plexi', blurb: 'Vintage crunch that cleans up with your hands',
    stages: 2, driveScale: 4.2, asym: 0.22, couplingHz: 62, brightDb: 2.5,
    bassHz: 110, midHz: 680, midQ: 0.7, scoopDb: 0, trebleHz: 2800, presenceHz: 4800, resonanceHz: 110, sag: 0.5, outputTrimDb: -1 },
  { id: 'british', label: 'British Stack', blurb: 'The 80s crunch — mid push, sings under gain',
    stages: 3, driveScale: 6, asym: 0.2, couplingHz: 75, brightDb: 1.5,
    bassHz: 120, midHz: 750, midQ: 0.8, scoopDb: 1.5, trebleHz: 2600, presenceHz: 4400, resonanceHz: 120, sag: 0.3, outputTrimDb: -2 },
  { id: 'chime', label: 'Chime Top Boost', blurb: 'Jangly and raw — no negative feedback',
    stages: 2, driveScale: 3.8, asym: 0.3, couplingHz: 55, brightDb: 4,
    bassHz: 95, midHz: 900, midQ: 0.5, scoopDb: 2, trebleHz: 3800, presenceHz: 6200, resonanceHz: 95, sag: 0.55, outputTrimDb: -1 },
  { id: 'recto', label: 'Cali Rectified', blurb: 'Modern high gain — scooped, tight, brutal',
    stages: 4, driveScale: 8.5, asym: 0.12, couplingHz: 95, brightDb: 0.5,
    bassHz: 90, midHz: 620, midQ: 1, scoopDb: -6, trebleHz: 3000, presenceHz: 4600, resonanceHz: 75, sag: 0.25, outputTrimDb: -3 },
];

export const ampModelAt = (i: number): AmpModel => AMP_MODELS[Math.max(0, Math.min(AMP_MODELS.length - 1, Math.round(i)))];

// ── Cabinets ────────────────────────────────────────────────────────────────
// A cab is mostly its frequency response: a low bump, a low-mid honk or notch, a presence
// peak, and a steep top-end rolloff where the speaker stops. Modelled as a filter network
// plus a very short convolution for the mic's early reflections.
export interface CabModel {
  id: string;
  label: string;
  lowCutHz: number;      // below this the speaker simply doesn't move
  bumpHz: number; bumpDb: number;
  notchHz: number; notchDb: number; notchQ: number;
  presenceHz: number; presenceDb: number;
  rolloffHz: number;     // the speaker's top-end cliff
  rolloffQ: number;      // resonance right at the cliff
}

export const CAB_MODELS: CabModel[] = [
  { id: 'direct', label: 'Direct (no cab)', lowCutHz: 20, bumpHz: 100, bumpDb: 0, notchHz: 1500, notchDb: 0, notchQ: 1, presenceHz: 5000, presenceDb: 0, rolloffHz: 20000, rolloffQ: 0.7 },
  { id: '1x12open', label: '1×12 Open Back', lowCutHz: 85, bumpHz: 130, bumpDb: 3, notchHz: 1700, notchDb: -4, notchQ: 1.6, presenceHz: 3400, presenceDb: 3, rolloffHz: 5200, rolloffQ: 1.3 },
  { id: '2x12blue', label: '2×12 Blue Alnico', lowCutHz: 80, bumpHz: 120, bumpDb: 2.5, notchHz: 2100, notchDb: -3, notchQ: 1.4, presenceHz: 3800, presenceDb: 4.5, rolloffHz: 6000, rolloffQ: 1.4 },
  { id: '4x12british', label: '4×12 British Greens', lowCutHz: 75, bumpHz: 105, bumpDb: 5, notchHz: 1600, notchDb: -6, notchQ: 1.8, presenceHz: 3000, presenceDb: 3, rolloffHz: 4600, rolloffQ: 1.6 },
  { id: '4x10tweed', label: '4×10 Tweed', lowCutHz: 95, bumpHz: 150, bumpDb: 2, notchHz: 1300, notchDb: -3, notchQ: 1.2, presenceHz: 3600, presenceDb: 4, rolloffHz: 5600, rolloffQ: 1.2 },
];

export const cabModelAt = (i: number): CabModel => CAB_MODELS[Math.max(0, Math.min(CAB_MODELS.length - 1, Math.round(i)))];

// ── Microphones ─────────────────────────────────────────────────────────────
// Mic choice is a tilt plus a presence bump; position is the classic cap↔edge brightness
// trade, and distance trades proximity bass for room.
export interface MicModel { id: string; label: string; tiltDb: number; peakHz: number; peakDb: number }
export const MIC_MODELS: MicModel[] = [
  { id: 'dyn57', label: 'Dynamic 57', tiltDb: 1.5, peakHz: 5500, peakDb: 4 },
  { id: 'ribbon', label: 'Ribbon 121', tiltDb: -2.5, peakHz: 2200, peakDb: 1.5 },
  { id: 'cond414', label: 'Condenser 414', tiltDb: 0.5, peakHz: 8000, peakDb: 2.5 },
];
export const micModelAt = (i: number): MicModel => MIC_MODELS[Math.max(0, Math.min(MIC_MODELS.length - 1, Math.round(i)))];

// ── Pedals ──────────────────────────────────────────────────────────────────
// Each pedal is a pre-filter (what the circuit lets into the clipper), a clipping character,
// and a post-filter (the tone network) — the structure real pedal circuits actually have.
export interface PedalModel {
  id: string;
  label: string;
  blurb: string;
  color: string;
  /** High-pass before clipping: the Screamer's famous 720 Hz is why it tightens the low end. */
  preHpHz: number;
  /** A mid bump baked into the circuit (Hz, dB, Q). */
  midHz: number; midDb: number; midQ: number;
  /** Clipping: hardness 0 = soft/tube-ish, 1 = hard/square. */
  hardness: number;
  asym: number;
  /** Post-clip low-pass — the tone control's centre. */
  toneHz: number;
}

export const PEDAL_MODELS: PedalModel[] = [
  { id: 'screamer', label: 'Screamer', blurb: 'Mid-hump overdrive — tightens and pushes the front end', color: '#4CAF50',
    preHpHz: 720, midHz: 720, midDb: 6, midQ: 0.8, hardness: 0.35, asym: 0.18, toneHz: 3200 },
  { id: 'goldhorse', label: 'Gold Horse', blurb: 'Transparent boost/drive — adds hair, keeps the amp',  color: '#D4A017',
    preHpHz: 220, midHz: 900, midDb: 1.5, midQ: 0.5, hardness: 0.2, asym: 0.1, toneHz: 5200 },
  { id: 'bigfuzz', label: 'Big Fuzz', blurb: 'Scooped sustain monster — walls of violin fuzz', color: '#C2185B',
    preHpHz: 90, midHz: 1000, midDb: -8, midQ: 0.9, hardness: 0.85, asym: 0.3, toneHz: 2600 },
  { id: 'cleanboost', label: 'Clean Boost', blurb: 'Just more — hits the amp harder', color: '#0288D1',
    preHpHz: 40, midHz: 1200, midDb: 0, midQ: 0.7, hardness: 0.05, asym: 0.04, toneHz: 12000 },
];

export const pedalModelAt = (i: number): PedalModel => PEDAL_MODELS[Math.max(0, Math.min(PEDAL_MODELS.length - 1, Math.round(i)))];

/**
 * Rig presets — the "easier than Guitar Rig" promise. Each is a complete rig, so a player picks
 * a sound by name instead of building a chain. Values are amprig device params.
 */
export interface RigPreset { id: string; label: string; blurb: string; params: Record<string, number> }

export const RIG_PRESETS: RigPreset[] = [
  { id: 'sparkle', label: 'Sparkle Clean', blurb: 'Chimey cleans for arpeggios and pads',
    params: { amp: 2, gain: 0.25, bass: 0.5, mid: 0.45, treble: 0.65, presence: 0.5, resonance: 0.4, master: 0.7, cab: 2, mic: 2, micEdge: 0.4, pedal1: 3, pedal1On: 0, pedal1Drive: 0.3, pedal2: 0, pedal2On: 0, pedal2Drive: 0.4, sagAmt: 0.3 } },
  { id: 'blues', label: 'Blues Breakup', blurb: 'Edge-of-breakup that cleans up with your volume',
    params: { amp: 1, gain: 0.55, bass: 0.55, mid: 0.6, treble: 0.55, presence: 0.45, resonance: 0.5, master: 0.7, cab: 4, mic: 1, micEdge: 0.5, pedal1: 0, pedal1On: 1, pedal1Drive: 0.3, pedal2: 0, pedal2On: 0, pedal2Drive: 0.4, sagAmt: 0.8 } },
  { id: 'crunch', label: 'British Crunch', blurb: 'The classic rhythm crunch — riffs and power chords',
    params: { amp: 4, gain: 0.6, bass: 0.5, mid: 0.65, treble: 0.6, presence: 0.6, resonance: 0.5, master: 0.7, cab: 3, mic: 0, micEdge: 0.35, pedal1: 0, pedal1On: 1, pedal1Drive: 0.35, pedal2: 0, pedal2On: 0, pedal2Drive: 0.4, sagAmt: 0.35 } },
  { id: 'lead', label: 'Singing Lead', blurb: 'Sustain for days, mids pushed for solos',
    params: { amp: 4, gain: 0.78, bass: 0.45, mid: 0.75, treble: 0.6, presence: 0.6, resonance: 0.55, master: 0.7, cab: 3, mic: 0, micEdge: 0.45, pedal1: 0, pedal1On: 1, pedal1Drive: 0.55, pedal2: 3, pedal2On: 1, pedal2Drive: 0.5, sagAmt: 0.4 } },
  { id: 'modern', label: 'Modern Metal', blurb: 'Scooped, tight and brutal for down-tuned riffs',
    params: { amp: 6, gain: 0.8, bass: 0.65, mid: 0.3, treble: 0.65, presence: 0.65, resonance: 0.7, master: 0.7, cab: 3, mic: 0, micEdge: 0.3, pedal1: 0, pedal1On: 1, pedal1Drive: 0.25, pedal2: 0, pedal2On: 0, pedal2Drive: 0.4, sagAmt: 0.2 } },
  { id: 'fuzzed', label: 'Fuzz Wall', blurb: 'Violin sustain and scooped fuzz',
    params: { amp: 3, gain: 0.5, bass: 0.6, mid: 0.5, treble: 0.55, presence: 0.5, resonance: 0.6, master: 0.7, cab: 1, mic: 1, micEdge: 0.5, pedal1: 2, pedal1On: 1, pedal1Drive: 0.7, pedal2: 0, pedal2On: 0, pedal2Drive: 0.4, sagAmt: 0.6 } },
];
