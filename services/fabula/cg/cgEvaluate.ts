// cgEvaluate — resolve a CgGraphic at graphic-local time t for total duration D.
// Pure and deterministic (no Math.random, no Date unless the caller passes `now`),
// so every host draws the same frame. See cgTypes.ts for the timing contract.
import { glyphStates, type GlyphState } from '../titleAnimators';
import {
  CG_W, CG_H,
  type CgGraphic, type CgGraphicRef, type CgLayer, type CgMove, type CgEase, type CgPalette, type CgColor, type CgKeyProp,
} from './cgTypes';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function cgEase(kind: CgEase | undefined, p: number): number {
  p = clamp01(p);
  switch (kind) {
    case 'linear': return p;
    case 'in': return p * p * p;
    case 'inOut': return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    case 'back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
    case 'expo': return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
    case 'quart': return 1 - Math.pow(1 - p, 4);
    case 'circ': return Math.sqrt(1 - Math.pow(p - 1, 2));
    case 'elastic': { if (p === 0 || p === 1) return p; const c4 = (2 * Math.PI) / 3; return Math.pow(2, -10 * p) * Math.sin((p * 10 - .75) * c4) + 1; }
    case 'bounce': { const n1 = 7.5625, d1 = 2.75; if (p < 1 / d1) return n1 * p * p; if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + .75; if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + .9375; return n1 * (p -= 2.625 / d1) * p + .984375; }
    default: return 1 - Math.pow(1 - p, 3);
  }
}

export function resolveCgColor(c: CgColor | undefined, pal: CgPalette): string {
  if (!c) return pal.ink;
  return (pal as unknown as Record<string, string>)[c] || c;
}

/** Substitute {field} placeholders. Unknown fields resolve to ''. */
export function fillTemplate(text: string, fields: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => fields[k] ?? '');
}

/** Field defaults overlaid with the ref's values. */
export function resolveFields(g: CgGraphic, ref?: CgGraphicRef | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of g.fields) out[f.key] = f.default;
  if (ref?.fields) for (const [k, v] of Object.entries(ref.fields)) if (v != null) out[k] = v;
  return out;
}

export function resolvePalette(g: CgGraphic, ref?: CgGraphicRef | null): CgPalette {
  return ref?.palette ? { ...g.palette, ...ref.palette } as CgPalette : g.palette;
}

export interface CgResolvedLayer {
  layer: CgLayer;
  x: number; y: number; w: number; h: number;
  opacity: number;
  sx: number; sy: number;
  rotation: number;
  /** Animated skew (degrees) from a 'skew' move — the layer's static `skew` is drawn as geometry. */
  skewX: number;
  /** Pivot (absolute design px). */
  px: number; py: number;
  /** Wipe clip (absolute design px) or ellipse iris. */
  clip: { x: number; y: number; w: number; h: number; ellipse?: boolean } | null;
  blur: number;
  /** Loop phase 0..1 and elapsed loop seconds, for renderers (shimmer/scroll). */
  loopPhase: number;
  loopTime: number;
  /** Resolved text (fields substituted, case applied) and glyph states when animating. */
  text?: string;
  glyphs?: GlyphState[] | null;
  /** Ticker items. */
  items?: string[];
  /** Image src resolved from fields. */
  src?: string;
}

export interface CgFrame {
  layers: CgResolvedLayer[];
  palette: CgPalette;
  fields: Record<string, string>;
  /** True while any layer is moving — hosts may cache the resting frame otherwise. */
  animating: boolean;
  /** 'in' | 'hold' | 'out' | 'done' — whole-graphic phase. */
  phase: 'in' | 'hold' | 'out' | 'done';
  /** Offset/scale applied to the whole graphic. */
  offset: { x: number; y: number; scale: number };
}

export interface CgEvalContext {
  /** Wall clock (ms since epoch) for time-of-day clocks. Default: 0 (renders 00:00) — hosts pass Date.now(). */
  now?: number;
}

function sampleKeys(keys: { t: number; v: number; ease?: CgEase }[] | undefined, t: number, D: number): number | undefined {
  if (!keys || !keys.length) return undefined;
  const abs = keys.map(k => ({ ...k, t: k.t < 0 ? (Number.isFinite(D) ? D + k.t : Infinity) : k.t })).filter(k => Number.isFinite(k.t)).sort((a, b) => a.t - b.t);
  if (!abs.length) return keys[0].v;
  if (t <= abs[0].t) return abs[0].v;
  for (let i = 1; i < abs.length; i++) {
    const a = abs[i - 1], b = abs[i];
    if (t <= b.t) return a.v + (b.v - a.v) * cgEase(b.ease || 'inOut', (t - a.t) / Math.max(1e-4, b.t - a.t));
  }
  return abs[abs.length - 1].v;
}

function applyMove(r: CgResolvedLayer, m: CgMove, k: number, dir: 1 | -1) {
  // k = 1 → fully away/hidden, 0 → resting.
  if (k <= 0) return;
  const amt = m.amount ?? 1.15;
  switch (m.type) {
    case 'fade': r.opacity *= 1 - k; break;
    case 'slideL': r.x -= r.w * amt * k * dir; break;
    case 'slideR': r.x += r.w * amt * k * dir; break;
    case 'slideU': r.y -= r.h * amt * k * dir; break;
    case 'slideD': r.y += r.h * amt * k * dir; break;
    case 'wipeL': r.clip = { x: r.x + (dir === 1 ? r.w * k : 0), y: r.y - r.h, w: r.w * (1 - k), h: r.h * 3 }; break;
    case 'wipeR': r.clip = { x: r.x + (dir === 1 ? 0 : r.w * k), y: r.y - r.h, w: r.w * (1 - k), h: r.h * 3 }; break;
    case 'wipeU': r.clip = { x: r.x - r.w, y: r.y + (dir === 1 ? r.h * k : 0), w: r.w * 3, h: r.h * (1 - k) }; break;
    case 'wipeD': r.clip = { x: r.x - r.w, y: r.y + (dir === 1 ? 0 : r.h * k), w: r.w * 3, h: r.h * (1 - k) }; break;
    case 'wipeCenterX': r.clip = { x: r.x + r.w * k / 2, y: r.y - r.h, w: r.w * (1 - k), h: r.h * 3 }; break;
    case 'wipeCenterY': r.clip = { x: r.x - r.w, y: r.y + r.h * k / 2, w: r.w * 3, h: r.h * (1 - k) }; break;
    case 'iris': { const s = (1 - k) * Math.hypot(r.w, r.h); r.clip = { x: r.px - s / 2, y: r.py - s / 2, w: s, h: s, ellipse: true }; break; }
    case 'growX': r.sx *= 1 - k; r.px = dir === 1 ? r.x : r.x + r.w; break;
    case 'growY': r.sy *= 1 - k; r.py = r.y + r.h; break;
    case 'pop': r.sx *= 1 - k; r.sy *= 1 - k; r.opacity *= Math.min(1, (1 - k) * 2); break;
    case 'zoom': { const z = 1 + (amt === 1.15 ? .35 : amt - 1) * k; r.sx *= z; r.sy *= z; r.opacity *= 1 - k; break; }
    case 'spin': r.rotation += (m.amount ?? 90) * k * dir; r.opacity *= 1 - k * .7; break;
    case 'drop': r.y -= r.h * 2 * k * dir; r.opacity *= 1 - k * .5; break;
    case 'blur': r.blur += 24 * k; r.opacity *= 1 - k * .8; break;
    case 'flipX': r.sx *= Math.cos(k * Math.PI / 2); break;
    case 'flipY': r.sy *= Math.cos(k * Math.PI / 2); break;
    case 'skew': r.skewX += (m.amount ?? 30) * k * dir; r.x -= r.w * .4 * k * dir; r.opacity *= 1 - k; break;
  }
}

/** Seconds into the graphic at which the OUT of a move starts (for duration D). */
function outStart(m: CgMove, D: number) { return D - (m.delay || 0) - m.dur; }

/** Resolve the frame. t and D are seconds; D = Infinity holds forever. */
export function evaluateCg(g: CgGraphic, t: number, D: number, ref?: CgGraphicRef | null, ctx: CgEvalContext = {}): CgFrame {
  const fields = resolveFields(g, ref);
  const palette = resolvePalette(g, ref);
  const off = { x: ref?.offset?.x || 0, y: ref?.offset?.y || 0, scale: ref?.offset?.scale ?? 1 };
  let animating = false;
  const layers: CgResolvedLayer[] = [];
  const outBegin = Number.isFinite(D) ? D - g.timing.out : Infinity;
  const phase: CgFrame['phase'] = t >= D ? 'done' : t >= outBegin ? 'out' : t < g.timing.in ? 'in' : 'hold';

  for (const l of g.layers) {
    if (l.hidden) continue;
    const kx = sampleKeys(l.keys?.x, t, D), ky = sampleKeys(l.keys?.y, t, D), kw = sampleKeys(l.keys?.w, t, D), kh = sampleKeys(l.keys?.h, t, D);
    const ko = sampleKeys(l.keys?.opacity, t, D), kr = sampleKeys(l.keys?.rotation, t, D), ks = sampleKeys(l.keys?.scale, t, D);
    if (l.keys && Object.values(l.keys).some(a => a && a.length > 1)) animating = true;
    const x = kx ?? l.x, y = ky ?? l.y, w = kw ?? l.w, h = kh ?? l.h;
    const r: CgResolvedLayer = {
      layer: l, x, y, w, h, opacity: ko ?? (l.opacity ?? 1), sx: ks ?? 1, sy: ks ?? 1, rotation: kr ?? (l.rotation || 0), skewX: 0, // static skew is drawn as a parallelogram path; skewX carries only animated skew
      px: x + w / 2, py: y + h / 2, clip: null, blur: 0, loopPhase: 0, loopTime: 0,
    };
    // IN
    const inM = l.in && l.in.type !== 'none' ? l.in : null;
    if (inM) {
      const p = cgEase(inM.ease, (t - (inM.delay || 0)) / Math.max(1e-3, inM.dur));
      if (p < 1) { applyMove(r, inM, 1 - p, 1); animating = true; }
    }
    // OUT (defaults to a short mirrored fade of the IN when absent)
    const outM: CgMove | null = l.out ? (l.out.type === 'none' ? null : l.out) : inM ? { type: 'fade', dur: Math.min(.4, g.timing.out || .4), ease: 'inOut' } : null;
    if (outM && Number.isFinite(D)) {
      const s = outStart(outM, D);
      if (t > s) { applyMove(r, outM, cgEase(outM.ease, (t - s) / Math.max(1e-3, outM.dur)), -1); animating = true; }
    }
    // LOOP (runs from the end of this layer's IN)
    if (l.loop && l.loop.type !== 'none' && l.loop.period > 0) {
      const lt = Math.max(0, t - (inM ? (inM.delay || 0) + inM.dur : 0));
      r.loopTime = lt; r.loopPhase = (lt / l.loop.period) % 1;
      const a = l.loop.amount, ph = r.loopPhase * Math.PI * 2;
      switch (l.loop.type) {
        case 'pulse': { const s = 1 + (a ?? .04) * Math.sin(ph); r.sx *= s; r.sy *= s; break; }
        case 'breathe': r.opacity *= 1 - (a ?? .25) * (.5 - .5 * Math.cos(ph)); break;
        case 'float': r.y += (a ?? 6) * Math.sin(ph); break;
        case 'drift': r.x += (a ?? 10) * Math.sin(ph); r.y += (a ?? 10) * .5 * Math.sin(ph * 2); break;
        case 'rotate': r.rotation += (a ?? 360) * r.loopPhase; break;
        case 'blink': if (r.loopPhase > .5) r.opacity *= .15; break;
        case 'flip': r.sy *= Math.abs(Math.cos(Math.min(1, r.loopPhase * 6) * Math.PI)); break;
        // shimmer / sweep / scroll are drawn by the renderer from loopPhase/loopTime
      }
      animating = true;
    }
    r.opacity = clamp01(r.opacity);
    if (r.opacity <= .002 || Math.abs(r.sx) <= .002 || Math.abs(r.sy) <= .002) continue;
    if (r.clip && (r.clip.w <= .5 || r.clip.h <= .5)) continue;

    // Content
    if (l.kind === 'text' && l.text != null) {
      let s = fillTemplate(l.text, fields);
      if (l.style?.upper) s = s.toUpperCase();
      if (!s.trim()) continue;
      r.text = s;
      if (l.style?.anim && l.style.anim.type !== 'none') {
        const glyphs = glyphStates(s, t, l.style.anim, Number.isFinite(D) ? D : Infinity);
        if (glyphs.some(gl => gl.opacity < 1 || gl.dx || gl.dy || gl.scale !== 1 || gl.blur || gl.spacing)) { r.glyphs = glyphs; animating = true; }
        else r.glyphs = null;
      }
    } else if (l.kind === 'ticker' && l.ticker) {
      const raw = fields[l.ticker.field] ?? '';
      r.items = raw.split(/\s*[|\n]\s*/).map(s => s.trim()).filter(Boolean);
      r.loopTime = Math.max(0, t - (inM ? (inM.delay || 0) + inM.dur : 0));
      animating = true;
    } else if (l.kind === 'clock' && l.clock) {
      r.text = clockText(l.clock.mode, l.clock.field ? fields[l.clock.field] : undefined, t, ctx.now ?? 0);
      animating = true;
    } else if (l.kind === 'image') {
      const s = l.src ? (fields[l.src] ?? l.src) : '';
      if (!s) continue;
      r.src = s;
    }
    layers.push(r);
  }
  return { layers, palette, fields, animating, phase, offset: off };
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
/** Parse "90", "1:30" or "01:02:03" to seconds. */
export function parseDuration(s: string | undefined): number {
  if (!s) return 0;
  const parts = s.trim().split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
export function formatClock(sec: number): string {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function clockText(mode: string, field: string | undefined, t: number, now: number): string {
  switch (mode) {
    case 'countdown': return formatClock(Math.ceil(parseDuration(field) - t));
    case 'countup': return formatClock(parseDuration(field) + t);
    case 'date': { const d = new Date(now); return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase(); }
    case 'time24': { const d = new Date(now); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    default: { const d = new Date(now); const h = d.getHours() % 12 || 12; return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; }
  }
}

/** Measured IN/OUT from the layers (for authoring tools that recompute timing). */
export function measureTiming(g: CgGraphic): { in: number; out: number } {
  let tin = 0, tout = 0;
  for (const l of g.layers) {
    if (l.in && l.in.type !== 'none') tin = Math.max(tin, (l.in.delay || 0) + l.in.dur);
    if (l.out && l.out.type !== 'none') tout = Math.max(tout, (l.out.delay || 0) + l.out.dur);
    const a = l.style?.anim; if (a && a.type !== 'none') { tin = Math.max(tin, (a.delay || 0) + a.duration); tout = Math.max(tout, a.out || 0); }
  }
  return { in: Math.round(tin * 100) / 100, out: Math.round(tout * 100) / 100 };
}

/** Default timeline duration for a graphic. */
export function cgDefaultDuration(g: CgGraphic): number {
  if (g.live === 'transition') return g.timing.in + g.timing.out;
  return Math.round((g.timing.in + g.timing.hold + g.timing.out) * 10) / 10;
}

/** Resting bounding box (design px) — safe-area checks and thumbnails. */
export function cgBounds(g: CgGraphic): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of g.layers) { if (l.hidden) continue; x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y); x1 = Math.max(x1, l.x + l.w); y1 = Math.max(y1, l.y + l.h); }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: CG_W, h: CG_H };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Title-safe (90%) check — returns layers that break it. */
export function cgSafeAreaViolations(g: CgGraphic, safe = .9): string[] {
  if (g.coverage === 'full') return [];
  const mx = CG_W * (1 - safe) / 2, my = CG_H * (1 - safe) / 2;
  return g.layers.filter(l => !l.hidden && (l.kind === 'text' || l.kind === 'clock') && (l.x < mx || l.y < my || l.x + l.w > CG_W - mx || l.y + l.h > CG_H - my)).map(l => l.id);
}

export type { CgKeyProp };
