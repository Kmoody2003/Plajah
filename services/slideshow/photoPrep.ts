// Themed Shows — smart photo prep. Runs entirely on-device.
//
//  1. Orientation: decode with `imageOrientation: 'from-image'` so EXIF rotation is
//     honoured (phone portraits stop arriving sideways). Owners can add quarter turns.
//  2. Subject: the Shape Detection FaceDetector when the browser has it, otherwise a
//     saliency map (edges + skin tone + gentle centre bias) on a 96px proxy.
//  3. Crop: a square polaroid window that keeps faces with headroom, never cutting
//     through a face when it can avoid it.
//  4. Fix: a restrained levels / gamma / saturation pass, blended at partial strength —
//     old family prints should look cared-for, not re-graded.
//  5. Interest: detail + faces → how long the planner lets the photo stay full page.

import type { CropRect, PhotoFix, ShowPhoto } from './types';

export interface PrepInput {
  id: string;
  src: string;
  title?: string;
  caption?: string;
  captionSource?: 'typed' | 'filename' | 'picture';
  takenAt?: number;
  timeSource?: 'exif' | 'file' | 'user';
  quarterTurns?: number;
  /** Import hints for screenshot detection. */
  hint?: { png?: boolean; name?: string };
  keepFraming?: boolean;
  /** The owner's crop (0..1 of the upright original): used instead of the auto-trim. */
  manualCrop?: CropRect;
  manualPolaroid?: CropRect;
}

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

/** Decode a photo upright (EXIF honoured). Cached per src. */
export function loadUpright(src: string, maxSide = 2048): Promise<ImageBitmap> {
  const key = `${src}@${maxSide}`;
  let p = bitmapCache.get(key);
  if (!p) {
    p = (async () => {
      let blob: Blob | null = null;
      try {
        const r = await fetch(src, { mode: 'cors' });
        if (r.ok) blob = await r.blob();
      } catch { /* fall through to <img> */ }
      let bmp: ImageBitmap;
      if (blob) {
        bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } else {
        const img = await loadImg(src);
        bmp = await createImageBitmap(img);
      }
      const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      if (s < 1) {
        const scaled = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' });
        bmp.close();
        bmp = scaled;
      }
      return bmp;
    })();
    bitmapCache.set(key, p);
    p.catch(() => bitmapCache.delete(key));
  }
  return p;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Apply quarter turns to a bitmap-like source onto a canvas. */
export function drawTurned(src: CanvasImageSource & { width: number; height: number }, turns = 0): HTMLCanvasElement {
  const q = ((turns % 4) + 4) % 4;
  const c = document.createElement('canvas');
  const swap = q % 2 === 1;
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((q * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

interface FaceBox { x: number; y: number; w: number; h: number }

async function detectFaces(c: HTMLCanvasElement): Promise<FaceBox[] | null> {
  const FD = (globalThis as any).FaceDetector;
  if (!FD) return null;
  try {
    const det = new FD({ fastMode: true, maxDetectedFaces: 12 });
    const faces = await det.detect(c);
    return faces.map((f: any) => ({
      x: f.boundingBox.x / c.width, y: f.boundingBox.y / c.height,
      w: f.boundingBox.width / c.width, h: f.boundingBox.height / c.height,
    }));
  } catch {
    return null;
  }
}

/** Full analysis of one photo. */
export async function preparePhoto(input: PrepInput): Promise<ShowPhoto> {
  const bmp = await loadUpright(input.src);
  const full = drawTurned(bmp, input.quarterTurns || 0);
  // auto-trim: black/white borders, phone-screenshot chrome (status bar, app bars, nav bar)
  const tr = input.manualCrop ? { rect: input.manualCrop, reason: 'manual' as const } : detectTrim(full, { ...input.hint, exif: input.timeSource === 'exif' });
  const upright = (input.manualCrop || !input.keepFraming) && tr ? cropCanvas(full, tr.rect) : full;
  const W = upright.width, H = upright.height;

  // 96px proxy for statistics + saliency.
  const S = 96;
  const ps = S / Math.max(W, H);
  const pw = Math.max(8, Math.round(W * ps)), ph = Math.max(8, Math.round(H * ps));
  const proxy = document.createElement('canvas');
  proxy.width = pw; proxy.height = ph;
  const pg = proxy.getContext('2d', { willReadFrequently: true })!;
  pg.drawImage(upright, 0, 0, pw, ph);
  const px = pg.getImageData(0, 0, pw, ph).data;

  const fix = analyseTone(px);
  const sal = saliency(px, pw, ph);
  const graphicScore = graphicLikeness(px, pw, ph);

  // Faces: real detector on a ~640px copy when available.
  let faces: FaceBox[] | null = null;
  {
    const fs = Math.min(1, 640 / Math.max(W, H));
    const fc = document.createElement('canvas');
    fc.width = Math.round(W * fs); fc.height = Math.round(H * fs);
    fc.getContext('2d')!.drawImage(upright, 0, 0, fc.width, fc.height);
    faces = await detectFaces(fc);
  }

  let focus = { x: sal.cx, y: sal.cy };
  if (faces && faces.length) {
    // Weight faces by area; aim a little below the eyes so heads keep headroom.
    let ax = 0, ay = 0, aw = 0;
    for (const f of faces) { const a = f.w * f.h; ax += (f.x + f.w / 2) * a; ay += (f.y + f.h * 0.6) * a; aw += a; }
    focus = { x: ax / aw, y: ay / aw };
  }

  const polaroidCrop = input.manualPolaroid ?? squareCrop(W, H, focus, faces || []);
  const faceCount = faces ? faces.length : sal.skinBlobs;
  const interest = Math.min(1, sal.detail * 0.55 + Math.min(faceCount, 4) * 0.12 + (H > W ? 0.08 : 0));

  return {
    id: input.id,
    src: input.src,
    title: input.title,
    caption: input.caption,
    captionSource: input.caption ? input.captionSource : undefined,
    showCaption: false,
    takenAt: input.takenAt,
    timeSource: input.timeSource,
    quarterTurns: input.quarterTurns || 0,
    width: W,
    height: H,
    polaroidCrop,
    focus,
    faces: faceCount,
    interest,
    // graphics keep their colours exactly as designed
    fix: graphicScore >= GRAPHIC_AT ? { ...fix, strength: 0 } : fix,
    graphic: graphicScore >= GRAPHIC_AT,
    graphicScore: Math.round(graphicScore * 100) / 100,
    trim: tr?.rect,
    trimReason: tr?.reason,
    keepFraming: input.manualCrop ? false : input.keepFraming,
    manualCrop: input.manualCrop,
    manualPolaroid: input.manualPolaroid,
  };
}

function cropCanvas(src: HTMLCanvasElement, r: CropRect): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const sx = Math.round(r.x * src.width), sy = Math.round(r.y * src.height);
  c.width = Math.max(1, Math.round(r.w * src.width)); c.height = Math.max(1, Math.round(r.h * src.height));
  c.getContext('2d')!.drawImage(src, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

/** The photo's upright, trimmed pixels (what every renderer should start from). */
export async function uprightTrimmed(photo: ShowPhoto): Promise<HTMLCanvasElement> {
  const bmp = await loadUpright(photo.src);
  const full = drawTurned(bmp, photo.quarterTurns || 0);
  return photo.trim && !photo.keepFraming ? cropCanvas(full, photo.trim) : full;
}

/**
 * What to cut away so only the picture remains.
 *  • borders: rows/columns from an edge that are flat black or flat white (scans, letterboxed
 *    video stills, screenshots of photos shown on black)
 *  • screenshot: a phone-shaped image with no camera date and a flat status bar on top. The
 *    picture inside is the tallest run of "photographic" rows (many colours, real texture);
 *    app bars, captions and buttons above and below it are dropped.
 */
export function detectTrim(src: HTMLCanvasElement, hint: { png?: boolean; name?: string; exif?: boolean } = {}): { rect: CropRect; reason: 'borders' | 'screenshot' } | null {
  const S = 320;
  const s = Math.min(1, S / Math.max(src.width, src.height));
  const w = Math.max(8, Math.round(src.width * s)), h = Math.max(8, Math.round(src.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const L = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
  const lineStats = (horiz: boolean, k: number) => {
    const n = horiz ? w : h;
    let sum = 0, sq = 0;
    const cols = new Set<number>();
    for (let t = 0; t < n; t++) {
      const x = horiz ? t : k, y = horiz ? k : t;
      const v = L(x, y); sum += v; sq += v * v;
      const i = (y * w + x) * 4;
      cols.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), colours: cols.size / n };
  };
  const flatEdge = (st: { mean: number; std: number }) => st.std < 5 && (st.mean < 24 || st.mean > 236);

  // 1. screenshot → the photographic run
  const tall = h / w, wide = w / h;
  const phoneShape = (tall > 1.95 && tall < 2.35) || (wide > 1.95 && wide < 2.35);
  const named = !!hint.name && /screen ?shot|screenshot|captura|bildschirmfoto/i.test(hint.name);
  let rect: CropRect = { x: 0, y: 0, w: 1, h: 1 };
  let reason: 'borders' | 'screenshot' | null = null;
  if ((phoneShape && !hint.exif && (hint.png || named || topBarFlat())) || named) {
    // App chrome sits on one background colour (white, black, a dark-mode grey). Take it from the
    // screen's top and bottom rows; a row is chrome when most of it is that colour (text, icons
    // and buttons on the background included). The photo is everything else, however dark.
    const bg = dominantEdgeColour();
    const photoRow = Array.from({ length: h }, (_, y) => {
      let onBg = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < 22) onBg++;
      }
      return onBg / w < 0.6;
    });
    let best = [0, -1], start = -1, gap = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && photoRow[y]) { if (start < 0) start = y; gap = 0; continue; }
      if (start >= 0) {
        gap++;
        if (gap > h * 0.015 || y === h) {
          const end = y - gap;
          if (end - start > best[1] - best[0]) best = [start, end];
          start = -1; gap = 0;
        }
      }
    }
    if (best[1] - best[0] >= h * 0.12) {
      const y0 = best[0] / h, y1 = (best[1] + 1) / h;
      rect = { x: 0, y: y0, w: 1, h: y1 - y0 };
      reason = 'screenshot';
    } else {
      // no clear photo inside: at least drop the status bar and the nav / home bar
      rect = tall > 1 ? { x: 0, y: 0.055, w: 1, h: 0.905 } : { x: 0.055, y: 0, w: 0.905, h: 1 };
      reason = 'screenshot';
    }
  }

  // 2. flat black / white borders (not after a screenshot crop: there the chrome test already
  //    removed the app background, and a dark photo's own shadows must not be shaved off)
  if (reason === 'screenshot') return { rect, reason };
  const x0 = Math.round(rect.x * w), x1 = Math.round((rect.x + rect.w) * w) - 1;
  const y0 = Math.round(rect.y * h), y1 = Math.round((rect.y + rect.h) * h) - 1;
  let top = y0, bot = y1, left = x0, right = x1;
  const maxCut = 0.35;
  while (top < y0 + (y1 - y0) * maxCut && flatEdge(lineStatsRange(true, top, left, right))) top++;
  while (bot > y1 - (y1 - y0) * maxCut && flatEdge(lineStatsRange(true, bot, left, right))) bot--;
  while (left < x0 + (x1 - x0) * maxCut && flatEdge(lineStatsRange(false, left, top, bot))) left++;
  while (right > x1 - (x1 - x0) * maxCut && flatEdge(lineStatsRange(false, right, top, bot))) right--;
  const cut = (top - y0) + (y1 - bot) + (left - x0) + (x1 - right);
  if (cut > Math.min(w, h) * 0.015) {
    rect = { x: left / w, y: top / h, w: (right - left + 1) / w, h: (bot - top + 1) / h };
    reason ??= 'borders';
  }
  return reason ? { rect, reason } : null;

  function lineStatsRange(horiz: boolean, k: number, a: number, b: number) {
    let sum = 0, sq = 0, n = 0;
    for (let t = a; t <= b; t++) { const v = horiz ? L(t, k) : L(k, t); sum += v; sq += v * v; n++; }
    const mean = sum / Math.max(1, n);
    return { mean, std: Math.sqrt(Math.max(0, sq / Math.max(1, n) - mean * mean)) };
  }
  function dominantEdgeColour(): [number, number, number] {
    // most common 4-bit colour on the top and bottom edges, returned as its pixels' true average
    const counts = new Map<number, [number, number, number, number]>();
    const band = Math.max(2, Math.round(h * 0.03));
    for (const y of [...Array(band).keys(), ...Array.from({ length: band }, (_, k) => h - 1 - k)]) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
        const e = counts.get(k) || [0, 0, 0, 0];
        e[0]++; e[1] += px[i]; e[2] += px[i + 1]; e[3] += px[i + 2];
        counts.set(k, e);
      }
    }
    let best: [number, number, number, number] = [1, 255, 255, 255];
    for (const e of counts.values()) if (e[0] > best[0]) best = e;
    return [best[1] / best[0], best[2] / best[0], best[3] / best[0]];
  }
  function topBarFlat() {
    // a status bar: the top ~4% is one flat colour apart from small crisp icons and the clock
    const band = Math.max(2, Math.round(h * 0.04));
    let flat = 0;
    for (let y = 0; y < band; y++) { const st = lineStats(true, y); if (st.colours < 0.08) flat++; }
    return flat / band > 0.7;
  }
}

/** Score at which a picture is treated as a graphic. */
export const GRAPHIC_AT = 0.45;

/**
 * 0..1: how much this looks like a designed graphic (poster, obituary/program cover, flyer,
 * card, screenshot) rather than a photograph. Photos are full of smooth gradients and noise;
 * graphics have flat fills, few colours, hard edges and lines of text.
 */
export function graphicLikeness(px: Uint8ClampedArray, w: number, h: number): number {
  // Measured on real photos vs. an obituary cover (lab, 2026-11-18):
  //   exactly-flat share of lit pixels   photos <= 0.02   cover 0.68
  //   distinct colours per lit pixel     photos >= 0.17   cover 0.02
  //   crisp share of edges               photos <= 0.36   cover 0.85
  // Smooth dusk skies looked "flat" to a naive test; they are never *exactly* flat, and they
  // carry hundreds of shades. Dark pixels are ignored (crushed shadows are flat in photos too).
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  let lit = 0, flat = 0, edges = 0, hard = 0;
  const colours = new Set<number>();
  for (let y = 1; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const j = y * w + x;
      const dx = Math.abs(lum[j] - lum[j - 1]), dy = Math.abs(lum[j] - lum[j - w]);
      if (dx > 8) edges++;
      if (dx > 60) hard++;
      if (lum[j] > 60) {
        lit++;
        if (dx < 1 && dy < 1) flat++;
        const i = j * 4;
        colours.add(((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3));
      }
    }
  }
  if (lit < n * 0.08) return 0; // mostly dark: can't tell, treat as a photo
  const flatR = flat / lit;
  const uniq = colours.size / lit;
  const crisp = edges ? hard / edges : 0;
  const a = w / h;
  const paper = Math.abs(a - 0.773) < 0.06 || Math.abs(a - 0.667) < 0.05 ? 1 : 0;
  const c01 = (v: number) => Math.max(0, Math.min(1, v));
  return c01(0.45 * c01((flatR - 0.08) / 0.35) + 0.3 * c01((0.12 - uniq) / 0.1) + 0.2 * c01((crisp - 0.4) / 0.35) + 0.05 * paper);
}

/** Restrained auto-levels: 0.5th / 99.5th percentile per channel, mild gamma + sat. */
function analyseTone(px: Uint8ClampedArray): PhotoFix {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0, lumSum = 0, satSum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    hist[0][r]++; hist[1][g]++; hist[2][b]++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    satSum += mx ? (mx - mn) / mx : 0;
    n++;
  }
  const pct = (h: Uint32Array, p: number) => {
    const target = n * p; let acc = 0;
    for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= target) return v / 255; }
    return 1;
  };
  const black = [0, 1, 2].map((c) => Math.min(0.12, pct(hist[c], 0.005))) as [number, number, number];
  const white = [0, 1, 2].map((c) => Math.max(0.82, pct(hist[c], 0.995))) as [number, number, number];
  // Keep colour casts that are probably the photo's character (sunset, tungsten): pull
  // channels only partly toward neutral by sharing a common black/white.
  const bAvg = (black[0] + black[1] + black[2]) / 3, wAvg = (white[0] + white[1] + white[2]) / 3;
  for (let c = 0; c < 3; c++) { black[c] = black[c] * 0.45 + bAvg * 0.55; white[c] = white[c] * 0.45 + wAvg * 0.55; }
  const meanLum = lumSum / n / 255;
  const gamma = meanLum < 0.38 ? 1 + (0.38 - meanLum) * 1.4 : meanLum > 0.7 ? 1 - (meanLum - 0.7) * 0.6 : 1;
  const meanSat = satSum / n;
  // Faded prints get a little colour back; vivid phone shots are left alone.
  const saturation = meanSat < 0.18 ? 1.18 : meanSat < 0.28 ? 1.08 : 1;
  return { black, white, gamma: Math.max(0.8, Math.min(1.45, gamma)), saturation, strength: 0.7 };
}

/** Edge energy + skin-tone saliency on the proxy. */
function saliency(px: Uint8ClampedArray, w: number, h: number) {
  const lum = new Float32Array(w * h);
  const skin = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    lum[j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // YCbCr skin box (broad — all skin tones), soft membership.
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    skin[j] = cr > 135 && cr < 180 && cb > 85 && cb < 135 && r > 40 ? 1 : 0;
  }
  let sx = 0, sy = 0, sw = 0, edgeSum = 0;
  const cell = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const j = y * w + x;
      const gx = lum[j + 1] - lum[j - 1], gy = lum[j + w] - lum[j - w];
      const e = Math.min(1, Math.hypot(gx, gy) / 90);
      edgeSum += e;
      const dx = x / w - 0.5, dy = y / h - 0.45;
      const centre = Math.exp(-(dx * dx + dy * dy) / 0.18);
      const v = (e * 0.6 + skin[j] * 1.4) * (0.35 + centre);
      cell[j] = skin[j];
      sx += x * v; sy += y * v; sw += v;
    }
  }
  // Rough count of skin blobs as a face proxy (connected 3×3 blocks).
  const bw = Math.ceil(w / 6), bh = Math.ceil(h / 6);
  const blocks = new Uint8Array(bw * bh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cell[y * w + x]) blocks[((y / 6) | 0) * bw + ((x / 6) | 0)]++;
  const seen = new Uint8Array(bw * bh);
  let blobs = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (seen[i] || blocks[i] < 14) continue;
    blobs++;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!; const kx = k % bw, ky = (k / bw) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + ox, ny = ky + oy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const nk = ny * bw + nx;
        if (!seen[nk] && blocks[nk] >= 14) { seen[nk] = 1; stack.push(nk); }
      }
    }
  }
  const detail = Math.min(1, (edgeSum / (w * h)) * 3.2);
  return { cx: sw ? sx / sw / w : 0.5, cy: sw ? sy / sw / h : 0.45, detail, skinBlobs: Math.min(blobs, 6) };
}

/** Largest square that contains the subject, keeping every face whole when possible. */
export function squareCrop(W: number, H: number, focus: { x: number; y: number }, faces: FaceBox[]): CropRect {
  const side = Math.min(W, H);
  const sw = side / W, sh = side / H; // normalised size of the square
  let x = focus.x - sw / 2, y = focus.y - sh / 2;
  if (faces.length) {
    // Pull the window to include the face extents when they fit.
    const fx0 = Math.min(...faces.map((f) => f.x)), fx1 = Math.max(...faces.map((f) => f.x + f.w));
    const fy0 = Math.min(...faces.map((f) => f.y - f.h * 0.35)), fy1 = Math.max(...faces.map((f) => f.y + f.h));
    if (fx1 - fx0 <= sw) x = Math.min(Math.max(x, fx1 - sw), fx0);
    if (fy1 - fy0 <= sh) y = Math.min(Math.max(y, fy1 - sh), fy0);
  }
  x = Math.max(0, Math.min(1 - sw, x));
  y = Math.max(0, Math.min(1 - sh, y));
  return { x, y, w: sw, h: sh };
}

/** Draw the fixed photo (tone pass applied) into a canvas at up to maxSide. */
export async function renderFixed(photo: ShowPhoto, maxSide: number, crop?: CropRect): Promise<HTMLCanvasElement> {
  const upright = await uprightTrimmed(photo);
  const r = crop || { x: 0, y: 0, w: 1, h: 1 };
  const sx = r.x * upright.width, sy = r.y * upright.height, sw = r.w * upright.width, sh = r.h * upright.height;
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(upright, sx, sy, sw, sh, 0, 0, c.width, c.height);
  applyFix(g, c.width, c.height, photo.fix);
  return c;
}

function applyFix(g: CanvasRenderingContext2D, w: number, h: number, f: PhotoFix) {
  if (!f || f.strength <= 0) return;
  const lut = [0, 1, 2].map((c) => {
    const t = new Uint8ClampedArray(256);
    const b = f.black[c], wt = f.white[c], span = Math.max(0.2, wt - b);
    for (let v = 0; v < 256; v++) {
      let x = (v / 255 - b) / span;
      x = Math.max(0, Math.min(1, x));
      x = Math.pow(x, 1 / f.gamma);
      t[v] = Math.round((v / 255 * (1 - f.strength) + x * f.strength) * 255);
    }
    return t;
  });
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const sat = 1 + (f.saturation - 1) * f.strength;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[0][d[i]], gg = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
    }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
}
