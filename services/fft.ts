// ─── Minimal radix-2 FFT (offline spectral analysis) ──────────────────────────
// In-place iterative Cooley-Tukey. Used by the polyphonic transcription engine to
// get a magnitude spectrum per frame. No dependencies — works in browser + node.

/** In-place complex FFT. re/im length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wlenRe = Math.cos(ang), wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe0 = re[i + k + half], bIm0 = im[i + k + half];
        const bRe = bRe0 * wRe - bIm0 * wIm;
        const bIm = bRe0 * wIm + bIm0 * wRe;
        re[i + k] = aRe + bRe; im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe; im[i + k + half] = aIm - bIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

/** Magnitude spectrum (length n/2) of a real, already-windowed frame. */
export function magnitudeSpectrum(frame: Float32Array): Float32Array {
  const n = frame.length;
  const re = new Float32Array(n);
  re.set(frame);
  const im = new Float32Array(n);
  fft(re, im);
  const mag = new Float32Array(n >> 1);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/** Largest power of two ≤ x. */
export function prevPow2(x: number): number {
  let p = 1;
  while (p * 2 <= x) p *= 2;
  return p;
}
