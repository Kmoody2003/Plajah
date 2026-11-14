// Galactic — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Galactic.
// A huge cross-fed 3x4 Householder-style delay network reverb with a vibrato predelay, run once
// per `cycleEnd` samples at high rates and interpolated back up.
//
// Memory: 24 main delay lines (125,840 f64) + 2 predelay lines (6,222 f64) = 132,062 f64,
// about 1.06 MB, all boxed once in new().

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct Galactic {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,

    iir_al: f64,
    iir_bl: f64,
    a_il: Box<[f64]>,
    a_jl: Box<[f64]>,
    a_kl: Box<[f64]>,
    a_ll: Box<[f64]>,
    a_al: Box<[f64]>,
    a_bl: Box<[f64]>,
    a_cl: Box<[f64]>,
    a_dl: Box<[f64]>,
    a_el: Box<[f64]>,
    a_fl: Box<[f64]>,
    a_gl: Box<[f64]>,
    a_hl: Box<[f64]>,
    a_ml: Box<[f64]>,
    a_mr: Box<[f64]>,
    oldfpd: f64,
    feedback_al: f64,
    feedback_bl: f64,
    feedback_cl: f64,
    feedback_dl: f64,
    last_ref_l: [f64; 7],

    iir_ar: f64,
    iir_br: f64,
    a_ir: Box<[f64]>,
    a_jr: Box<[f64]>,
    a_kr: Box<[f64]>,
    a_lr: Box<[f64]>,
    a_ar: Box<[f64]>,
    a_br: Box<[f64]>,
    a_cr: Box<[f64]>,
    a_dr: Box<[f64]>,
    a_er: Box<[f64]>,
    a_fr: Box<[f64]>,
    a_gr: Box<[f64]>,
    a_hr: Box<[f64]>,
    feedback_ar: f64,
    feedback_br: f64,
    feedback_cr: f64,
    feedback_dr: f64,
    last_ref_r: [f64; 7],

    count_a: i32,
    count_b: i32,
    count_c: i32,
    count_d: i32,
    count_e: i32,
    count_f: i32,
    count_g: i32,
    count_h: i32,
    count_i: i32,
    count_j: i32,
    count_k: i32,
    count_l: i32,
    count_m: i32,
    cycle: i32,

    vib_m: f64,

    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
}

fn line(n: usize) -> Box<[f64]> { vec![0.0; n].into_boxed_slice() }

/// `a[count-((count > delay)?delay+1:0)]`
#[inline(always)]
fn tap(a: &[f64], count: i32, delay: i32) -> f64 {
    a[(count - if count > delay { delay + 1 } else { 0 }) as usize]
}

impl Galactic {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            iir_al: 0.0,
            iir_bl: 0.0,
            a_il: line(6480),
            a_jl: line(3660),
            a_kl: line(1720),
            a_ll: line(680),
            a_al: line(9700),
            a_bl: line(6000),
            a_cl: line(2320),
            a_dl: line(940),
            a_el: line(15220),
            a_fl: line(8460),
            a_gl: line(4540),
            a_hl: line(3200),
            a_ml: line(3111),
            a_mr: line(3111),
            oldfpd: 429496.7295,
            feedback_al: 0.0,
            feedback_bl: 0.0,
            feedback_cl: 0.0,
            feedback_dl: 0.0,
            last_ref_l: [0.0; 7],
            iir_ar: 0.0,
            iir_br: 0.0,
            a_ir: line(6480),
            a_jr: line(3660),
            a_kr: line(1720),
            a_lr: line(680),
            a_ar: line(9700),
            a_br: line(6000),
            a_cr: line(2320),
            a_dr: line(940),
            a_er: line(15220),
            a_fr: line(8460),
            a_gr: line(4540),
            a_hr: line(3200),
            feedback_ar: 0.0,
            feedback_br: 0.0,
            feedback_cr: 0.0,
            feedback_dr: 0.0,
            last_ref_r: [0.0; 7],
            count_a: 1,
            count_b: 1,
            count_c: 1,
            count_d: 1,
            count_e: 1,
            count_f: 1,
            count_g: 1,
            count_h: 1,
            count_i: 1,
            count_j: 1,
            count_k: 1,
            count_l: 1,
            count_m: 1,
            cycle: 0,
            vib_m: 3.0,
            a: 0.5,
            b: 0.5,
            c: 0.5,
            d: 1.0,
            e: 1.0,
        }
    }
}

impl Plugin for Galactic {
    fn set_param(&mut self, index: usize, value: f32) {
        match index {
            0 => self.a = value, 1 => self.b = value, 2 => self.c = value, 3 => self.d = value, 4 => self.e = value,
            _ => {}
        }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);

        let mut cycle_end = overallscale.floor() as i32;
        if cycle_end < 1 { cycle_end = 1; }
        if cycle_end > 4 { cycle_end = 4; }
        if self.cycle > cycle_end - 1 { self.cycle = cycle_end - 1; }

        let regen = 0.0625 + ((1.0 - self.a as f64) * 0.0625);
        let attenuate = (1.0 - (regen / 0.125)) * 1.333;
        let lowpass = (1.00001 - (1.0 - self.b as f64)).powf(2.0) / overallscale.sqrt();
        let drift = (self.c as f64).powf(3.0) * 0.001;
        let size = (self.d as f64 * 1.77) + 0.1;
        let wet = 1.0 - (1.0 - self.e as f64).powf(3.0);

        let delay_i = (3407.0 * size) as i32;
        let delay_j = (1823.0 * size) as i32;
        let delay_k = (859.0 * size) as i32;
        let delay_l = (331.0 * size) as i32;
        let delay_a = (4801.0 * size) as i32;
        let delay_b = (2909.0 * size) as i32;
        let delay_c = (1153.0 * size) as i32;
        let delay_d = (461.0 * size) as i32;
        let delay_e = (7607.0 * size) as i32;
        let delay_f = (4217.0 * size) as i32;
        let delay_g = (2269.0 * size) as i32;
        let delay_h = (1597.0 * size) as i32;
        let delay_m: i32 = 256;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            self.vib_m += self.oldfpd * drift;
            if self.vib_m > (3.141592653589793238 * 2.0) {
                self.vib_m = 0.0;
                self.oldfpd = 0.4294967295 + (self.fpd_l.0 as f64 * 0.0000000000618);
            }

            self.a_ml[self.count_m as usize] = input_sample_l * attenuate;
            self.a_mr[self.count_m as usize] = input_sample_r * attenuate;
            self.count_m += 1; if self.count_m < 0 || self.count_m > delay_m { self.count_m = 0; }

            let offset_ml = ((self.vib_m).sin() + 1.0) * 127.0;
            let offset_mr = ((self.vib_m + (3.141592653589793238 / 2.0)).sin() + 1.0) * 127.0;
            let working_ml = (self.count_m as f64 + offset_ml) as i32;
            let working_mr = (self.count_m as f64 + offset_mr) as i32;
            let mut interpol_ml = tap(&self.a_ml, working_ml, delay_m) * (1.0 - (offset_ml - offset_ml.floor()));
            interpol_ml += tap(&self.a_ml, working_ml + 1, delay_m) * (offset_ml - offset_ml.floor());
            let mut interpol_mr = tap(&self.a_mr, working_mr, delay_m) * (1.0 - (offset_mr - offset_mr.floor()));
            interpol_mr += tap(&self.a_mr, working_mr + 1, delay_m) * (offset_mr - offset_mr.floor());
            input_sample_l = interpol_ml;
            input_sample_r = interpol_mr;
            // predelay that applies vibrato

            self.iir_al = (self.iir_al * (1.0 - lowpass)) + (input_sample_l * lowpass); input_sample_l = self.iir_al;
            self.iir_ar = (self.iir_ar * (1.0 - lowpass)) + (input_sample_r * lowpass); input_sample_r = self.iir_ar;
            // initial filter

            self.cycle += 1;
            if self.cycle == cycle_end {
                self.a_il[self.count_i as usize] = input_sample_l + (self.feedback_ar * regen);
                self.a_jl[self.count_j as usize] = input_sample_l + (self.feedback_br * regen);
                self.a_kl[self.count_k as usize] = input_sample_l + (self.feedback_cr * regen);
                self.a_ll[self.count_l as usize] = input_sample_l + (self.feedback_dr * regen);
                self.a_ir[self.count_i as usize] = input_sample_r + (self.feedback_al * regen);
                self.a_jr[self.count_j as usize] = input_sample_r + (self.feedback_bl * regen);
                self.a_kr[self.count_k as usize] = input_sample_r + (self.feedback_cl * regen);
                self.a_lr[self.count_l as usize] = input_sample_r + (self.feedback_dl * regen);

                self.count_i += 1; if self.count_i < 0 || self.count_i > delay_i { self.count_i = 0; }
                self.count_j += 1; if self.count_j < 0 || self.count_j > delay_j { self.count_j = 0; }
                self.count_k += 1; if self.count_k < 0 || self.count_k > delay_k { self.count_k = 0; }
                self.count_l += 1; if self.count_l < 0 || self.count_l > delay_l { self.count_l = 0; }

                let out_il = tap(&self.a_il, self.count_i, delay_i);
                let out_jl = tap(&self.a_jl, self.count_j, delay_j);
                let out_kl = tap(&self.a_kl, self.count_k, delay_k);
                let out_ll = tap(&self.a_ll, self.count_l, delay_l);
                let out_ir = tap(&self.a_ir, self.count_i, delay_i);
                let out_jr = tap(&self.a_jr, self.count_j, delay_j);
                let out_kr = tap(&self.a_kr, self.count_k, delay_k);
                let out_lr = tap(&self.a_lr, self.count_l, delay_l);
                // first block: now we have four outputs

                self.a_al[self.count_a as usize] = out_il - (out_jl + out_kl + out_ll);
                self.a_bl[self.count_b as usize] = out_jl - (out_il + out_kl + out_ll);
                self.a_cl[self.count_c as usize] = out_kl - (out_il + out_jl + out_ll);
                self.a_dl[self.count_d as usize] = out_ll - (out_il + out_jl + out_kl);
                self.a_ar[self.count_a as usize] = out_ir - (out_jr + out_kr + out_lr);
                self.a_br[self.count_b as usize] = out_jr - (out_ir + out_kr + out_lr);
                self.a_cr[self.count_c as usize] = out_kr - (out_ir + out_jr + out_lr);
                self.a_dr[self.count_d as usize] = out_lr - (out_ir + out_jr + out_kr);

                self.count_a += 1; if self.count_a < 0 || self.count_a > delay_a { self.count_a = 0; }
                self.count_b += 1; if self.count_b < 0 || self.count_b > delay_b { self.count_b = 0; }
                self.count_c += 1; if self.count_c < 0 || self.count_c > delay_c { self.count_c = 0; }
                self.count_d += 1; if self.count_d < 0 || self.count_d > delay_d { self.count_d = 0; }

                let out_al = tap(&self.a_al, self.count_a, delay_a);
                let out_bl = tap(&self.a_bl, self.count_b, delay_b);
                let out_cl = tap(&self.a_cl, self.count_c, delay_c);
                let out_dl = tap(&self.a_dl, self.count_d, delay_d);
                let out_ar = tap(&self.a_ar, self.count_a, delay_a);
                let out_br = tap(&self.a_br, self.count_b, delay_b);
                let out_cr = tap(&self.a_cr, self.count_c, delay_c);
                let out_dr = tap(&self.a_dr, self.count_d, delay_d);
                // second block: four more outputs

                self.a_el[self.count_e as usize] = out_al - (out_bl + out_cl + out_dl);
                self.a_fl[self.count_f as usize] = out_bl - (out_al + out_cl + out_dl);
                self.a_gl[self.count_g as usize] = out_cl - (out_al + out_bl + out_dl);
                self.a_hl[self.count_h as usize] = out_dl - (out_al + out_bl + out_cl);
                self.a_er[self.count_e as usize] = out_ar - (out_br + out_cr + out_dr);
                self.a_fr[self.count_f as usize] = out_br - (out_ar + out_cr + out_dr);
                self.a_gr[self.count_g as usize] = out_cr - (out_ar + out_br + out_dr);
                self.a_hr[self.count_h as usize] = out_dr - (out_ar + out_br + out_cr);

                self.count_e += 1; if self.count_e < 0 || self.count_e > delay_e { self.count_e = 0; }
                self.count_f += 1; if self.count_f < 0 || self.count_f > delay_f { self.count_f = 0; }
                self.count_g += 1; if self.count_g < 0 || self.count_g > delay_g { self.count_g = 0; }
                self.count_h += 1; if self.count_h < 0 || self.count_h > delay_h { self.count_h = 0; }

                let out_el = tap(&self.a_el, self.count_e, delay_e);
                let out_fl = tap(&self.a_fl, self.count_f, delay_f);
                let out_gl = tap(&self.a_gl, self.count_g, delay_g);
                let out_hl = tap(&self.a_hl, self.count_h, delay_h);
                let out_er = tap(&self.a_er, self.count_e, delay_e);
                let out_fr = tap(&self.a_fr, self.count_f, delay_f);
                let out_gr = tap(&self.a_gr, self.count_g, delay_g);
                let out_hr = tap(&self.a_hr, self.count_h, delay_h);
                // third block: final outputs

                self.feedback_al = out_el - (out_fl + out_gl + out_hl);
                self.feedback_bl = out_fl - (out_el + out_gl + out_hl);
                self.feedback_cl = out_gl - (out_el + out_fl + out_hl);
                self.feedback_dl = out_hl - (out_el + out_fl + out_gl);
                self.feedback_ar = out_er - (out_fr + out_gr + out_hr);
                self.feedback_br = out_fr - (out_er + out_gr + out_hr);
                self.feedback_cr = out_gr - (out_er + out_fr + out_hr);
                self.feedback_dr = out_hr - (out_er + out_fr + out_gr);

                input_sample_l = (out_el + out_fl + out_gl + out_hl) / 8.0;
                input_sample_r = (out_er + out_fr + out_gr + out_hr) / 8.0;
                let lr = &mut self.last_ref_l;
                let rr = &mut self.last_ref_r;
                if cycle_end == 4 {
                    lr[0] = lr[4];
                    lr[2] = (lr[0] + input_sample_l) / 2.0;
                    lr[1] = (lr[0] + lr[2]) / 2.0;
                    lr[3] = (lr[2] + input_sample_l) / 2.0;
                    lr[4] = input_sample_l;
                    rr[0] = rr[4];
                    rr[2] = (rr[0] + input_sample_r) / 2.0;
                    rr[1] = (rr[0] + rr[2]) / 2.0;
                    rr[3] = (rr[2] + input_sample_r) / 2.0;
                    rr[4] = input_sample_r;
                }
                if cycle_end == 3 {
                    lr[0] = lr[3];
                    lr[2] = (lr[0] + lr[0] + input_sample_l) / 3.0;
                    lr[1] = (lr[0] + input_sample_l + input_sample_l) / 3.0;
                    lr[3] = input_sample_l;
                    rr[0] = rr[3];
                    rr[2] = (rr[0] + rr[0] + input_sample_r) / 3.0;
                    rr[1] = (rr[0] + input_sample_r + input_sample_r) / 3.0;
                    rr[3] = input_sample_r;
                }
                if cycle_end == 2 {
                    lr[0] = lr[2];
                    lr[1] = (lr[0] + input_sample_l) / 2.0;
                    lr[2] = input_sample_l;
                    rr[0] = rr[2];
                    rr[1] = (rr[0] + input_sample_r) / 2.0;
                    rr[2] = input_sample_r;
                }
                if cycle_end == 1 {
                    lr[0] = input_sample_l;
                    rr[0] = input_sample_r;
                }
                self.cycle = 0;
                input_sample_l = self.last_ref_l[self.cycle as usize];
                input_sample_r = self.last_ref_r[self.cycle as usize];
            } else {
                input_sample_l = self.last_ref_l[self.cycle as usize];
                input_sample_r = self.last_ref_r[self.cycle as usize];
            }

            self.iir_bl = (self.iir_bl * (1.0 - lowpass)) + (input_sample_l * lowpass); input_sample_l = self.iir_bl;
            self.iir_br = (self.iir_br * (1.0 - lowpass)) + (input_sample_r * lowpass); input_sample_r = self.iir_br;
            // end filter

            if wet < 1.0 {
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
