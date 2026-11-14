//! LFOs. Free-running or tempo-synced, with drawable custom shapes (a small breakpoint table)
//! and crisp step-sequencer tables so the UI can offer a Serum-style LFO editor and step lane
//! without a second engine path.

use crate::osc::Rng;

pub const CUSTOM_POINTS: usize = 65; // 64 segments + wrap point (or up to 64 crisp steps)

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LfoShape {
    Sine,
    Triangle,
    Saw,
    Square,
    SampleHold,
    Custom,
    /// VELA's Drift shape: a seeded random walk with a slow pull back toward centre.
    ///
    /// The point is that it is aperiodic. Every other shape here repeats, and on a session that
    /// runs for twenty minutes a repeating modulation is the thing that makes a generative
    /// system audibly mechanical. Tide never returns to a previous state.
    Tide,
}

impl LfoShape {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => LfoShape::Triangle,
            2 => LfoShape::Saw,
            3 => LfoShape::Square,
            4 => LfoShape::SampleHold,
            5 => LfoShape::Custom,
            6 => LfoShape::Tide,
            _ => LfoShape::Sine,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Lfo {
    pub shape: LfoShape,
    /// Hz when free-running; ignored when `sync_beats` > 0.
    pub rate_hz: f32,
    /// Length of one cycle in beats. 0 = free-running.
    pub sync_beats: f32,
    pub bipolar: bool,
    pub retrigger: bool,
    /// Fade-in time in seconds — delayed vibrato is one of the oldest tricks and still musical.
    pub fade: f32,
    pub custom: [f32; CUSTOM_POINTS],
    pub custom_len: usize,
    pub custom_stepped: bool,
    phase: f32,
    sh_value: f32,
    sh_last_phase: f32,
    age: f32,
    value: f32,
    /// Tide state: the walk's current position and the target it is drifting toward.
    tide: f32,
    tide_target: f32,
}

impl Default for Lfo {
    fn default() -> Self {
        Self {
            shape: LfoShape::Sine,
            rate_hz: 2.0,
            sync_beats: 0.0,
            bipolar: true,
            retrigger: true,
            fade: 0.0,
            custom: [0.0; CUSTOM_POINTS],
            custom_len: CUSTOM_POINTS,
            custom_stepped: false,
            phase: 0.0,
            sh_value: 0.0,
            sh_last_phase: 0.0,
            age: 0.0,
            value: 0.0,
            tide: 0.0,
            tide_target: 0.0,
        }
    }
}

impl Lfo {
    /// Load custom curve or step-sequencer values (`-1.0..=1.0`).
    pub fn set_custom(&mut self, pts: &[f32], stepped: bool) {
        if pts.is_empty() {
            return;
        }
        self.custom_stepped = stepped;
        if stepped {
            let n = pts.len().min(CUSTOM_POINTS - 1).max(1);
            self.custom_len = n;
            for i in 0..n {
                self.custom[i] = if pts[i].is_finite() { pts[i].clamp(-1.0, 1.0) } else { 0.0 };
            }
            self.custom[n] = self.custom[0];
        } else if pts.len() == CUSTOM_POINTS {
            self.custom_len = CUSTOM_POINTS;
            for i in 0..CUSTOM_POINTS {
                self.custom[i] = if pts[i].is_finite() { pts[i].clamp(-1.0, 1.0) } else { 0.0 };
            }
        } else {
            self.custom_len = CUSTOM_POINTS;
            let src_last = (pts.len() - 1).max(1) as f32;
            for i in 0..CUSTOM_POINTS {
                let pos = (i as f32 / (CUSTOM_POINTS - 1) as f32) * src_last;
                let k = (pos as usize).min(pts.len() - 1);
                let k1 = (k + 1).min(pts.len() - 1);
                let f = pos - k as f32;
                let a = if pts[k].is_finite() { pts[k] } else { 0.0 };
                let b = if pts[k1].is_finite() { pts[k1] } else { 0.0 };
                self.custom[i] = (a * (1.0 - f) + b * f).clamp(-1.0, 1.0);
            }
        }
    }

    pub fn force_reset(&mut self, rng: &mut Rng) {
        self.phase = 0.0;
        self.age = 0.0;
        self.sh_value = rng.bipolar();
        self.sh_last_phase = 0.0;
        self.tide = 0.0;
        self.tide_target = rng.bipolar();
    }

    pub fn reset_fade(&mut self) {
        self.age = 0.0;
    }

    pub fn retrigger_now(&mut self, rng: &mut Rng) {
        if self.retrigger {
            self.phase = 0.0;
            self.age = 0.0;
            self.sh_value = rng.bipolar();
            self.sh_last_phase = 0.0;
        }
    }

    #[inline]
    pub fn value(&self) -> f32 {
        self.value
    }

    /// `beats_per_sec` lets synced LFOs follow the transport without the caller converting.
    #[inline]
    pub fn tick(&mut self, dt: f32, beats_per_sec: f32, rng: &mut Rng) -> f32 {
        let inc = if self.sync_beats > 0.0 {
            (beats_per_sec / self.sync_beats) * dt
        } else {
            self.rate_hz * dt
        };
        self.phase += inc;
        if self.phase >= 1.0 {
            self.phase -= self.phase.floor();
        }
        self.age += dt;

        let t = self.phase;
        let raw = match self.shape {
            LfoShape::Sine => (core::f32::consts::TAU * t).sin(),
            LfoShape::Triangle => 4.0 * (t - (t + 0.5).floor()).abs() - 1.0,
            LfoShape::Saw => 2.0 * t - 1.0,
            LfoShape::Square => if t < 0.5 { 1.0 } else { -1.0 },
            LfoShape::SampleHold => {
                if t < self.sh_last_phase {
                    self.sh_value = rng.bipolar();
                }
                self.sh_last_phase = t;
                self.sh_value
            }
            LfoShape::Custom => {
                if self.custom_stepped {
                    let n = self.custom_len.max(1).min(CUSTOM_POINTS - 1);
                    let idx = ((t * n as f32) as usize).min(n - 1);
                    self.custom[idx]
                } else {
                    let segs = (self.custom_len.max(2) - 1) as f32;
                    let x = t * segs;
                    let i = (x as usize).min(CUSTOM_POINTS - 2);
                    let f = x - i as f32;
                    self.custom[i] * (1.0 - f) + self.custom[i + 1] * f
                }
            }
            LfoShape::Tide => {
                // A new target each time the phase wraps, then a slow glide toward it with a
                // gentle pull to zero so the walk can never drift off and stay off.
                if t < self.sh_last_phase {
                    self.tide_target = rng.bipolar();
                }
                self.sh_last_phase = t;
                let k = (inc * 6.0).clamp(0.0, 0.25);
                self.tide += (self.tide_target - self.tide) * k;
                self.tide -= self.tide * k * 0.18;
                self.tide.clamp(-1.0, 1.0)
            }
        };

        let faded = if self.fade > 0.0 { (self.age / self.fade).min(1.0) } else { 1.0 };
        self.value = if self.bipolar { raw * faded } else { (raw * 0.5 + 0.5) * faded };
        self.value
    }
}
