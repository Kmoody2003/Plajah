// stageAudio — the lighting desk's ears for the RIG_* concert-stage generators.
//
// A real LD doesn't light to "bass level"; they light to the kick, the snare, the hats, the bar
// and the drop. This turns the analyser into those cues once per frame, per layer:
//
//   kick / snare / hat   onset envelopes (1 on the hit, decaying in ~0.1 s)
//   musical time (mt)    beats elapsed, continuous: moving-head sweeps and chases ride it, so the
//                        rig moves in tempo. A flywheel keeps the clock running through breakdowns
//                        and quiet intros at the last tempo (like a tap-tempo button), and a real kick
//                        that lands just after a flywheel beat re-aligns the clock instead of
//                        double-counting.
//   drop                 a slow-decaying hit when the mix jumps well above its recent level
//   energy               how hard the track is going right now, 0..~1.2
//
// Uniforms:  iStage  = (kick, snare, mt, energy)   iStage2 = (seconds since beat, hat, drop, beat length)

import type { AudioTexture } from './audioTexture';

interface Band { fast: number; slow: number; armed: boolean; last: number }
const band = (): Band => ({ fast: 0, slow: 0, armed: true, last: -10 });

export class StageAudio {
  private at = -1;
  private now = 0;
  private bands = [band(), band(), band()];
  private lvlFast = 0; private lvlMid = 0; private lvlLong = 0.08;
  private lastDrop = -30;
  private lastRealKick = -10;
  private beats = 0; private since = 0; private beatLen = 0.5; private virtualBeat = false;
  private mt = 0;
  kick = 0; snare = 0; hat = 0; drop = 0; energy = 0;

  update(audio: AudioTexture, clock?: number): { stage: [number, number, number, number]; stage2: [number, number, number, number] } {
    const wall = clock ?? performance.now() / 1000;
    const dt = this.at < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, wall - this.at));   // a seek backwards counts as no time
    this.at = wall; this.now += dt;
    const d = audio.drums ?? [audio.bass, audio.mid, audio.treble];

    // Onsets: a fast envelope jumping above the band's own recent average, with hysteresis + refractory.
    const thresholds = [[1.22, 0.05, 0.22], [1.3, 0.035, 0.12], [1.35, 0.025, 0.07]];
    const hits = [false, false, false];
    for (let i = 0; i < 3; i++) {
      const b = this.bands[i], x = d[i] ?? 0;
      b.fast += (x - b.fast) * (1 - Math.exp(-dt / (x > b.fast ? 0.006 : 0.06)));
      b.slow += (x - b.slow) * (1 - Math.exp(-dt / 0.45));
      const [ratio, floor, refractory] = thresholds[i];
      const over = b.fast > b.slow * ratio + floor;
      if (over && b.armed && this.now - b.last > refractory) { hits[i] = true; b.armed = false; b.last = this.now; }
      if (b.fast < b.slow * (1 + (ratio - 1) * 0.4) + floor * 0.5) b.armed = true;
    }
    const decay = (v: number, tau: number) => v * Math.exp(-dt / tau);
    this.kick = hits[0] ? 1 : decay(this.kick, 0.13);
    this.snare = hits[1] ? 1 : decay(this.snare, 0.11);
    this.hat = hits[2] ? 1 : decay(this.hat, 0.05);

    // Beat clock with a flywheel.
    const kickGap = this.now - this.lastRealKick;   // before this frame's kick, for the drop detector
    this.since += dt;
    if (hits[0]) {
      const interval = this.now - this.lastRealKick;
      if (interval > 0.27 && interval < 1.05) this.beatLen += (interval - this.beatLen) * 0.25;
      else if (interval > 1.05 && interval < 2.1) this.beatLen += (interval / 2 - this.beatLen) * 0.15;
      this.lastRealKick = this.now;
      if (this.virtualBeat && this.since < this.beatLen * 0.4) this.since = 0;   // late kick: re-align, don't double-count
      else { this.beats++; this.since = 0; }
      this.virtualBeat = false;
    } else if (this.since >= this.beatLen) {
      this.beats++; this.since -= this.beatLen; this.virtualBeat = true;
    }
    const target = this.beats + Math.min(this.since / this.beatLen, 0.999);
    this.mt += dt / this.beatLen;
    this.mt += (target - this.mt) * (1 - Math.exp(-dt / 0.3));
    if (this.mt > target + 0.5) this.mt = target + 0.5;

    // Drop and energy.
    const lvl = audio.level;
    this.lvlFast += (lvl - this.lvlFast) * (1 - Math.exp(-dt / 0.25));
    this.lvlMid += (lvl - this.lvlMid) * (1 - Math.exp(-dt / 1.2));
    this.lvlLong += (lvl - this.lvlLong) * (1 - Math.exp(-dt / 8));
    const comeback = hits[0] && kickGap > 2.5 && this.bands[0].fast > 0.3;   // the kick returns after a breakdown
    // No drops while the long-term level is still warming up (switching to a rig mid-song isn't a drop).
    if (this.now > 6 && this.now - this.lastDrop > 8 && this.lvlFast > 0.18 && (this.lvlFast > this.lvlLong * 1.45 || comeback)) {
      this.drop = 1; this.lastDrop = this.now;
    } else this.drop = decay(this.drop, 2.4);
    const rel = this.lvlMid / Math.max(this.lvlLong * 1.25, 0.04);
    this.energy = Math.min(1.2, Math.max(0, 0.55 * rel + 0.45 * this.lvlMid * 2.2));

    return {
      stage: [this.kick, this.snare, this.mt, this.energy],
      stage2: [this.since, this.hat, this.drop, this.beatLen],
    };
  }
}
