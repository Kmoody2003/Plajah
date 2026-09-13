import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentToCssFilter, DEFAULT_PHOTO_ADJUSTMENTS, photoAdjustmentsToEffects } from '../services/photoEditingService.ts';
import { getEffect } from '../components/plajahPixels/engine/fx/effects.ts';

test('neutral photo recipe compiles to two identity develop passes', () => {
  const [tone, finish] = photoAdjustmentsToEffects({ ...DEFAULT_PHOTO_ADJUSTMENTS });
  assert.equal(tone.effectId, 'developtone');
  assert.equal(finish.effectId, 'developfinish');
  assert.ok(Object.values(tone.params).every(v => v === 0));
  assert.ok(Object.values(finish.params).every(v => v === 0));
});

test('every visible develop slider reaches the GPU effect with full precision', () => {
  const input = { ...DEFAULT_PHOTO_ADJUSTMENTS, exposure: 12.3, highlights: -44.2, vignette: 63.7, grain: 18.4, dehaze: 21.1 };
  const [tone, finish] = photoAdjustmentsToEffects(input);
  assert.equal(tone.params.exposure, 12.3);
  assert.equal(tone.params.highlights, -44.2);
  assert.equal(finish.params.vignette, 63.7);
  assert.equal(finish.params.grain, 18.4);
  assert.equal(finish.params.dehaze, 21.1);
});

test('develop effects are registered with eight-or-fewer WebGL parameters', () => {
  for (const id of ['developtone', 'developfinish']) {
    const effect = getEffect(id);
    assert.ok(effect, `${id} registered`);
    assert.ok(effect!.params.length <= 8, `${id} fits shader uniform contract`);
    assert.match(effect!.glsl, /vec4 fx/);
  }
});

test('develop shader sources avoid a destructive black fallback contract', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../components/plajahPixels/engine/fx/fxRenderer.ts', import.meta.url), 'utf8'));
  assert.match(source, /if \(!p\).*return input/);
  assert.doesNotMatch(source, /if \(!p\).*clearColor\(0, 0, 0/);
});

test('the always-visible photo preview responds to every tonal slider', () => {
  const neutral = adjustmentToCssFilter({ ...DEFAULT_PHOTO_ADJUSTMENTS });
  for (const key of ['exposure', 'contrast', 'saturation', 'warmth', 'tint', 'highlights', 'shadows', 'whites', 'blacks', 'clarity', 'brilliance', 'structure', 'dehaze', 'fade'] as const) {
    const changed = adjustmentToCssFilter({ ...DEFAULT_PHOTO_ADJUSTMENTS, [key]: 40 });
    assert.notEqual(changed, neutral, `${key} changes the preview filter`);
  }
});

test('photo preview uses the image itself rather than an opaque WebGL canvas', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../components/PhotoDevelopPreview.tsx', import.meta.url), 'utf8'));
  assert.match(source, /<img/);
  assert.doesNotMatch(source, /<canvas/);
  for (const adjustment of ['rotation', 'vignette', 'grain']) assert.match(source, new RegExp(adjustment));
});
