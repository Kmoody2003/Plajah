// lensAux — the "senses" the newer lenses read besides the face tracker and the person matte:
//
//   MotionMeter  — how much is happening on screen, and where: a 48×27 luma diff per frame
//                  (energy, centroid, global brightness). Found Footage panics on it, Comic draws
//                  speed lines from it.
//   PointerShake — the viewer's mouse / finger: velocity in screen-px/s and click impulses.
//                  Window-level, so it works over the broadcaster's composer and any player.
//   SceneDepth   — Depth Anything V2 (Fabula's depthMatte, transformers.js on WebGPU→wasm),
//                  ~4 fps, last map held. Near = white.
//   ObjectMatte  — Meta's Segment Anything (SlimSAM via Fabula's samMatte) prompted at a point,
//                  for footage with no person in it (pets, products, cars). Heavy: only started
//                  when the selfie matte has found nobody for a while.
//
// All are lazy and optional — a lens asks, and gets null until (unless) the model is ready.

const MW = 48, MH = 27;

export class MotionMeter {
  private c = document.createElement('canvas');
  private x = this.c.getContext('2d', { willReadFrequently: true })!;
  private prev: Float32Array | null = null;
  /** Smoothed fraction of the frame that changed (0 calm … ~1 chaos). */
  energy = 0;
  /** Spike of the latest frame (unsmoothed) — sudden action. */
  burst = 0;
  /** Where the change is, normalized 0..1 (canvas space). */
  cx = 0.5; cy = 0.5;
  /** Mean scene luma 0..1 (auto-exposure reads this). */
  luma = 0.5;

  constructor() { this.c.width = MW; this.c.height = MH; }

  update(canvas: HTMLCanvasElement) {
    try { this.x.drawImage(canvas, 0, 0, MW, MH); } catch { return; }
    const d = this.x.getImageData(0, 0, MW, MH).data;
    const cur = new Float32Array(MW * MH);
    let sum = 0, diff = 0, wx = 0, wy = 0;
    for (let i = 0, k = 0; k < cur.length; i += 4, k++) {
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      cur[k] = l; sum += l;
      if (this.prev) {
        const dl = Math.abs(l - this.prev[k]);
        const v = dl > 0.06 ? dl : 0;                       // ignore sensor noise
        diff += v; wx += v * (k % MW); wy += v * Math.floor(k / MW);
      }
    }
    this.luma = sum / cur.length;
    const raw = this.prev ? Math.min(1, (diff / cur.length) * 9) : 0;
    this.burst = raw;
    this.energy += (raw - this.energy) * (raw > this.energy ? 0.45 : 0.08);   // fast attack, slow release
    if (diff > 0.5) {
      this.cx += ((wx / diff) / (MW - 1) - this.cx) * 0.3;
      this.cy += ((wy / diff) / (MH - 1) - this.cy) * 0.3;
    }
    this.prev = cur;
  }
}

/** One shared window listener; every engine reads the same pointer. */
class PointerState {
  vx = 0; vy = 0;          // screen px / s, decaying
  speed = 0;               // |v|, smoothed
  clicks = 0;              // bumps on every pointerdown
  private lx = NaN; private ly = NaN; private lt = 0; private users = 0;
  private onMove = (e: PointerEvent) => {
    const t = e.timeStamp || performance.now();
    if (!Number.isNaN(this.lx) && t > this.lt) {
      const dt = Math.max(4, t - this.lt) / 1000;
      const vx = (e.clientX - this.lx) / dt, vy = (e.clientY - this.ly) / dt;
      this.vx += (vx - this.vx) * 0.5; this.vy += (vy - this.vy) * 0.5;
    }
    this.lx = e.clientX; this.ly = e.clientY; this.lt = t;
  };
  private onDown = () => { this.clicks++; };
  attach() {
    if (this.users++ === 0 && typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.onMove, { passive: true });
      window.addEventListener('pointerdown', this.onDown, { passive: true });
    }
  }
  detach() {
    if (--this.users === 0 && typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.onMove);
      window.removeEventListener('pointerdown', this.onDown);
    }
  }
  /** Decay towards rest — the pointer stopping must calm the camera. */
  step(dt: number) {
    const k = Math.exp(-dt * 7);
    this.vx *= k; this.vy *= k;
    this.speed += (Math.hypot(this.vx, this.vy) - this.speed) * (1 - Math.exp(-dt * 12));
  }
}
const pointerState = new PointerState();

export class PointerShake {
  private attached = false;
  private seenClicks = 0;
  get vx() { return pointerState.vx; }
  get vy() { return pointerState.vy; }
  get speed() { return pointerState.speed; }
  start() { if (!this.attached) { this.attached = true; pointerState.attach(); this.seenClicks = pointerState.clicks; } }
  stop() { if (this.attached) { this.attached = false; pointerState.detach(); } }
  step(dt: number) { pointerState.step(dt); }
  /** Clicks since the last call. */
  takeClicks() { const n = pointerState.clicks - this.seenClicks; this.seenClicks = pointerState.clicks; return n; }
}

/** Monocular depth, held between ~4fps refreshes. */
export class SceneDepth {
  private mod: typeof import('../fabula/depthMatte') | null = null;
  private loading = false;
  private canvas: HTMLCanvasElement | null = null;
  private lastPull = 0;
  /** Bumped whenever a new map may have landed (the caller re-uploads on change). */
  stamp = 0;
  state(): 'idle' | 'loading' | 'ready' | 'failed' {
    return this.mod ? (this.mod.depthMatteStatus() as any) : this.loading ? 'loading' : 'idle';
  }
  init() {
    if (this.mod || this.loading) return;
    this.loading = true;
    import('../fabula/depthMatte').then(m => { this.mod = m; void m.loadDepthEstimator(); }).catch(() => { /* stays idle */ }).finally(() => { this.loading = false; });
  }
  /** Latest depth canvas in VIDEO space (near = white), or null. */
  update(video: HTMLVideoElement, nowMs: number): HTMLCanvasElement | null {
    if (!this.mod || this.mod.depthMatteStatus() !== 'ready') return null;
    if (nowMs - this.lastPull > 120) {
      this.lastPull = nowMs;
      const c = this.mod.estimateDepthLatest(video, 256, Math.max(2, Math.round(256 * (video.videoHeight || 9) / (video.videoWidth || 16))));
      if (c) { this.canvas = c; this.stamp++; }
    }
    return this.canvas;
  }
}

/** Segment-Anything matte prompted at a normalized video point. */
export class ObjectMatte {
  private mod: typeof import('../fabula/samMatte') | null = null;
  private loading = false;
  private canvas: HTMLCanvasElement | null = null;
  private lastPull = 0;
  stamp = 0;
  init() {
    if (this.mod || this.loading) return;
    this.loading = true;
    import('../fabula/samMatte').then(m => { this.mod = m; void m.loadSam(); }).catch(() => { /* */ }).finally(() => { this.loading = false; });
  }
  get active() { return !!this.mod || this.loading; }
  update(video: HTMLVideoElement, nowMs: number, px: number, py: number): HTMLCanvasElement | null {
    if (!this.mod || this.mod.samMatteStatus() !== 'ready') return null;
    if (nowMs - this.lastPull > 150) {
      this.lastPull = nowMs;
      const w = 192, h = Math.max(2, Math.round(192 * (video.videoHeight || 9) / (video.videoWidth || 16)));
      const c = this.mod.segmentSamLatest(video, { x: px, y: py }, w, h, 0.01);
      if (c) { this.canvas = c; this.stamp++; }
    }
    return this.canvas;
  }
}
