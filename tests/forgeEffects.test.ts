import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { createEffectInstance, effectDefaults, effectsByCategory, instanceParamArray } from '../services/fabula/forgeEffects';
import { createForgeTransition, FORGE_TRANSITIONS } from '../services/fabula/forgeTransitions';
import { parseCubeLut } from '../services/fabula/cubeLut';

describe('Fabula Forge effects', () => {
  it('creates deterministic instances from curated presets', () => {
    const a = createEffectInstance('cineglow', 'silk', 'fx-1');
    const b = createEffectInstance('cineglow', 'silk', 'fx-1');
    assert.deepEqual(a, b);
    assert.equal(a.params.radius, 30);
    assert.equal(a.presetId, 'silk');
  });

  it('orders named values for the GPU/OFX parameter ABI', () => {
    const instance = createEffectInstance('filmhalation', '35mm', 'fx-2');
    assert.deepEqual(instanceParamArray(instance), [.5, 11, .82, .72]);
  });

  it('keeps every preset within its declared parameter range', () => {
    for (const effect of FX_EFFECTS) for (const preset of effect.presets || []) {
      const defaults = effectDefaults(effect);
      for (const param of effect.params) {
        const value = preset.params[param.key] ?? defaults[param.key];
        assert.ok(value >= param.min, `${effect.id}/${preset.id}/${param.key} below minimum`);
        assert.ok(value <= param.max, `${effect.id}/${preset.id}/${param.key} above maximum`);
      }
    }
  });

  it('publishes the new pack under the light category', () => {
    const ids = effectsByCategory().light.map((effect) => effect.id);
    assert.ok(ids.includes('cineglow'));
    assert.ok(ids.includes('filmhalation'));
  });

  it('keeps effect and preset identifiers unique for saved projects and OFX mapping', () => {
    const ids = FX_EFFECTS.map((effect) => effect.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const effect of FX_EFFECTS) {
      const presetIds = (effect.presets || []).map((preset) => preset.id);
      assert.equal(new Set(presetIds).size, presetIds.length, `duplicate preset in ${effect.id}`);
    }
  });

  it('publishes a separate two-input transition catalog', () => {
    assert.ok(FORGE_TRANSITIONS.length >= 6);
    assert.equal(new Set(FORGE_TRANSITIONS.map((transition) => transition.id)).size, FORGE_TRANSITIONS.length);
    assert.ok(FORGE_TRANSITIONS.every((transition) => transition.presets.length >= 2));
  });

  it('creates portable transition instances with complete named parameters', () => {
    assert.deepEqual(createForgeTransition('whip', 'left', 1.25), {
      type: 'forge', forgeId: 'whip', presetId: 'left', dur: 1.25,
      params: { angle: 180, blur: 92 },
    });
  });

  it('parses a serializable 3D cube LUT for preview/export parity', () => {
    const lut = parseCubeLut('LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1', 'identity.cube', 'lut-1');
    assert.equal(lut.size, 2); assert.equal(lut.bytes.length, 24); assert.equal(lut.bytes.at(-1), 255);
  });

  it('publishes true auxiliary-input effects with stable asset bindings', () => {
    // Asset-bound aux only. A 'text' slot is a different contract — the host rasterises a string
    // into it and there is no asset to bind — so those effects are asserted separately.
    const ids = FX_EFFECTS.filter((effect) => effect.auxInput && effect.auxInput.kind !== 'text').map((effect) => effect.id);
    assert.deepEqual(ids.sort(), ['differencekey', 'displacementmap', 'externaldepthdefocus', 'lightwrap', 'referencecolormatch', 'timedisplace', 'cardflip'].sort());
    const instance = { ...createEffectInstance('differencekey', 'clean-static', 'multi-1'), auxAssetId: 'plate-asset' };
    assert.equal(instance.auxAssetId, 'plate-asset');
  });

  it('keeps text-input effects off the asset-binding path', () => {
    const text = FX_EFFECTS.filter((effect) => effect.auxInput?.kind === 'text').map((effect) => effect.id);
    assert.deepEqual(text.sort(), ['hudreadout', 'terminaltext', 'vhsstatus']);
  });

  it('starts the fragment effects in a no-op state, so dropping one on a clip changes nothing', () => {
    // Shatter and Card Dance are driven by a single animated control. Their shaders return the
    // input untouched at zero, and that is only a useful guarantee if the DEFAULT is zero —
    // otherwise the clip breaks apart the moment the effect is added.
    for (const [id, key] of [['shatterpieces', 'progress'], ['carddance', 'amount']] as const) {
      const effect = FX_EFFECTS.find((e) => e.id === id);
      assert.ok(effect, `${id} is not registered`);
      const driver = effect!.params.find((p) => p.key === key);
      assert.ok(driver, `${id} has no ${key} parameter`);
      assert.equal(driver!.default, 0, `${id}.${key} must default to a no-op`);
      assert.equal(driver!.min, 0);
      assert.equal(createEffectInstance(id, undefined, `${id}-x`).params[key], 0);
      // Every preset ships un-triggered too: a preset is a look, not a state part-way through.
      for (const preset of effect!.presets || []) {
        assert.equal(preset.params[key] ?? driver!.default, 0, `${id}/${preset.id} starts part-way through`);
      }
    }
  });
});
