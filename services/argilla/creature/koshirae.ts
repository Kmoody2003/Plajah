/**
 * koshirae.ts — a Japanese sword built the way a swordsmith, a polisher and a sayashi would build it, from the Heritage
 * Codex (services/argilla/heritage/codex.ts) as the Forge's context stage resolved it for one character.
 *
 * Socket space, as weapons.ts: +y from the hilt toward the tip, +x the cutting edge's side, origin at the tsuba's
 * blade-side face. Everything is real geometry with UVs laid out for its texture (forgeArmsLook.ts paints them):
 *
 *   blade   shinogi-zukuri section (ha, hira-ji, shinogi, shinogi-ji, iori-mune), its curve with the edge on the
 *           outside, the kissaki's fukura, a bo-hi groove cut into the shinogi-ji when the art shows one; UV u runs
 *           across the blade from the edge (0) to the back (0.5) on the omote face and again on the ura, v along it,
 *           so the hamon and the grain are painted where a polisher would raise them
 *   habaki  the collar, seppa either side of the tsuba, the tsuba itself (a disc with its raised mimi rim)
 *   tsuka   fuchi, ray-skin core, the hishi-maki wrap (two flat braids crossing, leaving the diamonds), menuki under it,
 *           the mekugi peg, the kashira cap
 *   saya    the lacquered scabbard on the blade's own curve, koiguchi, kurikata (on the omote face) and kojiri; the
 *           sageo wrapped round it below the kurikata, its free ends left for the rig to hang and swing
 */
import type { Vec3 } from '../engine';
import { MeshBuilder } from './wardrobe';

export interface NihontoDims { nagasa: number; sori: number; motohaba: number; sakihaba: number; kasane: number; kissaki: number; tsuka: number; tsuba: number; saya: number }
export interface NihontoFeatures { bohi?: boolean; hamon?: string }
export interface Koshirae {
  blade: Map<string, MeshBuilder>;
  hilt: Map<string, MeshBuilder>;
  /** The scabbard, mouth at the origin running down −y, with the sageo's wraps (no hilt). */
  saya: Map<string, MeshBuilder>;
  base: Vec3; tip: Vec3;
  /** In saya space: where the kurikata stands and the sageo's free ends leave it. */
  kurikata: Vec3; sageoEnds: Vec3[];
  /** The scabbard's far end (kojiri), in saya space. */
  kojiri: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A grid of vertices f(i, j) → position and uv, normals from the neighbours, quads wound so the normal faces `out`. */
function grid(mb: MeshBuilder, nu: number, nv: number, f: (i: number, j: number) => { p: Vec3; uv: [number, number] }, bone: string, flip = false) {
  const base = mb.count;
  const P: Vec3[][] = [];
  for (let j = 0; j <= nv; j++) { P.push([]); for (let i = 0; i <= nu; i++) P[j].push(f(i, j).p); }
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const du = sub(P[j][Math.min(nu, i + 1)], P[j][Math.max(0, i - 1)]);
    const dv = sub(P[Math.min(nv, j + 1)][i], P[Math.max(0, j - 1)][i]);
    let n = norm(cross(du, dv)); if (flip) n = [-n[0], -n[1], -n[2]];
    const { uv } = f(i, j);
    mb.vert(P[j][i], n, uv[0], uv[1], bone);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    if (flip) mb.quad(a, b, c, d); else mb.quad(a, d, c, b);
  }
}

/** A closed oval tube along a path (with end caps), u round, v along in metres. */
function ovalTube(mb: MeshBuilder, path: (t: number) => Vec3, rx: (t: number) => number, rz: (t: number) => number, nv: number, sides: number, bone: string, caps: [boolean, boolean] = [true, true], uvLen = 1) {
  grid(mb, sides, nv, (i, j) => {
    const t = j / nv, a = (i / sides) * Math.PI * 2, c = path(t);
    return { p: [c[0] + Math.cos(a) * rx(t), c[1], c[2] + Math.sin(a) * rz(t)], uv: [i / sides, t * uvLen] };
  }, bone, true);
  for (const end of [0, 1] as const) {
    if (!caps[end]) continue;
    const t = end, c = path(t), dir = end ? 1 : -1;
    const centre = mb.vert(c, [0, dir * Math.sign(path(1)[1] - path(0)[1]), 0], 0.5, 0.5, bone);
    const ring: number[] = [];
    for (let i = 0; i <= sides; i++) { const a = (i / sides) * Math.PI * 2; ring.push(mb.vert([c[0] + Math.cos(a) * rx(t), c[1], c[2] + Math.sin(a) * rz(t)], [0, dir * Math.sign(path(1)[1] - path(0)[1]), 0], 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, bone)); }
    for (let i = 0; i < sides; i++) { if ((end === 1) === (path(1)[1] > path(0)[1])) mb.tri(centre, ring[i + 1], ring[i]); else mb.tri(centre, ring[i], ring[i + 1]); }
  }
}

/** A flat disc in the xz plane at height y, both faces, with an oval outline; uv is planar over the disc. */
function disc(mb: MeshBuilder, y0: number, y1: number, rx: number, rz: number, sides: number, bone: string) {
  for (const [y, up] of [[y0, -1], [y1, 1]] as const) {
    const c = mb.vert([0, y, 0], [0, up, 0], 0.5, 0.5, bone);
    const ring: number[] = [];
    for (let i = 0; i <= sides; i++) { const a = (i / sides) * Math.PI * 2; ring.push(mb.vert([Math.cos(a) * rx, y, Math.sin(a) * rz], [0, up, 0], 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, bone)); }
    for (let i = 0; i < sides; i++) { if (up > 0) mb.tri(c, ring[i + 1], ring[i]); else mb.tri(c, ring[i], ring[i + 1]); }
  }
  ovalTube(mb, (t) => [0, y0 + (y1 - y0) * t, 0], () => rx, () => rz, 1, sides, bone, [false, false]);
}

/**
 * The curve: x(t) = −K·t^p, the tip toward the back, so the edge (+x) lies on the outside of the bow. Sori is the
 * greatest gap between the back and the chord from the base to the tip; p = 1.8 puts it a little below the middle
 * (koshi-zori), as the codex has it for the period, and swings a 70 cm blade's tip about 7.5 cm off the tang's line,
 * as a real one does (a tighter power bunches the bend at the hilt and doubles that).
 */
export function bow(sori: number, p = 1.8) {
  const tStar = (1 / p) ** (1 / (p - 1));
  const K = sori / (tStar - tStar ** p);
  return (t: number) => -K * Math.max(0, t) ** p;
}

export function nihontoKoshirae(d: NihontoDims, f: NihontoFeatures = {}, bone = ''): Koshirae {
  const blade = new Map<string, MeshBuilder>(), hilt = new Map<string, MeshBuilder>(), saya = new Map<string, MeshBuilder>();
  const M = (map: Map<string, MeshBuilder>, m: string) => { let b = map.get(m); if (!b) { b = new MeshBuilder(); map.set(m, b); } return b; };
  const curve = bow(d.sori);
  const yb = 0.0035; // the blade leaves the tsuba (habaki over its first 3 cm)
  const yokote = 1 - d.kissaki / d.nagasa;

  // ---- blade ------------------------------------------------------------------------------------------------------
  // across the blade: a = 0 the edge … 1 the back; the shinogi at 0.78, the hi's band on the shinogi-ji
  const A = [0, 0.06, 0.18, 0.34, 0.5, 0.64, 0.74, 0.78, 0.81, 0.84, 0.88, 0.92, 0.95, 0.975, 1];
  const NV = 96;
  const hiFrom = 0.03, hiTo = yokote - 0.06;
  const halfThick = (a: number, t: number) => {
    const th = d.kasane * (1 - 0.36 * t) / 2;
    if (a <= 0.78) return th * (1 - (1 - a / 0.78) ** 1.6);              // hira-ji with a little niku, to the shinogi
    const m = (a - 0.78) / 0.22;                                          // shinogi-ji narrowing, then the iori-mune's two facets
    let z = th * (1 - 0.18 * m);
    if (a > 0.95) z *= (1 - a) / 0.05 * 0.8 + 0.2 * 0;
    if (f.bohi && t > hiFrom && t < hiTo && a > 0.8 && a < 0.94) {
      const fade = Math.min(1, (t - hiFrom) / 0.02, (hiTo - t) / 0.03);
      z -= th * 0.42 * Math.sin(Math.PI * (a - 0.8) / 0.14) * fade;       // the groove, round-bottomed
    }
    return Math.max(0, z);
  };
  const widthAt = (t: number) => d.motohaba + (d.sakihaba - d.motohaba) * Math.min(1, t / yokote);
  const bladePoint = (a: number, t: number, side: 1 | -1): Vec3 => {
    const w = widthAt(t);
    let x = w / 2 - a * w; // edge at +w/2
    let z = side * halfThick(a, t);
    if (t > yokote) {
      // the kissaki: the edge sweeps up to the point in the fukura's arc; the point stands a third of the way from the back
      const k = (t - yokote) / (1 - yokote), s = Math.sqrt(Math.max(0, 1 - k * k));
      const tipX = w / 2 - 0.72 * w;
      x = tipX + (x - tipX) * (a < 0.72 ? s : Math.sqrt(Math.max(0, 1 - k ** 2.4)));
      z *= Math.max(0.15, s);
    }
    return [x + curve(t), yb + t * d.nagasa, z];
  };
  for (const side of [1, -1] as const) {
    grid(M(blade, 'blade'), A.length - 1, NV, (i, j) => {
      const t = j / NV, a = A[i];
      return { p: bladePoint(a, t, side), uv: [(side > 0 ? 0 : 0.5) + a * 0.5, t] };
    }, bone, side < 0);
  }

  // ---- habaki, seppa, tsuba ------------------------------------------------------------------------------------------
  const sect = (w: number, th: number) => ({ rx: w / 2, rz: th / 2 });
  const hb = sect(d.motohaba + 0.004, d.kasane + 0.0045);
  ovalTube(M(blade, 'fittings'), (t) => [0, 0.0025 + t * 0.031, 0], (t) => hb.rx * (1 - 0.06 * t), (t) => hb.rz * (1 - 0.25 * t), 4, 16, bone, [true, true], 0.031);
  const seppa = (y: number) => disc(M(hilt, 'seppa'), y, y + 0.0013, 0.0185, 0.0125, 24, bone);
  seppa(0.0012); seppa(-0.0055);
  const tsubaR = d.tsuba / 2;
  disc(M(hilt, 'tsuba'), -0.0042, 0, tsubaR, tsubaR * 0.94, 64, bone);
  // the mimi: a raised rim
  {
    const mb = M(hilt, 'tsuba'), ring = 64, base = mb.count;
    for (let i = 0; i <= ring; i++) for (let k = 0; k <= 8; k++) {
      const a = (i / ring) * Math.PI * 2, b = (k / 8) * Math.PI * 2;
      const r = tsubaR - 0.0016 + Math.cos(b) * 0.0017, y = -0.0021 + Math.sin(b) * 0.0029;
      mb.vert([Math.cos(a) * r, y, Math.sin(a) * r * 0.94], norm([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]), i / ring, k / 8, bone);
    }
    for (let i = 0; i < ring; i++) for (let k = 0; k < 8; k++) { const a = base + i * 9 + k; mb.quad(a, a + 1, a + 10, a + 9); }
  }

  // ---- tsuka ---------------------------------------------------------------------------------------------------------
  const y0 = -0.0055, yEnd = -d.tsuka;
  const fuchiL = 0.013, kashiraL = 0.016;
  const gripRx = (t: number) => 0.0142 - 0.0007 * Math.sin(Math.PI * t), gripRz = (t: number) => 0.0108 - 0.0005 * Math.sin(Math.PI * t);
  ovalTube(M(hilt, 'fittings'), (t) => [0, y0 - t * fuchiL, 0], () => gripRx(0) + 0.0009, () => gripRz(0) + 0.0009, 2, 24, bone, [true, false], fuchiL);
  ovalTube(M(hilt, 'fittings'), (t) => [0, yEnd + kashiraL * (1 - t), 0], (t) => gripRx(1) + 0.0011 - 0.0012 * (1 - t) ** 3, (t) => gripRz(1) + 0.0011 - 0.0012 * (1 - t) ** 3, 6, 24, bone, [true, false], kashiraL);
  const g0 = y0 - fuchiL, g1 = yEnd + kashiraL, gl = g0 - g1;
  // (v in rounds of the grip, so the nodules stay round)
  ovalTube(M(hilt, 'same'), (t) => [0, g0 - t * gl, 0], gripRx, gripRz, 24, 28, bone, [false, false], gl / 0.08);
  // menuki: one on each face, under the wrap, offset as tradition places them (omote toward the tsuba, ura toward the end)
  for (const side of [1, -1]) {
    const yc = g0 - gl * (side > 0 ? 0.42 : 0.58), mb = M(hilt, 'fittings'), base = mb.count;
    for (let j = 0; j <= 6; j++) for (let i = 0; i <= 10; i++) {
      const u = (i / 10) * Math.PI * 2, v = (j / 6) * Math.PI / 2;
      const x = Math.cos(u) * Math.cos(v) * 0.0055, y = Math.sin(u) * Math.cos(v) * 0.016, z = Math.sin(v) * 0.0024;
      mb.vert([x, yc + y, side * (gripRz(0.5) + z)], norm([Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v) * 0.35, side * Math.sin(v)]), i / 10, j / 6, bone);
    }
    for (let j = 0; j < 6; j++) for (let i = 0; i < 10; i++) { const a = base + j * 11 + i; if (side > 0) mb.quad(a, a + 1, a + 12, a + 11); else mb.quad(a, a + 11, a + 12, a + 1); }
  }
  // the wrap: two flat braids wound opposite ways. They cross in the middle of each flat face (the X a tsuka shows),
  // pass round the edge and the back apart, and leave a diamond of ray skin on the face between one crossing and the
  // next; crossings alternate faces, so each face shows crossing, diamond, crossing… (7–9 diamonds a side on a katana)
  {
    const diamonds = Math.max(8, Math.round(gl / 0.0125)); // half-turns: one crossing to the next, alternate faces
    const pitch = gl / diamonds;
    const bw = pitch * 0.82;               // the braid's width along the grip
    for (const hand of [1, -1]) {
      const mb = M(hilt, 'ito'), N = diamonds * 24;
      const base = mb.count;
      for (let s = 0; s <= N; s++) {
        const q = s / N, y = g0 - q * gl;
        const th = Math.PI / 2 + hand * Math.PI * (q * diamonds); // half a turn per crossing: crossings at ±π/2, the faces
        const over = (Math.floor(q * diamonds * 2 + (hand > 0 ? 0 : 1)) % 2) ? 0.0016 : 0.0009;
        const t = q;
        const rx = gripRx(t) + over, rz = gripRz(t) + over;
        const p: Vec3 = [Math.cos(th) * rx, y, Math.sin(th) * rz];
        const n: Vec3 = norm([Math.cos(th) / rx, 0, Math.sin(th) / rz]);
        for (const e of [-1, 1]) mb.vert(add(p, [0, e * bw / 2, 0]), n, e < 0 ? 0 : 1, q * diamonds * 2, bone);
      }
      for (let s = 0; s < N; s++) { const a = base + s * 2; mb.quad(a, a + 2, a + 3, a + 1); mb.quad(a, a + 1, a + 3, a + 2); }
    }
  }
  // mekugi: the peg's head on the omote face, near the fuchi
  ovalTube(M(hilt, 'horn'), (t) => [0.002, g0 - 0.03, gripRz(0.12) + 0.0017 * t], () => 0.0028, () => 0.0028, 1, 12, bone);

  // ---- saya ----------------------------------------------------------------------------------------------------------
  // on the blade's own curve, a hair longer than the blade; oval round the blade with the wood's thickness
  const L = d.saya;
  const sCurve = bow(d.sori * (L / d.nagasa));
  const sp = (t: number): Vec3 => [sCurve(t), -t * L, 0];
  const sRx = (t: number) => (d.motohaba + (d.sakihaba - d.motohaba) * t) / 2 + 0.0058, sRz = (t: number) => (d.kasane * (1 - 0.3 * t)) / 2 + 0.0062;
  // path along the curve: ovalTube moves only in y, so the curve is applied per ring
  {
    const mb = M(saya, 'saya'), nv = 48, sides = 20;
    grid(mb, sides, nv, (i, j) => { const t = j / nv, a = (i / sides) * Math.PI * 2, c = sp(t); return { p: [c[0] + Math.cos(a) * sRx(t), c[1], c[2] + Math.sin(a) * sRz(t)], uv: [i / sides, t * L] }; }, bone);
  }
  // koiguchi (horn mouth), kojiri (horn end, closed)
  ovalTube(M(saya, 'horn'), (t) => [0, 0.002 - t * 0.026, 0], () => sRx(0) + 0.0008, () => sRz(0) + 0.0008, 2, 20, bone, [true, false], 0.026);
  const kj = sp(1);
  ovalTube(M(saya, 'horn'), (t) => [kj[0], kj[1] + 0.022 * (1 - t), 0], (t) => sRx(1) + 0.0007 - 0.003 * t ** 4, (t) => sRz(1) + 0.0007 - 0.003 * t ** 4, 5, 20, bone, [false, true], 0.022);
  // kurikata: the knob on the omote face (+z) a hand below the mouth, the cord's loop through it
  const ky = -0.105, kc = sp(-ky / L);
  const kurikata: Vec3 = [kc[0], ky, sRz(-ky / L) + 0.006];
  {
    const mb = M(saya, 'horn'), base = mb.count, n = 12;
    for (let j = 0; j <= 6; j++) for (let i = 0; i <= n; i++) {
      const u = (i / n) * Math.PI * 2, v = j / 6;
      const r = 0.0065 * (1 - 0.35 * v), y = ky + Math.sin(u) * r * 1.4, x = kc[0] + Math.cos(u) * r;
      mb.vert([x, y, sRz(-ky / L) - 0.001 + v * 0.0085], norm([Math.cos(u), Math.sin(u), 0.6]), i / n, v, bone);
    }
    for (let j = 0; j < 6; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i; mb.quad(a, a + n + 1, a + n + 2, a + 1); }
  }
  // the sageo: through the kurikata, two flat wraps round the saya below it, the knot; the ends are left to the rig
  const wrapAt = [ky - 0.03, ky - 0.055];
  for (const yw of wrapAt) {
    const t = -yw / L, c = sp(t);
    ovalTube(M(saya, 'sageo'), (q) => [c[0], yw + 0.006 - q * 0.012, 0], () => sRx(t) + 0.0016, () => sRz(t) + 0.0016, 1, 24, bone, [false, false], 0.012);
  }
  const knot: Vec3 = [sp(-(ky - 0.045) / L)[0], ky - 0.045, sRz(-(ky - 0.045) / L) + 0.006];
  ovalTube(M(saya, 'sageo'), (q) => [knot[0], knot[1] + 0.009 - q * 0.018, knot[2] - 0.002], (q) => 0.0075 * Math.sin(Math.PI * (0.1 + 0.8 * q)), (q) => 0.0055 * Math.sin(Math.PI * (0.1 + 0.8 * q)), 6, 12, bone, [true, true], 0.02);
  const sageoEnds: Vec3[] = [[knot[0] - 0.004, knot[1] - 0.006, knot[2]], [knot[0] + 0.004, knot[1] - 0.008, knot[2]]];

  return {
    blade, hilt, saya,
    base: [curve(0.05), yb + 0.04, 0], tip: [curve(1) + widthAt(1) / 2 - 0.72 * widthAt(1), yb + d.nagasa, 0],
    kurikata, sageoEnds, kojiri: kj,
  };
}

/** The hilt as it stands out of the saya's mouth when sheathed (saya space): the habaki seated in the koiguchi, so the
 * tsuba sits just above the mouth and the grip runs up out of it. Socket space turned half round the x axis. */
export function hiltInSaya(k: Koshirae): Map<string, MeshBuilder> {
  const out = new Map<string, MeshBuilder>();
  for (const [m, mb] of k.hilt) {
    const c = new MeshBuilder(); c.append(mb);
    for (let i = 0; i < c.count; i++) { c.pos[i * 3 + 1] = -c.pos[i * 3 + 1] + 0.0045; c.nor[i * 3 + 1] *= -1; c.pos[i * 3 + 2] *= -1; c.nor[i * 3 + 2] *= -1; }
    out.set(m, c);
  }
  return out;
}

/** Meshes merged by material (blade + hilt = the drawn sword; saya + hiltInSaya = the sword sheathed). */
export function merged(...maps: Map<string, MeshBuilder>[]): Map<string, MeshBuilder> {
  const out = new Map<string, MeshBuilder>();
  for (const m of maps) for (const [k, mb] of m) { let b = out.get(k); if (!b) { b = new MeshBuilder(); out.set(k, b); } b.append(mb); }
  return out;
}

/** Mirrored across z (the omote face to the other side), winding kept outward. */
export function mirroredZ(map: Map<string, MeshBuilder>): Map<string, MeshBuilder> {
  const out = new Map<string, MeshBuilder>();
  for (const [m, mb] of map) {
    const c = new MeshBuilder(); c.append(mb);
    for (let i = 0; i < c.count; i++) { c.pos[i * 3 + 2] *= -1; c.nor[i * 3 + 2] *= -1; }
    for (let i = 0; i < c.idx.length; i += 3) { const t = c.idx[i + 1]; c.idx[i + 1] = c.idx[i + 2]; c.idx[i + 2] = t; }
    out.set(m, c);
  }
  return out;
}
