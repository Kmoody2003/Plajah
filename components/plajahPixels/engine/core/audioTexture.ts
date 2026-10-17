// AudioTexture — uploads the spectrum + waveform into a GPU texture once per
// frame so GLSL generators (and post-FX) can sample audio directly, matching the
// existing ShaderLayer convention: a 512×2 texture, row 0 = FFT, row 1 = waveform
// (sampled at v=0.25 and v=0.75). Also derives the iBass/iMid/iTreble/iLevel
// scalars every consumer needs, so the FFT is read once for the whole GPU stage.
//
// Enhanced with true STEREO support:
//   Row 0 (FFT):      R = Left, G = Right, B = Mono (L+R)/2, A = Chroma / Formants
//   Row 1 (Waveform): R = Left, G = Right, B = Mono (L+R)/2, A = Transient Envelope

import { GL } from './glUtil';
import { extractChroma, smoothChroma, writeChromaAlpha } from './audioChroma';

const W = 512;

export class AudioTexture {
  readonly tex: WebGLTexture;
  private pixels = new Uint8Array(W * 2 * 4);
  private freq: Uint8Array | null = null;
  private wave: Uint8Array | null = null;
  private freqR: Uint8Array | null = null;
  private waveR: Uint8Array | null = null;
  private chroma = new Float32Array(12);

  bass = 0; mid = 0; treble = 0; level = 0;
  bassL = 0; bassR = 0;
  midL = 0; midR = 0;
  trebleL = 0; trebleR = 0;
  balance = 0;
  /** Vocal ranges, 0..1, centre-weighted when stereo (lead vocals sit in the middle of a mix):
   *  [0] chest voice 150–500 Hz · [1] vowel formants 0.5–2 kHz · [2] presence / sibilance 2–6 kHz. */
  vocal: [number, number, number] = [0, 0, 0];
  /** Drum bands for onset detection (stage rigs), 0..1: kick 40–130 Hz · snare crack 1.8–5 kHz · hats 7–14 kHz. */
  drums: [number, number, number] = [0, 0, 0];

  constructor(private gl: GL) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Main-thread path: read live analyser(s) and upload. Supports optional right channel for stereo. */
  update(analyser: AnalyserNode | null, analyserR?: AnalyserNode | null) {
    if (!analyser) return;
    const bins = analyser.frequencyBinCount;
    const fftN = analyser.fftSize;
    if (!this.freq || this.freq.length !== bins) this.freq = new Uint8Array(bins);
    if (!this.wave || this.wave.length !== fftN) this.wave = new Uint8Array(fftN);
    analyser.getByteFrequencyData(this.freq);
    analyser.getByteTimeDomainData(this.wave);

    if (analyserR) {
      if (!this.freqR || this.freqR.length !== bins) this.freqR = new Uint8Array(bins);
      if (!this.waveR || this.waveR.length !== fftN) this.waveR = new Uint8Array(fftN);
      analyserR.getByteFrequencyData(this.freqR);
      analyserR.getByteTimeDomainData(this.waveR);
    } else {
      this.freqR = null;
      this.waveR = null;
    }

    this.process(this.freq, this.wave, analyser.context.sampleRate, this.freqR, this.waveR);
  }

  /** Worker path: process + upload from raw arrays transferred from the main thread. */
  updateFromArrays(freq: Uint8Array, wave: Uint8Array, sampleRate = 48_000, freqR?: Uint8Array | null, waveR?: Uint8Array | null) {
    this.process(freq, wave, sampleRate, freqR ?? null, waveR ?? null);
  }

  private process(freqL: Uint8Array, waveL: Uint8Array, sampleRate: number, freqR: Uint8Array | null, waveR: Uint8Array | null) {
    const gl = this.gl;
    const bins = freqL.length;
    const fftN = waveL.length;
    const hasStereo = !!freqR && !!waveR;

    // Resample to 512 columns:
    // Row 0: R = Left, G = Right, B = Mono, A = Chroma
    // Row 1: R = Left, G = Right, B = Mono, A = Envelope
    let sum = 0, bassSum = 0, midSum = 0, trebSum = 0;
    let sumL = 0, sumR = 0, bassL = 0, bassR = 0;
    const bassEnd = Math.floor(bins * 0.08), midEnd = Math.floor(bins * 0.35);

    for (let x = 0; x < W; x++) {
      const fi = Math.min(bins - 1, (x / W * bins) | 0);
      const wi = Math.min(fftN - 1, (x / W * fftN) | 0);

      const fvL = freqL[fi];
      const wvL = waveL[wi];
      const fvR = hasStereo ? freqR![fi] : fvL;
      const wvR = hasStereo ? waveR![wi] : wvL;
      const fvM = ((fvL + fvR) >> 1);
      const wvM = ((wvL + wvR) >> 1);

      // Row 0: Spectrum
      let o = x * 4;
      this.pixels[o]     = fvL;
      this.pixels[o + 1] = fvR;
      this.pixels[o + 2] = fvM;
      this.pixels[o + 3] = 255; // Overwritten by writeChromaAlpha below

      // Row 1: Waveform
      o = (W + x) * 4;
      this.pixels[o]     = wvL;
      this.pixels[o + 1] = wvR;
      this.pixels[o + 2] = wvM;
      this.pixels[o + 3] = 255;
    }

    for (let i = 0; i < bins; i++) {
      const vL = freqL[i];
      const vR = hasStereo ? freqR![i] : vL;
      const vM = (vL + vR) * 0.5;

      sum += vM; sumL += vL; sumR += vR;
      if (i < bassEnd) {
        bassSum += vM; bassL += vL; bassR += vR;
      } else if (i < midEnd) {
        midSum += vM;
      } else {
        trebSum += vM;
      }
    }

    this.bass = bassSum / Math.max(1, bassEnd) / 255;
    this.mid = midSum / Math.max(1, midEnd - bassEnd) / 255;
    this.treble = trebSum / Math.max(1, bins - midEnd) / 255;
    this.level = sum / bins / 255;

    this.bassL = bassL / Math.max(1, bassEnd) / 255;
    this.bassR = bassR / Math.max(1, bassEnd) / 255;
    const totalLevel = (sumL + sumR);
    this.balance = totalLevel > 0 ? (sumR - sumL) / totalLevel : 0;

    // Vocal ranges. With stereo, min(L, R) keeps what both channels share — the centre image,
    // where the lead vocal lives — and drops hard-panned instruments.
    const hzPerBin = (sampleRate / 2) / bins;
    const ranges: Array<[number, number]> = [[150, 500], [500, 2000], [2000, 6000]];
    for (let b = 0; b < 3; b++) {
      const i0 = Math.max(0, Math.ceil(ranges[b][0] / hzPerBin)), i1 = Math.min(bins - 1, Math.floor(ranges[b][1] / hzPerBin));
      let acc = 0;
      for (let i = i0; i <= i1; i++) acc += hasStereo ? Math.min(freqL[i], freqR![i]) : freqL[i];
      this.vocal[b] = i1 >= i0 ? acc / (i1 - i0 + 1) / 255 : 0;
    }
    const drumRanges: Array<[number, number]> = [[40, 130], [1800, 5000], [7000, 14000]];
    for (let b = 0; b < 3; b++) {
      const i0 = Math.max(0, Math.floor(drumRanges[b][0] / hzPerBin)), i1 = Math.min(bins - 1, Math.max(i0, Math.ceil(drumRanges[b][1] / hzPerBin)));
      let acc = 0;
      for (let i = i0; i <= i1; i++) acc += hasStereo ? (freqL[i] + freqR![i]) * 0.5 : freqL[i];
      this.drums[b] = acc / (i1 - i0 + 1) / 255;
    }

    smoothChroma(this.chroma, extractChroma(freqL, sampleRate));
    writeChromaAlpha(this.pixels, this.chroma);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 2, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
  }

  dispose() { this.gl.deleteTexture(this.tex); }
}
