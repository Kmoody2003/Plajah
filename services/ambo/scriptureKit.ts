// scriptureKit — the shared drawing toolkit for every scripture look.
//
// Layout collections (scriptureLayouts.ts and services/ambo/scriptureLooks/*)
// all draw with these helpers, so legibility rules (reading measure, fit,
// plates), transitions (per-word/letter in drawVerse) and motion conventions
// stay identical across every look.

export type AspectClass = 'vertical' | 'portrait' | 'classic' | 'screen' | 'ultrawide' | 'wall';

export function aspectClass(w: number, h: number): AspectClass {
  const r = w / Math.max(1, h);
  if (r < 0.66) return 'vertical';
  if (r < 0.92) return 'portrait';
  if (r < 1.5) return 'classic';
  if (r < 1.95) return 'screen';
  if (r < 2.8) return 'ultrawide';
  return 'wall';
}


export interface ScriptureState {
  w: number;
  h: number;
  /** Seconds since this scripture came up — drives ambient motion. */
  t: number;
  text: string;
  reference: string;
  translation?: string;
  copyright?: string;
  accent: string;
  /** Entrance progress 0→1 (1 = settled). */
  enterP: number;
  /** Exit progress 0→1 (0 = not exiting). */
  exitP: number;
  transition: string;
  /** Offscreen TYPO-engine frame for the 'type-volume' layout, when ready. */
  typoFrame?: CanvasImageSource | null;
  /**
   * The rest of the chapter from Lectio (other verses, nearest first, each
   * "12 text…"). Typographic backgrounds are woven from these, never from the
   * verse being read.
   */
  context?: string[];
  /**
   * Background motion clock (seconds). Advances at a subtle–moderate rate
   * while the verse holds and speeds up during entrance, exit and verse
   * changes, so the background is dynamic exactly when the type moves.
   */
  mt?: number;
  /** Live Pixels generator frame for layouts that declare `generator`. */
  genFrame?: CanvasImageSource | null;
  /**
   * Render passes. `decoP` overrides decoration opacity (1 = fully up, 0 =
   * hidden) — used to hold the background steady while only the text
   * transitions. `noText` draws the background art alone (blend pass).
   */
  decoP?: number;
  noText?: boolean;
}


export type LayoutFamily = 'Transparent' | 'Opaque' | 'Panel' | 'Overlay' | 'Art Council' | 'Typographic' | 'Modern & Abstract' | 'Urban & Grunge';

export interface ScriptureLayout {
  id: string;
  name: string;
  family: LayoutFamily;
  /** transparent = composites over whatever is behind it (camera, visuals). */
  background: 'transparent' | 'opaque';
  director?: string;
  blurb: string;
  /** Needs a redraw every frame even when settled (ambient background motion). */
  animated: boolean;
  /** Uses the TYPO engine background. */
  typoVolume?: string;
  /** Uses a live Pixels generator (VisualizerMode) as background — frame arrives as s.genFrame. */
  generator?: string;
  draw: (ctx: CanvasRenderingContext2D, s: ScriptureState) => void;
}

// ── type & helpers ───────────────────────────────────────────────────────────

export const SERIF = '"Noto Serif", "Palatino Linotype", Palatino, Georgia, serif';
export const SANS = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const DISPLAY = '"Outfit", "Inter", "Segoe UI", sans-serif';
export const GROTESK = '"Space Grotesk", "Inter", "Segoe UI", sans-serif';
export const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';
export const GOLD = '#D4AF37';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeBack = (t: number) => { const c = 1.4, x = clamp01(t) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Overall opacity of decoration (backgrounds, plates, rules) for this frame. */
export function decoAlpha(s: ScriptureState): number {
  if (s.decoP !== undefined) return s.decoP;
  const inA = s.transition === 'crossfade' ? easeOut(s.enterP) : easeOut(s.enterP * 2.2);
  const outA = 1 - easeInOut(s.exitP * (s.transition === 'crossfade' ? 1 : 1.3));
  return clamp01(inA) * clamp01(outA);
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxW && line) { out.push(line); line = w; } else line = probe;
  }
  if (line) out.push(line);
  return out;
}

/** Largest size in [min,max] whose wrapped text fits the box. */
export function fit(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, bw: number, bh: number, lh: number, max: number, min: number) {
  let lo = min, hi = max, best = min, lines: string[] = [];
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = font(mid);
    const L = wrap(ctx, text, bw);
    if (L.length * mid * lh <= bh) { best = mid; lines = L; lo = mid; } else hi = mid;
    if (hi - lo < 0.5) break;
  }
  ctx.font = font(best);
  if (!lines.length) lines = wrap(ctx, text, bw);
  return { size: best, lines };
}

/**
 * Comfortable reading column for a box: the verse never runs wider than a
 * measure tied to screen HEIGHT, so on wide formats it stays a centred column
 * instead of a line that makes the room turn its heads.
 */
export function measure(w: number, h: number, maxFrac = 0.84): number {
  const cls = aspectClass(w, h);
  const byH = cls === 'wall' ? h * 2.0 : cls === 'ultrawide' ? h * 1.75 : h * 1.65;
  return Math.min(w * maxFrac, byH);
}

export interface VerseBox { x: number; y: number; w: number; h: number; align: CanvasTextAlign; valign?: 'top' | 'middle' | 'bottom' }
export interface VerseStyle { font: (s: number) => string; color: string; lh?: number; max: number; min: number; shadow?: number; tracking?: number }

/** Per-word transition transform. */
export function wordFx(s: ScriptureState, i: number, n: number, li: number, nl: number, size: number, w: number, xFrac: number) {
  const id = s.transition;
  const exiting = s.exitP > 0;
  const p = exiting ? 1 - s.exitP : s.enterP;
  let a = 1, dx = 0, dy = 0, sc = 1, blur = 0, track = 0;
  const stagger = (span: number, idx: number, count: number) => clamp01((p - (count > 1 ? (idx / (count - 1)) * span : 0)) / (1 - span));
  switch (id) {
    case 'rise': {
      const q = exiting ? stagger(0.5, n - 1 - i, n) : stagger(0.6, i, n);
      a = easeOut(q); dy = (1 - easeOut(q)) * size * (exiting ? -0.7 : 0.55);
      break;
    }
    case 'focus': {
      const q = easeOut(p);
      a = 0.15 + 0.85 * q; blur = (1 - q) * size * 0.32; track = (1 - q) * size * 0.22;
      break;
    }
    case 'wipe': {
      const lineStart = nl > 1 ? (li / nl) * 0.7 : 0;
      const lp = clamp01((p - lineStart) / 0.3 * (nl > 1 ? 1 : 0.42));
      a = clamp01((lp * 1.25 - xFrac) * 6);
      if (exiting) a = clamp01(((1 - s.exitP) * 1.25 - (1 - xFrac)) * 6);
      break;
    }
    case 'reference': {
      const q = exiting ? p : clamp01((p - 0.42) / 0.58);
      a = easeOut(q); dy = (1 - easeOut(q)) * size * 0.25;
      break;
    }
    case 'split': {
      const q = exiting ? stagger(0.4, nl - 1 - li, nl) : stagger(0.5, li, nl);
      const dir = li % 2 ? 1 : -1;
      a = easeOut(q); dx = dir * (1 - easeOut(q)) * w * 0.22;
      break;
    }
    case 'cascade':
      a = 1; // letters handled individually
      break;
    default:
      a = easeOut(p);
  }
  return { a, dx, dy, sc, blur, track };
}

/** Lay out and draw the verse inside a box, applying the transition. Returns the text block bounds. */
export function drawVerse(ctx: CanvasRenderingContext2D, s: ScriptureState, box: VerseBox, st: VerseStyle) {
  const lh = st.lh ?? 1.32;
  const { size, lines } = fit(ctx, s.text, st.font, box.w, box.h, lh, st.max, st.min);
  const blockH = lines.length * size * lh;
  const top = box.valign === 'top' ? box.y : box.valign === 'bottom' ? box.y + box.h - blockH : box.y + (box.h - blockH) / 2;
  ctx.font = st.font(size);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  const allWords = lines.reduce((n, l) => n + l.split(' ').length, 0);
  let wi = 0;
  const exiting = s.exitP > 0;
  const p = exiting ? 1 - s.exitP : s.enterP;
  if (s.noText) return { top, bottom: top + blockH, size, lines };
  lines.forEach((line, li) => {
    const words = line.split(' ');
    const widths = words.map(w => ctx.measureText(w).width);
    const lineW = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    const x0 = box.align === 'center' ? box.x + (box.w - lineW) / 2 : box.align === 'right' ? box.x + box.w - lineW : box.x;
    const baseY = top + li * size * lh + size * 0.98;
    let x = x0;
    words.forEach((word, k) => {
      const fx = wordFx(s, wi, allWords, li, lines.length, size, s.w, lineW ? (x - x0 + widths[k] / 2) / lineW : 0);
      if (s.transition === 'cascade') {
        // Letter cascade: each letter drops in on its own stagger.
        let lx = x;
        const total = Math.max(1, s.text.length);
        for (const ch of word) {
          const cw = ctx.measureText(ch).width;
          const idx = (wi * 6 + (lx - x0) / Math.max(1, size)) / Math.max(1, total * 0.9);
          const q = exiting ? clamp01((p - (1 - idx) * 0.5) / 0.5) : clamp01((p - idx * 0.65) / 0.35);
          const e = exiting ? easeOut(q) : easeBack(q);
          ctx.globalAlpha = clamp01(q * 1.6) * (exiting ? q : 1);
          if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = st.shadow; ctx.shadowOffsetY = st.shadow * 0.25; }
          ctx.fillStyle = st.color;
          ctx.fillText(ch, lx, baseY - (1 - e) * size * (exiting ? -0.9 : 0.9));
          lx += cw;
        }
      } else if (fx.a > 0.003) {
        ctx.save();
        ctx.globalAlpha = fx.a;
        if (fx.blur > 0.4) ctx.filter = `blur(${fx.blur.toFixed(1)}px)`;
        if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = st.shadow; ctx.shadowOffsetY = st.shadow * 0.25; }
        ctx.fillStyle = st.color;
        const spread = fx.track * (k - (words.length - 1) / 2);
        ctx.fillText(word, x + fx.dx + spread, baseY + fx.dy);
        ctx.restore();
      }
      x += widths[k] + space;
      wi++;
    });
  });
  ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.filter = 'none';
  return { top, bottom: top + blockH, size, lines };
}

/** Reference line (book chapter:verse · translation) with its own entrance. */
export function drawReference(ctx: CanvasRenderingContext2D, s: ScriptureState, x: number, y: number, align: CanvasTextAlign, size: number, color: string, opts: { font?: string; tracking?: number; upper?: boolean } = {}) {
  if (s.noText) return;
  const ref = s.reference + (s.translation ? `  ·  ${s.translation}` : '');
  if (!ref.trim()) return;
  const exiting = s.exitP > 0;
  const p = exiting ? 1 - s.exitP : s.enterP;
  let a = s.transition === 'reference' ? (exiting ? easeOut(p) : easeOut(p * 3)) : easeOut(clamp01((p - 0.35) / 0.65));
  if (s.transition === 'crossfade') a = easeOut(p);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${opts.font ?? `600 ${size}px ${SANS}`}`;
  (ctx as any).letterSpacing = `${Math.round(size * (opts.tracking ?? 0.18))}px`;
  ctx.fillText(opts.upper === false ? ref : ref.toUpperCase(), x, y);
  (ctx as any).letterSpacing = '0px';
  ctx.restore();
}

/** Reference Lead: the reference stands alone, large and centred, before the verse arrives. */
export function drawReferenceLead(ctx: CanvasRenderingContext2D, s: ScriptureState, color: string) {
  if (s.noText) return;
  if (s.transition !== 'reference' || s.exitP > 0 || s.enterP >= 0.6) return;
  const q = s.enterP / 0.6;
  const a = q < 0.25 ? easeOut(q / 0.25) : 1 - easeInOut((q - 0.6) / 0.4);
  if (a <= 0) return;
  const size = Math.min(s.h * 0.11, s.w * 0.08);
  ctx.save();
  ctx.globalAlpha = clamp01(a);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `300 ${size * (1 + 0.04 * q)}px ${DISPLAY}`;
  (ctx as any).letterSpacing = `${Math.round(size * 0.06)}px`;
  ctx.fillText(s.reference, s.w / 2, s.h / 2);
  (ctx as any).letterSpacing = '0px';
  ctx.restore();
}

export function drawCopyright(ctx: CanvasRenderingContext2D, s: ScriptureState, x: number, y: number, align: CanvasTextAlign, color = 'rgba(255,255,255,0.42)') {
  if (s.noText) return;
  if (!s.copyright) return;
  ctx.save();
  ctx.globalAlpha = decoAlpha(s);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.max(11, Math.round(s.h * 0.016))}px ${SANS}`;
  ctx.fillText(s.copyright, x, y);
  ctx.restore();
}

/** Frosted, tinted plate: blurs whatever is already on the canvas beneath it. */
export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: { tint?: string; blur?: number; r?: number; edge?: string; alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const r = o.r ?? Math.min(w, h) * 0.04;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  ctx.clip();
  if ((o.blur ?? 18) > 0) {
    try {
      ctx.filter = `blur(${o.blur ?? 18}px)`;
      ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h);
      ctx.filter = 'none';
    } catch { /* tainted or unsupported — tint alone still gives contrast */ }
  }
  ctx.fillStyle = o.tint ?? 'rgba(8,6,16,0.62)';
  ctx.fillRect(x, y, w, h);
  if (o.edge) { ctx.strokeStyle = o.edge; ctx.lineWidth = Math.max(1, ctx.canvas.height * 0.0012); ctx.stroke(); }
  ctx.restore();
}

/** Slow, living gradient background (ambient motion for opaque layouts). */
export function livingGradient(ctx: CanvasRenderingContext2D, s: ScriptureState, c1: string, c2: string, c3: string) {
  const { w, h, t } = s;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1); g.addColorStop(0.55, c2); g.addColorStop(1, c3);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // drifting light pool
  const cx = w * (0.5 + 0.28 * Math.sin(t * 0.07)), cy = h * (0.42 + 0.18 * Math.cos(t * 0.05));
  const r = Math.max(w, h) * 0.65;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  rg.addColorStop(0, 'rgba(255,255,255,0.08)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
}

/** A light sweep travelling slowly along a rule (ambient motion for transparent layouts). */
export function ruleSweep(ctx: CanvasRenderingContext2D, s: ScriptureState, x: number, y: number, w: number, thick: number, color: string) {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, thick);
  const p = ((s.t * 0.12) % 1.4) - 0.2;
  const sx = x + w * p, sw = w * 0.18;
  const g = ctx.createLinearGradient(sx - sw, 0, sx + sw, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.beginPath(); ctx.rect(x, y - thick, w, thick * 3); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(sx - sw, y - thick, sw * 2, thick * 3); ctx.restore();
}

export const safe = (s: ScriptureState) => Math.min(s.w, s.h) * 0.06;

/** Background motion clock — falls back to wall time when the host doesn't drive one. */
export const motionT = (s: ScriptureState) => s.mt ?? s.t;

/** Text for typographic backgrounds: the chapter's other verses, else the verse itself. */
export function contextText(s: ScriptureState): string {
  return s.context?.length ? s.context.join('  ') : s.text;
}

export const STOP = new Set('THE AND THAT THEY THEM THEIR THERE THIS WITH FROM UNTO SHALL WILL HAVE HATH WHICH WHEN THEN YOUR THOU THEE THINE THY UPON INTO BEEN WERE WHAT WHOM ALSO EVEN SAITH SAID NOT FOR ARE WAS HIS HER HIM YOU ALL BUT'.split(' '));
/** Strong, long words for monumental type (distinct, uppercase). */
export function keyWords(text: string, n: number): string[] {
  const out: string[] = [];
  for (const w of text.toUpperCase().replace(/[^A-Z' ]/g, ' ').split(/\s+/)) {
    const k = w.replace(/'S$/, '');
    if (k.length >= 5 && !STOP.has(k) && !out.includes(k)) out.push(k);
  }
  out.sort((a, b) => b.length - a.length);
  const pick = out.slice(0, n);
  return pick.length ? pick : ['SELAH'];
}

/** One reusable offscreen canvas per size (never allocate per frame). */
export const scratchCanvases = new Map<string, HTMLCanvasElement>();
export function scratch(w: number, h: number): HTMLCanvasElement {
  const k = `${w}x${h}`;
  let c = scratchCanvases.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; scratchCanvases.set(k, c); if (scratchCanvases.size > 8) scratchCanvases.delete(scratchCanvases.keys().next().value as string); }
  return c;
}

/** Standard centred verse — the auditorium default, used by several layouts. */
export function centredVerse(ctx: CanvasRenderingContext2D, s: ScriptureState, o: { color?: string; refColor?: string; font?: (sz: number) => string; shadow?: number; boxH?: number; yC?: number; maxFrac?: number; refFont?: string }) {
  const cls = aspectClass(s.w, s.h);
  const m = safe(s);
  const bw = measure(s.w, s.h, o.maxFrac ?? 0.84);
  const bh = (o.boxH ?? (cls === 'vertical' ? 0.62 : cls === 'wall' ? 0.6 : 0.58)) * s.h;
  const yC = (o.yC ?? 0.46) * s.h;
  const maxSize = cls === 'vertical' ? s.w * 0.085 : cls === 'portrait' ? s.w * 0.07 : s.h * 0.085;
  const r = drawVerse(ctx, s, { x: (s.w - bw) / 2, y: yC - bh / 2, w: bw, h: bh, align: 'center' }, {
    font: o.font ?? (sz => `${sz}px ${SERIF}`), color: o.color ?? '#FFFFFF', max: maxSize, min: s.h * 0.03, shadow: o.shadow,
  });
  const refSize = Math.max(14, r.size * 0.36);
  drawReference(ctx, s, s.w / 2, Math.min(s.h - m * 1.4, r.bottom + refSize * 2.6), 'center', refSize, o.refColor ?? s.accent, o.refFont ? { font: `${o.refFont.replace('{s}', String(refSize))}` } : {});
  drawCopyright(ctx, s, s.w / 2, s.h - m * 0.5, 'center');
  return r;
}


/**
 * The verse on a translucent, frosted plate — used by every layout whose
 * background is made of type, so the scripture being read is never lost in
 * its own decoration.
 */
export function readingPlate(ctx: CanvasRenderingContext2D, s: ScriptureState, a: number, yC = 0.5, round = false) {
  const cls = aspectClass(s.w, s.h);
  const bw = measure(s.w, s.h, cls === 'vertical' ? 0.86 : 0.74);
  const f = fit(ctx, s.text, sz => `${sz}px ${SERIF}`, bw * 0.86, s.h * (cls === 'vertical' ? 0.46 : 0.42), 1.32, cls === 'vertical' ? s.w * 0.07 : s.h * 0.068, s.h * 0.024);
  const ph = f.lines.length * f.size * 1.32 + f.size * 3.2;
  const pw = round ? Math.max(bw, ph * 1.1) : bw;
  const px = (s.w - pw) / 2, py = s.h * yC - ph / 2;
  const grow = easeOut(s.enterP * 1.8) * (1 - easeInOut(s.exitP));
  plate(ctx, px + pw * (1 - grow) / 2, py, pw * grow, ph, { tint: 'rgba(8,6,18,0.66)', blur: s.h * 0.022, r: round ? ph * 0.5 : f.size * 0.6, edge: rgba(s.accent, 0.35), alpha: a });
  drawReferenceLead(ctx, s, '#fff');
  const r = drawVerse(ctx, s, { x: px + (pw - bw * 0.86) / 2, y: py + f.size * 0.9, w: bw * 0.86, h: ph - f.size * 2.6, align: 'center', valign: 'top' }, { font: sz => `${sz}px ${SERIF}`, color: '#FFFFFF', lh: 1.32, max: f.size, min: s.h * 0.022 });
  drawReference(ctx, s, s.w / 2, r.bottom + f.size * 0.95, 'center', Math.max(12, f.size * 0.38), s.accent);
  drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.45, 'center');
}


// ── texture & light (for modern, abstract and grunge looks) ──────────────────

/** Warm analogue light leaks drifting across the frame (additive). */
export function lightLeak(ctx: CanvasRenderingContext2D, s: ScriptureState, colors: string[] = ['#ff7a2f', '#ff3d6e', '#ffd36b'], strength = 0.5) {
  const mt = motionT(s);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  colors.forEach((c, i) => {
    const ph = mt * (0.05 + i * 0.017) + i * 2.1;
    const x = s.w * (0.5 + 0.62 * Math.sin(ph)), y = s.h * (0.5 + 0.55 * Math.cos(ph * 0.83 + i));
    const r = Math.max(s.w, s.h) * (0.35 + 0.15 * Math.sin(ph * 1.7));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, 0.32 * strength)); g.addColorStop(0.45, rgba(c, 0.12 * strength)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
  });
  ctx.restore();
}

/** Film grain / photocopy noise. Animated (re-seeded every ~1/12 s); cheap via a cached noise tile. */
const grainTiles = new Map<number, HTMLCanvasElement>();
export function grain(ctx: CanvasRenderingContext2D, s: ScriptureState, amount = 0.08, tone = 255) {
  const frame = Math.floor(motionT(s) * 12) % 4;
  let tile = grainTiles.get(frame);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = 256; tile.height = 256;
    const t = tile.getContext('2d')!, img = t.createImageData(256, 256);
    let seed = 1234 + frame * 977;
    for (let i = 0; i < img.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const v = seed % 256; img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 128 ? tone : 0; img.data[i + 3] = Math.abs(v - 128) * 2; }
    t.putImageData(img, 0, 0); grainTiles.set(frame, tile);
  }
  ctx.save(); ctx.globalAlpha = amount;
  const pat = ctx.createPattern(tile, 'repeat'); if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, s.w, s.h); }
  ctx.restore();
}

/** Halftone dot field (print/zine texture). */
export function halftone(ctx: CanvasRenderingContext2D, s: ScriptureState, color: string, cell = Math.min(s.w, s.h) * 0.018, angle = 0.4, fade: (x: number, y: number) => number = (x, y) => 0.5 + 0.5 * Math.sin(x * 3 + y * 2)) {
  ctx.save(); ctx.fillStyle = color;
  ctx.translate(s.w / 2, s.h / 2); ctx.rotate(angle);
  const R = Math.hypot(s.w, s.h) / 2;
  for (let y = -R; y < R; y += cell) for (let x = -R; x < R; x += cell) {
    const k = clamp01(fade((x + R) / (2 * R), (y + R) / (2 * R)));
    if (k < 0.04) continue;
    ctx.beginPath(); ctx.arc(x, y, cell * 0.5 * k, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Cover-fit an image/canvas frame (e.g. s.genFrame) into the full frame. */
export function coverFrame(ctx: CanvasRenderingContext2D, s: ScriptureState, img: CanvasImageSource | null | undefined, alpha = 1): boolean {
  if (!img) return false;
  const anyImg: any = img;
  const iw = anyImg.videoWidth || anyImg.width || s.w, ih = anyImg.videoHeight || anyImg.height || s.h;
  const k = Math.max(s.w / iw, s.h / ih);
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.drawImage(img, (s.w - iw * k) / 2, (s.h - ih * k) / 2, iw * k, ih * k);
  ctx.restore();
  return true;
}
