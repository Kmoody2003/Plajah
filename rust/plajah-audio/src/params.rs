//! The parameter id space. This is the contract between Rust and TypeScript: the host sends
//! `set_param(id, value)` and the mod matrix targets the same ids, so a modulation destination
//! and a UI knob are the same thing by construction.
//!
//! Ids are grouped by block of 100 so the layout stays readable and extending a section never
//! renumbers another. Values are normalised 0..1 unless noted; the engine maps to real units.

/// Modulator slot counts. Six of each is what makes "Motion" feel unlimited in practice — the
/// host assigns a Motion to a free slot, and six time-based plus six envelope Motions per
/// instrument is past the point where anyone hits the wall.
pub const NUM_ENV: usize = 6;
pub const NUM_LFO: usize = 6;

pub const P_MASTER_GAIN: u32 = 0;
pub const P_GLIDE: u32 = 1; // seconds, 0..1 → 0..2s
pub const P_VOICE_MODE: u32 = 2; // 0 poly, 1 mono, 2 legato
pub const P_BEND_RANGE: u32 = 3; // semitones, 0..1 → 0..24
pub const P_ANALOG_DRIFT: u32 = 4;
pub const P_UNISON_COUNT: u32 = 5; // 0..1 → 1..16
pub const P_UNISON_DETUNE: u32 = 6;
pub const P_UNISON_WIDTH: u32 = 7;
pub const P_UNISON_BLEND: u32 = 8;

// ── Oscillators: base + index*100, index 0..2 ────────────────────────────────
pub const OSC_BASE: u32 = 100;
pub const OSC_STRIDE: u32 = 100;
pub const O_ENABLE: u32 = 0;
pub const O_LEVEL: u32 = 1;
pub const O_PAN: u32 = 2;
pub const O_COARSE: u32 = 3; // 0..1 → -24..+24 semitones
pub const O_FINE: u32 = 4; // 0..1 → -100..+100 cents
pub const O_MORPH: u32 = 5; // wavetable frame position
pub const O_PHASE: u32 = 6; // start phase; 1.0 = free/random
pub const O_TABLE: u32 = 7; // table slot index
pub const O_MODE: u32 = 8; // 0 wavetable, 1 analog
pub const O_ANALOG_SHAPE: u32 = 9;
pub const O_PULSE_WIDTH: u32 = 10;
pub const O_DRIVE: u32 = 11;
pub const O_DRIVE_MODE: u32 = 12;

#[inline]
pub fn osc_param(index: usize, p: u32) -> u32 {
    OSC_BASE + index as u32 * OSC_STRIDE + p
}

// ── Sub + noise ──────────────────────────────────────────────────────────────
pub const P_SUB_LEVEL: u32 = 400;
pub const P_SUB_SHAPE: u32 = 401;
pub const P_SUB_OCTAVE: u32 = 402; // 0 = -1 oct, 1 = -2 oct
pub const P_NOISE_LEVEL: u32 = 410;
pub const P_NOISE_COLOR: u32 = 411; // 0 white, 1 pink

// ── Filters: base + index*100, index 0..1 ────────────────────────────────────
pub const FLT_BASE: u32 = 500;
pub const FLT_STRIDE: u32 = 100;
pub const F_ENABLE: u32 = 0;
pub const F_TYPE: u32 = 1; // 0 ladder, 1 SVF
pub const F_MODE: u32 = 2; // SVF response
pub const F_CUTOFF: u32 = 3; // 0..1 → 20Hz..20kHz, exponential
pub const F_RES: u32 = 4;
pub const F_DRIVE: u32 = 5;
pub const F_KEYTRACK: u32 = 6;
pub const F_ENV_AMT: u32 = 7;
pub const F_MIX: u32 = 8;

#[inline]
pub fn flt_param(index: usize, p: u32) -> u32 {
    FLT_BASE + index as u32 * FLT_STRIDE + p
}

pub const P_FILTER_ROUTING: u32 = 490; // 0 series, 1 parallel

// ── Envelopes: base + index*10, index 0..2 (0 is always the amp envelope) ────
pub const ENV_BASE: u32 = 700;
pub const ENV_STRIDE: u32 = 10;
pub const E_ATTACK: u32 = 0;
pub const E_DECAY: u32 = 1;
pub const E_SUSTAIN: u32 = 2;
pub const E_RELEASE: u32 = 3;

#[inline]
pub fn env_param(index: usize, p: u32) -> u32 {
    ENV_BASE + index as u32 * ENV_STRIDE + p
}

// ── LFOs: base + index*10, index 0..2 ────────────────────────────────────────
pub const LFO_BASE: u32 = 800;
pub const LFO_STRIDE: u32 = 10;
pub const L_SHAPE: u32 = 0;
pub const L_RATE: u32 = 1;
pub const L_SYNC: u32 = 2; // 0 = free, else beats per cycle
pub const L_BIPOLAR: u32 = 3;
pub const L_RETRIGGER: u32 = 4;
pub const L_FADE: u32 = 5;
/// 0 = the normal 0.01–40 Hz range, 1 = the slow range (20 s to 5 minutes per cycle).
/// VELA's Drift needs modulation whose period is measured in minutes; reusing the LFO block
/// with a range flag keeps every existing Motion route working unchanged.
pub const L_RANGE: u32 = 6;
/// >0.5 = per-voice LFO phase/fade clocked independently from each note's onset.
pub const L_PER_VOICE: u32 = 7;

#[inline]
pub fn lfo_param(index: usize, p: u32) -> u32 {
    LFO_BASE + index as u32 * LFO_STRIDE + p
}

pub const MACRO_BASE: u32 = 900; // 900..907

// ── VELA (instrument 03): modal body, exciter, diffusion field ───────────────
// Block 1000 upward, so ONDA's 0..999 never renumbers. Single instances rather than indexed
// blocks — there is one body, one exciter and one Veil per instrument by design.

/// Modal resonator bank. This is the sound; everything else serves it.
pub const MODAL_BASE: u32 = 1000;
pub const M_ENABLE: u32 = 0;
pub const M_PARTIALS: u32 = 1; // stepped: 16 / 24 / 32 / 48 / 64
pub const M_INHARM: u32 = 2; // partial-ratio stretch — the character control
pub const M_SPREAD: u32 = 3;
pub const M_DECAY: u32 = 4; // 0..1 → 0.2s..45s
pub const M_DECAY_TILT: u32 = 5; // 0..1 → -1..+1; negative rings the highs longest
pub const M_MATERIAL: u32 = 6; // 0 bronze, 1 glass, 2 iron, 3 wood, 4 skin, 5 air, 6 voice
pub const M_POSITION: u32 = 7;
pub const M_KEYTRACK: u32 = 8;
/// Independent slow amplitude drift per partial. The difference between a bank and an organ.
pub const M_ANIMA: u32 = 9;
/// Beating depth — the singing-bowl "wah".
pub const M_BEAT: u32 = 10;
/// Beat rate at the fundamental, 0..1 → 0.15..9 Hz.
pub const M_BEAT_RATE: u32 = 11;
/// Amplitude attack. 0..1 → 0..12 s. Without it every note starts at full level, and a modal
/// bank that can only decay can never be a pad.
pub const M_SWELL: u32 = 12;
/// Timbral evolution across the note. 0..1 stored, -1..+1 used; 0.5 is static.
pub const M_MORPH: u32 = 13;
/// Seconds the morph takes. 0..1 → 1..90 s.
pub const M_MORPH_TIME: u32 = 14;
/// 0 Struck (excited resonators), 1 Sustained (driven partials), 2 Blend.
/// The single biggest character control in the instrument: it is the difference between a
/// body that is hit and a body that is sung through.
pub const M_MODE: u32 = 15;
/// Formant depth — fixed absolute-frequency resonances over the partial amplitudes.
pub const M_FORMANT: u32 = 16;
/// Formant position, sweeping roughly /u/ to /e/.
pub const M_FORMANT_SHIFT: u32 = 17;
/// Sustained mode: how much later high partials fade in. Strings brighten as they are held.
pub const M_BLOOM: u32 = 18;
/// Overtone emphasis — narrow gain on one partial, movable across the series. This is what
/// throat singing actually is, and it is the whole monastic register in one control.
pub const M_SPOTLIGHT: u32 = 19;
pub const M_SPOTLIGHT_POS: u32 = 20;
pub const M_SPOTLIGHT_WIDTH: u32 = 21;
/// Pitch vibrato depth, 0..1 → 0..1.2 semitones.
pub const M_VIBRATO: u32 = 22;
/// Vibrato rate, 0..1 → 0.5..9 Hz.
pub const M_VIBRATO_RATE: u32 = 23;
/// Period doubling — the kargyraa buzz. Adds every half-integer multiple of the fundamental.
pub const M_SUBHARM: u32 = 24;

/// Exciter — bow, blow, strike, rub.
pub const EXC_BASE: u32 = 1100;
pub const X_TYPE: u32 = 0;
pub const X_PRESSURE: u32 = 1;
pub const X_GRAIN: u32 = 2;
pub const X_TONE: u32 = 3;
pub const X_VEL_TILT: u32 = 4;
/// Slow swell of exciter pressure — the instrument breathing rather than blowing steadily.
pub const X_PULSE: u32 = 5;
/// Pulse rate, 0..1 → 0.03..1.2 Hz.
pub const X_PULSE_RATE: u32 = 6;

/// The Veil. Engine-level: one instance after the voice sum, not one per voice.
pub const VEIL_BASE: u32 = 1200;
pub const V_SIZE: u32 = 0;
pub const V_DECAY: u32 = 1;
pub const V_DIFFUSION: u32 = 2;
pub const V_SHIMMER: u32 = 3;
pub const V_SHIMMER_IVL: u32 = 4; // 0 = +12, 1 = +19, 2 = +24, 3 = -12
pub const V_BLUR: u32 = 5;
pub const V_FREEZE: u32 = 6;
pub const V_MIX: u32 = 7;

// ── BAJO (instrument 04): the low-end engine ────────────────────────────────
// Block 1400 upward, leaving VELA (1000..1207) room to grow. Every BAJO section is a no-op at
// its default so ONDA, KERA and VELA patches are bit-identical with these ids present.
//
// Two of these blocks are arrays rather than scalars — the wobble rate lane and the gate grid.
// They serialise as fixed-length integer runs, which keeps a patch a flat object (and keeps it
// clear of the Firestore rule that an undefined field write throws).

/// The string engine — Karplus-Strong, per voice. The acoustic half of the instrument;
/// no oscillator is involved.
pub const STR_BASE: u32 = 1400;
pub const S_LEVEL: u32 = 0;
pub const S_DAMP: u32 = 1;
pub const S_TONE: u32 = 2;
/// Exciter brightness: finger pluck through to plectrum.
pub const S_PICK: u32 = 3;
/// Replaces the burst with continuous excitation — pluck becomes arco.
pub const S_BOW: u32 = 4;
/// Body resonance depth: solid-body electric through to hollow upright.
pub const S_BODY: u32 = 5;

/// Throat — vowel formant bank over the voice sum. Engine level: one throat, not one per voice.
pub const THR_BASE: u32 = 1420;
pub const T_AMOUNT: u32 = 0;
pub const T_VOWEL: u32 = 1; // 0..1 sweeps A E I O U
pub const T_Q: u32 = 2;

/// Wobble — the per-step rate lane LFO, exposed to the mod matrix as `ModSource::Wobble`.
/// This is the section that makes BAJO a bass synth rather than a synth playing bass.
pub const WOB_BASE: u32 = 1440;
pub const W_ENABLE: u32 = 0;
pub const W_SHAPE: u32 = 1;
pub const W_SKEW: u32 = 2;
pub const W_SMOOTH: u32 = 3;
pub const W_PHASE: u32 = 4;
pub const W_FREE: u32 = 5; // 1 = ignore the lane, run at W_RATE
pub const W_RATE: u32 = 6; // free-run rate, 0..1 → 0.05..40 Hz
/// 16 lane slots, one per 16th note, each holding a division index into `WOB_DIVS`.
/// 1448..1463.
pub const W_LANE: u32 = 8;
pub const W_LANE_LEN: usize = 16;
/// Two destination slots with independent depths. Running two at once is what turns a wobble
/// into a morph: cutoff plus vowel is a talking growl, pitch plus drive is a screech.
/// Destination indices: 0 cutoff, 1 pitch, 2 vowel, 3 amp, 4 morph, 5 drive, 6 reso, 7 pan.
/// The voice owns 0/1/4/6; the engine rack owns 2/3/5/7.
pub const W_DEST1: u32 = 24;
pub const W_DEPTH1: u32 = 25;
pub const W_DEST2: u32 = 26;
pub const W_DEPTH2: u32 = 27;
pub const WOB_DEST_CUTOFF: u32 = 0;
pub const WOB_DEST_PITCH: u32 = 1;
pub const WOB_DEST_VOWEL: u32 = 2;
pub const WOB_DEST_AMP: u32 = 3;
pub const WOB_DEST_MORPH: u32 = 4;
pub const WOB_DEST_DRIVE: u32 = 5;
pub const WOB_DEST_RESO: u32 = 6;
pub const WOB_DEST_PAN: u32 = 7;

/// Rate lane divisions, in beats per LFO cycle. Index 6 (1/8) is the default lane fill.
pub const WOB_DIVS: [f32; 13] = [
    4.0, 2.0, 4.0 / 3.0, 1.0, 1.5, 2.0 / 3.0, 0.5, 0.75, 1.0 / 3.0, 0.25, 1.0 / 6.0, 0.125, 0.0625,
];
/// Ping-pong delay divisions, in beats.
pub const DELAY_DIVS: [f32; 8] = [2.0, 1.0, 1.5, 2.0 / 3.0, 0.5, 0.75, 1.0 / 3.0, 0.25];
/// Ghost Gate cell lengths, in beats: 1/8, 1/16, 1/32.
pub const GATE_DIVS: [f32; 3] = [0.5, 0.25, 0.125];

/// Ghost Gate — a 4-band step gate whose closed steps spill into the reverb instead of muting.
pub const GATE_BASE: u32 = 1480;
pub const G_ENABLE: u32 = 0;
pub const G_DEPTH: u32 = 1;
pub const G_SLEW: u32 = 2;
pub const G_SPILL: u32 = 3;
pub const G_SWING: u32 = 4;
pub const G_RATE: u32 = 5; // 0 = 1/8, 1 = 1/16, 2 = 1/32
pub const G_SPLIT: u32 = 6; // crossover shift, 0..1 → 0.5x..2x
/// 4 bands x 16 steps, band-major: `GATE_BASE + G_GRID + band*16 + step` → 1488..1551.
pub const G_GRID: u32 = 8;
pub const G_BANDS: usize = 4;
pub const G_STEPS: usize = 16;

/// Scorch — 3 serial distortion stages, sub-safe.
pub const SC_BASE: u32 = 1560;
pub const SC_STRIDE: u32 = 8;
pub const SC_ALG: u32 = 0;
pub const SC_DRIVE: u32 = 1;
pub const SC_BIAS: u32 = 2;
pub const SC_TONE: u32 = 3;
pub const SC_MIX: u32 = 4;
pub const SC_STAGES: usize = 3;
/// Engine-wide Scorch controls, past the three stage blocks (1560/1568/1576).
pub const SC_INPUT: u32 = 1590;
pub const SC_FOCUS: u32 = 1591; // matched pre-cut / post-boost tilt at 260 Hz
pub const SC_SAFE: u32 = 1592; // split the low band out before the stages, re-add it clean
pub const SC_SUB: u32 = 1593; // the frequency that split happens at
pub const SC_OUTPUT: u32 = 1594;

#[inline]
pub fn scorch_param(stage: usize, p: u32) -> u32 {
    SC_BASE + stage as u32 * SC_STRIDE + p
}

/// Space — dimension, tempo-synced ping-pong delay, tape echo. Reverb is VELA's Veil, reused
/// rather than reimplemented: it already sits at engine level and already travels with the patch.
pub const SPC_BASE: u32 = 1600;
pub const SP_CH_ON: u32 = 0;
pub const SP_CH_RATE: u32 = 1;
pub const SP_CH_DEPTH: u32 = 2;
pub const SP_CH_MIX: u32 = 3;
pub const SP_DL_ON: u32 = 8;
pub const SP_DL_DIV: u32 = 9; // index into DELAY_DIVS
pub const SP_DL_FB: u32 = 10;
pub const SP_DL_TONE: u32 = 11;
pub const SP_DL_PING: u32 = 12;
pub const SP_DL_MIX: u32 = 13;
pub const SP_EC_ON: u32 = 16;
pub const SP_EC_TIME: u32 = 17; // 0..1 → 40..900 ms, free-running by design
pub const SP_EC_FB: u32 = 18;
pub const SP_EC_WOW: u32 = 19;
pub const SP_EC_DRIVE: u32 = 20;
pub const SP_EC_DEGRADE: u32 = 21;
pub const SP_EC_MIX: u32 = 22;

/// Master fold — mono below a frequency. A bass instrument that images its sub is a bass
/// instrument that disappears on a club system.
pub const P_MONO_BELOW: u32 = 1650; // 0..1 → 20..320 Hz, 0 = off

// ── AURA (instrument 05): 1960s & 1970s voltage-controlled analogue engine ───
// Block 1700 upward. Every AURA section defaults to 0 (bypass) so ONDA, KERA, VELA and BAJO
// patches are bit-identical with these ids present.
pub const AURA_BASE: u32 = 1700;
/// Hard oscillator sync (Osc 1 phase-wrap resets Osc 2 phase). 0 = off, 1 = full hard sync.
pub const A_OSC_SYNC: u32 = 0;
/// Cross-modulation / Poly-Mod: Osc 2 audio-rate FM onto Osc 1 pitch.
pub const A_XMOD_PITCH: u32 = 1;
/// Cross-modulation / Poly-Mod: Osc 2 audio-rate FM onto Filter 1 cutoff.
pub const A_XMOD_FILTER: u32 = 2;
/// Balanced ring modulator (Osc 1 × Osc 2).
pub const A_RING_MOD: u32 = 3;
/// Vintage circuit age & voice-card component tolerance (per-voice pitch/filter trim + thermal wander).
pub const A_AURA: u32 = 4;
/// Discrete transistor & transformer preamp warmth (per-voice asymmetric even/odd harmonic saturation).
pub const A_WARMTH: u32 = 5;

/// BBD 3-phase String Ensemble / Chorus (Solina / VP-330 / Juno-60 style).
pub const A_ENS_ON: u32 = 10;
pub const A_ENS_MODE: u32 = 11; // 0 = Solina 3-phase Ensemble, 1 = Juno I, 2 = Juno II Symphonic
pub const A_ENS_DEPTH: u32 = 12;
pub const A_ENS_MIX: u32 = 13;

/// 6-Stage Vintage Analog All-Pass Phaser (Small Stone / Compact Phasing 'A' Krautrock sweep).
pub const A_PH_ON: u32 = 20;
pub const A_PH_RATE: u32 = 21;
pub const A_PH_DEPTH: u32 = 22;
pub const A_PH_FEEDBACK: u32 = 23;
pub const A_PH_MIX: u32 = 24;

/// Vintage Master Tape & Mains Character.
pub const A_TAPE_SAT: u32 = 30; // 15 IPS magnetic tape saturation + 72 Hz head bump
pub const A_HUM: u32 = 31;      // 60 Hz / 180 Hz tube & transformer hum + warm noise floor
pub const A_CRACKLE: u32 = 32;  // Subtle oxide/capacitor crackle & dust

/// Rhythmic Analog VCA / Lowpass Gate Chopper.
pub const A_GATE_ON: u32 = 40;
pub const A_GATE_RATE: u32 = 41;  // 0 = 1/4, 1 = 1/8, 2 = 1/8T, 3 = 1/16, 4 = 1/16T
pub const A_GATE_DEPTH: u32 = 42; // 0..1 chop depth
pub const A_GATE_SHAPE: u32 = 43; // 0 = Pulse Gate, 1 = Saw Ramp, 2 = Random Probabilistic Gate

/// Generative Analog Randomness ("Flux / Source of Uncertainty") on note trigger & sustain.
pub const A_FLUX_ON: u32 = 50;
pub const A_FLUX_AMT: u32 = 51;  // 0..1 random modulation depth
pub const A_FLUX_RATE: u32 = 52; // 0..1 S&H / random clock rate during sustain
pub const A_FLUX_MODE: u32 = 53; // 0 = S&H Filter, 1 = Buchla Drift, 2 = Cosmic Glitch

/// 1800 rather than 1664: VELA runs to 1207, BAJO to 1650, and AURA to 1753.
// ── SOMA (instrument 06): Physical-Modeling Acoustic Percussion & Chamber Simulator ───
// Block 1800 upward. Models striker/hand contact mechanics, 2D Bessel circular membrane
// vibration, nonlinear deflection tension, and coupled air cavity + wood/copper shell acoustics.
// Defaults to SM_ENABLE = 0.0 (bypass) so all existing instruments remain bit-identical.
pub const SOMA_BASE: u32 = 1800;
pub const SM_ENABLE: u32 = 0;

/// Striker & Hand Articulation (1801..1807)
pub const SM_STRIKER_TYPE: u32 = 1;     // 0=Felt Mallet, 1=Open Hand, 2=Hand Slap, 3=Muted Hand, 4=Stick/Bachi, 5=Finger/Rim
pub const SM_STRIKER_HARDNESS: u32 = 2; // 0..1 felt/flesh stiffness & Hertzian exponent
pub const SM_STRIKER_MASS: u32 = 3;     // 0..1 striker mass & contact duration
pub const SM_STRIKE_POS: u32 = 4;       // 0..1 radial strike position r/a (0 = center, 1 = rim edge)
pub const SM_STRIKE_ANGLE: u32 = 5;     // 0..1 azimuthal angle / dipole stereo projection
pub const SM_VEL_HARDNESS: u32 = 6;     // 0..1 velocity-to-stiffness compression coupling
pub const SM_HAND_BRUSH: u32 = 7;       // 0..1 skin friction / slap air pocket / brush transient

/// 2D Circular Membrane Physics (1810..1818)
pub const SM_HEAD_DIAMETER: u32 = 10;    // 0..1 head diameter (6" to 36")
pub const SM_SKIN_MATERIAL: u32 = 11;    // 0=Calfskin, 1=Thick Goat, 2=Thin Goat, 3=Rawhide/Mule, 4=Cowhide Taiko, 5=Mylar
pub const SM_MEMBRANE_DECAY: u32 = 12;   // 0..1 intrinsic skin sustain
pub const SM_MEMBRANE_DAMP_HF: u32 = 13; // 0..1 high-frequency viscoelastic skin damping
pub const SM_AIR_LOAD: u32 = 14;         // 0..1 external & kettle air-mass modal ratio loading
pub const SM_TENSION_NONLIN: u32 = 15;   // 0..1 nonlinear deflection pitch glissando / bloom
pub const SM_TENSION_PEDAL: u32 = 16;    // 0..1 live tension pedal / talking-drum cord squeeze (0.5 = neutral)
pub const SM_BUZZ_AMOUNT: u32 = 17;      // 0..1 sympathetic snare wire / Sega ring / gut buzz
pub const SM_KEYTRACK: u32 = 18;         // 0..1 keyboard pitch tracking

/// Coupled Air Cavity & Wood/Metal Shell Chamber (1820..1828)
pub const SM_CAVITY_TYPE: u32 = 20;      // 0=Kettle Bowl, 1=Goblet Helmholtz, 2=Stave Barrel, 3=Hourglass Dual-Head, 4=Taiko Barrel, 5=Open Hoop
pub const SM_CAVITY_VOLUME: u32 = 21;    // 0..1 internal air chamber depth & volume
pub const SM_CAVITY_COUPLING: u32 = 22;  // 0..1 bidirectional air-to-membrane pressure coupling
pub const SM_PORT_TUNING: u32 = 23;      // 0..1 Helmholtz neck aperture / resonant head tuning
pub const SM_SHELL_MATERIAL: u32 = 24;   // 0=Carved Hardwood, 1=Hammered Copper, 2=Oak Staves, 3=Clay/Ceramic, 4=Birch/Maple Hoop
pub const SM_SHELL_RESONANCE: u32 = 25;  // 0..1 structural shell wall vibration level
pub const SM_SHELL_WARMTH: u32 = 26;     // 0..1 high-SPL chamber air compression & wood saturation
pub const SM_MIC_PERSPECTIVE: u32 = 27;  // 0..1 top batter skin vs. bottom air port & shell radiation mix
pub const SM_ROOM_EARLY: u32 = 28;       // 0..1 early studio/stage boundary reflections
pub const SM_HERITAGE_AGE: u32 = 29;     // 0..1 aged hide viscoelastic relaxation & seasoned wood/shell resonance
pub const SM_CRAFT_ASYMMETRY: u32 = 30;  // 0..1 dorsal-spine hide anisotropy doublet splitting & chisel micro-turbulence
pub const SM_SYAHI_LOAD: u32 = 31;       // 0..1 C.V. Raman iron-oxide syahi/karanai harmonic paste loading (1:2:3:4:5)
pub const SM_APERTURE_HAND: u32 = 32;    // 0..1 Clay Udu / pot drum dual-aperture palm occlusion & vortex puff

// ── LYRA (instrument 07): physical models — guitar, piano, violin, sax, trumpet, tine piano,
// flute, clarinet, double reeds ───
// Block 1900 upward (lyra.rs). Defaults to LY_ENABLE = 0 (bypass) so existing patches are
// bit-identical. Every control is 0..1 except MODEL and VARIANT, which are indices.
pub const LYRA_BASE: u32 = 1900;
pub const LY_ENABLE: u32 = 0;
pub const LY_MODEL: u32 = 1;        // 0 guitar, 1 piano, 2 violin, 3 sax, 4 trumpet, 5 tine piano, 6 flute, 7 clarinet, 8 double reed, 9 brass, 10 plucked
pub const LY_VARIANT: u32 = 2;      // guitar: 0 steel, 1 nylon, 2 electric single coil, 3 electric humbucker · piano: 0 grand, 1 upright · sax: 0 alto, 1 tenor · trumpet: 0 open, 1 cup, 2 harmon, 3 straight
pub const LY_BRIGHTNESS: u32 = 3;   // loop damping / bell / tine bell
pub const LY_DECAY: u32 = 4;        // ring time (struck/plucked) · release (bowed/blown)
pub const LY_BODY: u32 = 5;         // body / soundboard / formant / cab amount
pub const LY_BODY_SIZE: u32 = 6;    // body size (scales its resonances)
pub const LY_EXCITE_POS: u32 = 7;   // pick / hammer / bow / reed position · tine pickup voicing
pub const LY_EXCITE_HARD: u32 = 8;  // pick / hammer hardness · bow pressure · reed stiffness · lip tension
pub const LY_VEL_SENS: u32 = 9;     // velocity response
pub const LY_VIB_DEPTH: u32 = 10;
pub const LY_VIB_RATE: u32 = 11;    // 3..8 Hz
pub const LY_VIB_DELAY: u32 = 12;   // 0..1 s before vibrato blooms
pub const LY_NOISE: u32 = 13;       // bow hair / breath / hammer knock
pub const LY_DRIVE: u32 = 14;       // amp drive (electric, tine) · growl (sax)
pub const LY_DETUNE: u32 = 15;      // piano unison detune
pub const LY_PEDAL: u32 = 16;       // sustain pedal (piano, tine): >0.5 = dampers up
pub const LY_TREM_DEPTH: u32 = 17;  // tine piano stereo tremolo
pub const LY_TREM_RATE: u32 = 18;
pub const LY_WIDTH: u32 = 19;       // stereo spread across the keyboard
pub const LY_ATTACK: u32 = 20;      // bow / breath onset
pub const LY_DAMP: u32 = 21;        // guitar palm mute
pub const LY_TONE: u32 = 22;        // tine amp treble · electric guitar's tone knob
pub const LY_LEGATO: u32 = 23;      // bowed/blown: >0.5 = a note into a held one slurs (chords stay chords)
// The electric guitar's rig (rack). LY_DRIVE is the preamp gain, LY_TONE the guitar's tone knob,
// LY_BODY the mic position on the cab, LY_TREM_* the amp's tremolo.
pub const LY_PICKUP: u32 = 24;      // selector: 0 neck … 1 bridge (5 positions; humbuckers 3)
pub const LY_AMP: u32 = 25;         // index: 0 American clean, 1 British crunch, 2 chime, 3 high gain
pub const LY_BASS: u32 = 26;
pub const LY_MID: u32 = 27;
pub const LY_TREBLE: u32 = 28;
pub const LY_MASTER: u32 = 29;      // power-amp drive and sag
pub const LY_CAB: u32 = 30;         // index: 0 1x12 open, 1 2x12 alnico, 2 4x12 closed, 3 1x10
pub const LY_COMP: u32 = 31;        // compressor pedal (0 = off)
pub const LY_OD: u32 = 32;          // overdrive pedal (0 = off)
pub const LY_CHORUS: u32 = 33;      // chorus (0 = off)
pub const LY_ECHO: u32 = 34;        // tape echo amount (0 = off)
pub const LY_ECHO_TIME: u32 = 35;   // 80 ms … 900 ms
pub const LY_HERITAGE_AGE: u32 = 36;    // 0..1 aged tonewood specific modulus, felt conditioning & Alnico relaxation
pub const LY_CRAFT_CHARACTER: u32 = 37; // 0..1 handmade plate graduation asymmetry & coupled unison polarization
pub const LY_SYMPATHETIC: u32 = 38;     // 0..1 open-string / duplex / sustain-pedal sympathetic resonance

// ── TONOS (instrument 08): world strings as physical strings ───
// Block 2000 upward (tonos.rs). Defaults to TN_ENABLE = 0 (bypass). INSTRUMENT, MATERIAL,
// SYMP_KEY, SYMP_SCALE and HARMONIC are indices; everything else is 0..1 (0.5 = as the
// instrument is built, where that applies).
pub const TONOS_BASE: u32 = 2000;
pub const TN_ENABLE: u32 = 0;
pub const TN_INSTRUMENT: u32 = 1;   // index into tonos::INSTRUMENTS (52 world string instruments)
pub const TN_POSITION: u32 = 2;     // pluck / strike / bow point (0.5 = the instrument's own)
pub const TN_FORCE: u32 = 3;        // pluck force · hammer mass · bow force (inside Schelleng's window)
pub const TN_HARDNESS: u32 = 4;     // flesh→nail→plectrum contact width · hammer stiffness · rosin grip
pub const TN_BOW_SPEED: u32 = 5;    // bow / wheel speed
pub const TN_TENSION: u32 = 6;      // string tension and gauge together (pitch held): 0.5 = as built
pub const TN_MATERIAL: u32 = 7;     // index: 0 the instrument's own, 1..9 tonos::MATERIAL_NAMES
pub const TN_DAMPING: u32 = 8;      // internal friction (0.5 = the material's)
pub const TN_JAWARI: u32 = 9;       // curved-bridge contact: 0 thread lifts the string clear … 1 lying on the bridge
pub const TN_SYMP: u32 = 10;        // sympathetic strings level (TonosRack)
pub const TN_SYMP_KEY: u32 = 11;    // index 0..11: sympathetic tuning root (C..B)
pub const TN_SYMP_SCALE: u32 = 12;  // index into tonos::SYMP_SCALE_NAMES
pub const TN_BODY: u32 = 13;        // bridge admittance (0.5 = as built): more = more body, shorter notes
pub const TN_BODY_SIZE: u32 = 14;   // body size (resonances down as it grows)
pub const TN_SKIN_TENSION: u32 = 15; // skin bodies: head tension
pub const TN_RATTLE: u32 = 16;      // sesse / sersal / chien looseness (0 = off)
pub const TN_NONLIN: u32 = 17;      // tension modulation, 0..2× physical (0.5 = physical)
pub const TN_COURSE_DETUNE: u32 = 18; // spread of a course's strings (0.5 = as built)
pub const TN_SLIDE: u32 = 19;       // legato glide time
pub const TN_VIB_DEPTH: u32 = 20;
pub const TN_VIB_RATE: u32 = 21;
pub const TN_TREMOLO: u32 = 22;     // tremolo picking rate (pipa lunzhi, bouzouki) · hurdy-gurdy coup rate (0 = off)
pub const TN_WIDTH: u32 = 23;
pub const TN_HARMONIC: u32 = 24;    // index: 0 auto (đàn bầu picks), n = touch the node of harmonic n+1
pub const TN_MUTE: u32 = 25;        // palm / finger damping near the bridge
pub const TN_RELEASE_DAMP: u32 = 26; // how firmly the player stops the string on release
pub const TN_VEL_SENS: u32 = 27;
pub const TN_LEGATO: u32 = 28;      // >0.5: a note into a held one slides (bowed: always one bow)
pub const TN_HERITAGE_AGE: u32 = 29;    // 0..1 centuries of hemicellulose hydrolysis, mineral ground & seasoned gourd/hide
pub const TN_CRAFT_ASYMMETRY: u32 = 30; // 0..1 hand-carved plate graduation asymmetry & Weinreich dual-polarization coupling

// ── ARCO (instrument 09): orchestral strings — violin, viola, cello, double bass, sections ───
// Block 2100 upward (arco.rs). Defaults to AR_ENABLE = 0. INSTRUMENT, ENSEMBLE, SECTION, ARTIC,
// STRING_SET and SEATING are indices; the rest are 0..1 with 0.5 = as built / as played.
pub const ARCO_BASE: u32 = 2100;
pub const AR_ENABLE: u32 = 0;
pub const AR_INSTRUMENT: u32 = 1;  // 0 violin, 1 viola, 2 cello, 3 double bass
pub const AR_ENSEMBLE: u32 = 2;    // 0 one instrument (solo/section), 1 quartet, 2 quintet, 3 chamber string orchestra, 4 full string orchestra
pub const AR_SECTION: u32 = 3;     // index into arco::SECTION_SIZES (players in the section)
pub const AR_ARTIC: u32 = 4;       // index into arco::ARTIC_NAMES
pub const AR_DYNAMICS: u32 = 5;    // dynamics when the mod wheel doesn't drive them (scales velocity)
pub const AR_MOD_DYN: u32 = 6;     // >0.5: the mod wheel is dynamics (bow speed + force), velocity only the accent
pub const AR_BOW_POS: u32 = 7;     // sound point: 0 sul tasto … 0.5 normal … 1 sul ponticello
pub const AR_BOW_FORCE: u32 = 8;   // bow force within Schelleng's window
pub const AR_BOW_SPEED: u32 = 9;
pub const AR_ROSIN: u32 = 10;      // rosin grip (static friction) and how much it softens as it heats
pub const AR_VIB_DEPTH: u32 = 11;
pub const AR_VIB_RATE: u32 = 12;
pub const AR_VIB_SPREAD: u32 = 13; // how differently the players of a section vibrate
pub const AR_INTONATION: u32 = 14; // section tuning spread (0 = perfect unison)
pub const AR_TIGHTNESS: u32 = 15;  // section timing spread (0 = together)
pub const AR_MUTE: u32 = 16;       // con sordino
pub const AR_STRING_SET: u32 = 17; // 0 synthetic core, 1 gut, 2 steel
pub const AR_BODY: u32 = 18;       // bridge admittance (0.5 = as built)
pub const AR_DEEP: u32 = 19;       // deep body (dense upper modes by convolution) level
pub const AR_SEATING: u32 = 20;    // 0 American (violins left, cellos right), 1 European (violins antiphonal)
pub const AR_WIDTH: u32 = 21;
pub const AR_STRING_PREF: u32 = 22; // 0 highest string that reaches the note … 1 stay on lower strings (sul G)
pub const AR_PORTAMENTO: u32 = 23; // legato slide time
pub const AR_LEGATO: u32 = 24;     // >0.5: a note into one held note is one bow, the finger moves
pub const AR_VEL_SENS: u32 = 25;
pub const AR_TORSION: u32 = 26;    // torsional waves at the bow (0 off … 0.5 physical … 1 double)
pub const AR_RELEASE: u32 = 27;    // how slowly the bow leaves the string
pub const AR_BASS_OCTAVE: u32 = 28; // ensembles: basses double the cello line an octave down
pub const AR_QUALITY: u32 = 29;    // simulated players per note: 0 → 1 … 1 → 8 (the rest are represented)
pub const AR_BOW_LENGTH: u32 = 30; // bow length used (0.5 = whole bow; 0 = never runs out)
pub const AR_TENSION: u32 = 31;    // string tension and gauge (pitch held)

// Blocks for the rest of the orchestra & guitar family (reserved; see cornu.rs, aulos.rs,
// kithara.rs, volta.rs).
pub const CORNU_BASE: u32 = 2200;
// ── CORNU (instrument 10): orchestral brass — lips on air columns (cornu.rs) ───
pub const CN_ENABLE: u32 = 0;
pub const CN_INSTRUMENT: u32 = 1;  // index into cornu::INSTRUMENT_NAMES
pub const CN_ENSEMBLE: u32 = 2;    // index into cornu::ENSEMBLE_NAMES
pub const CN_SECTION: u32 = 3;     // index into cornu::SECTION_SIZES (a2, a3, a4…)
pub const CN_ARTIC: u32 = 4;       // index into cornu::ARTIC_NAMES
pub const CN_MUTE: u32 = 5;        // index into cornu::MUTE_NAMES
pub const CN_DYNAMICS: u32 = 6;
pub const CN_MOD_DYN: u32 = 7;     // >0.5: the mod wheel is breath pressure
pub const CN_VEL_SENS: u32 = 8;
pub const CN_PORTAMENTO: u32 = 9;  // slur / slide glide time
pub const CN_LEGATO: u32 = 10;
pub const CN_VIB_DEPTH: u32 = 11;
pub const CN_TONGUE: u32 = 12;     // tonguing crispness (attack time)
pub const CN_BRASSINESS: u32 = 13; // wave steepening, 0..2× physical (0.5 = physical)
pub const CN_BELL: u32 = 14;       // bell cutoff (0.5 = as built)
pub const CN_LIP: u32 = 15;        // lip tuning relative to the note (0.5 = a touch above)
pub const CN_HAND: u32 = 16;       // horn: hand in the bell
pub const CN_QUALITY: u32 = 17;    // simulated players per note
pub const CN_INTONATION: u32 = 18;
pub const CN_TIGHTNESS: u32 = 19;
pub const CN_WIDTH: u32 = 20;
pub const AULOS_BASE: u32 = 2300;
// ── AULOS (instrument 11): woodwinds — reeds and jets on air columns (aulos.rs) ───
pub const AU_ENABLE: u32 = 0;
pub const AU_INSTRUMENT: u32 = 1;
pub const AU_ENSEMBLE: u32 = 2;
pub const AU_SECTION: u32 = 3;
pub const AU_ARTIC: u32 = 4;
pub const AU_DYNAMICS: u32 = 5;
pub const AU_MOD_DYN: u32 = 6;     // >0.5: the mod wheel is breath
pub const AU_VEL_SENS: u32 = 7;
pub const AU_PORTAMENTO: u32 = 8;
pub const AU_LEGATO: u32 = 9;
pub const AU_VIB_DEPTH: u32 = 10;  // 0.5 = the instrument's usual vibrato
pub const AU_TONGUE: u32 = 11;
pub const AU_REED: u32 = 12;       // reed hardness (0.5 = medium)
pub const AU_EMBOUCHURE: u32 = 13; // lip on the reed: tight/thin … loose/open
pub const AU_LATTICE: u32 = 14;    // tone-hole lattice cutoff (0.5 = as built)
pub const AU_QUALITY: u32 = 15;
pub const AU_INTONATION: u32 = 16;
pub const AU_TIGHTNESS: u32 = 17;
pub const AU_WIDTH: u32 = 18;
pub const KITHARA_BASE: u32 = 2400;
pub const VOLTA_BASE: u32 = 2500;

// ── VOLTA circuit-modeled vintage + modern super-synth (2500..2599) ─────────
pub const VL_ENABLE: u32 = 0;         // 0 = off, >0.5 = on
pub const VL_TOPOLOGY: u32 = 1;       // 0 = Series Ladder->SVF, 1 = Parallel, 2 = Dual Morph, 3 = Vintage Ladder Only, 4 = Modern SVF Only
pub const VL_VINTAGE_MORPH: u32 = 2;  // 0 = 1974 Discrete Analog, 1 = 2026 Modern Hybrid
pub const VL_OSC1_WAVE: u32 = 3;      // 0 = Saw, 1 = Pulse/PWM, 2 = Triangle, 3 = Sine, 4 = SuperSaw Pair
pub const VL_OSC1_PW: u32 = 4;        // 0..1 -> 0.08..0.92 pulse width
pub const VL_OSC2_WAVE: u32 = 5;      // 0..4
pub const VL_OSC2_SEMI: u32 = 6;      // 0..1 -> -24..+24 st (0.5 = 0)
pub const VL_OSC2_DETUNE: u32 = 7;    // 0..1 -> -50..+50 cents (0.5 = 0)
pub const VL_OSC_MIX: u32 = 8;        // 0..1 Osc1 <-> Osc2 balance
pub const VL_SUB_LVL: u32 = 9;        // 0..1 Sub-oscillator level
pub const VL_SUB_OCT: u32 = 10;       // 0 = -1 oct, 1 = -2 oct
pub const VL_NOISE_LVL: u32 = 11;     // 0..1 Analog thermal transistor noise
pub const VL_FM_TZ: u32 = 12;         // 0..1 Thru-Zero linear FM depth (Osc2 -> Osc1)
pub const VL_WAVEFOLD: u32 = 13;      // 0..1 4-stage West-Coast Buchla/Serge wavefolder
pub const VL_FOLD_SYM: u32 = 14;      // 0..1 Asymmetric bias before wavefolding (0.5 = symmetric)
pub const VL_LADDER_CUTOFF: u32 = 15; // 0..1 -> 20Hz..20kHz exponential
pub const VL_LADDER_RES: u32 = 16;    // 0..1 Ladder transistor-pair feedback
pub const VL_LADDER_DRIVE: u32 = 17;  // 0..1 Discrete differential-pair drive
pub const VL_SVF_CUTOFF: u32 = 18;    // 0..1 -> 20Hz..20kHz exponential
pub const VL_SVF_RES: u32 = 19;       // 0..1 Cytomic ZDF Q
pub const VL_SVF_MODE: u32 = 20;      // 0..1 continuous LP(0) -> BP(0.33) -> HP(0.67) -> Notch(1.0)
pub const VL_DIODE_CLIP: u32 = 21;    // 0..1 Shockley BJT silicon/germanium clipping stage
pub const VL_OTA_DRIFT: u32 = 22;     // 0..1 Thermal OTA pitch/cutoff component drift & trim tolerance
pub const VL_PSU_SAG: u32 = 23;       // 0..1 Power-rail load sag & recovery
pub const VL_BIAS_TEMP: u32 = 24;     // 0..1 Thermal voltage Vt bias shift
pub const VL_FILT_ENV_AMT: u32 = 25;  // 0..1 -> -1..+1 (0.5 = 0)
pub const VL_KEY_TRACK: u32 = 26;     // 0..1 filter keyboard tracking
pub const VL_AMP_ATK: u32 = 27;
pub const VL_AMP_DEC: u32 = 28;
pub const VL_AMP_SUS: u32 = 29;
pub const VL_AMP_REL: u32 = 30;
pub const VL_FLT_ATK: u32 = 31;
pub const VL_FLT_DEC: u32 = 32;
pub const VL_FLT_SUS: u32 = 33;
pub const VL_FLT_REL: u32 = 34;
pub const VL_LFO_RATE: u32 = 35;      // 0..1 -> 0.08Hz..32Hz
pub const VL_LFO_DEPTH: u32 = 36;     // 0..1
pub const VL_LFO_DEST: u32 = 37;      // 0 = Cutoff, 1 = Pitch/Vibrato, 2 = Wavefold/PWM, 3 = Thru-Zero FM
pub const VL_GLIDE: u32 = 38;         // 0..1 -> 0..1.5s
pub const VL_BEND_RANGE: u32 = 39;    // 0..1 -> 2..24 st
pub const VL_CHORUS: u32 = 40;        // 0..1 Dual-mode BBD / modern stereo ensemble
pub const VL_WIDTH: u32 = 41;         // 0..1 Stereo voice pan spread
pub const VL_VEL_SENS: u32 = 42;      // 0..1 Velocity sensitivity
pub const VL_UNISON: u32 = 43;        // 0..1 Stacked analog/hybrid voice doubling
pub const VL_VOICE_MODE: u32 = 44;    // 0 = Poly, 1 = Mono Retrig, 2 = Legato

pub const MAX_PARAM_ID: usize = 2600;

/// Flat store. A plain array keeps `set_param` and the mod matrix's destination lookup O(1)
/// with no hashing on the audio thread.
pub struct Params {
    pub v: [f32; MAX_PARAM_ID],
}

impl Params {
    pub fn new() -> Self {
        let mut p = Params { v: [0.0; MAX_PARAM_ID] };
        p.defaults();
        p
    }

    #[inline]
    pub fn get(&self, id: u32) -> f32 {
        let i = id as usize;
        if i < MAX_PARAM_ID { self.v[i] } else { 0.0 }
    }

    #[inline]
    pub fn set(&mut self, id: u32, value: f32) {
        let i = id as usize;
        if i < MAX_PARAM_ID && value.is_finite() {
            self.v[i] = value;
        }
    }

    fn defaults(&mut self) {
        self.set(P_MASTER_GAIN, 0.7);
        self.set(P_GLIDE, 0.0);
        self.set(P_BEND_RANGE, 2.0 / 24.0);
        self.set(P_ANALOG_DRIFT, 0.25);
        self.set(P_UNISON_COUNT, 0.0);
        self.set(P_UNISON_DETUNE, 0.18);
        self.set(P_UNISON_WIDTH, 0.7);
        self.set(P_UNISON_BLEND, 0.6);

        for o in 0..3 {
            self.set(osc_param(o, O_ENABLE), if o == 0 { 1.0 } else { 0.0 });
            self.set(osc_param(o, O_LEVEL), if o == 0 { 0.8 } else { 0.0 });
            self.set(osc_param(o, O_PAN), 0.5);
            self.set(osc_param(o, O_COARSE), 0.5);
            self.set(osc_param(o, O_FINE), 0.5);
            self.set(osc_param(o, O_MORPH), 0.0);
            self.set(osc_param(o, O_PHASE), 0.0);
            self.set(osc_param(o, O_TABLE), 0.0);
            self.set(osc_param(o, O_MODE), 0.0);
            self.set(osc_param(o, O_PULSE_WIDTH), 0.5);
        }

        self.set(P_FILTER_ROUTING, 0.0);
        for f in 0..2 {
            self.set(flt_param(f, F_ENABLE), if f == 0 { 1.0 } else { 0.0 });
            self.set(flt_param(f, F_TYPE), 0.0);
            self.set(flt_param(f, F_CUTOFF), 1.0);
            self.set(flt_param(f, F_RES), 0.1);
            self.set(flt_param(f, F_KEYTRACK), 0.0);
            self.set(flt_param(f, F_ENV_AMT), 0.5);
            self.set(flt_param(f, F_MIX), 1.0);
        }

        // Amp envelope: instant-on, medium release — a usable default patch on first note.
        self.set(env_param(0, E_ATTACK), 0.0);
        self.set(env_param(0, E_DECAY), 0.2);
        self.set(env_param(0, E_SUSTAIN), 0.8);
        self.set(env_param(0, E_RELEASE), 0.15);
        for e in 1..NUM_ENV {
            self.set(env_param(e, E_ATTACK), 0.0);
            self.set(env_param(e, E_DECAY), 0.3);
            self.set(env_param(e, E_SUSTAIN), 0.5);
            self.set(env_param(e, E_RELEASE), 0.2);
        }
        for l in 0..NUM_LFO {
            self.set(lfo_param(l, L_RATE), 0.35);
            self.set(lfo_param(l, L_BIPOLAR), 1.0);
            self.set(lfo_param(l, L_RETRIGGER), 1.0);
        }

        // VELA defaults. The body is OFF so an ONDA patch is bit-identical to before this block
        // existed — the instrument is opt-in, not a change to every existing preset.
        self.set(MODAL_BASE + M_ENABLE, 0.0);
        self.set(MODAL_BASE + M_PARTIALS, 0.5); // 32
        self.set(MODAL_BASE + M_INHARM, 0.04); // a bowl
        self.set(MODAL_BASE + M_SPREAD, 0.12);
        self.set(MODAL_BASE + M_DECAY, 0.45);
        self.set(MODAL_BASE + M_DECAY_TILT, 0.5); // centre = no tilt beyond the material's own
        self.set(MODAL_BASE + M_MATERIAL, 0.0);
        self.set(MODAL_BASE + M_POSITION, 0.28);
        self.set(MODAL_BASE + M_KEYTRACK, 0.4);
        self.set(MODAL_BASE + M_ANIMA, 0.3);
        self.set(MODAL_BASE + M_BEAT, 0.25);
        self.set(MODAL_BASE + M_BEAT_RATE, 0.22);
        self.set(MODAL_BASE + M_SWELL, 0.0);
        self.set(MODAL_BASE + M_MORPH, 0.5);
        self.set(MODAL_BASE + M_MORPH_TIME, 0.2);
        self.set(MODAL_BASE + M_MODE, 0.0);
        self.set(MODAL_BASE + M_FORMANT, 0.0);
        self.set(MODAL_BASE + M_FORMANT_SHIFT, 0.5);
        self.set(MODAL_BASE + M_BLOOM, 0.4);
        self.set(MODAL_BASE + M_SPOTLIGHT, 0.0);
        self.set(MODAL_BASE + M_SPOTLIGHT_POS, 0.4);
        self.set(MODAL_BASE + M_SPOTLIGHT_WIDTH, 0.25);
        self.set(MODAL_BASE + M_VIBRATO, 0.0);
        self.set(MODAL_BASE + M_VIBRATO_RATE, 0.45);
        self.set(MODAL_BASE + M_SUBHARM, 0.0);

        self.set(EXC_BASE + X_TYPE, 0.0); // bow
        self.set(EXC_BASE + X_PRESSURE, 0.5);
        self.set(EXC_BASE + X_GRAIN, 0.35);
        self.set(EXC_BASE + X_TONE, 0.4);
        self.set(EXC_BASE + X_VEL_TILT, 0.6);
        self.set(EXC_BASE + X_PULSE, 0.25);
        self.set(EXC_BASE + X_PULSE_RATE, 0.2);

        self.set(VEIL_BASE + V_SIZE, 0.5);
        self.set(VEIL_BASE + V_DECAY, 0.45);
        self.set(VEIL_BASE + V_DIFFUSION, 0.6);
        self.set(VEIL_BASE + V_SHIMMER, 0.0);
        self.set(VEIL_BASE + V_SHIMMER_IVL, 0.0);
        self.set(VEIL_BASE + V_BLUR, 0.0);
        self.set(VEIL_BASE + V_FREEZE, 0.0);
        self.set(VEIL_BASE + V_MIX, 0.0);

        // ── BAJO ─────────────────────────────────────────────────────────────
        // Every section defaults to a bypass so an ONDA/KERA/VELA patch that never mentions
        // these ids renders exactly as it did before they existed. The array defaults still
        // hold musical values, so switching a section on gives a sound rather than silence.
        self.set(STR_BASE + S_LEVEL, 0.0);
        self.set(STR_BASE + S_DAMP, 0.35);
        self.set(STR_BASE + S_TONE, 0.5);
        self.set(STR_BASE + S_PICK, 0.35);
        self.set(STR_BASE + S_BOW, 0.0);
        self.set(STR_BASE + S_BODY, 0.5);

        self.set(THR_BASE + T_AMOUNT, 0.0);
        self.set(THR_BASE + T_VOWEL, 0.2);
        self.set(THR_BASE + T_Q, 0.35);

        self.set(WOB_BASE + W_ENABLE, 0.0);
        self.set(WOB_BASE + W_SHAPE, 0.0);
        self.set(WOB_BASE + W_SKEW, 0.5);
        self.set(WOB_BASE + W_SMOOTH, 0.1);
        self.set(WOB_BASE + W_PHASE, 0.0);
        self.set(WOB_BASE + W_FREE, 0.0);
        self.set(WOB_BASE + W_RATE, 0.35);
        self.set(WOB_BASE + W_DEST1, WOB_DEST_CUTOFF as f32);
        self.set(WOB_BASE + W_DEPTH1, 0.0);
        self.set(WOB_BASE + W_DEST2, WOB_DEST_DRIVE as f32);
        self.set(WOB_BASE + W_DEPTH2, 0.0);
        for i in 0..W_LANE_LEN {
            // 6 = 1/8 in WOB_DIVS — a plain eighth-note wobble before you draw anything.
            self.set(WOB_BASE + W_LANE + i as u32, 6.0);
        }

        self.set(GATE_BASE + G_ENABLE, 0.0);
        self.set(GATE_BASE + G_DEPTH, 1.0);
        self.set(GATE_BASE + G_SLEW, 0.12);
        self.set(GATE_BASE + G_SPILL, 0.4);
        self.set(GATE_BASE + G_SWING, 0.0);
        self.set(GATE_BASE + G_RATE, 1.0);
        self.set(GATE_BASE + G_SPLIT, 0.5);
        for b in 0..G_BANDS {
            for st in 0..G_STEPS {
                self.set(GATE_BASE + G_GRID + (b * G_STEPS + st) as u32, 1.0);
            }
        }

        for st in 0..SC_STAGES {
            self.set(scorch_param(st, SC_ALG), 0.0);
            self.set(scorch_param(st, SC_DRIVE), 0.0);
            self.set(scorch_param(st, SC_BIAS), 0.5);
            self.set(scorch_param(st, SC_TONE), 0.5);
            self.set(scorch_param(st, SC_MIX), 1.0);
        }
        self.set(SC_INPUT, 0.5);
        self.set(SC_FOCUS, 0.5);
        self.set(SC_SAFE, 1.0);
        self.set(SC_SUB, 0.3);
        self.set(SC_OUTPUT, 0.5);

        self.set(SPC_BASE + SP_CH_ON, 0.0);
        self.set(SPC_BASE + SP_CH_RATE, 0.3);
        self.set(SPC_BASE + SP_CH_DEPTH, 0.4);
        self.set(SPC_BASE + SP_CH_MIX, 0.3);
        self.set(SPC_BASE + SP_DL_ON, 0.0);
        self.set(SPC_BASE + SP_DL_DIV, 4.0);
        self.set(SPC_BASE + SP_DL_FB, 0.35);
        self.set(SPC_BASE + SP_DL_TONE, 0.6);
        self.set(SPC_BASE + SP_DL_PING, 1.0);
        self.set(SPC_BASE + SP_DL_MIX, 0.22);
        self.set(SPC_BASE + SP_EC_ON, 0.0);
        self.set(SPC_BASE + SP_EC_TIME, 0.26);
        self.set(SPC_BASE + SP_EC_FB, 0.4);
        self.set(SPC_BASE + SP_EC_WOW, 0.25);
        self.set(SPC_BASE + SP_EC_DRIVE, 0.4);
        self.set(SPC_BASE + SP_EC_DEGRADE, 0.2);
        self.set(SPC_BASE + SP_EC_MIX, 0.2);

        self.set(P_MONO_BELOW, 0.0);

        // ── AURA ─────────────────────────────────────────────────────────────
        // All sections default to bypass (0.0) so existing instruments are bit-identical.
        self.set(AURA_BASE + A_OSC_SYNC, 0.0);
        self.set(AURA_BASE + A_XMOD_PITCH, 0.0);
        self.set(AURA_BASE + A_XMOD_FILTER, 0.0);
        self.set(AURA_BASE + A_RING_MOD, 0.0);
        self.set(AURA_BASE + A_AURA, 0.0);
        self.set(AURA_BASE + A_WARMTH, 0.0);

        self.set(AURA_BASE + A_ENS_ON, 0.0);
        self.set(AURA_BASE + A_ENS_MODE, 0.0);
        self.set(AURA_BASE + A_ENS_DEPTH, 0.6);
        self.set(AURA_BASE + A_ENS_MIX, 0.45);

        self.set(AURA_BASE + A_PH_ON, 0.0);
        self.set(AURA_BASE + A_PH_RATE, 0.22);
        self.set(AURA_BASE + A_PH_DEPTH, 0.7);
        self.set(AURA_BASE + A_PH_FEEDBACK, 0.55);
        self.set(AURA_BASE + A_PH_MIX, 0.4);

        self.set(AURA_BASE + A_TAPE_SAT, 0.0);
        self.set(AURA_BASE + A_HUM, 0.0);
        self.set(AURA_BASE + A_CRACKLE, 0.0);

        self.set(AURA_BASE + A_GATE_ON, 0.0);
        self.set(AURA_BASE + A_GATE_RATE, 3.0);  // 1/16 default
        self.set(AURA_BASE + A_GATE_DEPTH, 0.72);
        self.set(AURA_BASE + A_GATE_SHAPE, 0.0); // Pulse

        self.set(AURA_BASE + A_FLUX_ON, 0.0);
        self.set(AURA_BASE + A_FLUX_AMT, 0.45);
        self.set(AURA_BASE + A_FLUX_RATE, 0.42);
        self.set(AURA_BASE + A_FLUX_MODE, 0.0);

        // ── SOMA ─────────────────────────────────────────────────────────────
        // SM_ENABLE defaults to 0.0 (bypass) so all existing patches are bit-identical.
        self.set(SOMA_BASE + SM_ENABLE, 0.0);
        self.set(SOMA_BASE + SM_STRIKER_TYPE, 0.0);
        self.set(SOMA_BASE + SM_STRIKER_HARDNESS, 0.45);
        self.set(SOMA_BASE + SM_STRIKER_MASS, 0.55);
        self.set(SOMA_BASE + SM_STRIKE_POS, 0.62);
        self.set(SOMA_BASE + SM_STRIKE_ANGLE, 0.5);
        self.set(SOMA_BASE + SM_VEL_HARDNESS, 0.65);
        self.set(SOMA_BASE + SM_HAND_BRUSH, 0.25);

        self.set(SOMA_BASE + SM_HEAD_DIAMETER, 0.62);
        self.set(SOMA_BASE + SM_SKIN_MATERIAL, 0.0);
        self.set(SOMA_BASE + SM_MEMBRANE_DECAY, 0.58);
        self.set(SOMA_BASE + SM_MEMBRANE_DAMP_HF, 0.42);
        self.set(SOMA_BASE + SM_AIR_LOAD, 0.68);
        self.set(SOMA_BASE + SM_TENSION_NONLIN, 0.28);
        self.set(SOMA_BASE + SM_TENSION_PEDAL, 0.5);
        self.set(SOMA_BASE + SM_BUZZ_AMOUNT, 0.0);
        self.set(SOMA_BASE + SM_KEYTRACK, 1.0);

        self.set(SOMA_BASE + SM_CAVITY_TYPE, 0.0);
        self.set(SOMA_BASE + SM_CAVITY_VOLUME, 0.65);
        self.set(SOMA_BASE + SM_CAVITY_COUPLING, 0.62);
        self.set(SOMA_BASE + SM_PORT_TUNING, 0.45);
        self.set(SOMA_BASE + SM_SHELL_MATERIAL, 1.0);
        self.set(SOMA_BASE + SM_SHELL_RESONANCE, 0.45);
        self.set(SOMA_BASE + SM_SHELL_WARMTH, 0.35);
        self.set(SOMA_BASE + SM_MIC_PERSPECTIVE, 0.45);
        self.set(SOMA_BASE + SM_ROOM_EARLY, 0.28);
        self.set(SOMA_BASE + SM_HERITAGE_AGE, 0.0);
        self.set(SOMA_BASE + SM_CRAFT_ASYMMETRY, 0.0);
        self.set(SOMA_BASE + SM_SYAHI_LOAD, 0.0);
        self.set(SOMA_BASE + SM_APERTURE_HAND, 0.0);

        // ── LYRA ─────────────────────────────────────────────────────────────
        self.set(LYRA_BASE + LY_ENABLE, 0.0);
        self.set(LYRA_BASE + LY_MODEL, 0.0);
        self.set(LYRA_BASE + LY_VARIANT, 0.0);
        self.set(LYRA_BASE + LY_BRIGHTNESS, 0.55);
        self.set(LYRA_BASE + LY_DECAY, 0.5);
        self.set(LYRA_BASE + LY_BODY, 0.6);
        self.set(LYRA_BASE + LY_BODY_SIZE, 0.5);
        self.set(LYRA_BASE + LY_EXCITE_POS, 0.4);
        self.set(LYRA_BASE + LY_EXCITE_HARD, 0.5);
        self.set(LYRA_BASE + LY_VEL_SENS, 0.85);
        self.set(LYRA_BASE + LY_VIB_DEPTH, 0.25);
        self.set(LYRA_BASE + LY_VIB_RATE, 0.5);
        self.set(LYRA_BASE + LY_VIB_DELAY, 0.3);
        self.set(LYRA_BASE + LY_NOISE, 0.3);
        self.set(LYRA_BASE + LY_DRIVE, 0.0);
        self.set(LYRA_BASE + LY_DETUNE, 0.35);
        self.set(LYRA_BASE + LY_PEDAL, 0.0);
        self.set(LYRA_BASE + LY_TREM_DEPTH, 0.0);
        self.set(LYRA_BASE + LY_TREM_RATE, 0.45);
        self.set(LYRA_BASE + LY_WIDTH, 0.6);
        self.set(LYRA_BASE + LY_ATTACK, 0.25);
        self.set(LYRA_BASE + LY_DAMP, 0.0);
        self.set(LYRA_BASE + LY_TONE, 0.5);
        self.set(LYRA_BASE + LY_LEGATO, 1.0);
        self.set(LYRA_BASE + LY_PICKUP, 0.5);
        self.set(LYRA_BASE + LY_AMP, 0.0);
        self.set(LYRA_BASE + LY_BASS, 0.5);
        self.set(LYRA_BASE + LY_MID, 0.5);
        self.set(LYRA_BASE + LY_TREBLE, 0.6);
        self.set(LYRA_BASE + LY_MASTER, 0.4);
        self.set(LYRA_BASE + LY_CAB, 0.0);
        self.set(LYRA_BASE + LY_COMP, 0.0);
        self.set(LYRA_BASE + LY_OD, 0.0);
        self.set(LYRA_BASE + LY_CHORUS, 0.0);
        self.set(LYRA_BASE + LY_ECHO, 0.0);
        self.set(LYRA_BASE + LY_ECHO_TIME, 0.4);
        self.set(LYRA_BASE + LY_HERITAGE_AGE, 0.25);
        self.set(LYRA_BASE + LY_CRAFT_CHARACTER, 0.22);
        self.set(LYRA_BASE + LY_SYMPATHETIC, 0.25);

        // TONOS: off unless enabled; the physical controls sit at "as built".
        for id in TN_POSITION..=TN_LEGATO {
            self.set(TONOS_BASE + id, 0.5);
        }
        self.set(TONOS_BASE + TN_ENABLE, 0.0);
        self.set(TONOS_BASE + TN_INSTRUMENT, 0.0);
        self.set(TONOS_BASE + TN_MATERIAL, 0.0);
        self.set(TONOS_BASE + TN_JAWARI, 0.8);
        self.set(TONOS_BASE + TN_SYMP, 0.0);
        self.set(TONOS_BASE + TN_SYMP_KEY, 0.0);
        self.set(TONOS_BASE + TN_SYMP_SCALE, 0.0);
        self.set(TONOS_BASE + TN_RATTLE, 0.4);
        self.set(TONOS_BASE + TN_SLIDE, 0.2);
        self.set(TONOS_BASE + TN_VIB_DEPTH, 0.2);
        self.set(TONOS_BASE + TN_TREMOLO, 0.0);
        self.set(TONOS_BASE + TN_HARMONIC, 0.0);
        self.set(TONOS_BASE + TN_MUTE, 0.0);
        self.set(TONOS_BASE + TN_RELEASE_DAMP, 0.3);
        self.set(TONOS_BASE + TN_VEL_SENS, 0.85);
        self.set(TONOS_BASE + TN_LEGATO, 1.0);
        self.set(TONOS_BASE + TN_HERITAGE_AGE, 0.28);
        self.set(TONOS_BASE + TN_CRAFT_ASYMMETRY, 0.22);
        // ARCO: off unless enabled.
        for id in AR_DYNAMICS..=AR_TENSION {
            self.set(ARCO_BASE + id, 0.5);
        }
        self.set(ARCO_BASE + AR_ENABLE, 0.0);
        self.set(ARCO_BASE + AR_INSTRUMENT, 0.0);
        self.set(ARCO_BASE + AR_ENSEMBLE, 0.0);
        self.set(ARCO_BASE + AR_SECTION, 0.0);
        self.set(ARCO_BASE + AR_ARTIC, 0.0);
        self.set(ARCO_BASE + AR_MOD_DYN, 0.0);
        self.set(ARCO_BASE + AR_MUTE, 0.0);
        self.set(ARCO_BASE + AR_STRING_SET, 0.0);
        self.set(ARCO_BASE + AR_SEATING, 0.0);
        self.set(ARCO_BASE + AR_STRING_PREF, 0.2);
        self.set(ARCO_BASE + AR_PORTAMENTO, 0.15);
        self.set(ARCO_BASE + AR_LEGATO, 1.0);
        self.set(ARCO_BASE + AR_VEL_SENS, 0.8);
        self.set(ARCO_BASE + AR_BASS_OCTAVE, 0.0);
        self.set(ARCO_BASE + AR_QUALITY, 0.72);
        self.set(ARCO_BASE + AR_VIB_DEPTH, 0.45);
        self.set(ARCO_BASE + AR_INTONATION, 0.35);
        self.set(ARCO_BASE + AR_TIGHTNESS, 0.35);
        // CORNU: off unless enabled.
        for id in CN_DYNAMICS..=CN_WIDTH {
            self.set(CORNU_BASE + id, 0.5);
        }
        for id in [CN_ENABLE, CN_INSTRUMENT, CN_ENSEMBLE, CN_SECTION, CN_ARTIC, CN_MUTE, CN_MOD_DYN] {
            self.set(CORNU_BASE + id, 0.0);
        }
        self.set(CORNU_BASE + CN_VEL_SENS, 0.8);
        self.set(CORNU_BASE + CN_PORTAMENTO, 0.1);
        self.set(CORNU_BASE + CN_LEGATO, 1.0);
        self.set(CORNU_BASE + CN_VIB_DEPTH, 0.15);
        self.set(CORNU_BASE + CN_QUALITY, 0.67);
        self.set(CORNU_BASE + CN_INTONATION, 0.3);
        self.set(CORNU_BASE + CN_TIGHTNESS, 0.3);
        // AULOS: off unless enabled.
        for id in AU_DYNAMICS..=AU_WIDTH {
            self.set(AULOS_BASE + id, 0.5);
        }
        for id in [AU_ENABLE, AU_INSTRUMENT, AU_ENSEMBLE, AU_SECTION, AU_ARTIC, AU_MOD_DYN] {
            self.set(AULOS_BASE + id, 0.0);
        }
        self.set(AULOS_BASE + AU_VEL_SENS, 0.8);
        self.set(AULOS_BASE + AU_PORTAMENTO, 0.08);
        self.set(AULOS_BASE + AU_LEGATO, 1.0);
        self.set(AULOS_BASE + AU_QUALITY, 0.67);
        self.set(AULOS_BASE + AU_INTONATION, 0.3);
        self.set(AULOS_BASE + AU_TIGHTNESS, 0.3);

        // VOLTA: off unless enabled; calibrated Vintage+Modern hybrid defaults.
        self.set(VOLTA_BASE + VL_ENABLE, 0.0);
        self.set(VOLTA_BASE + VL_TOPOLOGY, 2.0); // Dual Morph Vintage <-> Modern
        self.set(VOLTA_BASE + VL_VINTAGE_MORPH, 0.35);
        self.set(VOLTA_BASE + VL_OSC1_WAVE, 0.0);
        self.set(VOLTA_BASE + VL_OSC1_PW, 0.5);
        self.set(VOLTA_BASE + VL_OSC2_WAVE, 0.0);
        self.set(VOLTA_BASE + VL_OSC2_SEMI, 0.5);
        self.set(VOLTA_BASE + VL_OSC2_DETUNE, 0.56);
        self.set(VOLTA_BASE + VL_OSC_MIX, 0.45);
        self.set(VOLTA_BASE + VL_SUB_LVL, 0.35);
        self.set(VOLTA_BASE + VL_SUB_OCT, 0.0);
        self.set(VOLTA_BASE + VL_NOISE_LVL, 0.03);
        self.set(VOLTA_BASE + VL_FM_TZ, 0.0);
        self.set(VOLTA_BASE + VL_WAVEFOLD, 0.15);
        self.set(VOLTA_BASE + VL_FOLD_SYM, 0.5);
        self.set(VOLTA_BASE + VL_LADDER_CUTOFF, 0.62);
        self.set(VOLTA_BASE + VL_LADDER_RES, 0.24);
        self.set(VOLTA_BASE + VL_LADDER_DRIVE, 0.32);
        self.set(VOLTA_BASE + VL_SVF_CUTOFF, 0.74);
        self.set(VOLTA_BASE + VL_SVF_RES, 0.18);
        self.set(VOLTA_BASE + VL_SVF_MODE, 0.0);
        self.set(VOLTA_BASE + VL_DIODE_CLIP, 0.22);
        self.set(VOLTA_BASE + VL_OTA_DRIFT, 0.28);
        self.set(VOLTA_BASE + VL_PSU_SAG, 0.22);
        self.set(VOLTA_BASE + VL_BIAS_TEMP, 0.38);
        self.set(VOLTA_BASE + VL_FILT_ENV_AMT, 0.72);
        self.set(VOLTA_BASE + VL_KEY_TRACK, 0.45);
        self.set(VOLTA_BASE + VL_AMP_ATK, 0.08);
        self.set(VOLTA_BASE + VL_AMP_DEC, 0.38);
        self.set(VOLTA_BASE + VL_AMP_SUS, 0.76);
        self.set(VOLTA_BASE + VL_AMP_REL, 0.28);
        self.set(VOLTA_BASE + VL_FLT_ATK, 0.06);
        self.set(VOLTA_BASE + VL_FLT_DEC, 0.42);
        self.set(VOLTA_BASE + VL_FLT_SUS, 0.36);
        self.set(VOLTA_BASE + VL_FLT_REL, 0.34);
        self.set(VOLTA_BASE + VL_LFO_RATE, 0.36);
        self.set(VOLTA_BASE + VL_LFO_DEPTH, 0.12);
        self.set(VOLTA_BASE + VL_LFO_DEST, 0.0);
        self.set(VOLTA_BASE + VL_GLIDE, 0.06);
        self.set(VOLTA_BASE + VL_BEND_RANGE, 0.0);
        self.set(VOLTA_BASE + VL_CHORUS, 0.28);
        self.set(VOLTA_BASE + VL_WIDTH, 0.55);
        self.set(VOLTA_BASE + VL_VEL_SENS, 0.72);
        self.set(VOLTA_BASE + VL_UNISON, 0.2);
        self.set(VOLTA_BASE + VL_VOICE_MODE, 0.0);
    }
}

// ── VELA unit mappings ───────────────────────────────────────────────────────

/// Modal decay: 0..1 → 0.2 s … 45 s, curved so the short end where percussion lives keeps
/// real resolution.
#[inline]
pub fn modal_decay_s(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    0.2 + 44.8 * n * n * n
}

/// Swell (amplitude attack): 0..1 → 0 … 12 s, cubed so the short end keeps resolution.
#[inline]
pub fn swell_time_s(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    12.0 * n * n * n
}

/// Morph time: 0..1 → 1 s … 90 s. The long end is the soundscape register, where a single held
/// note is still becoming something else a minute later.
#[inline]
pub fn morph_time_s(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    1.0 + 89.0 * n * n
}

/// Vibrato rate: 0..1 → 0.5 Hz … 9 Hz. The slow end is a monastic waver rather than an
/// operatic vibrato — closer to the pitch drift of a held chant than to a trained wobble.
#[inline]
pub fn vibrato_rate_hz(norm: f32) -> f32 {
    0.5 * (18.0f32).powf(norm.clamp(0.0, 1.0))
}

/// Beat rate: 0..1 → 0.15 Hz … 9 Hz. A real bowl beats somewhere between one cycle every few
/// seconds and a fast shimmer; the low end is where the hair-raising slow "wah" lives.
#[inline]
pub fn beat_rate_hz(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    0.15 * (60.0f32).powf(n)
}

/// Exciter pulse rate: 0..1 → 0.03 Hz … 1.2 Hz. The slow end is roughly a breath.
#[inline]
pub fn pulse_rate_hz(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    0.03 * (40.0f32).powf(n)
}

/// Slow LFO range: 0..1 → 300 s … 20 s per cycle (0.0033 Hz … 0.05 Hz).
/// Inverted against the normal rate mapping on purpose — turning a rate control up should
/// always mean "faster", in either range.
#[inline]
pub fn lfo_rate_slow(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    1.0 / (300.0 - 280.0 * n)
}

// ── Normalised → real unit mappings ──────────────────────────────────────────

/// Exponential cutoff mapping: 20 Hz … 20 kHz. Linear-in-octaves is how ears hear it, and it
/// makes filter-envelope depth behave the same at every cutoff.
#[inline]
pub fn cutoff_hz(norm: f32) -> f32 {
    20.0 * (1000.0f32).powf(norm.clamp(0.0, 1.0))
}

/// Envelope times: 0..1 → 1ms..12s, curved so the useful short end has real resolution.
#[inline]
pub fn env_time(norm: f32) -> f32 {
    let n = norm.clamp(0.0, 1.0);
    0.001 + 12.0 * n * n * n
}

/// LFO rate: 0..1 → 0.01Hz..40Hz, exponential.
#[inline]
pub fn lfo_rate(norm: f32) -> f32 {
    0.01 * (4000.0f32).powf(norm.clamp(0.0, 1.0))
}
