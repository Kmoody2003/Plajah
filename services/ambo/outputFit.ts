// outputFit — how content that does not match the output's aspect ratio is placed on it.
//
// Until now every layer was cover-cropped onto the output, so a 4:3 video or a
// portrait photo lost its edges on a 16:9 screen. Now:
//
//   auto     (default) letterbox / pillarbox ONLY when the aspect really differs
//            (> 1.5 %), nothing is cropped; matching content fills the screen
//   fill     cover — the whole screen is covered, edges are cropped
//   stretch  distort to the frame
//
// The bars are filled, not left black, when the layer is the background:
//
//   blur      the content itself, blown up and softened (the "ambient" look)
//   abstract  slow drifting colour fields built from the content's own palette
//   black / color
//
// Placement (alignment, offset, zoom) is applied to the fitted content, so a
// church with a screen that is partly hidden behind a pillar can shift the
// picture, and a top-aligned lower-third-friendly layout is one click.
//
// `computePlacement` is pure so it is testable without a canvas.

export type FitMode = 'auto' | 'fill' | 'stretch';
export type FitFill = 'black' | 'color' | 'blur' | 'abstract';

export interface FitSpec {
  mode: FitMode;
  /** What fills the bars when content is letterboxed (background layers only). */
  fill: FitFill;
  /** Colour for fill = 'color'. */
  color?: string;
  /** Horizontal / vertical anchor, 0 = left/top … 1 = right/bottom. Default centre. */
  ax: number;
  ay: number;
  /** Extra scale on top of the fit, 0.25 … 4. */
  zoom: number;
  /** Shift as a fraction of the frame, -1 … 1. */
  ox: number;
  oy: number;
}

export const DEFAULT_FIT: FitSpec = { mode: 'auto', fill: 'blur', color: '#000000', ax: 0.5, ay: 0.5, zoom: 1, ox: 0, oy: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);

export function normalizeFit(f?: Partial<FitSpec> | null): FitSpec {
  const m = f?.mode === 'fill' || f?.mode === 'stretch' ? f.mode : 'auto';
  const fill: FitFill = f?.fill === 'black' || f?.fill === 'color' || f?.fill === 'abstract' ? f.fill : (f?.fill === 'blur' ? 'blur' : DEFAULT_FIT.fill);
  return {
    mode: m, fill,
    color: typeof f?.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(f.color) ? f.color : DEFAULT_FIT.color,
    ax: clamp(num(f?.ax, 0.5), 0, 1), ay: clamp(num(f?.ay, 0.5), 0, 1),
    zoom: clamp(num(f?.zoom, 1), 0.25, 4),
    ox: clamp(num(f?.ox, 0), -1, 1), oy: clamp(num(f?.oy, 0), -1, 1),
  };
}

/** Anchor presets for a 3×3 alignment grid. */
export const ALIGN_PRESETS: Array<{ id: string; label: string; ax: number; ay: number }> = [
  { id: 'tl', label: 'Top left', ax: 0, ay: 0 }, { id: 'tc', label: 'Top', ax: 0.5, ay: 0 }, { id: 'tr', label: 'Top right', ax: 1, ay: 0 },
  { id: 'ml', label: 'Left', ax: 0, ay: 0.5 }, { id: 'mc', label: 'Centre', ax: 0.5, ay: 0.5 }, { id: 'mr', label: 'Right', ax: 1, ay: 0.5 },
  { id: 'bl', label: 'Bottom left', ax: 0, ay: 1 }, { id: 'bc', label: 'Bottom', ax: 0.5, ay: 1 }, { id: 'br', label: 'Bottom right', ax: 1, ay: 1 },
];

export interface Placement {
  x: number; y: number; w: number; h: number;
  /** Content does not cover the whole frame → the bars need a fill. */
  letterboxed: boolean;
  /** Which way the bars run. */
  bars: 'none' | 'side' | 'top';
}

/** Aspect difference (ratio) under which content is treated as already matching. */
export const ASPECT_TOLERANCE = 0.015;

export function computePlacement(natural: { w: number; h: number } | null | undefined, frame: { w: number; h: number }, fitIn?: Partial<FitSpec> | null): Placement {
  const fit = normalizeFit(fitIn);
  const full: Placement = { x: 0, y: 0, w: frame.w, h: frame.h, letterboxed: false, bars: 'none' };
  if (!natural || !natural.w || !natural.h || !frame.w || !frame.h) return full;

  const ca = natural.w / natural.h, fa = frame.w / frame.h;
  const mismatch = Math.abs(ca / fa - 1) > ASPECT_TOLERANCE;
  const moved = fit.zoom !== 1 || fit.ox !== 0 || fit.oy !== 0 || fit.ax !== 0.5 || fit.ay !== 0.5;

  if (fit.mode === 'stretch') return full;
  if (!mismatch && !moved) return full;           // matching content: edge to edge, no bars

  const scale = (fit.mode === 'fill' ? Math.max(frame.w / natural.w, frame.h / natural.h) : Math.min(frame.w / natural.w, frame.h / natural.h)) * fit.zoom;
  const w = natural.w * scale, h = natural.h * scale;
  const x = (frame.w - w) * fit.ax + fit.ox * frame.w;
  const y = (frame.h - h) * fit.ay + fit.oy * frame.h;
  const eps = 0.5;
  const covers = x <= eps && y <= eps && x + w >= frame.w - eps && y + h >= frame.h - eps;
  const bars = covers ? 'none' : (w < frame.w - eps && h >= frame.h - eps) ? 'side' : 'top';
  return { x, y, w, h, letterboxed: !covers, bars: covers ? 'none' : bars };
}

// ── drawing ─────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;
export interface BackdropScratch { small: HTMLCanvasElement | null; }

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Draw `img` into a tiny canvas (cover) — the basis of both the blur and the abstraction. */
function sample(scratch: BackdropScratch, img: CanvasImageSource, natural: { w: number; h: number }, frame: { w: number; h: number }): HTMLCanvasElement | null {
  const W = 48, H = Math.max(8, Math.round(48 * frame.h / frame.w));
  if (!scratch.small || scratch.small.width !== W || scratch.small.height !== H) scratch.small = makeCanvas(W, H);
  const sctx = scratch.small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  const s = Math.max(W / natural.w, H / natural.h), dw = natural.w * s, dh = natural.h * s;
  try { sctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch { return null; }
  return scratch.small;
}

function palette(small: HTMLCanvasElement): string[] {
  const c = small.getContext('2d', { willReadFrequently: true });
  if (!c) return ['#1b1530', '#2b1a3f', '#0d1626'];
  const W = small.width, H = small.height, out: string[] = [];
  const pts: Array<[number, number]> = [[0.2, 0.25], [0.8, 0.25], [0.5, 0.5], [0.2, 0.78], [0.8, 0.78]];
  try {
    for (const [px, py] of pts) {
      const d = c.getImageData(Math.floor(px * (W - 1)), Math.floor(py * (H - 1)), 1, 1).data;
      out.push(`rgb(${d[0]},${d[1]},${d[2]})`);
    }
  } catch { return ['#1b1530', '#2b1a3f', '#0d1626']; }
  return out;
}

/** Fill the whole frame behind letterboxed content. Cheap: it works from a 48 px sample. */
export function drawBackdrop(ctx: Ctx, fit: FitSpec, img: CanvasImageSource, natural: { w: number; h: number }, frame: { w: number; h: number }, t: number, scratch: BackdropScratch) {
  const { w, h } = frame;
  if (fit.fill === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
  if (fit.fill === 'color') { ctx.fillStyle = fit.color || '#000'; ctx.fillRect(0, 0, w, h); return; }
  const small = sample(scratch, img, natural, frame);
  if (!small) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return; }
  ctx.save();
  if (fit.fill === 'blur') {
    // 48 px → full frame with smoothing is a soft blur for the price of one drawImage.
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, 0, w, h);          // dim so the real picture reads on top
  } else {
    // abstract: drifting radial colour fields from the content's own palette
    const pal = palette(small);
    ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const R = Math.max(w, h) * 0.7;
    pal.forEach((col, i) => {
      const ph = i * 1.7;
      const cx = w * (0.5 + 0.42 * Math.sin(t * 0.11 + ph)), cy = h * (0.5 + 0.42 * Math.cos(t * 0.09 + ph * 1.3));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.7 + 0.25 * Math.sin(t * 0.13 + ph)));
      g.addColorStop(0, col.replace('rgb(', 'rgba(').replace(')', ',0.85)'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Layer slots whose letterbox bars get a backdrop (the picture under everything else). */
export const BACKDROP_SLOTS = new Set(['background', 'fill']);
