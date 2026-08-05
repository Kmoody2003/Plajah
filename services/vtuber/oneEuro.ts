// oneEuro.ts — the One-Euro filter (Casiez et al.). Low-latency, low-jitter smoothing for
// noisy real-time signals — exactly what tracked face/pose values need so the avatar is crisp
// without the lag a moving-average introduces. One filter instance per scalar signal.

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(private minCutoff = 1.0, private beta = 0.02, private dCutoff = 1.0) {}

  /** Filter a new sample. `t` in seconds (e.g. performance.now()/1000). */
  filter(x: number, t: number): number {
    if (this.xPrev === null || t <= this.tPrev) { this.xPrev = x; this.tPrev = t; this.dxPrev = 0; return x; }
    const dt = t - this.tPrev;
    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const x2 = this.xPrev + alpha(cutoff, dt) * (x - this.xPrev);
    this.xPrev = x2; this.dxPrev = edx; this.tPrev = t;
    return x2;
  }
  reset(): void { this.xPrev = null; this.dxPrev = 0; this.tPrev = 0; }
}

/** A keyed bank of One-Euro filters — one per named signal, created on first use. */
export class OneEuroBank {
  private map = new Map<string, OneEuro>();
  constructor(private minCutoff = 1.0, private beta = 0.02, private dCutoff = 1.0) {}
  filter(key: string, x: number, t: number): number {
    let f = this.map.get(key);
    if (!f) { f = new OneEuro(this.minCutoff, this.beta, this.dCutoff); this.map.set(key, f); }
    return f.filter(x, t);
  }
  reset(): void { this.map.forEach(f => f.reset()); }
}
