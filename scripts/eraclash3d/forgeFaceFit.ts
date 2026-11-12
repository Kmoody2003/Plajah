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

/** Haru's turnaround (Muse): each view's columns, the soles' row, and the chin's row (MediaPipe on the front view's face). */
export const HARU_SHEET = {
  path: process.env.FORGE_SHEET ?? 'D:/Plajah Runtime/forge/haru-ref/sheet.png',
  front: { x0: 100, x1: 700 },
  side: { x0: 750, x1: 1300 },
  back: { x0: 1350, x1: 1950 },
  sole: 1322,
  chin: 264.2,
  /** Chin (152) to the top of the face oval (10) on the sheet's front face, in sheet pixels. */
  faceLength: 134.7,
};

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
  opts: { chinY: number; frontSkin: number[]; front: number; sheet?: typeof HARU_SHEET; /** The portrait alone in front of this depth (the face's features: a profile's brow or nostril must not land on them). */ faceZ: number; browY: number },
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
    if (p[1] < opts.chinY - 0.005 + 0.06 * Math.max(0, Math.min(1, (0.12 - p[2]) / 0.07))) return p[1] > opts.chinY - 0.06 ? { c: opts.frontSkin, w: 1 } : null;
    if (((p[2] - earZ) / 0.03) ** 2 + ((p[1] - earY) / 0.045) ** 2 < 1 && Math.abs(nr[0]) > 0.3) return { c: opts.frontSkin, w: 1 };
    // side view for either side (the head is near enough symmetric), the back view behind
    // (only surfaces that really face a view: a forehead sloping away is hidden behind the side hair in a profile)
    const wSide = Math.max(0, Math.abs(nr[0]) - 0.45), wBack = Math.max(0, -nr[2] - 0.25);
    const out = [0, 0, 0]; let wt = 0;
    const side = sampleSheet(cxSide - p[2] * ppm, sh.sole - p[1] * ppm);
    const back = sampleSheet(cxBack - p[0] * ppm, sh.sole - p[1] * ppm);
    if (side && wSide > 0 && headPixel(side)) { for (let k = 0; k < 3; k++) out[k] += side[k] * wSide; wt += wSide; }
    if (back && wBack > 0 && headPixel(back)) { for (let k = 0; k < 3; k++) out[k] += back[k] * wBack; wt += wBack; }
    if (!wt) return null;
    return { c: out.map((v, k) => Math.min(255, (v / wt) * tone[k])), w: wt };
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
      let sv = viewColour(pt, nr);
      // on the strip, a side of the head below the brows that the sheet has nothing for (beard shadow, the ear, the
      // collar) is skin, not the procedural hair
      if (!sv && y >= opts.front * N && pt[1] < opts.browY && pt[1] > opts.chinY - 0.06 && Math.abs(nr[0]) > -nr[2]) sv = { c: opts.frontSkin, w: 1 };
      if (!sv) continue;
      // in the front region the portrait holds while the surface faces the camera, handing over as it turns away
      const inFront = y < opts.front * N;
      if (inFront && pt[2] > opts.faceZ) continue;
      const k = inFront ? Math.max(0, Math.min(1, (0.45 - nr[2]) / 0.35)) * Math.min(1, sv.w / 0.25) : 1;
      if (k <= 0) continue;
      for (let c = 0; c < 3; c++) atlas.data[i * 4 + c] = Math.round(atlas.data[i * 4 + c] * (1 - k) + sv.c[c] * k);
    }
  }
  // grow the strip's painting a few texels past its triangles, so filtering never pulls the procedural hair in at an edge
  const y0 = Math.ceil(opts.front * N);
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
