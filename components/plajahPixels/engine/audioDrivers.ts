/**
 * audioDrivers — shared audio-driven driver sampler for Plajah Pixels.
 *
 * Step 1 of the render-core rebuild (see RENDER_CORE_REBUILD.md): the live
 * tempo / intensity / beat detection that used to live inline inside
 * ClipLauncher's beat-mode scene-automation effect is extracted here so it can
 * become a first-class, reusable set of automation drivers.
 *
 * This module is intentionally framework-agnostic (no React) and carries NO
 * firing logic — it only observes the analyser and exposes live driver values.
 * The detection math is a verbatim move from the previous inline implementation;
 * constants are preserved so behavior is unchanged.
 *
 *   const sampler = new AudioDriverSampler();
 *   // inside a requestAnimationFrame loop:
 *   sampler.update(analyser, performance.now());
 *   sampler.bpm        // live, smoothed BPM estimate
 *   sampler.intensity  // current sub-bass energy, 0–1
 *   sampler.isBeat     // true on the frame a beat onset was detected
 */

export interface DriverState {
  /** Smoothed live BPM estimate (EMA of detected beat intervals). */
  bpm: number;
  /** Sub-bass energy this frame (bins 0–4, ~0–86 Hz), 0–1. */
  intensity: number;
  /** Wider bass energy this frame (bins 0–12, ~0–258 Hz), 0–1. Backup onset signal. */
  midIntensity: number;
  /** True only on the frame a beat onset crossed the local rolling threshold. */
  isBeat: boolean;
  /** True on the frame a KICK transient (~50–120 Hz) was detected. */
  isKick: boolean;
  /** True on the frame a SNARE transient (body ~150–350 Hz + crack ~2.5–6 kHz). */
  isSnare: boolean;
  /** Drum "density" 0–1 — how busy the recent transient stream is (fills ride high).
   *  Drives the adaptive scene-switch rate: high density → rapid-fire switching. */
  density: number;
}

export class AudioDriverSampler implements DriverState {
  // ── Live driver outputs ──────────────────────────────────────────────────
  bpm          = 120;
  intensity    = 0;
  midIntensity = 0;
  isBeat       = false;
  isKick       = false;
  isSnare      = false;
  density      = 0;

  // ── Internal detection state (verbatim from the previous inline loop) ─────
  private dataArr: Uint8Array | null = null;
  private readonly beatTimes: number[] = [];
  private lastDetectedBeat = 0;
  // Rolling bass-energy history (~20 frames ≈ 333ms at 60fps). Comparing against
  // a local average avoids hard absolute thresholds that fail on quiet/loud tracks.
  private readonly energyHistory = new Float32Array(20);
  private histIdx = 0;

  // ── Kick / snare transient detection (per-band rolling thresholds) ────────
  private readonly kickHistory  = new Float32Array(16);
  private readonly snareHistory = new Float32Array(16);
  private kIdx = 0; private sIdx = 0;
  private lastKick = 0; private lastSnare = 0;
  // Recent transient timestamps (~last 1.2s) → density.
  private readonly transientTimes: number[] = [];

  /** Sum + average analyser bins covering a Hz range, normalized 0–1. */
  private bandEnergy(data: Uint8Array, loHz: number, hiHz: number, binHz: number): number {
    const lo = Math.max(0, Math.floor(loHz / binHz));
    const hi = Math.min(data.length - 1, Math.ceil(hiHz / binHz));
    let sum = 0; for (let i = lo; i <= hi; i++) sum += data[i];
    return (sum / Math.max(1, hi - lo + 1)) / 255;
  }

  /**
   * Sample the analyser once. Call from a requestAnimationFrame loop, passing
   * the frame's performance.now() timestamp. Updates all live driver fields.
   */
  update(analyser: AnalyserNode, now: number): void {
    if (!this.dataArr || this.dataArr.length !== analyser.frequencyBinCount) {
      this.dataArr = new Uint8Array(analyser.frequencyBinCount);
    }
    const dataArr = this.dataArr;
    analyser.getByteFrequencyData(dataArr);

    // Sub-bass energy (bins 0–4, 0–86 Hz)
    let bass = 0;
    for (let i = 0; i < 5; i++) bass += dataArr[i];
    bass = (bass / 5) / 255;

    // Wider bass energy (bins 0–12, 0–258 Hz) for backup onset detection
    let midBass = 0;
    for (let i = 0; i < 12; i++) midBass += dataArr[i];
    midBass = (midBass / 12) / 255;

    // Update rolling history
    this.energyHistory[this.histIdx % this.energyHistory.length] = bass;
    this.histIdx++;
    let avgEnergy = 0;
    for (let i = 0; i < this.energyHistory.length; i++) avgEnergy += this.energyHistory[i];
    avgEnergy /= this.energyHistory.length;

    const minGap = Math.max(200, 60000 / Math.min(240, this.bpm * 2.2));

    // Beat onset: current bass significantly above local rolling average
    const isBeat = (bass > avgEnergy * 1.35 || midBass > avgEnergy * 1.5)
      && bass > 0.18
      && (now - this.lastDetectedBeat) > minGap;

    if (isBeat) {
      this.lastDetectedBeat = now;
      this.beatTimes.push(now);
      if (this.beatTimes.length > 8) this.beatTimes.shift();
      if (this.beatTimes.length >= 2) {
        let iSum = 0;
        for (let i = 1; i < this.beatTimes.length; i++) iSum += this.beatTimes[i] - this.beatTimes[i - 1];
        const rawBpm = 60000 / (iSum / (this.beatTimes.length - 1));
        if (rawBpm >= 40 && rawBpm <= 240) {
          this.bpm = this.bpm * 0.85 + rawBpm * 0.15;
        }
      }
    }

    // ── Kick / snare transients (the drivers that determine scene switches) ──
    const sr = (analyser.context && analyser.context.sampleRate) || 48000;
    const binHz = sr / analyser.fftSize;
    const kick  = this.bandEnergy(dataArr, 50, 120, binHz);
    const snareBody  = this.bandEnergy(dataArr, 150, 350, binHz);
    const snareCrack = this.bandEnergy(dataArr, 2500, 6000, binHz);
    const snare = snareBody * 0.5 + snareCrack * 0.5;

    const kAvg = avgOf(this.kickHistory);
    const sAvg = avgOf(this.snareHistory);
    this.kickHistory[this.kIdx++ % this.kickHistory.length] = kick;
    this.snareHistory[this.sIdx++ % this.snareHistory.length] = snare;

    // Transients fire when a band jumps above its local rolling average, gated by
    // an absolute floor + a short refractory so a single hit isn't double-counted.
    const isKick  = kick  > kAvg * 1.5 && kick  > 0.16 && (now - this.lastKick)  > 70;
    const isSnare = snare > sAvg * 1.6 && snare > 0.12 && (now - this.lastSnare) > 70;
    if (isKick)  this.lastKick  = now;
    if (isSnare) this.lastSnare = now;

    if (isKick || isSnare) this.transientTimes.push(now);
    while (this.transientTimes.length && now - this.transientTimes[0] > 1200) this.transientTimes.shift();
    // ~0 at the groove (≈ a few hits/sec), → 1 during a dense fill (~8+ hits/1.2s).
    this.density = Math.min(1, this.transientTimes.length / 8);

    this.intensity    = bass;
    this.midIntensity = midBass;
    this.isBeat       = isBeat;
    this.isKick       = isKick;
    this.isSnare      = isSnare;
  }
}

function avgOf(a: Float32Array): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length;
}
