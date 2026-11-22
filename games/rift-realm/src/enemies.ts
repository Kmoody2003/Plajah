// Enemy Soul Vessels that fight the player in the field (Elderwood's creatures, the Cyber Forest's, or the Paladin).
//
// Every enemy has an archetype (combat/tuning.ts): rushers close in and flank with quick strings, casters keep their
// distance, strafe and throw void bolts (retreating when you close in), brutes walk you down with a guard and an
// unblockable slam, and the boss mixes all of it. Attacks are telegraphed — a ring fills on the ground, the core
// flares, the body winds up — then a short hit window. Shots and strikes interrupt a wind-up (brutes / the boss need
// a heavy hit: poise), fill a stagger meter (full = dazed, open for a combo), and launched enemies float in a juggle.
// Attack tokens keep the pack honest: only a couple of them swing at you at once, the rest circle and wait.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import { assets, CharacterRig } from './characters';
import { COMBAT, type Archetype, type ArchetypeTuning, type EnemyAttack } from './combat/tuning';

/** A level can swap the robot for its own creatures (Cyber Forest: wolves, mantises, wasps). */
export interface EnemyBody {
  root: THREE.Object3D;
  /** Flying height of the model above the ground the enemy walks on. */
  hover: number;
  height: number;
  speedMul: number;
  hpMul: number;
  update(dt: number, speed: number): void;
  attack(): void;
  /** Optional: which combat archetype this creature fights as (else guessed: flyers cast, heavy ones are brutes). */
  archetype?: Archetype;
}
export const enemyBodies: { make: ((id: number, boss: boolean) => EnemyBody | null) | null; playerPos: THREE.Vector3 } = {
  make: null, playerPos: new THREE.Vector3(),
};

/**
 * Level hooks for where enemies go. `goal`: a place to be when the player is far (a control point to take);
 * `via`: the next waypoint toward a target on another level (the stairs, a net, a bridge) — straight-line steering
 * can't get onto a deck 12 m up.
 */
export const enemyNav: {
  goal: ((from: THREE.Vector3) => THREE.Vector3 | null) | null;
  via: ((from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3) | null;
} = { goal: null, via: null };

export type EnemyState =
  | 'move'     // positioning: approach / circle / flank / retreat
  | 'windup'   // telegraph (readable), interruptible
  | 'active'   // the hit window
  | 'recover'  // after the swing: the punish window
  | 'stun'     // hit-stun (or parried)
  | 'daze'     // stagger meter broke: open for a combo
  | 'broken'   // guard broken: open, takes extra damage
  | 'air'      // launched, juggled
  | 'down'     // knocked down / landed, getting up
  | 'block'    // guarding against the player's strikes
  | 'dodge'    // sidestep / backstep (melee passes through)
  | 'held';    // held for a Soul-Rend execution

export interface Enemy {
  id: number;
  mesh: THREE.Group;
  hitTarget: THREE.Mesh;
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardNodeMaterial;
  hp: number;
  maxHp: number;
  speed: number;
  strafeSign: number;
  attackCooldown: number;
  /** Low enough to be executed (Soul-Rend). */
  staggered: boolean;
  rig: CharacterRig | null;
  body: EnemyBody | null;
  lastPos: THREE.Vector3;
  /** Rule player tags (Game Studio): the cast id it plays, the wave it came in (0 = the game's own), boss or not. */
  who: string;
  ruleWave: number;
  boss: boolean;
  hitDmg: number;
  // ── combat ──
  archetype: Archetype;
  tune: ArchetypeTuning;
  state: EnemyState;
  stateT: number;
  atk: EnemyAttack | null;
  /** Hits of the current string left to throw, and whether this hit window already connected. */
  hitsLeft: number;
  struck: boolean;
  token: 'melee' | 'ranged' | null;
  guard: number;
  stagger: number;
  /** Poise damage taken recently (decays): a wind-up breaks when it passes tune.poise. */
  poiseAcc: number;
  /** Height above the ground while launched, and vertical speed. */
  air: number;
  vy: number;
  juggle: number;
  spiked: boolean;
  /** Ground under the enemy (it stands at groundY + air). */
  groundY: number;
  /** Knockback / dodge / charge velocity (decays). */
  push: THREE.Vector3;
  chargeDir: THREE.Vector3;
  dodgeCd: number;
  /** Was parried: the riposte window. */
  parried: boolean;
  /** Bearing slot around the player (radians), so the pack spreads out. */
  slot: number;
  flinch: number;
  /** Seconds left sliding round cover (no clear shot). */
  blockedT: number;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicNodeMaterial;
}

/** What hit the player, for the block / parry / dodge decision in main.ts. */
export interface EnemyStrike {
  enemy: Enemy | null;
  attack: EnemyAttack;
  dmg: number;
  unblockable: boolean;
  from: THREE.Vector3;
  bolt?: Bolt;
}
export type StrikeOutcome = 'hit' | 'blocked' | 'parried' | 'evaded';

export interface HitOpts {
  source?: 'shot' | 'melee' | 'surge' | 'reflect' | 'execute';
  hitstun?: number;
  guardDmg?: number;
  launch?: number;
  spike?: boolean;
  /** Ignore the enemy's guard. */
  unblockable?: boolean;
}

export interface HitResult {
  killed: boolean;
  pos: THREE.Vector3;
  dmg?: number;
  blocked?: boolean;
  guardBroken?: boolean;
  interrupted?: boolean;
  dazed?: boolean;
  airborne?: boolean;
  dodged?: boolean;
}

export interface Bolt {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  owner: Enemy | null;
  attack: EnemyAttack;
  reflected: boolean;
}

/** Seconds a fallen enemy stays on the floor. */
const CORPSE_SEC = 3.5;

const RING_GEO = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const BOLT_GEO = new THREE.IcosahedronGeometry(0.2, 1);
const BOLT_GLOW_GEO = new THREE.SphereGeometry(0.48, 12, 8);
const TELE_COL: Record<EnemyAttack['kind'], number> = { melee: 0xff3b4e, charge: 0xff7a2a, slam: 0xffb020, bolt: 0xb46bff, barrage: 0xd946ef };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class EnemyManager {
  readonly group = new THREE.Group();
  enemies: Enemy[] = [];
  bolts: Bolt[] = [];
  private nextId = 1;
  wave = 1;
  /** Facing of the player (main sets it each frame): flankers go for the sides and back. */
  playerForward = new THREE.Vector3(0, 0, -1);
  /** Chest height above the player's feet (crouched is lower). */
  playerChest = 1.3;
  /** Debug / arena: force every new spawn to this archetype. */
  forceArchetype: Archetype | null = null;
  /** Freeze the AI (debug arena): enemies stand still and don't attack. */
  passive = false;

  /** Called when an enemy dies (the rule player listens). */
  onKilled?: (e: Enemy) => void;
  /** Feedback hooks (main.ts plays sound / vfx): a wind-up starting, a slam landing, a bolt thrown. */
  onTelegraph?: (e: Enemy, a: EnemyAttack) => void;
  onSlam?: (e: Enemy, at: THREE.Vector3, radius: number) => void;
  onBolt?: (b: Bolt) => void;
  onBoltHit?: (at: THREE.Vector3, reflected: boolean) => void;
  onDodge?: (e: Enemy) => void;

  /** `auto` = the game's own endless trials; off when a level's rules decide who arrives. */
  constructor(scene: THREE.Scene, private world: CollisionWorld, private spots: THREE.Vector3[], private auto = true) {
    scene.add(this.group);
    if (auto) this.spawnWave(3);
  }

  /** Rule player: `count` enemies tagged `who` from wave `ruleWave`. */
  spawnTagged(count: number, who: string, ruleWave: number) {
    const pool = [...this.spots].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) { const s = pool[i % pool.length]; this.spawnOne(s.x, s.z, s.y, { who, ruleWave }); }
  }

  /** Rule player: one big, tough enemy at the spot farthest from `from`. */
  spawnBoss(who: string, ruleWave: number, from: THREE.Vector3) {
    const s = [...this.spots].sort((a, b) => b.distanceToSquared(from) - a.distanceToSquared(from))[0] ?? new THREE.Vector3();
    return this.spawnOne(s.x, s.z, s.y, { who, ruleWave, boss: true });
  }

  /** Debug arena: one enemy of an archetype at a point. */
  spawnAt(pos: THREE.Vector3, archetype: Archetype) {
    return this.spawnOne(pos.x, pos.z, pos.y, { boss: archetype === 'boss', archetype });
  }

  /** Remove everyone (the level ended). */
  clear() {
    for (const e of this.enemies) { this.group.remove(e.mesh); this.group.remove(e.ring); }
    for (const c of this.corpses) this.group.remove(c.mesh);
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.corpses = [];
    this.bolts = [];
    this.enemies.length = 0;
    this.tokens.melee.clear(); this.tokens.ranged.clear();
  }

  spawnWave(count: number) {
    const pool = [...this.spots].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const s = pool[i % pool.length];
      this.spawnOne(s.x, s.z, s.y);
    }
  }

  private pickArchetype(body: EnemyBody | null, boss: boolean): Archetype {
    if (boss) return 'boss';
    if (this.forceArchetype) return this.forceArchetype;
    if (body?.archetype) return body.archetype;
    // a level's creature: flyers keep their distance, heavy ones are brutes, the rest rush
    if (body) return body.hover > 0.3 ? 'caster' : body.hpMul >= 1.35 ? 'brute' : 'rusher';
    const [r, c, b] = COMBAT.ai.mix;
    const bw = this.wave >= 2 ? b : 0;
    let k = Math.random() * (r + c + bw);
    if ((k -= r) < 0) return 'rusher';
    if ((k -= c) < 0) return 'caster';
    return 'brute';
  }

  private spawnOne(x: number, z: number, y = 0, tag: { who?: string; ruleWave?: number; boss?: boolean; archetype?: Archetype } = {}): Enemy {
    const mesh = new THREE.Group();
    mesh.position.set(x, y, z);

    const chassisMat = new THREE.MeshStandardNodeMaterial({
      color: 0x1e1b2e, roughness: 0.35, metalness: 0.8,
    });
    const coreMat = new THREE.MeshStandardNodeMaterial({
      color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 1.8, roughness: 0.15,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.75), chassisMat);
    body.position.y = 1.05;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), coreMat);
    core.position.set(0, 1.15, 0.38);

    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), chassisMat);
    head.position.y = 1.95;

    // Invisible slightly generous hitbox for crisp shooter feel
    const hitTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 2.1, 8),
      new THREE.MeshBasicNodeMaterial({ visible: false }),
    );
    hitTarget.position.y = 1.05;
    hitTarget.userData.enemyId = this.nextId;

    let rig: CharacterRig | null = null;
    const creature = enemyBodies.make?.(this.nextId, !!tag.boss) ?? null;
    if (creature) {
      mesh.add(creature.root, core, hitTarget);
      core.visible = false;
      hitTarget.scale.set(1, creature.height / 2.1, 1);
      hitTarget.position.y = creature.hover + creature.height / 2;
    } else if (assets.paladin) {
      rig = new CharacterRig(assets.paladin, 2.0);
      mesh.add(rig.root, core, hitTarget);
      core.visible = false; // the Paladin has its own glowing trim
    } else {
      mesh.add(body, core, head, hitTarget);
    }
    this.group.add(mesh);

    const archetype = tag.archetype ?? this.pickArchetype(creature, !!tag.boss);
    const tune = COMBAT.ai.archetypes[archetype];
    // a level's own creature keeps its size; the Paladin / robot is scaled to read its archetype
    if (!creature || tag.boss) mesh.scale.setScalar(tune.scale);
    coreMat.color.setHex(tune.tint); coreMat.emissive.setHex(tune.tint);

    const ringMat = new THREE.MeshBasicNodeMaterial({ color: 0xff3b4e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(RING_GEO, ringMat);
    ring.visible = false;
    ring.renderOrder = 5;
    this.group.add(ring);

    const maxHp = Math.round((tune.hp + (this.wave - 1) * tune.hpPerWave) * (creature?.hpMul ?? 1));
    const enemy: Enemy = {
      id: this.nextId++,
      mesh,
      hitTarget,
      core,
      coreMat,
      hp: maxHp,
      maxHp,
      speed: tune.speed * rand(0.9, 1.15) * (creature?.speedMul ?? 1),
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      attackCooldown: rand(0.8, 1.6),
      staggered: false,
      rig,
      body: creature,
      lastPos: mesh.position.clone(),
      who: tag.who ?? '',
      ruleWave: tag.ruleWave ?? 0,
      boss: !!tag.boss,
      hitDmg: tune.attacks[0]?.dmg ?? 10,
      archetype, tune,
      state: 'move', stateT: 0, atk: null, hitsLeft: 0, struck: false, token: null,
      guard: tune.guard, stagger: 0, poiseAcc: 0,
      air: 0, vy: 0, juggle: 0, spiked: false, groundY: y,
      push: new THREE.Vector3(), chargeDir: new THREE.Vector3(),
      dodgeCd: rand(0.5, 1.5), parried: false,
      slot: Math.random() * Math.PI * 2, flinch: 0, blockedT: 0,
      ring, ringMat,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  getHitMeshes(): THREE.Object3D[] {
    return this.enemies.map((e) => e.hitTarget);
  }

  byId(id: number) { return this.enemies.find((e) => e.id === id) ?? null; }

  // ── attack tokens ──────────────────────────────────────────────────────────────────────────────────────────
  private tokens = { melee: new Set<number>(), ranged: new Set<number>() };
  private takeToken(e: Enemy, kind: 'melee' | 'ranged') {
    const set = this.tokens[kind];
    const max = kind === 'melee' ? COMBAT.ai.maxMeleeTokens : COMBAT.ai.maxRangedTokens;
    // the boss always gets its turn; a dazed / airborne holder doesn't block the others
    for (const id of set) { const o = this.byId(id); if (!o || o.token !== kind) set.delete(id); }
    if (!e.boss && set.size >= max) return false;
    set.add(e.id); e.token = kind;
    return true;
  }
  private dropToken(e: Enemy) {
    if (e.token) this.tokens[e.token].delete(e.id);
    e.token = null;
  }
  get tokenState() { return { melee: [...this.tokens.melee], ranged: [...this.tokens.ranged] }; }

  // ── state helpers ──────────────────────────────────────────────────────────────────────────────────────────
  private setState(e: Enemy, s: EnemyState, t: number) {
    if ((s !== 'windup' && s !== 'active' && s !== 'recover') && e.token) this.dropToken(e);
    if (s !== 'windup' && s !== 'active') this.hideRing(e);
    e.state = s; e.stateT = t;
    if (s !== 'stun') e.parried = false;
  }
  /** Play the first clip the rig has (reaction clips arrive from the characters track as they're made). */
  private react(e: Enemy, names: string[], seconds: number, weight = 1) {
    const n = e.rig && names.find((c) => e.rig!.has(c));
    if (n) e.rig!.play(n, weight, seconds);
  }
  private hideRing(e: Enemy) { e.ring.visible = false; e.ringMat.opacity = 0; }
  private isOpen(e: Enemy) { return e.state === 'stun' || e.state === 'daze' || e.state === 'broken' || e.state === 'air' || e.state === 'down' || e.state === 'held'; }

  /** The player's strike is coming at these enemies: some raise their guard, some step back. */
  strikeIncoming(from: THREE.Vector3, fwd: THREE.Vector3, range: number) {
    for (const e of this.enemies) {
      if (e.state !== 'move' || e.dodgeCd > 0 || this.passive) continue;
      _v.subVectors(e.mesh.position, from).setY(0);
      const d = _v.length();
      if (d > range + 1.2 || d < 0.01 || fwd.dot(_v.divideScalar(d)) < 0.2) continue;
      if (Math.random() < e.tune.block && e.guard > 0) {
        this.setState(e, 'block', 0.7);
        e.rig?.play('block', 1, 0.7);
        e.dodgeCd = e.tune.dodgeCooldown * 0.6;
      } else if (Math.random() < e.tune.dodgeStrike) {
        this.dodge(e, _w.copy(_v).multiplyScalar(1).add(_u.set(-_v.z, 0, _v.x).multiplyScalar(e.strafeSign * 0.6)).normalize(), 'dodge_back');
      }
    }
  }

  /** A shot went down this line: enemies near it may juke the next one. */
  shotFired(origin: THREE.Vector3, dir: THREE.Vector3) {
    for (const e of this.enemies) {
      if (e.state !== 'move' || e.dodgeCd > 0 || this.passive) continue;
      // heavies don't sidestep: they raise their guard into your fire (shoot round it, or break it with a heavy)
      if (e.tune.dodgeShot <= 0) {
        if ((e.archetype === 'brute' || e.boss) && e.guard > 0 && Math.random() < e.tune.block * 0.35) {
          this.setState(e, 'block', 1.1); e.rig?.play('block', 1, 1.1); e.dodgeCd = e.tune.dodgeCooldown * 0.4;
        } else e.dodgeCd = 0.6;
        continue;
      }
      _v.subVectors(e.mesh.position, origin); _v.y += 1;
      const along = _v.dot(dir);
      if (along < 2 || along > 40) continue;
      const off = _w.copy(dir).multiplyScalar(along).sub(_v).length();
      if (off > 2.4) continue;
      if (Math.random() < e.tune.dodgeShot) {
        _u.set(-dir.z, 0, dir.x).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
        this.dodge(e, _u, _u.dot(_w.set(Math.cos(e.mesh.rotation.y), 0, -Math.sin(e.mesh.rotation.y))) > 0 ? 'dodge_right' : 'dodge_left');
      } else e.dodgeCd = 0.6; // decided not to: don't re-roll every shot of a burst
    }
  }

  private dodge(e: Enemy, dir: THREE.Vector3, clip: string) {
    this.setState(e, 'dodge', 0.34);
    e.push.copy(dir).setY(0).normalize().multiplyScalar(e.archetype === 'caster' ? 13 : 11);
    e.dodgeCd = e.tune.dodgeCooldown * rand(0.8, 1.3);
    if (e.rig) e.rig.play(e.rig.has(clip) ? clip : e.rig.has('dodge_left') ? 'dodge_left' : 'dive_roll', 1, 0.4);
    this.onDodge?.(e);
  }

  /** Hold an enemy still for a Soul-Rend (it can't act or be pushed until it dies or is released). */
  holdForExecution(id: number) {
    const e = this.byId(id); if (!e) return null;
    this.setState(e, 'held', 9);
    e.push.set(0, 0, 0);
    return e;
  }

  /** Knock the enemy back hard / pull it in (also used by the player's lunge to keep the target in reach). */
  shove(e: Enemy, dir: THREE.Vector3, dist: number) { e.push.addScaledVector(dir, dist * 6); }

  damageEnemy(id: number, amount: number, knockbackDir?: THREE.Vector3, knockbackDist = 0, o: HitOpts = {}): HitResult | null {
    const idx = this.enemies.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const e = this.enemies[idx];
    const t = e.tune;
    const src = o.source ?? 'shot';
    const pos = e.mesh.position.clone().add(new THREE.Vector3(0, 1.1 * e.mesh.scale.y, 0));
    const out: HitResult = { killed: false, pos };

    // a sidestep / backstep: strikes pass through it
    if (e.state === 'dodge' && (src === 'melee') && e.stateT > 0.08) { out.dodged = true; return out; }

    // guarding: strikes from the front hit the guard; brutes / the boss also shield against shots
    if (e.state === 'block' && !o.unblockable && src !== 'execute') {
      const facing = knockbackDir ? -knockbackDir.dot(_v.set(Math.sin(e.mesh.rotation.y), 0, Math.cos(e.mesh.rotation.y))) : 1;
      if (facing > 0.1 && (src === 'melee' || e.archetype === 'brute' || e.archetype === 'boss')) {
        e.guard -= o.guardDmg ?? amount;
        if (e.guard <= 0) {
          e.guard = 0;
          this.setState(e, 'broken', t.dazeSec);
          e.rig?.play('recover', 1, t.dazeSec);
          out.guardBroken = true;
        } else {
          e.hp -= Math.max(1, Math.round(amount * 0.12));
          e.stateT = Math.max(e.stateT, 0.35);
          if (knockbackDir) e.push.addScaledVector(knockbackDir, 2.5);
          out.blocked = true; out.dmg = Math.max(1, Math.round(amount * 0.12));
          if (e.hp > 0) return out;
        }
      }
    }

    let dmg = amount;
    if (e.state === 'broken') dmg *= 1.5;
    else if (e.parried) dmg *= 1.3;
    else if (e.state === 'recover') dmg *= 1.15;
    dmg = Math.max(1, Math.round(dmg));
    out.dmg = dmg;
    e.hp -= dmg;
    e.flinch = Math.min(1, e.flinch + (dmg >= e.maxHp * 0.2 ? 1 : 0.5));
    if (e.hp > dmg && e.state !== 'held') this.react(e, dmg >= e.maxHp * 0.2 ? ['hit_heavy', 'hit'] : ['hit'], dmg >= e.maxHp * 0.2 ? 0.8 : 0.4, 0.8);
    if (o.guardDmg && src === 'melee') e.guard = Math.max(0, e.guard - o.guardDmg * 0.25);

    if (e.hp <= 0) {
      this.kill(idx, e);
      out.killed = true;
      return out;
    }

    // finishable: low enough to be torn apart by a Soul-Rend
    if (!e.staggered && e.hp <= e.maxHp * t.finishAt) {
      e.staggered = true;
      e.coreMat.color.setHex(0xfbbf24);
      e.coreMat.emissive.setHex(0xfef08a);
      e.coreMat.emissiveIntensity = 3.0;
    }

    if (knockbackDir && knockbackDist > 0 && e.state !== 'held') e.push.addScaledVector(knockbackDir, knockbackDist * 6 * (e.archetype === 'brute' || e.boss ? 0.5 : 1));

    if (e.state === 'held') return out;

    // juggle: a launcher sends it up; air hits keep it there (less each time); a spike slams it down
    if (e.state === 'air') {
      out.airborne = true;
      if (o.spike) { e.vy = -24; e.spiked = true; }
      else {
        const decay = Math.max(0, 1 - e.juggle / COMBAT.player.juggleMax);
        const lift = src === 'shot' ? COMBAT.player.airShotLift : COMBAT.player.juggleLift;
        e.vy = Math.max(e.vy, lift * decay);
        e.juggle++;
        if (knockbackDir) e.push.multiplyScalar(0.4); // keep it close in the air
      }
      return out;
    }
    if (o.launch && t.launch > 0 && e.state !== 'down') {
      this.setState(e, 'air', 3);
      e.vy = o.launch * t.launch;
      e.air = Math.max(e.air, 0.05);
      e.juggle = 0;
      e.push.multiplyScalar(0.25);
      this.react(e, ['launch', 'hit_heavy'], 1.2);
      out.airborne = true;
      return out;
    }
    if (o.spike) { this.setState(e, 'down', 1.0); this.react(e, ['knockdown', 'get_up'], 1.0); return out; }

    // poise: a wind-up breaks when the recent damage passes it (rushers / casters: anything)
    e.poiseAcc += dmg;
    const winding = e.state === 'windup' || e.state === 'active';
    if (winding && e.poiseAcc >= t.poise) {
      this.setState(e, 'stun', 0.45);
      e.rig?.play('recover', 0.8, 0.45);
      out.interrupted = true;
    }

    // stagger meter: full = dazed, open for a combo
    e.stagger += src === 'shot' ? dmg * 1.1 : dmg * 0.7;
    if (e.stagger >= t.stagger && e.state !== 'broken') {
      e.stagger = 0;
      this.setState(e, 'daze', t.dazeSec);
      e.rig?.play('recover', 1, t.dazeSec);
      out.dazed = true;
      return out;
    }

    // hit-stun from strikes (armoured enemies shrug off light ones while not already open)
    if (o.hitstun && src !== 'shot') {
      const armour = (e.archetype === 'brute' || e.boss) && winding && e.poiseAcc < t.poise;
      if (!armour && e.state !== 'daze' && e.state !== 'broken') this.setState(e, 'stun', o.hitstun * (e.boss ? 0.55 : e.archetype === 'brute' ? 0.75 : 1));
    }
    return out;
  }

  private kill(idx: number, e: Enemy) {
    this.dropToken(e);
    this.hideRing(e);
    this.group.remove(e.ring);
    this.enemies.splice(idx, 1);
    e.mesh.rotation.x = 0;
    // the body falls (mocap collapse / shot-backwards fall) and stays a moment instead of vanishing
    if (e.rig?.hold(Math.random() < 0.5 ? 'death' : 'death_back')) {
      e.mesh.traverse((o) => { if (o.userData.enemyId !== undefined) o.visible = false; });
      this.corpses.push({ mesh: e.mesh, rig: e.rig, t: CORPSE_SEC });
    } else this.group.remove(e.mesh);
    this.onKilled?.(e);
    if (this.auto && this.enemies.length === 0) {
      this.wave++;
      this.spawnWave(Math.min(8, 2 + this.wave));
    }
  }

  /** Fallen enemies: their death clip holds, then they sink and are removed. */
  private corpses: { mesh: THREE.Object3D; rig: CharacterRig; t: number }[] = [];
  private updateCorpses(dt: number) {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t -= dt;
      c.rig.update(dt, 0);
      if (c.t < 0.8) c.mesh.position.y -= dt * 0.9; // sink away over the last moment
      if (c.t <= 0) { this.group.remove(c.mesh); this.corpses.splice(i, 1); }
    }
  }

  // ── bolts (casters, the boss) ──────────────────────────────────────────────────────────────────────────────
  private boltMat = new THREE.MeshBasicNodeMaterial({ color: 0xf0d9ff });
  private boltGlowMat = new THREE.MeshBasicNodeMaterial({ color: 0xa855f7, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  private reflMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff1b8 });
  private reflGlowMat = new THREE.MeshBasicNodeMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

  private throwBolt(e: Enemy, a: EnemyAttack, at: THREE.Vector3, spread = 0) {
    const target = at.clone();
    const g = new THREE.Group();
    const core = new THREE.Mesh(BOLT_GEO, this.boltMat), glow = new THREE.Mesh(BOLT_GLOW_GEO, this.boltGlowMat);
    g.add(core, glow);
    const s = e.mesh.scale.x;
    g.position.copy(e.mesh.position).add(_v.set(Math.sin(e.mesh.rotation.y) * 0.7 * s, (e.body ? e.body.hover + e.body.height * 0.6 : 1.4) * s, Math.cos(e.mesh.rotation.y) * 0.7 * s));
    const dir = _w.subVectors(target, g.position).normalize();
    if (spread) dir.applyAxisAngle(_u.set(0, 1, 0), spread);
    const b: Bolt = { mesh: g, vel: dir.clone().multiplyScalar(a.speed ?? 18), life: 3.2, dmg: this.scaleDmg(a.dmg), owner: e, attack: a, reflected: false };
    this.group.add(g);
    this.bolts.push(b);
    this.onBolt?.(b);
  }

  /** A perfect parry sends the bolt back at whoever threw it, stronger. */
  reflect(b: Bolt) {
    b.reflected = true;
    b.life = 2.5;
    const sp = b.vel.length() * 1.4;
    if (b.owner && this.enemies.includes(b.owner)) b.vel.subVectors(_v.copy(b.owner.mesh.position).setY(b.owner.mesh.position.y + 1.2), b.mesh.position).setLength(sp);
    else b.vel.multiplyScalar(-1.4);
    const [core, glow] = b.mesh.children as THREE.Mesh[];
    core.material = this.reflMat; glow.material = this.reflGlowMat;
  }

  private updateBolts(dt: number, playerPos: THREE.Vector3, world: CollisionWorld, onPlayerHit: PlayerHitFn) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const step = b.vel.length() * dt;
      _u.copy(b.vel).normalize();
      const wall = world.rayDistance(b.mesh.position, _u, step + 0.2);
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.y += dt * 9;
      let gone = b.life <= 0;
      if (!gone && wall < step + 0.2) { gone = true; this.onBoltHit?.(b.mesh.position, b.reflected); }
      if (!gone && !b.reflected) {
        _v.copy(playerPos).setY(playerPos.y + this.playerChest);
        if (_v.distanceTo(b.mesh.position) < 0.75) {
          const out = onPlayerHit(b.dmg, { enemy: b.owner, attack: b.attack, dmg: b.dmg, unblockable: false, from: b.mesh.position.clone(), bolt: b });
          if (out === 'parried') { this.reflect(b); continue; }
          if (out !== 'evaded') { gone = true; this.onBoltHit?.(b.mesh.position, false); }
        }
      }
      if (!gone && b.reflected) {
        for (const e of this.enemies) {
          _v.copy(e.mesh.position).setY(e.mesh.position.y + e.air + 1.1 * e.mesh.scale.y);
          if (_v.distanceTo(b.mesh.position) < 1.1 * e.mesh.scale.x) {
            this.damageEnemy(e.id, b.dmg * 3, _u, 1.5, { source: 'reflect', hitstun: 0.6, unblockable: true });
            this.onBoltHit?.(b.mesh.position, true);
            gone = true;
            break;
          }
        }
      }
      if (gone) { this.group.remove(b.mesh); this.bolts.splice(i, 1); }
    }
  }

  private scaleDmg(d: number) { return Math.round(d * (1 + (this.wave - 1) * 0.06)); }

  // ── per-frame ──────────────────────────────────────────────────────────────────────────────────────────────
  update(dt: number, pulse: number, playerPos: THREE.Vector3, world: CollisionWorld, onPlayerHit: PlayerHitFn) {
    this.updateCorpses(dt);
    enemyBodies.playerPos.copy(playerPos);
    this.updateBolts(dt, playerPos, world, onPlayerHit);
    // pack slots: engaged enemies spread around the player (by their current bearing, so nobody crosses over)
    const engaged = this.enemies.filter((e) => e.mesh.position.distanceToSquared(playerPos) < COMBAT.ai.engageDist ** 2);
    engaged.sort((a, b) => Math.atan2(a.mesh.position.x - playerPos.x, a.mesh.position.z - playerPos.z) - Math.atan2(b.mesh.position.x - playerPos.x, b.mesh.position.z - playerPos.z));
    const pf = Math.atan2(this.playerForward.x, this.playerForward.z);
    engaged.forEach((e, i) => {
      // rushers favour the sides / back; others the front arc
      const span = Math.PI * 2 / Math.max(1, engaged.length);
      e.slot = pf + (e.tune.flank > 0.5 ? Math.PI * 0.5 : 0) + i * span;
    });
    for (const e of [...this.enemies]) this.updateOne(e, dt, pulse, playerPos, world, onPlayerHit);
  }

  private updateOne(e: Enemy, dt: number, pulse: number, playerPos: THREE.Vector3, world: CollisionWorld, onPlayerHit: PlayerHitFn) {
    const t = e.tune;
    const pos = e.mesh.position;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (dist > 0.01) toPlayer.divideScalar(dist);
    e.stateT -= dt;
    e.dodgeCd -= dt;
    e.attackCooldown -= dt;
    e.poiseAcc = Math.max(0, e.poiseAcc - dt * t.poise * 0.8 - dt * 4);
    e.stagger = Math.max(0, e.stagger - dt * t.stagger * 0.08);
    if (e.state !== 'block' && e.state !== 'broken') e.guard = Math.min(t.guard, e.guard + dt * t.guard * 0.12);
    e.flinch = Math.max(0, e.flinch - dt * 4);
    e.core.scale.setScalar(1 + pulse * 0.35);

    // ── the old navigation far away / on another level (control points, stairs) ──
    let navStep: THREE.Vector3 | null = null;
    if (e.state === 'move') {
      let aim = playerPos;
      if (dist > COMBAT.ai.engageDist && enemyNav.goal) { const g = enemyNav.goal(pos); if (g) aim = g; }
      const step = enemyNav.via ? enemyNav.via(pos, aim) : aim;
      if (step !== playerPos) navStep = step;
    }

    const moveSpeed = e.speed * (this.passive ? 0 : 1);
    if (navStep) {
      const to = _v.subVectors(navStep, pos); to.y = 0;
      const d = to.length();
      if (d > 0.6) {
        to.divideScalar(d);
        e.mesh.rotation.y = Math.atan2(to.x, to.z);
        pos.addScaledVector(to, moveSpeed * dt);
        if (Math.random() < dt * 0.7) e.strafeSign *= -1;
        pos.addScaledVector(_w.set(-to.z, 0, to.x).multiplyScalar(e.strafeSign), moveSpeed * 0.25 * dt);
      }
    } else {
      switch (e.state) {
        case 'move': this.think(e, dt, dist, toPlayer, playerPos, moveSpeed); break;
        case 'windup': {
          // track the player for most of the wind-up, then commit (that's the tell you dodge on)
          const a = e.atk!;
          const left = Math.max(0, e.stateT) / Math.max(0.01, a.startup);
          if (left > 0.3) e.mesh.rotation.y += angDiff(Math.atan2(toPlayer.x, toPlayer.z), e.mesh.rotation.y) * Math.min(1, dt * 10);
          // a melee wind-up steps in so the swing lands at its reach (you see it coming and back off / guard)
          if ((a.kind === 'melee' || a.kind === 'slam') && dist > a.range * 0.7 && !this.passive) pos.addScaledVector(toPlayer, Math.min(e.speed * 0.6, (dist - a.range * 0.7) / Math.max(0.05, e.stateT)) * dt);
          this.drawRing(e, a, 1 - left, pulse);
          if (e.stateT <= 0) this.beginActive(e, playerPos);
          break;
        }
        case 'active': this.updateActive(e, dt, dist, toPlayer, playerPos, onPlayerHit); break;
        case 'recover':
          if (e.stateT <= 0) { this.setState(e, 'move', 0); e.attackCooldown = rand(t.attackGap[0], t.attackGap[1]); }
          break;
        case 'air': {
          e.air += e.vy * dt;
          e.vy -= COMBAT.player.juggleGravity * dt * (e.vy < 0 ? 1.15 : 1);
          if (e.air <= 0) {
            e.air = 0;
            if (e.spiked) { e.spiked = false; e.vy = 3.5; e.air = 0.01; this.onSlam?.(e, pos.clone(), 1.6); break; }
            this.setState(e, 'down', 0.85);
            this.react(e, ['knockdown', 'get_up'], 0.85);
          }
          break;
        }
        default:
          // stun / daze / broken / down / block / dodge / held time out back to moving
          if (e.stateT <= 0 && e.state !== 'held') {
            if (e.state === 'broken') e.guard = t.guard * 0.6;
            this.setState(e, 'move', 0);
            e.attackCooldown = Math.max(e.attackCooldown, 0.25);
          }
          if (e.state === 'daze' || e.state === 'broken') this.drawDaze(e, dt);
          if (e.state === 'block') e.mesh.rotation.y += angDiff(Math.atan2(toPlayer.x, toPlayer.z), e.mesh.rotation.y) * Math.min(1, dt * 12);
      }
    }

    // knockback / dodge / charge travel, decaying
    if (e.push.lengthSq() > 1e-4) {
      pos.addScaledVector(e.push, dt);
      e.push.multiplyScalar(Math.exp(-dt * (e.state === 'active' ? 0 : e.state === 'dodge' ? 5 : 6)));
    }

    // follow the terrain (stairs, ring, pit) and slide along walls; launched enemies hang above it
    const gy = world.groundAt(pos.x, pos.z, e.groundY + e.air + 1.2, 6 + e.air);
    if (gy !== null) e.groundY += (gy - e.groundY) * Math.min(1, dt * 14);
    pos.y = e.groundY;
    world.resolve(pos, 0.5, 2.0);
    e.groundY = pos.y;
    pos.y = e.groundY + e.air;

    // body: launched enemies tumble back, flinch leans away, a wind-up rears back
    const rear = e.state === 'windup' && e.atk ? 0.18 * (1 - Math.max(0, e.stateT) / e.atk.startup) : 0;
    const tilt = e.state === 'air' ? -0.7 : e.state === 'down' ? -0.35 * Math.min(1, e.stateT * 2) : -e.flinch * 0.25 - rear;
    e.mesh.rotation.x += (tilt - e.mesh.rotation.x) * Math.min(1, dt * 14);

    const mv = pos.distanceTo(e.lastPos) / Math.max(dt, 1e-3);
    if (e.body) e.body.update(dt, e.state === 'move' || e.state === 'dodge' ? mv : 0);
    else if (e.rig) {
      const dx = pos.x - e.lastPos.x, dz = pos.z - e.lastPos.z, ry = e.mesh.rotation.y;
      e.rig.update(dt, e.state === 'air' ? 0 : mv, dx * Math.cos(ry) - dz * Math.sin(ry), dx * Math.sin(ry) + dz * Math.cos(ry));
    }
    e.lastPos.copy(pos);
  }

  /** Positioning and the choice to attack. */
  private think(e: Enemy, dt: number, dist: number, toPlayer: THREE.Vector3, playerPos: THREE.Vector3, speed: number) {
    const t = e.tune;
    const pos = e.mesh.position;
    e.mesh.rotation.y += angDiff(Math.atan2(toPlayer.x, toPlayer.z), e.mesh.rotation.y) * Math.min(1, dt * 8);

    // pick an attack that fits the distance, if a token is free
    if (e.attackCooldown <= 0 && !this.passive) {
      // ranged attacks need a clear line (a trunk in the way: reposition instead of wasting the bolt)
      let los: boolean | null = null;
      const clear = () => (los ??= this.lineOfSight(e, playerPos, dist));
      const fits = t.attacks.filter((a) => dist >= a.minDist && dist <= a.maxDist && (a.kind !== 'bolt' && a.kind !== 'barrage' || clear()));
      if (los === false) { e.blockedT = 1.2; }
      if (fits.length) {
        let k = Math.random() * fits.reduce((s, a) => s + a.weight, 0);
        const a = fits.find((x) => (k -= x.weight) < 0) ?? fits[0];
        const kind = a.kind === 'bolt' || a.kind === 'barrage' ? 'ranged' : 'melee';
        if (this.takeToken(e, kind)) { this.beginWindup(e, a); return; }
        e.attackCooldown = rand(0.25, 0.6); // no token: wait a beat, keep circling
      }
    }

    // where to stand: attack reach with a token in sight, else the archetype's band / the waiting circle
    const melee = e.archetype !== 'caster';
    const ready = e.attackCooldown < 0.6;
    let want: number;
    if (!melee) want = (t.rangeMin + t.rangeMax) / 2;
    else if (ready && (this.tokens.melee.size < COMBAT.ai.maxMeleeTokens || e.boss)) want = t.rangeMin + 0.4;
    else want = Math.max(COMBAT.ai.circleDist, t.rangeMax + 1.5);
    // bearing: drift toward its slot around the player (flanking), then the radial correction
    const bearing = Math.atan2(pos.x - playerPos.x, pos.z - playerPos.z);
    const toSlot = angDiff(e.slot, bearing);
    const tang = THREE.MathUtils.clamp(toSlot * 1.5, -1, 1) * t.flank;
    if (Math.random() < dt * 0.5) e.strafeSign *= -1;
    e.blockedT = Math.max(0, e.blockedT - dt);
    // no clear shot: slide sideways round the cover
    const strafe = e.blockedT > 0 ? e.strafeSign : (tang + e.strafeSign * t.strafe * 0.5) * (dist < want + 3 ? 1 : 0.3);
    const radial = THREE.MathUtils.clamp((dist - want) / 2, -1, 1);
    // retreating casters back off faster than they walk in
    const radSpeed = radial < 0 && !melee ? 1.25 : 1;
    const side = _w.set(-toPlayer.z, 0, toPlayer.x);
    const v = _v.copy(toPlayer).multiplyScalar(radial * radSpeed).addScaledVector(side, -strafe);
    if (v.lengthSq() > 1) v.normalize();
    pos.addScaledVector(v, speed * dt);
    // a cornered caster blinks away
    if (!melee && dist < 3.5 && e.dodgeCd <= 0) this.dodge(e, _u.copy(toPlayer).multiplyScalar(-1).addScaledVector(side, e.strafeSign * 0.7), 'dodge_back');
  }

  private lineOfSight(e: Enemy, playerPos: THREE.Vector3, dist: number) {
    const o = _u.copy(e.mesh.position).setY(e.mesh.position.y + (e.body ? e.body.hover + e.body.height * 0.6 : 1.4) * e.mesh.scale.y);
    const d = _w.set(playerPos.x, playerPos.y + this.playerChest, playerPos.z).sub(o);
    const len = d.length();
    return this.world.rayDistance(o, d.divideScalar(len), len) >= len - 0.6 || dist < 3;
  }

  private beginWindup(e: Enemy, a: EnemyAttack) {
    e.atk = a;
    e.hitsLeft = a.hits ?? 1;
    e.struck = false;
    this.setState(e, 'windup', a.startup);
    const clip = a.clip && e.rig?.has(a.clip) ? a.clip : 'attack_1';
    e.rig?.play(clip, 1, a.startup + a.active + 0.15);
    e.ringMat.color.setHex(TELE_COL[a.kind]);
    e.ring.visible = true;
    e.coreMat.emissiveIntensity = 4;
    this.onTelegraph?.(e, a);
  }

  private drawRing(e: Enemy, a: EnemyAttack, k: number, pulse: number) {
    const s = e.mesh.scale.x;
    const r = a.kind === 'slam' ? a.range : a.kind === 'melee' ? a.range * 0.75 : a.kind === 'charge' ? 1.4 * s : 1.0 * s;
    // shrinks in from wide to its reach: it lands when the ring locks on (and flashes white just before)
    const rr = r * (1 + (1 - k) * 0.8);
    e.ring.position.set(e.mesh.position.x, e.groundY + 0.06, e.mesh.position.z);
    e.ring.scale.set(rr, 1, rr);
    e.ring.rotation.y = 0;
    e.ringMat.opacity = 0.25 + k * 0.75 + pulse * 0.1;
    if (k > 0.82) e.ringMat.color.setHex(0xffffff); else e.ringMat.color.setHex(TELE_COL[a.kind]);
  }

  private drawDaze(e: Enemy, dt: number) {
    const s = e.mesh.scale.x;
    const h = (e.body ? e.body.hover + e.body.height : 2.1) * e.mesh.scale.y + 0.25;
    e.ring.visible = true;
    e.ring.position.set(e.mesh.position.x, e.mesh.position.y + h, e.mesh.position.z);
    e.ring.scale.set(0.45 * s, 1, 0.45 * s);
    e.ring.rotation.y += dt * 6;
    e.ringMat.color.setHex(e.state === 'broken' ? 0x38bdf8 : 0xfbbf24);
    e.ringMat.opacity = 0.9;
  }

  private beginActive(e: Enemy, playerPos: THREE.Vector3) {
    const a = e.atk!;
    this.setState(e, 'active', a.active);
    e.ring.visible = a.kind === 'slam';
    e.coreMat.emissiveIntensity = e.staggered ? 3 : 1.8;
    e.struck = false;
    e.body?.attack();
    if (a.kind === 'charge') {
      e.chargeDir.set(Math.sin(e.mesh.rotation.y), 0, Math.cos(e.mesh.rotation.y));
      e.push.copy(e.chargeDir).multiplyScalar(a.range / Math.max(0.1, a.active));
    }
    if (a.kind === 'bolt') this.throwBolt(e, a, _v.copy(playerPos).setY(playerPos.y + this.playerChest));
    if (a.kind === 'slam') this.onSlam?.(e, e.mesh.position.clone(), a.range);
  }

  private updateActive(e: Enemy, dt: number, dist: number, toPlayer: THREE.Vector3, playerPos: THREE.Vector3, onPlayerHit: PlayerHitFn) {
    const a = e.atk!;
    const fwd = _w.set(Math.sin(e.mesh.rotation.y), 0, Math.cos(e.mesh.rotation.y));
    const s = e.mesh.scale.x;
    if (!e.struck) {
      let hit = false;
      if (a.kind === 'melee') hit = dist < a.range * Math.max(1, s * 0.85) + 0.3 && fwd.dot(toPlayer) > a.cone;
      else if (a.kind === 'slam') hit = dist < a.range && Math.abs(playerPos.y - e.groundY) < 1.6;
      else if (a.kind === 'charge') hit = dist < 1.6 * s;
      if (hit) {
        e.struck = true;
        const dmg = this.scaleDmg(a.dmg);
        const out = onPlayerHit(dmg, { enemy: e, attack: a, dmg, unblockable: !!a.unblockable, from: e.mesh.position.clone() });
        if (out === 'parried') {
          this.setState(e, 'stun', COMBAT.player.counterSec + 0.25);
          e.parried = true;
          e.push.copy(toPlayer).multiplyScalar(-5);
          this.react(e, ['parried', 'hit_heavy', 'recover'], COMBAT.player.counterSec);
          return;
        }
        if (out === 'blocked') { e.push.copy(toPlayer).multiplyScalar(-3); if (a.kind === 'charge') { e.push.set(0, 0, 0); } }
        if (out === 'hit' && a.kind === 'charge') e.push.multiplyScalar(0.2);
      }
    }
    if (a.kind === 'barrage') {
      // bolts fan out over the window
      const n = a.count ?? 3;
      const thrown = n - Math.ceil(Math.max(0, e.stateT) / Math.max(0.01, a.active) * n);
      while (e.hitsLeft - 1 < thrown && thrown <= n && e.hitsLeft <= n) {
        const i = e.hitsLeft - 1;
        this.throwBolt(e, a, _v.copy(playerPos).setY(playerPos.y + this.playerChest), (i - (n - 1) / 2) * 0.16);
        e.hitsLeft++;
      }
    }
    if (e.stateT <= 0) {
      if (a.kind === 'charge') e.push.multiplyScalar(0.15);
      if ((a.kind === 'melee') && e.hitsLeft > 1) {
        // the next hit of the string: a short wind-up (still readable, still interruptible)
        e.hitsLeft--;
        this.setState(e, 'windup', a.startup * 0.5);
        e.ring.visible = true;
        e.rig?.play(e.hitsLeft % 2 ? 'attack_2' : 'attack_1', 1, a.startup * 0.5 + a.active + 0.1);
        this.onTelegraph?.(e, a);
        return;
      }
      this.setState(e, 'recover', a.recovery);
    }
  }
}

export type PlayerHitFn = (dmg: number, s: EnemyStrike) => StrikeOutcome | void;
