// fabulaCgSource — Fabula CG inside Stage (Ambo).
//
//   FABULA_GRAPHIC   one CG graphic as a slide layer: its IN plays when the slide
//                    comes up, it holds (loops, tickers, clocks keep running) while
//                    the slide is live. Field edits repaint in place.
//   FABULA_CG_LIVE   the whole live CG program (the origin-wide playout that Fabula's
//                    Graphics workspace and TV Studio drive) mirrored as a layer, so
//                    every Stage output — audience, KEY, STREAM — carries what's on air.
//
// Both draw with the same evaluator + Canvas2D renderer as everywhere else, at the
// output's own size.
import type { LayerSource } from './layerSources';
import type { CgGraphicRef } from '../fabula/cg/cgTypes';
import { findCgGraphic } from '../fabula/cg/cgLibrary';
import { drawCgGraphic, ensureCgFonts } from '../fabula/cg/cgRender';
import { sharedPlayout } from '../fabula/cg/cgPlayout';
import { drawPlayout } from '../fabula/cg/cgOutput';

function canvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return { width: w, height: h, getContext: () => null } as unknown as HTMLCanvasElement;
}

export class FabulaGraphicSource implements LayerSource {
  readonly kind = 'FABULA_GRAPHIC';
  private c: HTMLCanvasElement;
  private start = Date.now();
  private ref: CgGraphicRef;
  private w: number; private h: number;
  constructor(content: { ref: CgGraphicRef }, w: number, h: number) {
    this.w = w; this.h = h;
    this.c = canvas(w, h); this.ref = content.ref;
    const g = findCgGraphic(this.ref); if (g) void ensureCgFonts(g);
  }
  update(content: { ref: CgGraphicRef }) { this.ref = content.ref; }
  frame() {
    const g = findCgGraphic(this.ref); if (!g) return null;
    const ctx = this.c.getContext('2d'); if (!ctx) return null;
    ctx.clearRect(0, 0, this.w, this.h);
    drawCgGraphic(ctx, g, (Date.now() - this.start) / 1000, Infinity, this.w, this.h, this.ref, { now: Date.now() });
    return this.c;
  }
  size() { return { w: this.w, h: this.h }; }
  ready() { return !!findCgGraphic(this.ref); }
  resize(w: number, h: number) { this.w = w; this.h = h; this.c.width = w; this.c.height = h; }
  dispose() { /* nothing pooled */ }
}

export class FabulaCgLiveSource implements LayerSource {
  readonly kind = 'FABULA_CG_LIVE';
  private c: HTMLCanvasElement;
  private w: number; private h: number;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.c = canvas(w, h); }
  frame() {
    const ctx = this.c.getContext('2d'); if (!ctx) return null;
    ctx.clearRect(0, 0, this.w, this.h);
    drawPlayout(ctx, sharedPlayout().state, this.w, this.h);
    return this.c;
  }
  size() { return { w: this.w, h: this.h }; }
  ready() { return true; }
  resize(w: number, h: number) { this.w = w; this.h = h; this.c.width = w; this.c.height = h; }
  dispose() { /* */ }
}
