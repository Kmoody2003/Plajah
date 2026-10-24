// anchorFit.ts — hand fit for faces the face tracker can't read (pumpkins, trolls, wolves, …).
//
// A person marks a few key points (eye corners/lids, nose tip, mouth corners and lips, chin) on a
// head-on render (the FRONT_VIEW camera below). Each mark is ray-cast onto the mesh; MediaPipe's
// canonical 468-point face is fitted to them with a similarity transform plus a smooth residual warp,
// then every point is projected onto the surface along the face's forward axis. From there the face
// goes through the same shapes/transfer/parts/VRM steps as an automatic fit.

import * as THREE from 'three';
import { CANONICAL_POSITIONS } from './canonicalFace';
import type { FittedFace } from './fitFace';
import { bakeHeadTriangles, castHead, bindToWorldViaHead } from './fitFace';

/** The camera the marks are made on (also used by the lab's frontShot). */
export const FRONT_VIEW = { size: 768, fov: 22 };

/**
 * Head-on camera framed on this character's actual head (heads range from a human's to a troll's
 * and a giant pumpkin, and hunched rigs carry the head off the Head bone's axis): the posed vertices
 * around the Head bone, up to the crown, are boxed and the view fitted to the box.
 */
export function frontCamera(head: THREE.Object3D, mesh: THREE.SkinnedMesh) {
  const hp = new THREE.Vector3();
  head.getWorldPosition(hp);
  const pos = mesh.geometry.getAttribute('position');
  const world: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 2) {
    mesh.getVertexPosition(i, v);
    world.push(v.clone().applyMatrix4(mesh.matrixWorld));
  }
  // Head size: crown height above the Head bone, over the head's column.
  let crown = hp.y;
  let column = 0.12;
  for (let pass = 0; pass < 2; pass++) {
    for (const p of world) if (Math.hypot(p.x - hp.x, p.z - hp.z) < column && p.y > crown) crown = p.y;
    column = Math.max(0.12, (crown - hp.y) * 0.8);
  }
  const hs = Math.max(0.08, crown - hp.y);
  const box = new THREE.Box3();
  for (const p of world) {
    if (p.y < hp.y - 0.55 * hs || p.y > crown + 0.01) continue;
    if (Math.hypot(p.x - hp.x, p.z - hp.z) > 1.3 * hs) continue;
    box.expandByPoint(p);
  }
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y) * 1.15;
  const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(FRONT_VIEW.fov / 2)) + size.z / 2;
  const cam = new THREE.PerspectiveCamera(FRONT_VIEW.fov, 1, 0.02, 50);
  cam.position.set(c.x, c.y, c.z + dist);
  cam.lookAt(c);
  cam.updateMatrixWorld(true);
  return cam;
}

/**
 * The marks: MediaPipe landmark index → pixel [x, y] on the FRONT_VIEW render. Useful set:
 * 33/133 + 263/362 (eye corners, subject R/L), 159/145 + 386/374 (lid middles), 1 (nose tip),
 * 61/291 (mouth corners), 13/14 (inner lips), 152 (chin). Subject's left = the image's right.
 */
export type FaceMarks = Record<number, [number, number]>;

export function fitFaceFromMarks(root: THREE.Object3D, mesh: THREE.SkinnedMesh, head: THREE.Bone, marks: FaceMarks): FittedFace | null {
  root.updateMatrixWorld(true);
  const cam = frontCamera(head, mesh);
  const hp = new THREE.Vector3();
  head.getWorldPosition(hp);
  const tris = bakeHeadTriangles(mesh, hp, cam.position.distanceTo(hp));
  const toBind = bindToWorldViaHead(mesh, head).invert();
  const rc = new THREE.Raycaster();

  // 1. Marks → 3D points on the mesh (bind space).
  const ids: number[] = [];
  const pts: THREE.Vector3[] = [];
  for (const [k, [px, py]] of Object.entries(marks)) {
    rc.setFromCamera(new THREE.Vector2((px / FRONT_VIEW.size) * 2 - 1, 1 - (py / FRONT_VIEW.size) * 2), cam);
    const h = castHead(rc.ray, tris);
    if (!h) continue;
    ids.push(Number(k));
    pts.push(h.point.applyMatrix4(toBind));
  }
  if (ids.length < 6) return null;

  // 2. Canonical face → marks: similarity, then a smooth warp of the leftover offsets.
  const canon = (i: number) => new THREE.Vector3().fromArray(CANONICAL_POSITIONS, i * 3);
  const T = similarity(ids.map(canon), pts);
  const placed = Array.from({ length: 468 }, (_, i) => canon(i).applyMatrix4(T));
  const resid = ids.map((id, j) => pts[j].clone().sub(placed[id]));
  const eyeD = placed[263].distanceTo(placed[33]);
  const s2 = (0.7 * eyeD) ** 2;
  const warped = placed.map((p, i) => {
    const j0 = ids.indexOf(i);
    if (j0 >= 0) return pts[j0].clone();
    let w = 0;
    const off = new THREE.Vector3();
    ids.forEach((id, j) => {
      const g = Math.exp(-p.distanceToSquared(placed[id]) / s2);
      off.addScaledVector(resid[j], g);
      w += g;
    });
    return w > 1e-6 ? p.clone().add(off.divideScalar(Math.max(w, 0.35))) : p.clone();
  });

  // 3. Snap every point onto the surface along the face's forward axis.
  const fromBind = bindToWorldViaHead(mesh, head);
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(T).normalize(); // canonical z = out of the face
  const fwdWorld = fwd.clone().transformDirection(fromBind).normalize();
  const hit: boolean[] = new Array(468).fill(false);
  const points = warped.map((p, i) => {
    const w = p.clone().applyMatrix4(fromBind);
    const ray = new THREE.Ray(w.clone().addScaledVector(fwdWorld, 0.6 * eyeD), fwdWorld.clone().negate());
    const h = castHead(ray, tris);
    if (h && h.point.distanceTo(w) < 0.45 * eyeD) {
      hit[i] = true;
      return h.point.applyMatrix4(toBind);
    }
    return p;
  });
  ids.forEach((id, j) => { points[id] = pts[j]; hit[id] = true; });
  return { points, hit, views: 1 };
}

/** Least-squares similarity (rotation + uniform scale + translation) via the polar decomposition. */
function similarity(src: THREE.Vector3[], dst: THREE.Vector3[]): THREE.Matrix4 {
  const n = src.length;
  const cs = src.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n);
  const cd = dst.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n);
  const H = new Array(9).fill(0);
  let ss = 0;
  for (let k = 0; k < n; k++) {
    const a = src[k].clone().sub(cs), b = dst[k].clone().sub(cd);
    ss += a.lengthSq();
    const av = [a.x, a.y, a.z], bv = [b.x, b.y, b.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i * 3 + j] += av[i] * bv[j];
  }
  let R = new THREE.Matrix3().set(H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]);
  for (let it = 0; it < 30; it++) {
    const f = R.clone().invert().transpose().elements;
    R = new THREE.Matrix3().fromArray(R.elements.map((x, i) => (x + f[i]) / 2));
  }
  const e = R.elements;
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tr += e[j * 3 + i] * H[j * 3 + i];
  const s = tr / Math.max(1e-9, ss);
  const M = new THREE.Matrix4().setFromMatrix3(R);
  M.scale(new THREE.Vector3(s, s, s));
  M.setPosition(cd.clone().sub(cs.clone().applyMatrix3(R).multiplyScalar(s)));
  return M;
}
