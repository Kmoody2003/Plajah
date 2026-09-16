// engine/audioEngine.ts — Web Audio FFT → bass/mid/treble bands, beat + BPM.
// Frard-agnostic. Drive it from React via a ref.

import { platformAudio } from '../../../services/mediaEngine/audioRuntime';
export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  srcEl: HTMLAudioElement | null = null;
  srcNode: MediaElementAudioSourceNode | null = null;
  gain: GainNode | null = null;
  data: Uint8Array = new Uint8Array(0);

  // smoothed bands (0..~1)
  bass = 0; mid = 0; treble = 0; level = 0;
  // raw bands
  bassR = 0; midR = 0; trebleR = 0; levelR = 0;
  beat = 0;
  bpm = 0;

  private beatHist: number[] = [];
  private beatHold = 0;
  private lastBeatTime = 0;
  private beatIntervals: number[] = [];

  private demoLoop: number | null = null;
  private demoNodes: AudioScheduledSourceNode[] = [];
  usingDemo = false;
  isPlaying = false;

  init() {
    if (this.ctx) return;
    this.ctx = platformAudio.getContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.8;
    this.analyser.connect(this.gain);
    this.gain.connect(platformAudio.output('pixels'));
  }

  loadFile(file: File, onTime?: () => void, onMeta?: () => void, onEnded?: () => void) {
    this.init();
    if (!this.srcEl) {
      this.srcEl = new Audio();
      this.srcEl.crossOrigin = 'anonymous';
      this.srcNode = this.ctx!.createMediaElementSource(this.srcEl);
      this.srcNode.connect(this.analyser!);
      if (onTime) this.srcEl.addEventListener('timeupdate', onTime);
      if (onMeta) this.srcEl.addEventListener('loadedmetadata', onMeta);
      this.srcEl.addEventListener('ended', () => { this.isPlaying = false; onEnded?.(); });
    }
    this.stopDemo();
    this.srcEl.src = URL.createObjectURL(file);
    this.usingDemo = false;
    this.play();
  }

  setVolume(v: number) { if (this.gain) this.gain.gain.value = v; }
  time() { return this.usingDemo ? (this.ctx?.currentTime ?? 0) : (this.srcEl?.currentTime ?? 0); }
  duration() { return this.usingDemo ? 180 : (this.srcEl?.duration || 180); }

  private startDemo() {
    this.init();
    this.usingDemo = true;
    const c = this.ctx!;
    const pad = c.createGain(); pad.gain.value = 0.5; pad.connect(this.analyser!);
    [110, 164.81, 220, 277.18].forEach((f, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(pad); o.start();
      this.demoNodes.push(o);
    });
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(pad.gain); lfo.start();
    this.demoNodes.push(lfo);
    let step = 0; const spb = 60 / 124;
    const sch = () => {
      if (!this.usingDemo) return;
      const t = c.currentTime + 0.05;
      const k = c.createOscillator(), kg = c.createGain();
      k.frequency.setValueAtTime(150, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.13);
      kg.gain.setValueAtTime(0.9, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      k.connect(kg); kg.connect(this.analyser!); k.start(t); k.stop(t + 0.18);
      if (step % 2 === 1) {
        const n = c.createBufferSource();
        const buf = c.createBuffer(1, 1024, c.sampleRate);
        const ch = buf.getChannelData(0); for (let i = 0; i < 1024; i++) ch[i] = Math.random() * 2 - 1;
        n.buffer = buf;
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        const hg = c.createGain(); hg.gain.setValueAtTime(0.25, t); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        n.connect(hp); hp.connect(hg); hg.connect(this.analyser!); n.start(t); n.stop(t + 0.06);
      }
      step++;
    };
    sch();
    this.demoLoop = window.setInterval(sch, spb * 1000);
    this.isPlaying = true;
  }
  private stopDemo() {
    if (this.demoLoop) clearInterval(this.demoLoop);
    this.demoNodes.forEach(n => { try { n.stop(); } catch { /* */ } });
    this.demoNodes = []; this.demoLoop = null; this.usingDemo = false;
  }

  play() {
    this.init();
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
    if (this.srcEl && this.srcEl.src && !this.usingDemo) this.srcEl.play();
    else this.startDemo();
    this.isPlaying = true;
  }
  pause() {
    if (this.srcEl && !this.usingDemo) this.srcEl.pause();
    this.stopDemo();
    this.isPlaying = false;
  }
  toggle() { this.isPlaying ? this.pause() : this.play(); }

  analyze(k: number) {
    if (!this.analyser) return;
    this.analyser.smoothingTimeConstant = k;
    // cast keeps this portable across lib.dom's Uint8Array<ArrayBuffer> tightening
    this.analyser.getByteFrequencyData(this.data as any);
    const b = this.data;
    const band = (lo: number, hi: number) => { let s = 0, c = 0; for (let i = lo; i < hi; i++) { s += b[i]; c++; } return c ? s / c / 255 : 0; };
    const bR = band(1, 8), mR = band(8, 60), tR = band(60, 220), lR = band(1, 240);
    this.bass = this.bass * k + bR * (1 - k);
    this.mid = this.mid * k + mR * (1 - k);
    this.treble = this.treble * k + tR * (1 - k);
    this.level = this.level * k + lR * (1 - k);
    this.bassR = bR; this.midR = mR; this.trebleR = tR; this.levelR = lR;
    // energy-based beat detect on bass + rolling BPM
    this.beatHist.push(bR); if (this.beatHist.length > 43) this.beatHist.shift();
    const avg = this.beatHist.reduce((a, x) => a + x, 0) / this.beatHist.length;
    this.beatHold = Math.max(0, this.beatHold - 1);
    if (bR > avg * 1.32 && bR > 0.18 && this.beatHold === 0) {
      this.beat = 1; this.beatHold = 8;
      const now = performance.now();
      if (this.lastBeatTime) {
        const iv = now - this.lastBeatTime;
        if (iv > 250 && iv < 1200) {
          this.beatIntervals.push(iv); if (this.beatIntervals.length > 8) this.beatIntervals.shift();
          const m = this.beatIntervals.reduce((a, x) => a + x, 0) / this.beatIntervals.length;
          this.bpm = Math.round(60000 / m);
        }
      }
      this.lastBeatTime = now;
    } else this.beat *= 0.86;
  }
}
