// vrmExport.ts — write a rigged character as VRM 1.0 (glTF binary + the VRMC_vrm extension).
//
// Humanoid bones are found by structure (works across Mixamo/Meshy naming), every ARKit shape becomes
// a custom expression bound to all meshes that carry that morph (the "perfect sync" set VTuber apps
// drive 1:1 from face tracking), and VRM's preset expressions — visemes, blinks, emotions — are
// built from them. Gaze is bone-driven through the LeftEye/RightEye bones.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export interface VrmMeta {
  name: string;
  version?: string;
  authors: string[];
  copyrightInformation?: string;
  contactInformation?: string;
  thumbnail?: never;
}

type Weights = Record<string, number>;

/** VRM preset expressions in terms of ARKit shapes. */
const PRESETS: Record<string, Weights> = {
  aa: { jawOpen: 0.9 },
  ih: { jawOpen: 0.3, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 },
  ou: { mouthFunnel: 0.8, mouthPucker: 0.5, jawOpen: 0.2 },
  ee: { mouthSmileLeft: 0.4, mouthSmileRight: 0.4, mouthStretchLeft: 0.4, mouthStretchRight: 0.4, jawOpen: 0.15 },
  oh: { mouthFunnel: 0.7, jawOpen: 0.5 },
  blink: { eyeBlinkLeft: 1, eyeBlinkRight: 1 },
  blinkLeft: { eyeBlinkLeft: 1 },
  blinkRight: { eyeBlinkRight: 1 },
  happy: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, cheekSquintLeft: 0.6, cheekSquintRight: 0.6, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
  angry: { browDownLeft: 1, browDownRight: 1, noseSneerLeft: 0.5, noseSneerRight: 0.5, mouthFrownLeft: 0.4, mouthFrownRight: 0.4 },
  sad: { browInnerUp: 0.9, mouthFrownLeft: 0.7, mouthFrownRight: 0.7 },
  relaxed: { mouthSmileLeft: 0.4, mouthSmileRight: 0.4, eyeBlinkLeft: 0.25, eyeBlinkRight: 0.25 },
  surprised: { eyeWideLeft: 1, eyeWideRight: 1, browInnerUp: 0.8, browOuterUpLeft: 0.6, browOuterUpRight: 0.6, jawOpen: 0.35 },
  neutral: {},
};

/** Humanoid bone → node, found from the skeleton's structure and common names. */
function humanoidMap(root: THREE.Object3D): Record<string, THREE.Object3D> {
  const byName = (re: RegExp) => {
    let hit: THREE.Object3D | undefined;
    root.traverse((o) => { if (!hit && (o as THREE.Bone).isBone && re.test(o.name)) hit = o; });
    return hit;
  };
  const m: Record<string, THREE.Object3D | undefined> = {
    hips: byName(/^hips$/i),
    neck: byName(/^neck$/i),
    head: byName(/^head$/i),
    leftShoulder: byName(/^leftshoulder$/i),
    leftUpperArm: byName(/^leftarm$/i),
    leftLowerArm: byName(/^leftforearm$/i),
    leftHand: byName(/^lefthand$/i),
    rightShoulder: byName(/^rightshoulder$/i),
    rightUpperArm: byName(/^rightarm$/i),
    rightLowerArm: byName(/^rightforearm$/i),
    rightHand: byName(/^righthand$/i),
    leftUpperLeg: byName(/^leftupleg$/i),
    leftLowerLeg: byName(/^leftleg$/i),
    leftFoot: byName(/^leftfoot$/i),
    leftToes: byName(/^lefttoe(base)?$/i),
    rightUpperLeg: byName(/^rightupleg$/i),
    rightLowerLeg: byName(/^rightleg$/i),
    rightFoot: byName(/^rightfoot$/i),
    rightToes: byName(/^righttoe(base)?$/i),
    leftEye: byName(/^lefteye$/i),
    rightEye: byName(/^righteye$/i),
  };
  // Spine chain: hips → … → neck (rigs name and order it differently).
  const chain: THREE.Object3D[] = [];
  for (let o = m.neck?.parent; o && o !== m.hips; o = o.parent) chain.unshift(o);
  if (chain[0]) m.spine = chain[0];
  if (chain.length >= 2) m.chest = chain[1];
  if (chain.length >= 3) m.upperChest = chain[chain.length - 1];
  const out: Record<string, THREE.Object3D> = {};
  for (const [k, v] of Object.entries(m)) if (v) out[k] = v;
  return out;
}

export async function exportVrm(root: THREE.Object3D, meta: VrmMeta): Promise<ArrayBuffer> {
  root.updateMatrixWorld(true);
  const human = humanoidMap(root);
  const required = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm',
    'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
  const missing = required.filter((k) => !human[k]);
  if (missing.length) throw new Error(`VRM: missing humanoid bones ${missing.join(', ')}`);

  const morphMeshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary) morphMeshes.push(mesh);
  });
  const shapeNames = new Set<string>();
  morphMeshes.forEach((m) => Object.keys(m.morphTargetDictionary!).forEach((n) => shapeNames.add(n)));

  const head = human.head;
  const le = human.leftEye, re = human.rightEye;
  const eyeMid = new THREE.Vector3();
  if (le && re) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    le.getWorldPosition(a);
    re.getWorldPosition(b);
    eyeMid.copy(a).add(b).multiplyScalar(0.5);
    head.worldToLocal(eyeMid);
  }

  const exporter = new GLTFExporter();
  exporter.register((writer: any) => ({
    afterParse() {
      const node = (o: THREE.Object3D) => writer.nodeMap.get(o) as number;
      const binds = (w: Weights) => {
        const out: Array<{ node: number; index: number; weight: number }> = [];
        for (const [name, weight] of Object.entries(w)) {
          for (const m of morphMeshes) {
            const i = m.morphTargetDictionary![name];
            if (i !== undefined && node(m) !== undefined) out.push({ node: node(m), index: i, weight });
          }
        }
        return out;
      };
      const expr = (w: Weights, binary = false) => ({ morphTargetBinds: binds(w), isBinary: binary, overrideBlink: 'none', overrideLookAt: 'none', overrideMouth: 'none' });
      const preset: Record<string, unknown> = {};
      for (const [k, w] of Object.entries(PRESETS)) preset[k] = expr(w);
      const custom: Record<string, unknown> = {};
      for (const n of shapeNames) custom[n] = expr({ [n]: 1 });

      writer.json.extensionsUsed ??= [];
      if (!writer.json.extensionsUsed.includes('VRMC_vrm')) writer.json.extensionsUsed.push('VRMC_vrm');
      writer.json.extensions ??= {};
      writer.json.extensions.VRMC_vrm = {
        specVersion: '1.0',
        meta: {
          name: meta.name,
          version: meta.version ?? '1.0',
          authors: meta.authors,
          copyrightInformation: meta.copyrightInformation,
          contactInformation: meta.contactInformation,
          licenseUrl: 'https://vrm.dev/licenses/1.0/',
          avatarPermission: 'onlyAuthor',
          allowExcessivelyViolentUsage: false,
          allowExcessivelySexualUsage: false,
          commercialUsage: 'personalNonProfit',
          allowPoliticalOrReligiousUsage: false,
          allowAntisocialOrHateUsage: false,
          creditNotation: 'required',
          allowRedistribution: false,
          modification: 'prohibited',
        },
        humanoid: {
          humanBones: Object.fromEntries(Object.entries(human).map(([k, o]) => [k, { node: node(o) }])),
        },
        expressions: { preset, custom },
        lookAt: le && re
          ? {
              offsetFromHeadBone: [eyeMid.x, eyeMid.y, eyeMid.z],
              type: 'bone',
              // Gaze in degrees → eye-bone turn in degrees, about 1:1 within a human range.
              rangeMapHorizontalInner: { inputMaxValue: 30, outputScale: 26 },
              rangeMapHorizontalOuter: { inputMaxValue: 30, outputScale: 30 },
              rangeMapVerticalDown: { inputMaxValue: 25, outputScale: 20 },
              rangeMapVerticalUp: { inputMaxValue: 25, outputScale: 18 },
            }
          : undefined,
      };
    },
  }));
  const out = await exporter.parseAsync(root, { binary: true, onlyVisible: false });
  return out as ArrayBuffer;
}
