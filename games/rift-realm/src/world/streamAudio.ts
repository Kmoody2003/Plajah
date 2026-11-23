// Elderwood Wilds — the sound of the water. A creek's babble (band-passed noise whose pitch and level wander, so it
// gurgles rather than hisses) that grows as you near the river or the pool stream and pans to where the water is, and
// the low roar of the falls and rapids carrying much further. Procedural (no clips to load), its own AudioContext,
// started on the first key or click (browsers keep audio locked until then) and suspended while the tab is hidden.

export interface WaterHearing {
  /** Metres to the nearest flowing water's edge, its current (m/s), and the angle to it relative to where you face
   *  (radians, + = to the right). */
  creek: { d: number; speed: number; side: number };
  /** Metres to the nearest falls' foot (or rapids) and its angle; `size` scales the roar (falls width / 10). */
  falls: { d: number; side: number; size: number };
}

export class StreamAudio {
  private ctx: AudioContext | null = null;
  private babble: { f: BiquadFilterNode; g: GainNode; p: StereoPannerNode } | null = null;
  private babble2: { f: BiquadFilterNode; g: GainNode } | null = null;
  private roar: { f: BiquadFilterNode; g: GainNode; p: StereoPannerNode } | null = null;
  private wander = 0;
  private wander2 = 0;
  private armed = false;

  constructor(private volume = 1) {
    if (typeof window === 'undefined') return;
    const start = () => {
      window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start);
      this.start();
    };
    window.addEventListener('pointerdown', start); window.addEventListener('keydown', start);
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) void this.ctx.suspend(); else void this.ctx.resume(); });
    this.armed = true;
  }

  private start() {
    if (this.ctx || !this.armed) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC(); this.ctx = ctx;
      // pink-ish noise (Paul Kellet's filter), 4 s, looped
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      const master = ctx.createGain(); master.gain.value = this.volume; master.connect(ctx.destination);
      const src = (off: number) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off); return s; };
      // babble: two band-passed layers at different pitches, levels wandering independently
      {
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.1;
        const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner();
        src(0).connect(f); f.connect(g); g.connect(p); p.connect(master);
        this.babble = { f, g, p };
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 3200; f2.Q.value = 2.2;
        const g2 = ctx.createGain(); g2.gain.value = 0;
        src(1.7).connect(f2); f2.connect(g2); g2.connect(p);
        this.babble2 = { f: f2, g: g2 };
      }
      // roar: low-passed, broad
      {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner();
        src(2.9).connect(f); f.connect(g); g.connect(p); p.connect(master);
        this.roar = { f, g, p };
      }
    } catch { this.ctx = null; }
  }

  /** Once or twice a frame is plenty; levels glide to their targets. */
  update(dt: number, h: WaterHearing) {
    const ctx = this.ctx; if (!ctx || !this.babble || !this.roar || !this.babble2) return;
    const t = ctx.currentTime;
    // the gurgle: pitch and level random-walk a few times a second
    this.wander += (Math.random() - 0.5) * dt * 9; this.wander *= Math.exp(-dt * 2);
    this.wander2 += (Math.random() - 0.5) * dt * 14; this.wander2 *= Math.exp(-dt * 3);
    const near = Math.max(0, 1 - h.creek.d / 55) ** 2, fast = Math.min(1.6, 0.45 + h.creek.speed / 3);
    this.babble.f.frequency.setTargetAtTime(1300 + this.wander * 500 + h.creek.speed * 120, t, 0.08);
    this.babble.g.gain.setTargetAtTime(near * 0.22 * fast * (0.8 + this.wander * 0.25), t, 0.12);
    this.babble2.f.frequency.setTargetAtTime(2900 + this.wander2 * 900, t, 0.05);
    this.babble2.g.gain.setTargetAtTime(near * 0.09 * fast * Math.max(0, 0.6 + this.wander2 * 0.6), t, 0.06);
    this.babble.p.pan.setTargetAtTime(Math.sin(h.creek.side) * 0.7 * Math.min(1, h.creek.d / 4), t, 0.2);
    const roar = Math.max(0, 1 - h.falls.d / (160 + 90 * h.falls.size)) ** 1.7 * Math.min(1.4, 0.5 + h.falls.size * 0.6);
    this.roar.g.gain.setTargetAtTime(roar * 0.5, t, 0.25);
    this.roar.f.frequency.setTargetAtTime(380 + roar * 900, t, 0.3);   // close up the roar opens into hiss
    this.roar.p.pan.setTargetAtTime(Math.sin(h.falls.side) * 0.6 * Math.min(1, h.falls.d / 10), t, 0.3);
  }
}
