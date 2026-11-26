// 1st / 3rd-person Soul Vessel controller with swappable classes, capsule physics, touch & gamepad.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CollisionWorld } from './collision';
import type { InputState } from './controls';
import { assets, CharacterRig } from './characters';
import { VESSELS, VESSEL_ORDER, buildVesselMesh, type VesselId, type VesselSpec } from './vessels';
import { WEAPONS, WeaponEnergy, WeaponViewmodel, buildWeapon, type ReloadPhases, type WeaponModel, type WeaponSpec } from './weapons';
import { Glide } from './glide';
import { stepWaterBuoyancy, type WaterSample } from './waterPhysics';
import { LOOT_CATALOG, type ComputedLoadoutStats, type LoadoutPreset } from './loadouts';

// Feel: fast, nimble, upbeat. Snappy ground control, full air control at a lower rate,
// high double jump, coyote time + jump buffer, rock-cliff climbing, swimming with river current, and dash charges.
const ACCEL = 40;          // m/s²
const DECEL = 50;          // m/s²
const KEY_TURN = 2.2;      // rad/s: A / D turn the character in the follow camera (Era Clash's 3.6 was too fast here)
const TURN = 16;           // rad/s: the body turns to face where it's going (Ravencrest TURN)
const FACE_AIM_AFTER = 0.7; // s the body keeps facing the aim after a shot or a strike
const AIR_ACCEL = 26;      // still steerable mid-air
const JUMP_VEL = 11.4;
const DOUBLE_JUMP_VEL = 12.6;
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
const MOUSE_SENS = 0.0014; // rad per mouse px at 1x (Kenne: the camera moved too fast to aim)

// Magazine size, reload length / beats, recoil, spread, ADS and switch time are per weapon: WEAPONS in weapons.ts.
/** Seconds on the floor after being downed before the respawn. */
const DOWN_SEC = 2.4;

export class PlayerController {
  readonly object = new THREE.Group();
  vesselMesh = new THREE.Group();
  private rig: CharacterRig | null = null;
  /** Per-vessel cached CharacterRig + wrapper + third-person gun so switching vessels swaps real 3D bodies cleanly. */
  private vesselRigs = new Map<VesselId, { rig: CharacterRig; wrap: THREE.Group; gun?: WeaponModel }>();
  /** Wings deploy on the run; in the air with wings out he glides (glide.ts, tuning in GLIDE). */
  readonly glide = new Glide();
  readonly viewmodel = new THREE.Group();
  /** First-person gun + hands (weapons.ts). */
  readonly weaponVM = new WeaponViewmodel();
  /** Spirit energy + heat per vessel (weapons.ts). The world refills it: player.weapons.addCharge(amount, source);
   *  read it with getCharge(); onDry / onOverheat / onCharge fire as it changes. */
  readonly weapons = new WeaponEnergy();
  /** Third-person guns on the active rig's hand_r_weapon socket, one per vessel (the shown one is visible). */
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
  /** Cursor aim (third person): where the mouse points on screen, normalised; shots and the body go there. */
  aimNdc: { x: number; y: number } | null = null;
  /** In a fight (enemies close / just fought; main.ts sets it): A / D strafe instead of turning. */
  inCombat = false;
  /** Where the crosshair lands in the world (third person): the body and gun turn to it. */
  readonly aimPoint = new THREE.Vector3();
  private aimPointOk = false;
  /** Yaw to whip round to after a hit from outside the view (faceThreat), or null. */
  private threatYaw: number | null = null;
  /** Hit from outside the view (behind or to the side): turn to face the attacker, camera with him. */
  faceThreat(from: THREE.Vector3) {
    if (this.lockedOn || this.downedT > 0 || this.firstPerson) return;
    const p = this.object.position, want = Math.atan2(-(from.x - p.x), -(from.z - p.z));
    const off = Math.abs(Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)));
    if (off > 1.6) this.threatYaw = want; // ~90 deg: only what you can't already see
  }
  /** Quick 180: the view swings right round over ~0.2 s. */
  quickTurn() { if (this.enabled && this.downedT <= 0) this.turnLeft = Math.PI; }
  private turnLeft = 0;
  /** Square the body to the crosshair point at once (a shot leaves a gun that points at the target, not the way the
   *  character was running). */
  faceAimNow() {
    if (this.firstPerson || !this.aimPointOk) return;
    this.bodyYaw = Math.atan2(-(this.aimPoint.x - this.object.position.x), -(this.aimPoint.z - this.object.position.z));
    this.faceAimT = Math.max(this.faceAimT, FACE_AIM_AFTER);
    this.vesselMesh.rotation.set(0, this.bodyYaw - this.yaw, this.bank, 'YXZ');
    this.vesselMesh.updateWorldMatrix(true, true);
  }
  /** Which shoulder the third-person camera sits over: 1 right, -1 left (swap shoulder). */
  shoulderSide = 1;
  /** Fallback scheme where the mouse can't be captured: A / D turn the character and camera (main.ts sets it). */
  keyTurnMode = false;
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

  // ── Traversal state: swimming (stream buoyancy + current), rock-face climbing, grapple hook & loadout gear ──
  swimming = false;
  underwater = false;
  wading = false;
  waterSubmerged = 0;
  waterFlowSpeed = 0;
  breath = 100;
  private splashCd = 0;
  private wasInWater = false;
  private drownTick = 0;

  climbing = false;
  climbStamina = 100;
  readonly climbNormal = new THREE.Vector3(0, 0, 1);
  private climbCooldown = 0;
  private climbDustCd = 0;

  /** Active retracting grapple pull velocity (set by main.ts from GrappleHook.update). */
  grappleActive = false;
  private grappleVel = new THREE.Vector3();

  /** Water physics sampler provided by main.ts (matches world/water.ts rivers, streams, pool & vale). */
  waterSampler: ((x: number, z: number, groundY: number) => WaterSample | null) | null = null;

  /** Active custom loadout bonuses & mounted 3D gear meshes on character rig bones. */
  loadoutStats: ComputedLoadoutStats = {
    dmgMul: 1, maxHpBonus: 0, dmgReduce: 0, moveMul: 1, swimMul: 1, climbMul: 1,
    grappleRangeMul: 1, chargeRegenMul: 1, pelletsBonus: 0, accentColor: null,
  };
  private activeLoadout: LoadoutPreset | null = null;
  private loadoutGearObjs: THREE.Object3D[] = [];
  private customWeaponObj: THREE.Object3D | null = null;
  private loadoutGearToken = 0;
  private lootGlbCache = new Map<string, Promise<THREE.Object3D | null>>();

  onToggleView?: (fp: boolean) => void;
  onDash?: () => void;
  onDoubleJump?: (pos: THREE.Vector3) => void;
  onGrapple?: () => void;
  onGrappleSlingshot?: () => void;
  onWaterSplash?: (pos: THREE.Vector3, strength: number) => void;
  onDrownTick?: (dmg: number) => void;
  onClimbMantle?: (pos: THREE.Vector3) => void;
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
      if (e.code === 'KeyE' && !e.repeat) this.onGrapple?.();
      if (e.code === 'KeyF') { if (!this.onStrike) this.strikeAnim(); this.onStrike?.(); }
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyC') this.crouchToggle = !this.crouchToggle;
      if (e.code === 'Digit1') this.setVessel('aegis');
      if (e.code === 'Digit2') this.setVessel('stalker');
      if (e.code === 'Digit3') this.setVessel('seraph');
      if (e.code === 'Digit6') this.setVessel('sylva');
      if (e.code === 'Digit7') this.setVessel('pyre');
      // Q by default (input/actions.ts): third person swaps shoulder; first person turns you right round (quick 180)
      if (e.code === 'F8' && !e.repeat) { if (this.firstPerson) this.quickTurn(); else this.shoulderSide = -this.shoulderSide; }
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

  /** Which CharacterAsset and standing height (m) each Soul Vessel class uses in third person. */
  private vesselAssetFor(id: VesselId): { asset: NonNullable<typeof assets.stalker>; height: number } | null {
    if (id === 'aegis' && assets.paladin) return { asset: assets.paladin, height: 2.02 };
    if (id === 'seraph' && assets.seraph) return { asset: assets.seraph, height: 1.78 };
    if (id === 'sylva' && assets.sylva) return { asset: assets.sylva, height: 2.04 };
    if (id === 'pyre' && assets.pyre) return { asset: assets.pyre, height: 2.15 };
    if (assets.stalker) return { asset: assets.stalker, height: 1.9 };
    const fallback = assets.paladin ?? assets.seraph ?? assets.sylva ?? assets.pyre;
    return fallback ? { asset: fallback, height: 1.9 } : null;
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
    this.maxHp = spec.maxHp + this.loadoutStats.maxHpBonus;
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));

    this.object.remove(this.vesselMesh);
    const chosen = this.vesselAssetFor(id);
    if (chosen) {
      let cached = this.vesselRigs.get(id);
      if (!cached) {
        const rig = new CharacterRig(chosen.asset, chosen.height);
        const wrap = new THREE.Group();
        rig.root.rotation.y = Math.PI; // rig faces +Z, the player's forward is -Z
        wrap.add(rig.root);
        cached = { rig, wrap };
        this.vesselRigs.set(id, cached);
      }
      this.rig = cached.rig;
      this.vesselMesh = cached.wrap;
      this.vesselMesh.rotation.set(0, this.bodyYaw - this.yaw, this.bank, 'YXZ');
      this.tpShown = null; // ensure the active rig mounts/shows this vessel's third-person gun
    } else {
      this.rig = null;
      this.vesselMesh = buildVesselMesh(spec);
    }
    this.vesselMesh.visible = !this.firstPerson;
    this.object.add(this.vesselMesh);

    this.weapons.current = id;
    this.weaponVM.select(id);
    this.weaponVM.setTrim(this.loadoutStats.accentColor ?? spec.primaryColor);
    if (this.switchT <= 0) this.showTpGun(id);
    void this.mountLoadoutGear();

    this.onSwitchVessel?.(spec);
  }

  /** Apply an active Armory loadout: switch vessel if requested, update bonuses, and mount 3D weapon/shield/armor GLBs. */
  applyLoadout(preset: LoadoutPreset, stats: ComputedLoadoutStats) {
    this.activeLoadout = preset;
    this.loadoutStats = stats;
    if (preset.vessel !== this.vessel.id) {
      this.setVessel(preset.vessel);
    } else {
      const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
      this.maxHp = this.vessel.maxHp + stats.maxHpBonus;
      this.hp = Math.max(1, Math.round(this.maxHp * ratio));
      this.weaponVM.setTrim(stats.accentColor ?? this.vessel.primaryColor);
      void this.mountLoadoutGear();
    }
  }

  private loadLootGlb(url: string): Promise<THREE.Object3D | null> {
    let p = this.lootGlbCache.get(url);
    if (!p) {
      p = new GLTFLoader().loadAsync(url).then((g) => g.scene).catch(() => null);
      this.lootGlbCache.set(url, p);
    }
    return p;
  }

  private findRigBone(names: string[]): THREE.Object3D | null {
    if (!this.rig) return null;
    for (const target of names) {
      let found: THREE.Object3D | null = null;
      this.rig.root.traverse((o) => {
        if (found) return;
        const clean = o.name.replace(/^.*[:|]/, '');
        if (clean === target) found = o;
      });
      if (found) return found;
    }
    return null;
  }

  /** Mount picked-up 3D weapons, off-hand shields, and modular armor GLBs onto the active CharacterRig's bones. */
  private async mountLoadoutGear() {
    const token = ++this.loadoutGearToken;
    for (const o of this.loadoutGearObjs) o.removeFromParent();
    this.loadoutGearObjs = [];
    if (this.customWeaponObj) { this.customWeaponObj.removeFromParent(); this.customWeaponObj = null; }
    const preset = this.activeLoadout;
    const rig = this.rig;
    if (!preset || !rig) return;

    const attachToBone = async (
      url: string,
      boneNames: string[],
      pos: [number, number, number],
      rot: [number, number, number],
      scl: [number, number, number],
      isCustomWeapon = false,
    ) => {
      const bone = this.findRigBone(boneNames);
      if (!bone) return;
      const src = await this.loadLootGlb(url);
      if (!src || token !== this.loadoutGearToken || this.rig !== rig) return;
      const clone = src.clone(true);
      if (scl[0] * scl[1] * scl[2] < 0) {
        clone.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.material) return;
          const fix = (mat: THREE.Material) => { const c = mat.clone(); c.side = THREE.DoubleSide; return c; };
          m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
        });
      }
      // Undo bone's world scale so real-world-metre GLBs match the character proportionally
      bone.updateWorldMatrix(true, false);
      const ws = bone.getWorldScale(new THREE.Vector3());
      const inv = 1 / Math.max(1e-4, ws.x);
      const holder = new THREE.Group();
      holder.scale.set(scl[0] * inv, scl[1] * inv, scl[2] * inv);
      holder.position.set(pos[0] * inv, pos[1] * inv, pos[2] * inv);
      holder.rotation.set(...rot);
      holder.add(clone);
      bone.add(holder);
      if (isCustomWeapon) this.customWeaponObj = holder;
      else this.loadoutGearObjs.push(holder);
    };

    // Custom picked-up primary 3D weapon
    if (preset.weaponId) {
      const def = LOOT_CATALOG[preset.weaponId];
      if (def?.url) {
        await attachToBone(def.url, ['RightHand', 'hand_r_weapon'], [-0.02, -0.04, 0.06], [0.24, 0, -0.24], [0.88, 0.88, 0.88], true);
      }
    }
    // Off-hand shield on LeftForeArm
    if (preset.shieldId) {
      const def = LOOT_CATALOG[preset.shieldId];
      if (def?.url) {
        await attachToBone(def.url, ['LeftForeArm', 'LeftHand'], [0.14, -0.14, 0.05], [0, 1.43, -0.21], [0.84, 0.84, 0.84]);
      }
    }
    // Modular 3D armor slots
    for (const [slot, id] of Object.entries(preset.armor)) {
      if (!id) continue;
      const def = LOOT_CATALOG[id];
      if (!def?.url) continue;
      if (slot === 'head') {
        const pos: [number, number, number] =
          id === 'lumen_halo' ? [0, 0.22, -0.10] :
          id === 'nyx_visor' ? [0, 0.06, 0.11] :
          id.includes('crown') ? [0, 0.14, 0.0] : [0, -0.06, 0.02];
        await attachToBone(def.url, ['Head'], pos, [0, 0, 0], [0.96, 0.96, 0.96]);
      } else if (slot === 'chest') {
        await attachToBone(def.url, ['Spine2'], [0, -0.18, 0.04], [0, 0, 0], [0.96, 0.96, 0.96]);
      } else if (slot === 'back') {
        await attachToBone(def.url, ['Spine2'], [0, -0.22, -0.14], [0, 0, 0], [1.0, 1.0, 1.0]);
      } else if (slot === 'belt') {
        await attachToBone(def.url, ['Hips'], [0, -0.09, 0.01], [0, 0, 0], [1.0, 1.0, 1.0]);
      } else if (slot === 'shoulder') {
        await attachToBone(def.url, ['LeftArm', 'LeftShoulder'], [0.04, -0.08, 0], [0, 0, 0], [0.95, 0.95, 0.95]);
        await attachToBone(def.url, ['RightArm', 'RightShoulder'], [-0.04, -0.08, 0], [0, 0, 0], [-0.95, 0.95, 0.95]);
      }
    }
  }

  /** World origin of the grapple launcher (left wrist/shoulder in 3rd person, lower-left screen in 1st person). */
  grappleHandPos(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.firstPerson) return out.set(-0.24, -0.18, -0.5).applyMatrix4(this.camera.matrixWorld);
    const lh = this.findRigBone(['LeftHand', 'LeftForeArm']);
    if (lh) { lh.updateWorldMatrix(true, false); return lh.getWorldPosition(out); }
    return out.copy(this.object.position).add(new THREE.Vector3(0, 1.32, 0));
  }

  /** Drive retracting grapple pull velocity from main.ts. */
  setGrapplePull(active: boolean, vx = 0, vy = 0, vz = 0) {
    this.grappleActive = active;
    if (active) {
      this.climbing = false;
      this.swimming = false;
      this.onGround = false;
      this.grappleVel.set(vx, vy, vz);
    }
  }

  /** Vault boost + double-jump refresh when retracting grapple reaches the anchor ledge. */
  finishGrappleVault() {
    this.grappleActive = false;
    this.vy = Math.max(this.vy, 9.8);
    this.vel.multiplyScalar(0.55);
    this.airJumps = 1;
    this.onGround = false;
    this.rig?.play('jump', 0.8);
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

  /** Hang the vessel's gun in the active rig's right hand (hand_r_weapon socket); built once per vessel rig. */
  private showTpGun(id: VesselId) {
    if (this.tpShown === id || !this.rig) return;
    const cached = this.vesselRigs.get(id);
    let m = cached?.gun;
    if (!m) {
      const socket = this.rig.socket('hand_r_weapon');
      if (!socket) return;
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
      if (cached) cached.gun = m;
      this.tpGuns.set(id, m);
      this.rig.grip('Right', 'dagger');
    } else {
      this.tpGuns.set(id, m);
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

  /** Shots a full charge gives (the drawn vessel). */
  get magSize() { return this.weapon.magSize; }
  /** Shots the remaining spirit charge gives. */
  get ammo() { return this.weapons.getCharge().shotsLeft; }
  get reloading() { return this.reloadT > 0; }
  /** 0…1 progress of the running reload (for the HUD). */
  get reloadProgress() { return this.reloadT > 0 ? 1 - this.reloadT / this.reloadLen : 1; }
  get switching() { return this.switchT > 0; }
  get downed() { return this.downedT > 0; }
  /** Play a one-shot on the body (e.g. 'get_up' after being downed). */
  playClip(name: string, weight = 1, seconds?: number) { this.rig?.play(name, weight, seconds); }

  /** The reload binding (R, D-pad left) vents: the weapons are spirit-charged, not magazine-fed. */
  reload() { return this.vent(); }

  /** Vent the heat (the attune motion: the body's reload clip, the gun's cell slides out and back, a hiss and a chime).
   *  R vents early for a little charge; `forced` is the cool-down after an overheat. No firing until it's done. */
  vent(forced = false) {
    if (!this.enabled || this.reloadT > 0 || this.switchT > 0 || this.downedT > 0) return false;
    if (!forced && !this.weapons.vent()) return false;
    const w = this.weapon, sec = forced ? w.energy.overheatSec : w.energy.ventSec;
    this.reloadLen = this.reloadT = sec;
    this.reloadP = 0;
    this.autoReloadT = 0;
    this.rig?.play(w.reloadClip, 1, sec);
    this.onReload?.();
    return true;
  }

  /** A trigger pull spends spirit charge and builds heat (cheaper and cooler on the beat). False = can't fire: venting,
   *  switching, down, overheated, or dry (the trigger clicks on nothing — find charge in the world). */
  useRound(quality: 'PERFECT' | 'GOOD' | 'OFF' = 'OFF') {
    if (this.reloadT > 0 || this.switchT > 0 || this.downedT > 0) return false;
    const r = this.weapons.spend(quality);
    if (r === 'dry') { this.weaponVM.dryFire(); this.onDryFire?.(this.weapon); return false; }
    if (r === 'hot') return false;
    if (this.weapons.getCharge().overheated) this.autoReloadT = 0.2; // the overheat vent starts once the kick has played
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
    // cursor aim: the ray goes from the camera through the point the mouse is on
    if (this.aimNdc && !this.firstPerson) dir.set(this.aimNdc.x, this.aimNdc.y, 1).unproject(this.camera).sub(origin).normalize();
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
    this.weapons.update(dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      // the reload's beats (mag release, out, in, charge) raise their sounds, in either view
      const p = 1 - Math.max(0, this.reloadT) / this.reloadLen, ph = this.weapon.phases;
      for (const k of ['release', 'out', 'in', 'charge'] as const) if (this.reloadP < ph[k] && p >= ph[k]) this.onReloadBeat?.(k, this.weapon);
      this.reloadP = p;
      if (this.reloadT <= 0) { this.reloadT = 0; this.reloadP = -1; }
    } else this.reloadP = -1;
    if (this.switchT > 0) {
      this.switchT = Math.max(0, this.switchT - dt);
      if (this.switchT <= this.switchLen / 2) this.showTpGun(this.vessel.id);
    }
    if (this.autoReloadT > 0) { this.autoReloadT -= dt; if (this.autoReloadT <= 0 && this.weapons.getCharge().overheated) this.vent(true); }
    if (this.downedT > 0) {
      this.downedT -= dt;
      if (this.downedT <= 0) { this.downedT = 0; this.rig?.release(); this.weapons.reset(); const cb = this.onDownedDone; this.onDownedDone = undefined; cb?.(); }
    }
    this.crouched = this.downedT <= 0 && (this.crouchToggle || this.keys.has('ControlLeft') || this.keys.has('ControlRight') || !!input?.crouchHeld);
    if (input?.crouchPressed) this.crouchToggle = !this.crouchToggle;
    if (input?.reloadPressed) this.reload();
    if (this.rig) {
      this.rig.crouch = this.crouched;
      this.rig.runRifle = !this.fists && !this.crouched && !this.glide.gliding;
    }
    this.lockT = Math.max(0, this.lockT - dt);
    if (this.turnLeft > 0) { const s = Math.min(this.turnLeft, dt * Math.PI / 0.2); this.yaw += s; this.turnLeft -= s; }
    // hit from behind / the side: whip round to face the attacker, camera with him (Ravencrest faceThreat)
    if (this.threatYaw !== null) {
      const d = Math.atan2(Math.sin(this.threatYaw - this.yaw), Math.cos(this.threatYaw - this.yaw));
      this.yaw += THREE.MathUtils.clamp(d, -7 * dt, 7 * dt);
      if (Math.abs(d) < 0.06) this.threatYaw = null;
    }
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
      // Third person (Kenne: A / D turn, not strafe): the Era Clash follow camera — A / D turn the character and the
      // camera with him, W / S go along the facing (S backs up slower), the mouse aims. Locked on (circle-strafing),
      // aiming down sights (Z) or in first person, A / D strafe.
      // in a fight A / D strafe by themselves (circle an enemy and keep the gun on it); exploring they turn
      // Gears: A / D strafe and the mouse turns the camera; only where the mouse can't be captured do A / D turn
      this.keyTurning = this.keyTurnMode && !this.firstPerson && !this.lockedOn && !this.inCombat && this.aimBlend < 0.5 && !this.glide.gliding;
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
    this.climbCooldown = Math.max(0, this.climbCooldown - dt);
    this.splashCd = Math.max(0, this.splashCd - dt);
    this.climbDustCd = Math.max(0, this.climbDustCd - dt);

    // ── 1. Sample physics-accurate water at player's feet ──
    const posNow = this.object.position;
    const rawGroundY = this.world?.terrain
      ? this.world.terrain.heightAt(posNow.x, posNow.z, posNow.y + 1.2)
      : (this.world?.groundAt(posNow.x, posNow.z, posNow.y + 1.0, 20) ?? posNow.y);
    const water = this.waterSampler ? this.waterSampler(posNow.x, posNow.z, rawGroundY) : null;
    const subDepthNow = water ? Math.max(0, water.y - posNow.y) : 0;
    const inSwimDepth = !!water && subDepthNow >= HEIGHT * 0.56;
    const inWadeDepth = !!water && subDepthNow >= 0.25 && !inSwimDepth;

    // Entry splash when jumping / stepping into stream or pool
    if (water && subDepthNow > 0.28 && !this.wasInWater && this.splashCd <= 0) {
      this.splashCd = 0.45;
      this.onWaterSplash?.(new THREE.Vector3(posNow.x, water.y, posNow.z), Math.min(2.2, 0.7 + Math.abs(this.vy) * 0.14));
    }
    this.wasInWater = !!water && subDepthNow > 0.28;
    this.wading = inWadeDepth;
    this.waterSubmerged = water ? Math.min(1, subDepthNow / HEIGHT) : 0;
    this.waterFlowSpeed = water ? water.speed : 0;

    if (inSwimDepth && !this.grappleActive) {
      this.swimming = true;
      this.climbing = false;
      this.onGround = false;
      this.airJumps = 1;
    } else if (!inSwimDepth && this.swimming) {
      this.swimming = false;
    }
    if (!water) { this.underwater = false; }

    // ── 2. Rock-face & cliff climbing latch detection ──
    const wantDrop = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const moveFwdHeld = this.keys.has('KeyW') || this.keys.has('ArrowUp') || (input?.moveY ?? 0) > 0.25;
    const moveBackHeld = this.keys.has('KeyS') || this.keys.has('ArrowDown') || (input?.moveY ?? 0) < -0.25;
    const moveRightHeld = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + (input?.moveX ?? 0);

    if (!this.climbing && !this.swimming && !this.grappleActive && this.enabled && this.downedT <= 0 && this.world && this.climbCooldown <= 0 && this.climbStamina > 14 && wish.lengthSq() > 0.15) {
      const probeDir = wish.clone().setY(0).normalize();
      const chestOrig = new THREE.Vector3(posNow.x, posNow.y + 1.15, posNow.z);
      const hit = this.world.raycastHit(chestOrig, probeDir, RADIUS + 0.54);
      if (hit && hit.normal.y >= -0.25 && hit.normal.y < 0.48 && hit.distance <= RADIUS + 0.54) {
        // Confirm it's a real rock face / cliff / wall (either airborne or wall extends above waist)
        const hiOrig = new THREE.Vector3(posNow.x, posNow.y + 1.55, posNow.z);
        const hiHit = this.world.raycastHit(hiOrig, probeDir, RADIUS + 0.68);
        if (!this.onGround || (hiHit && hiHit.normal.y < 0.52)) {
          this.climbing = true;
          this.climbNormal.copy(hit.normal).setY(0).normalize();
          if (this.climbNormal.lengthSq() < 0.01) this.climbNormal.copy(probeDir).negate();
          this.vel.set(0, 0, 0);
          this.vy = 0;
          this.onGround = false;
          this.airJumps = 1;
        }
      }
    }

    // ── 3. Jump / Double Jump / Grapple Slingshot / Wall-Kick / Water Breach ──
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0) {
      if (this.grappleActive) {
        // Mid-reel grapple slingshot!
        this.jumpBuffer = 0;
        this.grappleActive = false;
        this.vy = Math.max(this.vy, 11.6);
        this.airJumps = 1;
        this.onGrappleSlingshot?.();
        this.onDoubleJump?.(this.object.position.clone());
      } else if (this.climbing) {
        // Wall-kick up and away from rock face
        this.climbing = false;
        this.climbCooldown = 0.28;
        this.jumpBuffer = 0;
        this.vy = 11.4;
        this.vel.copy(this.climbNormal).multiplyScalar(7.6);
        this.airJumps = 1;
        this.onDoubleJump?.(this.object.position.clone());
        this.rig?.play('jump', 0.85);
      } else if (this.swimming && water && posNow.y + HEIGHT * 0.9 >= water.y - 0.18) {
        // Breach leap out of the stream onto the bank
        this.swimming = false;
        this.jumpBuffer = 0;
        this.vy = 10.6;
        this.airJumps = 1;
        this.onWaterSplash?.(new THREE.Vector3(posNow.x, water.y, posNow.z), 1.4);
        this.rig?.play('jump', 0.85);
      } else if (this.coyote > 0) {
        this.vy = JUMP_VEL;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (this.airJumps > 0 && !this.swimming) {
        // Enhanced Double Jump: higher arc + forward air boost + energy shockwave ring
        this.vy = DOUBLE_JUMP_VEL;
        if (wish.lengthSq() > 0.04) this.vel.addScaledVector(wish, 2.4);
        this.airJumps--;
        this.jumpBuffer = 0;
        this.onDoubleJump?.(this.object.position.clone());
        this.rig?.play('attack_2', 0.6); // flip-ish flourish on the double jump
      }
    }

    // wings + glide: deploy on the run, glide in the air with wings out (paused while swimming, climbing, or grappling)
    this.glide.update(dt, {
      onGround: this.onGround, hsp: Math.hypot(this.vel.x, this.vel.z), vy: this.vy,
      jumpHeld: this.enabled && this.spaceHeld && !this.swimming && !this.climbing && !this.grappleActive, crouch: this.crouched,
      combat: this.aiming || this.blocking || this.moveLock < 1,
      busy: this.dashTimer > 0 || this.lungeT > 0 || this.hangT > 0 || this.downedT > 0 || this.swimming || this.climbing || this.grappleActive, pos: this.object.position,
      groundBelow: this.glide.gliding && this.world ? this.object.position.y - (this.world.groundAt(this.object.position.x, this.object.position.z, this.object.position.y, 40) ?? -1e9) : undefined,
    });

    // dash charges refill one at a time
    if (this.dashCharges < DASH_CHARGES) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_RECHARGE) { this.dashRecharge = 0; this.dashCharges++; }
    }

    // ── 4. Active Movement Integration (Grapple / Climb / Swim / Ground & Air) ──
    const moveBonus = this.loadoutStats.moveMul;
    if (this.grappleActive) {
      this.vel.set(this.grappleVel.x, 0, this.grappleVel.z);
      this.vy = this.grappleVel.y;
    } else if (this.climbing && this.world) {
      // Continuously probe rock surface ahead; auto-mantle when reaching the cliff top!
      const intoWall = this.climbNormal.clone().negate();
      const waistHit = this.world.raycastHit(new THREE.Vector3(posNow.x, posNow.y + 0.85, posNow.z), intoWall, RADIUS + 0.95);
      const topHit = this.world.raycastHit(new THREE.Vector3(posNow.x, posNow.y + 1.65, posNow.z), intoWall, RADIUS + 1.05);

      if (wantDrop || this.climbStamina <= 0) {
        this.climbing = false;
        this.climbCooldown = 0.35;
      } else if (waistHit && !topHit && moveFwdHeld) {
        // Smooth auto ledge mantle over the cliff lip!
        this.climbing = false;
        this.climbCooldown = 0.35;
        this.vy = 8.4;
        this.vel.copy(intoWall).multiplyScalar(5.4);
        this.climbStamina = Math.min(100, this.climbStamina + 25);
        this.airJumps = 1;
        this.onClimbMantle?.(posNow.clone());
        this.rig?.play('jump', 0.8);
      } else if (!waistHit && !topHit) {
        this.climbing = false;
        this.climbCooldown = 0.25;
      } else {
        const refHit = waistHit ?? topHit!;
        if (refHit.normal.y < 0.55) {
          const nFlat = refHit.normal.clone().setY(0);
          if (nFlat.lengthSq() > 0.01) this.climbNormal.lerp(nFlat.normalize(), Math.min(1, dt * 10)).normalize();
        }
        const upDir = (moveFwdHeld ? 1 : 0) - (moveBackHeld ? 1 : 0);
        const sideDir = THREE.MathUtils.clamp(moveRightHeld, -1, 1);
        // Right along the rock face when facing into it: cross(intoWall, UP) = cross(-climbNormal, UP)
        const wallRight = new THREE.Vector3(-this.climbNormal.z, 0, this.climbNormal.x).normalize();
        const cSpd = this.loadoutStats.climbMul * this.moveMul;
        this.vy = upDir > 0 ? 4.8 * cSpd : upDir < 0 ? -5.4 * cSpd : 0;
        // Gently hug the cliff face so curved rock surfaces stay attached
        const hug = (refHit.distance - (RADIUS + 0.08)) * 4.5;
        this.vel.copy(wallRight).multiplyScalar(sideDir * 3.8 * cSpd).addScaledVector(intoWall, THREE.MathUtils.clamp(hug, -2.5, 2.5));
        const movingWall = Math.abs(upDir) + Math.abs(sideDir) > 0.05;
        this.climbStamina = Math.max(0, this.climbStamina - dt * (movingWall ? 7.5 : 2.2));
        if (movingWall && this.climbDustCd <= 0) {
          this.climbDustCd = 0.38;
          this.rig?.play('dash', 0.32, 0.55);
        }
      }
    } else if (this.swimming && water) {
      // Physics-accurate Archimedes buoyancy + downstream stream current + swim thrust
      const swimSpd = 6.2 * this.loadoutStats.swimMul * this.moveMul * (this.dashTimer > 0 ? 1.85 : 1);
      if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
      const diveHeld = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      const swimVert = (this.spaceHeld ? 1 : 0) - (diveHeld ? 1 : 0);
      const resW = stepWaterBuoyancy({
        feetY: posNow.y,
        bodyHeight: HEIGHT,
        vx: this.vel.x,
        vy: this.vy,
        vz: this.vel.z,
        wishX: wish.x * swimSpd,
        wishZ: wish.z * swimSpd,
        swimVertical: swimVert,
        gravity: this.vessel.gravity,
        dt,
        water,
        clock: this.clock,
      });
      this.vel.set(resW.vx, 0, resW.vz);
      this.vy = resW.vy;
      this.underwater = resW.underwater;
      this.waterSubmerged = resW.submerged;
      this.climbStamina = Math.min(100, this.climbStamina + dt * 32);

      // Periodic surface wake & swim-stroke splash VFX
      const swimSpdNow = Math.hypot(this.vel.x, this.vel.z);
      if (!this.underwater && (swimSpdNow > 1.2 || water.turbulence > 0.35) && this.splashCd <= 0) {
        this.splashCd = Math.max(0.22, 0.55 - swimSpdNow * 0.04);
        this.onWaterSplash?.(new THREE.Vector3(posNow.x, water.y, posNow.z), 0.45 + water.turbulence * 0.5);
      }
    } else {
      // Standard ground / air movement + wading stream drag & current
      this.climbStamina = Math.min(100, this.climbStamina + dt * (this.onGround ? 38 : 6));
      if (this.lungeT > 0) {
        this.lungeT -= dt;
        this.vel.copy(this.lungeV);
        if (this.lungeT <= 0) this.vel.multiplyScalar(0.25);
      } else if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.vel.copy(this.dashDir).multiplyScalar(this.vessel.dashSpeed);
        if (this.dashTimer <= 0) this.vel.multiplyScalar(DASH_CARRY); // keep the momentum, don't stop dead
      } else {
        const wadeMul = this.wading ? 1 - this.waterSubmerged * 0.35 : 1;
        const target = wish.multiplyScalar(this.vessel.moveSpeed * moveBonus * wadeMul * (1 - this.aimBlend * 0.08) * (this.crouched ? 0.45 : 1) * this.moveLock * (this.blocking ? 0.45 : 1) * this.moveMul);
        const moving = wish.lengthSq() > 0;
        if (this.onGround) {
          const dv = target.clone().sub(this.vel).setY(0);
          const step = (target.lengthSq() > this.vel.lengthSq() ? ACCEL : DECEL) * dt;
          if (dv.length() > step) dv.setLength(step);
          this.vel.add(dv);
        } else if (this.glide.gliding) this.glide.steer(this.vel, wish, dt);
        else this.vel.lerp(target, Math.min(1, (moving ? AIR_ACCEL : 2) * dt));
      }
      // Stream current pushes waders downstream & throws footstep splashes
      if (this.wading && water) {
        const resW = stepWaterBuoyancy({
          feetY: posNow.y, bodyHeight: HEIGHT,
          vx: this.vel.x, vy: this.vy, vz: this.vel.z,
          wishX: 0, wishZ: 0, swimVertical: 0,
          gravity: this.vessel.gravity, dt, water, clock: this.clock,
        });
        this.vel.set(resW.vx, 0, resW.vz);
        if (Math.hypot(this.vel.x, this.vel.z) > 1.8 && this.splashCd <= 0) {
          this.splashCd = 0.42;
          this.onWaterSplash?.(new THREE.Vector3(posNow.x, water.y, posNow.z), 0.35);
        }
      }

      if (this.hangT > 0) { this.hangT -= dt; this.vy = Math.max(this.vy - this.vessel.gravity * dt * 0.3, -1.5); } // air string hang
      else if (this.glide.gliding) this.vy = this.glide.fall(this.vy, dt);
      else this.vy -= this.vessel.gravity * dt * (this.vy < 0 ? 1.35 : 1); // falls faster than it rises: snappy arcs
    }

    // Underwater breath / oxygen meter
    if (this.underwater) {
      this.breath = Math.max(0, this.breath - dt * 7.5);
      if (this.breath <= 0) {
        this.drownTick -= dt;
        if (this.drownTick <= 0) { this.drownTick = 1.2; this.onDrownTick?.(8); }
      }
    } else {
      this.breath = Math.min(100, this.breath + dt * 32);
      this.drownTick = 0;
    }

    // sub-step so a 34 m/s dash or retracting grapple can't tunnel through a thin wall (≤ 0.25 m per collision pass)
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
        if (res.onGround && this.vy < 0 && !this.swimming && !this.climbing && !this.grappleActive) this.vy = 0;
        grounded = res.onGround && !this.swimming && !this.climbing && !this.grappleActive;
        // walk up stairs and kerbs: on the ground and blocked sideways, look for a step just ahead
        if ((grounded || this.onGround) && this.vy <= 0.5 && !this.swimming && !this.climbing && !this.grappleActive) {
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
        // stand on the highest ground under the body's footprint
        if ((grounded || (this.onGround && this.vy <= 0)) && this.lungeT <= 0 && !this.swimming && !this.climbing && !this.grappleActive) {
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
        if (wasAir && fallVy < -13) this.rig?.play('land', 0.85);
      }
    }

    // out of the world: 20 m under the ground in an open world (its vale and gorge lie far below y = 0), else y < -12
    const pp = this.object.position, field = this.world?.terrain;
    const floor = field ? field.heightAt(pp.x, pp.z, pp.y + 1) - 20 : -12;
    if (pp.y < floor) {
      this.object.position.copy(this.lastSafe);
      this.vel.set(0, 0, 0);
      this.vy = 0;
    } else if (this.onGround && !this.wading && !this.swimming) {
      this.lastSafe.copy(this.object.position);
    }

    this.object.rotation.y = this.yaw;
    const hsp0 = Math.hypot(this.vel.x, this.vel.z);
    const bloomT = Math.min(1, (hsp0 / 9) * 0.5 + (this.onGround ? 0 : 0.55)) * (this.crouched ? 0.6 : 1);
    this.bloom += (bloomT - this.bloom) * Math.min(1, dt * (bloomT > this.bloom ? 6 : 2.5));
    const faceAim = !this.climbing && (this.firstPerson || this.aiming || this.faceAimT > 0 || this.lockT > 0 || this.keyTurning);
    let want: number | null = null;
    if (this.climbing) {
      // Face directly into the cliff rock face
      want = Math.atan2(this.climbNormal.x, this.climbNormal.z);
    } else if (faceAim) {
      if (!this.firstPerson && this.aimPointOk) want = Math.atan2(-(this.aimPoint.x - this.object.position.x), -(this.aimPoint.z - this.object.position.z));
      else want = this.yaw;
    } else if (hsp0 > 0.6) want = Math.atan2(-this.vel.x, -this.vel.z);
    let turned = 0;
    if (want !== null) {
      const d = Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw));
      turned = THREE.MathUtils.clamp(d, -TURN * dt, TURN * dt);
      this.bodyYaw += turned;
    }
    const swimRoll = this.swimming ? Math.sin(this.clock * 4.5) * 0.14 * Math.min(1, hsp0 / 3) : 0;
    const bankT = this.glide.gliding ? this.glide.bank : this.swimming ? swimRoll : faceAim ? 0 : THREE.MathUtils.clamp(-(turned / Math.max(dt, 1e-3)) * 0.035 * Math.min(1, hsp0 / 9), -0.22, 0.22);
    this.bank += (bankT - this.bank) * (1 - Math.exp(-dt * 10));
    this.object.rotation.y = this.yaw;
    this.vesselMesh.rotation.set(0, this.bodyYaw - this.yaw, this.bank, 'YXZ');
    if (this.rig) {
      const sp = this.swimming ? Math.max(2.6, hsp0 * 0.9) : this.climbing ? Math.hypot(hsp0, this.vy) * 0.85 : hsp0;
      const lx = this.vel.x * Math.cos(this.bodyYaw) - this.vel.z * Math.sin(this.bodyYaw);
      const lz = -(this.vel.x * Math.sin(this.bodyYaw) + this.vel.z * Math.cos(this.bodyYaw));
      let ap = this.pitch;
      if (!this.firstPerson && this.aimPointOk) { const c = this.chestPos(_chest2), dx = this.aimPoint.x - c.x, dz = this.aimPoint.z - c.z; ap = Math.atan2(this.aimPoint.y - c.y, Math.hypot(dx, dz)); }
      this.rig.aimPitch = this.firstPerson || this.swimming || this.climbing ? 0 : ap;
      this.glide.pose(this.rig, { firstPerson: this.firstPerson, yaw: this.bodyYaw, scene: this.object.parent, camera: this.camera, pitch: this.pitch });
      // Smooth forward prone swimming posture when swimming in streams/pools!
      if (this.swimming && !this.glide.gliding) {
        this.rig.glidePose.w = 0.82;
        this.rig.glidePose.pitch = this.underwater ? 1.28 : 1.08 + Math.sin(this.clock * 4.5) * 0.06;
      }
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
    // aiming pulls the camera in tight over the shoulder (Gears), from wherever the wheel left it
    const targetDist = this.firstPerson ? 0 : THREE.MathUtils.lerp(this.thirdDist, Math.min(this.thirdDist, 1.7), this.aimBlend) + this.glideCam * 1.2;
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
      const side = this.shoulderSide * this.shoulderT * (0.62 + 0.16 * this.aimBlend); // a touch wider while aiming
      const pivot = eyePos.clone().setY(eyePos.y + THREE.MathUtils.lerp(lift, 0.15, this.glideCam) + 0.08 * this.aimBlend).addScaledVector(right, side);
      const backDir = lookDir.clone().negate();
      const maxD = this.world ? this.world.rayDistance(pivot, backDir, this.camDist) - 0.3 : this.camDist;
      // a wall behind pulls the boom in at once; it eases back out (no popping)
      this.boom = maxD < this.boom ? maxD : THREE.MathUtils.lerp(this.boom, maxD, Math.min(1, dt * 3));
      this.camera.position.copy(pivot).addScaledVector(backDir, Math.max(0.3, this.boom));
      this.camera.lookAt(this.camera.position.clone().add(lookDir));
    }
    this.camera.rotateZ(this.lean);
    // the world point under the crosshair (what the body / gun turn to next frame); far if the ray hits nothing
    if (!this.firstPerson) {
      const { origin, dir } = this.getAimRay();
      const d = this.world ? this.world.rayDistance(origin, dir, 120) : 120;
      this.aimPoint.copy(origin).addScaledVector(dir, Math.max(3, Math.min(120, d)));
      this.aimPointOk = true;
    } else this.aimPointOk = false;

    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);
    // first-person gun: sway, bob, recoil spring, ADS, reload and switch poses
    if (this.firstPerson) {
      this.weaponVM.update(dt, {
        spec: this.weapon, yaw: this.yaw, pitch: this.pitch, speed: hsp, onGround: this.onGround, ads: this.aimBlend,
        reload: this.reloadT > 0 ? this.reloadProgress : -1, sw: this.switchT > 0 ? 1 - this.switchT / this.switchLen : -1,
        pulse, crouched: this.crouched,
      });
    }
    this.weaponVM.model().heat.value = this.weapons.getCharge().heat; // inlays run ember-hot as it heats
    // third-person gun: the mag leaves the gun while it's out of the hand, the glow breathes with the beat
    const tg = this.tpShown ? this.tpGuns.get(this.tpShown) : undefined;
    if (tg) {
      const ph = this.weapon.phases, p = this.reloadT > 0 ? this.reloadProgress : -1;
      tg.mag.visible = !(p >= ph.out && p < ph.in);
      tg.glow.value += (1 + pulse * 0.7 + this.muzzleFlash * 2 - tg.glow.value) * Math.min(1, dt * 12);
      tg.heat.value = this.weapons.getCharge().heat;
      tg.root.visible = !this.firstPerson && !this.fists && !this.customWeaponObj && !(this.switchT > 0 && Math.abs(this.switchT / this.switchLen - 0.5) < 0.12);
      if (this.customWeaponObj) this.customWeaponObj.visible = !this.firstPerson && !this.fists;
    }
  }
}

const _chest = new THREE.Vector3();
const _before = new THREE.Vector3(), _want = new THREE.Vector3(), _trial = new THREE.Vector3();
const _chest2 = new THREE.Vector3();
