// Mojo — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Mojo.
// A soft-saturating wavefolder that flattens out very gently before it folds; A is ±12 dB drive.

use crate::common::{seed, Fpd};
use super::Plugin;

pub struct Mojo {
    #[allow(dead_code)]
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    a: f32,
}

impl Mojo {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self { sr, fpd_l: seed(seed_l), fpd_r: seed(seed_r), a: 0.5 }
    }
}

impl Plugin for Mojo {
    fn set_param(&mut self, index: usize, value: f32) {
        if index == 0 { self.a = value; }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let gain = 10.0f64.powf(((self.a as f64 * 24.0) - 12.0) / 20.0);

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);

            if gain != 1.0 {
                input_sample_l *= gain;
                input_sample_r *= gain;
            }

            let mut mojo = input_sample_l.abs().powf(0.25);
            if mojo > 0.0 { input_sample_l = ((input_sample_l * mojo * std::f64::consts::PI * 0.5).sin() / mojo) * 0.987654321; }
            mojo = input_sample_r.abs().powf(0.25);
            if mojo > 0.0 { input_sample_r = ((input_sample_r * mojo * std::f64::consts::PI * 0.5).sin() / mojo) * 0.987654321; }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
