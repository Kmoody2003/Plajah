// raster/membrane — the Laplace ("membrane") solver shared by healing (retouch.ts) and content-aware fill
// (patchmatch.ts): fill the unknown pixels with the harmonic interpolant of the known ones, coarse-to-fine SOR.
// Lives in its own module so patchmatch.ts can use it without importing the brush engine.

/**
 * Fill `values` (C channels) where `unknown[i]` = 1 with the harmonic interpolant of the
 * known pixels (4-neighbour Laplacian, Neumann at the image border). In place.
 */
export function solveMembrane(W: number, H: number, C: number, values: Float32Array, unknown: Uint8Array, opts: { iterations?: number } = {}): void {
  let count = 0; for (let i = 0; i < W * H; i++) count += unknown[i]; if (!count) return;
  if (W > 8 && H > 8 && count > 64) {
    // coarse level: known if all children known
    const cw = Math.ceil(W / 2), chh = Math.ceil(H / 2), cv = new Float32Array(cw * chh * C), cu = new Uint8Array(cw * chh);
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      let n = 0, unk = 0; const acc = new Array(C).fill(0);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const sx = 2 * x + i, sy = 2 * y + j; if (sx >= W || sy >= H) continue; const s = sy * W + sx; if (unknown[s]) { unk = 1; continue; } for (let c = 0; c < C; c++) acc[c] += values[s * C + c]; n++; }
      const d = y * cw + x; cu[d] = unk || !n ? 1 : 0; if (n) for (let c = 0; c < C; c++) cv[d * C + c] = acc[c] / n;
    }
    solveMembrane(cw, chh, C, cv, cu, opts);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!unknown[i]) continue;
      const fx = Math.min(cw - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(chh - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cw - 1, x0 + 1), y1 = Math.min(chh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let c = 0; c < C; c++) values[i * C + c] = (cv[(y0 * cw + x0) * C + c] * (1 - tx) + cv[(y0 * cw + x1) * C + c] * tx) * (1 - ty) + (cv[(y1 * cw + x0) * C + c] * (1 - tx) + cv[(y1 * cw + x1) * C + c] * tx) * ty;
    }
  }
  // SOR relaxation on unknown pixels only
  const list: number[] = []; for (let i = 0; i < W * H; i++) if (unknown[i]) list.push(i);
  const iters = opts.iterations ?? Math.min(400, 40 + Math.ceil(Math.sqrt(count)) * 4), w = 1.85;
  for (let it = 0; it < iters; it++) {
    let maxDelta = 0;
    for (const i of list) {
      const x = i % W, y = (i / W) | 0;
      for (let c = 0; c < C; c++) {
        let s = 0, n = 0;
        if (x > 0) { s += values[(i - 1) * C + c]; n++; } if (x < W - 1) { s += values[(i + 1) * C + c]; n++; }
        if (y > 0) { s += values[(i - W) * C + c]; n++; } if (y < H - 1) { s += values[(i + W) * C + c]; n++; }
        const old = values[i * C + c], nv = old + w * (s / n - old); values[i * C + c] = nv;
        const dd = Math.abs(nv - old); if (dd > maxDelta) maxDelta = dd;
      }
    }
    if (maxDelta < 0.01) break;
  }
}
