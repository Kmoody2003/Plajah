/**
 * gltfWriter.ts — a small, dependency-free GLB writer for the Forge's characters (runs in Node and in a worker).
 *
 * Writes what a current-gen character needs and nothing else: skinned meshes with morph targets, rigid parts parented
 * to bones, GPU-instanced parts (EXT_mesh_gpu_instancing, the silk lacing), PBR materials with clear-coat
 * (KHR_materials_clearcoat, lacquer) and sheen (KHR_materials_sheen, silk and cloth), PNG textures, and `extras`
 * for what glTF has no word for (spring chains, sockets, morph drivers, body capsules).
 */

export interface GPrim {
  positions: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  joints?: Uint16Array;
  weights?: Float32Array;
  indices: Uint32Array;
  material: number;
  /** Morph targets: position deltas, one array per target (same count on every primitive of a mesh). */
  targets?: Float32Array[];
}
export interface GMesh { name: string; primitives: GPrim[]; targetNames?: string[] }
export interface GNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  mesh?: number;
  skin?: number;
  extras?: Record<string, unknown>;
  /** Per-instance transforms (EXT_mesh_gpu_instancing). */
  instances?: { translations: Float32Array; rotations: Float32Array; scales?: Float32Array };
}
export interface GMaterial {
  name: string;
  color: [number, number, number, number?];
  metallic: number;
  roughness: number;
  baseColorTexture?: number;
  normalTexture?: number;
  normalScale?: number;
  /** Tiling for the detail maps (KHR_texture_transform), for UVs laid out in metres. */
  uvScale?: number;
  ormTexture?: number;
  clearcoat?: { factor: number; roughness: number };
  sheen?: { color: [number, number, number]; roughness: number };
  specular?: { factor: number; color?: [number, number, number] };
  emissive?: [number, number, number];
  doubleSided?: boolean;
  extras?: Record<string, unknown>;
}
export interface GSkin { name: string; joints: number[]; inverseBindMatrices: Float32Array; skeleton?: number }
export interface GScene {
  nodes: GNode[];
  roots: number[];
  meshes: GMesh[];
  materials: GMaterial[];
  /** PNG bytes. */
  images: Uint8Array[];
  skins: GSkin[];
  extras?: Record<string, unknown>;
}

const enum CT { UBYTE = 5121, USHORT = 5123, UINT = 5125, FLOAT = 5126 }

export function writeGlb(scene: GScene): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const push = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
    const view: Record<string, unknown> = { buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength };
    if (target) view.target = target;
    bufferViews.push(view);
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (data: Float32Array | Uint16Array | Uint32Array, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4', target?: number, minmax = false) => {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const componentType = data instanceof Float32Array ? CT.FLOAT : data instanceof Uint16Array ? CT.USHORT : CT.UINT;
    const view = push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target);
    const acc: Record<string, unknown> = { bufferView: view, componentType, count: data.length / comps, type };
    if (minmax) {
      const min = new Array(comps).fill(Infinity), max = new Array(comps).fill(-Infinity);
      for (let i = 0; i < data.length; i++) { const c = i % comps; min[c] = Math.min(min[c], data[i]); max[c] = Math.max(max[c], data[i]); }
      acc.min = min; acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  /** Morph deltas are mostly zero (a corrective touches one joint): stored sparse, only the moved vertices. */
  const sparseVec3 = (data: Float32Array) => {
    const idx: number[] = [], vals: number[] = [];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length / 3; i++) {
      const x = data[i * 3], y = data[i * 3 + 1], z = data[i * 3 + 2];
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-6) continue;
      idx.push(i); vals.push(x, y, z);
    }
    for (let c = 0; c < 3; c++) { min[c] = 0; max[c] = 0; }
    for (let i = 0; i < vals.length; i++) { const c = i % 3; min[c] = Math.min(min[c], vals[i]); max[c] = Math.max(max[c], vals[i]); }
    const acc: Record<string, unknown> = { componentType: CT.FLOAT, count: data.length / 3, type: 'VEC3', min, max };
    if (idx.length) {
      const iv = push(new Uint8Array(new Uint32Array(idx).buffer));
      const vv = push(new Uint8Array(new Float32Array(vals).buffer));
      acc.sparse = { count: idx.length, indices: { bufferView: iv, componentType: CT.UINT }, values: { bufferView: vv } };
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const extensionsUsed = new Set<string>();
  const meshes = scene.meshes.map((m) => ({
    name: m.name,
    primitives: m.primitives.map((p) => {
      const attributes: Record<string, number> = {
        POSITION: accessor(p.positions, 'VEC3', 34962, true),
        NORMAL: accessor(p.normals, 'VEC3', 34962),
      };
      if (p.uvs) attributes.TEXCOORD_0 = accessor(p.uvs, 'VEC2', 34962);
      if (p.joints) attributes.JOINTS_0 = accessor(p.joints, 'VEC4', 34962);
      if (p.weights) attributes.WEIGHTS_0 = accessor(p.weights, 'VEC4', 34962);
      const prim: Record<string, unknown> = { attributes, indices: accessor(p.indices, 'SCALAR', 34963), material: p.material, mode: 4 };
      if (p.targets?.length) prim.targets = p.targets.map((t) => ({ POSITION: sparseVec3(t) }));
      return prim;
    }),
    ...(m.targetNames?.length ? { weights: m.targetNames.map(() => 0), extras: { targetNames: m.targetNames } } : {}),
  }));

  const nodes = scene.nodes.map((n) => {
    const out: Record<string, unknown> = { name: n.name };
    if (n.translation) out.translation = n.translation;
    if (n.rotation) out.rotation = n.rotation;
    if (n.scale) out.scale = n.scale;
    if (n.children?.length) out.children = n.children;
    if (n.mesh !== undefined) out.mesh = n.mesh;
    if (n.skin !== undefined) out.skin = n.skin;
    if (n.extras) out.extras = n.extras;
    if (n.instances) {
      extensionsUsed.add('EXT_mesh_gpu_instancing');
      const attributes: Record<string, number> = {
        TRANSLATION: accessor(n.instances.translations, 'VEC3'),
        ROTATION: accessor(n.instances.rotations, 'VEC4'),
      };
      if (n.instances.scales) attributes.SCALE = accessor(n.instances.scales, 'VEC3');
      out.extensions = { EXT_mesh_gpu_instancing: { attributes } };
    }
    return out;
  });

  const skins = scene.skins.map((s) => ({ name: s.name, joints: s.joints, inverseBindMatrices: accessor(s.inverseBindMatrices, 'MAT4'), ...(s.skeleton !== undefined ? { skeleton: s.skeleton } : {}) }));
  const images = scene.images.map((png) => ({ bufferView: push(png), mimeType: 'image/png' }));
  const textures = scene.images.map((_, i) => ({ source: i, sampler: 0 }));

  const materials = scene.materials.map((m) => {
    const pbr: Record<string, unknown> = { baseColorFactor: [m.color[0], m.color[1], m.color[2], m.color[3] ?? 1], metallicFactor: m.metallic, roughnessFactor: m.roughness };
    if (m.baseColorTexture !== undefined) pbr.baseColorTexture = { index: m.baseColorTexture };
    if (m.ormTexture !== undefined) pbr.metallicRoughnessTexture = { index: m.ormTexture };
    const out: Record<string, unknown> = { name: m.name, pbrMetallicRoughness: pbr };
    if (m.normalTexture !== undefined) {
      out.normalTexture = { index: m.normalTexture, scale: m.normalScale ?? 1 };
      if (m.uvScale && m.uvScale !== 1) {
        (out.normalTexture as Record<string, unknown>).extensions = { KHR_texture_transform: { scale: [m.uvScale, m.uvScale] } };
        extensionsUsed.add('KHR_texture_transform');
      }
    }
    if (m.ormTexture !== undefined) out.occlusionTexture = { index: m.ormTexture };
    if (m.emissive) out.emissiveFactor = m.emissive;
    if (m.doubleSided) out.doubleSided = true;
    const ext: Record<string, unknown> = {};
    if (m.clearcoat) { ext.KHR_materials_clearcoat = { clearcoatFactor: m.clearcoat.factor, clearcoatRoughnessFactor: m.clearcoat.roughness }; extensionsUsed.add('KHR_materials_clearcoat'); }
    if (m.sheen) { ext.KHR_materials_sheen = { sheenColorFactor: m.sheen.color, sheenRoughnessFactor: m.sheen.roughness }; extensionsUsed.add('KHR_materials_sheen'); }
    if (m.specular) { ext.KHR_materials_specular = { specularFactor: m.specular.factor, ...(m.specular.color ? { specularColorFactor: m.specular.color } : {}) }; extensionsUsed.add('KHR_materials_specular'); }
    if (Object.keys(ext).length) out.extensions = ext;
    if (m.extras) out.extras = m.extras;
    return out;
  });

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'Plajah Character Forge' },
    scene: 0,
    scenes: [{ nodes: scene.roots, ...(scene.extras ? { extras: scene.extras } : {}) }],
    nodes, meshes, materials, skins, accessors, bufferViews,
    buffers: [{ byteLength }],
  };
  if (images.length) { json.images = images; json.textures = textures; json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]; }
  if (extensionsUsed.size) json.extensionsUsed = [...extensionsUsed];
  for (const k of ['skins', 'materials', 'meshes'] as const) if (!(json[k] as unknown[]).length) delete json[k];

  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) { const b = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20); b.set(jsonBytes); jsonBytes = b; }
  const binPad = (4 - (byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + 8 + byteLength + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, byteLength + binPad, true); dv.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
