// A dangerous world (Rift Realm, Elderwood + the Wilds): predators that hunt you (predators.ts), environment hazards
// (hazards.ts), status effects (status.ts), their sounds (audio.ts), placed from data the forest map shares (spots.ts).
// main.ts talks to it through this one object: raycast hits, melee, blasts, gunshot noise, the lock-on list, update.
// Night (world/skyCycle's clock) opens extra dens and sharpens night-eyed hunters. `?nodanger` turns it all off.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from '../collision';
import type { Enemy, EnemyManager } from '../enemies';
import type { PlayerController } from '../player';
import type { VfxSystem } from '../../../../services/vfx';
import { DangerAudio } from './audio';
import { PlayerStatus } from './status';
import { HazardField } from './hazards';
import { PredatorDirector, type Predator, type Prey } from './predators';
import { DEMO_FORAGE, DEMO_HAZARDS, DEMO_HERDS, DENS, FORAGE, HAZARDS, HERDS, inHollow } from './spots';
import { PreyDirector } from './prey';
import { EatAction } from './eat';
import { RIVER, polyNear } from '../world/layout';
import { Forage } from './forage';
import { WATER_Y, escarpZ } from '../world/layout';

export interface DangerCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  collision: CollisionWorld;
  vfx: VfxSystem;
  player: PlayerController;
  enemies: EnemyManager;
  level: string;
  lo: boolean;
  /** The music's beat index and pulse (rhythm.ts). */
  beat(): number;
  pulse(): number;
  /** 0…1 inside the current beat (rhythm.phase). */
  phase(): number;
  /** Add rhythm resonance (Pulsecap). */
  addResonance(n: number): void;
  /** Mid-strike / blocking (combat/melee.ts): the eat action waits. */
  busy?(): boolean;
  /** Hurt the player (main.ts applies it: hp, hit reaction, downed). */
  hurt(dmg: number, why: string): void;
  say(text: string, color: string): void;
  /** A predator died to the player: score and XP. */
  onKill(xp: number, name: string, pos: THREE.Vector3): void;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Danger {
  readonly audio = new DangerAudio();
  readonly status = new PlayerStatus();
  readonly hazards: HazardField;
  readonly predators: PredatorDirector;
  readonly forage: Forage;
  readonly prey: PreyDirector;
  readonly eat: EatAction;
  private toast: HTMLDivElement;
  private toastT = 0;
  private clock = 0;
  private stepT = 0; private scentT = 0;
  private lastP = new THREE.Vector3(); private peakY = -Infinity; private wasGround = true;
  private hurtCd = new Map<string, number>();
  private foesArr: Enemy[] = [];
  private v = new THREE.Vector3();
  private sayT = 0;
  readonly wilds: boolean;

  constructor(private ctx: DangerCtx) {
    const q = new URLSearchParams(location.search);
    this.wilds = !q.has('classic');
    this.toast = document.createElement('div');
    this.toast.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:14;pointer-events:none;max-width:520px;padding:10px 16px;border:1px solid currentColor;background:#020a12d0;font:700 13px/1.45 system-ui,sans-serif;letter-spacing:.04em;text-align:center;opacity:0;transition:opacity .3s';
    document.body.appendChild(this.toast);
    const dens = this.wilds ? DENS : DENS.filter((d) => inHollow(d.x, d.z) || Math.hypot(d.x, d.z) < 110);
    const demo = q.has('dangerdemo');
    const hazards = [...(this.wilds ? HAZARDS : HAZARDS.filter((h) => inHollow(h.x, h.z))), ...(demo ? DEMO_HAZARDS : [])];
    const col = ctx.collision;
    const ground = (x: number, z: number) => (col.terrain ? col.terrain.heightAt(x, z, 1e4) : col.groundAt(x, z, 80, 200) ?? 0);
    // the time of day: the sky cycle's own clock if the world shares it, else the same clock rebuilt from the URL
    const mode = q.get('time'), start = Number(q.get('clock') ?? 0.2) % 1, cycle = Number(q.get('cycle')) || 240;
    const night = () => {
      const w = (globalThis as unknown as { __wilds?: { sky?: () => { time: number } | null } }).__wilds;
      if (!this.wilds || mode === 'night') return 1;
      if (mode === 'day') return 0;
      const t = w?.sky?.()?.time ?? (start + this.clock / cycle) % 1;
      return 1 - smooth(-0.15, 0.12, Math.sin((t - 0.25) * Math.PI * 2));
    };
    this.nightFn = night;
    const hurt = (dmg: number, why: string) => this.hurtPlayer(dmg, why);
    this.hazards = new HazardField({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, status: this.status, lo: ctx.lo, ground, beat: ctx.beat, hurt,
      areaDamage: (at, r, dmg, why) => this.areaDamage(at, r, dmg, why),
      water: this.wilds ? (x, z) => (z > escarpZ(x) + 8 ? WATER_Y : null) : undefined,
    }, hazards);
    this.predators = new PredatorDirector({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, status: this.status, lo: ctx.lo, ground,
      floor: (x, z, y) => col.groundAt(x, z, y, 6),
      resolve: (p, r, h) => col.resolve(p, r, h),
      clear: (a, b) => { const d = this.v.subVectors(b, a), L = d.length(); if (L < 0.5) return true; d.divideScalar(L); return col.rayDistance(a, d, L) >= L - 0.4; },
      hurtPlayer: hurt,
      damageEnemy: (e, dmg, dir) => !!ctx.enemies.damageEnemy(e.id, dmg, dir, 1.2)?.killed,
      heal: (n) => { const p = ctx.player; if (p.downed) return; p.hp = Math.min(p.maxHp, p.hp + n); ctx.say(`LIFE MOTE +${n} HP`, '#7dffb0'); },
      onKill: () => { /* the player's kills are reported by damageId; hazard and creature kills give nothing */ },
      night,
      attractors: () => this.forage?.attractors() ?? [],
      quarry: () => this.prey?.list ?? [],
      carcass: (at, r) => this.prey?.nearestCarcass(at, r) ?? null,
      bite: (c) => this.prey.bite(c),
      damageQuarry: (q, dmg, from) => !!this.prey.damage(q.id, dmg, from)?.killed,
    }, dens);
    this.prey = new PreyDirector({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, ground,
      resolve: (p, r, h) => col.resolve(p, r, h), hurtPlayer: hurt,
    }, [...(this.wilds ? HERDS : []), ...(demo ? DEMO_HERDS : [])]);
    const patches = [...(this.wilds ? FORAGE : FORAGE.filter((f) => inHollow(f.x, f.z))), ...(demo ? DEMO_FORAGE : [])];
    this.forage = new Forage({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, status: this.status, lo: ctx.lo, ground, phase: ctx.phase,
      heal: (n) => { const p = ctx.player; if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + n); },
      hurt, addResonance: ctx.addResonance,
      lure: (pos) => { this.predators.noise(pos, 110); this.predators.scent(pos); },
      hint: (text, col) => { this.toast.textContent = text; this.toast.style.color = col; this.toast.style.opacity = '1'; this.toastT = text.length > 24 ? 5 : 1.6; },
    }, patches);
    const toxicPools = hazards.filter((h) => h.kind === 'toxic');
    this.eat = new EatAction({
      player: ctx.player, forage: this.forage, prey: this.prey, vfx: ctx.vfx,
      touch: () => document.getElementById('touchHud')?.classList.contains('on') ?? false, busy: ctx.busy,
      // drinkable water: toxic pools (hazards), the rivers and the vale (world/layout.ts), swamp in the Mire
      // (until the forest map shares a water query: __wilds.waterAt)
      water: (x, z, y) => {
        const w = (globalThis as unknown as { __wilds?: { waterAt?: (x: number, z: number) => { y: number; kind: 'clean' | 'swamp' } | null } }).__wilds;
        for (const h of toxicPools) if (Math.hypot(x - h.x, z - h.z) < h.r * 0.95) { const L = this.hazards.get(h.id); if (L) return { y: L.y, kind: 'toxicwater' as const }; }
        const q = w?.waterAt?.(x, z);
        if (q) return { y: q.y, kind: q.kind === 'swamp' ? 'swampwater' as const : 'water' as const };
        if (!this.wilds) return null;
        const n = polyNear(RIVER, x, z), seg = RIVER[n.i];
        if (n.d < seg[3] / 2 + 0.8) return { y: seg[2] + 0.85, kind: 'water' as const };
        if (z > escarpZ(x) + 8 && y < WATER_Y + 1.5) return { y: WATER_Y, kind: x < -200 && z > 520 ? 'swampwater' as const : 'water' as const };
        return null;
      },
    });
  }
  private nightFn: () => number;
  /** 0 by day … 1 at night. */
  get night() { return this.nightFn(); }

  private hurtPlayer(dmg: number, why: string) {
    const p = this.ctx.player;
    if (p.downed || !p.enabled) return;
    dmg = this.forage ? Math.round(this.forage.absorb(dmg)) : dmg;
    if (dmg <= 0) return;
    this.ctx.hurt(dmg, why);
    if (why !== 'poison' && why !== 'burn' && this.sayT <= 0) { this.ctx.say(`${why === 'drown' ? 'DROWNING' : why} -${dmg}`, '#fb7185'); this.sayT = 0.6; }
  }

  /** Hazards hurt predators and the rift's creatures caught in them. */
  private areaDamage(at: THREE.Vector3, r: number, dmg: number, why: string) {
    for (const p of [...this.predators.list]) if (p.alive && p.pos.distanceTo(at) < r + 0.5) this.predators.damage(p.id, dmg, at, 1.5, false);
    for (const e of [...this.ctx.enemies.enemies]) {
      if (e.mesh.position.distanceTo(at) > r + 0.5) continue;
      const k = (this.hurtCd.get(`${why}${e.id}`) ?? 0);
      if (this.clock - k < 0.8) continue;
      this.hurtCd.set(`${why}${e.id}`, this.clock);
      this.ctx.enemies.damageEnemy(e.id, dmg, this.v.subVectors(e.mesh.position, at).setY(0).normalize(), 1.5);
    }
  }

  // ── what main.ts calls ──────────────────────────────────────────────────────────────────────────────────────────
  /** Hit meshes to add to the shot raycast (userData.predatorId). */
  hitMeshes(): THREE.Object3D[] { return [...this.predators.list.filter((p) => p.alive).map((p) => p.hitTarget), ...this.prey.hitMeshes()]; }

  /** A shot / strike landed on `obj` (one of hitMeshes()). Null if it isn't a predator. */
  damage(obj: THREE.Object3D, dmg: number, from: THREE.Vector3 | null, knock = 0) {
    const qid = obj.userData.preyId as number | undefined;
    if (qid !== undefined) {   // a prey animal: no XP, but a carcass to eat
      if (qid < 0) return null;
      const r = this.prey.damage(qid, dmg, from);
      if (r?.killed) this.ctx.say(`${r.p.who.toUpperCase()} DOWN · HOLD [H] TO EAT`, '#ffb366');
      return r ? { killed: r.killed, pos: r.pos } : null;
    }
    const id = obj.userData.predatorId as number | undefined;
    if (id === undefined || id < 0) return null;
    return this.damageId(id, dmg, from, knock);
  }
  private damageId(id: number, dmg: number, from: THREE.Vector3 | null, knock = 0) {
    const prey: Prey = { pos: this.ctx.player.object.position, enemy: null };
    const r = this.predators.damage(id, dmg, from, knock, true, prey);
    if (r?.killed) this.ctx.onKill(r.p.spec.xp, r.p.who, r.pos.clone());
    return r;
  }

  /** Melee strike from `pos` toward `forward`: hits every predator in reach. Returns the hits for the game's feedback. */
  melee(pos: THREE.Vector3, forward: THREE.Vector3, dmg: number, reach = 3.6) {
    const out: { killed: boolean; pos: THREE.Vector3 }[] = [];
    dmg = Math.round(dmg * this.dmgMul);
    for (const p of [...this.predators.list]) {
      if (!p.alive) continue;
      const to = this.v.subVectors(p.pos, pos).setY(0), d = to.length();
      if (d > reach + p.spec.size * 0.4 || Math.abs(p.pos.y + p.body.hover - pos.y) > 3) continue;
      if (d > 0.01) to.divideScalar(d);
      if (forward.dot(to) < 0.25 && d > 1.3) continue;
      const r = this.damageId(p.id, dmg, pos, 2.2);
      if (r) out.push({ killed: r.killed, pos: r.pos });
    }
    for (const q of [...this.prey.list]) {
      const to = this.v.subVectors(q.pos, pos).setY(0), d = to.length();
      if (d > reach + 0.4) continue;
      if (d > 0.01) to.divideScalar(d);
      if (forward.dot(to) < 0.25 && d > 1.3) continue;
      const r = this.prey.damage(q.id, dmg, pos);
      if (r) out.push({ killed: r.killed, pos: r.pos });
    }
    return out;
  }

  /** A blast (Soul Surge): everything in radius. */
  blast(center: THREE.Vector3, r: number, dmg: number) {
    let kills = 0;
    for (const p of [...this.predators.list]) if (p.alive && p.pos.distanceTo(center) < r) { if (this.damageId(p.id, dmg, center, 3.6)?.killed) kills++; }
    this.predators.noise(center, 45);
    return kills;
  }

  /** A gunshot (or any loud sound) predators may hear. */
  noise(pos: THREE.Vector3, r = 60) { this.predators.noise(pos, r); this.prey.scare(pos, r * 0.8); }

  /** The rift's creatures plus the live predators, for targeting / lock-on (predators carry the same fields). */
  foes(enemies: Enemy[]): Enemy[] {
    this.foesArr.length = 0;
    for (const e of enemies) this.foesArr.push(e);
    for (const p of this.predators.list) if (p.alive) this.foesArr.push(p as unknown as Enemy);
    return this.foesArr;
  }
  /** Predator under the lock / soft target? (melee aims at `.mesh.position` for both). */
  isPredator(x: unknown): boolean { return !!x && typeof (x as Predator).spec === 'object' && 'den' in (x as object); }

  /** Something is hunting the player close by (the music goes to combat). */
  get engaged() {
    const pp = this.ctx.player.object.position;
    return this.predators.list.some((p) => p.engaged && !p.target?.enemy && !p.target?.quarry && p.pos.distanceToSquared(pp) < 35 * 35);
  }

  /** Movement multiplier from slows and Swiftpod haste (player.moveMul). */
  get moveMul() { return this.status.moveMul * this.forage.moveMul; }
  /** Damage dealt multiplier (Furyberry): the game multiplies shots / strikes by it. */
  get dmgMul() { return this.forage.dmgMul; }
  /** Shellfruit shield: hits from anything (the rift's creatures too) pass through here first; returns what's left. */
  absorb(dmg: number) { return Math.round(this.forage.absorb(dmg)); }

  update(dt: number) {
    this.clock += dt; this.sayT -= dt;
    const pl = this.ctx.player, pp = pl.object.position;
    this.audio.listen(this.ctx.camera);
    // footsteps and scent from the player's own movement
    const moved = Math.hypot(pp.x - this.lastP.x, pp.z - this.lastP.z), spd = moved / Math.max(dt, 1e-3);
    const teleport = moved > 15;
    if (!teleport && pl.enabled && !pl.downed) {
      if ((this.stepT -= dt) <= 0 && spd > 1.5) { this.stepT = 0.5; this.predators.noise(pp, (spd > 9 ? 17 : spd > 4 ? 11 : 6) * (pl.crouched ? 0.35 : 1)); }
      if ((this.scentT -= dt) <= 0 && moved > 0) { this.scentT = 1.5; this.predators.scent(pp); }
    }
    // falls: a long drop off a cliff or a deck hurts (double jumps and short hops never do)
    const gy = this.ctx.collision.groundAt(pp.x, pp.z, pp.y + 0.3, 2);
    const onGround = gy !== null && pp.y - gy < 0.2;
    if (teleport || pl.downed) this.peakY = pp.y;
    else if (!onGround) this.peakY = Math.max(this.peakY, pp.y);
    else if (!this.wasGround) {
      const drop = this.peakY - pp.y;
      if (drop > 11) this.hurtPlayer(Math.min(70, Math.round((drop - 11) * 5)), 'HARD LANDING');
      this.peakY = pp.y;
    } else this.peakY = pp.y;
    this.wasGround = onGround;
    this.lastP.copy(pp);

    if (pl.enabled) {
      this.hazards.update(dt, pp, this.ctx.pulse());
      this.status.update(dt, (dmg, why) => this.hurtPlayer(dmg, why));
    }
    this.forage.update(dt, pp, pl.enabled && !pl.downed);
    if ((this.toastT -= dt) <= 0) this.toast.style.opacity = '0';
    pl.moveMul = this.moveMul;
    this.predators.update(dt, pp, pl.crouched, spd > 10, pl.downed || !pl.enabled, this.ctx.enemies.enemies);
    this.prey.update(dt, pp, pl.crouched, this.predators.list.filter((p) => p.alive && p.pos.distanceToSquared(pp) < 200 * 200).map((p) => p.pos));
    this.eat.update(dt);
    if (pl.downed) this.status.clear();
  }

  /** Debug / scripted encounters: `__rr.danger.spawn('mantis', x, z)`. */
  spawn(kind: 'wolf' | 'mantis' | 'wasp' | 'bat' | 'stalker', x: number, z: number) { return this.predators.spawnAt(kind, x, z); }
  /** Debug: a small herd of prey at (x, z). */
  herd(kind: 'deer' | 'stag', x: number, z: number, n = 3) { return this.prey.spawnHerd(kind, x, z, n); }

  /** Debug (window.__rr.danger). */
  debug() { return { night: +this.night.toFixed(2), predators: this.predators.info(), hazards: this.hazards.info().length, forage: this.forage.info(), prey: this.prey.info() }; }
}

/** The danger layer for levels that have one (Elderwood and its Wilds), or null. */
export function createDanger(ctx: DangerCtx): Danger | null {
  if (new URLSearchParams(location.search).has('nodanger')) return null;
  if (ctx.level !== 'elderwood') return null;
  return new Danger(ctx);
}
