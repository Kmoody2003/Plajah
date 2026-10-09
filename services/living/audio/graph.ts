// The master chain: four buses (sfx, music, ambience, voice) -> shared generated reverb -> compressor -> soft limiter -> destination.
// Built on BaseAudioContext so it works live and in offline renders. Music and ambience each have a depth low-pass and a ducking stage.

import { type Ctx, clamp, makeImpulse } from './dsp';

/** depth 0 (surface) .. 1 (deep) -> how muffled / quiet / wet music and ambience become. Pure, so it is testable. */
export function depthParams(depth01: number): { cutoffHz: number; gain: number; reverbSend: number } {
  const d = clamp(Number.isFinite(depth01) ? depth01 : 0, 0, 1);
  const cutoffHz = 18000 * Math.pow(380 / 18000, d);              // exponential: 18 kHz at the surface, 380 Hz at the bottom
  return { cutoffHz, gain: 1 - 0.55 * d, reverbSend: 0.04 + 0.5 * d };
}

/** Linear 0..1 duck amount (0.6 = reduce by 60%) -> gain multiplier. */
export const duckGain = (amount: number) => clamp(1 - clamp(amount, 0, 1), 0.02, 1);

/** Soft limiter curve: identity below 0.8, smoothly saturating toward 0.98. Guarantees |y| < 1 for any input. */
export function limiterCurve(n = 2048): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; const a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export interface Bus { input: GainNode; lp: BiquadFilterNode; duck: GainNode; speechDuck: GainNode; depthGain: GainNode; send: GainNode }

export class AudioGraph {
  readonly master: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly clip: WaveShaperNode;
  readonly reverbIn: GainNode;
  readonly convolver: ConvolverNode;
  readonly sfx: GainNode;
  readonly sfxLp: BiquadFilterNode;
  readonly sfxSend: GainNode;
  readonly music: Bus;
  readonly ambience: Bus;
  readonly voice: GainNode;
  private muted = false;
  private userMusic = 0.7;
  private userSfx = 1;
  private reduced = false;
  private duckUntil = 0;
  depth = 0;

  constructor(readonly c: Ctx) {
    this.master = c.createGain(); this.master.gain.value = 0.85;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 8; this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.clip = c.createWaveShaper(); this.clip.curve = limiterCurve() as any;
    this.master.connect(this.comp); this.comp.connect(this.clip); this.clip.connect(c.destination);

    this.convolver = c.createConvolver(); this.convolver.buffer = makeImpulse(c, 2.4, 3.0);
    this.reverbIn = c.createGain(); this.reverbIn.gain.value = 1;
    const wet = c.createGain(); wet.gain.value = 0.9;
    this.reverbIn.connect(this.convolver); this.convolver.connect(wet); wet.connect(this.master);

    this.sfx = c.createGain(); this.sfx.gain.value = this.userSfx;
    this.sfxLp = c.createBiquadFilter(); this.sfxLp.type = 'lowpass'; this.sfxLp.frequency.value = 20000; this.sfxLp.Q.value = 0.5;
    this.sfxSend = c.createGain(); this.sfxSend.gain.value = 0.1;
    this.sfx.connect(this.sfxLp); this.sfxLp.connect(this.master); this.sfxLp.connect(this.sfxSend); this.sfxSend.connect(this.reverbIn);

    this.music = this.makeBus(this.userMusic, 0.06);
    this.ambience = this.makeBus(1, 0.04);
    this.voice = c.createGain(); this.voice.gain.value = 1; this.voice.connect(this.master);
    const vs = c.createGain(); vs.gain.value = 0.05; this.voice.connect(vs); vs.connect(this.reverbIn);
  }

  private makeBus(gain: number, send: number): Bus {
    const c = this.c;
    const input = c.createGain(); input.gain.value = gain;
    const duck = c.createGain(); const speechDuck = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.6;
    const depthGain = c.createGain(); const sendG = c.createGain(); sendG.gain.value = send;
    input.connect(duck); duck.connect(speechDuck); speechDuck.connect(lp); lp.connect(depthGain); depthGain.connect(this.master);
    lp.connect(sendG); sendG.connect(this.reverbIn);
    return { input, lp, duck, speechDuck, depthGain, send: sendG };
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.c.currentTime, 0.03);
  }
  get isMuted() { return this.muted; }

  setGains(g: { music?: number; sfx?: number }) {
    const now = this.c.currentTime;
    if (g.music != null) { this.userMusic = clamp(g.music, 0, 1.5); this.music.input.gain.setTargetAtTime(this.userMusic, now, 0.05); }
    if (g.sfx != null) { this.userSfx = clamp(g.sfx, 0, 1.5); this.applySfx(); }
  }
  get gains() { return { music: this.userMusic, sfx: this.userSfx }; }

  private applySfx(immediate = false) {
    const now = this.c.currentTime; const g = this.userSfx * (this.reduced ? 0.55 : 1), f = this.reduced ? 4500 : 20000;
    if (immediate) { this.sfx.gain.cancelScheduledValues(now); this.sfx.gain.setValueAtTime(g, now); this.sfxLp.frequency.cancelScheduledValues(now); this.sfxLp.frequency.setValueAtTime(f, now); return; }
    this.sfx.gain.setTargetAtTime(g, now, 0.03);
    this.sfxLp.frequency.setTargetAtTime(f, now, 0.03);
  }
  /** `immediate` skips the short ramp (offline renders start at t=0 and must already be in the mode). */
  setReducedSound(on: boolean, immediate = false) { this.reduced = on; this.applySfx(immediate); }

  setDepth(d: number) {
    this.depth = clamp(d, 0, 1);
    const p = depthParams(this.depth); const now = this.c.currentTime;
    for (const b of [this.music, this.ambience]) {
      b.lp.frequency.setTargetAtTime(p.cutoffHz, now, 0.18);
      b.depthGain.gain.setTargetAtTime(p.gain, now, 0.18);
      b.send.gain.setTargetAtTime(p.reverbSend, now, 0.18);
    }
  }

  /** Lower music + ambience by `amount` (0..1) for `ms`, then ease back. Overlapping ducks extend, they don't stack. */
  duck(amount: number, ms: number) {
    const now = this.c.currentTime; const target = duckGain(amount);
    for (const b of [this.music, this.ambience]) {
      b.duck.gain.cancelScheduledValues(now);
      b.duck.gain.setTargetAtTime(target, now, 0.05);
      b.duck.gain.setTargetAtTime(1, now + Math.max(0.05, ms / 1000), 0.25);
    }
    this.duckUntil = Math.max(this.duckUntil, now + ms / 1000);
  }

  /** Hold music + ambience down while someone is being read to (released with on=false). */
  setSpeechDuck(on: boolean, amount = 0.55) {
    const now = this.c.currentTime;
    for (const b of [this.music, this.ambience]) {
      b.speechDuck.gain.cancelScheduledValues(now);
      b.speechDuck.gain.setTargetAtTime(on ? duckGain(amount) : 1, now, on ? 0.12 : 0.4);
    }
  }
}
