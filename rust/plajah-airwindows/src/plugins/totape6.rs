// ToTape6 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/ToTape6.
// Tape emulation: flutter (a modulated 500-sample delay), Soften on the highs, a resonant
// head bump, mojo saturation with UnBox, then ADClip into a 0.99 iron bar.

use crate::common::{overallscale, seed, Fpd};
use std::f64::consts::PI;
use super::Plugin;

pub struct ToTape6 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    d_l: [f64; 502],
    d_r: [f64; 502],
    gcount: i32,
    rateof: f64,
    sweep: f64,
    nextmax: f64,
    iir_mid_roller_al: f64,
    iir_mid_roller_bl: f64,
    iir_head_bump_al: f64,
    iir_head_bump_bl: f64,
    iir_mid_roller_ar: f64,
    iir_mid_roller_br: f64,
    iir_head_bump_ar: f64,
    iir_head_bump_br: f64,
    biquad_al: [f64; 9],
    biquad_bl: [f64; 9],
    biquad_cl: [f64; 9],
    biquad_dl: [f64; 9],
    biquad_ar: [f64; 9],
    biquad_br: [f64; 9],
    biquad_cr: [f64; 9],
    biquad_dr: [f64; 9],
    flip: bool,
    last_sample_l: f64,
    last_sample_r: f64,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
}

impl ToTape6 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            d_l: [0.0; 502],
            d_r: [0.0; 502],
            gcount: 0,
            rateof: 0.5,
            sweep: PI,
            nextmax: 0.5,
            iir_mid_roller_al: 0.0,
            iir_mid_roller_bl: 0.0,
            iir_head_bump_al: 0.0,
            iir_head_bump_bl: 0.0,
            iir_mid_roller_ar: 0.0,
            iir_mid_roller_br: 0.0,
            iir_head_bump_ar: 0.0,
            iir_head_bump_br: 0.0,
            biquad_al: [0.0; 9],
            biquad_bl: [0.0; 9],
            biquad_cl: [0.0; 9],
            biquad_dl: [0.0; 9],
            biquad_ar: [0.0; 9],
            biquad_br: [0.0; 9],
            biquad_cr: [0.0; 9],
            biquad_dr: [0.0; 9],
            flip: false,
            last_sample_l: 0.0,
            last_sample_r: 0.0,
            a: 0.5,
            b: 0.5,
            c: 0.5,
            d: 0.5,
            e: 0.5,
            f: 1.0,
        }
    }
}

/// Bandpass coefficients into [0..6]; [3] is never written (stays 0), as in the original.
#[inline(always)]
fn set_bandpass(bq: &mut [f64; 9], freq: f64, reso: f64, k: f64, norm: f64) {
    bq[0] = freq;
    bq[1] = reso;
    bq[2] = k / reso * norm;
    bq[4] = -bq[2];
    bq[5] = 2.0 * (k * k - 1.0) * norm;
    bq[6] = (1.0 - k / reso + k * k) * norm;
}

/// `x = sin(x)`, then the interleaved biquad, clamp to ±1, `asin`.
#[inline(always)]
fn sin_biquad_asin(x: f64, bq: &mut [f64; 9]) -> f64 {
    let x = x.sin();
    let temp_sample = (x * bq[2]) + bq[7];
    bq[7] = (x * bq[3]) - (temp_sample * bq[5]) + bq[8];
    bq[8] = (x * bq[4]) - (temp_sample * bq[6]);
    let mut y = temp_sample; // interleaved biquad
    if y > 1.0 { y = 1.0; }
    if y < -1.0 { y = -1.0; }
    y.asin()
}

/// Apply Soften depending on polarity.
#[inline(always)]
fn soften(mut s: f64, highs_sample: f64) -> f64 {
    let mut apply_soften = highs_sample.abs() * 1.57079633;
    if apply_soften > 1.57079633 { apply_soften = 1.57079633; }
    apply_soften = 1.0 - apply_soften.cos();
    if highs_sample > 0.0 { s -= apply_soften; }
    if highs_sample < 0.0 { s += apply_soften; }
    s
}

#[inline(always)]
fn suppress_bump(bump: &mut f64, suppress: f64) {
    if *bump > suppress { *bump -= suppress; }
    if *bump < -suppress { *bump += suppress; }
}

#[inline(always)]
fn mojo(mut s: f64) -> f64 {
    if s > 1.0 { s = 1.0; }
    if s < -1.0 { s = -1.0; }
    let mojo = s.abs().powf(0.25);
    if mojo > 0.0 { s = (s * mojo * PI * 0.5).sin() / mojo; }
    s
}

/// ADClip: returns the clipped sample, updates lastSample.
#[inline(always)]
fn adclip(mut s: f64, last_sample: &mut f64, refclip: f64, softness: f64) -> f64 {
    if *last_sample >= refclip {
        if s < refclip { *last_sample = (refclip * softness) + (s * (1.0 - softness)); } else { *last_sample = refclip; }
    }
    if *last_sample <= -refclip {
        if s > -refclip { *last_sample = (-refclip * softness) + (s * (1.0 - softness)); } else { *last_sample = -refclip; }
    }
    if s > refclip {
        if *last_sample < refclip { s = (refclip * softness) + (*last_sample * (1.0 - softness)); } else { s = refclip; }
    }
    if s < -refclip {
        if *last_sample > -refclip { s = (-refclip * softness) + (*last_sample * (1.0 - softness)); } else { s = -refclip; }
    }
    *last_sample = s;
    s
}

impl Plugin for ToTape6 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index {
            0 => self.a = value,
            1 => self.b = value,
            2 => self.c = value,
            3 => self.d = value,
            4 => self.e = value,
            5 => self.f = value,
            _ => {}
        }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);

        let inputgain = 10.0f64.powf(((self.a as f64 - 0.5) * 24.0) / 20.0);
        let soften_control = (self.b as f64).powf(2.0);
        let roll_amount = (1.0 - (soften_control * 0.45)) / overallscale;
        let head_bump_control = self.c as f64 * 0.25 * inputgain;
        let head_bump_freq = 0.12 / overallscale;

        let freq = 0.007 / overallscale;
        let reso = 0.0009;
        let mut k = (PI * freq).tan();
        let mut norm = 1.0 / (1.0 + k / reso + k * k);
        set_bandpass(&mut self.biquad_al, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_bl, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_ar, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_br, freq, reso, k, norm);

        let freq = 0.032 / overallscale;
        let reso = 0.0007;
        k = (PI * freq).tan();
        norm = 1.0 / (1.0 + k / reso + k * k);
        set_bandpass(&mut self.biquad_cl, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_dl, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_cr, freq, reso, k, norm);
        set_bandpass(&mut self.biquad_dr, freq, reso, k, norm);

        let depth = (self.d as f64).powf(2.0) * overallscale * 70.0;
        let fluttertrim = (0.0024 * (self.d as f64).powf(2.0)) / overallscale;
        let outputgain = 10.0f64.powf(((self.e as f64 - 0.5) * 24.0) / 20.0);

        let refclip = 0.99;
        let softness = 0.618033988749894848204586;

        let wet = self.f as f64;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            if inputgain < 1.0 {
                input_sample_l *= inputgain;
                input_sample_r *= inputgain;
            } // gain cut before plugin

            let flutterrandy = self.fpd_l.0 as f64 / u32::MAX as f64;
            if self.gcount < 0 || self.gcount > 499 { self.gcount = 499; }
            self.d_l[self.gcount as usize] = input_sample_l;
            self.d_r[self.gcount as usize] = input_sample_r;
            let mut count = self.gcount;
            if depth != 0.0 {
                let offset = depth + (depth * self.rateof.powf(2.0) * self.sweep.sin());

                count += offset.floor() as i32;
                let i0 = (count - if count > 499 { 500 } else { 0 }) as usize;
                let i1 = (count + 1 - if count + 1 > 499 { 500 } else { 0 }) as usize;
                input_sample_l = self.d_l[i0] * (1.0 - (offset - offset.floor()));
                input_sample_r = self.d_r[i0] * (1.0 - (offset - offset.floor()));
                input_sample_l += self.d_l[i1] * (offset - offset.floor());
                input_sample_r += self.d_r[i1] * (offset - offset.floor());

                self.rateof = (self.rateof * (1.0 - fluttertrim)) + (self.nextmax * fluttertrim);
                self.sweep += self.rateof * fluttertrim;

                if self.sweep >= (PI * 2.0) {
                    self.sweep -= PI;
                    self.nextmax = 0.24 + (flutterrandy * 0.74);
                }
            }
            self.gcount -= 1;

            let vib_dry_sample_l = input_sample_l;
            let vib_dry_sample_r = input_sample_r;
            let highs_sample_l;
            let highs_sample_r;

            if self.flip {
                self.iir_mid_roller_al = (self.iir_mid_roller_al * (1.0 - roll_amount)) + (input_sample_l * roll_amount);
                self.iir_mid_roller_ar = (self.iir_mid_roller_ar * (1.0 - roll_amount)) + (input_sample_r * roll_amount);
                highs_sample_l = input_sample_l - self.iir_mid_roller_al;
                highs_sample_r = input_sample_r - self.iir_mid_roller_ar;

                self.iir_head_bump_al += input_sample_l * 0.05;
                self.iir_head_bump_ar += input_sample_r * 0.05;
                self.iir_head_bump_al -= self.iir_head_bump_al * self.iir_head_bump_al * self.iir_head_bump_al * head_bump_freq;
                self.iir_head_bump_ar -= self.iir_head_bump_ar * self.iir_head_bump_ar * self.iir_head_bump_ar * head_bump_freq;
                self.iir_head_bump_al = sin_biquad_asin(self.iir_head_bump_al, &mut self.biquad_al);
                self.iir_head_bump_ar = sin_biquad_asin(self.iir_head_bump_ar, &mut self.biquad_ar);

                input_sample_l = sin_biquad_asin(input_sample_l, &mut self.biquad_cl);
                input_sample_r = sin_biquad_asin(input_sample_r, &mut self.biquad_cr);
            } else {
                self.iir_mid_roller_bl = (self.iir_mid_roller_bl * (1.0 - roll_amount)) + (input_sample_l * roll_amount);
                self.iir_mid_roller_br = (self.iir_mid_roller_br * (1.0 - roll_amount)) + (input_sample_r * roll_amount);
                highs_sample_l = input_sample_l - self.iir_mid_roller_bl;
                highs_sample_r = input_sample_r - self.iir_mid_roller_br;

                self.iir_head_bump_bl += input_sample_l * 0.05;
                self.iir_head_bump_br += input_sample_r * 0.05;
                self.iir_head_bump_bl -= self.iir_head_bump_bl * self.iir_head_bump_bl * self.iir_head_bump_bl * head_bump_freq;
                self.iir_head_bump_br -= self.iir_head_bump_br * self.iir_head_bump_br * self.iir_head_bump_br * head_bump_freq;
                self.iir_head_bump_bl = sin_biquad_asin(self.iir_head_bump_bl, &mut self.biquad_bl);
                self.iir_head_bump_br = sin_biquad_asin(self.iir_head_bump_br, &mut self.biquad_br);

                input_sample_l = sin_biquad_asin(input_sample_l, &mut self.biquad_dl);
                input_sample_r = sin_biquad_asin(input_sample_r, &mut self.biquad_dr);
            }
            self.flip = !self.flip;

            let ground_sample_l = vib_dry_sample_l - input_sample_l; // set up UnBox on fluttered audio
            let ground_sample_r = vib_dry_sample_r - input_sample_r;

            if inputgain > 1.0 {
                input_sample_l *= inputgain;
                input_sample_r *= inputgain;
            }

            input_sample_l = soften(input_sample_l, highs_sample_l);
            input_sample_r = soften(input_sample_r, highs_sample_r);

            let mut suppress = (1.0 - input_sample_l.abs()) * 0.00013;
            suppress_bump(&mut self.iir_head_bump_al, suppress);
            suppress_bump(&mut self.iir_head_bump_bl, suppress);
            suppress = (1.0 - input_sample_r.abs()) * 0.00013;
            suppress_bump(&mut self.iir_head_bump_ar, suppress);
            suppress_bump(&mut self.iir_head_bump_br, suppress);

            input_sample_l += (self.iir_head_bump_al + self.iir_head_bump_bl) * head_bump_control;
            input_sample_r += (self.iir_head_bump_ar + self.iir_head_bump_br) * head_bump_control;
            // apply Fatten.

            input_sample_l = mojo(input_sample_l);
            input_sample_r = mojo(input_sample_r);

            input_sample_l += ground_sample_l; // apply UnBox processing
            input_sample_r += ground_sample_r;

            if outputgain != 1.0 {
                input_sample_l *= outputgain;
                input_sample_r *= outputgain;
            }

            input_sample_l = adclip(input_sample_l, &mut self.last_sample_l, refclip, softness);
            input_sample_r = adclip(input_sample_r, &mut self.last_sample_r, refclip, softness);

            if input_sample_l > refclip { input_sample_l = refclip; }
            if input_sample_l < -refclip { input_sample_l = -refclip; }
            if input_sample_r > refclip { input_sample_r = refclip; }
            if input_sample_r < -refclip { input_sample_r = -refclip; }
            // final iron bar

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
