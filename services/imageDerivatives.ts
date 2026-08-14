// imageDerivatives — make every uploaded image cheap to load, in the browser, at upload time.
//
// WHY THIS EXISTS
// Album covers were being written as `cover.png`. PNG is lossless and meant for flat graphics;
// for photographic artwork it costs 30–50× what WebP costs at the same pixel size — a 12 MB
// cover where 250 KB would do. Photos were worse: uploadPhoto stored the raw camera File, so a
// grid of twenty 6 MB JPEGs downloaded 120 MB and then blocked the main thread decoding them.
// Nothing generated derivatives anywhere, and no Resize Images extension was installed.
//
// HOW IT PLUGS IN WITHOUT TOUCHING 92 CALL SITES
// Firebase download URLs carry a per-object token, so a variant URL CANNOT be derived from the
// original's URL by string surgery. Rather than add a resolver everywhere, we invert the fields:
// the EXISTING field (Photo.url, Album.coverImage) is repointed at the optimised derivative, and
// the untouched original moves to a new companion field. Every existing reader gets faster with
// no edit; only editors and downloads ask for the original.
//
// Everything here is best-effort. Any failure returns null and the caller uploads the original —
// a slow image is a bug, a failed upload is a disaster.

/** Longest-edge targets. Display covers card + player + most retina cases; thumb covers grids. */
export const DISPLAY_EDGE = 1024;
export const THUMB_EDGE = 320;

const DISPLAY_QUALITY = 0.82;
const THUMB_QUALITY = 0.75;

export interface Derivative {
  blob: Blob;
  width: number;
  height: number;
  /** File extension to store it under, matching the encoded type. */
  ext: 'webp' | 'jpg';
}

export interface DerivativeSet {
  display: Derivative | null;
  thumb: Derivative | null;
  /** Source pixel dimensions, worth storing so galleries can reserve layout space. */
  srcWidth: number;
  srcHeight: number;
}

let webpOk: boolean | null = null;
/** Does this browser ENCODE webp? (Decode support is near-universal; encode is the question.) */
export function supportsWebp(): boolean {
  if (webpOk !== null) return webpOk;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { webpOk = false; }
  return webpOk;
}

/**
 * Worth optimising? SVG is already tiny and would rasterise; GIF is usually animated and canvas
 * would flatten it to a single frame — silently destroying the image. Both pass through untouched.
 */
export function isOptimizable(file: Blob): boolean {
  const t = (file as any).type || '';
  return /^image\//.test(t) && !/svg|gif/.test(t);
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Derivative | null> {
  const webp = supportsWebp();
  const type = webp ? 'image/webp' : 'image/jpeg';
  return new Promise(resolve => {
    try {
      canvas.toBlob(
        b => resolve(b ? { blob: b, width: canvas.width, height: canvas.height, ext: webp ? 'webp' : 'jpg' } : null),
        type,
        quality,
      );
    } catch { resolve(null); }
  });
}

/** Draw `bmp` scaled so its longest edge is `edge`. Returns null rather than UPSCALING — blowing a
 *  small image up would add bytes and no detail. */
function scaleTo(bmp: ImageBitmap, edge: number): HTMLCanvasElement | null {
  const longest = Math.max(bmp.width, bmp.height);
  if (longest <= edge) return null;
  const s = edge / longest;
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  // Browsers already box-filter on downscale; high quality avoids the aliasing you get otherwise.
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  return c;
}

/**
 * Build display + thumb derivatives for an image. Returns nulls for any variant the source is
 * already smaller than, so a 200px avatar doesn't get re-encoded pointlessly.
 */
export async function makeDerivatives(file: Blob): Promise<DerivativeSet | null> {
  if (!isOptimizable(file)) return null;
  let bmp: ImageBitmap | null = null;
  try {
    // imageOrientation matters: phone photos carry EXIF rotation, and without this the derivative
    // comes out sideways while the original looks fine — the classic "only the thumbnail is rotated".
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    try { bmp = await createImageBitmap(file); } catch { return null; }
  }
  if (!bmp) return null;

  try {
    const dCanvas = scaleTo(bmp, DISPLAY_EDGE);
    const tCanvas = scaleTo(bmp, THUMB_EDGE);
    // Even at native size, re-encoding a PNG cover to WebP is the single biggest win available,
    // so encode the display variant from the source when it's already under DISPLAY_EDGE.
    let display: Derivative | null;
    if (dCanvas) {
      display = await encode(dCanvas, DISPLAY_QUALITY);
    } else {
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d')?.drawImage(bmp, 0, 0);
      display = await encode(c, DISPLAY_QUALITY);
    }
    const thumb = tCanvas ? await encode(tCanvas, THUMB_QUALITY) : null;

    // If "optimising" made it bigger (already-tight JPEGs can), keep the original.
    if (display && display.blob.size >= file.size) display = null;

    return { display, thumb, srcWidth: bmp.width, srcHeight: bmp.height };
  } catch {
    return null;
  } finally {
    try { bmp.close?.(); } catch { /* */ }
  }
}

/** Human-readable saving, for upload UI and the backfill report. */
export function describeSaving(originalBytes: number, newBytes: number): string {
  if (!originalBytes || newBytes >= originalBytes) return 'no saving';
  const pct = Math.round((1 - newBytes / originalBytes) * 100);
  const mb = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
  return `${mb(originalBytes)} → ${mb(newBytes)} (−${pct}%)`;
}
