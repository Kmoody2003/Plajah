// Pressure4 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Pressure4.
// A vari-mu compressor with stereo-linked sensing, flip-flopped A/B coefficient sets and a
// sine-clip second stage.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct Pressure4 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    mu_vary: f64,
    mu_attack: f64,
    mu_new_speed: f64,
    mu_speed_a: f64,
    mu_speed_b: f64,
    mu_coefficient_a: f64,
    mu_coefficient_b: f64,
    flip: bool,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
}

impl Pressure4 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            mu_vary: 1.0,
            mu_attack: 0.0,
            mu_new_speed: 0.0,
            mu_speed_a: 10000.0,
            mu_speed_b: 10000.0,
            mu_coefficient_a: 1.0,
            mu_coefficient_b: 1.0,
            flip: false,
            a: 0.0,
            b: 0.2,
            c: 1.0,
            d: 1.0,
        }
    }
}

#[inline(always)]
fn clip_stage(s: f64) -> f64 {
    let mut bridgerectifier = s.abs();
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.0; } else { bridgerectifier = bridgerectifier.sin(); }
    if s > 0.0 { bridgerectifier } else { -bridgerectifier }
}

impl Plugin for Pressure4 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, 3 => self.d = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let threshold = 1.0 - (self.a as f64 * 0.95);
        let mu_makeup_gain = 1.0 / threshold;
        let mut release = (1.28 - self.b as f64).powf(5.0) * 32768.0;
        release /= overallscale;
        let fastest = release.sqrt();
        let mut coefficient: f64;
        let mut mewiness = (self.c as f64 * 2.0) - 1.0;
        let unmewiness: f64;
        let output_gain = self.d as f64;
        let positivemu: bool;
        if mewiness >= 0.0 {
            positivemu = true;
            unmewiness = 1.0 - mewiness;
        } else {
            positivemu = false;
            mewiness = -mewiness;
            unmewiness = 1.0 - mewiness;
        }

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);

            input_sample_l = input_sample_l * mu_makeup_gain;
            input_sample_r = input_sample_r * mu_makeup_gain;

            let mut input_sense = input_sample_l.abs();
            if input_sample_r.abs() > input_sense { input_sense = input_sample_r.abs(); }

            if self.flip {
                if input_sense > threshold {
                    self.mu_vary = threshold / input_sense;
                    self.mu_attack = self.mu_speed_a.abs().sqrt();
                    self.mu_coefficient_a = self.mu_coefficient_a * (self.mu_attack - 1.0);
                    if self.mu_vary < threshold {
                        self.mu_coefficient_a = self.mu_coefficient_a + threshold;
                    } else {
                        self.mu_coefficient_a = self.mu_coefficient_a + self.mu_vary;
                    }
                    self.mu_coefficient_a = self.mu_coefficient_a / self.mu_attack;
                } else {
                    self.mu_coefficient_a = self.mu_coefficient_a * ((self.mu_speed_a * self.mu_speed_a) - 1.0);
                    self.mu_coefficient_a = self.mu_coefficient_a + 1.0;
                    self.mu_coefficient_a = self.mu_coefficient_a / (self.mu_speed_a * self.mu_speed_a);
                }
                self.mu_new_speed = self.mu_speed_a * (self.mu_speed_a - 1.0);
                self.mu_new_speed = self.mu_new_speed + (input_sense * release).abs() + fastest;
                self.mu_speed_a = self.mu_new_speed / self.mu_speed_a;
            } else {
                if input_sense > threshold {
                    self.mu_vary = threshold / input_sense;
                    self.mu_attack = self.mu_speed_b.abs().sqrt();
                    self.mu_coefficient_b = self.mu_coefficient_b * (self.mu_attack - 1.0);
                    if self.mu_vary < threshold {
                        self.mu_coefficient_b = self.mu_coefficient_b + threshold;
                    } else {
                        self.mu_coefficient_b = self.mu_coefficient_b + self.mu_vary;
                    }
                    self.mu_coefficient_b = self.mu_coefficient_b / self.mu_attack;
                } else {
                    self.mu_coefficient_b = self.mu_coefficient_b * ((self.mu_speed_b * self.mu_speed_b) - 1.0);
                    self.mu_coefficient_b = self.mu_coefficient_b + 1.0;
                    self.mu_coefficient_b = self.mu_coefficient_b / (self.mu_speed_b * self.mu_speed_b);
                }
                self.mu_new_speed = self.mu_speed_b * (self.mu_speed_b - 1.0);
                self.mu_new_speed = self.mu_new_speed + (input_sense * release).abs() + fastest;
                self.mu_speed_b = self.mu_new_speed / self.mu_speed_b;
            }
            // got coefficients, adjusted speeds

            if self.flip {
                if positivemu { coefficient = self.mu_coefficient_a.powf(2.0); } else { coefficient = self.mu_coefficient_a.sqrt(); }
                coefficient = (coefficient * mewiness) + (self.mu_coefficient_a * unmewiness);
                input_sample_l *= coefficient;
                input_sample_r *= coefficient;
            } else {
                if positivemu { coefficient = self.mu_coefficient_b.powf(2.0); } else { coefficient = self.mu_coefficient_b.sqrt(); }
                coefficient = (coefficient * mewiness) + (self.mu_coefficient_b * unmewiness);
                input_sample_l *= coefficient;
                input_sample_r *= coefficient;
            }
            // Note: the original never toggles `flip` in this loop — it stays false forever.

            if output_gain != 1.0 {
                input_sample_l *= output_gain;
                input_sample_r *= output_gain;
            }

            input_sample_l = clip_stage(input_sample_l);
            input_sample_r = clip_stage(input_sample_r);

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
