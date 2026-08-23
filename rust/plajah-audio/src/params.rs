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

/// 1664 rather than 1024: VELA runs to 1207 and BAJO to 1650, and `Params::set` silently drops
/// any id past the end of the array — a whole instrument that fails without an error.
pub const MAX_PARAM_ID: usize = 1664;

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
