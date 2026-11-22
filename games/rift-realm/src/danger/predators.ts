// Predators of the Elderwood: wild creatures that live in territories (dens, danger/spots.ts), sense you, stalk you and
// hunt you — and hunt the rift's creatures too, so fights turn three-way. They glow a feral red-amber (the rift's own
// creatures glow cyan), so you can tell at a glance who is whose.
//
// Behaviour, per predator:
//  · idle / patrol inside the territory; give up a chase well outside it
//  · senses — a sight cone (blocked by the world; you are harder to see crouched, easier at a sprint; night-eyed
//    hunters see further at night), hearing (gunshots carry ~60 m, running footsteps ~15 m, crouching is near silent),
//    and scent: you leave a trail they can follow to where you went
//  · stalking — approach low (crouched) toward a flank point behind you, preferring spots you can't see; wolves then
//    circle as a pack, and one at a time takes the token to charge
//  · ambushes — the mantis waits hidden in the undergrowth, camouflaged, and springs when you pass close; wasps hang
//    high in the canopy and drop to fire charged plasma stingers; bats swoop
//  · every attack has a readable tell (the timing is taken from the motion studies: the mantis rears with its arms up
//    and eyes flaring ~0.75 s before the slash; the wasp's abdomen curls and the stinger glows and sparks ~1.2 s before
//    the bolt; the wolf drops its head ~0.45 s before it springs). Strikes are dodgeable — step or dash out of reach
//  · hurt badly at once → they back off and circle; at low health they flee, and come back healed later
//  · kills drop a glowing life-mote (heals) and give XP
import * as THREE from 'three/webgpu';
import { CreatureBody, type CreatureKind } from '../creatures';
import type { Enemy } from '../enemies';
import type { VfxSystem } from '../../../../services/vfx';
import { KILL_BURST, HIT_SPARKS, STREAK_TRAIL } from '../../../../services/vfx';
import { PREDATOR_TELL, PLASMA_POP, PICKUP_GLINT, SPARK_ARC } from '../../../../services/vfx/hazards';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import type { Den, PredatorKind } from './spots';
import type { Prey as Quarry, Carcass } from './prey';

interface Spec {
  name: string; body: CreatureKind; size: number;
  hp: number; run: number; walk: number; dmg: number; reach: number;
  tell: number; strike: number; recover: number;
  sight: number; fov: number;          // m, degrees (360 = all round)
  nightEyes?: boolean;
  fly?: { cruise: number; perch?: number; attack: number };   // heights above the ground
  ranged?: number;                     // fires a bolt from this range
  ambush?: 'foliage' | 'above';
  venom?: boolean; shock?: boolean;
  xp: number; tint: number;            // tell / hit colour
}
const SPECS: Record<PredatorKind, Spec> = {
  wolf: { name: 'Feral Wolf', body: 'wolf', size: 1.05, hp: 70, run: 9.6, walk: 2.4, dmg: 11, reach: 2.4, tell: 0.45, strike: 0.25, recover: 0.7, sight: 34, fov: 130, nightEyes: true, xp: 25, tint: 0xff6a2a },
  mantis: { name: 'Ambush Mantis', body: 'mantis', size: 1.0, hp: 120, run: 7.2, walk: 1.3, dmg: 22, reach: 3.3, tell: 0.75, strike: 0.25, recover: 1.1, sight: 20, fov: 170, ambush: 'foliage', venom: true, xp: 45, tint: 0xb6ff3a },
  wasp: { name: 'Plasma Wasp', body: 'wasp', size: 0.95, hp: 45, run: 8, walk: 2.5, dmg: 14, reach: 2.2, tell: 1.2, strike: 0.2, recover: 1.3, sight: 40, fov: 360, fly: { cruise: 4, perch: 9, attack: 3.2 }, ranged: 24, ambush: 'above', shock: true, xp: 30, tint: 0xff9a2a },
  bat: { name: 'Storm Bat', body: 'bat', size: 0.9, hp: 35, run: 10.5, walk: 3, dmg: 8, reach: 2.3, tell: 0.4, strike: 0.35, recover: 0.8, sight: 28, fov: 300, nightEyes: true, fly: { cruise: 3.2, attack: 0.2 }, shock: true, xp: 18, tint: 0x6ae8ff },
  stalker: { name: 'Lumen Stalker', body: 'wolf', size: 1.5, hp: 230, run: 11.5, walk: 1.8, dmg: 26, reach: 3.0, tell: 0.6, strike: 0.3, recover: 1.0, sight: 42, fov: 150, nightEyes: true, xp: 90, tint: 0xff3a5a },
};

type State = 'idle' | 'patrol' | 'alert' | 'track' | 'stalk' | 'circle' | 'charge' | 'tell' | 'strike' | 'recover'
  | 'retreat' | 'flee' | 'hide' | 'perch' | 'feed' | 'dead';

/** Something a predator can hunt: the player, or one of the rift's creatures. */
export interface Prey { pos: THREE.Vector3; enemy: Enemy | null; quarry?: Quarry }

export interface PredatorEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  lo: boolean;
  ground(x: number, z: number): number;
  /** Ground under a point (decks, stairs, terrain), or null. */
  floor(x: number, z: number, fromY: number): number | null;
  resolve(p: THREE.Vector3, r: number, h: number): void;
  /** Clear line between two points (no world in between). */
  clear(a: THREE.Vector3, b: THREE.Vector3): boolean;
  hurtPlayer(dmg: number, why: string): void;
  damageEnemy(e: Enemy, dmg: number, dir: THREE.Vector3): boolean;   // true = killed
  heal(n: number): void;
  onKill(p: Predator): void;
  night(): number;
  /** Ripe fruit and the like: predators wander to it on patrol (danger/forage.ts). */
  attractors?(): THREE.Vector3[];
  /** Prey animals to hunt, and carcasses to feed on / steal (danger/prey.ts). */
  quarry?(): Quarry[];
  carcass?(at: THREE.Vector3, r: number): Carcass | null;
  bite?(c: Carcass): boolean;
  damageQuarry?(q: Quarry, dmg: number, from: THREE.Vector3): boolean;   // true = killed
}

interface Pack { members: Predator[]; token: Predator | null; tokenT: number; alerted: number }

let nextId = 100000; // never the same id as one of the rift's creatures (enemies.ts counts from 1)
export class Predator {
  readonly id = nextId++;
  readonly spec: Spec;
  readonly body: CreatureBody;
  /** Enemy-compatible fields (targeting.ts reads mesh, hitTarget, hp, maxHp, who, boss). */
  readonly mesh = new THREE.Group();
  readonly hitTarget: THREE.Mesh;
  hp: number; maxHp: number;
  readonly who: string;
  readonly boss = false;
  state: State = 'idle';
  t = 0;                                     // time left in the state
  target: Prey | null = null;
  lastKnown = new THREE.Vector3();
  aware = 0;                                 // 0…1 how sure it is the target is there
  home: THREE.Vector3;
  goal = new THREE.Vector3();
  speed = 0;
  alt = 0;                                   // flyers: height above the ground
  hurtRecent = 0;                            // damage taken in the last ~3 s
  senseT = Math.random() * 0.25;
  slot = Math.random() * Math.PI * 2;        // pack circling angle
  scentT = 0;                                // the age of the scent crumb it is following
  attackCd = 0;
  struck = false;
  fightT = 0;                                // enemy retaliation clock
  deadT = 0;
  pack: Pack | null = null;
  meal: Carcass | null = null;              // the carcass it is feeding on
  biteT = 0;
  readonly den: Den;
  private lastPos = new THREE.Vector3();

  constructor(den: Den, kind: PredatorKind, at: THREE.Vector3) {
    this.den = den;
    this.spec = SPECS[kind];
    this.who = this.spec.name;
    this.maxHp = this.hp = this.spec.hp;
    this.body = new CreatureBody(this.spec.body, this.spec.size);
    this.body.wild = 1;
    this.mesh.add(this.body.root);
    const h = this.body.height;
    this.hitTarget = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * Math.max(1, this.spec.size), 0.62 * Math.max(1, this.spec.size), 2.1, 8), new THREE.MeshBasicNodeMaterial({ visible: false }));
    this.hitTarget.scale.y = h / 2.1;
    this.hitTarget.position.y = this.body.hover + h / 2;
    this.hitTarget.userData.predatorId = this.id;
    this.mesh.add(this.hitTarget);
    this.mesh.position.copy(at);
    this.lastPos.copy(at);
    this.home = new THREE.Vector3(den.x, at.y, den.z);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    this.alt = this.spec.fly ? (this.spec.fly.perch ?? this.spec.fly.cruise) - this.body.hover : 0;
    this.state = this.spec.ambush === 'foliage' ? 'hide' : this.spec.ambush === 'above' ? 'perch' : 'idle';
    this.t = 1 + Math.random() * 3;
  }

  get pos() { return this.mesh.position; }
  get alive() { return this.state !== 'dead'; }
  get engaged() { return ['stalk', 'circle', 'charge', 'tell', 'strike', 'recover', 'retreat'].includes(this.state); }
  /** The chest, for sight lines and bolts. */
  chest(out: THREE.Vector3) { return out.copy(this.mesh.position).setY(this.mesh.position.y + this.body.hover + this.body.height * 0.6); }
  measuredSpeed(dt: number) { const s = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / Math.max(dt, 1e-3); this.lastPos.copy(this.pos); return s; }
}

interface Bolt { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; trail: ReturnType<VfxSystem['trail']>; dmg: number; from: Predator }
interface Mote { mesh: THREE.Mesh; life: number; heal: number }
export interface Noise { pos: THREE.Vector3; r: number; t: number }
export interface Crumb { pos: THREE.Vector3; t: number }

const ACTIVE_R = 150, DESPAWN_R = 230, RESPAWN_SEC = 120;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();

export class PredatorDirector {
  readonly group = new THREE.Group();
  readonly list: Predator[] = [];
  private dens: { den: Den; live: Predator[]; deadAt: number[]; pack: Pack | null }[];
  private bolts: Bolt[] = [];
  private motes: Mote[] = [];
  private denT = 0;
  private clock = 0;
  readonly noises: Noise[] = [];
  readonly crumbs: Crumb[] = [];
  private boltGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private moteGeo = new THREE.IcosahedronGeometry(0.22, 1);
  private moteMat = new THREE.MeshBasicNodeMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private max: number;

  constructor(private env: PredatorEnv, dens: Den[]) {
    this.group.name = 'danger-predators';
    env.scene.add(this.group);
    this.dens = dens.map((den) => ({ den, live: [], deadAt: [], pack: null }));
    this.max = env.lo ? 9 : 16;
  }

  /** A sound predators may hear: gunshots, footsteps, blasts. */
  noise(pos: THREE.Vector3, r: number) {
    this.noises.push({ pos: pos.clone(), r, t: this.clock });
    if (this.noises.length > 24) this.noises.shift();
  }
  /** The player's scent trail. */
  scent(pos: THREE.Vector3) {
    this.crumbs.push({ pos: pos.clone(), t: this.clock });
    if (this.crumbs.length > 40) this.crumbs.shift();
  }

  // ── spawning: dens near the player are populated; far ones emptied ──────────────────────────────────────────────
  private manageDens(player: THREE.Vector3) {
    const night = this.env.night() > 0.5;
    // nearest dens first, so the cap never leaves the place you're in empty
    const order = [...this.dens].sort((a, b) => Math.hypot(a.den.x - player.x, a.den.z - player.z) - Math.hypot(b.den.x - player.x, b.den.z - player.z));
    for (const d of order) {
      const dist = Math.hypot(d.den.x - player.x, d.den.z - player.z);
      const open = !d.den.night || night;
      const want = open ? d.den.n + (night && (d.den.kind === 'wolf' || d.den.n > 1) ? 1 : 0) : 0;
      // despawn the far, calm ones (or a night den by day, once nobody is looking)
      for (let i = d.live.length - 1; i >= 0; i--) {
        const p = d.live[i];
        if (!p.alive) { d.live.splice(i, 1); continue; }
        const pd = p.pos.distanceTo(player);
        if ((pd > DESPAWN_R && !p.engaged) || (!open && pd > 80 && !p.engaged)) { this.remove(p); d.live.splice(i, 1); }
      }
      d.deadAt = d.deadAt.filter((t) => this.clock - t < RESPAWN_SEC);
      if (dist > ACTIVE_R || !open) continue;
      while (d.live.length + d.deadAt.length < want && this.list.length < this.max) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * d.den.r * 0.6;
        const x = d.den.x + Math.cos(a) * r, z = d.den.z + Math.sin(a) * r;
        if (Math.hypot(x - player.x, z - player.z) < 28) break;            // never pop in next to you
        const p = new Predator(d.den, d.den.kind, new THREE.Vector3(x, this.env.ground(x, z), z));
        if (p.spec.fly) p.pos.y += p.alt;
        if (d.den.kind === 'wolf' || d.den.n > 1) { d.pack ??= { members: [], token: null, tokenT: 0, alerted: 0 }; d.pack.members.push(p); p.pack = d.pack; }
        d.live.push(p); this.list.push(p); this.group.add(p.mesh);
      }
    }
  }

  /** Debug / scripted encounters: put one predator down at (x, z) with a small territory of its own. */
  spawnAt(kind: PredatorKind, x: number, z: number) {
    const den: Den = { id: `spawn-${kind}-${this.list.length}`, kind, x, z, r: 25, n: 0 };
    const p = new Predator(den, kind, new THREE.Vector3(x, this.env.ground(x, z), z));
    if (p.spec.fly) p.pos.y += p.alt;
    this.list.push(p); this.group.add(p.mesh);
    return p;
  }

  private remove(p: Predator) {
    this.group.remove(p.mesh);
    const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1);
    if (p.pack) { p.pack.members = p.pack.members.filter((m) => m !== p); if (p.pack.token === p) p.pack.token = null; }
  }

  // ── damage from the player / hazards ─────────────────────────────────────────────────────────────────────────────
  /** Returns null if `id` is not a live predator. */
  damage(id: number, dmg: number, from: THREE.Vector3 | null, knock = 0, byPlayer = true, player?: Prey): { killed: boolean; pos: THREE.Vector3; p: Predator } | null {
    const p = this.list.find((q) => q.id === id && q.alive);
    if (!p) return null;
    // recovering after a strike: caught off guard, hits land harder
    const mult = p.state === 'recover' ? 1.35 : p.state === 'hide' || p.state === 'perch' ? 1.5 : 1;
    const real = Math.round(dmg * mult);
    p.hp -= real; p.hurtRecent += real;
    p.body.glow = 3;
    const pos = p.chest(new THREE.Vector3());
    if (from && knock > 0) { tmp.subVectors(p.pos, from).setY(0).normalize(); p.pos.addScaledVector(tmp, knock * (p.spec.size > 1.2 ? 0.4 : 1)); }
    if (p.hp <= 0) { this.kill(p); return { killed: true, pos, p }; }
    // anything that hurts it becomes the target (the player, if it was them)
    if (byPlayer && player) { p.meal = null; p.target = player; p.aware = 1; p.lastKnown.copy(player.pos); this.alertPack(p, player); }
    if (p.hp < p.maxHp * 0.25 && p.state !== 'flee') { p.state = 'flee'; p.t = 6; this.env.audio.play('screech', pos, { gain: 0.7, rate: 0.8 }); }
    else if (p.hurtRecent > p.maxHp * 0.3 && ['circle', 'charge', 'tell', 'stalk'].includes(p.state)) { p.state = 'retreat'; p.t = 1.4 + Math.random() * 0.6; p.hurtRecent = 0; }
    else if (p.state === 'hide' || p.state === 'perch' || p.state === 'idle' || p.state === 'patrol') { p.state = 'charge'; p.t = 6; }
    if (p.state === 'tell' && real > p.maxHp * 0.2) { p.state = 'recover'; p.t = 0.5; p.body.tell = 0; }   // a big hit interrupts the wind-up
    return { killed: false, pos, p };
  }

  private kill(p: Predator) {
    p.state = 'dead'; p.deadT = 0; p.body.tell = 0; p.body.crouch = 0;
    p.hitTarget.visible = false; p.hitTarget.userData.predatorId = -1;
    const c = p.chest(new THREE.Vector3());
    this.env.vfx.spawn(KILL_BURST, c, { tint: p.spec.tint });
    this.env.audio.play('screech', c, { gain: 0.8, rate: 0.6 });
    const d = this.dens.find((q) => q.live.includes(p)); if (d) d.deadAt.push(this.clock);
    if (p.pack) { p.pack.members = p.pack.members.filter((m) => m !== p); if (p.pack.token === p) p.pack.token = null; }
    // a life-mote rises from it
    const m = new THREE.Mesh(this.moteGeo, this.moteMat); m.position.copy(c); this.group.add(m);
    this.motes.push({ mesh: m, life: 30, heal: Math.round(8 + p.spec.xp * 0.25) });
    this.env.onKill(p);
  }

  private alertPack(p: Predator, prey: Prey) {
    if (!p.pack || this.clock - p.pack.alerted < 4) return;
    p.pack.alerted = this.clock;
    this.env.audio.play('howl', p.chest(tmp), { gain: 1.1, range: 160 });
    for (const m of p.pack.members) if (m !== p && m.alive && !m.engaged && m.state !== 'flee') {
      m.target = prey; m.aware = Math.max(m.aware, 0.8); m.lastKnown.copy(prey.pos); m.state = 'stalk'; m.t = 8;
    }
  }

  // ── senses ──────────────────────────────────────────────────────────────────────────────────────────────────────
  private sense(p: Predator, player: Prey, crouched: boolean, sprinting: boolean, enemies: Enemy[]) {
    const s = p.spec, night = this.env.night();
    const eye = p.chest(tmp2);
    const fwdA = p.mesh.rotation.y;
    const sees = (q: THREE.Vector3, range: number, los: boolean) => {
      const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range) return 0;
      if (s.fov < 360) { let da = Math.atan2(dx, dz) - fwdA; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > (s.fov * Math.PI) / 360 && d > 4) return 0; }
      if (los && !this.env.clear(eye, tmp3.copy(q).setY(q.y + 1.1))) return 0;
      return 1 - d / range;
    };
    let range = s.sight * (s.nightEyes ? 1 + 0.25 * night : 1 - 0.2 * night);
    if (p.state === 'hide' || p.state === 'perch') range *= 0.6;   // an ambusher watches a small patch
    const pr = range * (crouched ? 0.55 : sprinting ? 1.1 : 1);
    const seenP = sees(player.pos, pr, true);
    // the rift's creatures are loud and bright: seen without a sight line, inside the territory
    let bestE: Enemy | null = null, bestEd = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = e.mesh.position.distanceTo(p.pos);
      if (d < bestEd && d < range * 0.8 && Math.hypot(e.mesh.position.x - p.den.x, e.mesh.position.z - p.den.z) < p.den.r + 25) { bestE = e; bestEd = d; }
    }
    if (seenP > 0) {
      p.aware = Math.min(1, p.aware + 0.25 + seenP * 0.9);
      if (!p.target || p.target.enemy === null || p.aware > 0.6) { p.target = player; p.lastKnown.copy(player.pos); }
    } else if (bestE && (!p.target || p.target.enemy)) {
      p.target = { pos: bestE.mesh.position, enemy: bestE }; p.aware = Math.min(1, p.aware + 0.4); p.lastKnown.copy(bestE.mesh.position);
    } else p.aware = Math.max(0, p.aware - 0.08);
    if (p.target?.enemy && p.target.enemy.hp <= 0) { p.target = null; p.aware = 0; }
    if (p.target?.quarry && !p.target.quarry.alive) { p.target = null; p.aware = 0; }
    // hungry: prey animals in range (when it isn't after you or the rift's creatures)
    if (!p.target && s.body !== 'wasp' && s.body !== 'bat' && this.env.quarry) {
      let best: Quarry | null = null, bd = range * 0.9;
      for (const q of this.env.quarry()) { const d = q.pos.distanceTo(p.pos); if (d < bd && Math.hypot(q.pos.x - p.den.x, q.pos.z - p.den.z) < p.den.r + 40) { best = q; bd = d; } }
      if (best) { p.target = { pos: best.pos, enemy: null, quarry: best }; p.aware = 0.7; p.lastKnown.copy(best.pos); }
    }
    // a carcass nearby: go and feed (and take it from whoever is eating it)
    if (['idle', 'patrol', 'alert', 'track'].includes(p.state) && this.env.carcass) {
      const c = this.env.carcass(p.pos, 45);
      if (c) { p.meal = c; p.state = 'feed'; p.t = 20; p.goal.copy(c.pos); if (Math.random() < 0.5) this.env.audio.play('growl', p.chest(tmp), { gain: 0.6, gap: 3 }); }
    }

    // hearing: run to the sound if nothing better to do
    if (!p.engaged && p.state !== 'flee' && p.state !== 'feed') {
      for (const n of this.noises) {
        if (this.clock - n.t > 0.6) continue;
        if (n.pos.distanceTo(p.pos) < n.r * (s.ambush ? 0.5 : 1)) {
          p.lastKnown.copy(n.pos); p.aware = Math.max(p.aware, 0.45);
          if (p.state !== 'hide' && p.state !== 'perch') { p.state = 'alert'; p.t = 10; }
          else if (n.pos.distanceTo(p.pos) < 18) { p.state = 'alert'; p.t = 10; }
          if (Math.random() < 0.35) this.env.audio.play('growl', p.chest(tmp), { gain: 0.6, gap: 3 });
        }
      }
    }
    // scent: nose to the ground — follow the trail toward fresher crumbs
    if ((p.state === 'patrol' || p.state === 'idle' || p.state === 'alert') && (s.body === 'wolf' || s.body === 'mantis')) {
      for (const c of this.crumbs) {
        if (this.clock - c.t > 45 || c.t <= p.scentT) continue;
        if (c.pos.distanceTo(p.pos) < 6) { p.scentT = c.t; p.state = 'track'; p.t = 12; break; }
      }
    }
    // spotted → hunt
    if (p.aware > 0.6 && p.target && ['idle', 'patrol', 'alert', 'track', 'hide', 'perch'].includes(p.state)) {
      const d = p.target.pos.distanceTo(p.pos);
      if (p.state === 'hide') { if (d < 8) { p.state = 'charge'; p.t = 4; this.env.audio.play('hiss', p.chest(tmp), { gain: 0.9 }); } }
      else if (p.state === 'perch') { p.state = 'charge'; p.t = 8; this.env.audio.play('buzz', p.chest(tmp), { gain: 0.8, gap: 2 }); }
      else { p.state = s.fly ? 'charge' : 'stalk'; p.t = 10; if (p.pack) this.alertPack(p, p.target); else if (s.body === 'wolf') this.env.audio.play('growl', p.chest(tmp), { gain: 0.9, gap: 2 }); }
    }
  }

  // ── per frame ───────────────────────────────────────────────────────────────────────────────────────────────────
  update(dt: number, playerPos: THREE.Vector3, crouched: boolean, sprinting: boolean, playerDown: boolean, enemies: Enemy[]) {
    this.clock += dt;
    if ((this.denT -= dt) <= 0) { this.denT = 1; this.manageDens(playerPos); }
    const player: Prey = { pos: playerPos, enemy: null };
    for (const d of this.dens) if (d.pack) {
      const pk = d.pack;
      pk.tokenT -= dt;
      if (pk.token && (!pk.token.alive || pk.tokenT <= 0 || !['charge', 'tell', 'strike'].includes(pk.token.state))) pk.token = null;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.state === 'dead') { this.updateDead(p, dt); continue; }
      if ((p.senseT -= dt) <= 0) { p.senseT = 0.25; this.sense(p, player, crouched, sprinting, enemies); }
      if (playerDown && p.target && !p.target.enemy && !p.target.quarry) { p.target = null; p.aware = 0; p.state = 'patrol'; p.t = 4; }
      this.think(p, dt);
      this.move(p, dt);
    }
    // pack members keep apart
    for (const a of this.list) for (const b of this.list) if (a !== b && a.alive && b.alive) {
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 2.2 && d2 > 1e-4) { const d = Math.sqrt(d2), k = (1.5 - d) * 0.5; a.pos.x += (dx / d) * k * dt * 6; a.pos.z += (dz / d) * k * dt * 6; }
    }
    this.updateBolts(dt, playerPos, enemies);
    this.updateMotes(dt, playerPos);
    const old = this.clock - 1;
    while (this.noises.length && this.noises[0].t < old) this.noises.shift();
  }

  private think(p: Predator, dt: number) {
    const s = p.spec, env = this.env;
    p.t -= dt; p.attackCd -= dt;
    p.hurtRecent = Math.max(0, p.hurtRecent - dt * p.maxHp * 0.1);
    p.body.glow += (1 - p.body.glow) * Math.min(1, dt * 4);
    const tgt = p.target, toT = tgt ? tmp.subVectors(tgt.pos, p.pos).setY(0) : null, dT = toT ? toT.length() : Infinity;
    const homeD = Math.hypot(p.pos.x - p.home.x, p.pos.z - p.home.z);
    // too far from home: give the chase up
    if (p.engaged && homeD > p.den.r + 70) { p.state = 'patrol'; p.target = null; p.aware = 0; p.goal.copy(p.home); p.t = 10; }
    // lost you: long out of sight and far off → go and search where it last saw you, then give up
    else if (p.engaged && tgt && !tgt.enemy && !tgt.quarry && p.aware < 0.05 && dT > 25) { p.state = 'alert'; p.t = 8; p.target = null; }
    let crouch = 0, want = 0;
    switch (p.state) {
      case 'idle':
        if (p.t <= 0) { p.state = 'patrol'; p.t = 8 + Math.random() * 6; this.pickPatrol(p); }
        break;
      case 'patrol':
        want = s.walk;
        if (p.goal.distanceTo(tmp2.copy(p.pos).setY(p.goal.y)) < 1.5 || p.t <= 0) {
          if (s.ambush === 'foliage') { p.state = 'hide'; p.t = 20; } else if (s.ambush === 'above') { p.state = 'perch'; p.t = 15; } else { p.state = 'idle'; p.t = 2 + Math.random() * 4; }
        }
        break;
      case 'hide':
        crouch = 1; p.body.glow = Math.min(p.body.glow, 0.2);    // still, low and dark among the ferns
        if (p.t <= 0) { p.state = 'patrol'; p.t = 8; this.pickPatrol(p); }
        break;
      case 'perch':
        want = 0.6; p.body.glow = Math.min(p.body.glow, 0.45);
        if (p.t <= 0) { p.state = 'patrol'; p.t = 8; this.pickPatrol(p); }
        break;
      case 'alert':
        want = s.walk * 2; p.goal.copy(p.lastKnown);
        if (p.goal.distanceTo(tmp2.copy(p.pos).setY(p.goal.y)) < 2 || p.t <= 0) { p.state = 'idle'; p.t = 3; }
        break;
      case 'track': {
        want = s.walk * 2.2; crouch = 0.4;
        // the next fresher crumb within reach
        let next: Crumb | null = null;
        for (const c of this.crumbs) if (c.t > p.scentT && c.pos.distanceTo(p.pos) < 14 && (!next || c.t < next.t)) next = c;
        if (next) { p.goal.copy(next.pos); if (next.pos.distanceTo(p.pos) < 2) p.scentT = next.t; } else if (p.t < 9) { p.state = 'alert'; p.t = 5; }
        if (p.t <= 0) { p.state = 'idle'; p.t = 2; }
        break;
      }
      case 'stalk': {
        if (!tgt) { p.state = 'patrol'; break; }
        crouch = s.body === 'mantis' ? 0.6 : 1; want = s.walk * 1.6;
        // a flank point behind the target (players: away from where they look), preferring one out of their sight
        if (p.senseT > 0.2) this.flankPoint(p, tgt, 9);
        if (dT < 11 || p.t <= 0) { p.state = p.pack ? 'circle' : 'charge'; p.t = p.pack ? 2 + Math.random() * 2 : 5; }
        break;
      }
      case 'circle': {
        if (!tgt) { p.state = 'patrol'; break; }
        want = s.run * 0.55; crouch = 0.5;
        p.slot += dt * 0.5 * (p.id % 2 ? 1 : -1);
        p.goal.set(tgt.pos.x + Math.sin(p.slot) * 8, tgt.pos.y, tgt.pos.z + Math.cos(p.slot) * 8);
        const pk = p.pack;
        const night = env.night() > 0.5;
        if (pk && !pk.token && p.t <= 0 && p.attackCd <= 0) { pk.token = p; pk.tokenT = 4; p.state = 'charge'; p.t = 4; }
        else if (!pk && p.t <= 0) { p.state = 'charge'; p.t = 4; }
        else if (pk && night && pk.token && pk.token !== p && p.t < -1.5 && p.attackCd <= 0) { p.state = 'charge'; p.t = 4; }  // at night two can come at once
        if (dT > 20) { p.state = 'stalk'; p.t = 6; }
        break;
      }
      case 'charge': {
        if (!tgt) { p.state = 'patrol'; break; }
        want = s.run;
        if (s.ranged) {
          // hold off at range, above, and line up a shot
          if (p.senseT > 0.2) { this.flankPoint(p, tgt, Math.min(s.ranged * 0.6, 12)); }
          if (dT < s.ranged && p.attackCd <= 0 && env.clear(p.chest(tmp2), tmp3.copy(tgt.pos).setY(tgt.pos.y + 1))) this.startTell(p);
        } else {
          p.goal.copy(tgt.pos);
          if (dT < s.reach + (s.fly ? 2.5 : 0.8)) this.startTell(p);
        }
        if (p.t <= 0) { p.state = p.pack ? 'circle' : 'stalk'; p.t = 2; }
        break;
      }
      case 'tell': {
        // the wind-up: it stops and squares up, the body coils (creatures.ts uTell), the glow flares
        want = s.fly && !s.ranged ? s.walk : 0;
        if (tgt) p.goal.copy(tgt.pos);
        const k = 1 - Math.max(0, p.t) / s.tell;
        p.body.tell = Math.min(1, k * 1.4); p.body.glow = 1 + k * 2.4;
        if (Math.random() < dt * 8) env.vfx.spawn(PREDATOR_TELL, p.chest(tmp2), { tint: s.tint, count: 0.6 });
        if (p.t <= 0) this.strike(p);
        break;
      }
      case 'strike': {
        want = s.fly ? s.run * 1.3 : s.run * 1.6;               // the lunge carries it through
        if (tgt && !s.ranged) p.goal.copy(tgt.pos);
        if (!p.struck && tgt && !s.ranged) {
          const d = tgt.pos.distanceTo(p.pos);
          if (d < s.reach + 0.5 && Math.abs(tgt.pos.y - (p.pos.y + p.body.hover)) < 2.6 + p.body.hover) {
            p.struck = true;
            this.hit(p, tgt);
          }
        }
        if (p.t <= 0) { p.state = 'recover'; p.t = s.recover; p.body.tell = 0; }
        break;
      }
      case 'recover':
        want = s.fly ? s.run * 0.6 : 0; p.body.tell *= 0.8;
        if (s.fly && tgt) this.flankPoint(p, tgt, s.ranged ? 12 : 10);
        if (p.t <= 0) { p.attackCd = 0.8 + Math.random() * 1.2; p.state = p.pack ? 'circle' : 'charge'; p.t = p.pack ? 1.5 + Math.random() * 2 : 5; if (p.pack?.token === p) p.pack.token = null; }
        break;
      case 'retreat':
        want = s.run * 0.8; crouch = 0.3;
        if (tgt) { tmp2.subVectors(p.pos, tgt.pos).setY(0).normalize(); p.goal.copy(p.pos).addScaledVector(tmp2, 8); }
        if (p.t <= 0) { p.state = p.pack ? 'circle' : 'stalk'; p.t = 2; }
        break;
      case 'flee':
        want = s.run;
        if (tgt) { tmp2.subVectors(p.pos, tgt.pos).setY(0).normalize(); p.goal.copy(p.pos).addScaledVector(tmp2, 10); }
        else p.goal.copy(p.home);
        if (p.t <= 0 && (!tgt || dT > 35)) { p.state = 'patrol'; p.target = null; p.aware = 0; p.goal.copy(p.home); p.t = 15; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); }
        break;
      case 'feed': {
        const c = p.meal;
        if (c && c.bites > 0 && p.pos.distanceTo(c.pos) > 1.8) { want = s.walk * 2.5; p.goal.copy(c.pos); break; }
        crouch = 0.8; want = 0;
        p.hp = Math.min(p.maxHp, p.hp + dt * 6);
        if (c && (p.biteT -= dt) <= 0) { p.biteT = 3; if (!env.bite?.(c)) p.meal = null; else this.env.audio.play('crack', c.pos, { gain: 0.5, rate: 0.7, gap: 1 }); }
        if (p.t <= 0 || (p.meal === null && c)) { p.state = 'patrol'; p.t = 8; p.meal = null; this.pickPatrol(p); }
        break;
      }
    }
    // the rift's creatures fight back when it's on top of them
    if (tgt?.enemy && dT < 2.8 && p.alive) {
      if ((p.fightT -= dt) <= 0) { p.fightT = 1.1; this.damage(p.id, Math.round(tgt.enemy.hitDmg * 0.8), tgt.pos, 0.6, false); env.vfx.spawn(HIT_SPARKS, p.chest(tmp2), { tint: 0x38e8ff, count: 0.6 }); }
    }
    if (s.body === 'wolf' && s.size > 1.2 && ['patrol', 'track', 'alert', 'idle'].includes(p.state)) crouch = Math.max(crouch, 0.55); // the stalker always prowls low
    p.body.crouch += (crouch - p.body.crouch) * Math.min(1, dt * 5);
    if (p.state !== 'tell' && p.state !== 'strike') p.body.tell += (0 - p.body.tell) * Math.min(1, dt * 6);
    p.speed += (want - p.speed) * Math.min(1, dt * (want > p.speed ? 4 : 6));
  }

  private startTell(p: Predator) {
    const s = p.spec;
    if (p.attackCd > 0) return;
    p.state = 'tell'; p.t = s.tell; p.struck = false;
    const c = p.chest(tmp2);
    if (s.body === 'wasp') this.env.audio.play('buzz', c, { gain: 1.1, rate: 1.3 });
    else if (s.body === 'bat') this.env.audio.play('screech', c, { gain: 1 });
    else if (s.body === 'mantis') this.env.audio.play('hiss', c, { gain: 1, rate: 1.2 });
    else this.env.audio.play('growl', c, { gain: 1.1, gap: 0.8 });
  }

  private strike(p: Predator) {
    const s = p.spec, tgt = p.target;
    p.state = 'strike'; p.t = s.strike; p.body.attack(); p.body.tell = 0.3;
    const c = p.chest(new THREE.Vector3());
    this.env.audio.play('strike', c, { gain: 1, rate: s.size > 1.2 ? 0.8 : 1.1 });
    if (s.ranged && tgt) {
      // a plasma stinger bolt, aimed where the target is heading (a little lead), dodgeable
      const aim = tmp2.copy(tgt.pos).setY(tgt.pos.y + 1.0);
      const vel = aim.sub(c).normalize().multiplyScalar(26);
      const mat = new THREE.MeshBasicNodeMaterial({ color: s.tint, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.color.lerp(new THREE.Color(0xffffff), 0.35);
      const mesh = new THREE.Mesh(this.boltGeo, mat); mesh.position.copy(c); this.group.add(mesh);
      const trail = this.env.vfx.trail({ ...STREAK_TRAIL, color: s.tint, width: 0.14, life: 0.2 });
      trail.emitting = true;
      this.bolts.push({ mesh, vel, life: 2, trail, dmg: s.dmg, from: p });
      this.env.vfx.spawn(SPARK_ARC, c, { tint: s.tint, count: 0.6 });
    }
  }

  private hit(p: Predator, tgt: Prey) {
    const s = p.spec, env = this.env;
    const at = tmp3.copy(tgt.pos).setY(tgt.pos.y + 1);
    env.vfx.spawn(HIT_SPARKS, at, { tint: s.tint, dir: [p.pos.x - at.x, 0.4, p.pos.z - at.z] });
    if (tgt.quarry) {
      if (env.damageQuarry?.(tgt.quarry, Math.round(s.dmg * 2.5), p.pos)) {
        p.target = null; p.aware = 0;
        const c = env.carcass?.(tgt.pos, 3) ?? null;
        if (c) { p.meal = c; p.state = 'feed'; p.t = 20; p.goal.copy(c.pos); }
      }
      return;
    }
    if (tgt.enemy) {
      tmp2.subVectors(tgt.pos, p.pos).setY(0).normalize();
      if (env.damageEnemy(tgt.enemy, Math.round(s.dmg * 2.2), tmp2)) { p.target = null; p.aware = 0; p.state = 'feed'; p.t = 4; this.env.audio.play('growl', p.chest(tmp2), { gain: 0.8 }); }
      return;
    }
    const night = env.night() > 0.5 ? 1.2 : 1;
    env.hurtPlayer(Math.round(s.dmg * night), s.name.toUpperCase());
    if (s.venom) env.status.apply('poison', 5);
    if (s.shock) env.status.apply('shock', 0.6);
  }

  private flankPoint(p: Predator, tgt: Prey, r: number) {
    // candidates round the target; score: behind them (players: their facing is unknown here, so use the side away
    // from the target's line to its den), short travel, and out of the target's sight line
    let best = -Infinity;
    const eye = tmp3.copy(tgt.pos).setY(tgt.pos.y + 1.6);
    const base = Math.atan2(p.pos.x - tgt.pos.x, p.pos.z - tgt.pos.z);
    for (let k = -2; k <= 2; k++) {
      const a = base + k * 0.6 + (p.slot % 0.6), x = tgt.pos.x + Math.sin(a) * r, z = tgt.pos.z + Math.cos(a) * r;
      const y = this.env.ground(x, z);
      const pt = tmp2.set(x, y + 1, z);
      let sc = -Math.abs(k) * 0.4 + Math.abs(k) * (p.id % 3 === 0 ? 0.5 : 0.25);   // pack members fan out to the sides
      if (!this.env.clear(eye, pt)) sc += 1.2;                                       // cover between it and the target
      if (sc > best) { best = sc; p.goal.set(x, y, z); }
    }
  }

  private pickPatrol(p: Predator) {
    // now and then a patrol leads to fruit near the territory (an ambush spot for you, too)
    const food = this.env.attractors?.().filter((f) => Math.hypot(f.x - p.den.x, f.z - p.den.z) < p.den.r + 30) ?? [];
    if (food.length && Math.random() < 0.35) { const f = food[Math.floor(Math.random() * food.length)]; p.goal.set(f.x + (Math.random() - 0.5) * 3, f.y, f.z + (Math.random() - 0.5) * 3); return; }
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.den.r;
    const x = p.den.x + Math.cos(a) * r, z = p.den.z + Math.sin(a) * r;
    p.goal.set(x, this.env.ground(x, z), z);
  }

  private move(p: Predator, dt: number) {
    const s = p.spec, env = this.env;
    const look = p.state === 'tell' || p.state === 'recover' || p.state === 'circle' ? p.target?.pos ?? p.goal : p.goal;
    const dx = p.goal.x - p.pos.x, dz = p.goal.z - p.pos.z, d = Math.hypot(dx, dz);
    if (p.speed > 0.05 && d > 0.3) {
      const step = Math.min(d, p.speed * dt);
      p.pos.x += (dx / d) * step; p.pos.z += (dz / d) * step;
    }
    // face: toward travel, or squared up to the target in the wind-up / circling
    const fx = look.x - p.pos.x, fz = look.z - p.pos.z;
    if (Math.hypot(fx, fz) > 0.2 && (p.speed > 0.3 || p.state === 'tell' || p.state === 'circle' || p.state === 'recover')) {
      let dy = Math.atan2(fx, fz) - p.mesh.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.mesh.rotation.y += dy * Math.min(1, dt * (p.state === 'tell' ? 10 : 6));
    }
    if (s.fly) {
      const f = s.fly;
      const wantAlt = (p.state === 'perch' ? f.perch ?? f.cruise : p.state === 'strike' || p.state === 'tell' ? f.attack : f.cruise) - p.body.hover;
      p.alt += (wantAlt - p.alt) * Math.min(1, dt * (p.state === 'strike' ? 5 : 1.5));
      const gy = env.ground(p.pos.x, p.pos.z);
      p.pos.y += (gy + p.alt - p.pos.y) * Math.min(1, dt * 6);
    } else {
      const gy = env.floor(p.pos.x, p.pos.z, p.pos.y + 1.5) ?? env.ground(p.pos.x, p.pos.z);
      p.pos.y += (gy - p.pos.y) * Math.min(1, dt * 12);
      env.resolve(p.pos, 0.45 * s.size, 1.4 * s.size);
    }
    p.body.update(dt, p.measuredSpeed(dt));
  }

  private updateDead(p: Predator, dt: number) {
    p.deadT += dt;
    const k = Math.min(1, p.deadT / 0.5);
    p.body.root.rotation.z = k * (Math.PI / 2) * (p.id % 2 ? 1 : -1);
    if (p.spec.fly) { const gy = this.env.ground(p.pos.x, p.pos.z); p.pos.y = Math.max(gy - p.body.hover + 0.3, p.pos.y - dt * 9); }
    p.body.glow = Math.max(0, 1 - p.deadT / 2);
    p.body.update(dt, 0);
    if (p.deadT > 2.6) p.pos.y -= dt * 0.8;
    if (p.deadT > 4) this.remove(p);
  }

  private updateBolts(dt: number, playerPos: THREE.Vector3, enemies: Enemy[]) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt; b.mesh.position.addScaledVector(b.vel, dt); b.trail.push(b.mesh.position);
      const p = b.mesh.position;
      let hit = false;
      if (tmp.copy(playerPos).setY(playerPos.y + 1).distanceTo(p) < 0.9) {
        hit = true; this.env.hurtPlayer(b.dmg, b.from.spec.name.toUpperCase()); this.env.status.apply('shock', 0.7);
      } else for (const e of enemies) if (e.hp > 0 && tmp.copy(e.mesh.position).setY(e.mesh.position.y + 1).distanceTo(p) < 1.0) { hit = true; this.env.damageEnemy(e, b.dmg * 2, b.vel.clone().normalize()); break; }
      if (!hit && p.y < this.env.ground(p.x, p.z) + 0.1) hit = true;
      if (hit || b.life <= 0) {
        this.env.vfx.spawn(PLASMA_POP, p, { tint: b.from.spec.tint });
        this.env.audio.play('zap', p, { gain: 0.9 });
        this.group.remove(b.mesh); (b.mesh.material as THREE.Material).dispose();
        b.trail.emitting = false;
        const tr = b.trail; window.setTimeout(() => this.env.vfx.removeTrail(tr), 400);
        this.bolts.splice(i, 1);
      }
    }
  }

  private updateMotes(dt: number, playerPos: THREE.Vector3) {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      const p = m.mesh.position, gy = this.env.ground(p.x, p.z);
      const to = tmp.copy(playerPos).setY(playerPos.y + 1).sub(p), d = to.length();
      if (d < 6) p.addScaledVector(to.normalize(), Math.min(d, dt * 9));          // drawn to you once you're close
      else p.y += ((gy + 1.2 + Math.sin(m.life * 3) * 0.2) - p.y) * Math.min(1, dt * 2);
      m.mesh.rotation.y += dt * 2; m.mesh.scale.setScalar(1 + Math.sin(m.life * 6) * 0.15);
      if (d < 1.1) {
        this.env.heal(m.heal);
        this.env.vfx.spawn(PICKUP_GLINT, p, { tint: 0x7dffb0 });
        this.env.audio.play('zap', p, { gain: 0.4, rate: 2 });
      }
      if (d < 1.1 || m.life <= 0) { this.group.remove(m.mesh); this.motes.splice(i, 1); }
    }
  }

  /** Debug: who's where doing what. */
  info() { return this.list.map((p) => ({ id: p.id, who: p.who, state: p.state, hp: p.hp, x: Math.round(p.pos.x), z: Math.round(p.pos.z), target: p.target ? (p.target.enemy ? 'enemy' : 'player') : null })); }
}
