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

/// TPT state-variable filter (Simper/Cytomic form). All five responses for one solve.
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
        // res 0..1 → k from 2 (heavily damped) down to ~0.02 (self-oscillating).
        let k = 2.0 - 1.98 * res.clamp(0.0, 1.0);
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let v3 = x - self.ic2;
        let v1 = a1 * self.ic1 + a2 * v3;
        let v2 = self.ic2 + a2 * self.ic1 + a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
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

/// Zero-delay-feedback Moog ladder — four one-pole TPT stages inside a resolved feedback loop,
/// with saturation in the loop. The nonlinearity is the character: it's what makes the ladder
/// growl instead of just attenuate.
#[derive(Clone, Copy, Default)]
pub struct Ladder {
    s: [f32; 4],
}

impl Ladder {
    pub fn reset(&mut self) {
        self.s = [0.0; 4];
    }

    /// `res` 0..1 maps to feedback 0..~4.2 (past 4 it self-oscillates, which we allow).
    #[inline]
    pub fn process(&mut self, x: f32, cutoff_hz: f32, res: f32, drive: f32, sr: f32) -> f32 {
        let g = prewarp(cutoff_hz, sr);
        let big_g = g / (1.0 + g);
        let k = 4.2 * res.clamp(0.0, 1.0);

        // Solve the delay-free loop. Each TPT one-pole is y = G*x + (1-G)*s, and (1-G) == 1/(1+g),
        // so cascading four of them gives y4 = G^4*u + S, with S the states' contribution:
        let one_minus_g = 1.0 / (1.0 + g); // == 1 - big_g
        let s1 = self.s[0] * one_minus_g;
        let s2 = self.s[1] * one_minus_g;
        let s3 = self.s[2] * one_minus_g;
        let s4 = self.s[3] * one_minus_g;
        let g2 = big_g * big_g;
        let g3 = g2 * big_g;
        let g4 = g3 * big_g;
        let big_s = g3 * s1 + g2 * s2 + big_g * s3 + s4;

        // u = (x - k*S) / (1 + k*G^4) — the loop resolved in closed form, hence "zero delay".
        let xd = tanh_fast(x * (1.0 + drive * 3.0));
        let u = (xd - k * big_s) / (1.0 + k * g4);

        // Four TPT one-poles: v = (x - s)*G ; y = v + s ; s = y + v.
        let mut sig = u;
        for i in 0..4 {
            let v = (sig - self.s[i]) * big_g;
            let y = v + self.s[i];
            self.s[i] = y + v;
            sig = y;
        }

        let out = sig * (1.0 + k * 0.35); // makeup for the volume the feedback eats
        if out.is_finite() { out } else { self.reset(); 0.0 }
    }
}
