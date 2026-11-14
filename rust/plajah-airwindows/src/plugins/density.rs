// Density — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Density.
// A sine-shaper saturator with a highpass "iir" before it: Density >0 thickens, <0 starves.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct Density {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    iir_sample_al: f64,
    iir_sample_bl: f64,
    iir_sample_ar: f64,
    iir_sample_br: f64,
    fp_flip: bool,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
}

impl Density {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            iir_sample_al: 0.0,
            iir_sample_bl: 0.0,
            iir_sample_ar: 0.0,
            iir_sample_br: 0.0,
            fp_flip: true,
            a: 0.2,
            b: 0.0,
            c: 1.0,
            d: 1.0,
        }
    }
}

#[inline(always)]
fn shape(s: f64, density: f64, out: f64) -> f64 {
    let mut bridgerectifier = s.abs() * 1.57079633;
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    if density > 0.0 { bridgerectifier = bridgerectifier.sin(); } else { bridgerectifier = 1.0 - bridgerectifier.cos(); }
    if s > 0.0 { (s * (1.0 - out)) + (bridgerectifier * out) } else { (s * (1.0 - out)) - (bridgerectifier * out) }
}

#[inline(always)]
fn sine_clip(s: f64) -> f64 {
    let mut bridgerectifier = s.abs() * 1.57079633;
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    bridgerectifier = bridgerectifier.sin();
    if s > 0.0 { bridgerectifier } else { -bridgerectifier }
}

impl Plugin for Density {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, 3 => self.d = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let mut density = (self.a as f64 * 5.0) - 1.0;
        let iir_amount = (self.b as f64).powf(3.0) / overallscale;
        let output = self.c as f64;
        let wet = self.d as f64;
        let dry = 1.0 - wet;
        let mut out = density.abs();
        density *= density.abs();

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            if self.fp_flip {
                self.iir_sample_al = (self.iir_sample_al * (1.0 - iir_amount)) + (input_sample_l * iir_amount);
                input_sample_l -= self.iir_sample_al;
                self.iir_sample_ar = (self.iir_sample_ar * (1.0 - iir_amount)) + (input_sample_r * iir_amount);
                input_sample_r -= self.iir_sample_ar;
            } else {
                self.iir_sample_bl = (self.iir_sample_bl * (1.0 - iir_amount)) + (input_sample_l * iir_amount);
                input_sample_l -= self.iir_sample_bl;
                self.iir_sample_br = (self.iir_sample_br * (1.0 - iir_amount)) + (input_sample_r * iir_amount);
                input_sample_r -= self.iir_sample_br;
            }
            self.fp_flip = !self.fp_flip;

            let mut count = density;
            while count > 1.0 {
                input_sample_l = sine_clip(input_sample_l);
                input_sample_r = sine_clip(input_sample_r);
                count -= 1.0;
            }

            // The original wraps `out` inside the sample loop; it only changes on the first pass.
            while out > 1.0 { out -= 1.0; }

            input_sample_l = shape(input_sample_l, density, out);
            input_sample_r = shape(input_sample_r, density, out);

            if output < 1.0 {
                input_sample_l *= output;
                input_sample_r *= output;
            }
            if wet < 1.0 {
                input_sample_l = (dry_sample_l * dry) + (input_sample_l * wet);
                input_sample_r = (dry_sample_r * dry) + (input_sample_r * wet);
            }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
