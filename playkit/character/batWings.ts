/**
 * batWings.ts — a bat-wing rig and membrane cloth for a wing cloak modelled as one rigid part.
 *
 * The Void Stalker's wing cloak arrives pinned 100 % to Spine2 (scripts/riftrealm/vs_parts.py), spread as in the art.
 * At load this:
 *
 * 1. Finds the cloak (every vertex wholly on the parent bone, out past the torso) and splits it off the body mesh.
 * 2. Reads the wing's own outline for landmarks, per side: a root at the shoulder blade, elbow and wrist along the
 *    leading edge, and finger tips at the wing tip and the trailing-edge lobes. It builds real bones from them
 *    (parent → Arm → Fore → Hand → Finger k _1 → _2, like a bat) and skins the membrane to them (inverse distance to each
 *    bone segment, four influences; the inner edge stays on the parent).
 * 3. Folds and unfurls by posing those bones: the spread pose is the modelled one (so the scored shape is exactly the
 *    art), the folded pose tucks the wrist up by the shoulder and lays the fingers down the back. Arm leads, then the
 *    forearm, then the fingers fan out, on an under-damped spring so the unfurl snaps open with a little overshoot.
 * 4. Simulates the membrane as cloth (PBD on the mesh's own vertices and edges): verlet inertia in world space,
 *    gravity sag, aerodynamic drag on the membrane normal from the air speed (body travel against the wind), gust
 *    flutter, edge distance constraints, a pull back to the skinned pose that is strong on the bones and weak
 *    mid-membrane, and a tether so nothing tears off. Bones stay rigid; only the membrane between them moves.
 *
 * The wing is drawn as a plain mesh written from the CPU (like clothSim.ts) in its parent object's space, so the game
 * can reparent it (e.g. to the scene in first person, where the body is hidden). Budget: one winged character,
 * ~0.3 ms on the Arc iGPU machine's CPU at the low setting (2 substeps, 1 iteration).
 */
import * as THREE from 'three/webgpu';
import { dot, fract, positionWorld, screenCoordinate, sin, uniform, vec2 } from 'three/tsl';

export interface BatWingPose {
  /** 0 folded … 1 spread (the modelled pose). */
  open: number;
  /** 0 … 1: swept back (running), 0 = spread flat (gliding). */
  sweep: number;
  /** Radians, + lifts the wing tips (dihedral); per side so a turn can drop the inside wing. */
  liftL: number;
  liftR: number;
}

export interface BatWingTuning {
  /** Unfurl / fold spring: natural frequency (rad/s) and damping ratio (< 1 overshoots). */
  springHz: number;
  springZeta: number;
  /** Membrane: pull toward the skinned pose per second at the bones / mid-membrane, and how far it may stray (m). */
  pullBone: number;
  pullMid: number;
  tether: number;
  /** Fraction of gravity the membrane feels (it's light and stretched). */
  sag: number;
  /** Air drag on the membrane normal (per m/s of air speed through it) and gust flutter strength. */
  drag: number;
  flutter: number;
  /** Velocity kept per substep (1 = none lost). */
  damping: number;
  /** Fraction of the character's own travel the membrane does NOT get carried (see SpringBones.rootInertia). */
  rootInertia: number;
  /** Substeps per frame cap and constraint iterations (the low tier uses fewer). */
  maxSubsteps: number;
  iterations: number;
  /** Cloth proxy spacing (m): the membrane is simulated on particles this far apart. */
  spacing: number;
  /** Recompute the shading normals every Nth frame (2 on the low tier halves the write cost). */
  normalsEvery: number;
}

export const BAT_WING_DEFAULTS: BatWingTuning = {
  springHz: 11, springZeta: 0.55,
  pullBone: 60, pullMid: 7, tether: 0.16,
  sag: 0.35, drag: 0.6, flutter: 0.6, damping: 0.985, rootInertia: 0.35,
  maxSubsteps: 3, iterations: 2, spacing: 0.06, normalsEvery: 1,
};

type V3 = THREE.Vector3;
interface BoneDef { name: string; parent: number; head: V3; tail: V3; fold: V3; foldTail: V3; side: number; kind: 'arm' | 'fore' | 'hand' | 'finger' }

const STEP = 1 / 90;
const IDQ = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class BatWings {
  readonly mesh: THREE.Mesh;
  readonly bones: THREE.Bone[] = [];
  readonly tuning: BatWingTuning;
  /** Wanted pose (the game sets it); the shown pose chases it. */
  readonly target: BatWingPose = { open: 0, sweep: 1, liftL: 0, liftR: 0 };
  /** Current spring state of `open`. */
  open = 0;
  private openV = 0;
  private sweep = 1; private liftL = 0; private liftR = 0;
  /** World-space air velocity at the character (m/s): set each frame from the wind field. */
  readonly wind = new THREE.Vector3();
  /** The character's world velocity (m/s), for the air speed through the membrane. */
  readonly bodyVel = new THREE.Vector3();
  /**
   * Draw-only re-framing (first person): the wings are written into their parent's space (e.g. the camera) as
   * `frame · rigid(ref)⁻¹ · world`, i.e. as they sit on the body (ref = the model, scale stripped), placed by `frame`.
   */
  view: { frame: THREE.Matrix4; ref: THREE.Object3D } | null = null;
  lastMs = 0;

  private model: THREE.Object3D;
  private parentBone: THREE.Bone;
  private defs: BoneDef[] = [];
  private restQ: THREE.Quaternion[] = [];
  private foldQ: THREE.Quaternion[] = [];
  private foldS: number[] = [];
  private boneInv: THREE.Matrix4[] = [];
  private bindM: THREE.Matrix4;
  private parentInv: THREE.Matrix4;
  // per wing vertex
  private n: number;
  private bind: Float32Array;            // bind-space positions
  private sk: Int32Array; private sw: Float32Array;   // 4 influences: index into this.bones (-1 = parent bone)
  private x: Float32Array; private prev: Float32Array; private anchor: Float32Array; private nrm: Float32Array;
  private invMass: Float32Array; private pull: Float32Array; private phase: Float32Array;
  private edges: Uint32Array; private rest: Float32Array; private tri: Uint32Array;
  /** Proxies: count, which vertex each one is; per vertex its freedom, 3 proxies and their weights; render positions. */
  private np = 0; private pv!: Int32Array; private vfree: Float32Array; private ip!: Int32Array; private iw!: Float32Array; private rx!: Float32Array;
  private lastRoot = new THREE.Vector3(); private hasRoot = false;
  private acc = 0; private t = 0; private first = true; private frameN = 0;
  private skinM: THREE.Matrix4[] = [];
  private parentSkin = new THREE.Matrix4();

  /** Null when the model has no rigid wing part on `parentName`. */
  static create(model: THREE.Object3D, opts: { parent?: string; tuning?: Partial<BatWingTuning> } = {}) {
    let body: THREE.SkinnedMesh | null = null;
    model.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
    if (!body) return null;
    const b = body as THREE.SkinnedMesh;
    const pi = b.skeleton.bones.findIndex((x) => new RegExp(`(^|[:_])${opts.parent ?? 'Spine2'}$`).test(x.name));
    if (pi < 0) return null;
    const g = b.geometry, si = g.getAttribute('skinIndex'), swt = g.getAttribute('skinWeight'), pos = g.getAttribute('position');
    if (!g.index || !si || !swt) return null;
    const isW = new Uint8Array(pos.count);
    let count = 0;
    for (let i = 0; i < pos.count; i++) if (si.getX(i) === pi && swt.getX(i) > 0.999 && Math.abs(pos.getX(i)) > 0.05) { isW[i] = 1; count++; }
    if (count < 50) return null;
    return new BatWings(model, b, pi, isW, { ...BAT_WING_DEFAULTS, ...opts.tuning });
  }

  private constructor(model: THREE.Object3D, body: THREE.SkinnedMesh, pi: number, isW: Uint8Array, tuning: BatWingTuning) {
    this.model = model; this.tuning = tuning;
    this.parentBone = body.skeleton.bones[pi];
    const g0 = body.geometry;
    // ---- split: the body keeps every triangle with a non-wing corner; the wing gets the rest ----
    const idx = g0.index!.array, keep: number[] = [], wt: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (isW[a] && isW[b] && isW[c]) wt.push(a, b, c); else keep.push(a, b, c);
    }
    const g = g0.clone(); g.setIndex(keep); body.geometry = g;
    const map = new Int32Array(isW.length).fill(-1); const src: number[] = [];
    for (const v of wt) if (map[v] < 0) { map[v] = src.length; src.push(v); }
    const n = (this.n = src.length);
    const P = g0.getAttribute('position'), N = g0.getAttribute('normal'), UV = g0.getAttribute('uv');
    this.bind = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const v = src[k];
      this.bind[k * 3] = P.getX(v); this.bind[k * 3 + 1] = P.getY(v); this.bind[k * 3 + 2] = P.getZ(v);
      if (UV) { uv[k * 2] = UV.getX(v); uv[k * 2 + 1] = UV.getY(v); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    wg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    if (UV) wg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.tri = new Uint32Array(wt.map((v) => map[v]));
    wg.setIndex(new THREE.BufferAttribute(this.tri, 1));
    void N;
    const mat = (body.material as THREE.MeshStandardNodeMaterial).clone();
    mat.side = THREE.DoubleSide;
    // aim keep-out: wing fragments inside a thin cone round the camera's aim ray are dropped (dithered rim), so a
    // spread wing never covers the crosshair; the camera is read at render time (no lag). Off with setAimClear(null).
    const clear = this.clear;
    const uO = uniform(new THREE.Vector3()).onRenderUpdate(() => (clear.cam ? clear.cam.getWorldPosition(clear.o) : clear.o.set(0, -1e6, 0)));
    const uD = uniform(new THREE.Vector3(0, 0, -1)).onRenderUpdate(() => (clear.cam ? clear.cam.getWorldDirection(clear.d) : clear.d));
    const uT = uniform(0).onRenderUpdate(() => (clear.cam ? clear.tan : 0));
    const rel = positionWorld.sub(uO), along = rel.dot(uD), off = rel.sub(uD.mul(along)).length();
    const grain = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
    mat.maskNode = uT.lessThanEqual(0).or(along.lessThan(0)).or(off.div(along.max(0.01)).greaterThan(uT.mul(grain.mul(0.35).add(0.8))));
    this.mesh = new THREE.Mesh(wg, mat);
    this.mesh.name = 'bat_wings';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    // the wing is written in its parent's space every frame: parent it to the model (the game may move it)
    model.add(this.mesh);

    // ---- bind frames ----
    this.bindM = body.bindMatrix.clone();
    const parentBindWorld = body.skeleton.boneInverses[pi].clone().invert();     // parent bone at bind (bind space)
    this.parentInv = body.skeleton.boneInverses[pi].clone();
    // ---- landmarks and bones per side ----
    for (const side of [1, -1]) this.buildSide(side, parentBindWorld);
    // ---- skinning weights ----
    this.sk = new Int32Array(n * 4).fill(-1); this.sw = new Float32Array(n * 4);
    this.vfree = new Float32Array(n);
    const p = new THREE.Vector3(), c = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      p.fromArray(this.bind, k * 3);
      const side = p.x >= 0 ? 1 : -1;
      const cand: { b: number; d: number }[] = [];
      this.defs.forEach((d, bi) => {
        if (d.side !== side || d.kind === 'hand') return;
        cand.push({ b: bi, d: segDist(d.head, d.tail, p, c) });
      });
      // the inner edge (against the back) stays on the parent bone
      const innerD = Math.max(0, Math.abs(p.x) - this.innerX[side > 0 ? 0 : 1]);
      cand.push({ b: -1, d: innerD * 1.4 + 0.005 });
      cand.sort((a, b) => a.d - b.d);
      const top = cand.slice(0, 4);
      let tot = 0;
      const ws = top.map((t) => { const w = 1 / Math.pow(t.d + 0.02, 4); tot += w; return w; });
      top.forEach((t, j) => { this.sk[k * 4 + j] = t.b; this.sw[k * 4 + j] = ws[j] / tot; });
      // how free this vertex is: pinned on a bone or the inner edge, loose mid-membrane
      this.vfree[k] = sstep(0.015, 0.16, top[0].d);
    }
    // ---- the cloth: proxy particles (a Poisson-spaced subset of the vertices) joined to their neighbours; the
    // render vertices follow the proxies' offsets from the skinned pose (3 nearest, inverse distance) ----
    const sp = tuning.spacing, B = this.bind;
    const d2 = (a: number, b: number) => (B[a * 3] - B[b * 3]) ** 2 + (B[a * 3 + 1] - B[b * 3 + 1]) ** 2 + (B[a * 3 + 2] - B[b * 3 + 2]) ** 2;
    const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => this.vfree[a] - this.vfree[b]);   // pinned ones first: the edges get anchors
    const prox: number[] = [];
    const cell = new Map<string, number[]>();
    const key = (k: number) => `${Math.floor(B[k * 3] / sp)},${Math.floor(B[k * 3 + 1] / sp)},${Math.floor(B[k * 3 + 2] / sp)}`;
    const near = (k: number, r: number, f: (q: number) => void) => {
      const cx = Math.floor(B[k * 3] / sp), cy = Math.floor(B[k * 3 + 1] / sp), cz = Math.floor(B[k * 3 + 2] / sp), R = Math.ceil(r / sp);
      for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) for (const q of cell.get(`${cx + x},${cy + y},${cz + z}`) ?? []) f(q);
    };
    for (const k of order) {
      let ok = true;
      near(k, sp, (q) => { if (ok && d2(k, prox[q]) < sp * sp && Math.sign(B[k * 3]) === Math.sign(B[prox[q] * 3])) ok = false; });
      if (!ok) continue;
      const kk = key(k); (cell.get(kk) ?? cell.set(kk, []).get(kk)!).push(prox.length); prox.push(k);
    }
    const np = (this.np = prox.length);
    this.pv = new Int32Array(prox);
    this.invMass = new Float32Array(np); this.pull = new Float32Array(np); this.phase = new Float32Array(np);
    prox.forEach((k, q) => {
      const free = this.vfree[k];
      this.invMass[q] = free < 0.05 ? 0 : 1;
      this.pull[q] = THREE.MathUtils.lerp(tuning.pullBone, tuning.pullMid, free);
      this.phase[q] = (B[k * 3] * 7.3 + B[k * 3 + 1] * 5.1) % (Math.PI * 2);
    });
    const e: number[] = [], r: number[] = [];
    prox.forEach((k, q) => near(k, sp * 1.75, (o) => {
      if (o <= q || Math.sign(B[k * 3]) !== Math.sign(B[prox[o] * 3])) return;
      if (!this.invMass[q] && !this.invMass[o]) return;
      const dd = d2(k, prox[o]);
      if (dd < (sp * 1.75) ** 2) { e.push(q, o); r.push(Math.sqrt(dd)); }
    }));
    this.edges = new Uint32Array(e); this.rest = new Float32Array(r);
    this.ip = new Int32Array(n * 3); this.iw = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const best: [number, number][] = [];
      near(k, sp * 2.2, (q) => {
        if (Math.sign(B[k * 3]) !== Math.sign(B[prox[q] * 3])) return;
        best.push([d2(k, prox[q]), q]);
      });
      best.sort((a, b) => a[0] - b[0]);
      let tot = 0;
      for (let j = 0; j < 3; j++) {
        const b = best[j] ?? best[0];
        const w = b ? 1 / (Math.sqrt(b[0]) + 0.01) ** 2 : 0;
        this.ip[k * 3 + j] = b ? b[1] : 0; this.iw[k * 3 + j] = w; tot += w;
      }
      for (let j = 0; j < 3; j++) this.iw[k * 3 + j] /= tot || 1;
    }
    this.x = new Float32Array(np * 3); this.prev = new Float32Array(np * 3);
    this.anchor = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3); this.rx = new Float32Array(n * 3);
    this.skinM = this.bones.map(() => new THREE.Matrix4());
  }

  private innerX: [number, number] = [0.1, 0.1];

  /** Landmarks from the wing outline, then bones (rest = spread, fold = tucked down the back). */
  private buildSide(side: number, parentBindWorld: THREE.Matrix4) {
    const pts: V3[] = [];
    for (let k = 0; k < this.n; k++) {
      const x = this.bind[k * 3];
      if (x * side > 0) pts.push(new THREE.Vector3(x, this.bind[k * 3 + 1], this.bind[k * 3 + 2]));
    }
    const ax = (p: V3) => p.x * side;
    const minX = Math.min(...pts.map(ax)), maxX = Math.max(...pts.map(ax)), span = maxX - minX;
    this.innerX[side > 0 ? 0 : 1] = minX + 0.04;
    const at = (f: number) => minX + span * f;
    const band = (lo: number, hi: number) => pts.filter((p) => ax(p) >= at(lo) && ax(p) <= at(hi));
    const top = (lo: number, hi: number) => band(lo, hi).reduce((a, b) => (b.y > a.y ? b : a));
    const low = (lo: number, hi: number) => band(lo, hi).reduce((a, b) => (b.y < a.y ? b : a));
    const innerPts = band(0, 0.06);
    const yTop = Math.max(...innerPts.map((p) => p.y)), yBot = Math.min(...innerPts.map((p) => p.y));
    const zIn = innerPts.reduce((t, p) => t + p.z, 0) / innerPts.length;
    // root at the shoulder blade: on the inner edge, a third of the way down from its top
    const R = new THREE.Vector3(side * (minX + 0.02), yTop - (yTop - yBot) * 0.3, zIn);
    const E = top(0.24, 0.34).clone(); E.y -= 0.03;
    const W = top(0.5, 0.6).clone(); W.y -= 0.03;
    const tips = [
      pts.reduce((a, b) => (ax(b) > ax(a) ? b : a)).clone(),   // the wing tip
      low(0.78, 1.0).clone(), low(0.52, 0.78).clone(), low(0.28, 0.52).clone(),
    ];
    // folded landmarks: the arm down and back, the wrist tucked up by the shoulder, the fingers laid down the back
    const off = (dx: number, dy: number, dz: number) => new THREE.Vector3(side * dx, dy, dz);
    const Ef = R.clone().add(off(0.06, -0.3, -0.12));
    const Wf = R.clone().add(off(0.02, 0.1, -0.2));
    const tipF = (k: number) => Wf.clone().add(off(0.04 + 0.03 * k, -(tips[k].distanceTo(W) * 0.8), -0.07 - 0.012 * k));
    const s = this.defs.length;
    const def = (name: string, parent: number, head: V3, tail: V3, fold: V3, foldTail: V3, kind: BoneDef['kind']) => {
      this.defs.push({ name: (side > 0 ? 'Left' : 'Right') + name, parent, head, tail, fold, foldTail, side, kind });
      return this.defs.length - 1;
    };
    const arm = def('WingArm', -1, R, E, R, Ef, 'arm');
    const fore = def('WingFore', arm, E, W, Ef, Wf, 'fore');
    const hand = def('WingHand', fore, W, W.clone().add(off(0.05, 0, 0)), Wf, Wf.clone().add(off(0.01, -0.05, 0)), 'hand');
    tips.forEach((T, k) => {
      const mid = W.clone().lerp(T, 0.5), Tf = tipF(k), midF = Wf.clone().lerp(Tf, 0.5);
      const f1 = def(`WingFinger${k + 1}_1`, hand, W, mid, Wf, midF, 'finger');
      def(`WingFinger${k + 1}_2`, f1, mid, T, midF, Tf, 'finger');
    });
    // ---- bones: rest orientation = the bind (model) axes, so poses are written in the figure's own frame ----
    const pRot = new THREE.Quaternion(); parentBindWorld.decompose(new THREE.Vector3(), pRot, new THREE.Vector3());
    const pScale = new THREE.Vector3().setFromMatrixScale(parentBindWorld).x;
    for (let i = s; i < this.defs.length; i++) {
      const d = this.defs[i];
      const bone = new THREE.Bone(); bone.name = d.name;
      let restQ: THREE.Quaternion;
      if (d.parent < 0) {
        bone.position.copy(d.head).applyMatrix4(parentBindWorld.clone().invert());
        restQ = pRot.clone().invert();
        this.parentBone.add(bone);
      } else {
        const pd = this.defs[d.parent];
        bone.position.copy(d.head).sub(pd.head).divideScalar(pScale);
        restQ = new THREE.Quaternion();
        this.bones[d.parent].add(bone);
      }
      bone.quaternion.copy(restQ);
      this.bones[i] = bone;
      this.restQ[i] = restQ;
      // bind world = the bone's head with the model's axes (parent bind scale)
      const bw = new THREE.Matrix4().compose(d.head, new THREE.Quaternion(), new THREE.Vector3(pScale, pScale, pScale));
      this.boneInv[i] = bw.invert();
    }
    // directions: spread (rest) and folded, and the arc between them; the fingers also roll flat against the back
    for (let i = s; i < this.defs.length; i++) {
      const d = this.defs[i];
      this.restDir[i] = d.tail.clone().sub(d.head).normalize();
      this.foldDir[i] = d.foldTail.clone().sub(d.fold).normalize();
      this.fanQ[i] = new THREE.Quaternion().setFromUnitVectors(this.foldDir[i], this.restDir[i]);
      this.foldRoll[i] = new THREE.Quaternion().setFromAxisAngle(this.foldDir[i], d.side * 0.5);
      this._Q[i] = new THREE.Quaternion();
    }
    // fold rotations: each bone turned (in its parent's folded frame) from its rest direction to its folded one
    const folded: THREE.Quaternion[] = [];
    for (let i = s; i < this.defs.length; i++) {
      const d = this.defs[i];
      const restDir = d.tail.clone().sub(d.head).normalize();
      const foldDir = d.foldTail.clone().sub(d.fold).normalize();
      const world = new THREE.Quaternion().setFromUnitVectors(restDir, foldDir);   // in model axes
      const parentWorld = d.parent < 0 ? new THREE.Quaternion() : folded[d.parent];
      folded[i] = world;
      // local = parentWorld⁻¹ · world (rest local is identity below the root; the root carries the parent's inverse)
      const local = parentWorld.clone().invert().multiply(world);
      this.foldQ[i] = d.parent < 0 ? this.restQ[i].clone().multiply(local) : local;
      this.foldS[i] = d.kind === 'finger' && d.name.endsWith('_1') ? THREE.MathUtils.clamp(d.foldTail.distanceTo(d.fold) / d.tail.distanceTo(d.head), 0.5, 1.2) : 1;
    }
  }

  private clear = { cam: null as THREE.Camera | null, tan: 0, o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1) };
  /** Keep the aim clear: drop wing pixels within `tan` (radius / distance) of `cam`'s aim ray; null turns it off. */
  setAimClear(cam: THREE.Camera | null, tan = 0.075) { this.clear.cam = cam; this.clear.tan = tan; }

  /** Snap the membrane to the skinned pose (after a teleport or a respawn). */
  reset() { this.first = true; }

  private _q = new THREE.Quaternion(); private _q2 = new THREE.Quaternion(); private _ax = new THREE.Vector3(); private _d = new THREE.Vector3();
  private restDir: V3[] = []; private foldDir: V3[] = []; private fanQ: THREE.Quaternion[] = []; private foldRoll: THREE.Quaternion[] = []; private _Q: THREE.Quaternion[] = [];
  private _v = new THREE.Vector3(); private _m = new THREE.Matrix4(); private _root = new THREE.Vector3();

  /** Pose the bones: fold ↔ spread, sweep and lift on top. */
  private poseBones(dt: number) {
    const tu = this.tuning, T = this.target;
    // under-damped spring on the unfurl
    const w = tu.springHz, z = tu.springZeta;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.openV += (w * w * (T.open - this.open) - 2 * z * w * this.openV) * h;
      this.open += this.openV * h;
    }
    this.open = THREE.MathUtils.clamp(this.open, -0.02, 1.12);
    const k = 1 - Math.exp(-dt * 7);
    this.sweep += (T.sweep - this.sweep) * k; this.liftL += (T.liftL - this.liftL) * k; this.liftR += (T.liftR - this.liftR) * k;
    const o = this.open, over = Math.max(0, o - 1);
    // Each bone's direction (in the figure's bind axes, relative to the parent bone) turns from its folded direction to
    // its spread one along the shortest arc, whatever its parents are doing: the wing fans out of the back and folds
    // back down it without swinging through odd poses. Arm leads, then the forearm, the fingers last.
    const Q = this._Q;
    for (let i = 0; i < this.bones.length; i++) {
      const d = this.defs[i];
      const f = Math.min(1, d.kind === 'arm' ? sstep(0, 0.75, o) : d.kind === 'fore' || d.kind === 'hand' ? sstep(0.05, 0.85, o) : sstep(0.15, 1, o));
      this._q.identity().slerp(this.fanQ[i], f);                       // fold dir → spread dir, part way
      this._d.copy(this.foldDir[i]).applyQuaternion(this._q);
      Q[i].setFromUnitVectors(this.restDir[i], this._d);
      if (d.kind === 'finger' || d.kind === 'hand') Q[i].premultiply(this._q2.slerpQuaternions(this.foldRoll[i], IDQ, f)).normalize();
      // the whole wing: swept back about the vertical (running), lifted about the forward axis (glide / banking)
      const lift = (d.side > 0 ? this.liftL : this.liftR) + over * 0.5;
      const fa = sstep(0, 0.75, o);
      this._q.setFromAxisAngle(this._ax.set(0, 1, 0), d.side * 0.42 * this.sweep * fa);   // + = tips back (-Z)
      this._q2.setFromAxisAngle(this._ax.set(0, 0, 1), d.side * lift * fa);
      Q[i].premultiply(this._q2.multiply(this._q));
      const b = this.bones[i];
      if (d.parent < 0) b.quaternion.copy(this.restQ[i]).multiply(Q[i]);
      else b.quaternion.copy(this._q.copy(Q[d.parent]).invert()).multiply(Q[i]);
      b.scale.setScalar(THREE.MathUtils.lerp(this.foldS[i], 1, f));
    }
  }

  /** Once per frame after the mixer and the Forge (the skeleton's world matrices current). */
  update(dt: number) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.poseBones(dt);
    this.parentBone.updateMatrixWorld(true);
    // shown at all? (fully folded wings are still drawn: they lie down the back like a cloak)
    // skinning matrices: bone world · bone inverse · bind matrix
    for (let i = 0; i < this.bones.length; i++) this.skinM[i].multiplyMatrices(this.bones[i].matrixWorld, this.boneInv[i]).multiply(this.bindM);
    this.parentSkin.multiplyMatrices(this.parentBone.matrixWorld, this.parentInv).multiply(this.bindM);
    const n = this.n, A = this.anchor, X = this.x, Pv = this.prev, B = this.bind;
    void n;
    const v = this._v;
    const SW = this.sw, SK = this.sk, mats = this.skinM, pe = this.parentSkin.elements;
    for (let k = 0; k < n; k++) {
      let ax = 0, ay = 0, az = 0;
      const bx = B[k * 3], by = B[k * 3 + 1], bz = B[k * 3 + 2];
      for (let j = 0; j < 4; j++) {
        const w = SW[k * 4 + j]; if (w <= 0) continue;
        const bi = SK[k * 4 + j];
        const e = bi < 0 ? pe : mats[bi].elements;
        ax += (e[0] * bx + e[4] * by + e[8] * bz + e[12]) * w;
        ay += (e[1] * bx + e[5] * by + e[9] * bz + e[13]) * w;
        az += (e[2] * bx + e[6] * by + e[10] * bz + e[14]) * w;
      }
      A[k * 3] = ax; A[k * 3 + 1] = ay; A[k * 3 + 2] = az;
    }
    void v;
    this._root.setFromMatrixPosition(this.model.matrixWorld);
    const np = this.np, PV = this.pv;
    if (this.first) {
      for (let q = 0; q < np; q++) for (let c = 0; c < 3; c++) X[q * 3 + c] = Pv[q * 3 + c] = A[PV[q] * 3 + c];
      this.first = false; this.hasRoot = false;
    } else if (this.hasRoot) {
      // carry the membrane along with most of the body's travel (a teleport carries it all the way)
      v.copy(this._root).sub(this.lastRoot);
      const kc = v.lengthSq() > 4 ? 1 : 1 - this.tuning.rootInertia;
      v.multiplyScalar(kc);
      for (let k = 0; k < np; k++) { X[k * 3] += v.x; X[k * 3 + 1] += v.y; X[k * 3 + 2] += v.z; Pv[k * 3] += v.x; Pv[k * 3 + 1] += v.y; Pv[k * 3 + 2] += v.z; }
    }
    this.lastRoot.copy(this._root); this.hasRoot = true;
    this.solve(dt);
    if (this.mesh.visible) this.write();     // hidden (e.g. first person): keep simulating, skip the mesh upload
    this.lastMs = performance.now() - t0;
  }

  private solve(dt: number) {
    const tu = this.tuning, np = this.np, PV = this.pv, X = this.x, Pv = this.prev, A = this.anchor, N = this.nrm;
    this.acc = Math.min(this.acc + dt, STEP * tu.maxSubsteps);
    const steps = Math.floor(this.acc / STEP);
    this.acc -= steps * STEP;
    const h = STEP, h2 = h * h;
    // the membrane goes slack when folded: the cloth fades to the skinned pose so a folded wing lies still
    const live = sstep(0.25, 0.8, this.open);
    const g = -9.8 * tu.sag * live;
    const air = this._v.copy(this.wind).sub(this.bodyVel);           // air velocity relative to the body
    const ex = air.x, ey = air.y, ez = air.z, airSp = Math.sqrt(ex * ex + ey * ey + ez * ez);
    for (let s = 0; s < steps; s++) {
      const tt = this.t - (steps - 1 - s) * h;
      for (let k = 0; k < np; k++) {
        const i = k * 3, a = PV[k] * 3;
        if (!this.invMass[k]) { X[i] = A[a]; X[i + 1] = A[a + 1]; X[i + 2] = A[a + 2]; Pv[i] = X[i]; Pv[i + 1] = X[i + 1]; Pv[i + 2] = X[i + 2]; continue; }
        const vx = (X[i] - Pv[i]) * tu.damping, vy = (X[i + 1] - Pv[i + 1]) * tu.damping, vz = (X[i + 2] - Pv[i + 2]) * tu.damping;
        Pv[i] = X[i]; Pv[i + 1] = X[i + 1]; Pv[i + 2] = X[i + 2];
        // aerodynamic push along the membrane normal, plus gust flutter (a travelling ripple)
        const nx = N[a], ny = N[a + 1], nz = N[a + 2];
        const relN = nx * (ex - vx / h) + ny * (ey - vy / h) + nz * (ez - vz / h);
        const flut = Math.sin(tt * 23 + this.phase[k]) * tu.flutter * airSp * airSp * 0.15;
        const fa = (tu.drag * relN * Math.abs(relN) + flut) * live;
        const pk = Math.min(1, this.pull[k] * h * (1.5 - live));
        X[i] += vx + (nx * fa) * h2 + (A[a] - X[i]) * pk;
        X[i + 1] += vy + (g + ny * fa) * h2 + (A[a + 1] - X[i + 1]) * pk;
        X[i + 2] += vz + (nz * fa) * h2 + (A[a + 2] - X[i + 2]) * pk;
      }
      for (let it = 0; it < tu.iterations; it++) this.constrain();
    }
    // tether: never further than `tether` from the skinned pose (a fold or a sprint can't tear the membrane off)
    const tmax = tu.tether * Math.max(0.15, live);
    for (let k = 0; k < np; k++) {
      const i = k * 3, a = PV[k] * 3;
      const dx = X[i] - A[a], dy = X[i + 1] - A[a + 1], dz = X[i + 2] - A[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > tmax) { const f = tmax / d; X[i] = A[a] + dx * f; X[i + 1] = A[a + 1] + dy * f; X[i + 2] = A[a + 2] + dz * f; }
    }
  }

  private constrain() {
    const E = this.edges, R = this.rest, X = this.x, W = this.invMass;
    // edge lengths follow the bones' scale (folded fingers shorten the membrane)
    const scale = this._scale;
    for (let e = 0; e < E.length; e += 2) {
      const a = E[e], b = E[e + 1], wa = W[a], wb = W[b], ws = wa + wb;
      if (!ws) continue;
      const ia = a * 3, ib = b * 3;
      const dx = X[ib] - X[ia], dy = X[ib + 1] - X[ia + 1], dz = X[ib + 2] - X[ia + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-7) continue;
      // anchors' own spacing is the rest length (it already carries the fold's compression and the model's scale)
      const r = R[e >> 1] * scale;
      // membranes buckle freely under compression (down to half their length)
      const tgt = d > r ? r : d < r * 0.5 ? r * 0.5 : d;
      if (tgt === d) continue;
      const c = (d - tgt) / (d * ws);
      X[ia] += dx * c * wa; X[ia + 1] += dy * c * wa; X[ia + 2] += dz * c * wa;
      X[ib] -= dx * c * wb; X[ib + 1] -= dy * c * wb; X[ib + 2] -= dz * c * wb;
    }
  }
  private get _scale() { return this._v.setFromMatrixScale(this.model.matrixWorld).x; }

  /** Positions into the mesh (its parent's space), normals from the triangles. */
  private write() {
    const geo = this.mesh.geometry, pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const parent = this.mesh.parent;
    this.mesh.position.set(0, 0, 0); this.mesh.quaternion.identity(); this.mesh.scale.set(1, 1, 1);
    if (this.view) {
      this.view.ref.updateWorldMatrix(true, false);
      this.view.ref.matrixWorld.decompose(this._d, this._q, this._ax);
      this._m.compose(this._d, this._q, ONE).invert().premultiply(this.view.frame);
    } else if (parent) { parent.updateWorldMatrix(true, false); this._m.copy(parent.matrixWorld).invert(); } else this._m.identity();
    const e = this._m.elements, P = this.x, A = this.anchor, PV = this.pv, IP = this.ip, IW = this.iw, F = this.vfree, X = this.rx, out = pos.array as Float32Array;
    // each vertex: its skinned spot plus its proxies' blended offsets (none on the bones)
    for (let k = 0; k < this.n; k++) {
      const i = k * 3, f = F[k];
      let ox = 0, oy = 0, oz = 0;
      if (f > 0) for (let j = 0; j < 3; j++) {
        const q = IP[i + j], w = IW[i + j] * f, qi = q * 3, a = PV[q] * 3;
        ox += (P[qi] - A[a]) * w; oy += (P[qi + 1] - A[a + 1]) * w; oz += (P[qi + 2] - A[a + 2]) * w;
      }
      X[i] = A[i] + ox; X[i + 1] = A[i + 1] + oy; X[i + 2] = A[i + 2] + oz;
      const x = X[i], y = X[i + 1], z = X[i + 2];
      out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    pos.needsUpdate = true;
    if (++this.frameN % Math.max(1, this.tuning.normalsEvery) !== 0) return;
    // area-weighted vertex normals, in world space (the aerodynamics) and in the mesh's space (shading)
    const N = this.nrm, ind = this.tri;
    N.fill(0);
    for (let t = 0; t < ind.length; t += 3) {
      const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
      const wx = X[c] - X[a], wy = X[c + 1] - X[a + 1], wz = X[c + 2] - X[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute, nr = nAttr.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const i = k * 3, x = N[i], y = N[i + 1], z = N[i + 2], l = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
      N[i] = x * l; N[i + 1] = y * l; N[i + 2] = z * l;
      nr[i] = (e[0] * N[i] + e[4] * N[i + 1] + e[8] * N[i + 2]); nr[i + 1] = (e[1] * N[i] + e[5] * N[i + 1] + e[9] * N[i + 2]); nr[i + 2] = (e[2] * N[i] + e[6] * N[i + 1] + e[10] * N[i + 2]);
    }
    nAttr.needsUpdate = true;
  }

  /** Debug: bone landmarks in bind space. */
  get landmarks() { return this.defs.map((d) => ({ name: d.name, head: d.head.toArray(), tail: d.tail.toArray() })); }
}

function segDist(a: V3, b: V3, p: V3, out: V3) {
  out.copy(b).sub(a);
  const l2 = out.lengthSq();
  const t = l2 > 1e-10 ? Math.max(0, Math.min(1, ((p.x - a.x) * out.x + (p.y - a.y) * out.y + (p.z - a.z) * out.z) / l2)) : 0;
  return out.multiplyScalar(t).add(a).distanceTo(p);
}
