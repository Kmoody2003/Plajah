// Gameplay ported from the classic exhibition onto the new engine: Jack's bushido katana
// (3-hit combos in HIGH/MID/LOW stances, dash, molotovs), HP/XP/levels with reward popups,
// monsters with chase/attack AI, and the Pumpkin Patch cast encounters (comic panel +
// staged cameo: the tank run, Miriam, Pumpkin Patch fighting beside you, Stitch, Crane, Lil' Boo).
import * as THREE from 'three/webgpu';
import { halloweenAudio } from '../../../services/halloween/halloweenAudioSfx';
import type { PlayerController } from './player';
import type { Character, CombatMove } from './character';
import type { CollisionWorld } from './collision';
import type { LightPool, Virtual } from './lights';
import type { ArrivalWorld } from './arrival';
import { Mob, MobKind, KINDS, preloadMobs, Difficulty } from './mobs';
import { ENCOUNTERS, Encounter } from './encounters';
import { flameMaterial, buildBroom } from './fx';
import { buildAngel } from './angel';
import { uniform, mix, hue, uv, time, vec3, float, smoothstep, sin } from 'three/tsl';
import { loadGLB } from './character';
import { Particles, Trail, Rings, FxBudget, type Emit } from './vfx';
import { Dismember, PARTS17, PARTS_MIXAMO } from './gore';
import type { Sfx } from './sfx';
import { BatSwarm } from './bats';

export type LevelName = 'outside' | 'hall';
type Stance = 'HIGH' | 'MID' | 'LOW';

/** Pumpkin Patch's war-rig (6.45 m, faces +Z). */
const TANK_URL = '/games/ravencrest/assets/vehicles/war_rig_tank.glb';

/** Performance knobs (main.ts sets them for phones). */
export const tuning = { cullDist: 64 };

export interface GameDeps {
  player: PlayerController;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  jack(): Character | null;
  level(): LevelName;
  scene(l: LevelName): THREE.Scene;
  collision(l: LevelName): CollisionWorld;
  pool(l: LevelName): LightPool;
  /** Is input going to the game (no card open, not in a door fade or review mode)? */
  live(): boolean;
  /** Send the player back to the last checkpoint. */
  respawn(): void;
  /** Ask the host page to play a film (optionally from a timecode). */
  watch(id: string, timecode?: string): void;
  /** Combat + magic sound design (sfx.ts). */
  sfx: Sfx;
  /** Primary click/Enter claimed by something else (a locked-on billboard)? */
  primary?(clientX?: number, clientY?: number): boolean;
  /** A scripted event (the Dracula nightmare) owns the night: no hordes. */
  eventActive(): boolean;
  /** Blood and dirt on the lens (lensSplatter.ts). */
  lens: { hit(kind: 'blood' | 'dirt', amount?: number): void };
  /** Combo comic strip (comic.ts). */
  comic: { hit(word?: string): void; show(finale?: string): void };
}

export interface Placement { kind: MobKind; level: LevelName; pos: THREE.Vector3; yaw?: number }
export interface Staging {
  tankPath: [THREE.Vector3, THREE.Vector3];
  /** The approach road (hordes pour down it; the tank comes up it). */
  road: ArrivalWorld['road'];
  miriam: { pos: THREE.Vector3; yaw: number };
  stitch: { pos: THREE.Vector3; yaw: number };
  crane: { pos: THREE.Vector3; yaw: number };
}

// Strike timing (fraction of the move), base damage, reach and arc (radians).
const HITS: Record<CombatMove, { at: number[]; dmg: number; reach: number; arc: number }> = {
  combo: { at: [0.46], dmg: 18, reach: 2.5, arc: 2.0 },
  backhand: { at: [0.46], dmg: 18, reach: 2.5, arc: 2.0 },
  cleave: { at: [0.5], dmg: 28, reach: 2.6, arc: 1.2 },
  sweep: { at: [0.48], dmg: 22, reach: 2.7, arc: 2.2 },
  kata: { at: [0.42, 0.58, 0.74, 0.86], dmg: 22, reach: 3.0, arc: Math.PI * 2 },
  throw: { at: [], dmg: 0, reach: 0, arc: 0 },
  ready: { at: [], dmg: 0, reach: 0, arc: 0 },
  jab: { at: [0.45], dmg: 9, reach: 1.9, arc: 1.4 },
  hook: { at: [0.48], dmg: 13, reach: 1.9, arc: 1.8 },
  frontKick: { at: [0.46], dmg: 15, reach: 2.2, arc: 1.2 },
  roundhouse: { at: [0.45], dmg: 18, reach: 2.4, arc: 2.6 },
  spinKick: { at: [0.46], dmg: 20, reach: 2.4, arc: 1.6 },
  flipKick: { at: [0.33, 0.78], dmg: 22, reach: 2.4, arc: 2.2 },
  flipCleave: { at: [0.78], dmg: 40, reach: 2.9, arc: 2.0 },
};
/** Kicks and the flips knock a foe back (not the heavyweights). */
const KNOCK: Partial<Record<CombatMove, number>> = { frontKick: 7, roundhouse: 6, spinKick: 8, flipKick: 6, flipCleave: 4 };
// Mashing attack runs a string of cuts from different angles; the stance picks the opener and
// every sixth press is the whirlwind finisher.
const OPENER: Record<Stance, CombatMove> = { HIGH: 'cleave', MID: 'combo', LOW: 'sweep' };
const STRING: CombatMove[] = ['backhand', 'cleave', 'sweep', 'combo', 'kata'];
// Mashing attack: each hero's string weaves fists and feet between the cuts, ending in a flip.
// Jack hits like a brawler (hooks, a front kick, a roundhouse, the vaulting flip-cleave);
// Elise is quick and acrobatic (jab-jab, spinning back kick, the backflip kick).
const HERO_STRING: Record<'jack' | 'elise', CombatMove[]> = {
  jack: ['backhand', 'hook', 'frontKick', 'cleave', 'roundhouse', 'combo', 'flipCleave'],
  elise: ['jab', 'backhand', 'jab', 'spinKick', 'sweep', 'roundhouse', 'flipKick'],
};
// Each stance finds a weak point (the old exhibition's stance system).
const WEAK: Record<Stance, MobKind[]> = { HIGH: ['werewolf', 'stitch'], MID: ['ghost'], LOW: ['zombie'] };
const SWING_SPEED = 1.3;
const ROLL_TIME = 0.5;

export class Game {
  hp = 100; maxHp = 100; xp = 0; lvl = 1; kills = 0;
  stance: Stance = 'MID';
  molotovs = 3;
  readonly mobs: Mob[] = [];
  private chainStep = 0;
  private queued = false;
  private swing: { move: CombatMove; t: number; dur: number; hits: number } | null = null;
  private invuln = 0;
  private dashCd = 0;
  private rollT = -1;
  private molotovRegen = 0;
  private dead = 0;
  private bottles: { mesh: THREE.Object3D; v: THREE.Vector3; t: number; level: LevelName }[] = [];
  private fires: { group: THREE.Group; pos: THREE.Vector3; t: number; level: LevelName; light: Virtual }[] = [];
  private fireMat = flameMaterial();
  private pendingThrow: number | null = null;
  private fired = new Set<string>();
  private tank: { obj: THREE.Object3D; t: number; from: THREE.Vector3; to: THREE.Vector3; shot: number; speed: number } | null = null;
  // Hordes: a wave charges down the Cinema Mile; the tank answers. Then a 2-minute cool-down.
  private hordeCd = 100;
  private horde: { phase: 'charge' | 'tank'; t: number; mobs: Mob[]; side: THREE.Vector3; laugh: number } | null = null;
  private boo: THREE.Mesh | null = null;
  private booZap = 1;
  private booLight: Virtual | null = null;
  private staging: Staging | null = null;
  // HUD
  private ui = document.createElement('div');
  private hpFill!: HTMLDivElement; private xpFill!: HTMLDivElement; private lvlEl!: HTMLSpanElement;
  private stanceEls: Record<Stance, HTMLSpanElement> = {} as Record<Stance, HTMLSpanElement>;
  private molEl!: HTMLSpanElement; private callEl!: HTMLDivElement; private feed!: HTMLDivElement;
  private vignette!: HTMLDivElement; private comic!: HTMLDivElement; private comicT = 0;
  private comicEnc: Encounter | null = null;
  // Power grows with every defeat (permanent) plus a short-lived kill streak.
  streak = 0;
  private streakT = 0;
  private hitStop = 0;
  private glow = new Particles(700, true);
  private gore = new Particles(500, false);
  private trail = new Trail();
  private rings = new Rings();
  private batSwarmFx = new BatSwarm();
  private bodies: { d: Dismember; level: LevelName; bleed: number; color: THREE.Color }[] = [];
  private flashes: { v: Virtual; t: number; level: LevelName; i: number }[] = [];
  private powerEl!: HTMLDivElement;
  private lastPowerTier = 0;
  private sinceSwing = 9;
  // Will-o'-wisp helper orbs: orbit Jack lighting the dark, dart out to zap monsters, heal
  // him when he is hurt. One joins at the start; the souls of the defeated add more.
  // Each orb carries power (0…1): attacks spend it, rest restores it, Dracula's blasts drain it.
  // They never die — drained, they glow red and hang back until they recover to purple.
  private orbs: { mesh: THREE.Mesh; light: Virtual | null; level: LevelName | null; phase: number; state: 'orbit' | 'dart' | 'back'; target: Mob | null; t: number; cd: number; color: THREE.Color; power: number; uPow: { value: number } }[] = [];
  /** 0 → warm will-o'-wisp light, 1 → celestial purple-iridescent (fighting Dracula). */
  private uCelestial = uniform(0);
  private uOrbGlow = uniform(6);
  /** The boss the orbs turn their beams on (nightmare.ts sets it during the fight). */
  bossTarget: Mob | null = null;
  private beams: { mesh: THREE.Mesh; t: number }[] = [];
  private beamMat = (() => {
    // Celestial beam: a hue that flows along the beam and through time, a white-hot core,
    // soft edges — iridescent spiritual energy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const N = (x: unknown) => x as any;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const u = N(uv());
    const across = N(u.x.sub(0.5).abs().mul(2));
    const core = N(smoothstep(float(0.35), float(0.0), across));
    const edge = N(smoothstep(float(1.0), float(0.2), across));
    // Iridescence held in the purple family: violet ↔ magenta ↔ blue-cyan, never green.
    const iris = N(hue(vec3(0.72, 0.32, 1.0), N(sin(N(time).mul(4).add(u.y.mul(9)))).mul(0.9)));
    const pulse = N(sin(N(time).mul(30).sub(u.y.mul(40))).mul(0.25).add(0.75));
    m.colorNode = N(mix(iris, vec3(1, 0.95, 1), core)).mul(edge).mul(pulse).mul(4);
    return m;
  })();
  private orbGeo = new THREE.SphereGeometry(0.09, 14, 10);
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private sphere = new THREE.Sphere();

  constructor(private d: GameDeps) {
    this.buildHud();
    halloweenAudio.setOutputLevel(0.5);   // stingers (tank, witch, parry) under the score
    halloweenAudio.movieVoices = false;   // our own matched lines only (voices.json), no random film clips
    fetch('/games/ravencrest/audio/voices/voices.json').then((r) => r.json()).then((j) => { this.voiceLines = j.voices ?? []; }).catch(() => {});
    addEventListener('keydown', (e) => {
      if (!this.d.live() || e.repeat) return;
      if (e.code === 'KeyJ') this.attack();
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !this.d.primary?.()) this.attack();
      if (e.code === 'Space') { e.preventDefault(); this.d.player.jump(); }
      if (e.code === 'KeyL' || e.code === 'KeyC') { e.preventDefault(); this.roll(); }
      if (e.code === 'KeyG') this.throwMolotov();
      if (e.code === 'Digit1') this.setStance('HIGH');
      if (e.code === 'Digit2') this.setStance('MID');
      if (e.code === 'Digit3') this.setStance('LOW');
    });
    // Mouse: left = basic attack, right = roll. With the pointer captured LMB strikes on press;
    // uncaptured, a quick click strikes and a press-and-drag still looks around.
    let down: { x: number; y: number; t: number } | null = null;
    d.dom.addEventListener('mousedown', (e) => {
      if (!this.d.live()) return;
      if (e.button === 2) { e.preventDefault(); this.roll(); return; }
      if (e.button !== 0) return;
      if (document.pointerLockElement === d.dom) { if (!this.d.primary?.()) this.attack(); }
      else down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !down) return;
      const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350;
      down = null;
      if (click && this.d.live() && !this.d.primary?.(e.clientX, e.clientY)) this.attack();
    });
    d.dom.addEventListener('wheel', () => {}, { passive: true });
  }

  /** Spawn the placed monsters (stand-ins until Meta Muse's models land). */
  populate(places: Placement[], staging: Staging) {
    this.staging = staging;
    this.addOrb(0xffd8a0);
    preloadMobs(['zombie', 'werewolf', 'ghost', 'vampire', 'wolf', 'unknown']).catch((e) => console.warn('[ravencrest] monsters failed to load', e))
      // Then, a little later and one at a time, everything the encounters stage, so nothing
      // loads, decodes or retargets mid-fight (that was the hitch when a card popped up).
      .then(() => new Promise((r) => setTimeout(r, 3000)))
      .then(async () => {
        for (const k of ['pumpkin', 'stitch', 'miriam', 'robobones'] as MobKind[]) { await preloadMobs([k]).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); }
        await loadGLB(TANK_URL).catch(() => {});
        for (const e of ENCOUNTERS) for (const src of [e.panel, e.portrait]) { const i = new Image(); i.src = src; i.decode?.().catch(() => {}); }
      });
    for (const p of places) this.addMob(new Mob(p.kind, 'enemy', p.pos, p.level, p.yaw ?? Math.random() * 6.28));
  }
  /** Push an ally out of the camera → Jack sightline (he must never block the view of Jack). */
  private clearSightline(m: Mob, cam: THREE.Vector3, p: THREE.Vector3) {
    const mp = m.object.position;
    const seg = p.clone().sub(cam).setY(0), len = seg.length();
    if (len < 0.1) return;
    seg.divideScalar(len);
    const rel = mp.clone().sub(cam).setY(0);
    const t = rel.dot(seg);
    if (t < 0 || t > len + 0.6) return;
    const off = rel.clone().addScaledVector(seg, -t);
    const d = off.length(), clear = 1.6;
    if (d >= clear) return;
    const side = d > 1e-3 ? off.divideScalar(d) : new THREE.Vector3(-seg.z, 0, seg.x);
    mp.addScaledVector(side, clear - d);
  }
  /** Melvin "Pumpkin Patch" Lester joins the fight at Jack's side (the Dracula battle). */
  summonMelvin(ttl = 240) {
    if (this.mobs.some((m) => m.kind === 'pumpkin' && m.team === 'ally' && m.ttl > 0)) return;
    halloweenAudio.playPlasmaBladesAppear();
    const p = this.d.player.object.position;
    const right = new THREE.Vector3(Math.cos(this.d.player.yaw), 0, -Math.sin(this.d.player.yaw));
    const m = this.addMob(new Mob('pumpkin', 'ally', p.clone().addScaledVector(right, -2.5), this.d.level(), this.d.player.yaw));
    m.ttl = ttl;
    this.call('Pumpkin Patch joins the fight!', 2.2, '#fb923c');
    setTimeout(() => this.bark('pumpkin'), 2400);
  }
  /** Whose story it is (the HUD name card). */
  setHeroName(name: string) { const el = this.ui.querySelector('.g-name'); if (el?.firstChild) el.firstChild.textContent = `${name.toUpperCase()} `; }
  /** The tank's hull this frame (roadObstacles.ts smashes the wreckage); true when it hit something. */
  onTankMove?: (pos: THREE.Vector3, dir: THREE.Vector3, speed: number) => boolean;
  /** A troll's blow landed on the deck (bridgeBattle.ts splinters the planks there). */
  onTrollSlam?: (m: Mob) => void;
  /** Move a mob to another level (Dracula follows Jack out of the castle). */
  relocate(m: Mob, level: LevelName, pos: THREE.Vector3) {
    m.object.removeFromParent();
    m.level = level;
    m.object.position.copy(pos);
    m.home.copy(pos);
    this.d.scene(level).add(m.object);
  }
  /** Add a mob from outside (the nightmare's actors, summoned wolves). */
  spawn(m: Mob) { return this.addMob(m); }
  /** A horde is charging (or the tank is answering it). */
  get hordeActive() { return !!this.horde; }
  /** Jack is down (respawn pending). */
  get isDown() { return this.dead > 0; }
  /** Orb light multiplier — in the nightmare's dark the orbs are the light. */
  orbBoost = 1;
  groundAt(l: LevelName, x: number, z: number, y: number) { return this.d.collision(l).groundAt(x, z, y, 12); }
  /** Dark mist puff (Dracula vanishing/forming). */
  smoke(pos: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) this.gore.emit({ pos: pos.clone().add(new THREE.Vector3(this.rnd(0.5), Math.random() * 2, this.rnd(0.5))), vel: new THREE.Vector3(this.rnd(1.2), 0.3 + Math.random(), this.rnd(1.2)), color: new THREE.Color(0.02, 0.015, 0.02), size: 0.35 + Math.random() * 0.4, life: 1 + Math.random() * 0.6, drag: 1.5, grow: 2 });
  }
  /** Dracula's summon: real bats pour out of `from` and attack. */
  releaseBats(from: THREE.Vector3) { this.batSwarmFx.release(from, 22); this.d.sfx.bats(0); }
  /** The curse is lifted: no more monsters — the castle is free to explore. */
  peace = false;
  makePeace() {
    this.peace = true;
    this.scatterBats();
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.team !== 'enemy') continue;
      if (m.alive && m.level === this.d.level()) this.smoke(m.object.position.clone().setY(m.object.position.y + 1), 25);
      m.object.removeFromParent(); m.bar?.remove();
      this.mobs.splice(i, 1);
    }
    this.lock = null;
    this.call('The curse is lifted', 3, '#ffe2a0');
    this.reward('Ravencrest is at peace — explore, and choose a film');
  }
  /** Dracula is gone: his bats burst into ash. */
  scatterBats() { for (const p of this.batSwarmFx.scatter()) this.smoke(p, 4); }
  /** Orb glow scale (the daybreak fades them to soft motes). */
  setOrbGlow(k: number) { this.uOrbGlow.value = 6 * k; for (const o of this.orbs) o.mesh.scale.setScalar(0.5 + 0.5 * k); }
  /** Spiritual energy from an orb into the target: a celestial beam with stardust along it. */
  private beam(from: THREE.Vector3, to: THREE.Vector3) {
    const len = from.distanceTo(to);
    const geo = new THREE.PlaneGeometry(0.22, len);
    const mesh = new THREE.Mesh(geo, this.beamMat);
    mesh.position.copy(from).lerp(to, 0.5);
    // Plane's +Y along the beam; face it toward the camera around that axis.
    const dir = to.clone().sub(from).normalize();
    const toCam = this.d.camera.position.clone().sub(mesh.position);
    const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
    const normal = new THREE.Vector3().crossVectors(side, dir).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, dir, normal));
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    this.d.scene(this.d.level()).add(mesh);
    this.beams.push({ mesh, t: 0 });
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Color().setHSL(0.68 + Math.random() * 0.24, 0.8, 0.72).multiplyScalar(2);
      this.glow.emit({ pos: from.clone().lerp(to, Math.random()), vel: new THREE.Vector3(this.rnd(0.8), this.rnd(0.8), this.rnd(0.8)), color: c, size: 0.05, life: 0.5 + Math.random() * 0.4, drag: 1.5 });
    }
  }
  // ── Voice barks: the Pumpkin Patch cast say a line from the film as they come into frame ──
  private voiceLines: { id: string; kind: string; text: string; url: string }[] = [];
  private lastBark = new Map<string, number>();
  private barkColor: Record<string, string> = { pumpkin: '#fb923c', miriam: '#7ad08a', stitch: '#eab308', robobones: '#38bdf8' };
  /** A line from `kind` (a specific one with `id`); each character speaks at most every 8 s. */
  bark(kind: string, id?: string, force = false) {
    const now = performance.now();
    if (!force && (this.lastBark.get(kind) ?? -1e9) > now - 8000) return;
    const pool = this.voiceLines.filter((v) => v.kind === kind && (!id || v.id === id));
    if (!pool.length) return;
    const v = pool[Math.floor(Math.random() * pool.length)];
    this.lastBark.set(kind, now);
    this.d.sfx.voice(v.url, 0, 1.15);
    this.call(`“${v.text}”`, Math.max(2.4, v.text.length * 0.065), this.barkColor[kind] ?? '#f4ead8');
  }
  /** Splat the lens (bridge battle slams, the nightmare). */
  lensHit(kind: 'blood' | 'dirt', amount = 0.5) { this.d.lens.hit(kind, amount); }
  /** Additive light motes and sparks (effects owned by other modules). */
  sparkle(e: Emit) { this.glow.emit(e); }
  /** Opaque particles: splinters, spray, smoke. */
  debris(e: Emit) { this.gore.emit(e); }
  /** A short-lived light at `pos`. */
  flashAt(pos: THREE.Vector3, color: number, intensity: number) { this.flash(pos, color, intensity); }
  /** One frame of a bat swarm in flight around `pos`. */
  batSwarm(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) this.gore.emit({ pos: pos.clone().add(new THREE.Vector3(this.rnd(0.8), this.rnd(0.5), this.rnd(0.8))), vel: new THREE.Vector3(this.rnd(3), this.rnd(2), this.rnd(3)), color: new THREE.Color(0.01, 0.01, 0.012), size: 0.12, life: 0.25 });
  }
  private addMob(m: Mob) {
    this.mobs.push(m);
    this.d.scene(m.level as LevelName).add(m.object);
    return m;
  }

  // ── Input actions ──────────────────────────────────────────────────────────
  setStance(s: Stance) {
    this.stance = s;
    for (const k of Object.keys(this.stanceEls) as Stance[]) this.stanceEls[k].classList.toggle('on', k === s);
    this.chainStep = 0;
  }

  /** Damage multiplier: +5% per defeat (cap ×3) and +4% per streak kill (cap +40%). */
  get power() { return Math.min(3, 1 + this.kills * 0.05) * (1 + Math.min(this.streak, 10) * 0.04); }
  /** Simulation speed (hit-stop freezes the action for a few frames on impact). */
  get timeScale() { return this.hitStop > 0 ? 0.06 : 1; }
  /** The foe the current combo is locked onto (kept until it dies or you break off). */
  private lock: Mob | null = null;
  private lastHitKind: MobKind = 'zombie';
  private comboHits = 0;

  attack() {
    const jack = this.d.jack();
    if (!jack || this.dead > 0 || this.pendingThrow !== null) return;
    // Buffer the press: the next cut starts at the current one's cancel point.
    if (this.swing) { if (this.swing.t > this.swing.dur * 0.12) this.queued = true; return; }
    if (this.sinceSwing > 0.55) { this.chainStep = 0; this.comboHits = 0; }
    this.startSwing();
  }

  private startSwing() {
    const jack = this.d.jack()!;
    const str = HERO_STRING[jack.hero] ?? STRING;
    const move = this.chainStep === 0 ? OPENER[this.stance] : str[(this.chainStep - 1) % str.length];
    const dur = jack.act(move, move === 'kata' ? SWING_SPEED * 1.1 : SWING_SPEED);
    if (move === 'flipCleave' || move === 'flipKick') this.d.player.impulse(this.facing(), move === 'flipCleave' ? 4.5 : -2.5, dur * 0.6, false);
    this.swing = { move, t: 0, dur, hits: 0 };
    this.queued = false;
    this.chainStep++;
    // Smart target: nearest foe weighted toward where the stick/camera points; close the gap.
    const p = this.d.player.object.position;
    // Combo lock: keep the same foe while it lives and stays near; otherwise pick a new one.
    if (!this.lock || !this.lock.alive || this.lock.level !== this.d.level() || this.lock.object.position.distanceTo(p) > 7) this.lock = this.pickTarget(7);
    const target = this.lock;
    if (target) {
      const to = target.object.position.clone().sub(p).setY(0);
      this.d.player.faceYaw(Math.atan2(to.x, to.z), 1);
      const gap = to.length() - 1.15;
      if (gap > 0.1) this.d.player.impulse(to, Math.min(16, gap / 0.15), 0.15, false);
    } else this.d.player.impulse(this.facing(), 2.4, 0.1);
    this.d.player.speedScale = 0.55;
    this.d.sfx.swing(move === 'kata' || move === 'cleave');
  }

  /** Best foe to cut: close, and in the direction the player is steering (or looking). */
  private pickTarget(range: number): Mob | null {
    const p = this.d.player.object.position;
    const input = this.d.player.inputDir();
    const want = input.lengthSq() ? input : new THREE.Vector3(-Math.sin(this.d.player.camYaw), 0, -Math.cos(this.d.player.camYaw));
    let best: Mob | null = null, bs = Infinity;
    for (const m of this.mobs) {
      if (m.team !== 'enemy' || !m.alive || !m.ready || m.level !== this.d.level()) continue;
      const to = m.object.position.clone().sub(p);
      if (Math.abs(to.y) > 2.5) continue;
      to.setY(0);
      const d = to.length();
      if (d > range) continue;
      const score = d + to.normalize().angleTo(want) * 1.6;
      if (score < bs) { bs = score; best = m; }
    }
    return best;
  }

  /** Combat roll: a dash with i-frames while Jack tumbles forward through it. */
  roll() {
    if (this.dashCd > 0 || this.dead > 0) return;
    // Rolling cancels a swing (or a throw wind-up) at any point.
    if (this.swing || this.pendingThrow !== null) { this.d.jack()?.cancel(); this.swing = null; this.pendingThrow = null; this.queued = false; }
    this.rollT = 0;
    const dir = this.d.player.inputDir();
    this.d.player.impulse(dir.lengthSq() ? dir : this.facing(), 8.5, ROLL_TIME * 0.85);
    // Orbit camera: face the roll. Follow camera: keep facing (a sidestep roll), camera stays put.
    if (dir.lengthSq() && !this.d.player.followCam) this.d.player.faceYaw(Math.atan2(dir.x, dir.z), 1);
    this.invuln = ROLL_TIME;
    this.dashCd = 0.55;
    this.d.sfx.roll();
  }

  throwMolotov() {
    const jack = this.d.jack();
    if (!jack || this.molotovs <= 0 || this.swing || this.pendingThrow !== null || this.dead > 0) return;
    this.molotovs--;
    const target = this.nearestEnemy(this.d.player.object.position, 14, this.facing(), 1.2);
    if (target) {
      const to = target.object.position.clone().sub(this.d.player.object.position);
      this.d.player.faceYaw(Math.atan2(to.x, to.z), 1);
    }
    const dur = jack.act('throw', 1.2);
    this.pendingThrow = dur * 0.5;
    this.d.player.speedScale = 0.3;
    this.updateHud();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private facing() { const y = this.d.player.yaw; return new THREE.Vector3(Math.sin(y), 0, Math.cos(y)); }
  private nearestEnemy(from: THREE.Vector3, range: number, dir?: THREE.Vector3, halfArc = Math.PI): Mob | null {
    let best: Mob | null = null, bd = range;
    const lvl = this.d.level();
    for (const m of this.mobs) {
      if (m.team !== 'enemy' || !m.alive || !m.ready || m.level !== lvl) continue;
      const to = m.object.position.clone().sub(from);
      if (Math.abs(to.y) > 2.5) continue;
      to.setY(0);
      const dist = to.length();
      if (dist > bd) continue;
      if (dir && dist > 0.8 && to.normalize().angleTo(dir) > halfArc) continue;
      bd = dist; best = m;
    }
    return best;
  }

  private strikeFromPlayer(h: { dmg: number; reach: number; arc: number }, finisher: boolean, knock = 0) {
    const p = this.d.player.object.position;
    const f = this.facing();
    const pw = this.power;
    let hit = false, killed = false;
    for (const m of this.mobs) {
      if (m.team !== 'enemy' || !m.alive || !m.ready || m.level !== this.d.level()) continue;
      const to = m.object.position.clone().sub(p);
      if (Math.abs(to.y) > 2) continue;
      to.setY(0);
      const dist = to.length();
      const reach = h.reach * (1 + (pw - 1) * 0.15) + 0.4;
      const locked = m === this.lock && dist < reach + 0.8;
      if (!locked && (dist > reach || (dist > 0.6 && to.normalize().angleTo(f) > h.arc / 2 + 0.35))) continue;
      // On guard, some monsters turn the blade aside or slip out of its path (finishers can't be
      // read: they always land). A deflect staggers Jack and the monster answers at once.
      const g = KINDS[m.kind].guard;
      if (g && !finisher && m.guarding) {
        const r = Math.random();
        if (r < g.deflect) {
          m.deflect(p);
          halloweenAudio.playParryClangSfx();
          for (let i = 0; i < 14; i++) this.glow.emit({ pos: m.object.position.clone().setY(m.object.position.y + 1.3).addScaledVector(f, -0.4), vel: new THREE.Vector3(this.rnd(3), Math.random() * 3, this.rnd(3)), color: new THREE.Color(3, 2.2, 1), size: 0.04, life: 0.35, gravity: 6 });
          this.d.player.impulse(f.clone().negate(), 3.5, 0.14, false);
          this.hitStop = Math.max(this.hitStop, 0.06);
          this.call('Deflected!', 0.6, '#c8d6ff');
          continue;
        }
        if (r < g.deflect + g.evade) {
          m.dodge(p);
          this.smoke(m.object.position.clone().setY(m.object.position.y + 0.6), 6);
          this.call('Evaded', 0.5, '#9fb6c8');
          continue;
        }
      }
      const weak = WEAK[this.stance].includes(m.kind);
      let hide = 1;
      if (m.armor > 0) {
        const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
        const front = p.clone().sub(m.object.position).setY(0).normalize().dot(fwd);
        if (m.exposed > 0) { hide = 1.5; if (Math.random() < 0.3) this.call('It\'s stuck — strike!', 0.6, '#ffd27a'); }
        else if (front < -0.2) { hide = 1.35; if (Math.random() < 0.3) this.call('Behind its guard!', 0.6, '#ffd27a'); }
        else { hide = 1 - m.armor; if (Math.random() < 0.15) this.call('Its hide turns the blade', 0.6, '#c8d6ff'); }
      }
      const dmg = Math.round(h.dmg * (1 + (this.lvl - 1) * 0.1) * pw * (weak ? 1.5 : 1) * (finisher ? 1.3 : 1) * hide);
      hit = true;
      if (weak && !finisher && Math.random() < 0.35) this.call('Weak point!', 0.6, '#ffd27a');
      this.sparks(m, pw);
      this.lastHitKind = m.kind;
      if (m.damage(dmg, p)) { this.onKill(m); killed = true; }
      else if (knock && m.kind !== 'troll' && m.kind !== 'dracula' && m.kind !== 'unknown') m.vel.addScaledVector(to.clone().setY(0).normalize(), knock);
      else if (dist < 2.2 && !KINDS[m.kind].ghostly && Math.random() < 0.3) this.d.lens.hit('blood', 0.2);
    }
    // Slashes through the bat swarm cut bats down.
    const cutBats = this.batSwarmFx.cut(p, f, h.reach + 0.6, h.arc / 2 + 0.35, (bp) => {
      for (let i = 0; i < 8; i++) this.gore.emit({ pos: bp, vel: new THREE.Vector3(this.rnd(2), Math.random() * 2, this.rnd(2)), color: new THREE.Color(0x3a0606), size: 0.05, life: 0.7, gravity: 9.8 });
      for (let i = 0; i < 5; i++) this.glow.emit({ pos: bp, vel: new THREE.Vector3(this.rnd(2), this.rnd(2), this.rnd(2)), color: this.heat().multiplyScalar(2), size: 0.04, life: 0.25, drag: 2 });
    });
    if (cutBats) { this.d.sfx.hit('wolf', false, pw); this.xp += cutBats * 2; this.d.player.kick = Math.min(1.5, this.d.player.kick + 0.3); if (cutBats > 2) this.call(`${cutBats} bats cut down`, 0.8, '#ffd27a'); this.updateHud(); }
    if (hit) {
      this.d.player.kick = Math.min(1.5, this.d.player.kick + (killed ? 1 : 0.6));
      // Combo comic: every landed hit is a panel; the third hit of a combo (or a finishing kill)
      // pops the three-panel strip. The camera stays on the fight.
      this.comboHits++;
      this.d.comic.hit(finisher ? 'FINISHER!' : killed ? 'K.O.!' : undefined);
      // The combo strip is a flourish for ordinary fights, never over a game event (horde, tank,
      // the bridge battle, the nightmare).
      if ((this.comboHits >= 3 || (finisher && killed)) && !this.horde && !this.d.eventActive()) { this.d.comic.show(killed ? 'K.O.!' : 'COMBO!'); this.comboHits = 0; }
      this.d.sfx.hit(this.lastHitKind, finisher, this.power, killed);
      this.d.player.shake = Math.max(this.d.player.shake, killed ? 0.22 : 0.1);
      this.hitStop = Math.max(this.hitStop, killed ? 0.09 : 0.045);
    }
  }

  private onKill(m: Mob) {
    const k = KINDS[m.kind];
    // Cut down at arm's length: it sprays the lens (ectoplasm and ash don't).
    if (!k.ghostly && k.death !== 'ash' && m.object.position.distanceTo(this.d.player.object.position) < 3.2) this.d.lens.hit('blood', 0.55);
    this.kills++;
    this.streak++;
    this.streakT = 6;
    this.defeatFx(m);
    this.powerCheck();
    // Every fifth defeat, a freed soul joins as a helper orb (up to five).
    if (this.kills % 5 === 0 && this.orbs.length < 5) {
      this.addOrb(KINDS[m.kind].fx ?? 0xbfe8ff);
      this.reward('A freed soul joins you as a guiding light');
    }
    if (!k.xp) { this.updateHud(); return; }
    this.xp += k.xp;
    this.reward(`+${k.xp} XP — ${k.label} destroyed${this.streak > 1 ? `  ·  ${this.streak} streak` : ''}`);
    let need = this.xpNeed();
    while (this.xp >= need) {
      this.xp -= need;
      this.lvl++;
      this.maxHp += 15;
      this.hp = this.maxHp;
      this.molotovs = 3;
      this.call(`LEVEL ${this.lvl}`, 2, '#ffb15a');
      this.d.sfx.levelUp();
      this.reward(`Level ${this.lvl}: +15 max HP, molotovs refilled`);
      this.rings.spawn(this.d.player.object.position, 5, 0xffb15a, 0.8);
      need = this.xpNeed();
    }
    this.updateHud();
  }

  // ── Power: every defeat makes the blade hit harder (and burn hotter) ─────────
  private static TIERS: [number, string][] = [[1.25, 'Blade awakens'], [1.5, 'Ember edge'], [2, 'Inferno edge'], [2.5, 'Hellfire'], [3, 'Wrath of the Pumpkin King']];
  private powerCheck() {
    const base = Math.min(3, 1 + this.kills * 0.05);
    const tier = Game.TIERS.filter(([v]) => base >= v).length;
    if (tier > this.lastPowerTier) {
      this.lastPowerTier = tier;
      this.call(Game.TIERS[tier - 1][1], 2, '#ff9a3a');
      this.rings.spawn(this.d.player.object.position, 4 + tier, 0xff7a2a, 0.9);
      this.d.sfx.powerUp(tier);
    }
  }
  /** Blade heat colour for the current power: steel blue → ember → white-hot. */
  private heat(out = new THREE.Color()) {
    const k = THREE.MathUtils.clamp((this.power - 1) / 2, 0, 1);
    return k < 0.5 ? out.setRGB(0.75, 0.85, 1).lerp(new THREE.Color(1, 0.45, 0.1), k * 2) : out.setRGB(1, 0.45, 0.1).lerp(new THREE.Color(1, 0.95, 0.8), (k - 0.5) * 2);
  }

  // ── Impact and defeat effects ───────────────────────────────────────────────
  private rnd(s = 1) { return (Math.random() - 0.5) * 2 * s; }
  private sparks(m: Mob, pw: number) {
    const at = m.object.position.clone().setY(m.object.position.y + KINDS[m.kind].height * 0.6);
    const ghost = m.kind === 'ghost';
    const col = ghost ? new THREE.Color(0.5, 2.2, 1.6) : this.heat().multiplyScalar(2.5);
    for (let i = 0; i < 8 + 6 * pw; i++) {
      this.glow.emit({ pos: at, vel: new THREE.Vector3(this.rnd(4), Math.random() * 4, this.rnd(4)), color: col, size: 0.06, life: 0.25 + Math.random() * 0.2, gravity: 9, drag: 2 });
    }
    if (!ghost) {
      const blood = new THREE.Color(KINDS[m.kind].fx ?? 0x5a0808);
      for (let i = 0; i < 6 + 3 * pw; i++) this.gore.emit({ pos: at, vel: new THREE.Vector3(this.rnd(2.5), 1 + Math.random() * 2.5, this.rnd(2.5)), color: blood, size: 0.07, life: 0.9, gravity: 9.8, drag: 0.5 });
    }
  }
  private flash(pos: THREE.Vector3, color: number, intensity: number) {
    if (FxBudget.scale < 0.6 && this.flashes.length >= 3) return;
    const lvl = this.d.level();
    this.flashes.push({ v: this.d.pool(lvl).addTransient(pos, color, intensity, 12), t: 0, level: lvl, i: intensity });
  }

  /** Each monster dies its own way; size scales with the blade's power. */
  private defeatFx(m: Mob) {
    const k = KINDS[m.kind];
    const pw = this.power;
    const p = m.object.position.clone();
    const mid = p.clone().setY(p.y + k.height * 0.55);
    const away = p.clone().sub(this.d.player.object.position).setY(0).normalize();
    const lvl = m.level as LevelName;
    this.rings.spawn(p, 2.2 + pw, k.fx ?? 0xffffff, 0.55);
    this.flash(mid, k.death === 'ecto' ? 0x7dffc8 : 0xff8a3a, 30 + 25 * pw);
    // Embers for everyone, more with power.
    const ember = this.heat().multiplyScalar(3);
    for (let i = 0; i < 20 + 25 * pw; i++) this.glow.emit({ pos: mid, vel: new THREE.Vector3(this.rnd(5), 1 + Math.random() * 5, this.rnd(5)).addScaledVector(away, 2), color: ember, size: 0.05 + Math.random() * 0.05, life: 0.5 + Math.random() * 0.6, gravity: 6, drag: 1.5 });
    const body = m.body;
    if (!body) return;
    if (k.death === 'ecto') {
      // Ectoplasm vortex: a green-white column spun up around the ghost as it boils away.
      this.d.sfx.ectoDeath();
      for (let i = 0; i < 90 + 40 * pw; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.7;
        const c = new THREE.Color(0x7dffc8).lerp(new THREE.Color(0xe8fff4), Math.random() * 0.6).multiplyScalar(1.6);
        this.glow.emit({ pos: new THREE.Vector3(p.x + Math.cos(a) * r, p.y + Math.random() * k.height, p.z + Math.sin(a) * r), vel: new THREE.Vector3(0, 0.8 + Math.random() * 2.2, 0), color: c, size: 0.08 + Math.random() * 0.12, life: 1 + Math.random() * 0.9, swirl: 4 + Math.random() * 5, cx: p.x, cz: p.z, grow: 1.5, drag: 0.4 });
      }
      return;
    }
    if (k.death === 'sink' && m.kind === 'wolf') this.d.sfx.yelp();
    if (k.death === 'ash') {
      this.d.sfx.ashDeath(m.kind === 'unknown');
      // Vampire / the Unknown: the body crumbles to grey ash and cinders that drift up.
      for (let i = 0; i < 90 + 40 * pw; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
        const grey = 0.18 + Math.random() * 0.25;
        this.gore.emit({ pos: new THREE.Vector3(p.x + Math.cos(a) * r, p.y + Math.random() * k.height, p.z + Math.sin(a) * r), vel: new THREE.Vector3(this.rnd(0.6), 0.4 + Math.random() * 1.4, this.rnd(0.6)), color: new THREE.Color(grey, grey * 0.95, grey * 0.9), size: 0.05 + Math.random() * 0.08, life: 1.6 + Math.random(), drag: 1.2, swirl: this.rnd(1.5), cx: p.x, cz: p.z });
      }
      const cinder = new THREE.Color(k.fx ?? 0x8a1010).multiplyScalar(4);
      for (let i = 0; i < 30; i++) this.glow.emit({ pos: mid, vel: new THREE.Vector3(this.rnd(1.5), 1 + Math.random() * 2, this.rnd(1.5)), color: cinder, size: 0.04, life: 1.2, drag: 1 });
      return;
    }
    if (k.death === 'apart' || k.death === 'behead') {
      m.bodyGone = true;
      const P = k.skel === 'mixamo' ? PARTS_MIXAMO : PARTS17;
      const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      const spin = (s: number) => v(this.rnd(s), this.rnd(s), this.rnd(s));
      const push = away.clone().multiplyScalar(1.5 + pw);
      const parts = k.death === 'behead'
        ? [
          { bones: P.head, vel: v(0, 5 + pw, 0).add(push.clone().multiplyScalar(1.6)), spin: spin(14), stump: 'Neck' },
          { bones: [...P.torso, ...P.armL, ...P.armR, ...P.legL, ...P.legR], vel: push.clone().multiplyScalar(0.4).setY(1), spin: new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(-2.6), stump: 'Neck' },
        ]
        : Object.entries(P).map(([name, bones]) => {
          const out = name === 'torso' ? v(0, 2, 0) : name === 'head' ? v(0, 4.5, 0) : v(this.rnd(2.5), 2.5 + Math.random() * 2.5, this.rnd(2.5));
          return { bones, vel: out.add(push.clone().multiplyScalar(name === 'torso' ? 0.3 : 0.8)), spin: spin(name === 'torso' ? 2 : 9) };
        });
      const d = new Dismember(body, parts);
      this.d.scene(lvl).add(d.group);
      this.bodies.push({ d, level: lvl, bleed: k.death === 'behead' ? 1.8 : 0.6, color: new THREE.Color(k.fx ?? 0x5a0808) });
      body.visible = false;
      // Burst at the break: rotten gore for zombies, straw for Stitch, blood for the werewolf.
      const straw = m.kind === 'stitch';
      const c = new THREE.Color(k.fx ?? 0x5a0808);
      for (let i = 0; i < 40 + 20 * pw; i++) this.gore.emit({ pos: mid, vel: new THREE.Vector3(this.rnd(4), 1 + Math.random() * 4, this.rnd(4)).add(push), color: straw ? c.clone().offsetHSL(0, 0, this.rnd(0.12)) : c, size: straw ? 0.12 : 0.08 + Math.random() * 0.08, life: 1.6 + Math.random(), gravity: straw ? 3 : 9.8, drag: straw ? 2.5 : 0.4 });
      if (k.death === 'apart') this.d.sfx.burst(m.kind === 'stitch');
      if (k.death === 'behead') this.d.sfx.behead();
    }
  }

  private xpNeed() { return 80 + 60 * (this.lvl - 1); }

  hurtPlayer(n: number, from: THREE.Vector3) {
    if (this.invuln > 0 || this.dead > 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.invuln = 0.5;
    this.d.player.shake = 0.35;
    this.d.player.flinch();
    this.d.lens.hit('blood', Math.min(1, n / 28));
    const away = this.d.player.object.position.clone().sub(from).setY(0);
    if (away.lengthSq() > 1e-4) this.d.player.impulse(away, 5, 0.12, false); // knocked back, still facing the foe
    this.vignette.style.opacity = '0.85';
    this.d.sfx.hurt(n >= 15);
    if (this.hp <= 0) {
      this.dead = 2.2;
      this.call('The castle claims you… rising again', 2.2, '#ff6b5a');
    }
    this.updateHud();
  }

  // ── Molotov ───────────────────────────────────────────────────────────────
  private releaseBottle() {
    const lvl = this.d.level();
    const p = this.d.player.object.position;
    const start = p.clone().add(new THREE.Vector3(0, 1.7, 0)).addScaledVector(this.facing(), 0.4);
    const target = this.nearestEnemy(p, 14, this.facing(), 1.2)?.object.position.clone() ?? p.clone().addScaledVector(this.facing(), 9);
    const T = 0.85;
    const v = target.clone().sub(start).divideScalar(T);
    v.y += 0.5 * 18 * T;
    const bottle = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 8), new THREE.MeshStandardNodeMaterial({ color: 0x2a6a32, roughness: 0.15, metalness: 0.1 }));
    const rag = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(5) }));
    rag.position.y = 0.15;
    bottle.add(glass, rag);
    bottle.position.copy(start);
    this.d.scene(lvl).add(bottle);
    this.bottles.push({ mesh: bottle, v, t: 0, level: lvl });
  }

  private ignite(pos: THREE.Vector3, level: LevelName) {
    this.d.sfx.molotov();
    const group = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = i === 0 ? 0 : 0.6 + Math.random() * 1.6;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), this.fireMat);
      f.position.set(pos.x + Math.cos(a) * r, pos.y + 0.7, pos.z + Math.sin(a) * r);
      f.scale.setScalar(0.8 + Math.random() * 0.7);
      group.add(f);
    }
    this.d.scene(level).add(group);
    const light = this.d.pool(level).addTransient(pos.clone().setY(pos.y + 1.2), 0xff7a2a, 90, 14);
    this.fires.push({ group, pos: pos.clone(), t: 0, level, light });
    for (const m of this.mobs) if (m.team === 'enemy' && m.alive && m.level === level && m.object.position.distanceTo(pos) < 3.4) { if (m.damage(35, pos)) this.onKill(m); }
  }

  // ── Encounters ────────────────────────────────────────────────────────────
  /** Fire an encounter once (main.ts decides where each triggers). */
  encounter(id: string) {
    if (this.fired.has(id) || !this.staging) return;
    const e = ENCOUNTERS.find((x) => x.id === id);
    if (!e) return;
    // Never a Pumpkin Patch scene card over a game event (the nightmare, the bridge battle, a horde):
    // proximity encounters wait until it's over; the tank rescue plays without its card.
    const busy = this.d.eventActive() || !!this.horde;
    if (busy && e.stage !== 'tank') return;
    this.fired.add(id);
    if (!busy) this.showComic(e);
    const S = this.staging;
    const p = this.d.player.object.position;
    switch (e.stage) {
      case 'tank': break;                     // the horde event drives the tank (startTankRescue)
      case 'miriam': {
        halloweenAudio.playWitchLaughAndMonkeys();
        setTimeout(() => this.bark('miriam'), 1600);
        const m = this.addMob(new Mob('miriam', 'npc', S.miriam.pos, 'outside', S.miriam.yaw));
        m.ttl = 90;
        this.witchExit = { m, t: -1, broom: null, from: new THREE.Vector3(), dir: new THREE.Vector3() };
        break;
      }
      case 'blades': {
        halloweenAudio.playPlasmaBladesAppear();
        setTimeout(() => this.bark('pumpkin', 'melvin_all_the_way'), 900);
        const at = p.clone().addScaledVector(this.facing(), -1.5).add(new THREE.Vector3(1.4, 0, 0));
        const m = this.addMob(new Mob('pumpkin', 'ally', at, this.d.level(), this.d.player.yaw));
        m.ttl = 75;
        break;
      }
      case 'stitch': if (this.peace) break; this.addMob(new Mob('stitch', 'enemy', S.stitch.pos, 'outside', S.stitch.yaw)); halloweenAudio.playGhostScreamSfx(); setTimeout(() => this.bark('stitch', 'stitch_gorgeous'), 1200); break;
      case 'crane': { const m = this.addMob(new Mob('robobones', 'npc', S.crane.pos, 'hall', S.crane.yaw)); m.ttl = 40; setTimeout(() => this.bark('robobones', 'crane_name'), 1200); break; }
      case 'boo': this.summonBoo(); break;
    }
  }
  private runTank(from: THREE.Vector3, to: THREE.Vector3, speed = 9) {
    halloweenAudio.playTankArrivalSfx();
    // The war-rig built from the tank sheet (buildCast.py); the old primitive tank if it's missing.
    loadGLB(TANK_URL).catch(() => loadGLB('/models/halloween/pumpkin_patch_tank.glb').then((o) => { o.scene.userData.oldTank = true; return o; })).then((g) => {
      const obj = g.scene.clone(true);
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      obj.userData.dynamic = true;
      obj.scale.setScalar(g.scene.userData.oldTank ? 1.1 : 1);
      obj.position.copy(from);
      this.d.scene('outside').add(obj);
      this.tank = { obj, t: 0, from, to, shot: 0.6, speed };
    }).catch(() => {});
  }

  // ── Horde + tank rescue ─────────────────────────────────────────────────────
  private roadV(p: THREE.Vector3) {
    const R = this.staging!.road;
    const along = new THREE.Vector3(Math.sin(R.yawAlong), 0, Math.cos(R.yawAlong));
    return p.clone().sub(R.fromLocal(0, 0)).dot(along);
  }
  private updateHorde(dt: number) {
    const R = this.staging?.road;
    if (!R) return;
    const p = this.d.player.object.position;
    if (!this.horde) {
      if (this.peace || this.d.eventActive() || this.d.level() !== 'outside' || this.dead > 0) return;
      this.hordeCd -= dt;
      const v = this.roadV(p);
      if (this.hordeCd <= 0 && v > R.vStart + 15 && v < -15) this.startHorde(v);
      return;
    }
    const H = this.horde;
    H.t += dt;
    if (H.phase === 'charge') {
      const near = H.mobs.some((m) => m.alive && m.object.position.distanceTo(p) < 9);
      if (near || H.t > 6) this.startTankRescue();
    } else {
      this.tankCutscene(dt);
      H.laugh -= dt;
      if (H.laugh <= 0) { H.laugh = 1.4 + Math.random(); this.d.sfx.laugh(0, 6, Math.random() < 0.5 ? 1.35 : 2.1); } // Melvin, then Lil' Boo
      if (!this.tank && H.t > 1) {
        // Back to the player: the regular enemies take over; the next horde is 2 minutes off.
        for (const m of H.mobs) if (m.alive) { m.damage(999, p); this.onKill(m); }
        this.d.player.cinematic = false; this.d.player.enabled = true;
        this.horde = null; this.hordeCd = 120;
      }
    }
  }
  private startHorde(v: number) {
    const R = this.staging!.road;
    const kinds: MobKind[] = ['zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'wolf', 'wolf', 'wolf', 'werewolf', 'werewolf', 'vampire', 'vampire'];
    const mobs: Mob[] = [];
    kinds.forEach((k, i) => {
      const u = R.uL + 0.8 + Math.random() * (R.uR - R.uL - 1.6), vv = Math.min(-2, v + 24 + (i % 4) * 2.5 + Math.random() * 6);
      const m = this.addMob(new Mob(k, 'enemy', R.fromLocal(u, vv, Math.max(0.05, R.heightAt(u, vv))), 'outside', R.yawAlong + Math.PI));
      m.aggroMul = 4; m.horde = true;
      mobs.push(m);
    });
    this.horde = { phase: 'charge', t: 0, mobs, side: new THREE.Vector3(), laugh: 0 };
    this.call('A horde floods the road!', 2, '#ff6b5a');
    this.d.sfx.laugh(0, 18, 0.85);
    halloweenAudio.playGhostScreamSfx();
  }
  private startTankRescue() {
    const R = this.staging!.road, H = this.horde!;
    const p = this.d.player.object.position, v = this.roadV(p);
    const uMid = (R.uL + R.uR) / 2;
    // Jack dives for the roadside...
    const along = new THREE.Vector3(Math.sin(R.yawAlong), 0, Math.cos(R.yawAlong));
    const right = new THREE.Vector3(-along.z, 0, along.x);
    const u = p.clone().sub(R.fromLocal(0, 0)).dot(right);
    H.side.copy(right).multiplyScalar(u > uMid ? 1 : -1);
    this.d.player.faceYaw(Math.atan2(H.side.x, H.side.z), 1);
    this.d.player.impulse(H.side, 8.5, 0.42, false);
    this.rollT = 0; this.invuln = 3;
    // ...as Pumpkin Patch and Lil' Boo come roaring up the road behind him, straight through the horde.
    this.runTank(R.fromLocal(uMid, Math.max(R.vStart + 3, v - 34), 0), R.fromLocal(uMid, Math.min(-2, v + 55), 0), 12);
    this.encounter('pumpkin_patch_tank');
    setTimeout(() => this.bark('pumpkin', 'melvin_trick'), 1800);
    H.phase = 'tank'; H.t = 0;
    this.d.player.cinematic = true; this.d.player.enabled = false;
  }
  /** Real-time cutscene while the tank plows the horde: low roadside, tracking, then wide. */
  private tankCutscene(dt: number) {
    const T = this.tank, cam = this.d.camera, H = this.horde!;
    if (!T) return;
    const tp = T.obj.position;
    const dir = T.to.clone().sub(T.from).setY(0).normalize();
    const side = H.side.clone().negate();
    let at: THREE.Vector3, look: THREE.Vector3;
    if (H.t < 2.2) {            // over Jack's shoulder in the ditch, the tank bearing down the road
      const jp = this.d.player.object.position;
      at = jp.clone().addScaledVector(H.side, 1.6).addScaledVector(dir, 1.5).setY(jp.y + 1.3);
      look = tp.clone().setY(tp.y + 1.6);
    } else if (H.t < 5.2) {     // tracking alongside as it ploughs through
      at = tp.clone().addScaledVector(side, 9).addScaledVector(dir, 2).setY(tp.y + 3);
      look = tp.clone().addScaledVector(dir, 4).setY(tp.y + 1.2);
    } else {                    // wide, from behind the carnage
      at = tp.clone().addScaledVector(dir, -12).addScaledVector(side, 3).setY(tp.y + 5);
      look = tp.clone().addScaledVector(dir, 6);
    }
    cam.position.lerp(at, 1 - Math.exp(-dt * (H.t < 2.2 ? 20 : 5)));
    cam.lookAt(look);
    cam.fov = 48; cam.updateProjectionMatrix();
  }
  private summonBoo() {
    halloweenAudio.playGhostScreamSfx();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xc7b8ff).multiplyScalar(4), transparent: true, opacity: 0.85 }));
    m.userData.dynamic = true;
    this.boo = m;
  }

  private showComic(e: Encounter) {
    this.comicEnc = e;
    const q = <T extends Element>(s: string) => this.comic.querySelector(s) as T;
    q<HTMLImageElement>('.cm-panel').src = e.panel;
    q<HTMLImageElement>('.cm-portrait').src = e.portrait;
    q<HTMLElement>('.cm-title').textContent = e.title;
    q<HTMLElement>('.cm-sub').textContent = e.subtitle;
    q<HTMLElement>('.cm-quote').textContent = e.quote;
    q<HTMLElement>('.cm-sfx').textContent = e.sfx;
    q<HTMLElement>('.cm-scene').textContent = `Pumpkin Patch · ${e.scene} · ${e.timecode}`;
    this.comic.style.setProperty('--accent', e.color);
    this.comic.classList.add('on');
    this.comicT = 7;
  }
  private closeComic() { this.comic.classList.remove('on'); this.comicEnc = null; }

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update(dt: number, mode: string) {
    const lvl = this.d.level();
    // Skinned meshes skip three's frustum culling (their bind-pose bounds lie), so cull here:
    // ~4 draws per mob is real CPU on the iGPU baseline.
    const cam = this.d.camera;
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const m of this.mobs) {
      let vis = mode !== 'ref' && m.level === lvl && (m.alive || m.fading);
      if (vis) {
        // Generous bounds sized to the creature: mocap lunges and leaps carry the body well off its
        // anchor, and a monster that vanishes on screen is far worse than one extra draw.
        const h = KINDS[m.kind].height;
        this.sphere.center.copy(m.object.position).setY(m.object.position.y + h * 0.5);
        this.sphere.radius = h * 0.75 + 1.5;
        vis = this.sphere.center.distanceTo(cam.position) < tuning.cullDist + 10 && this.frustum.intersectsSphere(this.sphere);
      }
      m.object.visible = vis;
    }
    for (const o of this.orbs) o.mesh.visible = mode !== 'ref';
    if (mode !== 'play') { this.updateFx(dt, lvl); return; }
    const player = this.d.player;
    const p = player.object.position;
    const jack = this.d.jack();
    const realDt = dt;
    // Hit-stop: the fight freezes for a few frames on impact (effects keep running).
    this.hitStop -= realDt;
    dt *= this.timeScale;
    this.invuln -= dt; this.dashCd -= dt;
    this.streakT -= dt;
    if (this.streakT <= 0 && this.streak) { this.streak = 0; this.updateHud(); }
    // Roll: tumble the body one full turn about a pivot at hip height, tucked mid-roll.
    if (jack) {
      const r = jack.root;
      if (this.rollT >= 0) {
        this.rollT += dt;
        const k = Math.min(1, this.rollT / ROLL_TIME);
        const a = (k * k * (3 - 2 * k)) * Math.PI * 2, h = 0.55;
        r.rotation.x = a;
        r.position.set(0, h - h * Math.cos(a), -h * Math.sin(a));
        r.scale.set(1, 1 - 0.25 * Math.sin(k * Math.PI), 1);
        if (k >= 1) { this.rollT = -1; r.rotation.x = 0; r.position.set(0, 0, 0); r.scale.set(1, 1, 1); }
      }
    }
    this.vignette.style.opacity = String(Math.max(0, Number(this.vignette.style.opacity || 0) - dt * 2.2));

    // Respawn after a fall.
    if (this.dead > 0) {
      this.dead -= dt;
      player.speedScale = 0;
      if (this.dead <= 0) { this.hp = this.maxHp; player.speedScale = 1; this.d.respawn(); this.invuln = 2; this.updateHud(); }
    }

    // Swing timeline: strikes on hit frames, chains on queue.
    if (this.swing) {
      this.swing.t += dt;
      const lk = this.lock;
      if (lk?.alive && this.swing.hits < HITS[this.swing.move].at.length) {
        const to = lk.object.position.clone().sub(p).setY(0);
        if (to.lengthSq() > 0.01) player.faceYaw(Math.atan2(to.x, to.z), Math.min(1, dt * 14));
      }
      const h = HITS[this.swing.move];
      while (this.swing.hits < h.at.length && this.swing.t >= h.at[this.swing.hits] * this.swing.dur) {
        this.swing.hits++;
        this.strikeFromPlayer(h, this.swing.move === 'kata' || this.swing.move === 'flipCleave' || this.swing.move === 'flipKick', KNOCK[this.swing.move]);
      }
      // Cancel point: a buffered press cuts straight into the next angle once this cut lands.
      const last = h.at.length ? h.at[h.at.length - 1] : 0.5;
      if (this.queued && this.swing.t >= this.swing.dur * Math.max(0.5, last + 0.06)) this.startSwing();
      else if (this.swing.t >= this.swing.dur) { this.swing = null; player.speedScale = 1; this.sinceSwing = 0; }
    } else this.sinceSwing += dt;
    if (this.pendingThrow !== null) {
      this.pendingThrow -= dt;
      if (this.pendingThrow <= 0) { this.pendingThrow = null; this.releaseBottle(); setTimeout(() => { if (!this.swing) player.speedScale = 1; }, 250); }
    }
    if (!jack?.acting && !this.swing && this.dead <= 0) player.speedScale = 1;
    this.molotovRegen += dt;
    if (this.molotovRegen > 25) { this.molotovRegen = 0; if (this.molotovs < 3) { this.molotovs++; this.updateHud(); } }

    // Bottles in flight, fires burning.
    for (let i = this.bottles.length - 1; i >= 0; i--) {
      const b = this.bottles[i];
      b.t += dt;
      b.v.y -= 18 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += dt * 9;
      const g = this.d.collision(b.level).groundAt(b.mesh.position.x, b.mesh.position.z, b.mesh.position.y + 0.3, 4);
      if ((g !== null && b.mesh.position.y <= g + 0.05) || b.t > 2.5) {
        b.mesh.removeFromParent();
        this.bottles.splice(i, 1);
        this.ignite(new THREE.Vector3(b.mesh.position.x, g ?? b.mesh.position.y, b.mesh.position.z), b.level);
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const life = 4.5, k = f.t < 0.3 ? f.t / 0.3 : Math.max(0, 1 - (f.t - life + 1));
      f.group.scale.setScalar(Math.max(0.01, k));
      f.light.intensity = 90 * k;
      for (const m of this.mobs) if (m.team === 'enemy' && m.alive && m.level === f.level && m.object.position.distanceTo(f.pos) < (m.kind === 'troll' ? 3.6 : 3)) { if (m.damage((m.kind === 'troll' ? 32 : 10) * dt, f.pos)) this.onKill(m); }   // its oily hide burns
      if (f.t > life) { f.group.removeFromParent(); this.d.pool(f.level).remove(f.light); this.fires.splice(i, 1); }
    }

    player.faceLock = !!this.swing || this.pendingThrow !== null;
    this.updateHorde(dt);
    // Director: the three closest engaged monsters may swing; the rest take posts behind Jack and
    // to his sides (so turning to fight one leaves your back open) and wait their turn.
    // Bodies also push apart (player vs monsters, monsters vs each other).
    const engaged = this.mobs.filter((m) => m.team === 'enemy' && m.alive && m.ready && m.level === lvl && m.object.position.distanceTo(p) < 9)
      .sort((a, b) => a.object.position.distanceTo(p) - b.object.position.distanceTo(p));
    const TOKENS = 3, behind = this.d.player.yaw + Math.PI;
    for (const m of this.mobs) {
      const i = engaged.indexOf(m);
      m.mayAttack = m.team !== 'enemy' || i < 0 || i < TOKENS || m.kind === 'troll' || m.kind === 'dracula';   // bosses never wait
      if (i >= TOKENS) { const a = behind + (((i - TOKENS) % 2 ? 1 : -1) * (0.5 + 0.55 * Math.floor((i - TOKENS) / 2))); m.flank = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); }
      else m.flank = null;
    }
    const bodies = this.mobs.filter((m) => m.alive && m.ready && m.level === lvl && m.object.position.distanceTo(p) < 20);
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i].object.position;
      const dp = a.clone().sub(p).setY(0); const dl = dp.length();
      if (dl < 0.85 && dl > 1e-4 && Math.abs(a.y - p.y) < 1.5) { const o = (0.85 - dl) * 0.5; bodies[i].push.addScaledVector(dp.normalize(), o); player.push.addScaledVector(dp, -o); }
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j].object.position;
        const d = a.clone().sub(b).setY(0); const l = d.length();
        if (l < 0.9 && l > 1e-4) { d.normalize().multiplyScalar((0.9 - l) * 0.5); bodies[i].push.add(d); bodies[j].push.sub(d); }
      }
    }
    // Camera framing: keep the nearest engaged foe in view (player.ts eases toward it).
    player.combatFocus = engaged[0] && this.dead <= 0 ? engaged[0].object.position : null;
    player.combatCount = engaged.length;

    // Mobs: only those in this level and near enough to matter.
    const world = this.d.collision(lvl);
    const me = { pos: p, alive: this.dead <= 0 };
    // Allies (Pumpkin Patch) keep to Jack's side — beside and a little ahead, never between the
    // camera and him — and step out of the camera's line of sight if they wander into it.
    const camPos = this.d.camera.position;
    const camFwd = p.clone().sub(camPos).setY(0).normalize();
    const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
    const allySlot = p.clone().addScaledVector(camRight, 2.6).addScaledVector(camFwd, 1.2);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.level !== lvl) continue;
      if (m.ttl <= 0) { m.object.removeFromParent(); m.bar?.remove(); this.mobs.splice(i, 1); continue; }
      // Far monsters: no AI, no draw (each Muse monster is ~51k skinned vertices).
      const far = m.object.position.distanceTo(p);
      if (m.team === 'enemy' && far >= tuning.cullDist) m.object.visible = false;   // (the frustum test above decides the rest)
      if (far > 70 && m.team === 'enemy') continue;
      let foe: { pos: THREE.Vector3; alive: boolean } | null = me;
      // The Count reads the fight: he turns on Pumpkin Patch when Melvin's the bigger threat.
      if (m.kind === 'dracula' && this.draculaOnMelvin) { const mel = this.melvin(); if (mel) foe = { pos: mel.object.position, alive: true }; }
      if (m.team === 'ally') { const e = this.nearestEnemy(m.object.position, 16); foe = e ? { pos: e.object.position, alive: true } : null; }
      if (m.team === 'npc') foe = null;
      if ((m.kind === 'miriam' && !(this.witchExit?.m === m && this.witchExit.t >= 0)) || m.kind === 'robobones') { const to = p.clone().sub(m.object.position); m.yaw = Math.atan2(to.x, to.z); }
      const was = m.state;
      m.update(dt, world, foe, m.team === 'ally' ? allySlot : null, (s) => this.mobStrike(s));
      if (m.team === 'ally') this.clearSightline(m, camPos, p);
      if (m.kind === 'pumpkin' && m.team === 'ally') this.melvinBlades(m);
      else if (m.team === 'enemy' && far < 40) this.voiceMob(m, was, far, dt);
    }
    this.updateBars();

    // Encounter staging.
    if (this.tank) this.updateTank(dt);
    if (this.witchExit) this.updateWitchExit(dt);
    this.bossTeamwork(dt);
    if (this.boo) {
      if (this.boo.parent !== this.d.scene(lvl)) {
        this.d.scene(lvl).add(this.boo);
        if (this.booLight) for (const l of ['outside', 'hall'] as LevelName[]) this.d.pool(l).remove(this.booLight);
        this.booLight = this.d.pool(lvl).addTransient(p, 0xb8a8ff, 12, 9);
      }
      const t = performance.now() / 1000;
      const want = p.clone().add(new THREE.Vector3(Math.cos(t * 0.8) * 0.9, 2.2 + Math.sin(t * 1.7) * 0.15, Math.sin(t * 0.8) * 0.9));
      this.boo.position.lerp(want, 1 - Math.exp(-dt * 3));
      this.booLight?.pos.copy(this.boo.position);
      this.booZap -= dt;
      if (this.booZap <= 0) {
        this.booZap = 2.2;
        const e = this.nearestEnemy(p, 12);
        if (e) {
          const at = e.object.position.clone().setY(e.object.position.y + KINDS[e.kind].height * 0.6);
          this.beam(this.boo.position.clone(), at);
          this.flash(at, 0xc7b8ff, 20);
          this.d.sfx.vocal('ghost', 'attack', 0, at.distanceTo(p));
          if (e.damage(e === this.bossTarget ? Math.round(e.maxHp * 0.008) : 22, this.boo.position)) this.onKill(e);
        }
      }
    }
    if (this.comicEnc) { this.comicT -= dt; if (this.comicT <= 0) this.closeComic(); }
    this.updateFx(realDt, lvl);
  }

  private addOrb(color: number) {
    const c = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const N = (x: unknown) => x as any;
    const uPow = uniform(1);
    const mat = new THREE.MeshBasicNodeMaterial();
    const warm = vec3(1, 0.94, 0.78);
    const celestial = N(hue(vec3(0.7, 0.32, 1.0), N(sin(N(time).mul(1.8))).mul(0.8)));
    const spent = N(vec3(1, 0.12, 0.08).mul(N(sin(N(time).mul(7))).mul(0.25).add(0.75)));   // drained: a red, guttering glow
    mat.colorNode = N(mix(spent, N(mix(warm, celestial, this.uCelestial)), smoothstep(float(0.15), float(0.55), uPow))).mul(this.uOrbGlow);
    const mesh = new THREE.Mesh(this.orbGeo, mat);
    mesh.userData.dynamic = true;
    mesh.position.copy(this.d.player.object.position).add(new THREE.Vector3(0, 2.5, 0));
    this.orbs.push({ mesh, light: null, level: null, phase: Math.random() * Math.PI * 2, state: 'orbit', target: null, t: 0, cd: 1 + Math.random(), color: c, power: 1, uPow });
  }

  private updateOrbs(dt: number, lvl: LevelName) {
    const p = this.d.player.object.position;
    const now = performance.now() / 1000;
    const hurt = this.hp < this.maxHp * 0.45 && this.dead <= 0;
    const boss = this.bossTarget?.alive && this.bossTarget.level === lvl ? this.bossTarget : null;
    // Too dark to fight by (the nightmare's dark, or the Count's storm): the strongest orb rises
    // high over the fight as a lantern and floods the ground with light.
    let lantern = -1;
    if ((this.orbBoost > 1.05 || boss) && this.orbs.length >= 2 && !this.halo) {
      let best = -1;
      this.orbs.forEach((o, i) => { if (o.power > 0.3 && (lantern < 0 || o.power > best)) { lantern = i; best = o.power; } });
    }
    this.orbs.forEach((o, i) => {
      // Follow Jack between levels: mesh into the scene, light into that level's pool.
      if (o.level !== lvl) {
        if (o.light && o.level) this.d.pool(o.level).remove(o.light);
        this.d.scene(lvl).add(o.mesh);
        o.light = this.d.pool(lvl).addTransient(o.mesh.position, o.color.getHex(), 16, 11);
        o.level = lvl;
      }
      o.cd -= dt;
      o.power = Math.min(1, o.power + dt * (o.state === 'orbit' ? 0.05 : 0.02));
      o.uPow.value += (o.power - o.uPow.value) * Math.min(1, dt * 4);
      const weak = o.power < 0.25;
      const ang = now * 0.9 + o.phase + (i * Math.PI * 2) / this.orbs.length;
      // Drained orbs hang back, close and low, recovering.
      const r = weak ? 0.8 : 1.3;
      const home = p.clone().add(new THREE.Vector3(Math.cos(ang) * r, (weak ? 1.6 : 2.1) + Math.sin(now * 1.7 + i) * 0.25, Math.sin(ang) * r));
      if (this.halo) {
        // The halo drives them (updateHalo).
      } else if (i === lantern) {
        o.state = 'orbit';
        const high = p.clone().add(new THREE.Vector3(Math.sin(now * 0.3) * 1.5, 6.5, Math.cos(now * 0.3) * 1.5));
        o.mesh.position.lerp(high, 1 - Math.exp(-dt * 2));
      } else if (boss) {
        // Against the Count: hold station around Jack and pour celestial beams into him.
        o.state = 'orbit';
        o.mesh.position.lerp(home, 1 - Math.exp(-dt * 4));
        if (o.cd <= 0 && !weak) {
          o.cd = 1.5 + Math.random() * 0.8;
          const at = boss.object.position.clone().setY(boss.object.position.y + KINDS[boss.kind].height * 0.6);
          if (at.distanceTo(o.mesh.position) < 16) {
            this.beam(o.mesh.position.clone(), at);
            this.d.sfx.orbZap(0);
            o.power -= 0.09;
            if (boss.damage(Math.round(10 * this.power), o.mesh.position)) this.onKill(boss);
          }
        }
      } else if (o.state === 'orbit') {
        o.mesh.position.lerp(home, 1 - Math.exp(-dt * 4));
        if (o.cd <= 0 && !weak) {
          const e = this.nearestEnemy(p, 9);
          if (e) { o.state = 'dart'; o.target = e; o.t = 0; }
          else o.cd = 0.5;
        }
      } else if (o.state === 'dart') {
        o.t += dt;
        const e = o.target;
        if (!e || !e.alive) { o.state = 'back'; }
        else {
          const at = e.object.position.clone().setY(e.object.position.y + KINDS[e.kind].height * 0.6);
          o.mesh.position.lerp(at, 1 - Math.exp(-dt * 9));
          if (o.mesh.position.distanceTo(at) < 0.35 || o.t > 0.6) {
            // Zap: a burst of light; scales with Jack's power.
            const pw = this.power;
            for (let k = 0; k < 14; k++) this.glow.emit({ pos: at, vel: new THREE.Vector3(this.rnd(3), this.rnd(3), this.rnd(3)), color: o.color.clone().multiplyScalar(2.5), size: 0.07, life: 0.3, drag: 3 });
            this.flash(at, o.color.getHex(), 18);
            if (e.damage(Math.round(7 * pw), o.mesh.position)) this.onKill(e);
            this.d.sfx.orbZap();
            o.power -= 0.12;
            o.state = 'back'; o.cd = 1.4 + Math.random() * 0.6;
          }
        }
      } else {
        o.mesh.position.lerp(home, 1 - Math.exp(-dt * 6));
        if (o.mesh.position.distanceTo(home) < 0.4) o.state = 'orbit';
      }
      // Healing glow: hurt, the orbs pulse and mend Jack slowly.
      if (hurt && !weak) this.hp = Math.min(this.maxHp, this.hp + dt * 1.2);
      if (o.light) {
        o.light.pos.copy(o.mesh.position);
        const red = new THREE.Color(1, 0.15, 0.08);
        if (this.uCelestial.value > 0.01) o.light.color.copy(o.color).lerp(new THREE.Color().setHSL(0.78 + 0.08 * Math.sin(now * 1.8), 0.75, 0.62), this.uCelestial.value);
        else o.light.color.copy(o.color);
        o.light.color.lerp(red, THREE.MathUtils.clamp(1 - o.uPow.value / 0.5, 0, 1));
        const lamp = i === lantern ? 3.2 : 1;
        o.light.intensity = (hurt ? 22 : 16) * this.orbBoost * (0.3 + 0.7 * o.uPow.value) * lamp * (0.85 + 0.15 * Math.sin(now * 6 + i));
        o.light.distance = 11 * Math.sqrt(this.orbBoost) * (i === lantern ? 2.4 : 1);
      }
      // Sparkle trail.
      if (Math.random() < dt * 30) this.glow.emit({ pos: o.mesh.position, vel: new THREE.Vector3(this.rnd(0.2), -0.2, this.rnd(0.2)), color: (weak ? new THREE.Color(1, 0.15, 0.1) : hurt ? new THREE.Color(0.6, 1, 0.6) : o.color).clone().multiplyScalar(1.6), size: 0.05, life: 0.45, drag: 1 });
    });
    if (hurt && Math.random() < dt * 2) this.updateHud();
    if (boss) this.updateBossOrbs(dt, boss);
    if (this.halo) this.updateHalo(dt);
  }

  // ── Dracula vs the orbs, and the halo ─────────────────────────────────────────
  private orbBlastCd = 6;
  private haloUses = 0;
  private haloCd = 0;
  private halo: { t: number; boss: Mob; centre: THREE.Vector3; angel: ReturnType<typeof buildAngel> | null; struck: boolean; healed: boolean; from: THREE.Vector3; light: Virtual | null } | null = null;
  private updateBossOrbs(dt: number, boss: Mob) {
    // The Count blasts the orbs that sting him: a crackling red bolt that drains one.
    this.orbBlastCd -= dt;
    if (this.orbBlastCd <= 0 && !this.halo && !boss.scripted) {
      this.orbBlastCd = 6 + Math.random() * 4;
      const live = this.orbs.filter((o) => o.power > 0.25 && o.mesh.position.distanceTo(boss.object.position) < 20);
      const o = live[Math.floor(Math.random() * live.length)];
      if (o) {
        const from = boss.object.position.clone().setY(boss.object.position.y + 1.6), to = o.mesh.position.clone();
        for (let k = 0; k <= 16; k++) {
          const q = from.clone().lerp(to, k / 16).add(new THREE.Vector3(this.rnd(0.25), this.rnd(0.25), this.rnd(0.25)));
          this.glow.emit({ pos: q, vel: new THREE.Vector3(this.rnd(0.5), this.rnd(0.5), this.rnd(0.5)), color: new THREE.Color(3, 0.3, 0.2), size: 0.09, life: 0.35, drag: 2 });
        }
        this.flash(to, 0xff2a1a, 30);
        this.d.sfx.witchBolt(0, to.distanceTo(this.d.player.object.position));
        o.power = Math.max(0, o.power - 0.6);
        o.mesh.position.add(to.clone().sub(from).setY(0.5).normalize().multiplyScalar(1.5));
        this.call('The Count blasts an orb!', 0.9, '#ff6a5a');
      }
    }
    // Low on life: the orbs join hands in a halo over him and call down an angel (twice a fight).
    this.haloCd -= dt;
    if (!this.halo && this.haloUses < 2 && this.haloCd <= 0 && this.hp < this.maxHp * 0.35 && this.dead <= 0 && this.orbs.filter((o) => o.power > 0.15).length >= 2) {
      this.haloUses++;
      this.haloCd = 25;
      this.halo = { t: 0, boss, centre: new THREE.Vector3(), angel: null, struck: false, healed: false, from: new THREE.Vector3(), light: null };
      this.call('The orbs form a halo!', 1.8, '#e9d8ff');
      this.d.sfx.powerUp(3);
    }
  }
  private updateHalo(dt: number) {
    const H = this.halo!, b = H.boss, p = this.d.player.object.position, lvl = this.d.level();
    H.t += dt;
    const bp = b.object.position;
    H.centre.copy(bp).add(new THREE.Vector3(0, 5.5, 0));
    // 0 – 1.6 s: the orbs ring up into a spinning circle above him.
    const n = this.orbs.length;
    this.orbs.forEach((o, i) => {
      const a = H.t * 2.4 + (i * Math.PI * 2) / n;
      const at = H.centre.clone().add(new THREE.Vector3(Math.cos(a) * 2.6, Math.sin(H.t * 3 + i) * 0.15, Math.sin(a) * 2.6));
      o.mesh.position.lerp(H.t < 4.5 ? at : p.clone().setY(p.y + 2), 1 - Math.exp(-dt * (H.t < 1.6 ? 3 : 8)));
      if (Math.random() < dt * 20) this.glow.emit({ pos: o.mesh.position, vel: new THREE.Vector3(0, -1.5, 0), color: new THREE.Color(2.4, 2.2, 3), size: 0.07, life: 0.5, drag: 1 });
    });
    // 1.6 s: a pillar of light from heaven onto him.
    if (H.t > 1.6 && H.t < 2.4 && Math.random() < dt * 25) {
      this.beam(H.centre.clone().add(new THREE.Vector3(this.rnd(0.4), 30, this.rnd(0.4))), bp.clone().setY(bp.y + 0.2));
      this.d.player.shake = Math.max(this.d.player.shake, 0.3);
    }
    if (H.t > 1.6 && !H.light) {
      H.light = this.d.pool(lvl).addTransient(bp.clone().setY(bp.y + 3), 0xfff2d0, 120, 30);
      this.d.sfx.thunder(30);
      if (b.damage(Math.round(b.maxHp * 0.04), H.centre)) this.onKill(b);
    }
    // 1.9 s: the angel. High behind the halo, then down through him faster than the eye.
    if (H.t > 1.9 && !H.angel) {
      H.angel = buildAngel();
      this.d.scene(lvl).add(H.angel.group);
      const side = new THREE.Vector3(Math.sin(this.d.player.camYaw + 1.2), 0, Math.cos(this.d.player.camYaw + 1.2));
      H.from.copy(bp).addScaledVector(side, 6).setY(bp.y + 14);
      H.angel.group.position.copy(H.from);
      this.call('An angel answers!', 1.6, '#fff2d0');
    }
    const A = H.angel;
    if (A) {
      A.pose(H.t, THREE.MathUtils.clamp((H.t - 1.9) / 0.5, 0, 1), H.t < 2.45 ? 'swept' : H.t < 4.4 ? 'spread' : 'swept', dt);
      const past = bp.clone().add(bp.clone().sub(H.from).setY(0).normalize().multiplyScalar(4)).setY(bp.y + 0.4);
      if (H.t < 2.4) {
        const k = THREE.MathUtils.clamp((H.t - 1.9) / 0.5, 0, 1), e = k * k * k;   // accelerating dive
        A.group.position.lerpVectors(H.from, past, e);
        A.group.lookAt(past.x, A.group.position.y, past.z);
        for (let i = 0; i < 4; i++) this.glow.emit({ pos: A.group.position.clone().setY(A.group.position.y + 1.2), vel: new THREE.Vector3(this.rnd(0.3), this.rnd(0.3), this.rnd(0.3)), color: new THREE.Color(3, 2.8, 2.2), size: 0.12, life: 0.4, drag: 2 });
      }
      // The strike: through him — stunned for five seconds.
      if (H.t > 2.2 && !H.struck) {
        H.struck = true;
        this.d.sfx.hit(b.kind, true, 3);
        this.d.sfx.witchBolt(0, 4);
        this.flash(bp.clone().setY(bp.y + 1.5), 0xffffff, 80);
        this.d.player.shake = 0.9;
        this.hitStop = 0.12;
        if (b.damage(Math.round(b.maxHp * 0.12), H.from)) this.onKill(b);
        else { b.scripted = true; b.exposed = 5; b.pose('hit'); }
        this.call('Dracula is stunned!', 2, '#fff2d0');
      }
      // Then to Jack (Elise): hovering before them, healing.
      if (H.t >= 2.4 && H.t < 4.6) {
        const before = p.clone().add(new THREE.Vector3(Math.sin(this.d.player.yaw), 0, Math.cos(this.d.player.yaw)).multiplyScalar(1.8)).setY(p.y + 0.6);
        A.group.position.lerp(before, 1 - Math.exp(-dt * 6));
        A.group.lookAt(p.x, A.group.position.y, p.z);
        if (H.t > 3.4 && !H.healed) {
          H.healed = true;
          this.hp = this.maxHp; this.updateHud();
          // The orbs are bound to the hero: the angel's healing restores them too, back to purple.
          for (const o of this.orbs) {
            o.power = 1;
            for (let i = 0; i < 10; i++) this.glow.emit({ pos: o.mesh.position, vel: new THREE.Vector3(this.rnd(1.2), this.rnd(1.2), this.rnd(1.2)), color: new THREE.Color(2.2, 1.6, 3), size: 0.06, life: 0.6, drag: 2 });
          }
          this.d.sfx.levelUp();
          for (let i = 0; i < 40; i++) this.glow.emit({ pos: p.clone().setY(p.y + 1), vel: new THREE.Vector3(this.rnd(2), Math.random() * 3, this.rnd(2)), color: new THREE.Color(2.6, 2.4, 1.4), size: 0.08, life: 0.9, drag: 1.5 });
          this.call('The angel heals you', 1.8, '#fff2d0');
        }
      }
      // And away, up into the storm.
      if (H.t >= 4.6) {
        A.group.position.y += dt * (6 + (H.t - 4.6) * 30);
        A.group.scale.setScalar(Math.max(0.01, 1 - (H.t - 4.6) / 1.4));
      }
    }
    if (H.light) H.light.intensity = 120 * Math.max(0, 1 - Math.max(0, H.t - 2.4) / 1.5);
    // Stun ends; the orbs (healed with the hero) come home.
    if (H.t > 7.2) {
      if (b.alive) b.scripted = false;
      A?.group.removeFromParent();
      if (H.light) this.d.pool(lvl).remove(H.light);
      this.halo = null;
    }
  }

  private updateFx(dt: number, lvl: LevelName) {
    this.updateOrbs(dt, lvl);
    const want = this.bossTarget?.alive ? 1 : 0;
    this.uCelestial.value += (want - this.uCelestial.value) * Math.min(1, dt * 2);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      b.mesh.scale.x = Math.max(0.01, 1 - b.t / 0.35);
      if (b.t > 0.35) { b.mesh.removeFromParent(); b.mesh.geometry.dispose(); this.beams.splice(i, 1); }
    }
    const sc = this.d.scene(lvl);
    for (const o of [this.glow.mesh, this.gore.mesh, this.trail.mesh, this.rings.group, this.batSwarmFx.mesh]) if (o.parent !== sc) sc.add(o);
    this.batSwarmFx.update(dt * this.timeScale, this.d.player.object.position, (bp) => { if (this.invuln <= 0) this.hurtPlayer(4, bp); });
    const ground = this.d.collision(lvl);
    const g = (x: number, z: number, y: number) => ground.groundAt(x, z, y + 0.3, 3);
    // Dismembered parts tumble and bleed from their stumps.
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.level !== lvl) continue;
      if (!b.d.update(dt * this.timeScale, g)) { this.bodies.splice(i, 1); continue; }
      if (b.bleed > 0) {
        b.bleed -= dt;
        const pulse = 0.5 + 0.5 * Math.sin(b.d.age * 18);
        for (const c of b.d.chunks) {
          const st = b.d.stumpOf(c);
          if (!st) continue;
          const dir = st.clone().sub(c.center.clone().add(c.off)).normalize();
          for (let k = 0; k < 3 * pulse; k++) this.gore.emit({ pos: st, vel: dir.clone().multiplyScalar(2.5 + Math.random() * 2.5).add(new THREE.Vector3(this.rnd(0.6), this.rnd(0.6), this.rnd(0.6))), color: b.color, size: 0.05 + Math.random() * 0.06, life: 1.1, gravity: 9.8, drag: 0.3 });
        }
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      f.v.intensity = f.i * Math.max(0, 1 - f.t / 0.35);
      if (f.t > 0.35) { this.d.pool(f.level).remove(f.v); this.flashes.splice(i, 1); }
    }
    this.glow.update(dt, this.d.camera, g);
    this.gore.update(dt, this.d.camera, g);
    this.rings.update(dt);
    // Blade: trail while cutting; steel glows hotter as power climbs.
    const blade = this.d.jack()?.blade;
    if (blade) {
      const pw = this.power;
      this.heat(this.trail.color);
      this.trail.intensity = 1.2 + (pw - 1) * 1.2;
      const cutting = !!this.swing && this.swing.t > this.swing.dur * 0.15 && this.swing.t < this.swing.dur * 0.85;
      this.trail.update(dt, blade.base.getWorldPosition(new THREE.Vector3()), blade.tip.getWorldPosition(new THREE.Vector3()), cutting);
      const glow = Math.max(0, (pw - 1) * 1.5);
      blade.steel.emissive.copy(this.heat()).multiplyScalar(glow);
      if (pw > 1.4 && Math.random() < dt * 20 * (pw - 1)) {
        const tip = blade.tip.getWorldPosition(new THREE.Vector3());
        this.glow.emit({ pos: tip.lerp(blade.base.getWorldPosition(new THREE.Vector3()), Math.random()), vel: new THREE.Vector3(this.rnd(0.3), 0.8, this.rnd(0.3)), color: this.heat().multiplyScalar(2), size: 0.035, life: 0.5, drag: 1 });
      }
    }
    this.powerEl.textContent = this.power > 1.001 ? `POWER ×${this.power.toFixed(2)}${this.streak > 1 ? `  ·  STREAK ${this.streak}` : ''}` : '';
  }

  /** Monsters are heard: a bark on each attack, a cry when cut, snarls while they hunt. */
  private mobVoiceT = new WeakMap<Mob, number>();
  private voiceMob(m: Mob, was: string, dist: number, dt: number) {
    const st = m.state;
    if (st === was && st !== 'chase' && st !== 'idle' && st !== 'wander') return;
    const cam = this.d.camera, right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const pan = Math.max(-0.9, Math.min(0.9, m.object.position.clone().sub(cam.position).normalize().dot(right)));
    if (st !== was && st === 'attack') { if (Math.random() < 0.6) this.d.sfx.vocal(m.kind, 'attack', pan, dist); return; }
    if (st !== was && st === 'hurt') { if (Math.random() < 0.5) this.d.sfx.vocal(m.kind, 'hurt', pan, dist); return; }
    let t = (this.mobVoiceT.get(m) ?? 1 + Math.random() * 5) - dt;
    if (t <= 0) { t = 4 + Math.random() * 7; if (dist < 28) this.d.sfx.vocal(m.kind, 'idle', pan, dist); }
    this.mobVoiceT.set(m, t);
  }

  /** Miriam at the end of the bridge: she idles (breathing, shifting her weight) watching Jack come;
   *  as he passes she cackles, her broom flares up under her, and she lifts off over the moat. */
  private witchExit: { m: Mob; t: number; broom: THREE.Group | null; from: THREE.Vector3; dir: THREE.Vector3 } | null = null;
  private updateWitchExit(dt: number) {
    const W = this.witchExit!, m = W.m;
    if (!m.object.parent) { W.broom?.removeFromParent(); this.witchExit = null; return; }
    const p = this.d.player.object.position, mp = m.object.position;
    if (W.t < 0) {
      if (!m.ready) return;
      m.pose('idle');
      // Passing her: close by, or already level with her on the way to the gate.
      const sy = this.staging?.miriam.yaw ?? m.yaw, toGate = new THREE.Vector3(-Math.sin(sy), 0, -Math.cos(sy));   // she stands facing away from the gate
      const past = p.clone().sub(mp).setY(0).dot(toGate) > 0;
      if (p.distanceTo(mp) < 4.5 || (past && p.distanceTo(mp) < 12)) {
        W.t = 0;
        W.from.copy(mp);
        // Away from Jack and out over the moat, climbing.
        const away = mp.clone().sub(p).setY(0);
        W.dir.copy(away.lengthSq() > 1e-4 ? away.normalize() : new THREE.Vector3(0, 0, 1)).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? 0.9 : -0.9);
        this.d.sfx.laugh(0, p.distanceTo(mp), 2.4);
        setTimeout(() => this.bark('miriam'), 900);
      }
      return;
    }
    W.t += dt;
    if (!W.broom && W.t > 0.5) {
      W.broom = buildBroom();
      W.broom.scale.setScalar(0.01);
      this.d.scene('outside').add(W.broom);
      this.d.sfx.witchBolt(0, p.distanceTo(mp));
    }
    if (W.broom) {
      const k = Math.min(1, (W.t - 0.5) / 0.35);
      W.broom.scale.setScalar(Math.max(0.01, k));
      const lift = Math.max(0, W.t - 1.1);
      const yaw = Math.atan2(W.dir.x, W.dir.z);
      const pos = W.from.clone()
        .addScaledVector(W.dir, lift * lift * 3.2)
        .add(new THREE.Vector3(0, 0.45 * k + lift * 2.6 + lift * lift * 0.8, 0));
      W.broom.position.copy(pos);
      W.broom.rotation.set(-Math.min(0.35, lift * 0.3), yaw, 0, 'YXZ');
      if (lift > 0) { mp.copy(pos).add(new THREE.Vector3(0, 0.06, 0)); m.yaw = yaw + 0.5; m.object.rotation.set(0, yaw + 0.5, 0, 'YXZ'); }
      for (let i = 0; i < 2; i++) this.sparkle({ pos: pos.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -1.2), vel: new THREE.Vector3(this.rnd(0.4), -Math.random() * 0.6, this.rnd(0.4)), color: new THREE.Color(0.25, 1.6, 0.4), size: 0.09, life: 0.9, drag: 1 });
      if (W.t > 7) { m.object.removeFromParent(); W.broom.removeFromParent(); this.witchExit = null; }
    }
  }

  /** Daybreak: Pumpkin Patch strolls up to the hero from up the road and stops at their side. */
  melvinWalkUp() {
    const p = this.d.player.object.position;
    if (!this.melvin()) this.summonMelvin(90);
    const m = this.melvin();
    if (!m) return null;
    const fwd = new THREE.Vector3(Math.sin(this.d.player.yaw), 0, Math.cos(this.d.player.yaw));
    m.object.position.copy(p).addScaledVector(fwd, 9);
    m.ttl = Math.max(m.ttl, 90);
    return m;
  }
  /** Pumpkin Patch in the fight (an ally with time left). */
  private melvin() { return this.mobs.find((x) => x.kind === 'pumpkin' && x.team === 'ally' && x.alive && x.ttl > 0 && x.level === this.d.level()) ?? null; }
  private draculaOnMelvin = false;
  private draculaFocusT = 5;
  private booCd = 0;
  /** Boss-fight teamwork, per frame: who the Count is after, and Melvin calling Lil' Boo. */
  private bossTeamwork(dt: number) {
    const boss = this.bossTarget?.alive ? this.bossTarget : null;
    const mel = this.melvin();
    this.draculaFocusT -= dt;
    if (this.draculaFocusT <= 0) {
      this.draculaFocusT = 4 + Math.random() * 4;
      const was = this.draculaOnMelvin;
      this.draculaOnMelvin = !!(boss && mel && Math.random() < 0.4);
      if (this.draculaOnMelvin && !was) this.call('The Count turns on Pumpkin Patch!', 1.2, '#fb923c');
    }
    if (!mel) this.draculaOnMelvin = false;
    this.booCd -= dt;
    if (boss && mel && !this.boo && this.booCd <= 0 && this.hp < this.maxHp * 0.3 && this.dead <= 0) {
      this.booCd = 90;
      this.bark('pumpkin');
      this.call("Pumpkin Patch calls Lil' Boo!", 2, '#c7b8ff');
      this.summonBoo();
    }
  }
  /** Melvin's two orange plasma blades, riding his hands every frame. */
  private blades = new WeakMap<Mob, { l: THREE.Mesh; r: THREE.Mesh; hands: [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D] }>();
  private bladeMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const across = uv().x.sub(0.5).abs().mul(2);
    m.colorNode = mix(vec3(1, 0.38, 0.02), vec3(1, 0.85, 0.55), smoothstep(float(0.22), float(0.0), across)).mul(sin(time.mul(45)).mul(0.12).add(1)).mul(4);
    return m;
  })();
  private melvinBlades(m: Mob) {
    if (!m.ready) return;
    let B = this.blades.get(m);
    if (!B) {
      const f = (n: string) => m.object.getObjectByName(n);
      const rh = f('RightHand'), lh = f('LeftHand'), rf = f('RightForeArm'), lf = f('LeftForeArm');
      if (!rh || !lh || !rf || !lf) return;
      const mk = () => { const g = new THREE.CylinderGeometry(0.022, 0.03, 1.0, 8, 1, true); g.translate(0, 0.5, 0); const b = new THREE.Mesh(g, this.bladeMat); b.userData.dynamic = true; this.d.scene(m.level as LevelName).add(b); return b; };
      B = { l: mk(), r: mk(), hands: [lh, lf, rh, rf] };
      this.blades.set(m, B);
    }
    const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    const up = new THREE.Vector3(0, 1, 0);
    for (const [blade, hand, fore] of [[B.l, B.hands[0], B.hands[1]], [B.r, B.hands[2], B.hands[3]]] as const) {
      if (blade.parent !== this.d.scene(m.level as LevelName)) this.d.scene(m.level as LevelName).add(blade);
      const hp = hand.getWorldPosition(new THREE.Vector3()), fp = fore.getWorldPosition(new THREE.Vector3());
      // Held out past the fist: along the forearm, tipped forward and up like a drawn sword.
      const dir = hp.clone().sub(fp).normalize().addScaledVector(fwd, 1.1).addScaledVector(up, 0.5).normalize();
      blade.position.copy(hp);
      blade.quaternion.setFromUnitVectors(up, dir);
      blade.visible = m.object.visible;
    }
    if (m.ttl <= 0.05 || !m.alive) { B.l.removeFromParent(); B.r.removeFromParent(); this.blades.delete(m); }
  }

  private mobStrike(m: Mob) {
    const k = KINDS[m.kind];
    const mp = m.object.position;
    if (m.kind === 'dracula' && this.draculaOnMelvin) {
      // His blow lands on Melvin: knocked back and reeling (Pumpkin Patch never falls).
      const mel = this.melvin();
      if (mel && mel.object.position.distanceTo(mp) < k.reach + 0.8) {
        mel.damage(1, mp);
        mel.vel.addScaledVector(mel.object.position.clone().sub(mp).setY(0).normalize(), 5);
        this.d.sfx.hit('pumpkin', false, 1.5);
        this.flash(mel.object.position.clone().setY(mel.object.position.y + 1.2), 0xff5a1a, 20);
        return;
      }
    }
    if (m.team === 'enemy') {
      const to = this.d.player.object.position.clone().sub(mp);
      const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
      if (to.length() < k.reach + 0.6 && Math.abs(to.y) < 1.5 && to.setY(0).normalize().angleTo(fwd) < 1.1 && this.invuln <= 0 && this.dead <= 0) {
        this.hurtPlayer(Math.round(k.dmg * m.power * (0.75 + 0.25 * Difficulty.mul)), mp);
        // Hit from behind or the side: Jack whips round to face the attacker and locks on.
        const back = mp.clone().sub(this.d.player.object.position).setY(0).normalize();
        const facing = new THREE.Vector3(Math.sin(this.d.player.yaw), 0, Math.cos(this.d.player.yaw));
        if (back.dot(facing) < 0.3) { this.d.player.faceThreat(Math.atan2(back.x, back.z)); this.lock = m; }
        // The Count feeds on every blow that lands.
        if (m.kind === 'dracula') { m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.012)); this.call('Life drained', 0.8, '#ff4a3a'); }
      }
      if (m.kind === 'werewolf' || m.kind === 'stitch') this.d.player.shake = Math.max(this.d.player.shake, 0.15);
      if (m.kind === 'troll') { this.d.player.shake = Math.max(this.d.player.shake, 0.55); this.onTrollSlam?.(m); }
    } else if (m.team === 'ally') {
      const e = this.nearestEnemy(mp, k.reach + 0.8);
      if (e) { this.d.sfx.hit(e.kind, true, 1.5); if (e.damage(k.dmg, mp)) this.onKill(e); }
    }
  }

  private updateTank(dt: number) {
    const T = this.tank!;
    const len = T.from.distanceTo(T.to);
    T.t += dt * T.speed;
    const s = Math.min(1, T.t / len);
    const pos = T.from.clone().lerp(T.to, s);
    const g = this.d.collision('outside').groundAt(pos.x, pos.z, pos.y + 3, 6);
    pos.y = g ?? pos.y;
    T.obj.position.copy(pos);
    const dir = T.to.clone().sub(T.from);
    T.obj.rotation.y = Math.atan2(dir.x, dir.z);
    // Wreckage on the road: the hull bursts straight through it.
    if (this.onTankMove?.(pos, dir.clone().setY(0).normalize(), T.speed)) { this.d.player.shake = Math.max(this.d.player.shake, 0.6); this.d.sfx.woodCrack(0, pos.distanceTo(this.d.camera.position)); }
    // The hull flattens anything in its path.
    for (const m of this.mobs) if (m.team === 'enemy' && m.alive && m.level === 'outside' && m.object.position.distanceTo(pos) < 4.2) { if (m.damage(999, pos)) { this.onKill(m); this.d.player.shake = Math.max(this.d.player.shake, 0.25); if (pos.distanceTo(this.d.camera.position) < 9) this.d.lens.hit('blood', 0.7); } }
    // Turret salvo: every shot clears the nearest monster on the road.
    T.shot -= dt;
    if (T.shot <= 0) {
      T.shot = this.horde ? 0.45 : 1.1;
      let best: Mob | null = null, bd = 32;
      for (const m of this.mobs) if (m.team === 'enemy' && m.alive && m.level === 'outside' && m.kind !== 'stitch') { const d = m.object.position.distanceTo(pos); if (d < bd) { bd = d; best = m; } }
      if (best) { halloweenAudio.playTankCannonShotSfx(); const at = best.object.position.clone(); if (best.damage(999, pos)) this.onKill(best); this.ignite(at, 'outside'); }
    }
    if (s >= 1) { T.obj.removeFromParent(); this.tank = null; }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private buildHud() {
    this.ui.id = 'game';
    this.ui.innerHTML = `
      <div class="g-card">
        <div class="g-name">JACK THORNE <span class="g-lvl">LV 1</span></div>
        <div class="g-bar hp"><div></div></div>
        <div class="g-bar xp"><div></div></div>
        <div class="g-row"><span class="g-st" data-s="HIGH">1 HIGH</span><span class="g-st" data-s="MID">2 MID</span><span class="g-st" data-s="LOW">3 LOW</span><span class="g-mol"></span></div>
      </div>
      <div class="g-power"></div>
      <div class="g-call"></div>
      <div class="g-feed"></div>
      <div class="g-vig"></div>
      <div class="g-comic">
        <img class="cm-panel" alt="" />
        <div class="cm-side">
          <img class="cm-portrait" alt="" />
          <div class="cm-sfx"></div>
          <h3 class="cm-title"></h3>
          <div class="cm-sub"></div>
          <p class="cm-quote"></p>
          <div class="cm-scene"></div>
          <div class="cm-actions"><button class="cm-watch">▶ Watch this scene</button><button class="cm-close">✕</button></div>
        </div>
      </div>`;
    document.body.appendChild(this.ui);
    const q = <T extends Element>(s: string) => this.ui.querySelector(s) as T;
    this.hpFill = q('.hp div'); this.xpFill = q('.xp div'); this.lvlEl = q('.g-lvl');
    this.molEl = q('.g-mol'); this.callEl = q('.g-call'); this.feed = q('.g-feed'); this.vignette = q('.g-vig');
    this.comic = q('.g-comic');
    this.powerEl = q('.g-power');
    this.ui.querySelectorAll<HTMLSpanElement>('.g-st').forEach((el) => { this.stanceEls[el.dataset.s as Stance] = el; el.addEventListener('click', () => this.setStance(el.dataset.s as Stance)); });
    q('.cm-close').addEventListener('click', () => this.closeComic());
    q('.cm-watch').addEventListener('click', () => { const e = this.comicEnc; if (e) { this.closeComic(); this.d.watch('album_1787881859314_mlt23', e.timecode); } });
    this.setStance('MID');
    this.updateHud();
  }
  updateHud() {
    this.hpFill.style.width = `${(100 * this.hp) / this.maxHp}%`;
    this.xpFill.style.width = `${(100 * this.xp) / this.xpNeed()}%`;
    this.lvlEl.textContent = `LV ${this.lvl}`;
    this.molEl.textContent = `G  MOLOTOV ×${this.molotovs}`;
  }
  private callT = 0;
  call(text: string, secs = 1.4, color = '#f4ead8') {
    this.callEl.textContent = text;
    this.callEl.style.color = color;
    this.callEl.style.opacity = '1';
    const id = ++this.callT;
    setTimeout(() => { if (id === this.callT) this.callEl.style.opacity = '0'; }, secs * 1000);
  }
  reward(text: string) {
    const el = document.createElement('div');
    el.textContent = text;
    this.feed.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3400);
  }
  private updateBars() {
    const cam = this.d.camera;
    const w = innerWidth, h = innerHeight;
    const v = new THREE.Vector3();
    for (const m of this.mobs) {
      const show = m.team === 'enemy' && m.alive && m.object.visible && m.hp < m.maxHp && m.object.position.distanceTo(cam.position) < 26;
      if (!show) { if (m.bar) m.bar.style.display = 'none'; continue; }
      if (!m.bar) {
        m.bar = document.createElement('div');
        m.bar.className = 'g-mobbar';
        m.bar.innerHTML = `<span>${KINDS[m.kind].label}</span><div><i></i></div>`;
        this.ui.appendChild(m.bar);
      }
      v.copy(m.object.position).setY(m.object.position.y + KINDS[m.kind].height + 0.35).project(cam);
      if (v.z > 1) { m.bar.style.display = 'none'; continue; }
      m.bar.style.display = 'block';
      m.bar.style.transform = `translate(${((v.x + 1) / 2) * w - 40}px, ${((1 - v.y) / 2) * h}px)`;
      (m.bar.querySelector('i') as HTMLElement).style.width = `${(100 * m.hp) / m.maxHp}%`;
    }
  }
}
