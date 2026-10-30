// Console7Channel — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Console7Channel.
// The channel half of Console7: a 20 kHz lowpass, a chased fader cubed before a Spiral/Density
// blend saturator, then re-amplified after it. 0.772 is unity for a full-scale sine.

use crate::common::{seed, Fpd};
use super::Plugin;

pub struct Console7Channel {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    gainchase: f64,
    chasespeed: f64,
    biquad_a: [f64; 15],
    a: f32,
}

impl Console7Channel {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self { sr, fpd_l: seed(seed_l), fpd_r: seed(seed_r), gainchase: -1.0, chasespeed: 64.0, biquad_a: [0.0; 15], a: 0.772 }
    }
}

/// Spiral blended 80/20 with regular Density ConsoleChannel.
#[inline(always)]
fn spiral_blend(mut s: f64) -> f64 {
    if s > 1.097 { s = 1.097; }
    if s < -1.097 { s = -1.097; }
    (((s * s.abs()).sin() / (if s.abs() == 0.0 { 1.0 } else { s.abs() })) * 0.8) + (s.sin() * 0.2)
}

impl Plugin for Console7Channel {
    fn set_param(&mut self, index: usize, value: f32) {
        if index == 0 { self.a = value; }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let sample_frames = l.len() as i32;
        let inputgain = self.a as f64 * 1.272019649514069;
        if self.gainchase != inputgain { self.chasespeed *= 2.0; }
        if self.chasespeed > sample_frames as f64 { self.chasespeed = sample_frames as f64; }
        if self.gainchase < 0.0 { self.gainchase = inputgain; }

        let bq = &mut self.biquad_a;
        bq[0] = 20000.0 / self.sr;
        bq[1] = 1.618033988749894848204586;

        let k = (std::f64::consts::PI * bq[0]).tan(); // lowpass
        let norm = 1.0 / (1.0 + k / bq[1] + k * k);
        bq[2] = k * k * norm;
        bq[3] = 2.0 * bq[2];
        bq[4] = bq[2];
        bq[5] = 2.0 * (k * k - 1.0) * norm;
        bq[6] = (1.0 - k / bq[1] + k * k) * norm;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let bq = &mut self.biquad_a;

            let out_sample_l = bq[2] * input_sample_l + bq[3] * bq[7] + bq[4] * bq[8] - bq[5] * bq[9] - bq[6] * bq[10];
            bq[8] = bq[7]; bq[7] = input_sample_l; input_sample_l = out_sample_l; bq[10] = bq[9]; bq[9] = input_sample_l; // DF1 left

            let out_sample_r = bq[2] * input_sample_r + bq[3] * bq[11] + bq[4] * bq[12] - bq[5] * bq[13] - bq[6] * bq[14];
            bq[12] = bq[11]; bq[11] = input_sample_r; input_sample_r = out_sample_r; bq[14] = bq[13]; bq[13] = input_sample_r; // DF1 right

            self.chasespeed *= 0.9999; self.chasespeed -= 0.01; if self.chasespeed < 64.0 { self.chasespeed = 64.0; }
            self.gainchase = ((self.gainchase * self.chasespeed) + inputgain) / (self.chasespeed + 1.0);
            if 1.0 != self.gainchase {
                input_sample_l *= self.gainchase.powf(3.0);
                input_sample_r *= self.gainchase.powf(3.0);
            }

            input_sample_l = spiral_blend(input_sample_l);
            input_sample_r = spiral_blend(input_sample_r);

            if 1.0 != self.gainchase && 0.0 != self.gainchase {
                input_sample_l /= self.gainchase;
                input_sample_r /= self.gainchase;
            }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
