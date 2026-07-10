// liveComposer — camera/screen composition + color-grade engine for the live streamer.
//
// Pipeline: sources → 2D composite (work canvas) → WebGL2 color grade (built-in looks
// or a custom .cube 3D LUT) → output canvas → captureStream → published track.
// Switching modes/looks just changes what's drawn/graded — no track swap, no
// renegotiation, so it's instant and never drops viewers.
//
// Modes:
//   front · rear · both (rear + front PiP) · screen-pip (screen + camera PiP) ·
//   screen-mask (screen + the person cut out of the front camera via MediaPipe)
//
// Looks: neutral · warm · teal-orange · moody · vivid · noir · vintage, plus any
// uploaded .cube 3D LUT. Grading runs on WebGL2; if unavailable it passes through.

import type { VTuberHandle } from './vtuber/vtuberEngine';
import type { AvatarDescriptor } from './vtuber/avatarFactory';

export type ComposerMode = 'front' | 'rear' | 'both' | 'screen-pip' | 'screen-mask' | 'vtuber';
export type LookId = 'none' | 'warm' | 'tealorange' | 'moody' | 'vivid' | 'noir' | 'vintage';
export const LOOKS: { id: LookId; label: string }[] = [
  { id: 'none', label: 'Neutral' },
  { id: 'warm', label: 'Warm film' },
  { id: 'tealorange', label: 'Teal & orange' },
  { id: 'moody', label: 'Moody' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'noir', label: 'Noir' },
  { id: 'vintage', label: 'Vintage' },
];
// Built-in looks as 2D-canvas filter strings. A 2D canvas is captured far more reliably than
// WebGL on mobile GPUs (WebGL captureStream frequently yields a black/frozen buffer regardless
// of preserveDrawingBuffer), so the grade runs as a canvas filter on the output blit.
const LOOK_FILTERS: Record<LookId, string> = {
  none: 'none',
  warm: 'saturate(1.12) contrast(1.08) sepia(0.16) hue-rotate(-10deg) brightness(1.02)',
  tealorange: 'saturate(1.28) contrast(1.12) hue-rotate(-6deg)',
  moody: 'saturate(0.82) brightness(0.92) contrast(1.14) hue-rotate(6deg)',
  vivid: 'saturate(1.5) contrast(1.12)',
  noir: 'grayscale(1) contrast(1.3) brightness(1.03)',
  vintage: 'sepia(0.4) saturate(0.82) contrast(0.9) brightness(1.05)',
};

const HQ: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

const makeVideoEl = (): HTMLVideoElement => {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true;
  v.setAttribute('playsinline', '');
  return v;
};
const roundRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
};
const coverDraw = (c: CanvasRenderingContext2D, el: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number) => {
  const vw = el.videoWidth, vh = el.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = dw / scale, sh = dh / scale;
  c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, dx, dy, dw, dh);
};

export class LiveComposer {
  readonly canvas = document.createElement('canvas'); // captured 2D output (composite + graded)
  private octx = this.canvas.getContext('2d', { alpha: false })!;
  private work = document.createElement('canvas');     // 2D composite target
  private wctx = this.work.getContext('2d', { alpha: false })!;
  private out: MediaStream | null = null;
  private raf = 0;
  private mode: ComposerMode = 'front';

  // Grade stage — a 2D canvas filter (see LOOK_FILTERS). Reliable capture on mobile.
  private look: LookId = 'none';

  private frontStream: MediaStream | null = null;
  private rearStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private frontEl = makeVideoEl();
  private rearEl = makeVideoEl();
  private screenEl = makeVideoEl();

  private seg: any = null;
  private segLoading = false;
  private maskCanvas = document.createElement('canvas');
  private maskCtx = this.maskCanvas.getContext('2d')!;

  // VTuber: a face-tracked avatar (2D puppet or VRM) driven by the front camera.
  private avatar: AvatarDescriptor | null = null;
  private vtuber: VTuberHandle | null = null;
  private vtuberStarting = false;

  constructor(private onScreenEnded?: () => void) {
    this.setCanvas(720, 1280);
  }

  private setCanvas(w: number, h: number) {
    if (this.work.width !== w) { this.work.width = w; this.work.height = h; }
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; }
  }

  getStream(): MediaStream {
    if (!this.out) { this.out = this.canvas.captureStream(30); if (!this.raf) this.loop(); }
    return this.out;
  }
  getMode() { return this.mode; }
  getLook() { return this.look; }
  hasGrade() { return true; }

  getActiveCameraTrack(): MediaStreamTrack | null {
    return this.frontStream?.getVideoTracks()[0] || this.rearStream?.getVideoTracks()[0] || null;
  }

  setLook(look: LookId) { this.look = look; }
  clearLut() { /* custom .cube LUTs run on the WebGL path only; 2D uses built-in looks */ }

  /** Set the VTuber avatar (2D puppet built from a character sheet, or a VRM). Takes
   *  effect next time 'vtuber' mode starts; if already in vtuber mode, restart it. */
  setAvatar(a: AvatarDescriptor | null) {
    this.avatar = a;
    if (this.vtuber) { this.vtuber.dispose(); this.vtuber = null; }
  }
  hasAvatar() { return !!this.avatar; }
  private async ensureVtuber() {
    if (this.vtuber || this.vtuberStarting || !this.avatar || !this.frontStream) return;
    this.vtuberStarting = true;
    try {
      // Lazy-load the VTuber engine (pulls in three.js) only when actually used.
      const { createVTuberStream } = await import('./vtuber/vtuberEngine');
      // AVATAR_ONLY on a transparent canvas — the composer draws it over its own
      // background and then grades it, so LUTs/looks apply to the avatar too.
      this.vtuber = await createVTuberStream(this.frontStream, {
        avatar: this.avatar, mode: 'FACE_SWAP', width: 540, height: 960, fps: 24,
        background: { type: 'transparent' },
      });
    } catch (e) { console.warn('[liveComposer] vtuber start failed:', e); this.vtuber = null; }
    this.vtuberStarting = false;
  }
  private releaseVtuber() { if (this.vtuber) { this.vtuber.dispose(); this.vtuber = null; } }

  /** Custom .cube 3D LUTs require the per-pixel WebGL path, which we dropped for reliable
   *  2D capture on mobile. Built-in looks cover the common cases. Returns false so the UI
   *  can tell the user custom LUTs aren't available in the browser streamer. */
  setCubeLut(_text: string): boolean { return false; }

  private async ensureFront() {
    if (this.frontStream) return;
    this.frontStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: 'user' } });
    this.frontEl.srcObject = this.frontStream; await this.frontEl.play().catch(() => {});
  }
  private async ensureRear() {
    if (this.rearStream) return;
    try { this.rearStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: { exact: 'environment' } } }); }
    catch { this.rearStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: 'environment' } }); }
    this.rearEl.srcObject = this.rearStream; await this.rearEl.play().catch(() => {});
  }
  private async ensureScreen() {
    if (this.screenStream) return;
    const md: any = navigator.mediaDevices;
    if (typeof md.getDisplayMedia !== 'function') throw new Error("Screen sharing isn't supported on this device.");
    this.screenStream = await md.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    this.screenEl.srcObject = this.screenStream; await this.screenEl.play().catch(() => {});
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => { this.releaseScreen(); this.onScreenEnded?.(); });
  }
  private stop(s: MediaStream | null) { s?.getTracks().forEach(t => t.stop()); }
  private releaseFront() { this.stop(this.frontStream); this.frontStream = null; this.frontEl.srcObject = null; }
  private releaseRear() { this.stop(this.rearStream); this.rearStream = null; this.rearEl.srcObject = null; }
  private releaseScreen() { this.stop(this.screenStream); this.screenStream = null; this.screenEl.srcObject = null; }

  async setMode(mode: ComposerMode): Promise<void> {
    const needFront = mode !== 'rear';
    const needRear = mode === 'rear' || mode === 'both';
    const needScreen = mode === 'screen-pip' || mode === 'screen-mask';
    if (needFront) await this.ensureFront();
    if (needRear) await this.ensureRear();
    if (needScreen) await this.ensureScreen();
    if (mode === 'screen-mask') await this.ensureSegmenter();
    if (mode === 'vtuber') await this.ensureVtuber(); else this.releaseVtuber();
    if (!needFront) this.releaseFront();
    if (!needRear) this.releaseRear();
    if (!needScreen) this.releaseScreen();
    if (needScreen) this.setCanvas(1280, 720); else this.setCanvas(720, 1280);
    this.mode = mode;
    this.getStream();
  }

  private async ensureSegmenter() {
    if (this.seg || this.segLoading) return;
    this.segLoading = true;
    try {
      const vision: any = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
      const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
        runningMode: 'VIDEO', outputConfidenceMasks: true,
      });
    } catch (e) { console.warn('[liveComposer] segmenter unavailable, PiP fallback:', e); this.seg = null; }
    this.segLoading = false;
  }

  private renderMaskedPerson(): HTMLCanvasElement | null {
    const el = this.frontEl, vw = el.videoWidth, vh = el.videoHeight;
    if (!vw || !vh || !this.seg) return null;
    const bw = 320, bh = Math.round(bw * vh / vw);
    if (this.maskCanvas.width !== bw) { this.maskCanvas.width = bw; this.maskCanvas.height = bh; }
    const m = this.maskCtx; m.drawImage(el, 0, 0, bw, bh);
    try {
      const res = this.seg.segmentForVideo(el, performance.now());
      const mask = res.confidenceMasks?.[0];
      if (mask) {
        const mf = mask.getAsFloat32Array();
        const img = m.getImageData(0, 0, bw, bh), d = img.data;
        for (let p = 0, j = 3; p < mf.length; p++, j += 4) d[j] = mf[p] > 0.5 ? 255 : Math.round(mf[p] * mf[p] * 255);
        m.putImageData(img, 0, 0);
      }
      res.close?.();
    } catch { /* skip frame */ }
    return this.maskCanvas;
  }

  private draw() {
    const c = this.wctx, W = this.work.width, H = this.work.height;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (this.mode === 'front') coverDraw(c, this.frontEl, 0, 0, W, H);
    else if (this.mode === 'rear') coverDraw(c, this.rearEl, 0, 0, W, H);
    else if (this.mode === 'both') { coverDraw(c, this.rearEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-pip') { coverDraw(c, this.screenEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-mask') {
      coverDraw(c, this.screenEl, 0, 0, W, H);
      const person = this.seg ? this.renderMaskedPerson() : null;
      if (person && person.width) this.drawMaskedCorner(person); else this.drawPip(this.frontEl);
    }
    else if (this.mode === 'vtuber') {
      const src = this.vtuber?.canvas;
      if (src && src.width) {
        const scale = Math.max(W / src.width, H / src.height);
        const sw = W / scale, sh = H / scale;
        c.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
      } else {
        c.fillStyle = '#0d0d14'; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.font = `${Math.round(W * 0.04)}px system-ui`;
        c.textAlign = 'center'; c.fillText(this.avatar ? 'Loading avatar…' : 'Add a character first', W / 2, H / 2);
        c.textAlign = 'left';
      }
    }
  }
  private pipRect() {
    const W = this.work.width, H = this.work.height;
    const pw = Math.round(W * (W > H ? 0.24 : 0.34)), ph = Math.round(pw * 4 / 3), pad = Math.round(W * 0.03);
    return { x: W - pw - pad, y: H - ph - pad, w: pw, h: ph };
  }
  private drawPip(el: HTMLVideoElement) {
    const c = this.wctx, { x, y, w, h } = this.pipRect(), r = Math.round(w * 0.09);
    c.save(); roundRectPath(c, x, y, w, h, r);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = '#000'; c.fill();
    c.shadowColor = 'transparent'; c.clip(); coverDraw(c, el, x, y, w, h); c.restore();
    c.save(); roundRectPath(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); c.restore();
  }
  private drawMaskedCorner(person: HTMLCanvasElement) {
    const c = this.wctx, W = this.work.width, H = this.work.height;
    const th = Math.round(H * 0.5), dw = Math.round(th * person.width / person.height);
    c.drawImage(person, W - dw - Math.round(W * 0.01), H - th, dw, th);
  }

  private present() {
    const o = this.octx, W = this.canvas.width, H = this.canvas.height;
    o.filter = LOOK_FILTERS[this.look] || 'none';
    o.drawImage(this.work, 0, 0, W, H);
    o.filter = 'none';
  }

  private loop = () => {
    try { this.draw(); this.present(); } catch { /* keep alive */ }
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.releaseVtuber();
    this.releaseFront(); this.releaseRear(); this.releaseScreen();
    this.out?.getTracks().forEach(t => t.stop()); this.out = null;
    try { this.seg?.close?.(); } catch { /* */ }
    this.seg = null;
  }
}
