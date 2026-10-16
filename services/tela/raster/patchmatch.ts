// raster/patchmatch — Content-Aware Fill: multi-scale PatchMatch with EM voting.
//
// Replaces the old fake inpaint (a radial gradient). Algorithm = Wexler, Shechtman & Irani
// "Space-Time Completion" (2007) with Barnes et al. PatchMatch (2009) as the nearest-
// neighbour search — the same family Photoshop's Content-Aware Fill and GIMP Resynthesizer
// use:
//   1. Gaussian-ish pyramid of image, hole and allowed-source masks (hole = any child hole).
//   2. Coarsest level: onion-peel diffusion fill, random NNF over VALID source patches
//      (patch fully known and inside the allowed area — the "source-area exclusion mask").
//   3. EM per level: PatchMatch (propagation + exponentially shrinking random search,
//      alternating scan order) then voting: each hole pixel = weighted mean of the source
//      pixels proposed by every overlapping patch, w = exp(−d / 2σ²), σ² = 75th pct of d.
//   4. Upsample the NNF ×2, re-vote, repeat EM with fewer iterations at finer levels.
//   5. Gradient-domain seam blend (Pérez seamless cloning): the texture is extrapolated a few pixels past the
//      hole by the same votes, the membrane ∇²h = 0 with h = original − texture on that ring is solved, and
//      h is added inside — a brightness or hue offset between fill and surround disappears instead of
//      reading as a pasted patch.
//   6. Feathered composite by the hole coverage.
// Two further Photoshop-grade terms (measured on scripts/tela/fillBench.ts):
//   • colour adaptation — each vote carries a per-patch colour offset estimated on the known overlap, so a
//     source patch from a brighter part of a gradient lands at the local brightness (the "Color Adaptation" dial);
//   • locality — a soft preference for nearby sources in the patch distance, so a water reflection is filled
//     from the water beside it rather than a sky patch with the same colour (Photoshop's "Auto" sampling area).
// Pure typed arrays: runs in node, a worker (rasterWorker.ts) or the main thread.

import { createBitmap, rng, type Bitmap8, type Mask8 } from './buffer';
import { solveMembrane } from './membrane';

export interface ContentAwareOptions {
  /** 255 = may be used as source (Photoshop's "sampling area"); omit = whole image. */
  sourceMask?: Mask8;
  patchSize?: number; // odd, default 7
  seed?: number;
  /** EM iterations at the coarsest level (finer levels use fewer). */
  iterations?: number;
  /** Colour adaptation (allow slight brightness drift at the finest level). */
  onProgress?: (fraction: number) => void;
  /** true = Photoshop-style local sampling window (default off: A/B on foliage favoured the whole image). */
  window?: boolean;
  /** Coarsest-level initialisation: 'ring' best-match peel (default) or 'diffuse' membrane. */
  init?: 'ring' | 'diffuse';
  /** Coarse-hole rule: 'majority' (default) or 'any' child hole. */
  coarse?: 'majority' | 'any';
  /** Colour adaptation: per-patch brightness / colour offset from the known overlap, applied in the vote (default on). */
  colorAdapt?: boolean;
  /** Gradient-domain seam blend of the finished fill into its surround (default on). */
  seamBlend?: boolean;
  /** Preference for nearby sources, as a fraction of the worst-case patch distance; 0 disables (default 0.04). */
  locality?: number;
  /**
   * Texture-energy matching: a source patch is penalised when its local detail differs from the detail expected at
   * the target (interpolated from the hole's surround). Keeps fills as crisp as their context instead of drifting
   * to the smooth, hazy regions that minimise squared error. 0 disables (default 3).
   */
  textureMatch?: number;
}

interface Level {
  W: number; H: number; img: Float32Array; hole: Uint8Array; allowed: Uint8Array; valid: Uint8Array; validList: Int32Array;
  /** locality prior: penalty = min(locCap, locW · |target − source|²), in patch-distance units */
  locW: number; locCap: number;
  /** texture energy: mean luma gradient over the patch (known pixels only), and the level expected at each target */
  energy: Float32Array | null; expect: Float32Array | null; energyW: number;
}

/** Per-level texture energy maps for the texture-matching term. */
function textureEnergy(l: Level, r: number, weight: number) {
  const { W, H, img, hole } = l, area = (2 * r + 1) ** 2;
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (hole[i]) continue;
    const L = img[i * 3] * 0.299 + img[i * 3 + 1] * 0.587 + img[i * 3 + 2] * 0.114;
    let e = 0, n = 0;
    if (x + 1 < W && !hole[i + 1]) { e += Math.abs(img[(i + 1) * 3] * 0.299 + img[(i + 1) * 3 + 1] * 0.587 + img[(i + 1) * 3 + 2] * 0.114 - L); n++; }
    if (y + 1 < H && !hole[i + W]) { e += Math.abs(img[(i + W) * 3] * 0.299 + img[(i + W) * 3 + 1] * 0.587 + img[(i + W) * 3 + 2] * 0.114 - L); n++; }
    g[i] = n ? e / n : 0;
  }
  // box mean over known pixels via integral images of g and of the known count
  const S = new Float64Array((W + 1) * (H + 1)), C = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let rs = 0, rc = 0; for (let x = 0; x < W; x++) { const i = y * W + x; if (!hole[i]) { rs += g[i]; rc++; } S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + rs; C[(y + 1) * (W + 1) + x + 1] = C[y * (W + 1) + x + 1] + rc; } }
  const energy = new Float32Array(W * H), expect = new Float32Array(W * H), unknown = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
    const sum = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
    const cnt = C[y1 * (W + 1) + x1] - C[y0 * (W + 1) + x1] - C[y1 * (W + 1) + x0] + C[y0 * (W + 1) + x0];
    const i = y * W + x; energy[i] = cnt ? sum / cnt : 0;
    // the expected level is unknown wherever the window touches the hole; the membrane carries the surround's level in
    unknown[i] = cnt < (x1 - x0) * (y1 - y0) ? 1 : 0; expect[i] = energy[i];
  }
  solveMembrane(W, H, 1, expect, unknown, { iterations: 120 });
  l.energy = energy; l.expect = expect; l.energyW = weight * area * 3;
}

function buildLevel(W: number, H: number, img: Float32Array, hole: Uint8Array, allowed: Uint8Array, r: number): Level {
  // valid source centre: whole (2r+1)² window inside image, no hole, all allowed — integral image of "bad"
  const S = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { const i = y * W + x; row += hole[i] || !allowed[i] ? 1 : 0; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
  const valid = new Uint8Array(W * H), list: number[] = [];
  for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
    const x0 = x - r, y0 = y - r, x1 = x + r + 1, y1 = y + r + 1;
    const bad = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
    if (!bad) { valid[y * W + x] = 1; list.push(y * W + x); }
  }
  return { W, H, img, hole, allowed, valid, validList: Int32Array.from(list), locW: 0, locCap: 0, energy: null, expect: null, energyW: 0 };
}
function downsample(l: Level, r: number, mode: 'any' | 'majority' = 'majority'): Level {
  const W = Math.max(1, l.W >> 1), H = Math.max(1, l.H >> 1), img = new Float32Array(W * H * 3), hole = new Uint8Array(W * H), allowed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let n = 0, h = 0, al = 1; const acc = [0, 0, 0];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const sx = Math.min(l.W - 1, 2 * x + i), sy = Math.min(l.H - 1, 2 * y + j), s = sy * l.W + sx;
      if (l.hole[s]) { h++; continue; } if (!l.allowed[s]) al = 0;
      acc[0] += l.img[s * 3]; acc[1] += l.img[s * 3 + 1]; acc[2] += l.img[s * 3 + 2]; n++;
    }
    // a coarse pixel is hole only when most of its children are: partially known pixels keep
    // their known average as a constraint (an "any child" rule leaves a blurry band at the
    // hole edge after upsampling)
    const d = y * W + x; const isHole = mode === 'any' ? h > 0 : h > n; hole[d] = isHole ? 1 : 0; allowed[d] = al && !h ? 1 : 0;
    if (n) { img[d * 3] = acc[0] / n; img[d * 3 + 1] = acc[1] / n; img[d * 3 + 2] = acc[2] / n; }
  }
  return buildLevel(W, H, img, hole, allowed, r);
}

/** Onion-peel diffusion: fill hole pixels from known neighbours, outside → in. */
function diffuseFill(l: Level) {
  const { W, H, img } = l, known = new Uint8Array(W * H); let frontier: number[] = [];
  for (let i = 0; i < W * H; i++) if (!l.hole[i]) known[i] = 1;
  for (let i = 0; i < W * H; i++) if (!known[i]) frontier.push(i);
  let guard = 0;
  while (frontier.length && guard++ < W + H) {
    const next: number[] = [], fill: [number, number, number, number][] = [];
    for (const p of frontier) {
      const x = p % W, y = (p / W) | 0; let n = 0; const acc = [0, 0, 0];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (!known[q]) continue; acc[0] += img[q * 3]; acc[1] += img[q * 3 + 1]; acc[2] += img[q * 3 + 2]; n++; }
      if (n) fill.push([p, acc[0] / n, acc[1] / n, acc[2] / n]); else next.push(p);
    }
    for (const [p, r, g, b] of fill) { img[p * 3] = r; img[p * 3 + 1] = g; img[p * 3 + 2] = b; known[p] = 1; }
    if (!fill.length) break;
    frontier = next;
  }
}

/**
 * Coarsest-level initialisation, edge inwards ring by ring: each frontier pixel takes the
 * centre of the source patch that best matches its already-known neighbourhood (a smooth
 * membrane would pull the fill towards flat colour). Candidates: a random subset of valid
 * source centres (the coarse level is small).
 */
function ringFill(l: Level, r: number, rand: () => number) {
  const { W, H, img } = l, known = new Uint8Array(W * H); let remaining = 0;
  for (let i = 0; i < W * H; i++) if (!l.hole[i]) known[i] = 1; else remaining++;
  const cands = l.validList.length <= 3000 ? l.validList : Int32Array.from({ length: 3000 }, () => l.validList[Math.floor(rand() * l.validList.length)]);
  let guard = 0;
  while (remaining > 0 && guard++ < W + H) {
    const frontier: number[] = [];
    for (let p = 0; p < W * H; p++) { if (known[p]) continue; const x = p % W, y = (p / W) | 0; let nb = false; for (let j = -1; j <= 1 && !nb; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && known[yy * W + xx]) { nb = true; break; } } if (nb) frontier.push(p); }
    if (!frontier.length) break;
    const fill: [number, number][] = [];
    for (const p of frontier) {
      const x = p % W, y = (p / W) | 0; let best = Infinity, bs = -1;
      for (const s of cands) {
        const sx = s % W, sy = (s / W) | 0; let sum = 0, n = 0;
        for (let j = -r; j <= r && sum < best; j++) { const yy = y + j; if (yy < 0 || yy >= H) continue; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (!known[q]) continue; const a = q * 3, b = ((sy + j) * W + sx + i) * 3; const d0 = img[a] - img[b], d1 = img[a + 1] - img[b + 1], d2 = img[a + 2] - img[b + 2]; sum += d0 * d0 + d1 * d1 + d2 * d2; n++; } }
        if (n && sum / n < best) { best = sum / n; bs = s; }
      }
      if (bs >= 0) fill.push([p, bs]);
    }
    for (const [p, s] of fill) { img[p * 3] = img[s * 3]; img[p * 3 + 1] = img[s * 3 + 1]; img[p * 3 + 2] = img[s * 3 + 2]; known[p] = 1; remaining--; }
    if (!fill.length) { diffuseFill(l); break; }
  }
}

/** One full content-aware fill. `hole` > 0 marks pixels to synthesize (soft edges are blended). */
export function contentAwareFill(image: Bitmap8, hole: Mask8, o: ContentAwareOptions = {}): Bitmap8 {
  const W = image.width, H = image.height, P = o.patchSize ?? 7, r = P >> 1, rand = rng(o.seed ?? 1);
  // finest level
  const img0 = new Float32Array(W * H * 3), hole0 = new Uint8Array(W * H), allow0 = new Uint8Array(W * H);
  let hx0 = W, hy0 = H, hx1 = -1, hy1 = -1, holeCount = 0;
  for (let i = 0; i < W * H; i++) {
    img0[i * 3] = image.data[i * 4]; img0[i * 3 + 1] = image.data[i * 4 + 1]; img0[i * 3 + 2] = image.data[i * 4 + 2];
    allow0[i] = !o.sourceMask || o.sourceMask.data[i] > 127 ? 1 : 0;
  }
  // dilate the hole by 1 px so anti-aliased selection edges are re-synthesized too
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let h = 0; for (let j = -1; j <= 1 && !h; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && hole.data[yy * W + xx] > 0) { h = 1; break; } }
    if (h) { hole0[y * W + x] = 1; holeCount++; if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; if (y < hy0) hy0 = y; if (y > hy1) hy1 = y; }
  }
  if (!holeCount) return { width: W, height: H, data: new Uint8ClampedArray(image.data) };
  if (!o.sourceMask && o.window === true) {
    // Photoshop-like locality: sample from a square of side 4·√(max(w,50)·max(h,50)) centred on
    // the hole, slid inside the canvas (behaviour documented by PhotoCraft's black-box
    // measurements; reimplemented here). Keeps fills from importing unrelated distant content.
    const hw = hx1 - hx0 + 1, hh = hy1 - hy0 + 1, side = Math.round(4 * Math.sqrt(Math.max(hw, 50) * Math.max(hh, 50)));
    let wx = Math.round((hx0 + hx1) / 2 - side / 2), wy = Math.round((hy0 + hy1) / 2 - side / 2);
    wx = Math.max(0, Math.min(W - side, wx)); wy = Math.max(0, Math.min(H - side, wy));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < wx || y < wy || x >= wx + side || y >= wy + side) allow0[y * W + x] = 0;
  }
  const levels: Level[] = [buildLevel(W, H, img0, hole0, allow0, r)];
  const holeDim = Math.max(hx1 - hx0 + 1, hy1 - hy0 + 1);
  while (true) {
    const l = levels[levels.length - 1], s = 1 << levels.length;
    if (holeDim / s < P * 1.2 || Math.min(l.W, l.H) / 2 < P * 4) break;
    const d = downsample(l, r, o.coarse ?? 'majority'); if (d.validList.length < 32) break; levels.push(d);
  }
  // locality prior per level: full penalty once a source is ~4 hole-widths away, scaled to the patch-distance units
  const locality = o.locality ?? 0.04, textureMatch = o.textureMatch ?? 3;
  for (let li = 0; li < levels.length; li++) {
    const l = levels[li], holeDimL = Math.max(P, holeDim / (1 << li)), reach = 4 * holeDimL;
    l.locCap = locality * P * P * 3 * 255 * 255;
    l.locW = l.locCap / (reach * reach);
    if (textureMatch > 0) textureEnergy(l, r, textureMatch);
  }
  const adapt = o.colorAdapt !== false;
  let nnf: Int32Array | null = null, prevW = 0, prevTargets: number[] = [];
  const totalIters = levels.length;
  for (let li = levels.length - 1; li >= 0; li--) {
    const l = levels[li], { W: LW, H: LH } = l;
    if (!l.validList.length) continue;
    // targets: pixels whose patch touches the hole
    const tIndex = new Int32Array(LW * LH).fill(-1), targets: number[] = [];
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      let touch = false;
      for (let j = -r; j <= r && !touch; j++) { const yy = y + j; if (yy < 0 || yy >= LH) continue; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < LW && l.hole[yy * LW + xx]) { touch = true; break; } } }
      if (touch) { tIndex[y * LW + x] = targets.length; targets.push(y * LW + x); }
    }
    const T = targets.length, map = new Int32Array(T), dist = new Float32Array(T);
    const randomValid = () => l.validList[Math.floor(rand() * l.validList.length)];
    if (!nnf) { if (o.init === 'diffuse') diffuseFill(l); else ringFill(l, r, rand); for (let t = 0; t < T; t++) map[t] = randomValid(); }
    else {
      // upsample previous NNF: target (x,y) ← 2·src(x/2,y/2) + parity offset
      const prevLevel = levels[li + 1], prevT = new Int32Array(prevLevel.W * prevLevel.H).fill(-1);
      // rebuild previous target index lookup
      for (let t = 0; t < nnf.length; t++) prevT[prevTargets[t]] = t;
      for (let t = 0; t < T; t++) {
        const p = targets[t], x = p % LW, y = (p / LW) | 0, px = Math.min(prevLevel.W - 1, x >> 1), py = Math.min(prevLevel.H - 1, y >> 1), pt = prevT[py * prevW + px];
        let cand = -1;
        if (pt >= 0) { const s = nnf[pt], sx = (s % prevW) * 2 + (x & 1), sy = ((s / prevW) | 0) * 2 + (y & 1); if (sx < LW && sy < LH && l.valid[sy * LW + sx]) cand = sy * LW + sx; }
        map[t] = cand >= 0 ? cand : randomValid();
      }
      vote(l, targets, map, null, r, 1, adapt);
    }
    const lvlFromTop = levels.length - 1 - li;
    const em = Math.max(4, (o.iterations ?? 10) - lvlFromTop * 2);
    for (let it = 0; it < em; it++) {
      for (let t = 0; t < T; t++) dist[t] = patchDist(l, targets[t], map[t], r, Infinity);
      patchMatch(l, targets, tIndex, map, dist, r, rand, it % 2 === 1, li === 0 ? 3 : 2);
      // sharpen the vote as EM converges; the very last pass at full resolution IS winner-takes-all
      // (sharpness 0): every hole pixel comes from the single best-matching patch that covers it, so
      // texture keeps its contrast instead of averaging into haze
      const sharp = li === 0 && it === em - 1 ? 0 : it >= em / 2 ? 0.5 : 1;
      vote(l, targets, map, dist, r, sharp, adapt);
    }
    nnf = map; prevW = LW; prevTargets = targets;
    o.onProgress?.((totalIters - li) / totalIters);
  }
  const L0 = levels[0];
  if (o.seamBlend !== false && nnf && prevTargets.length) seamBlend(L0, prevTargets, nnf, r, hx0, hy0, hx1, hy1);
  // composite finest result with the (soft) hole coverage
  const out = createBitmap(W, H);
  out.data.set(image.data);
  for (let i = 0; i < W * H; i++) {
    if (!L0.hole[i]) continue;
    const c = hole.data[i] > 0 ? hole.data[i] / 255 : 0.5; // 1-px dilation ring blends 50%
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.round(image.data[i * 4 + k] * (1 - c) + L0.img[i * 3 + k] * c);
    out.data[i * 4 + 3] = Math.max(image.data[i * 4 + 3], Math.round(255 * c));
  }
  return out;
}

/**
 * Gradient-domain seam blend of the finished fill. The last NNF votes also say what the texture would be on
 * the ring just OUTSIDE the hole; the membrane h (∇²h = 0 inside, h = original − texture on that ring) is the
 * smooth correction that makes the fill meet its surround in value and gradient. Solved on the hole's bounding
 * box plus a margin, coarse-to-fine.
 */
function seamBlend(l: Level, targets: number[], map: Int32Array, r: number, hx0: number, hy0: number, hx1: number, hy1: number) {
  const { W, H, img, hole } = l, M = 4;
  const bx0 = Math.max(0, hx0 - M), by0 = Math.max(0, hy0 - M), bx1 = Math.min(W - 1, hx1 + M), by1 = Math.min(H - 1, hy1 + M);
  const BW = bx1 - bx0 + 1, BH = by1 - by0 + 1;
  // extrapolated texture on known pixels covered by target patches (uniform vote)
  const ext = new Float32Array(W * H * 3), cov = new Float32Array(W * H);
  for (let t = 0; t < targets.length; t++) {
    const p = targets[t], tx = p % W, ty = (p / W) | 0, s = map[t], sx = s % W, sy = (s / W) | 0;
    for (let j = -r; j <= r; j++) { const yy = ty + j; if (yy < 0 || yy >= H) continue; for (let i = -r; i <= r; i++) {
      const xx = tx + i; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (hole[q]) continue;
      const b = ((sy + j) * W + sx + i) * 3; ext[q * 3] += img[b]; ext[q * 3 + 1] += img[b + 1]; ext[q * 3 + 2] += img[b + 2]; cov[q] += 1;
    } }
  }
  // the ring: known pixels within 2 px of the hole that received texture votes; diff = original − texture there
  const diff = new Float32Array(BW * BH * 3), unknown = new Uint8Array(BW * BH); let ringCount = 0, unknownCount = 0;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = y * W + x, d = (y - by0) * BW + (x - bx0);
    if (hole[q]) { unknown[d] = 1; unknownCount++; continue; }
    let near = false;
    for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && hole[yy * W + xx]) { near = true; break; } }
    if (near && cov[q] > 0) {
      for (let c = 0; c < 3; c++) diff[d * 3 + c] = img[q * 3 + c] - ext[q * 3 + c] / cov[q];
      ringCount++;
    } else unknown[d] = 1; // outside the ring the correction is whatever the membrane makes of it
  }
  if (!ringCount || !unknownCount) return;
  // Where the ring crosses a strong edge (sky meeting foliage) the mismatch is large and would wash a tint over
  // the whole fill, so the boundary term is clamped, and the correction fades with distance from the boundary:
  // full at the seam, ~0 deep inside, where the texture should keep its own appearance.
  for (let i = 0; i < diff.length; i++) diff[i] = Math.max(-40, Math.min(40, diff[i]));
  solveMembrane(BW, BH, 3, diff, unknown);
  // distance (in px, 4-neighbour BFS) from each hole pixel to the nearest known pixel
  const dist = new Int32Array(BW * BH).fill(-1); let frontier: number[] = [];
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = y * W + x, d = (y - by0) * BW + (x - bx0); if (hole[q]) continue;
    let edge = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && hole[yy * W + xx]) { edge = true; break; } }
    if (edge) { dist[d] = 0; frontier.push(d); }
  }
  for (let depth = 1; frontier.length; depth++) {
    const next: number[] = [];
    for (const d of frontier) { const x = d % BW, y = (d / BW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue; const n = yy * BW + xx; if (dist[n] >= 0 || !hole[(by0 + yy) * W + bx0 + xx]) continue; dist[n] = depth; next.push(n); } }
    frontier = next;
  }
  // the correction reaches about a quarter of the hole's NARROW dimension: deep enough to carry a gradient
  // across a smooth region, shallow enough to leave the texture of a wide fill alone
  const holeMin = Math.min(hx1 - hx0, hy1 - hy0) + 1, tau = Math.max(6, holeMin * 0.25);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const q = y * W + x; if (!hole[q]) continue; const d = (y - by0) * BW + (x - bx0);
    const w = dist[d] < 0 ? 1 : Math.exp(-dist[d] / tau);
    for (let c = 0; c < 3; c++) img[q * 3 + c] = Math.max(0, Math.min(255, img[q * 3 + c] + diff[d * 3 + c] * w));
  }
}

/** SSD + Isophote Gradient Continuity between target window at t and valid source window at s, early exit at `best`. */
function patchDist(l: Level, t: number, s: number, r: number, best: number): number {
  const { W, H, img } = l, tx = t % W, ty = (t / W) | 0, sx = s % W, sy = (s / W) | 0;
  // locality prior first, so the early exit below still applies to the whole distance
  const ddx = tx - sx, ddy = ty - sy;
  let sum = Math.min(l.locCap, l.locW * (ddx * ddx + ddy * ddy));
  if (l.energy) {
    // locality matters in busy regions (fill water from the water beside it) and misleads in smooth ones (it would
    // drag a nearby cloud into clear sky), so it scales with the detail expected at the target
    const e = l.expect![t], kLoc = 0.2 + 0.8 * Math.max(0, Math.min(1, (e - 2) / 10));
    sum *= kLoc;
    const de = l.energy[s] - e; sum += l.energyW * de * de;
  }
  if (sum >= best) return sum;
  for (let j = -r; j <= r; j++) {
    const yy = ty + j; if (yy < 0 || yy >= H) continue; const srow = (sy + j) * W, trow = yy * W;
    for (let i = -r; i <= r; i++) {
      const xx = tx + i; if (xx < 0 || xx >= W) continue;
      const a = (trow + xx) * 3, b = (srow + sx + i) * 3;
      const d0 = img[a] - img[b], d1 = img[a + 1] - img[b + 1], d2 = img[a + 2] - img[b + 2];
      sum += d0 * d0 + d1 * d1 + d2 * d2;
      // Isophote structural edge continuity along horizontal & vertical neighbours inside the patch
      if (i < r && xx + 1 < W && sx + i + 1 < W) {
        const gxT = (img[a + 3] - img[a]) + (img[a + 4] - img[a + 1]);
        const gxS = (img[b + 3] - img[b]) + (img[b + 4] - img[b + 1]);
        const dgx = gxT - gxS;
        sum += 0.35 * dgx * dgx;
      }
      if (j < r && yy + 1 < H && sy + j + 1 < H) {
        const aD = a + W * 3, bD = b + W * 3;
        const gyT = (img[aD] - img[a]) + (img[aD + 1] - img[a + 1]);
        const gyS = (img[bD] - img[b]) + (img[bD + 1] - img[b + 1]);
        const dgy = gyT - gyS;
        sum += 0.35 * dgy * dgy;
      }
    }
    if (sum >= best) return sum;
  }
  return sum;
}
function patchMatch(l: Level, targets: number[], tIndex: Int32Array, map: Int32Array, dist: Float32Array, r: number, rand: () => number, reverse: boolean, passes: number) {
  const { W, H, valid } = l, T = targets.length, maxR = Math.max(W, H);
  const tryCand = (t: number, c: number) => { if (c < 0 || c >= W * H || !valid[c] || c === map[t]) return; const d = patchDist(l, targets[t], c, r, dist[t]); if (d < dist[t]) { dist[t] = d; map[t] = c; } };
  for (let pass = 0; pass < passes; pass++) {
    const rev = reverse !== (pass % 2 === 1), step = rev ? -1 : 1;
    for (let k = 0; k < T; k++) {
      const t = rev ? T - 1 - k : k, p = targets[t], x = p % W, y = (p / W) | 0;
      // propagation from the left/right and up/down neighbours (shifted)
      const nx = x - step, ny = y - step;
      if (nx >= 0 && nx < W) { const nt = tIndex[y * W + nx]; if (nt >= 0) { const s = map[nt], sx = (s % W) + step; if (sx >= 0 && sx < W) tryCand(t, s + step); } }
      if (ny >= 0 && ny < H) { const nt = tIndex[ny * W + x]; if (nt >= 0) { const s = map[nt], sy = ((s / W) | 0) + step; if (sy >= 0 && sy < H) tryCand(t, s + step * W); } }
      // random search around the current best
      const s0 = map[t], sx0 = s0 % W, sy0 = (s0 / W) | 0;
      for (let R = maxR; R >= 1; R >>= 1) {
        const cx = Math.round(sx0 + (rand() * 2 - 1) * R), cy = Math.round(sy0 + (rand() * 2 - 1) * R);
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue; tryCand(t, cy * W + cx);
      }
    }
  }
}
function vote(l: Level, targets: number[], map: Int32Array, dist: Float32Array | null, r: number, sharpness = 1, adapt = true) {
  const { W, H, img, hole } = l, acc = new Float32Array(W * H * 3), ws = new Float32Array(W * H), T = targets.length;
  const area = (2 * r + 1) ** 2, minKnown = Math.max(4, Math.round(area * 0.2));
  // Final pass (sharpness 0): winner-takes-all — the covering patch with the smallest distance supplies the pixel, so
  // texture keeps its contrast. In smooth regions WTA would expose seams between neighbouring winners, so the result
  // is mixed per pixel with a sharp weighted average, by the texture energy expected there (all-WTA where it is busy).
  const wta = sharpness === 0 && !!dist;
  const bestD = wta ? new Float32Array(W * H).fill(Infinity) : null, win = wta ? new Float32Array(W * H * 3) : null;
  let sigma2 = 1;
  if (dist) { const sorted = Float32Array.from(dist).sort(); const sh = wta ? 0.15 : sharpness; sigma2 = Math.max(1, sorted[Math.floor(sorted.length * (sh < 1 ? 0.5 : 0.75))] / area) * sh; }
  for (let t = 0; t < T; t++) {
    const p = targets[t], tx = p % W, ty = (p / W) | 0, s = map[t], sx = s % W, sy = (s / W) | 0;
    const w = dist ? Math.exp(-(dist[t] / area) / (2 * sigma2)) + 1e-6 : 1;
    // colour adaptation: the offset between the target's KNOWN pixels and the source pixels under them, carried
    // into the hole with the vote (clamped and damped so it corrects shading, never repaints)
    let b0 = 0, b1 = 0, b2 = 0;
    if (adapt) {
      let d0 = 0, d1 = 0, d2 = 0, n = 0;
      for (let j = -r; j <= r; j++) { const yy = ty + j; if (yy < 0 || yy >= H) continue; for (let i = -r; i <= r; i++) {
        const xx = tx + i; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (hole[q]) continue;
        const a = q * 3, b = ((sy + j) * W + sx + i) * 3; d0 += img[a] - img[b]; d1 += img[a + 1] - img[b + 1]; d2 += img[a + 2] - img[b + 2]; n++;
      } }
      if (n >= minKnown) { const k = 0.8 / n, c = (v: number) => Math.max(-48, Math.min(48, v)); b0 = c(d0 * k); b1 = c(d1 * k); b2 = c(d2 * k); }
    }
    for (let j = -r; j <= r; j++) { const yy = ty + j; if (yy < 0 || yy >= H) continue; for (let i = -r; i <= r; i++) {
      const xx = tx + i; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (!hole[q]) continue;
      const b = ((sy + j) * W + sx + i) * 3;
      if (wta) {
        // among the patches covering this pixel, the best match wins; ties go to the patch centred nearest it
        const d = dist![t] + (i * i + j * j) * 1e-3;
        if (d < bestD![q]) { bestD![q] = d; win![q * 3] = img[b] + b0; win![q * 3 + 1] = img[b + 1] + b1; win![q * 3 + 2] = img[b + 2] + b2; }
      }
      acc[q * 3] += (img[b] + b0) * w; acc[q * 3 + 1] += (img[b + 1] + b1) * w; acc[q * 3 + 2] += (img[b + 2] + b2) * w; ws[q] += w;
    } }
  }
  for (let q = 0; q < W * H; q++) {
    if (!hole[q] || !(ws[q] > 0)) continue;
    let r0 = acc[q * 3] / ws[q], g0 = acc[q * 3 + 1] / ws[q], b0 = acc[q * 3 + 2] / ws[q];
    if (wta && bestD![q] < Infinity) {
      // 0 in flat regions (expected gradient ≤ 4/px) → 1 in textured ones (≥ 16/px)
      const e = l.expect ? l.expect[q] : 16, k = Math.max(0, Math.min(1, (e - 4) / 12));
      r0 += (win![q * 3] - r0) * k; g0 += (win![q * 3 + 1] - g0) * k; b0 += (win![q * 3 + 2] - b0) * k;
    }
    img[q * 3] = r0; img[q * 3 + 1] = g0; img[q * 3 + 2] = b0;
  }
}
