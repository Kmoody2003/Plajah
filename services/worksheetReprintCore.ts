// worksheetReprintCore — the deterministic, model-free heart of worksheet reconstruction.
//
// Everything here operates on plain arrays so it runs identically in the browser and in
// node:test. The DOM/canvas glue lives in worksheetReprint.ts; Florence/SlimSAM remain an
// optional *naming* layer in telaDocumentIntelligence — they can label a region "book bag",
// but they can no longer decide whether a graphic exists at all. The contract:
//
//   1. flattenWorksheetPixels     — divide-by-background paper flattening (flatbed-scan look).
//   2. buildInkMap                — every pixel that is ink, not paper.
//   3. eraseBoxesFromInk          — OCR text boxes stamped out of the ink map.
//   4. separateRulesAndRegions    — ONE component pass splits isolated thin dark components
//                                   (printed rules / answer blanks) from everything else,
//                                   which merges into artwork regions. No detector gate.
//   5. classifyRegionArt          — line-art vs color-art strategy per region.
//   6. normalizeTypography        — cluster font sizes, snap columns, find headings/centers,
//                                   so rebuilt text reads as a designed page, not a ransom note.

export interface InkBox { x: number; y: number; w: number; h: number; }

export interface InkRule { axis: 'H' | 'V'; x1: number; y1: number; x2: number; y2: number; thickness: number; }

export interface InkRegion extends InkBox { id: string; inkPixels: number; }

export interface RegionArtProfile {
  style: 'LINE_ART' | 'COLOR';
  /** Dominant ink color of the region, as a css hex color. */
  inkColor: string;
  /** 0..1 fraction of ink pixels that are saturated (colored, not grey/black). */
  saturatedFraction: number;
}

export interface TypoEntryIn { x: number; y: number; w: number; h: number; text: string; confidence?: number; }

export interface TypoEntry extends TypoEntryIn {
  fontSize: number;
  fontWeight: number;
  align: 'left' | 'center';
  /** Column-snapped left edge (equals x when no column matched). */
  snapX: number;
  role: 'TITLE' | 'HEADING' | 'BODY';
  blockId: number;
}

const lumAt = (data: Uint8ClampedArray, i: number) => data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;

/**
 * Divide-by-background paper flattening, in place.
 * The background (paper under local lighting) is estimated on a coarse grid from each cell's
 * brightest quartile, max-dilated so ink-heavy cells borrow neighbouring paper, smoothed, then
 * bilinearly interpolated per pixel. src/bg brings shadowed paper to uniform white while keeping
 * ink color — the single change that makes traces and fallbacks stop looking like photographs.
 */
export function flattenWorksheetPixels(data: Uint8ClampedArray, width: number, height: number) {
  const cell = Math.max(16, Math.round(Math.min(width, height) / 36));
  const gw = Math.ceil(width / cell), gh = Math.ceil(height / cell);
  const bg = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  const lums = new Float32Array(cell * cell);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x0 = gx * cell, y0 = gy * cell, x1 = Math.min(width, x0 + cell), y1 = Math.min(height, y0 + cell);
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) lums[n++] = lumAt(data, (y * width + x) * 4);
    const sorted = lums.slice(0, n).sort();
    const threshold = sorted[Math.floor(n * .75)];
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (lumAt(data, i) >= threshold) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++; }
    }
    const gi = gy * gw + gx;
    bg[0][gi] = count ? r / count : 255; bg[1][gi] = count ? g / count : 255; bg[2][gi] = count ? b / count : 255;
  }
  // Ink-dominated cells (a large filled drawing) report the drawing as "paper". Replace only
  // those OUTLIERS with their neighbourhood median — a max-dilate here would overestimate the
  // background inside smooth lighting gradients and leave grey residue across the whole page.
  for (let c = 0; c < 3; c++) {
    for (let pass = 0; pass < 2; pass++) {
      const src = bg[c].slice();
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const around: number[] = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = gy + dy, nx = gx + dx;
          if (ny >= 0 && ny < gh && nx >= 0 && nx < gw) around.push(src[ny * gw + nx]);
        }
        around.sort((a, b) => a - b);
        const median = around[Math.floor(around.length / 2)];
        if (src[gy * gw + gx] < median * .82) bg[c][gy * gw + gx] = median;
      }
    }
    const src = bg[c].slice();
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = gy + dy, nx = gx + dx;
        if (ny >= 0 && ny < gh && nx >= 0 && nx < gw) { sum += src[ny * gw + nx]; n++; }
      }
      bg[c][gy * gw + gx] = sum / n;
    }
  }
  const target = 250;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(gh - 1.001, Math.max(0, y / cell - .5));
    const gy0 = Math.floor(fy), ty = fy - gy0, gy1 = Math.min(gh - 1, gy0 + 1);
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gw - 1.001, Math.max(0, x / cell - .5));
      const gx0 = Math.floor(fx), tx = fx - gx0, gx1 = Math.min(gw - 1, gx0 + 1);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const b0 = bg[c][gy0 * gw + gx0] * (1 - tx) + bg[c][gy0 * gw + gx1] * tx;
        const b1 = bg[c][gy1 * gw + gx0] * (1 - tx) + bg[c][gy1 * gw + gx1] * tx;
        const estimate = Math.max(40, b0 * (1 - ty) + b1 * ty);
        data[i + c] = Math.min(255, Math.round(data[i + c] * target / estimate));
      }
    }
  }
}

/**
 * 1 where a flattened pixel is ink (dark, or light-but-colored), 0 where it is paper.
 * The luminance cut is deliberately strict (196): flattened paper sits near 250, real print
 * and pencil under ~185, while residual shadow bands hover around 200–210 — letting those in
 * once bridged every drawing on a page into a single giant connected component.
 * A despeckle pass then removes lone JPEG-noise pixels so they cannot act as bridges either.
 */
export function buildInkMap(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const ink = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < ink.length; p++, i += 4) {
    const lum = lumAt(data, i);
    const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    ink[p] = lum < 196 || (chroma > 46 && lum < 240) ? 1 : 0;
  }
  const cleaned = ink.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (!ink[p]) continue;
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && ink[ny * width + nx]) neighbours++;
    }
    if (neighbours < 2) cleaned[p] = 0;
  }
  return cleaned;
}

/** Stamp recognized text boxes (with padding) out of the ink map. */
export function eraseBoxesFromInk(ink: Uint8Array, width: number, height: number, boxes: InkBox[], pad = 3) {
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x - pad)), x1 = Math.min(width - 1, Math.ceil(box.x + box.w + pad));
    const y0 = Math.max(0, Math.floor(box.y - pad)), y1 = Math.min(height - 1, Math.ceil(box.y + box.h + pad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ink[y * width + x] = 0;
  }
}

interface InkComponent { x: number; y: number; w: number; h: number; pixels: number; meanLum: number; }

/** 8-connected components over the ink map, with per-component mean luminance when pixels given. */
function inkComponents(ink: Uint8Array, width: number, height: number, data?: Uint8ClampedArray): InkComponent[] {
  const labels = new Int32Array(width * height);
  const components: InkComponent[] = [];
  const stack: number[] = [];
  for (let p = 0; p < ink.length; p++) {
    if (!ink[p] || labels[p]) continue;
    const label = components.length + 1;
    let x0 = width, y0 = height, x1 = 0, y1 = 0, pixels = 0, lum = 0;
    stack.push(p); labels[p] = label;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % width, qy = (q / width) | 0;
      pixels++;
      if (data) { const i = q * 4; lum += data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722; }
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (ink[n] && !labels[n]) { labels[n] = label; stack.push(n); }
      }
    }
    components.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels, meanLum: data ? lum / Math.max(1, pixels) : 0 });
  }
  return components;
}

function mergeIntoRegions(candidates: InkComponent[], mergeGap: number, pageArea: number, minRegionPixels: number, maxRegions: number): InkRegion[] {
  const regions = candidates.map((c, i) => ({ id: `ink_${i}`, x: c.x, y: c.y, w: c.w, h: c.h, inkPixels: c.pixels }));
  // Never let a merge grow a region past this: two big decorative clusters merging into one
  // page-spanning blob is what caused entire artwork sets to be dropped by the size filter.
  const mergeCap = pageArea * .5;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let a = 0; a < regions.length; a++) for (let b = a + 1; b < regions.length; b++) {
      const A = regions[a], B = regions[b];
      const touch = A.x - mergeGap < B.x + B.w && B.x - mergeGap < A.x + A.w && A.y - mergeGap < B.y + B.h && B.y - mergeGap < A.y + A.h;
      if (!touch) continue;
      const x = Math.min(A.x, B.x), y = Math.min(A.y, B.y);
      const w = Math.max(A.x + A.w, B.x + B.w) - x, h = Math.max(A.y + A.h, B.y + B.h) - y;
      if (w * h > mergeCap && (A.w * A.h > minRegionPixels * 20 || B.w * B.h > minRegionPixels * 20)) continue;
      regions[a] = { id: A.id, x, y, w, h, inkPixels: A.inkPixels + B.inkPixels };
      regions.splice(b, 1);
      merged = true; break outer;
    }
  }
  return regions
    .filter(r => r.inkPixels >= minRegionPixels && r.w >= 12 && r.h >= 12 && r.w * r.h < pageArea * .88)
    .sort((a, b) => b.inkPixels - a.inkPixels)
    .slice(0, maxRegions);
}

export interface InkFrame extends InkBox { rounded: boolean; }

/**
 * Fraction of a bbox's perimeter PATH that has ink within `band` inward — high for printed
 * form-boxes (hollow rects) regardless of stroke thickness. Measured per edge-step (does any
 * ink sit in the inward band at this position?), not per band-cell, so a thin 2px box stroke
 * inside a wider tolerance band still scores ~1.0.
 */
function perimeterInkCoverage(ink: Uint8Array, width: number, height: number, box: InkBox, band: number): number {
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(width - 1, box.x + box.w - 1), y1 = Math.min(height - 1, box.y + box.h - 1);
  let covered = 0, steps = 0;
  const scan = (fx: (t: number) => boolean) => { steps++; if (fx(0)) covered++; };
  for (let x = x0; x <= x1; x++) {
    scan(() => { for (let b = 0; b < band; b++) if (ink[(y0 + b) * width + x]) return true; return false; });   // top edge
    scan(() => { for (let b = 0; b < band; b++) if (ink[(y1 - b) * width + x]) return true; return false; });   // bottom edge
  }
  for (let y = y0; y <= y1; y++) {
    scan(() => { for (let b = 0; b < band; b++) if (ink[y * width + (x0 + b)]) return true; return false; });   // left edge
    scan(() => { for (let b = 0; b < band; b++) if (ink[y * width + (x1 - b)]) return true; return false; });   // right edge
  }
  return steps ? covered / steps : 0;
}

/**
 * Split the (text-subtracted) ink into printed RULES, printed BOX FRAMES, and ARTWORK regions
 * in one component pass. The distinctions are structural, not statistical:
 *   · a RULE / answer blank is an isolated thin dark component;
 *   · a FRAME is a large, hollow, rectangular component (a form's answer box) — its ink hugs the
 *     bounding-box border and its interior is mostly empty. Real classroom worksheets are grids
 *     of these, and without this test they merge into one page-spanning blob that swallows the
 *     clip art. Frames become layout rectangles, not artwork;
 *   · everything else is ARTWORK — a straight edge connected to a drawing stays with that drawing.
 */
export function separateRulesAndRegions(
  ink: Uint8Array, width: number, height: number,
  data?: Uint8ClampedArray,
  options: { minComponentPixels?: number; minRegionPixels?: number; mergeGap?: number; maxRegions?: number } = {},
): { rules: InkRule[]; frames: InkFrame[]; regions: InkRegion[] } {
  const minComponentPixels = options.minComponentPixels ?? 24;
  const minRegionPixels = options.minRegionPixels ?? 140;
  // A tight merge gap: dense forms pack clip art and boxes close together, and a wide gap
  // collapses the whole page into one region. Strokes of a single drawing are still connected
  // (gap 0) so they merge regardless.
  const mergeGap = options.mergeGap ?? Math.max(6, Math.round(Math.max(width, height) * .006));
  const maxThickness = Math.max(4, Math.round(Math.min(width, height) * .008));
  const minRuleLength = Math.max(40, Math.min(width, height) * .05);
  const minFrameW = width * .1, minFrameH = height * .04;
  const rules: InkRule[] = [];
  const frames: InkFrame[] = [];
  const artwork: InkComponent[] = [];
  for (const component of inkComponents(ink, width, height, data)) {
    const fillRatio = component.pixels / Math.max(1, component.w * component.h);
    const darkEnough = !data || component.meanLum < 200;
    const ruleH = component.h <= maxThickness && component.w >= Math.max(minRuleLength, component.h * 10) && fillRatio >= .18 && darkEnough;
    const ruleV = component.w <= maxThickness && component.h >= Math.max(minRuleLength, component.w * 10) && fillRatio >= .18 && darkEnough;
    if (ruleH) { rules.push({ axis: 'H', x1: component.x, y1: component.y + component.h / 2, x2: component.x + component.w, y2: component.y + component.h / 2, thickness: component.h }); continue; }
    if (ruleV) { rules.push({ axis: 'V', x1: component.x + component.w / 2, y1: component.y, x2: component.x + component.w / 2, y2: component.y + component.h, thickness: component.w }); continue; }
    if (component.pixels < minComponentPixels || (data && component.meanLum >= 215)) continue;
    // Frame test: large, hollow, its ink hugs the bounding-box border, AND its interior is
    // nearly empty. The interior-emptiness check is what separates a printed answer box from a
    // rectangular DRAWING (a bag, a monitor) whose interior carries detail.
    if (component.w >= minFrameW && component.h >= minFrameH && fillRatio < .32) {
      const band = Math.max(3, Math.round(Math.min(component.w, component.h) * .05));
      const inset = band + 2;
      let interiorInk = 0;
      const ix0 = component.x + inset, iy0 = component.y + inset;
      const ix1 = component.x + component.w - inset, iy1 = component.y + component.h - inset;
      for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) if (ink[y * width + x]) interiorInk++;
      const interiorArea = Math.max(1, (ix1 - ix0) * (iy1 - iy0));
      if (perimeterInkCoverage(ink, width, height, component, band) >= .6 && interiorInk / interiorArea < .04) {
        frames.push({ x: component.x, y: component.y, w: component.w, h: component.h, rounded: true });
        continue;
      }
    }
    artwork.push(component);
  }
  return { rules, frames, regions: mergeIntoRegions(artwork, mergeGap, width * height, minRegionPixels, options.maxRegions ?? 18) };
}

/**
 * Whatever ink survives text/rule subtraction is artwork. Kept as a thin wrapper over the
 * component pass for callers/tests that only need regions.
 */
export function findInkRegions(
  ink: Uint8Array, width: number, height: number,
  options: { minComponentPixels?: number; minRegionPixels?: number; mergeGap?: number; maxRegions?: number } = {},
): InkRegion[] {
  const minComponentPixels = options.minComponentPixels ?? 24;
  const candidates = inkComponents(ink, width, height).filter(c => c.pixels >= minComponentPixels);
  const mergeGap = options.mergeGap ?? Math.max(8, Math.round(Math.max(width, height) * .012));
  return mergeIntoRegions(candidates, mergeGap, width * height, options.minRegionPixels ?? 140, options.maxRegions ?? 14);
}

/** Decide the tracing strategy and dominant ink color for one artwork region. */
export function classifyRegionArt(data: Uint8ClampedArray, width: number, height: number, region: InkBox, ink?: Uint8Array): RegionArtProfile {
  let saturated = 0, total = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const x1 = Math.min(width, Math.ceil(region.x + region.w)), y1 = Math.min(height, Math.ceil(region.y + region.h));
  for (let y = Math.max(0, Math.floor(region.y)); y < y1; y++) for (let x = Math.max(0, Math.floor(region.x)); x < x1; x++) {
    const p = y * width + x;
    const i = p * 4;
    const lum = lumAt(data, i);
    const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    const isInk = ink ? !!ink[p] : (lum < 208 || (chroma > 46 && lum < 244));
    if (!isInk) continue;
    total++;
    if (chroma > 50) saturated++;
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2];
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const inkColor = best ? `#${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}` : '#221d28';
  const saturatedFraction = total ? saturated / total : 0;
  return { style: saturatedFraction > .22 ? 'COLOR' : 'LINE_ART', inkColor, saturatedFraction };
}

/**
 * Estimate the small-angle skew of a page from its ink map via projection profiles.
 * For each candidate angle it projects sampled ink pixels onto the vertical axis and scores
 * the histogram by Σ(count²): text rows and printed rules pile into sharp bins at the true
 * angle, so the score peaks there. Handles ±maxDeg only — 90°/180° orientation is decided
 * separately by OCR-confidence voting, because geometry alone can't tell upright from upside-down.
 */
export function estimateDeskewAngle(ink: Uint8Array, width: number, height: number, maxDeg = 8): number {
  // Sample ink coordinates (cap the count so large scans stay fast).
  const coords: number[] = [];
  const total = ink.length;
  let inkCount = 0;
  for (let p = 0; p < total; p++) if (ink[p]) inkCount++;
  if (inkCount < 200) return 0;
  const stride = Math.max(1, Math.floor(inkCount / 40000));
  let seen = 0;
  for (let p = 0; p < total; p++) {
    if (!ink[p]) continue;
    if (seen++ % stride) continue;
    coords.push(p % width, (p / width) | 0);
  }
  const cx = width / 2, cy = height / 2;
  const bin = 2;
  const bins = Math.ceil((width + height) / bin) + 2;
  const offset = Math.ceil((width + height) / 2 / bin);
  const scoreAt = (deg: number) => {
    const rad = deg * Math.PI / 180, s = Math.sin(rad), c = Math.cos(rad);
    const hist = new Float64Array(bins);
    for (let i = 0; i < coords.length; i += 2) {
      const dx = coords[i] - cx, dy = coords[i + 1] - cy;
      const yPrime = -dx * s + dy * c;
      const b = (yPrime / bin | 0) + offset;
      if (b >= 0 && b < bins) hist[b]++;
    }
    let score = 0;
    for (let b = 0; b < bins; b++) score += hist[b] * hist[b];
    return score;
  };
  // Coarse 1° sweep, then refine ±1° at 0.2°.
  let best = 0, bestScore = -1;
  for (let deg = -maxDeg; deg <= maxDeg; deg += 1) {
    const s = scoreAt(deg);
    if (s > bestScore) { bestScore = s; best = deg; }
  }
  for (let deg = best - 1; deg <= best + 1; deg += 0.2) {
    const s = scoreAt(deg);
    if (s > bestScore) { bestScore = s; best = deg; }
  }
  return Math.abs(best) < 0.25 ? 0 : Math.round(best * 10) / 10;
}

/**
 * Typographic normalization — the difference between "OCR debris" and a designed page.
 *   · font sizes are clustered so every body line shares one size, headings another;
 *   · left edges are snapped into columns;
 *   · near-center headings become truly centered;
 *   · consecutive same-style lines join a block so spacing reads as intentional.
 */
export function normalizeTypography(entries: TypoEntryIn[], pageW: number, pageH: number): TypoEntry[] {
  if (!entries.length) return [];
  const working = entries.map(entry => ({
    ...entry,
    rawSize: Math.max(7, Math.min(pageH * .07, entry.h * .74)),
  })).sort((a, b) => a.y - b.y || a.x - b.x);

  // 1D size clustering: sort sizes, split where the jump exceeds 16%.
  const bySize = [...working].sort((a, b) => a.rawSize - b.rawSize);
  const clusters: Array<typeof working> = [];
  for (const entry of bySize) {
    const current = clusters[clusters.length - 1];
    if (current && entry.rawSize <= current[0].rawSize * 1.16 * Math.pow(1.02, current.length)) current.push(entry);
    else clusters.push([entry]);
  }
  const clusterSize = new Map<TypoEntryIn, { size: number; cluster: number }>();
  clusters.forEach((cluster, index) => {
    const median = cluster.map(e => e.rawSize).sort((a, b) => a - b)[Math.floor(cluster.length / 2)];
    cluster.forEach(entry => clusterSize.set(entry, { size: Math.round(median * 2) / 2, cluster: index }));
  });
  const body = [...clusters].sort((a, b) => b.length - a.length)[0];
  const bodySize = body.map(e => e.rawSize).sort((a, b) => a - b)[Math.floor(body.length / 2)];
  const maxSize = Math.max(...working.map(e => clusterSize.get(e)!.size));

  // Column snapping on left edges.
  const tolerance = Math.max(6, pageW * .012);
  const columns: Array<{ xs: number[]; snap: number }> = [];
  for (const entry of [...working].sort((a, b) => a.x - b.x)) {
    const column = columns.find(c => Math.abs(c.snap - entry.x) <= tolerance);
    if (column) { column.xs.push(entry.x); column.snap = column.xs.reduce((s, v) => s + v, 0) / column.xs.length; }
    else columns.push({ xs: [entry.x], snap: entry.x });
  }

  let blockId = 0;
  let previous: (TypoEntryIn & { rawSize: number }) | null = null;
  return working.map(entry => {
    const { size, cluster } = clusterSize.get(entry)!;
    const column = columns.find(c => c.xs.length > 1 && Math.abs(c.snap - entry.x) <= tolerance);
    const snapX = column ? column.snap : entry.x;
    const heading = size >= Math.max(bodySize * 1.3, bodySize + 4);
    const title = heading && size >= maxSize * .96 && entry.y < pageH * .3;
    const center = Math.abs(entry.x + entry.w / 2 - pageW / 2) < pageW * .025 && entry.x > pageW * .08;
    const sameBlock = previous
      && clusterSize.get(previous)!.cluster === cluster
      && Math.abs(previous.x - entry.x) <= tolerance * 1.5
      && entry.y - (previous.y + previous.h) < size * 1.4;
    if (!sameBlock) blockId++;
    previous = entry;
    const { rawSize: _raw, ...rest } = entry;
    return {
      ...rest, fontSize: size, fontWeight: heading ? 700 : 400,
      align: center && heading ? 'center' as const : 'left' as const,
      snapX, role: title ? 'TITLE' as const : heading ? 'HEADING' as const : 'BODY' as const,
      blockId,
    };
  });
}

/** Dominant ink color inside one text box, for preserving colored headings. */
export function sampleTextColor(data: Uint8ClampedArray, width: number, height: number, box: InkBox): string {
  const profile = classifyRegionArt(data, width, height, box);
  // Very light samples mean OCR matched a box with almost no ink — keep near-black body ink.
  return profile.inkColor;
}

export type Point = [number, number];

/**
 * Solve the 3×3 homography H (with h33 = 1) that maps the four src points to the four dst points,
 * via an 8×8 linear system + Gaussian elimination. Used to un-keystone a photographed page: a phone
 * held at an angle turns the rectangular paper into a trapezoid, and mapping that trapezoid's four
 * corners back to a rectangle flattens the page — perspective correction the affine deskew can't do.
 */
export function computeHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Apply a 3×3 homography (row-major length-9) to a point. */
export function applyHomography(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Gaussian elimination with partial pivoting for an 8×8 system. */
function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/**
 * Order four unordered corner points as [top-left, top-right, bottom-right, bottom-left].
 * The paper's corners come from extreme-sum/diff detection in any order; a warp needs them ordered.
 */
export function orderQuadCorners(pts: Point[]): Point[] {
  const bySum = [...pts].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const tl = bySum[0], br = bySum[3];
  const byDiff = [...pts].sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  const bl = byDiff[0], tr = byDiff[3];
  return [tl, tr, br, bl];
}

/**
 * Find the paper quadrilateral from a downscaled bright-paper mask (1 = paper). Returns the four
 * corners in full-resolution coordinates, or null when the mask is too sparse / not quad-like.
 * Corners are the extremes of x+y and x−y over paper cells — robust for a convex page whose sides
 * are roughly axis-aligned but perspective-skewed.
 */
export function findPaperQuadFromMask(mask: Uint8Array, mw: number, mh: number, step: number): Point[] | null {
  let tl: Point | null = null, tr: Point | null = null, bl: Point | null = null, br: Point | null = null;
  let tlV = Infinity, brV = -Infinity, blV = Infinity, trV = -Infinity, count = 0;
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    if (!mask[my * mw + mx]) continue;
    count++;
    const sum = mx + my, diff = mx - my;
    if (sum < tlV) { tlV = sum; tl = [mx, my]; }
    if (sum > brV) { brV = sum; br = [mx, my]; }
    if (diff < blV) { blV = diff; bl = [mx, my]; }
    if (diff > trV) { trV = diff; tr = [mx, my]; }
  }
  if (!tl || !tr || !bl || !br || count < mw * mh * .1) return null;
  const scale = (p: Point): Point => [p[0] * step, p[1] * step];
  return [scale(tl), scale(tr), scale(br), scale(bl)];
}
