/**
 * Text as an effect input.
 *
 * Several catalog effects are really "a picture of some text, styled" — a camcorder's status
 * burn-in, a HUD readout, a terminal crawl. Rather than teach GLSL to draw glyphs, we rasterise
 * the string into the effect's existing AUX texture and let the shader treat it as coverage. One
 * mechanism, and any future effect that declares an aux input can consume text for free.
 *
 * Everything here is deterministic: a frame's text depends only on the spec and the clip-local
 * time, never on the wall clock. That is what keeps the monitor and the export identical, and it
 * is why the date/clock tokens read from `spec.epochMs` instead of Date.now().
 */

export type TextAlign = 'left' | 'center' | 'right';
export type TextVAlign = 'top' | 'middle' | 'bottom';
export type TextCase = 'none' | 'upper' | 'lower';

export interface TextOverlaySpec {
  /** Raw string, may contain newlines and {tokens} (see resolveTextTokens). */
  text: string;
  /** CSS font family stack. Monospace is the sane default for counters and status burn-ins. */
  font?: string;
  /** Cap height as a fraction of frame height, so the burn-in scales with the format. */
  size?: number;
  weight?: number | string;
  italic?: boolean;
  align?: TextAlign;
  valign?: TextVAlign;
  /** Inset from the chosen corner, as a fraction of frame width/height. */
  padX?: number;
  padY?: number;
  /** Extra letter-spacing in em. Canvas letterSpacing is uneven across engines, so we step glyphs. */
  tracking?: number;
  lineGap?: number;
  color?: string;
  opacity?: number;
  caseMode?: TextCase;
  /** Timecode/counter origin, in frames, so a burn-in can start at 01:00:00:00. */
  startFrame?: number;
  /** Fixed origin for date/clock tokens. Absent means those tokens stay unresolved. */
  epochMs?: number;
}

export interface TextOverlayCtx {
  /** Seconds from the head of the clip. */
  localT: number;
  fps: number;
}

const DEFAULTS = {
  font: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  size: 0.055,
  weight: 600,
  align: 'left' as TextAlign,
  valign: 'top' as TextVAlign,
  padX: 0.04,
  padY: 0.05,
  tracking: 0,
  lineGap: 0.32,
  color: '#ffffff',
  opacity: 1,
  caseMode: 'none' as TextCase,
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** HH:MM:SS:FF for a frame count at a given rate. Non-drop; negative counts clamp to zero. */
export function formatTimecode(frame: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps || 24));
  const f = Math.max(0, Math.floor(frame));
  const total = Math.floor(f / rate);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}:${pad2(f % rate)}`;
}

function counter(arg: string | undefined, frame: number, fps: number): string {
  // {count} counts seconds; {count:start,step,pad} counts them from `start` by `step`.
  const [startRaw, stepRaw, padRaw] = (arg || '').split(',');
  const start = Number(startRaw);
  const step = Number(stepRaw);
  const width = Number(padRaw);
  const seconds = Math.floor(frame / Math.max(1, Math.round(fps || 24)));
  const value = (Number.isFinite(start) ? start : 0) + seconds * (Number.isFinite(step) && step !== 0 ? step : 1);
  const rounded = Math.round(value * 1000) / 1000;
  const text = String(rounded);
  return Number.isFinite(width) && width > 0 ? text.padStart(Math.floor(width), '0') : text;
}

/**
 * Expand {tokens} against clip-local time. Unknown tokens are left verbatim so a stray brace in
 * someone's copy never silently eats their text.
 *
 *   {tc} {frame} {sec} {ms} {count} {count:start,step,pad} {date} {clock} {ampm}
 */
export function resolveTextTokens(spec: TextOverlaySpec, ctx: TextOverlayCtx): string {
  const fps = Math.max(1, ctx.fps || 24);
  const frame = Math.max(0, Math.round((ctx.localT || 0) * fps)) + Math.max(0, Math.floor(spec.startFrame || 0));
  const seconds = frame / fps;
  const stamp = spec.epochMs !== undefined ? new Date(spec.epochMs + Math.floor(seconds * 1000)) : null;

  const out = (spec.text || '').replace(/\{(\w+)(?::([^}]*))?\}/g, (whole: string, name: string, arg?: string) => {
    switch (name) {
      case 'tc': return formatTimecode(frame, fps);
      case 'frame': return String(frame);
      case 'sec': return seconds.toFixed(1);
      case 'ms': return String(Math.floor(seconds * 1000));
      case 'count': return counter(arg, frame, fps);
      case 'date': return stamp ? `${stamp.getFullYear()}-${pad2(stamp.getMonth() + 1)}-${pad2(stamp.getDate())}` : whole;
      case 'clock': return stamp ? `${pad2(stamp.getHours())}:${pad2(stamp.getMinutes())}:${pad2(stamp.getSeconds())}` : whole;
      case 'ampm': return stamp ? (stamp.getHours() < 12 ? 'AM' : 'PM') : whole;
      default: return whole;
    }
  });

  if (spec.caseMode === 'upper') return out.toUpperCase();
  if (spec.caseMode === 'lower') return out.toLowerCase();
  return out;
}

/**
 * What the rasteriser would draw for this frame. The monitor re-renders only when this changes,
 * which is what keeps a static burn-in off the per-frame path while a counter still ticks.
 */
export function textOverlayCacheKey(spec: TextOverlaySpec, ctx: TextOverlayCtx, w: number, h: number): string {
  const s = spec as unknown as Record<string, unknown>;
  const shape = ['font', 'size', 'weight', 'italic', 'align', 'valign', 'padX', 'padY', 'tracking', 'lineGap', 'color', 'opacity']
    .map((k) => String(s[k] ?? ''))
    .join('|');
  return `${w}x${h}|${shape}|${resolveTextTokens(spec, ctx)}`;
}

function measureTracked(g: CanvasRenderingContext2D, line: string, trackPx: number): number {
  if (!trackPx) return g.measureText(line).width;
  let total = 0;
  for (const ch of line) total += g.measureText(ch).width + trackPx;
  return Math.max(0, total - trackPx);
}

/** Draw one line glyph-by-glyph so tracking is even across engines. Returns the advance. */
function drawTracked(g: CanvasRenderingContext2D, line: string, x: number, y: number, trackPx: number, align: TextAlign): number {
  const width = measureTracked(g, line, trackPx);
  let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  if (!trackPx) { g.fillText(line, cursor, y); return width; }
  for (const ch of line) {
    g.fillText(ch, cursor, y);
    cursor += g.measureText(ch).width + trackPx;
  }
  return width;
}

/**
 * Rasterise the overlay at the frame's own resolution, so the shader can sample it in frame UV
 * space with no aspect correction. Returns null when there is nothing to draw (an empty string is
 * a legitimate state while someone is typing, and must not blank the aux texture's consumer).
 */
export function rasterizeTextOverlay(
  spec: TextOverlaySpec,
  ctx: TextOverlayCtx,
  w: number,
  h: number,
  reuse?: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const text = resolveTextTokens(spec, ctx);
  if (!text.trim()) return null;
  if (typeof document === 'undefined') return null;

  const width = Math.max(2, Math.round(w));
  const height = Math.max(2, Math.round(h));
  const canvas = reuse && reuse.width === width && reuse.height === height ? reuse : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, width, height);

  const sizePx = Math.max(6, (spec.size ?? DEFAULTS.size) * height);
  const weight = spec.weight ?? DEFAULTS.weight;
  g.font = `${spec.italic ? 'italic ' : ''}${weight} ${sizePx}px ${spec.font || DEFAULTS.font}`;
  g.fillStyle = spec.color || DEFAULTS.color;
  g.globalAlpha = Math.max(0, Math.min(1, spec.opacity ?? DEFAULTS.opacity));
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';                      // alignment is handled by drawTracked

  const align = spec.align || DEFAULTS.align;
  const valign = spec.valign || DEFAULTS.valign;
  const trackPx = (spec.tracking ?? DEFAULTS.tracking) * sizePx;
  const lineStep = sizePx * (1 + (spec.lineGap ?? DEFAULTS.lineGap));
  const lines = text.split('\n');
  const block = lineStep * lines.length;

  const padX = (spec.padX ?? DEFAULTS.padX) * width;
  const padY = (spec.padY ?? DEFAULTS.padY) * height;
  const x = align === 'center' ? width / 2 : align === 'right' ? width - padX : padX;
  const top = valign === 'middle' ? (height - block) / 2 : valign === 'bottom' ? height - block - padY : padY;

  for (let i = 0; i < lines.length; i++) drawTracked(g, lines[i], x, top + sizePx + i * lineStep, trackPx, align);
  return canvas;
}

let blankCanvas: HTMLCanvasElement | null = null;

/**
 * A fully transparent 1×1 texture. The FX renderer falls back to the SOURCE frame when an effect
 * has no aux input, which a text effect would read as 100% glyph coverage and flood the picture.
 * Handing it this instead makes "no text yet" render as a clean passthrough.
 */
export function blankTextCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!blankCanvas) {
    blankCanvas = document.createElement('canvas');
    blankCanvas.width = 1;
    blankCanvas.height = 1;
    blankCanvas.getContext('2d')?.clearRect(0, 0, 1, 1);
  }
  return blankCanvas;
}

/**
 * Per-instance rasteriser cache. A static burn-in is drawn once and reused; a counter or timecode
 * re-renders only on the frames where its resolved string actually changes.
 */
export class TextOverlayCache {
  private entries = new Map<string, { key: string; canvas: HTMLCanvasElement | null }>();

  resolve(instanceId: string, spec: TextOverlaySpec | undefined, ctx: TextOverlayCtx, w: number, h: number): HTMLCanvasElement | null {
    if (!spec) return blankTextCanvas();
    const key = textOverlayCacheKey(spec, ctx, w, h);
    const hit = this.entries.get(instanceId);
    if (hit && hit.key === key) return hit.canvas || blankTextCanvas();
    const canvas = rasterizeTextOverlay(spec, ctx, w, h, hit?.canvas);
    this.entries.set(instanceId, { key, canvas });
    return canvas || blankTextCanvas();
  }

  clear() { this.entries.clear(); }
}
