// fitFace.ts — fit MediaPipe's canonical face (468 points) onto a character model's face.
//
// The model is rendered head-on (and turned a little each way, so the cheeks/jaw sides are seen
// square-on too), MediaPipe Face Landmarker runs on each render, and every landmark is ray-cast back
// onto the skinned mesh. The hit points are converted into the mesh's BIND space (the POSITION
// attribute's space) through the Head bone, so the fitted face lines up with the geometry the morph
// targets are written into. Points no view could hit fall back to the canonical shape, placed by a
// similarity transform fitted to the points that were hit.

import * as THREE from 'three';
import { CANONICAL_POSITIONS } from './canonicalFace';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface FittedFace {
  /** 468 landmark positions in the skinned mesh's bind (POSITION) space. */
  points: THREE.Vector3[];
  /** Which points came from a real ray hit (the rest were filled from the canonical shape). */
  hit: boolean[];
  /** Views in which MediaPipe found the face. */
  views: number;
}

let landmarker: Promise<any> | null = null;
function getLandmarker() {
  landmarker ??= (async () => {
    const vision: any = await import(/* @vite-ignore */ CDN);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
  })();
  return landmarker;
}

/**
 * @param root    the posed model (rest pose) already in a scene with lights
 * @param mesh    its skinned body mesh
 * @param head    its Head bone
 */
export async function fitFace(
  scene: THREE.Scene,
  root: THREE.Object3D,
  mesh: THREE.SkinnedMesh,
  head: THREE.Bone
): Promise<FittedFace | null> {
  const fl = await getLandmarker();
  const N = 768;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(N, N);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  root.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  head.getWorldPosition(hp);
  // World → bind space through the Head bone (exact for the rigidly head-skinned face).
  const toBind = bindToWorldViaHead(mesh, head).invert();

  // Ray-casting a SkinnedMesh re-skins every triangle per ray (and there is no BVH): 1,400 rays would
  // hang the page. Bake the posed surface once and keep only the triangles around the head.
  const headTris = bakeHeadTriangles(mesh, hp, 0.35);

  const sums = Array.from({ length: 468 }, () => ({ p: new THREE.Vector3(), n: 0 }));
  const rc = new THREE.Raycaster();
  let views = 0;
  // Orbit the camera around the head: centre, then ±25° (the sides of the face face it squarely).
  for (const yaw of [0, 0.44, -0.44]) {
    // The detector is picky about framing on stylised faces: try a few heights and distances.
    for (const [lift, dist] of [[0.08, 0.85], [0.04, 0.85], [0.12, 0.85], [0.05, 1.05], [0.1, 1.05], [0.02, 1.3], [0.08, 0.7]]) {
      const target = hp.clone().add(new THREE.Vector3(0, lift, 0));
      const cam = new THREE.PerspectiveCamera(22, 1, 0.02, 20);
      cam.position.set(target.x + Math.sin(yaw) * dist, target.y, target.z + Math.cos(yaw) * dist);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      renderer.render(scene, cam);
      const res = fl.detect(renderer.domElement);
      const lm = res?.faceLandmarks?.[0];
      if (!lm || lm.length < 468) continue;
      views++;
      for (let i = 0; i < 468; i++) {
        rc.setFromCamera(new THREE.Vector2(lm[i].x * 2 - 1, 1 - lm[i].y * 2), cam);
        const h = castHead(rc.ray, headTris);
        if (!h) continue;
        // Trust a hit only where the surface faces this camera (not grazing silhouettes).
        if (h.normal.dot(rc.ray.direction) > -0.25) continue;
        sums[i].p.add(h.point.applyMatrix4(toBind));
        sums[i].n++;
      }
      break; // one framing per angle is enough once the face is found
    }
  }
  renderer.dispose();
  if (views === 0) return null;

  const hit = sums.map((s) => s.n > 0);
  const points = sums.map((s) => (s.n ? s.p.divideScalar(s.n) : new THREE.Vector3()));

  // Fill misses: similarity transform canonical → fitted, from the points that were hit.
  const src: THREE.Vector3[] = [];
  const dst: THREE.Vector3[] = [];
  for (let i = 0; i < 468; i++) {
    if (!hit[i]) continue;
    src.push(new THREE.Vector3().fromArray(CANONICAL_POSITIONS, i * 3));
    dst.push(points[i]);
  }
  if (src.length < 50) return null;
  const T = similarity(src, dst);
  for (let i = 0; i < 468; i++) {
    if (!hit[i]) points[i] = new THREE.Vector3().fromArray(CANONICAL_POSITIONS, i * 3).applyMatrix4(T);
  }
  return { points, hit, views };
}

/** Bind (POSITION) space → world, through the Head bone as currently posed. */
export function bindToWorldViaHead(mesh: THREE.SkinnedMesh, head: THREE.Bone): THREE.Matrix4 {
  const hi = mesh.skeleton.bones.indexOf(head);
  return new THREE.Matrix4()
    .copy(mesh.matrixWorld)
    .multiply(mesh.bindMatrixInverse)
    .multiply(head.matrixWorld)
    .multiply(mesh.skeleton.boneInverses[hi])
    .multiply(mesh.bindMatrix);
}

/** World-space triangles of the posed skinned mesh within `radius` of `centre` (flat array, 9 per tri). */
export function bakeHeadTriangles(mesh: THREE.SkinnedMesh, centre: THREE.Vector3, radius: number): Float32Array {
  const pos = mesh.geometry.getAttribute('position');
  const world = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v); // morphs + skinning, in mesh space
    v.applyMatrix4(mesh.matrixWorld);
    world[i * 3] = v.x;
    world[i * 3 + 1] = v.y;
    world[i * 3 + 2] = v.z;
  }
  const idx = mesh.geometry.getIndex();
  const count = idx ? idx.count : pos.count;
  const r2 = radius * radius;
  const out: number[] = [];
  for (let t = 0; t < count; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    const dx = world[a * 3] - centre.x, dy = world[a * 3 + 1] - centre.y, dz = world[a * 3 + 2] - centre.z;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    for (const k of [a, b, c]) out.push(world[k * 3], world[k * 3 + 1], world[k * 3 + 2]);
  }
  return new Float32Array(out);
}

const ta = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3(), th = new THREE.Vector3();
/** Nearest hit of a ray against baked triangles (either winding), with the triangle's normal. */
export function castHead(ray: THREE.Ray, tris: Float32Array): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  let best = Infinity;
  let point: THREE.Vector3 | null = null;
  const normal = new THREE.Vector3();
  for (let i = 0; i < tris.length; i += 9) {
    ta.fromArray(tris, i);
    tb.fromArray(tris, i + 3);
    tc.fromArray(tris, i + 6);
    if (!ray.intersectTriangle(ta, tb, tc, false, th)) continue;
    const dist = th.distanceToSquared(ray.origin);
    if (dist < best) {
      best = dist;
      point = th.clone();
      normal.subVectors(tc, tb).cross(ta.clone().sub(tb)).normalize();
      if (normal.dot(ray.direction) > 0) normal.negate(); // face the camera (winding-agnostic)
    }
  }
  return point ? { point, normal } : null;
}

/** Least-squares similarity (rotation + uniform scale + translation), Umeyama/Horn via SVD-free polar step. */
function similarity(src: THREE.Vector3[], dst: THREE.Vector3[]): THREE.Matrix4 {
  const n = src.length;
  const cs = new THREE.Vector3();
  const cd = new THREE.Vector3();
  src.forEach((p) => cs.add(p));
  dst.forEach((p) => cd.add(p));
  cs.divideScalar(n);
  cd.divideScalar(n);
  // Cross-covariance
  const H = new Array(9).fill(0);
  let ss = 0;
  for (let k = 0; k < n; k++) {
    const a = src[k].clone().sub(cs);
    const b = dst[k].clone().sub(cd);
    ss += a.lengthSq();
    const av = [a.x, a.y, a.z];
    const bv = [b.x, b.y, b.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i * 3 + j] += av[i] * bv[j];
  }
  // Rotation = polar factor of H^T, by iterating R ← (R + R^-T)/2 (converges for well-posed fits).
  let R = new THREE.Matrix3().set(H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]);
  for (let it = 0; it < 30; it++) {
    const inv = R.clone().invert().transpose();
    const e = R.elements;
    const f = inv.elements;
    R = new THREE.Matrix3().fromArray(e.map((x, i) => (x + f[i]) / 2));
  }
  // Scale = trace(R^T H^T) / Σ|a|²
  const Re = R.elements; // column-major
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tr += Re[j * 3 + i] * H[j * 3 + i];
  const s = tr / Math.max(1e-9, ss);
  const M4 = new THREE.Matrix4().setFromMatrix3(R).multiplyScalar(1);
  M4.scale(new THREE.Vector3(s, s, s));
  const t = cd.clone().sub(cs.clone().applyMatrix3(R).multiplyScalar(s));
  M4.setPosition(t);
  return M4;
}
