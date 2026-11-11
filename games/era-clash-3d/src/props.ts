// Loose props you fight with (after Ravencrest's DynWorld, physics.ts): pots and jars to pick up and throw,
// tables, crates and barrels to kick into a raider. Bodies are spheres resolved against the level BVH like the
// player capsule, with gravity, bounce, friction, rolling barrels and tumbling tables; they sleep until touched.
// Anything flying fast enough hurts the first raider it meets; pottery shatters, crates splinter on a hard hit.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './core/collision';

export type PropKind = 'pot' | 'jar' | 'crate' | 'barrel' | 'table';
const SPEC: Record<PropKind, { r: number; h: number; rest: number; fric: number; roll: boolean; grab: boolean; breaks: 'shatter' | 'splinter' | null; dmg: number; mass: number }> = {
  pot:    { r: 0.22, h: 0.4, rest: 0.25, fric: 5, roll: false, grab: true, breaks: 'shatter', dmg: 20, mass: 1 },
  jar:    { r: 0.32, h: 0.78, rest: 0.2, fric: 5, roll: false, grab: true, breaks: 'shatter', dmg: 28, mass: 2 },
  crate:  { r: 0.4, h: 0.62, rest: 0.25, fric: 4, roll: false, grab: true, breaks: 'splinter', dmg: 26, mass: 2.5 },
  barrel: { r: 0.33, h: 0.82, rest: 0.35, fric: 1.4, roll: true, grab: false, breaks: null, dmg: 24, mass: 3 },
  table:  { r: 0.72, h: 0.76, rest: 0.2, fric: 3.5, roll: false, grab: false, breaks: null, dmg: 22, mass: 3 },
};

export interface Body {
  mesh: THREE.Mesh; kind: PropKind; vel: THREE.Vector3; spin: THREE.Vector3; asleep: boolean; still: number;
  held: boolean; hostile: number; gone: boolean; hitMobs: Set<unknown>;
}
/** Something a flying prop can hit (a raider). */
export interface Target { pos: THREE.Vector3; alive: boolean; ref: unknown }

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

export class Props {
  readonly group = new THREE.Group();
  readonly bodies: Body[] = [];
  private shards: { m: THREE.Mesh; v: THREE.Vector3; s: THREE.Vector3; t: number }[] = [];
  private shardGeo = new THREE.TetrahedronGeometry(0.07);
  private splinterGeo = new THREE.BoxGeometry(0.06, 0.04, 0.42);
  private acc = 0;
  /** A flying prop met a raider: deal `dmg` (the caller decides what that does). */
  onHit: ((b: Body, target: Target, speed: number, dmg: number) => void) | null = null;
  /** A pot shattered / a crate splintered / something landed hard (sound + dust). */
  onBreak: ((b: Body, how: 'shatter' | 'splinter') => void) | null = null;
  onThud: ((pos: THREE.Vector3, speed: number, kind: PropKind) => void) | null = null;

  /** Instanced draws: one per geometry × material (a few draw calls for every prop in the chapter). */
  private batches: { mesh: THREE.InstancedMesh; bodies: Body[] }[] = [];
  private _m = new THREE.Matrix4();
  private static ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private world: CollisionWorld) { this.group.name = 'props'; }

  /** Call once every prop is added: hide the proxies and draw them instanced instead. */
  batch() {
    const groups = new Map<string, Body[]>();
    for (const b of this.bodies) {
      const mats = Array.isArray(b.mesh.material) ? b.mesh.material : [b.mesh.material];
      const key = b.mesh.geometry.uuid + '|' + mats.map((m) => m.uuid).join(',');
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(b);
    }
    for (const list of groups.values()) {
      const src = list[0].mesh;
      const mesh = new THREE.InstancedMesh(src.geometry, src.material, list.length);
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.batches.push({ mesh, bodies: list });
      for (const b of list) b.mesh.visible = false;
    }
    this.sync();
  }
  /** Copy each proxy's world transform into its batch (a held prop rides in Haru's hands). */
  sync() {
    for (const { mesh, bodies } of this.batches) {
      bodies.forEach((b, i) => {
        if (b.gone) { mesh.setMatrixAt(i, Props.ZERO); return; }
        b.mesh.updateWorldMatrix(true, false);
        mesh.setMatrixAt(i, b.mesh.matrixWorld);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  add(mesh: THREE.Mesh, kind: PropKind) {
    this.group.add(mesh);
    this.bodies.push({ mesh, kind, vel: new THREE.Vector3(), spin: new THREE.Vector3(), asleep: true, still: 0, held: false, hostile: 0, gone: false, hitMobs: new Set() });
  }
  spec(b: Body) { return SPEC[b.kind]; }

  /** The nearest prop in reach that the hands can lift (in front preferred). */
  nearestGrab(pos: THREE.Vector3, fwd: THREE.Vector3, range = 1.7) {
    let best: Body | null = null, bs = Infinity;
    for (const b of this.bodies) {
      if (b.gone || b.held || !SPEC[b.kind].grab) continue;
      _v.copy(b.mesh.position).sub(pos); if (Math.abs(_v.y) > 1.4) continue; _v.y = 0;
      const d = _v.length(); if (d > range) continue;
      const score = d + (d > 0.01 ? (1 - _v.normalize().dot(fwd)) * 0.8 : 0);
      if (score < bs) { bs = score; best = b; }
    }
    return best;
  }
  grab(b: Body) { b.held = true; b.asleep = true; b.vel.set(0, 0, 0); }
  /** Let go at `from`, flying at `vel` (it is hostile to raiders while it flies). */
  throw(b: Body, from: THREE.Vector3, vel: THREE.Vector3) {
    if (b.mesh.parent !== this.group) this.group.attach(b.mesh);
    b.mesh.position.copy(from);
    b.held = false; b.asleep = false; b.vel.copy(vel); b.hostile = 2.5; b.hitMobs.clear();
    b.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
  }
  /** A kick or a blow: everything in the arc in front is launched (pots in reach break under a punch or a cut). */
  strike(pos: THREE.Vector3, fwd: THREE.Vector3, reach: number, arc: number, power: number, breakPots: boolean) {
    let n = 0;
    for (const b of this.bodies) {
      if (b.gone || b.held) continue;
      _v.copy(b.mesh.position).sub(pos); if (_v.y < -0.8 || _v.y > 1.6) continue; _v.y = 0;
      const d = _v.length(); if (d > reach + SPEC[b.kind].r) continue;
      if (d > 0.3 && Math.acos(THREE.MathUtils.clamp(_v.normalize().dot(fwd), -1, 1)) > arc / 2) continue;
      n++;
      if (breakPots && SPEC[b.kind].breaks === 'shatter') { this.break(b); continue; }
      const m = SPEC[b.kind].mass;
      b.asleep = false; b.hostile = 2; b.hitMobs.clear();
      b.vel.copy(fwd).multiplyScalar(power / Math.sqrt(m)).add(new THREE.Vector3(0, 2.2 + power * 0.12, 0));
      b.spin.set(fwd.z * 9, (Math.random() - 0.5) * 6, -fwd.x * 9).multiplyScalar(b.kind === 'table' ? 1.2 : 0.7);
      // whatever stood on it falls (wares off a kicked table)
      for (const o of this.bodies) if (o !== b && !o.gone && !o.held && o.asleep && o.mesh.position.y > b.mesh.position.y + 0.3 && Math.hypot(o.mesh.position.x - b.mesh.position.x, o.mesh.position.z - b.mesh.position.z) < SPEC[b.kind].r + 0.5) { o.asleep = false; o.vel.copy(b.vel).multiplyScalar(0.5); }
    }
    return n;
  }
  break(b: Body) {
    const how = SPEC[b.kind].breaks; if (!how || b.gone) return;
    b.gone = true; b.mesh.removeFromParent();
    const mat = b.mesh.material as THREE.Material;
    const c = b.mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, SPEC[b.kind].h * 0.5, 0));
    const n = how === 'shatter' ? (b.kind === 'jar' ? 16 : 11) : 9;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(how === 'shatter' ? this.shardGeo : this.splinterGeo, Array.isArray(mat) ? mat[0] : mat);
      m.position.copy(c).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.castShadow = true; this.group.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5).addScaledVector(b.vel, 0.25);
      this.shards.push({ m, v, s: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), t: 3 + Math.random() });
    }
    this.onBreak?.(b, how);
  }

  update(dt: number, player: { pos: THREE.Vector3; vel: THREE.Vector3 }, bodiesNear: { pos: THREE.Vector3; vel: THREE.Vector3 }[], targets: Target[], groundAt: (x: number, z: number) => number) {
    this.acc = Math.min(this.acc + dt, 0.05);
    const step = 1 / 60;
    while (this.acc >= step) { this.simulate(step, player, bodiesNear, targets); this.acc -= step; }
    this.sync();
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i]; s.t -= dt;
      const p = s.m.position, g = groundAt(p.x, p.z) + 0.03;
      if (p.y > g || s.v.y > 0) { s.v.y -= 18 * dt; p.addScaledVector(s.v, dt); s.m.rotation.x += s.s.x * dt; s.m.rotation.y += s.s.y * dt; s.m.rotation.z += s.s.z * dt; if (p.y < g) { p.y = g; s.v.multiplyScalar(0.3); s.v.y = Math.abs(s.v.y) * 0.4; } }
      if (s.t < 0.6) s.m.scale.setScalar(Math.max(0.01, s.t / 0.6));
      if (s.t <= 0) { s.m.removeFromParent(); this.shards.splice(i, 1); }
    }
  }

  private simulate(dt: number, player: { pos: THREE.Vector3; vel: THREE.Vector3 }, pushers: { pos: THREE.Vector3; vel: THREE.Vector3 }[], targets: Target[]) {
    const GRAV = 20;
    for (const b of this.bodies) {
      if (b.gone || b.held) continue;
      const S = SPEC[b.kind], p = b.mesh.position;
      // shoved by the player or a fighter walking (or flying) into it
      for (const q of [player, ...pushers]) {
        _v.copy(p).sub(q.pos); if (_v.y > 1.7 || _v.y < -0.6) continue; _v.y = 0;
        const d = _v.length(), rr = S.r + 0.36;
        if (d < rr && d > 1e-4) {
          _v.normalize(); p.addScaledVector(_v, rr - d);
          const sp = Math.hypot(q.vel.x, q.vel.z);
          b.vel.addScaledVector(_v, Math.max(0.6, sp * (sp > 4 ? 0.9 : 0.5)) / Math.sqrt(S.mass)); if (sp > 4) { b.vel.y = Math.max(b.vel.y, 2); b.hostile = Math.max(b.hostile, 0.6); }
          b.asleep = false;
        }
      }
      if (b.asleep) continue;
      if (b.hostile > 0) b.hostile -= dt;
      b.vel.y -= GRAV * dt;
      const speed = b.vel.length();
      // flying into a raider
      if (b.hostile > 0 && speed > 4) {
        for (const t of targets) {
          if (!t.alive || b.hitMobs.has(t.ref)) continue;
          _v.copy(t.pos).sub(p); const dy = -_v.y; _v.y = 0;
          if (_v.length() < S.r + 0.5 && dy > -0.2 && dy < 1.9) {
            b.hitMobs.add(t.ref);
            this.onHit?.(b, t, speed, S.dmg * Math.min(1.6, speed / 9));
            if (S.breaks === 'shatter' || (S.breaks === 'splinter' && speed > 7)) { this.break(b); break; }
            b.vel.multiplyScalar(-0.25); b.vel.y = Math.abs(b.vel.y) + 1;
          }
        }
        if (b.gone) continue;
      }
      const feet = p.clone().addScaledVector(b.vel, dt);
      const res = this.world.resolve(feet, S.r * 0.92, S.h);
      const impact = -b.vel.y;
      const intended = Math.hypot(b.vel.x, b.vel.z) * dt, got = Math.hypot(res.pos.x - p.x, res.pos.z - p.z);
      if (intended > 1e-4 && got < intended * 0.6) {
        // hit a wall: a thrown pot dies against it, anything else bounces back off
        if (S.breaks === 'shatter' && speed > 5) { this.break(b); continue; }
        b.vel.x *= -0.35; b.vel.z *= -0.35;
        if (speed > 5) this.onThud?.(p.clone(), speed, b.kind);
      }
      p.copy(res.pos);
      if (res.onGround) {
        if (impact > 1.2) {
          if (S.breaks === 'shatter' && impact > 6.5) { this.break(b); continue; }
          b.vel.y = impact * S.rest;
          if (impact > 3) this.onThud?.(p.clone(), impact, b.kind);
        } else b.vel.y = 0;
        const f = Math.exp(-S.fric * dt); b.vel.x *= f; b.vel.z *= f;
        b.spin.multiplyScalar(Math.exp(-6 * dt));
        if (S.roll) {
          _v.set(b.vel.z, 0, -b.vel.x); const sp = _v.length();
          if (sp > 0.01) b.mesh.quaternion.premultiply(_q.setFromAxisAngle(_v.normalize(), (sp / S.r) * dt));
        } else {
          // settle onto a face: upright, or flat on its back if it landed upside down
          const up = UP.clone().applyQuaternion(b.mesh.quaternion);
          const yaw = new THREE.Euler().setFromQuaternion(b.mesh.quaternion, 'YXZ').y;
          const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(up.y < -0.2 ? Math.PI : 0, yaw, 0, 'YXZ'));
          b.mesh.quaternion.slerp(target, 1 - Math.exp(-dt * 10));
        }
        if (b.vel.lengthSq() < 0.01 && b.spin.lengthSq() < 0.05) { b.still += dt; if (b.still > 0.4) { b.asleep = true; b.vel.set(0, 0, 0); b.hostile = 0; } }
        else b.still = 0;
      } else {
        b.still = 0;
        // tumbling through the air
        if (b.spin.lengthSq() > 0.01) { _v.copy(b.spin); const a = _v.length(); b.mesh.quaternion.premultiply(_q.setFromAxisAngle(_v.normalize(), a * dt)); }
      }
    }
  }
}
