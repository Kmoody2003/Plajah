/**
 * exportCreature.ts — the finished creature as one GLB: skinned, textured, clips included, muscle as morph targets.
 *
 * Muscle becomes one morph per muscle group with its activation baked into every clip, so the bulges play in any
 * glTF engine. Fur length and direction travel as custom attributes (`_FURLENGTH`, `_FURDIR`); engines other than
 * Plajah's own need their own shell shader to use them.
 */

import type { MotionStyle } from './codex';
import { JOINTS, parentOf } from './anatomy';
import type { CreatureModel } from './finish';
import { ClipName, clipLength, CreatureMotion } from './motion';
import type { GMaterial, GNode, GPrim, GScene } from './gltfWriter';
import { writeGlb } from './gltfWriter';

const FPS = 30;
export const CLIPS: ClipName[] = ['idle', 'walk', 'run', 'signature'];

export async function creatureToGlb(model: CreatureModel, style: MotionStyle, name: string): Promise<Blob> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const motion = new CreatureMotion(model.anatomy, style);
  const vertexCount = model.positions.length / 3;

  // Left and right of a muscle share a morph, to keep the file from carrying fifty copies of the mesh.
  const groups = new Map<string, number[]>();
  model.muscles.forEach((m, i) => {
    const key = m.id.replace(/[LR]$/, '');
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const groupNames = [...groups.keys()];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(model.uvs), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(model.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(model.skinWeight, 4));
  geo.setAttribute('_FURLENGTH', new THREE.BufferAttribute(model.furLength, 1));
  geo.setAttribute('_FURDIR', new THREE.BufferAttribute(model.furDir, 3));
  geo.setIndex(new THREE.BufferAttribute(model.indices, 1));
  geo.morphTargetsRelative = true;
  const BULGE = 0.36;
  geo.morphAttributes.position = groupNames.map((group) => {
    const delta = new Float32Array(vertexCount * 3);
    for (const index of groups.get(group)!) {
      const m = model.muscles[index];
      m.verts.forEach((v, j) => {
        const amount = m.amounts[j] * BULGE;
        delta[v * 3] += model.normals[v * 3] * amount;
        delta[v * 3 + 1] += model.normals[v * 3 + 1] * amount;
        delta[v * 3 + 2] += model.normals[v * 3 + 2] * amount;
      });
    }
    const attr = new THREE.BufferAttribute(delta, 3);
    attr.name = group;
    return attr;
  });

  // glTF textures flip V against the atlas the painter wrote, so the export flips with it.
  const canvas = new OffscreenCanvas(model.textureSize, model.textureSize);
  const context = canvas.getContext('2d')!;
  context.putImageData(new ImageData(new Uint8ClampedArray(model.texture), model.textureSize, model.textureSize), 0, 0);
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  const bitmap = await createImageBitmap(pngBlob);
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  let normalTexture: import('three').Texture | null = null;
  if (model.normalMap) {
    const nc = new OffscreenCanvas(model.normalSize, model.normalSize);
    nc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(model.normalMap), model.normalSize, model.normalSize), 0, 0);
    normalTexture = new THREE.Texture(await createImageBitmap(await nc.convertToBlob({ type: 'image/png' })) as unknown as HTMLImageElement);
    normalTexture.flipY = false;
    normalTexture.needsUpdate = true;
  }

  const list = JOINTS.map((joint) => {
    const bone = new THREE.Bone();
    bone.name = joint;
    bone.position.copy(motion.offsets[joint]);
    return bone;
  });
  const boneFor = (joint: string) => list[JOINTS.indexOf(joint as (typeof JOINTS)[number])];
  for (const joint of JOINTS) {
    const parent = parentOf(joint);
    if (parent) boneFor(parent).add(boneFor(joint));
  }
  const root = new THREE.Group();
  root.name = name;
  root.add(boneFor('hips'));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ map: texture, normalMap: normalTexture, roughness: 0.75, metalness: 0 }));
  mesh.name = `${name} body`;
  mesh.morphTargetDictionary = Object.fromEntries(groupNames.map((group, i) => [group, i]));
  mesh.morphTargetInfluences = groupNames.map(() => 0);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list), new THREE.Matrix4());

  const animations = CLIPS.map((clip) => {
    const length = clipLength(clip, style);
    const frames = Math.max(2, Math.ceil(length * FPS) + 1);
    const times = new Float32Array(frames);
    const rotations = new Float32Array(frames * JOINTS.length * 4);
    const hips = new Float32Array(frames * 3);
    const weights = new Float32Array(frames * groupNames.length);
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * length;
      times[f] = t;
      const out = motion.evaluate({ clip, t, arousal: clip === 'signature' ? 0.5 : 0 });
      rotations.set(out.rotations, f * JOINTS.length * 4);
      hips.set([motion.offsets.hips.x + out.hipsOffset.x, motion.offsets.hips.y + out.hipsOffset.y, motion.offsets.hips.z + out.hipsOffset.z], f * 3);
      groupNames.forEach((group, g) => {
        const members = groups.get(group)!;
        let sum = 0;
        for (const m of members) sum += out.muscles[m];
        weights[f * groupNames.length + g] = sum / members.length;
      });
    }
    const tracks: import('three').KeyframeTrack[] = JOINTS.map((joint, j) => {
      const values = new Float32Array(frames * 4);
      for (let f = 0; f < frames; f++) values.set(rotations.subarray((f * JOINTS.length + j) * 4, (f * JOINTS.length + j + 1) * 4), f * 4);
      return new THREE.QuaternionKeyframeTrack(`${joint}.quaternion`, times, values);
    });
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hips));
    if (groupNames.length) tracks.push(new THREE.NumberKeyframeTrack(`${mesh.name.replace(/\s/g, '_')}.morphTargetInfluences`, times, weights));
    return new THREE.AnimationClip(clip, length, tracks);
  });
  mesh.name = mesh.name.replace(/\s/g, '_');

  const result = await new GLTFExporter().parseAsync(root, { binary: true, animations });
  geo.dispose();
  texture.dispose();
  bitmap.close();
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
}

// ---- Human characters (Character Forge) -------------------------------------------------------------------------
// A Forge character is one skinned body plus wardrobe pieces. Deforming pieces (cloth, the body, spring-chain armour)
// are skinned meshes on one skeleton; rigid plates are parented straight to their single bone; instanced parts (silk
// lacing) ride a bone through EXT_mesh_gpu_instancing. Written with the dependency-free gltfWriter so the Forge's
// build runs in Node as well as in a worker.


type V3 = [number, number, number];
export interface ForgeBone { name: string; parent: string | null; at: V3; extras?: Record<string, unknown> }
export interface ForgeSkinned { name: string; prims: GPrim[]; targetNames?: string[]; extras?: Record<string, unknown> }
export interface ForgeRigid {
  name: string;
  bone: string;
  /** Rest-pose world positions; converted to bone space on export. */
  prims: GPrim[];
  instances?: { translations: Float32Array; rotations: Float32Array; scales?: Float32Array };
  extras?: Record<string, unknown>;
}
export interface ForgeSocket {
  name: string;
  bone: string;
  /** Rest world position and rotation [x, y, z, w]. */
  at: V3;
  rotation: [number, number, number, number];
  /** Meshes in socket space, each its own node (so a sword can be hidden or moved to another socket). */
  meshes: { name: string; prims: GPrim[]; at?: V3; markers?: { name: string; at: V3 }[] }[];
}
export interface ForgeCharacter {
  name: string;
  bones: ForgeBone[];
  sockets?: ForgeSocket[];
  skinned: ForgeSkinned[];
  rigid: ForgeRigid[];
  materials: GMaterial[];
  images: Uint8Array[];
  extras: Record<string, unknown>;
}

export function forgeToGlb(c: ForgeCharacter): Uint8Array {
  const nodes: GNode[] = [];
  const index = new Map<string, number>();
  const at = new Map(c.bones.map((b) => [b.name, b.at] as const));
  for (const b of c.bones) {
    const p = b.parent ? at.get(b.parent)! : [0, 0, 0];
    index.set(b.name, nodes.length);
    nodes.push({ name: b.name, translation: [b.at[0] - p[0], b.at[1] - p[1], b.at[2] - p[2]], children: [], extras: b.extras });
  }
  for (const b of c.bones) if (b.parent) nodes[index.get(b.parent)!].children!.push(index.get(b.name)!);
  const ibm = new Float32Array(c.bones.length * 16);
  c.bones.forEach((b, i) => {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.at[0], -b.at[1], -b.at[2], 1], i * 16);
  });
  const meshes: GScene['meshes'] = [];
  const rootChildren: number[] = [index.get(c.bones.find((b) => !b.parent)!.name)!];
  for (const s of c.skinned) {
    meshes.push({ name: s.name, primitives: s.prims, targetNames: s.targetNames });
    nodes.push({ name: s.name, mesh: meshes.length - 1, skin: 0, extras: s.extras });
    rootChildren.push(nodes.length - 1);
  }
  for (const r of c.rigid) {
    const o = at.get(r.bone)!;
    const local = (p: Float32Array) => { const out = p.slice(); for (let i = 0; i < out.length; i += 3) { out[i] -= o[0]; out[i + 1] -= o[1]; out[i + 2] -= o[2]; } return out; };
    meshes.push({ name: r.name, primitives: r.prims.map((p) => ({ ...p, positions: r.instances ? p.positions : local(p.positions) })) });
    const inst = r.instances ? { ...r.instances, translations: local(r.instances.translations) } : undefined;
    nodes.push({ name: r.name, mesh: meshes.length - 1, instances: inst, extras: r.extras });
    nodes[index.get(r.bone)!].children!.push(nodes.length - 1);
  }
  for (const so of c.sockets ?? []) {
    const o = at.get(so.bone)!;
    const kids: number[] = [];
    for (const m of so.meshes) {
      meshes.push({ name: m.name, primitives: m.prims });
      const markerNodes = (m.markers ?? []).map((mk) => { nodes.push({ name: mk.name, translation: mk.at }); return nodes.length - 1; });
      nodes.push({ name: m.name, mesh: meshes.length - 1, translation: m.at, children: markerNodes });
      kids.push(nodes.length - 1);
    }
    nodes.push({ name: so.name, translation: [so.at[0] - o[0], so.at[1] - o[1], so.at[2] - o[2]], rotation: so.rotation, children: kids });
    nodes[index.get(so.bone)!].children!.push(nodes.length - 1);
  }
  nodes.push({ name: c.name, children: rootChildren, extras: c.extras });
  const root = nodes.length - 1;
  return writeGlb({
    nodes, roots: [root], meshes, materials: c.materials, images: c.images,
    skins: [{ name: `${c.name}_skin`, joints: c.bones.map((b) => index.get(b.name)!), inverseBindMatrices: ibm, skeleton: index.get(c.bones[0].name) }],
  });
}
