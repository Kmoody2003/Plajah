// ButterComp2 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/ButterComp2.
// A bipolar, interleaved (flip-flopped) soft compressor with an always-on "air" residue noise.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct ButterComp2 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    control_apos_l: f64,
    control_aneg_l: f64,
    control_bpos_l: f64,
    control_bneg_l: f64,
    targetpos_l: f64,
    targetneg_l: f64,
    last_output_l: f64,
    control_apos_r: f64,
    control_aneg_r: f64,
    control_bpos_r: f64,
    control_bneg_r: f64,
    targetpos_r: f64,
    targetneg_r: f64,
    last_output_r: f64,
    flip: bool,
    // Function statics (static int noisesourceL/R) in the original, shared by every instance in a
    // process; kept per instance here, starting from the same values.
    noisesource_l: i32,
    noisesource_r: i32,
    a: f32,
    b: f32,
    c: f32,
}

impl ButterComp2 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            control_apos_l: 1.0,
            control_aneg_l: 1.0,
            control_bpos_l: 1.0,
            control_bneg_l: 1.0,
            targetpos_l: 1.0,
            targetneg_l: 1.0,
            last_output_l: 0.0,
            control_apos_r: 1.0,
            control_aneg_r: 1.0,
            control_bpos_r: 1.0,
            control_bneg_r: 1.0,
            targetpos_r: 1.0,
            targetneg_r: 1.0,
            last_output_r: 0.0,
            flip: false,
            noisesource_l: 0,
            noisesource_r: 850010,
            a: 0.0,
            b: 0.5,
            c: 1.0,
        }
    }
}

/// The residue chain. The int multiplies overflow in the original (wrapping, in practice) and
/// the remainders of negatives truncate toward zero, exactly like Rust's i32 %.
#[inline(always)]
fn residue_of(noisesource: &mut i32) -> f64 {
    *noisesource %= 1700021;
    *noisesource += 1;
    let mut residue = noisesource.wrapping_mul(*noisesource);
    residue %= 170003; residue = residue.wrapping_mul(residue);
    residue %= 17011; residue = residue.wrapping_mul(residue);
    residue %= 1709; residue = residue.wrapping_mul(residue);
    residue %= 173; residue = residue.wrapping_mul(residue);
    residue %= 17;
    let mut applyresidue = residue as f64;
    applyresidue *= 0.00000001;
    applyresidue *= 0.00000001;
    applyresidue
}

impl Plugin for ButterComp2 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, 2 => self.c = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let inputgain = 10.0f64.powf((self.a as f64 * 14.0) / 20.0);
        let compfactor = 0.012 * (self.a as f64 / 135.0);
        let output = self.b as f64 * 2.0;
        let wet = self.c as f64;
        let mut outputgain = inputgain;
        outputgain -= 1.0;
        outputgain /= 1.5;
        outputgain += 1.0;

        for i in 0..l.len() {
            let mut input_sample_l = l[i] as f64;
            let mut input_sample_r = r[i] as f64;

            let applyresidue = residue_of(&mut self.noisesource_l);
            input_sample_l += applyresidue;
            if input_sample_l < 1.2e-38 && -input_sample_l < 1.2e-38 {
                input_sample_l -= applyresidue;
            }
            let applyresidue = residue_of(&mut self.noisesource_r);
            input_sample_r += applyresidue;
            if input_sample_r < 1.2e-38 && -input_sample_r < 1.2e-38 {
                input_sample_r -= applyresidue;
            }
            let dry_sample_l = input_sample_l;
            let dry_sample_r = input_sample_r;

            input_sample_l *= inputgain;
            input_sample_r *= inputgain;

            let mut divisor = compfactor / (1.0 + self.last_output_l.abs());
            divisor /= overallscale;
            let mut remainder = divisor;
            divisor = 1.0 - divisor;

            let mut inputpos_l = input_sample_l + 1.0;
            if inputpos_l < 0.0 { inputpos_l = 0.0; }
            let mut outputpos_l = inputpos_l / 2.0;
            if outputpos_l > 1.0 { outputpos_l = 1.0; }
            inputpos_l *= inputpos_l;
            self.targetpos_l *= divisor;
            self.targetpos_l += inputpos_l * remainder;
            let calcpos_l = (1.0 / self.targetpos_l).powf(2.0);

            let mut inputneg_l = (-input_sample_l) + 1.0;
            if inputneg_l < 0.0 { inputneg_l = 0.0; }
            let mut outputneg_l = inputneg_l / 2.0;
            if outputneg_l > 1.0 { outputneg_l = 1.0; }
            inputneg_l *= inputneg_l;
            self.targetneg_l *= divisor;
            self.targetneg_l += inputneg_l * remainder;
            let calcneg_l = (1.0 / self.targetneg_l).powf(2.0);

            if input_sample_l > 0.0 {
                if self.flip {
                    self.control_apos_l *= divisor;
                    self.control_apos_l += calcpos_l * remainder;
                } else {
                    self.control_bpos_l *= divisor;
                    self.control_bpos_l += calcpos_l * remainder;
                }
            } else if self.flip {
                self.control_aneg_l *= divisor;
                self.control_aneg_l += calcneg_l * remainder;
            } else {
                self.control_bneg_l *= divisor;
                self.control_bneg_l += calcneg_l * remainder;
            }

            divisor = compfactor / (1.0 + self.last_output_r.abs());
            divisor /= overallscale;
            remainder = divisor;
            divisor = 1.0 - divisor;

            let mut inputpos_r = input_sample_r + 1.0;
            if inputpos_r < 0.0 { inputpos_r = 0.0; }
            let mut outputpos_r = inputpos_r / 2.0;
            if outputpos_r > 1.0 { outputpos_r = 1.0; }
            inputpos_r *= inputpos_r;
            self.targetpos_r *= divisor;
            self.targetpos_r += inputpos_r * remainder;
            let calcpos_r = (1.0 / self.targetpos_r).powf(2.0);

            let mut inputneg_r = (-input_sample_r) + 1.0;
            if inputneg_r < 0.0 { inputneg_r = 0.0; }
            let mut outputneg_r = inputneg_r / 2.0;
            if outputneg_r > 1.0 { outputneg_r = 1.0; }
            inputneg_r *= inputneg_r;
            self.targetneg_r *= divisor;
            self.targetneg_r += inputneg_r * remainder;
            let calcneg_r = (1.0 / self.targetneg_r).powf(2.0);

            if input_sample_r > 0.0 {
                if self.flip {
                    self.control_apos_r *= divisor;
                    self.control_apos_r += calcpos_r * remainder;
                } else {
                    self.control_bpos_r *= divisor;
                    self.control_bpos_r += calcpos_r * remainder;
                }
            } else if self.flip {
                self.control_aneg_r *= divisor;
                self.control_aneg_r += calcneg_r * remainder;
            } else {
                self.control_bneg_r *= divisor;
                self.control_bneg_r += calcneg_r * remainder;
            }

            let totalmultiplier_l: f64;
            let totalmultiplier_r: f64;
            if self.flip {
                totalmultiplier_l = (self.control_apos_l * outputpos_l) + (self.control_aneg_l * outputneg_l);
                totalmultiplier_r = (self.control_apos_r * outputpos_r) + (self.control_aneg_r * outputneg_r);
            } else {
                totalmultiplier_l = (self.control_bpos_l * outputpos_l) + (self.control_bneg_l * outputneg_l);
                totalmultiplier_r = (self.control_bpos_r * outputpos_r) + (self.control_bneg_r * outputneg_r);
            }

            input_sample_l *= totalmultiplier_l;
            input_sample_l /= outputgain;
            input_sample_r *= totalmultiplier_r;
            input_sample_r /= outputgain;

            if output != 1.0 {
                input_sample_l *= output;
                input_sample_r *= output;
            }
            if wet != 1.0 {
                input_sample_l = (input_sample_l * wet) + (dry_sample_l * (1.0 - wet));
                input_sample_r = (input_sample_r * wet) + (dry_sample_r * (1.0 - wet));
            }

            self.last_output_l = input_sample_l;
            self.last_output_r = input_sample_r;

            self.flip = !self.flip;

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
