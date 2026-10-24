// buildVtuberRig.ts — turn a rigged character GLB into a VTuber-ready VRM, automatically.
//
//   1. fit MediaPipe's 468-point face onto the model (renders + ray casts)       → fitFace
//   2. author the ARKit face shapes on that fitted face                           → arkitShapes
//   3. transfer them onto the character's mesh; cut the mouth and eye openings   → transferFace
//   4. add eyeballs (tinted from the painted iris), teeth, tongue, mouth interior → faceParts
//   5. write VRM 1.0: humanoid bones, ARKit "perfect sync" + preset expressions  → vrmExport
//
// Runs in the browser (WebGL + MediaPipe). The same pipeline is meant to run behind the creator
// upload flow (character sheet → image-to-3D → auto-rig → this).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fitFace } from './fitFace';
import { fitFaceFromMarks, type FaceMarks } from './anchorFit';
import { buildArkitShapes, faceFrameOf } from './arkitShapes';
import { subdivideRegion } from './subdivide';
import { transferFace } from './transferFace';
import { buildFaceParts, sampleTextureColor } from './faceParts';
import { exportVrm, type VrmMeta } from './vrmExport';
import { splitMorphRegion } from './splitFace';

export interface VtuberRigReport {
  fittedViews: number;
  landmarksHit: number;
  trianglesBefore: number;
  trianglesAfter: number;
  movedVertices: number;
  cutMouthTris: number;
  cutEyeTris: number;
  irisColor: string;
  bytes: number;
}

export interface BuildOptions {
  /** Hand fit for faces the tracker can't read: landmark index → pixel on the FRONT_VIEW render. */
  marks?: FaceMarks;
  /** false = keep the model's own painted/carved eyes (no eyeballs, no eye cut). */
  eyes?: boolean;
  /** false = no teeth/tongue/mouth interior and no lip cut (e.g. a carved pumpkin mouth). */
  mouth?: boolean;
}

export async function buildVtuberRig(
  modelUrl: string,
  meta: VrmMeta,
  opts: BuildOptions = {}
): Promise<{ vrm: ArrayBuffer; report: VtuberRigReport; root: THREE.Object3D }> {
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const root = gltf.scene;
  let body: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh;
  });
  const head = root.getObjectByName('Head') as THREE.Bone | undefined;
  if (!body || !head) throw new Error('buildVtuberRig: needs a skinned mesh with a Head bone');
  const mesh: THREE.SkinnedMesh = body;
  mesh.geometry = mesh.geometry.clone();

  // Lit, neutral stage for the face fit.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x777777);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(0, 1.5, 3);
  scene.add(key);
  scene.add(root);

  const fitted = opts.marks ? fitFaceFromMarks(root, mesh, head, opts.marks) : await fitFace(scene, root, mesh, head);
  if (!fitted) {
    throw new Error(opts.marks
      ? 'buildVtuberRig: too few marks landed on the mesh'
      : 'buildVtuberRig: no face found on the model (non-human faces need a hand fit: pass marks)');
  }

  // Image-to-3D faces are coarse: add detail over the face (×16 triangles) before shaping it.
  const pre = faceFrameOf(fitted.points);
  const faceCentre = fitted.points.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(fitted.points.length);
  let faceR = 0;
  for (const p of fitted.points) faceR = Math.max(faceR, p.distanceTo(faceCentre));
  const reach = faceR + 0.25 * pre.d;
  const before = (mesh.geometry.getIndex()?.count ?? 0) / 3;
  mesh.geometry = subdivideRegion(mesh.geometry, (a, b, c) => {
    const m = a.clone().add(b).add(c).divideScalar(3);
    return m.distanceTo(faceCentre) < reach && m.clone().sub(faceCentre).dot(pre.Z) > -0.8 * pre.d;
  }, 2);
  const after = (mesh.geometry.getIndex()?.count ?? 0) / 3;

  const { frame, shapes, jaw } = buildArkitShapes(fitted.points);
  const cut = transferFace(mesh, fitted.points, frame, shapes, { eyes: opts.eyes !== false, mouth: opts.mouth !== false });

  const map = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const iris =
    sampleTextureColor(map.map, cut.eyeUvs.left) ?? sampleTextureColor(map.map, cut.eyeUvs.right) ?? new THREE.Color(0x5a3a22);
  buildFaceParts({ body: mesh, head, P: fitted.points, frame, jaw, irisColor: iris, eyes: opts.eyes, mouth: opts.mouth });
  // Shapes only where the face moves (glTF would store them for every body vertex otherwise).
  mesh.name = 'Body';
  splitMorphRegion(mesh, 'Face');

  scene.remove(root);
  // Ship textures as JPEG (the exporter would otherwise re-encode them as huge PNGs).
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    for (const t of [m?.map, m?.normalMap, m?.roughnessMap, m?.metalnessMap, m?.emissiveMap]) {
      if (t) t.userData = { ...t.userData, mimeType: 'image/jpeg' };
    }
  });
  const vrm = await exportVrm(root, meta);
  return {
    vrm,
    root,
    report: {
      fittedViews: fitted.views,
      landmarksHit: fitted.hit.filter(Boolean).length,
      trianglesBefore: before,
      trianglesAfter: after,
      movedVertices: cut.movedVertices,
      cutMouthTris: cut.cutMouthTris,
      cutEyeTris: cut.cutEyeTris,
      irisColor: `#${iris.getHexString()}`,
      bytes: vrm.byteLength,
    },
  };
}
