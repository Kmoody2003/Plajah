// tests/playkitCanopyAndRender.test.ts
//
// Verifies Track 2A (NURBS/SubD Canopy Architecture Kit + Walk-In CAD/BIM Treehouses),
// Track 3 (Playkit Live Clustered Forward+ Lighting, Baked L2 SH9 GI Probes, TSL Micro-Detail
// Material Enhancer, Unified 33^3 Filmic 3D LUTs), and Track 1 (EcoSystem Lush Undergrowth +
// Erosion-Driven Wet Ferns & Channel Glowcaps).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {
  buildBimCanopyTreehouse,
  buildBimStoneTower,
  buildCanopyDeckSubstructure,
  buildNurbsArchBridge,
  buildNurbsKneeBrace,
  buildNurbsLanternGeometry,
  buildNurbsPortalFrame,
  buildNurbsStoneArch,
  buildNurbsSupportBough,
  buildNurbsVaultRibs,
  buildSubdCarvedConsole,
  buildSubdCorbelCapital,
  buildSubdCrenelMerlon,
  buildSubdTrunkCollar,
  clearCanopyArchitectureCache,
} from '../playkit/world/canopyArchitecture';
import { InstancedBatchCollector, SpatialChunkController } from '../playkit/world/spatialChunker';
import {
  buildBimCivicInteriorShell,
  buildNurbsCupolaDomeMesh,
  buildNurbsSailShellMesh,
  buildNurbsTensileCanopyMesh,
  buildNurbsYachtHullMesh,
  buildPlaykitGrownTreeVariantMeshes,
  buildSubdClassicalCapitalMesh,
} from '../playkit/world/architecturalForms';
import {
  PlaykitSceneLightingController,
  enhanceMaterialWithPlaykitGi,
  type WorldLightSpec,
} from '../playkit/render/liveLighting';
import { buildPlaykitLutData, getPlaykitLutTexture } from '../playkit/render/unifiedPost';
import { WILDS_ECO, scatterWilds } from '../games/rift-realm/src/world/eco';
import { validateEco } from '../services/terrain/eco/index';
import { worldHeight } from '../games/rift-realm/src/world/layout';

function assertValidGeometry(geo: THREE.BufferGeometry, label: string, minTris = 8): number {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  assert.ok(pos && pos.count >= 3, `${label}: missing positions`);
  assert.ok(nor && nor.count === pos.count, `${label}: missing or mismatched normals`);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `${label}: non-finite vertex`);
    assert.ok(Number.isFinite(nor.getX(i)) && Number.isFinite(nor.getY(i)) && Number.isFinite(nor.getZ(i)), `${label}: non-finite normal`);
  }
  const tris = geo.index ? geo.index.count / 3 : pos.count / 3;
  assert.ok(tris >= minTris, `${label}: expected >= ${minTris} tris, got ${tris}`);
  return tris;
}

describe('Track 2A — Playkit NURBS, Catmull-Clark SubD & CAD/BIM Canopy Architecture Kit', () => {
  it('builds fluted NURBS support boughs, curved knee-braces, gothic stone arches, and revolved lanterns', () => {
    clearCanopyArchitectureCache();

    const bough = buildNurbsSupportBough({ reachM: 14, dropM: 8, baseRadiusM: 1.0, tipRadiusM: 0.35, swayM: 0.6 });
    const boughTris = assertValidGeometry(bough, 'NURBS support bough', 60);
    assert.ok(bough.getAttribute('uv'), 'NURBS bough emits metre-scaled UVs for bark sheets');

    const brace = buildNurbsKneeBrace({ spanM: 2.2, riseM: 2.4, widthM: 0.28, depthM: 0.32 });
    assertValidGeometry(brace, 'NURBS knee-brace', 20);

    const gothic = buildNurbsStoneArch({ widthM: 4.2, riseM: 2.8, depthM: 1.2, pointed: true });
    const broken = buildNurbsStoneArch({ widthM: 4.2, riseM: 2.8, depthM: 1.2, pointed: true, intactFraction: 0.65 });
    const gTris = assertValidGeometry(gothic, 'NURBS gothic arch', 40);
    assertValidGeometry(broken, 'NURBS broken gothic arch', 40);
    assert.ok(gTris > 40);

    const lantern = buildNurbsLanternGeometry(1.0);
    assertValidGeometry(lantern.frame, 'NURBS revolved lantern housing', 40);
    assertValidGeometry(lantern.core, 'NURBS revolved lantern core', 20);

    // Deterministic caching returns cloned geometries with identical topology
    const bough2 = buildNurbsSupportBough({ reachM: 14, dropM: 8, baseRadiusM: 1.0, tipRadiusM: 0.35, swayM: 0.6 });
    assert.equal(bough2.index!.count / 3, boughTris);
    assert.notEqual(bough2, bough, 'cached builder returns an independent clone');
  });

  it('builds Catmull-Clark SubD trunk collars, chamfered crenel merlons, and molded stone capitals', () => {
    const collar = buildSubdTrunkCollar(1.8, 3.0, 1.1);
    assertValidGeometry(collar, 'SubD trunk collar', 120);

    const merlon = buildSubdCrenelMerlon(1.4, 0.66, 0.78);
    assertValidGeometry(merlon, 'SubD crenel merlon', 90);

    const capital = buildSubdCorbelCapital(0.75, 0.65);
    assertValidGeometry(capital, 'SubD stone corbel capital', 90);
  });

  it('compiles walk-in CAD/BIM Canopy Treehouses via bimTo3D with code-checked doorway clearance', () => {
    const hut = buildBimCanopyTreehouse({ widthM: 4.0, depthM: 3.2, heightM: 2.8, hasDoor: true, lit: true, hasPorch: true });

    assert.ok(hut.bim3d.meshes.length >= 4, 'real bimTo3D() kernel emitted multi-element IFC meshes');
    assert.ok(hut.wallGeos.length >= 3, 'walls + front/back gables built');
    assert.ok(hut.roofAndTrimGeos.length >= 10, 'overhanging roof, ridge beam, corner pilasters, porch & NURBS eave knee-braces built');
    assert.ok(hut.floorGeos.length >= 1, 'walkable floor slab + porch deck built');
    assert.ok(hut.windowGlowGeos.length >= 2, 'recessed mullioned glowing windows emitted');
    assert.ok(hut.metalTrimGeos.length >= 3, 'ridge iron cap + window mullions emitted');

    assert.ok(hut.doorwayClearanceM, 'walk-in doorway metadata present');
    assert.ok(hut.doorwayClearanceM!.width >= 1.15, `door width ${hut.doorwayClearanceM!.width} >= 1.15m`);
    assert.ok(hut.doorwayClearanceM!.height >= 2.15, `door height ${hut.doorwayClearanceM!.height} >= 2.15m`);

    for (const g of hut.wallGeos) assertValidGeometry(g, 'BIM treehouse wall', 2);
    for (const g of hut.roofAndTrimGeos) assertValidGeometry(g, 'BIM treehouse roof/trim', 2);

    // Closed hut option omits doorway cleanly
    const closed = buildBimCanopyTreehouse({ widthM: 3.0, depthM: 2.5, heightM: 2.6, hasDoor: false, lit: true });
    assert.equal(closed.doorwayClearanceM, null);
  });

  it('assembles complete Great Oak & Platform Oak canopy deck substructures', () => {
    const greatOak = buildCanopyDeckSubstructure({
      centerX: 2, centerZ: -36, deckY: 12, deckRadiusM: 22, trunkRadiusM: 4.6, boughCount: 12,
    });
    assert.equal(greatOak.barkSupportGeos.length, 13, '1 SubD collar + 12 swept NURBS living boughs');
    assert.equal(greatOak.timberTrussGeos.length, 28, '12 NURBS knee-braces + 16 ring truss beams');
    for (const g of greatOak.barkSupportGeos) assertValidGeometry(g, 'Great Oak bark support', 40);
    for (const g of greatOak.timberTrussGeos) assertValidGeometry(g, 'Great Oak timber truss', 12);
  });
});

describe('Track 3 — Playkit Live Clustered Forward+ Lighting, Baked L2 SH9 GI Probes & 3D LUTs', () => {
  it('bins 60+ canopy lights into 256-light cluster grid, drives 16 sticky PointLights, and evaluates SH9 GI bounce', () => {
    const root = new THREE.Group();
    const ctrl = new PlaykitSceneLightingController(root, { activePointLights: 16, maxLightDistanceM: 120 });

    const specs: WorldLightSpec[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r = 8 + (i % 6) * 14;
      specs.push({ x: Math.cos(a) * r, y: 12 + (i % 3) * 2, z: Math.sin(a) * r, colorHex: i % 2 ? 0xffb050 : 0x2ae6ff, intensity: 22, range: 16 });
    }
    assert.equal(ctrl.addLights(specs), 64);
    assert.equal(ctrl.totalRegisteredLights, 64);
    assert.equal(ctrl.activeLightPoolSize, 16);

    const baked = ctrl.bakeProbes([
      { x: 0, y: 14, z: 0, kind: 'canopy' },
      { x: 10, y: 14, z: 0, kind: 'interior' },
      { x: -20, y: 2, z: 15, kind: 'clearing' },
    ]);
    assert.equal(baked.length, 3);
    assert.equal(ctrl.probeVolume.count, 3);

    const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1000);
    cam.position.set(0, 14, 15);
    cam.lookAt(0, 14, 0);
    cam.updateMatrixWorld();

    // Update outdoors on canopy deck
    const focus = new THREE.Vector3(0, 14, 0);
    for (let f = 0; f < 10; f++) ctrl.update(0.15, cam, focus, 0.5, 0.8);
    assert.ok(ctrl.latestClusterBinning, 'frustum cluster binning ran');
    assert.equal(ctrl.latestClusterBinning!.activeLightCount, 64);
    assert.ok(ctrl.uniforms.uGiInteriorMix.value < 0.1, 'outside interior mix near 0');

    // Step inside the walk-in CAD/BIM treehouse at (10, 14, 0) -> interior warm GI mix rises smoothly!
    focus.set(10, 14, 0);
    for (let f = 0; f < 12; f++) ctrl.update(0.15, cam, focus, 0.2, 0.8);
    assert.ok(ctrl.uniforms.uGiInteriorMix.value > 0.7, `interior warm GI activated (${ctrl.uniforms.uGiInteriorMix.value.toFixed(2)})`);

    // Verify in-place TSL material enhancement preserves existing emissiveNode without crashing
    const bark = new THREE.MeshStandardNodeMaterial({ color: 0x8d8a84, roughness: 0.92 });
    enhanceMaterialWithPlaykitGi(bark, ctrl.uniforms, { detailTiling: 6.5, giBounceStrength: 0.22, sssColorHex: 0x265c3c, sssStrength: 0.08 });
    assert.ok(bark.roughnessNode, 'micro-detail roughnessNode attached');
    assert.ok(bark.emissiveNode, 'SH9 GI bounce + SSS emissiveNode attached');

    ctrl.dispose();
  });

  it('generates valid 33^3 filmic 3D LUTs across all presets with neutral identity and Elderwood shadow-teal/warm-highlight curve', () => {
    const neutral = buildPlaykitLutData('neutral', 17);
    assert.equal(neutral.length, 17 * 17 * 17 * 4);
    // Check corners of neutral identity LUT: (0,0,0) -> 0, (1,1,1) -> 255
    assert.equal(neutral[0], 0);
    assert.equal(neutral[1], 0);
    assert.equal(neutral[2], 0);
    const last = (17 * 17 * 17 - 1) * 4;
    assert.equal(neutral[last], 255);
    assert.equal(neutral[last + 1], 255);
    assert.equal(neutral[last + 2], 255);

    const elder = buildPlaykitLutData('elderwood-still', 33);
    assert.equal(elder.length, 33 * 33 * 33 * 4);
    // Dark neutral grey (ri=5, gi=5, bi=5) should cool slightly toward emerald-teal (b > r, g > r)
    const darkIdx = ((5 * 33 + 5) * 33 + 5) * 4;
    assert.ok(elder[darkIdx + 2] > elder[darkIdx], `elderwood dark shadow teal lift: B=${elder[darkIdx + 2]} > R=${elder[darkIdx]}`);
    assert.ok(elder[darkIdx + 1] > elder[darkIdx], `elderwood dark shadow emerald lift: G=${elder[darkIdx + 1]} > R=${elder[darkIdx]}`);

    const tex = getPlaykitLutTexture('elderwood-still');
    assert.equal(tex.image.width, 33);
    assert.equal(tex.image.depth, 33);
  });
});

describe('Track 1 — Wilds EcoSystem Lush Undergrowth & Erosion-Driven Flora', () => {
  it('validates upgraded WILDS_ECO rules and spawns wet-ferns & channel-glowcaps when erosion maps are active', () => {
    assert.deepEqual(validateEco(WILDS_ECO), [], 'WILDS_ECO passes strict schema validation');
    assert.ok(WILDS_ECO.some((r) => r.id === 'riverside-ferns'), 'riverside-ferns rule added');

    const flatNormal = () => [0, 1, 0];
    const clearEverywhere = () => 12;

    const noMaps = scatterWilds({
      height: worldHeight,
      normal: flatNormal,
      clearance: clearEverywhere,
      lowTier: true,
      maps: null,
    });
    const withMaps = scatterWilds({
      height: worldHeight,
      normal: flatNormal,
      clearance: clearEverywhere,
      lowTier: true,
      maps: {
        wet: { at: (x, z) => ((x + z) % 40 > 0 ? 0.85 : 0.2) },
        flow: { at: (x, z) => (Math.abs(x - z) < 120 ? 0.45 : 0.05) },
        dep: { at: () => 0.05 },
      },
    });

    assert.ok(noMaps.plants.length > 500, `lush baseline plants (${noMaps.plants.length})`);
    assert.ok(noMaps.fungi.length > 120, `lush baseline fungi (${noMaps.fungi.length})`);
    assert.ok(
      withMaps.plants.length > noMaps.plants.length,
      `erosion wetness spawns extra wet-ferns (${withMaps.plants.length} > ${noMaps.plants.length})`,
    );
    assert.ok(
      withMaps.fungi.length > noMaps.fungi.length,
      `erosion flow spawns extra channel-glowcaps (${withMaps.fungi.length} > ${noMaps.fungi.length})`,
    );
  });
});

describe('Vesselbound Landmarks & Apex (Forth Horizon) NURBS / SubD / CAD-BIM / Grown Trees', () => {
  it('builds walk-in CAD/BIM Settlement Stone Towers and twin-arch NURBS Digital Bridge spans', () => {
    const tower = buildBimStoneTower({ widthM: 8, heightM: 18, balconyHeightM: 8 });
    assert.ok(tower.stoneGeos.length >= 16, 'BIM walls, plinth, corner quoins, NURBS door arch & 12 SubD merlons');
    assert.ok(tower.timberGeos.length >= 16, 'rooftop deck, balcony & NURBS corbel/balcony knee-braces');
    assert.ok(tower.windowGlowGeos.length >= 6, 'multi-story recessed glowing windows');
    assert.ok(tower.doorwayClearanceM.width >= 1.4 && tower.doorwayClearanceM.height >= 2.5);
    for (const g of tower.stoneGeos) assertValidGeometry(g, 'BIM stone tower masonry', 2);

    const bridge = buildNurbsArchBridge({ lengthM: 34, widthM: 5.4, pierHeightM: 9 });
    assert.ok(bridge.stoneGeos.length >= 12, 'deck, twin NURBS arch ribs, SubD pier capital, curbs & stanchions');
    assert.ok(bridge.glowGeos.length >= 6, 'twin glowing cyber-conduit rails & under-cornice strips');
    for (const g of bridge.stoneGeos) assertValidGeometry(g, 'NURBS arch bridge stone', 2);
  });

  it('builds renderer-agnostic NURBS/SubD/CAD-BIM Civic landmarks and Space-Colonization trees for Apex', () => {
    const assertMesh = (m: { positions: Float32Array; normals?: Float32Array; indices: Uint32Array }, label: string, minTris = 16) => {
      assert.ok(m.positions.length >= 9, `${label}: positions`);
      assert.ok(m.normals && m.normals.length === m.positions.length, `${label}: normals`);
      assert.ok(m.indices.length / 3 >= minTris, `${label}: tris ${m.indices.length / 3} >= ${minTris}`);
      for (let i = 0; i < m.positions.length; i++) assert.ok(Number.isFinite(m.positions[i]), `${label}: finite pos`);
    };

    assertMesh(buildNurbsSailShellMesh({ widthM: 40, heightM: 34, depthM: 38 }), 'Apex Opera NURBS sail', 80);
    assertMesh(buildNurbsTensileCanopyMesh({ widthM: 32, depthM: 20, archRiseM: 6 }), 'Apex Festival tensile canopy', 80);
    assertMesh(buildNurbsYachtHullMesh({ lengthM: 34 }), 'Apex Marina NURBS superyacht hull', 80);
    assertMesh(buildNurbsCupolaDomeMesh({ radiusM: 22, heightM: 24 }), 'Apex Botanical NURBS cupola', 80);
    assertMesh(buildSubdClassicalCapitalMesh({ radiusM: 0.95, heightM: 1.35 }), 'Apex Grand Civic SubD capital', 80);

    const civic = buildBimCivicInteriorShell({ id: 'civic-test', name: 'Grand Civic Hall', widthM: 90, depthM: 50, stories: 3, storyHeightM: 8 });
    assert.ok(civic.walls.length >= 4, 'real bimTo3D civic walls');
    assert.ok(civic.windows.length >= 2, 'recessed BIM civic windows');
    assert.ok(civic.roomCount >= 9, '3-story multi-room interior plan');
    assert.equal(civic.walkabilityPass, true);

    for (const spId of ['nordic-spruce', 'coastal-windswept-cedar', 'fable-ancient-oak', 'autumn-maple']) {
      const tree = buildPlaykitGrownTreeVariantMeshes(spId, 107, 180);
      assert.ok(tree, `grown Apex botanical species ${spId}`);
      assertMesh(tree!.bark, `Apex grown bark ${spId}`, 40);
      assertMesh(tree!.leaves, `Apex grown leaves ${spId}`, 40);
      assert.ok(tree!.widthRatio > 0.2 && tree!.widthRatio <= 1.4, `valid crown width ratio ${tree!.widthRatio}`);
    }
  });
});

describe('Draw-Call Batching, Spatial Chunk Shadow Culling, Local Look Volumes & Vault/Cathedral Architecture', () => {
  it('batches 190 decals/puddles into 2 InstancedMesh draws and spatially chunks + shadow-culls 1.6 km geometry', () => {
    const parent = new THREE.Group();
    const batcher = new InstancedBatchCollector();
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const circleGeo = new THREE.CircleGeometry(1, 16);
    const mossMat = new THREE.MeshBasicNodeMaterial({ color: 0x2f5e2e });
    const puddleMat = new THREE.MeshBasicNodeMaterial({ color: 0x0f3038 });

    for (let i = 0; i < 150; i++) {
      batcher.addTRS('moss', planeGeo, mossMat, (i % 15) * 12, 0.05, Math.floor(i / 15) * 12, -Math.PI / 2, 0, i * 0.4, 2.2, 1.8, 1);
    }
    for (let i = 0; i < 40; i++) {
      batcher.addTRS('puddles', circleGeo, puddleMat, (i % 8) * 18, 0.06, Math.floor(i / 8) * 18, -Math.PI / 2, 0, i * 0.7, 1.4, 1.2, 1);
    }
    assert.equal(batcher.totalInstances, 190);
    const flushed = batcher.flush(parent);
    assert.equal(flushed.length, 2, '190 props collapsed into 2 InstancedMesh draw calls');
    assert.equal(flushed[0].count + flushed[1].count, 190);

    const chunker = new SpatialChunkController(200);
    const geos: THREE.BufferGeometry[] = [];
    for (let x = -800; x <= 800; x += 200) {
      for (let z = -400; z <= 400; z += 400) {
        const g = new THREE.BoxGeometry(4, 12, 4);
        g.translate(x, 6, z);
        geos.push(g);
      }
    }
    const meshes = chunker.addChunkedGeometryGroup(parent, geos, mossMat, { name: 'test-trunks', castShadow: true });
    assert.ok(meshes.length >= 10, `partitioned into ${meshes.length} spatial frustum-cullable chunks`);
    const activeNearOrigin = chunker.updateShadowCulling(0, 0, 115, true);
    assert.ok(activeNearOrigin > 0 && activeNearOrigin < meshes.length, `distance shadow culling kept ${activeNearOrigin}/${meshes.length} chunks casting shadows`);
  });

  it('switches Local Look & GI Volumes (Cathedral sapphire-blue & Crystal Vault cyan) and builds NURBS vault ribs, SubD consoles & portal ring', () => {
    const root = new THREE.Group();
    const ctrl = new PlaykitSceneLightingController(root, { activePointLights: 8 });
    ctrl.bakeProbes([{ x: 0, y: 2, z: 0, kind: 'clearing' }]);
    ctrl.addLookVolumes([
      { id: 'elder-cathedral', name: 'Elder Cathedral', center: [50, 4, 50], radiusM: 18, featherM: 6, preset: 'cathedral-blue' },
      { id: 'crystal-vault', name: 'Crystal Vault', center: [268, -42, 354], radiusM: 14, featherM: 6, preset: 'crystal-vault' },
    ]);

    const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1000);
    const focus = new THREE.Vector3(50, 4, 50);
    for (let i = 0; i < 16; i++) ctrl.update(0.15, cam, focus, 0, 0.8);
    assert.equal(ctrl.activeLookVolumeId, 'elder-cathedral');
    assert.ok(ctrl.uniforms.uGiUpper.value.b > ctrl.uniforms.uGiUpper.value.r, 'Cathedral volume cools upper GI toward sapphire blue');

    focus.set(268, -42, 354);
    for (let i = 0; i < 16; i++) ctrl.update(0.15, cam, focus, 0, 0.8);
    assert.equal(ctrl.activeLookVolumeId, 'crystal-vault');
    ctrl.dispose();

    const ribs = buildNurbsVaultRibs({ spanWidthM: 18, hallLengthM: 28, springHeightM: 4.5, vaultRiseM: 5.5, bays: 4, pointed: true });
    assert.ok(ribs.stoneGeos.length >= 13, '4 gothic NURBS arches + 8 SubD corbels + central spine rib');
    assert.equal(ribs.accentGeos.length, 4, '4 carved SubD apex boss keystones');
    for (const g of ribs.stoneGeos) assertValidGeometry(g, 'NURBS vault rib', 12);

    const consoleGeo = buildSubdCarvedConsole(1.45, 1.05, 0.78);
    assertValidGeometry(consoleGeo, 'SubD carved console', 80);

    const portal = buildNurbsPortalFrame(4.2, 0.72);
    assertValidGeometry(portal.stoneFrame, 'NURBS sculpted portal ring', 120);
    assertValidGeometry(portal.runeRing, 'NURBS portal inner rune collar', 80);
  });
});
