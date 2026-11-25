/**
 * Plajah Academia Games — Studio Sprite Isolation & Alpha Matting Helper
 *
 * Wraps Plajah's production `services/matting/alphaMattingEngine.ts` (`refineAlphaMatteAndDecontaminate`)
 * to extract zero-halo, color-decontaminated transparent RGBA sprites from hand-painted gouache &
 * sepia-ink isolation sheets on pure white (#FFFFFF) backgrounds.
 *
 * Pipeline:
 *   1. Border-seeded BFS exterior white flood-fill (stops cleanly at sepia ink outlines so
 *      light cream fur, wool, parchment, and sails stay 100% opaque).
 *   2. Optional interior pierced-hole detection (punches true pure-neutral white cutouts such as
 *      waterwheel spoke windows, lantern twine handle loops, brass wind-bell rings, and pierced
 *      astrolabe filigree while preserving warm-tinted painted highlights).
 *   3. Plajah `refineAlphaMatteAndDecontaminate` (Meijster EDT + Structure Tensor fringe +
 *      3x3 RGB Covariance Guided Filter + Foreground Color Decontamination de-spill).
 *   4. Tight bounding-box crop (or axle-centered square crop for rotating disks like the waterwheel
 *      and astrolabe dial so 360-degree rotation has zero wobble).
 */

import { refineAlphaMatteAndDecontaminate } from '../matting/alphaMattingEngine';

export interface SpriteIsolationOptions {
  /** Punch enclosed pure-white interior holes (waterwheel spokes, filigree, handle loops). */
  punchInteriorWhiteHoles?: boolean;
  /** Minimum pixel area for an enclosed pure-white island to be treated as a hole. Default: 28. */
  minHoleArea?: number;
  /** Keep output centered in a square canvas (essential for wobble-free 360-degree wheel/dial rotation). */
  squareCenter?: boolean;
  /** Transparent padding around trimmed sprite bounds in pixels. Default: 6. */
  paddingPx?: number;
  /** Exterior white threshold (0..255). Default: 236. */
  exteriorWhiteMin?: number;
  /** Maximum RGB channel spread (max-min) for exterior white flood-fill. Default: 20. */
  exteriorChromaMax?: number;
}

export interface IsolatedSpriteResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  metrics: {
    opaquePixels: number;
    transparentPixels: number;
    interiorHolesPunched: number;
    decontaminatedEdgePixels: number;
    processingTimeMs: number;
  };
}

/**
 * Builds a clean binary coarse mask (255 = foreground, 0 = background) from a sprite painted
 * on a uniform pure white (#FFFFFF) backdrop, optionally punching enclosed neutral-white holes.
 */
export function buildWhiteBackdropCoarseMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: SpriteIsolationOptions = {},
): { coarseMask: Uint8Array; interiorHolesPunched: number } {
  const n = width * height;
  const extMin = opts.exteriorWhiteMin ?? 236;
  const extChroma = opts.exteriorChromaMax ?? 20;

  // 0 = unvisited / foreground, 1 = definite exterior white background
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const isExteriorWhite = (idx: number): boolean => {
    const p = idx * 4;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
    return minC >= extMin && (maxC - minC) <= extChroma;
  };

  // Seed BFS along all 4 image edges
  for (let x = 0; x < width; x++) {
    const top = x;
    const bot = (height - 1) * width + x;
    if (isExteriorWhite(top) && !bg[top]) {
      bg[top] = 1;
      queue[tail++] = top;
    }
    if (isExteriorWhite(bot) && !bg[bot]) {
      bg[bot] = 1;
      queue[tail++] = bot;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    const left = y * width;
    const right = y * width + (width - 1);
    if (isExteriorWhite(left) && !bg[left]) {
      bg[left] = 1;
      queue[tail++] = left;
    }
    if (isExteriorWhite(right) && !bg[right]) {
      bg[right] = 1;
      queue[tail++] = right;
    }
  }

  // 4-connected BFS flood fill through exterior white pixels
  while (head < tail) {
    const cur = queue[head++];
    const x = cur % width;
    const y = (cur - x) / width;

    if (x > 0) {
      const nb = cur - 1;
      if (!bg[nb] && isExteriorWhite(nb)) {
        bg[nb] = 1;
        queue[tail++] = nb;
      }
    }
    if (x + 1 < width) {
      const nb = cur + 1;
      if (!bg[nb] && isExteriorWhite(nb)) {
        bg[nb] = 1;
        queue[tail++] = nb;
      }
    }
    if (y > 0) {
      const nb = cur - width;
      if (!bg[nb] && isExteriorWhite(nb)) {
        bg[nb] = 1;
        queue[tail++] = nb;
      }
    }
    if (y + 1 < height) {
      const nb = cur + width;
      if (!bg[nb] && isExteriorWhite(nb)) {
        bg[nb] = 1;
        queue[tail++] = nb;
      }
    }
  }

  let interiorHolesPunched = 0;

  // Optional enclosed neutral-white hole punching (waterwheel spokes, filigree, handle loops)
  if (opts.punchInteriorWhiteHoles) {
    const minHoleArea = opts.minHoleArea ?? 28;
    const visited = new Uint8Array(n);
    const compQueue = new Int32Array(n);

    const isPureHoleWhite = (idx: number): boolean => {
      const p = idx * 4;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
      return minC >= 242 && (maxC - minC) <= 12;
    };

    for (let i = 0; i < n; i++) {
      if (bg[i] || visited[i] || !isPureHoleWhite(i)) continue;
      let cHead = 0;
      let cTail = 0;
      visited[i] = 1;
      compQueue[cTail++] = i;
      let sumLum = 0;
      let sumChroma = 0;

      while (cHead < cTail) {
        const cur = compQueue[cHead++];
        const p = cur * 4;
        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
        const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
        sumLum += (r + g + b) / 3;
        sumChroma += maxC - minC;

        const x = cur % width;
        const y = (cur - x) / width;
        if (x > 0) {
          const nb = cur - 1;
          if (!bg[nb] && !visited[nb] && isPureHoleWhite(nb)) {
            visited[nb] = 1;
            compQueue[cTail++] = nb;
          }
        }
        if (x + 1 < width) {
          const nb = cur + 1;
          if (!bg[nb] && !visited[nb] && isPureHoleWhite(nb)) {
            visited[nb] = 1;
            compQueue[cTail++] = nb;
          }
        }
        if (y > 0) {
          const nb = cur - width;
          if (!bg[nb] && !visited[nb] && isPureHoleWhite(nb)) {
            visited[nb] = 1;
            compQueue[cTail++] = nb;
          }
        }
        if (y + 1 < height) {
          const nb = cur + width;
          if (!bg[nb] && !visited[nb] && isPureHoleWhite(nb)) {
            visited[nb] = 1;
            compQueue[cTail++] = nb;
          }
        }
      }

      const area = cTail;
      const avgLum = sumLum / Math.max(1, area);
      const avgChroma = sumChroma / Math.max(1, area);
      if (area >= minHoleArea && avgLum >= 249 && avgChroma <= 6) {
        for (let k = 0; k < area; k++) {
          bg[compQueue[k]] = 1;
        }
        interiorHolesPunched++;
      }
    }
  }

  const coarseMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    coarseMask[i] = bg[i] ? 0 : 255;
  }

  return { coarseMask, interiorHolesPunched };
}

/**
 * Full studio sprite isolation using Plajah's `refineAlphaMatteAndDecontaminate` + tight trim.
 */
export function isolateSpriteOnWhite(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: SpriteIsolationOptions = {},
): IsolatedSpriteResult {
  const { coarseMask, interiorHolesPunched } = buildWhiteBackdropCoarseMask(rgba, width, height, opts);

  // Run Plajah's native alpha matting & foreground color decontamination (de-spill)
  const matted = refineAlphaMatteAndDecontaminate(rgba, coarseMask, width, height, {
    baseEdgeRadius: 2,
    hairFringeRadius: 6,
    passThroughDepth: 12,
    passThroughSensitivity: 0.04, // Keep warm cream fur/wool/sail 100% solid; pierced holes already handled cleanly
    decontaminateColors: 0.94,
    guidedFilterEps: 1e-4,
  });

  const outRgba = matted.decontaminatedRgba;

  // Clean subtle residual near-zero alpha noise outside edges so sprites never cast faint boxes
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let opaquePixels = 0;
  let transparentPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p4 = idx * 4;
      let a = outRgba[p4 + 3];
      if (a < 10) {
        a = 0;
        outRgba[p4 + 3] = 0;
        transparentPixels++;
      } else {
        if (a > 246) {
          a = 255;
          outRgba[p4 + 3] = 255;
        }
        opaquePixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if image was completely empty
  if (maxX < minX || maxY < minY) {
    return {
      rgba: outRgba,
      width,
      height,
      metrics: {
        opaquePixels,
        transparentPixels,
        interiorHolesPunched,
        decontaminatedEdgePixels: matted.metrics.decontaminatedEdgePixels,
        processingTimeMs: matted.metrics.processingTimeMs,
      },
    };
  }

  const pad = opts.paddingPx ?? 6;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  const outW = opts.squareCenter ? Math.max(bw, bh) + pad * 2 : bw + pad * 2;
  const outH = opts.squareCenter ? Math.max(bw, bh) + pad * 2 : bh + pad * 2;
  const offsetX = Math.floor((outW - bw) / 2);
  const offsetY = Math.floor((outH - bh) / 2);

  const cropped = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < bh; y++) {
    const srcRow = ((minY + y) * width + minX) * 4;
    const dstRow = ((offsetY + y) * outW + offsetX) * 4;
    cropped.set(outRgba.subarray(srcRow, srcRow + bw * 4), dstRow);
  }

  return {
    rgba: cropped,
    width: outW,
    height: outH,
    metrics: {
      opaquePixels,
      transparentPixels,
      interiorHolesPunched,
      decontaminatedEdgePixels: matted.metrics.decontaminatedEdgePixels,
      processingTimeMs: matted.metrics.processingTimeMs,
    },
  };
}
