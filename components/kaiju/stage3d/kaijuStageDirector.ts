// kaijuStageDirector — the two "directors" of the 3D Kaiju disco.
//
//   StageDirector  watches the music's energy and decides what is on stage: when it is quiet the scene
//                  dims and a follow-spot picks out the dancers; when it's up the disco ball comes down
//                  with moving heads, lasers and speaker stacks; drops pop confetti. Props glide in and
//                  out (no popping) and every state change has hysteresis so the room never flickers.
//   CameraDirector beat-cut music-video camera: wide / medium / close-up / low hero / orbit / crane /
//                  top-down / truck / ball-cam / dutch / snap-zoom, cut on the bar, quicker when the
//                  music is intense, close-ups on whoever is singing, forced cuts on drops.
//
// Both are deterministic given the audio features and a seed, framework-free and cheap (called once a
// frame). Units: metres; the dancers stand at x = ±1.3 facing +z (towards the audience / camera).

import * as THREE from 'three';
export { StageDirector } from './kaijuEnergyDirector';
export type { DirectorInput, PropId, Tier, StageState } from './kaijuEnergyDirector';
import type { DirectorInput, Tier } from './kaijuEnergyDirector';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (u: number) => u * u * (3 - 2 * u);

// ====================================================================== camera
export type ShotKind = 'wide' | 'wideLow' | 'medA' | 'medB' | 'closeA' | 'closeB' | 'two' | 'orbit' | 'crane' | 'top' | 'truck' | 'ball' | 'dutch' | 'snap' | 'hero';
export interface CameraPose { pos: THREE.Vector3; look: THREE.Vector3; fov: number; roll: number; cut: boolean; kind: ShotKind }
export interface CameraContext {
  /** world head positions of the two dancers */
  a: THREE.Vector3; b: THREE.Vector3;
  tier: Tier; drop: boolean; ball: number;
  /** -1 nobody / 0 / 1 */
  singer: number;
  eFast: number; vocal: boolean;
}

const C = new THREE.Vector3(0, 0.62, 0);

export class CameraDirector {
  readonly pose: CameraPose = { pos: new THREE.Vector3(0, 1.6, 7), look: C.clone(), fov: 38, roll: 0, cut: false, kind: 'wide' };
  /** Pin one shot type (inspection / a future "director's cut" toggle). null = the director decides. */
  force: ShotKind | null = null;
  private kind: ShotKind = 'wide'; private start = 0; private len = 8; private n = 0; private seed = 0.3; private lastKind: ShotKind = 'wide';
  private clock = 0; private lastDrop = -99; private ballShown = false; private smoothUntil = 0; private shake = new THREE.Vector3();
  private readonly p = new THREE.Vector3(); private readonly l = new THREE.Vector3();
  private readonly rawPos = new THREE.Vector3(); private readonly rawLook = new THREE.Vector3(0, 0.7, 0);

  update(i: DirectorInput, ctx: CameraContext): CameraPose {
    const dt = Math.min(0.1, i.dt); this.clock += dt;
    const beats = Number.isFinite(i.beats) && i.beats > 0 ? i.beats : this.clock * 2;
    let cut = false;
    const wantsCut = beats < this.start || beats - this.start >= this.len;
    const dropCut = ctx.drop && this.clock - this.lastDrop > 6;
    const ballCut = ctx.ball > 0.12 && !this.ballShown && ctx.tier !== 'quiet';
    if (wantsCut || dropCut || ballCut) {
      this.n++; this.start = Math.floor(beats); this.lastKind = this.kind;
      const e = ctx.eFast, quiet = ctx.tier === 'quiet' || ctx.tier === 'silent', peak = ctx.tier === 'peak';
      const lens = quiet ? [8, 16, 16, 32] : peak ? [2, 4, 4, 4, 8] : e > 0.45 ? [4, 4, 8, 8, 16] : [4, 8, 8, 16];
      this.len = lens[Math.floor(hash(this.n * 5.17) * lens.length)];
      this.seed = hash(this.n * 9.13);
      this.kind = this.choose(ctx, quiet, peak, dropCut, ballCut);
      if (dropCut) this.lastDrop = this.clock;
      if (ballCut) { this.ballShown = true; this.len = 6; }
      if (ctx.ball < 0.05) this.ballShown = false;
      cut = true;
      this.smoothUntil = quiet && !dropCut ? this.clock + 1.4 : 0;           // quiet scenes glide between shots, loud ones hard-cut
    } else if (ctx.ball < 0.05) this.ballShown = false;

    if (this.force) this.kind = this.force;
    const u = clamp((beats - this.start) / this.len), ease = smooth(u);
    const side = this.seed > 0.5 ? 1 : -1;
    this.shot(this.kind, u, ease, side, ctx, i);

    // glide or snap
    const k = this.smoothUntil > this.clock ? 1 - Math.exp(-dt / 0.45) : 1;
    this.p.lerp(this.rawPos, cut || k >= 1 ? 1 : k);
    this.l.lerp(this.rawLook, cut || k >= 1 ? 1 : k);
    if (cut && this.n === 1) { this.p.copy(this.rawPos); this.l.copy(this.rawLook); }

    // handheld sway + beat punch (stronger when it's loud)
    const t = this.clock, amp = 0.004 + 0.02 * ctx.eFast;
    this.shake.set(Math.sin(t * 1.7) * amp + Math.sin(t * 9.1) * amp * 0.3, Math.sin(t * 1.3 + 1) * amp, Math.cos(t * 1.9) * amp * 0.6);
    const punch = (ctx.tier === 'peak' ? 1.6 : 0.6) * i.kick;
    const o = this.pose;
    o.pos.copy(this.p).add(this.shake); o.look.copy(this.l);
    o.fov = this.fovFor(this.kind, u, ease) - punch; o.cut = cut; o.kind = this.kind;
    o.roll = this.kind === 'dutch' ? side * 0.2 : this.kind === 'snap' ? side * 0.05 : Math.sin(t * 0.6) * 0.004;
    return o;
  }

  private choose(ctx: CameraContext, quiet: boolean, peak: boolean, drop: boolean, ball: boolean): ShotKind {
    if (ball) return 'ball';
    if (drop) return hash(this.n * 3.3) > 0.5 ? 'snap' : 'hero';
    if (ctx.singer >= 0 && hash(this.n * 4.1) < 0.7) return ctx.singer === 0 ? 'closeA' : 'closeB';
    const table: [ShotKind, number][] = quiet
      ? [['wide', 3], ['medA', 2], ['medB', 2], ['closeA', 1.5], ['closeB', 1.5], ['orbit', 2], ['two', 2], ['crane', 0.6]]
      : peak
        ? [['wide', 1.5], ['wideLow', 2], ['medA', 1.3], ['medB', 1.3], ['closeA', 1], ['closeB', 1], ['orbit', 1.5], ['crane', 1], ['top', 1.3], ['truck', 1.5], ['dutch', 1.2], ['snap', 1], ['hero', 1.6], ['two', 1.2]]
        : [['wide', 2], ['wideLow', 1.3], ['medA', 1.5], ['medB', 1.5], ['closeA', 1], ['closeB', 1], ['orbit', 1.5], ['crane', 0.8], ['truck', 1], ['two', 1.5], ['hero', 0.8], ['dutch', 0.5]];
    const pool = table.filter(([k]) => k !== this.lastKind && k !== this.kind);
    const total = pool.reduce((a, [, w]) => a + w, 0); let r = hash(this.n * 2.31 + 0.7) * total;
    for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
    return 'wide';
  }

  private fovFor(kind: ShotKind, u: number, ease: number): number {
    switch (kind) {
      case 'closeA': case 'closeB': return 27 - 3 * ease;
      case 'medA': case 'medB': return 33 - 3 * ease;
      case 'wide': return 40 - 3 * ease;
      case 'wideLow': return 44;
      case 'snap': return 62 - 34 * (1 - Math.pow(1 - Math.min(1, u * 3), 3));
      case 'ball': return 46;
      case 'top': return 44;
      case 'hero': return 36 - 3 * ease;
      default: return 38;
    }
  }

  private shot(kind: ShotKind, u: number, ease: number, side: number, ctx: CameraContext, i: DirectorInput) {
    const P = this.rawPos, L = this.rawLook, a = ctx.a, b = ctx.b;
    switch (kind) {
      case 'wide': P.set(side * 0.8 * (1 - ease), 1.5 + 0.2 * ease, 7.4 - 1.3 * ease); L.set(0, 0.75, 0); break;
      case 'wideLow': P.set(side * (2.8 - 0.8 * ease), 0.28, 5.8 - 0.8 * ease); L.set(0, 0.95, 0); break;
      case 'medA': P.set(a.x - 0.9 + side * 0.4 * ease, a.y * 0.6 + 0.65, a.z + 5.0 - 0.7 * ease); L.set(a.x, a.y * 0.8 + 0.05, a.z); break;
      case 'medB': P.set(b.x + 0.9 - side * 0.4 * ease, b.y * 0.6 + 0.65, b.z + 5.0 - 0.7 * ease); L.set(b.x, b.y * 0.8 + 0.05, b.z); break;
      case 'closeA': P.set(a.x + 0.7 * side, a.y + 0.08, a.z + 3.3 - 0.4 * ease); L.set(a.x, a.y - 0.05, a.z); break;
      case 'closeB': P.set(b.x + 0.7 * side, b.y + 0.08, b.z + 3.3 - 0.4 * ease); L.set(b.x, b.y - 0.05, b.z); break;
      case 'two': P.set(side * 0.3, a.y * 0.5 + 0.7, 4.7 - 0.8 * ease); L.set(0, 0.75, 0); break;
      case 'orbit': { const ang = side * (0.25 + 0.75 * ease); P.set(Math.sin(ang) * 6.2, 1.6 + 0.4 * ease, Math.cos(ang) * 6.2); L.set(0, 0.7, 0); break; }
      case 'crane': { const v = side > 0 ? ease : 1 - ease; P.set(0, 0.35 + v * 4.2, 5.2 + v * 2.2); L.set(0, 0.8 - v * 0.2, 0); break; }
      case 'top': P.set(0.2 * side, 8.2, 2.0 + 1.2 * ease); L.set(0, 0, 0.1); break;
      case 'truck': P.set(side * (-5 + 10 * ease), 1.25, 4.3); L.set(0, 0.8, 0); break;
      case 'ball': P.set(0, 0.7 + 1.1 * (1 - ctx.ball), 6.2); L.set(0, 0.9 + 3.2 * (1 - Math.abs(ease - 0.5) * 2), 0); break;
      case 'dutch': P.set(side * 2.6, 1.0, 5.4 - 0.6 * ease); L.set(0, 0.8, 0); break;
      case 'snap': P.set(side * 1.0, 1.3, 6.4); L.set(0, 0.8, 0); break;
      case 'hero': P.set(side * 1.7 * (1 - ease), 0.22, 5.0 - 0.9 * ease); L.set(0, 1.0 + 0.2 * ease, 0); break;
    }
    void i;
  }
}
