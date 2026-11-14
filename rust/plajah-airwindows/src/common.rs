// The idioms every Airwindows plugin repeats, written once so the ports read like the originals.

/// Airwindows' per-channel xorshift state (`fpdL` / `fpdR`): the denormal guard and the 32-bit
/// floating-point dither both draw from it, in that order, once per sample.
#[derive(Clone, Copy)]
pub struct Fpd(pub u32);

impl Fpd {
    #[inline(always)]
    pub fn step(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }

    /// `if (fabs(s)<1.18e-23) s = fpd * 1.18e-17;` — reads the state without advancing it.
    #[inline(always)]
    pub fn guard(&self, s: f64) -> f64 {
        if s.abs() < 1.18e-23 { self.0 as f64 * 1.18e-17 } else { s }
    }

    /// "begin 32 bit stereo floating point dither": frexpf, advance, add noise scaled to the
    /// sample's own exponent.
    #[inline(always)]
    pub fn dither32(&mut self, s: f64) -> f64 {
        let expon = frexpf_exp(s as f32);
        let f = self.step();
        s + ((f as f64 - 0x7fff_ffffu32 as f64) * 5.5e-36 * 2f64.powi(expon + 62))
    }
}

/// The exponent `frexpf` returns: x = m·2^e with |m| in [0.5, 1); 0 for zero, inf and NaN.
#[inline(always)]
pub fn frexpf_exp(x: f32) -> i32 {
    let bits = x.to_bits();
    let e = ((bits >> 23) & 0xff) as i32;
    if e == 0xff { return 0; }
    if e == 0 {
        let m = bits & 0x007f_ffff;
        if m == 0 { return 0; }
        // Subnormal: normalise the mantissa.
        return -117 - m.leading_zeros() as i32; // m·2^-149, top set bit at 31-lz
    }
    e - 126
}

/// What `getSampleRate()/44100` becomes in every Proc file.
#[inline(always)]
pub fn overallscale(sample_rate: f64) -> f64 {
    let mut s = 1.0;
    s /= 44100.0;
    s *= sample_rate;
    s
}

/// The constructor's seed loop (`while (fpd < 16386) fpd = rand()*UINT32_MAX;`) — any seed the
/// host hands us is pushed out of that low range the same way.
pub fn seed(s: u32) -> Fpd {
    Fpd(if s < 16386 { s.wrapping_mul(2_654_435_761).max(16386) } else { s })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frexp_matches_libm_cases() {
        assert_eq!(frexpf_exp(1.0), 1);
        assert_eq!(frexpf_exp(0.5), 0);
        assert_eq!(frexpf_exp(0.75), 0);
        assert_eq!(frexpf_exp(-3.0), 2);
        assert_eq!(frexpf_exp(0.0), 0);
        assert_eq!(frexpf_exp(f32::from_bits(1)), -148);
        assert_eq!(frexpf_exp(f32::MIN_POSITIVE), -125);
    }
}
