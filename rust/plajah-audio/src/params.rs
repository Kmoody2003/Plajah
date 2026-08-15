//! The parameter id space. This is the contract between Rust and TypeScript: the host sends
//! `set_param(id, value)` and the mod matrix targets the same ids, so a modulation destination
//! and a UI knob are the same thing by construction.
//!
//! Ids are grouped by block of 100 so the layout stays readable and extending a section never
//! renumbers another. Values are normalised 0..1 unless noted; the engine maps to real units.

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

#[inline]
pub fn lfo_param(index: usize, p: u32) -> u32 {
    LFO_BASE + index as u32 * LFO_STRIDE + p
}

pub const MACRO_BASE: u32 = 900; // 900..907

pub const MAX_PARAM_ID: usize = 1024;

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
        for e in 1..3 {
            self.set(env_param(e, E_ATTACK), 0.0);
            self.set(env_param(e, E_DECAY), 0.3);
            self.set(env_param(e, E_SUSTAIN), 0.5);
            self.set(env_param(e, E_RELEASE), 0.2);
        }
        for l in 0..3 {
            self.set(lfo_param(l, L_RATE), 0.35);
            self.set(lfo_param(l, L_BIPOLAR), 1.0);
            self.set(lfo_param(l, L_RETRIGGER), 1.0);
        }
    }
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
