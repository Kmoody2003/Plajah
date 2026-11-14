import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBox,
  makePlane,
  solidifyMesh,
  bevelMeshEdges,
  cleanManifold,
  computeBoxUVs,
  eulerCharacteristic,
  boundaryEdges,
} from '../services/argilla/poly/polyMesh';
import {
  heightToNormalMap,
  packORMTexture,
  auditForgeCharacter,
} from '../services/argilla/creature/productionAudit';
import type { ForgeCharacter } from '../services/argilla/creature/exportCreature';

test('polyMesh solidifyMesh turns an open quad sheet into a watertight closed solid (Euler = 2)', () => {
  const sheet = makePlane(1, 2);
  assert.ok(boundaryEdges(sheet).length > 0);
  const solid = solidifyMesh(sheet, 0.04);
  assert.equal(boundaryEdges(solid).length, 0, 'solidified sheet should have no boundary edges');
  assert.equal(eulerCharacteristic(solid), 2, 'closed manifold should have V-E+F = 2');
});

test('polyMesh bevelMeshEdges keeps closed cube manifold (Euler = 2) and adds catchlight bevels', () => {
  const box = makeBox(1);
  const beveled = bevelMeshEdges(box, 0.2);
  assert.equal(boundaryEdges(beveled).length, 0);
  assert.equal(eulerCharacteristic(beveled), 2);
  assert.equal(beveled.faces.length, 6 + 12 + 8);
});

test('polyMesh cleanManifold removes degenerate faces and computeBoxUVs matches vertex count', () => {
  const messy = {
    verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]] as [number, number, number][],
    faces: [[0, 1, 2], [0, 3, 1]], // second triangle collapses after weld
  };
  const clean = cleanManifold(messy);
  assert.equal(clean.faces.length, 1);
  const uvs = computeBoxUVs(makeBox(2), 0.5);
  assert.equal(uvs.length, 8 * 2);
});

test('productionAudit synthesizes Sobel normals, packs ORM linear maps, and validates ForgeCharacter budgets', () => {
  const w = 16, h = 16;
  const heights = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) heights[y * w + x] = Math.sin(x * 0.4) * 0.5 + 0.5;
  const nor = heightToNormalMap(heights, w, h, 2);
  assert.equal(nor.length, w * h * 4);
  assert.equal(nor[3], 255);

  const orm = packORMTexture(0.9, 0.35, 1.0, w, h);
  assert.equal(orm.length, w * h * 4);
  assert.ok(orm[0] >= 225 && orm[0] <= 235);
  assert.ok(orm[1] >= 85 && orm[1] <= 95);
  assert.equal(orm[2], 255);

  const mockChar: ForgeCharacter = {
    name: 'TestSamurai',
    bones: [{ name: 'hips', parent: null, at: [0, 0.9, 0] }],
    skinned: [{
      name: 'Body',
      prims: [{
        positions: new Float32Array([0, 0, 0, 0.2, 0, 0, 0.1, 0.3, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uv: new Float32Array([0, 0, 1, 0, 0.5, 1]),
        joints: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        indices: new Uint32Array([0, 1, 2]),
        material: 0,
      }],
    }],
    rigid: [],
    materials: [{ name: 'lacquer', color: [0.6, 0.1, 0.1, 1], metallic: 0, roughness: 0.4, clearcoat: { factor: 1, roughness: 0.12 } }],
    images: [nor, orm],
    extras: {},
  };
  const report = auditForgeCharacter(mockChar, 'xbox-series-x');
  assert.equal(report.passed, true);
  assert.equal(report.metrics.triangles, 1);
  assert.equal(report.metrics.unnormalizedSkinVertices, 0);
  assert.equal(report.metrics.pbrAdvancedMaterials, 1);
});
