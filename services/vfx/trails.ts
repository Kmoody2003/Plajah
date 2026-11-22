// Plajah VFX — ribbon trails and slash crescents (docs/rift-realm-fx-study.md §2, "Ribbon trails").
// Trail: a strip that follows a moving edge (blade base → tip) or a point (limb, projectile; camera-facing width),
//   smoothed with Catmull-Rom so a fast swing sampled at 30–60 fps stays a clean arc, fading from head to tail.
// Slash: the crescent of light a strike leaves (Assassin shadow slashes, Pyre Knight axe arcs): it sweeps open
//   along its arc, thickest in the middle, then fades. Both are additive and take the effect's tint.
import * as THREE from 'three/webgpu';
import { attribute, clamp, float, mix, sin, smoothstep, time, uniform, uv, vec3 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface TrailOpts {
  /** 'blade' takes two points per sample (base, tip); 'ribbon' takes one and faces the camera. */
  mode?: 'blade' | 'ribbon';
  color?: number;
  /** Second colour toward the tail (defaults to color). */
  tail?: number;
  intensity?: number;
  /** Seconds a sample stays on screen. */
  life?: number;
  /** Ribbon width in metres (ribbon mode). */
  width?: number;
  /** Max samples kept. */
  samples?: number;
  /** Energy streaks scrolling along the trail (0 = smooth). */
  streaks?: number;
}

interface Sample { a: THREE.Vector3; b: THREE.Vector3; t: number }

const SUB = 4; // Catmull-Rom points between samples

export class Trail {
  readonly mesh: THREE.Mesh;
  emitting = false;
  private s: Sample[] = [];
  private clock = 0;
  private pos: Float32Array;
  private uvs: Float32Array;
  private geo: THREE.BufferGeometry;
  private o: Required<TrailOpts>;
  private uCol: N; private uTail: N; private uI: N;

  constructor(opts: TrailOpts = {}) {
    this.o = { mode: 'blade', color: 0x38bdf8, tail: opts.color ?? 0x38bdf8, intensity: 2.2, life: 0.22, width: 0.12, samples: 40, streaks: 1, ...opts };
    const maxV = (this.o.samples - 1) * SUB * 2 + 2;
    this.pos = new Float32Array(maxV * 3); this.uvs = new Float32Array(maxV * 2);
    const idx: number[] = [];
    for (let k = 0; k < maxV / 2 - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ua = new THREE.BufferAttribute(this.uvs, 2); ua.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa); this.geo.setAttribute('uv', ua); this.geo.setIndex(idx); this.geo.setDrawRange(0, 0);
    this.uCol = uniform(new THREE.Color(this.o.color)); this.uTail = uniform(new THREE.Color(this.o.tail)); this.uI = uniform(this.o.intensity);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const uvA: N = attribute('uv'), u: N = uvA.x, v: N = uvA.y; // u: 0 head → 1 tail, v: 0 base → 1 tip
    const along: N = float(1).sub(u).pow(1.6);                       // bright at the head, gone at the tail
    const edge: N = this.o.mode === 'blade' ? smoothstep(float(0), float(0.35), v).mul(smoothstep(float(1.02), float(0.8), v)).add(smoothstep(float(0.75), float(1), v).mul(0.8))
      : smoothstep(float(0), float(0.5), v).mul(smoothstep(float(1), float(0.5), v));
    const streak: N = this.o.streaks > 0 ? sin(u.mul(26).sub(time.mul(18)).add(v.mul(5))).mul(0.25 * this.o.streaks).add(1) : float(1);
    const core: N = smoothstep(float(0.45), float(0), u).mul(edge).mul(0.7); // white-hot leading edge
    mat.colorNode = mix(this.uCol, this.uTail, u).mul(this.uI).mul(streak).add(vec3(core));
    mat.opacityNode = clamp(along.mul(edge), 0, 1);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 21;
  }

  setColor(c: number, tail = c) { (this.uCol.value as THREE.Color).setHex(c); (this.uTail.value as THREE.Color).setHex(tail); }
  set intensity(v: number) { this.uI.value = v; }

  /** Add a sample (call once a frame while emitting). Ribbon mode ignores `b`. */
  push(a: THREE.Vector3, b?: THREE.Vector3) {
    if (!this.emitting) return;
    const last = this.s[this.s.length - 1];
    if (last && last.a.distanceToSquared(a) < 1e-6 && (!b || last.b.distanceToSquared(b) < 1e-6)) { last.t = this.clock; return; }
    this.s.push({ a: a.clone(), b: (b ?? a).clone(), t: this.clock });
    if (this.s.length > this.o.samples) this.s.shift();
  }

  clear() { this.s.length = 0; this.geo.setDrawRange(0, 0); }

  get visibleSamples() { return this.s.length; }

  update(dt: number, camera?: THREE.Camera) {
    this.clock += dt;
    while (this.s.length && this.clock - this.s[0].t > this.o.life) this.s.shift();
    const n = this.s.length;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    const camPos = camera ? camera.getWorldPosition(_cam) : null;
    let w = 0;
    const P = this.pos, U = this.uvs, life = this.o.life;
    // head is the newest sample: walk newest → oldest so u grows toward the tail
    for (let i = n - 1; i > 0; i--) {
      const p0 = this.s[Math.min(n - 1, i + 1)], p1 = this.s[i], p2 = this.s[i - 1], p3 = this.s[Math.max(0, i - 2)];
      for (let k = 0; k < SUB; k++) {
        const f = k / SUB;
        cr(p0.a, p1.a, p2.a, p3.a, f, _a); cr(p0.b, p1.b, p2.b, p3.b, f, _b);
        const t = p1.t + (p2.t - p1.t) * f, u = Math.min(1, (this.clock - t) / life);
        w = this.vert(w, _a, _b, u, camPos, p1.a, p2.a);
      }
      if (i === 1) w = this.vert(w, p2.a, p2.b, Math.min(1, (this.clock - p2.t) / life), camPos, p1.a, p2.a);
    }
    for (const a of [this.geo.attributes.position, this.geo.attributes.uv] as THREE.BufferAttribute[]) { a.clearUpdateRanges(); a.addUpdateRange(0, w * a.itemSize * 2); a.needsUpdate = true; }
    this.geo.setDrawRange(0, Math.max(0, (w - 1) * 6));
  }

  private vert(w: number, a: THREE.Vector3, b: THREE.Vector3, u: number, cam: THREE.Vector3 | null, from: THREE.Vector3, to: THREE.Vector3) {
    if (w * 2 + 1 >= this.pos.length / 3) return w;
    let ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    if (this.o.mode === 'ribbon') {
      // width across the path, perpendicular to the view
      _d.subVectors(to, from); if (_d.lengthSq() < 1e-8) _d.set(0, 1, 0);
      _v.subVectors(cam ?? _up.set(0, 10, 0), a);
      _n.crossVectors(_d, _v).normalize().multiplyScalar(this.o.width * (1 - u * 0.6) * 0.5);
      ax = a.x - _n.x; ay = a.y - _n.y; az = a.z - _n.z; bx = a.x + _n.x; by = a.y + _n.y; bz = a.z + _n.z;
    }
    const q = w * 2;
    this.pos.set([ax, ay, az, bx, by, bz], q * 3);
    this.uvs.set([u, 0, u, 1], q * 2);
    return w + 1;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cam = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3();
function cr(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

// ── Slash crescents ────────────────────────────────────────────────────────────────────────────────────────────────

export interface SlashSpec {
  id: string;
  radius: number;        // m
  arc: number;           // radians swept
  thickness: number;     // m at the middle of the arc
  life: number;          // s total
  sweep: number;         // s to open the full arc
  color: number | 'tint';
  tail?: number | 'tint';
  intensity: number;
  grow?: number;         // scale added over life (0.15 = +15 %)
  /** Particle recipe id spawned along the arc as it opens. */
  sparks?: string;
  sound?: string;
}

export interface SlashOpts {
  /** Where the arc's centre sits and which way the strike goes. */
  forward: THREE.Vector3;
  /** Roll about the forward axis: 0 = flat right-to-left, ±0.6 = diagonal. */
  tilt?: number;
  /** Sweep the other way round (alternate strikes). */
  flip?: boolean;
  tint?: number;
  scale?: number;
}

const SLASH_SEG = 48;

function crescentGeometry() {
  // unit annulus segment in the XZ plane, arc centred on -Z (forward); u = 0..1 along the arc, v = 0 inner → 1 outer
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let k = 0; k <= SLASH_SEG; k++) {
    const u = k / SLASH_SEG;
    for (const v of [0, 1]) { pos.push(u, v, 0); uvs.push(u, v); }
    if (k < SLASH_SEG) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  return g;
}

/** One pooled slash mesh: the vertex shader bends the unit strip into the crescent from uniforms. */
class SlashMesh {
  readonly mesh: THREE.Mesh;
  age = 1e9; spec: SlashSpec | null = null; scale = 1;
  readonly u = { age: uniform(0), life: uniform(1), sweep: uniform(0.1), arc: uniform(2), radius: uniform(1), thick: uniform(0.3), dir: uniform(1), col: uniform(new THREE.Color()), tail: uniform(new THREE.Color()), I: uniform(2) };
  constructor(geo: THREE.BufferGeometry) {
    const U = this.u, mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const uu: N = uv().x, vv: N = uv().y;
    // thickness: a crescent — thin at both tips, full in the middle
    const prof: N = sin(uu.mul(Math.PI)).pow(0.7);
    const ang: N = uu.sub(0.5).mul(U.arc).mul(U.dir);
    // the band stands up across the swing plane (a curved sheet of light you see from behind or the side), flaring
    // outward toward its top edge so it still reads from above
    const r: N = U.radius.add(vv.sub(0.5).mul(U.thick).mul(prof).mul(0.45));
    mat.positionNode = vec3(ang.sin().mul(r), vv.sub(0.5).mul(U.thick).mul(prof), ang.cos().mul(r).negate());
    const t: N = U.age.div(U.life);
    const head: N = clamp(U.age.div(U.sweep), 0, 1);                  // how far the arc has opened
    const pos: N = U.dir.greaterThan(0).select(float(1).sub(uu), uu);  // 0 where the swing starts
    const opened: N = smoothstep(head.add(0.02), head.sub(0.06), pos);
    const nearHead: N = smoothstep(float(0.45), float(0), head.sub(pos)); // brightest just behind the leading edge
    const outer: N = smoothstep(float(0), float(0.6), vv).mul(smoothstep(float(1.0), float(0.82), vv).mul(0.6).add(0.4)).mul(smoothstep(float(1.0), float(0.97), vv));
    const fade: N = smoothstep(float(1), float(0.35), t);
    mat.colorNode = mix(U.tail, U.col, nearHead).mul(U.I).add(vec3(nearHead.mul(outer).mul(0.8)));
    mat.opacityNode = clamp(opened.mul(outer).mul(fade).mul(nearHead.mul(0.6).add(0.4)), 0, 1);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 22;
  }
}

export class Slashes {
  readonly group = new THREE.Group();
  private pool: SlashMesh[] = [];
  /** Called when a slash wants its spark recipe at a world point. */
  onSparks?: (recipeId: string, at: THREE.Vector3, dir: THREE.Vector3, tint: number) => void;
  constructor(n = 6) {
    const geo = crescentGeometry();
    for (let k = 0; k < n; k++) { const s = new SlashMesh(geo); this.pool.push(s); this.group.add(s.mesh); }
  }

  spawn(spec: SlashSpec, at: THREE.Vector3, o: SlashOpts) {
    const s = this.pool.reduce((a, b) => (a.age / (a.spec?.life ?? 1) >= b.age / (b.spec?.life ?? 1) ? a : b));
    const tint = o.tint ?? 0x38bdf8, sc = o.scale ?? 1;
    s.spec = spec; s.age = 0; s.scale = sc;
    const U = s.u;
    U.life.value = spec.life; U.sweep.value = spec.sweep; U.arc.value = spec.arc; U.radius.value = spec.radius * sc; U.thick.value = spec.thickness * sc;
    U.dir.value = o.flip ? -1 : 1; U.I.value = spec.intensity;
    (U.col.value as THREE.Color).setHex(spec.color === 'tint' ? tint : spec.color);
    (U.tail.value as THREE.Color).setHex(spec.tail === undefined ? (spec.color === 'tint' ? tint : spec.color) : spec.tail === 'tint' ? tint : spec.tail);
    // orient: local -Z = forward, local Y = the arc's normal rolled by tilt
    const f = _f.copy(o.forward).normalize();
    const m = new THREE.Matrix4().lookAt(_o.set(0, 0, 0), _t.copy(f), _y.set(0, 1, 0));
    s.mesh.quaternion.setFromRotationMatrix(m);
    s.mesh.rotateZ(o.tilt ?? 0);
    s.mesh.position.copy(at);
    s.mesh.scale.setScalar(1);
    s.mesh.visible = true;
    U.age.value = 0;
    (s as unknown as { sparked: number }).sparked = 0;
    (s as unknown as { tint: number }).tint = tint;
  }

  update(dt: number) {
    for (const s of this.pool) {
      if (!s.spec || !s.mesh.visible) continue;
      s.age += dt; s.u.age.value = s.age;
      const t = s.age / s.spec.life;
      s.mesh.scale.setScalar(1 + (s.spec.grow ?? 0.12) * t);
      // sparks fly off the leading edge twice as the arc opens
      const x = s as unknown as { sparked: number; tint: number };
      if (s.spec.sparks && this.onSparks && x.sparked < 2) {
        const head = Math.min(1, s.age / s.spec.sweep);
        if (head >= (x.sparked + 1) * 0.45) {
          x.sparked++;
          const a = (head - 0.5) * s.spec.arc * (s.u.dir.value as number), r = s.spec.radius * s.scale;
          const p = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r).applyMatrix4(s.mesh.matrixWorld);
          const tangent = new THREE.Vector3(Math.cos(a) * (s.u.dir.value as number), 0, Math.sin(a) * (s.u.dir.value as number)).transformDirection(s.mesh.matrixWorld);
          this.onSparks(s.spec.sparks, p, tangent, x.tint);
        }
      }
      if (s.age >= s.spec.life) s.mesh.visible = false;
    }
  }

  get active() { return this.pool.filter((s) => s.mesh.visible).length; }
}

const _f = new THREE.Vector3(), _o = new THREE.Vector3(), _t = new THREE.Vector3(), _y = new THREE.Vector3();
