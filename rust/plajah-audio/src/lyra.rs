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
    pickup: f32,

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
            pickup: 0.0,
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
        self.released = true;
    }

    /// Settled and silent (or released and faded) — the voice can be freed.
    pub fn is_quiet(&self) -> bool {
        let struck = matches!(self.model, MODEL_GUITAR | MODEL_PIANO | MODEL_TINE);
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
        self.model = (p.get(LYRA_BASE + LY_MODEL).round() as i32).clamp(0, 5) as u32;
        self.variant = p.get(LYRA_BASE + LY_VARIANT).round().max(0.0) as u32;
        self.pedal = p01(p, LY_PEDAL) > 0.5;

        let vs = p01(p, LY_VEL_SENS);
        let v = lerp(0.7, self.vel, vs); // velocity response
        self.vel = v;
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
            _ => self.trigger_tine(p),
        }
    }

    fn trigger_guitar(&mut self, p: &Params, rng: &mut Rng) {
        let sr = self.sr;
        let f0 = self.f0;
        let nylon = self.variant == 1;
        let electric = self.variant >= 2;
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
            self.pickup = lerp(0.06, 0.24, 1.0 - p01(p, LY_TONE)) * period;
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
        self.pickup = if electric { self.pickup } else { 0.0 };
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
        // Violin body: the air mode A0, the main wood modes B1−/B1+, and the "bridge hill".
        self.set_body(&[(275.0, 12.0, 1.0), (460.0, 10.0, 0.9), (540.0, 15.0, 0.8), (700.0, 8.0, 0.5), (2500.0, 1.5, 0.75), (3500.0, 2.0, 0.4)], size, p01(p, LY_BODY));
        self.direct = 0.25;
        self.gain = 2.2;
    }

    fn trigger_sax(&mut self, p: &Params) {
        // STK Saxofony: a conical bore approximated by two delays either side of the reed point.
        let sr = self.sr;
        self.base = (sr / self.f0 - 3.0).max(4.0);
        self.beta = lerp(0.1, 0.4, p01(p, LY_EXCITE_POS));
        self.slope = lerp(0.2, 0.42, p01(p, LY_EXCITE_HARD));
        self.max_drive = 0.55 + 0.3 * self.vel;
        self.env_up = 1.0 / (lerp(0.01, 0.35, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.03, 0.8, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.35;
        self.growl = p01(p, LY_DRIVE);
        let tenor = self.variant == 1;
        let size = lerp(1.15, 0.85, p01(p, LY_BODY_SIZE));
        if tenor {
            self.set_body(&[(480.0, 2.5, 0.6), (1350.0, 2.5, 0.45), (2700.0, 2.0, 0.2)], size, p01(p, LY_BODY));
        } else {
            self.set_body(&[(700.0, 2.5, 0.6), (1800.0, 2.5, 0.45), (3300.0, 2.0, 0.2)], size, p01(p, LY_BODY));
        }
        self.direct = 0.7;
        self.gain = 1.5;
    }

    fn trigger_trumpet(&mut self, p: &Params) {
        // Lip-reed after STK Brass, with the lips driven at the played pitch (a forced valve)
        // instead of left to find a slot — the free-running valve hops partials. The bore is one
        // period long so its resonances sit on the harmonics; it shapes and feeds back the tone.
        let sr = self.sr;
        self.base = (sr / self.f0 - 1.0).max(2.0);
        self.vib_phase = 0.0;
        let tension = p01(p, LY_EXCITE_HARD);
        self.slope = lerp(1.2, 3.6, tension); // how sharply the lips snap shut each cycle
        self.lp = 0.0; // lip phase
        self.max_drive = 0.55 + 0.45 * self.vel;
        self.env_up = 1.0 / (lerp(0.008, 0.25, p01(p, LY_ATTACK)) * sr);
        self.env_down = 1.0 / (lerp(0.02, 0.6, p01(p, LY_DECAY)) * sr);
        self.noise_gain = p01(p, LY_NOISE) * 0.04;
        // Bell: the flare radiates the highs. Mutes reshape it: cup (round), harmon (Miles's
        // buzzing core), straight (nasal).
        let bright = p01(p, LY_BRIGHTNESS);
        self.nmute = 2;
        match self.variant {
            1 => { self.mute = [Biquad::lowpass(1800.0, 0.8, sr), Biquad::highpass(220.0, 0.7, sr)]; }
            2 => { self.mute = [Biquad::highpass(950.0, 1.2, sr), Biquad::lowpass(lerp(3000.0, 5000.0, bright), 3.0, sr)]; }
            3 => { self.mute = [Biquad::highpass(520.0, 1.0, sr), Biquad::lowpass(lerp(3500.0, 6500.0, bright), 1.8, sr)]; }
            _ => { self.mute = [Biquad::highpass(120.0, 0.7, sr), Biquad::lowpass(lerp(4500.0, 11000.0, bright), 0.7, sr)]; }
        }
        self.set_body(&[(1200.0, 1.5, 0.35), (2600.0, 1.6, 0.25)], 1.0, p01(p, LY_BODY));
        self.direct = 1.0;
        // Mutes cut the lows, so high notes come through hotter — level them across the range.
        let reg = (392.0 / self.f0).powf(0.6).clamp(0.4, 2.5);
        self.gain = match self.variant { 1 => 0.9, 2 => 0.75 * reg, 3 => 0.75 * reg, _ => 0.8 };
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

    /// One stereo sample.
    #[inline]
    pub fn render_sample(&mut self, bend_ratio: f32, mod_wheel: f32, rng: &mut Rng) -> (f32, f32) {
        let bend = bend_ratio.clamp(0.25, 4.0);
        let y = match self.model {
            MODEL_GUITAR | MODEL_PIANO => {
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
                let s = if self.pickup > 0.0 {
                    // Electric: the pickup hears the string at one point — a comb on the output.
                    self.hist.write(s);
                    s - 0.85 * self.hist.read(self.pickup.max(1.0))
                } else {
                    s
                };
                let knock = if self.model == MODEL_PIANO && self.exc_pos < self.exc_len { x * 0.25 } else { 0.0 };
                self.body_tick(s) + knock
            }
            MODEL_VIOLIN => {
                self.envelope();
                let vib = self.vibrato(mod_wheel);
                let base = self.base / bend;
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
                self.body_tick(self.last2)
            }
            MODEL_SAX => {
                self.envelope();
                let vib = self.vibrato(mod_wheel);
                let base = (self.base / bend) * (1.0 + 0.002 * vib);
                let mut breath = self.env * self.max_drive;
                breath += breath * self.noise_gain * rng.bipolar();
                breath += breath * 0.08 * vib;
                let oz = 0.5 * (self.last1 + self.oz_x1);
                self.oz_x1 = self.last1;
                let temp = -0.95 * oz;
                let out = temp - self.last2;
                let pd = breath - out;
                let reed = (0.7 + self.slope * pd).clamp(-1.0, 1.0);
                self.last2 = self.d2.process(temp, (self.beta * base).max(1.0));
                self.last1 = self.d1.process(breath - pd * reed - temp, ((1.0 - self.beta) * base).max(1.0));
                let mut y = out * 0.3;
                if self.growl > 0.0 {
                    // Growl: humming into the horn — a rough low-frequency AM and a little grit.
                    self.growl_lp += 0.02 * (rng.bipolar() - self.growl_lp);
                    y *= 1.0 + self.growl * 2.5 * self.growl_lp;
                    y = (y * (1.0 + self.growl * 3.0)).tanh() / (1.0 + self.growl * 1.5);
                }
                self.body_tick(y)
            }
            MODEL_TRUMPET => {
                self.envelope();
                let vib = self.vibrato(mod_wheel);
                // The lips settle onto the note: a quick scoop up from ~35 cents flat.
                let scoop = 1.0 - 0.02 * (-(self.t as f32) / (self.sr * 0.035)).exp();
                self.lp += self.f0 * bend * scoop * (1.0 + 0.004 * vib) / self.sr;
                if self.lp >= 1.0 {
                    self.lp -= 1.0;
                }
                let breath = self.max_drive * self.env * (1.0 + self.noise_gain * rng.bipolar());
                let open = (TAU * self.lp).sin().max(0.0).powf(self.slope);
                let mouth = 0.3 * breath;
                let bore = 0.85 * self.last1;
                let y = open * mouth + (1.0 - open) * bore;
                let dc = y - self.dc_x1 + 0.995 * self.dc_y1;
                self.dc_x1 = y;
                self.dc_y1 = dc;
                self.last1 = self.d1.process(dc, (self.base / bend).max(1.0));
                // Brassiness: loud playing steepens the wave in the tube — brighter, not just louder.
                let drive = 1.0 + 5.0 * breath;
                let mut o = (self.last1 * drive).tanh() / drive.sqrt();
                for i in 0..self.nmute {
                    o = self.mute[i].tick(o);
                }
                self.body_tick(o)
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

/// An electric guitar's amp + cab, or the tine piano's preamp + stereo tremolo (the suitcase's
/// tremolo is in the amp, so it pans the whole chord together — which is why it's here and not
/// per voice).
pub struct LyraRack {
    sr: f32,
    trem: f32,
    hp: [Biquad; 2],
    tone: [Biquad; 2],
    cab_lo: [Biquad; 2],
    cab_hi: [Biquad; 2],
    built_for: u64,
}

impl LyraRack {
    pub fn new(sr: f32) -> Self {
        LyraRack { sr, trem: 0.0, hp: [Biquad::default(); 2], tone: [Biquad::default(); 2], cab_lo: [Biquad::default(); 2], cab_hi: [Biquad::default(); 2], built_for: u64::MAX }
    }

    pub fn active(p: &Params) -> bool {
        if p.get(LYRA_BASE + LY_ENABLE) <= 0.5 {
            return false;
        }
        let m = p.get(LYRA_BASE + LY_MODEL).round() as u32;
        (m == MODEL_GUITAR && p.get(LYRA_BASE + LY_VARIANT).round() as u32 >= 2) || m == MODEL_TINE
    }

    fn build(&mut self, p: &Params, tine: bool) {
        let key = ((p01(p, LY_TONE) * 1000.0) as u64) | ((tine as u64) << 20);
        if key == self.built_for {
            return;
        }
        self.built_for = key;
        let sr = self.sr;
        let tone = p01(p, LY_TONE);
        for c in 0..2 {
            if tine {
                self.hp[c] = Biquad::highpass(45.0, 0.7, sr);
                self.tone[c] = Biquad::lowpass(lerp(2500.0, 9000.0, tone), 0.7, sr);
                self.cab_lo[c] = Biquad::bandpass(180.0, 0.9, sr);
                self.cab_hi[c] = Biquad::bandpass(1600.0, 1.0, sr);
            } else {
                self.hp[c] = Biquad::highpass(85.0, 0.7, sr);
                self.tone[c] = Biquad::lowpass(lerp(2800.0, 7500.0, tone), 0.9, sr);
                self.cab_lo[c] = Biquad::bandpass(110.0, 1.2, sr);
                self.cab_hi[c] = Biquad::bandpass(2300.0, 1.4, sr);
            }
        }
    }

    pub fn process(&mut self, out: &mut [[f32; crate::engine::MAX_BLOCK]; crate::spatial::MAX_CHANNELS], frames: usize, nch: usize, p: &Params) {
        let tine = p.get(LYRA_BASE + LY_MODEL).round() as u32 == MODEL_TINE;
        self.build(p, tine);
        let drive = p01(p, LY_DRIVE);
        let depth = if tine { p01(p, LY_TREM_DEPTH) } else { 0.0 };
        let rate = lerp(1.5, 9.0, p01(p, LY_TREM_RATE));
        let inc = TAU * rate / self.sr;
        let pre = if tine { 1.0 + drive * 5.0 } else { 1.0 + drive * 40.0 };
        let makeup = if tine { 1.0 / (1.0 + drive * 1.8) } else { 1.0 / (1.0 + drive * 6.0).sqrt() };
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
        for (m, vars) in [(0u32, 3u32), (1, 2), (2, 1), (3, 2), (4, 4), (5, 1)] {
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
        for (m, notes) in [(2u32, [55.0, 62.0, 69.0, 76.0]), (3, [49.0, 56.0, 61.0, 68.0]), (4, [55.0, 60.0, 65.0, 70.0])] {
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

    #[test]
    fn sustained_models_stop_after_release_and_struck_models_ring_out() {
        let sr = 48000.0;
        for m in [2u32, 3, 4] {
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
}
