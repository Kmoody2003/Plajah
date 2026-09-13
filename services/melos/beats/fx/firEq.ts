// firEq — linear-phase EQ kernel design. The minimum-phase biquad chain (spectraEq) is the real-time
// default; this builds a LINEAR-PHASE FIR from the same band curve for mastering, where phase coherence
// matters more than latency. Method: sample the target magnitude on the FFT grid, apply a pure linear
// phase term, IFFT to a symmetric impulse, window it. The kernel loads into a ConvolverNode.
//
// Pure + measurable: FFT the kernel back and the magnitude matches curveMagnitudeDb; the impulse is
// symmetric (⇒ exactly linear phase, constant group delay = (taps-1)/2). Tested in verifyFirEq.mjs.
import { curveMagnitudeDb, type SpectraBand } from './spectraEq';

/** In-place iterative radix-2 FFT (inverse when `inv`). Lengths must be a power of two. */
export function fft(re: Float64Array, im: Float64Array, inv = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k, b = a + (len >> 1);
        const tr = re[b] * cwr - im[b] * cwi;
        const ti = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Design a linear-phase FIR (Float32Array of `taps`, power of two) whose magnitude response follows the
 * EQ band curve. Delay = (taps-1)/2 samples — the ConvolverNode caller should treat that as the plugin's
 * reported latency. A Hann window tames pre-ring at the cost of a touch of band-edge softness.
 */
export function designLinearPhaseFir(bands: SpectraBand[], sampleRate: number, taps = 8192): Float32Array {
  const N = taps; // power of two
  const re = new Float64Array(N), im = new Float64Array(N);
  const D = (N - 1) / 2;
  for (let k = 0; k <= N / 2; k++) {
    const f = (k * sampleRate) / N;
    const mag = Math.pow(10, curveMagnitudeDb(bands, Math.min(f, sampleRate / 2 - 1), sampleRate) / 20);
    const ph = (-2 * Math.PI * k * D) / N; // pure linear phase
    re[k] = mag * Math.cos(ph); im[k] = mag * Math.sin(ph);
    if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } // Hermitian ⇒ real impulse
  }
  fft(re, im, true); // IFFT → real, symmetric impulse centered at D
  const h = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)); // Hann
    h[n] = re[n] * w;
  }
  return h;
}

/** Design a windowed FIR Hilbert transformer (Type III, odd length): a 90° phase shift across the band,
 *  used to build the analytic signal for a single-sideband frequency shifter. Returns the kernel and its
 *  group delay (= (taps-1)/2 samples); the direct path must be delayed by the same amount to stay aligned. */
export function designHilbertFir(taps = 511): { kernel: Float32Array; delay: number } {
  const N = taps % 2 === 0 ? taps + 1 : taps;  // odd length
  const M = (N - 1) / 2;
  const h = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const k = n - M;
    // ideal Hilbert: 2/(πk) for odd k, 0 for even k (and 0 at centre)
    const ideal = (k === 0 || k % 2 === 0) ? 0 : 2 / (Math.PI * k);
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)); // Hann
    h[n] = ideal * w;
  }
  return { kernel: h, delay: M };
}
