// DeRez2 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/DeRez2.
// Sample-rate and bit-depth reduction with soft/hard (uLaw-flavoured) blending.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct DeRez2 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    last_sample_l: f64,
    held_sample_l: f64,
    last_dry_sample_l: f64,
    last_output_sample_l: f64,
    last_sample_r: f64,
    held_sample_r: f64,
    last_dry_sample_r: f64,
    last_output_sample_r: f64,
    position: f64,
    increment_a: f64,
    increment_b: f64,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
}

impl DeRez2 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            last_sample_l: 0.0,
            held_sample_l: 0.0,
            last_dry_sample_l: 0.0,
            last_output_sample_l: 0.0,
            last_sample_r: 0.0,
            held_sample_r: 0.0,
            last_dry_sample_r: 0.0,
            last_output_sample_r: 0.0,
            position: 0.0,
            increment_a: 0.0,
            increment_b: 0.0,
            a: 1.0,
            b: 1.0,
            c: 1.0,
            d: 1.0,
        }
    }
}

/// Transitions get an intermediate dry sample (only one).
#[inline(always)]
fn soft_hard(input_sample: f64, last_output_sample: &mut f64, last_dry_sample: f64, hard: f64) -> f64 {
    if input_sample != *last_output_sample {
        let temp = input_sample;
        let out = (input_sample * hard) + (last_dry_sample * (1.0 - hard));
        *last_output_sample = temp;
        out
    } else {
        *last_output_sample = input_sample;
        input_sample
    }
}

#[inline(always)]
fn clamp1(mut s: f64) -> f64 {
    if s > 1.0 { s = 1.0; }
    if s < -1.0 { s = -1.0; }
    s
}

#[inline(always)]
fn ulaw_encode(mut s: f64) -> f64 {
    if s > 0.0 { s = (1.0 + (255.0 * s.abs())).ln() / 256.0f64.ln(); }
    if s < 0.0 { s = -(1.0 + (255.0 * s.abs())).ln() / 256.0f64.ln(); }
    s
}

#[inline(always)]
fn ulaw_decode(mut s: f64) -> f64 {
    if s > 0.0 { s = (256.0f64.powf(s.abs()) - 1.0) / 255.0; }
    if s < 0.0 { s = -(256.0f64.powf(s.abs()) - 1.0) / 255.0; }
    s
}

#[inline(always)]
fn bitcrush(mut s: f64, increment_b: f64) -> f64 {
    if s > 0.0 {
        let mut temp = s;
        while temp > 0.0 { temp -= increment_b; }
        s -= temp; // it's below 0 so subtracting adds the remainder
    }
    if s < 0.0 {
        let mut temp = s;
        while temp < 0.0 { temp += increment_b; }
        s -= temp; // it's above 0 so subtracting subtracts the remainder
    }
    s
}

impl Plugin for DeRez2 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, 3 => self.d = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let mut target_a = (self.a as f64).powf(3.0) + 0.0005;
        if target_a > 1.0 { target_a = 1.0; }
        let soften = (1.0 + target_a) / 2.0;
        let target_b = (1.0 - self.b as f64).powf(3.0) / 3.0;
        let hard = self.c as f64;
        let wet = self.d as f64;
        let overallscale = overallscale(self.sr);
        target_a /= overallscale;

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            self.increment_a = ((self.increment_a * 999.0) + target_a) / 1000.0;
            self.increment_b = ((self.increment_b * 999.0) + target_b) / 1000.0;
            // increment_a is the frequency derez, increment_b the bit depth derez
            self.position += self.increment_a;

            let mut output_sample_l = self.held_sample_l;
            let mut output_sample_r = self.held_sample_r;
            if self.position > 1.0 {
                self.position -= 1.0;
                self.held_sample_l = (self.last_sample_l * self.position) + (input_sample_l * (1.0 - self.position));
                output_sample_l = (output_sample_l * (1.0 - soften)) + (self.held_sample_l * soften);
                self.held_sample_r = (self.last_sample_r * self.position) + (input_sample_r * (1.0 - self.position));
                output_sample_r = (output_sample_r * (1.0 - soften)) + (self.held_sample_r * soften);
            }
            input_sample_l = output_sample_l;
            input_sample_r = output_sample_r;

            input_sample_l = soft_hard(input_sample_l, &mut self.last_output_sample_l, self.last_dry_sample_l, hard);
            input_sample_r = soft_hard(input_sample_r, &mut self.last_output_sample_r, self.last_dry_sample_r, hard);

            self.last_dry_sample_l = dry_sample_l;
            self.last_dry_sample_r = dry_sample_r;

            let mut temp_l = input_sample_l;
            let mut temp_r = input_sample_r;
            input_sample_l = ulaw_encode(clamp1(input_sample_l));
            input_sample_r = ulaw_encode(clamp1(input_sample_r));
            input_sample_l = (temp_l * hard) + (input_sample_l * (1.0 - hard));
            input_sample_r = (temp_r * hard) + (input_sample_r * (1.0 - hard)); // uLaw encode as part of soft/hard

            if self.increment_b > 0.0005 {
                input_sample_l = bitcrush(input_sample_l, self.increment_b);
                input_sample_r = bitcrush(input_sample_r, self.increment_b);
                input_sample_l *= 1.0 - self.increment_b;
                input_sample_r *= 1.0 - self.increment_b;
            }

            temp_l = input_sample_l;
            temp_r = input_sample_r;
            input_sample_l = ulaw_decode(clamp1(input_sample_l));
            input_sample_r = ulaw_decode(clamp1(input_sample_r));
            input_sample_l = (temp_l * hard) + (input_sample_l * (1.0 - hard));
            input_sample_r = (temp_r * hard) + (input_sample_r * (1.0 - hard)); // uLaw decode as part of soft/hard

            if wet != 1.0 {
                input_sample_l = (input_sample_l * wet) + (dry_sample_l * (1.0 - wet));
                input_sample_r = (input_sample_r * wet) + (dry_sample_r * (1.0 - wet));
            }

            self.last_sample_l = dry_sample_l;
            self.last_sample_r = dry_sample_r;

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
