//! The performer's life — what keeps a physically modelled note from sounding frozen.
//!
//! No player holds a note still. Breath pressure and bow force wander by a few percent, pitch
//! drifts by a few cents and is pulled back by the ear, vibrato comes in late and is never the
//! same rate or depth twice. Measured on real sustained tones these fluctuations are slow and
//! "pink" (1/f-like below ~10 Hz): a sum of a few smoothed random walks at different speeds
//! reproduces that. The models apply it to their physical inputs (bow force and speed, blowing
//! pressure, finger and lip tuning), so the timbre moves with it the way an instrument's does —
//! never as a tremolo on the output.

use crate::osc::Rng;

/// Pink-ish slow wander: three smoothed random walks (~0.25, 1.2 and 5 Hz), unit-ish variance.
#[derive(Clone, Copy, Default)]
pub struct Wander {
    s: [f32; 3],
    v: [f32; 3],
    k: [f32; 3],
}

impl Wander {
    /// `rate` is the tick rate (Hz) the caller will tick at (e.g. sr / 32).
    pub fn new(rate: f32) -> Self {
        let k = [0.25f32, 1.2, 5.0].map(|f| 1.0 - (-2.0 * std::f32::consts::PI * f / rate).exp());
        Wander { s: [0.0; 3], v: [0.0; 3], k }
    }
    pub fn reset(&mut self, rng: &mut Rng) {
        // Start somewhere: no two notes begin from the same breath.
        for i in 0..3 {
            self.s[i] = rng.bipolar() * 0.8;
            self.v[i] = self.s[i];
        }
    }
    #[inline]
    pub fn tick(&mut self, rng: &mut Rng) -> f32 {
        let mut out = 0.0;
        const W: [f32; 3] = [0.6, 0.55, 0.35];
        for i in 0..3 {
            // A random target drifting, followed by a one-pole: band-limited wander at speed i.
            self.v[i] += (rng.bipolar() * 1.6 - self.v[i]) * self.k[i] * 2.0;
            self.s[i] += (self.v[i] - self.s[i]) * self.k[i];
            out += self.s[i] * W[i];
        }
        out
    }
}

/// Vibrato that lives: it develops into the note, its rate drifts within a cycle or two, its
/// depth swells and relaxes, and every note's is a little different.
#[derive(Clone, Copy, Default)]
pub struct Vibrato {
    phase: f32,
    rate: f32,
    depth: f32,
    delay: f32,
    ramp: f32,
    rate_w: f32,
    depth_w: f32,
}

impl Vibrato {
    pub fn start(&mut self, base_rate: f32, depth_cents: f32, rng: &mut Rng) {
        self.phase = rng.next_f32();
        self.rate = base_rate * (1.0 + rng.bipolar() * 0.06);
        self.depth = depth_cents * (1.0 + rng.bipolar() * 0.2);
        self.delay = 0.12 + 0.25 * rng.next_f32();
        self.ramp = 0.3 + 0.4 * rng.next_f32();
        self.rate_w = 0.0;
        self.depth_w = 0.0;
    }
    /// (developed vibrato in units of depth, the raw shape −1..1) at time `t` (s) into the note;
    /// `dt` the step; `w` a slow wander sample (−1..1).
    #[inline]
    pub fn cents(&mut self, t: f32, dt: f32, w: f32) -> (f32, f32) {
        self.rate_w += (w * 0.08 - self.rate_w) * dt * 3.0;
        self.depth_w += (w * 0.3 - self.depth_w) * dt * 1.5;
        self.phase += self.rate * (1.0 + self.rate_w) * dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        let x = ((t - self.delay) / self.ramp).clamp(0.0, 1.0);
        let env = x * x * (3.0 - 2.0 * x);
        // A real vibrato is not a sine: the hand rolls back a little faster than it rolls forward.
        let p = self.phase * std::f32::consts::TAU;
        let shape = p.sin() + 0.12 * (2.0 * p).sin();
        (self.depth * (1.0 + self.depth_w) * env * shape, shape)
    }
}
