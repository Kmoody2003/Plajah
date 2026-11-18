// Find the photo's camera: turn and tilt the scan until its outline best matches the photo's subject mask.
// The scan engines face the subject in their own canonical direction, so this search is what lets a pixel of
// the photo and a point on the model be traded at all. Same idea as Argilla's alignShape (outline-led turn
// matching); depth is not used here because a single photo has none we trust.

import { framingCamera } from './camera';
import type { TriMesh } from './mesh';
import { renderMesh } from './render';
import type { Picture } from './score';
import type { ModelCamera } from './schema';

export function maskBox(p: Picture): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] > 127) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Shrink a picture (box filter) to a given height, keeping aspect; alpha is averaged too. */
export function shrink(p: Picture, height: number): Picture {
  const k = p.height / height, W = Math.max(1, Math.round(p.width / k)), H = height;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = Math.floor(x * k), sy0 = Math.floor(y * k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * k)), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * k));
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let sy = sy0; sy < Math.min(p.height, sy1); sy++) for (let sx = sx0; sx < Math.min(p.width, sx1); sx++) { const o = (sy * p.width + sx) * 4; for (let c = 0; c < 4; c++) acc[c] += p.data[o + c]; n++; }
    for (let c = 0; c < 4; c++) data[(y * W + x) * 4 + c] = n ? acc[c] / n : 0;
  }
  return { width: W, height: H, data };
}

function maskIoU(a: Picture, b: Picture): number {
  let i = 0, u = 0;
  for (let k = 3; k < a.data.length; k += 4) { const x = a.data[k] > 127, y = b.data[k] > 127; if (x && y) i++; if (x || y) u++; }
  return u ? i / u : 0;
}

/** Scale and shift the camera's frame so the render's mask box lands on the photo's. */
function fitFrame(cam: ModelCamera, mesh: TriMesh, target: { x0: number; y0: number; x1: number; y1: number }): ModelCamera | null {
  const r = maskBox(renderMesh(mesh, cam, { depthOnly: true }).picture);
  if (!r) return null;
  const s = (target.y1 - target.y0) / (r.y1 - r.y0);
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, tx = (target.x0 + target.x1) / 2, ty = (target.y0 + target.y1) / 2;
  const f = cam.frame;
  // pixel' = centre + (pixel − centre − d)·s + d', with the current frame folded in.
  const W2 = cam.width / 2, H2 = cam.height / 2;
  const scale = f.scale * s;
  const dx = tx - W2 - (cx - W2 - f.dx) * s, dy = ty - H2 - (cy - H2 - f.dy) * s;
  return { ...cam, frame: { scale, dx, dy } };
}

export interface Alignment { camera: ModelCamera; iou: number; tried: number }

/**
 * Coarse turn/tilt search at low resolution, then a finer one around the best; returns a camera in the
 * photo's own pixel size. `pitches` defaults to a level-to-high range (photos are rarely from below).
 */
export function alignToPhoto(mesh: TriMesh, photo: Picture, opts: { workHeight?: number; pitches?: number[]; yawStep?: number; fovDeg?: number } = {}): Alignment {
  const small = shrink(photo, opts.workHeight ?? 160);
  const target = maskBox(small);
  if (!target) throw new Error('the photo has no subject mask');
  const fov = opts.fovDeg ?? 30;
  let best: Alignment | null = null, tried = 0;
  const tryAt = (yaw: number, pitch: number) => {
    tried++;
    let cam: ModelCamera | null = framingCamera({ yawDeg: yaw, pitchDeg: pitch, width: small.width, height: small.height, fovDeg: fov });
    cam = fitFrame(cam, mesh, target);
    if (cam) cam = fitFrame(cam, mesh, target); // second pass settles the scale after the shift
    if (!cam) return;
    const iou = maskIoU(renderMesh(mesh, cam, { depthOnly: true }).picture, small);
    if (!best || iou > best.iou) best = { camera: cam, iou, tried };
  };
  const step = opts.yawStep ?? 15;
  for (const pitch of opts.pitches ?? [0, 10, 20, 30, 45]) for (let yaw = 0; yaw < 360; yaw += step) tryAt(yaw, pitch);
  const coarse = best!;
  for (let dy = -step / 2; dy <= step / 2; dy += step / 6) for (let dp = -6; dp <= 6; dp += 3) tryAt(coarse.camera.yawDeg + dy, coarse.camera.pitchDeg + dp);
  const b = best!;
  const k = photo.height / small.height;
  const camera: ModelCamera = { ...b.camera, yawDeg: ((b.camera.yawDeg % 360) + 360) % 360, width: photo.width, height: photo.height, frame: { scale: b.camera.frame.scale, dx: b.camera.frame.dx * k, dy: b.camera.frame.dy * k } };
  return { camera, iou: b.iou, tried };
}

/**
 * Polish an aligned camera by coordinate descent on the outline match (IoU) at `workHeight`: turn, tilt,
 * roll, lens (field of view; the distance follows so the model stays framed), zoom and shift. Each step size
 * halves when no move helps. The coarse search fixes the lens at 30° with no roll, which a phone photo rarely
 * matches; this is what removes that registration error.
 */
export function refineCamera(mesh: TriMesh, photo: Picture, start: ModelCamera, opts: { workHeight?: number; levels?: number } = {}): Alignment {
  const small = shrink(photo, opts.workHeight ?? 256);
  const k = photo.height / small.height;
  const D = Math.PI / 180;
  const toSmall = (c: ModelCamera): ModelCamera => ({ ...c, width: small.width, height: small.height, frame: { ...c.frame, dx: c.frame.dx / k, dy: c.frame.dy / k } });
  const withFov = (c: ModelCamera, fov: number): ModelCamera => ({ ...c, fovDeg: fov, distance: (c.distance * Math.sin((c.fovDeg * D) / 2)) / Math.sin((fov * D) / 2) });
  let cam = toSmall(start), tried = 0;
  const iouOf = (c: ModelCamera) => { tried++; return maskIoU(renderMesh(mesh, c, { depthOnly: true }).picture, small); };
  let best = iouOf(cam);
  type Knob = { step: number; min: number; set: (c: ModelCamera, d: number) => ModelCamera };
  const knobs: Knob[] = [
    { step: 4, min: 0.25, set: (c, d) => ({ ...c, yawDeg: c.yawDeg + d }) },
    { step: 4, min: 0.25, set: (c, d) => ({ ...c, pitchDeg: Math.max(-60, Math.min(80, c.pitchDeg + d)) }) },
    { step: 2, min: 0.1, set: (c, d) => ({ ...c, rollDeg: (c.rollDeg ?? 0) + d }) },
    { step: 8, min: 0.5, set: (c, d) => withFov(c, Math.max(5, Math.min(70, c.fovDeg + d))) },
    { step: 0.03, min: 0.001, set: (c, d) => ({ ...c, frame: { ...c.frame, scale: c.frame.scale * (1 + d) } }) },
    { step: 3, min: 0.2, set: (c, d) => ({ ...c, frame: { ...c.frame, dx: c.frame.dx + d } }) },
    { step: 3, min: 0.2, set: (c, d) => ({ ...c, frame: { ...c.frame, dy: c.frame.dy + d } }) },
  ];
  for (let level = 0; level < (opts.levels ?? 6); level++) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const kn of knobs) {
        const s = Math.max(kn.min, kn.step / 2 ** level);
        for (const d of [s, -s]) {
          const c = kn.set(cam, d), v = iouOf(c);
          if (v > best + 1e-5) { best = v; cam = c; moved = true; break; }
        }
      }
    }
  }
  const camera: ModelCamera = { ...cam, yawDeg: ((cam.yawDeg % 360) + 360) % 360, width: photo.width, height: photo.height, frame: { ...cam.frame, dx: cam.frame.dx * k, dy: cam.frame.dy * k } };
  return { camera, iou: best, tried };
}
