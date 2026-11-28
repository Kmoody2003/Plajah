// Vesselbound (Rift Realm) — one tree ent's motion: a slow, heavy procedural walk with planted feet, and its actions
// (reach-and-tend, the two-fisted smash, the blessing hand, the threat). The body is model.ts's rigid wood segments;
// this file places them every frame:
//   • Feet plant in the world and stay put; one lifts only when the other is down and the body has drawn away from it
//     (or turned), then swings in a 2 s arc to where it will be needed — so it walks, turns on the spot and stops
//     without sliding. Each landing is a footstep event (shake, thud, dust: index.ts).
//   • Legs and arms are two-bone IK (law of cosines): knees bend forward, elbows back and out.
//   • Actions are short timelines that drive crouch, torso pitch and the hand targets from idle and back to idle.
import * as THREE from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacterAsset } from '../characters';
import { ENT, buildEntModel, type EntModel } from './model';
import { WARDENS, type Warden } from './wardens';

/** Map a Warden id (e.g. 'ancient-oak') to its high-quality rigged character asset id ('ent_ancient_oak'). */
export const wardenAssetId = (wardenId: string) => `ent_${wardenId.replace(/-/g, '_')}`;

export type EntActKind = 'tend' | 'smash' | 'bless' | 'threaten';
type Side = 'Left' | 'Right';

interface Foot {
  pos: THREE.Vector3;          // ground point under the ankle (world)
  yaw: number;
  swing: number;               // -1 planted, else 0…1
  from: THREE.Vector3; to: THREE.Vector3; fromYaw: number; toYaw: number;
}

interface Act { kind: EntActKind; move: string; t: number; dur: number; target: THREE.Vector3; fired: boolean }

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const SIDES: Side[] = ['Left', 'Right'];
const SX: Record<Side, number> = { Left: 1, Right: -1 };

/** Action timelines: [windup, strike, hold, recover] seconds. */
const TIMES: Record<EntActKind, number[]> = { smash: [1.6, 0.38, 0.5, 1.8], tend: [2.2, 0.01, 2.8, 2.2], bless: [1.6, 0.01, 4.0, 1.6], threaten: [1.4, 0.01, 1.4, 1.2] };

export class Ent {
  readonly model: EntModel;
  readonly root: THREE.Group;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** Where it is walking to (null = stand). */
  goal: THREE.Vector3 | null = null;
  speed = 0;
  maxSpeed = 2.3;
  /** Rooted: standing as a tree, boughs (arms) spread up and out, sunk a little. */
  rooted = true;
  /** Where to look (head turn), null = ahead. */
  look: THREE.Vector3 | null = null;
  act: Act | null = null;
  /** 0 asleep (a tree) … 1 fully awake (eyes and sap bright). */
  awake = 0;
  readonly feet: Record<Side, Foot>;
  /** World joint positions this frame (collision columns, effects). */
  readonly joints = { hip: { Left: new THREE.Vector3(), Right: new THREE.Vector3() }, knee: { Left: new THREE.Vector3(), Right: new THREE.Vector3() }, ankle: { Left: new THREE.Vector3(), Right: new THREE.Vector3() }, pelvis: new THREE.Vector3(), hand: { Left: new THREE.Vector3(), Right: new THREE.Vector3() }, head: new THREE.Vector3() };
  onStep: ((side: Side, at: THREE.Vector3) => void) | null = null;
  /** `move` is the named move that started the action (index.ts MOVES), its timeline is `kind`'s. */
  onAct: ((kind: EntActKind, at: THREE.Vector3, phase: 'start' | 'strike' | 'end', move: string) => void) | null = null;
  /** Adjust a planned foot landing (keeps it off the player when friendly). */
  avoid: ((p: THREE.Vector3) => void) | null = null;

  private crouch = 0; private pitch = 0; private roll = 0;
  private bodyY = 0;
  private v = new THREE.Vector3(); private w = new THREE.Vector3(); private u = new THREE.Vector3();
  private fwd = new THREE.Vector3(); private right = new THREE.Vector3();
  private m4 = new THREE.Matrix4(); private bx = new THREE.Vector3(); private by = new THREE.Vector3(); private bz = new THREE.Vector3();
  private handIdle = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
  private handT = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
  private t = 0;

  /** Which Grovewarden this is, and its size (a multiple of the 46 m body). */
  readonly warden: Warden;
  readonly scale: number;
  /** Target real-world standing height in metres (36–44 m). */
  readonly targetHeight: number;
  /** High-quality sculpted & rigged GLB Grovewarden (replaces the stand-in procedural tree body once loaded). */
  rigged = false;
  private rigScene: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clipActs = new Map<string, THREE.AnimationAction>();
  private idleAct: THREE.AnimationAction | null = null;
  private walkAct: THREE.AnimationAction | null = null;
  private activeOneShot: THREE.AnimationAction | null = null;
  private rigBones = new Map<string, THREE.Object3D>();
  private rigMoveW = 0;
  private rigHeadYaw = 0;
  private rigHeadPitch = 0;
  private rigLoading: Promise<boolean> | null = null;
  private proceduralDetached = false;

  constructor(seed: number, private ground: (x: number, z: number) => number, x: number, z: number, yaw: number, lo = false, warden: Warden = WARDENS[0]) {
    this.warden = warden;
    this.model = buildEntModel(seed, { lo, look: warden.look });
    this.root = new THREE.Group();
    this.root.name = `ent-${warden.id}`;
    // measure the grown body (feet to crown top, standing pose) and size it to the warden's height, ±1 % per individual
    this.model.root.updateMatrixWorld(true);
    const grown = Math.max(1, new THREE.Box3().setFromObject(this.model.root).max.y);
    const jitter = 1 + (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.02;
    this.targetHeight = warden.height * jitter;
    this.scale = this.targetHeight / grown;
    this.model.root.scale.setScalar(this.scale);
    this.root.add(this.model.root);
    this.maxSpeed *= this.scale;
    this.yaw = yaw;
    this.pos.set(x, ground(x, z), z);
    this.bodyY = this.pos.y;
    const f = (side: Side): Foot => {
      const p = this.homeOf(side, new THREE.Vector3());
      return { pos: p, yaw, swing: -1, from: p.clone(), to: p.clone(), fromYaw: yaw, toYaw: yaw };
    };
    this.feet = { Left: f('Left'), Right: f('Right') };
    this.t = seed * 3.1;
    this.update(0);
  }

  /** Load the sculpted, 58-bone rigged Grovewarden GLB + clip library and swap out the procedural stand-in. */
  loadRiggedModel(): Promise<boolean> {
    if (this.rigged) return Promise.resolve(true);
    if (this.rigLoading) return this.rigLoading;
    const assetId = wardenAssetId(this.warden.id);
    this.rigLoading = loadCharacterAsset(assetId).then((asset) => {
      if (!asset) return false;
      const cloned = SkeletonUtils.clone(asset.scene);
      cloned.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cloned);
      const rawH = Math.max(0.1, box.max.y - box.min.y);
      const s = this.targetHeight / rawH;
      cloned.scale.setScalar(s);
      cloned.position.y = -box.min.y * s;
      cloned.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          m.frustumCulled = false;
        }
        if ((o as THREE.Bone).isBone) {
          this.rigBones.set(o.name.replace(/^.*[:|]/, ''), o);
        }
      });

      const mixer = new THREE.AnimationMixer(cloned);
      this.clipActs.clear();
      for (const c of asset.clips) {
        this.clipActs.set(c.name.toLowerCase(), mixer.clipAction(c));
      }

      // Authentic titan locomotion: pure standing idle (never gun-aim) + heavy walk stride
      const idle = this.clipActs.get('idle') ?? this.clipActs.get('hero_idle') ?? this.clipActs.get('combat_idle') ?? null;
      const walk = this.clipActs.get('walk') ?? this.clipActs.get('run') ?? null;
      if (idle) {
        idle.setLoop(THREE.LoopRepeat, Infinity).play();
        idle.setEffectiveWeight(1);
        idle.timeScale = 0.42;
      }
      if (walk) {
        walk.setLoop(THREE.LoopRepeat, Infinity).play();
        walk.setEffectiveWeight(0);
        walk.timeScale = 0.42;
      }

      this.rigScene = cloned;
      this.mixer = mixer;
      this.idleAct = idle;
      this.walkAct = walk;
      this.rigged = true;

      // Replace stand-in procedural tree body cleanly so only the sculpted Grovewarden renders
      if (!this.proceduralDetached) {
        this.proceduralDetached = true;
        this.model.root.visible = false;
        this.root.remove(this.model.root);
        this.model.detail.length = 0;
        this.model.dispose();
      }
      this.root.add(cloned);
      mixer.update(0.016);
      this.syncRigJoints();
      console.info(`[ents] high-quality rigged Grovewarden mounted: ${assetId} (${this.targetHeight.toFixed(1)} m, ${this.rigBones.size} bones, ${this.clipActs.size} clips)`);
      return true;
    }).catch((err) => {
      console.warn('[ents] rigged Grovewarden load failed, keeping procedural fallback:', assetId, err);
      return false;
    });
    return this.rigLoading;
  }

  private playRigAction(kind: EntActKind, dur: number) {
    if (!this.rigged || !this.mixer) return;
    const candidates: Record<EntActKind, string[]> = {
      smash: ['finisher', 'heavy_3', 'heavy_1', 'attack_1'],
      tend: ['eat', 'pray', 'crouch_walk'],
      bless: ['pray', 'hero_idle', 'idle'],
      threaten: ['heavy_2', 'attack_3', 'attack_2', 'block'],
    };
    let act: THREE.AnimationAction | null = null;
    for (const name of candidates[kind]) {
      const a = this.clipActs.get(name);
      if (a) { act = a; break; }
    }
    if (!act) return;
    if (this.activeOneShot && this.activeOneShot !== act) this.activeOneShot.fadeOut(0.25);
    act.reset().setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = false;
    act.timeScale = Math.max(0.18, Math.min(1.2, act.getClip().duration / Math.max(0.5, dur)));
    act.setEffectiveWeight(1);
    act.fadeIn(0.28).play();
    this.activeOneShot = act;
  }

  private syncRigJoints() {
    this.root.updateMatrixWorld(true);
    const getB = (name: string, out: THREE.Vector3, fx: number, fy: number, fz: number) => {
      const b = this.rigBones.get(name);
      if (b) { b.getWorldPosition(out); return; }
      out.set(fx * this.scale, fy * this.scale, fz * this.scale).applyMatrix4(this.root.matrixWorld);
    };
    getB('Hips', this.joints.pelvis, 0, ENT.hipY, 0);
    getB('Head', this.joints.head, 0, ENT.hipY + ENT.headY, 0);
    getB('LeftUpLeg', this.joints.hip.Left, ENT.hipX, ENT.hipY, 0);
    getB('RightUpLeg', this.joints.hip.Right, -ENT.hipX, ENT.hipY, 0);
    getB('LeftLeg', this.joints.knee.Left, ENT.hipX, ENT.hipY - ENT.thigh, 0);
    getB('RightLeg', this.joints.knee.Right, -ENT.hipX, ENT.hipY - ENT.thigh, 0);
    getB('LeftFoot', this.joints.ankle.Left, ENT.hipX, ENT.ankleY, 0);
    getB('RightFoot', this.joints.ankle.Right, -ENT.hipX, ENT.ankleY, 0);
    getB('LeftHand', this.joints.hand.Left, ENT.shoulderX, ENT.hipY + 4, 2);
    getB('RightHand', this.joints.hand.Right, -ENT.shoulderX, ENT.hipY + 4, 2);
  }

  /** Teleport (placement): feet planted under the new spot. */
  place(x: number, z: number, yaw: number) {
    this.yaw = yaw; this.pos.set(x, this.ground(x, z), z); this.bodyY = this.pos.y; this.speed = 0;
    for (const s of SIDES) { const f = this.feet[s]; this.homeOf(s, f.pos); f.yaw = yaw; f.swing = -1; }
    this.update(0);
  }

  get busy() { return !!this.act; }
  get walking() { return this.speed > 0.15 || this.feet.Left.swing >= 0 || this.feet.Right.swing >= 0; }

  /** Start an action toward a world point; ignored while another runs. */
  start(kind: EntActKind, target: THREE.Vector3, move: string = kind) {
    if (this.act) return false;
    const T = TIMES[kind];
    const dur = T[0] + T[1] + T[2] + T[3];
    this.act = { kind, move, t: 0, dur, target: target.clone(), fired: false };
    this.rooted = false;
    this.playRigAction(kind, dur);
    this.onAct?.(kind, this.act.target, 'start', move);
    return true;
  }
  /** Keep a running action's target (bless follows the player). */
  retarget(p: THREE.Vector3) { this.act?.target.copy(p); }
  /** Extend a held action (bless while the player stays hurt). */
  hold(sec: number) { const a = this.act; if (!a) return; const T = TIMES[a.kind], hEnd = T[0] + T[1] + T[2]; if (a.t > T[0] && a.t < hEnd) a.t = Math.max(T[0] + T[1], a.t - sec); }

  private homeOf(side: Side, out: THREE.Vector3) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lead = this.speed * 1.1, hx = ENT.hipX * 1.05 * this.scale;
    out.set(this.pos.x + c * SX[side] * hx + s * lead, 0, this.pos.z - s * SX[side] * hx + c * lead);
    out.y = this.ground(out.x, out.z);
    return out;
  }

  update(dt: number) {
    this.t += dt;
    const a = this.act;
    // ── locomotion: turn toward the goal, walk (slow and heavy), stop for actions ──
    let wantSpeed = 0;
    const faceTo = a ? a.target : this.goal;
    if (faceTo) {
      const want = Math.atan2(faceTo.x - this.pos.x, faceTo.z - this.pos.z), dy = wrap(want - this.yaw);
      const rate = a ? (a.kind === 'smash' && a.t < TIMES.smash[0] ? 0.7 : 0.35) : 0.28;
      if (Math.hypot(faceTo.x - this.pos.x, faceTo.z - this.pos.z) > 2) this.yaw += clamp(dy, -rate * dt, rate * dt);
      if (!a && this.goal) {
        const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
        if (d < 4) this.goal = null;
        else wantSpeed = this.maxSpeed * clamp(d / 12, 0.35, 1) * clamp((Math.cos(dy) - 0.3) / 0.6, 0.15, 1);
      }
    }
    this.speed += (wantSpeed - this.speed) * clamp(dt * 0.8);
    if (this.speed < 0.02 && !wantSpeed) this.speed = 0;
    this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // the ent's left (+X local)
    this.pos.addScaledVector(this.fwd, this.speed * dt);

    // ── feet: plant, lift when drawn away, swing (2 s), land ──
    const swingT = 2.0;
    for (const side of SIDES) {
      const f = this.feet[side];
      if (f.swing >= 0) {
        f.swing = Math.min(1, f.swing + dt / swingT);
        const e = ease(f.swing);
        f.pos.lerpVectors(f.from, f.to, e);
        f.pos.y = f.from.y + (f.to.y - f.from.y) * e;
        f.yaw = f.fromYaw + wrap(f.toYaw - f.fromYaw) * e;
        if (f.swing >= 1) { f.swing = -1; f.pos.copy(f.to); this.onStep?.(side, f.pos); }
      }
    }
    if (this.feet.Left.swing < 0 && this.feet.Right.swing < 0 && dt > 0) {
      // which foot is furthest from where it should be (by distance or by turn)
      let pick: Side | null = null, worst = 0;
      for (const side of SIDES) {
        const f = this.feet[side], h = this.homeOf(side, this.v);
        const need = Math.hypot(h.x - f.pos.x, h.z - f.pos.z) + Math.abs(wrap(this.yaw - f.yaw)) * 6 * this.scale;
        const thresh = (this.speed > 0.2 ? 3.2 : 2.2) * this.scale;
        if (need > thresh && need > worst) { worst = need; pick = side; }
      }
      if (pick) {
        const f = this.feet[pick];
        f.from.copy(f.pos); f.fromYaw = f.yaw;
        this.homeOf(pick, f.to).addScaledVector(this.fwd, this.speed * swingT * 0.55);
        this.avoid?.(f.to);
        f.to.y = this.ground(f.to.x, f.to.z);
        f.toYaw = this.yaw; f.swing = 0;
      }
    }

    // ── the action timeline: crouch, torso pitch, hand targets ──
    let crouch = this.rooted ? 0.7 : 0.15, pitch = this.rooted ? -0.03 : 0.06, kH = 0, kHL = 0;
    let handMode: 'idle' | 'over' | 'target' | 'wide' = 'idle';
    if (a) {
      a.t += dt;
      const T = TIMES[a.kind], t0 = T[0], t1 = t0 + T[1], t2 = t1 + T[2];
      const up = a.t < t0 ? ease(a.t / t0) : a.t < t2 ? 1 : 1 - ease((a.t - t2) / T[3]);
      if (a.kind === 'smash') {
        // wind up overhead, leaning back; slam both fists down; hold; rise
        if (a.t < t0) { crouch = 0.15 + up * 1.2; pitch = 0.06 - up * 0.2; handMode = 'over'; kH = kHL = up; }
        else if (a.t < t1) { const s = ease((a.t - t0) / T[1]); crouch = 1.35 + s * 4.2; pitch = -0.14 + s * 0.68; handMode = 'target'; kH = kHL = 1; }
        else { crouch = 0.15 + up * 5.4; pitch = 0.06 + up * 0.48; handMode = 'target'; kH = kHL = up; }
        if (!a.fired && a.t >= t1) { a.fired = true; this.onAct?.('smash', a.target, 'strike', a.move); }
      } else if (a.kind === 'tend' || a.kind === 'bless') {
        crouch = 0.15 + up * (a.kind === 'tend' ? 4.4 : 2.6); pitch = 0.06 + up * (a.kind === 'tend' ? 0.46 : 0.3);
        handMode = 'target'; kH = up; kHL = 0;
        if (!a.fired && a.t >= t1) { a.fired = true; this.onAct?.(a.kind, a.target, 'strike', a.move); }
      } else { // threaten: rise up, boughs spread wide, lean in
        crouch = 0.15 - up * 0.6; pitch = 0.06 + up * 0.2; handMode = 'wide'; kH = kHL = up;
        if (!a.fired && a.t >= t1) { a.fired = true; this.onAct?.('threaten', a.target, 'strike', a.move); }
      }
      if (a.t >= a.dur) { this.onAct?.(a.kind, a.target, 'end', a.move); this.act = null; }
    }
    const k = clamp(dt * 3);
    this.crouch += (crouch - this.crouch) * (a?.kind === 'smash' ? 1 : k || 1);
    this.pitch += (pitch - this.pitch) * (a?.kind === 'smash' ? 1 : k || 1);
    this.awake += ((this.rooted && !a ? 0 : 1) - this.awake) * clamp(dt * 0.6);

    // ── the body: root on the ground between the feet ──
    const gy = (this.feet.Left.pos.y + this.feet.Right.pos.y) / 2;
    this.bodyY += (gy - this.bodyY) * (dt ? clamp(dt * 2) : 1);
    this.pos.y = this.bodyY;
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.updateMatrix(); this.root.updateMatrixWorld(true);

    // ── High-quality sculpted & rigged Grovewarden path (58-bone GLB + Forge clips) ──
    if (this.rigged && this.mixer && this.rigScene) {
      const wantMove = this.act ? 0 : clamp(this.speed / 0.85, 0, 1);
      this.rigMoveW += (wantMove - this.rigMoveW) * (dt ? clamp(dt * 3.2) : 1);
      const actWeight = this.activeOneShot && this.activeOneShot.isRunning() ? 1 : 0;
      if (this.idleAct) {
        this.idleAct.setEffectiveWeight((1 - this.rigMoveW) * (1 - actWeight * 0.9));
        this.idleAct.timeScale = this.rooted ? 0.2 : 0.44;
      }
      if (this.walkAct) {
        this.walkAct.setEffectiveWeight(this.rigMoveW * (1 - actWeight * 0.9));
        this.walkAct.timeScale = clamp(this.speed / 4.4, 0.28, 0.68);
      }
      if (this.activeOneShot && !this.activeOneShot.isRunning()) {
        this.activeOneShot = null;
      }
      this.mixer.update(dt);

      // Gentle head gaze toward what the Grovewarden watches
      const headB = this.rigBones.get('Head');
      if (headB) {
        let hy = 0, hx = this.rooted ? 0.14 : 0.04;
        if (this.look) {
          this.root.worldToLocal(this.v.copy(this.look));
          hy = clamp(Math.atan2(this.v.x, this.v.z), -0.65, 0.65);
          hx = clamp(-Math.atan2(this.v.y - this.targetHeight * 0.78, Math.hypot(this.v.x, this.v.z)), -0.3, 0.35);
        }
        this.rigHeadYaw += (hy - this.rigHeadYaw) * clamp(dt * 1.4 || 1);
        this.rigHeadPitch += (hx - this.rigHeadPitch) * clamp(dt * 1.4 || 1);
        headB.rotation.y += this.rigHeadYaw * 0.65;
        headB.rotation.x += this.rigHeadPitch * 0.55;
      }
      this.syncRigJoints();
      return;
    }

    // ── Procedural fallback body (only while GLB is streaming in) ──
    const mr = this.model.root;
    mr.updateMatrixWorld(true);
    let lift = 0, swayX = 0;
    for (const side of SIDES) {
      const f = this.feet[side];
      if (f.swing >= 0) { lift = Math.max(lift, Math.sin(f.swing * Math.PI)); swayX -= SX[side] * Math.sin(f.swing * Math.PI) * 0.9; }
    }
    const breathe = Math.sin(this.t * 0.45) * 0.18;
    const pv = this.model.pelvis;
    pv.position.set(swayX, ENT.hipY - this.crouch + lift * 0.6 - 0.3 + breathe * 0.4, -this.pitch * 1.5);
    this.roll += (swayX * 0.035 - this.roll) * clamp(dt * 2 || 1);
    pv.rotation.set(this.pitch + Math.sin(this.t * 0.31) * 0.01, Math.sin(this.t * 0.2) * 0.02 - swayX * 0.03, this.roll);
    pv.updateMatrix();
    const hd = this.model.head;
    let hy = 0, hx = this.rooted ? 0.22 : 0.08;
    if (this.look) {
      mr.worldToLocal(this.v.copy(this.look));
      hy = clamp(Math.atan2(this.v.x, this.v.z), -0.7, 0.7);
      hx = clamp(-Math.atan2(this.v.y - 34, Math.hypot(this.v.x, this.v.z)) - this.pitch, -0.35, 0.45);
    }
    hd.rotation.y += (hy - hd.rotation.y) * clamp(dt * 1.2 || 1);
    hd.rotation.x += (hx - hd.rotation.x) * clamp(dt * 1.2 || 1);

    for (const side of SIDES) {
      const f = this.feet[side], fl = f.swing >= 0 ? Math.sin(f.swing * Math.PI) : 0;
      const hip = this.v.set(SX[side] * ENT.hipX, 0, 0).applyMatrix4(pv.matrix);
      const ankle = this.w.copy(f.pos); ankle.y += (ENT.ankleY + fl * 2.6) * this.scale;
      mr.worldToLocal(ankle);
      const knee = this.u;
      solve2(hip, ankle, ENT.thigh, ENT.shin, this.bz.set(0, 0, 1), knee);
      orient(this.model.segs[`${side}UpLeg`].group, hip, knee, this.bz.set(0, 0, 1), this.m4, this.bx, this.by);
      orient(this.model.segs[`${side}Leg`].group, knee, ankle, this.bz.set(0, 0, 1), this.m4, this.bx, this.by);
      const fg = this.model.feet[side];
      fg.position.copy(ankle);
      fg.rotation.set(-fl * 0.35, wrap(f.yaw - this.yaw), 0);
      this.joints.hip[side].copy(hip).applyMatrix4(mr.matrixWorld);
      this.joints.knee[side].copy(knee).applyMatrix4(mr.matrixWorld);
      this.joints.ankle[side].copy(ankle).applyMatrix4(mr.matrixWorld);
    }
    this.joints.pelvis.copy(pv.position).applyMatrix4(mr.matrixWorld);

    const reach = ENT.upperArm + ENT.foreArm;
    for (const side of SIDES) {
      const sh = this.bx.set(SX[side] * ENT.shoulderX, ENT.shoulderY, 0).applyMatrix4(pv.matrix).clone();
      const other = this.feet[side === 'Left' ? 'Right' : 'Left'];
      mr.worldToLocal(this.w.copy(other.pos));
      const hi = this.handIdle[side];
      if (this.rooted) hi.set(sh.x + SX[side] * 12, sh.y + 8 + Math.sin(this.t * 0.3 + SX[side]) * 0.4, sh.z - 2);
      else hi.set(sh.x + SX[side] * 2.6, sh.y - reach * 0.88, sh.z + 1.5 + clamp(this.w.z * 0.35, -3.5, 3.5) + breathe);
      const ht = this.handT[side];
      ht.copy(hi);
      const kk = side === 'Right' ? kH : kHL;
      if (kk > 0 && a) {
        if (handMode === 'over') this.v.set(SX[side] * 2.2, sh.y + 13, sh.z - 2.5);
        else if (handMode === 'wide') this.v.set(sh.x + SX[side] * 13, sh.y + 5, sh.z + 5);
        else {
          mr.worldToLocal(this.v.copy(a.target));
          this.v.y += a.kind === 'bless' ? 7 : a.kind === 'tend' ? 2.8 : 3.2;
          if (a.kind === 'smash') this.v.x += SX[side] * 1.8;
          if (a.kind === 'tend' || a.kind === 'bless') this.v.x += SX[side] * 0.5;
        }
        ht.lerp(this.v, kk);
      }
      const elbow = this.u;
      const bend = this.by.set(SX[side] * 0.6, -0.3, -1).normalize();
      solve2(sh, ht, ENT.upperArm, ENT.foreArm, bend, elbow);
      const wrist = this.w.copy(ht);
      const d = wrist.distanceTo(sh);
      if (d > reach * 0.999) wrist.sub(sh).multiplyScalar((reach * 0.999) / d).add(sh);
      const fwdRef = this.bz.set(0, 0, 1);
      orient(this.model.segs[`${side}Arm`].group, sh, elbow, fwdRef, this.m4, this.bx, this.by);
      orient(this.model.segs[`${side}ForeArm`].group, elbow, wrist, fwdRef, this.m4, this.bx, this.by);
      this.joints.hand[side].copy(wrist).applyMatrix4(mr.matrixWorld);
    }
    const e = 0.35 + this.awake * 3.2 + (a?.kind === 'smash' || a?.kind === 'threaten' ? 2 : 0);
    this.model.eyes.color.copy(this.model.eyeColor).multiplyScalar(e);
    this.root.updateMatrixWorld(true);
    this.joints.head.set(0, 0, 0).applyMatrix4(hd.matrixWorld);
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    if (!this.proceduralDetached) this.model.dispose();
  }
}

/** Two-bone IK: from root a to target b with lengths l1, l2; the middle joint bends toward `bend`. */
function solve2(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3, out: THREE.Vector3) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const c = Math.min(Math.max(Math.hypot(dx, dy, dz), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const ux = dx / (Math.hypot(dx, dy, dz) || 1), uy = dy / (Math.hypot(dx, dy, dz) || 1), uz = dz / (Math.hypot(dx, dy, dz) || 1);
  const cosA = (l1 * l1 + c * c - l2 * l2) / (2 * l1 * c), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // bend direction, made perpendicular to the reach line
  const bd = bend.x * ux + bend.y * uy + bend.z * uz;
  let px = bend.x - ux * bd, py = bend.y - uy * bd, pz = bend.z - uz * bd;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) { px = 0; py = 0; pz = 1; } else { px /= pl; py /= pl; pz /= pl; }
  out.set(a.x + (ux * cosA + px * sinA) * l1, a.y + (uy * cosA + py * sinA) * l1, a.z + (uz * cosA + pz * sinA) * l1);
  return out;
}

/** Place a segment built along −Y so it runs from joint a to joint b, its +Z kept toward `ref`. */
function orient(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, ref: THREE.Vector3, m: THREE.Matrix4, x: THREE.Vector3, y: THREE.Vector3) {
  y.subVectors(a, b); const l = y.length(); if (l < 1e-4) return; y.divideScalar(l);
  const z = ref.clone().addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  x.crossVectors(y, z);
  m.makeBasis(x, y, z);
  g.quaternion.setFromRotationMatrix(m);
  g.position.copy(a);
  g.updateMatrix();
}
