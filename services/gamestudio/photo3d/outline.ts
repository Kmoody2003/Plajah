// Outline fixes: the measured half of the eye. Where the photo and the render from the photo's camera disagree
// about the subject's outline, there is pixel truth, so no vision model is needed: each connected blob of
// disagreement becomes one edit. Render-only blobs (the model sticks out) become carves; photo-only blobs (the
// model falls short) become added lumps that reach from the body to the blob. Every edit is then tried on its
// own like any agent edit (loop.ts trialEdits), so a fix that doesn't raise the match never reaches the model.

import { basis, ray, unitsPerPixel } from './camera';
import type { ModelOp } from './modelOps';
import type { Picture } from './score';
import type { ModelCamera, ModelPart, Vec3 } from './schema';

export interface OutlineBlob {
  kind: 'extra' | 'missing';
  /** Pixel count and box (photo pixels). */
  area: number;
  x0: number; y0: number; x1: number; y1: number;
  /** Centroid. */
  cx: number; cy: number;
}

/** Connected blobs (4-neighbour) of outline disagreement, biggest first; specks under `minArea` are noise. */
export function outlineBlobs(photo: Picture, render: Picture, minArea = 12): OutlineBlob[] {
  const { width: w, height: h } = photo, n = w * h;
  const kind = new Int8Array(n); // 1 extra (render only), 2 missing (photo only)
  for (let i = 0; i < n; i++) {
    const a = photo.data[i * 4 + 3] > 127, b = render.data[i * 4 + 3] > 127;
    kind[i] = b && !a ? 1 : a && !b ? 2 : 0;
  }
  const seen = new Uint8Array(n), stack = new Int32Array(n), out: OutlineBlob[] = [];
  for (let s = 0; s < n; s++) {
    if (!kind[s] || seen[s]) continue;
    const k = kind[s]; let top = 0; stack[top++] = s; seen[s] = 1;
    let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (top) {
      const i = stack[--top], x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !seen[j] && kind[j] === k) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (area >= minArea) out.push({ kind: k === 1 ? 'extra' : 'missing', area, x0, y0, x1: x1 + 1, y1: y1 + 1, cx: sx / area, cy: sy / area });
  }
  return out.sort((a, b) => b.area - a.area);
}

const where = (b: OutlineBlob, w: number, h: number) => {
  const v = b.cy < h / 3 ? 'top' : b.cy > (2 * h) / 3 ? 'bottom' : 'middle';
  const s = b.cx < w / 3 ? ' left' : b.cx > (2 * w) / 3 ? ' right' : '';
  return v + s;
};

/**
 * One edit per blob, up to `max`. `depth` is the render's depth buffer from the same camera: it puts each edit
 * at the depth of the nearest surface the camera sees, so an added lump grows out of the body, not in mid-air.
 */
export function outlineFixes(photo: Picture, render: Picture, depth: Float32Array, cam: ModelCamera, round: number, max = 10): ModelOp[] {
  const blobs = outlineBlobs(photo, render).slice(0, max);
  const { width: w, height: h } = photo;
  const b = basis(cam);
  const yaw = cam.yawDeg; // part axes turned to face the camera (local x ≈ camera right)
  const ops: ModelOp[] = [];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  blobs.forEach((blob, k) => {
    // The depth to work at: the blob's own pixels for a carve (they are on the model), else the nearest pixel
    // the render covers.
    let bestD = Infinity, bx = Math.round(blob.cx), by = Math.round(blob.cy);
    const searchR = Math.max(blob.x1 - blob.x0, blob.y1 - blob.y0) + 12;
    if (blob.kind === 'extra') {
      const i = by * w + bx; bestD = Number.isFinite(depth[i]) ? depth[i] : Infinity;
    }
    if (!Number.isFinite(bestD)) {
      let best = Infinity;
      for (let y = Math.max(0, by - searchR); y < Math.min(h, by + searchR); y++) for (let x = Math.max(0, bx - searchR); x < Math.min(w, bx + searchR); x++) {
        const d = depth[y * w + x];
        if (!Number.isFinite(d)) continue;
        const dist = (x - blob.cx) ** 2 + (y - blob.cy) ** 2;
        if (dist < best) { best = dist; bestD = d; }
      }
    }
    if (!Number.isFinite(bestD)) return;
    const r = ray(cam, blob.cx, blob.cy, b);
    // Point on the ray at that view depth.
    const t = bestD / Math.max(1e-6, r.dir[0] * b.fwd[0] + r.dir[1] * b.fwd[1] + r.dir[2] * b.fwd[2]);
    const centre: Vec3 = [r.origin[0] + r.dir[0] * t, r.origin[1] + r.dir[1] * t, r.origin[2] + r.dir[2] * t];
    const upp = unitsPerPixel(cam, bestD, b);
    const bw = Math.max(2, blob.x1 - blob.x0) * upp, bh = Math.max(2, blob.y1 - blob.y0) * upp;
    // Thin blobs along an edge: as deep as they are thin, so the fix stays a sliver.
    const thick = Math.min(bw, bh);
    const name = `Outline fix ${k + 1} (${where(blob, w, h)})`;
    const part: ModelPart = {
      id: `outline-r${round}-${k + 1}`, name, op: blob.kind === 'extra' ? 'carve' : 'add', shape: 'ellipsoid',
      center: centre.map(r3) as Vec3,
      size: [r3(bw * (blob.kind === 'extra' ? 1.2 : 1)), r3(bh * (blob.kind === 'extra' ? 1.2 : 1)), r3(Math.max(thick, 0.01) * 1.5)],
      rot: [0, r3(yaw), 0], blend: r3(thick * 0.3), why: 'outline',
    };
    ops.push({ op: 'addPart', part });
  });
  return ops;
}
