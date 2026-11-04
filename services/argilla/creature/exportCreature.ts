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
