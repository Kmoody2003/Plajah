// bodyPuppet.ts — the full-body "paper doll": turn a single (background-keyed) character
// drawing into a body-tracked avatar with ZERO computer vision on the artwork. The rig is
// cut by standard character-sheet proportions (head slice + optional side-hanging arms),
// and driven in real time by MediaPipe PoseLandmarker running on the USER's body:
//   hips → position, torso length → scale, shoulder line → lean,
//   shoulder→wrist angles → arm rotation, ear line → head roll.
// The character is drawn OVER the live video at your body's location — you become it.

import type { PoseFrame } from './poseTracker';
import { POSE } from './poseTracker';

export interface BodyRigConfig {
  /** Fraction of the sprite height that is the head (rotates as a unit). Default 0.22. */
  headSplit?: number;
  /** Side-hanging arm regions to cut + rotate (A-pose sheets). Omit when arms overlap the
   *  body (hands in pockets, crossed) — the whole sprite still tracks position/lean. */
  arms?: { w: number; y0: number; y1: number };
}

export interface BodyRig {
  w: number; h: number;
  base: HTMLCanvasElement;                                       // body, arm+head regions cleared
  head: HTMLCanvasElement; headH: number;                        // head slice (rotates at the neck)
  armL?: { img: HTMLCanvasElement; x: number; y: number; ax: number; ay: number };
  armR?: { img: HTMLCanvasElement; x: number; y: number; ax: number; ay: number };
}

/** Build the paper-doll rig — instant, offline, no models. Expects a KEYED sprite
 *  (transparent background), which cropSheetFace/cropSheetRegion already produces. */
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

  const head = cut(0, 0, W, Math.min(H, headH + Math.round(H * 0.015))); // slight neck overlap
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const bctx = base.getContext('2d')!;
  bctx.drawImage(bmp, 0, 0);
  bctx.clearRect(0, 0, W, headH); // the head layer owns this region

  let armL: BodyRig['armL'], armR: BodyRig['armR'];
  if (cfg.arms) {
    const aw = Math.round(W * Math.min(0.4, cfg.arms.w));
    const ay0 = Math.round(H * cfg.arms.y0);
    const ah = Math.round(H * Math.max(0.05, cfg.arms.y1 - cfg.arms.y0));
    // anchor = the shoulder: top-inner corner of each arm slice
    armL = { img: cut(0, ay0, aw, ah), x: 0, y: ay0, ax: aw * 0.8, ay: ah * 0.1 };
    armR = { img: cut(W - aw, ay0, aw, ah), x: W - aw, y: ay0, ax: aw * 0.2, ay: ah * 0.1 };
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
  // EMA-smoothed pose params so the character doesn't jitter
  private sx = 0.5; private sy = 0.6; private sScale = 0; private sLean = 0;
  private sHead = 0; private sArmL = 0; private sArmR = 0;

  constructor(private rig: BodyRig) {}

  render(ctx: CanvasRenderingContext2D, W: number, H: number, pose: PoseFrame | null): void {
    const rig = this.rig;
    const P = pose ? (i: number) => pose.pts[i] : null;
    const vis = (i: number) => !!P && P(i).v > 0.5;

    let tx = this.sx, ty = this.sy, scale = this.sScale, lean = this.sLean;
    let headRoll = this.sHead, armLA = this.sArmL, armRA = this.sArmR;

    if (P && vis(POSE.shoulderL) && vis(POSE.shoulderR) && vis(POSE.hipL) && vis(POSE.hipR)) {
      const shL = P(POSE.shoulderL), shR = P(POSE.shoulderR);
      const shC = mid(shL, shR), hipC = mid(P(POSE.hipL), P(POSE.hipR));
      // scale from torso length (works even when legs are out of frame)
      const torsoPx = Math.hypot((shC.x - hipC.x) * W, (shC.y - hipC.y) * H);
      const personH = torsoPx * 3.4;
      const k = 0.25; // smoothing
      this.sScale = scale = scale + (((personH / rig.h) * 1.18) - scale) * (scale ? k : 1);
      this.sx = tx = tx + (hipC.x - tx) * k;
      this.sy = ty = ty + (hipC.y - ty) * k;
      // lean from the shoulder line (screen-space, so mirroring doesn't matter)
      const rawLean = Math.atan2(shR.y - shL.y, shR.x - shL.x);
      const leanN = Math.abs(rawLean) > Math.PI / 2 ? rawLean - Math.sign(rawLean) * Math.PI : rawLean;
      this.sLean = lean = lean + (clampA(leanN, 0.5) - lean) * k;
      // head roll from the ear line
      if (vis(POSE.earL) && vis(POSE.earR)) {
        const eL = P(POSE.earL), eR = P(POSE.earR);
        const hr = Math.atan2(eR.y - eL.y, eR.x - eL.x);
        const hrN = Math.abs(hr) > Math.PI / 2 ? hr - Math.sign(hr) * Math.PI : hr;
        this.sHead = headRoll = headRoll + (clampA(hrN, 0.6) - headRoll) * k;
      }
      // arms: whichever shoulder is on the LEFT of the screen drives the sprite's left arm
      // (robust to camera mirroring). Angle = shoulder→wrist vs straight down.
      const leftFirst = shL.x <= shR.x;
      const sideL = leftFirst ? { s: POSE.shoulderL, w: POSE.wristL } : { s: POSE.shoulderR, w: POSE.wristR };
      const sideR = leftFirst ? { s: POSE.shoulderR, w: POSE.wristR } : { s: POSE.shoulderL, w: POSE.wristL };
      const armAngle = (s: number, w: number) => {
        if (!vis(s) || !vis(w)) return 0;
        const a = Math.atan2((P!(w).x - P!(s).x) * W, (P!(w).y - P!(s).y) * H); // 0 = hanging down
        return clampA(-a, 2.4);
      };
      this.sArmL = armLA = armLA + (armAngle(sideL.s, sideL.w) - armLA) * 0.35;
      this.sArmR = armRA = armRA + (armAngle(sideR.s, sideR.w) - armRA) * 0.35;
    }

    if (!scale) { // no body seen yet — show the character centred so there's something to judge
      scale = (H * 0.6) / rig.h; tx = 0.5; ty = 0.62;
    }

    ctx.save();
    ctx.translate(tx * W, ty * H);
    ctx.rotate(lean * 0.55);
    ctx.scale(scale, scale);
    ctx.translate(-rig.w / 2, -rig.h * 0.58); // rig hips ≈ 58% down the sprite

    ctx.drawImage(rig.base, 0, 0);
    for (const [arm, ang] of [[rig.armL, armLA], [rig.armR, armRA]] as const) {
      if (!arm) continue;
      ctx.save();
      ctx.translate(arm.x + arm.ax, arm.y + arm.ay);
      ctx.rotate(ang);
      ctx.drawImage(arm.img, -arm.ax, -arm.ay);
      ctx.restore();
    }
    // head rotates gently at the neck
    ctx.save();
    ctx.translate(rig.w / 2, rig.headH);
    ctx.rotate(headRoll * 0.7);
    ctx.drawImage(rig.head, -rig.w / 2, -rig.headH);
    ctx.restore();
    ctx.restore();
  }
}
