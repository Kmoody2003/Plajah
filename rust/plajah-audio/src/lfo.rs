//! LFOs. Free-running or tempo-synced, with drawable custom shapes (a small breakpoint table)
//! so the UI can offer a Serum-style LFO editor without a second engine path.

use crate::osc::Rng;

pub const CUSTOM_POINTS: usize = 33; // 32 segments + wrap point

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LfoShape {
    Sine,
    Triangle,
    Saw,
    Square,
    SampleHold,
    Custom,
}

impl LfoShape {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => LfoShape::Triangle,
            2 => LfoShape::Saw,
            3 => LfoShape::Square,
            4 => LfoShape::SampleHold,
            5 => LfoShape::Custom,
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
    phase: f32,
    sh_value: f32,
    sh_last_phase: f32,
    age: f32,
    value: f32,
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
            phase: 0.0,
            sh_value: 0.0,
            sh_last_phase: 0.0,
            age: 0.0,
            value: 0.0,
        }
    }
}

impl Lfo {
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
                let x = t * (CUSTOM_POINTS - 1) as f32;
                let i = (x as usize).min(CUSTOM_POINTS - 2);
                let f = x - i as f32;
                self.custom[i] * (1.0 - f) + self.custom[i + 1] * f
            }
        };

        let faded = if self.fade > 0.0 { (self.age / self.fade).min(1.0) } else { 1.0 };
        self.value = if self.bipolar { raw * faded } else { (raw * 0.5 + 0.5) * faded };
        self.value
    }
}
