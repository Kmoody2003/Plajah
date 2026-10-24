// splitFace.ts — move the morphing part of a skinned mesh into its own mesh.
//
// glTF stores every morph target for every vertex of its mesh, so 43 face shapes on a 50k-vertex
// body would be ~25 MB of mostly zeros. The triangles that touch a moving vertex become a "Face"
// mesh (same skeleton and material) that alone carries the shapes; the body keeps the rest. The cut
// runs along vertices that never move, so the two halves can't tear apart.

import * as THREE from 'three';

export function splitMorphRegion(body: THREE.SkinnedMesh, name = 'Face'): THREE.SkinnedMesh {
  const geo = body.geometry;
  const index = geo.getIndex()!;
  const morphs = geo.morphAttributes.position ?? [];
  const n = geo.getAttribute('position').count;
  const moves = new Uint8Array(n);
  for (const m of morphs) {
    for (let i = 0; i < n; i++) {
      if (moves[i]) continue;
      if (m.getX(i) !== 0 || m.getY(i) !== 0 || m.getZ(i) !== 0) moves[i] = 1;
    }
  }

  const faceTris: number[] = [];
  const bodyTris: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    (moves[a] || moves[b] || moves[c] ? faceTris : bodyTris).push(a, b, c);
  }

  // Face geometry: only the vertices its triangles use, renumbered.
  const remap = new Map<number, number>();
  const order: number[] = [];
  for (const v of faceTris) if (!remap.has(v)) { remap.set(v, order.length); order.push(v); }
  const fg = new THREE.BufferGeometry();
  for (const [key, attr] of Object.entries(geo.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const arr = new (a.array.constructor as any)(order.length * a.itemSize);
    order.forEach((src, dst) => { for (let k = 0; k < a.itemSize; k++) arr[dst * a.itemSize + k] = a.getComponent(src, k); });
    fg.setAttribute(key, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  fg.morphAttributes.position = morphs.map((m) => {
    const arr = new Float32Array(order.length * 3);
    order.forEach((src, dst) => { arr[dst * 3] = m.getX(src); arr[dst * 3 + 1] = m.getY(src); arr[dst * 3 + 2] = m.getZ(src); });
    const out = new THREE.Float32BufferAttribute(arr, 3);
    out.name = m.name;
    return out;
  });
  fg.morphTargetsRelative = true;
  fg.setIndex(faceTris.map((v) => remap.get(v)!));

  const face = new THREE.SkinnedMesh(fg, body.material);
  face.name = name;
  face.frustumCulled = false;
  face.morphTargetDictionary = { ...(body.morphTargetDictionary ?? {}) };
  face.morphTargetInfluences = (body.morphTargetInfluences ?? []).map(() => 0);
  body.parent!.add(face);
  face.position.copy(body.position);
  face.quaternion.copy(body.quaternion);
  face.scale.copy(body.scale);
  face.bind(body.skeleton, body.bindMatrix);

  // The body keeps the still triangles and no shapes.
  geo.setIndex(bodyTris);
  geo.morphAttributes = {};
  body.morphTargetDictionary = undefined;
  body.morphTargetInfluences = undefined;
  body.name ||= 'Body';
  return face;
}
