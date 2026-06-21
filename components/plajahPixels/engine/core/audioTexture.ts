// AudioTexture — uploads the spectrum + waveform into a GPU texture once per
// frame so GLSL generators (and post-FX) can sample audio directly, matching the
// existing ShaderLayer convention: a 512×2 texture, row 0 = FFT, row 1 = waveform
// (sampled at v=0.25 and v=0.75). Also derives the iBass/iMid/iTreble/iLevel
// scalars every consumer needs, so the FFT is read once for the whole GPU stage.

import { GL } from './glUtil';

const W = 512;

export class AudioTexture {
  readonly tex: WebGLTexture;
  private pixels = new Uint8Array(W * 2 * 4);
  private freq: Uint8Array | null = null;
  private wave: Uint8Array | null = null;
  bass = 0; mid = 0; treble = 0; level = 0;

  constructor(private gl: GL) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Read the analyser and upload. Safe to call with a null analyser (no-op). */
  /** Main-thread path: read the live analyser, then process + upload. */
  update(analyser: AnalyserNode | null) {
    if (!analyser) return;
    const bins = analyser.frequencyBinCount;
    const fftN = analyser.fftSize;
    if (!this.freq || this.freq.length !== bins) this.freq = new Uint8Array(bins);
    if (!this.wave || this.wave.length !== fftN) this.wave = new Uint8Array(fftN);
    analyser.getByteFrequencyData(this.freq);
    analyser.getByteTimeDomainData(this.wave);
    this.process(this.freq, this.wave);
  }

  /** Worker path: process + upload from raw arrays transferred from the main
   *  thread (a worker has no AnalyserNode). */
  updateFromArrays(freq: Uint8Array, wave: Uint8Array) {
    this.process(freq, wave);
  }

  private process(freq: Uint8Array, wave: Uint8Array) {
    const gl = this.gl;
    const bins = freq.length;
    const fftN = wave.length;

    // Resample both to 512 columns; row 0 = FFT, row 1 = waveform (grayscale).
    let sum = 0, bassSum = 0, midSum = 0, trebSum = 0;
    const bassEnd = Math.floor(bins * 0.08), midEnd = Math.floor(bins * 0.35);
    for (let x = 0; x < W; x++) {
      const fi = Math.min(bins - 1, (x / W * bins) | 0);
      const wi = Math.min(fftN - 1, (x / W * fftN) | 0);
      const fv = freq[fi], wv = wave[wi];
      let o = x * 4;                 // row 0
      this.pixels[o] = this.pixels[o + 1] = this.pixels[o + 2] = fv; this.pixels[o + 3] = 255;
      o = (W + x) * 4;               // row 1
      this.pixels[o] = this.pixels[o + 1] = this.pixels[o + 2] = wv; this.pixels[o + 3] = 255;
    }
    for (let i = 0; i < bins; i++) {
      const v = freq[i]; sum += v;
      if (i < bassEnd) bassSum += v; else if (i < midEnd) midSum += v; else trebSum += v;
    }
    this.bass = bassSum / Math.max(1, bassEnd) / 255;
    this.mid = midSum / Math.max(1, midEnd - bassEnd) / 255;
    this.treble = trebSum / Math.max(1, bins - midEnd) / 255;
    this.level = sum / bins / 255;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 2, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
  }

  dispose() { this.gl.deleteTexture(this.tex); }
}
