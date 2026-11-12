/**
 * ears.ts — a pair of ears for the Forge head (docs/character-forge.md §4).
 *
 * MediaPipe's canonical face stops in front of the ears, so the Forge head has none of its own; with hair drawn back
 * the side of the head reads bald without them. Each ear is one continuous sheet on a polar grid: the front runs from
 * the concha's bowl out to the rolled helix rim, which stands off the head more toward the back, and the back sheet
 * runs from the rim down into the head, so the ear is closed from every side. Rigid on the head bone.
 */
import type { Vec3 } from '../engine';
import { MeshBuilder } from './wardrobe';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export interface EarSpec {
  /** Where the ear's root meets the head (on the skin) and the head's outward normal there. */
  at: Vec3;
  normal: Vec3;
  /** Ear height in metres (about 6 cm on an adult). */
  height?: number;
  bone: string;
}

/** One ear. The grid's θ runs round the outline from the top (0) over the back (π/2) and the lobe (π) to the front. */
export function ear(mb: MeshBuilder, spec: EarSpec) {
  const h = spec.height ?? 0.062, a = h * 0.29, b = h / 2;
  // the ear's frame: out of the head (level), up (leaning back a little), forward toward the face
  const out = norm([spec.normal[0], 0, spec.normal[2]]);
  let fwd = norm(cross(out, [0, 1, 0]));
  if (fwd[2] < 0) fwd = mul(fwd, -1);
  const lean = 0.2;
  const up = norm(add(mul([0, 1, 0], Math.cos(lean)), mul(fwd, -Math.sin(lean))));
  const centre = add(sub(spec.at, mul(out, 0.002)), mul(fwd, -a * 0.35));
  // outline: round over the back, narrower at the lobe, nearly straight where the front joins the head
  const outline = (t: number): [number, number] => {
    const s = Math.sin(t), c = Math.cos(t);
    const back = s > 0 ? 1 : 0.38;
    const lobe = c < 0 ? 0.88 : 1;
    return [-s * a * back, c * b * lobe];
  };
  // how far the rim stands off the head: least at the front root, most at the top-back
  const stand = (t: number) => 0.003 + 0.016 * smooth(Math.sin(t) * 1.2) * (Math.cos(t) > -0.4 ? 1 : 0.7);
  const K = 32, S = 9, BACK = 4;
  const P = (k: number, r: number): Vec3 => {
    const t = (k / K) * Math.PI * 2;
    const [u, v] = outline(t);
    const w = stand(t);
    let s: number, depth: number;
    if (r <= S) {
      // front: the concha's bowl, the antihelix ridge, the helix rim rolling over at the edge
      s = r / S;
      depth = w * (0.22 + 0.55 * smooth((s - 0.35) / 0.35) + 0.23 * smooth((s - 0.82) / 0.18)) + 0.0025 * Math.sin(Math.PI * Math.min(1, s / 0.6));
      s *= 1 + 0.03 * smooth((s - 0.85) / 0.15);
    } else {
      // back: from just behind the rim down into the head
      const q = (r - S) / BACK;
      s = 1.03 - 0.18 * q;
      depth = w * (1.02 - 1.1 * q) - 0.0015 * q;
    }
    return add(add(add(centre, mul(fwd, u * s)), mul(up, v * s)), mul(out, depth));
  };
  const rows = S + BACK;
  const grid: Vec3[][] = [];
  for (let r = 0; r <= rows; r++) { grid.push([]); for (let k = 0; k < K; k++) grid[r].push(P(k, r)); }
  const ids: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    ids.push([]);
    for (let k = 0; k < K; k++) {
      const dT = sub(grid[r][(k + 1) % K], grid[r][(k + K - 1) % K]);
      const dR = sub(grid[Math.min(rows, r + 1)][k], grid[Math.max(0, r - 1)][k]);
      let n = norm(cross(dT, dR));
      // front rows face out of the ear, back rows face away from it
      const want = r <= S ? out : mul(out, -1);
      if (r === 0) n = out;
      else if (dot(n, want) < 0 && r <= S) n = mul(n, -1);
      else if (r > S && dot(n, sub(grid[r][k], centre)) < 0) n = mul(n, -1);
      ids[r].push(mb.vert(grid[r][k], n, k / K, r / rows, spec.bone));
    }
  }
  // triangles wound to agree with their vertices' normals
  const tri = (i: number, j: number, l: number) => {
    const p = [i, j, l].map((x) => [mb.pos[x * 3], mb.pos[x * 3 + 1], mb.pos[x * 3 + 2]] as Vec3);
    const fn = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const vn: Vec3 = [0, 0, 0];
    for (const x of [i, j, l]) for (let c = 0; c < 3; c++) vn[c] += mb.nor[x * 3 + c];
    if (dot(fn, vn) >= 0) mb.tri(i, j, l); else mb.tri(i, l, j);
  };
  for (let r = 0; r < rows; r++) for (let k = 0; k < K; k++) {
    const k1 = (k + 1) % K;
    tri(ids[r][k], ids[r + 1][k], ids[r + 1][k1]);
    tri(ids[r][k], ids[r + 1][k1], ids[r][k1]);
  }
}
