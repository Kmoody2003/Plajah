// Prey: wild herds you (and the predators) can hunt for food. They graze and wander their range, and bolt from the
// player, from predators and from gunshots; one alarmed animal sets off the herd. A kill leaves a carcass: hold the
// eat action on it for meat (heals more than berries; some meat carries a risk, forageTable.ts). Predators come to
// carcasses to feed, and will take one from under you.
// Models: the Lumen Deer from the Cyber Forest turnaround (creatures.ts), and the Crystal Stag (the same body, bigger,
// from the Nov 15 stag reel's proportions). The toad, turtle and amphibian studies have no models yet (they need the
// sheet → Hunyuan → paint pipeline run); add them to PREY_SPECS when they land.
import * as THREE from 'three/webgpu';
import { CreatureBody, type CreatureKind } from '../creatures';
import type { VfxSystem } from '../../../../services/vfx';
import { KILL_BURST } from '../../../../services/vfx';
import type { DangerAudio } from './audio';

export type PreyKind =
  | 'deer' | 'stag'
  | 'turtle' | 'axolotl' | 'blue_axolotl' | 'sloth' | 'beetle'
  | 'jelly' | 'dragonfly' | 'newt' | 'salamander' | 'caterpillar' | 'toad';
export interface Herd { id: string; kind: PreyKind; x: number; z: number; r: number; n: number }

interface PreySpec { name: string; body: CreatureKind; size: number; hp: number; run: number; walk: number; meat: string; bites: number; kick?: number; fly?: boolean; shy?: number }
export const PREY_SPECS: Record<PreyKind, PreySpec> = {
  deer: { name: 'Lumen Deer', body: 'deer', size: 1, hp: 40, run: 9, walk: 1.3, meat: 'venison', bites: 3 },
  // a stag stands its ground a moment when cornered and kicks
  stag: { name: 'Crystal Stag', body: 'deer', size: 1.3, hp: 85, run: 10, walk: 1.2, meat: 'stagmeat', bites: 4, kick: 12 },
  turtle: { name: 'Bioluminescent Turtle', body: 'bio_turtle', size: 1.05, hp: 90, run: 2.2, walk: 0.7, meat: 'venison', bites: 3, shy: 0.4 },
  axolotl: { name: 'Bioluminescent Axolotl', body: 'bio_axolotl', size: 1.0, hp: 32, run: 5.5, walk: 1.1, meat: 'venison', bites: 2, shy: 0.65 },
  blue_axolotl: { name: 'Azure Bio-Axolotl', body: 'blue_axolotl', size: 1.0, hp: 32, run: 5.8, walk: 1.2, meat: 'venison', bites: 2, shy: 0.65 },
  sloth: { name: 'Bioluminescent Sloth', body: 'bio_sloth', size: 1.1, hp: 65, run: 2.8, walk: 0.85, meat: 'venison', bites: 3, shy: 0.35 },
  beetle: { name: 'Glow Beetle', body: 'glow_beetle', size: 1.05, hp: 35, run: 4.5, walk: 1.1, meat: 'venison', bites: 2, shy: 0.45 },
  jelly: { name: 'Sky Jellyfish', body: 'sky_jelly', size: 1.15, hp: 38, run: 4.2, walk: 1.4, meat: 'venison', bites: 2, fly: true, shy: 0.2 },
  dragonfly: { name: 'Cyber Dragonfly', body: 'cyber_dragonfly', size: 1.05, hp: 28, run: 9.5, walk: 3.4, meat: 'venison', bites: 1, fly: true, shy: 0.55 },
  newt: { name: 'Electric Newt', body: 'electric_newt', size: 1.05, hp: 34, run: 6.2, walk: 1.3, meat: 'venison', bites: 2, shy: 0.6 },
  salamander: { name: 'Poison Salamander', body: 'poison_salamander', size: 1.05, hp: 38, run: 5.6, walk: 1.2, meat: 'stagmeat', bites: 2, shy: 0.5 },
  caterpillar: { name: 'Venom Caterpillar', body: 'venom_caterpillar', size: 1.1, hp: 42, run: 3.0, walk: 0.9, meat: 'stagmeat', bites: 2, shy: 0.35 },
  toad: { name: 'Venomous Acid Toad', body: 'venom_toad', size: 1.1, hp: 55, run: 5.0, walk: 1.0, meat: 'stagmeat', bites: 2, shy: 0.45 },
};

export interface PreyEnv {
  scene: THREE.Scene; vfx: VfxSystem; audio: DangerAudio;
  ground(x: number, z: number): number;
  resolve(p: THREE.Vector3, r: number, h: number): void;
  hurtPlayer(dmg: number, why: string): void;
  /** How close the player may come before `p` bolts (the soul and the creature's trust change it; danger/bonds.ts). */
  fearR?(p: Prey, base: number): number;
  lo?: boolean;
  wilds?: boolean;
}

let nextId = 200000; // apart from enemy (1…) and predator (100000…) ids
export class Prey {
  readonly id = nextId++;
  readonly spec: PreySpec;
  readonly body: CreatureBody;
  readonly mesh = new THREE.Group();
  readonly hitTarget: THREE.Mesh;
  hp: number; maxHp: number;
  readonly who: string;
  readonly boss = false;
  state: 'graze' | 'walk' | 'flee' | 'stand' | 'dead' = 'graze';
  t = Math.random() * 5;
  speed = 0;
  goal = new THREE.Vector3();
  home: THREE.Vector3;
  fear = new THREE.Vector3();         // where the scare came from
  kickCd = 0;
  /** Trust in the player, 0…1 (danger/bonds.ts); bonded at 1. */
  affinity = 0;
  bonded = false;
  /** Seconds spent calmly near the player (sparing it); spared once counted. */
  calmT = 0; spared = false;
  /** Walk to this point (a bonded creature bringing a gift); null otherwise. */
  come: THREE.Vector3 | null = null;
  readonly herd: Herd;
  readonly last = new THREE.Vector3();
  constructor(herd: Herd, at: THREE.Vector3) {
    this.herd = herd;
    this.spec = PREY_SPECS[herd.kind];
    this.who = this.spec.name;
    this.hp = this.maxHp = this.spec.hp;
    this.body = new CreatureBody(this.spec.body, this.spec.size * (0.9 + Math.random() * 0.2));
    this.mesh.add(this.body.root);
    const h = this.body.height;
    this.hitTarget = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * this.spec.size, 0.6 * this.spec.size, 2.1, 8), new THREE.MeshBasicNodeMaterial({ visible: false }));
    this.hitTarget.scale.y = h / 2.1; this.hitTarget.position.y = h / 2; this.hitTarget.userData.preyId = this.id;
    this.mesh.add(this.hitTarget);
    this.mesh.position.copy(at); this.last.copy(at); this.goal.copy(at);
    this.home = new THREE.Vector3(herd.x, at.y, herd.z);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
  }
  get pos() { return this.mesh.position; }
  get alive() { return this.state !== 'dead'; }
  chest(out: THREE.Vector3) { return out.copy(this.pos).setY(this.pos.y + this.body.height * 0.6); }
}

export interface Carcass { id: number; kind: PreyKind; meat: string; bites: number; pos: THREE.Vector3; obj: THREE.Object3D; body: CreatureBody; life: number; sinking: number }

const ACTIVE_R = 210, DESPAWN_R = 300, RESPAWN = 90;
const tmp = new THREE.Vector3();
const FOREST_ROAM: PreyKind[] = ['deer', 'deer', 'stag', 'jelly', 'dragonfly', 'sloth', 'beetle', 'salamander', 'caterpillar', 'toad'];
const WATER_ROAM: PreyKind[] = ['turtle', 'axolotl', 'blue_axolotl', 'newt', 'dragonfly', 'jelly', 'toad'];

export class PreyDirector {
  readonly group = new THREE.Group();
  readonly list: Prey[] = [];
  readonly carcasses: Carcass[] = [];
  private herds: { herd: Herd; live: Prey[]; deadAt: number[]; dynamic?: boolean }[];
  private clock = 0; private herdT = 0; private roamCd = 0;
  private cid = 1;
  private maxLive: number;

  constructor(private env: PreyEnv, herds: Herd[]) {
    this.group.name = 'danger-prey';
    env.scene.add(this.group);
    this.herds = herds.map((herd) => ({ herd, live: [], deadAt: [] }));
    this.maxLive = env.lo ? 28 : 54;
  }

  private manage(player: THREE.Vector3) {
    for (let hi = this.herds.length - 1; hi >= 0; hi--) {
      const h = this.herds[hi];
      const d = Math.hypot(h.herd.x - player.x, h.herd.z - player.z);
      for (let i = h.live.length - 1; i >= 0; i--) {
        const p = h.live[i];
        if (!p.alive) { h.live.splice(i, 1); continue; }
        if (p.pos.distanceTo(player) > DESPAWN_R) { this.drop(p); h.live.splice(i, 1); }
      }
      if (h.dynamic && h.live.length === 0 && d > DESPAWN_R * 0.7) { this.herds.splice(hi, 1); continue; }
      h.deadAt = h.deadAt.filter((t) => this.clock - t < RESPAWN);
      if (d > ACTIVE_R) continue;
      while (h.live.length + h.deadAt.length < h.herd.n && this.list.length < this.maxLive) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * h.herd.r * 0.65, x = h.herd.x + Math.cos(a) * r, z = h.herd.z + Math.sin(a) * r;
        if (Math.hypot(x - player.x, z - player.z) < 16) break;
        const p = new Prey(h.herd, new THREE.Vector3(x, this.env.ground(x, z), z));
        h.live.push(p); this.list.push(p); this.group.add(p.mesh);
      }
    }
    // Dynamic roaming wildlife ring: wherever the player explores in the 2 km Wilds, keep the surrounding forest alive.
    if (this.env.wilds !== false && this.roamCd <= 0 && this.list.length < this.maxLive) {
      const nearTarget = this.env.lo ? 6 : 11;
      let near = 0;
      for (const p of this.list) if (p.alive && p.pos.distanceTo(player) < 125) near++;
      if (near < nearTarget) {
        this.roamCd = 3.5;
        const a = Math.random() * Math.PI * 2;
        const dist = 42 + Math.random() * 68;
        const cx = THREE.MathUtils.clamp(player.x + Math.cos(a) * dist, -840, 840);
        const cz = THREE.MathUtils.clamp(player.z + Math.sin(a) * dist, -840, 840);
        const gy = this.env.ground(cx, cz);
        const pool = gy < -32 || Math.hypot(cx - 235, cz - 170) < 120 ? WATER_ROAM : FOREST_ROAM;
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const count = kind === 'stag' || kind === 'sloth' ? 2 : 2 + Math.floor(Math.random() * 2);
        const herd: Herd = { id: `roam-${kind}-${this.cid++}`, kind, x: cx, z: cz, r: 28, n: count };
        const entry = { herd, live: [] as Prey[], deadAt: [] as number[], dynamic: true };
        for (let k = 0; k < count && this.list.length < this.maxLive; k++) {
          const oa = Math.random() * Math.PI * 2, or = 2 + Math.random() * 10;
          const x = cx + Math.cos(oa) * or, z = cz + Math.sin(oa) * or;
          const p = new Prey(herd, new THREE.Vector3(x, this.env.ground(x, z), z));
          entry.live.push(p); this.list.push(p); this.group.add(p.mesh);
        }
        this.herds.push(entry);
      }
    }
  }
  private drop(p: Prey) { this.group.remove(p.mesh); const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); }

  /** Debug / scripted: a small herd at (x, z). */
  spawnHerd(kind: PreyKind, x: number, z: number, n = 3) {
    const herd: Herd = { id: `spawn-${kind}-${this.cid++}`, kind, x, z, r: 14, n };
    this.herds.push({ herd, live: [], deadAt: [] });
    this.herdT = 0;
    return herd;
  }

  /** Everything alarms the herd: a threat at `at` (the player, a predator, a gunshot). */
  scare(at: THREE.Vector3, r: number, fromPlayer = false) {
    for (const p of this.list) if (p.alive && p.pos.distanceTo(at) < r && !(fromPlayer && p.bonded)) this.bolt(p, at);
  }
  private bolt(p: Prey, from: THREE.Vector3) {
    if (p.state === 'flee' && p.t > 1) return;
    p.fear.copy(from); p.state = 'flee'; p.t = 4 + Math.random() * 2;
    // the herd goes with it
    for (const q of this.list) if (q !== p && q.alive && q.herd === p.herd && q.state !== 'flee' && q.pos.distanceTo(p.pos) < 25) { q.fear.copy(from); q.state = 'flee'; q.t = 3.5 + Math.random() * 2; }
  }

  hitMeshes() { return this.list.filter((p) => p.alive).map((p) => p.hitTarget); }

  damage(id: number, dmg: number, from: THREE.Vector3 | null): { killed: boolean; pos: THREE.Vector3; p: Prey } | null {
    const p = this.list.find((q) => q.id === id && q.alive);
    if (!p) return null;
    p.hp -= dmg; p.body.glow = 2.5;
    const pos = p.chest(new THREE.Vector3());
    if (p.hp <= 0) { this.kill(p); return { killed: true, pos, p }; }
    p.body.rig.play(dmg >= p.maxHp * 0.3 ? 'hit_heavy' : 'hit');
    if (from) {
      // a stag hit at close range turns and kicks once before it runs
      if (p.spec.kick && from.distanceTo(p.pos) < 4 && p.kickCd <= 0) { p.state = 'stand'; p.t = 0.6; p.kickCd = 5; p.fear.copy(from); }
      else this.bolt(p, from);
    }
    return { killed: false, pos, p };
  }

  private kill(p: Prey) {
    p.state = 'dead'; p.hitTarget.userData.preyId = -1; p.hitTarget.visible = false;
    const h = this.herds.find((q) => q.live.includes(p)); if (h) h.deadAt.push(this.clock);
    this.env.vfx.spawn(KILL_BURST, p.chest(tmp), { tint: 0x8fe8ff, count: 0.5 });
    this.env.audio.play('screech', p.chest(tmp), { gain: 0.5, rate: 0.7 });
    // the body stays as a carcass (on its side, its glow fading to embers)
    const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1);
    // the rig's death clip lays it down; the old TSL body is toppled by hand
    if (!(p.body.rigged && p.body.rig.hold('death'))) { p.body.root.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); p.body.root.position.y = p.body.height * 0.12; }
    p.body.glow = 0.35; p.body.update(0, 0);
    this.carcasses.push({ id: this.cid++, kind: p.herd.kind, meat: p.spec.meat, bites: p.spec.bites, pos: p.pos.clone(), obj: p.mesh, body: p.body, life: 150, sinking: 0 });
    this.scare(p.pos, 30);
  }

  /** Take one bite of a carcass (the player or a predator). False if none left. */
  bite(c: Carcass) {
    if (c.bites <= 0) return false;
    c.bites--;
    if (c.bites <= 0) c.sinking = 1.5;
    return true;
  }
  nearestCarcass(at: THREE.Vector3, r: number) {
    let best: Carcass | null = null, bd = r;
    for (const c of this.carcasses) { if (c.bites <= 0) continue; const d = c.pos.distanceTo(at); if (d < bd) { best = c; bd = d; } }
    return best;
  }

  update(dt: number, player: THREE.Vector3, crouched: boolean, threats: THREE.Vector3[]) {
    this.clock += dt;
    this.roamCd = Math.max(0, this.roamCd - dt);
    if ((this.herdT -= dt) <= 0) { this.herdT = 1; this.manage(player); }
    const env = this.env;
    for (const p of this.list) {
      p.t -= dt; p.kickCd -= dt;
      p.body.glow += (1 - p.body.glow) * Math.min(1, dt * 3);
      // senses: you (crouched you get much closer), predators near (gentle flyers & turtles are less skittish)
      const pd = p.pos.distanceTo(player);
      const shy = p.spec.shy ?? 1;
      const base = (crouched ? 6 : 16) * shy, fr = env.fearR ? env.fearR(p, base) : base;
      if (p.state !== 'flee' && p.state !== 'stand' && pd < fr) this.bolt(p, player);
      for (const t of threats) if (p.state !== 'flee' && t.distanceTo(p.pos) < 20 * shy) { this.bolt(p, t); break; }
      let want = 0;
      if (p.come && p.state !== 'flee' && p.state !== 'stand') {   // walking up to the player (a gift)
        p.state = 'walk'; p.t = 2; p.goal.copy(p.come); want = p.spec.walk * 2.2;
        if (Math.hypot(p.come.x - p.pos.x, p.come.z - p.pos.z) < 2.2) { p.come = null; p.state = 'graze'; p.t = 4; want = 0; }
      } else if (p.state === 'graze') { if (p.t <= 0) { p.state = 'walk'; p.t = p.spec.fly ? 8 : 6; const a = Math.random() * 6.28, r = Math.random() * p.herd.r; p.goal.set(p.herd.x + Math.cos(a) * r, 0, p.herd.z + Math.sin(a) * r); } }
      else if (p.state === 'walk') { want = p.spec.walk; if (Math.hypot(p.goal.x - p.pos.x, p.goal.z - p.pos.z) < 1 || p.t <= 0) { p.state = 'graze'; p.t = p.spec.fly ? 1.2 + Math.random() * 2.5 : 3 + Math.random() * 6; } }
      else if (p.state === 'flee') {
        want = p.spec.run;
        tmp.subVectors(p.pos, p.fear).setY(0).normalize();
        // run away, bending back toward the range when far from it
        const hx = p.herd.x - p.pos.x, hz = p.herd.z - p.pos.z, hd = Math.hypot(hx, hz);
        if (hd > p.herd.r * 2.5) { tmp.x += (hx / hd) * 0.6; tmp.z += (hz / hd) * 0.6; tmp.normalize(); }
        p.goal.copy(p.pos).addScaledVector(tmp, 10);
        if (p.t <= 0) { p.state = 'walk'; p.t = 5; p.goal.set(p.herd.x, 0, p.herd.z); }
      } else if (p.state === 'stand') {
        tmp.subVectors(p.fear, p.pos).setY(0); p.goal.copy(p.pos).add(tmp.multiplyScalar(0.01));
        if (p.t <= 0) {
          if (p.spec.kick && player.distanceTo(p.pos) < 3.2) { env.hurtPlayer(p.spec.kick, p.who.toUpperCase()); p.body.attack(); env.audio.play('growl', p.chest(tmp), { gain: 0.6, rate: 1.4 }); }
          this.bolt(p, p.fear); p.state = 'flee'; p.t = 4;
        }
      }
      p.speed += (want - p.speed) * Math.min(1, dt * (want > p.speed ? 4 : 5));
      const dx = p.goal.x - p.pos.x, dz = p.goal.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.3 && p.speed > 0.05) {
        p.pos.x += (dx / d) * Math.min(d, p.speed * dt); p.pos.z += (dz / d) * Math.min(d, p.speed * dt);
        let dy = Math.atan2(dx, dz) - p.mesh.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.mesh.rotation.y += dy * Math.min(1, dt * 6);
      } else if (p.state === 'stand') {
        let dy = Math.atan2(p.fear.x - p.pos.x, p.fear.z - p.pos.z) - p.mesh.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.mesh.rotation.y += dy * Math.min(1, dt * 8);
      }
      p.pos.y += (env.ground(p.pos.x, p.pos.z) - p.pos.y) * Math.min(1, dt * 10);
      if (!p.spec.fly) env.resolve(p.pos, 0.45 * p.spec.size, 1.6);
      const sp = Math.hypot(p.pos.x - p.last.x, p.pos.z - p.last.z) / Math.max(dt, 1e-3);
      p.last.copy(p.pos);
      p.body.update(dt, sp);
    }
    for (let i = this.carcasses.length - 1; i >= 0; i--) {
      const c = this.carcasses[i];
      c.life -= dt;
      if (c.body.rigged && c.life > 140) c.body.update(dt, 0);   // let the death clip play out, then it holds
      if (c.life <= 0 && c.sinking <= 0) c.sinking = 1.5;
      if (c.sinking > 0) { c.sinking -= dt; c.obj.position.y -= dt * 0.6; if (c.sinking <= 0) { this.group.remove(c.obj); this.carcasses.splice(i, 1); } }
    }
  }

  info() { return { prey: this.list.map((p) => `${p.who}:${p.state}`), carcasses: this.carcasses.map((c) => `${c.kind}:${c.bites}`) }; }
}
