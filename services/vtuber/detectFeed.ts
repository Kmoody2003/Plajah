// detectFeed.ts — the tracker's eyes in the dark. MediaPipe landmarkers degrade badly on
// underexposed frames (front cameras at night especially). Instead of detecting on the raw
// <video>, both trackers detect on this preprocessed canvas:
//   • AUTO-GAIN: mean scene luma is sampled continuously; dark frames get an adaptive
//     brightness/contrast lift (up to ~2.6x) so landmarks stay findable at night.
//   • DOWNSCALE to ~360p: inference runs faster (higher tracking fps = smoother puppet)
//     and mild downscaling averages away some sensor noise.
// Normalized landmark coords are scale-invariant, so nothing downstream changes.

export class DetectFeed {
  private c = document.createElement('canvas');
  private ctx = this.c.getContext('2d', { willReadFrequently: true })!;
  private gain = 1;
  private frame = 0;

  /** Returns the surface to run detection on for this frame. BULLETPROOF: any failure
   *  (or good lighting) falls back to the raw <video> so tracking can never be starved by
   *  the preprocessor. Only engages the boosted canvas when the scene is actually dark. */
  src(video: HTMLVideoElement): HTMLCanvasElement | HTMLVideoElement {
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return video;
      const s = Math.min(1, 360 / Math.min(vw, vh));
      const w = Math.max(2, Math.round(vw * s)), h = Math.max(2, Math.round(vh * s));
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }

      this.ctx.filter = this.gain > 1.03
        ? `brightness(${this.gain.toFixed(2)}) contrast(1.06) saturate(1.05)`
        : 'none';
      this.ctx.drawImage(video, 0, 0, w, h);
      this.ctx.filter = 'none';

      // Re-meter every ~15 frames (sparse sample of SOURCE luma = post-gain luma / gain).
      if ((this.frame++ % 15) === 0) {
        const d = this.ctx.getImageData(0, 0, w, h).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 512) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
        const srcLuma = (sum / Math.max(1, n)) / Math.max(1, this.gain);
        const target = 110;
        const want = srcLuma < target ? Math.min(2.6, target / Math.max(18, srcLuma)) : 1;
        this.gain += (want - this.gain) * 0.35;
      }
      // Good light (gain ≈ 1): hand MediaPipe the RAW video — max fidelity, zero overhead.
      return this.gain > 1.06 ? this.c : video;
    } catch {
      return video; // never let preprocessing break tracking
    }
  }

  /** Current auto-gain (1 = passthrough) — surfaced in tracker status for debugging. */
  get boost(): number { return this.gain; }
}
