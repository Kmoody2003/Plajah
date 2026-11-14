// cgOutput — turn playout state into pixels for any host.
//
//   drawPlayout(ctx, state, W, H, now)      one frame (Router OverlayLayer.draw, export)
//   createCgOverlayCanvas(playout, opts)     a self-driving alpha canvas (TV Studio 'TELA'
//                                            overlay, Stage layer source, output windows)
//
// Key/fill: broadcast keyers want FILL (the graphic with alpha) and KEY (alpha
// as greyscale). mode 'key' renders the same frame and converts it.
import { drawCgFrameData, setCgImageReadyListener, ensureCgFonts, type Ctx2D } from './cgRender';
import { evaluateCg } from './cgEvaluate';
import { drawListAt, type CgPlayout, type CgPlayoutState } from './cgPlayout';
import { onAnyLiveData } from '../../liveData/liveDataHub';
import { onTrackerState } from '../../liveTracking/trackerHub';

export type CgOutputMode = 'fill' | 'key' | 'preview';

/** Draw every on-air graphic at `now`. Returns true if anything is animating (caller must keep ticking). */
export function drawPlayout(ctx: Ctx2D, state: CgPlayoutState, W: number, H: number, now = Date.now()): boolean {
  let animating = false;
  for (const d of drawListAt(state, now)) {
    const frame = evaluateCg(d.graphic, d.t, d.D, d.ref, { now });
    drawCgFrameData(ctx, frame, W, H);
    if (frame.animating || frame.phase !== 'hold' || d.ref.anchor) animating = true;
  }
  return animating;
}

function toKey(ctx: Ctx2D, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = d[i + 1] = d[i + 2] = a; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

export interface CgOverlayHandle {
  canvas: HTMLCanvasElement;
  /** Force a redraw on the next frame. */
  invalidate(): void;
  stop(): void;
}

/**
 * A canvas that redraws itself while graphics are moving and idles when the
 * frame is static (a held lower third costs nothing). Clocks and tickers keep
 * it ticking because they report animating.
 */
export function createCgOverlayCanvas(playout: CgPlayout, opts: { width?: number; height?: number; mode?: CgOutputMode; canvas?: HTMLCanvasElement; onFrame?: () => void } = {}): CgOverlayHandle {
  const canvas = opts.canvas || document.createElement('canvas');
  const W = opts.width || playout.state.format.w || 1920, H = opts.height || playout.state.format.h || 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
  let dirty = true, alive = true, raf = 0;
  const loop = () => {
    if (!alive) return;
    if (dirty) {
      ctx.clearRect(0, 0, W, H);
      const moving = drawPlayout(ctx, playout.state, W, H);
      if (opts.mode === 'key') toKey(ctx, W, H);
      dirty = moving;
      opts.onFrame?.();
    }
    raf = requestAnimationFrame(loop);
  };
  const unsub = playout.subscribe(() => {
    dirty = true;
    for (const a of playout.state.onAir) { const g = a.ref.inline; if (g) void ensureCgFonts(g); }
  });
  setCgImageReadyListener(() => { dirty = true; });
  // Live data rows and tracked subjects change without a playout commit — redraw on those too.
  const offData = onAnyLiveData(() => { dirty = true; });
  const offTrack = onTrackerState(() => { if (playout.state.onAir.some(a => a.ref.anchor)) dirty = true; });
  raf = requestAnimationFrame(loop);
  return {
    canvas,
    invalidate: () => { dirty = true; },
    stop: () => { alive = false; cancelAnimationFrame(raf); unsub(); offData(); offTrack(); },
  };
}

/** Router & Switcher (services/mediaEngine ProgramCompositor) overlay layer adapter. */
export function cgProgramLayer(playout: CgPlayout, z = 50) {
  return { id: 'fabula-cg', z, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => { drawPlayout(ctx, playout.state, w, h); } };
}
