/**
 * Studio Asset Pipeline for Plajah Academia Games:
 *  1. Copies and normalizes all 7 clean background plates into `public/academia-games/plates/`
 *     (trims the 2.4% paper edge border from Reading so all 7 plates are full-bleed 1376x768).
 *  2. Extracts all 8 isolated hand-painted sprites from our white-backdrop sprite sheets using
 *     Plajah's REAL `services/matting/alphaMattingEngine.ts` (`refineAlphaMatteAndDecontaminate`)
 *     via `services/academiaGames/spriteMatting.ts`, saving transparent RGBA PNGs into
 *     `public/academia-games/sprites/`.
 *  3. Renders a high-contrast dark-slate + checkerboard proof contact sheet into the scratch
 *     directory so every alpha edge, interior spoke/filigree cutout, and color de-spill can be
 *     visually verified.
 *
 * Run: npx tsx scripts/academia/isolateSprites.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { zlibSync } from 'fflate';
import { chromium } from 'playwright';
import { isolateSpriteOnWhite, type SpriteIsolationOptions } from '../../services/academiaGames/spriteMatting';

const ARTIFACT_DIR = 'C:/Users/Kenne/.gemini/antigravity/brain/b4bb14a4-0d2f-4ef6-b951-83f425183b05';
const REPO_ROOT = process.cwd();
const PLATES_OUT = path.join(REPO_ROOT, 'public', 'academia-games', 'plates');
const SPRITES_OUT = path.join(REPO_ROOT, 'public', 'academia-games', 'sprites');
const PROOF_OUT = path.join(ARTIFACT_DIR, 'scratch', 'sprite_isolation_proof.png');

fs.mkdirSync(PLATES_OUT, { recursive: true });
fs.mkdirSync(SPRITES_OUT, { recursive: true });
fs.mkdirSync(path.dirname(PROOF_OUT), { recursive: true });

// ── Minimal Standards-Compliant 32-bit RGBA PNG Encoder (uses repo's fflate.zlibSync) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

function encodeRgbaPng(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter None
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const compressed = zlibSync(raw, { level: 6 });

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const c1 = pngChunk('IHDR', ihdr);
  const c2 = pngChunk('IDAT', compressed);
  const c3 = pngChunk('IEND', new Uint8Array(0));

  const total = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let off = 0;
  for (const part of [sig, c1, c2, c3]) {
    total.set(part, off);
    off += part.length;
  }
  return total;
}

// ── Clean Plate Spec ──────────────────────────────────────────────────────────────────
const CLEAN_PLATES: Array<{ src: string; dst: string; trimBorderPct?: number }> = [
  { src: 'clean_01_reading_bg_1795583065262.jpg', dst: 'prek2-reading.jpg', trimBorderPct: 0.025 },
  { src: 'clean_02_math_bg_1795583068740.jpg', dst: 'g35-math.jpg' },
  { src: 'clean_03_science_bg_1795583105438.jpg', dst: 'g68-science.jpg' },
  { src: 'clean_04_studio_bg_1795583109710.jpg', dst: 'g912-studio.jpg' },
  { src: 'clean_05_ora_bg_1795583114402.jpg', dst: 'ora-stillness.jpg' },
  { src: 'clean_06_elevate_bg_1795583114573.jpg', dst: 'elevate-parable.jpg' },
  { src: 'clean_07_history_bg_1795583259011.jpg', dst: 'history-atlas.jpg' },
];

// ── Sprite Sheet Extraction Spec ──────────────────────────────────────────────────────
interface SpriteJob {
  sheetFile: string;
  outName: string;
  /** Normalized crop region inside the sprite sheet [x0, y0, x1, y1]. */
  crop: [number, number, number, number];
  options: SpriteIsolationOptions;
}

const SPRITE_JOBS: SpriteJob[] = [
  {
    sheetFile: 'sprites_01_reading_1795583064422.jpg',
    outName: 'fox.png',
    crop: [0.02, 0.04, 0.48, 0.96],
    options: { punchInteriorWhiteHoles: false, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_01_reading_1795583064422.jpg',
    outName: 'lantern.png',
    crop: [0.54, 0.04, 0.96, 0.96],
    options: { punchInteriorWhiteHoles: true, minHoleArea: 40, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_02_waterwheel_1795583133568.jpg',
    outName: 'waterwheel.png',
    crop: [0.0, 0.0, 1.0, 1.0],
    options: { punchInteriorWhiteHoles: true, minHoleArea: 80, squareCenter: true, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_03_elevate_ora_1795583122769.jpg',
    outName: 'shepherd.png',
    crop: [0.02, 0.04, 0.27, 0.96],
    options: { punchInteriorWhiteHoles: false, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_03_elevate_ora_1795583122769.jpg',
    outName: 'sheep.png',
    crop: [0.28, 0.16, 0.74, 0.94],
    options: { punchInteriorWhiteHoles: false, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_03_elevate_ora_1795583122769.jpg',
    outName: 'windbell.png',
    crop: [0.76, 0.04, 0.98, 0.96],
    options: { punchInteriorWhiteHoles: true, minHoleArea: 18, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_04_history_1795583256213.jpg',
    outName: 'riverboat.png',
    crop: [0.02, 0.08, 0.47, 0.94],
    options: { punchInteriorWhiteHoles: true, minHoleArea: 24, paddingPx: 8 },
  },
  {
    sheetFile: 'sprites_04_history_1795583256213.jpg',
    outName: 'astrolabe-dial.png',
    crop: [0.48, 0.02, 0.99, 0.98],
    options: { punchInteriorWhiteHoles: true, minHoleArea: 24, squareCenter: true, paddingPx: 8 },
  },
];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage();

  // Helper: decode any local JPEG into raw RGBA + optionally crop/resize inside Chromium
  async function decodeRegionToRgba(filePath: string, crop: [number, number, number, number]) {
    const dataUri = `data:image/jpeg;base64,${fs.readFileSync(filePath).toString('base64')}`;
    const res = await page.evaluate(
      async ({ src, cropRect }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const sx = Math.round(img.naturalWidth * cropRect[0]);
        const sy = Math.round(img.naturalHeight * cropRect[1]);
        const sw = Math.round(img.naturalWidth * (cropRect[2] - cropRect[0]));
        const sh = Math.round(img.naturalHeight * (cropRect[3] - cropRect[1]));
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const id = ctx.getImageData(0, 0, sw, sh);
        // Pack as binary string chunked for fast IPC transfer
        const u8 = new Uint8Array(id.data.buffer);
        let b64 = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) {
          b64 += String.fromCharCode(...u8.subarray(i, i + chunk));
        }
        return { width: sw, height: sh, b64: btoa(b64) };
      },
      { src: dataUri, cropRect: crop },
    );
    const buf = Buffer.from(res.b64, 'base64');
    return {
      width: res.width,
      height: res.height,
      rgba: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength),
    };
  }

  // 1. Copy & normalize clean background plates into public/academia-games/plates/
  console.log('--- Installing Clean Background Plates (1376x768) ---');
  for (const plate of CLEAN_PLATES) {
    const srcPath = path.join(ARTIFACT_DIR, plate.src);
    const dstPath = path.join(PLATES_OUT, plate.dst);
    if (!plate.trimBorderPct) {
      fs.copyFileSync(srcPath, dstPath);
      console.log(`  [plate] ${plate.dst} copied cleanly`);
    } else {
      const dataUri = `data:image/jpeg;base64,${fs.readFileSync(srcPath).toString('base64')}`;
      const trim = plate.trimBorderPct;
      const outB64 = await page.evaluate(
        async ({ src, trimPct }) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 1376;
          c.height = 768;
          const ctx = c.getContext('2d')!;
          const sx = img.naturalWidth * trimPct;
          const sy = img.naturalHeight * trimPct;
          const sw = img.naturalWidth * (1 - trimPct * 2);
          const sh = img.naturalHeight * (1 - trimPct * 2);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1376, 768);
          return c.toDataURL('image/jpeg', 0.93).split(',')[1];
        },
        { src: dataUri, trimPct: trim },
      );
      fs.writeFileSync(dstPath, Buffer.from(outB64, 'base64'));
      console.log(`  [plate] ${plate.dst} border-trimmed (${(trim * 100).toFixed(1)}%) -> 1376x768`);
    }
  }

  // 2. Isolate every sprite via Plajah's Alpha Matting & Foreground Color Decontamination Engine
  console.log('\n--- Running Plajah Alpha Matting Engine on 8 Sprites ---');
  const isolatedSprites: Array<{ name: string; width: number; height: number; pngB64: string }> = [];

  for (const job of SPRITE_JOBS) {
    const srcPath = path.join(ARTIFACT_DIR, job.sheetFile);
    const { rgba, width, height } = await decodeRegionToRgba(srcPath, job.crop);
    const result = isolateSpriteOnWhite(rgba, width, height, job.options);
    const pngBytes = encodeRgbaPng(result.rgba, result.width, result.height);
    const outPath = path.join(SPRITES_OUT, job.outName);
    fs.writeFileSync(outPath, pngBytes);
    isolatedSprites.push({
      name: job.outName,
      width: result.width,
      height: result.height,
      pngB64: Buffer.from(pngBytes).toString('base64'),
    });
    console.log(
      `  [sprite] ${job.outName.padEnd(20)} ${result.width}x${result.height} | holes=${result.metrics.interiorHolesPunched} | deSpillPx=${result.metrics.decontaminatedEdgePixels} | ${result.metrics.processingTimeMs}ms`,
    );
  }

  // 3. Render a visual contact proof sheet on dark checkerboard so we can inspect EVERY alpha edge!
  const proofB64 = await page.evaluate(async (items) => {
    const cols = 4;
    const rows = 2;
    const cellW = 340;
    const cellH = 340;
    const c = document.createElement('canvas');
    c.width = cols * cellW;
    c.height = rows * cellH;
    const ctx = c.getContext('2d')!;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * cellH;

      // Dark slate checkerboard so BOTH white halos AND transparent interior holes jump out immediately
      const sq = 16;
      for (let y = 0; y < cellH; y += sq) {
        for (let x = 0; x < cellW; x += sq) {
          ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#263038' : '#35434E';
          ctx.fillRect(cx + x, cy + y, sq, sq);
        }
      }
      ctx.strokeStyle = '#6E7F8C';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);

      const img = new Image();
      img.src = `data:image/png;base64,${it.pngB64}`;
      await img.decode();

      const maxDim = cellW - 56;
      const scale = Math.min(maxDim / img.naturalWidth, (cellH - 72) / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, cx + (cellW - dw) / 2, cy + 20 + (cellH - 64 - dh) / 2, dw, dh);

      ctx.fillStyle = 'rgba(18, 22, 28, 0.85)';
      ctx.fillRect(cx + 8, cy + cellH - 34, cellW - 16, 26);
      ctx.fillStyle = '#F5ECDC';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${it.name} (${it.width}x${it.height})`, cx + 16, cy + cellH - 16);
    }

    return c.toDataURL('image/png').split(',')[1];
  }, isolatedSprites);

  fs.writeFileSync(PROOF_OUT, Buffer.from(proofB64, 'base64'));
  console.log(`\nSaved visual alpha-matting proof sheet -> ${PROOF_OUT}`);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
