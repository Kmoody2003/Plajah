import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateLowerThird, applyGraphicRef, lowerThirdBounds, ease, LT_W, LT_H } from '../services/fabula/lowerThirds';
import { LOWER_THIRDS } from '../services/fabula/lowerThirdRegistry';
import { lowerThirdToTelaObjects } from '../services/fabula/lowerThirdToTela';
import { FONTS } from '../services/tela/telaFonts';
import { lintPage } from '../services/tela/templateLint';
import { materialShaderSource } from '../components/plajahPixels/engine/presets/materialShaders';

describe('Lower-third motion engine', () => {
  it('eases land exactly at 1', () => {
    for (const k of ['linear', 'out', 'inOut', 'back', 'expo', 'bounce'] as const) assert.ok(Math.abs(ease(k, 1) - 1) < 1e-6, k);
    assert.equal(ease('out', 0), 0);
  });

  it('every spec rests fully inside the frame and settles after its IN', () => {
    for (const spec of LOWER_THIRDS) {
      const b = lowerThirdBounds(spec);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= LT_W && b.y + b.h <= LT_H, `${spec.name} rests off-frame: ${JSON.stringify(b)}`);
      const rest = evaluateLowerThird(spec, spec.duration / 2, spec.duration, spec.defaults);
      assert.equal(rest.animating, false, `${spec.name} still animating at mid-clip`);
      assert.equal(rest.layers.length, spec.layers.filter(l => !l.hidden).length, `${spec.name} lost layers at rest`);
    }
  });

  it('IN motion actually moves or hides layers at t=0, and OUT clears them by the end', () => {
    for (const spec of LOWER_THIRDS) {
      const start = evaluateLowerThird(spec, 0, spec.duration, spec.defaults);
      const rest = evaluateLowerThird(spec, spec.duration / 2, spec.duration, spec.defaults);
      const moved = start.layers.length < rest.layers.length || start.layers.some(l => { const r = rest.layers.find(x => x.layer.id === l.layer.id)!; return !r || l.x !== r.x || l.y !== r.y || l.opacity !== r.opacity || l.scaleX !== r.scaleX || l.scaleY !== r.scaleY || !!l.clip; });
      assert.ok(moved, `${spec.name}: nothing animates in`);
      const end = evaluateLowerThird(spec, spec.duration - .001, spec.duration, spec.defaults);
      assert.ok(end.animating || end.layers.length < rest.layers.length, `${spec.name}: no OUT`);
    }
  });

  it('is deterministic', () => {
    const s = LOWER_THIRDS[0];
    assert.deepEqual(JSON.stringify(evaluateLowerThird(s, .31, 5, s.defaults)), JSON.stringify(evaluateLowerThird(s, .31, 5, s.defaults)));
  });

  it('overrides recolour, hide and retime without touching the spec', () => {
    const s = LOWER_THIRDS[0];
    const ref = { specId: s.id, colors: { accent: '#00FF00' }, removedLayers: [s.layers[0].id], layers: { [s.layers[1].id]: { in: { type: 'fade' as const, duration: 2 } } }, title: { size: 99 } };
    const o = applyGraphicRef(s, ref);
    assert.equal(o.colors.accent, '#00FF00'); assert.equal(s.colors.accent === '#00FF00', false);
    assert.equal(o.layers.length, s.layers.length - 1);
    assert.equal(o.layers[0].in.duration, 2); assert.equal(o.title.size, 99); assert.equal(s.title.size !== 99, true);
  });

  it('every spec has valid fonts, a lesson and unique id', () => {
    const ids = new Set<string>();
    for (const spec of LOWER_THIRDS) {
      assert.ok(!ids.has(spec.id), `duplicate id ${spec.id}`); ids.add(spec.id);
      for (const role of [spec.title, spec.subtitle, spec.tag]) if (role) assert.ok((FONTS as any)[role.font], `${spec.name}: unknown font ${role.font}`);
      assert.ok(spec.lesson.principle.length > 40 && spec.lesson.history.length > 80 && spec.lesson.tryThis && spec.lesson.interestTag, `${spec.name}: lesson incomplete`);
      assert.ok(spec.layers.length >= 1 && spec.layers.length <= 24, `${spec.name}: layer count`);
    }
  });

  it('publishes shader-fusion lower thirds and full pages with resolvable GPU sources', () => {
    const fused = LOWER_THIRDS.filter(spec => spec.shaderFusion);
    assert.equal(fused.length, 8);
    assert.equal(fused.filter(spec => spec.format === 'lower-third').length, 4);
    assert.equal(fused.filter(spec => spec.format === 'full-page').length, 4);
    for (const spec of fused) {
      assert.ok(materialShaderSource(spec.shaderFusion!.shaderId), `${spec.name}: missing ${spec.shaderFusion!.shaderId}`);
      assert.ok(spec.shaderFusion!.opacity > 0 && spec.shaderFusion!.opacity <= 1, `${spec.name}: fusion opacity`);
      assert.equal(spec.shaderFusion!.params?.length, 4, `${spec.name}: shader params`);
    }
  });

  it('hands off to Tela as a lint-clean 1920×1080 page', () => {
    for (const spec of LOWER_THIRDS) {
      const objects = lowerThirdToTelaObjects(spec);
      const errors = lintPage(objects, LT_W, LT_H, { minObjects: 3 }).filter(i => i.severity === 'error');
      assert.deepEqual(errors, [], `${spec.name}: ${errors.map(e => e.message).join('; ')}`);
    }
  });
});
