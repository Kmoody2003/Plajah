// adaptiveScale — dynamic resolution that holds a 60fps lock.
//
// Feed it the rAF timestamp every frame. When frames run long (the average passes ~18ms) it steps
// the render scale down by 0.1 at once; when frames have been on time for a while it probes back
// up by 0.05. With vsync a fast frame just reads as 16.7ms, so headroom can't be measured
// directly — hence the probing, plus a longer wait before probing again after any slip so it
// settles instead of oscillating. The scale is quantized so render targets are rarely reallocated;
// callers should also round their pixel sizes (quantizePx).
export class AdaptiveScale {
  scale: number;
  private ema = 16.7; private last = 0; private okSince = 0; private cooldownUntil = 0; private backoff = 3000;
  /** Frame budget in ms; set to 1000/cap when the host deliberately caps its frame rate. */
  target: number;
  constructor(private readonly min = 0.5, private readonly max = 1, start = 1, target = 16.7) {
    this.target = target;
    this.scale = Math.min(max, Math.max(min, start));
  }
  /** Returns true when the scale changed this frame. */
  frame(now: number): boolean {
    if (this.last) {
      const dt = Math.min(120, now - this.last);
      this.ema += (dt - this.ema) * 0.1;
      if (dt > this.target * 1.5) this.okSince = now;          // any dropped frame resets the on-time run
    } else this.okSince = now;
    this.last = now;
    if (now < this.cooldownUntil) return false;
    if (this.ema > this.target * 1.08 && this.scale > this.min) {
      this.scale = Math.max(this.min, Math.round((this.scale - 0.1) * 20) / 20);
      this.backoff = Math.min(20000, this.backoff * 1.6);
      this.cooldownUntil = now + 600; this.okSince = now;
      return true;
    }
    if (now - this.okSince > this.backoff && this.scale < this.max) {
      this.scale = Math.min(this.max, Math.round((this.scale + 0.05) * 20) / 20);
      this.cooldownUntil = now + 1200; this.okSince = now;
      return true;
    }
    return false;
  }
  /** Reset the timing baseline (e.g. after a tab was hidden). */
  reset() { this.last = 0; this.ema = 16.7; }
}

/** Round a pixel size to a multiple of `step` so small scale changes don't reallocate buffers. */
export const quantizePx = (px: number, step = 16) => Math.max(step, Math.round(px / step) * step);
