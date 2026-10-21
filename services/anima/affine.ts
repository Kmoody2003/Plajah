/**
 * services/anima/affine.ts — 2D affine math shared by the renderer, the camera and the stage's
 * transform handles, so what is drawn and what is hit-tested can't disagree.
 *
 * A matrix is [a, b, c, d, e, f], the same layout as CanvasRenderingContext2D.setTransform:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */

import type { AnimaLayer, AnimaProject } from './types';
import type { EvaluatedLayerState } from './evaluator';

export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** m · n (apply n first, then m). */
export function mul(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
export const scale = (x: number, y: number): Affine => [x, 0, 0, y, 0, 0];
export function rotateDeg(deg: number): Affine {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function invert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const id = 1 / det;
  return [m[3] * id, -m[1] * id, -m[2] * id, m[0] * id, (m[2] * m[5] - m[3] * m[4]) * id, (m[1] * m[4] - m[0] * m[5]) * id];
}

export function apply(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Layers whose content is authored in frame pixels (everything except character rigs). */
export function isFrameSpace(layer: AnimaLayer): boolean {
  return layer.type !== 'character';
}

/**
 * Content → frame matrix for a layer at its evaluated state:
 *   T(origin + position) · R(rotation) · S(scale) [· T(−origin) for frame-space content]
 */
export function layerMatrix(layer: AnimaLayer, st: EvaluatedLayerState): Affine {
  const o = layer.origin ?? { x: 0, y: 0 };
  let m = mul(translate(o.x + st.transform.x, o.y + st.transform.y), mul(rotateDeg(st.transform.rotationZ), scale(st.transform.scaleX, st.transform.scaleY)));
  if (isFrameSpace(layer)) m = mul(m, translate(-o.x, -o.y));
  return m;
}

/**
 * Frame → screen ("view") matrix for a camera layer. The camera's pivot is the frame centre;
 * moving the camera right moves the picture left, scaling it zooms in, rotating it rolls the
 * picture the other way.
 */
export function cameraView(project: AnimaProject, camera: AnimaLayer, st: EvaluatedLayerState): Affine {
  const W = project.width;
  const H = project.height;
  const o = camera.origin ?? { x: W / 2, y: H / 2 };
  const cx = o.x + st.transform.x;
  const cy = o.y + st.transform.y;
  const zx = st.transform.scaleX || 1;
  const zy = st.transform.scaleY || 1;
  return mul(translate(W / 2, H / 2), mul(scale(zx, zy), mul(rotateDeg(-st.transform.rotationZ), translate(-cx, -cy))));
}

/** The active camera (top-most visible camera layer) and its view, if any. */
export function activeCamera(project: AnimaProject, evaluated: EvaluatedLayerState[]): { layer: AnimaLayer; view: Affine } | null {
  for (const st of evaluated) {
    const layer = project.layers.find((l) => l.id === st.layerId);
    if (layer?.type === 'camera' && st.visible) return { layer, view: cameraView(project, layer, st) };
  }
  return null;
}
