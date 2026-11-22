/**
 * forgeRigMesh.ts — Character Forge stage: re-rig an already-built GLB (image-to-3D shell with a contract rig) onto
 * the Forge's human skeleton, weights and runtime extras (services/argilla/creature/meshRig.ts), keeping its mesh,
 * UVs and textures. The old rig's 22 contract joints are the anchors; rigid extra parts keep their bone.
 *
 *   npx tsx scripts/eraclash3d/forgeRigMesh.ts <in.glb> <out.glb> [--hold Right:dagger,Left:dagger] [--name id]
 */
import fs from 'node:fs';
import path from 'node:path';
import { rigImportedMesh } from '../../services/argilla/creature/meshRig';
import { forgeToGlb } from '../../services/argilla/creature/exportCreature';
import type { HumanJoint } from '../../services/argilla/creature/human';
import type { GMaterial } from '../../services/argilla/creature/gltfWriter';
import type { Vec3 } from '../../services/argilla/engine';

type Json = Record<string, any>;
const COMP: Record<number, any> = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(file: string) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j: Json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl, bl = b.readUInt32LE(bo);
  const bin = b.subarray(bo + 8, bo + 8 + bl);
  const acc = (i: number) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], T = COMP[a.componentType], n = NC[a.type];
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? T.BYTES_PER_ELEMENT * n;
    const out = new T(a.count * n);
    for (let k = 0; k < a.count; k++) {
      const row = new T(bin.buffer.slice(bin.byteOffset + off + k * stride, bin.byteOffset + off + k * stride + T.BYTES_PER_ELEMENT * n));
      out.set(row, k * n);
    }
    return out;
  };
  const view = (i: number) => { const bv = j.bufferViews[i]; return new Uint8Array(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)); };
  return { j, acc, view };
}

function invertAffine(m: Float32Array, o: number): Vec3 {
  // column-major 4x4 inverse-bind: the joint's bind position is -R^T t
  const r = [m[o], m[o + 1], m[o + 2], m[o + 4], m[o + 5], m[o + 6], m[o + 8], m[o + 9], m[o + 10]], t = [m[o + 12], m[o + 13], m[o + 14]];
  // columns c0=(r0,r1,r2) c1=(r3,r4,r5) c2=(r6,r7,r8); world = -R^T t where R rows are columns here
  return [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])];
}

function main() {
  const args = process.argv.slice(2);
  const [src, dst] = args;
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const name = opt('--name') ?? path.basename(dst, '.glb');
  const hold = Object.fromEntries((opt('--hold') ?? '').split(',').filter(Boolean).map((p) => p.split(':'))) as { Left?: string; Right?: string };
  const { j, acc, view } = readGlb(src);
  const prim = j.meshes[0].primitives[0], at = prim.attributes;
  const positions = acc(at.POSITION) as Float32Array, normals = acc(at.NORMAL) as Float32Array;
  const uvs = at.TEXCOORD_0 !== undefined ? acc(at.TEXCOORD_0) as Float32Array : undefined;
  const indices = Uint32Array.from(acc(prim.indices));
  const JI = acc(at.JOINTS_0), W = acc(at.WEIGHTS_0) as Float32Array;
  const skin = j.skins[0], ibm = acc(skin.inverseBindMatrices) as Float32Array;
  const names: string[] = skin.joints.map((i: number) => j.nodes[i].name);
  const anchors: Partial<Record<HumanJoint, Vec3>> = {};
  names.forEach((n, k) => { anchors[n as HumanJoint] = invertAffine(ibm, k * 16); });

  // rigid parts: welded connected pieces other than the largest (the body), each on its strongest bone
  const nv = positions.length / 3;
  const key = (i: number) => `${Math.round(positions[i * 3] * 1e5)},${Math.round(positions[i * 3 + 1] * 1e5)},${Math.round(positions[i * 3 + 2] * 1e5)}`;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const seen = new Map<string, number>();
  for (let i = 0; i < nv; i++) { const k = key(i), f = seen.get(k); if (f === undefined) seen.set(k, i); else unite(i, f); }
  for (let t = 0; t < indices.length; t += 3) { unite(indices[t], indices[t + 1]); unite(indices[t + 1], indices[t + 2]); }
  const size = new Map<number, number>();
  for (let i = 0; i < nv; i++) { const r = find(i); size.set(r, (size.get(r) ?? 0) + 1); }
  const body = [...size].sort((a, b) => b[1] - a[1])[0][0];
  const rv: number[] = [], rb: HumanJoint[] = [];
  for (let i = 0; i < nv; i++) {
    if (find(i) === body) continue;
    let best = 0; for (let k = 1; k < 4; k++) if (W[i * 4 + k] > W[i * 4 + best]) best = k;
    rv.push(i); rb.push(names[JI[i * 4 + best]] as HumanJoint);
  }

  // material + textures carried over (webp bytes as they are)
  const mat = j.materials[prim.material ?? 0], pbr = mat.pbrMetallicRoughness ?? {};
  const images: { bytes: Uint8Array; mime: string }[] = [];
  const tex = (t?: { index: number }) => {
    if (!t) return undefined;
    const T = j.textures[t.index], src2 = T.source ?? T.extensions?.EXT_texture_webp?.source;
    const im = j.images[src2];
    images.push({ bytes: view(im.bufferView), mime: im.mimeType ?? 'image/webp' });
    return images.length - 1;
  };
  const material: GMaterial = {
    name: mat.name ?? `${name}_mat`, color: (pbr.baseColorFactor ?? [1, 1, 1, 1]) as GMaterial['color'],
    metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
    baseColorTexture: tex(pbr.baseColorTexture), ormTexture: tex(pbr.metallicRoughnessTexture),
    normalTexture: tex(mat.normalTexture), emissiveTexture: tex(mat.emissiveTexture),
    emissive: mat.emissiveFactor, doubleSided: !!mat.doubleSided, alphaMode: mat.alphaMode === 'OPAQUE' ? undefined : mat.alphaMode, alphaCutoff: mat.alphaCutoff,
  };

  const t0 = Date.now();
  const { character, report } = rigImportedMesh(
    { positions, normals, uvs, indices, rigid: { vertex: Int32Array.from(rv), bone: rb } },
    { name, anchors, materials: [material], images, hold, source: { from: path.basename(src), parts: new Set(rv.map((v) => find(v))).size } },
  );
  fs.writeFileSync(dst, forgeToGlb(character));
  console.log(JSON.stringify({ ...report, out: dst, bytes: fs.statSync(dst).size, sec: (Date.now() - t0) / 1000 }));
}

main();
