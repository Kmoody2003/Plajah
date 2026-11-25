import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ClusteredLightManager,
  WGSL_CLUSTER_CULL_SHADER,
  IrradianceProbeVolume,
  parallaxCorrectReflection,
  selectReflectionBox,
  computeDetailNormalWeight,
  evaluateSubsurfaceScatter,
  evaluateKajiyaKayHair,
  DecalPool,
  FROXEL_TIER_CONFIGS,
  evaluateFogTransmittance,
  WGSL_FROXEL_ACCUMULATE,
  buildFrustumPlanes,
  cullAndSelectLod,
  WGSL_GPU_FRUSTUM_CULL,
  buildRenderPipelinePlan,
  STAGE_VISUAL_PRESETS,
  ariaResultToThreeGroup,
  createPlaykitTslMaterial,
  ADVANCED_PBR_PRESETS,
  APEX_SUPERCAR_VEHICLE_CONFIG,
  LEGACY_VERTICAL_PROFILES,
  CYBER_FOREST_TREES,
} from '../playkit/index';
import { bakeIrradianceProbes } from '../services/gamestudio/compiler/lightBaker';
import { AriaStudioAgent, classifyProductionBrief } from '../services/gamestudio/ariaAgent';
import { applyOp } from '../services/gamestudio/ops';
import { newProjectFor } from '../services/gamestudio/runtime';

describe('Phase 4 — Next-Gen Real-Time WebGPU Render Systems', () => {
  it('bins up to 256 dynamic lights in Clustered Forward+ and exposes WGSL compute shader', () => {
    const mgr = new ClusteredLightManager({ maxTotalLights: 256 });
    for (let i = 0; i < 64; i++) {
      mgr.upsert({
        id: `torch_${i}`, kind: 'point',
        position: [(i % 8 - 4) * 3, 2, -10 - Math.floor(i / 8) * 4],
        color: [1, 0.7, 0.3], intensity: 5, range: 8,
      });
    }
    const res = mgr.binForCamera([0, 2, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0]);
    assert.equal(res.activeLightCount, 64);
    assert.equal(res.gpuLightBuffer.length, 64 * 8);
    let totalAssigned = 0;
    for (let i = 0; i < res.clusterCounts.length; i++) totalAssigned += res.clusterCounts[i];
    assert.ok(totalAssigned > 0);
    assert.ok(WGSL_CLUSTER_CULL_SHADER.includes('fn cullLights'));
  });

  it('samples SH9 Irradiance Probe Volumes and Parallax-Corrected Room Reflection Boxes', () => {
    const floor = {
      positions: new Float32Array([-8, 0, -8, 8, 0, -8, 8, 0, 8, -8, 0, 8]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    };
    const baked = bakeIrradianceProbes({
      sceneMesh: floor,
      probePositions: [
        { id: 'p1', position: [-3, 1.5, 0] },
        { id: 'p2', position: [3, 1.5, 0] },
      ],
      lights: [{ kind: 'point', vec: [3, 3, 0], color: [1, 0.6, 0.2], intensity: 12, range: 20 }],
      raysPerProbe: 24,
    });
    const vol = new IrradianceProbeVolume(baked.probes);
    const irr = vol.sampleIrradiance([2, 1.5, 0], [0, 1, 0]);
    assert.ok(irr[0] > 0);

    const box = { id: 'room1', center: [5, 2, 5] as [number, number, number], boxMin: [0, 0, 0] as [number, number, number], boxMax: [10, 4, 10] as [number, number, number], blendDistanceM: 1 };
    const sel = selectReflectionBox([2, 2, 5], [box]);
    assert.ok(sel && sel.weight === 1);
    const corr = parallaxCorrectReflection([2, 2, 5], [1, 0, 0], box);
    assert.ok(Math.abs(Math.hypot(corr[0], corr[1], corr[2]) - 1) < 1e-5);
  });

  it('evaluates micro-detail normal falloff, Skin/Foliage SSS, Anisotropic Hair, Decals, Froxel Fog & GPU Culling', () => {
    assert.equal(computeDetailNormalWeight(1.0, 3.5, 18), 1);
    assert.equal(computeDetailNormalWeight(20.0, 3.5, 18), 0);
    assert.ok(computeDetailNormalWeight(10.0, 3.5, 18) > 0.2);

    const sss = evaluateSubsurfaceScatter({
      normal: [0, 0, 1], lightDir: [0, 0, -1], viewDir: [0, 0, 1],
      thickness: 0.2, wrapFactor: 0.5, translucencyPower: 2.5, scatterColor: [1, 0.3, 0.2],
    });
    assert.ok(sss[0] > 0.5);

    const hairSpec = evaluateKajiyaKayHair([0, 1, 0], [0, 0, 1], [0, 0, 1], -0.08, 32);
    assert.ok(hairSpec > 0.5);

    // Decal ring buffer wraps cleanly and fades expired decals
    const decals = new DecalPool(8);
    for (let i = 0; i < 12; i++) {
      decals.spawn({ kind: 'scorch', position: [i, 0, 0], normal: [0, 1, 0], maxLifeSec: 1.0 });
    }
    assert.equal(decals.activeDecals().length, 8);
    decals.update(1.1);
    assert.equal(decals.activeDecals().length, 0);

    // Froxel fog transmittance decays with distance
    const fogNear = evaluateFogTransmittance(1, 5, 0.9, FROXEL_TIER_CONFIGS.medium);
    const fogFar = evaluateFogTransmittance(1, 80, 0.9, FROXEL_TIER_CONFIGS.medium);
    assert.ok(fogFar.transmittance < fogNear.transmittance);
    assert.ok(WGSL_FROXEL_ACCUMULATE.includes('fn accumulate'));

    // GPU Frustum Culler drops behind-camera instances and picks closer vs farther LOD
    const planes = buildFrustumPlanes([0, 2, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0], Math.PI / 3, 16 / 9, 0.1, 150);
    const batch = cullAndSelectLod(
      [
        { id: 'near_tree', prefabId: 'oak', center: [0, 2, -8], radius: 3, lodCoverages: [0.22, 0.08, 0.015] },
        { id: 'far_tree', prefabId: 'oak', center: [0, 2, -65], radius: 3, lodCoverages: [0.22, 0.08, 0.015] },
        { id: 'behind_tree', prefabId: 'oak', center: [0, 2, 15], radius: 3, lodCoverages: [0.22, 0.08, 0.015] },
      ],
      [0, 2, 0],
      planes,
      Math.PI / 3,
    );
    assert.equal(batch.visibleCount, 2);
    assert.equal(batch.culledCount, 1);
    assert.deepEqual(batch.byLod[0], ['near_tree']);
    assert.ok(batch.byLod[1]?.includes('far_tree') || batch.byLod[2]?.includes('far_tree'));
    assert.ok(WGSL_GPU_FRUSTUM_CULL.includes('fn cullInstances'));

    // Render pipeline plans adapt across 3D, 2D, and Parlor dimensions
    const p3d = buildRenderPipelinePlan('high', '3d');
    const p2d = buildRenderPipelinePlan('low', '2d');
    const pParlor = buildRenderPipelinePlan('medium', 'parlor');
    assert.ok(p3d.passes.includes('clustered-forward-light-binning'));
    assert.ok(p2d.passes.includes('2d-sprite-layers'));
    assert.ok(pParlor.passes.includes('parlor-stage-2d-overlay'));
    assert.ok(STAGE_VISUAL_PRESETS['firstlight-primetime-stadium']);
    assert.ok(STAGE_VISUAL_PRESETS['parlor-broadcast-studio-3d']);
  });
});

describe('Phase 4 — Aria Studio Production Agent End-to-End Orchestration', () => {
  it('routes prompts semantically across all pipelines, passes QA gates, and emits undoable GameProject ops', () => {
    assert.equal(classifyProductionBrief({ prompt: 'Fable gothic tavern with glowing hearth' }), 'architecture');
    assert.equal(classifyProductionBrief({ prompt: 'Ancient willow tree in a cyber forest' }), 'vegetation');
    assert.equal(classifyProductionBrief({ prompt: 'Winged archangel guardian in armor' }), 'organic');
    assert.equal(classifyProductionBrief({ prompt: 'Turbo kart vehicle with gold trim' }), 'hard-surface');
    assert.equal(classifyProductionBrief({ prompt: 'Live broadcast stage for Brain Rush trivia parlor' }), 'parlor-stage');
    assert.equal(classifyProductionBrief({ prompt: '2D sprite hero for Kith Quest side-scroller' }), '2d-sprite');

    const agent = new AriaStudioAgent();
    const project = newProjectFor('rift-realm', 'Rift Realm Creator Test');
    const levelId = project.levels[0].id;

    // 1. Produce an enterable Fable cathedral building -> auto-generates rooms, IFC 3D, SH9 GI probes, and undoable Op!
    const archRes = agent.produce({
      prompt: 'Fable dark-fantasy stone cathedral shrine with walkable interior',
      name: 'Sanctum Cathedral',
      targetLevelId: levelId,
      placeAt: [10, 0, -14],
    });
    assert.equal(archRes.pipeline, 'architecture');
    assert.equal(archRes.qa.pass, true);
    assert.ok(archRes.probes.length >= 3);
    assert.ok(archRes.reflectionBoxes.length >= 3);
    assert.ok(archRes.projectOp);

    // Apply Aria's emitted batch op directly onto the real GameProject and verify clean undo!
    const applied = applyOp(project, archRes.projectOp!);
    assert.equal(applied.project.levels[0].instances.length, 1);
    assert.equal(applied.project.levels[0].instances[0].prefab, archRes.manifest.id);
    const undone = applyOp(applied.project, applied.inverse);
    assert.equal(undone.project.levels[0].instances.length, 0);

    // 2. Produce Organic Firstlight player, Vegetation tree, Hard-Surface vehicle, Parlor stage, and 2D sprite
    const orgRes = agent.produce({ prompt: 'Firstlight athletic quarterback with helmet and football' });
    const vegRes = agent.produce({ prompt: 'Nordic glacial spruce tree' });
    const vehRes = agent.produce({ prompt: 'Kith racing kart vehicle' });
    const parRes = agent.produce({ prompt: 'Parlor candlelit fable tavern broadcast stage for Impostor Night' });
    const sprRes = agent.produce({ prompt: '2D sprite runner for Kith Quest' });

    for (const r of [orgRes, vegRes, vehRes, parRes, sprRes]) {
      assert.equal(r.qa.pass, true, `QA failed for ${r.pipeline}: ${r.qa.budget.errors.join('; ')}`);
      assert.ok(agent.registry.getPrefab(r.manifest.id));
    }

    // 3. Verify live Three.js WebGPU/TSL Bridge builds real 3D geometry for BIM Interiors, Real Grown Trees & Organics
    const archGroup = ariaResultToThreeGroup(archRes, { showProbes: true, cutawayInterior: true });
    assert.ok(archGroup.children.length >= 2); // BIM building + SH9 probes/reflection boxes
    const vegGroup = ariaResultToThreeGroup(vegRes);
    assert.ok(vegGroup.children.length >= 1); // Real buildTreeGeometry(wood + leaves)
    const matHandle = createPlaykitTslMaterial(ADVANCED_PBR_PRESETS['hero-skin']);
    assert.ok(matHandle.material && matHandle.uProbeAmbient);

    // 4. Verify Era Clash 3D, Ravencrest, Plajah Motorsport Apex, and Cyber Forest vegetation preservation
    assert.equal(CYBER_FOREST_TREES.length, 4);
    assert.equal(APEX_SUPERCAR_VEHICLE_CONFIG.wheelOffsets.length, 4);
    assert.ok(LEGACY_VERTICAL_PROFILES['era-clash-3d']);
    assert.ok(LEGACY_VERTICAL_PROFILES.ravencrest);
    assert.ok(LEGACY_VERTICAL_PROFILES['apex-forth-horizon']);
  });
});
