// puppet2D.ts — the 2D Live-Puppet: turn a single character drawing into a face-tracked avatar,
// Live2D-style, fully on-device. buildPuppet2DRig() runs MediaPipe FaceLandmarker once on the
// uploaded sheet (IMAGE mode) to locate the eyes + mouth, cuts those as movable layers, and lightly
// patches them out of the base so overlays don't ghost. Puppet2DDriver then redraws the puppet every
// frame from the SAME live tracker+retargeter output the VRM path uses: head-pose parallax + blink
// (eye squash) + mouth (vowel stretch).
//
// Phase-A baseline. Fidelity upgrade (next): a triangulated WebGL deformation mesh instead of
// layer overlays, and a real inpaint of the base. Builds correct-by-construction; needs a real
// image + GPU to exercise.

import { VTUBER_MP_CDN, VTUBER_FACE_MODEL } from './faceTracker';
import type { Puppet2DRig, Puppet2DLayer } from './avatarFactory';

// Representative landmark indices (MediaPipe canonical face mesh) for region bounding boxes.
const LEFT_EYE_IDX  = [33, 133, 159, 145, 160, 144, 158, 153, 157, 154];
const RIGHT_EYE_IDX = [362, 263, 386, 374, 387, 373, 385, 380, 384, 381];
const MOUTH_IDX     = [61, 291, 0, 17, 13, 14, 40, 270, 91, 321, 84, 314];

interface Pt { x: number; y: number }
const boxOf = (lm: Pt[], idx: number[], W: number, H: number, padFrac: number) => {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const i of idx) { const p = lm[i]; if (!p) continue; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  let x = minX * W, y = minY * H, w = (maxX - minX) * W, h = (maxY - minY) * H;
  const px = w * padFrac, py = h * padFrac;
  x = Math.max(0, x - px); y = Math.max(0, y - py); w = Math.min(W - x, w + 2 * px); h = Math.min(H - y, h + 2 * py);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
};

async function detectFaceOnImage(bmp: ImageBitmap): Promise<Pt[] | null> {
  try {
    const vision: any = await import(
      // @ts-ignore — resolved at runtime from CDN, not bundled
      /* @vite-ignore */ VTUBER_MP_CDN
    );
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VTUBER_MP_CDN}/wasm`);
    const fl = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: VTUBER_FACE_MODEL, delegate: 'GPU' },
      runningMode: 'IMAGE', numFaces: 1,
    });
    const res = fl.detect(bmp);
    fl.close?.();
    return res?.faceLandmarks?.[0] ?? null;
  } catch (e) {
    console.warn('[vtuber] face detect on sheet failed:', e);
    return null;
  }
}

/** Sample the average colour just outside a box (top edge) — cheap fill so the base doesn't ghost. */
function sampleBorderColor(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }): string {
  const sy = Math.max(0, b.y - Math.max(2, Math.round(b.h * 0.25)));
  try {
    const d = ctx.getImageData(b.x, sy, Math.max(1, b.w), 1).data;
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
    if (!n) return 'rgba(0,0,0,0)';
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)})`;
  } catch { return 'rgba(0,0,0,0)'; }
}

/** Build a drivable 2D puppet rig from a single character image. */
export async function buildPuppet2DRig(image: Blob, onProgress?: (s: string, p: number) => void): Promise<Puppet2DRig> {
  onProgress?.('decode', 0.3);
  const bmp = await createImageBitmap(image);
  const W = bmp.width, H = bmp.height;

  onProgress?.('detect-face', 0.5);
  const lm = await detectFaceOnImage(bmp);

  const layers: Puppet2DLayer[] = [];

  // Patched base — full image with eye/mouth regions filled so the movable overlays don't double up.
  const patch = document.createElement('canvas'); patch.width = W; patch.height = H;
  const pctx = patch.getContext('2d')!;
  pctx.drawImage(bmp, 0, 0);

  if (lm) {
    onProgress?.('cut-layers', 0.75);
    const eyeL = boxOf(lm, LEFT_EYE_IDX, W, H, 0.35);
    const eyeR = boxOf(lm, RIGHT_EYE_IDX, W, H, 0.35);
    const mouth = boxOf(lm, MOUTH_IDX, W, H, 0.3);

    // crop movable layers from the ORIGINAL image first
    const [eyeLImg, eyeRImg, mouthImg] = await Promise.all([
      createImageBitmap(bmp, eyeL.x, eyeL.y, Math.max(1, eyeL.w), Math.max(1, eyeL.h)),
      createImageBitmap(bmp, eyeR.x, eyeR.y, Math.max(1, eyeR.w), Math.max(1, eyeR.h)),
      createImageBitmap(bmp, mouth.x, mouth.y, Math.max(1, mouth.w), Math.max(1, mouth.h)),
    ]);

    // then patch the base under those regions
    for (const b of [eyeL, eyeR, mouth]) { pctx.fillStyle = sampleBorderColor(pctx, b); pctx.fillRect(b.x, b.y, b.w, b.h); }

    const ctr = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    layers.push({ id: 'eyeL', role: 'eye', bbox: eyeL, anchor: ctr(eyeL), image: eyeLImg });
    layers.push({ id: 'eyeR', role: 'eye', bbox: eyeR, anchor: ctr(eyeR), image: eyeRImg });
    layers.push({ id: 'mouth', role: 'mouth', bbox: mouth, anchor: ctr(mouth), image: mouthImg });
  }

  const baseImg = await createImageBitmap(patch);
  layers.unshift({ id: 'base', role: 'head', bbox: { x: 0, y: 0, w: W, h: H }, anchor: { x: W / 2, y: H / 2 }, image: baseImg });

  onProgress?.('done', 1);
  return { width: W, height: H, layers };
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
    ctx.translate(yaw * 46, pitch * 46);
    ctx.translate(-W / 2, -H / 2);

    const base = this.layer('base');
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
