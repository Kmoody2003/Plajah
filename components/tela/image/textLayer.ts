// textLayer — Image Studio type layers on the platform text engine (services/text).
//
// A type layer is a PixelLayer whose `text` field keeps the editable spec; its bitmap is the
// rasterized result, so every compositor/export path (GPU, CPU, PSD, previews) just works.
// Re-editing re-rasterizes from the spec. Shaping, kerning, ligatures and line breaking come
// from the wasm engine (rustybuzz + Knuth–Plass) via drawLayout(); OFL fonts from its
// manifest. If the engine cannot start (offline font fetch, no wasm) we fall back to the
// browser's canvas text so typing never dead-ends — flagged on the layer as `engine: 'canvas'`.

import type { Bitmap8 } from '../../../services/tela/raster/buffer';
import type { RGB } from '../../../services/tela/raster/model';

export interface TextSpec {
  value: string;
  font: string;
  size: number;
  weight?: number;
  italic?: boolean;
  color: RGB;
  align?: 'left' | 'center' | 'right' | 'justify';
  /** 1/1000 em. */
  tracking?: number;
  /** Line height multiple. */
  leading?: number;
  /** Paragraph text box width in doc px (0 / undefined = point text). */
  boxWidth?: number;
  /** Supersampling for crisp small text (the layer transform scales back). */
  oversample?: number;
}
export interface RenderedText { bitmap: Bitmap8; /** offset of the bitmap's top-left from the text anchor (doc px, pre-oversample) */ dx: number; dy: number; scale: number; engine: 'text-engine' | 'canvas' }

export const DEFAULT_TEXT: TextSpec = { value: 'Type here', font: 'Inter', size: 72, weight: 600, color: [255, 255, 255], align: 'left', tracking: 0, leading: 1.2, oversample: 1 };
export const TEXT_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Playfair Display', 'Merriweather', 'Lora', 'Oswald', 'Bebas Neue', 'DM Serif Display', 'Fraunces', 'Space Grotesk', 'JetBrains Mono', 'Caveat', 'Pacifico'];
const hex = (c: RGB) => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

let systemP: Promise<import('../../../services/text').TextSystem> | null = null;
async function textSystem() {
  if (!systemP) systemP = import('../../../services/text').then(m => m.createTextSystem({ fallbackFamily: 'Inter' })).catch(e => { systemP = null; throw e; });
  return systemP;
}
/** Families the engine's manifest can load (OFL/Apache), curated list first. */
export async function availableFonts(): Promise<string[]> {
  try { const m = await import('../../../services/text'); const all = Object.keys(m.FONT_MANIFEST.families); return [...TEXT_FONTS.filter(f => all.includes(f)), ...all.filter(f => !TEXT_FONTS.includes(f)).sort()]; }
  catch { return TEXT_FONTS; }
}

export async function renderTextLayer(spec: TextSpec): Promise<RenderedText> {
  try { return await renderWithEngine(spec); }
  catch (e) { console.warn('[ImageStudio] text engine unavailable, using canvas text', e); return renderWithCanvas(spec); }
}

async function renderWithEngine(spec: TextSpec): Promise<RenderedText> {
  const t = await import('../../../services/text'); const sys = await textSystem();
  const story = t.plainTextToStory(spec.value || ' ');
  const char = { fontFamily: spec.font, fontSize: spec.size, fontWeight: spec.weight ?? 400, fontStyle: spec.italic ? 'italic' as const : 'normal' as const, color: hex(spec.color), tracking: spec.tracking ?? 0 };
  const align = spec.align === 'center' ? 'center' : spec.align === 'right' ? 'right' : spec.align === 'justify' ? 'justify' : 'left';
  for (const p of story.paragraphs) { p.attrs = { ...(p.attrs || {}), align, spaceAfter: 0, spaceBefore: 0, leading: { kind: 'multiple', value: spec.leading ?? 1.2 }, hyphenation: { enabled: !!spec.boxWidth } }; p.runs = p.runs.map(r => ({ ...r, attrs: { ...(r.attrs || {}), ...char } })); }
  await sys.ensure(story);
  const width = spec.boxWidth && spec.boxWidth > 0 ? spec.boxWidth : 100000;
  let layout = sys.layout(story, [{ id: 'f', x: 0, y: 0, width, height: 1e6 }]);
  // point text: measure the widest line, then lay out again in a frame that tight so alignment works
  let boxW = width;
  if (!spec.boxWidth) { boxW = Math.max(1, ...layout.lines.map(l => l.inkX + l.inkWidth)) + 2; layout = sys.layout(story, [{ id: 'f', x: 0, y: 0, width: boxW, height: 1e6 }]); }
  const pad = Math.ceil(spec.size * 0.25), top = Math.min(0, ...layout.lines.map(l => l.baseline - l.ascent)), bottom = Math.max(spec.size, ...layout.lines.map(l => l.baseline + l.descent));
  const left = Math.min(0, ...layout.lines.map(l => l.inkX)), right = Math.max(boxW, ...layout.lines.map(l => l.inkX + l.inkWidth));
  const os = Math.max(1, Math.min(4, spec.oversample ?? 1));
  const W = Math.ceil((right - left + pad * 2) * os), H = Math.ceil((bottom - top + pad * 2) * os);
  const c = new OffscreenCanvas(Math.max(1, W), Math.max(1, H)), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.scale(os, os); g.translate(pad - left, pad - top);
  t.drawLayout(g as unknown as CanvasRenderingContext2D, sys.engine, layout, { mode: 'paths' });
  const id = g.getImageData(0, 0, c.width, c.height);
  return { bitmap: unpremultiplyCanvas(id), dx: left - pad, dy: top - pad, scale: os, engine: 'text-engine' };
}

function renderWithCanvas(spec: TextSpec): RenderedText {
  const os = Math.max(1, Math.min(4, spec.oversample ?? 1)), lines = (spec.value || ' ').split(/\r?\n/), lh = spec.size * (spec.leading ?? 1.2);
  const font = `${spec.italic ? 'italic ' : ''}${spec.weight ?? 400} ${spec.size}px "${spec.font}", system-ui, sans-serif`;
  const m = new OffscreenCanvas(1, 1).getContext('2d') as OffscreenCanvasRenderingContext2D; m.font = font;
  const widths = lines.map(l => m.measureText(l).width), boxW = spec.boxWidth || Math.max(1, ...widths), pad = Math.ceil(spec.size * 0.25);
  const W = Math.ceil((boxW + pad * 2) * os), H = Math.ceil((lh * lines.length + pad * 2) * os);
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
  g.scale(os, os); g.font = font; g.fillStyle = hex(spec.color); g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => { const x = spec.align === 'center' ? (boxW - widths[i]) / 2 : spec.align === 'right' ? boxW - widths[i] : 0; g.fillText(l, pad + x, pad + spec.size * 0.95 + i * lh); });
  return { bitmap: unpremultiplyCanvas(g.getImageData(0, 0, W, H)), dx: -pad, dy: -pad, scale: os, engine: 'canvas' };
}
/** getImageData is already straight (unpremultiplied) RGBA; copy into a Bitmap8. */
function unpremultiplyCanvas(id: ImageData): Bitmap8 { return { width: id.width, height: id.height, data: new Uint8ClampedArray(id.data) }; }

/** The spec stored on PixelLayer.text (value/font/size/color are the engine's typed fields). */
export function specToLayerText(spec: TextSpec, anchor: { x: number; y: number }) {
  return { value: spec.value, font: spec.font, size: spec.size, color: spec.color, raw: { kind: 'tela-image-text', weight: spec.weight, italic: spec.italic, align: spec.align, tracking: spec.tracking, leading: spec.leading, boxWidth: spec.boxWidth, oversample: spec.oversample, anchor } };
}
export function layerTextToSpec(t: { value: string; font?: string; size?: number; color?: RGB; raw?: unknown } | undefined): { spec: TextSpec; anchor: { x: number; y: number } | null } | null {
  if (!t) return null; const raw = (t.raw && typeof t.raw === 'object' ? t.raw : {}) as Record<string, any>;
  return { spec: { ...DEFAULT_TEXT, value: t.value, font: t.font || DEFAULT_TEXT.font, size: t.size || DEFAULT_TEXT.size, color: t.color || DEFAULT_TEXT.color, weight: raw.weight ?? 400, italic: raw.italic, align: raw.align ?? 'left', tracking: raw.tracking ?? 0, leading: raw.leading ?? 1.2, boxWidth: raw.boxWidth, oversample: raw.oversample ?? 1 }, anchor: raw.anchor ?? null };
}
