//! The exciter — what puts energy into the modal bank.
//!
//! Feedforward by design: the exciter produces a signal, the bank resonates it, and there is no
//! path back. A true friction model closes that loop and is more expressive, but it can also go
//! unstable in ways that are very hard to bound on an audio thread — and for the voices VELA is
//! built for, feedforward excitation into a well-tuned bank is indistinguishable in practice.
//!
//! The reason a bow matters at all: a strike is a transient, so the note can only ever decay.
//! A bow is continuous, which is what lets a note sustain forever with no loop point and no
//! sample. That is the whole premise of the instrument.

use crate::osc::{Noise, Rng};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ExciterType {
    Bow,
    Blow,
    Strike,
    Rub,
}

impl ExciterType {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => ExciterType::Blow,
            2 => ExciterType::Strike,
            3 => ExciterType::Rub,
            _ => ExciterType::Bow,
        }
    }

    #[inline]
    pub fn is_continuous(self) -> bool {
        !matches!(self, ExciterType::Strike)
    }
}

#[derive(Clone, Copy)]
pub struct ExciterSpec {
    pub kind: ExciterType,
    /// 0..1. Energy into the bank. Under Bow and Rub this is what sustains the note.
    pub pressure: f32,
    /// 0..1. Noise texture — smooth breath through to audible stick-slip.
    pub grain: f32,
    /// 0..1. Spectral tilt of the excitation, which decides which partials get energised first.
    pub tone: f32,
    /// 0..1. How much velocity moves tone rather than level. Playing a real body harder changes
    /// its colour; only a sampler changes just the volume.
    pub vel_tilt: f32,
    pub velocity: f32,
}

pub struct Exciter {
    noise: Noise,
    rng: Rng,
    /// One-pole state for the tone tilt.
    lp: f32,
    hp: f32,
    /// Remaining strike energy, in samples.
    impulse: f32,
    impulse_len: f32,
    /// Slow stick-slip phase for Bow and Rub.
    slip: f32,
    /// Smoothed pressure, so a macro sweep never steps.
    pressure_z: f32,
}

impl Default for Exciter {
    fn default() -> Self {
        Self {
            noise: Noise::default(),
            rng: Rng(0x2545_F491),
            lp: 0.0,
            hp: 0.0,
            impulse: 0.0,
            impulse_len: 1.0,
            slip: 0.0,
            pressure_z: 0.0,
        }
    }
}

impl Exciter {
    pub fn reseed(&mut self, seed: u32) {
        self.rng = Rng(seed | 1);
    }

    /// Begin a note. For Strike this arms the impulse; for the continuous types it just resets
    /// the running state so two notes do not share a phase.
    pub fn strike(&mut self, spec: &ExciterSpec, sr: f32) {
        self.lp = 0.0;
        self.hp = 0.0;
        self.slip = self.rng.next_f32();
        self.pressure_z = 0.0;
        // A harder strike is a *shorter*, brighter contact, not just a louder one — 1 ms at full
        // velocity out to about 9 ms at the softest.
        let ms = 9.0 - 8.0 * spec.velocity.clamp(0.0, 1.0);
        self.impulse_len = (ms * 0.001 * sr).max(4.0);
        self.impulse = if matches!(spec.kind, ExciterType::Strike) { self.impulse_len } else { 0.0 };
    }

    /// Release.
    ///
    /// Deliberately does NOT cancel an in-flight strike. A contact window is one to nine
    /// milliseconds, and a note-off arriving inside it is a sequencer artefact rather than a
    /// musical gesture — cancelling there produces a note that silently never sounds.
    /// Continuous exciters stop feeding the bank via the `gate` argument to `process` instead,
    /// which is what makes note-off on a bowed voice sound like lifting the bow rather than
    /// muting the body: the bank keeps ringing on its own.
    pub fn release(&mut self) {}

    #[inline]
    pub fn process(&mut self, spec: &ExciterSpec, gate: bool, sr: f32) -> f32 {
        // Velocity moves tone, and only gently moves level.
        let vt = spec.vel_tilt.clamp(0.0, 1.0);
        let tone = (spec.tone + (spec.velocity - 0.5) * vt * 0.6).clamp(0.0, 1.0);
        let level = 1.0 - vt * 0.35 * (1.0 - spec.velocity);

        let target = if gate { spec.pressure } else { 0.0 };
        // ~8 ms smoothing: fast enough to feel immediate, slow enough that a macro sweep across
        // Air never zippers.
        let k = (1.0 - (-1.0 / (0.008 * sr)).exp()).clamp(0.0, 1.0);
        self.pressure_z += (target - self.pressure_z) * k;

        let n = self.noise.white(&mut self.rng);

        let raw = match spec.kind {
            ExciterType::Strike => {
                if self.impulse <= 0.0 {
                    0.0
                } else {
                    self.impulse -= 1.0;
                    // Raised-cosine contact window: no DC step, no click that is not the click
                    // the body itself makes.
                    let t = (self.impulse / self.impulse_len).clamp(0.0, 1.0);
                    let win = 0.5 - 0.5 * (core::f32::consts::TAU * t).cos();
                    (n * spec.grain + (1.0 - spec.grain)) * win
                }
            }
            ExciterType::Blow => {
                // Turbulent air: mostly noise, pressure-scaled, with a touch of the pressure
                // itself as a DC-ish push so the bank sees a sustained drive.
                (n * (0.35 + 0.65 * spec.grain)) * self.pressure_z
            }
            ExciterType::Bow => {
                // Stick-slip: a sawtooth grip cycle in the low audio range, roughened by noise.
                // Bow speed rises with pressure, which is what a player actually does.
                let rate = (24.0 + 90.0 * self.pressure_z) / sr;
                self.slip += rate;
                if self.slip >= 1.0 {
                    self.slip -= 1.0;
                }
                let grip = self.slip * 2.0 - 1.0;
                (grip * (1.0 - spec.grain * 0.7) + n * spec.grain) * self.pressure_z
            }
            ExciterType::Rub => {
                // The crystal-bowl gesture: the same grip cycle, an order of magnitude slower,
                // and amplitude-modulated so it swells rather than buzzes.
                let rate = (1.4 + 7.0 * self.pressure_z) / sr;
                self.slip += rate;
                if self.slip >= 1.0 {
                    self.slip -= 1.0;
                }
                let swell = 0.5 - 0.5 * (core::f32::consts::TAU * self.slip).cos();
                (n * (0.25 + 0.75 * spec.grain)) * swell * self.pressure_z
            }
        };

        // Tone: a one-pole pair used as a tilt. Low tone favours the fundamental, high tone
        // throws energy at the upper partials.
        let cut = 0.0006 + 0.35 * tone * tone;
        self.lp += (raw - self.lp) * cut;
        self.hp = raw - self.lp;
        let tilted = self.lp * (1.0 - tone) + self.hp * tone;

        tilted * level
    }

    /// True when a Strike exciter has finished its contact window. Continuous types answer
    /// false while gated, because they are still feeding the bank.
    #[inline]
    pub fn is_idle(&self) -> bool {
        self.impulse <= 0.0
    }
}
