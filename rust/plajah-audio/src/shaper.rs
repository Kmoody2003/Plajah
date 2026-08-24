//! Waveshaping / drive, oversampled.
//!
//! Any nonlinearity generates harmonics above Nyquist, which fold back as aliasing. Running the
//! nonlinear stage at 2× with a decent half-band filter either side pushes that folded energy
//! out of the audible band. This is the difference between drive that sounds like an amp and
//! drive that sounds like a broken codec.

use crate::filter::tanh_fast;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ShapeMode {
    Off,
    Soft,
    Hard,
    Fold,
    Bits,
}

impl ShapeMode {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => ShapeMode::Soft,
            2 => ShapeMode::Hard,
            3 => ShapeMode::Fold,
            4 => ShapeMode::Bits,
            _ => ShapeMode::Off,
        }
    }
}

#[inline]
fn curve(x: f32, mode: ShapeMode, amount: f32) -> f32 {
    let d = 1.0 + amount * 24.0;
    match mode {
        ShapeMode::Off => x,
        ShapeMode::Soft => tanh_fast(x * d) * (1.0 / (1.0 + amount * 1.5)),
        ShapeMode::Hard => (x * d).clamp(-1.0, 1.0) * (1.0 / (1.0 + amount * 1.5)),
        ShapeMode::Fold => {
            // Triangle wavefolder — the west-coast timbre: harmonics that bloom with level.
            let mut v = x * d * 0.5;
            for _ in 0..3 {
                v = if v > 1.0 { 2.0 - v } else if v < -1.0 { -2.0 - v } else { v };
            }
            v * (1.0 / (1.0 + amount))
        }
        ShapeMode::Bits => {
            let steps = (2.0f32).powf(1.0 + (1.0 - amount) * 14.0);
            ((x * steps).round() / steps).clamp(-1.5, 1.5)
        }
    }
}

/// 2× oversampled shaper. The half-band filters are short odd-symmetric FIRs — cheap, linear
/// phase, and more than good enough to keep the folded harmonics out of the audible band.
#[derive(Clone, Copy, Default)]
pub struct Shaper {
    up: [f32; 8],
    down: [f32; 8],
}

// Windowed-sinc half-band coefficients (every other tap is zero in a true half-band, so this
// runs at roughly half the multiply count it appears to).
const HB: [f32; 8] = [
    -0.0068, 0.0000, 0.0605, 0.0000, -0.2996, 0.0000, 0.5000, 0.7386,
];

impl Shaper {
    #[inline]
    fn fir(state: &mut [f32; 8], x: f32) -> f32 {
        // Shift-in and dot-product. Eight taps keeps this trivial for the branch predictor.
        for i in (1..8).rev() {
            state[i] = state[i - 1];
        }
        state[0] = x;
        let mut acc = 0.0;
        for i in 0..8 {
            acc += state[i] * HB[i];
        }
        acc
    }

    /// Same 2x oversampled path, but with a caller-supplied curve. BAJO's Scorch stages have
    /// their own eleven algorithms and their own bias term; this lets them reuse the half-band
    /// filters rather than shipping a second, worse oversampler.
    #[inline]
    pub fn process_with<F: Fn(f32) -> f32>(&mut self, x: f32, f: F) -> f32 {
        let a = Self::fir(&mut self.up, x * 2.0);
        let b = Self::fir(&mut self.up, 0.0);
        let sa = f(a);
        let sb = f(b);
        let _ = Self::fir(&mut self.down, sa);
        let out = Self::fir(&mut self.down, sb);
        if out.is_finite() { out } else { 0.0 }
    }

    #[inline]
    pub fn process(&mut self, x: f32, mode: ShapeMode, amount: f32) -> f32 {
        if mode == ShapeMode::Off || amount <= 0.0005 {
            return x;
        }
        // Upsample ×2 (zero-stuff + filter), shape both phases, downsample with the twin filter.
        let a = Self::fir(&mut self.up, x * 2.0);
        let b = Self::fir(&mut self.up, 0.0);
        let sa = curve(a, mode, amount);
        let sb = curve(b, mode, amount);
        let _ = Self::fir(&mut self.down, sa);
        let out = Self::fir(&mut self.down, sb);
        if out.is_finite() { out } else { 0.0 }
    }
}
