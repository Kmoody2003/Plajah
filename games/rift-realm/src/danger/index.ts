// A dangerous world (Rift Realm, Elderwood + the Wilds): predators that hunt you (predators.ts), environment hazards
// (hazards.ts), status effects (status.ts), their sounds (audio.ts), placed from data the forest map shares (spots.ts).
// main.ts talks to it through this one object: raycast hits, melee, blasts, gunshot noise, the lock-on list, update.
// Night (world/skyCycle's clock) opens extra dens and sharpens night-eyed hunters. `?nodanger` turns it all off.
// The living world on top: the bag (inventory.ts), the soul meter (soul.ts), creature bonds and Pray (bonds.ts), the
// mycelium network (mycelium.ts), all talking over the forest network (forest.ts) that the trees and ents share.
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
import { forest } from './forest';
import { SoulMeter } from './soul';
import { Bonds } from './bonds';
import { Mycelium } from './mycelium';
import { Inventory } from './inventory';
import { Wardens } from './wardens';

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
  readonly soul: SoulMeter;
  readonly bonds: Bonds;
  readonly mycelium: Mycelium;
  readonly bag: Inventory;
  /** Grovewardens × player: call, assist, synergy combos (wardens.ts; the wardens themselves are src/ents). */
  readonly wardens: Wardens;
  readonly forest = forest;
  private lastCombat = -99;
  private combatNoteT = 0; private beatT = 0;
  private hunting = new Set<number>();
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
      faceThreat: (from: THREE.Vector3) => this.ctx.player.faceThreat(from),
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
      fearR: (p, base) => this.bonds ? this.bonds.fearR(p, base) : base,
    }, [...(this.wilds ? HERDS : []), ...(demo ? DEMO_HERDS : [])]);
    const patches = [...(this.wilds ? FORAGE : FORAGE.filter((f) => inHollow(f.x, f.z))), ...(demo ? DEMO_FORAGE : [])];
    this.forage = new Forage({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, status: this.status, lo: ctx.lo, ground, phase: ctx.phase,
      heal: (n) => { const p = ctx.player; if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + n); },
      hurt, addResonance: ctx.addResonance,
      lure: (pos) => { this.predators.noise(pos, 110); this.predators.scent(pos); },
      hint: (text, col) => { this.toast.textContent = text; this.toast.style.color = col; this.toast.style.opacity = '1'; this.toastT = text.length > 24 ? 5 : 1.6; },
      charge: (n, src) => this.charge(n, src),
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
    // ── the living world ──
    const say = (t: string, c: string) => this.ctx.say(t, c);
    this.soul = new SoulMeter(ctx.player, ctx.vfx, (t, c) => this.hint(t, c));
    this.mycelium = new Mycelium({
      scene: ctx.scene, vfx: ctx.vfx, audio: this.audio, status: this.status, player: ctx.player, forage: this.forage, soul: this.soul, lo: ctx.lo, ground,
      charge: (n, src) => this.charge(n, src),
      chargeFrac: () => { const w = (ctx.player as unknown as { weapons?: { getCharge?: () => { frac: number } } }).weapons; return w?.getCharge?.()?.frac ?? null; },
      hurt, say: (t, c) => this.hint(t, c),
      hazardFungi: () => hazards.filter((h) => h.kind === 'fungi' || h.kind === 'spores').map((h) => ({ x: h.x, y: ground(h.x, h.z), z: h.z, kind: h.kind })),
      sinceCombat: () => this.clock - this.lastCombat,
    });
    this.bag = new Inventory({
      scene: ctx.scene, player: ctx.player, forage: this.forage, ground,
      channel: (kind, done) => this.eat.channel(kind, done),
      say,
      status: () => {
        const s = this.soul.value, b = this.bonds.bonded();
        return [
          `Soul: <b style="color:${s >= 30 ? '#ffe9a0' : s <= -30 ? '#c08cff' : '#cfd8e6'}">${s >= 30 ? 'Light' : s <= -30 ? 'Dark' : 'Balanced'} (${s > 0 ? '+' : ''}${Math.round(s)})</b>`,
          `Mycelium connection: <b style="color:#8aff9a">${['none', 'I', 'II', 'III', 'IV'][this.mycelium.level]}</b> · ${this.mycelium.eaten} healthy mushrooms eaten`,
          `Bonded creatures: ${b.length ? b.map((p) => p.who).join(', ') : 'none yet · Pray (hold T) near a calm creature, or defend one'}`,
        ];
      },
    });
    this.eat.setBag(this.bag);
    this.bonds = new Bonds({
      player: ctx.player, prey: this.prey, soul: this.soul, vfx: ctx.vfx, audio: this.audio, status: this.status, busy: ctx.busy,
      heal: (n) => { const p = ctx.player; if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + n); },
      charge: (n, src) => this.charge(n, src),
      reveal: (sec) => this.mycelium.reveal(sec),
      give: (kind) => this.bag.add(kind, true),
      say,
      loud: () => this.clock - this.lastCombat < 3,
    });
    this.wardens = new Wardens({
      player: ctx.player, vfx: ctx.vfx, audio: this.audio, status: this.status, scene: ctx.scene, ground,
      foes: () => [
        ...ctx.enemies.enemies.filter((e) => e.hp > 0).map((e) => ({ id: e.id, pos: e.mesh.position, hp: e.hp, maxHp: e.maxHp, who: (e as unknown as { who?: string }).who ?? 'creature', kind: 'enemy' as const, boss: !!(e as unknown as { boss?: boolean }).boss })),
        ...this.predators.list.filter((p) => p.alive).map((p) => ({ id: p.id, pos: p.pos, hp: p.hp, maxHp: p.maxHp, who: p.who, kind: 'predator' as const })),
      ],
      hit: (f, dmg, from, o = {}) => {
        dmg = Math.round(dmg * this.dmgMul);
        this.lastCombat = this.clock;
        const dir = (o.toward ? this.v.subVectors(o.toward, f.pos) : this.v.subVectors(f.pos, from)).setY(0);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
        if (f.kind === 'enemy') return !!ctx.enemies.damageEnemy(f.id, dmg, dir.clone(), o.knock ?? 1, { source: 'melee', launch: o.launch, hitstun: o.hitstun, unblockable: true })?.killed;
        const r = this.damageId(f.id, dmg, o.toward ? null : from, o.knock ?? 1);
        return !!r?.killed;
      },
      heal: (n) => { const p = ctx.player; if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + n); },
      charge: (n, src) => this.charge(n, src),
      soul: () => this.soul.soul,
      say: (t, c) => this.hint(t, c),
      lockTarget: () => {
        const T = (globalThis as unknown as { __rr?: { targeting?: { locked?: { mesh?: THREE.Object3D } | null; target?: { mesh?: THREE.Object3D } | null } } }).__rr?.targeting;
        return (T?.locked ?? T?.target)?.mesh?.position.clone() ?? null;
      },
    });
    // eating: the soul and the mycelium both care what you eat
    this.forage.onConsume = (kind, k, knew) => {
      const pp = ctx.player.object.position;
      if (k.good && k.shape === 'cap') { this.soul.deed('eat-good', pp); this.mycelium.ateGood(); }
      else if (!k.good && knew && k.shape !== 'water') this.soul.deed('eat-poison', pp);
    };
  }

  /** The centre toast (hints, soul changes, mycelium news). */
  hint(text: string, col: string) { this.toast.textContent = text; this.toast.style.color = col; this.toast.style.opacity = '1'; this.toastT = text.length > 24 ? 5 : 1.6; }

  /** Spirit charge for the guns (the weapons' addCharge, when they have it). */
  charge(n: number, src: string) {
    const w = (this.ctx.player as unknown as { weapons?: { addCharge?: (n: number, src: string) => number } }).weapons;
    const g = globalThis as unknown as { __rr?: { weapons?: { addCharge?: (n: number, src: string) => number } } };
    (w?.addCharge ?? g.__rr?.weapons?.addCharge)?.call(w ?? g.__rr?.weapons, n, src);
    this.chargeGiven += n;
  }
  /** Total spirit charge handed to the weapons this session (debug). */
  chargeGiven = 0;
  private nightFn: () => number;
  /** 0 by day … 1 at night. */
  get night() { return this.nightFn(); }

  private hurtPlayer(dmg: number, why: string) {
    const p = this.ctx.player;
    if (p.downed || !p.enabled) return;
    dmg = this.forage ? Math.round(this.forage.absorb(this.wardens ? this.wardens.absorb(dmg) : dmg)) : dmg;
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
      const q = this.prey.list.find((x) => x.id === qid);
      const wasHurt = !!q && q.hp < q.maxHp, wasFleeing = q?.state === 'flee', trusted = !!q && (q.bonded || q.affinity > 0.5);
      const r = this.prey.damage(qid, dmg, from);
      this.lastCombat = this.clock;
      if (r && q) { if (r.killed) { if (trusted) q.bonded = true; this.bonds.killed(q); } else this.bonds.struck(q, wasHurt, wasFleeing); }
      if (r?.killed) this.ctx.say(`${r.p.who.toUpperCase()} DOWN · HOLD [H] TO EAT`, '#ffb366');
      return r ? { killed: r.killed, pos: r.pos } : null;
    }
    const id = obj.userData.predatorId as number | undefined;
    if (id === undefined || id < 0) return null;
    return this.damageId(id, dmg, from, knock);
  }
  private damageId(id: number, dmg: number, from: THREE.Vector3 | null, knock = 0) {
    const prey: Prey = { pos: this.ctx.player.object.position, enemy: null };
    const pr = this.predators.list.find((p) => p.id === id);
    const quarry = pr?.target?.quarry ? this.prey.list.find((q) => q === (pr.target!.quarry as unknown)) ?? null : null;
    if (pr) this.bonds.defended(pr.pos, quarry);
    this.lastCombat = this.clock;
    const r = this.predators.damage(id, dmg, from, knock, true, prey);
    if (r?.killed) this.ctx.onKill(r.p.spec.xp, r.p.who, r.pos.clone());
    return r;
  }

  /** Melee strike from `pos` toward `forward`: hits every predator in reach. Returns the hits for the game's feedback. */
  melee(pos: THREE.Vector3, forward: THREE.Vector3, dmg: number, reach = 3.6) {
    const out: { killed: boolean; pos: THREE.Vector3 }[] = [];
    dmg = Math.round(dmg * this.dmgMul);
    this.lastCombat = this.clock;
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
      const wasHurt = q.hp < q.maxHp, wasFleeing = q.state === 'flee', trusted = q.bonded || q.affinity > 0.5;
      const r = this.prey.damage(q.id, dmg, pos);
      if (r) { out.push({ killed: r.killed, pos: r.pos }); if (r.killed) { if (trusted) q.bonded = true; this.bonds.killed(q); } else this.bonds.struck(q, wasHurt, wasFleeing); }
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
  noise(pos: THREE.Vector3, r = 60) {
    this.predators.noise(pos, r); this.prey.scare(pos, r * 0.8, true);
    this.lastCombat = this.clock;
    if (this.combatNoteT <= 0) { this.combatNoteT = 0.5; forest.notify('combat', pos, { loud: r }, 'player'); }
  }

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
  get dmgMul() { return this.forage.dmgMul * (this.wardens?.dmgMul ?? 1); }
  /** Shellfruit shield: hits from anything (the rift's creatures too) pass through here first; returns what's left. */
  absorb(dmg: number) { return Math.round(this.forage.absorb(this.wardens ? this.wardens.absorb(dmg) : dmg)); }

  update(dt: number) {
    this.clock += dt; this.sayT -= dt; this.combatNoteT -= dt;
    forest.tick(dt);
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
    // the living world
    this.bonds.update(dt);
    this.wardens.update(dt);
    this.mycelium.update(dt);
    this.bag.update(dt);
    this.soul.update(dt, pl.enabled);
    if ((this.beatT -= dt) <= 0) { this.beatT = 2; forest.notify('player', pp, { soul: this.soul.soul }, 'player'); }
    for (const p of this.predators.list) {                 // a predator starts hunting the player: the network hears
      const on = p.alive && p.engaged && !p.target?.enemy && !p.target?.quarry;
      if (on && !this.hunting.has(p.id)) forest.notify('predator', p.pos, { kind: p.who, name: p.who, state: p.state }, 'predator');
      if (on) this.hunting.add(p.id); else this.hunting.delete(p.id);
    }
    if (pl.downed) this.status.clear();
  }

  /** Debug / scripted encounters: `__rr.danger.spawn('mantis', x, z)`. */
  spawn(kind: 'wolf' | 'mantis' | 'wasp' | 'bat' | 'stalker', x: number, z: number) { return this.predators.spawnAt(kind, x, z); }
  /** Debug: a small herd of prey at (x, z). */
  herd(kind: 'deer' | 'stag', x: number, z: number, n = 3) { return this.prey.spawnHerd(kind, x, z, n); }

  /** Debug (window.__rr.danger). */
  debug() {
    return {
      night: +this.night.toFixed(2), predators: this.predators.info(), hazards: this.hazards.info().length, forage: this.forage.info(), prey: this.prey.info(),
      soul: Math.round(this.soul.value), mycelium: this.mycelium.info(), bag: this.bag.slots.map((s) => `${s.kind}×${s.n}`), quick: [...this.bag.quick],
      wardens: this.wardens.info(),
      bonds: this.prey.list.filter((p) => p.affinity > 0).map((p) => `${p.who}:${p.affinity.toFixed(2)}${p.bonded ? '*' : ''}`), charge: Math.round(this.chargeGiven),
    };
  }
}

/** The danger layer for levels that have one (Elderwood and its Wilds), or null. */
export function createDanger(ctx: DangerCtx): Danger | null {
  if (new URLSearchParams(location.search).has('nodanger')) return null;
  if (ctx.level !== 'elderwood') return null;
  return new Danger(ctx);
}
