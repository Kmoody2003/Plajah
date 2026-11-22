/**
 * softRegions.ts — secondary motion for the loose parts of a single merged, skinned character mesh.
 *
 * A Forge figure built from one painted surface has no bones for its coat skirt, hood or pouches: they are skinned to
 * the hips, head and spine like the body under them, so they move as if starched. This gives each loose region a
 * damped spring (a point pendulum per region, simulated on the CPU per character) and lays its swing over the skin on
 * the GPU:
 *
 * - Region masks come from the bind pose once per geometry: a region's `select(p, joints)` says how loose each vertex
 *   is (0 = sewn to the body, 1 = the free hem), packed into two vec4 vertex attributes (up to 8 regions).
 * - Each frame each region's anchor (its centroid riding its bone) is tracked; the spring feels the anchor's
 *   acceleration (stride, stop, turn, landing), gravity's change of direction, wind and air speed (quadratic drag) and
 *   impulses (hits), and overshoots and settles at its own frequency. Swing toward the body is limited so a skirt
 *   flies out, not into the legs.
 * - The vertex shader adds Σ mask_i · offset_i after skinning (material.positionNode on positionLocal, which three
 *   evaluates after skinning). Offsets are per-object uniforms (onObjectUpdate), so every clone sharing the material
 *   keeps its own swing.
 *
 * Cost: a few dozen flops per region per frame on the CPU and 8 MADs per vertex on the GPU: free on the low tier.
 */
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, uniform, vec3 } from 'three/tsl';

export interface Joints { /** A joint's bind position (bind space), or null. */ get(name: string): THREE.Vector3 | null }

export interface SoftRegionSpec {
  name: string;
  /** The bone the region hangs from (its anchor rides this bone). */
  bone: string;
  /** Looseness of a bind-space vertex, 0…1. */
  select: (p: THREE.Vector3, j: Joints) => number;
  /** Natural frequency (Hz) and damping ratio of the swing. */
  hz: number;
  zeta: number;
  /** How much of the anchor's acceleration it feels (heavier / longer cloth ≈ 1, a stiff plate less). */
  inertia: number;
  /** Air drag gain: acceleration per (m/s)² of air speed past the region. */
  drag: number;
  /** Largest swing (m at mask 1), and how far toward the body (m). */
  max: number;
  inward?: number;
}

const _o = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export { sstep as softStep };

interface Region {
  spec: SoftRegionSpec; bone: THREE.Bone; boneInv: THREE.Matrix4;
  centroid: THREE.Vector3; out: THREE.Vector3;   // bind-space centroid and outward direction from the bone
  o: THREE.Vector3; v: THREE.Vector3;             // swing offset (world, m) and its velocity
  p0: THREE.Vector3; p1: THREE.Vector3; started: number; acc: THREE.Vector3;
}

const MAX_REGIONS = 8;

/** Bake the masks into the geometry (once per geometry) and hook the shader (once per material). */
function prepare(mesh: THREE.SkinnedMesh, specs: SoftRegionSpec[], joints: Joints) {
  const g = mesh.geometry;
  if (!g.userData.softMasks) {
    const pos = g.getAttribute('position'), n = pos.count;
    const a0 = new Float32Array(n * 4), a1 = new Float32Array(n * 4);
    const sums = specs.map(() => ({ w: 0, c: new THREE.Vector3() }));
    const p = new THREE.Vector3();
    // only vertices the mesh draws (a split-off part, e.g. the wings, leaves its vertices behind unindexed)
    const used = new Uint8Array(n);
    if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) used[ix[k]] = 1; } else used.fill(1);
    for (let i = 0; i < n; i++) {
      if (!used[i]) continue;
      p.fromBufferAttribute(pos, i);
      specs.forEach((s, r) => {
        const m = Math.max(0, Math.min(1, s.select(p, joints)));
        if (!m) return;
        (r < 4 ? a0 : a1)[i * 4 + (r % 4)] = m;
        sums[r].w += m; sums[r].c.addScaledVector(p, m);
      });
    }
    g.setAttribute('soft0', new THREE.BufferAttribute(a0, 4));
    g.setAttribute('soft1', new THREE.BufferAttribute(a1, 4));
    g.userData.softMasks = sums.map((s) => ({ weight: s.w, centroid: s.w > 0 ? s.c.divideScalar(s.w) : null }));
  }
  const mat = mesh.material as THREE.MeshStandardNodeMaterial;
  if (!mat.userData.softHooked) {
    mat.userData.softHooked = true;
    const u = Array.from({ length: MAX_REGIONS }, (_, r) =>
      uniform(new THREE.Vector3()).onObjectUpdate(({ object }) => (object?.userData.softOff as THREE.Vector3[] | undefined)?.[r] ?? ZERO));
    const m0 = attribute<'vec4'>('soft0', 'vec4'), m1 = attribute<'vec4'>('soft1', 'vec4');
    const off = vec3(0).add(u[0].mul(m0.x)).add(u[1].mul(m0.y)).add(u[2].mul(m0.z)).add(u[3].mul(m0.w))
      .add(u[4].mul(m1.x)).add(u[5].mul(m1.y)).add(u[6].mul(m1.z)).add(u[7].mul(m1.w));
    mat.positionNode = ((mat.positionNode as typeof positionLocal | null) ?? positionLocal).add(off);
    mat.needsUpdate = true;
  }
  return g.userData.softMasks as { weight: number; centroid: THREE.Vector3 | null }[];
}
const ZERO = new THREE.Vector3();

export class SoftRegions {
  readonly regions: Region[] = [];
  /** World air velocity at the character (m/s) and the character's own velocity (m/s), set each frame. */
  readonly wind = new THREE.Vector3();
  readonly bodyVel = new THREE.Vector3();
  /** Swing scale (0 turns it off). */
  amount = 1;
  lastMs = 0;
  private mesh: THREE.SkinnedMesh;
  private offs: THREE.Vector3[];

  static create(model: THREE.Object3D, specs: SoftRegionSpec[]) {
    let mesh: THREE.SkinnedMesh | null = null;
    model.traverse((o) => { if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    if (!mesh || !specs.length) return null;
    return new SoftRegions(mesh, specs.slice(0, MAX_REGIONS));
  }

  private constructor(mesh: THREE.SkinnedMesh, specs: SoftRegionSpec[]) {
    this.mesh = mesh;
    const sk = mesh.skeleton;
    const find = (name: string) => sk.bones.findIndex((b) => new RegExp(`(^|[:_])${name}$`).test(b.name));
    const bindPos = new Map<string, THREE.Vector3>();
    const joints: Joints = {
      get(name) {
        if (bindPos.has(name)) return bindPos.get(name)!;
        const i = find(name); if (i < 0) return null;
        const p = new THREE.Vector3().setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert());
        bindPos.set(name, p); return p;
      },
    };
    const masks = prepare(mesh, specs, joints);
    specs.forEach((spec, r) => {
      const bi = find(spec.bone), c = masks[r]?.centroid;
      if (bi < 0 || !c) return;
      const bp = joints.get(spec.bone)!;
      const out = _v.copy(c).sub(bp).setY(0);
      // kept in the bone's own frame, so the bone's world rotation turns it with the body
      _m.copy(sk.boneInverses[bi]).invert().decompose(_w, _q, _o);
      if (out.lengthSq() > 1e-6) out.normalize().applyQuaternion(_q.invert());
      this.regions.push({
        spec, bone: sk.bones[bi], boneInv: sk.boneInverses[bi], centroid: c.clone(),
        out: out.lengthSq() > 1e-6 ? out.clone() : new THREE.Vector3(0, 0, -1),
        o: new THREE.Vector3(), v: new THREE.Vector3(), p0: new THREE.Vector3(), p1: new THREE.Vector3(), started: 0, acc: new THREE.Vector3(),
      });
    });
    this.offs = specs.map(() => new THREE.Vector3());
    // the shader reads the uniforms by region index in the spec: keep that order (missing regions stay zero)
    this.regionIndex = specs.map((s) => this.regions.findIndex((r) => r.spec === s));
    mesh.userData.softOff = this.offs;
  }
  private regionIndex: number[];

  /** A shove (m/s) on every region, e.g. a hit from `dir`; scaled by each region's inertia. */
  impulse(v: THREE.Vector3) { for (const r of this.regions) r.v.addScaledVector(v, r.spec.inertia); }

  /** Snap to rest (after a teleport / respawn). */
  reset() { for (const r of this.regions) { r.o.set(0, 0, 0); r.v.set(0, 0, 0); r.started = 0; } }

  /** After the mixer and the Forge (bone world matrices current). */
  update(dt: number) {
    const t0 = performance.now();
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    const air = _w.copy(this.wind).sub(this.bodyVel);
    for (const r of this.regions) {
      const s = r.spec;
      // the anchor: the region's centroid riding its bone
      _m.multiplyMatrices(r.bone.matrixWorld, r.boneInv).multiply(this.mesh.bindMatrix);
      const p = _v.copy(r.centroid).applyMatrix4(_m);
      if (r.started < 2) { r.p0.copy(r.p1); r.p1.copy(p); r.started++; continue; }
      // anchor acceleration (finite differences, lightly smoothed: a landing or a turn, not frame jitter)
      const ax = (p.x - 2 * r.p1.x + r.p0.x) / (dt * dt), ay = (p.y - 2 * r.p1.y + r.p0.y) / (dt * dt), az = (p.z - 2 * r.p1.z + r.p0.z) / (dt * dt);
      r.acc.set(r.acc.x + (ax - r.acc.x) * 0.5, r.acc.y + (ay - r.acc.y) * 0.5, r.acc.z + (az - r.acc.z) * 0.5);
      r.p0.copy(r.p1); r.p1.copy(p);
      const w = 2 * Math.PI * s.hz, k = w * w, c = 2 * s.zeta * w;
      const sp = air.length();
      // substeps keep the stiff ones stable at 30 fps
      const n = Math.max(1, Math.ceil(dt * s.hz * 8)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const fx = -k * r.o.x - c * r.v.x - s.inertia * clampA(r.acc.x) + s.drag * air.x * sp;
        const fy = -k * r.o.y - c * r.v.y - s.inertia * clampA(r.acc.y) + s.drag * air.y * sp * 0.5;
        const fz = -k * r.o.z - c * r.v.z - s.inertia * clampA(r.acc.z) + s.drag * air.z * sp;
        r.v.x += fx * h; r.v.y += fy * h; r.v.z += fz * h;
        r.o.addScaledVector(r.v, h);
      }
      // swing limits: no further than `max`, and only a little toward the body (the outward axis, rotated by the bone)
      const len = r.o.length();
      if (len > s.max) { r.o.multiplyScalar(s.max / len); r.v.multiplyScalar(0.5); }
      r.bone.getWorldQuaternion(_q);
      const out = _o.copy(r.out).applyQuaternion(_q).setY(0).normalize();
      const inward = -r.o.dot(out), lim = s.inward ?? 0.02;
      if (inward > lim) { r.o.addScaledVector(out, inward - lim); const vi = -r.v.dot(out); if (vi > 0) r.v.addScaledVector(out, vi); }
    }
    // offsets into the mesh's own space (the shader adds them after skinning, in positionLocal)
    this.mesh.updateWorldMatrix(true, false);
    _m.copy(this.mesh.matrixWorld).invert();
    this.regionIndex.forEach((ri, k) => {
      const o = this.offs[k];
      if (ri < 0) { o.set(0, 0, 0); return; }
      o.copy(this.regions[ri].o).multiplyScalar(this.amount);
      toLocal(o, _m);
    });
    this.lastMs = performance.now() - t0;
  }
}

/** A world-space displacement into a space given by its inverse world matrix (rotation and scale, no translation). */
function toLocal(v: THREE.Vector3, inv: THREE.Matrix4) {
  const e = inv.elements, x = v.x, y = v.y, z = v.z;
  v.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
}
/** Landings and teleports spike the finite difference: keep it to a hard landing's ~6 g. */
function clampA(a: number) { return Math.max(-60, Math.min(60, a)); }
