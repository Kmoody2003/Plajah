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
//   5. Feathered composite by the hole coverage.
// Pure typed arrays: runs in node, a worker (rasterWorker.ts) or the main thread.

import { createBitmap, rng, type Bitmap8, type Mask8 } from './buffer';

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
}

interface Level { W: number; H: number; img: Float32Array; hole: Uint8Array; allowed: Uint8Array; valid: Uint8Array; validList: Int32Array }

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
  return { W, H, img, hole, allowed, valid, validList: Int32Array.from(list) };
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
      vote(l, targets, map, null, r);
    }
    const lvlFromTop = levels.length - 1 - li;
    const em = Math.max(4, (o.iterations ?? 10) - lvlFromTop * 2);
    for (let it = 0; it < em; it++) {
      for (let t = 0; t < T; t++) dist[t] = patchDist(l, targets[t], map[t], r, Infinity);
      patchMatch(l, targets, tIndex, map, dist, r, rand, it % 2 === 1, li === 0 ? 3 : 2);
      // sharpen the vote as EM converges; the very last pass at full resolution is near
      // winner-takes-all so texture stays crisp instead of averaging into haze
      const sharp = li === 0 && it === em - 1 ? 0.15 : it >= em / 2 ? 0.5 : 1;
      vote(l, targets, map, dist, r, sharp);
    }
    nnf = map; prevW = LW; prevTargets = targets;
    o.onProgress?.((totalIters - li) / totalIters);
  }
  // composite finest result with the (soft) hole coverage
  const L0 = levels[0], out = createBitmap(W, H);
  out.data.set(image.data);
  for (let i = 0; i < W * H; i++) {
    if (!L0.hole[i]) continue;
    const c = hole.data[i] > 0 ? hole.data[i] / 255 : 0.5; // 1-px dilation ring blends 50%
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.round(image.data[i * 4 + k] * (1 - c) + L0.img[i * 3 + k] * c);
    out.data[i * 4 + 3] = Math.max(image.data[i * 4 + 3], Math.round(255 * c));
  }
  return out;
}

/** SSD between the target window at t and the (fully valid) source window at s, early exit at `best`. */
function patchDist(l: Level, t: number, s: number, r: number, best: number): number {
  const { W, H, img } = l, tx = t % W, ty = (t / W) | 0, sx = s % W, sy = (s / W) | 0; let sum = 0;
  for (let j = -r; j <= r; j++) {
    const yy = ty + j; if (yy < 0 || yy >= H) continue; const srow = (sy + j) * W, trow = yy * W;
    for (let i = -r; i <= r; i++) {
      const xx = tx + i; if (xx < 0 || xx >= W) continue;
      const a = (trow + xx) * 3, b = (srow + sx + i) * 3;
      const d0 = img[a] - img[b], d1 = img[a + 1] - img[b + 1], d2 = img[a + 2] - img[b + 2];
      sum += d0 * d0 + d1 * d1 + d2 * d2;
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
function vote(l: Level, targets: number[], map: Int32Array, dist: Float32Array | null, r: number, sharpness = 1) {
  const { W, H, img, hole } = l, acc = new Float32Array(W * H * 3), ws = new Float32Array(W * H), T = targets.length;
  let sigma2 = 1;
  if (dist) { const sorted = Float32Array.from(dist).sort(); sigma2 = Math.max(1, sorted[Math.floor(sorted.length * (sharpness < 1 ? 0.5 : 0.75))] / ((2 * r + 1) ** 2)) * sharpness; }
  for (let t = 0; t < T; t++) {
    const p = targets[t], tx = p % W, ty = (p / W) | 0, s = map[t], sx = s % W, sy = (s / W) | 0;
    const w = dist ? Math.exp(-(dist[t] / ((2 * r + 1) ** 2)) / (2 * sigma2)) + 1e-6 : 1;
    for (let j = -r; j <= r; j++) { const yy = ty + j; if (yy < 0 || yy >= H) continue; for (let i = -r; i <= r; i++) {
      const xx = tx + i; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (!hole[q]) continue;
      const b = ((sy + j) * W + sx + i) * 3; acc[q * 3] += img[b] * w; acc[q * 3 + 1] += img[b + 1] * w; acc[q * 3 + 2] += img[b + 2] * w; ws[q] += w;
    } }
  }
  for (let q = 0; q < W * H; q++) if (hole[q] && ws[q] > 0) { img[q * 3] = acc[q * 3] / ws[q]; img[q * 3 + 1] = acc[q * 3 + 1] / ws[q]; img[q * 3 + 2] = acc[q * 3 + 2] / ws[q]; }
}
