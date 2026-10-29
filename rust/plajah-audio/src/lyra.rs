//! LYRA — physical models of the instruments the Session Band was missing: guitar, acoustic piano,
//! violin, saxophone, trumpet, and a tine electric piano. One voice type, six models, no samples.
//!
//! Not from scratch: the bowed string, the reed/bore and the lip valve follow the published
//! digital-waveguide models in Perry Cook & Gary Scavone's Synthesis ToolKit (STK `Bowed`,
//! `Saxofony`, `Brass`; STK's licence is permissive), the guitar is extended Karplus-Strong
//! (Jaffe & Smith 1983: pick position, loop damping, stiffness allpass), and the piano is the
//! commuted-waveguide idea (Smith; Bank & Välimäki on dispersion): a hammer + soundboard
//! excitation into unison strings whose slight detuning gives the two-stage decay. The tine
//! piano is ours: modal tine + tonebar, a neoprene hammer's contact spectrum, and the
//! electromagnetic pickup's nonlinear flux curve — which is where that bark comes from.
//!
//! Tuning: every string loop's delay is the period minus the exact phase delay of the filters
//! in the loop at the fundamental (computed, not guessed), so the models play in tune across
//! the keyboard. The wind/bow models keep STK's empirical offsets and are checked by test.
//!
//! Everything allocates in `set_sample_rate` (engine construction), never on the audio thread.

use crate::osc::Rng;
use crate::params::*;
use std::f32::consts::PI;

const TAU: f32 = 2.0 * PI;

pub const MODEL_GUITAR: u32 = 0;
pub const MODEL_PIANO: u32 = 1;
pub const MODEL_VIOLIN: u32 = 2;
pub const MODEL_SAX: u32 = 3;
pub const MODEL_TRUMPET: u32 = 4;
pub const MODEL_TINE: u32 = 5;
pub const MODEL_FLUTE: u32 = 6;
pub const MODEL_CLARINET: u32 = 7;
const REED_FORCE: f32 = 0.6;
const KICK: f32 = 0.25;
pub const MODEL_REED: u32 = 8; // double reeds: oboe, English horn, bassoon
pub const MODEL_BRASS: u32 = 9; // the rest of the horn section: flugelhorn, French horn, trombones, tuba
pub const MODEL_PLUCK: u32 = 10; // harp, mandolin, banjo, ukulele, pizzicato strings

/// Bowed and blown models: they sustain while held and can slur (legato) between notes.
#[inline]
pub fn sustained(model: u32) -> bool {
    matches!(model, MODEL_VIOLIN | MODEL_SAX | MODEL_TRUMPET | MODEL_FLUTE | MODEL_CLARINET | MODEL_REED | MODEL_BRASS)
}

// ── building blocks ────────────────────────────────────────────────────────────────────────────

/// A power-of-two delay line read with 4-point Lagrange interpolation (flat phase delay, which
/// is what keeps the loops in tune).
struct Delay {
    buf: Vec<f32>,
    mask: usize,
    w: usize,
}

impl Delay {
    fn new(min_len: usize) -> Self {
        let n = min_len.next_power_of_two().max(16);
        Delay { buf: vec![0.0; n], mask: n - 1, w: 0 }
    }
    fn clear(&mut self) {
        for x in self.buf.iter_mut() {
            *x = 0.0;
        }
    }
    #[inline]
    fn write(&mut self, x: f32) {
        self.buf[self.w] = x;
        self.w = (self.w + 1) & self.mask;
    }
    /// The sample `d` samples older than the most recently written one (d ≥ 1).
    #[inline]
    fn read(&self, d: f32) -> f32 {
        let d = d.clamp(1.0, (self.mask - 3) as f32);
        let i = d.floor();
        let t = 1.0 + (d - i);
        let i = i as usize;
        let at = |k: usize| self.buf[(self.w + 2 * (self.mask + 1) - 1 - k) & self.mask];
        let (x0, x1, x2, x3) = (at(i - 1), at(i), at(i + 1), at(i + 2));
        let h0 = -(t - 1.0) * (t - 2.0) * (t - 3.0) / 6.0;
        let h1 = t * (t - 2.0) * (t - 3.0) / 2.0;
        let h2 = -t * (t - 1.0) * (t - 3.0) / 2.0;
        let h3 = t * (t - 1.0) * (t - 2.0) / 6.0;
        x0 * h0 + x1 * h1 + x2 * h2 + x3 * h3
    }
    /// Write, then return the input delayed by exactly `n` samples (STK DelayL::tick).
    #[inline]
    fn process(&mut self, x: f32, n: f32) -> f32 {
        self.write(x);
        self.read(n)
    }
}

/// Phase delay (samples) of y = (1−b)x + b·y₁ at ω.
fn onepole_pd(b: f32, w: f32) -> f32 {
    (b * w.sin()).atan2(1.0 - b * w.cos()) / w
}
/// Phase delay (samples) of the first-order allpass (a + z⁻¹)/(1 + a z⁻¹) at ω.
fn allpass_pd(a: f32, w: f32) -> f32 {
    let ph = -(w.sin()).atan2(a + w.cos()) + (a * w.sin()).atan2(1.0 + a * w.cos());
    -ph / w
}

#[derive(Clone, Copy, Default)]
struct Allpass {
    a: f32,
    x1: f32,
    y1: f32,
}
impl Allpass {
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let y = self.a * x + self.x1 - self.a * self.y1;
        self.x1 = x;
        self.y1 = y;
        y
    }
}

/// RBJ biquad, transposed direct form II.
#[derive(Clone, Copy, Default)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}
impl Biquad {
    /// Band-pass, 0 dB at the centre.
    fn bandpass(f: f32, q: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(10.0, sr * 0.45) / sr;
        let alpha = w.sin() / (2.0 * q.max(0.1));
        let a0 = 1.0 + alpha;
        Biquad { b0: alpha / a0, b1: 0.0, b2: -alpha / a0, a1: -2.0 * w.cos() / a0, a2: (1.0 - alpha) / a0, z1: 0.0, z2: 0.0 }
    }
    fn lowpass(f: f32, q: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(10.0, sr * 0.45) / sr;
        let alpha = w.sin() / (2.0 * q.max(0.1));
        let c = w.cos();
        let a0 = 1.0 + alpha;
        Biquad { b0: (1.0 - c) * 0.5 / a0, b1: (1.0 - c) / a0, b2: (1.0 - c) * 0.5 / a0, a1: -2.0 * c / a0, a2: (1.0 - alpha) / a0, z1: 0.0, z2: 0.0 }
    }
    fn highpass(f: f32, q: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(10.0, sr * 0.45) / sr;
        let alpha = w.sin() / (2.0 * q.max(0.1));
        let c = w.cos();
        let a0 = 1.0 + alpha;
        Biquad { b0: (1.0 + c) * 0.5 / a0, b1: -(1.0 + c) / a0, b2: (1.0 + c) * 0.5 / a0, a1: -2.0 * c / a0, a2: (1.0 - alpha) / a0, z1: 0.0, z2: 0.0 }
    }
    /// Peaking EQ (RBJ): `db` at `f`.
    fn peak(f: f32, q: f32, db: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(10.0, sr * 0.45) / sr;
        let a = 10f32.powf(db / 40.0);
        let alpha = w.sin() / (2.0 * q.max(0.1));
        let c = w.cos();
        let a0 = 1.0 + alpha / a;
        Biquad { b0: (1.0 + alpha * a) / a0, b1: -2.0 * c / a0, b2: (1.0 - alpha * a) / a0, a1: -2.0 * c / a0, a2: (1.0 - alpha / a) / a0, z1: 0.0, z2: 0.0 }
    }
    /// High shelf (RBJ, slope 1): `db` above `f`.
    fn highshelf(f: f32, db: f32, sr: f32) -> Self {
        let w = TAU * f.clamp(10.0, sr * 0.45) / sr;
        let a = 10f32.powf(db / 40.0);
        let (c, sn) = (w.cos(), w.sin());
        let alpha = sn / 2.0 * std::f32::consts::SQRT_2;
        let sa = 2.0 * a.sqrt() * alpha;
        let a0 = (a + 1.0) - (a - 1.0) * c + sa;
        Biquad {
            b0: a * ((a + 1.0) + (a - 1.0) * c + sa) / a0,
            b1: -2.0 * a * ((a - 1.0) + (a + 1.0) * c) / a0,
            b2: a * ((a + 1.0) + (a - 1.0) * c - sa) / a0,
            a1: 2.0 * ((a - 1.0) - (a + 1.0) * c) / a0,
            a2: ((a + 1.0) - (a - 1.0) * c - sa) / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
    fn clear(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

/// One string: delay + damping one-pole + loss + stiffness allpasses, tuned exactly.
struct StringLoop {
    d: Delay,
    read: f32,
    g: f32,
    b: f32,
    lp: f32,
    ap: [Allpass; 2],
    nap: usize,
    period: f32,
}
impl StringLoop {
    fn new(len: usize) -> Self {
        StringLoop { d: Delay::new(len), read: 100.0, g: 0.99, b: 0.2, lp: 0.0, ap: [Allpass::default(); 2], nap: 0, period: 100.0 }
    }
    fn clear(&mut self) {
        self.d.clear();
        self.lp = 0.0;
        for a in self.ap.iter_mut() {
            a.x1 = 0.0;
            a.y1 = 0.0;
        }
    }
    fn tune(&mut self, period: f32) {
        self.period = period;
        let w = TAU / period;
        let mut pd = onepole_pd(self.b, w);
        for a in &self.ap[..self.nap] {
            pd += allpass_pd(a.a, w);
        }
        self.read = (period - 1.0 - pd).max(1.0);
    }
    fn set_t60(&mut self, t60: f32, f0: f32) {
        self.g = 10f32.powf(-3.0 / (t60.max(0.01) * f0.max(1.0))).min(0.99999);
    }
    #[inline]
    fn tick(&mut self, input: f32) -> f32 {
        let y = self.d.read(self.read);
        self.lp = (1.0 - self.b) * y + self.b * self.lp;
        let mut z = self.lp * self.g;
        for a in self.ap[..self.nap].iter_mut() {
            z = a.tick(z);
        }
        self.d.write(z + input);
        y
    }
}

/// A damped sinusoid (one tine mode): rotate (c, s) by r·e^{jω} each sample.
#[derive(Clone, Copy, Default)]
struct Mode {
    c: f32,
    s: f32,
    cw: f32,
    sw: f32,
    r: f32,
    amp: f32,
}
impl Mode {
    fn set(&mut self, f: f32, t60: f32, amp: f32, sr: f32) {
        let w = TAU * f / sr;
        self.cw = w.cos();
        self.sw = w.sin();
        self.r = 10f32.powf(-3.0 / (t60.max(0.005) * sr));
        self.amp = amp;
        self.c = 1.0;
        self.s = 0.0;
    }
    fn set_t60(&mut self, t60: f32, sr: f32) {
        self.r = 10f32.powf(-3.0 / (t60.max(0.005) * sr));
    }
    #[inline]
    fn tick(&mut self) -> f32 {
        let c = (self.c * self.cw - self.s * self.sw) * self.r;
        let s = (self.c * self.sw + self.s * self.cw) * self.r;
        self.c = c;
        self.s = s;
        s * self.amp
    }
}

/// A neoprene / felt hammer's contact spectrum: a half-sine force pulse of width τ, normalised.
fn hammer_weight(f: f32, tau: f32) -> f32 {
    let x = 2.0 * f * tau;
    if (x - 1.0).abs() < 1e-3 {
        return PI / 4.0;
    }
    ((PI * f * tau).cos() / (1.0 - x * x)).abs()
}

#[inline]
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
#[inline]
fn p01(p: &Params, id: u32) -> f32 {
    p.get(LYRA_BASE + id).clamp(0.0, 1.0)
}

const EXC_MAX: usize = 4096;
const MAX_BODY: usize = 6;

/// Violin, viola, cello, double bass: body modes (Hz, Q, gain) and output gain.
static STRING_BODIES: [(&[(f32, f32, f32)], f32); 4] = [
    (&[(275.0, 12.0, 1.0), (460.0, 10.0, 0.9), (540.0, 15.0, 0.8), (700.0, 8.0, 0.5), (2500.0, 1.5, 0.75), (3500.0, 2.0, 0.4)], 3.4),
    (&[(230.0, 12.0, 1.0), (390.0, 10.0, 0.9), (470.0, 14.0, 0.8), (620.0, 8.0, 0.5), (2000.0, 1.5, 0.7), (3000.0, 2.0, 0.35)], 3.4),
    (&[(102.0, 12.0, 1.0), (175.0, 10.0, 0.9), (205.0, 14.0, 0.8), (320.0, 8.0, 0.55), (1500.0, 1.5, 0.6), (2400.0, 2.0, 0.3)], 3.2),
    (&[(62.0, 10.0, 1.0), (105.0, 9.0, 0.9), (130.0, 12.0, 0.8), (220.0, 8.0, 0.5), (800.0, 1.4, 0.45), (1600.0, 2.0, 0.25)], 3.4),
];

/// Which violin-family instrument plays a register in the quartet: cello, viola, violin.
fn string_kind_for(note: f32) -> u32 {
    if note < 48.0 {
        2
    } else if note < 60.0 {
        1
    } else {
        0
    }
}

/// One brass instrument's bore and bell.
struct BrassBell {
    /// Soft-note bell corner as a multiple of f0 (dark … bright), and its floor in Hz.
    lo_k: (f32, f32),
    lo_min: f32,
    /// The bell's ff corner (dark … bright).
    hi: (f32, f32),
    edge: f32,
    /// How far the wave can steepen (fraction of a period) across the Drive control.
    shock: (f32, f32),
    formants: [(f32, f32, f32); 2],
    cut: f32,
    air: f32,
    gain: f32,
}

/// Flugelhorn, French horn, tenor trombone, bass trombone, tuba.
static BRASS: [BrassBell; 5] = [
    BrassBell { lo_k: (1.3, 2.0), lo_min: 300.0, hi: (5000.0, 9000.0), edge: 1.2, shock: (0.03, 0.08), formants: [(900.0, 1.2, 0.4), (1800.0, 1.6, 0.2)], cut: 100.0, air: 9000.0, gain: 2.4 },
    BrassBell { lo_k: (1.2, 1.8), lo_min: 160.0, hi: (3500.0, 6500.0), edge: 1.6, shock: (0.05, 0.15), formants: [(450.0, 1.3, 0.5), (1100.0, 1.8, 0.25)], cut: 50.0, air: 5500.0, gain: 2.8 },
    BrassBell { lo_k: (1.6, 2.6), lo_min: 220.0, hi: (7000.0, 13000.0), edge: 2.4, shock: (0.08, 0.22), formants: [(520.0, 1.3, 0.5), (1200.0, 1.6, 0.3)], cut: 60.0, air: 12000.0, gain: 2.3 },
    BrassBell { lo_k: (1.5, 2.4), lo_min: 160.0, hi: (5000.0, 10000.0), edge: 2.2, shock: (0.08, 0.2), formants: [(380.0, 1.3, 0.55), (950.0, 1.6, 0.3)], cut: 40.0, air: 9000.0, gain: 2.4 },
    BrassBell { lo_k: (1.4, 2.2), lo_min: 110.0, hi: (2500.0, 5000.0), edge: 1.2, shock: (0.04, 0.12), formants: [(230.0, 1.2, 0.6), (600.0, 1.6, 0.25)], cut: 25.0, air: 5000.0, gain: 2.8 },
];

/// One plucked instrument: string, pluck and body.
struct Pluck {
    /// Ring time (s) at 82 Hz; extra loop damping (gut/nylon); pluck point (fraction of the string).
    ring: f32,
    soft: f32,
    at: f32,
    /// Pick (1) … fleshy finger (low): how much of the pluck's top end survives.
    finger: f32,
    courses: usize,
    /// Detune between a paired course (cents).
    spread: f32,
    stiff: f32,
    body: &'static [(f32, f32, f32)],
    direct: f32,
    gain: f32,
}

/// Harp, mandolin, banjo, ukulele, pizzicato (body chosen by register).
static PLUCKS: [Pluck; 5] = [
    Pluck { ring: 7.0, soft: 0.1, at: 0.4, finger: 0.45, courses: 1, spread: 0.0, stiff: 0.0, body: &[(160.0, 6.0, 0.7), (330.0, 8.0, 0.5), (700.0, 5.0, 0.35), (1500.0, 2.0, 0.2)], direct: 0.6, gain: 0.5 },
    Pluck { ring: 1.8, soft: 0.0, at: 0.12, finger: 1.0, courses: 2, spread: 3.0, stiff: -0.08, body: &[(290.0, 9.0, 0.9), (520.0, 10.0, 0.6), (1100.0, 6.0, 0.4), (2600.0, 1.5, 0.3)], direct: 0.5, gain: 0.45 },
    // The drum head: a bright, short-lived set of membrane modes — the banjo's twang.
    Pluck { ring: 1.4, soft: 0.0, at: 0.1, finger: 0.95, courses: 1, spread: 0.0, stiff: -0.08, body: &[(320.0, 4.0, 1.0), (700.0, 3.0, 0.6), (1450.0, 3.0, 0.5), (2900.0, 2.0, 0.4)], direct: 0.35, gain: 0.5 },
    Pluck { ring: 1.5, soft: 0.14, at: 0.25, finger: 0.6, courses: 1, spread: 0.0, stiff: 0.0, body: &[(220.0, 8.0, 0.9), (420.0, 10.0, 0.7), (800.0, 6.0, 0.4), (2000.0, 1.5, 0.2)], direct: 0.5, gain: 0.55 },
    Pluck { ring: 0.9, soft: 0.12, at: 0.33, finger: 0.4, courses: 1, spread: 0.0, stiff: 0.0, body: &[], direct: 0.3, gain: 0.8 },
];

// ── the voice ──────────────────────────────────────────────────────────────────────────────────

pub struct LyraVoice {
    sr: f32,
    model: u32,
    variant: u32,
    f0: f32,
    note: f32,
    vel: f32,
    released: bool,
    t: u32,
    bend: f32,

    strings: [StringLoop; 3],
    nstr: usize,
    detune: [f32; 3],
    t60: f32,

    exc: Vec<f32>,
    exc_len: usize,
    exc_pos: usize,

    body: [Biquad; MAX_BODY],
    body_g: [f32; MAX_BODY],
    nbody: usize,
    direct: f32,
    hist: Delay,
    /// Electric pickups: where each coil hears the string (delay, samples) and its share.
    pk_taps: [f32; 4],
    pk_w: [f32; 4],
    npk: usize,

    // bowed / blown
    d1: Delay,
    d2: Delay,
    last1: f32,
    last2: f32,
    base: f32,
    beta: f32,
    lp: f32,
    pole: f32,
    oz_x1: f32,
    lip: Biquad,
    dc_x1: f32,
    dc_y1: f32,
    env: f32,
    env_up: f32,
    env_down: f32,
    max_drive: f32,
    slope: f32,
    noise_gain: f32,
    mute: [Biquad; 2],
    nmute: usize,

    vib_phase: f32,
    vib_inc: f32,
    vib_depth: f32,
    vib_onset: u32,

    modes: [Mode; 4],
    nmodes: usize,
    pk_off: f32,
    pk_amp: f32,
    pk_prev: f32,
    pk_lp: f32,
    pk_norm: f32,
    hp_a: f32,
    hp_x1: f32,
    hp_y1: f32,
    pedal: bool,

    growl: f32,
    growl_lp: f32,

    // the player's breath and the slur
    base_target: f32,
    glide_k: f32,
    tongue: u32,
    tongue_len: u32,
    tongue_amp: f32,
    overshoot: f32,
    wander: f32,
    wander_target: f32,
    dyn_lp: f32,
    dyn_lo: f32,
    dyn_hi: f32,
    rad_amt: f32,
    rad_x1: f32,
    steep: f32,
    /// Shock: how far (fraction of a period) the bore's wave can steepen at ff, and its state.
    shock: f32,
    shock_d: f32,
    shock_lvl: f32,
    jet_ratio: f32,
    /// The note's dynamic (0 pp … 1 ff): loudness and how open the bell is.
    dynv: f32,
    edge_lp: f32,
    dyn_lp2: f32,
    /// Two-pole bell (brass): a steeper soft-note roll-off.
    bell2: bool,
    edge_amt: f32,
    kick_phase: f32,
    /// Reed stiffness 0..1 (the raw control, for the forced swing).
    slope_n: f32,
    level: f32,
    pan: f32,
    gain: f32,
}

impl LyraVoice {
    pub fn new(sr: f32) -> Self {
        let mut v = LyraVoice {
            sr,
            model: 0,
            variant: 0,
            f0: 220.0,
            note: 57.0,
            vel: 0.8,
            released: true,
            t: 0,
            bend: 1.0,
            strings: [StringLoop::new(16), StringLoop::new(16), StringLoop::new(16)],
            nstr: 1,
            detune: [0.0; 3],
            t60: 1.0,
            exc: vec![0.0; EXC_MAX],
            exc_len: 0,
            exc_pos: 0,
            body: [Biquad::default(); MAX_BODY],
            body_g: [0.0; MAX_BODY],
            nbody: 0,
            direct: 1.0,
            hist: Delay::new(16),
            pk_taps: [1.0; 4],
            pk_w: [0.0; 4],
            npk: 0,
            d1: Delay::new(16),
            d2: Delay::new(16),
            last1: 0.0,
            last2: 0.0,
            base: 100.0,
            beta: 0.13,
            lp: 0.0,
            pole: 0.7,
            oz_x1: 0.0,
            lip: Biquad::default(),
            dc_x1: 0.0,
            dc_y1: 0.0,
            env: 0.0,
            env_up: 0.001,
            env_down: 0.001,
            max_drive: 0.1,
            slope: 3.0,
            noise_gain: 0.0,
            mute: [Biquad::default(); 2],
            nmute: 0,
            vib_phase: 0.0,
            vib_inc: 0.0,
            vib_depth: 0.0,
            vib_onset: 0,
            modes: [Mode::default(); 4],
            nmodes: 0,
            pk_off: 0.2,
            pk_amp: 0.5,
            pk_prev: 0.0,
            pk_lp: 0.0,
            pk_norm: 1.0,
            hp_a: 0.99,
            hp_x1: 0.0,
            hp_y1: 0.0,
            pedal: false,
            growl: 0.0,
            growl_lp: 0.0,
            base_target: 100.0,
            glide_k: 1.0,
            tongue: 0,
            tongue_len: 1,
            tongue_amp: 0.0,
            overshoot: 0.0,
            wander: 0.0,
            wander_target: 0.0,
            dyn_lp: 0.0,
            dyn_lo: 2000.0,
            dyn_hi: 9000.0,
            rad_amt: 0.0,
            rad_x1: 0.0,
            steep: 0.0,
            shock: 0.0,
            shock_d: 0.0,
            shock_lvl: 1e-3,
            jet_ratio: 0.32,
            dynv: 0.7,
            edge_lp: 0.0,
            dyn_lp2: 0.0,
            bell2: false,
            edge_amt: 1.2,
            kick_phase: 0.0,
            slope_n: 0.5,
            level: 0.0,
            pan: 0.0,
            gain: 1.0,
        };
        v.set_sample_rate(sr);
        v
    }

    /// Size every delay for the real rate. Engine construction only — this allocates.
    pub fn set_sample_rate(&mut self, sr: f32) {
        if (sr - self.sr).abs() < 1.0 && self.d1.buf.len() > 16 {
            return;
        }
        self.sr = sr;
        // 70 ms covers a guitar's low E and a piano's A0 (27.5 Hz = 36 ms); the trumpet's
        // doubled bore needs 2 × period of its lowest note.
        let n = (sr * 0.075) as usize + 8;
        for s in self.strings.iter_mut() {
            *s = StringLoop::new(n);
        }
        self.d1 = Delay::new(n);
        self.d2 = Delay::new(n);
        self.hist = Delay::new(n);
    }

    pub fn reset(&mut self) {
        for s in self.strings.iter_mut() {
            s.clear();
        }
        self.d1.clear();
        self.d2.clear();
        self.hist.clear();
        for b in self.body.iter_mut() {
            b.clear();
        }
        self.mute[0].clear();
        self.mute[1].clear();
        self.lip.clear();
        self.last1 = 0.0;
        self.last2 = 0.0;
        self.lp = 0.0;
        self.oz_x1 = 0.0;
        self.dc_x1 = 0.0;
        self.dc_y1 = 0.0;
        self.env = 0.0;
        self.level = 0.0;
        self.exc_pos = 0;
        self.exc_len = 0;
        self.nmodes = 0;
        self.pk_prev = 0.0;
        self.pk_lp = 0.0;
        self.hp_x1 = 0.0;
        self.hp_y1 = 0.0;
        self.dyn_lp = 0.0;
        self.dyn_lp2 = 0.0;
        self.edge_lp = 0.0;
        self.bell2 = false;
        self.edge_amt = 1.2;
        self.rad_x1 = 0.0;
        self.wander = 0.0;
        self.shock_d = 0.0;
        self.shock_lvl = 1e-3;
        self.tongue = 0;
        self.released = true;
    }

    pub fn is_sustained(&self) -> bool {
        sustained(self.model)
    }
    pub fn samples(&self) -> u32 {
        self.t
    }

    /// Settled and silent (or released and faded) — the voice can be freed.
    pub fn is_quiet(&self) -> bool {
        let struck = matches!(self.model, MODEL_GUITAR | MODEL_PIANO | MODEL_TINE | MODEL_PLUCK);
        let past_attack = self.t as f32 > self.sr * 0.05;
        if struck {
            return past_attack && self.level < 2.0e-5;
        }
        self.released && self.env < 1.0e-4 && self.level < 2.0e-5
    }

    fn set_body(&mut self, modes: &[(f32, f32, f32)], scale: f32, amount: f32) {
        self.nbody = modes.len().min(MAX_BODY);
        for (i, &(f, q, g)) in modes.iter().take(MAX_BODY).enumerate() {
            self.body[i] = Biquad::bandpass(f * scale, q, self.sr);
            self.body_g[i] = g * amount;
        }
    }

    #[inline]
    fn body_tick(&mut self, x: f32) -> f32 {
        let mut y = x * self.direct;
        for i in 0..self.nbody {
            y += self.body[i].tick(x) * self.body_g[i];
        }
        y
    }

    pub fn trigger(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        self.reset();
        self.released = false;
        self.t = 0;
        self.bend = 1.0;
        self.f0 = note_hz.clamp(20.0, self.sr * 0.25);
        self.note = 69.0 + 12.0 * (self.f0 / 440.0).log2();
        self.vel = velocity.clamp(0.0, 1.0);
        self.model = (p.get(LYRA_BASE + LY_MODEL).round() as i32).clamp(0, 10) as u32;
        self.variant = p.get(LYRA_BASE + LY_VARIANT).round().max(0.0) as u32;
        self.pedal = p01(p, LY_PEDAL) > 0.5;

        let vs = p01(p, LY_VEL_SENS);
        let v = lerp(0.7, self.vel, vs); // velocity response
        self.vel = v;
        self.dynv = v;
        self.vib_depth = p01(p, LY_VIB_DEPTH);
        self.vib_inc = TAU * lerp(3.0, 8.0, p01(p, LY_VIB_RATE)) / self.sr;
        self.vib_phase = 0.0;
        self.vib_onset = (p01(p, LY_VIB_DELAY) * self.sr) as u32;
        self.direct = 1.0;
        self.nbody = 0;
        self.nmute = 0;
        self.pan = 0.0;

        match self.model {
            MODEL_GUITAR => self.trigger_guitar(p, rng),
            MODEL_PIANO => self.trigger_piano(p, rng),
            MODEL_VIOLIN => self.trigger_violin(p),
            MODEL_SAX => self.trigger_sax(p),
            MODEL_TRUMPET => self.trigger_trumpet(p),
            MODEL_BRASS => self.trigger_brass(p),
            MODEL_PLUCK => self.trigger_pluck(p, rng),
            MODEL_FLUTE => self.trigger_flute(p),
            MODEL_CLARINET => self.trigger_clarinet(p),
            MODEL_REED => self.trigger_reed(p),
            _ => self.trigger_tine(p),
        }
        if sustained(self.model) {
            self.base = self.bore_len(self.f0);
            self.base_target = self.base;
            self.player(p, rng);
        }
    }

    /// The delay a bowed/blown model needs for a pitch (each model's own empirical offset).
    fn bore_len(&self, f0: f32) -> f32 {
        let sr = self.sr;
        match self.model {
            MODEL_VIOLIN => sr / f0 - 3.78,
            MODEL_SAX | MODEL_REED => sr / f0 - 2.5,
            MODEL_TRUMPET | MODEL_BRASS => sr / f0 - 1.0,
            // The jet delay sits in the loop too, so the bore is the rest of the period.
            // with the bore's lowpass and the one-sample feedback measured out exactly.
            MODEL_FLUTE => (sr / f0 - 1.0 - onepole_pd(self.pole, TAU * f0 / sr)) / (1.0 + self.jet_ratio),
            MODEL_CLARINET => sr / f0 * 0.5 - 1.5,
            _ => sr / f0,
        }
        .max(2.0)
    }

    /// What the player brings to every bowed/blown note: a tongued attack with a little pressure
    /// overshoot, the slow drift of a real breath, and the slur time.
    fn player(&mut self, p: &Params, rng: &mut Rng) {
        let sr = self.sr;
        let noise = p01(p, LY_NOISE);
        self.tongue_len = ((lerp(0.006, 0.02, noise) * sr) as u32).max(1);
        self.tongue = self.tongue_len;
        self.tongue_amp = match self.model {
            MODEL_VIOLIN => 0.0,
            MODEL_FLUTE => 0.6 + 0.6 * noise,
            _ => 0.35 + 0.4 * noise,
        } * self.vel;
        self.overshoot = if self.model == MODEL_VIOLIN { 0.0 } else { 0.18 + 0.25 * self.vel };
        self.wander = rng.bipolar() * 0.5;
        self.wander_target = rng.bipolar();
        self.set_glide(p);
    }

    fn set_glide(&mut self, p: &Params) {
        let glide_s = (p.get(P_GLIDE) * 2.0).clamp(0.0, 1.0) * 0.6 + 0.012;
        self.glide_k = 1.0 - (-1.0 / (glide_s * self.sr * 0.35)).exp();
    }

    /// Legato: the next note while this one still sounds. Bowed/blown models glide the bore or
    /// string to the new length without a new attack; struck and plucked ones replay.
    pub fn slur(&mut self, note_hz: f32, velocity: f32, p: &Params, rng: &mut Rng) {
        if !sustained(self.model) || self.released {
            self.trigger(note_hz, velocity, p, rng);
            return;
        }
        self.f0 = note_hz.clamp(20.0, self.sr * 0.25);
        self.note = 69.0 + 12.0 * (self.f0 / 440.0).log2();
        let v = lerp(0.7, velocity.clamp(0.0, 1.0), p01(p, LY_VEL_SENS));
        self.vel = v;
        self.dynv = v;
        self.base_target = self.bore_len(self.f0);
        self.set_glide(p);
        self.max_drive = match self.model {
            MODEL_VIOLIN => 0.03 + 0.2 * v,
            MODEL_FLUTE => 1.1 + 0.2 * v,
            MODEL_TRUMPET | MODEL_BRASS => 0.55 + 0.45 * v,
            _ => self.blow(p, v),
        };
    }

    /// Breath pressure for a reed model: the middle of the window where that reed speaks
    /// (measured — below it the reed won't start, above it the reed is held shut), which
    /// narrows and drops as the reed gets stiffer. Dynamics come from the player layer
    /// (loudness, bell, edge), not from pushing the reed out of its window.
    fn blow(&self, p: &Params, v: f32) -> f32 {
        let hard = p01(p, LY_EXCITE_HARD);
        let centre = match self.model {
            MODEL_SAX => lerp(0.8, 0.66, hard),
            MODEL_REED => lerp(1.12, 0.9, hard),
            MODEL_CLARINET => lerp(0.88, 0.63, hard),
            _ => 0.75,
        };
        centre * (0.96 + 0.08 * v)
    }

    fn trigger_guitar(&mut self, p: &Params, rng: &mut Rng) {
        let sr = self.sr;
        let f0 = self.f0;
        let nylon = self.variant == 1;
        let electric = self.variant >= 2; // 2 single coils, 3 humbuckers
        let bright = p01(p, LY_BRIGHTNESS);
        let decay = p01(p, LY_DECAY);
        let hard = p01(p, LY_EXCITE_HARD);
        let pos = p01(p, LY_EXCITE_POS);
        let mutep = p01(p, LY_DAMP);
        let period = sr / f0;

        let base_t60 = if nylon { 2.8 } else if electric { 5.5 } else { 4.5 };
        let mut t60 = (base_t60 * (82.4 / f0).powf(0.45)).clamp(0.35, 12.0) * lerp(0.3, 1.8, decay);
        t60 *= 1.0 - 0.92 * mutep;
        self.t60 = t60;
        let pitch_k = (196.0 / f0).sqrt().clamp(0.45, 1.6);
        let mut b = (0.04 + (1.0 - bright) * 0.42) * pitch_k + if nylon { 0.12 } else { 0.0 } + 0.3 * mutep;
        b = b.clamp(0.0, 0.9);
        let s = &mut self.strings[0];
        s.b = b;
        s.nap = if nylon { 0 } else { 1 };
        s.ap[0].a = -0.06;
        s.set_t60(t60, f0);
        s.tune(period);
        self.nstr = 1;

        // The pluck: one period of noise, comb-filtered at the pick position (the harmonics with
        // a node there go missing), then rounded off by the pick — softer pick, darker pluck.
        let len = (period.round() as usize).clamp(4, EXC_MAX);
        for i in 0..len {
            self.exc[i] = rng.bipolar();
        }
        let k = ((lerp(0.06, 0.36, pos) * period).round() as usize).clamp(1, len - 1);
        for i in (k..len).rev() {
            self.exc[i] -= self.exc[i - k];
        }
        let mut c = (0.18 + 0.78 * (hard * 0.6 + self.vel * 0.4)).clamp(0.05, 0.98);
        if nylon {
            c *= 0.55;
        }
        let mut y = 0.0;
        let mut rms = 0.0;
        for i in 0..len {
            y += c * (self.exc[i] - y);
            self.exc[i] = y;
            rms += y * y;
        }
        let norm = self.vel * 0.9 / (rms / len as f32).sqrt().max(1e-6);
        for i in 0..len {
            self.exc[i] *= norm;
        }
        self.exc_len = len;
        self.exc_pos = 0;

        let size = lerp(1.2, 0.82, p01(p, LY_BODY_SIZE));
        let amt = p01(p, LY_BODY);
        if electric {
            self.set_pickups(p, period, self.variant >= 3);
            self.direct = 1.0;
            self.gain = 0.2;
        } else if nylon {
            self.set_body(&[(96.0, 9.0, 1.1), (188.0, 14.0, 0.9), (285.0, 12.0, 0.5), (450.0, 10.0, 0.45), (1800.0, 1.4, 0.22)], size, amt);
            self.direct = 0.5;
            self.gain = 0.5;
        } else {
            self.set_body(&[(98.0, 9.0, 1.0), (204.0, 16.0, 0.85), (390.0, 13.0, 0.5), (580.0, 10.0, 0.38), (2400.0, 1.2, 0.28), (4500.0, 1.0, 0.12)], size, amt);
            self.direct = 0.55;
            self.gain = 0.5;
        }
        if !electric {
            self.npk = 0;
        }
    }

    /// The pickup selector. Each coil hears the string at its distance from the bridge; as a
    /// fraction of the vibrating length that point moves as the note is fretted higher, so the
    /// harmonics it misses (and the comb it puts on the tone) change up the neck. Two pickups
    /// on together sum in parallel — the hollow, quacky in-between sounds. A humbucker is two
    /// coils side by side: smoother and thicker, with fewer highs.
    fn set_pickups(&mut self, p: &Params, period: f32, humbucker: bool) {
        let sel = (p01(p, LY_PICKUP) * 4.0).round() as usize;
        // (mm from the bridge on a 648 mm scale, share)
        let coils: &[(f32, f32)] = if humbucker {
            match sel {
                0 | 1 => &[(140.0, 0.5), (158.0, 0.5)],
                2 => &[(140.0, 0.25), (158.0, 0.25), (38.0, 0.25), (56.0, 0.25)],
                _ => &[(38.0, 0.5), (56.0, 0.5)],
            }
        } else {
            match sel {
                0 => &[(160.0, 1.0)],
                1 => &[(160.0, 0.5), (100.0, 0.5)],
                2 => &[(100.0, 1.0)],
                3 => &[(100.0, 0.5), (41.0, 0.5)],
                _ => &[(41.0, 1.0)],
            }
        };
        // Fretted in the lowest position: on the highest open string at or below the note.
        let open = [64.0, 59.0, 55.0, 50.0, 45.0, 40.0].into_iter().find(|&o| self.note >= o - 0.01).unwrap_or(40.0);
        let len = 648.0 * 2f32.powf(-(self.note - open).max(0.0) / 12.0);
        self.npk = coils.len();
        for (i, &(d, w)) in coils.iter().enumerate() {
            self.pk_taps[i] = (d / len * period).max(1.0);
            self.pk_w[i] = w;
        }
    }

    fn trigger_piano(&mut self, p: &Params, rng: &mut Rng) {
        let sr = self.sr;
        let f0 = self.f0;
        let n = self.note;
        let upright = self.variant == 1;
        let bright = p01(p, LY_BRIGHTNESS);
        let decay = p01(p, LY_DECAY);
        let hard = p01(p, LY_EXCITE_HARD);
        let pos = p01(p, LY_EXCITE_POS);
        let period = sr / f0;

        self.nstr = if n < 34.0 { 1 } else if n < 46.0 { 2 } else { 3 };
        let d = 0.25 + p01(p, LY_DETUNE) * 2.2; // cents
        self.detune = match self.nstr {
            1 => [0.0, 0.0, 0.0],
            2 => [-d * 0.5, d * 0.5, 0.0],
            _ => [-d, 0.12, d * 0.85],
        };
        let mut t60 = (1.0 + 30.0 * (-(n - 21.0) / 22.0).exp()) * lerp(0.45, 1.8, decay);
        if upright {
            t60 *= 0.65;
        }
        self.t60 = t60;
        // Stiffness: thick bass strings and short treble strings are the most inharmonic.
        let stiff = if n < 60.0 { lerp(0.42, 0.12, ((n - 21.0) / 39.0).clamp(0.0, 1.0)) } else { lerp(0.12, 0.2, ((n - 60.0) / 48.0).clamp(0.0, 1.0)) };
        let b = ((0.05 + 0.32 * (1.0 - bright)) * (261.6 / f0).powf(0.3)).clamp(0.01, 0.8);
        for i in 0..self.nstr {
            let s = &mut self.strings[i];
            s.b = b;
            s.nap = 2;
            s.ap[0].a = -stiff;
            s.ap[1].a = -stiff;
            let fi = f0 * 2f32.powf(self.detune[i] / 1200.0);
            s.set_t60(t60, fi);
            s.tune(sr / fi);
        }

        // Hammer + soundboard: a half-sine force pulse (narrower = harder hammer, harder blow,
        // higher note) over a short decaying knock of the board, then the felt's lowpass. The
        // strike point sits near 1/8 of the string, so harmonics around the 8th are weak.
        let len = ((sr * 0.035) as usize).min(EXC_MAX);
        let width = (lerp(2.6, 0.55, (hard * 0.5 + self.vel * 0.5).clamp(0.0, 1.0)) * (261.6 / f0).powf(0.25)).clamp(0.25, 4.0) * 0.001 * sr;
        let knock = 0.1 + 0.35 * p01(p, LY_NOISE);
        for i in 0..len {
            let hp = if (i as f32) < width { (PI * i as f32 / width).sin() } else { 0.0 };
            let board = rng.bipolar() * (-(i as f32) / (sr * 0.007)).exp() * knock;
            self.exc[i] = hp + board;
        }
        let fc = (700.0 + 9500.0 * self.vel.powf(1.6) * lerp(0.5, 1.4, hard) * lerp(0.6, 1.3, bright)).min(sr * 0.45);
        let c = 1.0 - (-TAU * fc / sr).exp();
        let k = ((period * lerp(0.1, 0.16, pos)).round() as usize).max(1);
        let mut y = 0.0;
        for i in 0..len {
            y += c * (self.exc[i] - y);
            self.exc[i] = y;
        }
        for i in (k..len).rev() {
            self.exc[i] -= 0.45 * self.exc[i - k];
        }
        let amp = self.vel.powf(1.25) * 0.6 / self.nstr as f32;
        for i in 0..len {
            self.exc[i] *= amp;
        }
        self.exc_len = len;
        self.exc_pos = 0;

        let size = lerp(1.25, 0.85, p01(p, LY_BODY_SIZE));
        self.set_body(&[(110.0, 1.4, 0.45), (480.0, 1.2, 0.3), (1300.0, 1.1, 0.2), (2900.0, 1.0, 0.18)], size, p01(p, LY_BODY));
        self.direct = 0.8;
        self.gain = 1.1;
        self.pan = ((n - 64.0) / 44.0).clamp(-1.0, 1.0) * 0.7 * p01(p, LY_WIDTH);
    }

    fn trigger_violin(&mut self, p: &Params) {
        // STK Bowed: neck and bridge delays either side of the bow, a friction curve at the bow.
        let sr = self.sr;
        self.base = (sr / self.f0 - 4.0).max(4.0);
        self.beta = lerp(0.06, 0.3, p01(p, LY_EXCITE_POS));
        self.pole = 0.75 - 0.2 * 22050.0 / sr;
        let pressure = p01(p, LY_EXCITE_HARD);
        self.slope = 5.0 - 4.0 * pressure;
        self.max_drive = 0.03 + 0.2 * self.vel;
        self.env_up = 1.0 / (lerp(0.015, 0.6, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.04, 1.2, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.12;
        let size = lerp(1.15, 0.85, p01(p, LY_BODY_SIZE));
        let kind = self.string_kind();
        // Each body: the air mode A0, the main wood modes B1−/B1+, and the "bridge hill" — all
        // lower and broader as the instrument grows (Jansson; Bissinger's violin-octet data).
        let (body, gain) = STRING_BODIES[kind as usize];
        self.set_body(body, size, p01(p, LY_BODY));
        // Heavier strings need more bow weight and a slower bow to speak; the bass most of all.
        if kind >= 2 {
            self.max_drive *= if kind == 3 { 1.25 } else { 1.1 };
            self.env_up *= if kind == 3 { 0.6 } else { 0.8 };
        }
        self.direct = 0.25;
        self.gain = gain;
    }

    /// Violin, viola, cello or double bass — or, for the quartet, whichever one plays that register.
    fn string_kind(&self) -> u32 {
        match self.variant {
            4 => string_kind_for(self.note),
            v => v.min(3),
        }
    }

    fn trigger_brass(&mut self, p: &Params) {
        // The trumpet's forced lip valve and bore, rescaled for the rest of the section. What sets
        // them apart is the bore and bell: the flugelhorn's wide conical bore is mellow and barely
        // blares; the French horn's narrow bore ends in a bell facing away, with the player's hand
        // in it, so it's dark and veiled until ff, where it goes brassy (cuivré); the trombone's
        // long cylindrical bore steepens the wave most of all — the brassiest of the family; the
        // tuba is huge and dark.
        self.trigger_trumpet(p);
        let sr = self.sr;
        let bright = p01(p, LY_BRIGHTNESS);
        let drive = p01(p, LY_DRIVE).max(0.3);
        let b = &BRASS[self.variant.min(4) as usize];
        self.dyn_lo = (self.f0 * lerp(b.lo_k.0, b.lo_k.1, bright)).max(b.lo_min);
        self.dyn_hi = lerp(b.hi.0, b.hi.1, bright);
        self.edge_amt = b.edge;
        self.shock = lerp(b.shock.0, b.shock.1, drive);
        self.nmute = 2;
        self.mute = [Biquad::highpass(b.cut, 0.7, sr), Biquad::lowpass(b.air, 0.7, sr)];
        self.set_body(&b.formants, 1.0, p01(p, LY_BODY));
        self.direct = 1.0;
        self.gain = b.gain;
    }

    fn trigger_pluck(&mut self, p: &Params, rng: &mut Rng) {
        // Plucked strings on the guitar's string loop: what changes is the string (gut/nylon or
        // steel, single or paired courses), where and with what it's plucked, and the body —
        // a harp's soundboard, a mandolin's bowl, a banjo's drum head, a ukulele's little box,
        // a violin-family body under a pizzicato finger.
        let sr = self.sr;
        let f0 = self.f0;
        let period = sr / f0;
        let bright = p01(p, LY_BRIGHTNESS);
        let decay = p01(p, LY_DECAY);
        let hard = p01(p, LY_EXCITE_HARD);
        let pos = p01(p, LY_EXCITE_POS);
        let mutep = p01(p, LY_DAMP);
        let kind = self.variant.min(4);
        let k = &PLUCKS[kind as usize];
        let mut t60 = (k.ring * (82.4 / f0).powf(0.45)).clamp(0.15, 14.0) * lerp(0.3, 1.8, decay);
        t60 *= 1.0 - 0.92 * mutep;
        self.t60 = t60;
        let pitch_k = (196.0 / f0).sqrt().clamp(0.45, 1.6);
        let b = ((0.04 + (1.0 - bright) * 0.42) * pitch_k + k.soft + 0.3 * mutep).clamp(0.0, 0.9);
        let courses = k.courses;
        self.nstr = courses;
        for i in 0..courses {
            self.detune[i] = if courses == 1 { 0.0 } else { k.spread * (i as f32 - 0.5) * 2.0 + rng.bipolar() * 0.5 };
            let fi = f0 * 2f32.powf(self.detune[i] / 1200.0);
            let s = &mut self.strings[i];
            s.b = b;
            s.nap = if k.stiff != 0.0 { 1 } else { 0 };
            s.ap[0].a = k.stiff;
            s.set_t60(t60, fi);
            s.tune(sr / fi);
        }
        let len = (period.round() as usize).clamp(4, EXC_MAX);
        for i in 0..len {
            self.exc[i] = rng.bipolar();
        }
        let at = ((k.at * lerp(0.6, 1.4, pos) * period).round() as usize).clamp(1, len - 1);
        for i in (at..len).rev() {
            self.exc[i] -= self.exc[i - at];
        }
        let c = ((0.18 + 0.78 * (hard * 0.6 + self.vel * 0.4)) * k.finger).clamp(0.05, 0.98);
        let mut y = 0.0;
        let mut rms = 0.0;
        for i in 0..len {
            y += c * (self.exc[i] - y);
            self.exc[i] = y;
            rms += y * y;
        }
        let norm = self.vel * 0.9 / (rms / len as f32).sqrt().max(1e-6) / courses as f32;
        for i in 0..len {
            self.exc[i] *= norm;
        }
        self.exc_len = len;
        self.exc_pos = 0;
        let size = lerp(1.2, 0.82, p01(p, LY_BODY_SIZE));
        let (body, direct, gain) = if kind == 4 {
            // Pizzicato: the violin-family body that plays this register, with the bow off.
            (STRING_BODIES[string_kind_for(self.note) as usize].0, 0.3, 0.8)
        } else {
            (k.body, k.direct, k.gain)
        };
        self.set_body(body, size, p01(p, LY_BODY));
        self.direct = direct;
        self.gain = gain;
        if kind == 0 {
            self.pan = ((self.note - 64.0) / 44.0).clamp(-1.0, 1.0) * 0.4 * p01(p, LY_WIDTH);
        }
    }

    fn trigger_sax(&mut self, p: &Params) {
        // STK Saxofony: a conical bore approximated by two delays either side of the reed point,
        // with the player layer (tongue, breath drift, slur) and a bell that opens with dynamics.
        let sr = self.sr;
        self.beta = lerp(0.1, 0.4, p01(p, LY_EXCITE_POS));
        self.slope = lerp(0.2, 0.42, p01(p, LY_EXCITE_HARD));
        self.slope_n = p01(p, LY_EXCITE_HARD);
        self.lp = 0.0;
        self.max_drive = self.blow(p, self.vel);
        self.env_up = 1.0 / (lerp(0.01, 0.35, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.03, 0.8, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.3;
        self.growl = p01(p, LY_DRIVE);
        let bright = p01(p, LY_BRIGHTNESS);
        let tenor = self.variant == 1;
        let size = lerp(1.15, 0.85, p01(p, LY_BODY_SIZE));
        if tenor {
            self.set_body(&[(480.0, 2.5, 0.6), (1350.0, 2.5, 0.45), (2700.0, 2.0, 0.2)], size, p01(p, LY_BODY));
            self.dyn_lo = lerp(900.0, 1800.0, bright);
            self.dyn_hi = lerp(4500.0, 9000.0, bright);
        } else {
            self.set_body(&[(700.0, 2.5, 0.6), (1800.0, 2.5, 0.45), (3300.0, 2.0, 0.2)], size, p01(p, LY_BODY));
            self.dyn_lo = lerp(1200.0, 2400.0, bright);
            self.dyn_hi = lerp(5500.0, 11000.0, bright);
        }
        self.rad_amt = 0.55;
        self.direct = 0.7;
        self.gain = if tenor { 2.2 } else { 1.9 };
    }

    fn trigger_trumpet(&mut self, p: &Params) {
        // Lip-reed after STK Brass, with the lips driven at the played pitch (a forced valve)
        // instead of left to find a slot — the free-running valve hops partials. The bore is one
        // period long so its resonances sit on the harmonics; it shapes and feeds back the tone.
        // Loud playing steepens the wave as it travels the tube (pressure-dependent delay) — the
        // brassy blare — and the lips close more sharply, so ff is brighter, not just louder.
        let sr = self.sr;
        self.vib_phase = 0.0;
        self.slope = p01(p, LY_EXCITE_HARD); // lip tension; the snap is scaled by dynamics per sample
        self.lp = 0.0; // lip phase
        self.max_drive = 0.55 + 0.45 * self.vel;
        self.env_up = 1.0 / (lerp(0.008, 0.25, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.02, 0.6, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.04;
        self.steep = lerp(1.0, 3.5, p01(p, LY_DRIVE).max(0.3)) * (sr / 48000.0);
        self.shock = lerp(0.06, 0.18, p01(p, LY_DRIVE).max(0.3));
        let bright = p01(p, LY_BRIGHTNESS);
        self.nmute = 2;
        match self.variant {
            1 => self.mute = [Biquad::lowpass(1800.0, 0.8, sr), Biquad::highpass(220.0, 0.7, sr)],
            2 => self.mute = [Biquad::highpass(950.0, 1.2, sr), Biquad::lowpass(lerp(3000.0, 5000.0, bright), 3.0, sr)],
            3 => self.mute = [Biquad::highpass(520.0, 1.0, sr), Biquad::lowpass(lerp(3500.0, 6500.0, bright), 1.8, sr)],
            _ => self.mute = [Biquad::highpass(120.0, 0.7, sr), Biquad::lowpass(lerp(6000.0, 14000.0, bright), 0.7, sr)],
        }
        // Soft brass is nearly a pure tone; loud brass throws harmonics past 10 kHz. The bell's
        // soft-note corner tracks the note (about the 2nd harmonic), opening fully at ff.
        self.dyn_lo = (self.f0 * lerp(1.6, 2.6, bright)).max(350.0);
        self.dyn_hi = lerp(9000.0, 16000.0, bright);
        self.bell2 = true;
        self.edge_amt = 2.2;
        self.rad_amt = 0.45;
        // The trumpet's formant region sits around 1.2–1.5 kHz, with presence near 2.5 kHz.
        self.set_body(&[(1250.0, 1.4, 0.45), (2500.0, 1.8, 0.3)], 1.0, p01(p, LY_BODY));
        self.direct = 1.0;
        // Mutes cut the lows, so high notes come through hotter — level them across the range.
        let reg = (392.0 / self.f0).powf(0.6).clamp(0.4, 2.5);
        self.gain = match self.variant { 1 => 2.4, 2 => 4.0 * reg, 3 => 2.2 * reg, _ => 2.2 };
    }

    fn trigger_flute(&mut self, p: &Params) {
        // STK Flute: an air jet (its own short delay + the jet's cubic nonlinearity) driving the
        // bore. Variants: concert flute, piccolo, alto flute, tin whistle.
        let sr = self.sr;
        self.jet_ratio = lerp(0.22, 0.42, p01(p, LY_EXCITE_POS));
        self.pole = 0.7 - 0.1 * 22050.0 / sr;
        self.max_drive = 1.1 + 0.2 * self.vel;
        self.env_up = 1.0 / (lerp(0.012, 0.3, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.03, 0.6, p01(p, LY_DECAY)) * sr);
        let noise = p01(p, LY_NOISE);
        let bright = p01(p, LY_BRIGHTNESS);
        let (nz, lo, hi, gain) = match self.variant {
            1 => (0.06, 2600.0, 12000.0, 1.6), // piccolo
            2 => (0.08, 1100.0, 5500.0, 2.2),  // alto flute
            3 => (0.18, 2200.0, 12000.0, 1.6), // tin whistle
            _ => (0.05, 1800.0, 9000.0, 1.8),  // concert flute
        };
        self.noise_gain = nz + noise * 0.14;
        self.dyn_lo = lo * lerp(0.7, 1.3, bright);
        self.dyn_hi = hi * lerp(0.7, 1.3, bright);
        self.rad_amt = 0.25;
        self.set_body(&[(1000.0, 1.2, 0.2), (2600.0, 1.5, 0.15)], 1.0, p01(p, LY_BODY));
        self.direct = 1.0;
        self.gain = gain;
    }

    fn trigger_clarinet(&mut self, p: &Params) {
        // STK Clarinet: a cylinder closed at the reed — a half-period bore, odd harmonics in the
        // low (chalumeau) register — and a pressure-controlled reed table.
        let sr = self.sr;
        self.slope = lerp(0.2, 0.45, p01(p, LY_EXCITE_HARD));
        self.slope_n = p01(p, LY_EXCITE_HARD);
        self.lp = 0.0;
        self.max_drive = self.blow(p, self.vel);
        self.env_up = 1.0 / (lerp(0.01, 0.3, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.03, 0.6, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.25;
        let bright = p01(p, LY_BRIGHTNESS);
        let bass = self.variant == 1;
        if bass {
            self.set_body(&[(400.0, 2.0, 0.35), (1100.0, 2.0, 0.25)], 1.0, p01(p, LY_BODY));
            self.dyn_lo = lerp(700.0, 1300.0, bright);
            self.dyn_hi = lerp(3500.0, 7000.0, bright);
        } else {
            // The tone-hole lattice cuts off around 1.5 kHz: below it odd harmonics, above it all.
            self.set_body(&[(1500.0, 1.5, 0.35), (3000.0, 2.0, 0.2)], 1.0, p01(p, LY_BODY));
            self.dyn_lo = lerp(1300.0, 2400.0, bright);
            self.dyn_hi = lerp(6000.0, 12000.0, bright);
        }
        self.rad_amt = 0.5;
        self.direct = 0.85;
        self.gain = if bass { 4.0 } else { 3.5 };
    }

    fn trigger_reed(&mut self, p: &Params) {
        // Double reeds: the Saxofony structure with a narrower, stiffer reed and the strong formants
        // that make an oboe nasal and a bassoon woody. Variants: oboe, English horn, bassoon.
        let sr = self.sr;
        self.beta = lerp(0.18, 0.32, p01(p, LY_EXCITE_POS));
        self.slope = lerp(0.14, 0.3, p01(p, LY_EXCITE_HARD));
        self.slope_n = p01(p, LY_EXCITE_HARD);
        self.lp = 0.0;
        self.max_drive = self.blow(p, self.vel);
        self.env_up = 1.0 / (lerp(0.01, 0.3, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.03, 0.6, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.18;
        self.growl = p01(p, LY_DRIVE) * 0.4;
        let bright = p01(p, LY_BRIGHTNESS);
        let size = lerp(1.15, 0.85, p01(p, LY_BODY_SIZE));
        let amt = p01(p, LY_BODY);
        match self.variant {
            1 => {
                self.set_body(&[(750.0, 3.0, 0.7), (2200.0, 3.0, 0.4), (3400.0, 2.5, 0.2)], size, amt);
                self.gain = 2.8;
            }
            2 => {
                self.set_body(&[(440.0, 3.0, 0.75), (1150.0, 3.0, 0.45), (2600.0, 2.5, 0.2)], size, amt);
                self.gain = 3.0;
            }
            _ => {
                self.set_body(&[(1100.0, 3.5, 0.8), (2800.0, 3.0, 0.45), (3800.0, 2.5, 0.25)], size, amt);
                self.gain = 2.5;
            }
        }
        self.dyn_lo = lerp(1500.0, 2600.0, bright);
        self.dyn_hi = lerp(6000.0, 11000.0, bright);
        self.rad_amt = 0.5;
        self.direct = 0.45;
    }

    fn trigger_tine(&mut self, p: &Params) {
        let sr = self.sr;
        let f0 = self.f0;
        let n = self.note;
        let hard = p01(p, LY_EXCITE_HARD);
        let decay = p01(p, LY_DECAY);
        let bright = p01(p, LY_BRIGHTNESS);
        // Neoprene tips are softer in the bass. Contact 1–4.5 ms.
        // Treble hammers are harder, and contact never outlasts ~40% of the tine's period.
        let tau = (lerp(4.5, 1.0, (hard * 0.55 + self.vel * 0.45).clamp(0.0, 1.0)) * 0.001 * (261.6 / f0).powf(0.6)).min(0.4 / f0);
        let t60 = (0.9 + 12.0 * (-(n - 28.0) / 18.0).exp()) * lerp(0.4, 1.8, decay);
        self.t60 = t60;
        // Tine (cantilever beam modes 1 : 6.27 : 17.55) + its tuned tonebar a hair off, so the
        // pair beats slowly the way a real tine assembly does.
        let defs = [(1.0, t60, 1.0), (1.0006, t60 * 1.3, 0.35), (6.27, 0.32 * lerp(0.5, 1.5, bright), 0.55 * lerp(0.4, 1.4, bright)), (17.55, 0.05, 0.18 * bright)];
        self.nmodes = 0;
        for (ratio, t, a) in defs {
            let f = f0 * ratio;
            if f > sr * 0.45 {
                continue;
            }
            let i = self.nmodes;
            self.modes[i].set(f, t, a * hammer_weight(f, tau), sr);
            self.nmodes += 1;
        }
        // Pickup: tine displacement past a magnetic pole. Off-axis voicing (bark) vs. centred.
        self.pk_off = lerp(0.05, 0.55, p01(p, LY_EXCITE_POS));
        self.pk_amp = lerp(0.25, 1.15, self.vel);
        self.pk_norm = (261.6 / f0).powf(0.7);
        self.pk_prev = Self::flux(0.0, self.pk_off);
        // The pickup's flux shifts with the decaying swing — keep that slow drift (a thump) out.
        self.hp_a = (-TAU * f0 * 0.5 / sr).exp();
        self.pan = ((n - 64.0) / 44.0).clamp(-1.0, 1.0) * 0.35 * p01(p, LY_WIDTH);
        self.gain = 8.0;
    }

    #[inline]
    fn flux(x: f32, off: f32) -> f32 {
        let d = x - off;
        1.0 / (d * d + 0.12).sqrt()
    }

    pub fn release(&mut self, p: &Params) {
        if self.released {
            return;
        }
        self.released = true;
        let decay = p01(p, LY_DECAY);
        match self.model {
            MODEL_GUITAR => {
                let t = lerp(0.07, 0.6, decay);
                self.strings[0].set_t60(t, self.f0);
            }
            MODEL_PLUCK => {
                // A harpist lets the string ring and damps it by hand later; the others stop it.
                let t = if self.variant == 0 { lerp(0.5, 3.0, decay) } else { lerp(0.07, 0.6, decay) };
                for i in 0..self.nstr {
                    let fi = self.f0 * 2f32.powf(self.detune[i] / 1200.0);
                    self.strings[i].set_t60(t, fi);
                }
            }
            MODEL_PIANO => {
                // The damper lands — unless the pedal is down or it's the undamped top octave+.
                if !self.pedal && self.note < 89.0 {
                    let t = lerp(0.1, 0.4, decay);
                    for i in 0..self.nstr {
                        let fi = self.f0 * 2f32.powf(self.detune[i] / 1200.0);
                        self.strings[i].set_t60(t, fi);
                    }
                }
            }
            MODEL_TINE => {
                if !self.pedal {
                    let t = lerp(0.08, 0.3, decay);
                    for m in self.modes[..self.nmodes].iter_mut() {
                        m.set_t60(t, self.sr);
                    }
                }
            }
            _ => {}
        }
    }

    #[inline]
    fn vibrato(&mut self, mod_wheel: f32) -> f32 {
        if self.t < self.vib_onset {
            return 0.0;
        }
        self.vib_phase += self.vib_inc;
        if self.vib_phase > TAU {
            self.vib_phase -= TAU;
        }
        // Vibrato blooms in over 300 ms after its onset, like a player's.
        let bloom = ((self.t - self.vib_onset) as f32 / (self.sr * 0.3)).min(1.0);
        self.vib_phase.sin() * (self.vib_depth + mod_wheel * 0.6).min(1.0) * bloom
    }

    #[inline]
    fn envelope(&mut self) {
        if self.released {
            self.env = (self.env - self.env_down).max(0.0);
        } else {
            self.env = (self.env + self.env_up).min(1.0);
        }
    }

    /// The player's breath (or bow) this sample: the envelope with a tongued attack and a little
    /// pressure overshoot, plus a slow wander. Returns (pressure, pitch drift ratio).
    #[inline]
    fn breath(&mut self, rng: &mut Rng) -> (f32, f32) {
        self.envelope();
        // Slow drift: a new random target every ~85 ms, slewed — no held note is perfectly still.
        if self.t % 4096 == 0 {
            self.wander_target = rng.bipolar();
        }
        self.wander += (self.wander_target - self.wander) * (4.0 / self.sr);
        let attack_t = self.t as f32 / self.sr;
        let over = 1.0 + self.overshoot * (-attack_t / 0.04).exp();
        let mut p = self.env * self.max_drive * over * (1.0 + 0.035 * self.wander);
        p += p * self.noise_gain * rng.bipolar();
        // The tongue releases the reed in time with the note: a push at the fundamental for the
        // first few periods sets the reed swinging in the right register (a bare noise burst can
        // just as easily start the octave — the crack).
        let periods = attack_t * self.f0;
        if periods < 6.0 && self.model != MODEL_VIOLIN {
            self.kick_phase += self.f0 / self.sr;
            if self.kick_phase >= 1.0 {
                self.kick_phase -= 1.0;
            }
            p += KICK * self.max_drive * (1.0 - periods / 6.0) * (TAU * self.kick_phase).sin();
        }
        if self.tongue > 0 {
            // The tongue leaving the reed (or the lips, or the flute's edge): a short burst of air.
            let k = self.tongue as f32 / self.tongue_len as f32;
            p += self.tongue_amp * k * k * rng.bipolar() * self.max_drive;
            self.tongue -= 1;
        }
        (p, 1.0 + 0.0017 * self.wander)
    }

    /// pp → ff is about 18 dB: the physics saturates, so the player's dynamic sets the level.
    #[inline]
    fn loudness(d: f32) -> f32 {
        0.12 + 0.88 * d.clamp(0.0, 1.0).powf(1.6)
    }

    /// Slur toward the target bore length.
    #[inline]
    fn glide(&mut self) -> f32 {
        self.base += (self.base_target - self.base) * self.glide_k;
        self.base
    }

    /// Nonlinear propagation down a long brass bore: the high-pressure crest travels faster than
    /// the trough, so each cycle's rising edge steepens toward a shock — the blare of ff brass
    /// (Hirschberg et al. 1996). A read point that moves with the pressure, never allowed to run
    /// backwards (the wave can't overturn).
    #[inline]
    fn shock_wave(&mut self, x: f32, dynamic: f32) -> f32 {
        let a = x.abs();
        self.shock_lvl = if a > self.shock_lvl { a } else { (self.shock_lvl * 0.9995).max(1e-3) };
        let period = self.sr / self.f0;
        let reach = self.shock * period * dynamic * dynamic;
        let d0 = reach + 2.0;
        let target = d0 - reach * (x / self.shock_lvl).clamp(-1.0, 1.0);
        let d = if self.t == 0 { target } else { target.min(self.shock_d + 0.95) };
        self.shock_d = d;
        self.hist.write(x);
        self.hist.read(d.max(1.0))
    }

    /// The bell: radiation favours the highs, and a soft note is darker than a loud one.
    #[inline]
    fn bell(&mut self, x: f32, dynamic: f32) -> f32 {
        let fc = lerp(self.dyn_lo, self.dyn_hi, dynamic.clamp(0.0, 1.0));
        let c = (TAU * fc / self.sr).min(0.95);
        self.dyn_lp += c * (x - self.dyn_lp);
        let y = if self.bell2 {
            self.dyn_lp2 += c * (self.dyn_lp - self.dyn_lp2);
            self.dyn_lp2
        } else {
            self.dyn_lp
        };
        // Forte edge: the upper harmonics a hard-blown horn throws out (above ~1.8 kHz).
        self.edge_lp += (TAU * 1800.0 / self.sr).min(0.95) * (y - self.edge_lp);
        let d = dynamic.clamp(0.0, 1.0);
        let y = y + self.edge_amt * d * d * (y - self.edge_lp);
        let r = y - self.rad_amt * self.rad_x1;
        self.rad_x1 = y;
        r
    }

    /// One stereo sample.
    #[inline]
    pub fn render_sample(&mut self, bend_ratio: f32, mod_wheel: f32, rng: &mut Rng) -> (f32, f32) {
        let bend = bend_ratio.clamp(0.25, 4.0);
        let y = match self.model {
            MODEL_GUITAR | MODEL_PIANO | MODEL_PLUCK => {
                if (bend - self.bend).abs() > 1e-4 {
                    self.bend = bend;
                    for i in 0..self.nstr {
                        let fi = self.f0 * bend * 2f32.powf(self.detune[i] / 1200.0);
                        self.strings[i].tune(self.sr / fi);
                    }
                }
                let x = if self.exc_pos < self.exc_len {
                    let e = self.exc[self.exc_pos];
                    self.exc_pos += 1;
                    e
                } else {
                    0.0
                };
                let mut s = 0.0;
                for i in 0..self.nstr {
                    s += self.strings[i].tick(x);
                }
                let s = if self.npk > 0 {
                    // Electric: each pickup hears the string at one point — a comb on the output.
                    self.hist.write(s);
                    let mut c = 0.0;
                    for i in 0..self.npk {
                        c += self.pk_w[i] * self.hist.read(self.pk_taps[i]);
                    }
                    s - 0.85 * c
                } else {
                    s
                };
                let knock = if self.model == MODEL_PIANO && self.exc_pos < self.exc_len { x * 0.25 } else { 0.0 };
                self.body_tick(s) + knock
            }
            MODEL_VIOLIN => {
                let (_, drift) = self.breath(rng);
                let vib = self.vibrato(mod_wheel);
                let base = self.glide() / bend * drift;
                let neck_len = (base * (1.0 - self.beta) * (1.0 + 0.008 * vib)).max(1.0);
                let bridge_len = (base * self.beta).max(1.0);
                let bow = self.env * self.max_drive * (1.0 + self.noise_gain * rng.bipolar());
                self.lp = (1.0 - self.pole) * self.last2 + self.pole * self.lp;
                let bridge_refl = -self.lp * 0.95;
                let nut_refl = -self.last1;
                let string_vel = bridge_refl + nut_refl;
                let dv = bow - string_vel;
                let new_vel = if self.env > 0.0 { dv * ((dv * self.slope + 0.001).abs() + 0.75).powi(-4).min(1.0) } else { 0.0 };
                self.last1 = self.d1.process(bridge_refl + new_vel, neck_len);
                self.last2 = self.d2.process(nut_refl + new_vel, bridge_len);
                self.body_tick(self.last2) * Self::loudness(self.dynv).sqrt()
            }
            MODEL_SAX | MODEL_REED => {
                let (mut breath, drift) = self.breath(rng);
                let vib = self.vibrato(mod_wheel);
                let base = (self.glide() / bend) * drift * (1.0 + 0.002 * vib);
                breath += breath * 0.08 * vib;
                let oz = 0.5 * (self.last1 + self.oz_x1);
                self.oz_x1 = self.last1;
                let temp = -0.95 * oz;
                let out = temp - self.last2;
                let pd = breath - out;
                // The reed beats at the note (partly forced, like the trumpet's lips), which locks
                // the register; the reed curve keeps its give-and-take with the bore. Soft, the reed
                // never shuts — round tone. Loud, it slams shut every cycle — the bright, buzzy
                // beating-reed sound.
                self.lp += self.f0 * bend * (1.0 + 0.002 * vib) / (self.sr * drift);
                if self.lp >= 1.0 {
                    self.lp -= 1.0;
                }
                let d = self.dynv * self.env;
                let swing = lerp(0.55, 1.7, d) * lerp(0.8, 1.2, self.slope_n);
                let h = 1.0 + swing * (TAU * self.lp).sin();
                let open = (h.max(0.0) / (1.0 + swing)).powf(0.8);
                let table = (0.7 + self.slope * pd).clamp(-1.0, 1.0);
                let reed = lerp(table, 1.0 - open, REED_FORCE);
                self.last2 = self.d2.process(temp, (self.beta * base).max(1.0));
                self.last1 = self.d1.process(breath - pd * reed - temp, ((1.0 - self.beta) * base).max(1.0));
                let mut y = out * 0.3;
                if self.growl > 0.0 {
                    // Growl: humming into the horn — a rough low-frequency AM and a little grit.
                    self.growl_lp += 0.02 * (rng.bipolar() - self.growl_lp);
                    y *= 1.0 + self.growl * 2.5 * self.growl_lp;
                    y = (y * (1.0 + self.growl * 3.0)).tanh() / (1.0 + self.growl * 1.5);
                }
                let d = self.dynv * self.env;
                let y = self.bell(y, d) * Self::loudness(d);
                self.body_tick(y)
            }
            MODEL_TRUMPET | MODEL_BRASS => {
                let (breath, drift) = self.breath(rng);
                let vib = self.vibrato(mod_wheel);
                // The lips settle onto the note: a quick scoop up from ~35 cents flat.
                let scoop = 1.0 - 0.02 * (-(self.t as f32) / (self.sr * 0.035)).exp();
                self.lp += self.f0 * bend * scoop * (1.0 + 0.004 * vib) / (self.sr * drift);
                if self.lp >= 1.0 {
                    self.lp -= 1.0;
                }
                let _ = breath;
                let dynamic = self.dynv * self.env;
                // Soft: round, nearly sinusoidal lip motion. Loud and tense: a short, sharp opening.
                // Soft, the lips never quite close — a round, nearly sinusoidal buzz. Loud, they slap
                // shut every cycle and open in a short, sharp puff.
                let swing = lerp(0.45, 2.6, dynamic * dynamic) * lerp(0.85, 1.15, self.slope);
                let h = (1.0 + swing * (TAU * self.lp).sin()).max(0.0) / (1.0 + swing);
                let k = lerp(1.0, 8.0, (dynamic * dynamic * 0.7 + self.slope * 0.3).clamp(0.0, 1.0));
                let open = h.powf(k);
                let mouth = 0.3 * breath;
                let bore = 0.85 * self.last1;
                let y = open * mouth + (1.0 - open) * bore;
                let dc = y - self.dc_x1 + 0.995 * self.dc_y1;
                self.dc_x1 = y;
                self.dc_y1 = dc;
                // Wave steepening: high pressure travels faster down the tube.
                let steep = self.steep * dynamic * dynamic * self.last1.clamp(-1.0, 1.0);
                let len = (self.glide() / bend * drift - steep).max(1.0);
                self.last1 = self.d1.process(dc, len);
                let mut o = (self.last1 * 1.6).tanh() / 1.6;
                if self.shock > 0.0 {
                    o = self.shock_wave(o, dynamic);
                }
                for i in 0..self.nmute {
                    o = self.mute[i].tick(o);
                }
                let o = self.bell(o, dynamic) * Self::loudness(dynamic);
                self.body_tick(o)
            }
            MODEL_FLUTE => {
                let (breath, drift) = self.breath(rng);
                let vib = self.vibrato(mod_wheel);
                let base = self.glide() / bend * drift * (1.0 + 0.002 * vib);
                let breath = breath * (1.0 + 0.05 * vib);
                self.lp = (1.0 - self.pole) * self.last1 + self.pole * self.lp;
                let refl = -self.lp;
                let dc = refl - self.dc_x1 + 0.995 * self.dc_y1;
                self.dc_x1 = refl;
                self.dc_y1 = dc;
                let pd = breath - 0.5 * dc;
                let jet = self.d2.process(pd, (base * self.jet_ratio).max(1.0));
                let jt = (jet * (jet * jet - 1.0)).clamp(-1.0, 1.0);
                self.last1 = self.d1.process(jt + 0.5 * dc, base.max(1.0));
                let d = self.dynv * self.env;
                let y = self.bell(0.3 * self.last1, d) * Self::loudness(d);
                self.body_tick(y)
            }
            MODEL_CLARINET => {
                let (mut breath, drift) = self.breath(rng);
                let vib = self.vibrato(mod_wheel);
                let base = self.glide() / bend * drift * (1.0 + 0.002 * vib);
                breath += breath * 0.06 * vib;
                let oz = 0.5 * (self.last1 + self.oz_x1);
                self.oz_x1 = self.last1;
                let pd = -0.95 * oz - breath;
                // Partly forced at the note, as for the sax: no squeaks into the twelfth up high.
                self.lp += self.f0 * bend * (1.0 + 0.002 * vib) / (self.sr * drift);
                if self.lp >= 1.0 {
                    self.lp -= 1.0;
                }
                let d = self.dynv * self.env;
                let swing = lerp(0.55, 1.6, d) * lerp(0.8, 1.2, self.slope_n);
                let open = ((1.0 + swing * (TAU * self.lp).sin()).max(0.0) / (1.0 + swing)).powf(0.8);
                let reed = lerp((0.7 - self.slope * pd).clamp(-1.0, 1.0), 1.0 - open, REED_FORCE);
                self.last1 = self.d1.process(breath + pd * reed, base.max(1.0));
                let d = self.dynv * self.env;
                let y = self.bell(self.last1 * 0.5, d) * Self::loudness(d);
                self.body_tick(y)
            }
            _ => {
                let mut x = 0.0;
                for m in self.modes[..self.nmodes].iter_mut() {
                    x += m.tick();
                }
                let fl = Self::flux(x * self.pk_amp * 0.5, self.pk_off);
                let d = (fl - self.pk_prev) * self.pk_norm;
                self.pk_prev = fl;
                self.pk_lp += 0.55 * (d - self.pk_lp);
                let hp = self.hp_a * (self.hp_y1 + self.pk_lp - self.hp_x1);
                self.hp_x1 = self.pk_lp;
                self.hp_y1 = hp;
                hp
            }
        };
        self.t = self.t.saturating_add(1);
        let y = y * self.gain;
        let a = y.abs();
        self.level = if a > self.level { a } else { self.level * 0.9995 };
        if self.pan == 0.0 {
            (y, y)
        } else {
            let l = (0.5 * (1.0 - self.pan)).sqrt() * std::f32::consts::SQRT_2;
            let r = (0.5 * (1.0 + self.pan)).sqrt() * std::f32::consts::SQRT_2;
            (y * l, y * r)
        }
    }
}

// ── the rack: the amp stages that belong after the voices ──────────────────────────────────────

/// One amp's circuit. The tone-stack parts are the real component values of the passive
/// bass/mid/treble network those amps share (Yeh & Smith, "Discretization of the '59 Fender
/// Bassman tone stack", DAFx 2006) — so the knobs interact the way an amp's do.
struct AmpModel {
    stages: usize,
    /// First-stage gain at Drive 0 and 1 (geometric in between).
    gain: (f32, f32),
    /// Gain into each later stage.
    stage_gain: f32,
    /// Coupling-cap high-pass and Miller low-pass corners per stage (Hz).
    hp: [f32; 4],
    lp: [f32; 4],
    /// C1, C2, C3 (F); R1 treble, R2 bass, R3 mid, R4 slope (Ω).
    stack: [f64; 7],
    /// Bright cap: a treble lift (dB) that fades as Drive comes up, like one across a volume pot.
    bright: f32,
    sag: f32,
    /// Power-stage asymmetry (class A / cathode bias: even harmonics).
    asym: f32,
    level: f32,
}

/// American clean (blackface/tweed), British crunch (plexi/JCM), chime (top-boost class A),
/// modern high gain (cascaded, tight).
static AMPS: [AmpModel; 4] = [
    AmpModel { stages: 2, gain: (1.0, 14.0), stage_gain: 1.6, hp: [20.0, 30.0, 0.0, 0.0], lp: [14000.0, 10000.0, 0.0, 0.0], stack: [250e-12, 20e-9, 20e-9, 250e3, 1e6, 25e3, 56e3], bright: 5.0, sag: 0.15, asym: 0.0, level: 1.0 },
    AmpModel { stages: 3, gain: (2.0, 45.0), stage_gain: 3.0, hp: [30.0, 70.0, 110.0, 0.0], lp: [11000.0, 8500.0, 7000.0, 0.0], stack: [470e-12, 22e-9, 22e-9, 220e3, 1e6, 25e3, 33e3], bright: 3.0, sag: 0.3, asym: 0.05, level: 0.8 },
    AmpModel { stages: 2, gain: (1.6, 28.0), stage_gain: 2.5, hp: [25.0, 55.0, 0.0, 0.0], lp: [15000.0, 11000.0, 0.0, 0.0], stack: [470e-12, 47e-9, 22e-9, 1e6, 1e6, 10e3, 100e3], bright: 2.0, sag: 0.55, asym: 0.18, level: 0.9 },
    AmpModel { stages: 4, gain: (5.0, 120.0), stage_gain: 5.0, hp: [40.0, 160.0, 180.0, 60.0], lp: [9000.0, 7000.0, 6500.0, 7000.0], stack: [470e-12, 22e-9, 22e-9, 220e3, 1e6, 25e3, 33e3], bright: 0.0, sag: 0.2, asym: 0.03, level: 0.7 },
];

/// Speaker cabinets as filter cascades (0 high-pass, 1 low-pass, 2 peak): cone resonance, the
/// box, cone break-up peaks and dips, and the 12" speaker's steep fall above ~5 kHz.
/// 1×12 open back, 2×12 alnico open back, 4×12 closed back, 1×10 small combo.
static CABS: [[(u8, f32, f32, f32); 7]; 4] = [
    [(0, 70.0, 0.7, 0.0), (2, 110.0, 1.5, 4.0), (2, 2300.0, 1.2, 3.0), (2, 4200.0, 2.0, -6.0), (1, 5200.0, 0.9, 0.0), (1, 7000.0, 0.6, 0.0), (2, 600.0, 1.0, -1.5)],
    [(0, 80.0, 0.7, 0.0), (2, 120.0, 1.4, 3.0), (2, 1100.0, 1.0, 2.0), (2, 2600.0, 1.6, 5.0), (2, 3800.0, 2.5, -5.0), (1, 5500.0, 1.0, 0.0), (1, 7500.0, 0.7, 0.0)],
    [(0, 55.0, 0.9, 0.0), (2, 95.0, 1.3, 6.0), (2, 400.0, 1.0, -3.0), (2, 1900.0, 1.3, 4.0), (2, 3400.0, 2.0, 2.0), (1, 4800.0, 1.1, 0.0), (1, 6500.0, 0.7, 0.0)],
    [(0, 110.0, 0.8, 0.0), (2, 160.0, 1.4, 3.0), (2, 700.0, 1.0, 3.0), (2, 2800.0, 1.3, 4.0), (1, 5500.0, 1.0, 0.0), (1, 7500.0, 0.7, 0.0), (2, 1400.0, 1.5, -2.0)],
];

const OS: usize = 4;

/// The passive 3-knob tone stack as a third-order filter (bilinear, run in f64: its poles sit
/// close to z = 1 at the oversampled rate).
#[derive(Clone, Copy, Default)]
struct ToneStack {
    b: [f64; 4],
    a: [f64; 4],
    z: [f64; 3],
}
impl ToneStack {
    fn design(c: &[f64; 7], treble: f64, mid: f64, bass: f64, fs: f64) -> Self {
        let (c1, c2, c3, r1, r2, r3, r4) = (c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
        let (t, m, l) = (treble, mid, bass);
        let b1 = t * c1 * r1 + m * c3 * r3 + l * (c1 * r2 + c2 * r2) + (c1 * r3 + c2 * r3);
        let b2 = t * (c1 * c2 * r1 * r4 + c1 * c3 * r1 * r4) - m * m * (c1 * c3 * r3 * r3 + c2 * c3 * r3 * r3)
            + m * (c1 * c3 * r1 * r3 + c1 * c3 * r3 * r3 + c2 * c3 * r3 * r3)
            + l * (c1 * c2 * r1 * r2 + c1 * c2 * r2 * r4 + c1 * c3 * r2 * r4)
            + l * m * (c1 * c3 * r2 * r3 + c2 * c3 * r2 * r3)
            + (c1 * c2 * r1 * r3 + c1 * c2 * r3 * r4 + c1 * c3 * r3 * r4);
        let b3 = l * m * (c1 * c2 * c3 * r1 * r2 * r3 + c1 * c2 * c3 * r2 * r3 * r4) - m * m * (c1 * c2 * c3 * r1 * r3 * r3 + c1 * c2 * c3 * r3 * r3 * r4)
            + m * (c1 * c2 * c3 * r1 * r3 * r3 + c1 * c2 * c3 * r3 * r3 * r4)
            + t * c1 * c2 * c3 * r1 * r3 * r4
            - t * m * c1 * c2 * c3 * r1 * r3 * r4
            + t * l * c1 * c2 * c3 * r1 * r2 * r4;
        let a0 = 1.0;
        let a1 = (c1 * r1 + c1 * r3 + c2 * r3 + c2 * r4 + c3 * r4) + m * c3 * r3 + l * (c1 * r2 + c2 * r2);
        let a2 = m * (c1 * c3 * r1 * r3 - c2 * c3 * r3 * r4 + c1 * c3 * r3 * r3 + c2 * c3 * r3 * r3)
            + l * m * (c1 * c3 * r2 * r3 + c2 * c3 * r2 * r3)
            - m * m * (c1 * c3 * r3 * r3 + c2 * c3 * r3 * r3)
            + l * (c1 * c2 * r2 * r4 + c1 * c2 * r1 * r2 + c1 * c3 * r2 * r4 + c2 * c3 * r2 * r4)
            + (c1 * c2 * r1 * r4 + c1 * c3 * r1 * r4 + c1 * c2 * r3 * r4 + c1 * c2 * r1 * r3 + c1 * c3 * r3 * r4 + c2 * c3 * r3 * r4);
        let a3 = l * m * (c1 * c2 * c3 * r1 * r2 * r3 + c1 * c2 * c3 * r2 * r3 * r4) - m * m * (c1 * c2 * c3 * r1 * r3 * r3 + c1 * c2 * c3 * r3 * r3 * r4)
            + m * (c1 * c2 * c3 * r3 * r3 * r4 + c1 * c2 * c3 * r1 * r3 * r3 - c1 * c2 * c3 * r1 * r3 * r4)
            + l * c1 * c2 * c3 * r1 * r2 * r4
            + c1 * c2 * c3 * r1 * r3 * r4;
        let k = 2.0 * fs;
        let (k2, k3) = (k * k, k * k * k);
        let bb = [-b1 * k - b2 * k2 - b3 * k3, -b1 * k + b2 * k2 + 3.0 * b3 * k3, b1 * k + b2 * k2 - 3.0 * b3 * k3, b1 * k - b2 * k2 + b3 * k3];
        let aa = [-a0 - a1 * k - a2 * k2 - a3 * k3, -3.0 * a0 - a1 * k + a2 * k2 + 3.0 * a3 * k3, -3.0 * a0 + a1 * k + a2 * k2 - 3.0 * a3 * k3, -a0 + a1 * k - a2 * k2 + a3 * k3];
        let n = aa[0];
        ToneStack { b: [bb[0] / n, bb[1] / n, bb[2] / n, bb[3] / n], a: [1.0, aa[1] / n, aa[2] / n, aa[3] / n], z: [0.0; 3] }
    }
    #[inline]
    fn tick(&mut self, x: f32) -> f32 {
        let x = x as f64;
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[1] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[2] * y + self.z[2];
        self.z[2] = self.b[3] * x - self.a[3] * y;
        y as f32
    }
    /// |H| at f Hz (sample rate fs).
    fn mag(&self, f: f64, fs: f64) -> f64 {
        let w = std::f64::consts::TAU * f / fs;
        let (mut nr, mut ni, mut dr, mut di) = (0.0, 0.0, 0.0, 0.0);
        for k in 0..4 {
            let (c, s) = ((w * k as f64).cos(), -(w * k as f64).sin());
            nr += self.b[k] * c;
            ni += self.b[k] * s;
            dr += self.a[k] * c;
            di += self.a[k] * s;
        }
        ((nr * nr + ni * ni) / (dr * dr + di * di)).sqrt()
    }
}

/// A triode gain stage: soft on the way up, a long, softer slope into cutoff the other way —
/// the asymmetry that makes tube overdrive sing in even harmonics.
#[inline]
fn triode(x: f32) -> f32 {
    if x >= 0.0 {
        x.tanh()
    } else {
        (x * 0.6).tanh() / 0.6
    }
}

/// Linear-interpolated read `d` samples back from write index `w` in a power-of-two buffer.
#[inline]
fn tap(buf: &[f32], w: usize, d: f32) -> f32 {
    let mask = buf.len() - 1;
    let d = d.clamp(1.0, (mask - 2) as f32);
    let i = d.floor();
    let fr = d - i;
    let i = i as usize;
    let a = buf[(w + 2 * (mask + 1) - i) & mask];
    let b = buf[(w + 2 * (mask + 1) - i - 1) & mask];
    a + (b - a) * fr
}

/// An electric guitar's rig (pickup → compressor → overdrive → preamp → tone stack → power amp
/// with sag → cab and mic → tremolo → chorus → tape echo), or the tine piano's preamp + stereo
/// tremolo (the suitcase's tremolo is in the amp, so it pans the whole chord together — which
/// is why it's here and not per voice).
pub struct LyraRack {
    sr: f32,
    trem: f32,
    hp: [Biquad; 2],
    tone: [Biquad; 2],
    cab_lo: [Biquad; 2],
    cab_hi: [Biquad; 2],
    built_for: [u16; 11],
    // guitar
    pickup_res: Biquad,
    pickup_gain: f32,
    comp_env: f32,
    up: [Biquad; 2],
    down: [Biquad; 2],
    od_hp: Biquad,
    od_lp: f32,
    bright: Biquad,
    st_hp: [Biquad; 4],
    st_lp: [Biquad; 4],
    stack: ToneStack,
    stack_norm: f32,
    sag_env: f32,
    cab: [Biquad; 8],
    chorus: Vec<f32>,
    ch_w: usize,
    ch_phase: f32,
    echo: Vec<f32>,
    ec_w: usize,
    ec_time: f32,
    ec_lp: f32,
    ec_hp: Biquad,
    ec_phase: f32,
}

impl LyraRack {
    /// Engine construction only — this allocates the chorus and echo lines.
    pub fn new(sr: f32) -> Self {
        LyraRack {
            sr,
            trem: 0.0,
            hp: [Biquad::default(); 2],
            tone: [Biquad::default(); 2],
            cab_lo: [Biquad::default(); 2],
            cab_hi: [Biquad::default(); 2],
            built_for: [u16::MAX; 11],
            pickup_res: Biquad::default(),
            pickup_gain: 1.0,
            comp_env: 0.0,
            up: [Biquad::default(); 2],
            down: [Biquad::default(); 2],
            od_hp: Biquad::default(),
            od_lp: 0.0,
            bright: Biquad::default(),
            st_hp: [Biquad::default(); 4],
            st_lp: [Biquad::default(); 4],
            stack: ToneStack::default(),
            stack_norm: 1.0,
            sag_env: 0.0,
            cab: [Biquad::default(); 8],
            chorus: vec![0.0; ((sr * 0.03) as usize).next_power_of_two().max(1024)],
            ch_w: 0,
            ch_phase: 0.0,
            echo: vec![0.0; ((sr * 1.3) as usize).next_power_of_two().max(4096)],
            ec_w: 0,
            ec_time: sr * 0.3,
            ec_lp: 0.0,
            ec_hp: Biquad::default(),
            ec_phase: 0.0,
        }
    }

    pub fn active(p: &Params) -> bool {
        if p.get(LYRA_BASE + LY_ENABLE) <= 0.5 {
            return false;
        }
        let m = p.get(LYRA_BASE + LY_MODEL).round() as u32;
        (m == MODEL_GUITAR && p.get(LYRA_BASE + LY_VARIANT).round() as u32 >= 2) || m == MODEL_TINE
    }

    fn amp_index(p: &Params) -> usize {
        (p.get(LYRA_BASE + LY_AMP).round().max(0.0) as usize).min(AMPS.len() - 1)
    }
    fn cab_index(p: &Params) -> usize {
        (p.get(LYRA_BASE + LY_CAB).round().max(0.0) as usize).min(CABS.len() - 1)
    }

    fn build(&mut self, p: &Params, tine: bool) {
        let q = |id: u32| (p01(p, id) * 1000.0) as u16;
        let key = [
            tine as u16,
            p.get(LYRA_BASE + LY_VARIANT).round().max(0.0) as u16,
            q(LY_TONE),
            Self::amp_index(p) as u16,
            q(LY_BASS),
            q(LY_MID),
            q(LY_TREBLE),
            Self::cab_index(p) as u16,
            q(LY_BODY),
            q(LY_DRIVE),
            q(LY_PICKUP),
        ];
        if key == self.built_for {
            return;
        }
        let fresh = self.built_for[0] != key[0] || self.built_for[3] != key[3];
        self.built_for = key;
        let sr = self.sr;
        let tone = p01(p, LY_TONE);
        if tine {
            for c in 0..2 {
                self.hp[c] = Biquad::highpass(45.0, 0.7, sr);
                self.tone[c] = Biquad::lowpass(lerp(2500.0, 9000.0, tone), 0.7, sr);
                self.cab_lo[c] = Biquad::bandpass(180.0, 0.9, sr);
                self.cab_hi[c] = Biquad::bandpass(1600.0, 1.0, sr);
            }
            return;
        }
        // The pickup's coil and the guitar's tone pot: a resonant low-pass. Single coils peak
        // high and sharp (~5 kHz); humbuckers lower and broader. Turning the tone knob down
        // pulls the peak down and flattens it.
        let humbucker = p.get(LYRA_BASE + LY_VARIANT).round() as u32 >= 3;
        let tk = tone.powf(1.2);
        let res = if humbucker { Biquad::lowpass(lerp(1100.0, 3100.0, tk), lerp(0.7, 1.9, tone), sr) } else { Biquad::lowpass(lerp(1500.0, 5000.0, tk), lerp(0.7, 2.4, tone), sr) };
        self.pickup_res = Biquad { z1: self.pickup_res.z1, z2: self.pickup_res.z2, ..res };
        // A pickup puts out a few hundred millivolts: a clean amp stays clean until it is pushed.
        self.pickup_gain = if humbucker { 0.55 } else { 0.35 };
        let fs = sr * OS as f32;
        let amp = &AMPS[Self::amp_index(p)];
        let keep = |old: Biquad, new: Biquad| if fresh { new } else { Biquad { z1: old.z1, z2: old.z2, ..new } };
        self.up = [keep(self.up[0], Biquad::lowpass(sr * 0.42, 0.541, fs)), keep(self.up[1], Biquad::lowpass(sr * 0.42, 1.307, fs))];
        self.down = [keep(self.down[0], Biquad::lowpass(sr * 0.42, 0.541, fs)), keep(self.down[1], Biquad::lowpass(sr * 0.42, 1.307, fs))];
        self.od_hp = keep(self.od_hp, Biquad::highpass(720.0, 0.7, fs));
        let drive = p01(p, LY_DRIVE);
        self.bright = keep(self.bright, Biquad::highshelf(1800.0, amp.bright * (1.0 - drive), fs));
        for s in 0..amp.stages {
            self.st_hp[s] = keep(self.st_hp[s], Biquad::highpass(amp.hp[s], 0.7, fs));
            self.st_lp[s] = keep(self.st_lp[s], Biquad::lowpass(amp.lp[s], 0.6, fs));
        }
        // Pot tapers: bass and treble are audio-taper, mid is linear.
        let taper = |x: f32| (((x * 3.4).exp() - 1.0) / (3.4f32.exp() - 1.0)) as f64;
        let mut st = ToneStack::design(&amp.stack, taper(p01(p, LY_TREBLE)), p01(p, LY_MID) as f64, taper(p01(p, LY_BASS)), fs as f64);
        if !fresh {
            st.z = self.stack.z;
        }
        self.stack = st;
        // Level the stack at its own noon settings, so the knobs still cut and boost around it.
        let noon = ToneStack::design(&amp.stack, taper(0.5), 0.5, taper(0.5), fs as f64);
        self.stack_norm = (1.0 / noon.mag(800.0, fs as f64).max(1e-3)) as f32;
        let cab = &CABS[Self::cab_index(p)];
        for (i, &(kind, f, qq, db)) in cab.iter().enumerate() {
            let b = match kind {
                0 => Biquad::highpass(f, qq, sr),
                1 => Biquad::lowpass(f, qq, sr),
                _ => Biquad::peak(f, qq, db, sr),
            };
            self.cab[i] = keep(self.cab[i], b);
        }
        // The mic: on the cone's centre is bright and present; toward the edge it darkens.
        self.cab[7] = keep(self.cab[7], Biquad::highshelf(2500.0, lerp(-7.0, 3.0, p01(p, LY_BODY)), sr));
        self.ec_hp = keep(self.ec_hp, Biquad::highpass(180.0, 0.7, sr));
    }

    pub fn process(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params) {
        let tine = p.get(LYRA_BASE + LY_MODEL).round() as u32 == MODEL_TINE;
        self.build(p, tine);
        if tine {
            self.process_tine(out, frames, nch, p);
        } else {
            self.process_guitar(out, frames, nch, p);
        }
    }

    fn process_tine(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params) {
        let drive = p01(p, LY_DRIVE);
        let depth = p01(p, LY_TREM_DEPTH);
        let rate = lerp(1.5, 9.0, p01(p, LY_TREM_RATE));
        let inc = TAU * rate / self.sr;
        let pre = 1.0 + drive * 5.0;
        let makeup = 1.0 / (1.0 + drive * 1.8);
        let cab = p01(p, LY_BODY);
        let chans = nch.min(2);
        for f in 0..frames {
            self.trem += inc;
            if self.trem > TAU {
                self.trem -= TAU;
            }
            let s = self.trem.sin();
            for c in 0..chans {
                let mut x = self.hp[c].tick(out[c][f]);
                x = (x * pre).tanh() * makeup;
                let t = self.tone[c].tick(x);
                let y = t + cab * (0.6 * self.cab_lo[c].tick(t) + 0.45 * self.cab_hi[c].tick(t));
                // Stereo tremolo: the two sides swap, like the suitcase's two power amps.
                let g = if chans == 2 { 1.0 - depth * 0.5 * (1.0 + if c == 0 { s } else { -s }) } else { 1.0 - depth * 0.5 * (1.0 + s) };
                out[c][f] = y * g;
            }
        }
    }

    fn process_guitar(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params) {
        let sr = self.sr;
        let fs = sr * OS as f32;
        let amp = &AMPS[Self::amp_index(p)];
        let drive = p01(p, LY_DRIVE);
        let g_in = amp.gain.0 * (amp.gain.1 / amp.gain.0).powf(drive);
        let master = p01(p, LY_MASTER);
        let power_g = lerp(0.4, 5.0, master * master);
        let power_makeup = 1.0 / (power_g * 0.8).tanh();
        let sag_att = 1.0 - (-1.0 / (0.004 * fs)).exp();
        let sag_rel = 1.0 - (-1.0 / (0.15 * fs)).exp();
        // Compressor: a pedal that evens the picking out and stretches the sustain.
        let comp = p01(p, LY_COMP);
        let thr = lerp(0.25, 0.03, comp);
        let ratio = lerp(2.0, 10.0, comp);
        let comp_makeup = (0.25 / thr).powf(1.0 - 1.0 / ratio) * 0.8;
        let c_att = 1.0 - (-1.0 / (0.003 * sr)).exp();
        let c_rel = 1.0 - (-1.0 / (0.18 * sr)).exp();
        // Overdrive pedal: the mids clip through diodes, the lows bypass them, a tone control after.
        let od = p01(p, LY_OD);
        let od_g = lerp(2.0, 120.0, od * od);
        let od_c = 1.0 - (-TAU * lerp(2200.0, 4500.0, p01(p, LY_TONE)) / fs).exp();
        let depth = p01(p, LY_TREM_DEPTH);
        let trem_inc = TAU * lerp(1.5, 9.0, p01(p, LY_TREM_RATE)) / sr;
        let ch = p01(p, LY_CHORUS);
        let ch_inc = TAU * lerp(0.35, 1.2, ch) / sr;
        let echo = p01(p, LY_ECHO);
        let ec_target = lerp(0.08, 0.9, p01(p, LY_ECHO_TIME)) * sr;
        let ec_fb = 0.15 + 0.5 * echo;
        let ec_c = 1.0 - (-TAU * 2800.0 / sr).exp();
        let chans = nch.min(2);
        for f in 0..frames {
            let x_in = if chans == 2 { 0.5 * (out[0][f] + out[1][f]) } else { out[0][f] };
            let mut x = self.pickup_res.tick(x_in) * self.pickup_gain;
            if comp > 0.0 {
                let a = x.abs();
                self.comp_env += (if a > self.comp_env { c_att } else { c_rel }) * (a - self.comp_env);
                let e = self.comp_env.max(1e-6);
                let g = if e > thr { (e / thr).powf(1.0 / ratio - 1.0) } else { 1.0 };
                x = lerp(x, x * g * comp_makeup, comp.sqrt());
            }
            let mut y = 0.0;
            for k in 0..OS {
                let u = if k == 0 { x * OS as f32 } else { 0.0 };
                let u = self.up[0].tick(u);
                let mut v = self.up[1].tick(u);
                if od > 0.0 {
                    let hp = self.od_hp.tick(v);
                    v += 0.6 * (od_g * hp / 0.6).tanh();
                    self.od_lp += od_c * (v - self.od_lp);
                    v = self.od_lp * lerp(1.0, 0.7, od);
                }
                v = self.bright.tick(v) * g_in;
                for s in 0..amp.stages {
                    v = self.st_hp[s].tick(v);
                    if s > 0 {
                        v *= amp.stage_gain;
                    }
                    v = self.st_lp[s].tick(triode(v));
                }
                v = self.stack.tick(v) * self.stack_norm;
                // Power amp: push-pull output tubes; the supply sags under a hard chord, which
                // squeezes the headroom — the bloom and give of a tube amp turned up.
                let vs = 1.0 - amp.sag * self.sag_env.min(1.0) * 0.6;
                let pv = v * power_g;
                let o = vs * ((pv + amp.asym) / vs).tanh() - vs * (amp.asym / vs).tanh();
                let a = o.abs();
                self.sag_env += (if a > self.sag_env { sag_att } else { sag_rel }) * (a - self.sag_env);
                let d = self.down[0].tick(o * power_makeup);
                let d = self.down[1].tick(d);
                if k == OS - 1 {
                    y = d;
                }
            }
            y *= amp.level * 0.5;
            for b in self.cab.iter_mut() {
                y = b.tick(y);
            }
            if depth > 0.0 {
                self.trem += trem_inc;
                if self.trem > TAU {
                    self.trem -= TAU;
                }
                // The amp's tremolo: a little squarer than a sine, as an optical/bias tremolo is.
                let s = (self.trem.sin() * 1.6).tanh() / 1.6f32.tanh();
                y *= 1.0 - depth * 0.5 * (1.0 + s);
            }
            let (mut l, mut r) = (y, y);
            if ch > 0.0 {
                self.chorus[self.ch_w] = y;
                self.ch_phase += ch_inc;
                if self.ch_phase > TAU {
                    self.ch_phase -= TAU;
                }
                let (base, dep) = (0.007 * sr, lerp(0.0015, 0.0035, ch) * sr);
                let tl = tap(&self.chorus, self.ch_w, base + dep * self.ch_phase.sin());
                let tr = tap(&self.chorus, self.ch_w, base + dep * self.ch_phase.cos());
                self.ch_w = (self.ch_w + 1) & (self.chorus.len() - 1);
                let g = 1.0 / (1.0 + 0.45 * ch);
                l = (y + 0.8 * ch * tl) * g;
                r = (y + 0.8 * ch * tr) * g;
            }
            if echo > 0.0 {
                // Tape echo: the delay time eases to a new setting (the pitch bends, as a tape
                // machine's does), the repeats darken and thin, and the tape wobbles a little.
                self.ec_time += 0.0004 * (ec_target - self.ec_time);
                self.ec_phase += TAU * 0.4 / sr;
                if self.ec_phase > TAU {
                    self.ec_phase -= TAU;
                }
                let e = tap(&self.echo, self.ec_w, self.ec_time * (1.0 + 0.0015 * self.ec_phase.sin()));
                self.ec_lp += ec_c * (e - self.ec_lp);
                let fb = self.ec_hp.tick(self.ec_lp);
                let w = self.ec_w;
                self.echo[w] = (0.5 * (l + r) + ec_fb * fb).tanh();
                self.ec_w = (w + 1) & (self.echo.len() - 1);
                l += 0.45 * echo * self.ec_lp;
                r += 0.45 * echo * self.ec_lp;
            }
            if chans == 2 {
                out[0][f] = l;
                out[1][f] = r;
            } else {
                out[0][f] = 0.5 * (l + r);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(model: u32, variant: u32) -> Params {
        let mut p = Params::new();
        p.set(LYRA_BASE + LY_ENABLE, 1.0);
        p.set(LYRA_BASE + LY_MODEL, model as f32);
        p.set(LYRA_BASE + LY_VARIANT, variant as f32);
        p
    }

    /// Render `secs` of a note held for `hold` seconds.
    fn render(model: u32, variant: u32, midi: f32, vel: f32, secs: f32, hold: f32) -> Vec<f32> {
        let sr = 48000.0;
        let p = params(model, variant);
        let mut v = LyraVoice::new(sr);
        let mut rng = Rng(12345);
        v.trigger(440.0 * 2f32.powf((midi - 69.0) / 12.0), vel, &p, &mut rng);
        let n = (secs * sr) as usize;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            if i == (hold * sr) as usize {
                v.release(&p);
            }
            out.push(v.render_sample(1.0, 0.0, &mut rng).0);
        }
        out
    }

    /// Fundamental by normalised autocorrelation, refined parabolically.
    pub(super) fn pitch(x: &[f32], sr: f32, lo: f32, hi: f32) -> f32 {
        let min_lag = (sr / hi) as usize;
        let max_lag = (sr / lo) as usize;
        let n = x.len() - max_lag - 2;
        let mut best = 0usize;
        let mut best_v = f32::MIN;
        let mut vals = vec![0.0f32; max_lag + 2];
        for lag in min_lag..=max_lag + 1 {
            let mut s = 0.0;
            let mut e1 = 0.0;
            let mut e2 = 0.0;
            for i in 0..n {
                s += x[i] * x[i + lag];
                e1 += x[i] * x[i];
                e2 += x[i + lag] * x[i + lag];
            }
            vals[lag] = s / (e1 * e2).sqrt().max(1e-12);
        }
        // first strong peak (avoid octave errors from preferring longer lags)
        let global = (min_lag..=max_lag).map(|l| vals[l]).fold(f32::MIN, f32::max);
        for lag in min_lag + 1..=max_lag {
            if vals[lag] > vals[lag - 1] && vals[lag] >= vals[lag + 1] && vals[lag] > 0.9 * global {
                best = lag;
                best_v = vals[lag];
                break;
            }
        }
        let _ = best_v;
        let (a, b, c) = (vals[best - 1], vals[best], vals[best + 1]);
        let shift = 0.5 * (a - c) / (a - 2.0 * b + c);
        sr / (best as f32 + shift)
    }

    fn cents(f: f32, target: f32) -> f32 {
        1200.0 * (f / target).log2()
    }

    fn peak(x: &[f32]) -> f32 {
        x.iter().fold(0.0f32, |m, v| m.max(v.abs()))
    }

    #[test]
    fn every_model_is_stable_and_audible() {
        for (m, vars) in [(0u32, 3u32), (1, 2), (2, 1), (3, 2), (4, 4), (5, 1), (6, 4), (7, 2), (8, 3)] {
            for var in 0..vars {
                for midi in [40.0, 55.0, 64.0, 72.0, 84.0] {
                    let x = render(m, var, midi, 0.85, 1.2, 0.8);
                    assert!(x.iter().all(|v| v.is_finite()), "model {m}/{var} @{midi} not finite");
                    let pk = peak(&x);
                    assert!(pk > 0.02, "model {m}/{var} @{midi} too quiet ({pk})");
                    assert!(pk < 1.6, "model {m}/{var} @{midi} too loud ({pk})");
                }
            }
        }
    }

    #[test]
    fn string_models_play_in_tune() {
        let sr = 48000.0;
        for (m, var, notes) in [(0u32, 0u32, [40.0, 52.0, 64.0, 76.0]), (0, 1, [45.0, 57.0, 64.0, 69.0]), (1, 0, [36.0, 48.0, 60.0, 72.0]), (5, 0, [41.0, 53.0, 65.0, 77.0])] {
            for midi in notes {
                let x = render(m, var, midi, 0.7, 0.7, 0.7);
                let target = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
                let f = pitch(&x[(0.15 * sr) as usize..(0.55 * sr) as usize], sr, target * 0.7, target * 1.4);
                let c = cents(f, target);
                assert!(c.abs() < 8.0, "model {m}/{var} midi {midi}: {f:.2} Hz is {c:.1} cents off");
            }
        }
    }

    #[test]
    fn bowed_and_blown_models_speak_on_pitch() {
        let sr = 48000.0;
        for (m, notes) in [(2u32, [55.0, 62.0, 69.0, 76.0]), (3, [49.0, 56.0, 61.0, 68.0]), (4, [55.0, 60.0, 65.0, 70.0]), (6, [62.0, 69.0, 76.0, 81.0]), (7, [52.0, 58.0, 64.0, 70.0]), (8, [60.0, 65.0, 70.0, 74.0])] {
            for midi in notes {
                let x = render(m, 0, midi, 0.8, 1.0, 1.0);
                let target = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
                let f = pitch(&x[(0.45 * sr) as usize..(0.85 * sr) as usize], sr, target * 0.7, target * 1.4);
                let c = cents(f, target);
                eprintln!("model {m} midi {midi}: {f:.2} Hz ({c:+.1} c), peak {:.3}", peak(&x));
                assert!(c.abs() < 25.0, "model {m} midi {midi}: {f:.2} Hz is {c:.1} cents off");
            }
        }
    }

    /// Each section instrument across its own register: (model, variant, notes).
    const SECTION: [(u32, u32, [f32; 4]); 17] = [
        (2, 0, [55.0, 64.0, 76.0, 88.0]), // violin
        (2, 1, [48.0, 57.0, 69.0, 81.0]), // viola
        (2, 2, [36.0, 45.0, 57.0, 69.0]), // cello
        (2, 3, [28.0, 36.0, 45.0, 55.0]), // double bass
        (2, 4, [40.0, 52.0, 64.0, 76.0]), // quartet
        (9, 0, [58.0, 65.0, 72.0, 79.0]), // flugelhorn
        (9, 1, [41.0, 50.0, 60.0, 72.0]), // French horn
        (9, 2, [40.0, 48.0, 58.0, 67.0]), // trombone
        (9, 3, [31.0, 38.0, 48.0, 58.0]), // bass trombone
        (9, 4, [28.0, 34.0, 41.0, 50.0]), // tuba
        (10, 0, [24.0, 43.0, 67.0, 91.0]), // harp
        (10, 1, [55.0, 67.0, 79.0, 88.0]), // mandolin
        (10, 2, [50.0, 62.0, 74.0, 81.0]), // banjo
        (10, 3, [60.0, 67.0, 76.0, 81.0]), // ukulele
        (10, 4, [36.0, 50.0, 64.0, 79.0]), // pizzicato
        (8, 2, [34.0, 41.0, 50.0, 62.0]), // bassoon
        (7, 1, [38.0, 46.0, 55.0, 65.0]), // bass clarinet
    ];

    #[test]
    fn section_instruments_speak_on_pitch_at_a_sane_level() {
        let sr = 48000.0;
        for (m, var, notes) in SECTION {
            for midi in notes {
                let x = render(m, var, midi, 0.8, 1.0, 1.0);
                assert!(x.iter().all(|v| v.is_finite()), "{m}/{var} @{midi} not finite");
                let target = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
                let (a, b) = if sustained(m) { (0.45, 0.85) } else { (0.12, 0.5) };
                let f = pitch(&x[(a * sr) as usize..(b * sr) as usize], sr, target * 0.7, target * 1.4);
                let c = cents(f, target);
                let pk = peak(&x);
                eprintln!("{m}/{var} midi {midi}: {f:.2} Hz ({c:+.1} c), peak {pk:.3}");
                assert!(c.abs() < 25.0, "{m}/{var} midi {midi}: {f:.2} Hz is {c:.1} cents off");
                assert!(pk > 0.05 && pk < 1.6, "{m}/{var} @{midi} level {pk}");
            }
        }
    }

    #[test]
    fn brass_section_gets_brassier_as_it_gets_louder() {
        let sr = 48000.0;
        for (var, midi) in [(0u32, 65.0f32), (1, 53.0), (2, 53.0), (3, 41.0), (4, 34.0)] {
            let f = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
            let c = |v: f32| {
                let x = render(9, var, midi, v, 1.0, 1.0);
                let seg = &x[(0.45 * sr) as usize..(0.9 * sr) as usize];
                let (mut num, mut den) = (0.0, 0.0);
                for h in 1..12 {
                    let a = harmonic(seg, sr, f * h as f32);
                    num += a * h as f32;
                    den += a;
                }
                num / den
            };
            let (soft, loud) = (c(0.15), c(1.0));
            eprintln!("brass {var}: centroid {soft:.2} -> {loud:.2}");
            assert!(loud > soft * 1.4, "brass {var} should open up at ff: {soft} -> {loud}");
        }
    }

    /// An E5 power chord, picked twice, through the electric guitar's voices and the rig.
    fn rig(set: &[(u32, f32)]) -> (Vec<f32>, f32) {
        use crate::engine::MAX_BLOCK;
        use crate::spatial::MAX_CHANNELS;
        let sr = 48000.0;
        let mut p = params(MODEL_GUITAR, 2);
        for &(id, v) in set {
            p.set(LYRA_BASE + id, v);
        }
        let mut rng = Rng(7);
        let mut voices: Vec<LyraVoice> = (0..3).map(|_| LyraVoice::new(sr)).collect();
        let mut rack = LyraRack::new(sr);
        let mut out = Box::new([[0.0f32; MAX_BLOCK]; MAX_CHANNELS]);
        let mut y = Vec::new();
        let mut in_peak = 0.0f32;
        let n = (1.6 * sr) as usize;
        let mut pos = 0;
        while pos < n {
            for (k, at) in [0usize, (0.8 * sr) as usize].iter().enumerate() {
                if *at >= pos && *at < pos + 128 {
                    for (i, m) in [40.0f32, 47.0, 52.0].iter().enumerate() {
                        voices[i].trigger(440.0 * 2f32.powf((m - 69.0) / 12.0), 0.9 - 0.1 * k as f32, &p, &mut rng);
                    }
                }
            }
            for c in 0..2 {
                out[c][..128].fill(0.0);
            }
            for f in 0..128 {
                let mut s = 0.0;
                for v in voices.iter_mut() {
                    s += v.render_sample(1.0, 0.0, &mut rng).0;
                }
                in_peak = in_peak.max(s.abs());
                out[0][f] = s;
                out[1][f] = s;
            }
            rack.process(&mut out, 128, 2, &p);
            y.extend_from_slice(&out[0][..128]);
            pos += 128;
        }
        (y, in_peak)
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    #[test]
    fn tone_stack_is_passive_and_its_knobs_work() {
        let fs = 192000.0;
        for amp in AMPS.iter() {
            let d = |t: f64, m: f64, b: f64| ToneStack::design(&amp.stack, t, m, b, fs);
            for &(t, m, b) in &[(0.0, 0.0, 0.0), (1.0, 1.0, 1.0), (0.5, 0.5, 0.5), (1.0, 0.0, 1.0), (0.0, 1.0, 0.0)] {
                for f in [30.0, 100.0, 400.0, 1000.0, 3000.0, 8000.0] {
                    assert!(d(t, m, b).mag(f, fs) < 1.05, "passive network can't gain: {t}/{m}/{b} @{f}");
                }
            }
            let db = |a: f64, b: f64| 20.0 * (a / b).log10();
            let bass = db(d(0.5, 0.5, 1.0).mag(70.0, fs), d(0.5, 0.5, 0.0).mag(70.0, fs));
            let mid = db(d(0.5, 1.0, 0.5).mag(500.0, fs), d(0.5, 0.0, 0.5).mag(500.0, fs));
            let treble = db(d(1.0, 0.5, 0.5).mag(5000.0, fs), d(0.0, 0.5, 0.5).mag(5000.0, fs));
            eprintln!("stack: bass {bass:.1} dB, mid {mid:.1} dB, treble {treble:.1} dB");
            assert!(bass > 6.0 && mid > 1.0 && treble > 6.0, "knob range {bass} {mid} {treble}");
        }
    }

    #[test]
    fn every_amp_is_stable_level_matched_and_distorts_with_drive() {
        let mut levels = Vec::new();
        for amp in 0..4 {
            let mut prev = 0.0;
            for drive in [0.0f32, 0.5, 1.0] {
                let (y, inp) = rig(&[(LY_AMP, amp as f32), (LY_CAB, [0.0, 1.0, 2.0, 2.0][amp]), (LY_DRIVE, drive)]);
                assert!(y.iter().all(|v| v.is_finite()), "amp {amp} drive {drive}: not finite");
                let seg = &y[(0.1 * 48000.0) as usize..(0.75 * 48000.0) as usize];
                // Crest factor falls as the amp clips: a distorted chord is denser, flatter.
                let crest = peak(seg) / rms(seg).max(1e-9);
                eprintln!("amp {amp} drive {drive}: in peak {inp:.3}, out rms {:.3} peak {:.3} crest {crest:.2}", rms(seg), peak(seg));
                assert!(peak(&y) < 1.5, "amp {amp} drive {drive} too hot");
                if drive > 0.0 {
                    assert!(crest < prev + 0.2, "amp {amp}: drive should compress ({prev} -> {crest})");
                }
                prev = crest;
                if drive == 0.5 {
                    levels.push(rms(seg));
                }
            }
        }
        let (lo, hi) = (levels.iter().cloned().fold(9.0, f32::min), levels.iter().cloned().fold(0.0, f32::max));
        assert!(20.0 * (hi / lo).log10() < 8.0, "amps should sit within 8 dB of each other: {levels:?}");
        // Pedals, cabs and pickups: all stable.
        for set in [
            vec![(LY_OD, 0.8), (LY_AMP, 1.0)],
            vec![(LY_COMP, 0.9), (LY_CHORUS, 0.7), (LY_ECHO, 0.8), (LY_ECHO_TIME, 0.3)],
            vec![(LY_CAB, 3.0), (LY_BODY, 0.0), (LY_TREM_DEPTH, 0.8)],
            vec![(LY_VARIANT, 3.0), (LY_PICKUP, 0.5), (LY_AMP, 3.0), (LY_DRIVE, 1.0), (LY_MASTER, 1.0)],
        ] {
            let (y, _) = rig(&set);
            assert!(y.iter().all(|v| v.is_finite()) && peak(&y) < 1.5 && peak(&y) > 0.01, "{set:?}: peak {}", peak(&y));
        }
    }

    #[test]
    fn sustained_models_stop_after_release_and_struck_models_ring_out() {
        let sr = 48000.0;
        for m in [2u32, 3, 4, 6, 7, 8] {
            let x = render(m, 0, 62.0, 0.8, 2.6, 0.6);
            let tail = peak(&x[(2.3 * sr) as usize..]);
            assert!(tail < 0.002, "model {m} still sounding after release ({tail})");
        }
        // A piano note held long keeps ringing; released, the damper stops it.
        let held = render(1, 0, 60.0, 0.8, 2.0, 2.0);
        let damped = render(1, 0, 60.0, 0.8, 2.0, 0.3);
        assert!(peak(&held[(1.6 * sr) as usize..]) > 10.0 * peak(&damped[(1.6 * sr) as usize..]));
    }

    #[test]
    fn velocity_brightens_the_piano_and_barks_the_tine() {
        // Brightness proxy: energy of the first difference relative to the signal.
        let bright = |x: &[f32]| {
            let d: f32 = x.windows(2).map(|w| (w[1] - w[0]).powi(2)).sum();
            let e: f32 = x.iter().map(|v| v * v).sum();
            d / e.max(1e-12)
        };
        let sr = 48000.0;
        for m in [1u32, 5] {
            let soft = render(m, 0, 60.0, 0.25, 0.4, 0.4);
            let hard = render(m, 0, 60.0, 1.0, 0.4, 0.4);
            let (s, h) = (bright(&soft[..(0.2 * sr) as usize]), bright(&hard[..(0.2 * sr) as usize]));
            assert!(h > s * 1.15, "model {m}: hard {h} not brighter than soft {s}");
        }
    }

    /// Amplitude of harmonic h by Goertzel over the steady part.
    fn harmonic(x: &[f32], sr: f32, f: f32) -> f32 {
        let w = TAU * f / sr;
        let c = 2.0 * w.cos();
        let (mut s1, mut s2) = (0.0f32, 0.0f32);
        for (i, &v) in x.iter().enumerate() {
            let win = 0.5 - 0.5 * (TAU * i as f32 / x.len() as f32).cos();
            let s0 = v * win + c * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        (s1 * s1 + s2 * s2 - c * s1 * s2).sqrt()
    }

    #[test]
    #[ignore]
    fn probe_brightness() {
        let sr = 48000.0;
        for m in [4u32, 9, 3, 8, 6, 7] {
            let midi = 62.0;
            let f = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
            let mut line = format!("model {m}:");
            for v in [0.1f32, 0.3, 0.5, 0.7, 0.9, 1.0] {
                let x = render(m, 0, midi, v, 1.0, 1.0);
                let seg = &x[(0.45 * sr) as usize..(0.9 * sr) as usize];
                let (mut num, mut den) = (0.0, 0.0);
                for h in 1..12 { let a = harmonic(seg, sr, f * h as f32); num += a * h as f32; den += a; }
                line += &format!(" v{v}:{:.2}/{:.3}", num / den, peak(seg));
                if v == 1.0 || v == 0.1 { let hs: Vec<String> = (1..12).map(|h| format!("{:.0}", harmonic(seg, sr, f * h as f32))).collect(); eprintln!("  v{v} h: {}", hs.join(" ")); }
            }
            eprintln!("{line}");
        }
    }

    #[test]
    #[ignore]
    fn probe_regimes() {
        let sr = 48000.0;
        for m in [3u32, 8, 7] {
            for midi in [64.0f32, 69.0, 72.0, 76.0, 79.0] {
                let f = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
                let mut line = format!("model {m} midi {midi}:");
                let mut bad = 0;
                for vel in [0.15f32, 0.5, 1.0] {
                    for seed in [1u32, 7, 12345, 99, 3, 4242] {
                        let p = params(m, 0);
                        let mut v = LyraVoice::new(sr);
                        let mut rng = Rng(seed);
                        v.trigger(f, vel, &p, &mut rng);
                        let x: Vec<f32> = (0..(sr as usize)).map(|_| v.render_sample(1.0, 0.0, &mut rng).0).collect();
                        let seg = &x[(0.45 * sr) as usize..(0.9 * sr) as usize];
                        let fp = pitch(seg, sr, f * 0.45, f * 2.2);
                        let c = 1200.0 * (fp / f).log2();
                        if c.abs() > 30.0 { bad += 1; line += &format!(" {vel}/{seed}:{c:+.0}"); }
                    }
                }
                eprintln!("{line} → {bad}/18 off");
            }
        }
    }

    #[test]
    fn clarinet_low_register_favours_odd_harmonics() {
        let sr = 48000.0;
        let midi = 52.0;
        let f = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
        let x = render(7, 0, midi, 0.7, 1.0, 1.0);
        let seg = &x[(0.4 * sr) as usize..(0.9 * sr) as usize];
        let (h1, h2, h3, h4) = (harmonic(seg, sr, f), harmonic(seg, sr, 2.0 * f), harmonic(seg, sr, 3.0 * f), harmonic(seg, sr, 4.0 * f));
        eprintln!("clarinet h1 {h1:.1} h2 {h2:.1} h3 {h3:.1} h4 {h4:.1}");
        assert!(h2 < h1 * 0.5 && h2 < h3, "even harmonic 2 should be weak: {h1} {h2} {h3}");
        assert!(h4 < h3, "even harmonic 4 should sit under 3: {h3} {h4}");
    }

    #[test]
    fn winds_get_brighter_as_they_get_louder() {
        let sr = 48000.0;
        let centroid = |x: &[f32], f: f32| {
            let (mut num, mut den) = (0.0, 0.0);
            for h in 1..12 {
                let a = harmonic(x, sr, f * h as f32);
                num += a * h as f32;
                den += a;
            }
            num / den
        };
        for m in [3u32, 4, 6, 7, 8] {
            let midi = 62.0;
            let f = 440.0 * 2f32.powf((midi - 69.0) / 12.0);
            let soft = render(m, 0, midi, 0.2, 1.0, 1.0);
            let loud = render(m, 0, midi, 1.0, 1.0, 1.0);
            let seg = |x: &Vec<f32>| x[(0.45 * sr) as usize..(0.9 * sr) as usize].to_vec();
            let (cs, cl) = (centroid(&seg(&soft), f), centroid(&seg(&loud), f));
            eprintln!("model {m}: centroid pp {cs:.2} ff {cl:.2}");
            assert!(cl > cs * 1.05, "model {m}: ff ({cl}) not brighter than pp ({cs})");
        }
    }

    #[test]
    fn legato_slurs_into_one_voice_and_lands_on_the_new_note() {
        use crate::engine::Engine;
        let sr = 48000.0;
        for m in [2u32, 3, 4, 6, 7, 8] {
            let mut e = Engine::new(sr);
            e.params.set(LYRA_BASE + LY_ENABLE, 1.0);
            e.params.set(LYRA_BASE + LY_MODEL, m as f32);
            e.params.set(P_GLIDE, 0.02); // poly mode: LYRA's own legato decides
            let mut out = Vec::new();
            e.note_on(62.0, 0.8, 1, 0);
            for b in 0..(1.6 * sr / 128.0) as usize {
                if b == (0.6 * sr / 128.0) as usize {
                    e.note_on(67.0, 0.8, 2, 0);
                }
                if b == (0.62 * sr / 128.0) as usize {
                    e.note_off(1);
                    assert_eq!(e.active_voices(), 1, "model {m}: the slur must stay one voice");
                }
                e.render(128);
                let pl = e.scratch_ptr(0);
                for i in 0..128 {
                    // SAFETY: scratch holds MAX_BLOCK ≥ 128 frames.
                    out.push(unsafe { *pl.add(i) });
                }
            }
            // A chord (notes together) stays a chord.
            let mut c = Engine::new(sr);
            c.params.set(LYRA_BASE + LY_ENABLE, 1.0);
            c.params.set(LYRA_BASE + LY_MODEL, m as f32);
            for (i, n) in [60.0f32, 64.0, 67.0].iter().enumerate() {
                c.note_on(*n, 0.7, 10 + i as u32, i as u32 * 200);
            }
            c.render(128);
            assert_eq!(c.active_voices(), 3, "model {m}: a chord must keep its voices");
            let target = 440.0 * 2f32.powf((67.0 - 69.0) / 12.0);
            let f = pitch(&out[(1.1 * sr) as usize..(1.5 * sr) as usize], sr, target * 0.7, target * 1.4);
            let c = cents(f, target);
            eprintln!("model {m} slur → {f:.1} Hz ({c:+.1} c)");
            assert!(c.abs() < 25.0, "model {m}: slur landed {c:.1} cents off");
        }
    }
}
