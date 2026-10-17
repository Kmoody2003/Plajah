// services/jxlCodec.ts — Native JPEG XL (ISO/IEC 18181, image/jxl) codec utilities,
// ISOBMFF container + ICC colour-profile tagging, capability detection, and resilient
// cross-browser fallback for Plajah.
//
// WHY JPEG XL ACROSS PLAJAH
//   • 20–35% smaller than WebP and ~55–65% smaller than JPEG at equivalent perceptual
//     quality (SSIMULACRA2 / Butteraugli), with zero block-boundary artifacts on album art.
//   • Progressive responsive decoding (salient low-frequency DC frames arrive in the first
//     ~15% of bytes, allowing full-frame placeholders before the rest of the file finishes).
//   • Up to 32-bit float HDR / wide-gamut (Display-P3 / Rec.2100) and lossless JPEG
//     transcoding (`jbrd` bitstream reconstruction).
//   • Faster parallel SIMD decoding than AVIF at high resolutions (1600px–4096px slideshows).

export type ImageCodecExt = 'jxl' | 'webp' | 'jpg' | 'png';
export type ImageCodecMime = 'image/jxl' | 'image/webp' | 'image/jpeg' | 'image/png';

/**
 * 12-byte ISO/IEC 18181-2 JPEG XL ISOBMFF container signature box:
 * `\x00\x00\x00\x0CJXL \x0D\x0A\x87\x0A`
 */
export const JXL_CONTAINER_SIG = new Uint8Array([
  0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);

/**
 * Minimal valid 1×1 8-bit sRGB JPEG XL naked codestream (`0xFF 0x0A ...`), used to probe
 * whether the current browser / WebView natively decodes `image/jxl` in `<img>` and
 * `createImageBitmap`.
 */
export const JXL_PROBE_1X1 = new Uint8Array([
  0xff, 0x0a, 0x00, 0x10, 0xb0, 0x13, 0x48, 0x80, 0x43, 0x00, 0x29, 0x74, 0x00,
]);

export interface JxlHeaderInfo {
  format: 'codestream' | 'container';
  width: number;
  height: number;
  hasAlpha: boolean;
  bitsPerSample: number;
  hasIccProfile: boolean;
  hasJpegReconstruction: boolean;
  boxes?: string[];
}

// ── Binary Signature & Bitstream Header Inspection ───────────────────────────

/** True if `bytes` begins with a naked JPEG XL codestream (`0xFF 0x0A`) or ISOBMFF `JXL ` box. */
export function isJxlBytes(bytes: Uint8Array | null | undefined): boolean {
  if (!bytes || bytes.length < 2) return false;
  if (bytes[0] === 0xff && bytes[1] === 0x0a) return true;
  if (bytes.length >= 12) {
    for (let i = 0; i < 12; i++) {
      if (bytes[i] !== JXL_CONTAINER_SIG[i]) return false;
    }
    return true;
  }
  return false;
}

/** Little-endian bit reader for ISO/IEC 18181-1 SizeHeader / ImageMetadata bitstreams. */
class BitReader {
  private bytePos = 0;
  private bitPos = 0;
  constructor(private readonly buf: Uint8Array, startOffset = 0) {
    this.bytePos = startOffset;
  }
  readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      if (this.bytePos >= this.buf.length) return val;
      const bit = (this.buf[this.bytePos] >>> this.bitPos) & 1;
      val |= bit << i;
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bitPos = 0;
        this.bytePos++;
      }
    }
    return val >>> 0;
  }
  readBool(): boolean {
    return this.readBits(1) === 1;
  }
  readU32(
    c0: { base: number; bits: number },
    c1: { base: number; bits: number },
    c2: { base: number; bits: number },
    c3: { base: number; bits: number },
  ): number {
    const sel = this.readBits(2);
    const cfg = sel === 0 ? c0 : sel === 1 ? c1 : sel === 2 ? c2 : c3;
    return cfg.base + (cfg.bits > 0 ? this.readBits(cfg.bits) : 0);
  }
}

function parseCodestreamSizeAndMeta(cs: Uint8Array): {
  width: number;
  height: number;
  hasAlpha: boolean;
  bitsPerSample: number;
} | null {
  if (cs.length < 4 || cs[0] !== 0xff || cs[1] !== 0x0a) return null;
  const br = new BitReader(cs, 2);

  // SizeHeader (ISO/IEC 18181-1 §A.2)
  const div8 = br.readBool();
  let height = 0;
  if (div8) {
    height = (br.readBits(5) + 1) * 8;
  } else {
    height = br.readU32(
      { base: 1, bits: 9 },
      { base: 1, bits: 13 },
      { base: 1, bits: 18 },
      { base: 1, bits: 30 },
    );
  }

  const ratio = br.readBits(3);
  let width = 0;
  if (ratio === 0) {
    if (div8) {
      width = (br.readBits(5) + 1) * 8;
    } else {
      width = br.readU32(
        { base: 1, bits: 9 },
        { base: 1, bits: 13 },
        { base: 1, bits: 18 },
        { base: 1, bits: 30 },
      );
    }
  } else if (ratio === 1) width = height;
  else if (ratio === 2) width = Math.floor((height * 12) / 10);
  else if (ratio === 3) width = Math.floor((height * 4) / 3);
  else if (ratio === 4) width = Math.floor((height * 3) / 2);
  else if (ratio === 5) width = Math.floor((height * 16) / 9);
  else if (ratio === 6) width = Math.floor((height * 5) / 4);
  else width = height * 2;

  // ImageMetadata preamble
  const allDefault = br.readBool();
  let bitsPerSample = 8;
  let hasAlpha = false;
  if (!allDefault) {
    const extraFields = br.readBool();
    if (extraFields) {
      const orientation = br.readBits(3);
      void orientation;
      const haveIntrSize = br.readBool();
      if (haveIntrSize) {
        // Skip IntrinsicSizeHeader
        const iDiv8 = br.readBool();
        if (iDiv8) br.readBits(5);
        else br.readU32({ base: 1, bits: 9 }, { base: 1, bits: 13 }, { base: 1, bits: 18 }, { base: 1, bits: 30 });
        const iRatio = br.readBits(3);
        if (iRatio === 0) {
          if (iDiv8) br.readBits(5);
          else br.readU32({ base: 1, bits: 9 }, { base: 1, bits: 13 }, { base: 1, bits: 18 }, { base: 1, bits: 30 });
        }
      }
      const havePreview = br.readBool();
      if (havePreview) {
        const pDiv8 = br.readBool();
        if (pDiv8) br.readBits(5);
        else br.readU32({ base: 1, bits: 6 }, { base: 65, bits: 8 }, { base: 321, bits: 10 }, { base: 1345, bits: 12 });
        const pRatio = br.readBits(3);
        if (pRatio === 0) {
          if (pDiv8) br.readBits(5);
          else br.readU32({ base: 1, bits: 6 }, { base: 65, bits: 8 }, { base: 321, bits: 10 }, { base: 1345, bits: 12 });
        }
      }
      const haveAnimation = br.readBool();
      if (haveAnimation) {
        br.readU32({ base: 100, bits: 0 }, { base: 1000, bits: 0 }, { base: 1, bits: 10 }, { base: 1, bits: 30 });
        br.readU32({ base: 1, bits: 0 }, { base: 1001, bits: 0 }, { base: 1, bits: 8 }, { base: 1, bits: 10 });
        br.readU32({ base: 0, bits: 0 }, { base: 0, bits: 3 }, { base: 0, bits: 16 }, { base: 0, bits: 32 });
        br.readBool();
      }
    }
    // BitDepth
    const floatSample = br.readBool();
    if (!floatSample) {
      bitsPerSample = br.readU32({ base: 8, bits: 0 }, { base: 10, bits: 0 }, { base: 12, bits: 0 }, { base: 1, bits: 6 });
    } else {
      bitsPerSample = br.readU32({ base: 32, bits: 0 }, { base: 16, bits: 0 }, { base: 24, bits: 0 }, { base: 1, bits: 6 });
      br.readBits(4); // exp_bits
    }
    const modular16Bit = br.readBool();
    void modular16Bit;
    const numExtra = br.readU32({ base: 0, bits: 0 }, { base: 1, bits: 0 }, { base: 2, bits: 4 }, { base: 1, bits: 12 });
    if (numExtra > 0) {
      const ecAllDefault = br.readBool();
      if (ecAllDefault) {
        hasAlpha = true; // default extra channel is 8-bit Straight Alpha
      } else {
        const ecType = br.readU32({ base: 0, bits: 0 }, { base: 1, bits: 0 }, { base: 2, bits: 4 }, { base: 19, bits: 6 });
        if (ecType === 0) hasAlpha = true;
      }
    }
  }

  return { width, height, hasAlpha, bitsPerSample };
}

/**
 * Parse header metadata from a naked JPEG XL codestream or ISOBMFF JPEG XL container.
 * Returns null if `bytes` is not valid JPEG XL.
 */
export function parseJxlHeader(bytes: Uint8Array): JxlHeaderInfo | null {
  if (!isJxlBytes(bytes)) return null;

  if (bytes[0] === 0xff && bytes[1] === 0x0a) {
    const meta = parseCodestreamSizeAndMeta(bytes);
    if (!meta) return null;
    return {
      format: 'codestream',
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha,
      bitsPerSample: meta.bitsPerSample,
      hasIccProfile: false,
      hasJpegReconstruction: false,
    };
  }

  // ISOBMFF Container
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: string[] = [];
  const codestreamChunks: Uint8Array[] = [];
  let hasIccProfile = false;
  let hasJpegReconstruction = false;
  let off = 0;

  while (off + 8 <= bytes.length) {
    let size = dv.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    let headerLen = 8;
    if (size === 1) {
      if (off + 16 > bytes.length) break;
      const hi = dv.getUint32(off + 8);
      const lo = dv.getUint32(off + 12);
      size = hi * 0x100000000 + lo;
      headerLen = 16;
    } else if (size === 0) {
      size = bytes.length - off;
    }
    if (size < headerLen || off + size > bytes.length) break;
    boxes.push(type);

    const payload = bytes.subarray(off + headerLen, off + size);
    if (type === 'jxlc') {
      codestreamChunks.push(payload);
    } else if (type === 'jxlp' && payload.length > 4) {
      codestreamChunks.push(payload.subarray(4));
    } else if (type === 'colr' && payload.length >= 4) {
      const colrType = String.fromCharCode(payload[0], payload[1], payload[2], payload[3]);
      if (colrType === 'prof' || colrType === 'rICC') hasIccProfile = true;
    } else if (type === 'jbrd') {
      hasJpegReconstruction = true;
    }
    off += size;
  }

  let totalCs = 0;
  for (const c of codestreamChunks) totalCs += c.length;
  const fullCs = new Uint8Array(totalCs);
  let pos = 0;
  for (const c of codestreamChunks) {
    fullCs.set(c, pos);
    pos += c.length;
  }

  const meta = totalCs >= 4 ? parseCodestreamSizeAndMeta(fullCs) : null;
  return {
    format: 'container',
    width: meta?.width ?? 0,
    height: meta?.height ?? 0,
    hasAlpha: meta?.hasAlpha ?? false,
    bitsPerSample: meta?.bitsPerSample ?? 8,
    hasIccProfile,
    hasJpegReconstruction,
    boxes,
  };
}

// ── ISOBMFF Container Builder & ICC Colour Tagging ───────────────────────────

function makeIsoBox(type: string, payload: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new Error(`Invalid ISOBMFF box type "${type}"`);
  const total = 8 + payload.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, total);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

/**
 * Inject or replace an ICC profile (`colr` box with `'prof'` subtype) in a JPEG XL bitstream.
 * If `jxl` is a naked codestream (`0xFF 0x0A`), wraps it in a standards-compliant ISO/IEC 18181-2
 * ISOBMFF container carrying the `JXL `, `ftyp`, `jxll`, `colr`, and `jxlc` boxes.
 */
export function injectJxlIcc(jxl: Uint8Array, profile: Uint8Array): Uint8Array {
  if (!isJxlBytes(jxl)) throw new Error('not a JPEG XL bitstream');

  const profTag = new Uint8Array([0x70, 0x72, 0x6f, 0x66]); // 'prof'
  const colrPayload = new Uint8Array(4 + profile.length);
  colrPayload.set(profTag, 0);
  colrPayload.set(profile, 4);
  const colrBox = makeIsoBox('colr', colrPayload);

  // Case 1: Naked codestream -> wrap in ISOBMFF container
  if (jxl[0] === 0xff && jxl[1] === 0x0a) {
    // ftyp: major_brand='jxl ', minor_version=0, compatible_brands=['jxl ']
    const ftypPayload = new Uint8Array([
      0x6a, 0x78, 0x6c, 0x20,
      0x00, 0x00, 0x00, 0x00,
      0x6a, 0x78, 0x6c, 0x20,
    ]);
    const ftypBox = makeIsoBox('ftyp', ftypPayload);
    const jxllBox = makeIsoBox('jxll', new Uint8Array([0x05])); // level 5
    const jxlcBox = makeIsoBox('jxlc', jxl);

    const parts = [JXL_CONTAINER_SIG, ftypBox, jxllBox, colrBox, jxlcBox];
    const total = parts.reduce((acc, p) => acc + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  }

  // Case 2: Existing ISOBMFF container -> strip any old `colr` box and insert our `colr` box before `jxlc`/`jxlp`
  const dv = new DataView(jxl.buffer, jxl.byteOffset, jxl.byteLength);
  const keptBefore: Uint8Array[] = [];
  const keptAfter: Uint8Array[] = [];
  let seenCodestream = false;
  let off = 0;

  while (off + 8 <= jxl.length) {
    let size = dv.getUint32(off);
    const type = String.fromCharCode(jxl[off + 4], jxl[off + 5], jxl[off + 6], jxl[off + 7]);
    if (size === 0) size = jxl.length - off;
    if (size < 8 || off + size > jxl.length) break;

    if (type === 'jxlc' || type === 'jxlp') seenCodestream = true;
    if (type !== 'colr') {
      const slice = jxl.subarray(off, off + size);
      if (seenCodestream) keptAfter.push(slice);
      else keptBefore.push(slice);
    }
    off += size;
  }

  const all = [...keptBefore, colrBox, ...keptAfter];
  const total = all.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Extract the embedded ICC profile from an ISOBMFF JPEG XL container, if present. */
export function extractJxlIcc(jxl: Uint8Array): Uint8Array | null {
  if (!isJxlBytes(jxl) || (jxl[0] === 0xff && jxl[1] === 0x0a)) return null;
  const dv = new DataView(jxl.buffer, jxl.byteOffset, jxl.byteLength);
  let off = 0;
  while (off + 8 <= jxl.length) {
    let size = dv.getUint32(off);
    const type = String.fromCharCode(jxl[off + 4], jxl[off + 5], jxl[off + 6], jxl[off + 7]);
    if (size === 0) size = jxl.length - off;
    if (size < 8 || off + size > jxl.length) break;
    if (type === 'colr' && size >= 12) {
      const sub = String.fromCharCode(jxl[off + 8], jxl[off + 9], jxl[off + 10], jxl[off + 11]);
      if (sub === 'prof' || sub === 'rICC') {
        return jxl.slice(off + 12, off + size);
      }
    }
    off += size;
  }
  return null;
}

// ── Runtime Capability Detection & Platform Preference ───────────────────────

let jxlEncodeSupported: boolean | null = null;
let jxlDecodeSupported: boolean | null = null;
let jxlPreferenceEnabled = true;

/** Allow tests or platform flags to toggle whether JPEG XL is preferred by default. */
export function setJxlDefaultEnabled(enabled: boolean): void {
  jxlPreferenceEnabled = enabled;
}

export function isJxlDefaultEnabled(): boolean {
  return jxlPreferenceEnabled;
}

/** Override native decode status (used after runtime probe or when a `wsrv.nl?output=jxl` image load succeeds/fails). */
export function recordJxlDecodeSupport(supported: boolean): void {
  jxlDecodeSupported = supported;
}

/** Does this browser's `<canvas>` natively encode `image/jxl`? */
export function supportsJxlEncode(): boolean {
  if (jxlEncodeSupported !== null) return jxlEncodeSupported;
  if (typeof document === 'undefined') {
    jxlEncodeSupported = false;
    return false;
  }
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    jxlEncodeSupported = c.toDataURL('image/jxl').startsWith('data:image/jxl');
  } catch {
    jxlEncodeSupported = false;
  }
  return jxlEncodeSupported;
}

/**
 * Synchronous check for whether JPEG XL decoding is supported or preferred.
 * Defaults to `true` when JPEG XL default mode is active, and refines automatically via
 * `probeJxlDecodeSupport()` or the global capture-phase `<img>` fallback listener.
 */
export function supportsJxlDecode(): boolean {
  if (!jxlPreferenceEnabled) return false;
  if (jxlDecodeSupported !== null) return jxlDecodeSupported;
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    // Apple WebKit (Safari 17+, iOS 17+, macOS Sonoma+) and Plajah native shells support JXL natively.
    if (/Version\/(1[7-9]|[2-9]\d).*Safari/i.test(ua) || /iPhone OS (1[7-9]|[2-9]\d)_/i.test(ua)) {
      jxlDecodeSupported = true;
      return true;
    }
  }
  // Default to true so thumb() / heroImage() request JXL first; if the runtime cannot decode JXL,
  // probeJxlDecodeSupport() and the capture-phase <img> error handler transparently switch to WebP.
  return true;
}

let probePromise: Promise<boolean> | null = null;

/**
 * Asynchronously probe native `image/jxl` decoding using a 1×1 JPEG XL codestream.
 * Updates `supportsJxlDecode()` once complete so subsequent image loads know with certainty.
 */
export function probeJxlDecodeSupport(): Promise<boolean> {
  if (jxlDecodeSupported !== null) return Promise.resolve(jxlDecodeSupported);
  if (probePromise) return probePromise;

  probePromise = (async () => {
    if (typeof window === 'undefined' && typeof createImageBitmap === 'undefined') {
      return true;
    }
    try {
      const blob = new Blob([JXL_PROBE_1X1 as BlobPart], { type: 'image/jxl' });
      if (typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        const ok = bmp.width > 0 && bmp.height > 0;
        bmp.close?.();
        jxlDecodeSupported = ok;
        return ok;
      }
    } catch {
      jxlDecodeSupported = false;
      return false;
    }
    return true;
  })();

  return probePromise;
}

// ── Global Capture-Phase `<img>` JXL Fallback Polyfill ───────────────────────

let listenerInstalled = false;

/**
 * Installs a single capture-phase `error` listener on `window` so ANY `<img>` across the platform
 * whose `src` is a JPEG XL CDN variant (`output=jxl`) or `.jxl` file transparently falls back to
 * WebP or sidecar-decoded PNG if the host browser lacks native JXL decoding.
 *
 * Why capture phase? Resource load errors on `<img>` do not bubble, so React root listeners never
 * see them — but they DO travel down the capture phase on `window`.
 */
export function installNativeJxlImageSupport(): void {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;

  // Kick off the 1x1 decode probe in the background on boot
  void probeJxlDecodeSupport();

  window.addEventListener(
    'error',
    (event: Event) => {
      const target = event.target as HTMLImageElement | null;
      if (!target || target.tagName !== 'IMG') return;
      const src = target.currentSrc || target.src || '';
      if (!src || target.dataset.jxlFallbackApplied === '1') return;

      // Case 1: wsrv.nl CDN URL with output=jxl -> rewrite to output=webp immediately
      if (src.includes('output=jxl')) {
        target.dataset.jxlFallbackApplied = '1';
        jxlDecodeSupported = false;
        target.src = src.replace(/([?&])output=jxl\b/, '$1output=webp');
        return;
      }

      // Case 2: Direct .jxl or data:image/jxl URL -> try local GPU sidecar /api/local-ai/decode-jxl
      if (/\.jxl(\?|$)/i.test(src) || src.startsWith('data:image/jxl')) {
        target.dataset.jxlFallbackApplied = '1';
        jxlDecodeSupported = false;
        void decodeJxlViaSidecar(src).then(decodedUrl => {
          if (decodedUrl) target.src = decodedUrl;
        });
      }
    },
    true,
  );
}

/**
 * Ask the local GPU sidecar (`/decode_jxl` or `/api/local-ai/decode-jxl`) to transcode a `.jxl`
 * image to a browser-renderable data URL when the browser lacks native JXL decoding.
 */
export async function decodeJxlViaSidecar(jxlUrlOrDataUrl: string): Promise<string | null> {
  const endpoints = ['http://127.0.0.1:51122/decode_jxl', 'http://localhost:51122/decode_jxl'];
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('51122')) {
    endpoints.push(`${window.location.origin}/api/local-ai/decode-jxl`);
  }

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: jxlUrlOrDataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.mediaUrl) return data.mediaUrl;
      }
    } catch {
      // Try next endpoint
    }
  }
  return null;
}

/**
 * Encode an image data URL or base64 payload to genuine `image/jxl` via the local GPU sidecar
 * (`pillow-jxl-plugin` / libjxl), returning `{ dataUrl, bytes, thumbDataUrl }` or `null` if offline.
 */
export async function encodeJxlViaSidecar(
  imageDataUrl: string,
  options: { quality?: number; thumbEdge?: number } = {},
): Promise<{ dataUrl: string; thumbDataUrl?: string; width?: number; height?: number } | null> {
  const endpoints = ['http://127.0.0.1:51122/encode_jxl', 'http://localhost:51122/encode_jxl'];
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('51122')) {
    endpoints.push(`${window.location.origin}/api/local-ai/encode-jxl`);
  }

  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          quality: Math.round((options.quality ?? 0.82) * 100),
          thumbEdge: options.thumbEdge ?? 320,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.jxlDataUrl) {
          return {
            dataUrl: data.jxlDataUrl,
            thumbDataUrl: data.thumbDataUrl,
            width: data.width,
            height: data.height,
          };
        }
      }
    } catch {
      // Sidecar offline or timed out — fall back to browser canvas encoder
    }
  }
  return null;
}
