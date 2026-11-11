// Otsu-no-ura (the level map in the reference pack, docs/era-clash-3d-visual-target.md): the coastal castle town
// Chapter I is laid out on. +Z runs inland, up the valley toward the castle.
//
//   the beach landing ─ Fisherman's Harbour (stone quay, piers, moored boats, dock warehouses, nets drying)
//   ─ the Outer Wall and its gatehouse ─ [the Grand Marketplace and the Maze of Alleyways: village.ts]
//   ─ the Samurai District gate ─ walled samurai compounds on the climb ─ the castle approach (stone ramp walls,
//   the main gate) ─ the hilltop, the castle beyond.
//
// Static pieces merge per material (a few draw calls for the whole kit on the iGPU); solid ones collide.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collide } from './core/collision';
import { rng } from './core/kit';
import { boxGeo, gableGeo, type Avoid, type Village } from './village';
import { uvMaterial } from './core/materials';

export interface OtsuMats { wood: THREE.Material; darkWood: THREE.Material; plaster: THREE.Material; tile: THREE.Material; stone: THREE.Material; quay: THREE.Material }
export interface Otsu {
  group: THREE.Group;
  footprints: THREE.Box3[];
  /** Pines and blossom trees for the samurai yards (chapter1 plants them). */
  yardTrees: { x: number; z: number; h: number; blossom: boolean }[];
  /** Where the houses must keep clear (the wall's line, the gates). */
  avoid: Avoid[];
}

/** The Outer Wall's line, the market square, the Samurai District gate and the main gate (z). */
export const OTSU = { wallZ: -36, plaza: { z: -16, r: 12 }, samuraiGateZ: 50, otemonZ: 116, townZ1: 44 };

export function buildOtsu(o: { heightAt: (x: number, z: number) => number; roadX: (z: number) => number; mats: OtsuMats; village: Village }): Otsu {
  const { heightAt, roadX, mats, village } = o;
  const R = rng(9071);
  const buckets = new Map<THREE.Material, { solid: THREE.BufferGeometry[]; decor: THREE.BufferGeometry[] }>();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, frame: THREE.Matrix4, l: { x?: number; y?: number; z?: number; ry?: number; rx?: number; rz?: number }, solid = true) => {
    e.set(l.rx ?? 0, l.ry ?? 0, l.rz ?? 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(l.x ?? 0, l.y ?? 0, l.z ?? 0), q, one).premultiply(frame);
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    const pp = c.attributes.position as THREE.BufferAttribute, gr = new Float32Array(pp.count);
    for (let i = 0; i < pp.count; i++) gr[i] = Math.max(0, Math.min(1, 1 - (pp.getY(i) - heightAt(pp.getX(i), pp.getZ(i))) / 1.3));
    c.setAttribute('grime', new THREE.BufferAttribute(gr, 1));
    let b = buckets.get(mat); if (!b) { b = { solid: [], decor: [] }; buckets.set(mat, b); }
    (solid ? b.solid : b.decor).push(c);
  };
  const frame = (x: number, y: number, z: number, yaw = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), one);
  const lowest = (x: number, z: number, r: number) => Math.min(heightAt(x - r, z - r), heightAt(x + r, z + r), heightAt(x - r, z + r), heightAt(x + r, z - r), heightAt(x, z));
  const footprints: THREE.Box3[] = [];
  const foot = (x: number, z: number, sx: number, sz: number) => footprints.push(new THREE.Box3(new THREE.Vector3(x - sx / 2, -50, z - sz / 2), new THREE.Vector3(x + sx / 2, 200, z + sz / 2)));
  const ridgeMat = uvMaterial('grey_roof_tiles', [1.6, 1.6], { tint: 0x5c606a });
  const blackWall = uvMaterial('black_painted_planks', [1.1, 1.1], { tint: 0x6a6460 });
  const hemp = new THREE.MeshStandardNodeMaterial({ color: 0xc9b48c, roughness: 1, side: THREE.DoubleSide });
  const yardTrees: Otsu['yardTrees'] = [];
  const avoid: Avoid[] = [];

  /** A tiled gable roof with fascia, a ridge cap and onigawara at the ends (ridge along local X). */
  const roof = (F: THREE.Matrix4, w: number, d: number, h: number, y: number, over = 0.8, solid = false) => {
    put(gableGeo(w, d, h, over), mats.tile, F, { y }, solid);
    put(boxGeo(w + over * 2 + 0.05, 0.3, 0.42), ridgeMat, F, { y: y + h + 0.06 }, false);
    for (const ex of [-1, 1]) put(boxGeo(0.32, 0.6, 0.48), ridgeMat, F, { x: ex * (w / 2 + over), y: y + h + 0.22 }, false);
    for (const sz of [-1, 1]) put(boxGeo(w + over * 2 + 0.1, 0.16, 0.08), mats.darkWood, F, { y: y - 0.04, z: sz * (d / 2 + over) }, false);
  };

  // ── A wall run (the town's outer wall, the samurai compounds): stone footing, white plaster, a tiled cap.
  //    It follows the ground in short segments; `gaps` are open spans (t along the run, half-width in metres). ──
  const wallRun = (x0: number, z0: number, x1: number, z1: number, opt: { h?: number; base?: number; thick?: number; gaps?: { t: number; hw: number }[] } = {}) => {
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const h = opt.h ?? 2.4, base = opt.base ?? 1.0, th = opt.thick ?? 0.9;
    const n = Math.max(1, Math.ceil(L / 3));
    for (let i = 0; i < n; i++) {
      const ta = i / n, tb = (i + 1) / n;
      const mid = (ta + tb) / 2;
      if (opt.gaps?.some((g) => Math.abs(mid * L - g.t * L) < g.hw + (L / n) / 2 - 0.01)) continue;
      const x = x0 + (x1 - x0) * mid, z = z0 + (z1 - z0) * mid, seg = L / n + 0.04;
      const y = Math.min(heightAt(x0 + (x1 - x0) * ta, z0 + (z1 - z0) * ta), heightAt(x0 + (x1 - x0) * tb, z0 + (z1 - z0) * tb)) - 0.4;
      const F = frame(x, y, z, yaw);
      put(boxGeo(seg, base + 0.4, th + 0.3), mats.stone, F, { y: (base + 0.4) / 2 });
      put(boxGeo(seg, h, th), mats.plaster, F, { y: base + 0.4 + h / 2 });
      put(boxGeo(seg, 0.18, th + 0.04), mats.darkWood, F, { y: base + 0.4 + h - 0.45 }, false);
      const cap = gableGeo(seg, th, 0.42, 0.35); cap.rotateY(0);
      put(cap, mats.tile, F, { y: base + 0.4 + h }, false);
      put(boxGeo(seg + 0.02, 0.16, 0.2), ridgeMat, F, { y: base + 0.4 + h + 0.45 }, false);
    }
    return { L, yaw };
  };

  // ── A gatehouse (yaguramon over the town gate, the ōtemon before the castle): heavy posts and tie beams, a
  //    plaster upper storey with a black-boarded base, a deep tiled roof, the two leaves standing open. ──────
  const gatehouse = (x: number, z: number, yaw: number, w: number, o2: { tall?: number; stoneWings?: boolean } = {}) => {
    const y = lowest(x, z, w / 2 + 1), F = frame(x, y, z, yaw);
    const T = o2.tall ?? 5.2;
    for (const sx of [-1, 1]) {
      put(boxGeo(0.62, T, 0.62), mats.darkWood, F, { x: sx * (w / 2 + 0.3), y: T / 2 });
      put(boxGeo(0.5, T * 0.8, 0.5), mats.darkWood, F, { x: sx * (w / 2 + 0.3), y: T * 0.4, z: -1.9 });
      // the leaves, swung open against the side walls
      put(boxGeo(0.16, T - 1.1, w / 2), mats.darkWood, F, { x: sx * (w / 2 - 0.2), y: (T - 1.1) / 2 + 0.05, z: w / 4 + 0.4 }, true);
      for (let k = 0; k < 3; k++) put(boxGeo(0.2, 0.14, w / 2), blackWall, F, { x: sx * (w / 2 - 0.2), y: 0.8 + k * 1.3, z: w / 4 + 0.4 }, false);
      if (o2.stoneWings) put(boxGeo(5.5, 4.2, 6.5), mats.quay, F, { x: sx * (w / 2 + 3.4), y: 2.1, z: -0.8 });
    }
    put(boxGeo(w + 1.6, 0.5, 0.7), mats.darkWood, F, { y: T - 0.25 });
    put(boxGeo(w + 1.6, 0.4, 0.6), mats.darkWood, F, { y: T - 0.25, z: -1.9 });
    // the upper storey
    put(boxGeo(w + 2.6, 0.9, 3.6), blackWall, F, { y: T + 0.45, z: -0.95 });
    put(boxGeo(w + 2.4, 1.5, 3.4), mats.plaster, F, { y: T + 0.9 + 0.75, z: -0.95 });
    for (let k = -2; k <= 2; k++) put(boxGeo(0.12, 1.5, 0.08), mats.darkWood, F, { x: k * (w + 2.4) / 5, y: T + 1.65, z: 0.78 }, false);
    put(boxGeo(1.4, 0.5, 0.06), blackWall, F, { x: -w / 4, y: T + 1.7, z: 0.79 }, false);
    put(boxGeo(1.4, 0.5, 0.06), blackWall, F, { x: w / 4, y: T + 1.7, z: 0.79 }, false);
    roof(F, w + 2.4, 3.4, 1.7, T + 2.4, 1.0);
    put(boxGeo(w + 2.4, 0.2, 1.6), mats.tile, F, { y: T + 0.25, z: 1.25, rx: 0.32 }, false);   // the pent roof over the opening
    foot(x, z, w + (o2.stoneWings ? 14 : 3), 6);
    avoid.push({ x, z, r: w / 2 + (o2.stoneWings ? 8 : 3) });
  };

  // ═══ The harbour (west of the landing): stone quay, three piers, boats at their moorings, dock warehouses ═══
  const QUAY = { x0: -47, x1: -13, z0: -71, z1: -62, top: 1.45 };
  {
    const cx = (QUAY.x0 + QUAY.x1) / 2, cz = (QUAY.z0 + QUAY.z1) / 2, w = QUAY.x1 - QUAY.x0, d = QUAY.z1 - QUAY.z0;
    const F = frame(cx, 0, cz);
    put(boxGeo(w, QUAY.top + 3, d), mats.quay, F, { y: (QUAY.top - 3) / 2 });
    // mooring posts along the edge
    for (let x = QUAY.x0 + 2; x < QUAY.x1; x += 4.5) put(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), mats.darkWood, frame(x, QUAY.top, QUAY.z0 + 0.4), { y: 0.35 }, false);
    foot(cx, cz, w, d);
  }
  const boat = (x: number, z: number, yaw: number, big: boolean) => {
    const F = frame(x, -0.35, z, yaw), L = big ? 11 : 6.5, B = big ? 1.5 : 0.9;
    const hull = new THREE.CylinderGeometry(B, B * 0.6, L, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateZ(Math.PI);
    put(hull, mats.darkWood, F, { y: B * 0.85 }, false);
    put(boxGeo(B * 1.9, 0.08, L * 0.9), mats.wood, F, { y: B * 0.8 }, false);
    if (big) {
      put(boxGeo(0.22, 7, 0.22), mats.darkWood, F, { y: 4.4 }, false);
      put(new THREE.PlaneGeometry(3.8, 4.4), hemp, F, { y: 5.0, z: 0.25, ry: Math.PI / 2 }, false);
      for (let k = 0; k < 6; k++) put(boxGeo(3.9, 0.06, 0.06), mats.darkWood, F, { y: 3.0 + k * 0.82, z: 0.26, ry: Math.PI / 2 }, false);
    }
  };
  for (const [px, len] of [[-41, 26], [-30, 22], [-19, 18]] as const) {
    const z0 = QUAY.z0, z1 = QUAY.z0 - len, y = 1.15;
    const n = Math.ceil(len / 1.2);
    for (let k = 0; k < n; k++) put(boxGeo(2.8, 0.12, 1.12), mats.wood, frame(px + (R() - 0.5) * 0.04, y, z0 - 0.6 - k * 1.2, (R() - 0.5) * 0.02), { y: 0 });
    for (let k = 0; k <= Math.ceil(len / 3); k++) for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.13, 0.15, 4.2, 6), mats.darkWood, frame(px + sx * 1.3, y - 2.0, z0 - k * 3), { y: 0 }, false);
    for (const sx of [-1, 1]) put(boxGeo(0.14, 0.14, len), mats.darkWood, frame(px + sx * 1.42, y + 0.05, (z0 + z1) / 2), { y: 0 }, false);
    boat(px + 3.1, z1 + 6 + R() * 4, 0.04, len > 20);
    boat(px - 3.0, z1 + 9 + R() * 6, -0.05, false);
    foot(px, (z0 + z1) / 2, 3, len);
  }
  // fishing nets drying on racks on the quay, cargo stacked along it (loose: throw it)
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!; g.strokeStyle = 'rgba(70,60,46,1)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 128); g.stroke(); g.beginPath(); g.moveTo(i + 16, 0); g.lineTo(i, 128); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace;
    const net = new THREE.MeshStandardNodeMaterial({ map: t, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 1 });
    for (const x of [-44, -35.5, -25]) {
      const F = frame(x, QUAY.top, QUAY.z1 - 2.2, 0.05);
      for (const sx of [-1, 1]) put(boxGeo(0.12, 2.6, 0.12), mats.darkWood, F, { x: sx * 2.2, y: 1.3 }, false);
      put(boxGeo(4.6, 0.1, 0.1), mats.darkWood, F, { y: 2.55 }, false);
      put(new THREE.PlaneGeometry(4.2, 2.1), net, F, { y: 1.45 }, false);
    }
    for (let k = 0; k < 16; k++) {
      const x = QUAY.x0 + 3 + R() * (QUAY.x1 - QUAY.x0 - 6), z = QUAY.z0 + 1.6 + R() * 2.4;
      village.addProp(R() < 0.55 ? 'crate' : R() < 0.6 ? 'barrel' : 'jar', x, z, undefined, QUAY.top);
    }
  }
  // the dock warehouses (kura) behind the quay: white plaster over a black-boarded base, heavy tiled roofs
  for (const [x, w] of [[-42, 8], [-31.5, 9], [-21, 8]] as const) {
    const z = -56.5, d = 7, y = lowest(x, z, 4.5) - 0.2, F = frame(x, y, z, 0);
    put(boxGeo(w + 0.3, 0.7, d + 0.3), mats.stone, F, { y: 0.35 });
    put(boxGeo(w, 1.6, d), blackWall, F, { y: 0.7 + 0.8 });
    put(boxGeo(w - 0.05, 2.9, d - 0.05), mats.plaster, F, { y: 0.7 + 1.6 + 1.45 });
    put(boxGeo(2.2, 2.6, 0.2), mats.darkWood, F, { y: 0.7 + 1.3, z: -d / 2 - 0.05 }, false);
    put(boxGeo(1.0, 0.7, 0.12), blackWall, F, { y: 4.1, z: -d / 2 - 0.03 }, false);
    roof(F, w, d, 1.9, 5.2, 0.7, true);
    put(boxGeo(3.2, 0.12, 1.3), mats.tile, F, { y: 3.1, z: -d / 2 - 0.55, rx: -0.3 }, false);
    foot(x, z, w + 1, d + 1);
  }

  // ═══ The Outer Wall across the valley, with the gatehouse on the road ═══
  {
    const z = OTSU.wallZ, gx = roadX(z), gw = 6.2;
    for (const [xa, xb] of [[-60, gx - gw / 2 - 0.6], [gx + gw / 2 + 0.6, 60]] as const) wallRun(xa, z, xb, z, { h: 2.8, base: 1.6, thick: 1.1 });
    gatehouse(gx, z, 0, gw);
    for (let x = -58; x < 58; x += 3) if (Math.abs(x - gx) > gw / 2 + 1) avoid.push({ x, z, r: 1.4 });
    foot(0, z, 120, 2.6);
  }

  // ═══ The Samurai District: its gate, then walled compounds either side of the climb ═══
  {
    const z = OTSU.samuraiGateZ, gx = roadX(z), w = 5.2;
    const y = lowest(gx, z, 3.2), F = frame(gx, y, z, 0);
    for (const sx of [-1, 1]) put(boxGeo(0.5, 4.6, 0.5), mats.darkWood, F, { x: sx * (w / 2 + 0.25), y: 2.3 });
    put(boxGeo(w + 1.8, 0.42, 0.5), mats.darkWood, F, { y: 4.2 });
    put(boxGeo(w + 1.2, 0.3, 0.42), mats.darkWood, F, { y: 3.5 });
    roof(F, w + 1.2, 1.5, 0.75, 4.42, 0.55);
    // short walls off the gate to the hillsides
    wallRun(gx - w / 2 - 0.5, z, -46, z + 1.5, { h: 2.2, base: 0.8 });
    wallRun(gx + w / 2 + 0.5, z, 46, z - 1.5, { h: 2.2, base: 0.8 });
    avoid.push({ x: gx, z, r: 5 });
  }
  const compound = (cx: number, cz: number, W: number, D: number, roadSide: 1 | -1) => {
    // walls; the gate (a small roofed kabukimon) on the road side
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const gateX = roadSide > 0 ? x1 : x0;
    wallRun(x0, z0, x1, z0, { h: 2.1, base: 0.9 });
    wallRun(x0, z1, x1, z1, { h: 2.1, base: 0.9 });
    wallRun(roadSide > 0 ? x0 : x1, z0, roadSide > 0 ? x0 : x1, z1, { h: 2.1, base: 0.9 });
    wallRun(gateX, z0, gateX, z1, { h: 2.1, base: 0.9, gaps: [{ t: 0.5, hw: 1.7 }] });
    const gy = lowest(gateX, cz, 2), GF = frame(gateX, gy, cz, Math.PI / 2);
    for (const sx of [-1, 1]) put(boxGeo(0.34, 3.6, 0.34), mats.darkWood, GF, { x: sx * 1.8, y: 1.8 });
    put(boxGeo(4.4, 0.3, 0.4), mats.darkWood, GF, { y: 3.4 });
    roof(GF, 4.2, 1.6, 0.6, 3.6, 0.45);
    // the main house, raised on a stone terrace: dark timber, white plaster above a veranda, a big tiled roof
    const hw = W * 0.55, hd = D * 0.42, hx = cx - roadSide * W * 0.1, hz = cz + D * 0.12;
    const ylo = lowest(hx, hz, Math.max(hw, hd) / 2 + 1), yhi = Math.max(heightAt(hx - hw / 2, hz - hd / 2), heightAt(hx + hw / 2, hz + hd / 2), heightAt(hx - hw / 2, hz + hd / 2), heightAt(hx + hw / 2, hz - hd / 2)) + 0.5;
    const HF = frame(hx, ylo, hz, 0), lift = yhi - ylo;
    put(boxGeo(hw + 2, lift, hd + 2), mats.quay, HF, { y: lift / 2 });
    put(boxGeo(hw + 1.2, 0.18, hd + 1.2), mats.wood, HF, { y: lift + 0.5 }, true);   // the engawa
    put(boxGeo(hw, 1.5, hd), mats.darkWood, HF, { y: lift + 0.6 + 0.75 });
    put(boxGeo(hw - 0.05, 1.3, hd - 0.05), mats.plaster, HF, { y: lift + 2.1 + 0.65 });
    for (let k = -3; k <= 3; k++) for (const sz of [-1, 1]) put(boxGeo(0.16, 2.8, 0.16), mats.darkWood, HF, { x: k * hw / 6.5, y: lift + 0.6 + 1.4, z: sz * (hd / 2 + 0.5) }, false);
    roof(HF, hw, hd, 2.6, lift + 3.4, 1.4, true);
    foot(cx, cz, W + 1, D + 1);
    yardTrees.push({ x: cx + roadSide * W * 0.3, z: cz - D * 0.33, h: 6 + R() * 2, blossom: R() < 0.5 });
    yardTrees.push({ x: cx - roadSide * W * 0.32, z: cz - D * 0.36, h: 5 + R() * 2, blossom: false });
    avoid.push({ x: cx, z: cz, r: Math.max(W, D) / 2 + 1 });
  };
  for (const [zc, side] of [[66, -1], [70, 1], [91, -1], [95, 1]] as const) {
    const W = 15 + R() * 3, D = 18 + R() * 3, gap = 6.2;
    const cx = roadX(zc) + side * (gap + W / 2);
    compound(cx, zc, W, D, (side > 0 ? -1 : 1) as 1 | -1);
  }

  // ═══ The castle approach: battered stone walls along the ramp, then the main gate (ōtemon) ═══
  {
    for (const side of [-1, 1]) {
      for (let z = 100; z < OTSU.otemonZ - 3; z += 3) {
        const x = roadX(z + 1.5) + side * 5.6, y = Math.min(heightAt(x, z), heightAt(x, z + 3)) - 0.5;
        const F = frame(x, y, z + 1.5, 0);
        put(boxGeo(2.4, 3.6, 3.05), mats.quay, F, { y: 1.8, rz: side * 0.12 });
        put(boxGeo(1.0, 1.4, 3.05), mats.plaster, F, { x: -side * 0.2, y: 4.0 });
        put(gableGeo(3.05, 1.0, 0.36, 0.3).rotateY(Math.PI / 2), mats.tile, F, { x: -side * 0.2, y: 4.7 }, false);
      }
      foot(roadX(108) + side * 5.6, 108, 3, 18);
    }
    gatehouse(roadX(OTSU.otemonZ), OTSU.otemonZ, 0, 6.4, { tall: 5.8, stoneWings: true });
  }

  // ── Merge ──────────────────────────────────────────────────────────────────────────────────────────
  const group = new THREE.Group(); group.name = 'otsu';
  for (const [mat, b] of buckets) for (const solid of [true, false]) {
    const list = solid ? b.solid : b.decor; if (!list.length) continue;
    const g = mergeGeometries(list, false); if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(solid ? collide(mesh) : mesh);
  }
  return { group, footprints, yardTrees, avoid };
}
