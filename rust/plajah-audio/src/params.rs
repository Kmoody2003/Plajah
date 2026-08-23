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
pub const M_MATERIAL: u32 = 6; // 0 bronze, 1 glass, 2 iron, 3 wood, 4 skin, 5 air
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

/// 1408 rather than 1024: the VELA blocks run to 1207, and `Params::set` silently drops any id
/// past the end of the array — a whole instrument that fails without an error.
pub const MAX_PARAM_ID: usize = 1408;

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
