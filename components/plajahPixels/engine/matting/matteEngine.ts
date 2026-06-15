// engine/matting/matteEngine.ts — media layer with alpha keying.
// Three key modes:
//   luma   — keep bright pixels, drop dark (great for light-on-black loops)
//   chroma — drop a green-ish key color
//   ai     — MediaPipe selfie segmentation → confidence mask (needs network)
// luma/chroma run fully offline on a downscaled work canvas. AI matte lazy-
// loads @mediapipe/tasks-vision from CDN and gracefully falls back to luma.

export type KeyMode = 'none' | 'luma' | 'chroma' | 'ai';

export class MatteEngine {
  el: HTMLImageElement | HTMLVideoElement | null = null;
  type: 'image' | 'video' | null = null;
  mode: KeyMode = 'none';
  thresh = 0.30;
  scale = 1.0;
  react = true;
  ready = false;

  private work = document.createElement('canvas');
  private wctx: CanvasRenderingContext2D | null = null;
  private ai: any = null;
  private aiReady = false;
  private aiTrying = false;

  constructor(private onStatus?: (s: string) => void) {
    this.wctx = this.work.getContext('2d', { willReadFrequently: true });
  }

  load(file: File) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video')) {
      const v = document.createElement('video');
      v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.play();
      v.addEventListener('loadeddata', () => {
        this.el = v; this.type = 'video'; this.ready = true;
        this.onStatus?.(`Video layer · ${v.videoWidth}×${v.videoHeight}`);
      });
    } else {
      const img = new Image();
      img.onload = () => { this.el = img; this.type = 'image'; this.ready = true; this.onStatus?.(`Image layer · ${img.width}×${img.height}`); };
      img.src = url;
    }
  }

  async tryAI() {
    if (this.aiReady || this.aiTrying) return;
    this.aiTrying = true; this.onStatus?.('Loading AI matte model…');
    try {
      const vision: any = await import(
        // @ts-ignore — resolved at runtime from CDN, not bundled
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
      );
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      this.ai = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
        runningMode: 'VIDEO', outputConfidenceMasks: true,
      });
      this.aiReady = true; this.onStatus?.('AI matte ready.');
    } catch (e) {
      console.warn('AI matte unavailable:', e);
      this.onStatus?.('AI matte needs network/WebGPU — using luma key.');
      this.mode = 'luma';
    }
    this.aiTrying = false;
  }

  /** Composite the keyed layer onto `out`. `bass`/`level` drive reactive scale. */
  draw(out: CanvasRenderingContext2D, W: number, H: number, bass: number, level: number) {
    if (!this.ready || !this.el || this.mode === 'none') { out.clearRect(0, 0, W, H); return; }
    const mw = this.type === 'video' ? (this.el as HTMLVideoElement).videoWidth : (this.el as HTMLImageElement).width;
    const mh = this.type === 'video' ? (this.el as HTMLVideoElement).videoHeight : (this.el as HTMLImageElement).height;
    if (!mw || !mh) return;
    const bw = Math.min(640, mw), bh = Math.round(bw * mh / mw);
    if (this.work.width !== bw || this.work.height !== bh) { this.work.width = bw; this.work.height = bh; }
    const w = this.wctx!; w.drawImage(this.el, 0, 0, bw, bh);

    if (this.mode === 'luma' || this.mode === 'chroma') {
      const img = w.getImageData(0, 0, bw, bh), d = img.data, th = this.thresh * 255;
      for (let i = 0; i < d.length; i += 4) {
        if (this.mode === 'luma') {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i + 3] = l < th ? 0 : Math.min(255, (l - th) / (255 - th) * 255 * 1.5);
        } else {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (g > r * 1.2 && g > b * 1.2 && g > th) d[i + 3] = 0;
        }
      }
      w.putImageData(img, 0, 0);
    } else if (this.mode === 'ai') {
      if (!this.aiReady) { this.tryAI(); }
      else {
        try {
          const res = this.ai.segmentForVideo(this.el, performance.now());
          const mask = res.confidenceMasks?.[0];
          if (mask) {
            const mf = mask.getAsFloat32Array();
            const img = w.getImageData(0, 0, bw, bh), d = img.data;
            for (let p = 0, j = 3; p < mf.length; p++, j += 4) d[j] = mf[p] > this.thresh ? 255 : Math.round(mf[p] * 255);
            w.putImageData(img, 0, 0);
          }
          res.close?.();
        } catch { /* skip frame */ }
      }
    }

    const sc = this.scale * (this.react ? 1 + bass * 0.18 : 1);
    const dw = W * sc, dh = dw * bh / bw, dx = (W - dw) / 2, dy = (H - dh) / 2;
    out.clearRect(0, 0, W, H);
    out.globalCompositeOperation = 'lighter';
    out.globalAlpha = Math.min(1, 0.85 + level * 0.3);
    out.drawImage(this.work, dx, dy, dw, dh);
    out.globalAlpha = 1; out.globalCompositeOperation = 'source-over';
  }
}
