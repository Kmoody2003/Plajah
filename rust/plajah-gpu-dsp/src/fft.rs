//! Radix-2 FFT that mirrors `fft_in_place` in shaders/conv.wgsl step for step: same bit-reversed
//! load, same butterfly indexing, same f32 twiddle table (uploaded to the GPU as-is), same complex
//! multiply. CPU and GPU spectra therefore differ only where a GPU driver fuses a multiply-add.

pub type C32 = [f32; 2];

#[inline(always)]
pub fn cmul(a: C32, b: C32) -> C32 {
    [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
}

pub struct Fft {
    pub n: usize,
    pub log2n: u32,
    /// e^{-2πij/N} for j < N/2, rounded from f64.
    pub twiddles: Vec<C32>,
}

impl Fft {
    pub fn new(n: usize) -> Self {
        assert!(n.is_power_of_two() && n >= 4, "FFT size must be a power of two ≥ 4");
        let twiddles = (0..n / 2)
            .map(|j| {
                let a = -2.0 * std::f64::consts::PI * j as f64 / n as f64;
                [a.cos() as f32, a.sin() as f32]
            })
            .collect();
        Self { n, log2n: n.trailing_zeros(), twiddles }
    }

    #[inline(always)]
    pub fn bitrev(&self, i: usize) -> usize {
        ((i as u32).reverse_bits() >> (32 - self.log2n)) as usize
    }

    /// Transform `buf`, which must already hold its input in bit-reversed order.
    pub fn in_place(&self, buf: &mut [C32]) {
        let n = self.n;
        for s in 1..=self.log2n {
            let half = 1usize << (s - 1);
            let tw_stride = n >> s;
            for b in 0..n / 2 {
                let j = b & (half - 1);
                let i0 = ((b >> (s - 1)) << s) + j;
                let i1 = i0 + half;
                let v = cmul(buf[i1], self.twiddles[j * tw_stride]);
                let a = buf[i0];
                buf[i0] = [a[0] + v[0], a[1] + v[1]];
                buf[i1] = [a[0] - v[0], a[1] - v[1]];
            }
        }
    }

    /// Spectrum bins 0..=N/2 of a real window of N samples.
    pub fn forward_real(&self, window: &[f32], buf: &mut [C32], bins: &mut [C32]) {
        for (i, b) in buf.iter_mut().enumerate() {
            *b = [window[self.bitrev(i)], 0.0];
        }
        self.in_place(buf);
        bins.copy_from_slice(&buf[..self.n / 2 + 1]);
    }

    /// Real part of the inverse of a Hermitian spectrum given as bins 0..=N/2, last N/2 samples
    /// only (the overlap-save keep). Same conj(FFT(conj(Y)))/N route as the shader.
    pub fn inverse_real_tail(&self, bins: &[C32], buf: &mut [C32], out: &mut [f32]) {
        let n = self.n;
        let nb = n / 2 + 1;
        for (i, b) in buf.iter_mut().enumerate() {
            let j = self.bitrev(i);
            *b = if j < nb {
                let v = bins[j];
                [v[0], -v[1]]
            } else {
                bins[n - j]
            };
        }
        self.in_place(buf);
        let scale = 1.0 / n as f32;
        for (i, o) in out.iter_mut().enumerate() {
            *o = buf[n / 2 + i][0] * scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_dft_and_round_trips() {
        let n = 64;
        let fft = Fft::new(n);
        let x: Vec<f32> = (0..n).map(|i| ((i * 7919) % 31) as f32 / 31.0 - 0.5).collect();
        let mut buf = vec![[0.0; 2]; n];
        let mut bins = vec![[0.0; 2]; n / 2 + 1];
        fft.forward_real(&x, &mut buf, &mut bins);
        for (k, b) in bins.iter().enumerate() {
            let (mut re, mut im) = (0.0f64, 0.0f64);
            for (i, &v) in x.iter().enumerate() {
                let a = -2.0 * std::f64::consts::PI * (k * i) as f64 / n as f64;
                re += v as f64 * a.cos();
                im += v as f64 * a.sin();
            }
            assert!((b[0] as f64 - re).abs() < 1e-4 && (b[1] as f64 - im).abs() < 1e-4, "bin {k}");
        }
        let mut tail = vec![0.0; n / 2];
        fft.inverse_real_tail(&bins, &mut buf, &mut tail);
        for i in 0..n / 2 {
            assert!((tail[i] - x[n / 2 + i]).abs() < 1e-5);
        }
    }
}
