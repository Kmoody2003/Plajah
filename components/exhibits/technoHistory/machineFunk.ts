// Tiny Web Audio drum machine + bass for the exhibit: every sound is synthesized here (no samples, no
// recordings), so it's free to play anywhere, including as the scratch bed under the spot previz.

export type TxVoice = 'kick' | 'snare' | 'clap' | 'hat' | 'bass';
export const TX_VOICES: TxVoice[] = ['kick', 'snare', 'clap', 'hat', 'bass'];
export const TX_STEPS = 16;

export type TxPattern = Record<TxVoice, boolean[]>;

const row = (on: number[]) => Array.from({ length: TX_STEPS }, (_, i) => on.includes(i));

/** A generic electro groove (not a copy of any record). */
export const defaultPattern = (): TxPattern => ({
  kick: row([0, 6, 10]),
  snare: row([4, 12]),
  clap: row([12]),
  hat: row([0, 2, 4, 6, 8, 10, 12, 14, 15]),
  bass: row([0, 3, 6, 8, 10, 11, 14]),
});

/** Driving four-on-the-floor for the Berlin half / spot beds. */
export const berlinPattern = (): TxPattern => ({
  kick: row([0, 4, 8, 12]),
  snare: row([]),
  clap: row([4, 12]),
  hat: row([2, 6, 10, 14]),
  bass: row([2, 6, 10, 14]),
});

// Bass notes per step (MIDI), a minor-key line around A1.
const BASS_NOTES = [33, 33, 36, 33, 33, 40, 33, 38, 33, 36, 43, 40, 33, 36, 38, 40];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class MachineFunk {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  pattern: TxPattern = defaultPattern();
  bpm = 128;
  onStep?: (step: number) => void;

  get playing() { return this.timer !== null; }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx; this.master = master; this.noise = buf;
    return ctx;
  }

  trigger(v: TxVoice, t?: number, step = 0) {
    const ctx = this.ensure();
    const out = this.master!;
    const at = t ?? ctx.currentTime;
    if (v === 'kick') {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
      g.gain.setValueAtTime(1, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      o.connect(g).connect(out); o.start(at); o.stop(at + 0.5);
    } else if (v === 'snare' || v === 'clap' || v === 'hat') {
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const f = ctx.createBiquadFilter(); const g = ctx.createGain();
      f.type = v === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = v === 'hat' ? 7000 : v === 'clap' ? 1400 : 1800;
      const len = v === 'hat' ? 0.05 : v === 'clap' ? 0.18 : 0.2;
      const lvl = v === 'hat' ? 0.35 : 0.7;
      if (v === 'clap') {
        // three quick bursts, then the tail
        [0, 0.012, 0.024].forEach((dt) => { g.gain.setValueAtTime(lvl, at + dt); g.gain.exponentialRampToValueAtTime(0.05, at + dt + 0.01); });
        g.gain.setValueAtTime(lvl, at + 0.036); g.gain.exponentialRampToValueAtTime(0.001, at + len);
      } else {
        g.gain.setValueAtTime(lvl, at); g.gain.exponentialRampToValueAtTime(0.001, at + len);
      }
      n.connect(f).connect(g).connect(out); n.start(at); n.stop(at + len + 0.05);
      if (v === 'snare') {
        const o = ctx.createOscillator(); const og = ctx.createGain();
        o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
        og.gain.setValueAtTime(0.5, at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
        o.connect(og).connect(out); o.start(at); o.stop(at + 0.15);
      }
    } else if (v === 'bass') {
      const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
      o.type = 'square'; o.frequency.value = mtof(BASS_NOTES[step % TX_STEPS]);
      f.type = 'lowpass'; f.Q.value = 8;
      f.frequency.setValueAtTime(1600, at); f.frequency.exponentialRampToValueAtTime(220, at + 0.18);
      g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      o.connect(f).connect(g).connect(out); o.start(at); o.stop(at + 0.25);
    }
  }

  start() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    if (this.timer !== null) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    const tick = () => {
      const sixteenth = 60 / this.bpm / 4;
      while (this.nextTime < ctx.currentTime + 0.12) {
        const s = this.step;
        for (const v of TX_VOICES) if (this.pattern[v][s]) this.trigger(v, this.nextTime, s);
        const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
        window.setTimeout(() => this.onStep?.(s), delay);
        this.nextTime += sixteenth;
        this.step = (s + 1) % TX_STEPS;
      }
    };
    tick();
    this.timer = window.setInterval(tick, 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.onStep?.(-1);
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
