// Wings and gliding for the Void Stalker: when the wings deploy (breaking into a run), when he glides (in the air with
// wings out: a running jump, or holding jump while falling), and how the glide flies (slow descent, forward carry,
// gentle steering, banking into turns, lifted and pushed by the wind). Landing folds the wings.
//
// player.ts calls update() once per frame after the jump input, steer() / fall() in place of the air control and
// gravity while `gliding`, and pose() before the rig updates. First person never draws the wings. All the numbers are in GLIDE (the tuning table).
import * as THREE from 'three/webgpu';
import type { CharacterRig } from './characters';
import { windAt } from './secondary';

export const GLIDE = {
  /** Ground speed (m/s) that unfurls the wings, and the speed below which they fold again (hysteresis). */
  runDeploy: 6.5,
  runFold: 4.2,
  /** Seconds the run (or the stop) must last before the wings react: no flicker on a stutter step. */
  deployDelay: 0.12,
  foldDelay: 0.22,
  /** After a landing the wings stay folded this long (landing folds them; a run then reopens them). */
  landLockout: 0.45,
  /** Air time before a held jump counts as "hold to glide" (a tap is just a jump). */
  holdAfter: 0.18,
  /** How open the wings must be before they carry him (they unfurl first when deployed mid-fall). */
  minOpen: 0.65,
  /** Steady sink (m/s) and how quickly vertical speed settles to it (1/s); a hard fall is caught over ~0.4 s. */
  sink: 2.3,
  sinkRate: 3.2,
  /** Airspeed (m/s) the glide settles to, how fast (1/s), and the slowest it carries. */
  speed: 11.5,
  speedRate: 0.7,
  minSpeed: 7,
  /** Largest turn rate (rad/s): gentle, wide arcs. */
  turnRate: 1.6,
  /** Bank (rad) per rad/s of turn, and the most it banks. */
  bankPerTurn: 0.38,
  maxBank: 0.62,
  /** Fraction of the wind's horizontal velocity the glide drifts with. */
  windCarry: 0.85,
  /** Less sink per m/s of headwind (into the wind he floats; downwind he sinks a little more). */
  windLift: 0.14,
  /** Rising air: vertical wind into climb (1 = all of it). */
  updraft: 1,
  /** The wings' spread while gliding: lift (dihedral, rad; negative = flatter than the art's raised wings). */
  glideLift: -0.18,
  /** How much the inside wing drops into a turn (rad of wing lift per rad of bank). */
  wingBank: 0.7,
  /** Third person: radius / distance of the window kept clear of wing round the aim ray (~4 % of screen height). */
  aimClear: 0.075,
  /** Weight of the glide pose clip (wing_hover) over the body. */
  poseWeight: 0.8,
} as const;
export type GlideTuning = { -readonly [K in keyof typeof GLIDE]: number };
/** Live tuning (the Studio or the console may change it): `__rr.player.glide.tune({ sink: 2 })`. */
const T: GlideTuning = { ...GLIDE };


export interface GlideInput {
  onGround: boolean;
  /** Horizontal speed (m/s), vertical speed (m/s, + up). */
  hsp: number;
  vy: number;
  /** Jump held, crouch held (dive: fold and drop), and any combat stance (aiming, blocking, a strike). */
  jumpHeld: boolean;
  crouch: boolean;
  combat: boolean;
  /** Dash / lunge / hang in progress: the glide waits. */
  busy: boolean;
  pos: THREE.Vector3;
}

export class Glide {
  /** True while the glide flies the character (player.ts uses steer() and fall() instead of air control and gravity). */
  gliding = false;
  /** Bank (rad, same convention as player.bank) the glide wants. */
  bank = 0;
  /** Wings wanted open (0/1) and their current openness (from the rig). */
  wantOpen = 0;
  open = 0;
  readonly wind = new THREE.Vector3();
  private hasWings = false;
  private runT = 0; private stopT = 0; private lockT = 0; private airT = 0;
  private fromRun = false; private wasGround = true;
  private airVel = new THREE.Vector3();
  private turnNow = 0;
  private clock = 0;

  tune(p: Partial<GlideTuning>) { Object.assign(T, p); return { ...T }; }
  get tuning() { return { ...T }; }

  update(dt: number, i: GlideInput) {
    this.clock += dt;
    windAt(i.pos, this.clock, this.wind);
    this.lockT = Math.max(0, this.lockT - dt);
    if (!this.hasWings) { this.gliding = false; this.wantOpen = 0; return; }
    if (i.onGround) {
      // landing folds the wings (a real landing: from a glide or a proper fall, not a step down a stair)
      if (!this.wasGround && (this.gliding || this.airT > 0.35)) { this.lockT = T.landLockout; this.wantOpen = 0; }
      this.gliding = false; this.airT = 0;
      // deploy with the run, fold on a stop or in any combat stance
      const running = i.hsp > T.runDeploy && !i.combat && !i.crouch;
      const stopped = i.hsp < T.runFold || i.combat || i.crouch;
      this.runT = running ? this.runT + dt : 0;
      this.stopT = stopped ? this.stopT + dt : 0;
      if (this.lockT > 0) this.wantOpen = 0;
      else if (this.runT > T.deployDelay) this.wantOpen = 1;
      else if (this.stopT > T.foldDelay) this.wantOpen = 0;
    } else {
      if (this.wasGround) this.fromRun = this.open > 0.3;          // left the ground with the wings out
      this.airT += dt;
      const hold = i.jumpHeld && this.airT > T.holdAfter;
      const want = !i.crouch && !i.busy && (this.fromRun || hold);
      if (i.crouch) { this.wantOpen = 0; this.fromRun = false; }     // tuck and drop
      else if (want) this.wantOpen = 1;
      const start = want && i.vy < 0.5 && this.open >= T.minOpen;
      if (start && !this.gliding) this.airVel.set(0, 0, 0);            // set on the first steer()
      this.gliding = start || (this.gliding && want && this.open >= T.minOpen * 0.8);
    }
    this.wasGround = i.onGround;
    if (!this.gliding) { this.bank += (0 - this.bank) * Math.min(1, dt * 6); this.turnNow = 0; }
  }

  /** Glide steering (instead of air control): `vel` (horizontal, m/s) is rewritten; `wish` = wanted direction. */
  steer(vel: THREE.Vector3, wish: THREE.Vector3, dt: number) {
    const wx = this.wind.x * T.windCarry, wz = this.wind.z * T.windCarry;
    if (this.airVel.lengthSq() < 1e-6) {
      // entering the glide: keep the run's heading and speed (relative to the air)
      this.airVel.set(vel.x - wx, 0, vel.z - wz);
      if (this.airVel.lengthSq() < 1) this.airVel.set(-Math.sin(this.lastYaw), 0, -Math.cos(this.lastYaw)).multiplyScalar(T.minSpeed);
    }
    const heading = Math.atan2(this.airVel.x, this.airVel.z);
    let turn = 0;
    if (wish.lengthSq() > 0.01) {
      const want = Math.atan2(wish.x, wish.z);
      const d = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
      turn = THREE.MathUtils.clamp(d * 2.5, -T.turnRate, T.turnRate);
    }
    this.turnNow += (turn - this.turnNow) * Math.min(1, dt * 4);     // roll into turns, not snap
    const h = heading + this.turnNow * dt;
    let sp = this.airVel.length();
    sp += (Math.max(T.speed * (wish.lengthSq() > 0.01 ? 1 : 0.85), T.minSpeed) - sp) * Math.min(1, dt * T.speedRate);
    sp = Math.max(sp, T.minSpeed);
    this.airVel.set(Math.sin(h) * sp, 0, Math.cos(h) * sp);
    vel.set(this.airVel.x + wx, 0, this.airVel.z + wz);
    // bank into the turn (player.bank convention: a left turn, heading increasing, banks negative)
    this.bank += (THREE.MathUtils.clamp(-this.turnNow * T.bankPerTurn, -T.maxBank, T.maxBank) - this.bank) * Math.min(1, dt * 5);
  }
  private lastYaw = 0;

  /** Glide descent (instead of gravity): settles to the sink, less into a headwind, more downwind, plus updrafts. */
  fall(vy: number, dt: number) {
    const sp = Math.max(1e-3, this.airVel.length());
    const head = sp > 0.01 ? -(this.wind.x * this.airVel.x + this.wind.z * this.airVel.z) / sp : 0;   // + = headwind
    const target = -T.sink + head * T.windLift + this.wind.y * T.updraft;
    return vy + (Math.min(target, 1.5) - vy) * Math.min(1, dt * T.sinkRate);
  }

  /** Wing pose and the glide clip on the rig, and in first person the wings drawn without the body. */
  pose(rig: CharacterRig | null, opts: { firstPerson: boolean; yaw: number; scene?: THREE.Object3D | null; camera?: THREE.Camera; pitch?: number }) {
    this.lastYaw = opts.yaw;
    const w = rig?.wings ?? null;
    this.hasWings = !!w;
    if (!rig || !w) return;
    this.open = w.open;
    w.target.open = this.wantOpen;
    w.target.sweep = this.gliding ? 0 : this.wasGround ? 1 : 0.5;
    const base = this.gliding ? T.glideLift : 0;
    const tip = this.gliding ? this.bank * T.wingBank : 0;
    w.target.liftL = base + tip;
    w.target.liftR = base - tip;
    rig.setPoseLayer('wing_hover');                                   // weight 0 unless gliding: it fades in and out
    rig.poseLayerW = this.gliding ? T.poseWeight : 0;
    // first person: the camera is in the head, and your own back is out of sight: the wings are not drawn at all
    // (Kenne: they must never cover the view). They keep simulating, so they're in the right state on switching back.
    const model = rig.root.children[0] ?? rig.root;
    if (w.mesh.parent !== model) model.add(w.mesh);
    w.view = null;
    w.mesh.visible = !opts.firstPerson;
    // third person: the centred camera looks over his back, so keep a small window round the crosshair clear
    w.setAimClear(opts.firstPerson ? null : opts.camera ?? null, T.aimClear);
  }
}
