// DeEss — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/DeEss.
// Slew-of-slew sibilance detector driving a ratio that pulls the signal toward a one-pole lowpass.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct DeEss {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    s1_l: f64,
    s2_l: f64,
    s3_l: f64,
    m1_l: f64,
    m2_l: f64,
    ratio_al: f64,
    ratio_bl: f64,
    iir_sample_al: f64,
    iir_sample_bl: f64,
    s1_r: f64,
    s2_r: f64,
    s3_r: f64,
    m1_r: f64,
    m2_r: f64,
    ratio_ar: f64,
    ratio_br: f64,
    iir_sample_ar: f64,
    iir_sample_br: f64,
    flip: bool,
    // The original keeps these as function-local `static int`s (process-wide, first value 0 /
    // 850010). Per instance here; identical for a single instance in a fresh process.
    noisesource_l: i32,
    noisesource_r: i32,
    a: f32,
    b: f32,
    c: f32,
}

impl DeEss {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            s1_l: 0.0,
            s2_l: 0.0,
            s3_l: 0.0,
            m1_l: 0.0,
            m2_l: 0.0,
            ratio_al: 1.0,
            ratio_bl: 1.0,
            iir_sample_al: 0.0,
            iir_sample_bl: 0.0,
            s1_r: 0.0,
            s2_r: 0.0,
            s3_r: 0.0,
            m1_r: 0.0,
            m2_r: 0.0,
            ratio_ar: 1.0,
            ratio_br: 1.0,
            iir_sample_ar: 0.0,
            iir_sample_br: 0.0,
            flip: false,
            noisesource_l: 0,
            noisesource_r: 850010,
            a: 0.0,
            b: 0.5,
            c: 0.5,
        }
    }
}

/// The "live air" residue noise: int math with C's wrapping overflow and truncating `%`.
#[inline(always)]
fn air(noisesource: &mut i32, mut input_sample: f64) -> f64 {
    *noisesource = *noisesource % 1700021; *noisesource += 1;
    let mut residue = noisesource.wrapping_mul(*noisesource);
    residue = residue % 170003; residue = residue.wrapping_mul(residue);
    residue = residue % 17011; residue = residue.wrapping_mul(residue);
    residue = residue % 1709; residue = residue.wrapping_mul(residue);
    residue = residue % 173; residue = residue.wrapping_mul(residue);
    residue = residue % 17;
    let mut applyresidue = residue as f64;
    applyresidue *= 0.00000001;
    applyresidue *= 0.00000001;
    input_sample += applyresidue;
    if input_sample < 1.2e-38 && -input_sample < 1.2e-38 {
        input_sample -= applyresidue;
    }
    input_sample
}

impl Plugin for DeEss {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);

        let intensity = (self.a as f64).powf(5.0) * (8192.0 / overallscale);
        let maxdess = 1.0 / 10.0f64.powf(((self.b as f64 - 1.0) * 48.0) / 20.0);
        let iir_amount = (self.c as f64).powf(2.0) / overallscale;
        let mut offset;
        let mut sense;
        let mut recovery;
        let mut attackspeed;

        for i in 0..l.len() {
            let mut input_sample_l = l[i] as f64;
            let mut input_sample_r = r[i] as f64;

            input_sample_l = air(&mut self.noisesource_l, input_sample_l);
            input_sample_r = air(&mut self.noisesource_r, input_sample_r);

            self.s3_l = self.s2_l;
            self.s2_l = self.s1_l;
            self.s1_l = input_sample_l;
            self.m1_l = (self.s1_l - self.s2_l) * ((self.s1_l - self.s2_l) / 1.3);
            self.m2_l = (self.s2_l - self.s3_l) * ((self.s1_l - self.s2_l) / 1.3);
            sense = ((self.m1_l - self.m2_l) * ((self.m1_l - self.m2_l) / 1.3)).abs();
            attackspeed = 7.0 + (sense * 1024.0);

            sense = 1.0 + (intensity * intensity * sense);
            if sense > intensity { sense = intensity; }
            recovery = 1.0 + (0.01 / sense);

            offset = 1.0 - input_sample_l.abs();

            if self.flip {
                self.iir_sample_al = (self.iir_sample_al * (1.0 - (offset * iir_amount))) + (input_sample_l * (offset * iir_amount));
                if self.ratio_al < sense { self.ratio_al = ((self.ratio_al * attackspeed) + sense) / (attackspeed + 1.0); }
                else { self.ratio_al = 1.0 + ((self.ratio_al - 1.0) / recovery); }
                if self.ratio_al > maxdess { self.ratio_al = maxdess; }
                input_sample_l = self.iir_sample_al + ((input_sample_l - self.iir_sample_al) / self.ratio_al);
            } else {
                self.iir_sample_bl = (self.iir_sample_bl * (1.0 - (offset * iir_amount))) + (input_sample_l * (offset * iir_amount));
                if self.ratio_bl < sense { self.ratio_bl = ((self.ratio_bl * attackspeed) + sense) / (attackspeed + 1.0); }
                else { self.ratio_bl = 1.0 + ((self.ratio_bl - 1.0) / recovery); }
                if self.ratio_bl > maxdess { self.ratio_bl = maxdess; }
                input_sample_l = self.iir_sample_bl + ((input_sample_l - self.iir_sample_bl) / self.ratio_bl);
            }

            self.s3_r = self.s2_r;
            self.s2_r = self.s1_r;
            self.s1_r = input_sample_r;
            self.m1_r = (self.s1_r - self.s2_r) * ((self.s1_r - self.s2_r) / 1.3);
            self.m2_r = (self.s2_r - self.s3_r) * ((self.s1_r - self.s2_r) / 1.3);
            sense = ((self.m1_r - self.m2_r) * ((self.m1_r - self.m2_r) / 1.3)).abs();
            attackspeed = 7.0 + (sense * 1024.0);

            sense = 1.0 + (intensity * intensity * sense);
            if sense > intensity { sense = intensity; }
            recovery = 1.0 + (0.01 / sense);

            offset = 1.0 - input_sample_r.abs();

            if self.flip {
                self.iir_sample_ar = (self.iir_sample_ar * (1.0 - (offset * iir_amount))) + (input_sample_r * (offset * iir_amount));
                if self.ratio_ar < sense { self.ratio_ar = ((self.ratio_ar * attackspeed) + sense) / (attackspeed + 1.0); }
                else { self.ratio_ar = 1.0 + ((self.ratio_ar - 1.0) / recovery); }
                if self.ratio_ar > maxdess { self.ratio_ar = maxdess; }
                input_sample_r = self.iir_sample_ar + ((input_sample_r - self.iir_sample_ar) / self.ratio_ar);
            } else {
                self.iir_sample_br = (self.iir_sample_br * (1.0 - (offset * iir_amount))) + (input_sample_r * (offset * iir_amount));
                if self.ratio_br < sense { self.ratio_br = ((self.ratio_br * attackspeed) + sense) / (attackspeed + 1.0); }
                else { self.ratio_br = 1.0 + ((self.ratio_br - 1.0) / recovery); }
                if self.ratio_br > maxdess { self.ratio_br = maxdess; }
                input_sample_r = self.iir_sample_br + ((input_sample_r - self.iir_sample_br) / self.ratio_br);
            }

            self.flip = !self.flip;

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
