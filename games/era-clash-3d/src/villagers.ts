// The villagers the raiders hold: farmers and fisherfolk in hemp and indigo, kneeling with their heads down under
// straw hats where their captors stand over them. Cut the captors down and reach them, and they get up and run for
// the hill (the temple is safety). Simple sculpted figures (robe, obi, hat or topknot) that read at fighting
// distance; a painted villager from Muse can replace them later through the rig pipeline.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './core/character';

/** The villagers from the reference pack's turnaround sheet (scripts/eraclash3d/buildSheetCast.py). */
const MODELS = ['fisherman', 'carpenter', 'peasant'].map((id) => `/games/era-clash/3d/assets/characters/${id}.glb`);
const HEIGHT = [1.62, 1.68, 1.56];

export interface Villager { group: THREE.Group; body: THREE.Group; rig?: Rigged; state: 'held' | 'freeing' | 'fleeing' | 'safe'; t: number; free: number; home: THREE.Vector3; phase: number }

const ROBES = [0x2c3c5a, 0x6a5a3e, 0x8a7a5a, 0x3e4a3a, 0x5a3a2e, 0x9a8a6a].map((c) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.95 }));
const OBI = new THREE.MeshStandardNodeMaterial({ color: 0x2a1a12, roughness: 0.9 });
const SKIN = new THREE.MeshStandardNodeMaterial({ color: 0xc89a78, roughness: 0.75 });
const HAIR = new THREE.MeshStandardNodeMaterial({ color: 0x141010, roughness: 0.6 });
const STRAW = new THREE.MeshStandardNodeMaterial({ color: 0xc8a868, roughness: 1 });
const RING = new THREE.MeshBasicNodeMaterial({ color: 0xf0c46a, transparent: true, opacity: 0.0, depthWrite: false });

function figure(i: number) {
  const g = new THREE.Group();
  const robe = ROBES[i % ROBES.length];
  // standing proportions; the kneel is a pose on top
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 0.9, 10), robe); skirt.position.y = 0.45;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 10), robe); chest.position.y = 1.15;
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.14, 10), OBI); obi.position.y = 0.92;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), SKIN); head.position.y = 1.55; head.scale.set(1, 1.12, 1);
  const parts: THREE.Mesh[] = [skirt, chest, obi, head];
  if (i % 3 !== 1) { const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.16, 16), STRAW); hat.position.y = 1.7; parts.push(hat); }
  else { const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), HAIR); knot.position.set(0, 1.6, -0.02); knot.scale.set(1.02, 0.8, 1.05); const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 6), HAIR); top.position.set(0, 1.7, -0.04); top.rotation.x = -0.6; parts.push(knot, top); }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8), robe); arm.position.set(s * 0.22, 1.15, 0.05); arm.rotation.z = s * 0.25; arm.rotation.x = -0.35; parts.push(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), SKIN); hand.position.set(s * 0.25, 0.9, 0.2); parts.push(hand);
  }
  for (const m of parts) { m.castShadow = true; g.add(m); }
  return g;
}

interface Rigged { mixer: THREE.AnimationMixer; idle?: THREE.AnimationAction; run?: THREE.AnimationAction; bones: Record<string, THREE.Object3D | undefined>; rest: Map<THREE.Object3D, THREE.Quaternion> }

// Bends about the figure's own left-right axis (radians; + tips the bone's far end forward for the spine, back for
// the legs' down-pointing bones), applied root-to-tip in world space so the rig's own bone axes don't matter.
const KNEEL: [string, number][] = [
  ['LeftUpLeg', -1.25], ['RightUpLeg', -1.25], ['LeftLeg', 2.65], ['RightLeg', 2.65], ['LeftFoot', -0.5], ['RightFoot', -0.5],
  ['Spine', 0.3], ['Spine1', 0.2], ['Neck', 0.35], ['LeftArm', -0.55], ['RightArm', -0.55], ['LeftForeArm', -0.5], ['RightForeArm', -0.5],
];
const KNEEL_DROP = 0.58;
const _axis = new THREE.Vector3(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _q = new THREE.Quaternion();

export class Villagers {
  readonly group = new THREE.Group();
  readonly list: Villager[] = [];
  private rings: THREE.Mesh[] = [];
  /** A villager freed / reached safety. */
  onFreed: ((v: Villager) => void) | null = null;

  constructor(huddles: THREE.Vector3[], per = 2) {
    this.group.name = 'villagers';
    huddles.forEach((h, k) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 40).rotateX(-Math.PI / 2), RING.clone());
      ring.position.copy(h).add(new THREE.Vector3(0, 0.05, 0)); this.group.add(ring); this.rings.push(ring);
      for (let i = 0; i < per; i++) {
        const group = new THREE.Group(), body = figure(k * per + i);
        group.add(body);
        group.position.copy(h).add(new THREE.Vector3((i - (per - 1) / 2) * 0.75, 0, (i % 2) * 0.3));
        group.rotation.y = Math.PI + (Math.random() - 0.5) * 0.8;
        this.group.add(group);
        this.list.push({ group, body, state: 'held', t: 0, free: 0, home: h.clone(), phase: Math.random() * 6 });
      }
    });
  }
  /** Swap the sculpted stand-ins for the painted, rigged villagers (keeps the stand-ins if a model fails). */
  async dress() {
    const files = await Promise.all(MODELS.map((u) => loadGLB(u).catch(() => null)));
    this.list.forEach((v, i) => {
      const k = i % files.length, f = files[k];
      if (!f) return;
      const node = cloneSkinned(f.scene);
      const box = new THREE.Box3().setFromObject(f.scene);
      node.scale.setScalar(HEIGHT[k] / Math.max(0.3, box.max.y - box.min.y));
      node.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.castShadow = true; m.frustumCulled = false;
        const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.roughnessMap = null; mat.roughness = 0.92; mat.color.setHex(0xccc2ba); m.material = mat;   // hemp and indigo, not gloss
      });
      const mixer = new THREE.AnimationMixer(node);
      const clip = (n: string) => f.animations.find((a) => a.name === n);
      const idle = clip('idle') ? mixer.clipAction(clip('idle')!) : undefined;
      const run = clip('run') ? mixer.clipAction(clip('run')!) : undefined;
      idle?.play(); idle && (idle.time = Math.random() * 2);
      const bones: Rigged['bones'] = {};
      for (const [n] of KNEEL) bones[n] = node.getObjectByName(n);
      bones.root = node;
      const rest = new Map<THREE.Object3D, THREE.Quaternion>();
      for (const [n] of KNEEL) { const b = bones[n]; if (b) rest.set(b, b.quaternion.clone()); }
      v.group.remove(v.body);
      v.body = new THREE.Group(); v.body.add(node); v.group.add(v.body);
      v.rig = { mixer, idle, run, bones, rest };
    });
  }

  /** Animate, then bend: bones the clip doesn't key go back to rest first, so the bend never compounds. */
  private pose(v: Villager, dt: number, k: number) {
    if (!v.rig) return;
    for (const [b, q] of v.rig.rest) b.quaternion.copy(q);
    v.rig.mixer.update(dt);
    this.kneel(v, k);
  }

  private kneel(v: Villager, k: number) {
    if (!v.rig || k <= 0) return;
    const root = v.rig.bones.root!;
    root.updateWorldMatrix(true, false);
    _axis.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(_wq)).normalize();   // the figure's left-right axis
    for (const [n, a] of KNEEL) {
      const b = v.rig.bones[n]; if (!b || !b.parent) continue;
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(_pq);
      // world-space turn → the parent's frame: q_local = inv(P) · q_world · P
      _q.setFromAxisAngle(_axis, a * k);
      b.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq));
      b.updateWorldMatrix(false, false);
    }
  }

  get saved() { return this.list.filter((v) => v.state === 'fleeing' || v.state === 'safe').length; }
  get total() { return this.list.length; }

  /** `hero`: Haru's position; `threat(at)`: is a raider still standing over this spot? `heightAt` for the run. */
  update(dt: number, t: number, hero: THREE.Vector3, threat: (at: THREE.Vector3) => boolean, heightAt: (x: number, z: number) => number, safety: THREE.Vector3, road?: (z: number) => number) {
    for (const v of this.list) {
      const g = v.group, b = v.body;
      if (v.state === 'held' || v.state === 'freeing') {
        // kneeling, head bowed, trembling
        if (v.rig) { this.pose(v, dt * 0.5, 1); b.position.y = -KNEEL_DROP; b.rotation.x = Math.sin(t * 23 + v.phase) * 0.01; }
        else { b.position.y = -0.62; b.rotation.x = 0.55 + Math.sin(t * 23 + v.phase) * 0.012; }
        const near = hero.distanceTo(v.home) < 3.2 && !threat(v.home);
        v.state = near ? 'freeing' : 'held';
        v.free = near ? v.free + dt : Math.max(0, v.free - dt * 2);
        if (v.free > 0.7) { v.state = 'fleeing'; v.t = 0; this.onFreed?.(v); }
      } else if (v.state === 'fleeing') {
        v.t += dt;
        const k = Math.min(1, v.t / 0.35);
        if (v.rig) {
          if (k >= 1 && v.rig.run && !v.rig.run.isRunning()) { v.rig.run.reset().play(); v.rig.idle?.crossFadeTo(v.rig.run, 0.15, false); }
          this.pose(v, dt, 1 - k); b.position.y = -KNEEL_DROP * (1 - k); b.rotation.x = 0;
        } else { b.position.y = -0.62 * (1 - k); b.rotation.x = 0.55 * (1 - k); }
        if (k >= 1) {
          // up the road (not through the houses) until the safe ground is close
          const ahead = Math.min(g.position.z + 5, safety.z);
          const goal = road && safety.z - g.position.z > 6 ? new THREE.Vector3(road(ahead), 0, ahead) : safety;
          const to = goal.clone().sub(g.position).setY(0);
          if (g.position.distanceTo(safety) < 1.8 || v.t > 30) { v.state = 'safe'; g.visible = false; continue; }
          to.normalize();
          g.position.addScaledVector(to, 4.6 * dt);
          g.position.y = heightAt(g.position.x, g.position.z) + (v.rig ? 0 : Math.abs(Math.sin(v.t * 12)) * 0.06);
          g.rotation.y = Math.atan2(to.x, to.z);
          b.rotation.x = v.rig ? 0 : 0.18;
        }
      }
    }
    // a gold ring round each held group: it brightens as you free them
    this.rings.forEach((r, i) => {
      const vs = this.list.filter((v) => v.home.equals(r.position.clone().setY(r.position.y - 0.05)));
      const held = vs.some((v) => v.state === 'held' || v.state === 'freeing');
      const fr = Math.max(0, ...vs.map((v) => v.free));
      (r.material as THREE.MeshBasicNodeMaterial).opacity = held ? 0.25 + 0.2 * Math.sin(t * 4 + i) + fr * 0.6 : Math.max(0, (r.material as THREE.MeshBasicNodeMaterial).opacity - dt);
    });
  }
}
