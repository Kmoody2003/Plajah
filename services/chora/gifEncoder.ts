/**
 * Lightweight, zero-dependency GIF89a Animated GIF encoder for Plajah Chora Auto-Promo cards.
 *
 * Uses a hybrid 256-color palette:
 * - Slots 0..215: 6x6x6 perceptual RGB cube (covers full-color cover artwork smoothly)
 * - Slots 216..231: 16-step high-precision grayscale ramp (keeps anti-aliased text & QR edges sharp)
 * - Slots 232..255: Exact Plajah Chora brand & suite colors (#100B17, #FAF5FF, #FFFFFF, #000000,
 *   #6B0099, #D40055, #FF8C00, #00DAF3, #D0BCFF, suite grounds & accents) so brand typography,
 *   solid backgrounds, and the scannable QR code never suffer color shift or blurry dithering.
 */

const EXACT_BRAND_HEX = [
  '#000000', '#FFFFFF', '#100B17', '#FAF5FF', '#6B0099', '#D40055', '#FF8C00', '#00DAF3',
  '#D0BCFF', '#EEE8D9', '#102D27', '#DBFF00', '#101C32', '#1730BC', '#ECD8D2', '#242224',
  '#F8F3E5', '#DF4C32', '#B6D7AD', '#D7B878', '#7AEAFF', '#B93E63', '#090611', '#1A0026',
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build the 256-color RGB palette (768 bytes) and a fast 15-bit RGB (32x32x32) lookup table. */
function buildPaletteAndLut(): { palette: Uint8Array; lut: Uint8Array } {
  const palette = new Uint8Array(256 * 3);
  let idx = 0;

  // 1. 6x6x6 RGB cube (216 colors)
  const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[idx * 3] = levels[r];
        palette[idx * 3 + 1] = levels[g];
        palette[idx * 3 + 2] = levels[b];
        idx++;
      }
    }
  }

  // 2. 16-step grayscale ramp (slots 216..231)
  for (let i = 0; i < 16; i++) {
    const v = Math.round((i / 15) * 255);
    palette[idx * 3] = v;
    palette[idx * 3 + 1] = v;
    palette[idx * 3 + 2] = v;
    idx++;
  }

  // 3. 24 exact Plajah Chora brand & suite colors (slots 232..255)
  for (let i = 0; i < 24; i++) {
    const [r, g, b] = hexToRgb(EXACT_BRAND_HEX[i % EXACT_BRAND_HEX.length]);
    palette[idx * 3] = r;
    palette[idx * 3 + 1] = g;
    palette[idx * 3 + 2] = b;
    idx++;
  }

  // Precompute 15-bit RGB (5 bits per channel = 32,768 entries) nearest-neighbor LUT
  const lut = new Uint8Array(32768);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | (r5 >> 2);
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | (g5 >> 2);
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | (b5 >> 2);
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let p = 0; p < 256; p++) {
          const dr = r - palette[p * 3];
          const dg = g - palette[p * 3 + 1];
          const db = b - palette[p * 3 + 2];
          // Perceptual weights keep skin tones, cover art, and typography crisp
          const dist = dr * dr * 3 + dg * dg * 4 + db * db * 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = p;
            if (dist === 0) break;
          }
        }
        lut[(r5 << 10) | (g5 << 5) | b5] = bestIdx;
      }
    }
  }

  return { palette, lut };
}

let cachedPaletteLut: { palette: Uint8Array; lut: Uint8Array } | null = null;
function getPaletteLut() {
  if (!cachedPaletteLut) cachedPaletteLut = buildPaletteAndLut();
  return cachedPaletteLut;
}

/** Map RGBA pixels to 8-bit palette indices with subtle ordered Bayer dithering on photographic regions. */
export function quantizeFrameRgba(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const { lut } = getPaletteLut();
  const indexed = new Uint8Array(width * height);
  // 2x2 Bayer matrix scaled small so solid brand fills & QR code modules never speckle
  const bayer = [-2, 2, 3, -1];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const by = (y & 1) << 1;
    for (let x = 0; x < width; x++) {
      const i = (rowOffset + x) * 4;
      let r = rgba[i];
      let g = rgba[i + 1];
      let b = rgba[i + 2];
      // Skip dithering on near-pure white/black/ink so QR code modules and text stay 100% solid
      const isExtreme = (r > 245 && g > 245 && b > 245) || (r < 20 && g < 15 && b < 28);
      if (!isExtreme) {
        const d = bayer[by | (x & 1)];
        r = Math.min(255, Math.max(0, r + d));
        g = Math.min(255, Math.max(0, g + d));
        b = Math.min(255, Math.max(0, b + d));
      }
      indexed[rowOffset + x] = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
    }
  }
  return indexed;
}

/** Standard GIF LZW compressor for 8-bit indexed pixels (minCodeSize = 8). */
function lzwEncode(indexed: Uint8Array): Uint8Array {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize; // 256
  const endCode = clearCode + 1;      // 257

  const out: number[] = [minCodeSize];
  let subBlock = new Uint8Array(255);
  let subBlockLen = 0;

  let curByte = 0;
  let curBits = 0;

  const flushSubBlock = () => {
    if (subBlockLen > 0) {
      out.push(subBlockLen);
      for (let i = 0; i < subBlockLen; i++) out.push(subBlock[i]);
      subBlockLen = 0;
    }
  };

  const writeCode = (code: number, bits: number) => {
    curByte |= code << curBits;
    curBits += bits;
    while (curBits >= 8) {
      subBlock[subBlockLen++] = curByte & 0xff;
      if (subBlockLen === 255) flushSubBlock();
      curByte >>= 8;
      curBits -= 8;
    }
  };

  // Dictionary: key = (prefix << 8) | suffix -> code
  const dict = new Int32Array(4096 * 256);
  dict.fill(-1);
  let nextCode = endCode + 1;
  let codeSize = minCodeSize + 1; // 9

  const resetDict = () => {
    dict.fill(-1);
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };

  writeCode(clearCode, codeSize);
  if (indexed.length === 0) {
    writeCode(endCode, codeSize);
    if (curBits > 0) {
      subBlock[subBlockLen++] = curByte & 0xff;
    }
    flushSubBlock();
    out.push(0);
    return new Uint8Array(out);
  }

  let prefix = indexed[0];
  for (let i = 1; i < indexed.length; i++) {
    const suffix = indexed[i];
    const key = (prefix << 8) | suffix;
    const hit = dict[key];
    if (hit !== -1) {
      prefix = hit;
    } else {
      writeCode(prefix, codeSize);
      if (nextCode < 4096) {
        dict[key] = nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeCode(clearCode, codeSize);
        resetDict();
      }
      prefix = suffix;
    }
  }

  writeCode(prefix, codeSize);
  writeCode(endCode, codeSize);
  if (curBits > 0) {
    subBlock[subBlockLen++] = curByte & 0xff;
  }
  flushSubBlock();
  out.push(0); // Block terminator

  return new Uint8Array(out);
}

export interface GifFrameInput {
  rgba: Uint8ClampedArray;
  delayMs: number;
}

/** Encode a sequence of RGBA frames into a looping GIF89a Blob (`image/gif`). */
export function encodeAnimatedGif(width: number, height: number, frames: GifFrameInput[]): Blob {
  const { palette } = getPaletteLut();
  const chunks: Uint8Array[] = [];

  const pushBytes = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));
  const pushU16 = (v: number) => pushBytes(v & 0xff, (v >> 8) & 0xff);

  // 1. Header: GIF89a
  pushBytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // 2. Logical Screen Descriptor (Global Color Table Flag = 1, 256 colors -> 0xF7)
  pushU16(width);
  pushU16(height);
  pushBytes(0xf7, 0x00, 0x00);

  // 3. Global Color Table (768 bytes)
  chunks.push(palette);

  // 4. Netscape 2.0 Application Extension for infinite looping (loop = 0)
  pushBytes(
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00
  );

  // 5. Frames
  for (const frame of frames) {
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10)); // centiseconds
    // Graphic Control Extension
    pushBytes(0x21, 0xf9, 0x04, 0x04);
    pushU16(delayCs);
    pushBytes(0x00, 0x00);

    // Image Descriptor
    pushBytes(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(width);
    pushU16(height);
    pushBytes(0x00); // Use Global Color Table

    // LZW Image Data
    const indexed = quantizeFrameRgba(frame.rgba, width, height);
    chunks.push(lzwEncode(indexed));
  }

  // 6. GIF Trailer
  pushBytes(0x3b);

  return new Blob(chunks as BlobPart[], { type: 'image/gif' });
}
