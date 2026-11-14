// visualFill — any Plajah visual as a paint: shape fill, gradient map, mask or
// texture, not just a colour/gradient/image.
//
// A VisualSource names something that produces frames:
//   stage     every Stage visualizer — Pixels GLSL generators, Flux 3D scenes,
//             Studio GL, Milkdrop presets, Chora kinetic typography and the shader
//             library (value = the Stage visualizer value, e.g. 'STUDIO_AURORA',
//             'MILKDROP:<preset>', 'TYPO:<key>', 'SHADER:<name>')
//   worship   the 72 Chora worship visualizers (pure Canvas2D, no GPU context)
//   live      a live video feed: an app-bus channel (switcher:pgm, ambo:audience,
//             fabula:graphics…) or 'camera' / 'camera:<deviceId>'
//   avatar    a live 3D avatar (registered by the avatar module)
//   (anything else via registerVisualProvider)
//
// Frames are pooled by (source, size): ten shapes painted with the same visualizer
// share ONE instance (one WebGL context), and instances no shape has asked for in
// 8 s are disposed — browsers cap WebGL contexts at ~16. Callers never await:
// visualFrame() returns null until the source is warm, then the latest frame.
export type VisualEngine = 'stage' | 'worship' | 'live' | 'avatar' | (string & {});

export interface VisualSource {
  engine: VisualEngine;
  value: string;
  params?: Record<string, number | string>;
  /** Audio reactivity: the Stage/program master bus, the live input, or none. */
  audio?: 'master' | 'live-input' | 'none';
}

export type VisualPaintMode = 'fill' | 'texture' | 'mask' | 'gradient-map';
export interface VisualPaint {
  source: VisualSource;
  /** fill = the visual inside the shape · texture = tiled pattern · mask = the shape's own
   *  fill revealed by the visual's brightness · gradient-map = visual brightness → the shape's gradient. */
  mode: VisualPaintMode;
  fit?: 'cover' | 'contain' | 'stretch';
  /** Texture tile scale (1 = native). */
  scale?: number;
  opacity?: number;
  /** Mask: invert the luminance. */
  invert?: boolean;
}

export interface VisualInstance { frame(t: number): CanvasImageSource | null; ready(): boolean; dispose(): void; resize?(w: number, h: number): void }
export interface VisualEntry { engine: VisualEngine; value: string; name: string; group: string; hint?: string }
export interface VisualProvider {
  engine: VisualEngine;
  label: string;
  create(src: VisualSource, w: number, h: number): VisualInstance;
  catalog?(): Promise<VisualEntry[]>;
}

const providers = new Map<string, VisualProvider>();
export function registerVisualProvider(p: VisualProvider) { providers.set(p.engine, p); }
export function visualProviders(): VisualProvider[] { return [...providers.values()]; }

export async function visualCatalog(): Promise<VisualEntry[]> {
  const lists = await Promise.all([...providers.values()].map(p => (p.catalog ? p.catalog().catch(() => []) : Promise.resolve([]))));
  return lists.flat();
}

// ── pool ────────────────────────────────────────────────────────────────────
interface Pooled { inst: VisualInstance; last: number; t0: number }
const pool = new Map<string, Pooled>();
const keyOf = (s: VisualSource, w: number, h: number) => `${s.engine}|${s.value}|${s.audio || ''}|${JSON.stringify(s.params || {})}|${w}x${h}`;
/** Quantise sizes so a resizing shape doesn't spawn a new instance per pixel. */
export function bucketSize(w: number, h: number): { w: number; h: number } {
  const q = (v: number) => Math.max(64, Math.min(1280, Math.ceil(v / 64) * 64));
  return { w: q(w), h: q(h) };
}

export function visualFrame(src: VisualSource, w: number, h: number, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())): CanvasImageSource | null {
  const p = providers.get(src.engine); if (!p) return null;
  const b = bucketSize(w, h);
  const k = keyOf(src, b.w, b.h);
  let e = pool.get(k);
  if (!e) {
    try { e = { inst: p.create(src, b.w, b.h), last: now, t0: now }; } catch { return null; }
    pool.set(k, e);
    scheduleGc();
  }
  e.last = now;
  try { return e.inst.ready() ? e.inst.frame((now - e.t0) / 1000) : null; } catch { return null; }
}

let gcTimer: ReturnType<typeof setInterval> | null = null;
function scheduleGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const [k, e] of pool) if (now - e.last > 8000) { try { e.inst.dispose(); } catch { /* */ } pool.delete(k); }
    if (!pool.size && gcTimer) { clearInterval(gcTimer); gcTimer = null; }
  }, 2000);
}
export function visualPoolSize() { return pool.size; }
export function disposeAllVisuals() { for (const e of pool.values()) { try { e.inst.dispose(); } catch { /* */ } } pool.clear(); }

// ── painting helpers (Canvas2D) ─────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function srcSize(img: CanvasImageSource): { w: number; h: number } {
  const a = img as any;
  return { w: a.videoWidth || a.naturalWidth || a.displayWidth || a.width || 1, h: a.videoHeight || a.naturalHeight || a.displayHeight || a.height || 1 };
}
let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
function scratchCanvas(w: number, h: number) {
  if (!scratch) scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!scratch) return null;
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  return scratch;
}

/** Draw `img` into box with fit, assuming the caller has clipped to the shape. */
export function drawFitted(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number, fit: VisualPaint['fit'] = 'cover') {
  const s = srcSize(img);
  if (fit === 'stretch') { ctx.drawImage(img, x, y, w, h); return; }
  const k = (fit === 'contain' ? Math.min : Math.max)(w / s.w, h / s.h);
  const dw = s.w * k, dh = s.h * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Tiled pattern of the frame (texture mode). */
export function texturePattern(ctx: Ctx, img: CanvasImageSource, scale = 1, x = 0, y = 0): CanvasPattern | null {
  const p = ctx.createPattern(img, 'repeat'); if (!p) return null;
  if (typeof DOMMatrix !== 'undefined' && (p as any).setTransform) (p as any).setTransform(new DOMMatrix().translate(x, y).scale(scale, scale));
  return p;
}

/**
 * Luminance-driven passes (mask / gradient map) run on a small scratch canvas
 * (≤ 320 px wide) and are scaled up — they're decorative, so this keeps them
 * real-time on any machine.
 */
export function lumaPass(img: CanvasImageSource, w: number, h: number, mode: 'mask' | 'gradient-map', opts: { invert?: boolean; lut?: Uint8ClampedArray; fill?: string } = {}): CanvasImageSource | null {
  const k = Math.min(1, 320 / Math.max(1, w));
  const sw = Math.max(8, Math.round(w * k)), sh = Math.max(8, Math.round(h * k));
  const c = scratchCanvas(sw, sh); if (!c) return null;
  const x = c.getContext('2d', { willReadFrequently: true } as any) as Ctx | null; if (!x) return null;
  x.clearRect(0, 0, sw, sh);
  drawFitted(x, img, 0, 0, sw, sh, 'cover');
  const id = x.getImageData(0, 0, sw, sh), d = id.data;
  let fr = 255, fg = 255, fb = 255;
  if (mode === 'mask' && opts.fill) { const m = opts.fill.match(/^#([0-9a-f]{6})$/i); if (m) { fr = parseInt(m[1].slice(0, 2), 16); fg = parseInt(m[1].slice(2, 4), 16); fb = parseInt(m[1].slice(4, 6), 16); } }
  for (let i = 0; i < d.length; i += 4) {
    let l = (d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8;
    if (opts.invert) l = 255 - l;
    if (mode === 'mask') { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = (l * d[i + 3]) / 255; }
    else if (opts.lut) { const j = l * 4; d[i] = opts.lut[j]; d[i + 1] = opts.lut[j + 1]; d[i + 2] = opts.lut[j + 2]; d[i + 3] = (opts.lut[j + 3] * d[i + 3]) / 255; }
  }
  x.putImageData(id, 0, 0);
  return c as CanvasImageSource;
}

/** 256-entry RGBA lookup from gradient stops (hex colours, offsets 0..1). */
export function gradientLut(stops: [number, string][]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  const parsed = stops.map(([o, c]) => {
    const m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? parseInt(m[2], 16) : 255] : [255, 255, 255, 255];
    return { o: Math.max(0, Math.min(1, o)), rgb };
  }).sort((a, b) => a.o - b.o);
  if (!parsed.length) parsed.push({ o: 0, rgb: [0, 0, 0, 255] }, { o: 1, rgb: [255, 255, 255, 255] });
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = parsed[0], b = parsed[parsed.length - 1];
    for (let j = 0; j < parsed.length - 1; j++) if (t >= parsed[j].o && t <= parsed[j + 1].o) { a = parsed[j]; b = parsed[j + 1]; break; }
    const f = b.o > a.o ? (t - a.o) / (b.o - a.o) : 0;
    for (let ch = 0; ch < 4; ch++) lut[i * 4 + ch] = a.rgb[ch] + (b.rgb[ch] - a.rgb[ch]) * Math.max(0, Math.min(1, f));
  }
  return lut;
}
