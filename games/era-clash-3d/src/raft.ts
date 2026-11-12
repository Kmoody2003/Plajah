// Rafts on the waterways (waterways.ts): log rafts lashed with rope, a punting pole aboard. Step on with G at a
// landing or from the water's edge, steer with the move keys (it carries way and drifts to a stop), step ashore
// with G wherever the bank or a landing stage is within reach. They float on whatever water is under them: the
// canal, the channel (down through the water gate) and the sea off the harbour.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Water } from './waterways';
import type { CollisionWorld } from './core/collision';

const LEN = 3.3, BEAM = 1.5, DECK = 0.2;   // the raft, and its deck's height above the water
const FAST = 3.4, SLOW = 1.5;               // m/s, sprint / walk intent

interface Raft { group: THREE.Group; pos: THREE.Vector3; yaw: number; vel: THREE.Vector3; seed: number }

export class Rafts {
  readonly list: Raft[] = [];
  riding = -1;
  private t = 0;

  constructor(private o: { scene: THREE.Scene; water: Water; posts: { x: number; z: number; r: number }[]; world: () => CollisionWorld | null;
    mats: { wood: THREE.Material; darkWood: THREE.Material } }, spots: { p: THREE.Vector3; yaw: number }[]) {
    const logs: THREE.BufferGeometry[] = [], ties: THREE.BufferGeometry[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const r = 0.105 + ((i * 37) % 5) * 0.004, x = -BEAM / 2 + (i + 0.5) * (BEAM / n);
      const g = new THREE.CylinderGeometry(r, r * 1.08, LEN - ((i * 13) % 3) * 0.12, 9).rotateX(Math.PI / 2);
      g.translate(x, DECK - r, ((i * 7) % 3 - 1) * 0.05);
      logs.push(g);
    }
    for (const z of [-LEN * 0.36, 0, LEN * 0.36]) {
      const b = new THREE.BoxGeometry(BEAM + 0.1, 0.09, 0.12); b.translate(0, DECK + 0.02, z); logs.push(b);
      for (let i = 0; i < n; i++) { const t = new THREE.TorusGeometry(0.11, 0.018, 4, 10).rotateY(Math.PI / 2); t.translate(-BEAM / 2 + (i + 0.5) * (BEAM / n), DECK - 0.1, z + 0.07); ties.push(t); }
    }
    const pole = new THREE.CylinderGeometry(0.03, 0.035, 3.8, 6).rotateX(Math.PI / 2).rotateY(0.08); pole.translate(BEAM / 2 - 0.2, DECK + 0.07, 0.2);
    ties.push(pole);
    const rope = new THREE.MeshStandardNodeMaterial({ color: 0x8a7552, roughness: 1 });
    const logGeo = mergeGeometries(logs.map((g) => g.index ? g.toNonIndexed() : g).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); return g; }), false)!;
    const tieGeo = mergeGeometries(ties.map((g) => g.index ? g.toNonIndexed() : g).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); return g; }), false)!;
    for (const s of spots) {
      const group = new THREE.Group();
      const a = new THREE.Mesh(logGeo, o.mats.wood), b = new THREE.Mesh(tieGeo, rope);
      a.castShadow = a.receiveShadow = b.castShadow = true;
      group.add(a, b); o.scene.add(group);
      this.list.push({ group, pos: s.p.clone(), yaw: s.yaw, vel: new THREE.Vector3(), seed: this.list.length * 1.7 });
    }
    for (const r of this.list) this.place(r, 0);
  }

  /** The raft within reach of a point (to step aboard), or -1. */
  near(p: THREE.Vector3) {
    let best = -1, bd = 2.6;
    this.list.forEach((r, i) => { const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z); if (d < bd && Math.abs(r.pos.y - p.y) < 2.4) { bd = d; best = i; } });
    return best;
  }

  /** Water clear for the raft at c (corners in the water, deep enough, off the bridge piers). */
  private ok(c: THREE.Vector3, yaw: number) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    for (const [lx, lz] of [[-0.7, -1.55], [0.7, -1.55], [-0.7, 1.55], [0.7, 1.55], [0, 0]]) {
      const x = c.x + lx * co + lz * s, z = c.z - lx * s + lz * co;
      if (this.o.water.surfaceAt(x, z) === null || this.o.water.depthAt(x, z) < 0.35) return false;
    }
    for (const p of this.o.posts) if (Math.hypot(c.x - p.x, c.z - p.z) < p.r + 0.75) return false;
    return true;
  }

  private place(r: Raft, t: number) {
    const s = this.o.water.surfaceAt(r.pos.x, r.pos.z) ?? r.pos.y;
    r.pos.y = s;
    r.group.position.set(r.pos.x, s + Math.sin(t * 1.3 + r.seed) * 0.025 - 0.04, r.pos.z);
    r.group.rotation.set(Math.sin(t * 0.9 + r.seed) * 0.02, r.yaw, Math.sin(t * 1.1 + r.seed * 2) * 0.025);
  }

  /** Steer the ridden raft: `want` is the hero's move intent (m/s). Returns where the hero's feet go. */
  drive(want: THREE.Vector3, dt: number) {
    const r = this.list[this.riding];
    const sp = want.length(), target = sp > 0.05 ? want.clone().setLength(sp > 3 ? FAST : SLOW) : new THREE.Vector3();
    // a raft carries way: slow to gather speed, slower still to lose it
    r.vel.lerp(target, 1 - Math.exp(-dt * (sp > 0.05 ? 1.3 : 0.6)));
    // fend off: piers and banks ease the raft away (a pole push), so it lines up to pass under a bridge
    if (r.vel.lengthSq() > 0.01) {
      for (const p of this.o.posts) {
        const dx = r.pos.x - p.x, dz = r.pos.z - p.z, d = Math.hypot(dx, dz), reach = p.r + 2.2;
        if (d < reach && d > 1e-3) { const k = ((reach - d) / reach) * 4 * dt; r.vel.x += (dx / d) * k * 2; r.vel.z += (dz / d) * k * 2; }
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, x = r.pos.x + Math.sin(a) * 1.5, z = r.pos.z + Math.cos(a) * 1.5;
        if (this.o.water.surfaceAt(x, z) === null || this.o.water.depthAt(x, z) < 0.35) { r.vel.x -= Math.sin(a) * 1.6 * dt; r.vel.z -= Math.cos(a) * 1.6 * dt; }
      }
    }
    const next = r.pos.clone().addScaledVector(r.vel, dt);
    if (r.vel.lengthSq() > 0.04) {
      const ty = Math.atan2(r.vel.x, r.vel.z);
      // it turns end-on to its way (either end leads)
      let d = Math.atan2(Math.sin(ty - r.yaw), Math.cos(ty - r.yaw));
      if (Math.abs(d) > Math.PI / 2) d = Math.atan2(Math.sin(ty + Math.PI - r.yaw), Math.cos(ty + Math.PI - r.yaw));
      r.yaw += THREE.MathUtils.clamp(d, -1.4 * dt, 1.4 * dt);
    }
    if (this.ok(next, r.yaw)) r.pos.copy(next);
    else {
      // glance along the bank: keep whichever axis is free, lose most of the way
      const nx = r.pos.clone(); nx.x = next.x; const nz = r.pos.clone(); nz.z = next.z;
      if (this.ok(nx, r.yaw)) { r.pos.copy(nx); r.vel.z *= -0.2; }
      else if (this.ok(nz, r.yaw)) { r.pos.copy(nz); r.vel.x *= -0.2; }
      else r.vel.multiplyScalar(-0.25);
    }
    this.place(r, this.t);
    return new THREE.Vector3(r.pos.x, r.group.position.y + DECK + 0.02, r.pos.z);
  }

  /** Somewhere to step ashore from the ridden raft (a bank, a landing stage, the beach), or null. */
  landing(): THREE.Vector3 | null {
    const r = this.list[this.riding], w = this.o.world();
    if (!r || !w) return null;
    const s = r.pos.y;
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      for (const d of [1.4, 1.9, 2.5]) {
        const x = r.pos.x + Math.sin(a) * d, z = r.pos.z + Math.cos(a) * d;
        if (this.o.water.surfaceAt(x, z) !== null && this.o.water.depthAt(x, z) > 0.5) continue;
        const g = w.groundAt(x, z, s + 2.4, 3.6);
        if (g === null || g < s - 0.5 || g > s + 2.1) continue;
        const res = w.resolve(new THREE.Vector3(x, g + 0.02, z), 0.32, 1.8);
        if (Math.abs(res.pos.x - x) + Math.abs(res.pos.z - z) > 0.2) continue;
        if (d < bd) { bd = d; best = new THREE.Vector3(x, g, z); }
      }
    }
    return best;
  }

  update(dt: number) {
    this.t += dt;
    this.list.forEach((r, i) => {
      if (i === this.riding) return;
      // an empty raft drifts to a stop where it was left
      r.vel.multiplyScalar(Math.exp(-dt * 0.8));
      const next = r.pos.clone().addScaledVector(r.vel, dt);
      if (this.ok(next, r.yaw)) r.pos.copy(next); else r.vel.set(0, 0, 0);
      this.place(r, this.t);
    });
  }
}
