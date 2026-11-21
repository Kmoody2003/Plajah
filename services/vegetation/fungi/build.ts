// Plajah Vegetation — fungi grower (docs/plajah-vegetation.md §2, phase 4).
//
// A mushroom is a cap (a surface of revolution: dome, flat toadstool, bell, or a bulb that swells past its equator and
// tucks back in), radial gills under it, a stem (smooth, or twisted strands with glowing cables wound round it — the
// Cyber Forest look), roots spreading over the ground, and optionally a mossy root ball the cluster grows from. Shelf
// fungi are brackets stacked up a trunk's side. Every vertex carries: colour, part (0 cap top, 1 under/gills, 2 stem,
// 3 roots/ball, 4 cables), coord (around 0…1, along 0…1 — the shader draws circuit traces / spots with it), a glow
// weight, and sway (how far up, phase) for the wobble. Pure TypeScript, deterministic per (species, seed).
import type { FungusSpecies } from '../species';
import { rng } from '../trees/grow';

export interface FungusMesh {
  position: Float32Array; normal: Float32Array; color: Float32Array;
  part: Float32Array; coord: Float32Array; glow: Float32Array; sway: Float32Array;
  index: Uint32Array;
  height: number; radius: number;
  /** Where spores leave from: cap tops (x, y, z, cap radius) in the plant's own frame. */
  caps: [number, number, number, number][];
}

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lin = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255].map((v) => v ** 2.2) as V3;
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Smooth 3D value noise (deterministic), 0…1. */
function noise3(x: number, y: number, z: number, seed: number) {
  const h = (i: number, j: number, k: number) => { let n = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 1274126177) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), u), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v), w);
}

class Builder {
  p: number[] = []; c: number[] = []; part: number[] = []; co: number[] = []; g: number[] = []; s: number[] = []; i: number[] = [];
  vert(p: V3, c: V3, part: number, u: number, v: number, glow: number, sway: number, phase: number) {
    this.p.push(...p); this.c.push(...c); this.part.push(part); this.co.push(u, v); this.g.push(glow); this.s.push(sway, phase);
    return this.p.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) { this.i.push(a, c, b, b, c, d); }
  /** Rows of vertex indices (each row the same length, closed rings if `closed`) stitched into a surface. */
  grid(rows: number[][], closed: boolean) {
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r], B = rows[r + 1], n = A.length;
      for (let k = 0; k < (closed ? n : n - 1); k++) this.quad(A[k], A[(k + 1) % n], B[k], B[(k + 1) % n]);
    }
  }
  /** A tube along points; colour/part/glow per tube, sway from the height fraction. */
  tube(pts: V3[], r: (t: number) => number, sides: number, col: V3, part: number, glow: number, phase: number, sway: (t: number) => number, u0 = 0) {
    const rows: number[][] = [];
    let ref: V3 = [1, 0, 0];
    for (let k = 0; k < pts.length; k++) {
      const t = k / (pts.length - 1);
      const d = norm(k < pts.length - 1 ? sub(pts[k + 1], pts[k]) : sub(pts[k], pts[k - 1]));
      let a = cross(d, ref); if (Math.hypot(...a) < 1e-3) a = cross(d, [0, 0, 1]); a = norm(a); ref = cross(a, d);
      const b = cross(d, a), row: number[] = [];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2, o = add(mul(a, Math.cos(ang) * r(t)), mul(b, Math.sin(ang) * r(t)));
        row.push(this.vert(add(pts[k], o), col, part, u0 + s / sides, t, glow, sway(t), phase));
      }
      rows.push(row);
    }
    this.grid(rows, true);
  }
  done(height: number, radius: number, caps: FungusMesh['caps']): FungusMesh {
    const P = this.p, I = this.i, n = new Float32Array(P.length);
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      const e1: V3 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2: V3 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const f = cross(e1, e2);
      for (const v of [a, b, c]) { n[v] += f[0]; n[v + 1] += f[1]; n[v + 2] += f[2]; }
    }
    for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
    return { position: new Float32Array(P), normal: n, color: new Float32Array(this.c), part: new Float32Array(this.part), coord: new Float32Array(this.co), glow: new Float32Array(this.g), sway: new Float32Array(this.s), index: new Uint32Array(I), height, radius, caps };
  }
}

/** The cap's outer silhouette at s (0 top centre … 1 rim): [radius, height] in units of (R, H). */
export function capProfile(sp: FungusSpecies, s: number): [number, number] {
  const c = sp.cap, th = s * (Math.PI / 2) * (1 + c.bulb);
  const cs = Math.cos(th), e = 1 / (1 + c.flat * 3);
  let r = Math.sin(th), y = Math.sign(cs) * Math.pow(Math.abs(cs), e);
  if (s > 0.82) { const k = (s - 0.82) / 0.18; y -= c.curl * 1.4 * k * k; r *= 1 - c.curl * 0.12 * k * k; }
  return [r, y];
}

interface Look { top: V3; under: V3; stem: V3; root: V3; moss: V3; pat: V3 }

function capAndGills(B: Builder, sp: FungusSpecies, T: V3, R: number, H: number, look: Look, phase: number, seed: number, detail: number) {
  const A = Math.max(10, Math.round(30 * detail)), S = Math.max(6, Math.round(13 * detail));
  const yb = T[1] - H * (sp.cap.bulb > 0 ? 0.05 : 0.22);       // rim plane: the cap hangs over the stem top
  const rows: number[][] = [];
  const pits: V3[] = [];
  const Rr = rng(seed);
  for (let k = 0; k < sp.cap.pits; k++) { const a = Rr() * Math.PI * 2, s = 0.15 + Rr() * 0.55; pits.push([a, s, 0.06 + Rr() * 0.05]); }
  let rimR = R, rimY = yb;
  for (let j = 0; j <= S; j++) {
    const s = j / S, [pr, py] = capProfile(sp, s), row: number[] = [];
    for (let k = 0; k < A; k++) {
      const a = (k / A) * Math.PI * 2;
      let r = pr * R, y = yb + py * H;
      const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
      let p: V3 = [T[0] + dir[0] * r, y, T[2] + dir[2] * r];
      let col = mix3(look.top, look.under, Math.max(0, s - 0.85) * 2);
      if (sp.cap.lumps) {
        const nn = noise3(p[0] * 6 / R, p[1] * 6 / R, p[2] * 6 / R, seed) - 0.5;
        const out = norm([dir[0] * pr, py * (H / R), dir[2] * pr]);
        p = add(p, mul(out, nn * 2 * sp.cap.lumps * R * Math.sin(Math.PI * Math.min(1, s * 1.1))));
      }
      for (const [pa, ps, pr2] of pits) {
        const d = Math.hypot(Math.atan2(Math.sin(a - pa), Math.cos(a - pa)) * Math.max(0.2, ps), s - ps);
        if (d < pr2) { const k2 = 1 - d / pr2; p = sub(p, mul(norm([dir[0] * pr, py * (H / R), dir[2] * pr]), k2 * k2 * R * 0.12)); col = mix3(col, [0.01, 0.01, 0.012], k2 * 0.9); }
      }
      row.push(B.vert(p, col, 0, k / A, s, 0, 1, phase));
      if (j === S) { r = Math.hypot(p[0] - T[0], p[2] - T[2]); rimR = r; rimY = p[1]; }
    }
    rows.push(row);
  }
  B.grid(rows, true);
  // underside: rim back in to the stem, rising a little (a shallow cone)
  const under: number[][] = [rows[S]];
  const stemR = sp.stem.radius * (R / sp.cap.radius);
  for (let j = 1; j <= 4; j++) {
    const t = j / 4, r = rimR + (stemR * 1.25 - rimR) * t, y = rimY + (T[1] - rimY) * Math.pow(t, 0.7) + H * 0.05 * Math.sin(Math.PI * t), row: number[] = [];
    for (let k = 0; k < A; k++) { const a = (k / A) * Math.PI * 2; row.push(B.vert([T[0] + Math.cos(a) * r, y, T[2] + Math.sin(a) * r], look.under, 1, k / A, 1 - t, 0.25, 1, phase)); }
    under.push(row);
  }
  B.grid(under, true);
  // gills: thin radial fins hanging from the underside, glowing in the Cyber Forest species
  const G = Math.round(sp.gills.count * Math.min(1, detail + 0.2));
  for (let k = 0; k < G; k++) {
    const a = (k / G) * Math.PI * 2 + 0.5 / G, top: number[] = [], bot: number[] = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4, r = stemR * 1.3 + (rimR * 0.96 - stemR * 1.3) * t;
      const ut = (rimR - r) / Math.max(1e-4, rimR - stemR * 1.25);
      const y = rimY + (T[1] - rimY) * Math.pow(Math.max(0, Math.min(1, ut)), 0.7) - 0.003;
      const dep = sp.gills.depth * (R / sp.cap.radius) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      const p: V3 = [T[0] + Math.cos(a) * r, y, T[2] + Math.sin(a) * r];
      top.push(B.vert(p, look.under, 1, k / G, t, 0.6, 1, phase));
      bot.push(B.vert([p[0], y - dep, p[2]], mix3(look.under, look.pat, 0.35), 1, k / G, t, 1, 1, phase));
    }
    for (let j = 0; j < 4; j++) B.quad(top[j], top[j + 1], bot[j], bot[j + 1]);
  }
  return { rimR, top: [T[0], yb + capProfile(sp, 0)[1] * H, T[2]] as V3 };
}

function member(B: Builder, sp: FungusSpecies, base: V3, scale: number, outward: number, R: () => number, look: Look, seed: number, detail: number, caps: FungusMesh['caps'], totalH: number) {
  const h = sp.stem.height * scale, phase = R(), lean = (sp.stem.lean + (outward ? 0.12 : 0)) * h;
  const la = outward || R() * Math.PI * 2;
  const top: V3 = add(base, [Math.cos(la) * lean, h, Math.sin(la) * lean]);
  const mid: V3 = add(base, [Math.cos(la) * lean * 0.25 + (R() - 0.5) * h * 0.06, h * 0.5, Math.sin(la) * lean * 0.25 + (R() - 0.5) * h * 0.06]);
  const curve = (t: number): V3 => { const u = 1 - t; return add(add(mul(base, u * u), mul(mid, 2 * u * t)), mul(top, t * t)); };
  const steps = Math.max(5, Math.round(12 * detail)), axis: V3[] = [];
  for (let k = 0; k <= steps; k++) axis.push(curve(k / steps));
  const rTop = sp.stem.radius * scale, rBase = sp.stem.base * scale;
  const swayOf = (t: number) => t * (h / Math.max(0.01, totalH));
  const stemR = (t: number) => rBase + (rTop - rBase) * Math.pow(t, 0.45);
  if (sp.stem.strands > 0) {
    // twisted strands round a thin core (the art's braided mycelium trunks)
    B.tube(axis, (t) => stemR(t) * 0.55, 6, look.stem, 2, 0, phase, swayOf);
    for (let s = 0; s < sp.stem.strands; s++) {
      const a0 = (s / sp.stem.strands) * Math.PI * 2, pts: V3[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, a = a0 + t * sp.stem.twist * Math.PI * 2, rr = stemR(t) * 0.62;
        pts.push(add(axis[k], [Math.cos(a) * rr, 0, Math.sin(a) * rr]));
      }
      B.tube(pts, (t) => stemR(t) * 0.42, 5, mix3(look.stem, look.moss, (s % 3 === 0 ? 0.35 : 0) + R() * 0.1), 2, 0, phase, swayOf, s / sp.stem.strands);
    }
  } else {
    B.tube(axis, stemR, Math.max(6, Math.round(12 * detail)), look.stem, 2, 0, phase, swayOf);
  }
  for (let c = 0; c < sp.stem.cables; c++) {
    const a0 = R() * Math.PI * 2, turns = 0.6 + R() * 1.2, pts: V3[] = [];
    for (let k = 0; k <= steps; k++) { const t = k / steps, a = a0 + t * turns * Math.PI * 2, rr = stemR(t) * 1.04; pts.push(add(axis[k], [Math.cos(a) * rr, 0, Math.sin(a) * rr])); }
    B.tube(pts, () => 0.011 * scale + 0.004, 4, look.pat, 4, 1, phase, swayOf);
  }
  // roots: from the stem's foot out over the ground, sinking at the ends
  for (let k = 0; k < sp.roots.count; k++) {
    const a = (k / sp.roots.count) * Math.PI * 2 + R() * 0.6, reach = sp.roots.reach * scale * (0.6 + R() * 0.6), pts: V3[] = [];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5, d = rBase * 0.8 + reach * t;
      pts.push(add(base, [Math.cos(a + Math.sin(t * 3 + k) * 0.3) * d, rBase * 0.8 * (1 - t) * (1 - t) - 0.02 * t * scale, Math.sin(a + Math.sin(t * 3 + k) * 0.3) * d]));
    }
    B.tube(pts, (t) => (0.035 * scale + rBase * 0.12) * (1 - t * 0.85), 4, look.root, 3, R() < 0.25 ? 0.4 : 0, phase, () => 0);
  }
  if (sp.form === 'cap') {
    const Rc = sp.cap.radius * scale, Hc = sp.cap.height * scale;
    const cap = capAndGills(B, sp, top, Rc, Hc, look, phase, seed + Math.round(scale * 1000), detail);
    caps.push([cap.top[0], cap.top[1], cap.top[2], cap.rimR]);
    return cap.top[1];
  }
  return top[1];
}

function rootBall(B: Builder, r: number, look: Look, seed: number, detail: number) {
  const A = Math.max(10, Math.round(20 * detail)), S = Math.max(4, Math.round(7 * detail)), rows: number[][] = [];
  for (let j = 0; j <= S; j++) {
    const t = j / S, ph = t * Math.PI * 0.55, row: number[] = [];
    for (let k = 0; k < A; k++) {
      const a = (k / A) * Math.PI * 2, n = noise3(Math.cos(a) * 2, t * 3, Math.sin(a) * 2, seed);
      const rr = r * (0.8 + n * 0.45);
      const p: V3 = [Math.cos(a) * Math.cos(ph) * rr, Math.sin(ph) * rr * 0.75 - r * 0.25, Math.sin(a) * Math.cos(ph) * rr];
      const moss = noise3(p[0] * 5 / r, p[1] * 5 / r, p[2] * 5 / r, seed + 3);
      row.push(B.vert(p, mix3(look.root, look.moss, Math.max(0, moss - 0.45) * 2.2), 3, k / A, t, noise3(p[0] * 13 / r, p[1] * 13 / r, p[2] * 13 / r, seed + 5) > 0.82 ? 0.8 : 0, 0, 0));
    }
    rows.push(row);
  }
  B.grid(rows.reverse(), true);
}

/** Shelf brackets stacked up a trunk's side: the trunk surface is the plane z = 0, the brackets grow toward +z. */
function shelves(B: Builder, sp: FungusSpecies, R: () => number, look: Look, seed: number, detail: number, caps: FungusMesh['caps']) {
  let y = 0.2;
  const A = Math.max(8, Math.round(16 * detail)), S = Math.max(4, Math.round(6 * detail));
  for (let m = 0; m < sp.cluster.count; m++) {
    const sc = 1 - sp.cluster.falloff * R(), Rb = sp.cap.radius * sc, Hb = sp.cap.height * sc, phase = R();
    const x0 = (R() - 0.5) * sp.cluster.spread, base: V3 = [x0, y, 0];
    const top: number[][] = [], bot: number[][] = [];
    for (let j = 0; j <= S; j++) {
      const s = j / S, rowT: number[] = [], rowB: number[] = [];
      for (let k = 0; k <= A; k++) {
        const a = -Math.PI / 2 + (k / A) * Math.PI, wav = 1 + (noise3(Math.cos(a) * 3, m, Math.sin(a) * 3, seed) - 0.5) * 0.35;
        const r = Rb * s * wav * (0.75 + 0.25 * Math.cos(a)), dome = Hb * (1 - s * s);
        const p: V3 = [base[0] + Math.sin(a) * r * 1.2, base[1] + dome - Hb * 0.3 * s * s, base[2] + Math.cos(a) * r];
        rowT.push(B.vert(p, mix3(look.top, look.under, s > 0.9 ? 0.5 : 0), 0, k / A, s, 0, s, phase));
        rowB.push(B.vert([p[0], base[1] - Hb * 0.12 * (1 - s) - Hb * 0.3 * s * s, p[2]], look.under, 1, k / A, s, 1, s, phase));
      }
      top.push(rowT); bot.push(rowB);
    }
    B.grid(top, false);
    B.grid(bot.map((r) => [...r].reverse()), false);
    caps.push([base[0], base[1] - Hb * 0.1, Rb * 0.5, Rb]);
    y += Hb * (1.6 + R() * 1.4);
  }
  return y;
}

export function buildFungus(sp: FungusSpecies, seed: number, detail = 1): FungusMesh {
  const R = rng(seed * 6007 + 11), B = new Builder();
  const look: Look = { top: lin(sp.look.capTop), under: lin(sp.look.capUnder), stem: lin(sp.look.stem), root: lin(sp.look.root), moss: lin(0x3a5a2c), pat: lin(sp.look.patternColor) };
  const caps: FungusMesh['caps'] = [];
  if (sp.form === 'shelf') {
    const h = shelves(B, sp, R, look, seed, detail, caps);
    return B.done(h, sp.cap.radius * 1.2, caps);
  }
  const N = sp.cluster.count, totalH = sp.stem.height + sp.cap.height;
  let maxY = 0, maxR = 0;
  if (sp.cluster.ball > 0) rootBall(B, sp.cluster.ball, look, seed, detail);
  for (let m = 0; m < N; m++) {
    const first = m === 0, a = R() * Math.PI * 2, d = first ? (N > 1 ? sp.cluster.spread * 0.12 : 0) : sp.cluster.spread * (0.35 + R() * 0.65);
    const rank = m / Math.max(1, N - 1);
    const scale = first ? 1 : Math.max(0.18, 1 - sp.cluster.falloff * (0.35 + rank * 0.65) * (0.75 + R() * 0.5));
    const by = sp.cluster.ball > 0 ? sp.cluster.ball * 0.35 * (1 - (d / Math.max(0.01, sp.cluster.spread)) ** 2) : 0;
    const y = member(B, sp, [Math.cos(a) * d, by, Math.sin(a) * d], scale, first ? 0 : a, R, look, seed + m * 17, detail, caps, totalH);
    maxY = Math.max(maxY, y + sp.cap.height * scale * 0.2); maxR = Math.max(maxR, d + sp.cap.radius * scale);
  }
  return B.done(maxY, maxR, caps);
}
