// PurestDrive — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/PurestDrive.
// A sine saturator whose drive follows the previous sample: quiet or polarity-flipping passages stay clean.

use crate::common::{seed, Fpd};
use super::Plugin;

pub struct PurestDrive {
    #[allow(dead_code)]
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    previous_sample_l: f64,
    previous_sample_r: f64,
    a: f32,
}

impl PurestDrive {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self { sr, fpd_l: seed(seed_l), fpd_r: seed(seed_r), previous_sample_l: 0.0, previous_sample_r: 0.0, a: 0.0 }
    }
}

impl Plugin for PurestDrive {
    fn set_param(&mut self, index: usize, value: f32) {
        if index == 0 { self.a = value; }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let intensity = self.a as f64;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            input_sample_l = input_sample_l.sin();
            let mut apply = ((self.previous_sample_l + input_sample_l).abs() / 2.0) * intensity;
            input_sample_l = (dry_sample_l * (1.0 - apply)) + (input_sample_l * apply);
            self.previous_sample_l = dry_sample_l.sin();

            input_sample_r = input_sample_r.sin();
            apply = ((self.previous_sample_r + input_sample_r).abs() / 2.0) * intensity;
            input_sample_r = (dry_sample_r * (1.0 - apply)) + (input_sample_r * apply);
            self.previous_sample_r = dry_sample_r.sin();

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
