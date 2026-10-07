// kaijuCamera2D — the beat-cutting camera director for the 2D Kaiju stage.
//
// Same grammar as the 3D CameraDirector (cuts on the bar, shorter shots when the music is intense, close-ups
// on whoever is singing, a forced cut on every drop, a ball-cam when the disco ball comes down) but in a
// 2D world: a virtual camera that pans, zooms and rolls over the 1600×900 stage. Everything on stage is
// vector or high-res sprites, so zooming in stays sharp. Pure maths — no canvas, no DOM.

import type { Tier } from '../stage3d/kaijuStageDirector';

export type Shot2D = 'wide' | 'wideLow' | 'two' | 'medA' | 'medB' | 'closeA' | 'closeB' | 'orbit' | 'crane' | 'floor' | 'truck' | 'ball' | 'dutch' | 'snap' | 'whip';

export interface Cam2D { cx: number; cy: number; zoom: number; roll: number; cut: boolean; kind: Shot2D }
export interface Cam2DInput { dt: number; beats: number; kick: number; eFast: number }
export interface Cam2DContext {
  /** stage-space positions of each dancer's head and of the floor under their feet */
  headA: { x: number; y: number }; headB: { x: number; y: number };
  tier: Tier; drop: boolean; ball: number; singer: number;
}

export const WORLD_W = 1600, WORLD_H = 900;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CameraDirector2D {
  readonly cam: Cam2D = { cx: 800, cy: 450, zoom: 1, roll: 0, cut: false, kind: 'wide' };
  /** Pin a shot (inspection / a future "director's cut" toggle). null = the director decides. */
  force: Shot2D | null = null;
  private kind: Shot2D = 'wide'; private last: Shot2D = 'wide';
  private start = 0; private len = 8; private n = 0; private seed = 0.3; private clock = 0;
  private lastDrop = -99; private ballShown = false; private glideUntil = 0;
  private cx = 800; private cy = 450; private zoom = 1; private roll = 0;
  private raw = { cx: 800, cy: 450, zoom: 1, roll: 0 };

  update(i: Cam2DInput, c: Cam2DContext): Cam2D {
    const dt = Math.min(0.1, i.dt); this.clock += dt;
    const beats = Number.isFinite(i.beats) && i.beats > 0 ? i.beats : this.clock * 2;
    let cut = false;
    const wantsCut = beats < this.start || beats - this.start >= this.len;
    const dropCut = c.drop && this.clock - this.lastDrop > 6;
    const ballCut = c.ball > 0.12 && !this.ballShown && c.tier !== 'quiet';
    if (wantsCut || dropCut || ballCut) {
      this.n++; this.start = Math.floor(beats); this.last = this.kind;
      const quiet = c.tier === 'quiet' || c.tier === 'silent', peak = c.tier === 'peak';
      const lens = quiet ? [8, 16, 16, 32] : peak ? [2, 4, 4, 4, 8] : i.eFast > 0.45 ? [4, 4, 8, 8, 16] : [4, 8, 8, 16];
      this.len = lens[Math.floor(hash(this.n * 5.17) * lens.length)];
      this.seed = hash(this.n * 9.13);
      this.kind = this.choose(c, quiet, peak, dropCut, ballCut);
      if (dropCut) this.lastDrop = this.clock;
      if (ballCut) { this.ballShown = true; this.len = 6; }
      cut = true; this.glideUntil = quiet && !dropCut ? this.clock + 1.4 : 0;
    }
    if (c.ball < 0.05) this.ballShown = false;
    if (this.force) this.kind = this.force;

    const u = clamp((beats - this.start) / this.len), e = smooth(u), side = this.seed > 0.5 ? 1 : -1;
    this.shot(this.kind, u, e, side, c);

    // quiet scenes glide between shots; everything else hard-cuts
    const k = this.glideUntil > this.clock ? 1 - Math.exp(-dt / 0.45) : 1;
    const t = cut || k >= 1 ? 1 : k;
    this.cx = lerp(this.cx, this.raw.cx, t); this.cy = lerp(this.cy, this.raw.cy, t);
    this.zoom = lerp(this.zoom, this.raw.zoom, t); this.roll = lerp(this.roll, this.raw.roll, t);
    if (cut && this.n === 1) { this.cx = this.raw.cx; this.cy = this.raw.cy; this.zoom = this.raw.zoom; this.roll = this.raw.roll; }

    // handheld sway + a beat punch (harder when loud)
    const amp = 2 + 10 * i.eFast, T = this.clock;
    const o = this.cam;
    o.cx = this.cx + Math.sin(T * 1.7) * amp + Math.sin(T * 9.1) * amp * 0.25;
    o.cy = this.cy + Math.sin(T * 1.3 + 1) * amp * 0.8;
    o.zoom = this.zoom * (1 + (c.tier === 'peak' ? 0.035 : 0.012) * i.kick);
    o.roll = this.roll + Math.sin(T * 0.6) * 0.003;
    o.cut = cut; o.kind = this.kind;
    return o;
  }

  private choose(c: Cam2DContext, quiet: boolean, peak: boolean, drop: boolean, ball: boolean): Shot2D {
    if (ball) return 'ball';
    if (drop) return hash(this.n * 3.3) > 0.5 ? 'snap' : 'whip';
    if (c.singer >= 0 && hash(this.n * 4.1) < 0.7) return c.singer === 0 ? 'closeA' : 'closeB';
    const table: [Shot2D, number][] = quiet
      ? [['wide', 3], ['medA', 2], ['medB', 2], ['closeA', 1.5], ['closeB', 1.5], ['orbit', 2], ['two', 2], ['crane', 0.6]]
      : peak
        ? [['wide', 1.5], ['wideLow', 2], ['medA', 1.3], ['medB', 1.3], ['closeA', 1], ['closeB', 1], ['orbit', 1.5], ['crane', 1], ['floor', 1.3], ['truck', 1.5], ['dutch', 1.2], ['snap', 1], ['whip', 1.2], ['two', 1.2]]
        : [['wide', 2], ['wideLow', 1.3], ['medA', 1.5], ['medB', 1.5], ['closeA', 1], ['closeB', 1], ['orbit', 1.5], ['crane', 0.8], ['truck', 1], ['two', 1.5], ['dutch', 0.5]];
    const pool = table.filter(([k]) => k !== this.last && k !== this.kind);
    const total = pool.reduce((a, [, w]) => a + w, 0); let r = hash(this.n * 2.31 + 0.7) * total;
    for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
    return 'wide';
  }

  private shot(kind: Shot2D, u: number, e: number, side: number, c: Cam2DContext) {
    const R = this.raw, a = c.headA, b = c.headB, mid = (a.x + b.x) / 2;
    const set = (cx: number, cy: number, zoom: number, roll = 0) => { R.cx = cx; R.cy = cy; R.zoom = zoom; R.roll = roll; };
    switch (kind) {
      case 'wide': set(800 + side * 30 * (1 - e), 450, 1 + 0.07 * e); break;
      case 'wideLow': set(800 + side * 60 * (1 - e), 560, 1.2 + 0.08 * e, side * 0.012); break;
      case 'two': set(mid, a.y + 70, 1.4 + 0.12 * e); break;
      case 'medA': set(a.x + side * 40 * e, a.y + 70, 1.85 + 0.25 * e); break;
      case 'medB': set(b.x - side * 40 * e, b.y + 70, 1.85 + 0.25 * e); break;
      case 'closeA': set(a.x + side * 25, a.y + 10, 3.3 + 0.4 * e); break;
      case 'closeB': set(b.x + side * 25, b.y + 10, 3.3 + 0.4 * e); break;
      case 'orbit': set(lerp(mid - 220 * side, mid + 220 * side, e), 560, 1.45, side * (0.06 - 0.12 * e)); break;
      case 'crane': { const v = side > 0 ? e : 1 - e; set(mid, lerp(740, 330, v), 1.3 + 0.1 * v); break; }
      case 'floor': set(mid, 790, 1.7 + 0.15 * e, side * 0.03); break;
      case 'truck': set(lerp(450, 1150, side > 0 ? e : 1 - e), 590, 1.55); break;
      case 'ball': set(800, lerp(560, 300, c.ball), 1.2 + 0.1 * Math.sin(e * Math.PI)); break;
      case 'dutch': set(mid + side * 60, 580, 1.4 + 0.1 * e, side * 0.17); break;
      case 'snap': { const z = 1 - Math.pow(1 - Math.min(1, u * 3), 3); set(lerp(a.x, mid, z), 600, 2.5 - 1.3 * z, side * 0.04 * (1 - z)); break; }
      case 'whip': { const z = Math.min(1, u * 5), q = z * z * (3 - 2 * z); set(lerp(side > 0 ? a.x : b.x, side > 0 ? b.x : a.x, q), 620, 1.7); break; }
    }
  }
}
