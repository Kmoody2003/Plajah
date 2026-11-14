// DrumSlam — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/DrumSlam.
// Splits into low/mid/high with paired one-poles, shapes each band, and slams the mids with a
// slew-dependent "skew" saturator.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct DrumSlam {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    iir_sample_al: f64,
    iir_sample_bl: f64,
    iir_sample_cl: f64,
    iir_sample_dl: f64,
    iir_sample_el: f64,
    iir_sample_fl: f64,
    iir_sample_gl: f64,
    iir_sample_hl: f64,
    last_sample_l: f64,
    iir_sample_ar: f64,
    iir_sample_br: f64,
    iir_sample_cr: f64,
    iir_sample_dr: f64,
    iir_sample_er: f64,
    iir_sample_fr: f64,
    iir_sample_gr: f64,
    iir_sample_hr: f64,
    last_sample_r: f64,
    fp_flip: bool,
    a: f32,
    b: f32,
    c: f32,
}

impl DrumSlam {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            iir_sample_al: 0.0,
            iir_sample_bl: 0.0,
            iir_sample_cl: 0.0,
            iir_sample_dl: 0.0,
            iir_sample_el: 0.0,
            iir_sample_fl: 0.0,
            iir_sample_gl: 0.0,
            iir_sample_hl: 0.0,
            last_sample_l: 0.0,
            iir_sample_ar: 0.0,
            iir_sample_br: 0.0,
            iir_sample_cr: 0.0,
            iir_sample_dr: 0.0,
            iir_sample_er: 0.0,
            iir_sample_fr: 0.0,
            iir_sample_gr: 0.0,
            iir_sample_hr: 0.0,
            last_sample_r: 0.0,
            fp_flip: true,
            a: 0.0,
            b: 1.0,
            c: 1.0,
        }
    }
}

/// The mid-band skew saturator (written out twice, identically, in the original).
#[inline(always)]
fn slam_mid(mut mid_sample: f64, last_sample: &mut f64, drive: f64) -> f64 {
    let mut skew = mid_sample - *last_sample;
    *last_sample = mid_sample;
    let mut bridgerectifier = skew.abs();
    if bridgerectifier > 3.1415926 { bridgerectifier = 3.1415926; }
    bridgerectifier = bridgerectifier.sin();
    if skew > 0.0 { skew = bridgerectifier * 3.1415926; } else { skew = -bridgerectifier * 3.1415926; }
    skew *= mid_sample;
    skew *= 1.557079633;
    bridgerectifier = mid_sample.abs();
    bridgerectifier += skew;
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    bridgerectifier = bridgerectifier.sin();
    bridgerectifier *= drive;
    bridgerectifier += skew;
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    bridgerectifier = bridgerectifier.sin();
    if mid_sample > 0.0 { mid_sample = bridgerectifier; } else { mid_sample = -bridgerectifier; }
    mid_sample
}

impl Plugin for DrumSlam {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let mut iir_amount_l = 0.0819;
        iir_amount_l /= overallscale;
        let mut iir_amount_h = 0.377933067;
        iir_amount_h /= overallscale;
        let drive = (self.a as f64 * 3.0) + 1.0;
        let out = self.b as f64;
        let wet = self.c as f64;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;
            let mut low_sample_l;
            let mut low_sample_r;
            let mut mid_sample_l;
            let mut mid_sample_r;
            let mut high_sample_l;
            let mut high_sample_r;

            input_sample_l *= drive;
            input_sample_r *= drive;

            if self.fp_flip {
                self.iir_sample_al = (self.iir_sample_al * (1.0 - iir_amount_l)) + (input_sample_l * iir_amount_l);
                self.iir_sample_bl = (self.iir_sample_bl * (1.0 - iir_amount_l)) + (self.iir_sample_al * iir_amount_l);
                low_sample_l = self.iir_sample_bl;

                self.iir_sample_ar = (self.iir_sample_ar * (1.0 - iir_amount_l)) + (input_sample_r * iir_amount_l);
                self.iir_sample_br = (self.iir_sample_br * (1.0 - iir_amount_l)) + (self.iir_sample_ar * iir_amount_l);
                low_sample_r = self.iir_sample_br;

                self.iir_sample_el = (self.iir_sample_el * (1.0 - iir_amount_h)) + (input_sample_l * iir_amount_h);
                self.iir_sample_fl = (self.iir_sample_fl * (1.0 - iir_amount_h)) + (self.iir_sample_el * iir_amount_h);
                mid_sample_l = self.iir_sample_fl - self.iir_sample_bl;

                self.iir_sample_er = (self.iir_sample_er * (1.0 - iir_amount_h)) + (input_sample_r * iir_amount_h);
                self.iir_sample_fr = (self.iir_sample_fr * (1.0 - iir_amount_h)) + (self.iir_sample_er * iir_amount_h);
                mid_sample_r = self.iir_sample_fr - self.iir_sample_br;

                high_sample_l = input_sample_l - self.iir_sample_fl;
                high_sample_r = input_sample_r - self.iir_sample_fr;
            } else {
                self.iir_sample_cl = (self.iir_sample_cl * (1.0 - iir_amount_l)) + (input_sample_l * iir_amount_l);
                self.iir_sample_dl = (self.iir_sample_dl * (1.0 - iir_amount_l)) + (self.iir_sample_cl * iir_amount_l);
                low_sample_l = self.iir_sample_dl;

                self.iir_sample_cr = (self.iir_sample_cr * (1.0 - iir_amount_l)) + (input_sample_r * iir_amount_l);
                self.iir_sample_dr = (self.iir_sample_dr * (1.0 - iir_amount_l)) + (self.iir_sample_cr * iir_amount_l);
                low_sample_r = self.iir_sample_dr;

                self.iir_sample_gl = (self.iir_sample_gl * (1.0 - iir_amount_h)) + (input_sample_l * iir_amount_h);
                self.iir_sample_hl = (self.iir_sample_hl * (1.0 - iir_amount_h)) + (self.iir_sample_gl * iir_amount_h);
                mid_sample_l = self.iir_sample_hl - self.iir_sample_dl;

                self.iir_sample_gr = (self.iir_sample_gr * (1.0 - iir_amount_h)) + (input_sample_r * iir_amount_h);
                self.iir_sample_hr = (self.iir_sample_hr * (1.0 - iir_amount_h)) + (self.iir_sample_gr * iir_amount_h);
                mid_sample_r = self.iir_sample_hr - self.iir_sample_dr;

                high_sample_l = input_sample_l - self.iir_sample_hl;
                high_sample_r = input_sample_r - self.iir_sample_hr;
            }
            self.fp_flip = !self.fp_flip;

            if low_sample_l > 1.0 { low_sample_l = 1.0; }
            if low_sample_l < -1.0 { low_sample_l = -1.0; }
            if low_sample_r > 1.0 { low_sample_r = 1.0; }
            if low_sample_r < -1.0 { low_sample_r = -1.0; }
            low_sample_l -= low_sample_l * (low_sample_l.abs() * 0.448) * (low_sample_l.abs() * 0.448);
            low_sample_r -= low_sample_r * (low_sample_r.abs() * 0.448) * (low_sample_r.abs() * 0.448);
            low_sample_l *= drive;
            low_sample_r *= drive;

            if high_sample_l > 1.0 { high_sample_l = 1.0; }
            if high_sample_l < -1.0 { high_sample_l = -1.0; }
            if high_sample_r > 1.0 { high_sample_r = 1.0; }
            if high_sample_r < -1.0 { high_sample_r = -1.0; }
            high_sample_l -= high_sample_l * (high_sample_l.abs() * 0.599) * (high_sample_l.abs() * 0.599);
            high_sample_r -= high_sample_r * (high_sample_r.abs() * 0.599) * (high_sample_r.abs() * 0.599);
            high_sample_l *= drive;
            high_sample_r *= drive;

            mid_sample_l = mid_sample_l * drive;
            mid_sample_r = mid_sample_r * drive;

            mid_sample_l = slam_mid(mid_sample_l, &mut self.last_sample_l, drive);
            mid_sample_r = slam_mid(mid_sample_r, &mut self.last_sample_r, drive);

            input_sample_l = ((low_sample_l + mid_sample_l + high_sample_l) / drive) * out;
            input_sample_r = ((low_sample_r + mid_sample_r + high_sample_r) / drive) * out;

            if wet != 1.0 {
                input_sample_l = (input_sample_l * wet) + (dry_sample_l * (1.0 - wet));
                input_sample_r = (input_sample_r * wet) + (dry_sample_r * (1.0 - wet));
            }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
