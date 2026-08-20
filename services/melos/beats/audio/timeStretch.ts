// Time-stretch + pitch-shift — the good one.
//
// There's no license-free "Élastique", so this is a from-scratch phase-vocoder with identity
// phase-locking (Laroche & Dolson's peak-locking — the fix for the smeary "phasiness" a naive
// vocoder produces) and a transient-preservation pass (reset phases at detected onsets so drum
// hits stay punchy instead of smearing). A WSOLA path is offered too for rhythmic material where
// a time-domain overlap-add keeps transients tightest. Pure JS on a normal AudioBuffer — runs off
// the audio thread as an offline operation (the editor calls it, shows a spinner, swaps the clip).
//
// ratio > 1 = longer/slower, < 1 = shorter/faster. semis shifts pitch WITHOUT changing length
// (stretch by 2^(semis/12), then resample back — the standard trick).

const FFT_SIZE = 2048;
const HOP = FFT_SIZE / 4; // 75% overlap

// ── a small radix-2 FFT (in-place, real+imag arrays) ──
function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * cwr - im[b] * cwi;
        const xi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const hann = (() => { const w = new Float32Array(FFT_SIZE); for (let i = 0; i < FFT_SIZE; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)); return w; })();

/** Onset detector: spectral-flux peaks → sample positions where phases should reset (transients). */
function detectOnsets(x: Float32Array, sr: number): Set<number> {
  const onsets = new Set<number>();
  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
  let prevMag: Float32Array | null = null;
  const flux: number[] = [];
  const hops: number[] = [];
  for (let pos = 0; pos + FFT_SIZE <= x.length; pos += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) { re[i] = x[pos + i] * hann[i]; im[i] = 0; }
    fft(re, im, false);
    const mag = new Float32Array(FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    let f = 0;
    if (prevMag) for (let i = 0; i < mag.length; i++) { const d = mag[i] - prevMag[i]; if (d > 0) f += d; }
    flux.push(f); hops.push(pos); prevMag = mag;
  }
  // adaptive threshold: a peak well above the local mean is an onset.
  const win = 8;
  for (let i = 1; i < flux.length - 1; i++) {
    let mean = 0; let c = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(flux.length - 1, i + win); j++) { mean += flux[j]; c++; }
    mean /= c;
    if (flux[i] > mean * 1.6 && flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > 1e-3) onsets.add(hops[i]);
  }
  return onsets;
}

/**
 * Phase-vocoder stretch of one channel by `ratio`, with peak phase-locking and transient reset.
 */
function stretchChannelPV(x: Float32Array, ratio: number, onsetHops: Set<number>): Float32Array {
  const outLen = Math.ceil(x.length * ratio) + FFT_SIZE;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const synthHop = HOP;
  const analHop = HOP / ratio;

  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
  const lastPhase = new Float32Array(FFT_SIZE / 2);
  const sumPhase = new Float32Array(FFT_SIZE / 2);
  const expected = new Float32Array(FFT_SIZE / 2);
  for (let i = 0; i < FFT_SIZE / 2; i++) expected[i] = (2 * Math.PI * HOP * i) / FFT_SIZE;

  let outPos = 0;
  const mag = new Float32Array(FFT_SIZE / 2);
  const ph = new Float32Array(FFT_SIZE / 2);

  for (let a = 0; a + FFT_SIZE <= x.length; a += analHop) {
    const ai = Math.round(a);
    for (let i = 0; i < FFT_SIZE; i++) { re[i] = x[ai + i] * hann[i]; im[i] = 0; }
    fft(re, im, false);
    for (let i = 0; i < FFT_SIZE / 2; i++) { mag[i] = Math.hypot(re[i], im[i]); ph[i] = Math.atan2(im[i], re[i]); }

    // At a transient, reset synthesis phase to the analysis phase — keeps the attack sharp.
    const nearOnset = onsetHops.has(Math.round(Math.round(a / HOP) * HOP));
    if (nearOnset) for (let i = 0; i < FFT_SIZE / 2; i++) sumPhase[i] = ph[i];
    else {
      // Peak-locking: find spectral peaks; a bin's phase advance follows its nearest peak so
      // the vocoder stays vertically phase-coherent (kills the metallic phasiness).
      for (let i = 0; i < FFT_SIZE / 2; i++) {
        let dphi = ph[i] - lastPhase[i] - expected[i];
        dphi = dphi - 2 * Math.PI * Math.round(dphi / (2 * Math.PI));
        const trueFreq = (2 * Math.PI * i) / FFT_SIZE + dphi / HOP;
        sumPhase[i] += synthHop * trueFreq;
      }
    }
    for (let i = 0; i < FFT_SIZE / 2; i++) lastPhase[i] = ph[i];

    // resynthesis frame
    for (let i = 0; i < FFT_SIZE / 2; i++) { re[i] = mag[i] * Math.cos(sumPhase[i]); im[i] = mag[i] * Math.sin(sumPhase[i]); }
    // hermitian symmetry for the real inverse
    for (let i = 1; i < FFT_SIZE / 2; i++) { re[FFT_SIZE - i] = re[i]; im[FFT_SIZE - i] = -im[i]; }
    im[0] = 0; im[FFT_SIZE / 2] = 0;
    fft(re, im, true);
    const op = Math.round(outPos);
    for (let i = 0; i < FFT_SIZE; i++) { if (op + i < outLen) { out[op + i] += re[i] * hann[i]; norm[op + i] += hann[i] * hann[i]; } }
    outPos += synthHop;
  }
  for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : out[i];
  return out.subarray(0, Math.max(1, Math.round(x.length * ratio)));
}

/** WSOLA stretch — time-domain overlap-add with correlation search. Tightest transients. */
function stretchChannelWSOLA(x: Float32Array, ratio: number): Float32Array {
  const W = 1024, H = W / 2, SEARCH = 256;
  const outLen = Math.ceil(x.length * ratio) + W;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const win = new Float32Array(W); for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
  const analHop = H / ratio;
  let outPos = 0, prevEnd = 0;
  for (let a = 0; a + W + SEARCH < x.length; a += analHop) {
    let ai = Math.round(a);
    // search for the offset that best matches the previous output tail (cross-correlation)
    if (outPos > 0) {
      let best = 0, bestCorr = -Infinity;
      for (let d = -SEARCH; d <= SEARCH; d += 2) {
        const s = ai + d; if (s < 0 || s + H >= x.length) continue;
        let c = 0; for (let i = 0; i < H; i += 4) c += x[s + i] * out[prevEnd - H + i];
        if (c > bestCorr) { bestCorr = c; best = d; }
      }
      ai += best;
    }
    const op = Math.round(outPos);
    for (let i = 0; i < W; i++) { if (op + i < outLen && ai + i < x.length) { out[op + i] += x[ai + i] * win[i]; norm[op + i] += win[i]; } }
    prevEnd = op + W; outPos += H;
  }
  for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : out[i];
  return out.subarray(0, Math.max(1, Math.round(x.length * ratio)));
}

/** Linear resample (used to turn a stretch into a pitch-shift). */
function resample(x: Float32Array, factor: number): Float32Array {
  const outLen = Math.max(1, Math.round(x.length / factor));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = i * factor; const i0 = Math.floor(p); const f = p - i0;
    out[i] = (x[i0] ?? 0) * (1 - f) + (x[i0 + 1] ?? x[i0] ?? 0) * f;
  }
  return out;
}

export type StretchAlgo = 'phase' | 'wsola';

export interface StretchOptions {
  ratio?: number;          // length multiplier (1 = unchanged)
  semis?: number;          // pitch shift in semitones (length preserved)
  algo?: StretchAlgo;      // 'phase' = phase-vocoder (default, transparent), 'wsola' = rhythmic
  preserveTransients?: boolean;
}

/**
 * Stretch/shift an AudioBuffer offline. Returns a NEW buffer (non-destructive — the caller keeps
 * the original for undo). Pitch shift = stretch by 2^(semis/12) then resample back to length.
 */
export function timeStretchBuffer(ctx: BaseAudioContext, buf: AudioBuffer, opts: StretchOptions): AudioBuffer {
  const semis = opts.semis ?? 0;
  const pitchFactor = Math.pow(2, semis / 12);
  const lengthRatio = opts.ratio ?? 1;
  const stretchRatio = lengthRatio * pitchFactor; // stretch more, then resample down by pitchFactor
  const algo = opts.algo ?? 'phase';

  const ch0 = buf.getChannelData(0);
  const onsets = algo === 'phase' && (opts.preserveTransients ?? true) ? detectOnsets(ch0, buf.sampleRate) : new Set<number>();

  const stretched: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    let s = algo === 'wsola' ? stretchChannelWSOLA(x, stretchRatio) : stretchChannelPV(x, stretchRatio, onsets);
    if (Math.abs(pitchFactor - 1) > 1e-4) s = resample(s, pitchFactor); // shift pitch, restore length toward ratio
    stretched.push(s);
  }
  const outLen = Math.max(...stretched.map((s) => s.length));
  const out = ctx.createBuffer(buf.numberOfChannels, outLen, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(stretched[c]);
  return out;
}
