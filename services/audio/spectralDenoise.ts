/**
 * spectralDenoise.ts — Professional Spectral Gating Noise Reduction Engine.
 *
 * Implements frequency-domain spectral subtraction and Wiener filtering (STFT with Hann window
 * and 75% overlap-add) for surgical removal of steady background noise, hiss, hum, and fan rumble
 * without introducing musical noise artifacts or phase smears.
 *
 * Usable for Melos track processing, Fabula dialogue cleanups, and studio stem post-processing.
 */

export interface SpectralDenoiseOptions {
  /** Attenuation amount in decibels (0 to 40 dB, default 14 dB). */
  reductionDb?: number;
  /** Multiplier above estimated noise floor to gate out (default 1.25). */
  thresholdRatio?: number;
  /** Duration in seconds at start of audio to estimate noise floor (default 0.25s). */
  noiseProfileDuration?: number;
  /** Optional pre-computed noise magnitude spectrum. */
  noiseProfile?: Float32Array;
  /** FFT frame size (power of 2: 1024, 2048, 4096; default 2048). */
  fftSize?: number;
  /** Temporal smoothing factor between frames (0..1, default 0.82). */
  smoothingAlpha?: number;
}

/**
 * In-place Real-to-Complex FFT and Complex-to-Real IFFT implementation (Radix-2 Cooley-Tukey).
 */
function fft(real: Float32Array, imag: Float32Array, inverse = false): void {
  const n = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i]; real[i] = real[j]; real[j] = tempR;
      const tempI = imag[i]; imag[i] = imag[j]; imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Butterfly computations
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (sign * 2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < half; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + half] * wr - imag[i + k + half] * wi;
        const vI = real[i + k + half] * wi + imag[i + k + half] * wr;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;
        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

/**
 * Generate periodic Hann window.
 */
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  }
  return win;
}

/**
 * Estimate noise magnitude spectrum from the initial silence/room tone segment.
 */
export function estimateNoiseSpectrum(
  samples: Float32Array,
  sampleRate: number,
  durationSeconds = 0.25,
  fftSize = 2048
): Float32Array {
  const numBins = (fftSize >> 1) + 1;
  const avgNoise = new Float32Array(numBins);
  const win = createHannWindow(fftSize);
  const hopSize = fftSize >> 2; // 75% overlap

  const profileSamples = Math.min(samples.length, Math.round(sampleRate * durationSeconds));
  if (profileSamples < fftSize) {
    // If input is too short, provide small flat floor
    avgNoise.fill(1e-4);
    return avgNoise;
  }

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  let frameCount = 0;

  for (let offset = 0; offset + fftSize <= profileSamples; offset += hopSize) {
    for (let i = 0; i < fftSize; i++) {
      real[i] = samples[offset + i] * win[i];
      imag[i] = 0;
    }
    fft(real, imag, false);

    for (let b = 0; b < numBins; b++) {
      const mag = Math.sqrt(real[b] * real[b] + imag[b] * imag[b]);
      avgNoise[b] += mag;
    }
    frameCount++;
  }

  if (frameCount > 0) {
    for (let b = 0; b < numBins; b++) {
      avgNoise[b] /= frameCount;
    }
  } else {
    avgNoise.fill(1e-4);
  }

  return avgNoise;
}

/**
 * Process a single channel of audio samples with spectral subtraction and temporal smoothing.
 */
export function denoiseChannel(
  samples: Float32Array,
  sampleRate: number,
  options: SpectralDenoiseOptions = {}
): Float32Array {
  const reductionDb = Math.max(0, Math.min(40, options.reductionDb ?? 14));
  if (reductionDb === 0) {
    return new Float32Array(samples);
  }

  const thresholdRatio = Math.max(1.0, options.thresholdRatio ?? 1.25);
  const fftSize = options.fftSize ?? 2048;
  const numBins = (fftSize >> 1) + 1;
  const hopSize = fftSize >> 2; // 75% overlap
  const smoothingAlpha = Math.max(0, Math.min(0.95, options.smoothingAlpha ?? 0.82));

  // Minimum gain floor derived from reduction dB
  const minGain = Math.pow(10, -reductionDb / 20);

  const noiseSpectrum = options.noiseProfile ?? estimateNoiseSpectrum(
    samples,
    sampleRate,
    options.noiseProfileDuration ?? 0.25,
    fftSize
  );

  const win = createHannWindow(fftSize);
  const out = new Float32Array(samples.length);
  const normFactor = (fftSize / hopSize) * 0.375; // Constant Overlap-Add factor for 75% Hann

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const prevGain = new Float32Array(numBins);
  prevGain.fill(1.0);

  const numFrames = Math.max(0, Math.floor((samples.length - fftSize) / hopSize) + 1);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;

    // Apply window
    for (let i = 0; i < fftSize; i++) {
      real[i] = samples[offset + i] * win[i];
      imag[i] = 0;
    }

    // Forward FFT
    fft(real, imag, false);

    // Compute spectral suppression gain
    for (let b = 0; b < numBins; b++) {
      const mag = Math.sqrt(real[b] * real[b] + imag[b] * imag[b]);
      const noiseThreshold = noiseSpectrum[b] * thresholdRatio;

      let targetGain = 1.0;
      if (mag > 1e-9) {
        if (mag < noiseThreshold) {
          targetGain = minGain;
        } else {
          // Soft Wiener-style transition above noise floor
          const snr = (mag - noiseThreshold) / mag;
          targetGain = Math.max(minGain, Math.min(1.0, snr));
        }
      }

      // Temporal smoothing (averages gain across frames to suppress musical chirps)
      const smoothedGain = smoothingAlpha * prevGain[b] + (1 - smoothingAlpha) * targetGain;
      prevGain[b] = smoothedGain;

      // Apply gain to bins (and symmetrical conjugate bins for inverse FFT)
      real[b] *= smoothedGain;
      imag[b] *= smoothedGain;

      if (b > 0 && b < numBins - 1) {
        const mirrorBin = fftSize - b;
        real[mirrorBin] = real[b];
        imag[mirrorBin] = -imag[b];
      }
    }

    // Inverse FFT
    fft(real, imag, true);

    // Overlap-add with windowing
    for (let i = 0; i < fftSize; i++) {
      const outIdx = offset + i;
      if (outIdx < out.length) {
        out[outIdx] += (real[i] * win[i]) / normFactor;
      }
    }
  }

  // Preserve tail samples beyond last full FFT window
  const processedEnd = numFrames * hopSize;
  for (let i = processedEnd; i < samples.length; i++) {
    if (out[i] === 0) {
      out[i] = samples[i] * minGain;
    }
  }

  return out;
}

/**
 * Denoise an entire multi-channel AudioBuffer.
 */
export function denoiseAudioBuffer(
  buffer: AudioBuffer,
  ctx: BaseAudioContext,
  options: SpectralDenoiseOptions = {}
): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const cleanChannel = denoiseChannel(buffer.getChannelData(ch), buffer.sampleRate, options);
    out.copyToChannel(cleanChannel, ch);
  }
  return out;
}
