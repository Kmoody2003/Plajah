/**
 * forgeParts.ts — the art scored part by part (forgeFidelity.ts --parts).
 *
 * The art has no part labels, so the model finds them: each part of the posed model (head, dō, kusazuri, sode, arms,
 * obi, hakama, shins, feet, sword) is rendered in the art's frame, and its own mask becomes SAM 2.1's prompt on the art:
 * points well inside it, points inside its neighbours as "not this", its box. SAM cuts the art's matching part along the
 * art's own edges. Then each pair is compared: overlap (IoU), how far apart the outlines run, and colour where they
 * agree. A part the model has drawn in the wrong place shows as a low IoU on that part alone, not as a blur in a
 * whole-figure score.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
export interface PartView { name: string; x0: number; x1: number; shift: number; r: { W: number; H: number; mask: Uint8Array; partId: Int8Array; rgb: Float32Array } }
export interface PartScore { iou: number; outlineMm: number; deltaE: number; area: number }

const COLOURS = [[255, 200, 60], [230, 60, 50], [60, 200, 90], [60, 140, 255], [200, 90, 230], [40, 220, 220], [255, 130, 40], [150, 220, 60], [240, 120, 180], [180, 180, 180]];

function chamfer(src: Uint8Array, W: number, H: number, edgeOnly: boolean) {
  const D = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const e = src[i] && (!edgeOnly || x === 0 || y === 0 || x === W - 1 || y === H - 1 || !src[i - 1] || !src[i + 1] || !src[i - W] || !src[i + W]);
    D[i] = (edgeOnly ? e : !src[i]) ? 0 : 1e9;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x) D[i] = Math.min(D[i], D[i - 1] + 1); if (y) D[i] = Math.min(D[i], D[i - W] + 1); if (x && y) D[i] = Math.min(D[i], D[i - W - 1] + 1.414); if (y && x < W - 1) D[i] = Math.min(D[i], D[i - W + 1] + 1.414); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (y < H - 1) D[i] = Math.min(D[i], D[i + W] + 1); if (x < W - 1 && y < H - 1) D[i] = Math.min(D[i], D[i + W + 1] + 1.414); if (y < H - 1 && x) D[i] = Math.min(D[i], D[i + W - 1] + 1.414); }
  return D;
}
/** Up to n points spread through the pixels (farthest-point), given as [x, y]. */
function spread(pix: number[], W: number, n: number): number[][] {
  if (!pix.length) return [];
  const pts = [pix[Math.floor(pix.length / 2)]];
  const step = Math.max(1, Math.floor(pix.length / 4000));
  while (pts.length < n) {
    let best = -1, bd = -1;
    for (let k = 0; k < pix.length; k += step) { const i = pix[k]; let d = Infinity; for (const p of pts) d = Math.min(d, (i % W - p % W) ** 2 + ((i / W | 0) - (p / W | 0)) ** 2); if (d > bd) { bd = d; best = i; } }
    if (bd < 64) break; // closer than 8 px to one already: enough
    pts.push(best);
  }
  return pts.map((i) => [i % W, (i / W) | 0]);
}
function lab(r: number, g: number, b: number) {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function scoreParts(views: PartView[], sheet: { W: number; H: number; data: Buffer; mask: Uint8Array }, parts: readonly string[], ppm: number, outDir: string) {
  const work = path.join(outDir, 'parts'); fs.mkdirSync(work, { recursive: true });
  const result: Record<string, Record<string, PartScore>> = {};
  for (const v of views) {
    const W = v.x1 - v.x0, H = v.r.H;
    // the art's view, and each model part shifted onto it
    const artPng = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * sheet.W + v.x0 + x) * 4, di = (y * W + x) * 4; artPng.data[di] = sheet.data[si]; artPng.data[di + 1] = sheet.data[si + 1]; artPng.data[di + 2] = sheet.data[si + 2]; artPng.data[di + 3] = 255; }
    const imgFile = path.join(work, `${v.name}.png`);
    fs.writeFileSync(imgFile, PNG.sync.write(artPng));
    const model = parts.map(() => new Uint8Array(W * H));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = v.r.partId[y * W + x]; const ax = x + v.shift; if (p >= 0 && ax >= 0 && ax < W) model[p][y * W + ax] = 1; }
    const inner = model.map((m) => { const d = chamfer(m, W, H, false); const out: number[] = []; for (let i = 0; i < W * H; i++) if (m[i] && d[i] > 4) out.push(i); return out; });
    const jobs: Record<string, unknown>[] = [];
    parts.forEach((name, p) => {
      if (inner[p].length < 150) return;
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let i = 0; i < W * H; i++) if (model[p][i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const pad = Math.max(6, Math.round((x1 - x0 + y1 - y0) * 0.04));
      const box = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(H - 1, y1 + pad)];
      // "not this": the other parts' insides within this part's box
      const others: number[] = [];
      parts.forEach((_, q) => { if (q !== p) for (const i of inner[q]) { const x = i % W, y = (i / W) | 0; if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) others.push(i); } });
      const guide = new PNG({ width: W, height: H });
      for (let i = 0; i < W * H; i++) { const c = model[p][i] ? 255 : 0; guide.data[i * 4] = guide.data[i * 4 + 1] = guide.data[i * 4 + 2] = c; guide.data[i * 4 + 3] = 255; }
      const gFile = path.join(work, `${v.name}_${name}_guide.png`);
      fs.writeFileSync(gFile, PNG.sync.write(guide));
      jobs.push({ name, pos: spread(inner[p], W, 6), neg: spread(others, W, 6), box, guide: gFile, out: path.join(work, `${v.name}_${name}_art.png`) });
    });
    const jobFile = path.join(work, `${v.name}_jobs.json`);
    fs.writeFileSync(jobFile, JSON.stringify({ image: imgFile, jobs }));
    execFileSync(PY, ['engines/tela-3d/sam_prompt.py', jobFile], { stdio: ['ignore', 'ignore', 'inherit'] });

    // ---- compare each pair ----------------------------------------------------------------------------------------
    result[v.name] = {};
    const overlay = PNG.sync.read(PNG.sync.write(artPng));
    parts.forEach((name, p) => {
      const f = path.join(work, `${v.name}_${name}_art.png`);
      if (!jobs.some((j) => j.name === name) || !fs.existsSync(f)) return;
      const a = PNG.sync.read(fs.readFileSync(f));
      const A = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) A[i] = a.data[i * 4] > 127 && sheet.mask[((i / W) | 0) * sheet.W + v.x0 + (i % W)] ? 1 : 0;
      const M = model[p];
      let inter = 0, uni = 0;
      for (let i = 0; i < W * H; i++) { if (A[i] && M[i]) inter++; if (A[i] || M[i]) uni++; }
      const dA = chamfer(A, W, H, true), dM = chamfer(M, W, H, true);
      let ds = 0, dn = 0;
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = (i / W) | 0, edge = (m: Uint8Array) => m[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]);
        if (edge(M)) { ds += Math.min(60, dA[i]); dn++; }
        if (edge(A)) { ds += Math.min(60, dM[i]); dn++; }
      }
      // colour: 6 px blocks inside both
      let de = 0, dc = 0; const B = 6;
      for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
        const ma = [0, 0, 0], mm = [0, 0, 0]; let n = 0;
        for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
          const i = y * W + x; if (!A[i] || !M[i]) continue;
          const mi = y * W + x - v.shift; if (mi < y * W || mi >= (y + 1) * W) continue;
          for (let k = 0; k < 3; k++) { ma[k] += artPng.data[i * 4 + k]; mm[k] += v.r.rgb[mi * 3 + k]; } n++;
        }
        if (n < B * B * 0.7) continue;
        const la = lab(ma[0] / n, ma[1] / n, ma[2] / n), lm = lab(mm[0] / n, mm[1] / n, mm[2] / n);
        de += Math.hypot(la[0] - lm[0], la[1] - lm[1], la[2] - lm[2]); dc++;
      }
      result[v.name][name] = { iou: +(uni ? inter / uni : 0).toFixed(3), outlineMm: +(dn ? ds / dn / ppm * 1000 : 0).toFixed(1), deltaE: +(dc ? de / dc : 0).toFixed(1), area: inter };
      // overlay: the art's part tinted, the model's part outlined, in the part's colour
      const c = COLOURS[p % COLOURS.length];
      for (let i = 0; i < W * H; i++) {
        if (A[i]) for (let k = 0; k < 3; k++) overlay.data[i * 4 + k] = Math.round(overlay.data[i * 4 + k] * 0.55 + c[k] * 0.45);
        if (dM[i] < 1.5) for (let k = 0; k < 3; k++) overlay.data[i * 4 + k] = c[k];
      }
    });
    fs.writeFileSync(path.join(outDir, `parts_${v.name}.png`), PNG.sync.write(overlay));
  }
  return result;
}
