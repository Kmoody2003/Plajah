// 1st / 3rd-person Soul Vessel controller with swappable classes, capsule physics, touch & gamepad.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { InputState } from './controls';
import { assets, CharacterRig } from './characters';
import { VESSELS, VESSEL_ORDER, buildVesselMesh, type VesselId, type VesselSpec } from './vessels';
import { WEAPONS, WeaponViewmodel, buildWeapon, type ReloadPhases, type WeaponModel, type WeaponSpec } from './weapons';
import { Glide } from './glide';

// Feel: fast, nimble, upbeat. Snappy ground control, full air control at a lower rate,
// double jump, coyote time + jump buffer, and dash charges so movement chains.
// Ground control follows Ravencrest / Era Clash 3D (linear accel toward the wanted velocity, decel a bit harder),
// scaled to Rift Realm's faster runs: ~0.25 s to top speed, ~0.2 s to stop.
const ACCEL = 40;          // m/s²
const DECEL = 50;          // m/s²
const KEY_TURN = 3.6;      // rad/s: A / D turn the character in the follow camera (Era Clash KEY_TURN)
const TURN = 16;           // rad/s: the body turns to face where it's going (Ravencrest TURN)
const FACE_AIM_AFTER = 0.7; // s the body keeps facing the aim after a shot or a strike
const AIR_ACCEL = 26;      // still steerable mid-air
const JUMP_VEL = 10.8;
const DOUBLE_JUMP_VEL = 9.6;
const COYOTE = 0.12;       // can still jump this long after leaving a ledge
const JUMP_BUFFER = 0.14;  // a jump pressed this early before landing still fires
const DASH_TIME = 0.16;
const DASH_CHARGES = 2;
const DASH_RECHARGE = 0.9; // seconds per charge
const DASH_CARRY = 0.55;   // fraction of dash speed kept as momentum afterwards
const BASE_FOV = 72; // matches the camera main.ts creates
const RADIUS = 0.38;
const HEIGHT = 1.8;
const STEP_UP = 0.45;     // tallest step / kerb the character walks up without jumping (m)
const MOUSE_SENS = 0.002;

// Magazine size, reload length / beats, recoil, spread, ADS and switch time are per weapon: WEAPONS in weapons.ts.
/** Seconds on the floor after being downed before the respawn. */
const DOWN_SEC = 2.4;

export class PlayerController {
  readonly object = new THREE.Group();
  vesselMesh = new THREE.Group();
  private rig: CharacterRig | null = null;
  /** Wings deploy on the run; in the air with wings out he glides (glide.ts, tuning in GLIDE). */
  readonly glide = new Glide();
  readonly viewmodel = new THREE.Group();
  /** First-person gun + hands (weapons.ts). */
  readonly weaponVM = new WeaponViewmodel();
  /** Third-person guns on the rig's hand_r_weapon socket, one per vessel (the shown one is visible). */
  private tpGuns = new Map<VesselId, WeaponModel>();
  private tpShown: VesselId | null = null;

  vessel: VesselSpec = VESSELS.aegis;
  yaw = 0;
  pitch = -0.08;
  firstPerson = false;

  private camDist = 3.6;
  private thirdDist = 3.6;
  private boom = 3.6;                       // collision-limited boom length: snaps in, eases back out
  private follow = new THREE.Vector3();     // eased camera pivot (smooths stair steps and landings)
  private followInit = false;
  mouseSens = (() => { try { return Number(localStorage.getItem('rift-realm-mouse-sens')) || 1; } catch { return 1; } })();
  private vel = new THREE.Vector3();
  private vy = 0;
  private onGround = true;
  private dashTimer = 0;
  private dashDir = new THREE.Vector3();
  private dashCharges = DASH_CHARGES;
  private dashRecharge = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private airJumps = 1;
  private spaceHeld = false;
  private lean = 0;
  /** Body facing (same convention as `yaw`: forward = -Z turned by it). The camera / aim is `yaw`; the body turns
   *  toward where it's moving (Ravencrest / Era Clash action controls) and faces the aim while aiming or shooting. */
  bodyYaw = 0;
  private bank = 0;
  private faceAimT = 0;
  /** Crosshair bloom 0…1 (Fortnite-style): grows with speed, air time and each shot, settles when you stand still;
   *  aiming down sights tightens it. Shots spread by `spreadMul`, the reticle grows with it. */
  bloom = 0;
  /** View kick still to recover (radians of pitch); a shot kicks the aim up and about 60 % comes back down. */
  private recoilBack = 0;
  /** Rounds left per vessel's magazine (one round = one trigger pull; Seraph's 3-shot burst is one round). */
  private mags: Partial<Record<VesselId, number>> = {};
  private reloadT = 0;
  private reloadLen = 1;
  private reloadP = -1;
  private autoReloadT = 0;
  /** Weapon switch: seconds left / total; the gun swaps half-way (lowered out of view). */
  private switchT = 0;
  private switchLen = 1;
  /** Recoil pattern position and the time since the last shot (the pattern restarts after a pause). */
  private recoilN = 0;
  private sinceShot = 9;
  /** Chord Repeater barrel cycle. */
  private tipN = 0;
  /** Crouched (C toggles, Ctrl holds, D-pad down on a pad): slower, quieter, tighter bloom. */
  crouched = false;
  /** Movement multiplier from the world's dangers (thorns, swamp water, shock — danger/status.ts). */
  moveMul = 1;
  private crouchToggle = false;
  /** Seconds left lying on the floor after being downed (death clip held), then onRespawn. */
  private downedT = 0;
  private onDownedDone?: () => void;
  private lockT = 0;
  private clock = 0;
  private landKick = 0;
  readonly keys = new Set<string>();
  private lastSafe = new THREE.Vector3(0, 0.2, 8);
  private muzzleFlash = 0;

  world: CollisionWorld | null = null;
  enabled = false;
  /** Aiming down sights (hold right mouse): zoomed view, tighter shots, slower look and move. */
  aiming = false;
  /** Aim friction (targeting sets it): look speed multiplier while the crosshair is on an enemy, so you don't sail past. */
  aimFriction = 1;
  /** 0 = centred camera (fists, glide), 1 = over-the-shoulder (gun out). */
  private shoulderT = 1;
  /** A / D are turning the character this frame (the Era Clash follow camera) rather than strafing. */
  private keyTurning = false;
  /** 0..1 toward the glide framing (camera back and lower while gliding). */
  private glideCam = 0;
  /** Hand-to-hand: the gun is holstered, fire and right mouse throw strikes (setFists). */
  fists = false;
  onFists?: (on: boolean) => void;
  /** True while locked on: sideways look movement collects in flickX (a flick switches target) instead of turning. */
  lockedOn = false;
  flickX = 0;
  /** 0…1, eased toward `aiming` — the camera, look speed and the reticle follow it. */
  aimBlend = 0;
  hp = 130;
  maxHp = 130;

  onToggleView?: (fp: boolean) => void;
  onDash?: () => void;
  onSwitchVessel?: (spec: VesselSpec) => void;
  onSoulSurge?: () => void;
  onStrike?: () => void;
  /** A reload started (sound). */
  onReload?: () => void;
  /** A reload beat passed (mag release / out / in / charge): the weapon's sound for it plays. */
  onReloadBeat?: (beat: keyof ReloadPhases, spec: WeaponSpec) => void;
  /** Trigger pulled on an empty magazine (dry click). */
  onDryFire?: (spec: WeaponSpec) => void;
  /** A weapon switch started (sound). */
  onWeaponSwitch?: (spec: WeaponSpec) => void;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.object.position.copy(this.lastSafe);
    this.viewmodel.add(this.weaponVM.root);
    this.camera.add(this.viewmodel);
    this.viewmodel.visible = false;
    this.setVessel('aegis');

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.triggerDash();
      if (e.code === 'KeyQ') this.onSoulSurge?.();
      if (e.code === 'KeyF' || e.code === 'KeyE') { if (!this.onStrike) this.strikeAnim(); this.onStrike?.(); }
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyC') this.crouchToggle = !this.crouchToggle;
      if (e.code === 'Digit1') this.setVessel('aegis');
      if (e.code === 'Digit2') this.setVessel('stalker');
      if (e.code === 'Digit3') this.setVessel('seraph');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // a key released while the window wasn't focused never sends keyup: drop held keys when focus goes, or the
    // character runs on by itself (clicking over to another window mid-run did exactly that)
    const releaseKeys = () => this.keys.clear();
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });

    dom.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      // pointer-lock glitch spikes (a jump of 90+ px in one event) are dropped, as in Ravencrest
      if (Math.abs(e.movementX) > 90 || Math.abs(e.movementY) > 90) return;
      const ads = (1 - this.aimBlend * (1 - this.weapon.adsSens)) * this.aimFriction;
      if (this.lockedOn) this.flickX += e.movementX;
      this.yaw -= e.movementX * MOUSE_SENS * this.mouseSens * ads;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_SENS * this.mouseSens * 0.85 * ads, -1.25, 1.25);
    });
    // mouse wheel sets the 3rd-person camera distance (Ravencrest: 1.6 to 7 m)
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled || this.firstPerson) return;
      this.thirdDist = THREE.MathUtils.clamp(this.thirdDist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 1.6, 7);
    }, { passive: true });
    // - / = step the mouse sensitivity (saved), the shared scheme across the Plajah action games
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Minus' && e.code !== 'Equal') return;
      this.mouseSens = THREE.MathUtils.clamp(this.mouseSens * (e.code === 'Equal' ? 1.2 : 1 / 1.2), 0.2, 3); // same range as the Settings screen
      try { localStorage.setItem('rift-realm-mouse-sens', String(this.mouseSens)); } catch { /* private mode */ }
    });
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.camDist = this.boom = this.firstPerson ? 0 : this.thirdDist; // cut straight to the new view, no dolly
    this.vesselMesh.visible = !this.firstPerson;
    this.viewmodel.visible = this.firstPerson && !this.fists;
    this.onToggleView?.(this.firstPerson);
  }

  cycleVessel() {
    const idx = VESSEL_ORDER.indexOf(this.vessel.id);
    const next = VESSEL_ORDER[(idx + 1) % VESSEL_ORDER.length];
    this.setVessel(next);
  }

  setVessel(id: VesselId) {
    const spec = VESSELS[id];
    if (this.vessel.id !== id && this.downedT <= 0 && this.enabled) {
      // lower the old gun, raise the new one (the body's mocap switch, squeezed); a running reload is dropped
      this.reloadT = 0;
      this.switchLen = this.switchT = WEAPONS[id].switchSec;
      this.rig?.play('switch_weapon', 0.9, Math.max(0.6, this.switchLen * 1.6));
      this.onWeaponSwitch?.(WEAPONS[id]);
    }
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.vessel = spec;
    this.maxHp = spec.maxHp;
    this.hp = Math.max(1, Math.round(spec.maxHp * hpRatio));

    this.object.remove(this.vesselMesh);
    if (assets.stalker) {
      // the Void Stalker is the playable body for every vessel class; the class sets stats + weapon
      if (!this.rig) {
        this.rig = new CharacterRig(assets.stalker, 1.9);
        const wrap = new THREE.Group();
        this.rig.root.rotation.y = Math.PI; // rig faces +Z, the player's forward is -Z
        wrap.add(this.rig.root);
        this.vesselMesh = wrap;
      }
    } else {
      this.vesselMesh = buildVesselMesh(spec);
    }
    this.vesselMesh.visible = !this.firstPerson;
    this.object.add(this.vesselMesh);

    this.weaponVM.select(id);
    this.weaponVM.setTrim(spec.primaryColor);
    if (this.switchT <= 0) this.showTpGun(id);

    this.onSwitchVessel?.(spec);
  }

  /** Switch between gun and hand-to-hand on the fly: the gun is put away (both views) and comes back out. */
  setFists(on: boolean) {
    if (this.fists === on) return;
    this.fists = on;
    this.viewmodel.visible = this.firstPerson && !on;
    for (const [k, g] of this.tpGuns) g.root.visible = !on && k === this.tpShown;
    this.rig?.play(on ? 'switch_weapon' : 'switch_weapon', 0.7, 0.45);
    this.onFists?.(on);
  }

  /** Hang the vessel's gun in the rig's right hand (hand_r_weapon socket); built once per vessel. */
  private showTpGun(id: VesselId) {
    if (this.tpShown === id || !this.rig) return;
    const socket = this.rig.socket('hand_r_weapon');
    if (!socket) return;
    let m = this.tpGuns.get(id);
    if (!m) {
      m = buildWeapon(id);
      const spec = WEAPONS[id];
      // the socket sits inside the scaled skeleton: undo its scale so the gun keeps its real size
      const holder = new THREE.Group();
      socket.updateWorldMatrix(true, false);
      const ws = socket.getWorldScale(new THREE.Vector3());
      holder.scale.setScalar(1 / Math.max(1e-4, ws.x));
      holder.rotation.set(...spec.tpOffset.rot);
      holder.position.set(...spec.tpOffset.pos);
      holder.add(m.root);
      socket.add(holder);
      this.tpGuns.set(id, m);
      this.rig.grip('Right', 'dagger');
    }
    for (const [k, g] of this.tpGuns) g.root.visible = k === id && !this.fists;
    this.tpShown = id;
  }

  /** The current weapon's handling table. */
  get weapon(): WeaponSpec { return WEAPONS[this.vessel.id]; }

  /** Place the player at a spawn point facing `yaw`. */
  spawnAt(pos: THREE.Vector3, yaw: number) {
    this.object.position.copy(pos);
    this.lastSafe.copy(pos);
    this.yaw = yaw;
    this.bodyYaw = yaw;
    this.vel.set(0, 0, 0);
    this.vy = 0;
  }

  private strikeN = 0;
  /** Melee strikes alternate the motion-captured slashes (leap slash, spin-arc slash). */
  private strikeAnim() { this.faceAimT = FACE_AIM_AFTER; this.rig?.play(this.strikeN++ % 2 ? 'attack_3' : 'attack_1', 0.85); }

  // ── combat hooks (combat/melee.ts drives these: the fighting-game moves, block, lunges, air strings) ──
  /** 0..1 movement allowed (an attack's recovery / hit-stun slows you), and guarding. */
  moveLock = 1;
  blocking = false;
  private lungeT = 0;
  private lungeV = new THREE.Vector3();
  private hangT = 0;
  /** Travel toward a target over `time` s (an attack's step-in / the dash strike). */
  lunge(dir: THREE.Vector3, speed: number, time: number) { this.lungeV.copy(dir).setY(0).normalize().multiplyScalar(speed); this.lungeT = time; }
  /** A hop (follow a launcher up). */
  hop(vy: number) { this.vy = Math.max(this.vy, vy); this.onGround = false; }
  /** Hang in the air for `time` s (air strings don't drop you). */
  airHang(time: number) { this.hangT = Math.max(this.hangT, time); if (this.vy < 0) this.vy = 0; }
  /** Face the aim for a moment (a strike / a block turns the body). */
  faceAim(t = FACE_AIM_AFTER) { this.faceAimT = Math.max(this.faceAimT, t); }
  get grounded() { return this.onGround; }
  hasClip(name: string) { return !!this.rig?.has(name); }
  get dashing() { return this.dashTimer > 0; }
  /** A hit or block through the coat, tabard and wings (m/s, world). */
  shove(v: THREE.Vector3) { this.rig?.shove(v); }

  /** Magazine size of the current vessel's weapon (trigger pulls). */
  get magSize() { return this.weapon.magSize; }
  /** Rounds left in the current magazine. */
  get ammo() { return this.mags[this.vessel.id] ?? this.magSize; }
  get reloading() { return this.reloadT > 0; }
  /** 0…1 progress of the running reload (for the HUD). */
  get reloadProgress() { return this.reloadT > 0 ? 1 - this.reloadT / this.reloadLen : 1; }
  get switching() { return this.switchT > 0; }
  get downed() { return this.downedT > 0; }
  /** Play a one-shot on the body (e.g. 'get_up' after being downed). */
  playClip(name: string, weight = 1, seconds?: number) { this.rig?.play(name, weight, seconds); }

  /** Reload (R, D-pad left; automatic when the magazine runs dry): the motion-captured rifle / pistol reload,
   *  squeezed to RELOAD_SEC. No firing until it's done. */
  reload() {
    if (!this.enabled || this.reloadT > 0 || this.switchT > 0 || this.downedT > 0 || this.ammo >= this.magSize) return false;
    const w = this.weapon;
    this.reloadLen = this.reloadT = w.reloadSec;
    this.reloadP = 0;
    this.autoReloadT = 0;
    this.rig?.play(w.reloadClip, 1, w.reloadSec);
    this.onReload?.();
    return true;
  }

  /** Spend a round for a trigger pull; false = can't fire (reloading, down, or empty → starts the reload). */
  useRound() {
    if (this.reloadT > 0 || this.switchT > 0 || this.downedT > 0) return false;
    const left = this.ammo;
    if (left <= 0) {
      // dry fire: the trigger clicks on an empty chamber, then the reload starts by itself
      this.weaponVM.dryFire();
      this.onDryFire?.(this.weapon);
      if (this.autoReloadT <= 0) this.autoReloadT = 0.22;
      return false;
    }
    this.mags[this.vessel.id] = left - 1;
    if (left - 1 === 0) this.autoReloadT = 0.3; // let the last shot's recoil play, then reload
    return true;
  }

  /** Took a hit: flinch (light) or stagger (heavy) from the mocap footage — not over a reload or while down. */
  takeHit(dmg: number) {
    if (this.downedT > 0 || this.reloadT > 0 || !this.rig) return;
    this.rig.play(dmg >= 20 ? 'hit_heavy' : 'hit', dmg >= 20 ? 0.9 : 0.7, dmg >= 20 ? 0.9 : 0.5);
  }

  /** Downed: the death fall plays and holds for DOWN_SEC (no control), then `onDone` (respawn) runs. */
  goDown(onDone: () => void) {
    if (this.downedT > 0) return;
    this.downedT = DOWN_SEC;
    this.reloadT = 0;
    this.onDownedDone = onDone;
    if (!this.rig?.hold(Math.random() < 0.5 ? 'death' : 'death_back')) { this.downedT = 0.01; }
  }

  /** Spread multiplier for the next shot: hip fire on the move is loose, standing ADS is near-exact. */
  get spreadMul() { return (0.25 + this.bloom * 1.25) * (1 - this.aimBlend * (1 - this.weapon.spread.adsMul)); }
  /** Cone (radians) for the next shot: the vessel's pellet spread scaled by bloom, plus the weapon's hip bloom. */
  spreadRad(base: number) { return base * this.spreadMul + this.weapon.spread.hip * this.bloom * (1 - this.aimBlend); }

  /** A shot's kick from the weapon's recoil pattern: the aim climbs (less while aiming), steps sideways along the
   *  pattern, and part of it recovers by itself; bloom grows; the first-person gun kicks back. */
  recoil() {
    const r = this.weapon.recoil;
    if (this.sinceShot > r.resetSec) this.recoilN = 0;
    this.sinceShot = 0;
    const ads = 1 - this.aimBlend * 0.45;
    const k = r.pitch * ads;
    this.pitch = THREE.MathUtils.clamp(this.pitch + k, -1.25, 1.25);
    this.yaw -= (r.yaw[this.recoilN % r.yaw.length] ?? 0) * ads;
    this.recoilN++;
    this.recoilBack += k * r.recover;
    this.bloom = Math.min(1, this.bloom + this.weapon.spread.bloomPerShot);
    this.weaponVM.kick(this.weapon, this.aimBlend);
  }

  triggerMuzzleFlash() {
    this.muzzleFlash = 1;
    this.faceAimT = FACE_AIM_AFTER;
    this.rig?.play('shoot', 0.9);
  }

  /** Dash charges left (0..2) and the refill progress of the next one (0..1), for the HUD. */
  get dashState() { return { charges: this.dashCharges, max: DASH_CHARGES, refill: this.dashRecharge / DASH_RECHARGE }; }

  private triggerDash(moveX = 0, moveY = 0) {
    if (this.dashTimer > 0 || this.dashCharges <= 0) return;
    this.dashCharges--;
    this.rig?.play('dash', 0.85); // the motion-captured sprint-lunge
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = new THREE.Vector3();
    if (this.keys.has('KeyW')) dir.add(forward);
    if (this.keys.has('KeyS')) dir.sub(forward);
    if (this.keys.has('KeyD')) dir.add(right);
    if (this.keys.has('KeyA')) dir.sub(right);
    if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
      dir.addScaledVector(right, moveX).addScaledVector(forward, moveY);
    }
    if (dir.lengthSq() < 0.01) dir.copy(forward);
    this.dashDir.copy(dir.normalize());
    this.dashTimer = DASH_TIME;
    if (this.vy < 0) this.vy = 0; // an air dash hangs instead of dropping
    this.onDash?.();
  }

  /** Lock-on: turn the view toward a world point (eased, `rate` per second); the mouse still adds on top. */
  aimAt(point: THREE.Vector3, dt: number, rate = 9, square = true) {
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const d = point.clone().sub(eye);
    const len = d.length();
    if (len < 0.5) return;
    const yaw = Math.atan2(-d.x, -d.z), pitch = Math.asin(THREE.MathUtils.clamp(d.y / len, -1, 1));
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = 1 - Math.exp(-dt * rate);
    if (square) this.lockT = 0.25; // locked on: the body squares up to the target (strafing round it)
    this.yaw += dy * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (pitch - this.pitch) * k, -1.25, 1.25);
  }

  /** World-space origin & direction for hitscan/projectile firing. */
  getAimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
    // third person: the camera sits metres behind the shoulder, so start the shot where the view ray passes the
    // character — a tree or wall between the camera and the body must not eat the shot
    if (!this.firstPerson) {
      const chest = this.chestPos(_chest);
      const t = Math.max(0, chest.sub(origin).dot(dir) - 0.4);
      origin.addScaledVector(dir, t);
    }
    return { origin, dir };
  }

  /** The highest ground under the capsule's footprint (centre + 4 points at 70 % of the radius), or null. */
  private footGround(pos: THREE.Vector3): number | null {
    if (!this.world) return null;
    let best: number | null = null;
    const r = RADIUS * 0.7;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const g = this.world.groundAt(pos.x + ox, pos.z + oz, pos.y + STEP_UP, STEP_UP + 0.4);
      if (g !== null && (best === null || g > best)) best = g;
    }
    return best;
  }

  /** Chest height on the character (line-of-sight checks in third person start here). */
  chestPos(out = new THREE.Vector3()) { return out.copy(this.object.position).setY(this.object.position.y + (this.crouched ? 1.0 : 1.35)); }

  private handBones: { hand: THREE.Object3D; fore: THREE.Object3D } | null | undefined;
  /** The blade edge of the right hand for melee trails: base at the hand, tip 0.75 m on past it along the forearm
   *  (the Void Stalker swings blades; the gun vessels swing the gun). False in first person or without a rig. */
  bladeEdge(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    if (this.firstPerson || !this.rig) return false;
    if (this.handBones === undefined) {
      let hand: THREE.Object3D | undefined, fore: THREE.Object3D | undefined;
      this.rig.root.traverse((o) => { if (/RightHand$/.test(o.name)) hand = o; else if (/RightForeArm$/.test(o.name)) fore = o; });
      this.handBones = hand && fore ? { hand, fore } : null;
    }
    if (!this.handBones) return false;
    this.handBones.hand.getWorldPosition(base);
    this.handBones.fore.getWorldPosition(tip);
    tip.subVectors(base, tip).normalize().multiplyScalar(0.75).add(base);
    base.lerp(tip, 0.15);
    return true;
  }

  /** The barrel tip in the world: the first-person gun's muzzle socket, or the third-person gun in the hand. The
   *  Chord Repeater cycles its three barrels (`next` advances the cycle for a new shot). */
  getMuzzleWorldPos(next = false): THREE.Vector3 {
    const m = this.firstPerson ? this.weaponVM.model() : this.tpShown ? this.tpGuns.get(this.tpShown) : undefined;
    if (m && (this.firstPerson || m.root.visible)) {
      if (next) this.tipN++;
      const tip = m.tips ? m.tips[this.tipN % m.tips.length] : m.muzzle;
      tip.updateWorldMatrix(true, false);
      return tip.getWorldPosition(new THREE.Vector3());
    }
    if (this.firstPerson) return this.camera.localToWorld(new THREE.Vector3(0.22, -0.15, -0.65));
    return this.object.localToWorld(new THREE.Vector3(0.32, 1.32, -0.45));
  }

  update(dt: number, pulse: number, input?: InputState) {
    this.clock += dt;
    // recoil recovery: the kick comes back down over ~0.15 s
    if (this.recoilBack > 0) { const r = Math.min(this.recoilBack, dt * 0.35 + this.recoilBack * dt * 9); this.pitch -= r; this.recoilBack -= r; }
    this.faceAimT = Math.max(0, this.faceAimT - dt);
    // reload / auto-reload / downed timers
    this.sinceShot += dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      // the reload's beats (mag release, out, in, charge) raise their sounds, in either view
      const p = 1 - Math.max(0, this.reloadT) / this.reloadLen, ph = this.weapon.phases;
      for (const k of ['release', 'out', 'in', 'charge'] as const) if (this.reloadP < ph[k] && p >= ph[k]) this.onReloadBeat?.(k, this.weapon);
      this.reloadP = p;
      if (this.reloadT <= 0) { this.reloadT = 0; this.reloadP = -1; this.mags[this.vessel.id] = this.magSize; }
    } else this.reloadP = -1;
    if (this.switchT > 0) {
      this.switchT = Math.max(0, this.switchT - dt);
      if (this.switchT <= this.switchLen / 2) this.showTpGun(this.vessel.id);
    }
    if (this.autoReloadT > 0) { this.autoReloadT -= dt; if (this.autoReloadT <= 0) this.reload(); }
    if (this.downedT > 0) {
      this.downedT -= dt;
      if (this.downedT <= 0) { this.downedT = 0; this.rig?.release(); this.mags = {}; const cb = this.onDownedDone; this.onDownedDone = undefined; cb?.(); }
    }
    this.crouched = this.downedT <= 0 && (this.crouchToggle || this.keys.has('ControlLeft') || this.keys.has('ControlRight') || !!input?.crouchHeld);
    if (input?.crouchPressed) this.crouchToggle = !this.crouchToggle;
    if (input?.reloadPressed) this.reload();
    if (this.rig) this.rig.crouch = this.crouched;
    this.lockT = Math.max(0, this.lockT - dt);
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();

    if (this.enabled && this.downedT <= 0) {
      if (input) {
        if (input.lookDeltaX || input.lookDeltaY) {
          if (this.lockedOn) this.flickX += input.lookDeltaX;
          this.yaw -= input.lookDeltaX * MOUSE_SENS * this.mouseSens * this.aimFriction;
          this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDeltaY * MOUSE_SENS * this.mouseSens * 0.85 * this.aimFriction, -1.25, 1.25);
        }
        if (input.toggleViewPressed) this.toggleView();
        if (input.cycleVesselPressed) this.cycleVessel();
        if (input.dashPressed) this.triggerDash(input.moveX, input.moveY);
        if (input.surgePressed) this.onSoulSurge?.();
        if (input.strikePressed) { if (!this.onStrike) this.strikeAnim(); this.onStrike?.(); }
        wish.addScaledVector(right, input.moveX).addScaledVector(forward, input.moveY);
      }

      const k = this.keys;
      const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      // Gun out (both views): the shooter scheme — the mouse aims, A / D strafe (Fortnite / CoD).
      // Fists in third person: the Era Clash follow camera — A / D turn the character and the camera with him, W / S
      // go along the facing (S backs up slower), the mouse mostly looks up / down. Locked on or aiming, A / D strafe.
      this.keyTurning = this.fists && !this.firstPerson && !this.lockedOn && this.aimBlend < 0.5 && !this.glide.gliding;
      if (this.keyTurning) {
        if (ix) this.yaw -= ix * KEY_TURN * (iz ? 0.85 : 1.15) * dt;
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        if (iz > 0) wish.add(fwd); else if (iz < 0) wish.addScaledVector(fwd, -0.45);
      } else {
        if (iz > 0) wish.add(forward); else if (iz < 0) wish.sub(forward);
        if (ix > 0) wish.add(right); else if (ix < 0) wish.sub(right);
      }
      if (wish.lengthSq() > 1) wish.normalize();

      // edge-triggered jump (held Space doesn't bunny-hop by itself), buffered so early presses count
      const space = this.keys.has('Space');
      if ((space && !this.spaceHeld) || input?.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
      this.spaceHeld = space;
    }

    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        this.vy = JUMP_VEL;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (this.airJumps > 0) {
        this.vy = DOUBLE_JUMP_VEL;
        this.airJumps--;
        this.jumpBuffer = 0;
        this.rig?.play('attack_2', 0.6); // flip-ish flourish on the double jump
      }
    }

    // wings + glide: deploy on the run, glide in the air with wings out (running jump, or hold jump while falling)
    this.glide.update(dt, {
      onGround: this.onGround, hsp: Math.hypot(this.vel.x, this.vel.z), vy: this.vy,
      jumpHeld: this.enabled && this.spaceHeld, crouch: this.crouched,
      combat: this.aiming || this.blocking || this.moveLock < 1,
      busy: this.dashTimer > 0 || this.lungeT > 0 || this.hangT > 0 || this.downedT > 0, pos: this.object.position,
      groundBelow: this.glide.gliding && this.world ? this.object.position.y - (this.world.groundAt(this.object.position.x, this.object.position.z, this.object.position.y, 40) ?? -1e9) : undefined,
    });

    // dash charges refill one at a time
    if (this.dashCharges < DASH_CHARGES) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_RECHARGE) { this.dashRecharge = 0; this.dashCharges++; }
    }

    if (this.lungeT > 0) {
      this.lungeT -= dt;
      this.vel.copy(this.lungeV);
      if (this.lungeT <= 0) this.vel.multiplyScalar(0.25);
    } else if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(this.vessel.dashSpeed);
      if (this.dashTimer <= 0) this.vel.multiplyScalar(DASH_CARRY); // keep the momentum, don't stop dead
    } else {
      const target = wish.multiplyScalar(this.vessel.moveSpeed * (1 - this.aimBlend * 0.08) * (this.crouched ? 0.45 : 1) * this.moveLock * (this.blocking ? 0.45 : 1) * this.moveMul);
      const moving = wish.lengthSq() > 0;
      if (this.onGround) {
        // Ravencrest / Era Clash: a straight-line change toward the wanted velocity at a fixed rate
        const dv = target.clone().sub(this.vel).setY(0);
        const step = (target.lengthSq() > this.vel.lengthSq() ? ACCEL : DECEL) * dt;
        if (dv.length() > step) dv.setLength(step);
        this.vel.add(dv);
      } else if (this.glide.gliding) this.glide.steer(this.vel, wish, dt);
      else this.vel.lerp(target, Math.min(1, (moving ? AIR_ACCEL : 2) * dt));
    }

    if (this.hangT > 0) { this.hangT -= dt; this.vy = Math.max(this.vy - this.vessel.gravity * dt * 0.3, -1.5); } // air string hang
    else if (this.glide.gliding) this.vy = this.glide.fall(this.vy, dt);
    else this.vy -= this.vessel.gravity * dt * (this.vy < 0 ? 1.35 : 1); // falls faster than it rises: snappy arcs
    // sub-step so a 34 m/s dash can't tunnel through a thin wall (≤ 0.25 m per collision pass)
    const travel = Math.hypot(this.vel.x * dt, this.vy * dt, this.vel.z * dt);
    const steps = this.world ? Math.min(6, Math.max(1, Math.ceil(travel / 0.25))) : 1;
    const wasAir = !this.onGround;
    const fallVy = this.vy;
    let grounded = false;
    for (let s = 0; s < steps; s++) {
      const pos = this.object.position;
      _before.copy(pos);
      pos.addScaledVector(this.vel, dt / steps);
      pos.y += (this.vy * dt) / steps;
      if (this.world) {
        const res = this.world.resolve(pos, RADIUS, HEIGHT);
        if (res.onGround && this.vy < 0) this.vy = 0;
        grounded = res.onGround;
        // walk up stairs and kerbs: on the ground and blocked sideways, look for a step just ahead (the ground a
        // capsule-radius in front, no higher than STEP_UP) and lift onto it, then carry on the move
        if ((grounded || this.onGround) && this.vy <= 0.5) {
          _want.set(this.vel.x, 0, this.vel.z).multiplyScalar(dt / steps);
          const wl = _want.length();
          if (wl > 1e-4) {
            const got = (pos.x - _before.x) * _want.x / wl + (pos.z - _before.z) * _want.z / wl;
            if (got < wl * 0.7) {
              const ux = _want.x / wl, uz = _want.z / wl;
              let gAhead: number | null = null;
              for (const reach of [RADIUS + 0.06, RADIUS + 0.2]) {
                const g = this.world.groundAt(_before.x + ux * reach, _before.z + uz * reach, _before.y + STEP_UP + 0.05, STEP_UP + 0.1);
                if (g !== null && (gAhead === null || g > gAhead)) gAhead = g;
              }
              if (gAhead !== null && gAhead > _before.y + 0.03 && gAhead <= _before.y + STEP_UP + 0.01) {
                _trial.copy(_before).add(_want).setY(gAhead + 0.02);
                this.world.resolve(_trial, RADIUS, HEIGHT);
                const gotT = (_trial.x - _before.x) * ux + (_trial.z - _before.z) * uz;
                if (gotT > got + wl * 0.2 && _trial.y >= gAhead - 0.05) {
                  pos.copy(_trial); grounded = true; if (this.vy < 0) this.vy = 0;
                }
              }
            }
          }
        }
        // stand on the highest ground under the body's footprint: lifts it out of stair edges it was sinking into,
        // and keeps it glued to stairs and slopes on the way down instead of bouncing off each step
        if ((grounded || (this.onGround && this.vy <= 0)) && this.lungeT <= 0) {
          const g = this.footGround(pos);
          if (g !== null) {
            const d = g - pos.y;
            if (d > 0.06 && d <= STEP_UP) { pos.y = g; grounded = true; }
            else if (d < -0.02 && d > -0.38 && this.vy <= 0) { pos.y = g; grounded = true; this.vy = 0; }
          }
        }
      }
    }

    if (this.world) {
      this.onGround = grounded;
      if (this.onGround) {
        this.airJumps = 1;
        if (wasAir && fallVy < -6) this.landKick = Math.min(1, -fallVy / 22);
        if (wasAir && fallVy < -13) this.rig?.play('land', 0.85); // the Void Stalker's crouched landing (motion video)
      }
    }

    // out of the world: 20 m under the ground in an open world (its vale and gorge lie far below y = 0), else y < -12
    const pp = this.object.position, field = this.world?.terrain;
    const floor = field ? field.heightAt(pp.x, pp.z, pp.y + 1) - 20 : -12;
    if (pp.y < floor) {
      this.object.position.copy(this.lastSafe);
      this.vel.set(0, 0, 0);
      this.vy = 0;
    } else if (this.onGround) {
      this.lastSafe.copy(this.object.position);
    }

    this.object.rotation.y = this.yaw;
    // Body facing (Ravencrest / Era Clash action controls): it turns toward where it's going at TURN rad/s, the
    // shortest way round, banking into the turn; aiming, first person, lock-on and the moment after a shot or a
    // strike square it up to the aim instead, so the gun points down the crosshair and the legs strafe.
    const hsp0 = Math.hypot(this.vel.x, this.vel.z);
    // bloom follows movement (running ~half open, airborne more), and settles at ~2.5 /s once you stand still
    const bloomT = Math.min(1, (hsp0 / 9) * 0.5 + (this.onGround ? 0 : 0.55)) * (this.crouched ? 0.6 : 1);
    this.bloom += (bloomT - this.bloom) * Math.min(1, dt * (bloomT > this.bloom ? 6 : 2.5));
    // gun out: the body always faces the aim and the legs strafe (Fortnite / CoD); the fists follow camera keeps the
    // body facing the way it turns (backing up with S doesn't spin him round)
    const faceAim = this.firstPerson || this.aiming || this.faceAimT > 0 || this.lockT > 0 || this.keyTurning || (!this.fists && !this.glide.gliding);
    let want: number | null = null;
    if (faceAim) want = this.yaw;
    else if (hsp0 > 0.6) want = Math.atan2(-this.vel.x, -this.vel.z);
    let turned = 0;
    if (want !== null) {
      const d = Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw));
      turned = THREE.MathUtils.clamp(d, -TURN * dt, TURN * dt);
      this.bodyYaw += turned;
    }
    const bankT = this.glide.gliding ? this.glide.bank : faceAim ? 0 : THREE.MathUtils.clamp(-(turned / Math.max(dt, 1e-3)) * 0.035 * Math.min(1, hsp0 / 9), -0.22, 0.22);
    this.bank += (bankT - this.bank) * (1 - Math.exp(-dt * 10));
    // the camera stays on the mouse: a camera that turns itself bends camera-relative movement into circles
    // (Ravencrest's own rule); the mouse is also the aim here
    this.object.rotation.y = this.yaw;
    this.vesselMesh.rotation.set(0, this.bodyYaw - this.yaw, this.bank, 'YXZ');
    if (this.rig) {
      const sp = hsp0;
      const lx = this.vel.x * Math.cos(this.bodyYaw) - this.vel.z * Math.sin(this.bodyYaw);
      const lz = -(this.vel.x * Math.sin(this.bodyYaw) + this.vel.z * Math.cos(this.bodyYaw));
      this.rig.aimPitch = this.firstPerson ? 0 : this.pitch; // the chest and gun follow the aim up and down
      this.glide.pose(this.rig, { firstPerson: this.firstPerson, yaw: this.bodyYaw, scene: this.object.parent, camera: this.camera, pitch: this.pitch });
      this.rig.update(dt, sp, lx, lz);
    } else {
      this.vesselMesh.position.y = Math.sin(performance.now() * 0.004) * 0.05 + pulse * 0.04;
    }

    // into ADS over the weapon's adsSec (no ADS mid-reload or mid-switch)
    const adsWant = this.aiming && this.enabled && this.reloadT <= 0 && this.switchT <= 0 ? 1 : 0;
    this.aimBlend = THREE.MathUtils.lerp(this.aimBlend, adsWant, Math.min(1, dt * 2.2 / Math.max(0.05, this.weapon.adsSec)));
    // aiming pulls the 3rd-person camera in over the shoulder
    // gliding: the camera eases back ~1.2 m and drops toward the body so the prone flyer and his whole wingspan
    // stay on screen (the wings session's framing note); eased so take-off and landing don't jolt
    this.glideCam += ((this.glide.gliding ? 1 : 0) - this.glideCam) * (1 - Math.exp(-dt * 3.5));
    const targetDist = this.firstPerson ? 0 : THREE.MathUtils.lerp(this.thirdDist, Math.min(this.thirdDist, 2.6), this.aimBlend) + this.glideCam * 1.2;
    this.camDist = THREE.MathUtils.lerp(this.camDist, targetDist, Math.min(1, dt * 14));

    // speed feel: FOV opens with speed and kicks on a dash; a little lean into strafes; landing dip
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    const fovTarget = THREE.MathUtils.lerp(BASE_FOV + Math.min(12, hsp * 0.55) + (this.dashTimer > 0 ? 6 : 0), BASE_FOV * (this.firstPerson ? this.weapon.adsFov : Math.max(0.82, this.weapon.adsFov)), this.aimBlend);
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fovTarget, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
    const strafeSpeed = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.lean = THREE.MathUtils.lerp(this.lean, -strafeSpeed * 0.006, Math.min(1, dt * 8));
    this.landKick = Math.max(0, this.landKick - dt * 5);

    // the camera pivot eases after the body (Ravencrest: 1-exp(-dt*16), snaps if it falls 2.5 m behind),
    // so stair steps and landings don't jolt the view; first person stays locked to the eyes
    const rawEye = this.object.position.clone().add(new THREE.Vector3(0, 1.58 - this.landKick * 0.18, 0));
    if (!this.followInit || this.follow.distanceTo(rawEye) > 2.5 || this.firstPerson) { this.follow.copy(rawEye); this.followInit = true; }
    else this.follow.lerp(rawEye, 1 - Math.exp(-dt * 18));
    const eyePos = this.firstPerson ? rawEye : this.follow.clone().setX(rawEye.x).setZ(rawEye.z); // ease height only: aim stays exact
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    if (this.camDist < 0.12) {
      this.camera.position.copy(eyePos);
      this.camera.lookAt(eyePos.clone().add(lookDir));
    } else {
      // Era Clash / Ravencrest framing: centred behind the character, the pivot over the head so the
      // body sits just under the crosshair; the camera looks straight down the aim, so the centre of the screen
      // (the crosshair) is exactly where shots and strikes go
      // high enough that the hood clears the crosshair; looking down (and leaning into a run) needs more
      // gun out: over the right shoulder (the body sits left of the crosshair, the view looks exactly down the aim:
      // the crosshair is the aim). Fists: centred behind, pivot over the head (Era Clash). Eased between the two.
      this.shoulderT += ((this.fists || this.glide.gliding ? 0 : 1) - this.shoulderT) * (1 - Math.exp(-dt * 6));
      const centredLift = 0.7 + Math.max(0, -this.pitch) * 0.9;
      const lift = THREE.MathUtils.lerp(centredLift, 0.22, this.shoulderT);
      const pivot = eyePos.clone().setY(eyePos.y + THREE.MathUtils.lerp(lift, 0.15, this.glideCam)).addScaledVector(right, 0.62 * this.shoulderT);
      const backDir = lookDir.clone().negate();
      const maxD = this.world ? this.world.rayDistance(pivot, backDir, this.camDist) - 0.3 : this.camDist;
      // a wall behind pulls the boom in at once; it eases back out (no popping)
      this.boom = maxD < this.boom ? maxD : THREE.MathUtils.lerp(this.boom, maxD, Math.min(1, dt * 3));
      this.camera.position.copy(pivot).addScaledVector(backDir, Math.max(0.3, this.boom));
      this.camera.lookAt(this.camera.position.clone().add(lookDir));
    }
    this.camera.rotateZ(this.lean);

    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);
    // first-person gun: sway, bob, recoil spring, ADS, reload and switch poses
    if (this.firstPerson) {
      this.weaponVM.update(dt, {
        spec: this.weapon, yaw: this.yaw, pitch: this.pitch, speed: hsp, onGround: this.onGround, ads: this.aimBlend,
        reload: this.reloadT > 0 ? this.reloadProgress : -1, sw: this.switchT > 0 ? 1 - this.switchT / this.switchLen : -1,
        pulse, crouched: this.crouched,
      });
    }
    // third-person gun: the mag leaves the gun while it's out of the hand, the glow breathes with the beat
    const tg = this.tpShown ? this.tpGuns.get(this.tpShown) : undefined;
    if (tg) {
      const ph = this.weapon.phases, p = this.reloadT > 0 ? this.reloadProgress : -1;
      tg.mag.visible = !(p >= ph.out && p < ph.in);
      tg.glow.value += (1 + pulse * 0.7 + this.muzzleFlash * 2 - tg.glow.value) * Math.min(1, dt * 12);
      tg.root.visible = !this.firstPerson && !this.fists && !(this.switchT > 0 && Math.abs(this.switchT / this.switchLen - 0.5) < 0.12);
    }
  }
}

const _chest = new THREE.Vector3();
const _before = new THREE.Vector3(), _want = new THREE.Vector3(), _trial = new THREE.Vector3();
