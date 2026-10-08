// Tiny demo synth (kick / hats / bass / pads, with an auto quiet → groove → peak arrangement) feeding a real
// AnalyserNode — used by the Kaiju preview pages. Dev-only.

export type Section = 'quiet' | 'groove' | 'peak';
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Synth {
  ctx = new AudioContext(); an: AnalyserNode; out: GainNode; noise: AudioBuffer;
  bpm = 124; step = 0; nextT = 0; timer = 0; t0 = 0;
  section: Section = 'groove'; auto = true; sectionBeats = 0;
  seq: [Section, number][] = [['quiet', 16], ['groove', 16], ['peak', 32], ['groove', 16]]; seqI = 0; onSection?: (s: Section) => void;
  constructor() {
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.6;
    this.out = this.ctx.createGain(); this.out.gain.value = 0.7; this.out.connect(this.an); this.an.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  get time() { return this.ctx.currentTime - this.t0; }
  start() {
    this.stop(); this.ctx.resume(); this.step = 0; this.seqI = 0; this.sectionBeats = 0;
    if (this.auto) { this.section = this.seq[0][0]; this.onSection?.(this.section); }
    this.nextT = this.ctx.currentTime + 0.1; this.t0 = this.nextT; this.timer = window.setInterval(() => this.pump(), 25);
  }
  stop() { window.clearInterval(this.timer); this.timer = 0; }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, a = 0.005, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(g); g.connect(this.out); this.env(g, t, a, peak, dur); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  private nz(t: number, dur: number, peak: number, type: BiquadFilterType, f: number, q = 1) {
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); fl.connect(g); g.connect(this.out);
    this.env(g, t, 0.002, peak, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  private kick(t: number, p = 1) { const o = this.osc('sine', 150, t, 0.35, p); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); }
  private pump() { const s16 = 60 / this.bpm / 4; while (this.nextT < this.ctx.currentTime + 0.12) { this.tick(this.step, this.nextT, s16); this.step++; this.nextT += s16; } }
  private tick(n: number, t: number, s16: number) {
    if (n % 4 === 0) {
      this.sectionBeats++;
      if (this.auto && this.sectionBeats >= this.seq[this.seqI][1]) {
        this.seqI = (this.seqI + 1) % this.seq.length; this.sectionBeats = 0; this.section = this.seq[this.seqI][0]; this.onSection?.(this.section);
        if (this.section === 'peak') this.nz(t, 1.2, 0.9, 'highpass', 5000);
      }
    }
    const sec = this.section, bar = Math.floor(n / 16), root = [45, 41, 43, 40][bar % 4];
    if (sec === 'quiet') {
      if (n % 16 === 0) for (const iv of [0, 7, 12, 16]) this.osc('sine', mtof(root + 12 + iv), t, s16 * 15, 0.05, 0.4);
      if (n % 8 === 4) this.nz(t, 0.06, 0.06, 'highpass', 9000);
      return;
    }
    if (n % 4 === 0) this.kick(t, 0.95);
    if (n % 4 === 2) { this.nz(t, 0.05, 0.25, 'highpass', 8000); this.osc('sawtooth', mtof(root), t, s16 * 1.5, 0.22); }
    if (n % 16 === 0) for (const iv of [12, 16, 19]) for (const dt of [-12, 12]) this.osc('sawtooth', mtof(root + iv + 12), t, s16 * 14, 0.03, 0.02, dt);
    if (sec === 'peak') {
      if (n % 8 === 4) this.nz(t, 0.18, 0.5, 'bandpass', 1500, 0.8);
      this.osc('square', mtof(root + 24 + [0, 7, 12, 7][n % 4]), t, s16 * 0.8, 0.045);
      if (n % 2 === 1) this.nz(t, 0.03, 0.18, 'highpass', 9000);
    }
  }
}

