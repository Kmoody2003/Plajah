// Baxandall2 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Baxandall2.
// Treble/bass shelving as an interleaved pair of biquads (A/B sets alternate per sample).

use crate::common::{seed, Fpd};
use super::Plugin;

// biquad indices: [0] freq, [1] reso, [2..=6] a0 a1 a2 b1 b2, [7..=8] state
const FREQ: usize = 0;
const RESO: usize = 1;
const A0: usize = 2;
const A1: usize = 3;
const A2: usize = 4;
const B1: usize = 5;
const B2: usize = 6;
const S1: usize = 7;
const S2: usize = 8;

pub struct Baxandall2 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    treble_al: [f64; 9],
    treble_bl: [f64; 9],
    bass_al: [f64; 9],
    bass_bl: [f64; 9],
    treble_ar: [f64; 9],
    treble_br: [f64; 9],
    bass_ar: [f64; 9],
    bass_br: [f64; 9],
    flip: bool,
    a: f32,
    b: f32,
}

impl Baxandall2 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            treble_al: [0.0; 9],
            treble_bl: [0.0; 9],
            bass_al: [0.0; 9],
            bass_bl: [0.0; 9],
            treble_ar: [0.0; 9],
            treble_br: [0.0; 9],
            bass_ar: [0.0; 9],
            bass_br: [0.0; 9],
            flip: false,
            a: 0.5,
            b: 0.5,
        }
    }
}

/// One biquad tick (transposed direct form, state in [7],[8]); returns the lowpassed sample.
#[inline(always)]
fn tick(bq: &mut [f64; 9], input: f64) -> f64 {
    let out = (input * bq[A0]) + bq[S1];
    bq[S1] = (input * bq[A1]) - (out * bq[B1]) + bq[S2];
    bq[S2] = (input * bq[A2]) - (out * bq[B2]);
    out
}

impl Plugin for Baxandall2 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let treble_gain = 10.0f64.powf(((self.a as f64 * 48.0) - 24.0) / 20.0);
        let mut treble_freq = (4410.0 * treble_gain) / self.sr;
        if treble_freq > 0.45 { treble_freq = 0.45; }
        let bass_gain = 10.0f64.powf(((self.b as f64 * 48.0) - 24.0) / 20.0);
        let mut bass_freq = 10.0f64.powf(-((self.b as f64 * 48.0) - 24.0) / 20.0);
        bass_freq = (8820.0 * bass_freq) / self.sr;
        if bass_freq > 0.45 { bass_freq = 0.45; }
        let treble_reso = 0.4;
        let bass_reso = 0.2;

        let mut k = (std::f64::consts::PI * treble_freq).tan();
        let mut norm = 1.0 / (1.0 + k / treble_reso + k * k);
        let t_a0 = k * k * norm;
        let t_a1 = 2.0 * t_a0;
        let t_a2 = t_a0;
        let t_b1 = 2.0 * (k * k - 1.0) * norm;
        let t_b2 = (1.0 - k / treble_reso + k * k) * norm;

        k = (std::f64::consts::PI * bass_freq).tan();
        norm = 1.0 / (1.0 + k / bass_reso + k * k);
        let b_a0 = k * k * norm;
        let b_a1 = 2.0 * b_a0;
        let b_a2 = b_a0;
        let b_b1 = 2.0 * (k * k - 1.0) * norm;
        let b_b2 = (1.0 - k / bass_reso + k * k) * norm;

        for bq in [&mut self.treble_al, &mut self.treble_bl, &mut self.treble_ar, &mut self.treble_br] {
            bq[FREQ] = treble_freq; bq[RESO] = treble_reso;
            bq[A0] = t_a0; bq[A1] = t_a1; bq[A2] = t_a2; bq[B1] = t_b1; bq[B2] = t_b2;
        }
        for bq in [&mut self.bass_al, &mut self.bass_bl, &mut self.bass_ar, &mut self.bass_br] {
            bq[FREQ] = bass_freq; bq[RESO] = bass_reso;
            bq[A0] = b_a0; bq[A1] = b_a1; bq[A2] = b_a2; bq[B1] = b_b1; bq[B2] = b_b2;
        }

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);

            let mut treble_sample_l;
            let mut bass_sample_l;
            let mut treble_sample_r;
            let mut bass_sample_r;

            if self.flip {
                treble_sample_l = tick(&mut self.treble_al, input_sample_l);
                treble_sample_l = input_sample_l - treble_sample_l;
                bass_sample_l = tick(&mut self.bass_al, input_sample_l);
                treble_sample_r = tick(&mut self.treble_ar, input_sample_r);
                treble_sample_r = input_sample_r - treble_sample_r;
                bass_sample_r = tick(&mut self.bass_ar, input_sample_r);
            } else {
                treble_sample_l = tick(&mut self.treble_bl, input_sample_l);
                treble_sample_l = input_sample_l - treble_sample_l;
                bass_sample_l = tick(&mut self.bass_bl, input_sample_l);
                treble_sample_r = tick(&mut self.treble_br, input_sample_r);
                treble_sample_r = input_sample_r - treble_sample_r;
                bass_sample_r = tick(&mut self.bass_br, input_sample_r);
            }
            self.flip = !self.flip;

            treble_sample_l *= treble_gain;
            bass_sample_l *= bass_gain;
            input_sample_l = bass_sample_l + treble_sample_l; // interleaved biquad
            treble_sample_r *= treble_gain;
            bass_sample_r *= bass_gain;
            input_sample_r = bass_sample_r + treble_sample_r;

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
