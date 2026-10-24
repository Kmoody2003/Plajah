// transferFace.ts — carry the fitted face's shapes onto the character's own mesh, and open it up.
//
// Every character vertex near the fitted face mask is bound to its closest mask triangle
// (barycentric), and each ARKit shape's motion is interpolated from that triangle's corners, faded
// out over a short distance past the mask so the head's back, ears and neck never move. Then the
// fused sculpt is cut where a real face has openings: the strip of triangles bridging the lips (the
// jaw now pulls the lower lip away from the upper) and the painted eyes (eyeballs go behind).

import * as THREE from 'three';
import { CANONICAL_INDICES } from './canonicalFace';
import { ARKIT_SHAPES, LM, type ArkitShape, type FaceFrame } from './arkitShapes';

export interface TransferResult {
  /** Indices of the removed eye-surface triangles' centroid UVs (to sample the painted iris colour). */
  eyeUvs: { left: THREE.Vector2 | null; right: THREE.Vector2 | null };
  movedVertices: number;
  cutMouthTris: number;
  cutEyeTris: number;
}

const tri = new THREE.Triangle();
const cp = new THREE.Vector3();
const bary = new THREE.Vector3();

export function transferFace(
  mesh: THREE.SkinnedMesh,
  P: THREE.Vector3[],
  frame: FaceFrame,
  shapes: Record<ArkitShape, Float32Array>,
  cut: { eyes: boolean; mouth: boolean } = { eyes: true, mouth: true }
): TransferResult {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const { X, Y, Z, d, mouth } = frame;
  const near = 0.06 * d;
  const far = 0.22 * d;

  // Face-mask bounds, to skip most of the body quickly.
  const centre = P.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(P.length);
  let radius = 0;
  for (const p of P) radius = Math.max(radius, p.distanceTo(centre));
  radius += far;

  const nT = CANONICAL_INDICES.length / 3;
  const morph: Float32Array[] = ARKIT_SHAPES.map(() => new Float32Array(pos.count * 3));
  const jawIdx = ARKIT_SHAPES.indexOf('jawOpen');
  const jawMag = new Float32Array(pos.count); // how much each vertex follows the jaw (0..1)
  const maxJaw = Math.max(...Array.from({ length: P.length }, (_, i) =>
    Math.hypot(shapes.jawOpen[i * 3], shapes.jawOpen[i * 3 + 1], shapes.jawOpen[i * 3 + 2])));

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let moved = 0;
  for (let vi = 0; vi < pos.count; vi++) {
    v.fromBufferAttribute(pos, vi);
    if (v.distanceTo(centre) > radius) continue;
    // Only the front of the head (not the back, not the inside of the skull).
    if (v.clone().sub(centre).dot(Z) < -0.9 * d) continue;
    if (nor) {
      n.fromBufferAttribute(nor, vi);
      if (n.dot(Z) < -0.35) continue;
    }
    let best = Infinity, bt = -1;
    const bb = new THREE.Vector3();
    for (let t = 0; t < nT; t++) {
      const a = P[CANONICAL_INDICES[t * 3]], b = P[CANONICAL_INDICES[t * 3 + 1]], c = P[CANONICAL_INDICES[t * 3 + 2]];
      tri.set(a, b, c);
      tri.closestPointToPoint(v, cp);
      const dist = cp.distanceToSquared(v);
      if (dist < best) {
        best = dist;
        bt = t;
        tri.getBarycoord(cp, bb);
        bary.copy(bb);
      }
    }
    const dist = Math.sqrt(best);
    if (bt < 0 || dist > far) continue;
    const w = 1 - smooth((dist - near) / (far - near));
    if (w <= 0) continue;
    moved++;
    const ia = CANONICAL_INDICES[bt * 3], ib = CANONICAL_INDICES[bt * 3 + 1], ic = CANONICAL_INDICES[bt * 3 + 2];
    for (let s = 0; s < ARKIT_SHAPES.length; s++) {
      const D = shapes[ARKIT_SHAPES[s]];
      for (let k = 0; k < 3; k++) {
        morph[s][vi * 3 + k] = w * (bary.x * D[ia * 3 + k] + bary.y * D[ib * 3 + k] + bary.z * D[ic * 3 + k]);
      }
    }
    const j = morph[jawIdx];
    jawMag[vi] = Math.hypot(j[vi * 3], j[vi * 3 + 1], j[vi * 3 + 2]) / Math.max(1e-9, maxJaw);
  }

  geo.morphAttributes.position = morph.map((m, s) => {
    const a = new THREE.Float32BufferAttribute(m, 3);
    a.name = ARKIT_SHAPES[s];
    return a;
  });
  geo.morphTargetsRelative = true;
  mesh.morphTargetDictionary = Object.fromEntries(ARKIT_SHAPES.map((name, i) => [name, i]));
  mesh.morphTargetInfluences = ARKIT_SHAPES.map(() => 0);

  // ── Openings ──
  const index = geo.getIndex();
  if (!index) throw new Error('transferFace: expected an indexed mesh');
  const local = (p: THREE.Vector3) => {
    const q = p.clone().sub(mouth);
    return new THREE.Vector3(q.dot(X) / d, q.dot(Y) / d, q.dot(Z) / d);
  };
  const mouthHalf = local(P[291]).x - local(P[61]).x;
  const eyePoly = (U: number[], L: number[]) => [...U, ...L.slice(1, -1).reverse()].map((i) => local(P[i]));
  const polyL = eyePoly(LM.eyeLUpper, LM.eyeLLower);
  const polyR = eyePoly(LM.eyeRUpper, LM.eyeRLower);
  const eyeCentre = (poly: THREE.Vector3[]) => poly.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(poly.length);
  const cL = eyeCentre(polyL);
  const cR = eyeCentre(polyR);
  // Shrink each eye polygon slightly toward its centre so the lid rim survives the cut.
  const shrink = (poly: THREE.Vector3[], c: THREE.Vector3) => poly.map((p) => p.clone().lerp(c, 0.08));
  const sL = shrink(polyL, cL);
  const sR = shrink(polyR, cR);

  const keep: number[] = [];
  let cutMouth = 0, cutEye = 0;
  const uvSum = { left: new THREE.Vector2(), right: new THREE.Vector2(), nl: 0, nr: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const i0 = index.getX(t), i1 = index.getX(t + 1), i2 = index.getX(t + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    const L = local(centroid);
    // Lips: a triangle bridging still (upper lip) and jaw-following (lower lip) vertices.
    const js = [jawMag[i0], jawMag[i1], jawMag[i2]];
    if (cut.mouth && Math.abs(L.x) < mouthHalf * 0.55 && Math.abs(L.y) < 0.12 && L.z > -0.6 &&
        Math.max(...js) > 0.55 && Math.min(...js) < 0.25) {
      cutMouth++;
      continue;
    }
    // Painted eyes.
    if (cut.eyes && L.z > local(centre).z - 0.5) {
      const inL = pointInPoly(L, sL), inR = !inL && pointInPoly(L, sR);
      if (inL || inR) {
        cutEye++;
        if (uv) {
          const u = new THREE.Vector2(
            (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3,
            (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3
          );
          if (inL) { uvSum.left.add(u); uvSum.nl++; } else { uvSum.right.add(u); uvSum.nr++; }
        }
        continue;
      }
    }
    keep.push(i0, i1, i2);
  }
  geo.setIndex(keep);

  return {
    eyeUvs: {
      left: uvSum.nl ? uvSum.left.divideScalar(uvSum.nl) : null,
      right: uvSum.nr ? uvSum.right.divideScalar(uvSum.nr) : null,
    },
    movedVertices: moved,
    cutMouthTris: cutMouth,
    cutEyeTris: cutEye,
  };
}

function smooth(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function pointInPoly(p: THREE.Vector3, poly: THREE.Vector3[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
