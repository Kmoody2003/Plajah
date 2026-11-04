/**
 * sceneFromImage.ts — a whole picture into a scene.
 *
 * Depth over the full frame becomes a displaced backdrop, torn where depth jumps so near things don't web onto far
 * ones. What stands out becomes separate objects: each is cut out, named, built with the object pipeline and placed
 * where the depth says it is. Real sizes from the vocabulary set the scale of the whole scene.
 */

import type { ImageReading } from '../understand/reconstruct';
import { largestShape } from '../pictureClay';
import { rankReadings, VOCABULARY_BY_LABEL, type ObjectPrior } from '../understand/vocabulary';
import type { Backdrop, Scene, SceneCheck, SceneObject } from './sceneModel';

/** Finds separate subjects in a cut-out map. Specks and anything touching most of the frame are not objects. */
export function findSubjects(mask: Float32Array, size: number, limit = 5) {
  const label = new Int32Array(size * size);
  const out: { u0: number; v0: number; u1: number; v1: number; count: number; id: number }[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < label.length; start++) {
    if (label[start] || mask[start] < 0.5) continue;
    next++;
    let count = 0, x0 = size, y0 = size, x1 = 0, y1 = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % size, y = Math.floor(i / size);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1]) {
        if (j >= 0 && !label[j] && mask[j] >= 0.5) { label[j] = next; stack.push(j); }
      }
    }
    if (count > size * size * 0.004 && count < size * size * 0.6) out.push({ u0: x0 / size, v0: y0 / size, u1: (x1 + 1) / size, v1: (y1 + 1) / size, count, id: next });
  }
  out.sort((a, b) => b.count - a.count);
  return { subjects: out.slice(0, limit), label };
}

/** Camera model: a 45-degree vertical view from the origin, looking down -z. */
const TAN = Math.tan((45 / 2) * (Math.PI / 180));

/** Disparity to distance, 1 at the nearest thing and growing to about 12 at the farthest. */
export function distanceMap(depth: Float32Array) {
  let lo = Infinity, hi = -Infinity;
  for (const d of depth) { if (d < lo) lo = d; if (d > hi) hi = d; }
  const span = Math.max(hi - lo, 1e-5);
  return Float32Array.from(depth, (d) => 1 / (0.08 + 0.92 * ((d - lo) / span)));
}

/** The backdrop mesh in scene units. Triangles across a depth jump are dropped, so things don't web together. */
export function buildBackdrop(distance: Float32Array, size: number, aspect: number, scale: number, grid = 320): Backdrop {
  const rows = Math.max(16, Math.round(grid / aspect)), cols = grid;
  const count = (cols + 1) * (rows + 1);
  // Four extra corners make a far plate behind everything, so tears show the picture and not a hole.
  const positions = new Float32Array((count + 4) * 3), uvs = new Float32Array((count + 4) * 2);
  const zAt = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols, v = j / rows;
    const z = distance[Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))] * scale;
    const at = i + j * (cols + 1);
    zAt[at] = z;
    positions[at * 3] = (u - 0.5) * 2 * TAN * aspect * z;
    positions[at * 3 + 1] = (0.5 - v) * 2 * TAN * z;
    positions[at * 3 + 2] = -z;
    uvs[at * 2] = u; uvs[at * 2 + 1] = 1 - v;
  }
  const indices: number[] = [];
  const near = (a: number, b: number) => Math.abs(zAt[a] - zAt[b]) / Math.min(zAt[a], zAt[b]) < 0.12;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = i + j * (cols + 1), b = a + 1, c = a + cols + 1, d = c + 1;
    if (near(a, b) && near(a, c) && near(b, c)) indices.push(a, c, b);
    if (near(b, c) && near(b, d) && near(c, d)) indices.push(b, c, d);
  }
  let far = 0;
  for (let i = 0; i < count; i++) if (zAt[i] > far) far = zAt[i];
  far *= 1.02;
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([u, v], k) => {
    const at = count + k;
    positions[at * 3] = (u - 0.5) * 2 * TAN * aspect * far;
    positions[at * 3 + 1] = (0.5 - v) * 2 * TAN * far;
    positions[at * 3 + 2] = -far;
    uvs[at * 2] = u; uvs[at * 2 + 1] = 1 - v;
  });
  indices.push(count, count + 2, count + 1, count + 1, count + 2, count + 3);
  return { positions, uvs, indices: new Uint32Array(indices) };
}

export interface PlacedSubject {
  label: string;
  prior: ObjectPrior | null;
  /** Distance to its base and how tall it looks, as a share of the frame. */
  distance: number;
  frameHeight: number;
  frameWidth: number;
  /** Where its base sits in the frame. */
  u: number;
  v: number;
}

/**
 * Real sizes set the scale: a known thing that looks this tall at this distance says how big a depth unit is. Taking
 * the middle answer means one wrong name can't throw the whole scene off.
 */
export function solveScale(subjects: PlacedSubject[]) {
  const answers = subjects.filter((s) => s.prior).map((s) => s.prior!.size[1] / Math.max(s.frameHeight * 2 * TAN * s.distance, 1e-4)).sort((a, b) => a - b);
  return answers.length ? answers[answers.length >> 1] : 1;
}

export function placeSubject(subject: PlacedSubject, scale: number): { position: [number, number, number]; height: number; width: number } {
  const z = subject.distance * scale;
  const height = subject.frameHeight * 2 * TAN * z;
  const width = subject.frameWidth * 2 * TAN * z;
  return { position: [(subject.u - 0.5) * 2 * TAN * (subject.frameWidth > 0 ? 1 : 1) * z, (0.5 - subject.v) * 2 * TAN * z, -z], height, width };
}

/** The picture scene's own common sense: are the things it found the size they should be, relative to each other? */
export function checkImageScene(objects: { label: string; prior: ObjectPrior | null; size: [number, number, number] }[], backdrop: Backdrop): SceneCheck[] {
  const off = objects.filter((o) => o.prior).map((o) => ({ label: o.label, ratio: o.size[1] / o.prior!.size[1] })).filter((o) => o.ratio > 1.8 || o.ratio < 0.55);
  const tris = backdrop.indices.length / 3;
  return [
    { id: 'found', label: 'Found separate things in the picture', pass: objects.length > 0, detail: `${objects.length} ${objects.length === 1 ? 'object' : 'objects'}: ${[...new Set(objects.map((o) => o.label))].join(', ') || 'none'}` },
    { id: 'scale', label: 'Their sizes agree with each other', pass: off.length === 0, detail: off.length ? off.map((o) => `the ${o.label} comes out ${o.ratio.toFixed(1)}x its usual size`).join('; ') : objects.length > 1 ? 'all within a sensible range' : 'set from the one known size' },
    { id: 'backdrop', label: 'The backdrop holds together', pass: tris > 500, detail: `${tris.toLocaleString()} triangles` },
  ];
}

export { rankReadings, VOCABULARY_BY_LABEL, largestShape };
export type { ImageReading, Scene, SceneObject };
