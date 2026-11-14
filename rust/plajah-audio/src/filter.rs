//! Filters — TPT/ZDF designs (Zavalishin, *The Art of VA Filter Design*).
//!
//! Why not a plain biquad: a Direct-Form biquad computes its coefficients assuming they hold
//! still. Synths modulate cutoff constantly and fast, and under that the biquad's state no
//! longer matches its coefficients — it goes grainy, then unstable at high resonance. That
//! zipper-and-blowup behaviour is a large part of why cheap synths sound cheap.
//!
//! Topology-Preserving Transform filters solve the delay-free loop analytically each sample, so
//! they stay stable and musical no matter how hard the cutoff is swept, and they self-oscillate
//! cleanly — which is a sound in its own right.

use core::f32::consts::PI;

#[inline]
fn prewarp(cutoff_hz: f32, sr: f32) -> f32 {
    // g = tan(pi * fc / fs), clamped below Nyquist so tan() never explodes.
    let fc = cutoff_hz.clamp(8.0, sr * 0.49);
    (PI * fc / sr).tan()
}

/// Cheap, well-behaved saturator for filter feedback paths.
#[inline]
pub fn tanh_fast(x: f32) -> f32 {
    // Padé-ish rational approximation: monotonic, smooth, and ~4× faster than tanh().
    let x = x.clamp(-4.0, 4.0);
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SvfMode {
    Low,
    Band,
    High,
    Notch,
    Peak,
}

impl SvfMode {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => SvfMode::Band,
            2 => SvfMode::High,
            3 => SvfMode::Notch,
            4 => SvfMode::Peak,
            _ => SvfMode::Low,
        }
    }
}

/// TPT state-variable filter (Simper/Cytomic form) with subtle OTA transconductance saturation
/// on the bandpass integrator state so high-resonance sweeps sing instead of whistling.
#[derive(Clone, Copy, Default)]
pub struct Svf {
    ic1: f32,
    ic2: f32,
}

impl Svf {
    pub fn reset(&mut self) {
        self.ic1 = 0.0;
        self.ic2 = 0.0;
    }

    #[inline]
    pub fn process(&mut self, x: f32, cutoff_hz: f32, res: f32, sr: f32, mode: SvfMode) -> f32 {
        let g = prewarp(cutoff_hz, sr);
        let r = res.clamp(0.0, 1.0);
        // res 0..1 → k from 2 (heavily damped) down to ~0.02 (self-oscillating).
        let k = 2.0 - 1.98 * r;
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        // Subtle OTA core compression when resonant energy builds in ic1
        let s1 = if r > 0.55 {
            let nl = 0.32 * (r - 0.55);
            self.ic1 * (1.0 - nl) + tanh_fast(self.ic1 * 0.75) * (1.333_333_4 * nl)
        } else {
            self.ic1
        };

        let v3 = x - self.ic2;
        let v1 = a1 * s1 + a2 * v3;
        let v2 = self.ic2 + a2 * s1 + a3 * v3;
        self.ic1 = 2.0 * v1 - s1;
        self.ic2 = 2.0 * v2 - self.ic2;

        let lp = v2;
        let bp = v1;
        let hp = x - k * v1 - v2;
        let out = match mode {
            SvfMode::Low => lp,
            SvfMode::Band => bp,
            SvfMode::High => hp,
            SvfMode::Notch => hp + lp,
            SvfMode::Peak => hp - lp,
        };
        // Denormal/NaN guard: one bad sample would otherwise poison the state forever.
        if out.is_finite() { out } else { self.reset(); 0.0 }
    }
}

/// Zero-delay-feedback 4-stage transistor ladder — four one-pole TPT stages with discrete
/// transistor-pair pole mismatch, per-stage thermal saturation, and passband bass retention.
#[derive(Clone, Copy, Default)]
pub struct Ladder {
    s: [f32; 4],
}

const STAGE_TOL: [f32; 4] = [1.0, 0.9965, 1.0032, 0.9982];

impl Ladder {
    pub fn reset(&mut self) {
        self.s = [0.0; 4];
    }

    /// `res` 0..1 maps to feedback 0..~4.2 (past 4 it self-oscillates, which we allow).
    #[inline]
    pub fn process(&mut self, x: f32, cutoff_hz: f32, res: f32, drive: f32, sr: f32) -> f32 {
        let g = prewarp(cutoff_hz, sr);
        let drv = drive.clamp(0.0, 1.0);
        let k = 4.2 * res.clamp(0.0, 1.0);

        // Matched-pair capacitor/BJT tolerances across the 4 ladder rungs
        let g0 = (g * STAGE_TOL[0]) / (1.0 + g * STAGE_TOL[0]);
        let g1 = (g * STAGE_TOL[1]) / (1.0 + g * STAGE_TOL[1]);
        let g2 = (g * STAGE_TOL[2]) / (1.0 + g * STAGE_TOL[2]);
        let g3 = (g * STAGE_TOL[3]) / (1.0 + g * STAGE_TOL[3]);

        let s1 = self.s[0] * (1.0 - g0);
        let s2 = self.s[1] * (1.0 - g1);
        let s3 = self.s[2] * (1.0 - g2);
        let s4 = self.s[3] * (1.0 - g3);
        let g_prod = g0 * g1 * g2 * g3;
        let big_s = (g1 * g2 * g3) * s1 + (g2 * g3) * s2 + g3 * s3 + s4;

        // Input differential-pair saturation + passband bass-retention compensation
        let in_gain = 1.0 + drv * 3.1;
        let xd = tanh_fast(x * in_gain) * (1.0 / (1.0 + drv * 0.42));
        let fb_sig = tanh_fast(big_s * 0.92) * 1.086_956_5;
        let u = (xd * (1.0 + k * (0.12 + 0.10 * drv)) - k * fb_sig) / (1.0 + k * g_prod);

        // Per-stage BJT thermal nonlinearity scales gently with drive and resonance
        let stage_drv = 0.55 + drv * 0.85;
        let inv_stage = 1.0 / stage_drv;
        let gs = [g0, g1, g2, g3];
        let mut sig = u;
        for i in 0..4 {
            let v = (sig - self.s[i]) * gs[i];
            let y = v + self.s[i];
            self.s[i] = y + v;
            sig = tanh_fast(y * stage_drv) * inv_stage;
        }

        let out = sig * (1.0 + k * 0.26); // makeup for remaining feedback attenuation
        if out.is_finite() { out } else { self.reset(); 0.0 }
    }
}
