import * as THREE from 'three';

/**
 * mascotRuntime — framework-free runtime for the Chora / Reello GLBs (scripts/blender/build_mascots.py).
 *
 *  • Shading: vertex colour = the painted base. The `_fx` attribute (spot density, light-spot density, fur)
 *    drives a procedural airbrush grain + speckled scale spots in the fragment shader, plus a sheen/fuzz
 *    and optional shell-texture fur layers ("fur approximation"). Fins read smoother and glossier; horns
 *    are matte.
 *  • Physics: VRM-style spring joints. Fins/horns are owned by springs (never keyed): firm, damped,
 *    angle-limited — they flex like a shark/dolphin fin, not jelly. Head, arms and tail tips get light
 *    follow-through springs layered on top of the animation.
 *  • Props: interchangeable GLBs attached to the `prop` socket; a small hand IK pulls the hands onto the
 *    prop per clip (and lets go for cheers/hops, where the clip parks the socket on the lap).
 *  • Clips: loops (idle, listen, encourage, excited, think, hop) + one-shots (nod_yes, almost, cheer, wave).
 *    `energy` layers the excited bounce WITHOUT face tracks (face states are bone-scale toggles).
 */

export type MascotMood = 'idle' | 'listen' | 'encourage' | 'excited' | 'think' | 'hop';
export type MascotReaction = 'nod_yes' | 'almost' | 'cheer' | 'wave';
export type FurQuality = 'high' | 'medium' | 'low';

const LOOPS = new Set(['idle', 'listen', 'encourage', 'excited', 'think', 'hop']);
const FACE_TRACK = /^(h?eye|brow|mouth)/i;
/** How much each hand holds the prop during a clip (0 = let go; the clip parks the prop on the lap). */
const HOLD: Record<string, [number, number]> = {
  idle: [1, 1], listen: [1, 1], think: [1, 0], nod_yes: [1, 1], almost: [0.6, 0.6], wave: [1, 0],
  encourage: [0, 0], excited: [0, 0], hop: [0, 0], cheer: [0, 0],
};

// ------------------------------------------------------------------ shaders
const NOISE = /* glsl */`
float mh3(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mvn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mh3(i), mh3(i + vec3(1,0,0)), f.x), mix(mh3(i + vec3(0,1,0)), mh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mh3(i + vec3(0,0,1)), mh3(i + vec3(1,0,1)), f.x), mix(mh3(i + vec3(0,1,1)), mh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec2 mworley(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); float d = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = vec3(mh3(i + g), mh3(i + g + 19.1), mh3(i + g + 47.7));
    vec3 r = g + o - f; float dd = dot(r * vec3(1.0, 1.35, 1.0), r);
    if (dd < d) { d = dd; id = mh3(i + g + 7.3); } }
  return vec2(sqrt(d), id); }
`;

interface SkinOpts { spots: boolean; fur: number; shell?: { index: number; count: number; length: number } }

function patchMaterial(mat: THREE.MeshPhysicalMaterial, o: SkinOpts) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShell = { value: o.shell ? (o.shell.index + 1) / o.shell.count : 0 };
    sh.uniforms.uFurLen = { value: o.shell?.length ?? 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 _fx; varying vec3 vFx; varying vec3 vObj; uniform float uShell; uniform float uFurLen;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position; vFx = _fx;
        ${o.shell ? 'transformed += normal * uShell * uFurLen * (0.25 + 0.75 * _fx.z);' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFx; varying vec3 vObj; uniform float uShell;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vObj;
          // airbrush grain (two octaves) — the sheet's fine stipple
          float g = mvn(p * 520.0) * 0.55 + mvn(p * 150.0) * 0.45;
          diffuseColor.rgb *= 0.9 + 0.2 * g;
          ${o.spots ? `
          // scale spots: warped worley cells, dark navy + a scatter of lighter lavender
          vec3 q = p * 10.5 + 0.5 * vec3(mvn(p * 22.0), mvn(p * 22.0 + 7.1), mvn(p * 22.0 + 13.7));
          vec2 w = mworley(q);
          float dark = smoothstep(0.44, 0.33, w.x) * step(0.42, w.y) * vFx.x;
          vec2 w2 = mworley(q * 1.3 + 31.0);
          float lite = smoothstep(0.30, 0.22, w2.x) * step(0.82, w2.y) * vFx.y * (1.0 - dark);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.26, 0.28, 0.5), dark * 0.95);
          diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.35 + vec3(0.04, 0.03, 0.08), vec3(1.0)), lite * 0.6);` : ''}
          ${o.shell ? `
          // shell fur: tiny strands, thinning toward the tips; darker at the root (self-shadow)
          float strand = mh3(floor(p * 900.0));
          float fur = vFx.z;
          if (fur < 0.05 || strand < uShell * 1.05) discard;
          diffuseColor.rgb *= 0.82 + 0.26 * uShell;` : ''}
        }`);
  };
  mat.customProgramCacheKey = () => `mascot:${o.spots}:${o.shell ? o.shell.index : -1}`;
}

function makeMaterials(furQuality: FurQuality) {
  const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.34, 0.3, 0.42) });
  patchMaterial(skin, { spots: true, fur: 1 });
  const fin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.4, sheenRoughness: 0.4 });
  patchMaterial(fin, { spots: false, fur: 0 });
  const horn = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.15 });
  patchMaterial(horn, { spots: false, fur: 0 });
  const ink = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5 });
  patchMaterial(paint, { spots: false, fur: 0 });
  const claw = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.4 });
  const shells: THREE.MeshPhysicalMaterial[] = [];
  const count = furQuality === 'high' ? 8 : furQuality === 'medium' ? 4 : 0;
  for (let i = 0; i < count; i++) {
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.85, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.34, 0.3, 0.42) });
    patchMaterial(m, { spots: true, fur: 1, shell: { index: i, count, length: 0.0045 } });
    shells.push(m);
  }
  return { skin, fin, horn, ink, paint, claw, shells };
}

// ------------------------------------------------------------------ springs
interface SpringSpec { stiffness: number; drag: number; maxDeg: number; animated: boolean }
const SPRING_FOR = (name: string): SpringSpec | null => {
  if (/^fin_[fb]\d+_0$/.test(name)) return { stiffness: 5.5, drag: 0.42, maxDeg: 16, animated: false };
  if (/^fin_[fb]\d+_1$/.test(name)) return { stiffness: 3.6, drag: 0.36, maxDeg: 20, animated: false };
  if (/^fin_[dt]\d+_0$/.test(name)) return { stiffness: 6.5, drag: 0.45, maxDeg: 12, animated: false };
  if (/^fin_[dt]\d+_1$/.test(name)) return { stiffness: 4.5, drag: 0.4, maxDeg: 16, animated: false };
  if (/^horn_\d+$/.test(name)) return { stiffness: 11, drag: 0.55, maxDeg: 6, animated: false };
  if (name === 'head') return { stiffness: 14, drag: 0.5, maxDeg: 6, animated: true };
  if (name === 'arm_L' || name === 'arm_R') return { stiffness: 12, drag: 0.45, maxDeg: 10, animated: true };
  if (name === 'tail_3' || name === 'tail_4') return { stiffness: 7, drag: 0.4, maxDeg: 18, animated: true };
  return null;
};

class SpringJoint {
  bone: THREE.Bone; spec: SpringSpec; depth: number;
  localTail: THREE.Vector3; axis: THREE.Vector3; length = 0; restQ: THREE.Quaternion;
  cur = new THREE.Vector3(); prev = new THREE.Vector3(); ready = false;
  constructor(bone: THREE.Bone, spec: SpringSpec, localTail: THREE.Vector3) {
    this.bone = bone; this.spec = spec; this.localTail = localTail.clone();
    this.axis = localTail.clone().normalize(); this.restQ = bone.quaternion.clone();
    let d = 0; let p: THREE.Object3D | null = bone; while (p) { d++; p = p.parent; } this.depth = d;
  }
  private static _v = new THREE.Vector3(); private static _h = new THREE.Vector3(); private static _q = new THREE.Quaternion();
  private static _pq = new THREE.Quaternion(); private static _t = new THREE.Vector3(); private static _s = new THREE.Vector3();
  update(dt: number) {
    const b = this.bone, parent = b.parent!; const { _h: head, _pq: pq, _q: q, _t: tgt, _v: v, _s: sc } = SpringJoint;
    const rest = this.spec.animated ? b.quaternion.clone() : this.restQ;
    b.getWorldPosition(head); parent.getWorldQuaternion(pq); parent.getWorldScale(sc);
    const len = this.localTail.length() * sc.x;
    // target tail in world = head + parentRot * rest * axis * len
    q.copy(pq).multiply(rest); tgt.copy(this.axis).applyQuaternion(q).multiplyScalar(len).add(head);
    if (!this.ready) { this.cur.copy(tgt); this.prev.copy(tgt); this.ready = true; this.length = len; }
    const k = Math.min(1, this.spec.stiffness * dt);
    v.copy(this.cur).sub(this.prev).multiplyScalar(1 - this.spec.drag);              // inertia
    const next = this.cur.clone().add(v).add(tgt.clone().sub(this.cur).multiplyScalar(k)); // spring toward the animated/rest pose
    next.sub(head).normalize();
    // firmness: limit the bend away from the target direction
    const tdir = tgt.clone().sub(head).normalize();
    const ang = next.angleTo(tdir), maxA = THREE.MathUtils.degToRad(this.spec.maxDeg);
    if (ang > maxA) next.lerp(tdir, 1 - maxA / ang).normalize();
    next.multiplyScalar(len).add(head);
    this.prev.copy(this.cur); this.cur.copy(next);
    // rotate the bone so its axis points at the simulated tail
    const localDir = next.clone().sub(head).applyQuaternion(q.clone().invert()).normalize();
    b.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromUnitVectors(this.axis, localDir));
    b.updateMatrixWorld(true);
  }
  reset() { this.ready = false; }
}

// ------------------------------------------------------------------ the mascot
export interface MascotOptions { fur?: FurQuality; reducedMotion?: boolean }

export class MascotRig {
  root: THREE.Object3D; mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  base = 'idle'; oneshot: THREE.AnimationAction | null = null; current = 'idle';
  energy = 0; reduced: boolean;
  springs: SpringJoint[] = [];
  bones: Record<string, THREE.Bone> = {};
  prop: THREE.Object3D | null = null; propRestQ = new THREE.Quaternion();
  hold: [number, number] = [0, 0];
  private holdTarget: [number, number] = [1, 1];
  onClip?: (name: string) => void;

  constructor(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, opts: MascotOptions = {}) {
    this.root = gltf.scene; this.reduced = !!opts.reducedMotion;
    const mats = makeMaterials(opts.fur ?? 'medium');
    const shellHosts: THREE.SkinnedMesh[] = [];
    this.root.traverse((o: any) => {
      if (o.isBone) this.bones[o.name] = o;
      if (!o.isMesh) return;
      const name: string = o.material?.name || '';
      const m = name.startsWith('skin') ? mats.skin : name.startsWith('fin') ? mats.fin : name.startsWith('horn') ? mats.horn
        : name.startsWith('ink') ? mats.ink : name.startsWith('claw') ? mats.claw : name.startsWith('paint') ? mats.paint : null;
      if (m) o.material = m;
      o.frustumCulled = false;
      if (name.startsWith('skin') && o.isSkinnedMesh && o.geometry.attributes.position.count > 10000) shellHosts.push(o);
    });
    // fur shells: extra skinned copies of the body skin sharing geometry + skeleton
    for (const host of shellHosts) {
      mats.shells.forEach((sm, i) => {
        const s = new THREE.SkinnedMesh(host.geometry, sm);
        s.bind(host.skeleton, host.bindMatrix); s.frustumCulled = false; s.renderOrder = i + 1; s.name = `${host.name}_fur${i}`;
        host.parent!.add(s); s.position.copy(host.position); s.quaternion.copy(host.quaternion); s.scale.copy(host.scale);
      });
    }
    // clips
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    const ex = gltf.animations.find(c => c.name === 'excited');
    if (ex) this.actions.__energy = this.mixer.clipAction(new THREE.AnimationClip('__energy', ex.duration, ex.tracks.filter(t => !FACE_TRACK.test(t.name))));
    this.mixer.addEventListener('finished', (e: any) => { if (e.action === this.oneshot) { this.oneshot = null; this.fadeTo(this.base, 0.35); } });
    this.actions.idle?.play();
    if (this.actions.__energy) { this.actions.__energy.play(); this.actions.__energy.setEffectiveWeight(0); }
    // springs — tails come from the armature extras (Blender rest positions), else from the child bone
    this.root.updateMatrixWorld(true);
    let armature: THREE.Object3D | null = null;
    this.root.traverse((o: any) => { if (!armature && o.userData?.spring_tails) armature = o; });
    const tails: Record<string, number[]> = (armature as any)?.userData?.spring_tails ?? {};
    const toThree = (p: number[]) => new THREE.Vector3(p[0], p[2], -p[1]);   // Blender Z-up → glTF Y-up
    for (const [name, bone] of Object.entries(this.bones)) {
      const spec = SPRING_FOR(name); if (!spec) continue;
      let local: THREE.Vector3 | null = null;
      if (tails[name] && armature) {
        const w = toThree(tails[name]); (armature as THREE.Object3D).localToWorld(w); local = bone.worldToLocal(w.clone());
      } else {
        const child = bone.children.find((c: any) => c.isBone) as THREE.Bone | undefined;
        if (child) local = child.position.clone();
      }
      if (local && local.lengthSq() > 1e-8) this.springs.push(new SpringJoint(bone, this.reduced ? { ...spec, maxDeg: spec.maxDeg * 0.5 } : spec, local));
    }
    this.springs.sort((a, b) => a.depth - b.depth);
  }

  // ---------------------------------------------------------------- clips
  fadeTo(name: string, dur = 0.3) {
    const next = this.actions[name]; if (!next) return;
    for (const [n, a] of Object.entries(this.actions)) if (n !== name && n !== '__energy' && a.isRunning()) a.fadeOut(dur);
    next.reset().setEffectiveTimeScale(this.reduced ? 0.6 : 1).setEffectiveWeight(1).fadeIn(dur).play();
    if (LOOPS.has(name)) { this.base = name; this.oneshot = null; } else this.oneshot = next;
    this.current = name; this.holdTarget = HOLD[name] ?? [1, 1];
    this.applyEnergy(); this.onClip?.(name);
  }
  setMood(m: MascotMood) {
    const mood = this.reduced && (m === 'hop' || m === 'excited') ? 'idle' : m;
    if (this.oneshot) this.base = mood; else if (this.base !== mood) this.fadeTo(mood);
  }
  react(r: MascotReaction) { this.fadeTo(this.reduced && r === 'cheer' ? 'nod_yes' : r, 0.15); }
  setEnergy(e: number) { this.energy = this.reduced ? 0 : Math.max(0, Math.min(1, e)); this.applyEnergy(); }
  private applyEnergy() {
    const e = this.oneshot || this.base === 'excited' ? 0 : this.energy;
    this.actions.__energy?.setEffectiveWeight(e);
    const base = this.actions[this.base]; if (base && !this.oneshot) base.setEffectiveWeight(1 - e * 0.6);
  }

  // ---------------------------------------------------------------- props
  /** Attach an interchangeable prop (a loaded glTF scene). Pass null to remove. */
  setProp(obj: THREE.Object3D | null) {
    const socket = this.bones.prop; if (!socket) return;
    if (this.prop) socket.remove(this.prop);
    this.prop = obj;
    if (!obj) return;
    // align the prop's own up/front with the character at bind pose, independent of the socket bone's axes
    const sq = new THREE.Quaternion(); socket.getWorldQuaternion(sq);
    const rq = new THREE.Quaternion(); this.root.getWorldQuaternion(rq);
    obj.quaternion.copy(sq.invert().multiply(rq)); obj.position.set(0, 0, 0);
    obj.traverse((o: any) => { if (o.isMesh) o.frustumCulled = false; });
    socket.add(obj);
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    if (this.prop) this.holdIK(dt);
    // sub-step springs for stability at low frame rates
    const steps = dt > 1 / 45 ? 2 : 1;
    for (let s = 0; s < steps; s++) for (const j of this.springs) j.update(dt / steps);
  }

  private holdIK(dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    this.hold[0] += (this.holdTarget[0] - this.hold[0]) * k; this.hold[1] += (this.holdTarget[1] - this.hold[1]) * k;
    const socket = this.bones.prop; const sp = new THREE.Vector3(); socket.getWorldPosition(sp);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    (['L', 'R'] as const).forEach((side, i) => {
      const w = this.hold[i]; if (w < 0.01) return;
      const arm = this.bones[`arm_${side}`], hand = this.bones[`hand_${side}`]; if (!arm || !hand) return;
      const sh = new THREE.Vector3(); arm.getWorldPosition(sh);
      const hp = new THREE.Vector3(); hand.getWorldPosition(hp);
      const tgt = sp.clone().addScaledVector(right, side === 'L' ? 0.085 : -0.085);
      const a = hp.sub(sh).normalize(), b = tgt.sub(sh).normalize();
      const qw = new THREE.Quaternion().setFromUnitVectors(a, b);
      qw.slerp(new THREE.Quaternion(), 1 - w);
      const pq = arm.parent!.getWorldQuaternion(new THREE.Quaternion());
      const local = pq.clone().invert().multiply(qw).multiply(pq);
      arm.quaternion.premultiply(local); arm.updateMatrixWorld(true);
    });
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
