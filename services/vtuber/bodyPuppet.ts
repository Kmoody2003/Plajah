// bodyPuppet.ts — the full-body "paper doll": turn a single (background-keyed) character
// drawing into a body-tracked avatar with ZERO computer vision on the artwork. The rig is
// cut by standard character-sheet proportions (head slice + optional TWO-SEGMENT arms), and
// driven in real time by MediaPipe PoseLandmarker running on the USER's body:
//   hips → position, torso length → scale, shoulder line → lean, ear line → head roll,
//   shoulder→elbow → upper-arm rotation, elbow→wrist → forearm bend (real elbows).
// The character is drawn OVER the live video at your body's location — you become it.

import type { PoseFrame } from './poseTracker';
import { POSE } from './poseTracker';

export interface BodyRigConfig {
  /** Fraction of the sprite height that is the head (rotates as a unit). Default 0.22. */
  headSplit?: number;
  /** Side-hanging arm regions to cut + articulate (A-pose sheets). Omit when arms overlap
   *  the body (hands in pockets, crossed) — the whole sprite still tracks position/lean. */
  arms?: { w: number; y0: number; y1: number };
}

interface ArmRig {
  upper: HTMLCanvasElement; fore: HTMLCanvasElement;
  x: number; y: number;          // arm slice origin on the base sprite
  aw: number; upperH: number; foreH: number;
  uax: number;                   // shoulder pivot x within the slice
}
export interface BodyRig {
  w: number; h: number;
  base: HTMLCanvasElement;        // body with head + arm regions cleared
  head: HTMLCanvasElement; headH: number;
  armL?: ArmRig; armR?: ArmRig;
}

/** Build the paper-doll rig — instant, offline, no models. Expects a KEYED sprite
 *  (transparent background), which cropSheetFace produces. */
export async function buildBodyRig(image: Blob, cfg: BodyRigConfig = {}): Promise<BodyRig> {
  const bmp = await createImageBitmap(image);
  const W = bmp.width, H = bmp.height;
  const headSplit = Math.min(0.7, Math.max(0.1, cfg.headSplit ?? 0.22));
  const headH = Math.round(H * headSplit);

  const cut = (x: number, y: number, w: number, h: number) => {
    const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
    c.getContext('2d')!.drawImage(bmp, x, y, w, h, 0, 0, w, h);
    return c;
  };

  const head = cut(0, 0, W, Math.min(H, headH + Math.round(H * 0.015)));
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const bctx = base.getContext('2d')!;
  bctx.drawImage(bmp, 0, 0);
  bctx.clearRect(0, 0, W, headH);

  let armL: ArmRig | undefined, armR: ArmRig | undefined;
  if (cfg.arms) {
    const aw = Math.round(W * Math.min(0.4, cfg.arms.w));
    const ay0 = Math.round(H * cfg.arms.y0);
    const ah = Math.round(H * Math.max(0.05, cfg.arms.y1 - cfg.arms.y0));
    const upperH = Math.round(ah * 0.5), foreH = ah - upperH; // elbow ≈ mid-arm
    const mk = (x: number, uax: number): ArmRig => ({
      upper: cut(x, ay0, aw, upperH), fore: cut(x, ay0 + upperH, aw, foreH),
      x, y: ay0, aw, upperH, foreH, uax,
    });
    armL = mk(0, aw * 0.8);          // left arm on the sprite: shoulder pivot at its inner (right) edge
    armR = mk(W - aw, aw * 0.2);     // right arm: pivot at its inner (left) edge
    bctx.clearRect(0, ay0, aw, ah);
    bctx.clearRect(W - aw, ay0, aw, ah);
  }
  bmp.close();
  return { w: W, h: H, base, head, headH, armL, armR };
}

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clampA = (a: number, lim: number) => Math.max(-lim, Math.min(lim, a));

/** Renders the paper doll into the OUTPUT canvas at the tracked body's position. */
export class BodyPuppetDriver {
  // Smoothed pose params so the character doesn't jitter (per-channel EMA).
  private sx = 0.5; private sy = 0.6; private sScale = 0; private sLean = 0; private sHead = 0;
  private sUpL = 0; private sUpR = 0; private sElL = 0; private sElR = 0;

  constructor(private rig: BodyRig) {}

  render(ctx: CanvasRenderingContext2D, W: number, H: number, pose: PoseFrame | null): void {
    const rig = this.rig;
    const P = pose ? (i: number) => pose.pts[i] : null;
    const vis = (i: number) => !!P && P(i).v > 0.5;

    let tx = this.sx, ty = this.sy, scale = this.sScale, lean = this.sLean, headRoll = this.sHead;

    if (P && vis(POSE.shoulderL) && vis(POSE.shoulderR) && vis(POSE.hipL) && vis(POSE.hipR)) {
      const shL = P(POSE.shoulderL), shR = P(POSE.shoulderR);
      const shC = mid(shL, shR), hipC = mid(P(POSE.hipL), P(POSE.hipR));
      const torsoPx = Math.hypot((shC.x - hipC.x) * W, (shC.y - hipC.y) * H);
      const personH = torsoPx * 3.4;
      const k = 0.25;
      this.sScale = scale = scale + (((personH / rig.h) * 1.18) - scale) * (scale ? k : 1);
      this.sx = tx = tx + (hipC.x - tx) * k;
      this.sy = ty = ty + (hipC.y - ty) * k;
      const rawLean = Math.atan2(shR.y - shL.y, shR.x - shL.x);
      const leanN = Math.abs(rawLean) > Math.PI / 2 ? rawLean - Math.sign(rawLean) * Math.PI : rawLean;
      this.sLean = lean = lean + (clampA(leanN, 0.5) - lean) * k;
      if (vis(POSE.earL) && vis(POSE.earR)) {
        const eL = P(POSE.earL), eR = P(POSE.earR);
        const hr = Math.atan2(eR.y - eL.y, eR.x - eL.x);
        const hrN = Math.abs(hr) > Math.PI / 2 ? hr - Math.sign(hr) * Math.PI : hr;
        this.sHead = headRoll = headRoll + (clampA(hrN, 0.6) - headRoll) * k;
      }
      // Arms: map each SCREEN-side limb (robust to mirroring) to the sprite's L/R arm.
      const leftFirst = shL.x <= shR.x;
      const L = leftFirst
        ? { s: POSE.shoulderL, e: POSE.elbowL, w: POSE.wristL }
        : { s: POSE.shoulderR, e: POSE.elbowR, w: POSE.wristR };
      const R = leftFirst
        ? { s: POSE.shoulderR, e: POSE.elbowR, w: POSE.wristR }
        : { s: POSE.shoulderL, e: POSE.elbowL, w: POSE.wristL };
      const seg = (a: number, b: number) => Math.atan2((P!(b).x - P!(a).x) * W, (P!(b).y - P!(a).y) * H); // 0 = down
      const solve = (side: { s: number; e: number; w: number }, up0: number, el0: number) => {
        if (!vis(side.s)) return { up: up0, el: el0 };
        const hasE = vis(side.e);
        const upW = seg(side.s, hasE ? side.e : side.w);         // upper-arm world angle
        const up = up0 + (clampA(-upW, 2.4) - up0) * 0.35;        // sprite upper rotation
        let el = el0;
        if (hasE && vis(side.w)) {
          const foreW = seg(side.e, side.w);                     // forearm world angle
          el = el0 + (clampA(upW - foreW, 2.6) - el0) * 0.35;    // bend = delta from the upper
        } else el = el0 + (0 - el0) * 0.2;                       // relax to straight when unseen
        return { up, el };
      };
      const rl = solve(L, this.sUpL, this.sElL); this.sUpL = rl.up; this.sElL = rl.el;
      const rr = solve(R, this.sUpR, this.sElR); this.sUpR = rr.up; this.sElR = rr.el;
    }

    if (!scale) { scale = (H * 0.6) / rig.h; tx = 0.5; ty = 0.62; } // idle centred pre-lock

    ctx.save();
    ctx.translate(tx * W, ty * H);
    ctx.rotate(lean * 0.55);
    ctx.scale(scale, scale);
    ctx.translate(-rig.w / 2, -rig.h * 0.58); // rig hips ≈ 58% down the sprite

    ctx.drawImage(rig.base, 0, 0);
    this.drawArm(ctx, rig.armL, this.sUpL, this.sElL);
    this.drawArm(ctx, rig.armR, this.sUpR, this.sElR);

    ctx.save();
    ctx.translate(rig.w / 2, rig.headH);
    ctx.rotate(headRoll * 0.7);
    ctx.drawImage(rig.head, -rig.w / 2, -rig.headH);
    ctx.restore();
    ctx.restore();
  }

  private drawArm(ctx: CanvasRenderingContext2D, arm: ArmRig | undefined, up: number, el: number) {
    if (!arm) return;
    const uay = arm.upperH * 0.12; // shoulder pivot near the top of the upper segment
    ctx.save();
    ctx.translate(arm.x + arm.uax, arm.y + uay);
    ctx.rotate(up);
    ctx.drawImage(arm.upper, -arm.uax, -uay);
    // elbow = bottom-centre of the upper segment, articulate the forearm there
    ctx.translate(arm.aw * 0.5 - arm.uax, arm.upperH - uay);
    ctx.rotate(el);
    ctx.drawImage(arm.fore, -arm.aw * 0.5, -arm.foreH * 0.1);
    ctx.restore();
  }
}
