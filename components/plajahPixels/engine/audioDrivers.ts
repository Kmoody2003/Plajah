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
}

export class AudioDriverSampler implements DriverState {
  // ── Live driver outputs ──────────────────────────────────────────────────
  bpm          = 120;
  intensity    = 0;
  midIntensity = 0;
  isBeat       = false;

  // ── Internal detection state (verbatim from the previous inline loop) ─────
  private dataArr: Uint8Array | null = null;
  private readonly beatTimes: number[] = [];
  private lastDetectedBeat = 0;
  // Rolling bass-energy history (~20 frames ≈ 333ms at 60fps). Comparing against
  // a local average avoids hard absolute thresholds that fail on quiet/loud tracks.
  private readonly energyHistory = new Float32Array(20);
  private histIdx = 0;

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

    this.intensity    = bass;
    this.midIntensity = midBass;
    this.isBeat       = isBeat;
  }
}
