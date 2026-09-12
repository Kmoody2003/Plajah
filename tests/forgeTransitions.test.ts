import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PHASE3_TRANSITIONS, getTransitionDef, TX_HEADER, TX_MAIN } from '../components/plajahPixels/engine/fx/phase3Transitions';
import { FORGE_TRANSITIONS, createForgeTransition } from '../services/fabula/forgeTransitions';

describe('Forge transition catalog', () => {
  it('publishes every registry transition through the library with unique ids', () => {
    const ids = FORGE_TRANSITIONS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const t of PHASE3_TRANSITIONS) assert.ok(ids.includes(t.id), `${t.id} missing from FORGE_TRANSITIONS`);
    assert.ok(FORGE_TRANSITIONS.length >= 45);
  });

  it('keeps the P0..P3 ABI: at most four named params, defaults inside range', () => {
    for (const t of PHASE3_TRANSITIONS) {
      assert.ok(t.params.length >= 1 && t.params.length <= 4, `${t.id} has ${t.params.length} params`);
      assert.equal(new Set(t.params.map(p => p.key)).size, t.params.length, `${t.id} duplicate param key`);
      for (const p of t.params) assert.ok(p.default >= p.min && p.default <= p.max, `${t.id}/${p.key} default out of range`);
    }
  });

  it('keeps every preset within the declared parameter ranges', () => {
    for (const t of PHASE3_TRANSITIONS) {
      assert.ok(t.presets.length >= 2, `${t.id} needs presets`);
      assert.equal(new Set(t.presets.map(p => p.id)).size, t.presets.length, `${t.id} duplicate preset id`);
      for (const preset of t.presets) for (const p of t.params) {
        const v = preset.params[p.key] ?? p.default;
        assert.ok(v >= p.min && v <= p.max, `${t.id}/${preset.id}/${p.key} = ${v} outside [${p.min}, ${p.max}]`);
      }
    }
  });

  it('declares a tx() body against the shared header', () => {
    assert.match(TX_HEADER, /vec4 outg\(vec2 uv\)/);
    assert.match(TX_HEADER, /vec4 inc\(vec2 uv\)/);
    assert.match(TX_MAIN, /fragColor = tx\(vUv/);
    for (const t of PHASE3_TRANSITIONS) assert.match(t.glsl, /vec4\s+tx\s*\(\s*vec2\s+uv\s*,\s*float\s+p\s*\)/, `${t.id} has no tx() entry point`);
  });

  it('builds deterministic instances from registry presets', () => {
    const a = createForgeTransition('wipe-circle', 'iris-close', 1.5);
    const b = createForgeTransition('wipe-circle', 'iris-close', 1.5);
    assert.deepEqual(a, b);
    assert.equal(a.params.invert, 1);
    assert.equal(a.dur, 1.5);
    const plain = createForgeTransition('dissolve-dither');
    assert.equal(plain.params.pixel, getTransitionDef('dissolve-dither')!.params[0].default);
    assert.throws(() => createForgeTransition('wipe-circle', 'nope'));
  });
});

describe('Legacy transition parameter mapping', () => {
  it('every legacy transition maps its own params — no silent fallback', async () => {
    const { LEGACY_KIND, LEGACY_DEFAULTS, LEGACY_PARAM_KEYS } = await import('../components/plajahPixels/engine/fx/transitionRenderer');
    // A missing DEFAULTS/PARAM_KEYS entry falls back to film-dissolve's, so the library would show
    // sliders that move nothing. Every id the renderer knows must carry its own mapping.
    for (const id of Object.keys(LEGACY_KIND)) {
      assert.ok(LEGACY_DEFAULTS[id], `${id} has no defaults of its own`);
      assert.ok(LEGACY_PARAM_KEYS[id], `${id} has no param-key mapping of its own`);
    }
    // …and the names the renderer reads must be the names the library publishes.
    for (const t of FORGE_TRANSITIONS) {
      const keys = LEGACY_PARAM_KEYS[t.id];
      if (!keys) continue;                                  // registry transitions map by declaration order
      assert.deepEqual(Object.keys(t.defaults).sort(), [...keys].sort(), `${t.id} param names differ between library and renderer`);
      for (let i = 0; i < keys.length; i++) assert.equal(t.defaults[keys[i]], LEGACY_DEFAULTS[t.id][i], `${t.id}/${keys[i]} default differs between library and renderer`);
    }
  });

  it('covers both transition generations without id collisions', async () => {
    const { LEGACY_KIND } = await import('../components/plajahPixels/engine/fx/transitionRenderer');
    const registryIds = new Set(PHASE3_TRANSITIONS.map(t => t.id));
    for (const id of Object.keys(LEGACY_KIND)) assert.ok(!registryIds.has(id), `${id} is defined in both generations`);
    for (const id of [...Object.keys(LEGACY_KIND), ...registryIds]) assert.ok(FORGE_TRANSITIONS.some(t => t.id === id), `${id} is not published in the library`);
  });
});
