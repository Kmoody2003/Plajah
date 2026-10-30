// Tube2 — Airwindows (Chris Johnson, MIT). Port of plugins/LinuxVST/src/Tube2.
// Asymmetric sine shaper, the original Tube power curve, then hysteresis "spiky fuzz";
// above ~88 kHz each stage is followed by a two-sample average.

use crate::common::{overallscale, seed, Fpd};
use super::Plugin;

pub struct Tube2 {
    sr: f64,
    fpd_l: Fpd,
    fpd_r: Fpd,
    previous_sample_a: f64,
    previous_sample_b: f64,
    previous_sample_c: f64,
    previous_sample_d: f64,
    previous_sample_e: f64,
    previous_sample_f: f64,
    a: f32,
    b: f32,
}

impl Tube2 {
    pub fn new(sr: f64, seed_l: u32, seed_r: u32) -> Self {
        Self {
            sr,
            fpd_l: seed(seed_l),
            fpd_r: seed(seed_r),
            previous_sample_a: 0.0,
            previous_sample_b: 0.0,
            previous_sample_c: 0.0,
            previous_sample_d: 0.0,
            previous_sample_e: 0.0,
            previous_sample_f: 0.0,
            a: 0.5,
            b: 0.5,
        }
    }
}

/// `inputSample += previous; previous = stored; inputSample *= 0.5;`
#[inline(always)]
fn average(mut s: f64, previous: &mut f64) -> f64 {
    let stored = s;
    s += *previous; *previous = stored; s *= 0.5;
    s
}

/// Flatten bottom, point top of sine waveshaper.
#[inline(always)]
fn asym(mut s: f64, asym_pad: f64) -> f64 {
    s /= asym_pad;
    let mut sharpen = -s;
    if sharpen > 0.0 { sharpen = 1.0 + sharpen.sqrt(); } else { sharpen = 1.0 - (-sharpen).sqrt(); }
    s -= s * s.abs() * sharpen * 0.25;
    s *= asym_pad;
    s
}

/// Original Tube algorithm: powerfactor widens the more linear region of the wave.
#[inline(always)]
fn tube(mut s: f64, powerfactor: i32, gainscaling: f64, outputscaling: f64) -> f64 {
    let mut factor = s;
    for _ in 0..powerfactor { factor *= s; }
    if (powerfactor % 2 == 1) && (s != 0.0) { factor = (factor / s) * s.abs(); }
    factor *= gainscaling;
    s -= factor;
    s *= outputscaling;
    s
}

/// Hysteresis and spiky fuzz.
#[inline(always)]
fn fuzz(mut s: f64, previous: &mut f64, overallscale: f64, gainscaling: f64) -> f64 {
    let mut slew = *previous - s;
    if overallscale > 1.9 {
        s = average(s, previous);
    } else { *previous = s; }
    if slew > 0.0 { slew = 1.0 + (slew.sqrt() * 0.5); } else { slew = 1.0 - ((-slew).sqrt() * 0.5); }
    s -= s * s.abs() * slew * gainscaling;
    if s > 0.52 { s = 0.52; }
    if s < -0.52 { s = -0.52; }
    s *= 1.923076923076923;
    s
}

impl Plugin for Tube2 {
    fn set_param(&mut self, index: usize, value: f32) {
        match index { 0 => self.a = value, 1 => self.b = value, _ => {} }
    }

    fn seeds(&mut self, l: u32, r: u32) { self.fpd_l = Fpd(l); self.fpd_r = Fpd(r); }

    fn process(&mut self, l: &mut [f32], r: &mut [f32]) {
        let overallscale = overallscale(self.sr);
        let input_pad = self.a as f64;
        let iterations = 1.0 - self.b as f64;
        let powerfactor = ((9.0 * iterations) + 1.0) as i32;
        let asym_pad = powerfactor as f64;
        let gainscaling = 1.0 / (powerfactor + 1) as f64;
        let outputscaling = 1.0 + (1.0 / powerfactor as f64);

        for i in 0..l.len() {
            let mut input_sample_l = self.fpd_l.guard(l[i] as f64);
            let mut input_sample_r = self.fpd_r.guard(r[i] as f64);

            if input_pad < 1.0 {
                input_sample_l *= input_pad;
                input_sample_r *= input_pad;
            }

            if overallscale > 1.9 {
                input_sample_l = average(input_sample_l, &mut self.previous_sample_a);
                input_sample_r = average(input_sample_r, &mut self.previous_sample_b);
            }

            if input_sample_l > 1.0 { input_sample_l = 1.0; }
            if input_sample_l < -1.0 { input_sample_l = -1.0; }
            if input_sample_r > 1.0 { input_sample_r = 1.0; }
            if input_sample_r < -1.0 { input_sample_r = -1.0; }

            input_sample_l = asym(input_sample_l, asym_pad);
            input_sample_r = asym(input_sample_r, asym_pad);

            input_sample_l = tube(input_sample_l, powerfactor, gainscaling, outputscaling);
            input_sample_r = tube(input_sample_r, powerfactor, gainscaling, outputscaling);

            if overallscale > 1.9 {
                input_sample_l = average(input_sample_l, &mut self.previous_sample_c);
                input_sample_r = average(input_sample_r, &mut self.previous_sample_d);
            }

            input_sample_l = fuzz(input_sample_l, &mut self.previous_sample_e, overallscale, gainscaling);
            input_sample_r = fuzz(input_sample_r, &mut self.previous_sample_f, overallscale, gainscaling);

            input_sample_l = self.fpd_l.dither32(input_sample_l);
            input_sample_r = self.fpd_r.dither32(input_sample_r);
            l[i] = input_sample_l as f32;
            r[i] = input_sample_r as f32;
        }
    }
}
