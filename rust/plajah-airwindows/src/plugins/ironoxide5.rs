// IronOxide5 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/IronOxide5.
// Tape: flutter (fractional-delay sweep), lean-out highpass, sine drive, prime-tap head bump,
// output limiter, slew-based noise and an inv/dry/wet blend with output trim.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct IronOxide5 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    iir_sample_al: f64,
    iir_sample_bl: f64,
    d_l: [f64; 264],
    fast_iir_al: f64,
    fast_iir_bl: f64,
    slow_iir_al: f64,
    slow_iir_bl: f64,
    prev_input_sample_l: f64,
    iir_sample_ar: f64,
    iir_sample_br: f64,
    d_r: [f64; 264],
    fast_iir_ar: f64,
    fast_iir_br: f64,
    slow_iir_ar: f64,
    slow_iir_br: f64,
    prev_input_sample_r: f64,
    gcount: i32,
    flip: bool,
    fl_l: [f64; 100],
    fl_r: [f64; 100],
    fstoredcount: i32,
    rateof: f64,
    sweep: f64,
    nextmax: f64,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32,
    g: f32,
}

impl IronOxide5 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            iir_sample_al: 0.0,
            iir_sample_bl: 0.0,
            d_l: [0.0; 264],
            fast_iir_al: 0.0,
            fast_iir_bl: 0.0,
            slow_iir_al: 0.0,
            slow_iir_bl: 0.0,
            prev_input_sample_l: 0.0,
            iir_sample_ar: 0.0,
            iir_sample_br: 0.0,
            d_r: [0.0; 264],
            fast_iir_ar: 0.0,
            fast_iir_br: 0.0,
            slow_iir_ar: 0.0,
            slow_iir_br: 0.0,
            prev_input_sample_r: 0.0,
            gcount: 0,
            flip: false,
            fl_l: [0.0; 100],
            fl_r: [0.0; 100],
            fstoredcount: 0,
            rateof: 0.5,
            sweep: 0.0,
            nextmax: 0.5,
            a: 0.5,
            b: 0.562341325190349,
            c: 0.562341325190349,
            d: 0.5,
            e: 0.5,
            f: 0.5,
            g: 1.0,
        }
    }
}

/// The prime-spaced head-bump taps, summed in the original's exact order (count already +3).
#[inline(always)]
fn taps(d: &[f64; 264], count: usize) -> f64 {
    let mut temp = d[count + 127];
    temp += d[count + 113];
    temp += d[count + 109];
    temp += d[count + 107];
    temp += d[count + 103];
    temp += d[count + 101];
    temp += d[count + 97];
    temp += d[count + 89];
    temp += d[count + 83];
    temp /= 2.0;
    temp += d[count + 79];
    temp += d[count + 73];
    temp += d[count + 71];
    temp += d[count + 67];
    temp += d[count + 61];
    temp += d[count + 59];
    temp += d[count + 53];
    temp += d[count + 47];
    temp += d[count + 43];
    temp += d[count + 41];
    temp += d[count + 37];
    temp += d[count + 31];
    temp += d[count + 29];
    temp /= 2.0;
    temp += d[count + 23];
    temp += d[count + 19];
    temp += d[count + 17];
    temp += d[count + 13];
    temp += d[count + 11];
    temp /= 2.0;
    temp += d[count + 7];
    temp += d[count + 5];
    temp += d[count + 3];
    temp /= 2.0;
    temp += d[count + 2];
    temp += d[count + 1];
    temp
}

#[inline(always)]
fn sine_clip(s: f64) -> f64 {
    let mut bridgerectifier = s.abs();
    if bridgerectifier > 1.57079633 { bridgerectifier = 1.57079633; }
    bridgerectifier = bridgerectifier.sin();
    if s > 0.0 { bridgerectifier } else { -bridgerectifier }
}

impl Plugin for IronOxide5 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index {
            0 => self.a = value, 1 => self.b = value, 2 => self.c = value, 3 => self.d = value,
            4 => self.e = value, 5 => self.f = value, 6 => self.g = value, _ => {}
        }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);

        let inputgain = 10.0f64.powf(((self.a as f64 * 36.0) - 18.0) / 20.0);
        let outputgain = 10.0f64.powf(((self.f as f64 * 36.0) - 18.0) / 20.0);
        // (B*B)*(B*B) is float math in the original; only *148.5 promotes.
        let bb = self.b * self.b;
        let mut ips = (((bb * bb) as f64 * 148.5) + 1.5) * 1.1;
        if ips < 1.0 || ips > 200.0 { ips = 33.0; }
        let temp_randy = 0.04 + (0.11 / ips.sqrt());
        let mut randy;
        let cc = self.c * self.c;
        let mut lps = (((cc * cc) as f64 * 148.5) + 1.5) * 1.1;
        if lps < 1.0 || lps > 200.0 { lps = 33.0; }
        let mut iir_amount = lps / 430.0;
        let mut bridgerectifier_l;
        let mut bridgerectifier_r;
        let mut fast_taper = ips / 15.0;
        let mut slow_taper = 2.0 / (lps * lps);
        let mut lowspeedscale = 5.0 / ips;
        let mut count: i32;
        let mut flutcount: i32;
        let mut flutterrandy;
        let depth = (self.d as f64).powf(2.0) * overallscale;
        let fluttertrim = 0.00581 / overallscale;
        let sweeptrim = (0.0005 * depth) / overallscale;
        let mut offset;
        let mut flooroffset;
        let tupi = 3.141592653589793238 * 2.0;
        let newrate = 0.006 / overallscale;
        let oldrate = 1.0 - newrate;
        if overallscale == 0.0 { fast_taper += 1.0; slow_taper += 1.0; } else {
            iir_amount /= overallscale;
            lowspeedscale *= overallscale;
            fast_taper = 1.0 + (fast_taper / overallscale);
            slow_taper = 1.0 + (slow_taper / overallscale);
        }

        let noise = self.e as f64 * 0.5;
        let invdrywet = (self.g as f64 * 2.0) - 1.0;
        let mut dry = 1.0;
        if invdrywet > 0.0 { dry -= invdrywet; }

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let mut dry_sample_l = input_sample_l;
            let mut dry_sample_r = input_sample_r;

            flutterrandy = self.fpd_l.0 as f64 / u32::MAX as f64;
            if self.fstoredcount < 0 || self.fstoredcount > 30 { self.fstoredcount = 30; }
            flutcount = self.fstoredcount;
            self.fl_l[(flutcount + 31) as usize] = input_sample_l;
            self.fl_l[flutcount as usize] = input_sample_l;
            self.fl_r[(flutcount + 31) as usize] = input_sample_r;
            self.fl_r[flutcount as usize] = input_sample_r;
            offset = (1.0 + self.sweep.sin()) * depth;
            flooroffset = offset - offset.floor();
            flutcount += offset.floor() as i32;
            bridgerectifier_l = self.fl_l[flutcount as usize] * (1.0 - flooroffset);
            bridgerectifier_r = self.fl_r[flutcount as usize] * (1.0 - flooroffset);
            bridgerectifier_l += self.fl_l[(flutcount + 1) as usize] * flooroffset;
            bridgerectifier_r += self.fl_r[(flutcount + 1) as usize] * flooroffset;
            self.rateof = (self.nextmax * newrate) + (self.rateof * oldrate);
            self.sweep += self.rateof * fluttertrim;
            self.sweep += self.sweep * sweeptrim;
            if self.sweep >= tupi { self.sweep = 0.0; self.nextmax = 0.02 + (flutterrandy * 0.98); }
            self.fstoredcount -= 1;
            input_sample_l = bridgerectifier_l;
            input_sample_r = bridgerectifier_r;

            if self.flip {
                self.iir_sample_al = (self.iir_sample_al * (1.0 - iir_amount)) + (input_sample_l * iir_amount);
                self.iir_sample_ar = (self.iir_sample_ar * (1.0 - iir_amount)) + (input_sample_r * iir_amount);
                input_sample_l -= self.iir_sample_al;
                input_sample_r -= self.iir_sample_ar;
            } else {
                self.iir_sample_bl = (self.iir_sample_bl * (1.0 - iir_amount)) + (input_sample_l * iir_amount);
                self.iir_sample_br = (self.iir_sample_br * (1.0 - iir_amount)) + (input_sample_r * iir_amount);
                input_sample_l -= self.iir_sample_bl;
                input_sample_r -= self.iir_sample_br;
            }

            input_sample_l *= inputgain;
            input_sample_r *= inputgain;

            input_sample_l = sine_clip(input_sample_l);
            input_sample_r = sine_clip(input_sample_r);

            if self.gcount < 0 || self.gcount > 131 { self.gcount = 131; }
            count = self.gcount;

            self.d_l[(count + 131) as usize] = input_sample_l;
            self.d_l[count as usize] = input_sample_l;
            self.d_r[(count + 131) as usize] = input_sample_r;
            self.d_r[count as usize] = input_sample_r;

            if self.flip {
                self.fast_iir_al = self.fast_iir_al / fast_taper;
                self.slow_iir_al = self.slow_iir_al / slow_taper;
                self.fast_iir_al += self.d_l[count as usize];

                self.fast_iir_ar = self.fast_iir_ar / fast_taper;
                self.slow_iir_ar = self.slow_iir_ar / slow_taper;
                self.fast_iir_ar += self.d_r[count as usize];
                count += 3;

                self.slow_iir_al += taps(&self.d_l, count as usize) / 128.0;
                self.slow_iir_ar += taps(&self.d_r, count as usize) / 128.0;

                input_sample_l = self.fast_iir_al - (self.slow_iir_al / slow_taper);
                input_sample_r = self.fast_iir_ar - (self.slow_iir_ar / slow_taper);
            } else {
                self.fast_iir_bl = self.fast_iir_bl / fast_taper;
                self.slow_iir_bl = self.slow_iir_bl / slow_taper;
                self.fast_iir_bl += self.d_l[count as usize];

                self.fast_iir_br = self.fast_iir_br / fast_taper;
                self.slow_iir_br = self.slow_iir_br / slow_taper;
                self.fast_iir_br += self.d_r[count as usize];
                count += 3;

                self.slow_iir_bl += taps(&self.d_l, count as usize) / 128.0;
                self.slow_iir_br += taps(&self.d_r, count as usize) / 128.0;

                input_sample_l = self.fast_iir_bl - (self.slow_iir_bl / slow_taper);
                input_sample_r = self.fast_iir_br - (self.slow_iir_br / slow_taper);
            }
            // Note: the original never advances gcount — the head-bump buffer stays at slot 131.

            input_sample_l /= fast_taper;
            input_sample_r /= fast_taper;
            input_sample_l /= lowspeedscale;
            input_sample_r /= lowspeedscale;

            input_sample_l = sine_clip(input_sample_l);
            input_sample_r = sine_clip(input_sample_r);

            randy = (0.55 + temp_randy + ((self.fpd_r.0 as f64 / u32::MAX as f64) * temp_randy)) * noise;

            input_sample_l *= 1.0 - randy;
            input_sample_l += self.prev_input_sample_l * randy;
            self.prev_input_sample_l = dry_sample_l;

            input_sample_r *= 1.0 - randy;
            input_sample_r += self.prev_input_sample_r * randy;
            self.prev_input_sample_r = dry_sample_r;

            self.flip = !self.flip;

            if outputgain != 1.0 {
                input_sample_l *= outputgain;
                input_sample_r *= outputgain;
            }
            if invdrywet != 1.0 {
                input_sample_l *= invdrywet;
                input_sample_r *= invdrywet;
            }
            if dry != 1.0 {
                dry_sample_l *= dry;
                dry_sample_r *= dry;
            }
            if dry_sample_l.abs() > 0.0 {
                input_sample_l += dry_sample_l;
            }
            if dry_sample_r.abs() > 0.0 {
                input_sample_r += dry_sample_r;
            }

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
