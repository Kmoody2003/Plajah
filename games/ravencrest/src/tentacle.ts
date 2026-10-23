import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';

/**
 * TentacleFlesh — heavy-flesh secondary motion for the River Kraken tentacles.
 *
 * The GLB (kraken_tentacle.glb / kraken_tentacle_b.glb) ships a clean 25-bone
 * chain (Tentacle_Root, Tentacle_01..24) with baked clips. This sim sits
 * BETWEEN the animation and the render: each frame it reads the bones' posed
 * world positions as targets, chases them with a verlet chain that has real
 * mass gradient (base heavy, tip light and whippy), segment constraints and
 * world collision — then writes the result back onto the bones. The lag,
 * overshoot and settle ARE the kaiju flesh feel; the baked clips stay the
 * performance, the sim makes it weigh something.
 *
 * Impacts are the payoff: when a node slaps the world (bridge deck) the sim
 * fires onImpact AND spawns a REVERB WAVE — a damped oscillation that travels
 * along the chain from the contact point at waveSpeed, jiggling bone girth as
 * it passes, so a slam visibly ripples through the whole arm. Waterline
 * crossings fire onSplash (wire it to addMoatRipple + the splash SFX).
 *
 * Loop order in main.ts:
 *   mixer.update(dt);            // pose the clip
 *   flesh.captureTargets();      // read posed bone world positions
 *   flesh.update(dt);            // simulate + write bones back
 *   render...
 * If no clip is playing, call captureTargets() anyway: targets fall back to
 * the rest spine under the root's placement, and gameplay code can steer the
 * arm purely with impulse() + root placement.
 */
export interface TentacleOpts {
  world?: CollisionWorld;
  /** Spring toward the posed targets. Higher = stiffer, snappier flesh. */
  stiffness?: number;
  /** Extra gravity on the chain (m/s^2). Flesh in air wants ~7; the default
   * 3.5 reads as buoyancy-heavy, half-supported by the water. */
  gravity?: number;
  /** Reverb wave travel speed along the arm, m/s. */
  waveSpeed?: number;
  /** Reverb oscillation frequency, Hz. Low = slow jelly wobble. */
  waveFreq?: number;
  /** Reverb decay time constant, s. */
  waveDecay?: number;
  /** Multiplier on the collision/jiggle radius (variant B is ~1.22x). */
  radiusScale?: number;
  /** World-space water height. Defaults to the tentacle root's world Y. */
  waterY?: number;
  onImpact?: (pos: THREE.Vector3, speed: number, node: number) => void;
  onSplash?: (pos: THREE.Vector3, speed: number, node: number) => void;
}

interface Wave { t0: number; node: number; amp: number; dir: THREE.Vector3 }

const BONE_NAMES = ['Tentacle_Root', ...Array.from({ length: 24 }, (_, i) => `Tentacle_${String(i + 1).padStart(2, '0')}`)];
const UP = new THREE.Vector3(0, 1, 0);
const REFX = new THREE.Vector3(1, 0, 0);

export class TentacleFlesh {
  readonly bones: THREE.Bone[] = [];
  private pos: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private target: THREE.Vector3[] = [];
  private segLen = 0.56;
  private waves: Wave[] = [];
  private lastHit: number[] = [];
  private wasAbove: boolean[] = [];
  private opts: Required<Omit<TentacleOpts, 'world' | 'onImpact' | 'onSplash' | 'waterY'>> & TentacleOpts;
  private acc = 0;
  private time = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpM = new THREE.Matrix4();

  constructor(root: THREE.Object3D, opts: TentacleOpts = {}) {
    this.opts = {
      stiffness: 26, gravity: 3.5, waveSpeed: 7.5, waveFreq: 2.1,
      waveDecay: 0.55, radiusScale: 1, ...opts,
    };
    const byName = new Map<string, THREE.Bone>();
    root.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
    for (const n of BONE_NAMES) {
      const b = byName.get(n);
      if (!b) throw new Error(`TentacleFlesh: bone ${n} not found — is this a kraken tentacle GLB?`);
      this.bones.push(b);
    }
    root.updateMatrixWorld(true);
    for (const b of this.bones) {
      const p = new THREE.Vector3();
      b.getWorldPosition(p);
      this.pos.push(p.clone());
      this.prev.push(p.clone());
      this.target.push(p.clone());
      this.lastHit.push(-10);
      this.wasAbove.push(true);
    }
    if (this.pos.length > 1) this.segLen = this.pos[0].distanceTo(this.pos[1]) || this.segLen;
  }

  /** Radius of the arm at node i (matches the GLB's taper). */
  radiusAt(i: number): number {
    const s = i / (this.pos.length - 1);
    return (0.05 + 0.75 * Math.pow(1 - s, 1.35)) * this.opts.radiusScale;
  }

  /** Read the currently posed bone world positions as sim targets.
   * Call after AnimationMixer.update(), before flesh.update(). */
  captureTargets(): void {
    for (let i = 0; i < this.bones.length; i++) this.bones[i].getWorldPosition(this.target[i]);
  }

  /** Velocity kick (whip cracks, shoves, recoil from a parry). */
  impulse(node: number, dir: THREE.Vector3, power: number): void {
    const i = THREE.MathUtils.clamp(node, 0, this.prev.length - 1);
    this.prev[i].addScaledVector(dir, -power);
  }

  tipSpeed(): number {
    const n = this.pos.length - 1;
    return this.pos[n].distanceTo(this.prev[n]) * 60;
  }

  private spawnWave(node: number, amp: number, dir: THREE.Vector3): void {
    this.waves.push({ t0: this.time, node, amp: THREE.MathUtils.clamp(amp, 0.02, 0.3), dir: dir.clone().normalize() });
    if (this.waves.length > 6) this.waves.shift();
  }

  update(dt: number): void {
    const h = 1 / 60;
    this.acc = Math.min(this.acc + dt, 0.12);
    while (this.acc >= h) {
      this.step(h);
      this.acc -= h;
      this.time += h;
    }
    this.writeBones();
  }

  private step(h: number): void {
    const N = this.pos.length;
    const { stiffness, gravity } = this.opts;
    const anchor = this.target[0];
    // verlet integrate toward targets; mass gradient: base is sluggish,
    // the tip keeps its momentum (whip + lag = flesh)
    for (let i = 1; i < N; i++) {
      const s = i / (N - 1);
      const p = this.pos[i], pv = this.prev[i];
      const damp = 0.90 - 0.07 * s;                    // tip retains more velocity
      const vx = (p.x - pv.x) * damp, vy = (p.y - pv.y) * damp, vz = (p.z - pv.z) * damp;
      const mass = 1 + 2.4 * (1 - s);                  // base is heavy
      const k = (stiffness / mass) * h * h;
      pv.copy(p);
      p.x += vx + (this.target[i].x - p.x) * k;
      p.y += vy + (this.target[i].y - p.y) * k - gravity * (0.35 + 0.65 * s) * h * h;
      p.z += vz + (this.target[i].z - p.z) * k;
    }
    this.pos[0].copy(anchor);
    this.prev[0].copy(anchor);
    // segment constraints
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < N - 1; i++) {
        const a = this.pos[i], b = this.pos[i + 1];
        this.tmpA.subVectors(b, a);
        const d = this.tmpA.length() || 1e-5;
        const diff = (d - this.segLen) / d;
        if (i === 0) b.addScaledVector(this.tmpA, -diff);
        else {
          a.addScaledVector(this.tmpA, diff * 0.5);
          b.addScaledVector(this.tmpA, -diff * 0.5);
        }
      }
      this.pos[0].copy(anchor);
    }
    // collision + impact events + waterline crossings
    const world = this.opts.world;
    const waterY = this.opts.waterY ?? anchor.y;
    for (let i = 1; i < N; i++) {
      const p = this.pos[i];
      this.tmpB.subVectors(p, this.prev[i]).divideScalar(h); // velocity
      const speed = this.tmpB.length();
      if (world) {
        const before = this.tmpC.copy(p);
        const res = world.resolve(p, this.radiusAt(i) * 0.9, this.radiusAt(i) * 1.6);
        p.copy(res.pos);
        const pen = p.distanceTo(before);
        if (pen > 0.01 && this.time - this.lastHit[i] > 0.25) {
          this.lastHit[i] = this.time;
          // reverb bursts from the contact, travelling both ways along the arm
          this.tmpA.subVectors(this.pos[Math.min(i + 1, N - 1)], this.pos[Math.max(i - 1, 0)]);
          const dir = new THREE.Vector3().crossVectors(this.tmpA, UP);
          if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
          this.spawnWave(i, 0.028 * speed, dir);
          this.opts.onImpact?.(p.clone(), speed, i);
        }
      }
      const above = p.y > waterY;
      if (above !== this.wasAbove[i] && speed > 0.8) this.opts.onSplash?.(p.clone(), speed, i);
      this.wasAbove[i] = above;
    }
  }

  /** Offset of a node from all live reverb waves at the current time. */
  private waveOffset(i: number, out: THREE.Vector3): number {
    out.set(0, 0, 0);
    let girth = 0;
    const s = i / (this.pos.length - 1);
    for (const w of this.waves) {
      const dist = Math.abs(i - w.node) * this.segLen;
      const local = (this.time - w.t0) - dist / this.opts.waveSpeed;
      if (local <= 0) continue;
      const env = w.amp * Math.exp(-local / this.opts.waveDecay) * Math.exp(-dist * 0.05);
      if (env < 0.001) continue;
      const ph = Math.sin(2 * Math.PI * this.opts.waveFreq * local);
      out.addScaledVector(w.dir, env * ph * (0.35 + 0.65 * s));
      girth += env * Math.cos(2 * Math.PI * this.opts.waveFreq * local);
    }
    return girth;
  }

  private writeBones(): void {
    const N = this.bones.length;
    const pts: THREE.Vector3[] = [];
    const girths: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = this.pos[i].clone();
      girths.push(this.waveOffset(i, this.tmpA));
      p.add(this.tmpA);
      pts.push(p);
    }
    for (let i = 0; i < N; i++) {
      const bone = this.bones[i];
      const yA = this.tmpA.subVectors(pts[Math.min(i + 1, N - 1)], pts[i]);
      if (yA.lengthSq() < 1e-8) yA.set(0, 1, 0);
      yA.normalize();
      const zA = this.tmpB.crossVectors(REFX, yA);
      if (zA.lengthSq() < 1e-4) zA.set(0, 0, 1); else zA.normalize();
      const xA = this.tmpC.crossVectors(yA, zA).normalize();
      this.tmpM.makeBasis(xA, yA, zA);
      this.tmpQ.setFromRotationMatrix(this.tmpM);
      const parent = bone.parent!;
      parent.getWorldQuaternion(this.tmpQ2).invert();
      bone.quaternion.copy(this.tmpQ2.multiply(this.tmpQ));
      bone.position.copy(parent.worldToLocal(pts[i].clone()));
      // flesh girth jiggle from the reverb field: swell out of phase with the
      // bend, roughly volume-preserving
      const g = THREE.MathUtils.clamp(girths[i] * 1.4, -0.12, 0.16);
      bone.scale.set(1 + g, 1 - g * 0.5, 1 + g);
    }
  }
}
