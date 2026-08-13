/**
 * exifService — a tiny, dependency-free client-side EXIF reader.
 *
 * Parses the essentials photographers care about (camera, lens, focal length,
 * aperture, shutter, ISO, date taken, dimensions) directly from a JPEG's APP1
 * segment. No npm dependency is added — this is a minimal TIFF/EXIF walker
 * covering the common tags. It is intentionally conservative: on any unexpected
 * bytes it bails and returns what it has (or null), never throws.
 *
 * Photos in Plajah are stored as URLs, so we fetch only the first ~256 KB
 * (enough to hold the EXIF header on virtually all cameras) with a Range request
 * and fall back to a full fetch if the host ignores Range.
 */

export interface ExifData {
  camera?: string;         // Make + Model
  lens?: string;
  focalLength?: string;    // '50 mm'
  aperture?: string;       // 'f/1.8'
  shutter?: string;        // '1/250 s'
  iso?: string;            // 'ISO 400'
  dateTaken?: string;
  dimensions?: string;     // '6000 × 4000'
  software?: string;
}

// EXIF tag ids we care about (in the TIFF/EXIF IFDs)
const TAGS: Record<number, keyof RawTags> = {
  0x010f: 'make',
  0x0110: 'model',
  0x0131: 'software',
  0x0132: 'dateTime',
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x9003: 'dateTimeOriginal',
  0x920a: 'focalLength',
  0xa002: 'pixelXDimension',
  0xa003: 'pixelYDimension',
  0xa434: 'lensModel',
  0x8769: 'exifIFDPointer',
};

interface RawTags {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  pixelXDimension?: number;
  pixelYDimension?: number;
  lensModel?: string;
  exifIFDPointer?: number;
}

function readString(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trim();
}

/** Parse a single IFD; returns { tags, next } and recurses into the EXIF sub-IFD. */
function parseIFD(view: DataView, tiffStart: number, dirStart: number, little: boolean, tags: RawTags): void {
  const entries = view.getUint16(dirStart, little);
  for (let i = 0; i < entries; i++) {
    const entry = dirStart + 2 + i * 12;
    const tagId = view.getUint16(entry, little);
    const key = TAGS[tagId];
    if (!key) continue;
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);

    // component byte sizes per TIFF type
    const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const byteLen = (typeSize[type] ?? 1) * count;
    let valueOffset = entry + 8;
    if (byteLen > 4) valueOffset = tiffStart + view.getUint32(entry + 8, little);

    try {
      if (type === 2) {
        (tags as any)[key] = readString(view, valueOffset, count);
      } else if (type === 3) {
        (tags as any)[key] = view.getUint16(valueOffset, little);
      } else if (type === 4) {
        (tags as any)[key] = view.getUint32(valueOffset, little);
      } else if (type === 5) {
        const num = view.getUint32(valueOffset, little);
        const den = view.getUint32(valueOffset + 4, little);
        (tags as any)[key] = den ? num / den : num;
      }
    } catch {
      // ignore individual bad tag
    }
  }

  // Recurse into the EXIF sub-IFD if present (and not already there)
  if (tags.exifIFDPointer && tags.exifIFDPointer !== dirStart - tiffStart) {
    const ptr = tags.exifIFDPointer;
    tags.exifIFDPointer = undefined;
    try { parseIFD(view, tiffStart, tiffStart + ptr, little, tags); } catch { /* ignore */ }
  }
}

function tagsToExif(t: RawTags): ExifData | null {
  const exif: ExifData = {};
  const camera = [t.make, t.model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (camera) exif.camera = camera;
  if (t.lensModel) exif.lens = t.lensModel;
  if (t.focalLength) exif.focalLength = `${Math.round(t.focalLength)} mm`;
  if (t.fNumber) exif.aperture = `f/${(Math.round(t.fNumber * 10) / 10)}`;
  if (t.exposureTime) {
    exif.shutter = t.exposureTime >= 1
      ? `${t.exposureTime} s`
      : `1/${Math.round(1 / t.exposureTime)} s`;
  }
  if (t.iso) exif.iso = `ISO ${t.iso}`;
  const date = t.dateTimeOriginal || t.dateTime;
  if (date) exif.dateTaken = date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  if (t.pixelXDimension && t.pixelYDimension) exif.dimensions = `${t.pixelXDimension} × ${t.pixelYDimension}`;
  if (t.software) exif.software = t.software;
  return Object.keys(exif).length ? exif : null;
}

/** Parse EXIF from a JPEG ArrayBuffer. Returns null if none found. */
export function parseExifFromBuffer(buffer: ArrayBuffer): ExifData | null {
  try {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return null; // not a JPEG

    let offset = 2;
    const len = view.byteLength;
    while (offset < len - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        // APP1 — check "Exif\0\0"
        const app1Start = offset + 4;
        if (readString(view, app1Start, 4) === 'Exif') {
          const tiffStart = app1Start + 6;
          const byteOrder = view.getUint16(tiffStart);
          const little = byteOrder === 0x4949; // 'II'
          const ifd0 = view.getUint32(tiffStart + 4, little);
          const tags: RawTags = {};
          parseIFD(view, tiffStart, tiffStart + ifd0, little, tags);
          return tagsToExif(tags);
        }
      }
      // markers 0xFFD0–0xFFD9 have no length; also stop at SOS (0xFFDA)
      if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break;
      const size = view.getUint16(offset + 2);
      if (size < 2) break;
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Strip ALL metadata from an image by re-encoding its pixels through a canvas.
 *
 * A canvas holds only pixel data, so drawing an image to one and exporting it
 * discards EXIF, GPS, XMP, IPTC and the maker-note blocks — every place a camera
 * or phone hides location and device identity. This is the correct way to
 * sanitise a photo before it is sent in a protected thread: GPS coordinates in a
 * photo are one of the most common ways a source is unmasked.
 *
 * Returns a fresh Blob (JPEG by default; PNG when the source has transparency and
 * quality is not the concern). It THROWS if the image cannot be decoded or re-encoded
 * — it never returns the original bytes — so a protected-thread caller fails closed
 * ("do not send") rather than leaking an unsanitised photo.
 */
export async function stripImageMetadata(
  file: Blob,
  opts: { type?: 'image/jpeg' | 'image/png'; quality?: number; maxDimension?: number } = {},
): Promise<Blob> {
  const { type = 'image/jpeg', quality = 0.92, maxDimension = 4096 } = opts;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('This image could not be processed for sending.');

  try {
    // Cap absurd dimensions so a hostile image cannot exhaust memory; keep aspect.
    let { width, height } = bitmap;
    if (Math.max(width, height) > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d');
    if (!ctx) throw new Error('This image could not be processed for sending.');
    (ctx as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, width, height);

    if (canvas instanceof OffscreenCanvas) {
      return await canvas.convertToBlob({ type, quality });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
        type,
        quality,
      );
    });
  } finally {
    bitmap.close?.();
  }
}

/**
 * Detect an image by its magic bytes rather than trusting file.type, which is often
 * empty or 'application/octet-stream' on real upload paths. A JPEG with GPS EXIF that
 * arrives with a stripped MIME must still be recognised and sanitised — that is exactly
 * the case where a leak matters. Covers JPEG, PNG, GIF, WebP, HEIC/HEIF, BMP, TIFF.
 */
export async function isProbablyImage(file: Blob): Promise<boolean> {
  if (file.type && file.type.startsWith('image/')) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const b = (i: number) => head[i];
    const ascii = (i: number, s: string) => s.split('').every((c, k) => head[i + k] === c.charCodeAt(0));
    if (b(0) === 0xff && b(1) === 0xd8) return true;                       // JPEG
    if (b(0) === 0x89 && ascii(1, 'PNG')) return true;                    // PNG
    if (ascii(0, 'GIF8')) return true;                                    // GIF
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return true;               // WebP
    if (ascii(4, 'ftyp') && (ascii(8, 'heic') || ascii(8, 'heif') || ascii(8, 'mif1') || ascii(8, 'hevc'))) return true; // HEIC/HEIF
    if (b(0) === 0x42 && b(1) === 0x4d) return true;                      // BMP
    if ((b(0) === 0x49 && b(1) === 0x49 && b(2) === 0x2a) || (b(0) === 0x4d && b(1) === 0x4d && b(2) === 0x00)) return true; // TIFF
    return false;
  } catch {
    // If we cannot even read the header, treat it as an image so a protected-thread
    // caller runs it through the (fail-closed) stripper rather than sending raw.
    return true;
  }
}

const exifCache = new Map<string, Promise<ExifData | null>>();

/** Fetch (partial) and parse EXIF for a remote image URL. Cached; never throws. */
export function fetchExif(url: string): Promise<ExifData | null> {
  if (!url) return Promise.resolve(null);
  if (!exifCache.has(url)) {
    exifCache.set(url, (async () => {
      try {
        // Try a small ranged fetch first; EXIF lives at the front of the file.
        let res = await fetch(url, {
          headers: { Range: 'bytes=0-262143' },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        if (!res || (!res.ok && res.status !== 206)) {
          res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        }
        if (!res || (!res.ok && res.status !== 206)) return null;
        const buf = await res.arrayBuffer();
        return parseExifFromBuffer(buf);
      } catch {
        return null;
      }
    })());
  }
  return exifCache.get(url)!;
}
