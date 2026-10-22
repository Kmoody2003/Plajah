import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MERCH_PRODUCT_TEMPLATES, TEE_OUTLINE, TOTE_OUTLINE, buildProductModel, getProductTemplate,
  nearestOnPolygon, pillowDepth, pointInPolygon,
} from '../services/merchStudio/products';
import { MERCH_SCENES, getMerchScene, merchShotPrompt } from '../services/merchStudio/scenes';

const square: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

describe('Merch Designer — outline geometry', () => {
  it('tests points against a polygon', () => {
    assert.equal(pointInPolygon([0.5, 0.5], square), true);
    assert.equal(pointInPolygon([1.5, 0.5], square), false);
    assert.equal(pointInPolygon([0, 0.9], TEE_OUTLINE), true, 'tee body is inside its outline');
    assert.equal(pointInPolygon([0, 1.12], TEE_OUTLINE), false, 'the neck scoop is cut out');
    assert.equal(pointInPolygon([0.65, 0.75], TEE_OUTLINE), true, 'sleeves are part of the tee');
  });

  it('finds the nearest outline point', () => {
    const { point, dist } = nearestOnPolygon([0.5, 0.2], square);
    assert.deepEqual(point, [0.5, 0]);
    assert.ok(Math.abs(dist - 0.2) < 1e-9);
  });

  it('pillows fabric from 0 at the seam up to full depth inside', () => {
    assert.equal(pillowDepth([2, 2], square, 0.1, 0.2), 0, 'outside is flat');
    assert.ok(pillowDepth([0.001, 0.5], square, 0.1, 0.2) < 0.02, 'near the seam is shallow');
    assert.ok(Math.abs(pillowDepth([0.5, 0.5], square, 0.1, 0.2) - 0.1) < 1e-9, 'interior reaches full depth');
    assert.ok(pillowDepth([0, 0.5], TOTE_OUTLINE, 0.035, 0.12) > 0.03);
  });
});

describe('Merch Designer — product templates', () => {
  it('ships six templates with print areas and a valid default colour', () => {
    assert.equal(MERCH_PRODUCT_TEMPLATES.length, 6);
    for (const t of MERCH_PRODUCT_TEMPLATES) {
      assert.ok(t.printAreas.length > 0, t.id);
      assert.ok(t.colors.includes(t.defaultColor), `${t.id} default colour is in its palette`);
      for (const a of t.printAreas) assert.ok(a.aspect > 0 && a.printInches[0] > 0 && a.printInches[1] > 0);
    }
    assert.equal(getProductTemplate('nope').id, 'tee', 'unknown ids fall back to the tee');
  });

  it('builds every product with a print mesh per print area, sitting on the floor', async () => {
    const THREE = await import('three');
    for (const t of MERCH_PRODUCT_TEMPLATES) {
      const built = buildProductModel(t.id, t.defaultColor);
      for (const a of t.printAreas) assert.ok(built.printMeshes[a.id], `${t.id} has a ${a.id} print mesh`);
      assert.ok(built.colorMaterials.length > 0, `${t.id} takes the product colour`);
      built.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.root);
      assert.ok(box.min.y > -0.06 && box.min.y < 0.06, `${t.id} rests at y≈0 (min ${box.min.y.toFixed(3)})`);
      assert.ok(box.max.y > 0.5 && box.max.y < 1.7, `${t.id} is about a unit tall (max ${box.max.y.toFixed(3)})`);
    }
  });
});

describe('Merch Designer — photo sets', () => {
  it('seeds six distinct sets with a key light and a generation prompt', () => {
    assert.equal(MERCH_SCENES.length, 6);
    assert.equal(new Set(MERCH_SCENES.map((s) => s.id)).size, 6);
    for (const s of MERCH_SCENES) {
      assert.ok(s.lights.some((l) => l.role === 'key'), `${s.id} has a key light`);
      assert.ok(s.lights.some((l) => l.castShadow), `${s.id} casts a shadow`);
      assert.ok(s.genStrength >= 0.5 && s.genStrength <= 1, `${s.id} strength is within the runtime's range`);
      assert.ok(s.prompt.style.length > 40);
    }
    for (const id of ['beauty-blush', 'slate-gentleman', 'fitness-power', 'tech-noir']) assert.equal(getMerchScene(id).id, id);
  });

  it('builds a shot prompt from the product noun, the set and the user\'s extra words', () => {
    const p = merchShotPrompt(getMerchScene('tech-noir'), 'a ceramic mug', '  rain on glass ');
    assert.ok(p.startsWith('a ceramic mug'));
    assert.ok(p.includes('reflective floor'));
    assert.ok(p.endsWith('rain on glass'));
  });
});
