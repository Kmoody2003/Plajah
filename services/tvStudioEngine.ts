/**
 * Plajah TV Studio Engine
 *
 * Canvas-based broadcast compositor running in the browser.
 * Handles source management, transition rendering, audio mixing,
 * recording, and EDL export.
 *
 * Architecture:
 *  - One 1920×1080 program canvas (composited via rAF)
 *  - Sources: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
 *  - Audio: Web Audio API mixing graph (GainNode per source)
 *  - Recording: MediaRecorder on canvas.captureStream() + audio destination
 *  - EDL: CMX3600 + FCPXML event list built from cut events
 */

import { drawScriptureGraphic } from './scriptureGraphic';
import { publishAppOutput, onAppOutputStream } from './mediaEngine/bridge';
import { watchProductionFeeds } from './productionFeeds';
import { Compositor } from '../components/plajahPixels/engine/core/compositor';
import { parseCubeLut, type CubeLutData } from './fabula/cubeLut';

export type SourceType =
  | 'CAMERA' | 'SCREEN' | 'MEDIA' | 'GRAPHIC' | 'COLOR' | 'BARS' | 'BLACK';

export type TransitionType = 'CUT' | 'MIX' | 'DIP' | 'WIPE_LEFT' | 'WIPE_RIGHT' | 'WIPE_UP' | 'STING';

export interface StudioSource {
  id: string;
  type: SourceType;
  label: string;
  stream?: MediaStream;
  borrowed?: boolean;
  audioInputNode?: MediaStreamAudioSourceNode;
  videoEl?: HTMLVideoElement;
  imageEl?: HTMLImageElement;
  // Color source
  color?: string;
  // Audio
  gainNode?: GainNode;
  analyserNode?: AnalyserNode;
  audioLevel: number;     // 0–1
  faderGain?: number;
  isMuted: boolean;
  isSolo: boolean;
  // Color correction (applied per-source as CSS filter string on off-screen canvas)
  brightness: number;  // 0–2, default 1
  contrast: number;    // 0–2, default 1
  saturation: number;  // 0–2, default 1
  hue: number;         // -180 to 180, default 0
  // LUT
  lutData?: Float32Array; // 3D LUT 17x17x17 RGB
  cubeLut?: CubeLutData;
  colorProcessor?: { canvas: HTMLCanvasElement; compositor: Compositor };
  // State
  isReady: boolean;
  /** VTuber mode — when set, the avatar canvas is composited in place of the raw camera. */
  vtuberProcessor?: { canvas: HTMLCanvasElement; setMode: (m: string) => void; setAvatar: (url: string) => Promise<boolean>; dispose: () => void };
}

export interface GraphicOverlay {
  id: string;
  label: string;
  type: 'LOWER_THIRD' | 'FULLSCREEN' | 'BUG' | 'CLOCK' | 'LOTTIE' | 'WEBM' | 'SCRIPTURE' | 'TELA';
  canvasEl?: HTMLCanvasElement;
  // Lower third
  title?: string;
  subtitle?: string;
  style?: 'MODERN' | 'CLASSIC' | 'MINIMAL';
  // Scripture (Ambo). Lines are pre-split by amboService so the renderer never
  // has to decide where a verse breaks — see splitForScreen.
  lines?: string[];
  reference?: string;
  /** Attribution some translations require on screen. Rendered when present. */
  copyright?: string;
  scriptureVariant?: 'LOWER_THIRD' | 'FULLSCREEN';
  // Image/video overlay
  url?: string;
  videoEl?: HTMLVideoElement;
  // Position
  x?: number; y?: number; width?: number; height?: number;
  visible: boolean;
  opacity: number;     // 0–1
  animState?: 'IN' | 'HOLD' | 'OUT';
}

export interface EdlEvent {
  eventNum: number;
  reel: string;         // source label
  track: 'V' | 'A' | 'VA';
  editType: 'C' | 'D' | 'W'; // Cut, Dissolve, Wipe
  duration?: number;    // frames (for dissolve)
  srcIn: number;        // ms
  srcOut: number;
  recIn: number;
  recOut: number;
  clipName: string;
  transitionType?: string;
}

export interface StudioProject {
  id: string;
  title: string;
  resolution: '1920x1080' | '1280x720' | '3840x2160';
  frameRate: 25 | 29.97 | 30 | 50 | 59.94 | 60;
  outputMode: 'LIVE' | 'RECORD' | 'BOTH';
  createdAt: number;
}

// ── Engine class ──────────────────────────────────────────────────────────────

export class TVStudioEngine {
  private productionFeedsUnsub?: () => void;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offA: OffscreenCanvas;
  private offCtxA: OffscreenCanvasRenderingContext2D;
  private offB: OffscreenCanvas;
  private offCtxB: OffscreenCanvasRenderingContext2D;

  private sources: Map<string, StudioSource> = new Map();
  private programId: string | null = null;
  private previewId: string | null = null;
  private overlays: GraphicOverlay[] = [];

  private audioCtx: AudioContext;
  private masterGain: GainNode;
  private masterAnalyser: AnalyserNode;
  private recDestination: MediaStreamAudioDestinationNode;

  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStart: number = 0;

  private edlEvents: EdlEvent[] = [];
  private edlEventNum = 1;
  private programSwitchedAt: number = 0;

  private transition: {
    active: boolean;
    type: TransitionType;
    durationMs: number;
    startedAt: number;
    fromId: string | null;
    toId: string | null;
    tBarManual: boolean;
    tBarProgress: number;  // 0–1
  } = {
    active: false, type: 'MIX', durationMs: 500,
    startedAt: 0, fromId: null, toId: null,
    tBarManual: false, tBarProgress: 0,
  };

  private frameHandle: number = 0;
  private running = false;
  private ftbActive = false;
  private ftbProgress = 0; // 0=full, 1=black

  private midiAccess: any = null; // MIDIAccess — typed as any; @types/webmidi not installed
  private onMidiCallback?: (cc: number, value: number, channel: number) => void;

  private amboAudienceUnsub?: () => void;
  private amboLowerThirdUnsub?: () => void;
  private programStream?: MediaStream;

  onSourcesChanged?: () => void;
  onOverlaysChanged?: () => void;
  onProgramChanged?: (id: string | null) => void;
  onPreviewChanged?: (id: string | null) => void;
  onTransitionProgress?: (progress: number) => void;
  onMasterLevel?: (level: number) => void;
  onSourceLevel?: (id: string, level: number) => void;

  // ── Init ──────────────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    canvas.width = 1920; canvas.height = 1080;

    this.offA = new OffscreenCanvas(1920, 1080);
    this.offCtxA = this.offA.getContext('2d')!;
    this.offB = new OffscreenCanvas(1920, 1080);
    this.offCtxB = this.offB.getContext('2d')!;

    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 1;
    this.masterAnalyser = this.audioCtx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.audioCtx.destination);
    this.recDestination = this.audioCtx.createMediaStreamDestination();
    this.masterGain.connect(this.recDestination);

    // Add default sources
    this._addColorSource('black', 'Black', '#000000');
    this._addColorSource('bars', 'Color Bars', 'BARS');

    // Subscribe to platform media bus for native Ambo feeds
    this.listenToAmboFeeds();
  }

  // ── Source management ─────────────────────────────────────────────────────

  private _makeSource(id: string, type: SourceType, label: string): StudioSource {
    const gainNode = this.audioCtx.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(this.masterGain);
    const analyserNode = this.audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    gainNode.connect(analyserNode);
    return {
      id, type, label, gainNode, analyserNode,
      audioLevel: 0, isMuted: false, isSolo: false,
      brightness: 1, contrast: 1, saturation: 1, hue: 0,
      isReady: false,
    };
  }

  private _addColorSource(id: string, label: string, color: string) {
    const src = this._makeSource(id, color === 'BARS' ? 'BARS' : 'COLOR', label);
    src.color = color; src.isReady = true;
    this.sources.set(id, src);
  }

  /** Listen to native Ambo outputs published over the virtual video bus */
  listenToAmboFeeds(): void {
    this.productionFeedsUnsub?.();
    let productionIds = new Set<string>();
    this.productionFeedsUnsub = watchProductionFeeds(feeds => {
      const current = new Set(feeds.map(feed => feed.id));
      for (const id of productionIds) if (!current.has(id)) this.removeSource(id);
      for (const feed of feeds) {
        const fresh = !this.sources.has(feed.id);
        this.addStreamSourceWithId(feed.id, feed.stream, feed.label);
        if (fresh && feed.kind === 'chat' && !feed.id.endsWith(':group')) this.muteSource(feed.id, true);
      }
      productionIds = current;
    });
    this.amboAudienceUnsub?.();
    this.amboAudienceUnsub = onAppOutputStream('ambo:audience', (stream) => {
      this.addStreamSourceWithId('ambo_audience', stream, 'Ambo Audience');
    });

    this.amboLowerThirdUnsub?.();
    this.amboLowerThirdUnsub = onAppOutputStream('ambo:lower_third', (stream) => {
      this.addStreamSourceWithId('ambo_lower_third', stream, 'Ambo Lower Third');
    });
  }

  async addCameraSource(deviceId?: string): Promise<StudioSource | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: 1920, height: 1080 } : { width: 1920, height: 1080 },
        audio: true,
      });
      const id = `cam_${Date.now()}`;
      const src = this._makeSource(id, 'CAMERA', `Camera ${[...this.sources.values()].filter(s => s.type === 'CAMERA').length + 1}`);
      src.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream; video.autoplay = true; video.muted = true;
      video.onloadeddata = () => { src.isReady = true; this.onSourcesChanged?.(); };
      src.videoEl = video;
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const msSrc = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
        msSrc.connect(src.gainNode!);
      }
      this.sources.set(id, src);
      this.onSourcesChanged?.();
      return src;
    } catch { return null; }
  }

  /** Add or update a stream source with an explicit ID */
  addStreamSourceWithId(id: string, stream: MediaStream, label: string): StudioSource {
    let src = this.sources.get(id);
    if (src?.stream === stream) { src.label = label; return src; }
    if (!src) {
      src = this._makeSource(id, 'MEDIA', label);
      this.sources.set(id, src);
    } else {
      src.label = label;
    }
    src.audioInputNode?.disconnect();
    src.audioInputNode = undefined;
    src.borrowed = true;
    src.stream = stream;
    if (!src.videoEl) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      src.videoEl = video;
    }
    src.videoEl.srcObject = stream;
    src.videoEl.onloadeddata = () => { src!.isReady = true; this.onSourcesChanged?.(); };
    src.videoEl.play?.().catch(() => {});
    src.isReady = true;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack && src.gainNode) {
      try {
        const msSrc = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
        msSrc.connect(src.gainNode);
        src.audioInputNode = msSrc;
      } catch { /* ignored */ }
    }
    this.onSourcesChanged?.();
    return src;
  }

  /** Add a source from an existing MediaStream — e.g. a REMOTE campus program feed
   *  pulled over the platform (multi-site master control). */
  addStreamSource(stream: MediaStream, label: string): StudioSource {
    return this.addStreamSourceWithId(`feed_${Date.now()}`, stream, label);
  }

  async addScreenSource(): Promise<StudioSource | null> {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { cursor: 'always' }, audio: true });
      const id = `screen_${Date.now()}`;
      const src = this._makeSource(id, 'SCREEN', `Screen ${[...this.sources.values()].filter(s => s.type === 'SCREEN').length + 1}`);
      src.stream = stream;
      const video = document.createElement('video');
      video.srcObject = stream; video.autoplay = true; video.muted = true;
      video.onloadeddata = () => { src.isReady = true; this.onSourcesChanged?.(); };
      src.videoEl = video;
      this.sources.set(id, src);
      this.onSourcesChanged?.();
      return src;
    } catch { return null; }
  }

  async addMediaSource(url: string, label: string): Promise<StudioSource> {
    const id = `media_${Date.now()}`;
    const src = this._makeSource(id, 'MEDIA', label);
    const video = document.createElement('video');
    video.src = url; video.loop = true; video.muted = true;
    video.onloadeddata = () => { src.isReady = true; this.onSourcesChanged?.(); };
    src.videoEl = video;
    this.sources.set(id, src);
    this.onSourcesChanged?.();
    return src;
  }

  addGraphicSource(imageUrl: string, label: string): StudioSource {
    const id = `gfx_${Date.now()}`;
    const src = this._makeSource(id, 'GRAPHIC', label);
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => { src.isReady = true; this.onSourcesChanged?.(); };
    src.imageEl = img;
    this.sources.set(id, src);
    return src;
  }

  removeSource(id: string) {
    const src = this.sources.get(id);
    if (!src) return;
    if (!src.borrowed) src.stream?.getTracks().forEach(t => t.stop());
    src.audioInputNode?.disconnect();
    if (src.videoEl) { src.videoEl.pause(); src.videoEl.srcObject = null; }
    src.colorProcessor?.compositor.dispose();
    src.gainNode?.disconnect();
    this.sources.delete(id);
    if (this.programId === id) { this.programId = null; this.onProgramChanged?.(null); }
    if (this.previewId === id) { this.previewId = null; this.onPreviewChanged?.(null); }
    this.onSourcesChanged?.();
  }

  getSources(): StudioSource[] { return [...this.sources.values()]; }
  getProgramId() { return this.programId; }
  getPreviewId() { return this.previewId; }

  setPreview(id: string) {
    this.previewId = id;
    this.onPreviewChanged?.(id);
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  cut() {
    if (this.previewId === null) return;
    this._recordEdlCut('C');
    this.programId = this.previewId;
    this.onProgramChanged?.(this.programId);
    this.programSwitchedAt = Date.now();
  }

  setTransitionType(t: TransitionType) { this.transition.type = t; }
  setTransitionDuration(ms: number) { this.transition.durationMs = ms; }

  auto() {
    if (this.previewId === null || this.transition.active) return;
    this._recordEdlCut(this.transition.type === 'CUT' ? 'C' : 'D');
    this.transition = {
      ...this.transition,
      active: true,
      startedAt: Date.now(),
      fromId: this.programId,
      toId: this.previewId,
      tBarManual: false,
      tBarProgress: 0,
    };
  }

  setTBar(progress: number) {
    // Manual T-bar: 0=program, 1=preview
    if (!this.transition.active) {
      this.transition = {
        ...this.transition,
        active: true,
        fromId: this.programId,
        toId: this.previewId,
        tBarManual: true,
        tBarProgress: progress,
      };
    } else {
      this.transition.tBarProgress = progress;
    }
    if (progress >= 1) {
      this._completeTransition();
    }
  }

  private _completeTransition() {
    if (this.transition.toId) {
      this.programId = this.transition.toId;
      this.previewId = this.transition.fromId;
      this.onProgramChanged?.(this.programId);
      this.onPreviewChanged?.(this.previewId);
    }
    this.transition.active = false;
    this.transition.tBarProgress = 0;
    this.programSwitchedAt = Date.now();
    this.onTransitionProgress?.(0);
  }

  fadeToBlack() { this.ftbActive = !this.ftbActive; }

  // ── Compositor ────────────────────────────────────────────────────────────

  private _drawSource(ctx: OffscreenCanvasRenderingContext2D, src: StudioSource | null) {
    if (!src) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); return; }
    if (src.type === 'BLACK' || src.color === '#000000') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); return;
    }
    if (src.type === 'BARS') {
      this._drawColorBars(ctx); return;
    }
    if (src.type === 'COLOR') {
      ctx.fillStyle = src.color ?? '#888'; ctx.fillRect(0, 0, 1920, 1080); return;
    }
    // VTuber: when enabled on a camera source, the avatar canvas replaces the raw camera.
    if (src.vtuberProcessor?.canvas) {
      ctx.filter = `brightness(${src.brightness}) contrast(${src.contrast}) saturate(${src.saturation}) hue-rotate(${src.hue}deg)`;
      ctx.drawImage(src.vtuberProcessor.canvas, 0, 0, 1920, 1080);
      ctx.filter = 'none';
      return;
    }
    if (src.videoEl && src.isReady && src.videoEl.readyState >= 2) {
      if (src.cubeLut && src.colorProcessor && src.videoEl.readyState >= 2) {
        src.colorProcessor.compositor.render([{ element: src.videoEl, opacity: 1, blendMode: 'normal' }], undefined, undefined, src.cubeLut);
        ctx.filter = `brightness(${src.brightness}) contrast(${src.contrast}) saturate(${src.saturation}) hue-rotate(${src.hue}deg)`;
        ctx.drawImage(src.colorProcessor.canvas, 0, 0, 1920, 1080);
        ctx.filter = 'none';
        return;
      }
      // Apply basic color correction via CSS filter simulation on offscreen
      ctx.filter = `brightness(${src.brightness}) contrast(${src.contrast}) saturate(${src.saturation}) hue-rotate(${src.hue}deg)`;
      ctx.drawImage(src.videoEl, 0, 0, 1920, 1080);
      ctx.filter = 'none';
      return;
    }
    if (src.imageEl) {
      ctx.drawImage(src.imageEl, 0, 0, 1920, 1080);
      return;
    }
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 1920, 1080);
  }

  private _drawColorBars(ctx: OffscreenCanvasRenderingContext2D) {
    const bars = ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'];
    const w = 1920 / bars.length;
    bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w, 0, w, 810); });
    ctx.fillStyle = '#00008B'; ctx.fillRect(0, 810, 240, 270);
    ctx.fillStyle = '#fff';    ctx.fillRect(240, 810, 240, 270);
    ctx.fillStyle = '#2B00C8'; ctx.fillRect(480, 810, 240, 270);
    ctx.fillStyle = '#000';    ctx.fillRect(720, 810, 720, 270);
    ctx.fillStyle = '#0D0D0D'; ctx.fillRect(1440, 810, 240, 270);
    ctx.fillStyle = '#fff';    ctx.fillRect(1680, 810, 240, 270);
  }

  private _drawOverlays(ctx: CanvasRenderingContext2D) {
    for (const ov of this.overlays) {
      if (!ov.visible) continue;
      ctx.save();
      ctx.globalAlpha = ov.opacity;
      if (ov.type === 'LOWER_THIRD') {
        this._drawLowerThird(ctx, ov);
      } else if (ov.type === 'TELA' && ov.canvasEl) {
        ctx.drawImage(ov.canvasEl, 0, 0, 1920, 1080);
      } else if (ov.type === 'SCRIPTURE') {
        this._drawScripture(ctx, ov);
      } else if ((ov.type === 'WEBM' || ov.type === 'FULLSCREEN') && ov.videoEl) {
        const x = (ov.x ?? 0) * 1920 / 100;
        const y = (ov.y ?? 0) * 1080 / 100;
        const w = (ov.width ?? 100) * 1920 / 100;
        const h = (ov.height ?? 100) * 1080 / 100;
        ctx.drawImage(ov.videoEl, x, y, w, h);
      } else if (ov.type === 'CLOCK') {
        this._drawClock(ctx);
      }
      ctx.restore();
    }
  }

  private _drawLowerThird(ctx: CanvasRenderingContext2D, ov: GraphicOverlay) {
    const y = 850;
    const padX = 80;
    const barH = 180;
    // Background bar
    ctx.fillStyle = 'rgba(107,0,153,0.85)';
    ctx.beginPath();
    ctx.roundRect(padX, y, 1200, barH, 8);
    ctx.fill();
    // Accent bar
    ctx.fillStyle = '#D40055';
    ctx.fillRect(padX, y, 8, barH);
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.fillText(ov.title ?? '', padX + 28, y + 72);
    // Subtitle
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillText(ov.subtitle ?? '', padX + 28, y + 140);
  }

  /** Delegates to the shared renderer so program out and Ambo preview match exactly. */
  private _drawScripture(ctx: CanvasRenderingContext2D, ov: GraphicOverlay) {
    drawScriptureGraphic(ctx, {
      lines: ov.lines ?? [],
      reference: ov.reference ?? '',
      variant: ov.scriptureVariant ?? 'LOWER_THIRD',
      copyright: ov.copyright,
    });
  }

  private _drawClock(ctx: CanvasRenderingContext2D) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(1720, 20, 180, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px monospace';
    ctx.fillText(time, 1728, 64);
  }

  private _frame = () => {
    if (!this.running) return;

    const now = Date.now();
    let alpha = 0; // 0=program, 1=preview in transition

    if (this.transition.active) {
      if (this.transition.tBarManual) {
        alpha = this.transition.tBarProgress;
      } else {
        const elapsed = now - this.transition.startedAt;
        alpha = Math.min(elapsed / this.transition.durationMs, 1);
        this.onTransitionProgress?.(alpha);
        if (alpha >= 1) this._completeTransition();
      }
    }

    const programSrc = this.programId ? this.sources.get(this.programId) ?? null : null;
    const previewSrc = (this.transition.active && this.transition.toId)
      ? this.sources.get(this.transition.toId) ?? null
      : null;

    // Draw program into offA
    this._drawSource(this.offCtxA, programSrc);

    if (this.transition.active && previewSrc && alpha > 0) {
      const transType = this.transition.type;
      if (transType === 'MIX') {
        // Dissolve: draw preview into offB, alpha blend onto offA
        this._drawSource(this.offCtxB, previewSrc);
        this.offCtxA.globalAlpha = alpha;
        this.offCtxA.drawImage(this.offB, 0, 0);
        this.offCtxA.globalAlpha = 1;
      } else if (transType === 'WIPE_LEFT') {
        this._drawSource(this.offCtxB, previewSrc);
        this.offCtxA.drawImage(this.offB, 0, 0, Math.round(1920 * alpha), 1080, 0, 0, Math.round(1920 * alpha), 1080);
      } else if (transType === 'WIPE_RIGHT') {
        this._drawSource(this.offCtxB, previewSrc);
        const x = Math.round(1920 * (1 - alpha));
        this.offCtxA.drawImage(this.offB, x, 0, 1920 - x, 1080, x, 0, 1920 - x, 1080);
      } else if (transType === 'DIP') {
        if (alpha < 0.5) {
          this.offCtxA.fillStyle = '#000'; this.offCtxA.globalAlpha = alpha * 2;
          this.offCtxA.fillRect(0, 0, 1920, 1080); this.offCtxA.globalAlpha = 1;
        } else {
          this._drawSource(this.offCtxA, previewSrc);
          this.offCtxA.fillStyle = '#000'; this.offCtxA.globalAlpha = (1 - alpha) * 2;
          this.offCtxA.fillRect(0, 0, 1920, 1080); this.offCtxA.globalAlpha = 1;
        }
      } else if (transType === 'WIPE_UP') {
        // Preview rises in from the bottom edge, covering more of the frame as alpha → 1.
        this._drawSource(this.offCtxB, previewSrc);
        const h = Math.round(1080 * alpha);
        if (h > 0) this.offCtxA.drawImage(this.offB, 0, 1080 - h, 1920, h, 0, 1080 - h, 1920, h);
      } else if (transType === 'STING') {
        // Branded stinger: an accent panel sweeps in from center to cover the cut, the source
        // switches under the cover at the midpoint, then the panel sweeps back out to reveal the
        // incoming source. Self-contained — no stinger asset required.
        if (alpha >= 0.5) this._drawSource(this.offCtxA, previewSrc);
        const cover = alpha < 0.5 ? alpha * 2 : (1 - alpha) * 2; // 0 → 1 → 0
        const w = Math.round(1920 * cover);
        if (w > 0) {
          const x = Math.round((1920 - w) / 2);
          const g = this.offCtxA.createLinearGradient(x, 0, x + w, 0);
          g.addColorStop(0, '#ff6a00'); g.addColorStop(0.5, '#ff8c00'); g.addColorStop(1, '#d40055');
          this.offCtxA.fillStyle = g;
          this.offCtxA.fillRect(x, 0, w, 1080);
        }
      }
    }

    // Composite to main canvas
    this.ctx.clearRect(0, 0, 1920, 1080);
    this.ctx.drawImage(this.offA, 0, 0);

    // Draw overlays on top
    this._drawOverlays(this.ctx);

    // Fade to black
    if (this.ftbActive || this.ftbProgress > 0) {
      this.ftbProgress = this.ftbActive
        ? Math.min(this.ftbProgress + 0.05, 1)
        : Math.max(this.ftbProgress - 0.05, 0);
      this.ctx.fillStyle = `rgba(0,0,0,${this.ftbProgress})`;
      this.ctx.fillRect(0, 0, 1920, 1080);
    }

    // Audio meters (sample master analyser)
    const masterData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(masterData);
    const masterLevel = masterData.reduce((s, v) => s + v, 0) / masterData.length / 255;
    this.onMasterLevel?.(masterLevel);

    this.frameHandle = requestAnimationFrame(this._frame);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.frameHandle = requestAnimationFrame(this._frame);

    // Publish program output to platform virtual video bus
    try {
      if (!this.programStream) {
        this.programStream = this.getProgramStream();
      }
      publishAppOutput('switcher:pgm', this.programStream, 'Switcher Program (PGM)');
    } catch { /* ignored */ }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  startRecording(mimeType = 'video/webm;codecs=vp9,opus') {
    const videoStream = this.canvas.captureStream(30);
    const audioStream = this.recDestination.stream;
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);
    const supported = MediaRecorder.isTypeSupported(mimeType)
      ? mimeType : 'video/webm';
    this.recorder = new MediaRecorder(combined, { mimeType: supported, videoBitsPerSecond: 8_000_000 });
    this.recordedChunks = [];
    this.recordingStart = Date.now();
    this.recorder.ondataavailable = e => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
    this.recorder.start(1000);
  }

  stopRecording(): Blob | null {
    if (!this.recorder) return null;
    this.recorder.stop();
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    this.recorder = null;
    return blob;
  }

  isRecording() { return this.recorder?.state === 'recording'; }

  // ── EDL tracking ──────────────────────────────────────────────────────────

  private _msToTimecode(ms: number, fps: number): string {
    const total = Math.floor(ms / 1000 * fps);
    const f = total % fps;
    const s = Math.floor(total / fps) % 60;
    const m = Math.floor(total / fps / 60) % 60;
    const h = Math.floor(total / fps / 3600);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
  }

  private _recordEdlCut(editType: 'C' | 'D' | 'W') {
    if (!this.programId) return;
    const now = Date.now() - (this.recordingStart || Date.now());
    const src = this.sources.get(this.programId);
    const prevEndMs = this.edlEvents.length > 0 ? this.edlEvents[this.edlEvents.length - 1].recOut : 0;
    this.edlEvents.push({
      eventNum: this.edlEventNum++,
      reel: 'AX',
      track: 'V',
      editType,
      srcIn: 0,
      srcOut: now - prevEndMs,
      recIn: prevEndMs,
      recOut: now,
      clipName: src?.label ?? 'Unknown',
      transitionType: this.transition.type,
    });
  }

  exportEDL(title: string, fps: number = 30): string {
    let edl = `TITLE: ${title}\nFCM: NON-DROP FRAME\n\n`;
    for (const ev of this.edlEvents) {
      const srcIn  = this._msToTimecode(ev.srcIn, fps);
      const srcOut = this._msToTimecode(ev.srcOut, fps);
      const recIn  = this._msToTimecode(ev.recIn, fps);
      const recOut = this._msToTimecode(ev.recOut, fps);
      edl += `${String(ev.eventNum).padStart(3,'0')}  ${ev.reel.padEnd(8)}`;
      edl += ` ${ev.track.padEnd(5)} `;
      edl += `${ev.editType.padEnd(4)} `;
      if (ev.editType !== 'C') edl += `${String(ev.duration ?? 0).padStart(3,'0')} `;
      edl += ` ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
      edl += `* FROM CLIP NAME: ${ev.clipName}\n\n`;
    }
    return edl;
  }

  exportFCPXML(title: string, fps: number = 30): string {
    const frameRate = `${fps}/1`;
    const events = this.edlEvents.map((ev, i) => {
      const start = Math.round(ev.recIn / 1000 * fps);
      const dur   = Math.round((ev.recOut - ev.recIn) / 1000 * fps);
      return `    <clip name="${ev.clipName}" start="${start}/${fps}" duration="${dur}/${fps}" tcStart="0/1" tcFormat="NDF">
      <video><filter/></video>
    </clip>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1080p${fps}" frameDuration="1/${fps}s" width="1920" height="1080"/>
  </resources>
  <library>
    <event name="${title}">
      <project name="${title}">
        <sequence format="r1" duration="${this.edlEvents.length > 0 ? Math.round(this.edlEvents[this.edlEvents.length - 1].recOut / 1000 * fps) : 0}/${fps}">
          <spine>
${events}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
  }

  // ── Overlays ──────────────────────────────────────────────────────────────

  addOverlay(ov: GraphicOverlay) { this.overlays.push(ov); this.onOverlaysChanged?.(); }
  removeOverlay(id: string) { this.overlays = this.overlays.filter(o => o.id !== id); this.onOverlaysChanged?.(); }

  setOverlayVisible(id: string, visible: boolean) {
    const ov = this.overlays.find(o => o.id === id);
    if (ov) { ov.visible = visible; this.onOverlaysChanged?.(); }
  }

  updateOverlay(id: string, patch: Partial<GraphicOverlay>) {
    const i = this.overlays.findIndex(o => o.id === id);
    if (i !== -1) { this.overlays[i] = { ...this.overlays[i], ...patch }; this.onOverlaysChanged?.(); }
  }

  getOverlays(): GraphicOverlay[] { return [...this.overlays]; }

  // ── Color correction ──────────────────────────────────────────────────────

  setSourceCC(id: string, brightness: number, contrast: number, saturation: number, hue: number) {
    const src = this.sources.get(id);
    if (src) { src.brightness = brightness; src.contrast = contrast; src.saturation = saturation; src.hue = hue; }
  }
  /** Same .cube parser and GPU LUT pass as Fabula preview/export. */
  setSourceLut(id: string, text: string | null, name = 'Live LUT'): void {
    const source = this.sources.get(id);
    if (!source) throw new Error('Select a source before importing a LUT.');
    if (!text) { source.cubeLut = undefined; source.colorProcessor?.compositor.dispose(); source.colorProcessor = undefined; return; }
    const lut = parseCubeLut(text, name);
    if (!source.colorProcessor) {
      const canvas = document.createElement('canvas');
      const compositor = new Compositor(canvas);
      compositor.resize(1920, 1080);
      source.colorProcessor = { canvas, compositor };
    }
    source.cubeLut = lut;
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  setSourceGain(id: string, gain: number) {
    const src = this.sources.get(id);
    if (src?.gainNode && Number.isFinite(gain)) {
      src.faderGain = Math.max(0, Math.min(2, gain));
      src.gainNode.gain.value = src.isMuted ? 0 : src.faderGain;
    }
  }

  setMasterGain(gain: number) { this.masterGain.gain.value = Math.max(0, Math.min(2, gain)); }

  muteSource(id: string, muted: boolean) {
    const src = this.sources.get(id);
    if (!src) return;
    src.isMuted = muted;
    if (src.gainNode) src.gainNode.gain.value = muted ? 0 : (src.faderGain ?? 1);
  }

  getSourceLevel(id: string): number {
    const src = this.sources.get(id);
    if (!src?.analyserNode) return 0;
    const data = new Uint8Array(src.analyserNode.frequencyBinCount);
    src.analyserNode.getByteFrequencyData(data);
    return data.reduce((s, v) => s + v, 0) / data.length / 255;
  }

  // ── MIDI ──────────────────────────────────────────────────────────────────

  async initMIDI(cb: (cc: number, value: number, channel: number) => void): Promise<boolean> {
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess();
      this.onMidiCallback = cb;
      this.midiAccess.inputs.forEach((input: any) => {
        input.onmidimessage = (msg: any) => {
          const [status, data1, data2] = msg.data;
          const channel = (status & 0x0F) + 1;
          const type = status & 0xF0;
          if (type === 0xB0) cb(data1, data2, channel); // CC
          if (type === 0x90) cb(-data1, data2, channel); // Note On (negative = note)
        };
      });
      return true;
    } catch { return false; }
  }

  // ── Program output stream (for Mux/WebRTC) ────────────────────────────────

  getProgramStream(fps = 30): MediaStream {
    const videoStream = this.canvas.captureStream(fps);
    const audioStream = this.recDestination.stream;
    return new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);
  }

  // ── VTuber: turn a camera source into an avatar (camera-only, no equipment) ──────
  async enableVTuber(sourceId: string, avatarUrl: string, mode = 'AVATAR_ONLY'): Promise<boolean> {
    const src = this.sources.get(sourceId);
    if (!src || !src.stream) return false;
    if (src.vtuberProcessor) src.vtuberProcessor.dispose();
    const { createVTuberStream } = await import('./vtuber/vtuberEngine'); // lazy — keeps three out of the base bundle
    const handle = await createVTuberStream(src.stream, { avatarUrl, mode: mode as any, width: 1920, height: 1080 });
    src.vtuberProcessor = { canvas: handle.canvas, setMode: (m) => handle.setMode(m as any), setAvatar: handle.setAvatar, dispose: handle.dispose };
    this.onSourcesChanged?.();
    return true;
  }
  disableVTuber(sourceId: string): void {
    const src = this.sources.get(sourceId);
    if (src?.vtuberProcessor) { src.vtuberProcessor.dispose(); src.vtuberProcessor = undefined; this.onSourcesChanged?.(); }
  }

  // ── Aux Buses ─────────────────────────────────────────────────────────────
  // Each aux bus is an independent canvas + captureStream output. Useful for
  // multi-destination streaming (record ISO, send to secondary display, etc.)

  private auxBuses: Map<string, { label: string; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; sourceId: string | null; rafHandle: number }> = new Map();
  onAuxBusesChanged?: () => void;

  createAuxBus(id: string, label: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const bus = this.auxBuses.get(id);
      if (!bus) return;
      const src = bus.sourceId ? this.sources.get(bus.sourceId) ?? null : null;
      if (!src) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); }
      else if (src.videoEl && src.isReady) { ctx.drawImage(src.videoEl, 0, 0, 1920, 1080); }
      else if (src.color) { ctx.fillStyle = src.color; ctx.fillRect(0, 0, 1920, 1080); }
      bus.rafHandle = requestAnimationFrame(draw);
    };
    const rafHandle = requestAnimationFrame(draw);
    this.auxBuses.set(id, { label, canvas, ctx, sourceId: null, rafHandle });
    this.onAuxBusesChanged?.();
    try {
      const auxStream = canvas.captureStream(30);
      publishAppOutput(`switcher:${id.toLowerCase()}`, auxStream, `Switcher ${label}`);
    } catch { /* ignored */ }
  }

  removeAuxBus(id: string): void {
    const bus = this.auxBuses.get(id);
    if (bus) { cancelAnimationFrame(bus.rafHandle); this.auxBuses.delete(id); }
    this.onAuxBusesChanged?.();
  }

  setAuxBusSource(busId: string, sourceId: string | null): void {
    const bus = this.auxBuses.get(busId);
    if (bus) { bus.sourceId = sourceId; this.onAuxBusesChanged?.(); }
  }

  getAuxBusStream(busId: string, fps = 30): MediaStream | null {
    const bus = this.auxBuses.get(busId);
    if (!bus) return null;
    return bus.canvas.captureStream(fps);
  }

  getAuxBuses() { return [...this.auxBuses.entries()].map(([id, b]) => ({ id, label: b.label, sourceId: b.sourceId, canvas: b.canvas })); }

  // ── Audio Cues ─────────────────────────────────────────────────────────────
  // Instant-trigger audio cells — stingers, SFX, music jingles.

  private audioCueBuffers: Map<string, AudioBuffer> = new Map();
  private audioCueNodes:   Map<string, AudioBufferSourceNode> = new Map();
  onAudioCuePlaying?: (id: string, playing: boolean) => void;

  async loadAudioCue(id: string, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const decoded = await this.audioCtx.decodeAudioData(buf);
      this.audioCueBuffers.set(id, decoded);
    } catch (e) { console.warn('Audio cue load failed:', e); }
  }

  triggerAudioCue(id: string, gainDb = 1): void {
    this.stopAudioCue(id);
    const buffer = this.audioCueBuffers.get(id);
    if (!buffer) return;
    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    const gain = this.audioCtx.createGain();
    gain.gain.value = gainDb;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    src.onended = () => { this.audioCueNodes.delete(id); this.onAudioCuePlaying?.(id, false); };
    this.audioCueNodes.set(id, src);
    this.onAudioCuePlaying?.(id, true);
  }

  stopAudioCue(id: string): void {
    const node = this.audioCueNodes.get(id);
    if (node) { try { node.stop(); } catch {} this.audioCueNodes.delete(id); this.onAudioCuePlaying?.(id, false); }
  }

  isAudioCuePlaying(id: string): boolean { return this.audioCueNodes.has(id); }

  // ── Google Cast output ─────────────────────────────────────────────────────
  // Captures program output as a data URL and sends it to a Cast receiver.
  // Requires the Cast SDK to be loaded in the host page.

  getCastProgramDataUrl(): string {
    return this.canvas.toDataURL('image/jpeg', 0.7);
  }

  // ── NDI / OMT / SRT / AVB Broadcast & Hardware Transport ─────────────
  // Supports native low-latency LAN (OMT, NDI), reliable internet WAN (SRT),
  // and deterministic multi-channel network audio hardware (AVB/Milan).

  private ndiWs: WebSocket | null = null;
  private avbWs: WebSocket | null = null;
  private omtActive = false;
  private srtActive = false;
  private avbNativeActive = false;

  connectNDI(wsUrl: string): void {
    if (this.ndiWs) this.ndiWs.close();
    this.ndiWs = new WebSocket(wsUrl);
    this.ndiWs.onopen = () => console.log('[TVStudio] NDI bridge connected');
    this.ndiWs.onerror = e => console.warn('[TVStudio] NDI bridge error', e);
  }

  disconnectNDI(): void { this.ndiWs?.close(); this.ndiWs = null; }
  isNDIConnected(): boolean { return this.ndiWs?.readyState === WebSocket.OPEN; }

  async startNativeOmtBroadcast(streamName = 'Ambo Switcher PGM', port = 9998): Promise<boolean> {
    try {
      const { startOmtBroadcast } = await import('./mediaEngine/bridge');
      const res = await startOmtBroadcast({ streamId: 'ambo_pgm_omt', name: streamName, port, width: 1920, height: 1080, fps: 60, audioChannels: 8, hasAlpha: true });
      this.omtActive = !!res?.success;
      return this.omtActive;
    } catch { return false; }
  }

  async stopNativeOmtBroadcast(): Promise<void> {
    try {
      const { stopOmtBroadcast } = await import('./mediaEngine/bridge');
      await stopOmtBroadcast('ambo_pgm_omt');
      this.omtActive = false;
    } catch { /* */ }
  }
  isOMTConnected(): boolean { return this.omtActive; }

  async startNativeSrtStream(mode: 'listener' | 'caller' = 'listener', endpoint = '0.0.0.0:9000', latencyMs = 120, passphrase?: string): Promise<boolean> {
    try {
      const { startSrtListener, connectSrtCaller } = await import('./mediaEngine/bridge');
      if (mode === 'listener') {
        const port = parseInt(endpoint.split(':')[1] || '9000', 10);
        const res = await startSrtListener({ streamId: 'ambo_srt_feed', name: 'Ambo Program SRT', port, latencyMs, passphrase });
        this.srtActive = !!res?.success;
      } else {
        const [host, portStr] = endpoint.split(':');
        const res = await connectSrtCaller({ streamId: 'ambo_srt_feed', name: 'Ambo Program SRT', host: host || '127.0.0.1', port: parseInt(portStr || '9000', 10), latencyMs, passphrase });
        this.srtActive = !!res?.success;
      }
      return this.srtActive;
    } catch { return false; }
  }

  async stopNativeSrtStream(): Promise<void> {
    try {
      const { stopSrtStream } = await import('./mediaEngine/bridge');
      await stopSrtStream('ambo_srt_feed');
      this.srtActive = false;
    } catch { /* */ }
  }
  isSRTConnected(): boolean { return this.srtActive; }

  async connectAVB(wsUrlOrNative?: string): Promise<boolean> {
    try {
      const { configureAvbTalker, hasNativeEngine } = await import('./mediaEngine/bridge');
      if (hasNativeEngine()) {
        const res = await configureAvbTalker({ streamId: 'tvstudio_pgm_avb', name: 'TVStudio Master Out', channels: 8, sampleRate: 48000 });
        this.avbNativeActive = !!res?.success;
        return this.avbNativeActive;
      }
    } catch { /* */ }
    if (wsUrlOrNative && wsUrlOrNative.startsWith('ws')) {
      if (this.avbWs) this.avbWs.close();
      this.avbWs = new WebSocket(wsUrlOrNative);
      this.avbWs.onopen = () => console.log('[TVStudio] AVB bridge connected');
      return true;
    }
    return false;
  }

  async disconnectAVB(): Promise<void> {
    try {
      const { stopAvbStream } = await import('./mediaEngine/bridge');
      await stopAvbStream('tvstudio_pgm_avb');
    } catch { /* */ }
    this.avbWs?.close();
    this.avbWs = null;
    this.avbNativeActive = false;
  }
  isAVBConnected(): boolean { return this.avbNativeActive || this.avbWs?.readyState === WebSocket.OPEN; }

  destroy() {
    this.stop();
    this.recorder?.stop();
    this.amboAudienceUnsub?.();
    this.amboLowerThirdUnsub?.();
    this.productionFeedsUnsub?.();
    this.sources.forEach(src => {
      if (!src.borrowed) src.stream?.getTracks().forEach(t => t.stop());
      src.audioInputNode?.disconnect();
      src.colorProcessor?.compositor.dispose();
      if (src.videoEl) { src.videoEl.pause(); src.videoEl.srcObject = null; }
    });
    this.auxBuses.forEach(b => cancelAnimationFrame(b.rafHandle));
    this.audioCueNodes.forEach(n => { try { n.stop(); } catch {} });
    this.ndiWs?.close();
    this.avbWs?.close();
    this.audioCtx.close();
  }
}
