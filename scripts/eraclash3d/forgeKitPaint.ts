/**
 * forgeKitPaint.ts — each kit asset painted from its own picture in the character's flat-lay (forgeKit.ts).
 *
 * Every asset gets one atlas (xatlas, engines/tela-3d/uv_atlas.py) over all its parts; each texel's surface point is
 * mapped into the asset's flat-lay cut-out (engines/tela-3d/cut_pieces.py) by how the piece lies in the picture:
 *   - worn:   seen from the front as worn (dō, kusazuri and sode together from the assembled armour, so they line up;
 *             the dō's back from its back plate; hakama, kosode), the back of a garment from its front, darker;
 *   - ring:   unrolled round the body (obi, hachimaki: the picture shows them laid out straight);
 *   - pair:   each side along its own length onto its half of the picture (kote, suneate, tabi, waraji);
 *   - blade:  along the blade, hilt to the left as laid out (katana, the sheathed swords).
 * Where the picture has nothing for a texel (off the cut-out), the piece keeps its own colour.
 */
import fs from 'node:fs';
import { dataFile } from './forgeSpec';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
export interface G { pos: number[]; nor: number[]; uv: number[]; idx: number[] }
export type Part = Map<string, Map<string, G>>;
type V3 = [number, number, number];
export interface PaintSpec { mode: 'worn' | 'ring' | 'pair' | 'blade'; image: string; back?: string; group?: string; hiltUp?: boolean }

/** How a character's kit lies in its flat-lay: the spec folder's flatlay_paint.json (none: the kit keeps its own colours). */
export function flatLayPaint(): Record<string, PaintSpec> {
  const f = dataFile('flatlay_paint.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).pieces : {};
}

interface Img { w: number; h: number; d: Buffer }
const loadImg = async (f: string): Promise<Img> => { const r = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { w: r.info.width, h: r.info.height, d: r.data }; };
/** Bilinear colour at (u, v) in 0..1 over the picture; null where the cut-out has nothing. */
function sample(im: Img, u: number, v: number, out: number[]): boolean {
  const x = u * (im.w - 1), y = v * (im.h - 1);
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= im.w - 1 || iy >= im.h - 1) return false;
  const fx = x - ix, fy = y - iy;
  let a = 0; out[0] = out[1] = out[2] = 0;
  for (const [ox, oy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const i = ((iy + oy) * im.w + ix + ox) * 4;
    a += im.d[i + 3] * w;
    for (let k = 0; k < 3; k++) out[k] += im.d[i + k] * w;
  }
  return a > 160;
}

export async function paintKit(items: { id: string; part: Part; spec?: PaintSpec; base: (mat: string) => number[] }[], pieceDir: string, work: string) {
  fs.mkdirSync(work, { recursive: true });
  const images = new Map<string, Img>();
  for (const it of items) for (const n of [it.spec?.image, it.spec?.back]) if (n && !images.has(n) && fs.existsSync(path.join(pieceDir, `${n}.png`))) images.set(n, await loadImg(path.join(pieceDir, `${n}.png`)));
  const todo = items.filter((it) => it.spec && images.has(it.spec.image));
  // ---- one atlas per asset, over all its parts ---------------------------------------------------------------------
  type Tri = { g: G; t: number };
  const merged = todo.map((it) => {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [], tris: Tri[] = [], vg: { g: G; v: number }[] = [];
    for (const node of it.part.values()) for (const g of node.values()) {
      const base = pos.length / 3;
      pos.push(...g.pos); nor.push(...g.nor);
      for (let v = 0; v < g.pos.length / 3; v++) vg.push({ g, v });
      for (let t = 0; t < g.idx.length; t += 3) { idx.push(g.idx[t] + base, g.idx[t + 1] + base, g.idx[t + 2] + base); tris.push({ g, t }); }
    }
    return { it, pos, nor, idx, tris, vg };
  });
  const jobs = merged.map((m) => {
    const out = path.join(work, m.it.id);
    fs.writeFileSync(out + '.f32', Buffer.from(new Float32Array(m.pos).buffer));
    fs.writeFileSync(out + '.u32', Buffer.from(new Uint32Array(m.idx).buffer));
    return { positions: out + '.f32', indices: out + '.u32', out, resolution: m.it.spec!.group === 'armour' ? 2048 : 1024 };
  });
  fs.writeFileSync(path.join(work, 'jobs.json'), JSON.stringify(jobs));
  if (jobs.length) execFileSync(PY, ['engines/tela-3d/uv_atlas.py', path.join(work, 'jobs.json')], { stdio: ['ignore', 'ignore', 'inherit'] });
  const own = (f: string) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

  // groups painted from one picture together share one frame
  const groupBox = new Map<string, { mn: V3; mx: V3 }>();
  for (const m of merged) {
    const key = m.it.spec!.group ?? m.it.id;
    const b = groupBox.get(key) ?? { mn: [Infinity, Infinity, Infinity] as V3, mx: [-Infinity, -Infinity, -Infinity] as V3 };
    for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b.mn[k] = Math.min(b.mn[k], m.pos[i + k]); b.mx[k] = Math.max(b.mx[k], m.pos[i + k]); }
    groupBox.set(key, b);
  }
  const result = new Map<string, Buffer>();
  for (const [mi, m] of merged.entries()) {
    const spec = m.it.spec!, im = images.get(spec.image)!, back = spec.back ? images.get(spec.back) : undefined;
    const vmap = new Uint32Array(own(jobs[mi].out + '.vmap.u32')), nidx = new Uint32Array(own(jobs[mi].out + '.idx.u32')), uv = new Float32Array(own(jobs[mi].out + '.uv.f32'));
    const box = groupBox.get(spec.group ?? m.it.id)!;
    const cz = (box.mn[2] + box.mx[2]) / 2, cx = (box.mn[0] + box.mx[0]) / 2;
    // per side, for pairs: the side's own long axis (its length) and the axis across it as seen from the front
    const sideFrame = new Map<number, { c: V3; along: V3; across: V3; a: [number, number]; b: [number, number] }>();
    if (spec.mode === 'pair') for (const side of [-1, 1]) {
      const pts: V3[] = [];
      for (let i = 0; i < m.pos.length; i += 3) if (Math.sign(m.pos[i] - cx || 1) === side) pts.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]);
      if (!pts.length) continue;
      const c = pts.reduce<V3>((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
      // the long axis by power iteration on the covariance
      let ax: V3 = [0, 1, 0];
      for (let it = 0; it < 20; it++) {
        const n: V3 = [0, 0, 0];
        for (const p of pts) { const d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; const s = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]; n[0] += d[0] * s; n[1] += d[1] * s; n[2] += d[2] * s; }
        const l = Math.hypot(...n) || 1; ax = [n[0] / l, n[1] / l, n[2] / l];
      }
      if (ax[1] < 0 && Math.abs(ax[1]) > 0.3) ax = [-ax[0], -ax[1], -ax[2]]; // a limb's top is up
      if (Math.abs(ax[1]) <= 0.3 && ax[2] < 0) ax = [-ax[0], -ax[1], -ax[2]]; // a foot's toe is forward
      // across: in the plane the picture shows (front for limbs, from above for feet)
      const view: V3 = Math.abs(ax[1]) > 0.3 ? [0, 0, 1] : [0, 1, 0];
      let ac: V3 = [ax[1] * view[2] - ax[2] * view[1], ax[2] * view[0] - ax[0] * view[2], ax[0] * view[1] - ax[1] * view[0]];
      const al = Math.hypot(...ac) || 1; ac = [ac[0] / al, ac[1] / al, ac[2] / al];
      if (ac[0] < 0) ac = [-ac[0], -ac[1], -ac[2]];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of pts) { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; const a = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2], b = d[0] * ac[0] + d[1] * ac[1] + d[2] * ac[2]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
      sideFrame.set(side, { c, along: ax, across: ac, a: [a0, a1], b: [b0, b1] });
    }
    /** Where a surface point lies in the picture (0..1), or which picture and how dark. */
    const lookup = (p: number[], n: number[]): { img: Img; u: number; v: number; dim: number } | null => {
      const fx = (p[0] - box.mn[0]) / (box.mx[0] - box.mn[0] || 1), fy = 1 - (p[1] - box.mn[1]) / (box.mx[1] - box.mn[1] || 1);
      if (spec.mode === 'worn') {
        if (n[2] < -0.25) return back ? { img: back, u: 1 - fx, v: fy, dim: 1 } : { img: im, u: 1 - fx, v: fy, dim: 0.7 };
        return { img: im, u: fx, v: fy, dim: 1 };
      }
      if (spec.mode === 'ring') {
        // unrolled from the back round to the back again, the front in the middle of the picture
        const a = Math.atan2(p[0] - cx, -(p[2] - cz)); // -π..π, 0 at the back
        return { img: im, u: (a / Math.PI + 1) / 2, v: fy, dim: 1 };
      }
      if (spec.mode === 'pair') {
        const side = Math.sign(p[0] - cx || 1), f = sideFrame.get(side); if (!f) return null;
        const d = [p[0] - f.c[0], p[1] - f.c[1], p[2] - f.c[2]];
        const a = (d[0] * f.along[0] + d[1] * f.along[1] + d[2] * f.along[2] - f.a[0]) / (f.a[1] - f.a[0] || 1);
        const b = (d[0] * f.across[0] + d[1] * f.across[1] + d[2] * f.across[2] - f.b[0]) / (f.b[1] - f.b[0] || 1);
        // the wearer's right (-x) lies on the picture's left, as it would facing him
        return { img: im, u: (side < 0 ? 0 : 0.5) + b * 0.5, v: 1 - a, dim: 1 };
      }
      // blade: along its length (local y), hilt to the left; across by the wider of x and z
      const ry = box.mx[1] - box.mn[1] || 1;
      const t = spec.hiltUp ? (box.mx[1] - p[1]) / ry : (p[1] - box.mn[1]) / ry;
      const wide = box.mx[0] - box.mn[0] > box.mx[2] - box.mn[2] ? 0 : 2;
      const s = (p[wide] - box.mn[wide]) / (box.mx[wide] - box.mn[wide] || 1);
      return { img: im, u: t, v: s, dim: 1 };
    };
    const baseOf = new Map<G, number[]>();
    for (const node of m.it.part.values()) for (const [mat, g] of node) baseOf.set(g, m.it.base(mat));
    const N = jobs[mi].resolution;
    const img = new Float32Array(N * N * 3), have = new Uint8Array(N * N);
    const col = [0, 0, 0];
    for (let t = 0; t < nidx.length; t += 3) {
      const vs = [nidx[t], nidx[t + 1], nidx[t + 2]];
      const o = vs.map((v) => vmap[v]);
      const a = vs.map((v) => [uv[v * 2] * N, uv[v * 2 + 1] * N]);
      const det = (a[1][1] - a[2][1]) * (a[0][0] - a[2][0]) + (a[2][0] - a[1][0]) * (a[0][1] - a[2][1]);
      if (Math.abs(det) < 1e-12) continue;
      const base = baseOf.get(m.tris[t / 3].g)!;
      const x0 = Math.max(0, Math.floor(Math.min(a[0][0], a[1][0], a[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(a[0][0], a[1][0], a[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[0][1], a[1][1], a[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(a[0][1], a[1][1], a[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((a[1][1] - a[2][1]) * (px - a[2][0]) + (a[2][0] - a[1][0]) * (py - a[2][1])) / det;
        const l1 = ((a[2][1] - a[0][1]) * (px - a[2][0]) + (a[0][0] - a[2][0]) * (py - a[2][1])) / det;
        const l2 = 1 - l0 - l1;
        if (l0 < -0.01 || l1 < -0.01 || l2 < -0.01) continue;
        const i = y * N + x; if (have[i]) continue;
        const p = [0, 1, 2].map((k) => l0 * m.pos[o[0] * 3 + k] + l1 * m.pos[o[1] * 3 + k] + l2 * m.pos[o[2] * 3 + k]);
        const n = [0, 1, 2].map((k) => l0 * m.nor[o[0] * 3 + k] + l1 * m.nor[o[1] * 3 + k] + l2 * m.nor[o[2] * 3 + k]);
        const look = lookup(p, n);
        if (look && sample(look.img, look.u, look.v, col)) for (let k = 0; k < 3; k++) img[i * 3 + k] = col[k] * look.dim;
        else for (let k = 0; k < 3; k++) img[i * 3 + k] = base[k];
        have[i] = 1;
      }
    }
    for (let pass = 0; pass < 6; pass++) { // grow past the charts' edges
      const add: [number, number[]][] = [];
      for (let i = 0; i < N * N; i++) {
        if (have[i]) continue;
        const x = i % N, y = (i / N) | 0, c = [0, 0, 0]; let n = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= N || yy >= N || !have[yy * N + xx]) continue; for (let k = 0; k < 3; k++) c[k] += img[(yy * N + xx) * 3 + k]; n++; }
        if (n) add.push([i, c.map((q) => q / n)]);
      }
      for (const [i, c] of add) { img.set(c, i * 3); have[i] = 1; }
    }
    const raw = Buffer.alloc(N * N * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.max(0, Math.min(255, Math.round(img[i])));
    result.set(m.it.id, await sharp(raw, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 88 }).toBuffer());
    // the asset's parts re-cut along the atlas: each new triangle came from the same old one (xatlas keeps the order)
    const fresh = new Map<G, { map: Map<number, number>; pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
    for (let t = 0; t < nidx.length; t += 3) {
      const g = m.tris[t / 3].g;
      let f = fresh.get(g); if (!f) { f = { map: new Map(), pos: [], nor: [], uv: [], idx: [] }; fresh.set(g, f); }
      for (let e = 0; e < 3; e++) {
        const nv = nidx[t + e];
        let j = f.map.get(nv);
        if (j === undefined) {
          j = f.pos.length / 3; f.map.set(nv, j);
          const ov = vmap[nv];
          f.pos.push(m.pos[ov * 3], m.pos[ov * 3 + 1], m.pos[ov * 3 + 2]); f.nor.push(m.nor[ov * 3], m.nor[ov * 3 + 1], m.nor[ov * 3 + 2]); f.uv.push(uv[nv * 2], uv[nv * 2 + 1]);
        }
        f.idx.push(j);
      }
    }
    for (const [g, f] of fresh) { g.pos = f.pos; g.nor = f.nor; g.uv = f.uv; g.idx = f.idx; }
  }
  return result;
}
