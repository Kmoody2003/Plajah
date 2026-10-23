// Third-person controller: mouse-orbit camera that follows behind Jack, camera-relative
// movement with acceleration, capsule physics against the level BVH, and
// speed-matched locomotion blending (no foot-sliding pops between idle/walk/run).
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { Character } from './character';

const WALK = 2.0, RUN = 5.6;            // m/s
const ACCEL = 20, DECEL = 26;           // m/s² toward target speed (snappy, nimble starts/stops)
const TURN = 16;                        // rad/s body turn rate
const RADIUS = 0.32, HEIGHT = 1.8, GRAVITY = 24, STEP = 0.4;
const MOUSE = 0.003;
const DOUBLE_TAP_MS = 300;
const KEY_TURN = 2.7;                   // rad/s: A/D turn Jack in the follow camera
const CAM_KEY = 'ravencrest.camera2';
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class PlayerController {
  readonly object = new THREE.Group();
  yaw = 0;                    // body facing (model +Z rotated by yaw)
  camYaw = 0;                 // camera orbit yaw (camera looks along -Z rotated by camYaw)
  camPitch = -0.15;
  camDist = 3.4;
  private vel = new THREE.Vector3();
  private vy = 0;
  private onGround = true;
  private lastMouse = -10;
  private time = 0;
  private lastSafe = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private dragging = false;
  readonly keys = new Set<string>();
  /** Set by double-tap-and-hold of a move key; cleared when all move keys are released. */
  sprintLatch = false;
  private lastTap = { code: '', t: -1e9 };
  world: CollisionWorld | null = null;
  character: Character | null = null;
  enabled = true;
  /** Combat hooks: movement scale while swinging, timed burst (dash/lunge), body snap. */
  speedScale = 1;
  private burst: { v: THREE.Vector3; t: number; turn: boolean } | null = null;
  /** Hold the body's facing (mid-swing: Jack keeps facing his target whatever pushes him). */
  faceLock = false;
  /** Analog move (touch joystick / gamepad left stick): x = right, y = forward, magnitude 0…1. */
  readonly stick = new THREE.Vector2();
  /** Sprint held on a pad / touch. */
  stickRun = false;
  /** Swing the camera in behind Jack now (pad R3). */
  recenter() { this.camHurry = 0.6; }
  /** Look (touch drag / right stick): radians this frame. Counts as mouse activity. */
  look(dYaw: number, dPitch: number) {
    if (!this.enabled) return;
    if (this.followCam) this.yaw -= dYaw; else this.camYaw -= dYaw;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - dPitch, -1.1, 0.55);
    this.lastMouse = this.time;
  }
  private pivotS = new THREE.Vector3(NaN, NaN, NaN);
  private boom = NaN;
  /** Turning to face something that hit Jack from behind (yaw target), and the camera hurrying after. */
  private threatYaw: number | null = null;
  private camHurry = 0;
  private coyote = 0;
  shake = 0;
  /** Separation from other bodies (monsters), applied on the next move. */
  readonly push = new THREE.Vector3();
  /** Fight framing: the foe to keep in view, and how many are engaged. */
  combatFocus: THREE.Vector3 | null = null;
  /** Shot width set by set-pieces (bridge battle): 0 medium behind, 1 wide behind and above. */
  wide = 0;
  private wideS = 0;
  combatCount = 0;
  /**
   * Default ("action"): W/A/S/D go where you press on screen, Jack turns fast to face that way,
   * the mouse looks, and the camera stays centred and swings in behind him as he runs forward.
   * Tank mode (O toggles): the mouse and A/D turn Jack, W/S move along his facing.
   */
  followCam = (() => { try { return localStorage.getItem(CAM_KEY) === 'tank'; } catch { return false; } })();
  /** Scripted camera (cutscenes): when set, update() moves Jack but leaves the camera alone. */
  cinematic = false;
  private lean = 0;
  private framing = 0;
  /** Hit kick (FOV punch + tiny roll), decays fast. */
  kick = 0;
  /** Cinematic slice close-up: a short orbiting shot on a killing blow. */
  private shot: { t: number; dur: number; target: THREE.Vector3; side: number; yaw0: number } | null = null;
  private lastIx = 0; private lastIz = 0;
  // Anti-stuck: recent safe spots (every 0.5 s) and how long input has made no progress.
  private hist: THREE.Vector3[] = [];
  private histT = 0;
  private noProgress = 0;

  constructor(private dom: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyO' && !e.repeat) {
        this.followCam = !this.followCam;
        try { localStorage.setItem(CAM_KEY, this.followCam ? 'tank' : 'action'); } catch { /* */ }
      }
      // Double-tap a move key and hold it to sprint (Shift still works).
      if (!e.repeat && MOVE_KEYS.has(e.code)) {
        const now = performance.now();
        if (e.code === this.lastTap.code && now - this.lastTap.t < DOUBLE_TAP_MS) this.sprintLatch = true;
        this.lastTap = { code: e.code, t: now };
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (![...MOVE_KEYS].some((k) => this.keys.has(k))) this.sprintLatch = false;
    });
    addEventListener('blur', () => this.keys.clear());
    // Pointer lock where allowed (some embedded browsers refuse it — drag-to-look covers those).
    dom.addEventListener('click', () => {
      if (!this.enabled || document.pointerLockElement === dom) return;
      try { (dom.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* unsupported */ }
    });
    // Drag-to-look fallback when pointer lock is unavailable or released (Esc).
    dom.addEventListener('pointerdown', (e) => { if (e.button === 0) this.dragging = true; });
    addEventListener('pointerup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== dom && !this.dragging) return;
      if (this.followCam) this.yaw -= e.movementX * MOUSE; else this.camYaw -= e.movementX * MOUSE;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * MOUSE, -1.1, 0.55);
      this.lastMouse = this.time;
    });
    dom.addEventListener('wheel', (e) => { this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.003, 1.6, 7); }, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Drive the body at `speed` along `dir` for `dur` seconds (dash, lunge, knockback). */
  impulse(dir: THREE.Vector3, speed: number, dur: number, turn = true) {
    this.burst = { v: dir.clone().setY(0).normalize().multiplyScalar(speed), t: dur, turn };
  }
  get dashing() { return !!this.burst && this.burst.v.length() > 6; }
  /** Jump (Space): from the ground, or a moment after stepping off an edge. */
  jump() {
    if (!this.enabled || this.cinematic || (!this.onGround && this.coyote <= 0)) return false;
    // A running jump goes higher and, carrying its speed, much farther (the wreckage on the road).
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.vy = sp > 4.2 ? 7.7 : 6.4;
    this.onGround = false;
    this.coyote = 0;
    return true;
  }
  /** Thrown: off the feet along `dir` at `speed`, `up` m/s into the air. */
  launch(dir: THREE.Vector3, speed: number, up: number) {
    this.impulse(dir, speed, 0.45, false);
    this.vy = up; this.onGround = false; this.coyote = 0;
  }
  /** Took a hit: the body snaps back and recovers (0.3 s). */
  flinch() { this.flinchT = 0.3; }
  private flinchT = 0;
  /** Hit from behind: whip round to face the attacker, the camera swinging in behind. */
  faceThreat(yaw: number) { this.threatYaw = yaw; this.camHurry = 0.7; }
  /** Turn the body toward a yaw (soft lock-on when attacking). */
  faceYaw(target: number, rate = 1) {
    const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += diff * rate;
  }
  /** Current planar move direction from input (camera-relative), or zero. */
  inputDir(): THREE.Vector3 {
    const k = this.keys;
    const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (!ix && !iz) return new THREE.Vector3();
    // Follow camera: relative to Jack's facing (A/D = sideways, for a sidestep roll).
    const ref = this.followCam ? this.yaw + Math.PI : this.camYaw;
    const fwd = new THREE.Vector3(-Math.sin(ref), 0, -Math.cos(ref));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return fwd.multiplyScalar(iz).addScaledVector(right, ix).normalize();
  }

  /** Low, orbiting close-up on a cut landing on `target` (slow-motion is the game's job). */
  sliceCam(target: THREE.Vector3, dur = 0.6) {
    const d = target.clone().sub(this.object.position);
    this.shot = { t: 0, dur, target: target.clone(), side: Math.random() < 0.5 ? 1 : -1, yaw0: Math.atan2(d.x, d.z) };
  }
  get inShot() { return !!this.shot; }

  /** Place the player (feet) and snap the camera behind. `yaw` = body facing. */
  teleport(pos: THREE.Vector3, yaw: number) {
    this.object.position.copy(pos);
    this.lastSafe.copy(pos);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.camPos.set(NaN, NaN, NaN);
  }

  /**
   * Safety net: if steering makes no progress for a second and Jack is boxed in on (nearly)
   * every side — wedged into geometry rather than just pushing against a wall — put him back
   * where he stood a couple of seconds ago.
   */
  private unstick(dt: number, before: THREE.Vector3, steering: boolean) {
    const p = this.object.position;
    this.histT += dt;
    if (this.histT > 0.5 && this.onGround) { this.histT = 0; this.hist.push(p.clone()); if (this.hist.length > 6) this.hist.shift(); }
    const moved = Math.hypot(p.x - before.x, p.z - before.z);
    this.noProgress = steering && moved < 0.004 ? this.noProgress + dt : 0;
    if (this.noProgress < 1 || !this.world) return;
    this.noProgress = 0;
    const o = p.clone().setY(p.y + 1);
    let blocked = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.world.rayDistance(o, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 1) < 0.9) blocked++;
    }
    if (blocked >= 6 && this.hist.length) {
      const back = this.hist[0];
      this.hist = [back];
      p.copy(back); this.vel.set(0, 0, 0); this.vy = 0;
    }
  }

  /** One collision sub-step of the current velocity (plus an optional push). */
  private step(dt: number, push: THREE.Vector3 | null) {
    const p = this.object.position;
    const next = p.clone().addScaledVector(this.vel, dt);
    if (push) next.add(push);
    next.y += this.vy * dt;
    if (this.world) {
      const r = this.world.resolve(next, RADIUS, HEIGHT);
      // Step-up: if a riser/kerb stopped us, try the move from STEP higher and settle down.
      const wantH = Math.hypot(this.vel.x, this.vel.z) * dt;
      const gotH = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
      if (this.onGround && wantH > 1e-3 && gotH < wantH * 0.6) {
        const up = p.clone().addScaledVector(this.vel, dt);
        up.y = p.y + STEP;
        const r2 = this.world.resolve(up, RADIUS, HEIGHT);
        // Probe under the capsule's leading edge too: at the riser the centre is still ~one
        // radius short of the tread, so the centre ray alone would find the lower floor.
        const lead = new THREE.Vector3(this.vel.x, 0, this.vel.z).setLength(RADIUS + 0.12);
        const gc = this.world.groundAt(r2.pos.x, r2.pos.z, r2.pos.y + 0.05, STEP + 0.1);
        const gl = this.world.groundAt(r2.pos.x + lead.x, r2.pos.z + lead.z, r2.pos.y + 0.05, STEP + 0.1);
        const g = gc === null ? gl : gl === null ? gc : Math.max(gc, gl);
        const got2 = Math.hypot(r2.pos.x - p.x, r2.pos.z - p.z);
        // Only a real rise counts: landing back on the same tread would sink us into the riser.
        if (g !== null && g - p.y > 0.02 && g - p.y <= STEP + 0.01 && got2 > gotH + 1e-3) {
          r.pos.set(r2.pos.x, g, r2.pos.z);
          r.onGround = true;
        }
      }
      // Slide along walls: keep only the velocity component the wall allowed.
      if (wantH > 1e-4 && gotH < wantH * 0.98) {
        const moved = new THREE.Vector3(r.pos.x - p.x, 0, r.pos.z - p.z).divideScalar(dt);
        this.vel.x = moved.x; this.vel.z = moved.z;
      }
      // Ledge guard: never walk off a drop deeper than 2.5 m (gaps in the castle walls, the gorge
      // edges) — the horizontal step is refused instead, so Jack stops at the edge.
      if (this.onGround && (r.pos.x !== p.x || r.pos.z !== p.z)) {
        const g = this.world.groundAt(r.pos.x, r.pos.z, p.y + 0.6, 40);
        if (g === null || g < p.y - 2.5) { r.pos.x = p.x; r.pos.z = p.z; r.onGround = true; this.vel.x = 0; this.vel.z = 0; }
      }
      next.copy(r.pos);
      this.onGround = r.onGround;
      // Stick to ramps/stairs going down instead of skipping off them.
      if (!this.onGround && this.vy <= 0) {
        const g = this.world.groundAt(next.x, next.z, next.y + 0.5, 0.95);
        if (g !== null && next.y - g < 0.45) { next.y = g; this.onGround = true; }
      }
    } else { next.y = Math.max(next.y, 0); this.onGround = next.y <= 0.001; }
    if (this.onGround && this.vy <= 0) { this.vy = 0; this.lastSafe.copy(next); }
    if (next.y < -2.5) next.copy(this.lastSafe).add(new THREE.Vector3(0, 0.2, 0)); // fell in the moat
    p.copy(next);
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.time += dt;
    const k = this.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    // Analog stick when no keys are held: direction plus how far it's pushed.
    let mag = 1;
    if (!ix && !iz && this.stick.lengthSq() > 0.02) { ix = this.stick.x; iz = this.stick.y; mag = Math.min(1, this.stick.length()); }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.sprintLatch || this.stickRun;
    // The camera logic wants clean intent (straight / diagonal / sidestep), not stick noise.
    this.lastIx = Math.abs(ix) < 0.3 ? 0 : Math.sign(ix); this.lastIz = Math.abs(iz) < 0.3 ? 0 : Math.sign(iz);

    // Desired horizontal velocity, relative to where the camera looks.
    const want = new THREE.Vector3();
    if (this.followCam && this.enabled) {
      // A/D turn (a little faster standing still), W/S along the facing; S backs up slowly.
      if (ix) this.yaw -= ix * KEY_TURN * (iz ? 0.85 : 1.15) * dt;
      if (iz) {
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        want.copy(fwd).multiplyScalar(iz > 0 ? (running ? RUN : WALK) * this.speedScale : -WALK * 0.55 * this.speedScale);
      }
    } else if (this.enabled && (ix || iz)) {
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      want.addScaledVector(fwd, iz).addScaledVector(right, ix).normalize().multiplyScalar((running ? RUN : WALK) * this.speedScale * Math.max(0.35, mag));
    }
    const dv = want.clone().sub(this.vel);
    const rate = (want.lengthSq() > this.vel.lengthSq() ? ACCEL : DECEL) * dt;
    if (dv.length() > rate) dv.setLength(rate);
    this.vel.add(dv);
    if (this.burst) {
      this.vel.copy(this.burst.v);
      this.burst.t -= dt;
      if (this.burst.t <= 0) { this.vel.multiplyScalar(0.35); this.burst = null; }
    }
    const speed = this.vel.length();

    // Body turns smoothly toward travel direction (shortest arc — no 180° snaps).
    let turned = 0;
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    if (this.threatYaw !== null) {
      const d = Math.atan2(Math.sin(this.threatYaw - this.yaw), Math.cos(this.threatYaw - this.yaw));
      this.yaw += THREE.MathUtils.clamp(d, -16 * dt, 16 * dt);
      if (Math.abs(d) < 0.05) this.threatYaw = null;
    }
    if (speed > 0.15 && !this.followCam && !this.faceLock && (!this.burst || this.burst.turn)) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      turned = THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
      this.yaw += turned;
    }
    // Lean into turns (banking with speed), eased.
    const bank = THREE.MathUtils.clamp(-(turned / Math.max(dt, 1e-3)) * 0.035 * Math.min(1, speed / RUN), -0.22, 0.22);
    this.lean += (bank - this.lean) * (1 - Math.exp(-dt * 10));
    if (this.character) {
      this.character.root.rotation.z = this.lean;
      this.flinchT = Math.max(0, this.flinchT - dt);
      this.character.root.rotation.x = -0.32 * Math.sin(Math.PI * (this.flinchT / 0.3));
    }

    // Integrate + collide in sub-steps (≤12 cm each) so sprints, rolls and lunges can't tunnel
    // through thin walls, rails or monsters.
    const p = this.object.position;
    this.vy -= GRAVITY * dt;
    const travel = this.vel.length() * dt + this.push.length();
    const steps = Math.min(8, Math.max(1, Math.ceil(travel / 0.12)));
    const sdt = dt / steps;
    const before = p.clone();
    for (let i = 0; i < steps; i++) this.step(sdt, i === 0 ? this.push : null);
    this.push.set(0, 0, 0);
    this.unstick(dt, before, ix !== 0 || iz !== 0);
    this.object.rotation.y = this.yaw;

    this.character?.setLocomotion(speed, WALK, RUN);

    if (this.cinematic) return;
    if (this.followCam) {
      // Centred behind Jack, a touch of lag so turns feel smooth, not rigid.
      const behind = this.yaw + Math.PI;
      const d = Math.atan2(Math.sin(behind - this.camYaw), Math.cos(behind - this.camYaw));
      this.camYaw += d * Math.min(1, dt * (Math.abs(d) > 1.2 ? 12 : 8));
    }
    // Fight framing: with the mouse idle, swing round so Jack and his foe are both in view,
    // pull back a little with more attackers, and tilt down onto the action.
    const idle = this.time - this.lastMouse;
    this.framing += ((this.combatFocus ? 1 : 0) - this.framing) * (1 - Math.exp(-dt * 3));
    // Never turn the camera while the player is steering: movement is camera-relative, so a
    // turning camera bends their path into circles. Framing only re-aims when they hold ground.
    // The camera never turns itself toward fights (players found it "doing its own thing"):
    // framing only pulls back (below); turning is the mouse's job.
    // The user wants the camera behind Jack, always: whenever the mouse rests, it settles in
    // behind him — fast running straight, gentler on diagonals (a soft arc, never a spin), also
    // standing or fighting. Only a pure sidestep or backing up toward the camera leaves it put.
    this.camHurry = Math.max(0, this.camHurry - dt);
    if (!this.followCam && this.camHurry > 0) {
      const behind = this.yaw + Math.PI;
      const d = Math.atan2(Math.sin(behind - this.camYaw), Math.cos(behind - this.camYaw));
      this.camYaw += d * Math.min(1, dt * 7);
    } else if (!this.followCam && idle > 0.45) {
      const moving = speed > 0.5;
      const sidestep = moving && this.lastIz === 0 && this.lastIx !== 0;
      const backing = moving && this.lastIz < 0;
      if (!sidestep && !backing) {
        const behind = this.yaw + Math.PI;
        const d = Math.atan2(Math.sin(behind - this.camYaw), Math.cos(behind - this.camYaw));
        const rate = !moving ? (idle > 0.9 ? 2.4 : 0) : this.lastIx === 0 ? 4.2 : 1.8;
        this.camYaw += d * Math.min(1, dt * rate);
      }
    }
    // The follow point: Jack's head height, eased (a soft lag that never drifts sideways) with a
    // little look-ahead along his travel. The camera sits exactly on its boom from this point, so
    // Jack stays centred however fast he turns or runs.
    const lead = new THREE.Vector3(this.vel.x, 0, this.vel.z).multiplyScalar(0.12);
    if (lead.length() > 0.8) lead.setLength(0.8);
    const look = p.clone().add(new THREE.Vector3(0, 1.55, 0)).add(lead);
    // Fight framing without turning: the follow point slides a little toward the foe, so Jack and
    // what he's fighting share the frame while the camera stays behind him.
    if (this.combatFocus) {
      const toFoe = this.combatFocus.clone().sub(p).setY(0);
      if (toFoe.length() > 2.2) toFoe.setLength(2.2);
      look.addScaledVector(toFoe, 0.32 * this.framing);
    }
    this.wideS += (this.wide - this.wideS) * (1 - Math.exp(-dt * 1.1));   // slow, cinematic push/pull
    look.y += this.wideS * 1.4;
    if (!Number.isFinite(this.pivotS.x)) this.pivotS.copy(look);
    // Softer follow while fighting: lunges and knockbacks glide instead of jerking the frame.
    this.pivotS.lerp(look, 1 - Math.exp(-dt * (this.framing > 0.5 ? 9 : 16)));
    if (this.pivotS.distanceTo(look) > 2.5) this.pivotS.copy(look);   // teleports, door fades
    // A touch higher looking down onto a fight, and higher still on the wide shot.
    const pitch = THREE.MathUtils.clamp(this.camPitch - this.framing * 0.07 - this.wideS * 0.17, -1.2, 0.55);
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(this.camYaw) * Math.cos(pitch),
    );
    const shoulder = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).multiplyScalar(0);
    const pivot = this.pivotS.clone().add(shoulder);
    // Boom length: fight framing pulls back; a wall pulls it in at once, open space lets it ease out.
    let boomWant = this.camDist + this.framing * (0.6 + 0.35 * Math.min(this.combatCount, 4)) + this.wideS * 6;
    if (this.world) boomWant = Math.max(0.6, Math.min(boomWant, this.world.rayDistance(pivot, dir, boomWant + 0.3) - 0.3));
    if (!Number.isFinite(this.boom) || boomWant < this.boom) this.boom = boomWant;
    else this.boom += (boomWant - this.boom) * (1 - Math.exp(-dt * 3));
    this.camPos.copy(pivot).addScaledVector(dir, this.boom);
    this.camLook.copy(pivot);
    camera.position.copy(this.camPos);
    // Shake: smooth (layered sines), not per-frame noise.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a2 = this.shake * 0.1, t = this.time;
      camera.position.x += Math.sin(t * 41) * Math.sin(t * 17.3) * a2;
      camera.position.y += Math.sin(t * 37 + 1.3) * Math.sin(t * 13.1) * a2;
    }
    camera.rotation.order = 'YXZ';
    this.kick = Math.max(0, this.kick - dt * 6);
    camera.rotation.set(pitch, this.camYaw, Math.sin(this.time * 31) * 0.012 * this.kick);
    camera.fov = 50 + 5 * this.kick + this.wideS * 6;
    // Slice close-up: blend out of the follow cam into a low orbit around the cut, and back.
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      const k = s.t / s.dur;
      const w = Math.min(1, k / 0.15, (1 - k) / 0.2);
      const head = p.clone().setY(p.y + 1.3);
      const mid = head.clone().lerp(s.target, 0.55);
      const ang = s.yaw0 + s.side * (Math.PI / 2 + 0.7 * k);
      const r = 2.5 - 0.6 * k;
      let cpos = mid.clone().add(new THREE.Vector3(Math.sin(ang) * r, 0.35 - 0.25 * k, Math.cos(ang) * r));
      if (this.world) {
        const dir = cpos.clone().sub(mid); const len = dir.length();
        const hit = this.world.rayDistance(mid, dir.normalize(), len + 0.2);
        if (hit < len) cpos = mid.clone().addScaledVector(dir, Math.max(0.6, hit - 0.25));
      }
      const camQ = camera.quaternion.clone();
      camera.position.lerp(cpos, w);
      const look = new THREE.Object3D(); look.position.copy(camera.position); look.lookAt(mid);
      camera.quaternion.copy(camQ).slerp(look.quaternion, w);
      camera.fov = THREE.MathUtils.lerp(camera.fov, 36, w);
      if (k >= 1) this.shot = null;
    }
    camera.updateProjectionMatrix();
  }
}
