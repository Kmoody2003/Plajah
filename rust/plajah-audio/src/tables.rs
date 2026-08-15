//! Wavetable storage and band-limited mip generation.
//!
//! The single most important thing separating a professional wavetable synth from a toy is
//! anti-aliasing. Playing a table back by naive interpolation folds every harmonic above
//! Nyquist back down into the audible band as inharmonic grit — the "cheap digital" sound.
//!
//! The fix (Serum's approach): for every frame, precompute a pyramid of band-limited copies.
//! Level L keeps only the harmonics that still fit under Nyquist when the fundamental is high
//! enough to need that level. At render time we pick the level by pitch and crossfade between
//! neighbours so the switch is never audible.
//!
//! Band-limiting is done properly in the frequency domain: forward FFT → zero the bins above
//! the level's harmonic limit → inverse FFT. Done once at load, never in the render path.

use core::f32::consts::PI;

pub const MIP_LEVELS: usize = 11; // level 0 = full band … level 10 ≈ 1 harmonic

/// In-place iterative radix-2 Cooley–Tukey FFT. `n` must be a power of two.
fn fft(re: &mut [f32], im: &mut [f32], inverse: bool) {
    let n = re.len();
    if n < 2 {
        return;
    }
    // Bit-reversal permutation.
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2usize;
    while len <= n {
        let ang = if inverse { 2.0 * PI / len as f32 } else { -2.0 * PI / len as f32 };
        let (wr, wi) = (ang.cos(), ang.sin());
        let half = len / 2;
        let mut i = 0usize;
        while i < n {
            let (mut cr, mut ci) = (1.0f32, 0.0f32);
            for k in 0..half {
                let ur = re[i + k];
                let ui = im[i + k];
                let br = re[i + k + half];
                let bi = im[i + k + half];
                let vr = br * cr - bi * ci;
                let vi = br * ci + bi * cr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + half] = ur - vr;
                im[i + k + half] = ui - vi;
                let nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
            i += len;
        }
        len <<= 1;
    }
    if inverse {
        let inv = 1.0 / n as f32;
        for i in 0..n {
            re[i] *= inv;
            im[i] *= inv;
        }
    }
}

/// One wavetable: `frames` morph positions, each `frame_size` samples, each with a mip pyramid.
/// Layout is flat and contiguous for cache-friendly reads:
///   data[level][frame * (frame_size + GUARD) + sample]
/// A guard sample (a copy of sample 0) at the end of every frame lets the interpolator read
/// past the end without a branch or a wrap test in the inner loop.
pub struct WaveTable {
    pub frames: usize,
    pub frame_size: usize,
    stride: usize,
    levels: Vec<Vec<f32>>,
}

const GUARD: usize = 3; // cubic interpolation reads x[i-1..i+2]

impl WaveTable {
    pub fn empty() -> Self {
        // A single-frame sine so an uninitialised slot is silent-but-safe rather than garbage.
        let frame_size = 2048;
        let mut src = vec![0.0f32; frame_size];
        for (i, s) in src.iter_mut().enumerate() {
            *s = (2.0 * PI * i as f32 / frame_size as f32).sin();
        }
        Self::from_frames(&src, 1, frame_size)
    }

    /// Build from raw interleaved frame data (`frames * frame_size` samples).
    pub fn from_frames(src: &[f32], frames: usize, frame_size: usize) -> Self {
        let stride = frame_size + GUARD;
        let mut levels: Vec<Vec<f32>> = Vec::with_capacity(MIP_LEVELS);

        // Scratch for the FFT, reused across every frame and level.
        let mut re = vec![0.0f32; frame_size];
        let mut im = vec![0.0f32; frame_size];
        let mut spec_re = vec![0.0f32; frame_size];

        for level in 0..MIP_LEVELS {
            // Harmonics retained at this level: half the frame's bins, halved per level.
            let max_harm = ((frame_size / 2) >> level).max(1);
            let mut data = vec![0.0f32; frames * stride];

            for f in 0..frames {
                let base = f * frame_size;
                let end = (base + frame_size).min(src.len());
                re[..frame_size].fill(0.0);
                im[..frame_size].fill(0.0);
                let n = end.saturating_sub(base);
                re[..n].copy_from_slice(&src[base..end]);

                if level == 0 {
                    // Full band — no filtering needed, the source is the source.
                    spec_re[..frame_size].copy_from_slice(&re[..frame_size]);
                } else {
                    fft(&mut re, &mut im, false);
                    // Zero every bin above the harmonic limit, both halves of the spectrum.
                    for k in 0..frame_size {
                        let harm = if k <= frame_size / 2 { k } else { frame_size - k };
                        if harm > max_harm {
                            re[k] = 0.0;
                            im[k] = 0.0;
                        }
                    }
                    fft(&mut re, &mut im, true);
                    spec_re[..frame_size].copy_from_slice(&re[..frame_size]);
                }

                let dst = f * stride;
                data[dst..dst + frame_size].copy_from_slice(&spec_re[..frame_size]);
                // Guard samples wrap the frame so interpolation never branches.
                for g in 0..GUARD {
                    data[dst + frame_size + g] = spec_re[g % frame_size];
                }
            }
            levels.push(data);
        }

        Self { frames, frame_size, stride, levels }
    }

    /// Pick the mip level for a phase increment (cycles per sample), plus the crossfade amount
    /// to the next level down. `inc` of 0.01 means the fundamental is 1/100th of the sample
    /// rate, so harmonics up to 50 fit under Nyquist.
    #[inline]
    pub fn level_for(&self, inc: f32) -> (usize, usize, f32) {
        let inc = inc.abs().max(1.0e-7);
        let allowed = 0.5 / inc; // highest harmonic that still fits under Nyquist
        let full = (self.frame_size / 2) as f32;
        // level L retains full / 2^L harmonics → smallest L with full/2^L <= allowed
        let ratio = (full / allowed).max(1.0);
        let l = ratio.log2();
        let l0 = l.floor().max(0.0);
        let frac = l - l0;
        let lo = (l0 as usize).min(MIP_LEVELS - 1);
        let hi = (lo + 1).min(MIP_LEVELS - 1);
        (lo, hi, frac)
    }

    /// 4-point cubic Hermite read at a fractional sample position within one frame/level.
    #[inline]
    fn read_cubic(&self, level: usize, frame: usize, pos: f32) -> f32 {
        let data = &self.levels[level];
        let base = frame * self.stride;
        let i = pos as usize;
        let t = pos - i as f32;
        // Guard samples make the +1/+2 reads safe; the -1 read wraps to the frame's tail.
        let xm1 = if i == 0 { data[base + self.frame_size - 1] } else { data[base + i - 1] };
        let x0 = data[base + i];
        let x1 = data[base + i + 1];
        let x2 = data[base + i + 2];
        let c0 = x0;
        let c1 = 0.5 * (x1 - xm1);
        let c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2;
        let c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
        ((c3 * t + c2) * t + c1) * t + c0
    }

    /// Sample the table. `phase` 0..1, `morph` 0..1 across frames, `inc` drives mip selection.
    #[inline]
    pub fn sample(&self, phase: f32, morph: f32, inc: f32) -> f32 {
        let (lo, hi, xf) = self.level_for(inc);
        let pos = phase * self.frame_size as f32;
        let pos = if pos >= self.frame_size as f32 { 0.0 } else { pos };

        let fpos = morph.clamp(0.0, 1.0) * (self.frames.saturating_sub(1)) as f32;
        let f0 = fpos as usize;
        let f1 = (f0 + 1).min(self.frames - 1);
        let fx = fpos - f0 as f32;

        // Morph across frames, then crossfade across mip levels.
        let a = self.read_cubic(lo, f0, pos) * (1.0 - fx) + self.read_cubic(lo, f1, pos) * fx;
        if xf <= 0.0005 || lo == hi {
            return a;
        }
        let b = self.read_cubic(hi, f0, pos) * (1.0 - fx) + self.read_cubic(hi, f1, pos) * fx;
        a * (1.0 - xf) + b * xf
    }
}
