// Wider — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Wider.
// Mid/side Density shapers plus a short interpolated delay on side (or mid) to widen.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct Wider {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    p: Box<[f64]>,
    count: i32,
    a: f32,
    b: f32,
    c: f32,
}

impl Wider {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            p: vec![0.0; 4099].into_boxed_slice(),
            count: 0,
            a: 0.5,
            b: 0.5,
            c: 1.0,
        }
    }
}

#[inline(always)]
fn shape(s: f64, density: f64) -> f64 {
    let out = density.abs();
    let mut bridgerectifier = s.abs() * 1.57079633;
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    if density > 0.0 { bridgerectifier = bridgerectifier.sin(); } else { bridgerectifier = 1.0 - bridgerectifier.cos(); }
    if s > 0.0 { (s * (1.0 - out)) + (bridgerectifier * out) } else { (s * (1.0 - out)) - (bridgerectifier * out) }
}

impl Plugin for Wider {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let densityside = (self.a as f64 * 2.0) - 1.0;
        let densitymid = (self.b as f64 * 2.0) - 1.0;
        let mut wet = self.c as f64;
        wet *= 0.5; // mid-side doubles everything, so premultiply
        let mut offset = (densityside - densitymid) / 2.0;
        if offset > 0.0 { offset = offset.sin(); }
        if offset < 0.0 { offset = -(-offset).sin(); }
        offset = -(offset.powf(4.0) * 20.0 * overallscale);
        let near = offset.abs().floor() as i32;
        let far_level = offset.abs() - near as f64;
        let far = near + 1;
        let near_level = 1.0 - far_level;

        for i in 0..l.len() {
            let input_sample_l = self.fpd_l.guard(l[i] as f64);
            let input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;
            let mut mid = input_sample_l + input_sample_r;
            let mut side = input_sample_l - input_sample_r;

            if densityside != 0.0 { side = shape(side, densityside); }
            if densitymid != 0.0 { mid = shape(mid, densitymid); }

            if self.count < 1 || self.count > 2048 { self.count = 2048; }
            let c = self.count as usize;
            // offset is always <= 0 after the negation above; the > 0 branch is kept as written.
            if offset > 0.0 {
                self.p[c + 2048] = mid;
                self.p[c] = mid;
                mid = self.p[c + near as usize] * near_level;
                mid += self.p[c + far as usize] * far_level;
            }
            if offset < 0.0 {
                self.p[c + 2048] = side;
                self.p[c] = side;
                side = self.p[c + near as usize] * near_level;
                side += self.p[c + far as usize] * far_level;
            }
            self.count -= 1;

            let mut input_sample_l = (dry_sample_l * (1.0 - wet)) + ((mid + side) * wet);
            let mut input_sample_r = (dry_sample_r * (1.0 - wet)) + ((mid - side) * wet);

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
