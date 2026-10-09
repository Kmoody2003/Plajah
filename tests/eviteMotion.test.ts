// Evite motion recipes — every production plate gets a sane recipe; reduced motion is a true opacity twin.
// Run: npx tsx --test tests/eviteMotion.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../docs/evites/production/manifest.json';
import { recipeFor, reducedRecipe, revealCurves, springStep, foilFor, COLLECTION_MOTION } from '../services/evite/motionRecipes';

const plates = (manifest as any).grids.flatMap((g: any) => g.subjects.map((s: string) => [g.collection, s] as [string, string]));

describe('recipes', () => {
  test('every production plate has a recipe inside the Motion Council limits', () => {
    assert.ok(plates.length >= 272);
    for (const [c, s] of plates) {
      const r = recipeFor(c, s);
      assert.ok(r.revealMs <= 2200, `${c}/${s} reveal too long`);
      assert.ok(!r.emitter || r.emitter.count <= 24, `${c}/${s} too many particles`);
      assert.ok(r.parallax >= 0 && r.parallax <= 24, `${c}/${s} parallax`);
      assert.match(r.foil.color, /^#[0-9A-Fa-f]{6}$/);
    }
  });
  test('every production collection has defaults', () => {
    for (const c of new Set(plates.map(([c]: [string, string]) => c))) assert.ok(COLLECTION_MOTION[c as string], `missing collection motion for ${c}`);
  });
  test('subject overrides land (water, fire, snow) and alternates inherit them', () => {
    assert.ok(recipeFor('kids_boy', 'shark').caustics > 0.4);
    assert.equal(recipeFor('kids_boy', 'shark').emitter?.kind, 'bubbles');
    assert.ok(recipeFor('holidays', 'diwali').flicker >= 0.8);
    assert.equal(recipeFor('holidays', 'christmas').emitter?.kind, 'snow');
    assert.equal(recipeFor('kids_girl', 'mermaid-alt').caustics, 0.5);
    assert.equal(recipeFor('military', 'veterans-day').emitter, undefined);
  });
  test('formal collections are calmer than kids', () => {
    assert.ok(recipeFor('wedding', 'olive').parallax < recipeFor('kids_boy', 'dino').parallax);
    assert.deepEqual(recipeFor('kids_boy', 'dino').spring, [320, 28]);
  });
  test('one foil colour per theme, stable', () => {
    assert.equal(foilFor('wedding', 'olive'), foilFor('wedding', 'olive'));
    assert.equal(recipeFor('wedding', 'sapphire').foil.color, '#E8ECF8');
    const colours = new Set(plates.filter(([c]: [string, string]) => c === 'kids_boy').map(([c, s]: [string, string]) => recipeFor(c, s).foil.color));
    assert.ok(colours.size > 1, 'themes in a collection should not all share one foil');
  });
});

describe('reduced motion', () => {
  test('no displacement, no particles, same timing', () => {
    const r = recipeFor('kids_kaiju', 'disco'), z = reducedRecipe(r);
    assert.equal(z.parallax, 0); assert.equal(z.popIn, 0); assert.equal(z.emitter, undefined); assert.equal(z.sweep.strength, 0);
    assert.equal(z.revealMs, r.revealMs);
  });
});

describe('timing', () => {
  test('reveal curves are ordered and complete', () => {
    const early = revealCurves(200, 1870), mid = revealCurves(1000, 1870), end = revealCurves(1870, 1870);
    assert.ok(early.exposure > 0 && early.headline === 0);
    assert.ok(mid.headline > 0.5 && mid.cta === 0);
    assert.equal(end.done, true); assert.equal(end.cta, 1); assert.equal(end.headline, 1);
  });
  test('kids spring settles in under a second without exploding', () => {
    let x = 0, v = 0; for (let i = 0; i < 60; i++) [x, v] = springStep(x, v, 1, 1 / 60, [320, 28]);
    assert.ok(Math.abs(x - 1) < 0.02, `settled at ${x}`);
    let y = 0, w = 0; [y, w] = springStep(y, w, 1, 0.5, [320, 28]);   // a long frame must stay stable
    assert.ok(Number.isFinite(y) && Math.abs(y) < 2);
  });
});
