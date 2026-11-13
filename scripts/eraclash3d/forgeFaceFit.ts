/**
 * forgeFaceFit.ts — the face's shape from the character's own art, not the average MediaPipe face.
 *
 * - Front: the 468 landmarks MediaPipe finds on Muse's front portrait (engines/tela-3d/face_landmarks.py), rolled level,
 *   centred on the face's midline and scaled to the face length the turnaround sheet gives the figure.
 * - Depth: MediaPipe's own z, then the midline pulled onto the sheet's side-view profile (forehead, brow, nose, lips,
 *   chin), fading out toward the cheeks. Its mean offset also says how far forward of the body the face sits.
 *
 * The sheet and the model share one frame: sole on the ground, chin at the model's chin height, the side view's figure
 * centred on the median column of its body (forgeSilhouette.ts draws the same frame).
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import type { Vec3 } from '../../services/argilla/engine';
import { sheetIntake, dataFile } from './forgeSpec';

/** Haru's turnaround (Muse): each view's columns, the soles' row, and the chin's row (MediaPipe on the front view's face). */
/** The character's turnaround as forge intake measured it (forgeSpec.ts). */
export const HARU_SHEET = sheetIntake();

export interface FaceFitReport { length: number; offsetZ: number; profileRms: number; rows: number }

export async function sheetMask(sheetPath = HARU_SHEET.path) {
  const img = await sharp(sheetPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const W = img.info.width, H = img.info.height, S = img.data;
  const bg = [S[(5 * W + 5) * 4], S[(5 * W + 5) * 4 + 1], S[(5 * W + 5) * 4 + 2]];
  const art = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) art[i] = Math.abs(S[i * 4] - bg[0]) + Math.abs(S[i * 4 + 1] - bg[1]) + Math.abs(S[i * 4 + 2] - bg[2]) > 40 ? 1 : 0;
  /** The figure's middle column in a view: the median x of its pixels through the body. */
  const centre = (x0: number, x1: number) => {
    const xs: number[] = [];
    for (let y = 400; y < 1250; y += 4) for (let x = x0; x < x1; x++) if (art[y * W + x]) xs.push(x);
    xs.sort((a, b) => a - b); return xs[xs.length >> 1];
  };
  return { W, H, data: S, art, centre };
}

const MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152];

export async function fitFaceToArt(opts: { landmarks: string; chinY: number; sheet?: typeof HARU_SHEET }): Promise<{ points: Vec3[]; report: FaceFitReport }> {
  const sh = opts.sheet ?? HARU_SHEET;
  const ppm = (sh.sole - sh.chin) / opts.chinY;
  const length = sh.faceLength / ppm;
  const L = (JSON.parse(fs.readFileSync(opts.landmarks, 'utf8')).points as number[][]).slice(0, 468);
  // level the eyes, then metres: x to the subject's left, y up from the chin, z out of the face
  const ang = Math.atan2(L[263][1] - L[33][1], L[263][0] - L[33][0]);
  const c = Math.cos(-ang), sn = Math.sin(-ang);
  const R = L.map(([x, y, z]) => [x * c - y * sn, x * sn + y * c, z]);
  const s = length / Math.hypot(R[152][0] - R[10][0], R[152][1] - R[10][1]);
  const mx = MIDLINE.reduce((a, i) => a + R[i][0], 0) / MIDLINE.length;
  const P: Vec3[] = R.map(([x, y, z]) => [(x - mx) * s, opts.chinY + (R[152][1] - y) * s, -z * s]);
  // the midline as a profile curve z(y)
  const mid = MIDLINE.map((i) => P[i]).sort((a, b) => a[1] - b[1]);
  const midZ = (y: number) => {
    for (let k = 0; k < mid.length - 1; k++) if (y >= mid[k][1] && y <= mid[k + 1][1]) { const t = (y - mid[k][1]) / (mid[k + 1][1] - mid[k][1] || 1); return mid[k][2] + t * (mid[k + 1][2] - mid[k][2]); }
    return NaN;
  };
  // the sheet's side view: the first art pixel from the front (it faces left) on each row of the face
  const m = await sheetMask(sh.path);
  const cx = m.centre(sh.side.x0, sh.side.x1);
  const rows: { y: number; d: number }[] = [];
  for (let row = Math.round(sh.chin - sh.faceLength) + 3; row <= sh.chin - 2; row++) {
    let x = sh.side.x0; while (x < sh.side.x1 && !m.art[row * m.W + x]) x++;
    const y = (sh.sole - row) / ppm, zm = midZ(y);
    if (!Number.isNaN(zm)) rows.push({ y, d: (cx - x) / ppm - zm });
  }
  const offsetZ = rows.reduce((a, r) => a + r.d, 0) / rows.length;
  // what is left after the offset: the art's own profile, smoothed over ~1 cm, at most 1.5 cm either way
  const resid = rows.map((r) => ({ y: r.y, d: r.d - offsetZ }));
  const smooth = resid.map((r) => {
    let a = 0, n = 0; for (const o of resid) if (Math.abs(o.y - r.y) < 0.005) { a += o.d; n++; }
    return { y: r.y, d: Math.max(-0.015, Math.min(0.015, a / n)) };
  });
  const yLo = smooth[smooth.length - 1].y, yHi = smooth[0].y; // rows run top to bottom
  const corr = (y: number) => {
    if (y <= yLo) return smooth[smooth.length - 1].d * Math.max(0, 1 - (yLo - y) / 0.01);
    if (y >= yHi) return smooth[0].d * Math.max(0, 1 - (y - yHi) / 0.015);
    let best = smooth[0]; for (const r of smooth) if (Math.abs(r.y - y) < Math.abs(best.y - y)) best = r;
    return best.d;
  };
  let err = 0; for (const r of resid) err += r.d * r.d;
  const points = P.map(([x, y, z]) => [x, y, z + offsetZ + corr(y) * Math.exp(-((x / 0.03) ** 2))] as Vec3);
  return { points, report: { length: +length.toFixed(4), offsetZ: +offsetZ.toFixed(4), profileRms: +(Math.sqrt(err / resid.length) * 1000).toFixed(1), rows: rows.length } };
}

/**
 * The sides and back of the head from the sheet's side and back views, painted into the face atlas wherever the head
 * turns away from the front portrait: each texel's surface point (rasterized from the head's own UVs) is projected
 * straight into the view it faces, the views blended by the surface normal, and the sheet's tone matched to the
 * portrait's skin so the two arts meet without a seam. The front portrait keeps everything facing the camera.
 */
export async function paintHeadFromSheet(
  atlasPng: Uint8Array, head: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array },
  opts: { chinY: number; frontSkin: number[]; front: number; sheet?: typeof HARU_SHEET; /** The portrait alone in front of this depth (the face's features: a profile's brow or nostril must not land on them). */ faceZ: number; browY: number; /** Where the head mesh meets the body (it fades to the body's skin, `frontSkin`, there). */ seamY?: number },
): Promise<Uint8Array> {
  const sh = opts.sheet ?? HARU_SHEET;
  const ppm = (sh.sole - sh.chin) / opts.chinY;
  const m = await sheetMask(sh.path);
  const cxSide = m.centre(sh.side.x0, sh.side.x1), cxBack = m.centre(sh.back.x0, sh.back.x1);
  const atlas = PNG.sync.read(Buffer.from(atlasPng));
  const N = atlas.width;
  const sampleSheet = (x: number, y: number): number[] | null => {
    if (x < 0 || y < 0 || x >= m.W - 1 || y >= m.H - 1) return null;
    const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, c = [0, 0, 0];
    for (const [ox, oy, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const i = ((iy + oy) * m.W + ix + ox) * 4;
      for (let k = 0; k < 3; k++) c[k] += m.data[i + k] * w;
    }
    return c;
  };
  // the sheet's skin tone on the side view's cheek (warm, light pixels between the eye and the ear)
  const acc = [0, 0, 0]; let n = 0;
  for (let row = Math.round(sh.chin - 60); row < sh.chin - 10; row++) for (let x = cxSide - 120; x < cxSide; x++) {
    const c = sampleSheet(x, row); if (c && c[0] > c[2] + 25 && c[0] > 110) { for (let k = 0; k < 3; k++) acc[k] += c[k]; n++; }
  }
  const tone = acc.map((v, k) => opts.frontSkin[k] / Math.max(1, v / Math.max(1, n)));
  /** Skin (warm) or hair (near black, not the navy of the collar): the background and the armour stay out of the head. */
  const headPixel = (c: number[]) => {
    const [r, g, b] = c, mx = Math.max(r, g, b);
    if (r > b + 18 && r > 90 && r < 250 && g > 0.45 * r) return true;  // skin, not lacquer red
    return mx < 70 && b < r + 14;                                        // hair
  };
  // the art's own ear (the model has its own, a little elsewhere) and the collar below the jaw stay out
  const earZ = (cxSide - 1021.7) / ppm, earY = (sh.sole - 180) / ppm;
  const viewColour = (p: number[], nr: number[]): { c: number[]; w: number } | null => {
    // below the jaw line (chin to the angle under the ear) the art's beard shadow would land on the neck: skin there
    // (faded over 2.5 cm, not cut: a hard stop drew a line round the jaw and the nape)
    const jawLine = opts.chinY - 0.005 + 0.06 * Math.max(0, Math.min(1, (0.12 - p[2]) / 0.07));
    const above = Math.max(0, Math.min(1, (p[1] - jawLine) / 0.025));
    if (above <= 0) return p[1] > opts.chinY - 0.06 ? { c: opts.frontSkin, w: 1 } : null;
    if (((p[2] - earZ) / 0.03) ** 2 + ((p[1] - earY) / 0.045) ** 2 < 1 && Math.abs(nr[0]) > 0.3) return { c: opts.frontSkin, w: 1 };
    // side view for either side (the head is near enough symmetric), the back view behind
    // (only surfaces that really face a view: a forehead sloping away is hidden behind the side hair in a profile)
    const wSide = Math.max(0, Math.abs(nr[0]) - 0.45), wBack = Math.max(0, -nr[2] - 0.25);
    const out = [0, 0, 0]; let wt = 0;
    const side = sampleSheet(cxSide - p[2] * ppm, sh.sole - p[1] * ppm);
    const back = sampleSheet(cxBack - p[0] * ppm, sh.sole - p[1] * ppm);
    if (side && wSide > 0 && headPixel(side)) { for (let k = 0; k < 3; k++) out[k] += side[k] * wSide; wt += wSide; }
    if (back && wBack > 0 && headPixel(back)) { for (let k = 0; k < 3; k++) out[k] += back[k] * wBack; wt += wBack; }
    if (!wt) return above < 1 ? { c: opts.frontSkin, w: 1 } : null;
    let c = out.map((v, k) => Math.min(255, (v / wt) * tone[k]) * above + opts.frontSkin[k] * (1 - above));
    // the painting's own highlights (a sheen on the cheekbone) come off: the game lights the head itself, and a painted
    // highlight lit again reads as a pale stripe
    const lum = (q: number[]) => 0.3 * q[0] + 0.59 * q[1] + 0.11 * q[2];
    const cap = lum(opts.frontSkin) * 1.04, l = lum(c);
    if (l > cap) c = c.map((q) => q * (cap / l));
    return { c, w: wt };
  };
  const done = new Uint8Array(N * N);
  const { positions: P, normals: Nn, uvs: U, indices: I } = head;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    const a = v.map((i) => [U[i * 2] * N, U[i * 2 + 1] * N]);
    const det = (a[1][1] - a[2][1]) * (a[0][0] - a[2][0]) + (a[2][0] - a[1][0]) * (a[0][1] - a[2][1]);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0][0], a[1][0], a[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(a[0][0], a[1][0], a[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[0][1], a[1][1], a[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(a[0][1], a[1][1], a[2][1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l0 = ((a[1][1] - a[2][1]) * (px - a[2][0]) + (a[2][0] - a[1][0]) * (py - a[2][1])) / det;
      const l1 = ((a[2][1] - a[0][1]) * (px - a[2][0]) + (a[0][0] - a[2][0]) * (py - a[2][1])) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
      const i = y * N + x;
      if (done[i]) continue;
      done[i] = 1;
      const pt = [0, 1, 2].map((k) => l0 * P[v[0] * 3 + k] + l1 * P[v[1] * 3 + k] + l2 * P[v[2] * 3 + k]);
      const nr = [0, 1, 2].map((k) => l0 * Nn[v[0] * 3 + k] + l1 * Nn[v[1] * 3 + k] + l2 * Nn[v[2] * 3 + k]);
      const l = Math.hypot(nr[0], nr[1], nr[2]) || 1; nr[0] /= l; nr[1] /= l; nr[2] /= l;
      // the front portrait seen at a glancing angle (the cheek turning toward the ear, under the jaw) is a smear of
      // stretched pixels: there it fades to the art's skin tone, and the profile (when it sees the spot) paints over
      if (y < opts.front * N && pt[1] < opts.browY + 0.02) {
        const g = Math.max(0, Math.min(1, (Math.max(Math.abs(nr[0]), -nr[1] * 0.8) - 0.5) / 0.3));
        const e = g * g * (3 - 2 * g);
        if (e > 0) for (let c = 0; c < 3; c++) atlas.data[i * 4 + c] = Math.round(atlas.data[i * 4 + c] * (1 - e) + opts.frontSkin[c] * 0.94 * e);
      }
      paint: {
        let sv = viewColour(pt, nr);
        // on the strip, a side of the head below the brows that the sheet has nothing for (beard shadow, the ear, the
        // collar) is skin, not the procedural hair
        if (!sv && y >= opts.front * N && pt[1] < opts.browY && pt[1] > opts.chinY - 0.06 && Math.abs(nr[0]) > -nr[2]) sv = { c: opts.frontSkin, w: 1 };
        if (!sv) break paint;
        // in the front region the portrait holds while the surface faces the camera, handing over as it turns away
        const inFront = y < opts.front * N;
        if (inFront && pt[2] > opts.faceZ) break paint;
        const k = inFront ? Math.max(0, Math.min(1, (0.45 - nr[2]) / 0.35)) * Math.min(1, sv.w / 0.25) : 1;
        if (k <= 0) break paint;
        for (let c = 0; c < 3; c++) atlas.data[i * 4 + c] = Math.round(atlas.data[i * 4 + c] * (1 - k) + sv.c[c] * k);
      }
      // the last few centimetres above the cut to the body fade to the body's own skin colour, so the seam never shows
      const ws = opts.seamY === undefined ? 0 : Math.max(0, Math.min(1, 1 - (pt[1] - opts.seamY) / 0.045));
      if (ws > 0) { const e = ws * ws * (3 - 2 * ws); for (let c = 0; c < 3; c++) atlas.data[i * 4 + c] = Math.round(atlas.data[i * 4 + c] * (1 - e) + opts.frontSkin[c] * e); }
    }
  }
  // grow the painting a few texels past its triangles, so filtering never pulls the procedural hair (or, at the neck,
  // an unfaded colour) in at an edge
  const y0 = 0;
  for (let pass = 0; pass < 6; pass++) {
    const add: [number, number[]][] = [];
    for (let y = y0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (done[i]) continue;
      const c = [0, 0, 0]; let n = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || xx >= N || yy < y0 || yy >= N || !done[yy * N + xx]) continue;
        for (let k = 0; k < 3; k++) c[k] += atlas.data[(yy * N + xx) * 4 + k]; n++;
      }
      if (n) add.push([i, c.map((v) => v / n)]);
    }
    for (const [i, c] of add) { for (let k = 0; k < 3; k++) atlas.data[i * 4 + k] = Math.round(c[k]); done[i] = 1; }
  }
  return new Uint8Array(PNG.sync.write(atlas));
}

// ---- The head warp: measured corrections from the fidelity loop ------------------------------------------------------

/**
 * Row-by-row corrections to the head and neck, measured against the art by forgeFidelity.ts (--update-warp) and
 * accumulated over passes: how far the front (face, throat) and the back (skull, hair) of each row must move forward,
 * how much wider each row must be, and how much higher the crown. The build bends its distance field by them, so the
 * mesh, the wardrobe's fit and the hair all follow.
 */
export interface HeadWarp { step: number; rows: { y: number; front: number; back: number; half: number }[]; top: number; passes: number }
/** Kept in the repo: the build reproduces the fitted head anywhere (the loop rewrites it). */
export const HEAD_WARP_FILE = dataFile('head_warp.json');
const WARP_LO = 1.4, WARP_HI = 1.9;
/** Front and back blend over this band round the head's middle (z, metres). */
const MID_Z = 0.03, MID_BAND = 0.07;

export function loadHeadWarp(file = HEAD_WARP_FILE): HeadWarp | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as HeadWarp; } catch { return null; }
}
export function headWarpMap(w0: HeadWarp, browY: number, crownY: number) {
  // smoothed over about ±2.5 cm: a row corrected hard beside one left alone is a crease in the skull
  const sig = 0.025 / w0.step;
  const w: HeadWarp = { ...w0, rows: w0.rows.map((r, i) => {
    const acc = { front: 0, back: 0, half: 0 }; let ws = 0;
    w0.rows.forEach((q, j) => { const g = Math.exp(-(((i - j) / sig) ** 2) / 2); acc.front += q.front * g; acc.back += q.back * g; acc.half += q.half * g; ws += g; });
    return { y: r.y, front: acc.front / ws, back: acc.back / ws, half: acc.half / ws };
  }) };
  const at = (y: number, k: 'front' | 'back' | 'half') => {
    if (y <= WARP_LO || y >= WARP_HI) return 0;
    const f = (y - w.rows[0].y) / w.step, i = Math.max(0, Math.min(w.rows.length - 2, Math.floor(f))), t = Math.max(0, Math.min(1, f - i));
    const v = w.rows[i][k] * (1 - t) + w.rows[i + 1][k] * t;
    return v * Math.min(1, (y - WARP_LO) / 0.04); // fades in above the collar
  };
  const sm = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
  const lift = (y: number) => w.top * sm((y - browY) / Math.max(0.02, crownY - browY));
  const dz = (y: number, z: number) => { const s = sm((z - (MID_Z - MID_BAND)) / (2 * MID_BAND)); return at(y, 'back') * (1 - s) + at(y, 'front') * s; };
  const dx = (y: number, x: number) => Math.sign(x) * at(y, 'half') * Math.min(1, Math.abs(x) / 0.05);
  const forward = (p: [number, number, number]): [number, number, number] => [p[0] + dx(p[1], p[0]), p[1] + lift(p[1]), p[2] + dz(p[1], p[2])];
  const inverse = (p: [number, number, number]): [number, number, number] => {
    let y = p[1]; for (let k = 0; k < 4; k++) y = p[1] - lift(y);
    let z = p[2]; for (let k = 0; k < 4; k++) z = p[2] - dz(y, z);
    let x = p[0]; for (let k = 0; k < 4; k++) x = p[0] - dx(y, x);
    return [x, y, z];
  };
  return { forward, inverse };
}
/** A distance field bent by the warp (distances stay close: the corrections are a few centimetres over a head). */
export function warpField<F extends { d: (x: number, y: number, z: number) => number; grad: (x: number, y: number, z: number) => [number, number, number] | number[] }>(field: F, inverse: (p: [number, number, number]) => [number, number, number]): F {
  const d = (x: number, y: number, z: number) => { if (y < WARP_LO - 0.01) return field.d(x, y, z); const q = inverse([x, y, z]); return field.d(q[0], q[1], q[2]); };
  const grad = (x: number, y: number, z: number): [number, number, number] => {
    if (y < WARP_LO - 0.01) return field.grad(x, y, z) as [number, number, number];
    const e = 0.0008;
    const g: [number, number, number] = [d(x + e, y, z) - d(x - e, y, z), d(x, y + e, z) - d(x, y - e, z), d(x, y, z + e) - d(x, y, z - e)];
    const l = Math.hypot(g[0], g[1], g[2]) || 1; return [g[0] / l, g[1] / l, g[2] / l];
  };
  return { ...field, d, grad };
}
