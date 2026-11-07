// Crossover Image: convert still images (HEIC first, plus anything the browser can decode) to
// PNG, JPEG or WebP. It runs on this device everywhere: the website, the Windows app's WebView2
// and the Android app's WebView. HEIC is decoded by libheif (WASM, loaded only when a HEIC file
// shows up), so nothing is uploaded. Canvas re-encoding drops EXIF, so GPS location never leaks
// into a converted copy; orientation is baked into the pixels first.

import { crossoverHost } from './host';
import { toBase64 } from './save';

export type ImageTarget = 'png' | 'jpg' | 'webp';

export const IMAGE_TARGETS: { id: ImageTarget; label: string; ext: string; mime: string; lossy: boolean; note: string }[] = [
  { id: 'jpg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', lossy: true, note: 'Smallest, opens everywhere' },
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', lossy: false, note: 'Lossless, keeps transparency' },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', lossy: true, note: 'Small, for the web' },
];

export interface ImageConvertOptions {
  target: ImageTarget;
  /** 0..1 for JPEG and WebP. */
  quality?: number;
  /** Longest edge in pixels; undefined keeps the original size. */
  maxEdge?: number;
  /** JPEG has no alpha; transparent pixels are filled with this. */
  background?: string;
}

export interface ImageConvertResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
}

const HEIC_EXT = /\.(heic|heif|hif|avci|avcs)$/i;
const HEIC_MIME = /^image\/(heic|heif)(-sequence)?$/i;

/** Extensions the converter accepts as input (used for pickers and drop filtering). */
export const CONVERTIBLE_INPUT = /\.(heic|heif|hif|png|jpe?g|jfif|webp|avif|gif|bmp|ico|tiff?|svg)$/i;
export const CONVERTIBLE_ACCEPT = 'image/*,.heic,.heif,.hif';

export const isHeicName = (name: string) => HEIC_EXT.test(name);
export const isHeicFile = (f: { name: string; type?: string }) => HEIC_EXT.test(f.name) || HEIC_MIME.test(f.type || '');
export const isConvertibleFile = (f: { name: string; type?: string }) =>
  isHeicFile(f) || CONVERTIBLE_INPUT.test(f.name) || (f.type || '').startsWith('image/');

/** The HEIC decoder is ~3 MB of WASM, so it loads the first time it is needed and stays. */
let heicLib: Promise<typeof import('heic-to')> | null = null;
const loadHeic = () => (heicLib ??= import('heic-to'));

/** Sniff the ISO-BMFF `ftyp` brand, for HEIC files that arrive with a generic name or type. */
async function sniffHeic(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  if (head.length < 12) return false;
  const tag = String.fromCharCode(...head.subarray(4, 8));
  if (tag !== 'ftyp') return false;
  const brands = String.fromCharCode(...head.subarray(8, Math.min(head.length, 32)));
  return /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brands);
}

/** Decode any supported image into a bitmap with EXIF orientation applied. */
export async function decodeImage(blob: Blob, name = ''): Promise<ImageBitmap> {
  const heic = isHeicFile({ name, type: blob.type }) || (!blob.type && (await sniffHeic(blob)));
  if (!heic) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (e) {
      // A mislabelled HEIC (e.g. "IMG_1234.jpg" from some phones) lands here.
      if (!(await sniffHeic(blob))) throw new Error(`Can't read ${name || 'this image'}: ${(e as Error)?.message || 'unsupported format'}`);
    }
  }
  // Safari and some WebViews decode HEIC natively; it's much faster when it works.
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch { /* fall through to libheif */ }
  const { heicTo } = await loadHeic();
  return heicTo({ blob, type: 'bitmap', options: { imageOrientation: 'from-image' } });
}

/** A displayable object URL for a HEIC file (used by the image viewer). Caller revokes it. */
export async function heicPreviewUrl(blob: Blob, name = ''): Promise<string> {
  const r = await convertImageBlob(blob, name, { target: 'jpg', quality: 0.9 });
  return URL.createObjectURL(r.blob);
}

export const outputName = (name: string, target: ImageTarget) => {
  const ext = IMAGE_TARGETS.find((t) => t.id === target)!.ext;
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name || 'image'}.${ext}`;
};

function makeCanvas(w: number, h: number): { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D; toBlob: (mime: string, q?: number) => Promise<Blob> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    if (ctx) return { ctx, toBlob: (type, quality) => c.convertToBlob({ type, quality }) };
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable.');
  return {
    ctx,
    toBlob: (type, quality) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encode failed.'))), type, quality)),
  };
}

export async function convertImageBlob(blob: Blob, name: string, opts: ImageConvertOptions): Promise<ImageConvertResult> {
  const target = IMAGE_TARGETS.find((t) => t.id === opts.target) || IMAGE_TARGETS[0];
  const bmp = await decodeImage(blob, name);
  try {
    let w = bmp.width, h = bmp.height;
    if (opts.maxEdge && Math.max(w, h) > opts.maxEdge) {
      const s = opts.maxEdge / Math.max(w, h);
      w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    }
    const { ctx, toBlob } = makeCanvas(w, h);
    if (target.id === 'jpg') {
      ctx.fillStyle = opts.background || '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await toBlob(target.mime, target.lossy ? opts.quality ?? 0.92 : undefined);
    if (out.type && out.type !== target.mime) throw new Error(`This device can't write ${target.label}.`);
    return { blob: out, name: outputName(name, target.id), width: w, height: h };
  } finally {
    bmp.close();
  }
}

// ── Saving ───────────────────────────────────────────────────────────────────

const CHUNK = 1024 * 1024 * 3; // divisible by 3, so each chunk's base64 stands alone
const invoke = (cmd: string, args: Record<string, unknown>) => (window as any).__plajahMediaEngine?.invoke(cmd, args);

/** Desktop: write the converted copy next to the original (never overwriting). Returns the path. */
export async function saveBesideSource(sourcePath: string, name: string, blob: Blob): Promise<string> {
  const sep = sourcePath.includes('\\') ? '\\' : '/';
  const dir = sourcePath.slice(0, sourcePath.lastIndexOf(sep));
  const { path } = await invoke('crossover_unique_path', { path: `${dir}${sep}${name}` });
  if (blob.size === 0) throw new Error('Empty output.');
  for (let at = 0; at < blob.size; at += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
    const r = await invoke('crossover_append_base64', { path, data: toBase64(bytes) });
    if (!r?.success) throw new Error(r?.error || 'Could not write the file.');
  }
  return path;
}

export const canSaveBesideSource = () => crossoverHost() === 'desktop' && !!(window as any).__plajahMediaEngine;

/** Bundle several converted files into one store-only zip (images are already compressed). */
export async function zipResults(items: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const used = new Map<string, number>();
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const it of items) {
    let n = it.name;
    const seen = used.get(n.toLowerCase()) || 0;
    if (seen) { const d = n.lastIndexOf('.'); n = `${n.slice(0, d)} (${seen + 1})${n.slice(d)}`; }
    used.set(it.name.toLowerCase(), seen + 1);
    entries[n] = [new Uint8Array(await it.blob.arrayBuffer()), { level: 0 }];
  }
  const zipped = zipSync(entries);
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
