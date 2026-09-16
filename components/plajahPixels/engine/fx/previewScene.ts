// previewScene — the source frame shown BEHIND every FX / filter preview in the
// Fabula FX library. A real photograph reads far better than a synthetic test
// pattern when you're trying to judge what an effect actually does to a clip.
//
// HOW TO ADD PICTURES: drop image files (jpg / jpeg / png / webp / avif) into the
// ./previewAssets folder next to this file. They are picked up automatically —
// no code change needed. The first image (alphabetical) is the primary scene; a
// second one, if present, becomes the "incoming" frame for transition previews.
// Good choices: a photograph with faces / skin tones, saturated colour, bright
// highlights and deep shadows, and some fine detail or text — that's where a
// grade, blur, glow, key or stylise reads clearly. 16:9 crops best (tiles are
// 192×108). Two contrasting scenes make transitions obvious.
//
// With NO images present, everything falls back to the synthetic reference
// pattern, so previews keep working. The deterministic hash-sweep in
// fxReference.ts intentionally keeps using the synthetic source — only the
// on-screen previews use real photos.
import { referenceSource } from './fxReference';

// Auto-collect whatever the user dropped in ./previewAssets (empty until then).
const urlMap = (import.meta as any).glob(
  './previewAssets/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

/** Bundled preview-image URLs, alphabetical (empty if none were added yet). */
export const PREVIEW_IMAGE_URLS: string[] = Object.keys(urlMap).sort().map((k) => urlMap[k]);
export const hasPreviewImages = PREVIEW_IMAGE_URLS.length > 0;

const images: (HTMLImageElement | null)[] = PREVIEW_IMAGE_URLS.map(() => null);
let loadStarted = false;
function ensureLoaded() {
  if (loadStarted || typeof Image === 'undefined') return;
  loadStarted = true;
  PREVIEW_IMAGE_URLS.forEach((url, i) => {
    const img = new Image();
    (img as any).decoding = 'async';
    img.onload = () => { images[i] = img; };
    img.src = url;
  });
}

/** The primary preview image URL, or '' if none — for CSS-filter <img> tiles. */
export function defaultPreviewImageUrl(): string { return PREVIEW_IMAGE_URLS[0] || ''; }

// Cover-fit an image into w×h with a slow Ken-Burns drift, so temporal effects
// (echo, trails, motion blur, channel-surf…) still have movement to reveal
// themselves instead of reading as dead shaders on a frozen still.
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, phase: number) {
  const t = phase / 24; // phase ~ frame count → roughly seconds
  const zoom = 1.08 + 0.05 * Math.sin(t * 0.5);
  const panX = 0.5 + 0.06 * Math.sin(t * 0.37);
  const panY = 0.5 + 0.05 * Math.cos(t * 0.29);
  const iw = img.naturalWidth || w, ih = img.naturalHeight || h;
  const scale = Math.max(w / iw, h / ih) / zoom;   // cover, then zoom in a touch
  const sw = Math.min(iw, w / scale), sh = Math.min(ih, h / scale);
  const sx = (iw - sw) * panX, sy = (ih - sh) * panY;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

/**
 * The preview source frame. Draws a real photo (Ken-Burns animated) when one has
 * loaded, otherwise the synthetic reference pattern. `variant` picks the image:
 * 0 = primary, 1 = the "incoming" scene for a transition (a distinct crop when
 * only one image exists). Mirrors referenceSource's reuse-canvas contract, so
 * callers can pass and re-capture a canvas: `this.c = previewSource(w,h,p,this.c)`.
 */
export function previewSource(width: number, height: number, phase = 0, reuse?: HTMLCanvasElement, variant = 0): HTMLCanvasElement {
  ensureLoaded();
  const img = images.length ? (images[variant % images.length] || images.find((x) => x) || null) : null;
  if (!img) return referenceSource(width, height, phase, reuse);
  const canvas = reuse && reuse.width === width && reuse.height === height ? reuse : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  // Offset the crop per variant so a single-image transition still shows two scenes.
  drawCover(g, img, width, height, phase + variant * 53);
  return canvas;
}
