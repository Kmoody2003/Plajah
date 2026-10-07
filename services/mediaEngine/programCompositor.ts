// mediaEngine/programCompositor.ts — the PROGRAM picture, as real pixels.
//
// Draws the program source, the incoming (preview) source during a transition, and any
// overlay layers (scoreboard, bugs, lower thirds) into one canvas, and exposes that canvas
// as a MediaStream. Everything downstream — the program monitor, recording, going live,
// WHIP — consumes this one stream, so what the operator sees is exactly what goes out.
//
// Shared by the Control Room (MediaEngine switcher) and the Sports Director (Smart Director),
// which feed it different sources but the same transition model.

import type { TransitionType } from './types';
import { createFrameClock, FrameClock } from './frameClock';
import { acquireStreamVideo, releaseStreamVideo, peekStreamVideo, hasFrame } from './streamVideo';

/** Something drawn over the program picture every frame. */
export interface OverlayLayer {
  id: string;
  /** Higher draws later (on top). Default 0. */
  z?: number;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void;
}

export interface CompositorFrame {
  program: MediaStream | null;
  preview: MediaStream | null;
  transition: { type: TransitionType; position: number };
  /** 0..1 fade-to-black over everything (including overlays). */
  fadeToBlack?: number;
}

export interface CompositorOptions { width?: number; height?: number; fps?: number }

/** Draw a video "contain"-fit into the frame (letterboxed on black). */
function drawContain(ctx: CanvasRenderingContext2D, el: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  const vw = el.videoWidth, vh = el.videoHeight;
  const s = Math.min(w / vw, h / vh);
  const dw = vw * s, dh = vh * s;
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * The transition maths, kept pure so the native host and tests can mirror it exactly.
 * `drawOut` paints the outgoing (program) picture, `drawIn` the incoming one.
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  type: TransitionType, p: number,
  drawOut: () => void, drawIn: () => void,
) {
  if (p <= 0 || type === 'cut') { drawOut(); return; }
  if (p >= 1) { drawIn(); return; }
  switch (type) {
    case 'mix':
      drawOut();
      ctx.save(); ctx.globalAlpha = p; drawIn(); ctx.restore();
      return;
    case 'dip': {
      // Out → black over the first half, black → in over the second.
      if (p < 0.5) { drawOut(); ctx.fillStyle = `rgba(0,0,0,${p * 2})`; }
      else { drawIn(); ctx.fillStyle = `rgba(0,0,0,${(1 - p) * 2})`; }
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case 'wipe':
      drawOut();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * p, h); ctx.clip(); drawIn(); ctx.restore();
      return;
    case 'dve': {
      drawOut();
      // Incoming picture grows from the bottom-right corner.
      const sw = w * p, sh = h * p;
      ctx.save();
      ctx.translate(w - sw, h - sh);
      ctx.scale(p, p);
      drawIn();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.strokeRect(w - sw, h - sh, sw, sh);
      return;
    }
    default:
      drawOut();
  }
}

export class ProgramCompositor {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  private ctx: CanvasRenderingContext2D;
  private frame: CompositorFrame = { program: null, preview: null, transition: { type: 'cut', position: 0 } };
  private layers: OverlayLayer[] = [];
  private held = new Set<MediaStream>();
  private clock: FrameClock | null = null;
  private videoStream: MediaStream | null = null;

  constructor(opts: CompositorOptions = {}) {
    this.width = opts.width ?? 1280;
    this.height = opts.height ?? 720;
    this.fps = opts.fps ?? 30;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Update what is on program / preview and where the transition is. Cheap; call freely. */
  setFrame(next: Partial<CompositorFrame>) {
    this.frame = { ...this.frame, ...next };
    this.hold([this.frame.program, this.frame.preview]);
  }

  addLayer(layer: OverlayLayer) {
    this.layers = [...this.layers.filter(l => l.id !== layer.id), layer].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }
  removeLayer(id: string) { this.layers = this.layers.filter(l => l.id !== id); }
  hasLayer(id: string) { return this.layers.some(l => l.id === id); }

  start() {
    if (this.clock) return;
    this.clock = createFrameClock(this.fps, () => this.render());
  }

  stop() { this.clock?.stop(); this.clock = null; }

  /** The program picture as a live video track (one stream, shared by every consumer). */
  captureStream(): MediaStream {
    if (!this.videoStream) this.videoStream = this.canvas.captureStream(this.fps);
    return this.videoStream;
  }

  dispose() {
    this.stop();
    this.hold([]);
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.videoStream = null;
  }

  /** Keep hidden <video> decoders alive exactly for the streams currently in use. */
  private hold(streams: (MediaStream | null)[]) {
    const want = new Set(streams.filter((s): s is MediaStream => !!s));
    for (const s of this.held) if (!want.has(s)) { releaseStreamVideo(s); this.held.delete(s); }
    for (const s of want) if (!this.held.has(s)) { acquireStreamVideo(s); this.held.add(s); }
  }

  private paint(stream: MediaStream | null) {
    const { ctx, width: w, height: h } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!stream) return;
    const el = peekStreamVideo(stream);
    if (el && hasFrame(el)) drawContain(ctx, el, 0, 0, w, h);
  }

  private render() {
    const { ctx, width: w, height: h } = this;
    const { program, preview, transition, fadeToBlack } = this.frame;
    drawTransition(ctx, w, h, transition.type, transition.position,
      () => this.paint(program),
      () => this.paint(preview));
    const now = performance.now();
    for (const layer of this.layers) {
      ctx.save();
      try { layer.draw(ctx, w, h, now); } catch { /* a broken overlay never takes program down */ }
      ctx.restore();
    }
    if (fadeToBlack && fadeToBlack > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fadeToBlack)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // canvas.captureStream only emits a frame when the canvas changes; we repaint every tick,
    // but request one explicitly where supported so a static picture still flows.
    const track = this.videoStream?.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    track?.requestFrame?.();
  }
}
