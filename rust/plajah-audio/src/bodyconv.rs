//! Deep body by convolution — the shared upper body of ARCO's bowed strings and KITHARA's guitars.
//!
//! TONOS's GPU deep body renders a note's dense upper body modes ahead of time, which only works
//! when the whole note is known in advance: a pluck is, a bow is not. But a wooden body is linear
//! and time-invariant, so its dense upper modes don't have to be rendered per note at all — the
//! bridge force of every string that drives the same body can be summed and passed once through
//! the body's impulse response. That works for a bow played live as well as for a sequenced pluck,
//! and it costs the same for one note or a whole section.
//!
//! The impulse response is synthesised from the body's construction (hundreds to thousands of
//! modes, `ModeCloud`), not sampled. Strings keep their low, bridge-coupled modes in the loop
//! (wolf notes and the two-stage decay still come from the moving bridge); the convolution only
//! carries what radiates above the crossover.
//!
//! Uniformly partitioned overlap-save, partitions of `B` samples (latency B), one forward FFT and
//! two spectral sums per block (a mono force in, two radiation directions out). The same layout —
//! a frequency-domain delay line times partition spectra — is what `plajah-gpu-dsp`'s partitioned
//! convolution runs on the GPU in the native app.
//!
//! Everything allocates at construction; `set_ir` never allocates.

use std::f32::consts::PI;

pub const B: usize = 128; // partition = latency (2.7 ms at 48 kHz)
const N: usize = 2 * B; // real FFT size
const M: usize = B; // complex FFT size used for the real transform
const BINS: usize = B + 1;
pub const MAX_PARTS: usize = 64; // 8192 taps

/// In-place iterative radix-2 complex FFT of size M with precomputed twiddles.
struct Fft {
    cos: Vec<f32>,
    sin: Vec<f32>,
    rev: Vec<usize>,
    // twiddles for the real split: e^{-2πik/N}
    wr: Vec<f32>,
    wi: Vec<f32>,
}

impl Fft {
    fn new() -> Self {
        let bits = M.trailing_zeros();
        let rev = (0..M).map(|i| (i.reverse_bits() >> (usize::BITS - bits)) as usize).collect();
        let cos = (0..M / 2).map(|k| (2.0 * PI * k as f32 / M as f32).cos()).collect();
        let sin = (0..M / 2).map(|k| (2.0 * PI * k as f32 / M as f32).sin()).collect();
        let wr = (0..BINS).map(|k| (2.0 * PI * k as f32 / N as f32).cos()).collect();
        let wi = (0..BINS).map(|k| -(2.0 * PI * k as f32 / N as f32).sin()).collect();
        Fft { cos, sin, rev, wr, wi }
    }

    /// Forward (sign −1) or inverse (sign +1, unscaled) complex FFT.
    fn cfft(&self, re: &mut [f32], im: &mut [f32], inverse: bool) {
        for i in 0..M {
            let j = self.rev[i];
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let s = if inverse { 1.0 } else { -1.0 };
        let mut len = 2;
        while len <= M {
            let half = len / 2;
            let step = M / len;
            let mut i = 0;
            while i < M {
                for k in 0..half {
                    let c = self.cos[k * step];
                    let sn = s * self.sin[k * step];
                    let (a, b) = (i + k, i + k + half);
                    let tr = re[b] * c - im[b] * sn;
                    let ti = re[b] * sn + im[b] * c;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
                i += len;
            }
            len <<= 1;
        }
    }

    /// Real FFT of N samples → BINS complex bins.
    fn rfft(&self, x: &[f32], zr: &mut [f32], zi: &mut [f32], out_r: &mut [f32], out_i: &mut [f32]) {
        for k in 0..M {
            zr[k] = x[2 * k];
            zi[k] = x[2 * k + 1];
        }
        self.cfft(zr, zi, false);
        for k in 0..BINS {
            let (ar, ai) = (zr[k % M], zi[k % M]);
            let (br, bi) = (zr[(M - k) % M], -zi[(M - k) % M]); // conj(Z[M−k])
            let (er, ei) = (0.5 * (ar + br), 0.5 * (ai + bi));
            let (or_, oi) = (0.5 * (ai - bi), -0.5 * (ar - br)); // (Z − conj)/(2i)
            let (wr, wi) = (self.wr[k], self.wi[k]);
            out_r[k] = er + wr * or_ - wi * oi;
            out_i[k] = ei + wr * oi + wi * or_;
        }
    }

    /// Inverse real FFT (scaled by 1/N) of BINS bins → N samples.
    fn irfft(&self, xr: &[f32], xi: &[f32], zr: &mut [f32], zi: &mut [f32], out: &mut [f32]) {
        for k in 0..M {
            let (ar, ai) = (xr[k], xi[k]);
            let (br, bi) = (xr[M - k], -xi[M - k]); // conj(X[M−k])
            let (er, ei) = (0.5 * (ar + br), 0.5 * (ai + bi));
            let (dr, di) = (0.5 * (ar - br), 0.5 * (ai - bi));
            // O = D · e^{+2πik/N}
            let (wr, wi) = (self.wr[k], -self.wi[k]);
            let (or_, oi) = (dr * wr - di * wi, dr * wi + di * wr);
            zr[k] = er - oi; // E + i·O
            zi[k] = ei + or_;
        }
        self.cfft(zr, zi, true);
        let s = 1.0 / M as f32;
        for k in 0..M {
            out[2 * k] = zr[k] * s;
            out[2 * k + 1] = zi[k] * s;
        }
    }
}

/// Mono in, stereo out partitioned convolver.
pub struct BodyConv {
    fft: Fft,
    parts: usize,
    hr: [Vec<f32>; 2],
    hi: [Vec<f32>; 2],
    fdl_r: Vec<f32>,
    fdl_i: Vec<f32>,
    head: usize,
    inbuf: [f32; N],
    fill: usize,
    out: [[f32; B]; 2],
    zr: [f32; M],
    zi: [f32; M],
    xr: [f32; BINS],
    xi: [f32; BINS],
    tmp: [f32; N],
    pub active: bool,
}

impl Default for BodyConv {
    fn default() -> Self {
        Self::new()
    }
}

impl BodyConv {
    pub fn new() -> Self {
        BodyConv {
            fft: Fft::new(),
            parts: 0,
            hr: [vec![0.0; MAX_PARTS * BINS], vec![0.0; MAX_PARTS * BINS]],
            hi: [vec![0.0; MAX_PARTS * BINS], vec![0.0; MAX_PARTS * BINS]],
            fdl_r: vec![0.0; MAX_PARTS * BINS],
            fdl_i: vec![0.0; MAX_PARTS * BINS],
            head: 0,
            inbuf: [0.0; N],
            fill: 0,
            out: [[0.0; B]; 2],
            zr: [0.0; M],
            zi: [0.0; M],
            xr: [0.0; BINS],
            xi: [0.0; BINS],
            tmp: [0.0; N],
            active: false,
        }
    }

    /// Load a stereo impulse response (truncated to MAX_PARTS·B taps).
    pub fn set_ir(&mut self, l: &[f32], r: &[f32]) {
        let len = l.len().max(r.len()).min(MAX_PARTS * B);
        self.parts = len.div_ceil(B).max(1);
        for (ch, h) in [l, r].iter().enumerate() {
            for p in 0..self.parts {
                for i in 0..N {
                    let k = p * B + i;
                    self.tmp[i] = if i < B && k < h.len() && k < len { h[k] } else { 0.0 };
                }
                let tmp = self.tmp;
                let (hr, hi) = (&mut self.hr[ch][p * BINS..(p + 1) * BINS], &mut self.hi[ch][p * BINS..(p + 1) * BINS]);
                self.fft.rfft(&tmp, &mut self.zr, &mut self.zi, hr, hi);
            }
        }
        self.active = true;
    }

    pub fn reset(&mut self) {
        self.fdl_r.iter_mut().for_each(|x| *x = 0.0);
        self.fdl_i.iter_mut().for_each(|x| *x = 0.0);
        self.inbuf = [0.0; N];
        self.out = [[0.0; B]; 2];
        self.fill = 0;
    }

    pub fn latency(&self) -> usize {
        B
    }

    /// One sample in, one stereo sample out (B samples late).
    #[inline]
    pub fn tick(&mut self, x: f32) -> (f32, f32) {
        let i = self.fill;
        let y = (self.out[0][i], self.out[1][i]);
        self.inbuf[B + i] = x;
        self.fill += 1;
        if self.fill == B {
            self.fill = 0;
            self.block();
        }
        y
    }

    fn block(&mut self) {
        let parts = self.parts.max(1);
        // Newest spectrum into the delay line.
        self.head = (self.head + parts - 1) % parts;
        let inbuf = self.inbuf;
        {
            let (fr, fi) = (&mut self.fdl_r[self.head * BINS..(self.head + 1) * BINS], &mut self.fdl_i[self.head * BINS..(self.head + 1) * BINS]);
            self.fft.rfft(&inbuf, &mut self.zr, &mut self.zi, fr, fi);
        }
        // Slide the input window.
        self.inbuf.copy_within(B..N, 0);
        for ch in 0..2 {
            self.xr = [0.0; BINS];
            self.xi = [0.0; BINS];
            for p in 0..parts {
                let slot = (self.head + p) % parts;
                let (fr, fi) = (&self.fdl_r[slot * BINS..(slot + 1) * BINS], &self.fdl_i[slot * BINS..(slot + 1) * BINS]);
                let (hr, hi) = (&self.hr[ch][p * BINS..(p + 1) * BINS], &self.hi[ch][p * BINS..(p + 1) * BINS]);
                for k in 0..BINS {
                    self.xr[k] += fr[k] * hr[k] - fi[k] * hi[k];
                    self.xi[k] += fr[k] * hi[k] + fi[k] * hr[k];
                }
            }
            let (xr, xi) = (self.xr, self.xi);
            let mut tmp = self.tmp;
            self.fft.irfft(&xr, &xi, &mut self.zr, &mut self.zi, &mut tmp);
            self.out[ch].copy_from_slice(&tmp[B..N]);
        }
    }
}

/// A body's dense upper modes, synthesised: Wigner-spaced frequencies (level repulsion, as in
/// measured violin and guitar bodies above the first few modes), a radiation envelope with its
/// peaks (a violin's bridge hill, a guitar top's ring), a damping law, and a random radiation
/// weight per mode for each of two directions.
pub struct ModeCloud<'a> {
    pub f_lo: f32,
    pub f_hi: f32,
    /// Modal density at 1 kHz (modes/Hz) and its growth exponent.
    pub density: f32,
    pub density_exp: f32,
    /// Loss factor η at 1 kHz and its slope (Q = 1/η).
    pub eta: f32,
    pub eta_slope: f32,
    /// The broad admittance the cloud stands in for (the "floor" gain a single wide band-pass
    /// would have) — each mode gets g = floor / √(density · π/2 · f · η), so the cloud carries the
    /// same energy per hertz as the floor it replaces.
    pub floor: f32,
    /// Radiation peaks: (centre Hz, extra gain, width in octaves).
    pub peaks: &'a [(f32, f32, f32)],
    /// Tilt above 1 kHz (dB/octave).
    pub tilt_db: f32,
    pub seed: u32,
}

/// Render a ModeCloud as a stereo impulse response in the strings' own units: the radiated
/// pressure per unit bridge force sample, i.e. y0·g·ω²η/(sr·2π·400)·e^{−σt}·sin ωt per mode —
/// exactly what the in-loop modes' radiation (`(p − p₁)·sr/(2π·400)·y0`) gives for the same mode.
pub fn render_cloud(c: &ModeCloud, sr: f32, y0: f32, l: &mut [f32], r: &mut [f32]) -> usize {
    let len = l.len().min(r.len());
    l[..len].iter_mut().for_each(|x| *x = 0.0);
    r[..len].iter_mut().for_each(|x| *x = 0.0);
    let mut s = c.seed | 1;
    let mut rnd = || {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        (s >> 8) as f32 / 16777216.0
    };
    let mut f = c.f_lo * 0.75;
    let mut count = 0usize;
    let top = c.f_hi.min(sr * 0.45);
    let scale = y0 / (sr * 2.0 * PI * 400.0);
    while f < top && count < 4000 {
        let dens = (c.density * (f / 1000.0).powf(c.density_exp)).max(1e-4);
        // Wigner surmise: spacing = mean · √(−4/π · ln u).
        let u = rnd().max(1e-6);
        f += ((-4.0 / PI * u.ln()).sqrt() / dens).max(0.5);
        if f >= top {
            break;
        }
        count += 1;
        let eta = (c.eta * (f / 1000.0).powf(c.eta_slope)).clamp(0.003, 0.2);
        let sigma = PI * f * eta;
        let mut env = 10f32.powf(((f / 1000.0).log2().max(0.0) * c.tilt_db / 20.0).min(1.5));
        for &(fc, pg, w) in c.peaks {
            let o = (f / fc).log2() / w.max(0.05);
            env *= 1.0 + pg * (-0.5 * o * o).exp();
        }
        let g = c.floor * env / (dens * PI * 0.5 * f * eta).sqrt();
        // Hand over smoothly to the in-loop modes around f_lo.
        let ho = ((f - 0.75 * c.f_lo) / (0.5 * c.f_lo)).clamp(0.0, 1.0);
        let g = g * ho * ho * (3.0 - 2.0 * ho);
        let w = 2.0 * PI * f;
        let a = scale * g * w * w * eta;
        let (al, ar) = (a * (rnd() - 0.5) * 2.4, a * (rnd() - 0.5) * 2.4);
        let wd = w / sr;
        let d = (-sigma / sr).exp();
        let (c1, c2) = (2.0 * d * wd.cos(), d * d);
        // y[n] = sin((n+1)ω)·dⁿ via the recursion seeded with y0 = sin ω.
        let (mut y1, mut y2) = (0.0f32, 0.0f32);
        let mut x = wd.sin();
        let n_max = ((7.0 / sigma) * sr).min(len as f32) as usize;
        for n in 0..n_max {
            let y = x + c1 * y1 - c2 * y2;
            x = 0.0;
            y2 = y1;
            y1 = y;
            l[n] += al * y;
            r[n] += ar * y;
        }
    }
    let fade = (len / 10).max(1);
    for i in 0..fade {
        let g = i as f32 / fade as f32;
        l[len - 1 - i] *= g;
        r[len - 1 - i] *= g;
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bodyconv_matches_direct_convolution() {
        let mut h_l = vec![0.0f32; 1000];
        let mut h_r = vec![0.0f32; 1000];
        let mut s = 7u32;
        for i in 0..1000 {
            s = s.wrapping_mul(1664525).wrapping_add(1013904223);
            h_l[i] = ((s >> 9) as f32 / 8388608.0 - 1.0) * (-(i as f32) / 200.0).exp();
            h_r[i] = h_l[i] * if i % 3 == 0 { -1.0 } else { 0.5 };
        }
        let mut c = BodyConv::new();
        c.set_ir(&h_l, &h_r);
        let n = 3000;
        let x: Vec<f32> = (0..n).map(|i| ((i * 37 % 101) as f32 / 50.0 - 1.0) * if i < 600 { 1.0 } else { 0.3 }).collect();
        let mut y = vec![(0.0f32, 0.0f32); n];
        for i in 0..n {
            y[i] = c.tick(x[i]);
        }
        for i in B..n {
            let t = i - B;
            let (mut dl, mut dr) = (0.0f32, 0.0f32);
            for k in 0..h_l.len().min(t + 1) {
                dl += h_l[k] * x[t - k];
                dr += h_r[k] * x[t - k];
            }
            assert!((y[i].0 - dl).abs() < 2e-3, "L at {}: {} vs {}", i, y[i].0, dl);
            assert!((y[i].1 - dr).abs() < 2e-3, "R at {}: {} vs {}", i, y[i].1, dr);
        }
    }

    #[test]
    fn mode_cloud_is_dense_and_decays() {
        let mut l = vec![0.0f32; 4096];
        let mut r = vec![0.0f32; 4096];
        let peaks = [(2500.0, 2.0, 0.6)];
        let c = ModeCloud { f_lo: 1000.0, f_hi: 12000.0, density: 0.05, density_exp: 0.5, eta: 0.02, eta_slope: 0.3, floor: 0.3, peaks: &peaks, tilt_db: -3.0, seed: 3 };
        let n = render_cloud(&c, 48000.0, 3e-3, &mut l, &mut r);
        assert!(n > 300, "only {} modes", n);
        let e0: f32 = l[..1000].iter().map(|v| v * v).sum();
        let e1: f32 = l[3000..4000].iter().map(|v| v * v).sum();
        assert!(e0 > 0.0 && e1 < e0 * 0.05, "decay {} → {}", e0, e1);
    }
}
