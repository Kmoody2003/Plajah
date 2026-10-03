// typoAudio — turns the shared AnalyserNode into the features the TYPO volumes move to.
//
// Two things make it read as "reacting to the music" rather than wobbling:
//  1. Auto-gain per feature. Each value is divided by its own slowly-decaying peak, so a quiet
//     acoustic master and a brick-walled club mix both use the full 0..1 range.
//  2. Kicks are ONSETS, not levels. A sustained 808 keeps the low band high; what the eye should
//     catch is the jump. Kick = low-band flux over its own recent average, with a fast attack and
//     a ~150ms tail, reinforced by the shared beat detector (AudioDriverSampler).
// When nothing is playing it falls back to a slow, obviously-idle breath so the difference
// between "paused" and "playing" is visible.

import { AudioDriverSampler } from '../../plajahPixels/engine/audioDrivers';
import { estimateFluxVoice } from '../../../services/fabula/fluxMusic';
import { clamp, type TypoAudio } from './typoEngine';

const N_BANDS = 16;

export class TypoAudioAnalyzer {
  readonly out: TypoAudio = { kick: 0, bass: 0, mid: 0, high: 0, level: 0, bands: new Float32Array(N_BANDS), beat: 0, half: 0, bar: 0, onset: false, live: false, beats: 0, voice: 0 };
  private freq = new Uint8Array(1024);
  private driver = new AudioDriverSampler();
  private peaks = new Float32Array(N_BANDS + 4).fill(0.25);
  private raw = new Float32Array(N_BANDS);
  private means = new Float32Array(N_BANDS + 4);
  private subSlow = 0; private fluxPeak = 0.08; private kickEnv = 0; private phase = 0; private silentFor = 0;

  sample(analyser: AnalyserNode | null, playing: boolean, t: number, dt: number): TypoAudio {
    const o = this.out;
    let live = false;
    let sub = 0, bass = 0, mid = 0, high = 0;
    if (analyser && playing) {
      const n = analyser.frequencyBinCount;
      if (this.freq.length !== n) this.freq = new Uint8Array(n);
      const d = this.freq; analyser.getByteFrequencyData(d);
      const sr = analyser.context.sampleRate || 48000, hz = sr / (n * 2);
      const band = (lo: number, hi: number) => {
        const a = Math.max(1, Math.floor(lo / hz)), b = Math.min(n, Math.max(a + 1, Math.ceil(hi / hz)));
        let sum = 0, pk = 0; for (let i = a; i < b; i++) { const v = d[i] / 255; sum += v * v; if (v > pk) pk = v; }
        return Math.sqrt(sum / (b - a)) * 0.75 + pk * 0.25;
      };
      sub = band(35, 110); bass = band(35, 250); mid = band(250, 2400); high = band(2400, 12000);
      for (let i = 0; i < N_BANDS; i++) this.raw[i] = band(40 * Math.pow(350, i / N_BANDS), 40 * Math.pow(350, (i + 1) / N_BANDS));
      live = bass + mid + high > 0.04;
      if (live) { this.driver.updateFromArray(d, t * 1000, sr); const vc = estimateFluxVoice(d, sr); this.out.voice += (vc - this.out.voice) * Math.min(1, dt * (vc > this.out.voice ? 12 : 4)); }
    }
    this.silentFor = live ? 0 : this.silentFor + dt;
    o.live = live;

    if (live) {
      // Auto-gain: half level-against-peak (peak decays ~6%/s so a loud section doesn't leave the
      // next verse dead), half contrast-against-recent-average. A sustained pad settles mid-scale
      // instead of pinning at 1; anything that moves uses the full range.
      const agc = (k: number, x: number) => {
        const p = this.peaks[k] = Math.max(x, this.peaks[k] - dt * 0.06, 0.12);
        const m = this.means[k] += (x - this.means[k]) * Math.min(1, dt / 1.5);
        return clamp(0.5 * (x / p) + 0.5 * (x - m) / Math.max(0.04, p - m)) ;
      };
      const nb = agc(N_BANDS, bass), nm = agc(N_BANDS + 1, mid), nh = agc(N_BANDS + 2, high);
      for (let i = 0; i < N_BANDS; i++) this.raw[i] = agc(i, this.raw[i]);
      // Onset kick.
      this.subSlow += (sub - this.subSlow) * Math.min(1, dt / 0.25);
      const flux = Math.max(0, sub - this.subSlow);
      this.fluxPeak = Math.max(flux, this.fluxPeak - dt * 0.05, 0.03);
      let hit = clamp(flux / this.fluxPeak);
      if (this.driver.isBeat) hit = Math.max(hit, 0.85);
      o.onset = hit > 0.6 && this.kickEnv < 0.45;
      this.kickEnv = Math.max(hit, this.kickEnv * Math.exp(-dt / 0.15));
      // Beat clock: integrate detected BPM; snap to the grid on detected beats.
      this.phase += dt * (this.driver.bpm || 120) / 60;
      if (this.driver.isBeat) { const f = this.phase % 1; if (f > 0.6 || f < 0.4) this.phase = Math.round(this.phase); }
      const sm = (cur: number, x: number) => x > cur ? cur + (x - cur) * Math.min(1, dt * 30) : cur + (x - cur) * Math.min(1, dt * 7);
      // Drive: a gentle expander so moderate levels read clearly and peaks hit harder.
      const drive = (x: number) => clamp(Math.pow(x, 0.8) * 1.15);
      o.bass = sm(o.bass, drive(nb)); o.mid = sm(o.mid, drive(nm)); o.high = sm(o.high, drive(nh));
      for (let i = 0; i < N_BANDS; i++) o.bands[i] = sm(o.bands[i], drive(this.raw[i]));
      o.kick = clamp(this.kickEnv * 1.25);
    } else {
      // Idle: a slow, small breath (clearly not music).
      o.onset = false; o.voice += (0 - o.voice) * Math.min(1, dt * 2);
      const k = Math.min(1, dt * 2), br = 0.12 + 0.06 * Math.sin(t * 0.9);
      o.kick += (0 - o.kick) * k; o.bass += (br - o.bass) * k; o.mid += (br - o.mid) * k; o.high += (0.05 - o.high) * k;
      for (let i = 0; i < N_BANDS; i++) o.bands[i] += (0.1 + 0.06 * Math.sin(t * 0.7 + i * 0.6) - o.bands[i]) * k;
      this.phase += dt * 0.5;
      if (this.silentFor > 2) { this.subSlow = 0; this.kickEnv = 0; }
    }
    o.level = o.bass * 0.5 + o.mid * 0.35 + o.high * 0.15;
    o.beats = this.phase; o.beat = this.phase % 1; o.half = (this.phase / 2) % 1; o.bar = (this.phase / 4) % 1;
    return o;
  }
}
