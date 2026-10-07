// kaijuAudio — listens to the shared AnalyserNode and tells the kaiju what the music is doing.
//
// Outputs, every frame:
//   • a flywheel beat clock (phase / count / bpm) that resyncs to detected kicks, so dances stay on
//     the beat and keep grooving through breakdowns;
//   • a STYLE — zen (slow / meditative), edm (energetic electronic), rock (headbanger),
//     ballet (graceful / cinematic) — chosen from a few spectral features with long smoothing and
//     hysteresis so the dance doesn't flip every bar; track genre metadata is a strong prior;
//   • a VOCAL read — none / sing / rap / sustain (held note) / run (melisma) — from a harmonic
//     pitch tracker in the voice range plus syllable-rate (3–8 Hz envelope modulation). Time-coded
//     lyrics, when the track has them, are the most reliable "someone is singing now" signal and
//     override the heuristic.
//
// It's heuristic MIR, tuned for "reads right and feels alive" rather than lab accuracy.

import { clamp } from './kaijuPose';

export type KaijuStyle = 'zen' | 'edm' | 'rock' | 'ballet';
export type VocalMode = 'none' | 'sing' | 'rap' | 'sustain' | 'run';
export const KAIJU_STYLES: KaijuStyle[] = ['zen', 'edm', 'rock', 'ballet'];

export interface KaijuHints {
  /** true = a lyric line is active now, false = between lines, null = no time-coded lyrics. */
  lyricActive?: boolean | null;
  genre?: string;
  forceStyle?: KaijuStyle | null;
  forceVocal?: VocalMode | null;
}

export interface KaijuFeatures {
  silent: boolean;
  level: number; bass: number; mid: number; treble: number;
  /** Short-term loudness relative to the song's running average (1 = typical, >1.25 = chorus/drop). */
  intensity: number;
  kick: number; onset: number; beat: boolean;
  beatPhase: number; beatCount: number; bpm: number; beats: number;
  vocal: number; vocalEnv: number; syllable: boolean; pitch: number;
  vocalMode: VocalMode;
  style: KaijuStyle;
  styleScores: Record<KaijuStyle, number>;
}

const GENRE_PRIORS: [RegExp, KaijuStyle][] = [
  [/ambient|meditat|new ?age|sleep|spa|yoga|relax|calm|drone|lo-?fi|chill/i, 'zen'],
  [/metal|rock|punk|grunge|hardcore|emo|garage|alt/i, 'rock'],
  [/classical|orchestr|cinematic|soundtrack|score|ballet|opera|baroque|piano|string|film|choral|waltz/i, 'ballet'],
  [/edm|electro|house|techno|trance|dubstep|dance|dnb|drum.?(and|&|n).?bass|club|rave|synth|hyperpop|hip.?hop|rap|trap|drill|k-?pop|pop/i, 'edm'],
];
const RAP_GENRE = /hip.?hop|rap|trap|drill|grime/i;

class Ema {
  v: number;
  constructor(init = 0) { this.v = init; }
  step(x: number, dt: number, tau: number) { this.v += (x - this.v) * (1 - Math.exp(-dt / Math.max(1e-3, tau))); return this.v; }
}

/** Rolling mean/variance for adaptive onset thresholds. */
class Stat {
  m = 0; s = 0.0004;
  step(x: number, a = 0.04) { const d = x - this.m; this.m += a * d; this.s = (1 - a) * (this.s + a * d * d); return this.m; }
  get sd() { return Math.sqrt(this.s); }
}

export class KaijuAudio {
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private prev: Float32Array | null = null;
  private t = 0; private t0 = -1; private lastT = 0;

  // AGC peaks (slow-decaying) so every band reads 0..1 on any master level.
  private pk = { level: 0.25, bass: 0.25, mid: 0.25, treble: 0.25, harm: 0.05, voc: 0.2 };
  private lowFlux = new Stat(); private midFlux = new Stat(); private allFlux = new Stat();
  private lastKick = -1; private lastOnset = -1; private lastSyl = -1;
  private onsets: number[] = []; private kicks: number[] = [];
  private kickPulse = 0; private onsetPulse = 0;

  // beat clock
  private period = 60 / 100; private phase = 0; private count = 0; private beatsF = 0;
  private bpmEma = new Ema(100); private regularity = new Ema(0);

  // loudness
  private shortE = new Ema(0); private longE = new Ema(0.2); private eHist: number[] = []; private eHistT = 0;

  // vocals
  private vocEnvFast = new Ema(0); private vocPresence = new Ema(0);
  private pitchHist: { t: number; st: number }[] = []; private sylTimes: number[] = [];
  private vocalMode: VocalMode = 'none'; private modeSince = 0; private vocalOn = false; private vocalOffAt = 0;
  private sustainSince = -1; private pitchNorm = new Ema(0.5);

  // style
  private scores: Record<KaijuStyle, Ema> = { zen: new Ema(0.5), edm: new Ema(0.5), rock: new Ema(0.4), ballet: new Ema(0.5) };
  private feat = { perc: new Ema(0.3), tonal: new Ema(0.3), flat: new Ema(0.3), bassR: new Ema(0.3), trebR: new Ema(0.2), midR: new Ema(0.3) };
  private style: KaijuStyle = 'ballet'; private challenger: KaijuStyle | null = null; private challengerSince = 0; private styleSince = -99;
  private silentFor = 0;

  sample(an: AnalyserNode | null, playing: boolean, dt: number, hints: KaijuHints = {}): KaijuFeatures {
    dt = Math.min(0.1, Math.max(0.001, dt));
    // Wall-clock for event timing (kicks, onsets, syllables): summing clamped frame dt drifts slow when
    // frames drop, which made tempo read low. Smoothers still use the clamped dt.
    const wall = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    this.t = this.t0 < 0 ? (this.t0 = wall, 0) : wall - this.t0;
    const t = this.t;

    let level = 0, bass = 0, mid = 0, treble = 0, lowF = 0, midF = 0, allF = 0, harm = 0, f0 = 0, vocBand = 0, flat = 0.5;
    const ok = !!an && playing;
    if (ok && an) {
      const n = an.frequencyBinCount;
      if (!this.freq || this.freq.length !== n) { this.freq = new Uint8Array(new ArrayBuffer(n)); this.prev = new Float32Array(n); }
      an.getByteFrequencyData(this.freq);
      const sr = an.context.sampleRate || 48000;
      const hz = sr / (2 * n);
      const bin = (f: number) => Math.min(n - 1, Math.max(1, Math.round(f / hz)));
      const F = this.freq, prev = this.prev!;
      const avg = (a: number, b: number) => { let s = 0; const i0 = bin(a), i1 = Math.max(i0, bin(b)); for (let i = i0; i <= i1; i++) s += F[i]; return s / (255 * (i1 - i0 + 1)); };
      bass = avg(40, 250); mid = avg(250, 2000); treble = avg(2000, 12000); level = avg(40, 12000);
      vocBand = avg(300, 3400);

      // spectral flux split by region (kick / body / everything)
      const kLo = bin(150), kMid = bin(4000), kTop = bin(12000);
      for (let i = 1; i <= kTop; i++) {
        const v = F[i] / 255, d = v - prev[i];
        if (d > 0) { if (i <= kLo) lowF += d; else if (i <= kMid) midF += d; allF += d; }
        prev[i] = v;
      }
      lowF /= Math.max(1, kLo); midF /= Math.max(1, kMid - kLo); allF /= Math.max(1, kTop);

      // flatness of the 800–5k region in dB-ish byte space: distorted guitars / noise read "flat"
      { const i0 = bin(800), i1 = bin(5000); let s = 0, s2 = 0, c = 0; for (let i = i0; i <= i1; i++) { const v = F[i] / 255; s += v; s2 += v * v; c++; }
        const m = s / Math.max(1, c), sd = Math.sqrt(Math.max(0, s2 / Math.max(1, c) - m * m)); flat = m > 0.04 ? clamp(1 - sd / (m * 0.9)) : 0.5; }

      // Harmonic pitch search in the voice range (100–800 Hz f0): harmonic comb vs. between-harmonics.
      const val = (f: number) => { const x = f / hz, i = Math.floor(x), fr = x - i; if (i + 1 >= n) return 0; return (F[i] * (1 - fr) + F[i + 1] * fr) / 255; };
      let best = 0, bestF = 0;
      for (let fc = 100; fc <= 800; fc *= 1.0293) { // ~half-semitone steps
        let s = 0;
        for (let k = 1; k <= 6; k++) s += val(fc * k) - 0.5 * (val(fc * (k - 0.5)) + val(fc * (k + 0.5)));
        s /= 6;
        if (s > best) { best = s; bestF = fc; }
      }
      harm = Math.max(0, best); f0 = bestF;
    }

    // ── silence handling ──
    const silent = !ok || level < 0.025;
    this.silentFor = silent ? this.silentFor + dt : 0;

    // ── AGC ──
    const pk = this.pk, dec = Math.exp(-dt / 6);
    pk.level = Math.max(level, pk.level * dec, 0.08); pk.bass = Math.max(bass, pk.bass * dec, 0.08);
    pk.mid = Math.max(mid, pk.mid * dec, 0.08); pk.treble = Math.max(treble, pk.treble * dec, 0.05);
    pk.harm = Math.max(harm, pk.harm * dec, 0.03); pk.voc = Math.max(vocBand, pk.voc * dec, 0.08);
    const nLevel = silent ? 0 : level / pk.level, nBass = silent ? 0 : bass / pk.bass, nMid = silent ? 0 : mid / pk.mid, nTreb = silent ? 0 : treble / pk.treble;

    // ── onsets ──
    let beatNow = false;
    const thr = (s: Stat, x: number, k: number) => x > s.m + k * s.sd + 0.004;
    const isKick = !silent && thr(this.lowFlux, lowF, 1.6) && t - this.lastKick > 0.24 && nBass > 0.45;
    const isOnset = !silent && thr(this.allFlux, allF, 1.4) && t - this.lastOnset > 0.12;
    this.lowFlux.step(lowF); this.midFlux.step(midF); this.allFlux.step(allF);
    if (isKick) { this.lastKick = t; this.kicks.push(t); this.kickPulse = 1; }
    if (isOnset) { this.lastOnset = t; this.onsets.push(t); this.onsetPulse = Math.min(1, 0.4 + (allF - this.allFlux.m) / (this.allFlux.sd * 4 + 1e-3)); }
    this.kicks = this.kicks.filter(x => t - x < 8); this.onsets = this.onsets.filter(x => t - x < 8);
    this.kickPulse *= Math.exp(-dt * 7); this.onsetPulse *= Math.exp(-dt * 9);

    // ── tempo: IOI histogram over kicks (fallback: all onsets) ──
    const src = this.kicks.length >= 5 ? this.kicks : this.onsets;
    if (src.length >= 4 && (isKick || isOnset)) {
      const hist = new Float32Array(121); // 60..180 bpm
      for (let i = 0; i < src.length; i++) for (let j = i + 1; j < Math.min(src.length, i + 6); j++) {
        let ioi = src[j] - src[i]; if (ioi < 0.25 || ioi > 2.4) continue;
        let bpm = 60 / ioi; while (bpm < 75) bpm *= 2; while (bpm > 165) bpm /= 2;
        const c = Math.round(bpm) - 60;
        for (let d = -2; d <= 2; d++) { const k = c + d; if (k >= 0 && k <= 120) hist[k] += Math.exp(-d * d / 2) / (j - i); }
      }
      let bi = 0; for (let k = 1; k <= 120; k++) if (hist[k] > hist[bi]) bi = k;
      if (hist[bi] > 0) { const est = bi + 60; const cur = this.bpmEma.v; this.bpmEma.v = Math.abs(est - cur) > 25 ? cur + (est - cur) * 0.3 : cur + (est - cur) * 0.12; }
    }
    const style = this.style;
    const defaultBpm = style === 'zen' ? 64 : style === 'ballet' ? 84 : 110;
    const bpm = src.length >= 4 ? clamp(this.bpmEma.v, 60, 180) : defaultBpm + (this.bpmEma.v - defaultBpm) * 0.2;
    this.period = 60 / bpm;

    // flywheel phase + gentle resync to the beat grid
    const rdt = Math.min(0.5, Math.max(0, t - this.lastT)); this.lastT = t;
    this.phase += rdt / this.period;
    if (this.phase >= 1) { this.phase -= 1; this.count++; beatNow = true; }
    const syncSrc = isKick || (this.kicks.length < 5 && isOnset);
    if (syncSrc) {
      let err = this.phase; if (err > 0.5) err -= 1; // -0.5..0.5 beats
      const near = Math.abs(err) < 0.22;
      this.regularity.step(near ? 1 : 0, 0.5, 4);
      this.phase -= err * (near ? 0.35 : 0.12);
      if (this.phase < 0) { this.phase += 1; this.count = Math.max(0, this.count - 1); }
      if (this.phase >= 1) { this.phase -= 1; this.count++; beatNow = true; }
    }
    this.beatsF = this.count + this.phase;

    // ── loudness context ──
    this.shortE.step(level, dt, 0.8); this.longE.step(level, dt, 20);
    const intensity = silent ? 0 : this.shortE.v / Math.max(0.05, this.longE.v);
    this.eHistT += dt; if (this.eHistT > 0.25) { this.eHistT = 0; this.eHist.push(this.shortE.v); if (this.eHist.length > 40) this.eHist.shift(); }
    const swell = this.eHist.length > 8 ? clamp((Math.max(...this.eHist) - Math.min(...this.eHist)) / 0.25) : 0.3;

    // ── vocals ──
    const nHarm = harm / pk.harm, nVoc = vocBand / pk.voc;
    const vocalish = silent ? 0 : clamp(0.55 * clamp((nHarm - 0.35) / 0.5) + 0.3 * clamp((nVoc - 0.45) / 0.5) + 0.15 * clamp(midF / (this.midFlux.m * 3 + 1e-3)));
    this.vocEnvFast.step(silent ? 0 : clamp(nVoc * (0.4 + 0.6 * clamp(nHarm))), dt, 0.04);
    const semitone = f0 > 0 ? 12 * Math.log2(f0 / 220) : 0;
    if (harm > 0.02 && !silent) this.pitchHist.push({ t, st: semitone });
    this.pitchHist = this.pitchHist.filter(p => t - p.t < 0.6);
    this.pitchNorm.step(clamp((semitone + 10) / 30), dt, 0.08);

    // syllables: mid-band onsets while the voice band is lit
    let syllable = false;
    if (!silent && thr(this.midFlux, midF, 1.1) && t - this.lastSyl > 0.09 && vocalish > 0.35) { syllable = true; this.lastSyl = t; this.sylTimes.push(t); }
    this.sylTimes = this.sylTimes.filter(x => t - x < 2);
    const sylRate = this.sylTimes.length / 2;

    let presenceTarget = vocalish;
    if (hints.lyricActive === true) presenceTarget = Math.max(0.75, vocalish);
    else if (hints.lyricActive === false) presenceTarget = vocalish * 0.35;
    const presence = this.vocPresence.step(presenceTarget, dt, presenceTarget > this.vocPresence.v ? 0.15 : 0.6);
    if (!this.vocalOn && presence > 0.52) this.vocalOn = true;
    if (this.vocalOn && presence < 0.34) { this.vocalOn = false; this.vocalOffAt = t; }

    let mode: VocalMode = 'none';
    if (this.vocalOn) {
      const ps = this.pitchHist.map(p => p.st);
      const mean = ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length);
      const sd = Math.sqrt(ps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, ps.length));
      let motion = 0; for (let i = 1; i < ps.length; i++) motion += Math.min(4, Math.abs(ps[i] - ps[i - 1]));
      motion /= 0.6;
      const steady = ps.length > 12 && sd < 0.6 && this.vocEnvFast.v > 0.35;
      if (steady) { if (this.sustainSince < 0) this.sustainSince = t; } else this.sustainSince = -1;
      const rapBias = hints.genre && RAP_GENRE.test(hints.genre) ? 1.2 : 0;
      if (sylRate + rapBias >= 4.2 && (sd > 1.2 || nHarm < 0.6)) mode = 'rap';
      else if (this.sustainSince >= 0 && t - this.sustainSince > 0.4) mode = 'sustain';
      else if (motion > 14 && sylRate < 3.5 && nHarm > 0.5) mode = 'run';
      else mode = 'sing';
    } else this.sustainSince = -1;
    if (hints.forceVocal) mode = hints.forceVocal;
    // hold modes briefly so the performance doesn't twitch (held notes may enter immediately)
    if (mode !== this.vocalMode && (t - this.modeSince > 0.45 || mode === 'sustain' || hints.forceVocal)) { this.vocalMode = mode; this.modeSince = t; }

    // ── style classification ──
    if (!silent) {
      const tot = bass + mid + treble + 1e-3, f = this.feat, tau = 3;
      f.perc.step(clamp(allF / 0.03), dt, tau); f.tonal.step(clamp(nHarm * 0.8 * clamp(harm / 0.06)), dt, tau); f.flat.step(flat, dt, tau);
      f.bassR.step(bass / tot, dt, tau); f.trebR.step(treble / tot, dt, tau); f.midR.step(mid / tot, dt, tau);
      const E0 = clamp((this.longE.v * 0.5 + this.shortE.v * 0.5 - 0.06) / 0.3);
      const reg = this.regularity.v, perc = f.perc.v, tonal = f.tonal.v;
      // event densities over the last 8 s — independent of master volume
      const density = clamp(this.onsets.length / 8 / 4), kickRate = clamp(this.kicks.length / 8 / 2);
      const E = Math.max(E0, 0.85 * density);
      const bassR = clamp((f.bassR.v - 0.28) / 0.2), trebR = clamp((f.trebR.v - 0.15) / 0.2), midR = clamp((f.midR.v - 0.3) / 0.15);
      const bpmEdm = bpm >= 115 && bpm <= 135 ? 1 : bpm >= 140 && bpm <= 178 ? 0.4 : bpm >= 85 && bpm <= 100 ? 0.4 : 0.1;
      const raw: Record<KaijuStyle, number> = {
        zen: 1.3 * (1 - E) + 1.2 * (1 - density) + 0.4 * (1 - trebR) + 0.3 * (1 - reg) + 0.3 * (1 - kickRate) - 0.7 * swell - 0.6 * midR,
        edm: 1.1 * reg + 0.9 * bassR + 0.7 * E + 0.6 * bpmEdm + 0.6 * kickRate + 0.3 * perc - 1.6 * f.flat.v,
        rock: 2.0 * f.flat.v + 0.7 * E + 0.5 * density + 0.4 * perc + 0.6 * midR - 0.4 * bassR + 0.3 * reg,
        ballet: 0.9 * tonal + 0.7 * (1 - density) + 0.8 * swell + 0.5 * E * (1 - reg) + 0.3 * trebR + 0.9 * midR - 0.4 * kickRate - 0.8 * f.flat.v,
      };
      const prior = hints.genre ? GENRE_PRIORS.find(([re]) => re.test(hints.genre!))?.[1] : undefined;
      if (prior) raw[prior] += 0.8;
      if (import.meta.env.DEV) (globalThis as any).__kaijuDbg = { E, density, kickRate, longE: this.longE.v, shortE: this.shortE.v, reg, perc, allF, tonal, flat: f.flat.v, bassR, trebR, midR, swell, bpm, raw };
      for (const s of Object.keys(raw) as KaijuStyle[]) this.scores[s].step(raw[s], dt, 2.5);

      let lead: KaijuStyle = this.style;
      for (const s of Object.keys(raw) as KaijuStyle[]) if (this.scores[s].v > this.scores[lead].v) lead = s;
      if (lead !== this.style && this.scores[lead].v > this.scores[this.style].v + 0.12) {
        if (this.challenger !== lead) { this.challenger = lead; this.challengerSince = t; }
        // the first decision of a song is quick; later changes need ~3s of agreement
        const need = t - this.styleSince > 30 || this.styleSince < 0 ? 1.2 : 3;
        if (t - this.challengerSince > need) { this.style = lead; this.styleSince = t; this.challenger = null; }
      } else this.challenger = null;
    }
    const outStyle = hints.forceStyle ?? this.style;

    const styleScores = { zen: this.scores.zen.v, edm: this.scores.edm.v, rock: this.scores.rock.v, ballet: this.scores.ballet.v };
    return {
      silent, level: clamp(nLevel), bass: clamp(nBass), mid: clamp(nMid), treble: clamp(nTreb), intensity,
      kick: this.kickPulse, onset: this.onsetPulse, beat: beatNow,
      beatPhase: this.phase, beatCount: this.count, bpm, beats: this.beatsF,
      vocal: presence, vocalEnv: clamp(this.vocEnvFast.v), syllable, pitch: this.pitchNorm.v,
      vocalMode: this.vocalMode, style: outStyle, styleScores,
    };
  }

  /** Seconds of continuous silence — lets the stage doze the kaiju off. */
  get silence() { return this.silentFor; }
}
