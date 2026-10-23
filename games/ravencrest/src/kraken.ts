// The river kraken's arms (bridgeBattle.ts). Procedural until Muse delivers kraken_tentacle.glb
// (docs/ravencrest-muse-brief-troll-kraken.md): each arm is a 14 m chain that moves like an
// octopus's — a travelling wave of curvature with a coiling tip — and reaches with FABRIK IK when
// it rears, slams the deck, rips out a rail or swats at something in the air. The tube is
// re-skinned around the chain every frame (a few hundred vertices per arm).
import * as THREE from 'three/webgpu';
import { uv, vec2, vec3, float, cos, fract, length, smoothstep, mix, max, min, abs, floor, log, hash, sin, time, uniform, mx_fractal_noise_float } from 'three/tsl';

const N = 32;           // chain segments
const R = 12;           // radial segments
export const ARM_LEN = 22;   // rises from the moat 12 m below the deck and towers over it
const SEG = ARM_LEN / N;
const UP = new THREE.Vector3(0, 1, 0);

/** Wet slate-and-bruise hide, pale sucker rows on the inner side, teal freckles on the seams. */
export function tentacleMaterial(glow: { value: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const X = (x: unknown) => x as any;
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const a = X(uv().x), s = X(uv().y);
  const aw = X(fract(a.add(0.5)).sub(0.5));                       // 0 = the inner (sucker) side
  const under = X(smoothstep(float(0.3), float(0.85), cos(a.mul(Math.PI * 2))));
  // Along-coordinate that tightens toward the tip, so suckers shrink with the arm.
  const q = X(log(float(1.03).sub(s)).negate().mul(26));
  const across = X(aw.div(0.11));
  const d1 = X(length(vec2(across.sub(0.48).mul(0.95), fract(q).sub(0.5))));
  const d2 = X(length(vec2(across.add(0.48).mul(0.95), fract(q.add(0.5)).sub(0.5))));
  const cup = X(max(float(1).sub(smoothstep(float(0.2), float(0.36), d1)), float(1).sub(smoothstep(float(0.2), float(0.36), d2)))).mul(smoothstep(float(1.5), float(1.1), abs(across)));
  const rim = X(max(smoothstep(float(0.26), float(0.33), d1).mul(smoothstep(float(0.42), float(0.34), d1)), smoothstep(float(0.26), float(0.33), d2).mul(smoothstep(float(0.42), float(0.34), d2)))).mul(smoothstep(float(1.5), float(1.1), abs(across)));
  // Sucker cups (sheet: pale grey-violet flesh, a hard rim ring, a dark mouth).
  const dmin = X(min(d1, d2));
  const mouth = X(smoothstep(float(0.13), float(0.05), dmin)).mul(cup);
  const mottle = X(mx_fractal_noise_float(vec3(a.mul(7), q.mul(0.35), 0), 3, 2, 0.5, 1)).mul(0.5).add(0.5);
  const bruise = X(smoothstep(float(0.55), float(0.85), X(mx_fractal_noise_float(vec3(a.mul(3), q.mul(0.12), 4), 2, 2, 0.5, 1)).mul(0.5).add(0.5)));
  const top = X(mix(vec3(0.014, 0.014, 0.02), vec3(0.055, 0.024, 0.065), mottle.mul(0.5).add(bruise.mul(0.6))));
  const flesh = X(mix(vec3(0.07, 0.065, 0.085), vec3(0.3, 0.27, 0.33), cup)).mul(X(float(1).sub(mouth.mul(0.85))));
  // River weed and barnacle crust at the waterline.
  const weed = X(smoothstep(float(0.14), float(0.02), s)).mul(smoothstep(float(0.45), float(0.7), mottle));
  const base = X(mix(mix(top, flesh, under), vec3(0.03, 0.04, 0.022), weed));
  m.colorNode = X(base).mul(X(float(1).sub(rim.mul(0.55))));
  m.roughnessNode = X(mix(float(0.24), float(0.4), under)).add(cup.mul(0.12)).add(weed.mul(0.4));
  // Bioluminescent photophores: a regular dotted line down each side seam, plus a few strays.
  const seamD = X(abs(abs(aw).sub(0.25)).div(0.03));
  const dots = X(smoothstep(float(0.5), float(0.25), length(vec2(seamD, fract(q.mul(1.6)).sub(0.5).mul(2)))));
  const cell = X(vec2(a.mul(60), q.mul(2.2)));
  const lit = X(smoothstep(float(0.9), float(0.95), hash(floor(cell.x).add(floor(cell.y).mul(57.13)))));
  const strays = X(lit.mul(smoothstep(float(0.32), float(0.15), length(fract(cell).sub(0.5))))).mul(smoothstep(float(0.2), float(0.6), abs(aw)));
  const pulse = X(sin(X(time).mul(2.2).sub(q.mul(0.6))).mul(0.35).add(0.65));
  m.emissiveNode = X(vec3(0.08, 0.85, 0.7)).mul(X(max(dots, strays.mul(0.6)))).mul(pulse).mul(X(glow)).mul(2.4);
  return m;
}
/** One shared glow level for every arm (dims when the arms sink). */
export const tentacleGlow = uniform(1);

type Act = 'under' | 'emerge' | 'idle' | 'reach' | 'hold' | 'release' | 'retract';
interface Reach {
  /** Waypoints for the tip: [target, seconds to get there]; the last one is held. */
  path: [THREE.Vector3, number][];
  i: number; t: number;
  /** Fires when the tip arrives at waypoint i. */
  at?: (i: number, tip: THREE.Vector3) => void;
  hold: number;
}

export class Tentacle {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  private proc: THREE.Vector3[] = [];
  private ik: THREE.Vector3[] = [];
  readonly pts: THREE.Vector3[] = [];
  private radius: number[] = [];
  private act: Act = 'under';
  private at = 0;
  private sink = 1;            // 1 = fully under water
  private ikW = 0;             // 0 procedural … 1 reaching
  private reachJob: Reach | null = null;
  private recoilT = 0;
  private phase = Math.random() * 10;
  private side: THREE.Vector3;
  /** Lifted rail section riding the tip (ripped out of the bridge). */
  carry: THREE.Object3D | null = null;

  constructor(readonly base: THREE.Vector3, readonly facing: THREE.Vector3, mat: THREE.Material, readonly variant: 'A' | 'B') {
    this.side = new THREE.Vector3().crossVectors(UP, facing).normalize();
    const rb = variant === 'B' ? 1.25 : 1.1;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      let r = rb * Math.pow(1 - s, 1.25) + 0.04;
      if (variant === 'B') r += 0.34 * Math.exp(-(((s - 0.88) / 0.05) ** 2));   // the hooked club
      this.radius.push(r);
      this.proc.push(new THREE.Vector3()); this.ik.push(new THREE.Vector3()); this.pts.push(new THREE.Vector3());
    }
    const verts = (N + 1) * (R + 1);
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= R; j++) {
      const k = i * (R + 1) + j;
      uvs[k * 2] = j / R; uvs[k * 2 + 1] = i / N;
      if (i < N && j < R) { const a = k, b = k + R + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.mesh.userData.dynamic = true;
  }

  get tip() { return this.pts[N]; }
  get up() { return this.act !== 'under' && this.act !== 'retract' && this.sink < 0.5; }
  get busy() { return !!this.reachJob || this.act === 'emerge' || this.act === 'retract' || this.act === 'under'; }
  /** How far the arm is out of the water (0 … 1). */
  get out() { return 1 - this.sink; }

  emerge() { if (this.act === 'under' || this.act === 'retract') { this.act = 'emerge'; this.at = 0; this.show(true); } }
  private show(v: boolean) { this.mesh.visible = v && !this.skinned; if (this.skinned) this.skinned.visible = v; }

  // ── Muse's sculpted arm (creatures/bases/kraken_tentacle_*.glb), skinned onto the chain ──
  private skinned: THREE.SkinnedMesh | null = null;
  private bones: THREE.Bone[] = [];
  private glowMat: THREE.MeshStandardMaterial | null = null;
  /** Swap the procedural tube for Muse's mesh: 14 m straight up +Y, underside +Z, origin at the waterline. */
  useModel(src: THREE.Mesh) {
    const g = src.geometry.clone();
    const sr = this.radius[0] / 0.84, sy = ARM_LEN / 14;
    g.scale(sr, sy, sr);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / SEG, 0, N);
      const i0 = Math.min(Math.floor(t), N - 1), f = t - i0;
      si[i * 4] = i0; si[i * 4 + 1] = i0 + 1; sw[i * 4] = 1 - f; sw[i * 4 + 1] = f;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mat = (Array.isArray(src.material) ? src.material[0] : src.material).clone() as THREE.MeshStandardMaterial;
    this.glowMat = mat;
    const mesh = new THREE.SkinnedMesh(g, mat);
    this.bones = [];
    for (let i = 0; i <= N; i++) { const b = new THREE.Bone(); b.position.set(0, i * SEG, 0); mesh.add(b); this.bones.push(b); }
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    for (const b of this.bones) b.matrixAutoUpdate = false;
    mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.userData.dynamic = true;
    this.skinned = mesh;
    this.mesh.parent?.add(mesh);
    this.show(this.mesh.visible || this.act !== 'under');
  }
  retract() { if (this.act !== 'under') { this.act = 'retract'; this.at = 0; this.reachJob = null; } }
  /** Struck (witch-lightning, a blade): flinch back. */
  recoil() { this.recoilT = 0.6; }

  /** Drive the tip through waypoints, then hold the last one for `hold` seconds. */
  reach(path: [THREE.Vector3, number][], hold = 0.6, at?: Reach['at']) {
    if (!this.up) return false;
    this.reachJob = { path, i: 0, t: 0, at, hold };
    this.act = 'reach';
    return true;
  }

  update(dt: number, now: number) {
    if (this.act === 'under') return;
    this.at += dt;
    if (this.act === 'emerge') { this.sink = Math.max(0, 1 - this.at / 1.3); if (this.sink === 0) this.act = 'idle'; }
    if (this.act === 'retract') { this.sink = Math.min(1, this.at / 1.6); if (this.sink >= 1) { this.act = 'under'; this.show(false); return; } }
    this.recoilT = Math.max(0, this.recoilT - dt);

    this.side.crossVectors(UP, this.facing).normalize();
    // ── procedural octopus motion: a travelling curvature wave with a curling tip ──
    const t = now + this.phase;
    const writhe = this.act === 'emerge' ? 2.2 : 1;
    let th = 0, la = 0;
    const p = this.proc;
    p[0].copy(this.base);
    for (let i = 1; i <= N; i++) {
      const s = i / N;
      const k = 0.5 / N                                                          // a slight lean toward the bridge
        + Math.sin(t * 1.4 * writhe - s * 7 + this.phase) * (0.2 + s * 1.4) * 2.2 / N   // the travelling wave
        + (s > 0.62 ? (s - 0.62) / 0.38 : 0) * 10 * Math.sin(t * 0.55 + this.phase) / N // tip coils, one way then the other
        - this.recoilT * 3.5 * s / N;                                              // flinch away
      th += k;
      la += Math.sin(t * 0.9 - s * 4 + this.phase * 2) * 1.4 / N;
      const dir = UP.clone().multiplyScalar(Math.cos(th) * Math.cos(la))
        .addScaledVector(this.facing, Math.sin(th) * Math.cos(la))
        .addScaledVector(this.side, Math.sin(la));
      p[i].copy(p[i - 1]).addScaledVector(dir.normalize(), SEG);
    }

    // ── reaching: FABRIK toward the current waypoint, blended in from the base up ──
    const job = this.reachJob;
    if (job) {
      const [goal, secs] = job.path[job.i];
      job.t += dt;
      const k = Math.min(1, job.t / Math.max(0.05, secs));
      this.ikW = Math.min(1, this.ikW + dt * 5);
      // Ease the IK target from where the tip was toward the goal.
      const from = this.ik[N].lengthSq() ? this.ik[N].clone() : this.tip.clone();
      const target = from.lerp(goal, k * k * (3 - 2 * k));
      this.solve(target);
      if (k >= 1) {
        if (job.i < job.path.length - 1) { job.at?.(job.i, this.tip); job.i++; job.t = 0; }
        else if (job.t >= secs + job.hold) { job.at?.(job.i, this.tip); this.reachJob = null; this.act = 'release'; }
      }
    } else {
      this.ikW = Math.max(0, this.ikW - dt * 1.6);
      if (this.ikW > 0) this.solve(this.ik[N]);
      else { this.ik[N].set(0, 0, 0); if (this.act === 'release') this.act = 'idle'; }
    }
    for (let i = 0; i <= N; i++) {
      const w = this.ikW * THREE.MathUtils.smoothstep(i / N, 0, 0.35);
      this.pts[i].lerpVectors(p[i], this.ik[i], w);
    }
    // Keep segment lengths after the blend.
    for (let i = 1; i <= N; i++) {
      const d = this.pts[i].clone().sub(this.pts[i - 1]);
      this.pts[i].copy(this.pts[i - 1]).addScaledVector(d.normalize(), SEG);
    }
    // Rising out of / sinking into the river.
    if (this.sink > 0) { const dy = this.sink * (ARM_LEN + 1); for (const q of this.pts) q.y -= dy; }
    if (this.carry) { this.carry.position.copy(this.pts[N - 2]); this.carry.lookAt(this.pts[N]); }
    this.skin();
  }

  /** FABRIK from the current pose toward `target`, base pinned. */
  private solve(target: THREE.Vector3) {
    const c = this.ik;
    if (!c[N].lengthSq()) for (let i = 0; i <= N; i++) c[i].copy(this.proc[i]);
    // Start each solve near the procedural pose so the arm keeps its writhe.
    for (let i = 0; i <= N; i++) c[i].lerp(this.proc[i], 0.15);
    const tgt = target.clone();
    for (let it = 0; it < 4; it++) {
      c[N].copy(tgt);
      for (let i = N - 1; i >= 0; i--) { const d = c[i].clone().sub(c[i + 1]).normalize(); c[i].copy(c[i + 1]).addScaledVector(d, SEG); }
      c[0].copy(this.base);
      for (let i = 1; i <= N; i++) { const d = c[i].clone().sub(c[i - 1]).normalize(); c[i].copy(c[i - 1]).addScaledVector(d, SEG); }
    }
  }

  /** Drive Muse's arm: one bone per chain point, framed like the tube (Y = along, Z = sucker side). */
  private pose() {
    const P = this.pts;
    let T = P[1].clone().sub(P[0]).normalize();
    const Nn = this.facing.clone().addScaledVector(T, -this.facing.dot(T)).normalize();
    const q = new THREE.Quaternion(), B = new THREE.Vector3(), M = new THREE.Matrix4();
    for (let i = 0; i <= N; i++) {
      const T2 = (i === 0 ? P[1].clone().sub(P[0]) : i === N ? P[N].clone().sub(P[N - 1]) : P[i + 1].clone().sub(P[i - 1])).normalize();
      q.setFromUnitVectors(T, T2); Nn.applyQuaternion(q).normalize(); T = T2;
      B.crossVectors(T, Nn).normalize();
      M.makeBasis(B, T, Nn).setPosition(P[i]);
      this.bones[i].matrix.copy(M);
      this.bones[i].matrixWorld.copy(M);
    }
    if (this.glowMat) this.glowMat.emissiveIntensity = (0.65 + 0.35 * Math.sin(performance.now() / 450 + this.phase)) * 1.6;
  }

  /** Skin the tube around the chain with parallel-transported frames. */
  private skin() {
    if (this.skinned) return this.pose();

    const P = this.pts;
    let T = P[1].clone().sub(P[0]).normalize();
    let Nn = this.facing.clone().addScaledVector(T, -this.facing.dot(T)).normalize();
    const q = new THREE.Quaternion(), B = new THREE.Vector3(), off = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const T2 = (i === 0 ? P[1].clone().sub(P[0]) : i === N ? P[N].clone().sub(P[N - 1]) : P[i + 1].clone().sub(P[i - 1])).normalize();
      q.setFromUnitVectors(T, T2); Nn.applyQuaternion(q).normalize(); T = T2;
      B.crossVectors(T, Nn).normalize();
      const r = this.radius[i];
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * Math.PI * 2;
        off.copy(Nn).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        const k = (i * (R + 1) + j) * 3;
        this.pos[k] = P[i].x + off.x * r; this.pos[k + 1] = P[i].y + off.y * r; this.pos[k + 2] = P[i].z + off.z * r;
        this.nrm[k] = off.x; this.nrm[k + 1] = off.y; this.nrm[k + 2] = off.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}
