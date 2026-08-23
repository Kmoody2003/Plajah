//! The string engine — Karplus-Strong, per voice.
//!
//! This is the acoustic half of BAJO, and there is no oscillator in it. A short filtered noise
//! burst is injected into a delay line tuned to the note period, with a damping lowpass in the
//! feedback path; the loop's natural resonance IS the note. Three fixed peaking resonances stand
//! in for the instrument body.
//!
//! Tuning is the whole game. The loop delay is `period − group delay of the damping filter − 1`:
//! the one-pole contributes `(1−a)/a` samples of delay at DC and the write/read pair contributes
//! one more, and if you ignore either the instrument plays flat by a noticeable amount at the
//! bottom of its range — which for a bass instrument is most of its range.
//!
//! (The Web Audio prototype this came from needed a third term, `128/sampleRate`, because a
//! feedback loop there carries a mandatory render-quantum delay. Inside the Rust core that term
//! disappears, which is one of the reasons the port was worth doing.)

use crate::filter::{tanh_fast, Svf, SvfMode};

/// 60 ms of delay line covers down to ~17 Hz at any sample rate we run at.
const MAX_SECONDS: f32 = 0.06;

/// Loop DC-blocker coefficient. Kept low so its phase advance — which detunes the string — stays
/// small enough to correct analytically.
const DC_COEF: f32 = 0.00012;

pub struct StringVoice {
    buf: Vec<f32>,
    w: usize,
    lp: f32,
    dc: f32,
    /// Output tilt pole, kept separate from the loop's so the tone control cannot colour the
    /// feedback path and detune the string.
    out_lp: f32,
    body: [Svf; 3],
    exc_bp: Svf,
    rng: u32,
    /// Remaining burst amplitude — the pluck. Decays to nothing in a few milliseconds.
    burst: f32,
    burst_rate: f32,
    ringing: bool,
}

impl StringVoice {
    pub fn new(sr: f32, seed: u32) -> Self {
        StringVoice {
            buf: vec![0.0; ((sr * MAX_SECONDS) as usize).max(64)],
            w: 0,
            lp: 0.0,
            dc: 0.0,
            out_lp: 0.0,
            body: [Svf::default(); 3],
            exc_bp: Svf::default(),
            rng: seed | 1,
            burst: 0.0,
            burst_rate: 0.0,
            ringing: false,
        }
    }

    pub fn reset(&mut self) {
        self.buf.iter_mut().for_each(|v| *v = 0.0);
        self.w = 0;
        self.lp = 0.0;
        self.dc = 0.0;
        self.out_lp = 0.0;
        self.burst = 0.0;
        self.ringing = false;
        for b in self.body.iter_mut() {
            b.reset();
        }
        self.exc_bp.reset();
    }

    /// Strike the string. `pick` sets how long and how bright the excitation is: a wide, soft
    /// finger pluck at 0, a short bright plectrum at 1.
    pub fn pluck(&mut self, pick: f32, velocity: f32) {
        self.burst = (0.55 + pick * 0.5) * velocity.clamp(0.05, 1.4);
        // 1.5 ms at full pick out to 18 ms with the flesh of a finger.
        let ms = 1.5 + (1.0 - pick.clamp(0.0, 1.0)) * 16.5;
        self.burst_rate = 1.0 / (ms * 0.001).max(0.0005);
        self.ringing = true;
    }

    #[inline]
    fn noise(&mut self) -> f32 {
        // xorshift — cheap, and the spectral quality of the exciter matters less than that it is
        // broadband and never repeats audibly.
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng as f32 / 2_147_483_648.0) - 1.0
    }

    #[inline]
    fn read(&self, d: f32) -> f32 {
        let n = self.buf.len();
        let d = d.clamp(1.0, (n - 2) as f32);
        let pos = self.w as f32 - d;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i = (pos.floor() as usize) % n;
        let f = pos - pos.floor();
        let a = self.buf[i];
        let b = self.buf[(i + 1) % n];
        a + (b - a) * f
    }

    pub fn is_ringing(&self) -> bool {
        self.ringing
    }

    /// One sample. `freq` is the note frequency including glide and bend, so the delay line
    /// retunes continuously and a fretless glide is a real glide.
    #[allow(clippy::too_many_arguments)]
    #[inline]
    pub fn process(&mut self, freq: f32, damp: f32, tone: f32, bow: f32, body: f32, pick: f32, sr: f32) -> f32 {
        if !self.ringing {
            return 0.0;
        }
        let f = freq.clamp(18.0, 4000.0);

        // Damping lowpass coefficient, and the group delay it costs us.
        let lp_hz = 420.0 + (1.0 - damp.clamp(0.0, 1.0)).powi(2) * 7600.0;
        let a = (1.0 - (-core::f32::consts::TAU * lp_hz / sr).exp()).clamp(0.02, 0.999);
        let group = (1.0 - a) / a;

        // The DC blocker is inside the loop, and a highpass ADVANCES phase — which shortens the
        // effective loop and plays the string sharp. Measured at +13.8 cents before this was
        // accounted for. Its corner is low, so arctan(fc/f) is the whole correction.
        let dc_fc = DC_COEF * sr / core::f32::consts::TAU;
        let dc_advance = ((dc_fc / f).atan() / core::f32::consts::TAU) * (sr / f);

        let period = sr / f;
        let d = (period - group + dc_advance).max(1.0);

        // Excitation. A pluck is a burst; a bow replaces it with continuous drive, which is what
        // turns the same section into arco without a second engine.
        let mut exc = 0.0;
        if self.burst > 0.0001 {
            exc += self.noise() * self.burst;
            self.burst -= self.burst * self.burst_rate / sr;
            if self.burst < 0.0001 {
                self.burst = 0.0;
            }
        }
        if bow > 0.02 {
            exc += self.noise() * (0.006 + bow * 0.05);
        }
        if exc != 0.0 {
            // Shape the exciter: dark and wide for a finger, bright and narrow for a plectrum.
            let bp_hz = 180.0 + pick.clamp(0.0, 1.0) * 3600.0;
            exc = self.exc_bp.process(exc, bp_hz, 0.35 + pick * 0.4, sr, SvfMode::Band);
        }

        let r = self.read(d);

        // Loop: damping lowpass, DC block, feedback. The DC blocker matters — without it a
        // sustained bow walks the loop off centre and the string chokes.
        self.lp += (r - self.lp) * a;
        self.dc += (self.lp - self.dc) * DC_COEF;
        let looped = self.lp - self.dc;

        // Bowed strings need more loop gain than plucked ones or they never reach steady state.
        let fb = (0.9975 - damp * 0.06 + if bow > 0.5 { 0.002 } else { -0.004 }).min(0.9995);
        let fed = tanh_fast((looped * fb + exc) * 1.02);

        let n = self.buf.len();
        self.buf[self.w] = fed;
        self.w = (self.w + 1) % n;

        if r.abs() < 1.0e-6 && self.burst <= 0.0 && bow <= 0.02 {
            self.ringing = false;
        }

        // Body: three fixed resonances. Fixed, not key-tracked — the instrument's body does not
        // change size when you play a different note, and pretending otherwise is what makes
        // sampled basses sound synthetic.
        let mut out = r;
        if body > 0.001 {
            let b0 = self.body[0].process(r, 92.0, 0.72, sr, SvfMode::Band);
            let b1 = self.body[1].process(r, 196.0, 0.78, sr, SvfMode::Band);
            let b2 = self.body[2].process(r, 430.0, 0.7, sr, SvfMode::Band);
            out += (b0 * 1.6 + b1 * 1.2 + b2 * 0.7) * body;
        }

        // Tone: a final one-pole tilt standing in for pickup position and string age. On its own
        // pole, outside the loop, so the tone control cannot retune the string.
        let t_hz = 700.0 + tone.clamp(0.0, 1.0) * 9000.0;
        let ta = (1.0 - (-core::f32::consts::TAU * t_hz / sr).exp()).clamp(0.02, 1.0);
        self.out_lp += (out - self.out_lp) * ta;
        self.out_lp
    }
}
