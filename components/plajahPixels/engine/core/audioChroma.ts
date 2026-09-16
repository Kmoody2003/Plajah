// Pitch-class extraction shared by every Pixels render path.
// The RGB channels of row 0 remain the FFT. The first twelve alpha texels carry
// C..B chroma, so existing shaders keep their ABI and new work can react to
// actual summed notes rather than broad frequency buckets.

export const CHROMA_SIZE = 12;

export function extractChroma(freq: Uint8Array, sampleRate = 48_000): Float32Array {
  const out = new Float32Array(CHROMA_SIZE);
  const weight = new Float32Array(CHROMA_SIZE);
  const fftSize = Math.max(2, freq.length * 2);
  for (let i = 1; i < freq.length; i++) {
    const hz = i * sampleRate / fftSize;
    if (hz < 55 || hz > 5_000) continue;
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    const pc = ((midi % 12) + 12) % 12;
    // Equal-loudness-ish tilt prevents the many upper bins from drowning roots.
    const w = 1 / Math.sqrt(Math.max(1, hz / 110));
    const v = freq[i] / 255;
    out[pc] += v * v * w;
    weight[pc] += w;
  }
  let peak = 1e-5;
  for (let i = 0; i < CHROMA_SIZE; i++) {
    out[i] = Math.sqrt(out[i] / Math.max(weight[i], 1e-5));
    peak = Math.max(peak, out[i]);
  }
  // Preserve dynamics while making the current harmony readable.
  const norm = Math.max(.22, peak);
  for (let i = 0; i < CHROMA_SIZE; i++) out[i] = Math.min(1, out[i] / norm);
  return out;
}

export function smoothChroma(state: Float32Array, target: Float32Array, dt = 1 / 60): Float32Array {
  for (let i = 0; i < CHROMA_SIZE; i++) {
    const tau = target[i] > state[i] ? .045 : .24;
    state[i] += (target[i] - state[i]) * (1 - Math.exp(-Math.max(0, dt) / tau));
  }
  return state;
}

export function writeChromaAlpha(texturePixels: Uint8Array, chroma: Float32Array): void {
  for (let i = 0; i < CHROMA_SIZE; i++) texturePixels[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, chroma[i])) * 255);
}
