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

import type { Puppet2DRig, Puppet2DLayer, PuppetFaceConfig } from './avatarFactory';

/** Build a drivable 2D puppet rig from a single character image — instant, no models.
 *  Optional cfg supplies the jaw hinge + face anchors; skin colour under each eye is
 *  sampled here (build time is the only moment we touch the artwork's pixels). */
export async function buildPuppet2DRig(
  image: Blob,
  onProgress?: (s: string, p: number) => void,
  cfg?: { jawSplit?: number; face?: PuppetFaceConfig },
): Promise<Puppet2DRig> {
  onProgress?.('decode', 0.5);
  const bmp = await createImageBitmap(image);
  const W = bmp.width, H = bmp.height;

  let face: PuppetFaceConfig | undefined = cfg?.face ? JSON.parse(JSON.stringify(cfg.face)) : undefined;
  if (face && (face.eyeL || face.eyeR)) {
    try {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const cx = c.getContext('2d', { willReadFrequently: true })!;
      cx.drawImage(bmp, 0, 0);
      const sampleSkin = (e: { x: number; y: number; r: number }) => {
        // just below the eye — that's the lid colour when closed
        const px = Math.round(e.x * W), py = Math.min(H - 1, Math.round((e.y + e.r * 1.5) * H));
        const d = cx.getImageData(px, py, 1, 1).data;
        return d[3] > 40 ? `rgb(${d[0]},${d[1]},${d[2]})` : 'rgb(210,170,140)';
      };
      if (face.eyeL) face.eyeL.skin = sampleSkin(face.eyeL);
      if (face.eyeR) face.eyeR.skin = sampleSkin(face.eyeR);
    } catch { /* keep defaults */ }
  }

  const layers: Puppet2DLayer[] = [
    { id: 'base', role: 'head', bbox: { x: 0, y: 0, w: W, h: H }, anchor: { x: W / 2, y: H / 2 }, image: bmp },
  ];
  onProgress?.('done', 1);
  return { width: W, height: H, layers, jawSplit: cfg?.jawSplit ?? 0.62, face };
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

    // ── Chatterbox sprite (no cut-out layers): the streamer's PERFORMANCE drives a
    //    procedural face — jaw-flap + talk/smile mouth + blink lids + head lead +
    //    breathing — entirely from live blendshapes; zero CV was run on the artwork. ──
    if (base?.image && !hasParts) {
      const open = Math.min(1, Math.max(face.expressions.aa ?? 0, face.expressions.oh ?? 0) * 1.25);
      const smile = Math.min(1, (face.expressions.happy ?? 0) * 1.3);
      const pucker = Math.min(1, face.expressions.ou ?? 0);
      const blink = Math.min(1, face.expressions.blink ?? 0);
      const squash = 1 - blink * 0.04;           // cartoon blink: subtle whole-sprite squash
      const split = Math.min(0.92, Math.max(0.2, rig.jawSplit ?? 0.62));
      const srcSplit = rig.height * split;
      const topH = H * split * squash;
      const drop = open * H * 0.05;              // jaw slides down with your mouth
      const headDX = yaw * 0.03 * W;             // the head leads the turn slightly
      const breathe = 1 + Math.sin(performance.now() / 1000 * 1.7) * 0.006; // idle life

      ctx.translate(W / 2, H); ctx.scale(1, breathe); ctx.translate(-W / 2, -H);
      // mouth interior fills the flap gap
      if (drop > 0.5) {
        ctx.fillStyle = 'rgba(24,12,14,0.92)';
        ctx.fillRect(W * 0.3, topH - 1, W * 0.4, drop + 2);
      }
      ctx.drawImage(base.image, 0, 0, rig.width, srcSplit, headDX, 0, W, topH);
      ctx.drawImage(base.image, 0, srcSplit, rig.width, rig.height - srcSplit, 0, topH + drop, W, (H - H * split) * squash);

      const fc = rig.face;
      // Eyes: on blink, occlude with the sampled lid colour + a closed-lid curve.
      if (fc && blink > 0.25) {
        const a = Math.min(1, (blink - 0.25) / 0.6);
        for (const e of [fc.eyeL, fc.eyeR]) {
          if (!e) continue;
          const ex = e.x * W + headDX, ey = e.y * H * squash, r = e.r * W;
          ctx.globalAlpha = a;
          ctx.fillStyle = e.skin || 'rgb(210,170,140)';
          ctx.beginPath(); ctx.ellipse(ex, ey, r * 1.05, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(38,24,24,0.9)';
          ctx.lineWidth = Math.max(1.5, r * 0.22);
          ctx.beginPath(); ctx.arc(ex, ey - r * 0.35, r * 0.8, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      // Mouth: overlays only while performing (talking/smiling) — idle keeps the original art.
      const m = fc?.mouth;
      if (m) {
        const act = Math.min(1, open * 1.5 + smile * 0.6);
        if (act > 0.07) {
          const mx = m.x * W, my = m.y * H * squash + drop;
          const mw = m.w * W * (0.8 + smile * 0.45) * (1 - pucker * 0.35);
          ctx.globalAlpha = Math.min(1, act * 1.5);
          if (open > 0.12) {
            const mh = mw * (0.14 + open * 0.72);
            ctx.fillStyle = '#26100f';
            ctx.beginPath(); ctx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(198,84,92,0.85)'; // tongue hint
            ctx.beginPath(); ctx.ellipse(mx, my + mh * 0.24, mw * 0.3, mh * 0.22, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(30,15,15,0.75)'; ctx.lineWidth = Math.max(1, mw * 0.045);
            ctx.beginPath(); ctx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2); ctx.stroke();
          } else {
            // closed smile — a simple upward curve
            ctx.strokeStyle = 'rgba(40,20,20,0.85)'; ctx.lineWidth = Math.max(1.5, mw * 0.08);
            ctx.beginPath(); ctx.arc(mx, my - mw * 0.28, mw * 0.52, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
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
