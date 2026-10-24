// subdivide.ts — add detail where the face will move, without cracks.
//
// Image-to-3D characters are coarse (Jack's whole face is ~500 vertices) — far too few for 43 face
// shapes to read. Triangles selected by `pick` are split 1→4 at their edge midpoints; neighbouring
// triangles that share a split edge are split 1→2 or 1→3 to match (red–green refinement), so the
// surface stays watertight. Every attribute is carried over: positions/normals/UVs are averaged, and
// skin influences are merged (top four kept, renormalised). The shape is unchanged (flat midpoints).

import * as THREE from 'three';

export function subdivideRegion(
  geo: THREE.BufferGeometry,
  pick: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean,
  levels = 2
): THREE.BufferGeometry {
  let g = geo;
  for (let l = 0; l < levels; l++) g = subdivideOnce(g, pick);
  return g;
}

function subdivideOnce(
  geo: THREE.BufferGeometry,
  pick: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => boolean
): THREE.BufferGeometry {
  const index = geo.getIndex();
  if (!index) throw new Error('subdivideRegion: expected an indexed geometry');
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const names = Object.keys(geo.attributes);
  // Growable copies of every attribute.
  const data: Record<string, number[]> = {};
  const size: Record<string, number> = {};
  for (const n of names) {
    // Read component by component: loaders may hand over interleaved attributes, whose .array is
    // the whole shared buffer rather than this attribute's values.
    const a = geo.getAttribute(n) as THREE.BufferAttribute;
    const vals: number[] = new Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) vals[i * a.itemSize + k] = a.getComponent(i, k);
    data[n] = vals;
    size[n] = a.itemSize;
  }
  let count = pos.count;

  const mid = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const midpoint = (a: number, b: number) => {
    const k = key(a, b);
    const hit = mid.get(k);
    if (hit !== undefined) return hit;
    const id = count++;
    for (const n of names) {
      const s = size[n];
      const arr = data[n];
      if (n === 'skinIndex') continue; // merged together with skinWeight below
      if (n === 'skinWeight') {
        const inf = new Map<number, number>();
        for (const v of [a, b]) {
          for (let k2 = 0; k2 < 4; k2++) {
            const bone = data.skinIndex[v * 4 + k2];
            const w = data.skinWeight[v * 4 + k2] * 0.5;
            if (w > 0) inf.set(bone, (inf.get(bone) ?? 0) + w);
          }
        }
        const top = [...inf.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
        const sum = top.reduce((t, e) => t + e[1], 0) || 1;
        for (let k2 = 0; k2 < 4; k2++) {
          data.skinIndex.push(top[k2]?.[0] ?? 0);
          arr.push((top[k2]?.[1] ?? 0) / sum);
        }
        continue;
      }
      for (let k2 = 0; k2 < s; k2++) arr.push((arr[a * s + k2] + arr[b * s + k2]) / 2);
    }
    mid.set(k, id);
    return id;
  };

  // 1. Choose triangles and split their edges.
  const tris = index.count / 3;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  const chosen = new Uint8Array(tris);
  for (let t = 0; t < tris; t++) {
    const a = index.getX(t * 3), b = index.getX(t * 3 + 1), c = index.getX(t * 3 + 2);
    pa.fromBufferAttribute(pos, a);
    pb.fromBufferAttribute(pos, b);
    pc.fromBufferAttribute(pos, c);
    if (!pick(pa, pb, pc)) continue;
    chosen[t] = 1;
    midpoint(a, b);
    midpoint(b, c);
    midpoint(c, a);
  }

  // 2. Re-triangulate every triangle by how many of its edges were split.
  const out: number[] = [];
  for (let t = 0; t < tris; t++) {
    const a = index.getX(t * 3), b = index.getX(t * 3 + 1), c = index.getX(t * 3 + 2);
    const ab = mid.get(key(a, b)), bc = mid.get(key(b, c)), ca = mid.get(key(c, a));
    const n = (ab !== undefined ? 1 : 0) + (bc !== undefined ? 1 : 0) + (ca !== undefined ? 1 : 0);
    if (n === 0) out.push(a, b, c);
    else if (n === 3) out.push(a, ab!, ca!, ab!, b, bc!, ca!, bc!, c, ab!, bc!, ca!);
    else if (n === 1) {
      if (ab !== undefined) out.push(a, ab, c, ab, b, c);
      else if (bc !== undefined) out.push(a, b, bc, a, bc, c);
      else out.push(a, b, ca!, ca!, b, c);
    } else {
      // Two split edges: one corner triangle + a quad split in two.
      if (ab === undefined) out.push(c, ca!, bc!, a, b, bc!, a, bc!, ca!);
      else if (bc === undefined) out.push(a, ab, ca!, b, c, ca!, b, ca!, ab);
      else out.push(b, bc, ab!, c, a, ab!, c, ab!, bc);
    }
  }
  void chosen;

  const ng = new THREE.BufferGeometry();
  for (const nme of names) {
    const src = geo.getAttribute(nme) as THREE.BufferAttribute;
    // getComponent() returns de-normalised values, so store floats (skin indices stay integers).
    const arr = nme === 'skinIndex' ? new Uint16Array(data[nme]) : new Float32Array(data[nme]);
    ng.setAttribute(nme, new THREE.BufferAttribute(arr, src.itemSize, false));
  }
  ng.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(out, 1) : new THREE.Uint16BufferAttribute(out, 1));
  ng.groups = geo.groups.length ? [{ start: 0, count: out.length, materialIndex: 0 }] : [];
  ng.name = geo.name;
  return ng;
}
