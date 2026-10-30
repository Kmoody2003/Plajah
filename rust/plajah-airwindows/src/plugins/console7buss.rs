// Console7Buss — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Console7Buss.
// Gain-chased trim into an asin "Spiral" blend, bracketed by two 20 kHz biquad lowpasses.

use crate::common::{seed, Fpd};
use super::Plugin;

pub struct Console7Buss {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    gainchase: f64,
    chasespeed: f64,
    biquad_a: [f64; 15],
    biquad_b: [f64; 15],
    a: f32,
}

impl Console7Buss {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            gainchase: -1.0,
            chasespeed: 64.0,
            biquad_a: [0.0; 15],
            biquad_b: [0.0; 15],
            a: 1.0,
        }
    }
}

/// asin Spiral blended with plain asin ConsoleBuss (same expression for both channels).
#[inline(always)]
fn spiral(mut s: f64) -> f64 {
    if s > 1.0 { s = 1.0; }
    if s < -1.0 { s = -1.0; }
    (((s * s.abs()).asin() / (if s.abs() == 0.0 { 1.0 } else { s.abs() })) * 0.618033988749894848204586) + (s.asin() * 0.381966011250105)
}

impl Plugin for Console7Buss {
    fn set_param(&mut self, index: usize, value: f32) {
        if index == 0 { self.a = value; }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let sample_frames = l.len() as i32;
        let inputgain = self.a as f64 * 1.03;

        if self.gainchase != inputgain { self.chasespeed *= 2.0; }
        if self.chasespeed > sample_frames as f64 { self.chasespeed = sample_frames as f64; }
        if self.gainchase < 0.0 { self.gainchase = inputgain; }

        {
            let ba = &mut self.biquad_a;
            let bb = &mut self.biquad_b;
            ba[0] = 20000.0 / self.sr;
            bb[0] = ba[0];
            ba[1] = 0.618033988749894848204586;
            bb[1] = 0.5;

            let mut k = (std::f64::consts::PI * ba[0]).tan();
            let mut norm = 1.0 / (1.0 + k / ba[1] + k * k);
            ba[2] = k * k * norm;
            ba[3] = 2.0 * ba[2];
            ba[4] = ba[2];
            ba[5] = 2.0 * (k * k - 1.0) * norm;
            ba[6] = (1.0 - k / ba[1] + k * k) * norm;

            k = (std::f64::consts::PI * ba[0]).tan();
            norm = 1.0 / (1.0 + k / bb[1] + k * k);
            bb[2] = k * k * norm;
            bb[3] = 2.0 * bb[2];
            bb[4] = bb[2];
            bb[5] = 2.0 * (k * k - 1.0) * norm;
            bb[6] = (1.0 - k / bb[1] + k * k) * norm;
        }

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);

            let ba = &mut self.biquad_a;
            let mut out_sample_l = ba[2] * input_sample_l + ba[3] * ba[7] + ba[4] * ba[8] - ba[5] * ba[9] - ba[6] * ba[10];
            ba[8] = ba[7]; ba[7] = input_sample_l; input_sample_l = out_sample_l; ba[10] = ba[9]; ba[9] = input_sample_l;

            let mut out_sample_r = ba[2] * input_sample_r + ba[3] * ba[11] + ba[4] * ba[12] - ba[5] * ba[13] - ba[6] * ba[14];
            ba[12] = ba[11]; ba[11] = input_sample_r; input_sample_r = out_sample_r; ba[14] = ba[13]; ba[13] = input_sample_r;

            self.chasespeed *= 0.9999; self.chasespeed -= 0.01; if self.chasespeed < 64.0 { self.chasespeed = 64.0; }
            self.gainchase = ((self.gainchase * self.chasespeed) + inputgain) / (self.chasespeed + 1.0);
            if 1.0 != self.gainchase { input_sample_l *= self.gainchase.sqrt(); input_sample_r *= self.gainchase.sqrt(); }

            input_sample_l = spiral(input_sample_l);
            input_sample_r = spiral(input_sample_r);

            let bb = &mut self.biquad_b;
            out_sample_l = bb[2] * input_sample_l + bb[3] * bb[7] + bb[4] * bb[8] - bb[5] * bb[9] - bb[6] * bb[10];
            bb[8] = bb[7]; bb[7] = input_sample_l; input_sample_l = out_sample_l; bb[10] = bb[9]; bb[9] = input_sample_l;

            out_sample_r = bb[2] * input_sample_r + bb[3] * bb[11] + bb[4] * bb[12] - bb[5] * bb[13] - bb[6] * bb[14];
            bb[12] = bb[11]; bb[11] = input_sample_r; input_sample_r = out_sample_r; bb[14] = bb[13]; bb[13] = input_sample_r;

            if 1.0 != self.gainchase { input_sample_l *= self.gainchase.sqrt(); input_sample_r *= self.gainchase.sqrt(); }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
