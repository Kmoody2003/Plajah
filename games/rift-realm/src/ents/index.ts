// Vesselbound (Rift Realm) — tree ents in the Elderwood Wilds.
//
// The forest is alive and aware, and some of its trees are ents: walking guardians about 46 m tall that tend the
// forest and guard it from the rift's demons, monsters and titans. You don't always meet one. Each session has about a
// 40 % chance. Usually it stands rooted among the canopy, a slightly odd giant tree with its boughs (arms) lifted; sometimes it
// walks slowly across the Wilds. Footsteps shake the camera (scaled by distance), thud and creak (rhythm.playEnt) and
// throw dust and leaves (services/vfx).
//
// How it treats you follows your soul's alignment (the living-world session's soul system):
//   light: it watches over you, smashes what hunts you and bends to bless you (heals) when you're hurt nearby;
//   neutral: it ignores you (and steps round you);
//   dark: it turns its gaze on you, spreads its boughs in warning and then brings its fists down.
// Whatever your soul, it fights the rift's creatures that come near it, titans first (enemies.ts' public damage API;
// enemyNav.threat lets brutes and bosses turn on it).
// The forest network (trees and fungi talking through roots and mycelium) calls it to a hurt grove, and it tells the
// network what it does ('ent-wrath', 'ent-calm', 'ent-smash', 'ent-tend', 'ent-bless').
//
// Legs and body are solid (CollisionWorld.movers: moving trunk columns). Far away it is an impostor card, baked once.
// URL: ?ent=0 never · ?ent=1 always · ?ent=stand / ?ent=walk always, in that mode · ?soul=light|dark|neutral (test).
// Debug (?rrdebug): __rr.ents.info(), .act('smash'|'tend'|'bless'|'threaten'), .walkTo(x, z), .near(), .soul(v).
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from '../collision';
import type { Enemy, EnemyManager } from '../enemies';
import { enemyNav } from '../enemies';
import type { PlayerController } from '../player';
import type { VfxSystem, Recipe } from '../../../../services/vfx';
import { bakeImpostor, impostorMaterial, impostorMesh, setImpostor } from '../../../../services/vegetation/lod/impostor';
import { CORE } from '../world/layout';
import { Ent, type EntActKind } from './ent';

export type EntSound = 'step' | 'smash' | 'groan' | 'creak' | 'bless';

/** The forest network as the ents use it (danger/forest.ts; also globalThis.__forest). */
interface ForestBus {
  notify(kind: string, pos: { x: number; y?: number; z: number }, data?: Record<string, unknown>, src?: string): unknown;
  subscribe(kind: string, fn: (ev: { kind: string; pos: { x: number; z: number }; data: Record<string, unknown> }) => void, opts?: { at?: () => { x: number; z: number } | null }): () => void;
  soul(): number;
}
interface DangerLike {
  forest?: ForestBus;
  predators?: {
    list: { id: number; alive: boolean; mesh: THREE.Object3D; hitTarget: THREE.Object3D }[];
    damage?(id: number, dmg: number, from: THREE.Vector3 | null, knock?: number, byPlayer?: boolean): unknown;
  };
}

export interface EntsCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  collision: CollisionWorld;
  vfx: VfxSystem;
  player: PlayerController;
  enemies: EnemyManager;
  danger: unknown;
  level: string;
  lo: boolean;
  sound(kind: EntSound, gain: number, pan: number): void;
  hurt(dmg: number, why: string): void;
  say(text: string, color: string): void;
}

// ── effects ──
const ENT_STEP: Recipe = {
  id: 'ent_step',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [10, 14], life: [2.2, 3.8], speed: [2.5, 6.5], spread: Math.PI * 0.42, radius: 3.2, size: [2.4, 7.5], color: [0x75644c, 0x4a4036], alpha: [0.5, 0], drag: 1.3, lift: [0.2, 0.9], spin: [0.05, 0.3] },
    { layer: 'shard', count: [8, 12], life: [0.8, 1.4], speed: [3, 7], spread: Math.PI * 0.3, radius: 2.5, size: [0.3, 0.15], color: [0x5a4a3a, 0x3a3028], intensity: 0.5, alpha: [1, 0.6], gravity: 14, drag: 0.4, spin: [3, 8], bounce: 0.3 },
  ],
};
/** Leaves and moss shaken loose high on the body, fluttering down. */
const ENT_LEAVES: Recipe = {
  id: 'ent_leaves',
  emitters: [
    { layer: 'shard', count: [16, 24], life: [4, 6.5], speed: [1, 3.5], spread: Math.PI, radius: 5, size: [0.42, 0.3], color: [0x6fa24a, 0xa89a3a], intensity: 0.55, alpha: [1, 0], gravity: 1.4, drag: 1.6, turbulence: 3, spin: [1, 4] },
    { layer: 'add', shape: 'soft', count: [3, 6], life: [3, 5], speed: [0.4, 1.2], spread: Math.PI, radius: 4, size: [0.12, 0.05], color: [0xffe0f0, 0xc9a8ff], intensity: 1.6, gravity: 0.6, drag: 1.2, turbulence: 2 },
  ],
};
const ENT_SMASH: Recipe = {
  id: 'ent_smash',
  light: { color: 0xffc27a, intensity: 40, range: 30, life: 0.3 },
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [2, 26], color: [0xffe2a8, 0xb08a50], intensity: 1.2, alpha: [0.9, 0] },
    { layer: 'alpha', shape: 'smoke', count: [22, 30], life: [2.5, 4.5], speed: [6, 16], spread: Math.PI * 0.45, radius: 4, size: [3, 11], color: [0x806c52, 0x4a4036], alpha: [0.6, 0], drag: 1.5, lift: [0.4, 1.4], spin: [0.05, 0.3] },
    { layer: 'shard', count: [26, 36], life: [1, 2], speed: [6, 15], spread: Math.PI * 0.4, radius: 3, size: [0.6, 0.25], color: [0x5a4a3a, 0x2e2620], intensity: 0.5, alpha: [1, 0.7], gravity: 16, drag: 0.3, spin: [3, 9], bounce: 0.3 },
    { layer: 'shard', count: [30, 40], life: [4, 7], speed: [3, 8], spread: Math.PI * 0.6, radius: 5, size: [0.45, 0.3], color: [0x6fa24a, 0xa89a3a], intensity: 0.55, alpha: [1, 0], gravity: 1.4, drag: 1.4, turbulence: 3, spin: [1, 4] },
  ],
};
/** Tending and blessing: sap-gold and leaf-green motes rising from the ground under its hand. */
const ENT_MOTES: Recipe = {
  id: 'ent_motes',
  light: { color: 0xc8ff9a, intensity: 12, range: 16, life: 0.8 },
  emitters: [
    { layer: 'add', shape: 'soft', count: [26, 36], life: [2, 4], speed: [0.4, 1.6], spread: Math.PI, radius: 3.5, size: [0.16, 0.05], color: [0xfff2b0, 0x9cff6a], intensity: [2, 3.5], lift: [1, 2.6], turbulence: 2, drag: 0.6 },
    { layer: 'add', shape: 'ring', count: 1, life: 1.2, speed: 0, size: [1, 9], color: [0xd8ffb0, 0x7ad06a], intensity: 0.8, alpha: [0.7, 0] },
  ],
};

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** Named moves (the API's `command(id, move)`): which timeline plays it and what lands. radius m, dmg × base,
 *  knock m, launch m/s up, hold = hit-stun s (root-trap holds them). Per-warden moves join this table. */
export interface EntMove { act: EntActKind; radius: number; dmg: number; knock: number; launch: number; hold: number; note: string }
export const MOVES: Record<string, EntMove> = {
  smash: { act: 'smash', radius: 10, dmg: 1, knock: 5, launch: 7, hold: 0.6, note: 'two fists brought down on a point' },
  sweep: { act: 'smash', radius: 14, dmg: 0.7, knock: 10, launch: 4, hold: 0.4, note: 'a wide low sweep that scatters a horde' },
  'root-trap': { act: 'smash', radius: 12, dmg: 0.35, knock: 0, launch: 0, hold: 3.5, note: 'roots burst up and hold everything in the ring' },
  impale: { act: 'smash', radius: 6, dmg: 1.7, knock: 2, launch: 10, hold: 1, note: 'a narrow, deep strike for a titan' },
  shield: { act: 'bless', radius: 9, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'limbs held over the target: shelter (heals a light soul)' },
  lift: { act: 'bless', radius: 6, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'an open hand under the target lifts it up' },
  throw: { act: 'smash', radius: 4, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'scoops the target and flings it forward' },
  tend: { act: 'tend', radius: 8, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'reaches down and tends the ground' },
  bless: { act: 'bless', radius: 9, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'a blessing hand over a light soul' },
  threaten: { act: 'threaten', radius: 0, dmg: 0, knock: 0, launch: 0, hold: 0, note: 'rises, boughs spread wide in warning' },
};
const RECIPES = [ENT_STEP, ENT_LEAVES, ENT_SMASH, ENT_MOTES];

interface Guard {
  /** Stable id for the API (list / command / follow). */
  id: number;
  /** The warden kind (Grovewardens); 'placeholder' until the sheet-built bodies land. */
  kind: string;
  hp: number; maxHp: number;
  /** Walk with this (the player, a rally point): `follow()`. */
  follow: THREE.Object3D | null;
  ent: Ent;
  mode: 'stand' | 'walk';
  home: THREE.Vector3;
  think: number;
  cd: number;               // smash cooldown
  threatCd: number;
  idleT: number;
  pauseT: number;
  stirT: number;
  tendAt: THREE.Vector3 | null;
  fighting: boolean;
  warned: boolean;
  lastSaid: number;
  impostor: THREE.InstancedMesh | null;
  lod: 0 | 1 | 2;
}

export class Ents {
  readonly group = new THREE.Group();
  readonly guards: Guard[] = [];
  private soulOverride: number | null = null;
  private busOff: (() => void)[] = [];
  private busBound = false;
  private v = new THREE.Vector3(); private w = new THREE.Vector3(); private cam = new THREE.Vector3();
  private lodT = 0;
  private clock = 0;
  private R: () => number;
  private nextId = 1;

  constructor(private ctx: EntsCtx, private seed: number) {
    this.group.name = 'ents';
    ctx.scene.add(this.group);
    let s = seed >>> 0;
    this.R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const q = new URLSearchParams(location.search).get('soul');
    if (q) this.soulOverride = q === 'light' ? 1 : q === 'dark' ? -1 : 0;
    for (const r of RECIPES) ctx.vfx.recipes[r.id] = r;
    // the rift's brutes and bosses turn on an awake ent near them (enemies.ts hook)
    enemyNav.threat = (e: Enemy) => {
      for (const g of this.guards) {
        if (g.ent.awake < 0.5) continue;
        const dx = e.mesh.position.x - g.ent.pos.x, dz = e.mesh.position.z - g.ent.pos.z;
        if (dx * dx + dz * dz < 45 * 45) return g.ent.pos;
      }
      return null;
    };
  }

  private get danger() { return this.ctx.danger as DangerLike | null; }
  private get ground() { const c = this.ctx.collision; return (x: number, z: number) => (c.terrain ? c.terrain.heightAt(x, z, 1e4) : c.groundAt(x, z, 400, 800) ?? 0); }

  /** Light +1 … dark −1: the soul meter as the forest network carries it (or ?soul=, or the debug override). */
  soul(): number {
    if (this.soulOverride !== null) return this.soulOverride;
    let v: number | undefined;
    try { v = this.bus()?.soul(); } catch { v = undefined; }
    return Number.isFinite(v) ? clamp(v as number, -1, 1) : 0;
  }
  private bus(): ForestBus | null { return this.danger?.forest ?? (globalThis as unknown as { __forest?: ForestBus }).__forest ?? null; }
  /** Tell the forest (kinds 'ent-wake', 'ent-wrath', 'ent-calm', 'ent-smash', 'ent-tend', 'ent-bless'). */
  private emit(kind: string, data: Record<string, unknown>) {
    const x = Number(data.x), z = Number(data.z);
    try { this.bus()?.notify(kind, { x, z }, data, 'ent'); } catch { /* the network is optional */ }
  }

  /** Find a rooted spot among the canopy: forested (trunks round it), clear in the middle, dry, gently sloped,
   *  out of the hollow and the danger zones, 110–280 m from the middle so a player can come across it. */
  findSpot(near = new THREE.Vector3(), rMin = 110, rMax = 280, redwood = false): THREE.Vector3 | null {
    const T = this.ctx.collision.terrain, W = (globalThis as unknown as { __wilds?: { waterAt?(x: number, z: number): unknown } }).__wilds;
    const clears = (globalThis as unknown as { __wildsClearings?: () => number[][] }).__wildsClearings?.() ?? [];
    const H = this.ground;
    let best: THREE.Vector3 | null = null, bestN = -1;
    for (let i = 0; i < 500; i++) {
      const r = rMin + this.R() * (rMax - rMin), a = this.R() * Math.PI * 2;
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      if (Math.abs(x) < CORE + 30 && Math.abs(z) < CORE + 30) continue;
      if (Math.hypot(x, z) > 900) continue;
      if (W?.waterAt?.(x, z)) continue;
      if (clears.some((c) => Math.hypot(x - c[0], z - c[1]) < c[2] + 14)) continue;
      const h = H(x, z);
      if (Math.max(...[[8, 0], [-8, 0], [0, 8], [0, -8]].map(([dx, dz]) => Math.abs(H(x + dx, z + dz) - h))) > 4.5) continue;
      let n = 0, dmin = Infinity;
      if (T?.trunksNear) for (const tr of T.trunksNear(x, z, 24)) { const d = Math.hypot(tr[0] - x, tr[1] - z); if (d < 24) n++; dmin = Math.min(dmin, d - tr[2]); }
      if (dmin < 6.5) continue;
      // the redwoods (x > 220, z < 40) stand 50 m tall: an ent among them passes for a tree best
      const score = n + (redwood && x > 220 && z < 40 ? 6 : 0);
      if (score > bestN) { bestN = score; best = new THREE.Vector3(x, h, z); if (score >= 12) break; }
    }
    return best;
  }

  spawn(mode: 'stand' | 'walk', at?: THREE.Vector3 | null, yaw = this.R() * Math.PI * 2) {
    const p = at ?? this.findSpot(undefined, 110, mode === 'stand' ? 340 : 280, mode === 'stand');
    if (!p) { console.warn('[ents] no spot found'); return null; }
    const ent = new Ent(this.seed + this.guards.length * 101, this.ground, p.x, p.z, yaw, this.ctx.lo);
    ent.rooted = mode === 'stand';
    ent.update(0);
    this.group.add(ent.root);
    const g: Guard = { id: this.nextId++, kind: 'placeholder', hp: 6000, maxHp: 6000, follow: null, ent, mode, home: p.clone(), think: 0, cd: 0, threatCd: 0, idleT: 0, pauseT: 0, stirT: 60 + this.R() * 80, tendAt: null, fighting: false, warned: false, lastSaid: -99, impostor: null, lod: 0 };
    ent.onStep = (side, at) => this.footfall(g, at);
    ent.onAct = (kind, at, phase, move) => this.acted(g, kind, at, phase, move);
    ent.avoid = (pt) => {
      if (this.soul() < -0.3) return; // a dark soul gets no such care
      const pp = this.ctx.player.object.position, dx = pt.x - pp.x, dz = pt.z - pp.z, d = Math.hypot(dx, dz);
      if (d < 6.5) { const k = d > 0.01 ? 6.5 / d : 1; pt.x = pp.x + (d > 0.01 ? dx : 1) * k; pt.z = pp.z + (d > 0.01 ? dz : 0) * k; }
    };
    this.guards.push(g);
    console.info(`[ents] a ${mode === 'stand' ? 'rooted' : 'walking'} ent at (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
    return g;
  }

  /** Compile its shaders with the level (no hitch when it comes into view) and bake its far impostor. */
  async prepare(renderer: THREE.WebGPURenderer, camera: THREE.Camera) {
    const t0 = performance.now();
    try { await renderer.compileAsync(this.group, camera, this.ctx.scene); } catch (e) { console.warn('[ents] compile', e); }
    const t1 = performance.now();
    for (const g of this.guards) {
      try {
        const copy = g.ent.root.clone(true);
        copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.updateMatrixWorld(true);
        const sc = this.ctx.scene;
        const atlas = await bakeImpostor(renderer, [copy], { frames: this.ctx.lo ? 5 : 6, size: this.ctx.lo ? 768 : 1024, environment: sc.environment as THREE.Texture | null, envIntensity: sc.environmentIntensity });
        const im = impostorMesh(atlas, 1, impostorMaterial(atlas, { brightness: sc.environment ? 1.0 : 1.3, flipV: true }));
        im.name = 'ent-impostor'; im.count = 0;
        this.group.add(im); g.impostor = im;
        try { await renderer.compileAsync(im, camera, sc); } catch { /* compiles on first draw */ }
      } catch (e) { console.warn('[ents] impostor bake', e); }
    }
    console.info(`[ents] ready: compiled in ${Math.round(t1 - t0)} ms, impostor baked in ${Math.round(performance.now() - t1)} ms`);
  }

  // ── what it does ──
  private think(g: Guard) {
    const ent = g.ent, pl = this.ctx.player, pp = pl.object.position;
    const soul = this.soul(), dP = Math.hypot(pp.x - ent.pos.x, pp.z - ent.pos.z);
    const alive = !pl.downed && pl.hp > 0;
    // 1 — the rift's creatures near it (titans/bosses first); predators only when they hunt a light-souled player
    let foe: THREE.Vector3 | null = null, foeD = Infinity;
    for (const e of this.ctx.enemies.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.mesh.position.x - ent.pos.x, e.mesh.position.z - ent.pos.z), score = d * (e.boss ? 0.5 : 1);
      if (d < 75 && score < foeD) { foeD = score; foe = e.mesh.position; }
    }
    if (!foe && soul > 0.3 && alive && dP < 90) {
      for (const p of this.danger?.predators?.list ?? []) {
        if (!p.alive) continue;
        const d = p.mesh.position.distanceTo(pp);
        if (d < 18 && d < foeD) { foeD = d; foe = p.mesh.position; }
      }
    }
    if (foe) {
      if (!g.fighting) { g.fighting = true; this.ctx.sound('groan', this.gainAt(ent.pos), this.panAt(ent.pos)); this.emit('ent-wrath', { x: ent.pos.x, z: ent.pos.z, against: 'rift' }); }
      ent.rooted = false; ent.look = foe;
      const d = Math.hypot(foe.x - ent.pos.x, foe.z - ent.pos.z);
      if (d < 17 && !ent.busy && g.cd <= 0) {
        // strike at the foe, but never closer than 9 m in front of its own feet
        const t = this.v.copy(foe);
        if (d < 9) { const k = 9 / Math.max(0.1, d); t.set(ent.pos.x + (foe.x - ent.pos.x) * k, 0, ent.pos.z + (foe.z - ent.pos.z) * k); }
        t.y = this.ground(t.x, t.z);
        ent.goal = null; ent.start('smash', t); g.cd = 2.6;
      } else if (d >= 17 && !ent.busy) ent.goal = this.w.set(foe.x - (foe.x - ent.pos.x) / d * 12, 0, foe.z - (foe.z - ent.pos.z) / d * 12).clone();
      return;
    }
    if (g.fighting) { g.fighting = false; this.emit('ent-calm', { x: ent.pos.x, z: ent.pos.z }); }

    // 2 — a dark soul close by: it warns, then strikes
    if (soul < -0.3 && alive && dP < 36) {
      ent.rooted = false; ent.look = pp;
      if (!g.warned && !ent.busy) {
        g.warned = true; ent.goal = null; ent.start('threaten', pp);
        this.ctx.sound('groan', this.gainAt(ent.pos) * 1.2, this.panAt(ent.pos));
        this.sayOnce(g, 'The ent turns its gaze on you. It knows your soul is dark.', '#ff8a5a');
        this.emit('ent-wrath', { x: ent.pos.x, z: ent.pos.z, against: 'player' });
      } else if (!ent.busy && g.cd <= 0 && dP < 17) {
        const t = this.v.copy(pp); t.y = this.ground(t.x, t.z);
        ent.goal = null; ent.start('smash', t); g.cd = 6.5;
      } else if (!ent.busy && dP >= 17) ent.goal = this.w.set(pp.x - (pp.x - ent.pos.x) / dP * 13, 0, pp.z - (pp.z - ent.pos.z) / dP * 13).clone();
      return;
    }
    if (dP > 60) g.warned = false;

    // 3 — a light soul, hurt, close by: it bends down and blesses (heals) and shelters under its hand
    if (soul > 0.3 && alive && dP < 30 && pl.hp < pl.maxHp * 0.6) {
      ent.rooted = false; ent.look = pp;
      if (ent.act?.kind === 'bless') { ent.retarget(pp); ent.hold(0.5); }
      else if (!ent.busy) {
        ent.goal = null; ent.start('bless', pp);
        this.ctx.sound('bless', this.gainAt(ent.pos), this.panAt(ent.pos));
        this.sayOnce(g, 'The ent shelters you. The forest knows a light soul.', '#9cff6a');
        this.emit('ent-bless', { x: pp.x, z: pp.z });
      }
      return;
    }

    // 4 — the forest calls (a hurt grove on the root/mycelium network): go there and tend it
    if (g.tendAt && !ent.busy) {
      const t = g.tendAt, d = Math.hypot(t.x - ent.pos.x, t.z - ent.pos.z);
      ent.rooted = false;
      if (d > 14) ent.goal = this.w.set(t.x - (t.x - ent.pos.x) / d * 10, 0, t.z - (t.z - ent.pos.z) / d * 10).clone();
      else { ent.goal = null; t.y = this.ground(t.x, t.z); ent.start('tend', t); g.tendAt = null; }
      return;
    }

    // 5 — its own life: a light soul is watched kindly, the rest ignored; walkers wander, standers stay rooted
    ent.look = soul > 0.3 && dP < 70 ? pp : null;
    if (ent.busy) return;
    if (g.follow) {
      // walk with what it follows (the player, a rally point): keep 14–26 m off, alongside
      const f = g.follow.getWorldPosition(this.v), d = Math.hypot(f.x - ent.pos.x, f.z - ent.pos.z);
      ent.rooted = false; ent.look = f;
      if (d > 26) ent.goal = this.w.set(f.x - (f.x - ent.pos.x) / d * 16, 0, f.z - (f.z - ent.pos.z) / d * 16).clone();
      else if (d < 12) ent.goal = this.w.set(ent.pos.x - (f.x - ent.pos.x) / Math.max(1, d) * 8, 0, ent.pos.z - (f.z - ent.pos.z) / Math.max(1, d) * 8).clone();
      return;
    }
    if (g.mode === 'walk') {
      if (!ent.goal) {
        if (g.pauseT > 0) return;
        g.pauseT = 5 + this.R() * 9;
        if (this.R() < 0.3) { const t = this.v.set(ent.pos.x + Math.sin(ent.yaw) * 11, 0, ent.pos.z + Math.cos(ent.yaw) * 11); t.y = this.ground(t.x, t.z); ent.start('tend', t); return; }
        // the next stretch of its walk: somewhere in the forest, drifting through where the player roams
        const centre = this.R() < 0.6 ? pp : g.home;
        const spot = this.findSpot(centre, 70, 200);
        if (spot) ent.goal = spot;
      }
    } else {
      const dh = Math.hypot(g.home.x - ent.pos.x, g.home.z - ent.pos.z);
      if (dh > 5) { ent.rooted = false; ent.goal = g.home.clone(); g.idleT = 0; }
      else if (!ent.goal && (g.idleT += 0.4) > 6) ent.rooted = true;
      if (ent.rooted && g.stirT <= 0) {
        // now and then a rooted ent stirs and tends the ground at its feet
        g.stirT = 80 + this.R() * 100;
        const t = this.v.set(ent.pos.x + Math.sin(ent.yaw) * 11, 0, ent.pos.z + Math.cos(ent.yaw) * 11); t.y = this.ground(t.x, t.z);
        ent.start('tend', t);
      }
    }
  }

  private sayOnce(g: Guard, text: string, colour: string) {
    if (this.clock - g.lastSaid < 20) return;
    g.lastSaid = this.clock; this.ctx.say(text, colour);
  }

  private gainAt(p: THREE.Vector3) { const d = this.cam.distanceTo(p); return Math.pow(clamp(1 - d / 300), 1.7); }
  private panAt(p: THREE.Vector3) {
    const c = this.ctx.camera, r = this.v.set(1, 0, 0).applyQuaternion(c.quaternion);
    const dx = p.x - this.cam.x, dz = p.z - this.cam.z, l = Math.hypot(dx, dz) || 1;
    return clamp((dx * r.x + dz * r.z) / l, -1, 1) * 0.8;
  }

  /** A foot lands: the camera shakes (by distance), a deep thud and a creak, dust and loose leaves; under it, a stomp. */
  private footfall(g: Guard, at: THREE.Vector3) {
    const pp = this.ctx.player.object.position, d = Math.hypot(at.x - pp.x, at.z - pp.z);
    const near = Math.pow(clamp(1 - (d - 12) / 150), 1.6);
    if (near > 0.01) this.ctx.vfx.sim.shake = Math.max(this.ctx.vfx.sim.shake, 2.2 * near);
    const gain = this.gainAt(at);
    if (gain > 0.01) this.ctx.sound('step', gain, this.panAt(at));
    if (this.cam.distanceTo(at) < 260) {
      this.ctx.vfx.spawn(ENT_STEP, at, { dir: [0, 1, 0] });
      const hi = g.ent.joints.pelvis;
      this.ctx.vfx.spawn(ENT_LEAVES, this.v.set(hi.x, hi.y + 8, hi.z), { dir: [0, -1, 0], count: 0.7 });
    }
    // standing right under it
    if (d < 5.5 && pp.y - at.y < 4) {
      const soul = this.soul(), dir = this.w.set(pp.x - at.x, 0, pp.z - at.z);
      if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
      this.ctx.player.lunge(dir.normalize(), 11, 0.3); this.ctx.player.hop(6);
      if (soul < -0.3) this.ctx.hurt(35, 'ent stomp');
    }
  }

  /** An action reaches its moment: the smash lands, the tending hand touches the ground, the blessing opens. */
  private acted(g: Guard, kind: EntActKind, at: THREE.Vector3, phase: 'start' | 'strike' | 'end', move: string = kind) {
    const ent = g.ent;
    this.emit('ent-move', { id: g.id, move, phase: phase === 'start' ? 'tell' : phase === 'strike' ? 'hit' : 'end', x: at.x, z: at.z });
    const M = MOVES[move] ?? MOVES[kind];
    if (phase === 'start') { if (kind !== 'bless') this.ctx.sound('creak', this.gainAt(ent.pos), this.panAt(ent.pos)); if (kind === 'tend') this.emit('ent-tend', { x: at.x, z: at.z }); return; }
    if (phase === 'end') return;
    if (kind === 'smash') {
      const pp = this.ctx.player.object.position, d = Math.hypot(at.x - pp.x, at.z - pp.z);
      this.ctx.vfx.spawn(ENT_SMASH, at, { dir: [0, 1, 0] });
      this.ctx.vfx.sim.shake = Math.max(this.ctx.vfx.sim.shake, 3.4 * Math.pow(clamp(1 - (d - 8) / 160), 1.4));
      this.ctx.sound('smash', this.gainAt(at), this.panAt(at));
      this.emit('ent-smash', { x: at.x, z: at.z });
      // the rift's creatures under the fists
      const dir = new THREE.Vector3();
      for (const e of [...this.ctx.enemies.enemies]) {
        if (e.hp <= 0) continue;
        const r = Math.hypot(e.mesh.position.x - at.x, e.mesh.position.z - at.z);
        if (r > M.radius) continue;
        dir.set(e.mesh.position.x - at.x, 0, e.mesh.position.z - at.z).normalize();
        this.ctx.enemies.damageEnemy(e.id, Math.round((e.boss ? 260 : 420) * M.dmg * (1 - r / (M.radius * 2))), dir, M.knock, { source: 'ent' as never, launch: M.launch, hitstun: M.hold, unblockable: true });
      }
      // predators caught in it (always: they share the ground it strikes)
      const dg = this.danger;
      const pd = dg?.predators;
      if (pd?.damage) for (const p of pd.list) {
        if (!p.alive || Math.hypot(p.mesh.position.x - at.x, p.mesh.position.z - at.z) > M.radius) continue;
        pd.damage(p.id, Math.round(320 * M.dmg), at, M.knock, false);
      }
      // throw: the player in reach is flung forward (an ally's launch, no harm)
      if (move === 'throw') {
        if (d < 8) { this.ctx.player.lunge(dir.set(Math.sin(ent.yaw), 0, Math.cos(ent.yaw)), 26, 0.7); this.ctx.player.hop(15); }
        return;
      }
      // the player: a dark soul is the target; anyone else just gets thrown by the shock
      if (M.dmg > 0 && d < 11 && pp.y - at.y < 6) {
        const soul = this.soul();
        this.ctx.player.lunge(dir.set(pp.x - at.x, 0, pp.z - at.z).normalize(), 14, 0.4); this.ctx.player.hop(8);
        if (soul < -0.3) this.ctx.hurt(Math.round(55 * (1 - d / 22)), 'ent smash');
        else if (soul < 0.3 && d < 7) this.ctx.hurt(12, 'ent smash');
      }
    } else if (kind === 'tend' || kind === 'bless') {
      this.ctx.vfx.spawn(ENT_MOTES, at, { dir: [0, 1, 0] });
      if (move === 'lift') { const pp = this.ctx.player.object.position; if (Math.hypot(pp.x - at.x, pp.z - at.z) < M.radius) this.ctx.player.hop(16); }
      this.ctx.sound(kind === 'bless' ? 'bless' : 'creak', this.gainAt(at) * 0.7, this.panAt(at));
    } else if (kind === 'threaten') {
      this.ctx.vfx.spawn(ENT_LEAVES, ent.joints.head, { dir: [0, -1, 0], count: 1.5 });
    }
  }

  /** Listen to the forest network: a hurt tree ('tree-hit') or a fungus bursting in alarm calls the nearest ent
   *  (within 400 m) to come and tend it. The news reaches each ent through the roots (it travels at ROOT_SPEED). */
  private bindBus() {
    const b = this.bus();
    if (!b || this.busBound) return;
    this.busBound = true;
    const call = (ev: { pos: { x: number; z: number }; data: Record<string, unknown> }, why: string) => {
      const d = ev.pos;
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
      let best: Guard | null = null, bd = 400;
      for (const g of this.guards) { const dd = Math.hypot(g.ent.pos.x - d.x, g.ent.pos.z - d.z); if (dd < bd) { bd = dd; best = g; } }
      if (best && !best.tendAt) { best.tendAt = new THREE.Vector3(d.x, 0, d.z); console.info(`[ents] the forest calls (${why}) at (${d.x.toFixed(0)}, ${d.z.toFixed(0)})`); }
    };
    const at = () => this.guards[0]?.ent.pos ?? null;
    this.busOff.push(b.subscribe('tree-hit', (ev) => call(ev, 'tree-hit'), { at }));
    this.busOff.push(b.subscribe('fungus', (ev) => { if (ev.data?.act === 'burst') call(ev, 'fungus burst'); }, { at }));
  }

  update(dt: number) {
    this.clock += dt;
    this.ctx.camera.getWorldPosition(this.cam);
    if (!this.busBound) this.bindBus();
    const pp = this.ctx.player.object.position;
    const movers = this.ctx.collision.movers;
    movers.length = 0;
    for (const g of this.guards) {
      const ent = g.ent;
      g.cd -= dt; g.threatCd -= dt; g.pauseT -= dt; g.stirT -= dt;
      if ((g.think -= dt) <= 0) { g.think = 0.4; this.think(g); }
      // a light-souled player under a blessing heals (and the motes keep rising)
      if (ent.act?.kind === 'bless' && ent.act.fired && this.soul() > 0.3) {
        const pl = this.ctx.player;
        if (!pl.downed && pl.hp > 0 && pl.object.position.distanceTo(ent.act.target) < 9) pl.hp = Math.min(pl.maxHp, pl.hp + 9 * dt);
        if (((this.clock * 1.25) | 0) !== (((this.clock - dt) * 1.25) | 0)) this.ctx.vfx.spawn(ENT_MOTES, ent.act.target, { dir: [0, 1, 0], count: 0.5 });
      }
      // only animate what can matter: near or on screen; a far rooted ent is static
      const dc = this.cam.distanceTo(ent.pos);
      if (dc < 900 || ent.walking || ent.busy) ent.update(dt);
      // solid legs and body: moving trunk columns [x, z, r, y0, y1]
      const J = ent.joints;
      for (const s of ['Left', 'Right'] as const) {
        const a = J.ankle[s], k = J.knee[s], h = J.hip[s];
        movers.push([(a.x + k.x) / 2, (a.z + k.z) / 2, 2.3, Math.min(a.y, k.y) - 2.5, Math.max(a.y, k.y)]);
        movers.push([(k.x + h.x) / 2, (k.z + h.z) / 2, 2.5, Math.min(k.y, h.y), Math.max(k.y, h.y)]);
      }
      movers.push([J.pelvis.x, J.pelvis.z, 5.2, J.pelvis.y - 3, J.pelvis.y + 15]);
      void pp;
    }
    if ((this.lodT -= dt) <= 0) { this.lodT = 0.25; this.lods(); }
  }

  /** Near: everything. Mid: no flowers, moss, limb leaves or small trees. Far: the impostor card. */
  private lods() {
    const near = this.ctx.lo ? 170 : 250, mid = this.ctx.lo ? 450 : 650;
    for (const g of this.guards) {
      const d = this.cam.distanceTo(g.ent.pos);
      const lod: 0 | 1 | 2 = d < near ? 0 : d < mid || !g.impostor ? 1 : 2;
      if (lod !== g.lod) {
        g.lod = lod;
        for (const o of g.ent.model.detail) o.visible = lod === 0;
        g.ent.root.visible = lod < 2;
      }
      if (g.impostor) {
        g.impostor.count = lod === 2 ? 1 : 0;
        if (lod === 2) setImpostor(g.impostor, 0, g.ent.pos.x, g.ent.pos.y, g.ent.pos.z, g.ent.yaw, 1);
      }
    }
  }

  // ── API for the player ↔ warden side (danger/wardens.ts) ──
  /** Every warden now: id, kind, position, awake 0…1, busy (mid-move), hp. */
  list() { return this.guards.map((g) => ({ id: g.id, kind: g.kind, pos: g.ent.pos.clone(), awake: g.ent.awake, busy: g.ent.busy, move: g.ent.act?.move ?? null, hp: g.hp, maxHp: g.maxHp })); }
  /** Moves a warden knows (shared set; per-warden moves join MOVES by id). */
  moves(_id?: number) { return Object.keys(MOVES); }
  /** Play a named move at a point or an enemy (anything with a position). False when busy or unknown.
   *  Events on the forest bus: 'ent-move' { id, move, phase: 'tell' | 'hit' | 'end', x, z }. */
  command(id: number, move: string, target?: { x: number; z: number } | { mesh?: THREE.Object3D; position?: THREE.Vector3 } | null) {
    const g = this.guards.find((q) => q.id === id), M = MOVES[move];
    if (!g || !M || g.ent.busy) return false;
    const t = new THREE.Vector3();
    const tt = target as { x?: number; z?: number; mesh?: THREE.Object3D; position?: THREE.Vector3 } | null | undefined;
    if (tt?.mesh) t.copy(tt.mesh.position); else if (tt?.position) t.copy(tt.position);
    else if (tt && Number.isFinite(tt.x) && Number.isFinite(tt.z)) t.set(tt.x!, 0, tt.z!);
    else if (M.act === 'bless') t.copy(this.ctx.player.object.position);
    else t.set(g.ent.pos.x + Math.sin(g.ent.yaw) * 11, 0, g.ent.pos.z + Math.cos(g.ent.yaw) * 11);
    t.y = this.ground(t.x, t.z);
    g.ent.goal = null;
    return g.ent.start(M.act, t, move);
  }
  /** Walk with a target (the player's object, a rally marker); null lets it go back to its own life. */
  follow(id: number, target: THREE.Object3D | null) { const g = this.guards.find((q) => q.id === id); if (!g) return false; g.follow = target; if (!target) g.ent.goal = null; return true; }

  // ── debug (?rrdebug: __rr.ents) ──
  info() { return this.guards.map((g) => ({ mode: g.mode, x: +g.ent.pos.x.toFixed(1), z: +g.ent.pos.z.toFixed(1), y: +g.ent.pos.y.toFixed(1), yaw: +g.ent.yaw.toFixed(2), rooted: g.ent.rooted, act: g.ent.act?.kind ?? null, speed: +g.ent.speed.toFixed(2), awake: +g.ent.awake.toFixed(2), lod: g.lod, soul: this.soul(), dist: +g.ent.pos.distanceTo(this.ctx.player.object.position).toFixed(0) })); }
  act(kind: EntActKind, i = 0) { const g = this.guards[i]; if (!g) return false; const t = this.ctx.player.object.position.clone(); if (kind !== 'bless') { const e = g.ent; t.set(e.pos.x + Math.sin(e.yaw) * 11, 0, e.pos.z + Math.cos(e.yaw) * 11); t.y = this.ground(t.x, t.z); } return g.ent.start(kind, t); }
  walkTo(x: number, z: number, i = 0) { const g = this.guards[i]; if (!g) return; g.ent.rooted = false; g.ent.goal = new THREE.Vector3(x, 0, z); g.mode = 'walk'; g.pauseT = 1e9; }
  setSoul(v: number | null) { this.soulOverride = v; }
  /** Move the ent next to the player (scale shots): `ahead` metres in front of the camera. */
  near(ahead = 40, i = 0) { const g = this.guards[i]; if (!g) return; const c = this.ctx.camera, f = this.v.set(0, 0, -1).applyQuaternion(c.quaternion).setY(0).normalize(); const p = this.ctx.player.object.position; const x = p.x + f.x * ahead, z = p.z + f.z * ahead; g.ent.place(x, z, Math.atan2(p.x - x, p.z - z)); g.home.set(x, this.ground(x, z), z); }

  dispose() {
    for (const off of this.busOff) off();
    if (enemyNav.threat) enemyNav.threat = null;
    for (const g of this.guards) { g.ent.dispose(); g.impostor?.removeFromParent(); }
    this.ctx.collision.movers.length = 0;
    this.group.removeFromParent();
  }
}

/** The Wilds only (not ?classic): roll the session's encounter (about 40 %), stand (70 %) or walk (30 %). */
export function createEnts(ctx: EntsCtx): Ents | null {
  const q = new URLSearchParams(location.search);
  const want = q.get('ent');
  if (want === '0' || ctx.level !== 'elderwood' || q.has('classic')) return null;
  const forced = want === '1' || want === 'stand' || want === 'walk';
  const seed = Math.floor(Math.random() * 1e9);
  if (!forced && Math.random() >= 0.4) return null;
  const ents = new Ents(ctx, seed);
  const mode = want === 'stand' || want === 'walk' ? want : Math.random() < 0.7 ? 'stand' : 'walk';
  if (!ents.spawn(mode)) { ents.dispose(); return null; }
  return ents;
}
