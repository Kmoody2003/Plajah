/**
 * clothSim.ts — garments as simulated cloth (docs/character-forge.md §6).
 *
 * Each garment the Forge marks as cloth (a hakama leg, a kosode sleeve) carries a coarse particle grid sampled from the
 * same surface its mesh was built on. Every frame:
 *
 * 1. Anchors: each particle is skinned on the CPU with the garment's own bone weights, which says where the body's pose
 *    puts it. Particles where the garment is tied or sewn (pin = 1) are held there.
 * 2. Solve (XPBD, small steps: several substeps of one iteration each): gravity, damping, a gentle pull back toward the
 *    anchor (the cut of the cloth), stretch, shear and bend distance constraints, collision against the body's
 *    capsules, and a max-distance tether to the anchor so no animation (a sprint, a spin) can tear the cloth away.
 * 3. Render: the garment's mesh follows the grid triangle by triangle (barycentric position plus its offset along the
 *    surface normal, so pleats and folds modelled into it survive), its normals turned with each triangle. It is drawn
 *    as a plain mesh written from the CPU; the skinned original is hidden.
 *
 * Simulated in world space with a fraction of the character's own travel carried through (like the spring bones), so
 * root motion reads as wind on the cloth, not as being dragged. Budget: the Arc iGPU machine's CPU, a cast under 1 ms.
 */
import * as THREE from 'three/webgpu';
import type { CapsuleSpec } from './springBones';

export interface ClothSimSpec {
  name: string;
  material: string;
  cols: number;
  rows: number;
  wrapU: boolean;
  points: number[];
  pin: number[];
  maxDist: number[];
  drive: number;
  stretch: number;
  bend: number;
  damping: number;
  radius: number;
}

interface Capsule { bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; r: number; wa: THREE.Vector3; wb: THREE.Vector3 }
interface Bound {
  src: THREE.SkinnedMesh; mesh: THREE.Mesh;
  tri: Int32Array; bary: Float32Array; d: Float32Array; nLocal: Float32Array;
  pos: THREE.BufferAttribute; nor: THREE.BufferAttribute;
}

const MAX_SUBSTEPS = 4, SUBSTEP = 1 / 120;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3();

export class ClothSim {
  /** World-space wind (m/s), e.g. from the weather. */
  wind = new THREE.Vector3();
  /** How much of the character's own travel the cloth feels (0..1); see SpringBones.rootInertia. */
  rootInertia = 0.3;
  lastMs = 0;
  readonly particles: number;
  readonly bound: Bound[] = [];

  private x: Float32Array; private prev: Float32Array; private anchor: Float32Array; private anchorPrev: Float32Array;
  private bind: Float32Array; private w: Float32Array; private maxD: Float32Array; private drive: Float32Array;
  private damp: Float32Array; private rad: Float32Array; private pn: Float32Array;
  private cons: Uint32Array; private rest: Float32Array; private comp: Float32Array;
  private tris: Uint32Array; private frame0: Float32Array; private frame: Float32Array;
  /** Per particle: which source mesh skins it, which of its vertices lends the weights, and the bind-space point. */
  private skinSrc: Int32Array; private skinVert: Int32Array; private skinPt: Float32Array;
  private srcs: THREE.SkinnedMesh[] = [];
  private boneM: THREE.Matrix4[][] = [];
  private capsules: Capsule[] = [];
  /** Per particle, the capsules that can reach it (CSR: capStart[q]..capStart[q + 1] into capList). */
  private capStart = new Int32Array(1); private capList = new Int32Array(0);
  private keep: Float32Array; private pull: Float32Array; private lastH = 0;
  private tf: THREE.Matrix4[] = []; private scaleV = new THREE.Vector3();
  private pieceOf: Int32Array;
  private root: THREE.Object3D;
  private lastRoot = new THREE.Vector3();
  private ready = false;
  private gravity = -9.8;

  constructor(root: THREE.Object3D, specs: ClothSimSpec[], capsules: CapsuleSpec[]) {
    this.root = root;
    root.updateMatrixWorld(true);
    // the garment meshes, by material
    const byMat = new Map<string, THREE.SkinnedMesh[]>();
    root.traverse((o) => {
      const s = o as THREE.SkinnedMesh;
      if (!s.isSkinnedMesh) return;
      const name = (s.material as THREE.Material).name;
      if (!specs.some((c) => c.material === name)) return;
      (byMat.get(name) ?? byMat.set(name, []).get(name)!).push(s);
    });
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o); });

    // ---- particles, constraints, triangles ----
    const n = specs.reduce((t, s) => t + s.cols * s.rows, 0);
    this.particles = n;
    const A = () => new Float32Array(n * 3);
    this.x = A(); this.prev = A(); this.anchor = A(); this.anchorPrev = A(); this.bind = A(); this.pn = A(); this.skinPt = A();
    this.w = new Float32Array(n); this.maxD = new Float32Array(n); this.drive = new Float32Array(n);
    this.damp = new Float32Array(n); this.rad = new Float32Array(n); this.pieceOf = new Int32Array(n);
    this.keep = new Float32Array(n); this.pull = new Float32Array(n);
    this.skinSrc = new Int32Array(n).fill(-1); this.skinVert = new Int32Array(n);
    const cons: number[] = [], rest: number[] = [], comp: number[] = [], tris: number[] = [], triMat: string[] = [];
    let base = 0;
    specs.forEach((s, p) => {
      const id = (i: number, j: number) => base + j * s.cols + (s.wrapU ? ((i % s.cols) + s.cols) % s.cols : i);
      const inU = (i: number) => s.wrapU || i < s.cols;
      for (let k = 0; k < s.cols * s.rows; k++) {
        const q = base + k;
        for (let c = 0; c < 3; c++) this.bind[q * 3 + c] = s.points[k * 3 + c];
        this.w[q] = s.pin[k] >= 0.999 ? 0 : 1;
        this.maxD[q] = s.maxDist[k]; this.drive[q] = s.drive; this.damp[q] = s.damping; this.rad[q] = s.radius;
        this.pieceOf[q] = p;
      }
      const link = (a: number, b: number, c: number) => {
        if (this.w[a] === 0 && this.w[b] === 0) return;
        cons.push(a, b); comp.push(c);
        rest.push(Math.hypot(this.bind[a * 3] - this.bind[b * 3], this.bind[a * 3 + 1] - this.bind[b * 3 + 1], this.bind[a * 3 + 2] - this.bind[b * 3 + 2]));
      };
      for (let j = 0; j < s.rows; j++) for (let i = 0; i < s.cols; i++) {
        // stretch along both directions, shear across each cell, bend over two cells
        if (inU(i + 1)) link(id(i, j), id(i + 1, j), s.stretch);
        if (j + 1 < s.rows) link(id(i, j), id(i, j + 1), s.stretch);
        if (inU(i + 1) && j + 1 < s.rows) {
          link(id(i, j), id(i + 1, j + 1), s.stretch * 4); link(id(i + 1, j), id(i, j + 1), s.stretch * 4);
          tris.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
          triMat.push(s.material, s.material);
        }
        if (inU(i + 2)) link(id(i, j), id(i + 2, j), s.bend);
        if (j + 2 < s.rows) link(id(i, j), id(i, j + 2), s.bend);
      }
      base += s.cols * s.rows;
    });
    this.cons = new Uint32Array(cons); this.rest = new Float32Array(rest); this.comp = new Float32Array(comp);
    this.tris = new Uint32Array(tris);
    this.frame0 = new Float32Array((tris.length / 3) * 9); this.frame = new Float32Array(this.frame0.length);
    this.triFrames(this.bind, this.frame0);
    this.particleNormals(this.bind, this.pn);
    const bindNormals = this.pn.slice();

    // ---- anchors: each particle skinned with the weights of the garment vertex nearest it ----
    specs.forEach((s, p) => {
      const meshes = byMat.get(s.material) ?? [];
      for (let q = 0; q < n; q++) {
        if (this.pieceOf[q] !== p) continue;
        let best = Infinity;
        meshes.forEach((m) => {
          const pos = m.geometry.attributes.position;
          for (let v = 0; v < pos.count; v++) {
            const d = (pos.getX(v) - this.bind[q * 3]) ** 2 + (pos.getY(v) - this.bind[q * 3 + 1]) ** 2 + (pos.getZ(v) - this.bind[q * 3 + 2]) ** 2;
            if (d < best) { best = d; this.skinSrc[q] = this.srcIndex(m); this.skinVert[q] = v; }
          }
        });
        if (this.skinSrc[q] < 0) continue;
        _v.set(this.bind[q * 3], this.bind[q * 3 + 1], this.bind[q * 3 + 2]).applyMatrix4(this.srcs[this.skinSrc[q]].bindMatrix);
        this.skinPt[q * 3] = _v.x; this.skinPt[q * 3 + 1] = _v.y; this.skinPt[q * 3 + 2] = _v.z;
      }
    });

    // ---- the garment meshes bound to the grid, triangle by triangle ----
    for (const [mat, meshes] of byMat) {
      const myTris: number[] = [];
      for (let t = 0; t < triMat.length; t++) if (triMat[t] === mat) myTris.push(t);
      for (const src of meshes) this.bindMesh(src, myTris, bindNormals);
    }

    for (const c of capsules) {
      const bone = bones.get(c.bone);
      if (bone) this.capsules.push({ bone, a: new THREE.Vector3(...c.a), b: new THREE.Vector3(...c.b), r: c.r, wa: new THREE.Vector3(), wb: new THREE.Vector3() });
    }
  }

  private srcIndex(m: THREE.SkinnedMesh) {
    let i = this.srcs.indexOf(m);
    if (i < 0) { i = this.srcs.push(m) - 1; this.boneM.push(m.skeleton.bones.map(() => new THREE.Matrix4())); this.tf.push(new THREE.Matrix4()); }
    return i;
  }

  /** Bind a garment mesh: each vertex to its nearest grid triangle (closest point, barycentric) and its normal offset. */
  private bindMesh(src: THREE.SkinnedMesh, myTris: number[], pn: Float32Array) {
    const g = src.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    const nv = pos.count;
    const tri = new Int32Array(nv), bary = new Float32Array(nv * 3), d = new Float32Array(nv), nLocal = new Float32Array(nv * 3);
    const P = this.bind;
    let far = 0;
    for (let v = 0; v < nv; v++) {
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      let best = Infinity;
      for (const t of myTris) {
        const i0 = this.tris[t * 3], i1 = this.tris[t * 3 + 1], i2 = this.tris[t * 3 + 2];
        const r = closestOnTri(px, py, pz, P, i0, i1, i2);
        if (r.d2 < best) { best = r.d2; tri[v] = t; bary[v * 3] = r.u; bary[v * 3 + 1] = r.v; bary[v * 3 + 2] = r.w; }
      }
      if (best > 0.045 * 0.045) far++;
      const t = tri[v], b0 = bary[v * 3], b1 = bary[v * 3 + 1], b2 = bary[v * 3 + 2];
      const i0 = this.tris[t * 3], i1 = this.tris[t * 3 + 1], i2 = this.tris[t * 3 + 2];
      let qx = 0, qy = 0, qz = 0, nx = 0, ny = 0, nz = 0;
      for (const [i, b] of [[i0, b0], [i1, b1], [i2, b2]] as const) { qx += P[i * 3] * b; qy += P[i * 3 + 1] * b; qz += P[i * 3 + 2] * b; nx += pn[i * 3] * b; ny += pn[i * 3 + 1] * b; nz += pn[i * 3 + 2] * b; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      d[v] = ((px - qx) * nx + (py - qy) * ny + (pz - qz) * nz) / nl;
      // the vertex normal in its triangle's rest frame
      const f = this.frame0, o = t * 9, mx = nor.getX(v), my = nor.getY(v), mz = nor.getZ(v);
      nLocal[v * 3] = f[o] * mx + f[o + 1] * my + f[o + 2] * mz;
      nLocal[v * 3 + 1] = f[o + 3] * mx + f[o + 4] * my + f[o + 5] * mz;
      nLocal[v * 3 + 2] = f[o + 6] * mx + f[o + 7] * my + f[o + 8] * mz;
    }
    // only a garment the grid really covers is taken over (the body-cut kosode, say, stays skinned)
    if (far > nv * 0.1) return;
    const geo = new THREE.BufferGeometry();
    const posA = new THREE.BufferAttribute(new Float32Array(pos.array as ArrayLike<number>), 3).setUsage(THREE.DynamicDrawUsage);
    const norA = new THREE.BufferAttribute(new Float32Array(nor.array as ArrayLike<number>), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posA); geo.setAttribute('normal', norA);
    if (g.attributes.uv) geo.setAttribute('uv', g.attributes.uv);
    if (g.attributes.uv1) geo.setAttribute('uv1', g.attributes.uv1); // the painted atlas (forgeFidelity --paint)
    if (g.attributes.tangent) geo.setAttribute('tangent', g.attributes.tangent);
    geo.setIndex(g.index);
    const mesh = new THREE.Mesh(geo, src.material);
    mesh.name = `${src.name}_cloth`;
    mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    src.parent!.add(mesh);
    src.visible = false;
    this.bound.push({ src, mesh, tri, bary, d, nLocal, pos: posA, nor: norA });
  }

  /** Where the body's pose puts every particle now (world space). */
  private computeAnchors(out: Float32Array) {
    const stamp = this.boneM;
    this.srcs.forEach((m, si) => {
      const sk = m.skeleton;
      for (let b = 0; b < sk.bones.length; b++) stamp[si][b].multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
    });
    const tf = this.tf;
    this.srcs.forEach((m, si) => tf[si].multiplyMatrices(m.matrixWorld, m.bindMatrixInverse));
    for (let q = 0; q < this.particles; q++) {
      const si = this.skinSrc[q];
      if (si < 0) { out[q * 3] = this.bind[q * 3]; out[q * 3 + 1] = this.bind[q * 3 + 1]; out[q * 3 + 2] = this.bind[q * 3 + 2]; continue; }
      const g = this.srcs[si].geometry, si4 = g.attributes.skinIndex, sw4 = g.attributes.skinWeight, v = this.skinVert[q];
      const px = this.skinPt[q * 3], py = this.skinPt[q * 3 + 1], pz = this.skinPt[q * 3 + 2];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const wgt = sw4.getComponent(v, k);
        if (!wgt) continue;
        const e = stamp[si][si4.getComponent(v, k)].elements;
        x += (e[0] * px + e[4] * py + e[8] * pz + e[12]) * wgt;
        y += (e[1] * px + e[5] * py + e[9] * pz + e[13]) * wgt;
        z += (e[2] * px + e[6] * py + e[10] * pz + e[14]) * wgt;
      }
      _v.set(x, y, z).applyMatrix4(tf[si]);
      out[q * 3] = _v.x; out[q * 3 + 1] = _v.y; out[q * 3 + 2] = _v.z;
    }
  }

  /** Snap the cloth to the body's current pose (on load, after a teleport or a cut). Needs world matrices current. */
  reset() {
    this.computeAnchors(this.anchor);
    this.x.set(this.anchor); this.prev.set(this.anchor); this.anchorPrev.set(this.anchor);
    this.root.getWorldPosition(this.lastRoot);
    // each particle tests only the capsules it can reach (its swing, a margin for the limb moving)
    for (const c of this.capsules) { c.wa.copy(c.a).applyMatrix4(c.bone.matrixWorld); c.wb.copy(c.b).applyMatrix4(c.bone.matrixWorld); }
    const start: number[] = [0], list: number[] = [];
    for (let q = 0; q < this.particles; q++) {
      if (this.w[q] !== 0) this.capsules.forEach((cap, ci) => {
        if (segDist(this.x[q * 3], this.x[q * 3 + 1], this.x[q * 3 + 2], cap.wa, cap.wb) < cap.r + this.maxD[q] + this.rad[q] + 0.06) list.push(ci);
      });
      start.push(list.length);
    }
    this.capStart = new Int32Array(start); this.capList = new Int32Array(list);
    this.ready = true;
  }

  /** Call after the skeleton is posed for this frame, with world matrices current. */
  update(dt: number) {
    if (!this.particles) return;
    const t0 = performance.now();
    if (!this.ready) this.reset();
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const scale = this.scaleV.setFromMatrixScale(this.root.matrixWorld).x;
    this.anchorPrev.set(this.anchor);
    this.computeAnchors(this.anchor);
    for (const c of this.capsules) { c.wa.copy(c.a).applyMatrix4(c.bone.matrixWorld); c.wb.copy(c.b).applyMatrix4(c.bone.matrixWorld); }
    // carry most of the root's travel (a teleport carries it all)
    const rp = this.root.getWorldPosition(_v);
    let dx = rp.x - this.lastRoot.x, dy = rp.y - this.lastRoot.y, dz = rp.z - this.lastRoot.z;
    const k = dx * dx + dy * dy + dz * dz > 4 ? 1 : 1 - this.rootInertia;
    dx *= k; dy *= k; dz *= k;
    for (let q = 0; q < this.particles; q++) {
      this.x[q * 3] += dx; this.x[q * 3 + 1] += dy; this.x[q * 3 + 2] += dz;
      this.prev[q * 3] += dx; this.prev[q * 3 + 1] += dy; this.prev[q * 3 + 2] += dz;
    }
    this.lastRoot.copy(rp);

    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP)));
    const h = dt / steps, h2 = h * h;
    const { x, prev, anchor, anchorPrev, w, cons, rest, comp } = this;
    const wx = this.wind.x * h, wy = this.wind.y * h, wz = this.wind.z * h;
    if (h !== this.lastH) {
      for (let q = 0; q < this.particles; q++) { this.keep[q] = Math.exp(-this.damp[q] * h); this.pull[q] = 1 - Math.exp(-this.drive[q] * h); }
      this.lastH = h;
    }
    const { keep, pull, capStart, capList, capsules } = this;
    for (let s = 1; s <= steps; s++) {
      const a = s / steps;
      // integrate: damped velocity, gravity, wind, and the pull back toward the cut
      for (let q = 0; q < this.particles; q++) {
        const i = q * 3;
        const ax = anchorPrev[i] + (anchor[i] - anchorPrev[i]) * a, ay = anchorPrev[i + 1] + (anchor[i + 1] - anchorPrev[i + 1]) * a, az = anchorPrev[i + 2] + (anchor[i + 2] - anchorPrev[i + 2]) * a;
        if (w[q] === 0) { prev[i] = x[i]; prev[i + 1] = x[i + 1]; prev[i + 2] = x[i + 2]; x[i] = ax; x[i + 1] = ay; x[i + 2] = az; continue; }
        const kq = keep[q];
        let vx = (x[i] - prev[i]) * kq, vy = (x[i + 1] - prev[i + 1]) * kq + this.gravity * h2, vz = (x[i + 2] - prev[i + 2]) * kq;
        vx += wx * h; vy += wy * h; vz += wz * h;
        prev[i] = x[i]; prev[i + 1] = x[i + 1]; prev[i + 2] = x[i + 2];
        const pq = pull[q];
        x[i] += vx + (ax - x[i] - vx) * pq; x[i + 1] += vy + (ay - x[i + 1] - vy) * pq; x[i + 2] += vz + (az - x[i + 2] - vz) * pq;
      }
      // distance constraints (XPBD, one iteration per small step)
      for (let c = 0; c < rest.length; c++) {
        const p = cons[c * 2], q = cons[c * 2 + 1], wp = w[p], wq = w[q];
        const ex = x[q * 3] - x[p * 3], ey = x[q * 3 + 1] - x[p * 3 + 1], ez = x[q * 3 + 2] - x[p * 3 + 2];
        const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (len < 1e-9) continue;
        const C = len - rest[c] * scale;
        const dl = -C / (wp + wq + comp[c] / h2);
        const fx = (ex / len) * dl, fy = (ey / len) * dl, fz = (ez / len) * dl;
        x[p * 3] -= fx * wp; x[p * 3 + 1] -= fy * wp; x[p * 3 + 2] -= fz * wp;
        x[q * 3] += fx * wq; x[q * 3 + 1] += fy * wq; x[q * 3 + 2] += fz * wq;
      }
      // out of the body, and never further from the body than the cloth allows
      for (let q = 0; q < this.particles; q++) {
        if (w[q] === 0) continue;
        const i = q * 3, r = this.rad[q] * scale;
        for (let c = capStart[q]; c < capStart[q + 1]; c++) {
          const cap = capsules[capList[c]];
          const sx = cap.wb.x - cap.wa.x, sy = cap.wb.y - cap.wa.y, sz = cap.wb.z - cap.wa.z;
          const l2 = sx * sx + sy * sy + sz * sz;
          const t = l2 > 1e-10 ? Math.max(0, Math.min(1, ((x[i] - cap.wa.x) * sx + (x[i + 1] - cap.wa.y) * sy + (x[i + 2] - cap.wa.z) * sz) / l2)) : 0;
          const cx = cap.wa.x + sx * t, cy = cap.wa.y + sy * t, cz = cap.wa.z + sz * t;
          const ox = x[i] - cx, oy = x[i + 1] - cy, oz = x[i + 2] - cz;
          const d = Math.sqrt(ox * ox + oy * oy + oz * oz), min = cap.r * scale + r;
          if (d < min && d > 1e-6) { const k2 = min / d; x[i] = cx + ox * k2; x[i + 1] = cy + oy * k2; x[i + 2] = cz + oz * k2; }
        }
        const ax = anchorPrev[i] + (anchor[i] - anchorPrev[i]) * a, ay = anchorPrev[i + 1] + (anchor[i + 1] - anchorPrev[i + 1]) * a, az = anchorPrev[i + 2] + (anchor[i + 2] - anchorPrev[i + 2]) * a;
        const ox = x[i] - ax, oy = x[i + 1] - ay, oz = x[i + 2] - az;
        const d = Math.sqrt(ox * ox + oy * oy + oz * oz), md = this.maxD[q] * scale;
        if (d > md) { const k2 = md / d; x[i] = ax + ox * k2; x[i + 1] = ay + oy * k2; x[i + 2] = az + oz * k2; }
      }
    }
    this.writeMeshes(scale);
    this.lastMs = performance.now() - t0;
  }

  private writeMeshes(scale: number) {
    this.particleNormals(this.x, this.pn);
    this.triFrames(this.x, this.frame);
    const { x, pn, tris, frame } = this;
    for (const b of this.bound) {
      b.mesh.matrixWorld.copy(b.src.parent!.matrixWorld);
      _inv.copy(b.mesh.matrixWorld).invert();
      const e = _inv.elements, P = b.pos.array as Float32Array, N = b.nor.array as Float32Array;
      for (let v = 0; v < b.tri.length; v++) {
        const t = b.tri[v], i0 = tris[t * 3] * 3, i1 = tris[t * 3 + 1] * 3, i2 = tris[t * 3 + 2] * 3;
        const b0 = b.bary[v * 3], b1 = b.bary[v * 3 + 1], b2 = b.bary[v * 3 + 2];
        let nx = pn[i0] * b0 + pn[i1] * b1 + pn[i2] * b2, ny = pn[i0 + 1] * b0 + pn[i1 + 1] * b1 + pn[i2 + 1] * b2, nz = pn[i0 + 2] * b0 + pn[i1 + 2] * b1 + pn[i2 + 2] * b2;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1, dd = (b.d[v] * scale) / nl;
        const px = x[i0] * b0 + x[i1] * b1 + x[i2] * b2 + nx * dd, py = x[i0 + 1] * b0 + x[i1 + 1] * b1 + x[i2 + 1] * b2 + ny * dd, pz = x[i0 + 2] * b0 + x[i1 + 2] * b1 + x[i2 + 2] * b2 + nz * dd;
        P[v * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12];
        P[v * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
        P[v * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
        // the normal turned with its triangle (frame columns: tangent, bitangent, normal)
        const f = t * 9, lx = b.nLocal[v * 3], ly = b.nLocal[v * 3 + 1], lz = b.nLocal[v * 3 + 2];
        const wnx = frame[f] * lx + frame[f + 3] * ly + frame[f + 6] * lz, wny = frame[f + 1] * lx + frame[f + 4] * ly + frame[f + 7] * lz, wnz = frame[f + 2] * lx + frame[f + 5] * ly + frame[f + 8] * lz;
        const mx = e[0] * wnx + e[4] * wny + e[8] * wnz, my = e[1] * wnx + e[5] * wny + e[9] * wnz, mz = e[2] * wnx + e[6] * wny + e[10] * wnz;
        const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        N[v * 3] = mx / ml; N[v * 3 + 1] = my / ml; N[v * 3 + 2] = mz / ml;
      }
      b.pos.needsUpdate = true; b.nor.needsUpdate = true;
    }
  }

  /** Per triangle: an orthonormal frame (tangent, bitangent, normal) as three rows of a 3×3. */
  private triFrames(X: Float32Array, out: Float32Array) {
    const T = this.tris;
    for (let t = 0; t < T.length / 3; t++) {
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      let ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
      const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const bx = ny * uz - nz * uy, by = nz * ux - nx * uz, bz = nx * uy - ny * ux;
      const o = t * 9;
      out[o] = ux; out[o + 1] = uy; out[o + 2] = uz; out[o + 3] = bx; out[o + 4] = by; out[o + 5] = bz; out[o + 6] = nx; out[o + 7] = ny; out[o + 8] = nz;
    }
  }

  /** Area-weighted particle normals. */
  private particleNormals(X: Float32Array, out: Float32Array) {
    out.fill(0);
    const T = this.tris;
    for (let t = 0; t < T.length / 3; t++) {
      const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
      const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
      out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
      out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
    }
  }

  /** Average cost of one update over `n` frames (ms). */
  static bench(sims: ClothSim[], n = 300) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) for (const s of sims) s.update(1 / 60);
    return (performance.now() - t0) / n;
  }
}

function segDist(px: number, py: number, pz: number, a: THREE.Vector3, b: THREE.Vector3) {
  const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z, l2 = sx * sx + sy * sy + sz * sz;
  const t = l2 > 1e-10 ? Math.max(0, Math.min(1, ((px - a.x) * sx + (py - a.y) * sy + (pz - a.z) * sz) / l2)) : 0;
  return Math.hypot(px - a.x - sx * t, py - a.y - sy * t, pz - a.z - sz * t);
}

/** Closest point on triangle (i0, i1, i2) of X to p: barycentric (u, v, w) and squared distance (Ericson, RTCD 5.1.5). */
function closestOnTri(px: number, py: number, pz: number, X: Float32Array, i0: number, i1: number, i2: number) {
  const ax = X[i0 * 3], ay = X[i0 * 3 + 1], az = X[i0 * 3 + 2];
  const abx = X[i1 * 3] - ax, aby = X[i1 * 3 + 1] - ay, abz = X[i1 * 3 + 2] - az;
  const acx = X[i2 * 3] - ax, acy = X[i2 * 3 + 1] - ay, acz = X[i2 * 3 + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const res = (u: number, v: number, w: number) => {
    const qx = ax + abx * v + acx * w, qy = ay + aby * v + acy * w, qz = az + abz * v + acz * w;
    return { u, v, w, d2: (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2 };
  };
  if (d1 <= 0 && d2 <= 0) return res(1, 0, 0);
  const bpx = px - X[i1 * 3], bpy = py - X[i1 * 3 + 1], bpz = pz - X[i1 * 3 + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return res(0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return res(1 - v, v, 0); }
  const cpx = px - X[i2 * 3], cpy = py - X[i2 * 3 + 1], cpz = pz - X[i2 * 3 + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return res(0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return res(1 - w, 0, w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return res(0, 1 - w, w); }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return res(1 - v - w, v, w);
}

void _m;
