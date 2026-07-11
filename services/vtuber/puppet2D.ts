// puppet2D.ts — the 2D Live-Puppet ("chatterbox sprite"): turn a single character drawing into a
// face-tracked avatar, fully on-device, with ZERO computer vision on the artwork. The old build
// ran MediaPipe on the drawing to find eyes/mouth — face models are trained on real faces and
// routinely fail (or hang loading from CDN) on anime/cartoon art, which made builds unreliable.
// New principle: all CV runs on the USER's real face at runtime (where MediaPipe is excellent);
// the artwork is driven as a split sprite — jaw-flap from live jawOpen, blink squash, head-pose
// parallax + roll. Build is instant, offline, and works for ANY drawing.
//
// The layered render path (eye/mouth cut-out layers) is kept for rigs that provide regions
// (hand-authored or future segmentation) — the chatterbox is the always-works baseline.

import type { Puppet2DRig, Puppet2DLayer } from './avatarFactory';

/** Build a drivable 2D puppet rig from a single character image — instant, no models. */
export async function buildPuppet2DRig(image: Blob, onProgress?: (s: string, p: number) => void): Promise<Puppet2DRig> {
  onProgress?.('decode', 0.5);
  const bmp = await createImageBitmap(image);
  const W = bmp.width, H = bmp.height;
  const layers: Puppet2DLayer[] = [
    { id: 'base', role: 'head', bbox: { x: 0, y: 0, w: W, h: H }, anchor: { x: W / 2, y: H / 2 }, image: bmp },
  ];
  onProgress?.('done', 1);
  return { width: W, height: H, layers, jawSplit: 0.62 };
}

export interface PuppetFaceState { expressions: Record<string, number>; head: { x: number; y: number; z: number } }

/** Renders a Puppet2DRig to a canvas each frame from live face state. */
export class Puppet2DDriver {
  constructor(private rig: Puppet2DRig) {}

  private layer(id: string): Puppet2DLayer | undefined { return this.rig.layers.find(l => l.id === id); }

  render(ctx: CanvasRenderingContext2D, W: number, H: number, face: PuppetFaceState): void {
    const rig = this.rig;
    const sx = W / rig.width, sy = H / rig.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // head-pose parallax: translate + slight roll around centre
    const { x: pitch, y: yaw, z: roll } = face.head;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(roll * 0.6);
    ctx.translate(yaw * 0.06 * W, pitch * 0.06 * H);
    ctx.translate(-W / 2, -H / 2);

    const base = this.layer('base');
    const hasParts = !!this.layer('mouth') || !!this.layer('eyeL');

    // ── Chatterbox sprite (no cut-out layers): jaw-flap + blink squash, driven entirely
    //    by the user's live blendshapes — zero CV was run on the artwork. ──
    if (base?.image && !hasParts) {
      const open = Math.min(1, Math.max(face.expressions.aa ?? 0, face.expressions.oh ?? 0) * 1.2);
      const blink = Math.min(1, face.expressions.blink ?? 0);
      const squash = 1 - blink * 0.05;           // cartoon blink: subtle whole-sprite squash
      const split = Math.min(0.92, Math.max(0.2, rig.jawSplit ?? 0.62));
      const srcSplit = rig.height * split;
      const topH = H * split * squash;
      const drop = open * H * 0.05;              // jaw slides down with your mouth
      // mouth interior fills the gap so the flap reads as an opening mouth
      if (drop > 0.5) {
        ctx.fillStyle = 'rgba(24,12,14,0.92)';
        ctx.fillRect(W * 0.3, topH - 1, W * 0.4, drop + 2);
      }
      ctx.drawImage(base.image, 0, 0, rig.width, srcSplit, 0, 0, W, topH);
      ctx.drawImage(base.image, 0, srcSplit, rig.width, rig.height - srcSplit, 0, topH + drop, W, (H - H * split) * squash);
      ctx.restore();
      return;
    }

    if (base?.image) ctx.drawImage(base.image, 0, 0, rig.width, rig.height, 0, 0, W, H);

    // eyes — blink = vertical squash toward the eye centre
    for (const id of ['eyeL', 'eyeR'] as const) {
      const eye = this.layer(id); if (!eye?.image) continue;
      const blink = id === 'eyeL'
        ? (face.expressions.blinkLeft ?? face.expressions.blink ?? 0)
        : (face.expressions.blinkRight ?? face.expressions.blink ?? 0);
      const open = 1 - Math.min(1, blink);
      if (open <= 0.04) continue; // fully closed → patched base shows
      const ex = eye.bbox.x * sx, ey = eye.bbox.y * sy, ew = eye.bbox.w * sx, eh = eye.bbox.h * sy;
      const sh = eh * open;
      ctx.drawImage(eye.image, ex, ey + (eh - sh) / 2, ew, sh);
    }

    // mouth — vowel open = vertical stretch around the mouth centre
    const mouth = this.layer('mouth');
    if (mouth?.image) {
      const open = Math.min(1, Math.max(face.expressions.aa ?? 0, face.expressions.oh ?? 0));
      const mx = mouth.bbox.x * sx, my = mouth.bbox.y * sy, mw = mouth.bbox.w * sx, mh = mouth.bbox.h * sy;
      const sh = mh * (1 + open * 0.85);
      ctx.drawImage(mouth.image, mx, my - (sh - mh) / 2, mw, sh);
    }
    ctx.restore();
  }

  dispose(): void {
    for (const l of this.rig.layers) {
      l.image?.close?.();
      if (l.states) for (const s of Object.values(l.states)) s.close?.();
    }
  }
}
