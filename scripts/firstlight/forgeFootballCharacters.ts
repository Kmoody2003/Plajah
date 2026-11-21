/**
 * scripts/firstlight/forgeFootballCharacters.ts
 *
 * Uses Plajah's Character Forge pipeline (Argilla human anatomy + surface nets
 * + humanSkinWeights + footballWardrobe + forgeToGlb) to build and rig 4
 * current-gen American Football positional character GLBs modeled from the
 * Project Firstlight character turnaround sheets:
 *   - public/firstlight/assets/characters/qb.glb
 *   - public/firstlight/assets/characters/skill.glb
 *   - public/firstlight/assets/characters/power.glb
 *   - public/firstlight/assets/characters/lineman.glb
 *
 * Every GLB carries Plajah's 66-joint contract skeleton (HUMAN_JOINTS: Hips,
 * Spine, Spine1, Spine2, Neck, Head, Left/RightShoulder..Hand + fingers,
 * Left/RightUpLeg..ToeBase), making them 100% compatible with Plajah Motion
 * Studio captures (plajah.motion JSON), BVH, and CMU FBX retargeting.
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs scripts/firstlight/forgeFootballCharacters.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildHumanAnatomy,
  HUMAN_JOINTS,
  PARENT,
  TWIST_JOINTS,
} from '../../services/argilla/creature/human';
import {
  bodyField,
  compact,
  humanSkinWeights,
  meshField,
  relaxMesh,
  settleOnField,
  type BodyMesh,
} from '../../services/argilla/creature/humanFinish';
import {
  buildFootballWardrobe,
  FOOTBALL_ARCHETYPES,
  type FootballArchetypeId,
} from '../../services/argilla/creature/footballWardrobe';
import {
  forgeToGlb,
  type ForgeBone,
  type ForgeRigid,
  type ForgeSkinned,
  type ForgeSocket,
} from '../../services/argilla/creature/exportCreature';
import type { GMaterial, GPrim } from '../../services/argilla/creature/gltfWriter';
import type { MeshBuilder } from '../../services/argilla/creature/wardrobe';

const OUT_DIR = path.resolve('public/firstlight/assets/characters');

const MATERIAL_DEFS: GMaterial[] = [
  // 0: skin
  { name: 'skin', color: [0.68, 0.48, 0.35, 1], metallic: 0.0, roughness: 0.62 },
  // 1: jersey
  { name: 'jersey', color: [0.11, 0.19, 0.36, 1], metallic: 0.04, roughness: 0.72, doubleSided: true, sheen: { color: [0.25, 0.32, 0.45], roughness: 0.75 } },
  // 2: jerseyStripe
  { name: 'jerseyStripe', color: [0.88, 0.90, 0.94, 1], metallic: 0.06, roughness: 0.55, doubleSided: true },
  // 3: pants
  { name: 'pants', color: [0.92, 0.93, 0.96, 1], metallic: 0.05, roughness: 0.52, doubleSided: true },
  // 4: pantsStripe
  { name: 'pantsStripe', color: [0.11, 0.19, 0.36, 1], metallic: 0.05, roughness: 0.50, doubleSided: true },
  // 5: belt
  { name: 'belt', color: [0.12, 0.14, 0.18, 1], metallic: 0.25, roughness: 0.45 },
  // 6: socks
  { name: 'socks', color: [0.11, 0.19, 0.36, 1], metallic: 0.0, roughness: 0.82, doubleSided: true },
  // 7: tape
  { name: 'tape', color: [0.95, 0.96, 0.98, 1], metallic: 0.0, roughness: 0.85, doubleSided: true },
  // 8: gloves
  { name: 'gloves', color: [0.16, 0.22, 0.34, 1], metallic: 0.08, roughness: 0.42, doubleSided: true },
  // 9: cleats
  { name: 'cleats', color: [0.12, 0.16, 0.26, 1], metallic: 0.15, roughness: 0.38, doubleSided: true },
  // 10: cleatSole
  { name: 'cleatSole', color: [0.82, 0.85, 0.90, 1], metallic: 0.35, roughness: 0.32, doubleSided: true },
  // 11: accessory
  { name: 'accessory', color: [0.09, 0.11, 0.15, 1], metallic: 0.05, roughness: 0.65, doubleSided: true },
  // 12: towel
  { name: 'towel', color: [0.96, 0.96, 0.97, 1], metallic: 0.0, roughness: 0.92, doubleSided: true },
  // 13: helmetShell
  { name: 'helmetShell', color: [0.10, 0.16, 0.32, 1], metallic: 0.48, roughness: 0.16, doubleSided: true, clearcoat: { factor: 0.92, roughness: 0.08 } },
  // 14: helmetStripe
  { name: 'helmetStripe', color: [0.88, 0.90, 0.95, 1], metallic: 0.55, roughness: 0.18, doubleSided: true, clearcoat: { factor: 0.85, roughness: 0.10 } },
  // 15: facemask
  { name: 'facemask', color: [0.22, 0.26, 0.34, 1], metallic: 0.82, roughness: 0.24 },
  // 16: visor
  { name: 'visor', color: [0.06, 0.10, 0.18, 0.72], metallic: 0.75, roughness: 0.08, doubleSided: true, alphaMode: 'BLEND', clearcoat: { factor: 1.0, roughness: 0.04 } },
  // 17: chinstrap
  { name: 'chinstrap', color: [0.94, 0.95, 0.97, 1], metallic: 0.04, roughness: 0.42, doubleSided: true },
];

const MAT_INDEX: Record<string, number> = Object.fromEntries(
  MATERIAL_DEFS.map((m, i) => [m.name, i])
);
const JOINT_INDEX: Record<string, number> = Object.fromEntries(
  HUMAN_JOINTS.map((j, i) => [j, i])
);

function singleBoneWeights(mb: MeshBuilder): { joints: Uint16Array; weights: Float32Array } {
  const n = mb.count;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const bIdx = JOINT_INDEX[mb.bone[i]] ?? 0;
    joints[i * 4] = bIdx;
    weights[i * 4] = 1;
  }
  return { joints, weights };
}

function mbToBodyMesh(mb: MeshBuilder): BodyMesh {
  return {
    positions: new Float32Array(mb.pos),
    normals: new Float32Array(mb.nor),
    indices: new Uint32Array(mb.idx),
  };
}

async function buildArchetype(id: FootballArchetypeId): Promise<void> {
  const t0 = Date.now();
  const spec = FOOTBALL_ARCHETYPES[id];
  console.log(`\n[Forge Football] Building archetype: ${id} (${spec.label})...`);

  // 1. Plajah Character Forge Human Anatomy (66-joint contract skeleton + 30+ muscles)
  const anatomy = buildHumanAnatomy(spec.tune);
  const field = bodyField(anatomy);

  // 2. Surface Nets Anatomical Skin Mesh (fast game-ready LOD for 22 simultaneous players @ 60fps)
  const voxel = 0.011;
  const maxY = spec.tune.height + 0.08;
  const raw = meshField(field, [-0.88, -0.02, -0.34], [0.88, maxY, 0.34], voxel);
  relaxMesh(raw, 2, 0.5);
  settleOnField(raw, field, 2);

  const { MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptSimplifier.ready;
  const targetIndices = 4600 * 3;
  const [simpleIdx] = MeshoptSimplifier.simplify(
    raw.indices,
    raw.positions,
    3,
    Math.min(raw.indices.length, targetIndices),
    0.008
  );
  const body = compact({ positions: raw.positions, normals: raw.normals, indices: simpleIdx }).mesh;
  settleOnField(body, field, 1);

  // Generate clean cylindrical UVs on body skin
  const bodyVertCount = body.positions.length / 3;
  const bodyUvs = new Float32Array(bodyVertCount * 2);
  for (let i = 0; i < bodyVertCount; i++) {
    const x = body.positions[i * 3];
    const y = body.positions[i * 3 + 1];
    const z = body.positions[i * 3 + 2];
    bodyUvs[i * 2] = 0.5 + Math.atan2(x, z) / (Math.PI * 2);
    bodyUvs[i * 2 + 1] = Math.max(0, Math.min(1, y / spec.tune.height));
  }

  const bodySkin = humanSkinWeights(body, anatomy, field);
  console.log(
    `  body mesh: ${bodyVertCount} verts, ${body.indices.length / 3} tris (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  );

  // 3. Pro Football Wardrobe & Composite Helmet fitted directly to the anatomical field
  const wardrobe = buildFootballWardrobe(anatomy, field, spec);

  const skinned: ForgeSkinned[] = [
    {
      name: `FL_${id}_body`,
      prims: [
        {
          positions: body.positions,
          normals: body.normals,
          uvs: bodyUvs,
          joints: bodySkin.skinIndex,
          weights: bodySkin.skinWeight,
          indices: body.indices,
          material: MAT_INDEX.skin,
        },
      ],
    },
  ];

  // Skin each wardrobe garment mesh smoothly to the contract skeleton
  const rigidWeightedMats = new Set(['belt', 'towel']);
  let gearTris = 0;
  for (const [matName, mb] of Object.entries(wardrobe.skinned)) {
    if (mb.count === 0 || mb.idx.length === 0) continue;
    const matIdx = MAT_INDEX[matName];
    if (matIdx === undefined) continue;

    const bm = mbToBodyMesh(mb);
    const weights = rigidWeightedMats.has(matName)
      ? singleBoneWeights(mb)
      : (() => {
          const sw = humanSkinWeights(bm, anatomy, field);
          return { joints: sw.skinIndex, weights: sw.skinWeight };
        })();

    gearTris += bm.indices.length / 3;
    skinned.push({
      name: `FL_${id}_${matName}`,
      prims: [
        {
          positions: bm.positions,
          normals: bm.normals,
          uvs: new Float32Array(mb.uv),
          joints: weights.joints,
          weights: weights.weights,
          indices: bm.indices,
          material: matIdx,
        },
      ],
    });
  }

  // 4. Rigid Head-mounted Pro Helmet (parented directly to Head bone)
  const helmetPrims: GPrim[] = [];
  for (const [matName, mb] of Object.entries(wardrobe.helmet)) {
    if (mb.count === 0 || mb.idx.length === 0) continue;
    const matIdx = MAT_INDEX[matName];
    if (matIdx === undefined) continue;
    gearTris += mb.idx.length / 3;
    helmetPrims.push({
      positions: new Float32Array(mb.pos),
      normals: new Float32Array(mb.nor),
      uvs: new Float32Array(mb.uv),
      indices: new Uint32Array(mb.idx),
      material: matIdx,
    });
  }

  const rigid: ForgeRigid[] = [
    {
      name: `FL_${id}_helmet`,
      bone: 'Head',
      prims: helmetPrims,
    },
  ];

  // 5. Contract Skeleton Bones & Hand Sockets
  const bones: ForgeBone[] = anatomy.bones.map((b) => ({
    name: b.name,
    parent: PARENT[b.name],
    at: b.at,
  }));

  const sockets: ForgeSocket[] = wardrobe.sockets.map((so) => ({
    name: so.name,
    bone: so.bone,
    at: so.at,
    rotation: so.rotation,
    meshes: [],
  }));

  const twists = Object.entries(TWIST_JOINTS).map(([bone, cfg]) => ({
    bone,
    driver: cfg.driver,
    share: cfg.share,
  }));

  // 6. Export Rigged GLB via Plajah Character Forge exporter
  const glb = forgeToGlb({
    name: `Firstlight_${id}`,
    bones,
    sockets,
    skinned,
    rigid,
    materials: MATERIAL_DEFS,
    images: [],
    extras: {
      forge: {
        version: 1,
        archetype: id,
        height: spec.tune.height,
        skeletonContract: 'plajah.biped.v1',
        joints: HUMAN_JOINTS.length,
        twists,
        springs: [],
        capsules: anatomy.capsules,
        drivers: [],
        grips: {},
        hold: {},
      },
    },
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${id}.glb`);
  fs.writeFileSync(outPath, glb);
  console.log(
    `  ✓ Exported ${outPath} (${(glb.byteLength / 1024).toFixed(1)} KB, ${gearTris} gear tris, ${bones.length} contract joints) in ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
}

async function main() {
  const only = process.argv[2] as FootballArchetypeId | undefined;
  const targets: FootballArchetypeId[] =
    only && only in FOOTBALL_ARCHETYPES
      ? [only]
      : ['qb', 'skill', 'power', 'lineman'];

  for (const id of targets) {
    await buildArchetype(id);
  }
  console.log('\n[Forge Football] All rigged GLBs complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
