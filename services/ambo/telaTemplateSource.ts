// telaTemplateSource — renders a TELA_TEMPLATE layer (an Ambo slide template
// designed with the Tela template kit) at the output's own size, animated.
//
// Every output window builds its own source at its own w×h, so a 9:16 lobby
// screen and a 32:9 LED wall each get a re-flowed design, not a scaled one.
//
//   entrance  starts at construction; staggered per role, styled by theme
//   steady    the static design is cached in two layers (behind / in front of
//             the moving ornaments); per frame we blit those and redraw only
//             the ornaments that drift/spin/pulse/sweep — cheap even at 4K
//   update()  same template + theme → the words re-enter over a short
//             crossfade; a different template/theme → full re-entrance
//   exit      beginExit() starts the theme's exit and returns its length (ms);
//             LayerRenderer keeps drawing us as a ghost until it ends
//
// frame() never throws: failures draw a clean labelled card.
import type { LayerContent } from './showModel';
import type { LayerSource } from './layerSources';
import type { SlideObj, SlideTheme } from './slideTemplates/types';
import { buildSlideObjects, templateById, resolveTheme } from './slideTemplates/registry';
import { disposeHost, type SlideHost } from './slideTemplates/live';
import {
  drawSlideObjects, drawFallbackCard, loadSlideFonts, onSlideImageLoad, prefersReducedMotion,
  slideTemplateTiming, invalidateSlideLayouts, type FrameClock,
} from './slideTemplates/canvasRender';

type TelaContent = Extract<LayerContent, { kind: 'TELA_TEMPLATE' }>;
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export class TelaTemplateSource implements LayerSource {
  readonly kind = 'TELA_TEMPLATE';
  private canvas: HTMLCanvasElement;
  private objs: SlideObj[] | null = null;
  private th: SlideTheme;
  private born = nowSec();
  private enterStart = nowSec();
  private enterFromGroup = 0;
  private exitStart = -1;
  private reduced = prefersReducedMotion();
  // Steady-state caches.
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private live: SlideObj[] = [];
  private liveFront: SlideObj[] = [];
  private cacheValid = false;
  // Outgoing frame for an in-place change.
  private outgoing: { canvas: HTMLCanvasElement; start: number; dur: number } | null = null;
  private disposed = false;
  private unsubImage: () => void;
  private onFontsDone = () => this.rebuild();
  // Live drawers (media, charts): host context + "redraw everything" requests.
  private static seq = 0;
  private liveAll = false;
  readonly host: SlideHost;

  constructor(private content: TelaContent, private w: number, private h: number, audible = false) {
    this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h));
    const self = this;
    this.host = {
      id: `tts${++TelaTemplateSource.seq}-${Math.random().toString(36).slice(2, 7)}`,
      audible,
      get templateId() { return self.content.templateId; },
      get fields() { return self.content.fields || {}; },
      get w() { return self.w; }, get h() { return self.h; },
      get shownSec() { return nowSec() - self.enterStart; },
      get exitP() { return self.exitStart < 0 ? 0 : Math.min(1, (nowSec() - self.exitStart) / Math.max(.05, slideTemplateTiming(self.th, self.reduced).exitSec)); },
      requestLive(on: boolean) { self.liveAll = on; },
    };
    this.canvas = makeCanvas(this.w, this.h);
    this.th = resolveTheme(content.theme, content.fields);
    this.build();
    this.unsubImage = onSlideImageLoad(() => { this.cacheValid = false; });
    try { (document as any).fonts?.addEventListener?.('loadingdone', this.onFontsDone); } catch { /* */ }
  }

  private build() {
    this.th = resolveTheme(this.content.theme, this.content.fields);
    this.objs = buildSlideObjects(this.content.templateId, this.content.theme, this.content.fields, this.w, this.h);
    this.cacheValid = false;
    if (this.objs) {
      const objs = this.objs;
      loadSlideFonts(objs).then(() => { if (!this.disposed && objs === this.objs) { invalidateSlideLayouts(); this.rebuild(); } });
    }
  }

  /** Re-measure with the fonts now available, keeping the animation clock. */
  private rebuild() {
    if (this.disposed) return;
    this.objs = buildSlideObjects(this.content.templateId, this.content.theme, this.content.fields, this.w, this.h);
    this.cacheValid = false;
  }

  update(content: TelaContent) {
    const prev = this.content;
    const look = content.templateId !== prev.templateId || content.theme !== prev.theme;
    const words = JSON.stringify(content.fields || {}) !== JSON.stringify(prev.fields || {});
    this.content = content;
    if (!look && !words) return;
    // Keep what is on screen and crossfade it out while the new words enter.
    try {
      const snap = makeCanvas(this.w, this.h);
      snap.getContext('2d')?.drawImage(this.canvas, 0, 0);
      const tm = slideTemplateTiming(this.th, this.reduced);
      this.outgoing = { canvas: snap, start: nowSec(), dur: look ? Math.max(.35, tm.exitSec) : .32 };
    } catch { this.outgoing = null; }
    this.exitStart = -1;
    this.enterStart = nowSec();
    this.enterFromGroup = look ? 0 : 2;
    this.build();
  }

  beginExit(): number {
    if (this.exitStart < 0) this.exitStart = nowSec();
    return slideTemplateTiming(this.th, this.reduced).exitMs;
  }

  private clock(now: number): FrameClock {
    return {
      t: now - this.born,
      enterT: now - this.enterStart,
      exitT: this.exitStart >= 0 ? now - this.exitStart : -1,
      reduced: this.reduced,
      enterFromGroup: this.enterFromGroup,
      host: this.host,
    };
  }

  private ensureCaches() {
    if (this.cacheValid && this.back && this.front) return;
    const objs = this.objs || [];
    const moving = (o: SlideObj) => !!o.live || (!!o.amb && o.amb.kind !== 'countdown' && !this.reduced);
    this.liveFront = objs.filter(o => o.front || o.amb?.kind === 'countdown');
    this.live = objs.filter(o => !this.liveFront.includes(o) && moving(o));
    let lastLive = -1;
    objs.forEach((o, i) => { if (this.live.includes(o)) lastLive = i; });
    const isStatic = (o: SlideObj) => !this.live.includes(o) && !this.liveFront.includes(o);
    // Behind: static shapes under the last moving ornament. Front: everything
    // after it, plus all static text (words always sit above ornament).
    const behind = new Set(objs.filter((o, i) => isStatic(o) && i < lastLive && o.kind !== 'TEXT'));
    this.back = this.back || makeCanvas(this.w, this.h);
    this.front = this.front || makeCanvas(this.w, this.h);
    const steady: FrameClock = { t: 0, enterT: Infinity, exitT: -1, reduced: this.reduced, host: this.host };
    const b = this.back.getContext('2d'), f = this.front.getContext('2d');
    if (b) { b.clearRect(0, 0, this.w, this.h); drawSlideObjects(b, objs, this.th, this.w, this.h, steady, o => behind.has(o)); }
    if (f) { f.clearRect(0, 0, this.w, this.h); drawSlideObjects(f, objs, this.th, this.w, this.h, steady, o => isStatic(o) && !behind.has(o)); }
    this.cacheValid = true;
  }

  frame(_timeSec?: number): HTMLCanvasElement {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return this.canvas;
    try {
      ctx.clearRect(0, 0, this.w, this.h);
      if (!this.objs) { drawFallbackCard(ctx, this.w, this.h, this.content.fields?.title || this.content.templateId); return this.canvas; }
      const now = nowSec(), c = this.clock(now);
      const tm = slideTemplateTiming(this.th, this.reduced);
      // Media takeovers (video full-screen, etc.) ask for full redraws while active.
      const animating = this.liveAll || c.exitT >= 0 || c.enterT < tm.enterSec + .05;
      if (animating) {
        drawSlideObjects(ctx, this.objs, this.th, this.w, this.h, c);
      } else {
        this.ensureCaches();
        if (this.back) ctx.drawImage(this.back, 0, 0);
        if (this.live.length) drawSlideObjects(ctx, this.objs, this.th, this.w, this.h, c, o => this.live.includes(o));
        if (this.front) ctx.drawImage(this.front, 0, 0);
        if (this.liveFront.length) drawSlideObjects(ctx, this.objs, this.th, this.w, this.h, c, o => this.liveFront.includes(o));
      }
      if (this.outgoing) {
        const p = (now - this.outgoing.start) / this.outgoing.dur;
        if (p >= 1) this.outgoing = null;
        else { ctx.save(); ctx.globalAlpha = 1 - p * p; ctx.drawImage(this.outgoing.canvas, 0, 0); ctx.restore(); }
      }
    } catch {
      try { ctx.clearRect(0, 0, this.w, this.h); drawFallbackCard(ctx, this.w, this.h, this.content.fields?.title || this.content.templateId); } catch { /* */ }
    }
    return this.canvas;
  }

  // ── Blend mode: background art blends onto the layers beneath; text stays normal ──
  private bgPart: HTMLCanvasElement | null = null;
  private fgPart: HTMLCanvasElement | null = null;

  parts(): Array<{ img: CanvasImageSource; blend?: GlobalCompositeOperation; alpha?: number }> | null {
    const mode = this.content.bgBlend || 'normal';
    const alpha = this.content.bgOpacity ?? 1;
    if ((mode === 'normal' && alpha >= 1) || !this.objs) return null;
    try {
      if (!this.bgPart) this.bgPart = makeCanvas(this.w, this.h);
      if (!this.fgPart) this.fgPart = makeCanvas(this.w, this.h);
      const b = this.bgPart.getContext('2d'), f = this.fgPart.getContext('2d');
      if (!b || !f) return null;
      const c = this.clock(nowSec());
      b.clearRect(0, 0, this.w, this.h); f.clearRect(0, 0, this.w, this.h);
      drawSlideObjects(b, this.objs, this.th, this.w, this.h, c, o => o.kind !== 'TEXT');
      drawSlideObjects(f, this.objs, this.th, this.w, this.h, c, o => o.kind === 'TEXT');
      return [
        { img: this.bgPart, blend: (mode === 'normal' ? 'source-over' : mode) as GlobalCompositeOperation, alpha },
        { img: this.fgPart },
      ];
    } catch { return null; }
  }

  size() { return { w: this.w, h: this.h }; }
  ready() { return true; }
  dispose() {
    this.disposed = true;
    disposeHost(this.host.id);
    this.unsubImage();
    try { (document as any).fonts?.removeEventListener?.('loadingdone', this.onFontsDone); } catch { /* */ }
    this.back = this.front = null; this.outgoing = null;
  }
}

export function createTelaTemplateSource(content: TelaContent, w: number, h: number, audible = false): LayerSource | null {
  if (typeof document === 'undefined') return null;
  return new TelaTemplateSource(content, w, h, audible);
}

/** Media templates (video/audio) need their own source per take, never an in-place update. */
export function isMediaTemplate(templateId: string): boolean {
  const m = templateById(templateId)?.media;
  return m === 'video' || m === 'audio';
}
