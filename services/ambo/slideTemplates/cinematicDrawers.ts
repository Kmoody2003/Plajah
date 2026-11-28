// cinematicDrawers — live drawers for the Cinematic slide family (templatesCinematic.ts).
//
//   cine.scene   painted art that breathes: a slow Ken Burns drift, a localized
//                reading vignette that breathes with it, warm light shafts and
//                dust motes kept to the wings so the words stay clean, and an
//                optional feathered edge into the slide's ground
//   cine.figure  an infographic figure ("≈$300M", "25 YEARS") that counts up once
//                when the slide is taken, then holds perfectly still
//
// Elegant and subtly alive: everything moves slowly. Reduced motion holds a
// still frame (env.t is 0), and galleries and thumbnails (no host) draw the
// settled frame.
import { registerLiveDrawer, type LiveEnv } from './live';
import type { SlideObj } from './types';
import { fontCss } from '../../tela/telaFonts';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const outCubic = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);

function rgba(hex: string, a: number): string {
  const m = (hex || '#000000').replace('#', '');
  const x = m.length === 3 ? m.split('').map(c => c + c).join('') : m.slice(0, 6);
  const n = parseInt(x, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── images (own cache; live drawers repaint every frame, so no load listener is needed) ──
const images = new Map<string, HTMLImageElement>();
function imageFor(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !src) return null;
  let img = images.get(src);
  if (!img) {
    img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.src = src;
    if (images.size > 64) images.clear();
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// Deterministic per-mote randoms.
function hash(n: number): number { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** Vignettes are baked once per size and parameter set, then stamped each frame. */
const vigCache = new Map<string, HTMLCanvasElement>();
function vignette(w: number, h: number, cx: number, cy: number, rx: number, ry: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = [w, h, cx, cy, rx, ry, color].map(v => (typeof v === 'number' ? Math.round(v) : v)).join('|');
  let c = vigCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) return null;
  g.translate(cx, cy); g.scale(Math.max(1, rx), Math.max(1, ry));
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  // Smooth falloff: dense in the reading zone, gone well before the figures on the wings.
  rg.addColorStop(0, rgba(color, 1)); rg.addColorStop(.42, rgba(color, .9)); rg.addColorStop(.7, rgba(color, .45)); rg.addColorStop(1, rgba(color, 0));
  g.fillStyle = rg; g.fillRect(-1, -1, 2, 2);
  if (vigCache.size > 24) vigCache.clear();
  vigCache.set(key, c);
  return c;
}

export interface SceneProps {
  src: string;
  /** Ken Burns depth (fraction of scale). 0 = still. */
  kb?: number;
  /** Reading vignette, in fractions of the box: centre, radii, strength. */
  vig?: { cx: number; cy: number; rx: number; ry: number; a: number; color?: string };
  /** Dust motes and light shafts. */
  dust?: number; dustColor?: string; shafts?: boolean;
  /** Fraction of the box width (0..1) kept clear of dust in the middle. */
  clear?: number;
  /** Feather the right edge into a ground colour over `px` pixels. */
  feather?: { px: number; color: string };
  /** Shown while the image decodes. */
  base?: string;
  seed?: number;
}

function drawScene(ctx: Ctx, o: SlideObj, env: LiveEnv): void {
  const P = (o.live?.props || {}) as unknown as SceneProps;
  const { x, y, w, h } = o;
  const t = env.reduced ? 0 : env.t;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  const img = imageFor(P.src);
  if (P.base) { ctx.fillStyle = P.base; ctx.fillRect(x, y, w, h); }
  if (img) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cover = Math.max(w / iw, h / ih);
    const kb = P.kb ?? 0;
    // Two incommensurate slow waves: the picture never visibly loops.
    const breathe = .5 + .5 * Math.sin(t * TAU / 41 + (P.seed || 0));
    const s = cover * (1 + kb * (.35 + .65 * breathe));
    const dw = iw * s, dh = ih * s;
    const slackX = dw - w, slackY = dh - h;
    const px = .5 + .42 * Math.sin(t * TAU / 67 + (P.seed || 0) * 1.7);
    const py = .5 + .35 * Math.cos(t * TAU / 53 + (P.seed || 0));
    ctx.drawImage(img, x - slackX * px, y - slackY * py, dw, dh);
  }

  // Light shafts: soft warm beams sliding slowly across the wings.
  if (P.shafts) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const side = i % 2 ? .82 : .16;
      const cx = x + w * (side + .07 * Math.sin(t * TAU / (37 + i * 11) + i));
      const bw = h * (.22 + .1 * i);
      const a = .05 + .035 * Math.sin(t * TAU / (23 + i * 7) + i * 2);
      ctx.save();
      ctx.translate(cx, y); ctx.rotate(.32 - i * .05);
      const g = ctx.createLinearGradient(-bw, 0, bw, 0);
      g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(.5, `rgba(255,224,170,${Math.max(0, a)})`); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.fillRect(-bw, -h * .2, bw * 2, h * 1.6);
      ctx.restore();
    }
    ctx.restore();
  }

  // Reading vignette (breathes a few percent with the light).
  if (P.vig && P.vig.a > 0) {
    const v = P.vig;
    const c = vignette(w, h, v.cx * w, v.cy * h, v.rx * w, v.ry * h, v.color || '#0A0704');
    if (c) {
      ctx.save();
      ctx.globalAlpha *= clamp01(v.a * (1 + .05 * Math.sin(t * TAU / 17)));
      ctx.drawImage(c, x, y, w, h);
      ctx.restore();
    }
  }

  // Dust motes, kept to the wings so they never cross the words.
  const n = Math.max(0, Math.min(160, P.dust || 0));
  if (n) {
    const col = P.dustColor || '#FFE7B8';
    const clear = clamp01(P.clear ?? .5);
    const k = h / 1080;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const s0 = (P.seed || 0) * 97 + i * 13;
      // Pick a wing, then a spot inside it.
      const left = hash(s0) < .5, span = (1 - clear) / 2;
      const fx = left ? hash(s0 + 1) * span : 1 - span + hash(s0 + 1) * span;
      const speed = (6 + hash(s0 + 2) * 16) * k;            // px per second, upward
      const fy = ((hash(s0 + 3) * h - t * speed) % h + h) % h;
      const sway = Math.sin(t * (.15 + hash(s0 + 4) * .3) + i) * 26 * k;
      const r = (1.1 + hash(s0 + 5) * 2.6) * k;
      const tw = .45 + .55 * Math.sin(t * (.6 + hash(s0 + 6)) + i * 1.3);
      const a = (.10 + .22 * hash(s0 + 7)) * clamp01(tw);
      const px = x + fx * w + sway, py = y + fy;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 3.2);
      g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 3.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  if (P.feather && P.feather.px > 0) {
    const f = P.feather, x0 = x + w - f.px;
    const g = ctx.createLinearGradient(x0, 0, x + w, 0);
    g.addColorStop(0, rgba(f.color, 0)); g.addColorStop(.55, rgba(f.color, .62)); g.addColorStop(1, rgba(f.color, 1));
    ctx.fillStyle = g; ctx.fillRect(x0, y, f.px + 1, h);
  }
  ctx.restore();
}

export interface FigureProps {
  value: string; size: number; color: string; font?: string; weight?: number;
  /** Seconds after the slide is taken before counting starts. */
  delay?: number; dur?: number;
  /** Underline glint colour (an accent hairline that draws in under the number). */
  rule?: string;
}

/** Split "≈$12.7M" into prefix / number / suffix. Bare years (2003) do not count. */
export function parseFigure(v: string): { pre: string; num: number; dec: number; suf: string } | null {
  const m = (v || '').match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const [, pre, raw, suf] = m;
  if (!pre && !suf.trim() && /^\d{4}$/.test(raw)) return null;
  const dec = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { pre, num: parseFloat(raw.replace(/,/g, '')), dec, suf };
}

function drawFigure(ctx: Ctx, o: SlideObj, env: LiveEnv): void {
  const P = (o.live?.props || {}) as unknown as FigureProps;
  const host = env.host;
  const delay = P.delay ?? .55, dur = P.dur ?? 1.9;
  // No host (gallery / thumbnail) or reduced motion: the settled value.
  const since = !host || env.reduced ? Infinity : host.shownSec - delay;
  const p = since === Infinity ? 1 : clamp01(since / dur);
  const e = outCubic(p);
  const f = parseFigure(P.value);
  let label = P.value;
  if (f && p < 1) label = f.pre + (f.num * e).toLocaleString('en-US', { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec }) + f.suf;
  ctx.save();
  ctx.font = `${P.weight ?? 700} ${P.size}px ${fontCss(P.font || 'inter')}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = P.color;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  // Width is measured on the final label so the figure never jitters while it counts.
  const finalW = ctx.measureText(P.value).width;
  const k = finalW > o.w ? o.w / finalW : 1;
  ctx.translate(cx, cy); ctx.scale(k, k);
  if (p < 1 && since !== Infinity) { ctx.shadowColor = rgba(P.rule || P.color, .35 * (1 - e)); ctx.shadowBlur = P.size * .4; }
  ctx.fillText(label, 0, 0);
  ctx.restore();
  if (P.rule) {
    const rw = Math.min(o.w * .5, finalW * k * .55) * (since === Infinity ? 1 : outCubic(clamp01((since - .2) / 1.2)));
    if (rw > 1) {
      ctx.save();
      ctx.fillStyle = P.rule;
      ctx.fillRect(cx - rw / 2, cy + P.size * .62, rw, Math.max(2, P.size * .035));
      ctx.restore();
    }
  }
}

registerLiveDrawer('cine.scene', drawScene);
registerLiveDrawer('cine.figure', drawFigure);
