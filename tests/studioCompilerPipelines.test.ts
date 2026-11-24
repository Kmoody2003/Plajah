import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { auditMeshTopology, generateLodChain } from '../services/gamestudio/compiler/retopoLod';
import { delightAlbedo, bakeSurfaceMaps, resolveMaterialSubstitution } from '../services/gamestudio/compiler/mapBaker';
import { bakeIrradianceProbes, evaluateSH9, buildReflectionBoxesForRooms, WGSL_STUDIO_SH9_BAKER } from '../services/gamestudio/compiler/lightBaker';
import { validatePrefabBudget } from '../services/gamestudio/compiler/schema';
import { subdivideCatmullClark, polyMeshToIndexedTriMesh } from '../services/argilla/poly/subd';
import { edgeKey, type PolyMesh } from '../services/argilla/poly/polyMesh';
import { clampedUniformKnots, evaluateNurbsCurve, loftNurbsSurface, revolveNurbsSurface, tessellateNurbsSurface } from '../services/cad/nurbs';
import { compileOrganicAsset, STANDARD_PROP_CLASSES } from '../services/gamestudio/pipelines/organicPipeline';
import { compileVegetationSpecies, validateSpecies, VEGETATION_SPECIES_CATALOG } from '../services/gamestudio/pipelines/vegetationPipeline';
import { compileBuildingWithInteriors, compileHardSurfaceAssembly } from '../services/gamestudio/pipelines/architecturePipeline';

function unitCubePolyMesh(): PolyMesh {
  return {
    verts: [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ],
    faces: [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
      [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5],
    ],
  };
}

describe('Phase 2 — Studio Compiler (Retopo/LOD, Delighter, Surface Maps & Ray-Traced SH9 Light Baker)', () => {
  it('generates multi-tier LOD chains and verifies topology', () => {
    const high = polyMeshToIndexedTriMesh(subdivideCatmullClark(unitCubePolyMesh(), 2).mesh);
    const audit = auditMeshTopology(high);
    assert.equal(audit.watertight, true);
    assert.equal(audit.nonManifoldEdges, 0);

    const lods = generateLodChain(high, [1.0, 0.45, 0.18]);
    assert.equal(lods.length, 3);
    assert.ok(lods[0].descriptor.triangleCount > lods[2].descriptor.triangleCount);
    assert.ok(lods[2].descriptor.triangleCount > 0);
  });

  it('delights shaded albedo, bakes Normal + ARD/Thickness + Curvature maps, and resolves PBR library zones', () => {
    // Construct a synthetic 16x16 image with a dark left half (shadow) and bright right half (hotspot)
    const w = 16, h = 16;
    const img = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < 8 ? 50 : 210;
        img[i] = v; img[i + 1] = v; img[i + 2] = v; img[i + 3] = 255;
      }
    }
    const delighted = delightAlbedo(img, w, h, 0.8);
    // Contrast between dark shadow side and bright side should shrink significantly
    const origDiff = img[(8 * w + 14) * 4] - img[(8 * w + 2) * 4];
    const newDiff = delighted[(8 * w + 14) * 4] - delighted[(8 * w + 2) * 4];
    assert.ok(newDiff < origDiff * 0.7);

    const cubeMesh = polyMeshToIndexedTriMesh(subdivideCatmullClark(unitCubePolyMesh(), 1).mesh);
    const maps = bakeSurfaceMaps(cubeMesh, 32, 0.7);
    assert.equal(maps.normalRgba.length, 32 * 32 * 4);
    assert.equal(maps.ardThicknessRgba.length, 32 * 32 * 4);

    const zones = resolveMaterialSubstitution([
      { zoneId: 'wall', semanticMaterial: 'mossy-slate' },
      { zoneId: 'face', semanticMaterial: 'skin' },
    ]);
    assert.equal(zones[0].pbrLibraryId, 'fable_moss_slate');
    assert.equal(zones[1].subsurfaceScatter, true);
  });

  it('bakes ray-traced SH9 irradiance probes & room parallax reflection boxes', () => {
    // Simple floor quad mesh under a directional sun
    const floorMesh = {
      positions: new Float32Array([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    };
    const baked = bakeIrradianceProbes({
      sceneMesh: floorMesh,
      probePositions: [{ id: 'p_center', position: [0, 1.5, 0] }],
      lights: [{ kind: 'directional', vec: [0, 1, 0], color: [1, 0.95, 0.85], intensity: 2.0 }],
      raysPerProbe: 32,
    });
    assert.equal(baked.probes.length, 1);
    assert.ok(baked.raysCast >= 32);

    const upIrr = evaluateSH9(baked.probes[0].sh, [0, 1, 0]);
    assert.ok(upIrr[0] > 0 && upIrr[1] > 0 && upIrr[2] > 0);
    assert.ok(WGSL_STUDIO_SH9_BAKER.includes('fn bakeProbes'));

    const boxes = buildReflectionBoxesForRooms([{ id: 'hall', min: [0, 0, 0], max: [10, 4, 8] }]);
    assert.deepEqual(boxes[0].center, [5, 2, 4]);
  });
});

describe('Phase 3 — Modeler Upgrades (Catmull-Clark SubD + Creases & NURBS) & 3 Asset Pipelines', () => {
  it('subdivides PolyMesh with Catmull-Clark and keeps creased edges sharper than uncreased edges', () => {
    const cube = unitCubePolyMesh();
    const smooth = subdivideCatmullClark(cube, 2);
    // Crease every edge of the top face [2, 3, 7, 6]
    const creases = new Map<string, number>([
      [edgeKey(2, 3), 3], [edgeKey(3, 7), 3], [edgeKey(7, 6), 3], [edgeKey(6, 2), 3],
    ]);
    const creased = subdivideCatmullClark(cube, 2, creases);

    assert.equal(smooth.mesh.faces.length, 6 * 16); // 6 quads -> 96 quads at level 2
    // Corner vertex 2 stays closer to y=1 when top face edges are creased
    assert.ok(creased.mesh.verts[2][1] > smooth.mesh.verts[2][1]);
  });

  it('evaluates NURBS curves, lofts/revolves NURBS surfaces, and tessellates with UVs & normals', () => {
    const curve = {
      degree: 2,
      controlPoints: [[0, 0, 0, 1], [1, 2, 0, 1], [2, 0, 0, 1]] as Array<[number, number, number, number]>,
      knots: clampedUniformKnots(3, 2),
    };
    const start = evaluateNurbsCurve(curve, 0);
    const mid = evaluateNurbsCurve(curve, 0.5);
    const end = evaluateNurbsCurve(curve, 1);
    assert.ok(Math.abs(start[0]) < 1e-6 && Math.abs(end[0] - 2) < 1e-6);
    assert.ok(mid[1] > 0.9 && mid[1] < 1.1);

    const loft = loftNurbsSurface([
      [[0, 0, 0, 1], [1, 0.4, 0, 1], [2, 0, 0, 1]],
      [[0, 0, 2, 1], [1, 0.8, 2, 1], [2, 0, 2, 1]],
    ], 1, 2);
    const mesh = tessellateNurbsSurface(loft, { segsU: 6, segsV: 6 });
    assert.ok(mesh.indices.length >= 36);
    assert.ok(mesh.uvs && mesh.normals);

    const dome = revolveNurbsSurface([[0.05, 0, 0, 1], [1, 0.5, 0, 1.2], [0.05, 1.4, 0, 1]], 8);
    const domeMesh = tessellateNurbsSurface(dome, { segsU: 8, segsV: 6 });
    assert.ok(domeMesh.positions.length > 0);
  });

  it('runs Pipeline 1 (Organics + Prop Classes), Pipeline 2 (10-Species Vegetation), and Pipeline 3 (Architecture-with-Interiors + Hard Surface)', () => {
    // Pipeline 1: Organic + Prop Classes
    const hero = compileOrganicAsset({
      id: 'archangel_warden', name: 'Banished Archangel', archetype: 'winged',
      heightM: 2.2, build: 'athletic', skinMaterial: 'skin', garmentMaterial: 'linen',
      hairStyle: 'long-flow', defaultProps: [STANDARD_PROP_CLASSES.halo_lance],
    });
    assert.equal(hero.budgetPass, true);
    assert.equal(hero.manifest.impliedGeometryVerified, true);
    assert.ok(hero.simProfile.softTissueNodes.some((n) => n.id === 'wing_membrane'));
    assert.ok(hero.ragdollCapsules.length >= 6);

    // Pipeline 2: Vegetation 10-Species Catalog + Crown Normal Transfer
    assert.ok(Object.keys(VEGETATION_SPECIES_CATALOG).length >= 10);
    for (const entry of Object.values(VEGETATION_SPECIES_CATALOG)) {
      assert.deepEqual(validateSpecies(entry.species), [], `Species ${entry.species.id} failed validateSpecies`);
    }
    const oak = compileVegetationSpecies('fable-ancient-oak', 42);
    assert.equal(oak.budgetPass, true);
    assert.equal(oak.manifest.lods.some((l) => l.isImpostor), true);
    assert.ok(oak.lod0Mesh.normals && oak.lod0Mesh.colors);

    // Pipeline 3A: Architecture WITH walkable interiors compiled through Plajah's real bimTo3D()!
    const tavern = compileBuildingWithInteriors({
      id: 'fable_tavern', name: 'The Rift Hearth Tavern', program: 'tavern',
      style: 'fable-timber', footprintWidthM: 14, footprintDepthM: 12, stories: 2,
    });
    assert.equal(tavern.walkabilityPass, true);
    assert.equal(tavern.budgetPass, true);
    assert.equal(tavern.rooms.length, 6); // 3 rooms x 2 stories
    assert.ok(tavern.bim3d.elements.some((e) => e.cls === 'IfcWall'));
    assert.ok(tavern.bim3d.elements.some((e) => e.cls === 'IfcDoor'));
    assert.ok(tavern.bim3d.elements.some((e) => e.cls === 'IfcWindow'));
    assert.ok(tavern.bim3d.elements.some((e) => e.cls === 'IfcSlab'));
    assert.equal(tavern.reflectionBoxes.length, 6);

    // Pipeline 3B: Articulated Hard-Surface Vehicle with 4 spring wheel joints + hinged door
    const kart = compileHardSurfaceAssembly({
      id: 'kith_turbo_kart', name: 'Kith Turbo Kart', kind: 'vehicle',
      material: 'brushed-steel', accentMaterial: 'forged-gold', dimensionsM: [1.8, 1.1, 3.2],
    });
    assert.equal(kart.budgetPass, true);
    assert.equal(kart.subAssemblies.filter((s) => s.role === 'wheel').length, 4);
    assert.ok((kart.manifest.physics.joints?.length ?? 0) >= 5);

    // Negative test: flat unverified asset fails Canon validation
    const flatReject = validatePrefabBudget({ ...kart.manifest, impliedGeometryVerified: false }, 'medium');
    assert.equal(flatReject.pass, false);
  });
});
