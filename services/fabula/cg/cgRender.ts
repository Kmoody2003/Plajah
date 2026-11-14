// cgRender — the ONE Canvas2D renderer for Fabula CG graphics.
//
// Used by: the Fabula timeline monitor, the offline export (offlineRenderer),
// the Graphics workspace designer + library thumbnails, the live playout output
// (switcher program overlay, Stage, standalone key/fill output window).
//
// Real-time budget: a broadcast lower third is ~10 layers. We avoid per-frame
// allocations where it matters — Path2D objects are cached per path string,
// images per URL, gradients are cheap. Per-glyph text drawing is only used
// while a text layer is actually animating; at rest each line is one fillText.
// Works with HTMLCanvasElement and OffscreenCanvas contexts (render workers).
import { fontCss, ensureFontsLoaded, fontKeysInStacks } from '../../tela/telaFonts';
import { CG_W, CG_H, type CgGraphic, type CgGraphicRef, type CgGradient, type CgPalette } from './cgTypes';
import { evaluateCg, resolveCgColor, type CgFrame, type CgResolvedLayer, type CgEvalContext } from './cgEvaluate';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// ── caches ───────────────────────────────────────────────────────────────────
const pathCache = new Map<string, Path2D>();
function cachedPath(d: string): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); if (pathCache.size > 512) pathCache.clear(); pathCache.set(d, p); }
  return p;
}

type ImgEntry = { img: HTMLImageElement | ImageBitmap | null; state: 'loading' | 'ready' | 'error' };
const imageCache = new Map<string, ImgEntry>();
let onImageReady: (() => void) | null = null;
/** Hosts can register a callback to redraw once an image finishes loading. */
export function setCgImageReadyListener(fn: (() => void) | null) { onImageReady = fn; }
function cachedImage(src: string): HTMLImageElement | ImageBitmap | null {
  const e = imageCache.get(src);
  if (e) return e.state === 'ready' ? e.img : null;
  if (typeof Image === 'undefined') return null;
  const entry: ImgEntry = { img: null, state: 'loading' };
  imageCache.set(src, entry);
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { entry.img = img; entry.state = 'ready'; onImageReady?.(); };
  img.onerror = () => { entry.state = 'error'; };
  img.src = src;
  return null;
}
/** Preload every image a graphic references (export loops call this first). */
export async function preloadCgImages(g: CgGraphic, ref?: CgGraphicRef | null): Promise<void> {
  const f = evaluateCg(g, 1e5, Infinity, ref);
  await Promise.all(f.layers.filter(l => l.src).map(l => new Promise<void>(res => {
    const src = l.src!; const e = imageCache.get(src);
    if (e && e.state !== 'loading') return res();
    if (typeof Image === 'undefined') return res();
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { imageCache.set(src, { img, state: 'ready' }); res(); };
    img.onerror = () => { imageCache.set(src, { img: null, state: 'error' }); res(); };
    img.src = src;
  })));
}

const fontsRequested = new Set<string>();
/** Request the Tela fonts a graphic uses (browser only). Returns once document.fonts settles or 1.5s. */
export async function ensureCgFonts(g: CgGraphic): Promise<void> {
  const keys = new Set<string>();
  for (const k of [g.fonts.display, g.fonts.text, g.fonts.utility]) if (k) keys.add(k);
  for (const l of g.layers) if (l.style?.font) keys.add(l.style.font);
  const fresh = [...keys].filter(k => !fontsRequested.has(k));
  if (!fresh.length) return;
  fresh.forEach(k => fontsRequested.add(k));
  ensureFontsLoaded([...fresh, ...fontKeysInStacks(fresh)]);
  if (typeof document === 'undefined' || !(document as any).fonts) return;
  const fonts = (document as any).fonts as FontFaceSet;
  const loads = fresh.map(k => fonts.load(`700 40px ${fontCss(k)}`).catch(() => undefined));
  await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 1500))]);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function makeGradient(ctx: Ctx2D, gr: CgGradient, pal: CgPalette, x: number, y: number, w: number, h: number): CanvasGradient {
  let g: CanvasGradient;
  if (gr.type === 'radial') {
    g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
  } else {
    const a = ((gr.angle ?? 90) - 90) * Math.PI / 180;
    const cx = x + w / 2, cy = y + h / 2, r = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  for (const [o, c] of gr.stops) { try { g.addColorStop(Math.max(0, Math.min(1, o)), resolveCgColor(c, pal)); } catch { /* bad colour */ } }
  return g;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number, skew = 0) {
  ctx.beginPath();
  if (skew) {
    const s = Math.tan(skew * Math.PI / 180) * h;
    ctx.moveTo(x + s, y); ctx.lineTo(x + w + s, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    return;
  }
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fontString(style: NonNullable<CgResolvedLayer['layer']['style']>, size: number) {
  return `${style.italic ? 'italic ' : ''}${style.weight || 400} ${Math.max(1, size).toFixed(1)}px ${fontCss(style.font)}`;
}

function setTracking(ctx: Ctx2D, em: number, size: number) {
  const c = ctx as any;
  if ('letterSpacing' in c) c.letterSpacing = `${(em * size).toFixed(2)}px`;
}

const measureCache = new Map<string, number>();
function measure(ctx: Ctx2D, font: string, tracking: number, s: string): number {
  const k = font + '|' + tracking + '|' + s;
  let w = measureCache.get(k);
  if (w === undefined) { w = ctx.measureText(s).width; if (measureCache.size > 4000) measureCache.clear(); measureCache.set(k, w); }
  return w;
}

/** Greedy word wrap; returns lines and the size that fits maxLines. */
function layoutText(ctx: Ctx2D, text: string, r: CgResolvedLayer): { lines: string[]; size: number } {
  const st = r.layer.style!;
  const maxLines = st.maxLines ?? 2;
  let size = st.size;
  for (let attempt = 0; attempt < 8; attempt++) {
    const font = fontString(st, size);
    ctx.font = font; setTracking(ctx, st.tracking || 0, size);
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (measure(ctx, font, st.tracking || 0, test) > r.w && line) { lines.push(line); line = w; } else line = test;
      }
      lines.push(line);
    }
    const widest = Math.max(...lines.map(l => measure(ctx, font, st.tracking || 0, l)));
    if ((lines.length <= maxLines && widest <= r.w * 1.001) || size <= st.size * .45) return { lines: lines.slice(0, Math.max(maxLines, 1)), size };
    size *= .9;
  }
  return { lines: [text], size };
}

// ── layer drawing ────────────────────────────────────────────────────────────
function drawShapeFill(ctx: Ctx2D, r: CgResolvedLayer, pal: CgPalette) {
  const l = r.layer;
  if (l.gradient) ctx.fillStyle = makeGradient(ctx, l.gradient, pal, r.x, r.y, r.w, r.h);
  else ctx.fillStyle = resolveCgColor(l.fill || 'accent', pal);
}

function drawText(ctx: Ctx2D, r: CgResolvedLayer, pal: CgPalette) {
  const st = r.layer.style; if (!st || !r.text) return;
  const { lines, size } = layoutText(ctx, r.text, r);
  const lh = size * (st.lineHeight ?? 1.15);
  const blockH = lh * lines.length;
  const va = st.valign || 'middle';
  let y0 = va === 'top' ? r.y : va === 'bottom' ? r.y + r.h - blockH : r.y + (r.h - blockH) / 2;
  ctx.font = fontString(st, size); setTracking(ctx, st.tracking || 0, size);
  ctx.textBaseline = 'alphabetic';
  const color = resolveCgColor(st.color, pal);
  if (st.shadow) { ctx.shadowColor = resolveCgColor(st.shadow.color, pal); ctx.shadowBlur = st.shadow.blur; ctx.shadowOffsetX = st.shadow.x || 0; ctx.shadowOffsetY = st.shadow.y ?? 2; }
  const font = ctx.font;
  let gi = 0;
  for (const line of lines) {
    const baseline = y0 + size * .8 + (lh - size) / 2;
    const lw = measure(ctx, font, st.tracking || 0, line);
    let x = st.align === 'center' ? r.x + (r.w - lw) / 2 : st.align === 'right' ? r.x + r.w - lw : r.x;
    if (!r.glyphs) {
      ctx.textAlign = 'left';
      if (st.stroke) { ctx.strokeStyle = resolveCgColor(st.stroke.color, pal); ctx.lineWidth = st.stroke.width; ctx.lineJoin = 'round'; ctx.strokeText(line, x, baseline); }
      ctx.fillStyle = color; ctx.fillText(line, x, baseline);
    } else {
      // per-glyph: glyph states are indexed across the whole string (spaces between lines included)
      ctx.textAlign = 'left';
      for (const ch of line) {
        const gs = r.glyphs[gi++] || { char: ch, opacity: 1, dx: 0, dy: 0, scale: 1, blur: 0, spacing: 0 };
        const cw = measure(ctx, font, st.tracking || 0, ch);
        if (gs.opacity > .01 && ch !== ' ') {
          ctx.save();
          ctx.globalAlpha *= gs.opacity;
          const gx = x + gs.dx * size, gy = baseline + gs.dy * size;
          if (gs.scale !== 1) { ctx.translate(gx + cw / 2, gy - size * .35); ctx.scale(gs.scale, gs.scale); ctx.translate(-(gx + cw / 2), -(gy - size * .35)); }
          if (gs.blur > .001 && 'filter' in ctx) (ctx as any).filter = `blur(${(gs.blur * size).toFixed(1)}px)`;
          ctx.fillStyle = color; ctx.fillText(gs.char || ch, gx, gy);
          ctx.restore();
        }
        x += cw + gs.spacing * size;
      }
      gi++; // the space/newline that ended this line
    }
    y0 += lh;
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

function drawTicker(ctx: Ctx2D, r: CgResolvedLayer, pal: CgPalette) {
  const l = r.layer, st = l.style, tk = l.ticker; if (!st || !tk || !r.items?.length) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.font = fontString(st, st.size); setTracking(ctx, st.tracking || 0, st.size);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const font = ctx.font;
  const sep = tk.separator ?? '•';
  const items = r.items.map(s => st.upper ? s.toUpperCase() : s);
  const widths = items.map(s => measure(ctx, font, st.tracking || 0, s));
  const sepW = measure(ctx, font, st.tracking || 0, sep);
  const unit = widths.reduce((a, w) => a + w + tk.gap * 2 + sepW, 0);
  if (unit <= 0) { ctx.restore(); return; }
  const shift = (r.loopTime * tk.speed) % unit;
  let x = r.x + r.w - shift; // starts entering from the right edge
  while (x > r.x - unit) x -= unit;
  const cy = r.y + r.h / 2;
  const color = resolveCgColor(st.color, pal), accent = resolveCgColor('accent', pal);
  for (; x < r.x + r.w; ) {
    for (let i = 0; i < items.length && x < r.x + r.w; i++) {
      if (x + widths[i] > r.x) { ctx.fillStyle = color; ctx.fillText(items[i], x, cy); }
      x += widths[i] + tk.gap;
      ctx.fillStyle = accent; ctx.fillText(sep, x, cy);
      x += sepW + tk.gap;
    }
  }
  ctx.restore();
}

function hash(i: number, k: number) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

function drawDeco(ctx: Ctx2D, r: CgResolvedLayer, pal: CgPalette) {
  const l = r.layer, d = l.deco || {};
  const color = resolveCgColor(l.fill || 'accent', pal);
  if (l.kind === 'glow') {
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) / 2);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (l.kind === 'grid') {
    const sp = d.spacing || 48;
    ctx.strokeStyle = color; ctx.lineWidth = l.strokeWidth || 1;
    ctx.beginPath();
    for (let x = r.x; x <= r.x + r.w; x += sp) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
    for (let y = r.y; y <= r.y + r.h; y += sp) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
    ctx.stroke();
  } else if (l.kind === 'particles') {
    const n = d.count || 40, s = d.size || 4, seed = d.seed || 1;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const px = r.x + hash(i, seed) * r.w;
      const py = r.y + ((hash(i, seed + 7) * r.h - r.loopTime * (12 + hash(i, seed + 3) * 40)) % r.h + r.h) % r.h;
      const a = .25 + .75 * hash(i, seed + 11);
      ctx.globalAlpha = a * r.opacity;
      ctx.beginPath(); ctx.arc(px, py, s * (.4 + hash(i, seed + 5)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = r.opacity;
  } else if (l.kind === 'bars') {
    const vals = (d.values || '').split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (!vals.length) return;
    const max = Math.max(...vals, 1), gap = (d.spacing ?? 12), bw = (r.w - gap * (vals.length - 1)) / vals.length;
    vals.forEach((v, i) => {
      const h = r.h * v / max;
      ctx.fillStyle = i === vals.length - 1 ? resolveCgColor('highlight', pal) : color;
      ctx.fillRect(r.x + i * (bw + gap), r.y + r.h - h, bw, h);
    });
  }
}

function drawLayer(ctx: Ctx2D, r: CgResolvedLayer, pal: CgPalette) {
  const l = r.layer;
  ctx.save();
  ctx.globalAlpha *= r.opacity;
  if (l.blend && l.blend !== 'normal') ctx.globalCompositeOperation = l.blend as GlobalCompositeOperation;
  if (r.blur > .1 && 'filter' in ctx) (ctx as any).filter = `blur(${r.blur.toFixed(1)}px)`;
  if (r.clip) {
    ctx.beginPath();
    if (r.clip.ellipse) ctx.ellipse(r.clip.x + r.clip.w / 2, r.clip.y + r.clip.h / 2, r.clip.w / 2, r.clip.h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(r.clip.x, r.clip.y, r.clip.w, r.clip.h);
    ctx.clip();
  }
  if (r.rotation || r.sx !== 1 || r.sy !== 1 || r.skewX) {
    ctx.translate(r.px, r.py);
    if (r.rotation) ctx.rotate(r.rotation * Math.PI / 180);
    if (r.skewX) ctx.transform(1, 0, Math.tan(r.skewX * Math.PI / 180), 1, 0, 0);
    ctx.scale(r.sx, r.sy);
    ctx.translate(-r.px, -r.py);
  }
  if (l.shadow && l.kind !== 'text') { ctx.shadowColor = resolveCgColor(l.shadow.color, pal); ctx.shadowBlur = l.shadow.blur; ctx.shadowOffsetX = l.shadow.x || 0; ctx.shadowOffsetY = l.shadow.y ?? 4; }

  switch (l.kind) {
    case 'rect': {
      roundRect(ctx, r.x, r.y, r.w, r.h, l.radius || 0, l.skew || 0);
      if (l.fill || l.gradient) { drawShapeFill(ctx, r, pal); ctx.fill(); }
      if (l.stroke) { ctx.shadowColor = 'transparent'; ctx.strokeStyle = resolveCgColor(l.stroke, pal); ctx.lineWidth = l.strokeWidth || 2; if (l.dash) ctx.setLineDash(l.dash); ctx.stroke(); }
      break;
    }
    case 'ellipse': {
      ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2);
      if (l.fill || l.gradient) { drawShapeFill(ctx, r, pal); ctx.fill(); }
      if (l.stroke) { ctx.strokeStyle = resolveCgColor(l.stroke, pal); ctx.lineWidth = l.strokeWidth || 2; if (l.dash) ctx.setLineDash(l.dash); ctx.stroke(); }
      break;
    }
    case 'line': {
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.strokeStyle = resolveCgColor(l.stroke || l.fill || 'accent', pal); ctx.lineWidth = l.strokeWidth || 3; ctx.lineCap = 'round';
      if (l.dash) ctx.setLineDash(l.dash);
      ctx.stroke();
      break;
    }
    case 'path': {
      const p = l.path ? cachedPath(l.path) : null; if (!p) break;
      ctx.translate(r.x, r.y); ctx.scale(r.w / 100, r.h / 100);
      if (l.fill || l.gradient) { ctx.fillStyle = l.gradient ? makeGradient(ctx, l.gradient, pal, 0, 0, 100, 100) : resolveCgColor(l.fill!, pal); ctx.fill(p); }
      if (l.stroke) { ctx.strokeStyle = resolveCgColor(l.stroke, pal); ctx.lineWidth = (l.strokeWidth || 2) * 100 / Math.max(1, r.w); ctx.stroke(p); }
      break;
    }
    case 'text': drawText(ctx, r, pal); break;
    case 'clock': drawText(ctx, r, pal); break;
    case 'ticker': drawTicker(ctx, r, pal); break;
    case 'image': {
      const img = r.src ? cachedImage(r.src) : null;
      if (!img) { ctx.fillStyle = resolveCgColor('shade', pal); roundRect(ctx, r.x, r.y, r.w, r.h, l.radius || 0); ctx.fill(); break; }
      const iw = (img as any).naturalWidth || img.width, ih = (img as any).naturalHeight || img.height;
      const s = (l.fit === 'contain' ? Math.min : Math.max)(r.w / iw, r.h / ih);
      const dw = iw * s, dh = ih * s;
      roundRect(ctx, r.x, r.y, r.w, r.h, l.radius || 0); ctx.clip();
      ctx.drawImage(img as CanvasImageSource, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
      break;
    }
    case 'glow': case 'grid': case 'particles': case 'bars': drawDeco(ctx, r, pal); break;
  }

  // Shimmer / sweep loops: a moving highlight band clipped to the layer's box.
  if (l.loop && (l.loop.type === 'shimmer' || l.loop.type === 'sweep') && l.kind !== 'text') {
    const bw = r.w * (l.loop.amount ?? .25);
    const cx = r.x - bw + (r.w + bw * 2) * r.loopPhase;
    ctx.shadowColor = 'transparent';
    roundRect(ctx, r.x, r.y, r.w, r.h, l.radius || 0, l.skew || 0); ctx.clip();
    const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, l.loop.type === 'sweep' ? resolveCgColor('highlight', pal) : 'rgba(255,255,255,.38)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

/** Draw an evaluated frame into a W×H region (default: the whole context). */
export function drawCgFrameData(ctx: Ctx2D, frame: CgFrame, W: number, H: number, place?: { x: number; y: number; w: number; h: number }) {
  const px = place?.x ?? 0, py = place?.y ?? 0, pw = place?.w ?? W, ph = place?.h ?? H;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(pw / CG_W, ph / CG_H);
  const o = frame.offset;
  if (o.x || o.y || o.scale !== 1) { ctx.translate(CG_W / 2 + o.x, CG_H / 2 + o.y); ctx.scale(o.scale, o.scale); ctx.translate(-CG_W / 2, -CG_H / 2); }
  const byId = new Map(frame.layers.map(r => [r.layer.id, r]));
  for (const r of frame.layers) {
    if (r.layer.matte) {
      const m = byId.get(r.layer.matte);
      if (!m) continue; // matte layer not visible → nothing shows
      ctx.save(); ctx.beginPath(); roundRect(ctx, m.x, m.y, m.w * m.sx, m.h * m.sy, m.layer.radius || 0, m.layer.skew || 0);
      if (m.clip) { ctx.clip(); ctx.beginPath(); ctx.rect(m.clip.x, m.clip.y, m.clip.w, m.clip.h); }
      ctx.clip();
      drawLayer(ctx, r, frame.palette);
      ctx.restore();
    } else drawLayer(ctx, r, frame.palette);
  }
  ctx.restore();
}

/** Evaluate + draw in one call. t, D in seconds (D = Infinity holds). */
export function drawCgGraphic(ctx: Ctx2D, g: CgGraphic, t: number, D: number, W: number, H: number, ref?: CgGraphicRef | null, opts: CgEvalContext & { place?: { x: number; y: number; w: number; h: number } } = {}): CgFrame {
  const frame = evaluateCg(g, t, D, ref, opts);
  drawCgFrameData(ctx, frame, W, H, opts.place);
  return frame;
}

/** Offscreen canvas (export path) — returns a canvas with the frame drawn at W×H. */
let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
export function getCgFrameCanvas(g: CgGraphic, t: number, D: number, W: number, H: number, ref?: CgGraphicRef | null, now?: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (!scratch) {
    if (typeof OffscreenCanvas !== 'undefined') scratch = new OffscreenCanvas(W, H);
    else if (typeof document !== 'undefined') scratch = document.createElement('canvas');
    else return null;
  }
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  const ctx = scratch.getContext('2d') as Ctx2D | null; if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  drawCgGraphic(ctx, g, t, D, W, H, ref, { now });
  return scratch;
}
