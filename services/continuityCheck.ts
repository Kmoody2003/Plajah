// Continuity Eye P1 — on-device still-vs-still continuity comparison.
// ---------------------------------------------------------------------------
// Pure browser Canvas 2D. No model, no network, no upload — the pixels never
// leave the device (unreleased set footage must not leak). Given a REFERENCE
// frame (the printed take) and a CURRENT frame (after a reset), it returns a
// 0–100 continuity score plus flagged regions:
//   • Props/set  — windowed SSIM structural diff → what moved / vanished / appeared
//   • Lighting   — luminance + white-balance (colour-temp) deltas
// Advisory only; the Script Supervisor decides. Object *naming* (matching a flag
// to a specific breakdown prop) is P2 and needs detection/embeddings.

export interface ContinuityFlag {
  x: number; y: number; w: number; h: number; // normalised 0..1 box
  kind: 'CHANGE' | 'LIGHT';
  severity: 'break' | 'drift';
  label: string;
}

export interface ContinuityResult {
  score: number;          // 0–100 overall
  propsScore: number;     // structural (SSIM)
  lightingScore: number;  // luminance + white balance
  ssim: number;           // raw global SSIM (-1..1)
  lumaDelta: number;      // signed mean-luminance change, −255..255
  warmthDelta: number;    // signed white-balance change (R/B ratio), + = warmer
  colorTempNote: string;  // human note, e.g. "+430K warmer"
  flags: ContinuityFlag[];
  curThumb: string;       // JPEG data URL of the current frame (for history/overlay)
  refThumb: string;
}

const W = 320, H = 180, BLOCK = 20;            // 16×9 blocks of 20px
const COLS = W / BLOCK, ROWS = H / BLOCK;
const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
const CHANGE_SSIM = 0.55;                       // block below this = "changed"

async function loadDrawable(src: Blob | string): Promise<ImageBitmap> {
  if (typeof src === 'string') { const res = await fetch(src); return createImageBitmap(await res.blob()); }
  return createImageBitmap(src);
}

function draw(bitmap: ImageBitmap): { data: Uint8ClampedArray; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, W, H);
  return { data: ctx.getImageData(0, 0, W, H).data, canvas };
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Windowed SSIM between two grayscale frames → global SSIM + per-block map. */
function ssimBlocks(a: Uint8ClampedArray, b: Uint8ClampedArray): { global: number; changed: boolean[][] } {
  const changed: boolean[][] = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  let sum = 0, n = 0;
  for (let by = 0; by < ROWS; by += 1) {
    for (let bx = 0; bx < COLS; bx += 1) {
      let mA = 0, mB = 0, count = 0;
      for (let y = 0; y < BLOCK; y += 1) for (let x = 0; x < BLOCK; x += 1) {
        const i = ((by * BLOCK + y) * W + (bx * BLOCK + x)) * 4;
        mA += luma(a[i], a[i + 1], a[i + 2]); mB += luma(b[i], b[i + 1], b[i + 2]); count += 1;
      }
      mA /= count; mB /= count;
      let vA = 0, vB = 0, cov = 0;
      for (let y = 0; y < BLOCK; y += 1) for (let x = 0; x < BLOCK; x += 1) {
        const i = ((by * BLOCK + y) * W + (bx * BLOCK + x)) * 4;
        const la = luma(a[i], a[i + 1], a[i + 2]) - mA;
        const lb = luma(b[i], b[i + 1], b[i + 2]) - mB;
        vA += la * la; vB += lb * lb; cov += la * lb;
      }
      vA /= count; vB /= count; cov /= count;
      const ssim = ((2 * mA * mB + C1) * (2 * cov + C2)) / ((mA * mA + mB * mB + C1) * (vA + vB + C2));
      changed[by][bx] = ssim < CHANGE_SSIM;
      sum += ssim; n += 1;
    }
  }
  return { global: sum / n, changed };
}

/** Cluster changed blocks (4-neighbour) into normalised bounding boxes. */
function cluster(changed: boolean[][]): { x: number; y: number; w: number; h: number; size: number }[] {
  const seen = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const boxes: { x: number; y: number; w: number; h: number; size: number }[] = [];
  for (let by = 0; by < ROWS; by += 1) for (let bx = 0; bx < COLS; bx += 1) {
    if (!changed[by][bx] || seen[by][bx]) continue;
    let minX = bx, maxX = bx, minY = by, maxY = by, size = 0;
    const stack = [[bx, by]];
    seen[by][bx] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      size += 1;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && changed[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
      }
    }
    boxes.push({ x: minX / COLS, y: minY / ROWS, w: (maxX - minX + 1) / COLS, h: (maxY - minY + 1) / ROWS, size });
  }
  return boxes.sort((p, q) => q.size - p.size);
}

function positionLabel(x: number, y: number, w: number, h: number): string {
  const cy = y + h / 2, cx = x + w / 2;
  const v = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : 'mid';
  const hh = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  return `${v}-${hh}`;
}

function lighting(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let lA = 0, lB = 0, rA = 0, gA = 0, bA = 0, rB = 0, gB = 0, bB = 0;
  const px = W * H;
  for (let i = 0; i < a.length; i += 4) {
    lA += luma(a[i], a[i + 1], a[i + 2]); lB += luma(b[i], b[i + 1], b[i + 2]);
    rA += a[i]; gA += a[i + 1]; bA += a[i + 2]; rB += b[i]; gB += b[i + 1]; bB += b[i + 2];
  }
  const lumaA = lA / px, lumaB = lB / px;
  const warmthA = (rA / px + 1) / (bA / px + 1); // R/B ratio; +1 avoids div0
  const warmthB = (rB / px + 1) / (bB / px + 1);
  return { lumaDelta: lumaB - lumaA, warmthDelta: warmthB - warmthA };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export async function compareFrames(refSrc: Blob | string, curSrc: Blob | string): Promise<ContinuityResult> {
  const [refBmp, curBmp] = await Promise.all([loadDrawable(refSrc), loadDrawable(curSrc)]);
  const ref = draw(refBmp), cur = draw(curBmp);

  const { global: ssim, changed } = ssimBlocks(ref.data, cur.data);
  const { lumaDelta, warmthDelta } = lighting(ref.data, cur.data);

  const propsScore = clamp(Math.round(ssim * 100));
  // Lighting penalty: mean-luma shift (of 255) + white-balance shift.
  const lumaPct = Math.abs(lumaDelta) / 255 * 100;
  const lightingScore = clamp(Math.round(100 - lumaPct * 2.2 - Math.abs(warmthDelta) * 130));
  const score = Math.round(propsScore * 0.6 + lightingScore * 0.4);

  const flags: ContinuityFlag[] = cluster(changed).slice(0, 6).map(box => ({
    x: box.x, y: box.y, w: box.w, h: box.h, kind: 'CHANGE', severity: box.size >= 2 ? 'break' : 'drift',
    label: `Region changed · ${positionLabel(box.x, box.y, box.w, box.h)}`,
  }));
  if (lightingScore < 82) {
    const warmer = warmthDelta > 0;
    flags.push({ x: 0, y: 0, w: 1, h: 1, kind: 'LIGHT', severity: lightingScore < 65 ? 'break' : 'drift',
      label: `Lighting ${warmer ? 'warmer' : 'cooler'} / ${lumaDelta > 0 ? 'brighter' : 'darker'}` });
  }

  // Rough colour-temp note: R/B ratio delta → an approximate Kelvin feel (illustrative).
  const kelvin = Math.round(Math.abs(warmthDelta) * 2600);
  const colorTempNote = Math.abs(warmthDelta) < 0.02 ? 'white balance holds' : `${warmthDelta > 0 ? '+' : '−'}${kelvin}K ${warmthDelta > 0 ? 'warmer' : 'cooler'}`;

  return {
    score, propsScore, lightingScore, ssim, lumaDelta: Math.round(lumaDelta), warmthDelta,
    colorTempNote, flags,
    curThumb: cur.canvas.toDataURL('image/jpeg', 0.6),
    refThumb: ref.canvas.toDataURL('image/jpeg', 0.6),
  };
}

/** Grab a single still from a live MediaStream (for capture-from-camera). */
export async function grabFrame(stream: MediaStream): Promise<Blob> {
  const video = document.createElement('video');
  video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play().catch(() => {});
  await new Promise(r => setTimeout(r, 250)); // let a frame arrive
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b || new Blob()), 'image/jpeg', 0.85));
}
