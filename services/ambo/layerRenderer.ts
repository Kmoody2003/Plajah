// layerRenderer — draws a LiveStack onto a canvas, every frame.
//
// THE RULE THAT MAKES THE LAYER MODEL REAL: sources are reconciled, not
// rebuilt. When the stack changes, a layer whose content can be updated in
// place keeps its existing source — so a background video keeps playing at its
// current position while the slide above it changes, and a lyric change is a
// text repaint rather than a media restart. Rebuilding sources every frame
// would make the whole independent-layer design a lie.
//
// Canvas2D, deliberately: it composites anything drawImage accepts, which is
// what lets Pixels' GL generators, Fabula video, dotLottie and plain text share
// one stack. Individual sources use the GPU internally where it matters.

import { compositeOrder, type LayerSlot, type LiveStack, type MaskSpec, type TransformSpec } from './showModel';
import { canUpdateInPlace, createSource, type LayerSource } from './layerSources';
import type { LayerContent } from './showModel';

export interface RenderFrame { w: number; h: number; }

interface Entry {
  source: LayerSource;
  content: LayerContent;
}

export interface RendererOptions {
  /** Transparent background for a switcher key. Otherwise the frame is black. */
  alpha?: boolean;
  /** Applied after the whole stack — per-output warp / opacity. */
  outputTransform?: TransformSpec;
  outputMask?: MaskSpec;
  timers?: Record<string, number>;
  /**
   * Whether THIS renderer plays audio. True in the studio, false in output
   * windows — otherwise every projector plays its own copy of the same bed and
   * the room hears a phased mess. Exactly one renderer should have it on.
   */
  audioEnabled?: boolean;
}

export class LayerRenderer {
  private entries = new Map<LayerSlot, Entry>();
  private raf = 0;
  private startedAt = 0;
  private stack: LiveStack = {};
  private opts: RendererOptions = {};
  private running = false;

  constructor(private canvas: HTMLCanvasElement, private frame: RenderFrame = { w: 1920, h: 1080 }) {
    canvas.width = frame.w;
    canvas.height = frame.h;
  }

  setOptions(o: RendererOptions) { this.opts = { ...this.opts, ...o }; }

  /**
   * Reconcile sources against a new stack. Returns the slots that were rebuilt,
   * which is useful in tests and for telling an operator what restarted.
   */
  setStack(stack: LiveStack): LayerSlot[] {
    const rebuilt: LayerSlot[] = [];
    const seen = new Set<LayerSlot>();

    for (const { slot, layer } of compositeOrder(stack)) {
      seen.add(slot);
      const existing = this.entries.get(slot);

      if (existing && canUpdateInPlace(existing.content, layer.content)) {
        // Same source, new content — a repaint, not a restart.
        const s: any = existing.source;
        if (typeof s.update === 'function') s.update(layer.content);
        existing.content = layer.content;
        continue;
      }

      this.retire(existing);
      const source = createSource(layer.content, this.frame, this.opts.timers, this.opts.audioEnabled);
      if (source) {
        this.entries.set(slot, { source, content: layer.content });
        rebuilt.push(slot);
      } else {
        this.entries.delete(slot);
      }
    }

    // Anything no longer in the stack is torn down — this is what stops a
    // cleared video from holding a decoder open for the rest of the service.
    for (const slot of [...this.entries.keys()]) {
      if (!seen.has(slot)) {
        this.retire(this.entries.get(slot));
        this.entries.delete(slot);
      }
    }

    this.stack = stack;
    return rebuilt;
  }

  /**
   * Tear a source down. Audio fades rather than stopping dead — a bed that is
   * chopped mid-note is more noticeable to a room than almost any visual glitch.
   */
  private retire(entry: Entry | undefined) {
    if (!entry) return;
    const s: any = entry.source;
    if (entry.content.kind === 'AUDIO' && typeof s.fadeOutAndStop === 'function') {
      const secs = (entry.content as any).fadeOutSec ?? 0.6;
      s.fadeOutAndStop(secs);
      setTimeout(() => { try { s.dispose(); } catch { /* */ } }, secs * 1000 + 250);
      return;
    }
    entry.source.dispose();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.drawFrame((performance.now() - this.startedAt) / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    for (const e of this.entries.values()) e.source.dispose();
    this.entries.clear();
  }

  /** One frame. Exposed so an offline export can pump it deterministically. */
  drawFrame(timeSec: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = this.frame;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.opts.alpha) ctx.clearRect(0, 0, w, h);
    else { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h); }

    for (const { slot, layer } of compositeOrder(this.stack)) {
      const entry = this.entries.get(slot);
      if (!entry) continue;
      const img = entry.source.frame(timeSec);
      if (!img) continue;

      ctx.save();
      applyTransform(ctx, layer.transform, w, h);
      ctx.globalAlpha = layer.transform?.opacity ?? 1;
      if (layer.transform?.blend) ctx.globalCompositeOperation = layer.transform.blend as GlobalCompositeOperation;

      const natural = entry.source.size();
      drawCover(ctx, img, natural, w, h);

      if (layer.mask) applyMask(ctx, layer.mask, w, h);
      ctx.restore();
    }

    if (this.opts.outputMask) {
      ctx.save();
      applyMask(ctx, this.opts.outputMask, w, h);
      ctx.restore();
    }
  }

  /** The live canvas — captureStream() on this feeds NDI/WebRTC/recording. */
  get element() { return this.canvas; }
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function applyTransform(ctx: CanvasRenderingContext2D, t: TransformSpec | undefined, w: number, h: number) {
  if (!t) return;
  const r = t.rect;
  if (r) {
    ctx.beginPath();
    ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
    ctx.clip();
    ctx.translate(r.x * w, r.y * h);
    ctx.scale(r.w, r.h);
  }
  if (t.rotation) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
  }
  if (t.flipH || t.flipV) {
    ctx.translate(t.flipH ? w : 0, t.flipV ? h : 0);
    ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  }
}

/** Cover-fit, so a 4:3 loop fills a 16:9 screen without letterbox bars. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  natural: { w: number; h: number } | null,
  w: number,
  h: number,
) {
  if (!natural || !natural.w || !natural.h) { ctx.drawImage(img, 0, 0, w, h); return; }
  const scale = Math.max(w / natural.w, h / natural.h);
  const dw = natural.w * scale;
  const dh = natural.h * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Masking. `destination-in` keeps only what the mask covers, which is the
 * cheap correct way to matte in 2D — and it composes, so a slide mask and an
 * output mask both apply.
 */
function applyMask(ctx: CanvasRenderingContext2D, mask: MaskSpec, w: number, h: number) {
  ctx.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in';
  ctx.fillStyle = '#000';

  if (mask.kind === 'SHAPE') {
    ctx.beginPath();
    if (mask.shape === 'ellipse') {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (mask.shape === 'rounded') {
      const r = (mask.radius ?? 0.04) * Math.min(w, h);
      roundRect(ctx, 0, 0, w, h, r);
    } else {
      ctx.rect(0, 0, w, h);
    }
    ctx.fill();
  } else if (mask.points?.length) {
    ctx.beginPath();
    mask.points.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
