// Unit tests for Chora Live Real-Time FX: Lo-Fi, Chipmunk, AM Radio, and Boost Mode.
// Run with:
//   npx tsx --test tests/choraLiveFx.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICES,
  deviceByType,
  newInstance,
  type FxDescriptor,
  type FxInstance,
} from '../services/melos/beats/fx/devices';
import { FX_PRESETS, presetsForFx, type FxPreset } from '../services/melos/beats/fx/presets';

test('Chora Live FX — all 4 fun FX devices are registered in DEVICES', () => {
  const types = ['lofi', 'chipmunk', 'radio', 'boost'];
  for (const type of types) {
    const desc = deviceByType(type);
    assert.ok(desc, `Device descriptor for "${type}" must be registered`);
    assert.equal(desc.type, type);
    assert.equal(desc.category, 'dj');
    assert.ok(desc.label.length > 0, `Label for "${type}" must not be empty`);
    assert.ok(desc.blurb.length > 0, `Blurb for "${type}" must not be empty`);
    assert.ok(desc.params.length > 0, `Params for "${type}" must not be empty`);
    assert.equal(typeof desc.create, 'function', `create() must be a function for "${type}"`);
  }
});

test('Chora Live FX — parameter specifications have valid ranges and defaults', () => {
  const types = ['lofi', 'chipmunk', 'radio', 'boost'];
  for (const type of types) {
    const desc = deviceByType(type)!;
    for (const p of desc.params) {
      assert.ok(p.min < p.max, `Param ${p.key} in ${type}: min (${p.min}) must be strictly less than max (${p.max})`);
      assert.ok(
        p.default >= p.min && p.default <= p.max,
        `Param ${p.key} in ${type}: default (${p.default}) must be within [${p.min}, ${p.max}]`
      );
    }
  }
});

test('Chora Live FX — newInstance() creates valid serializable instances with default params', () => {
  const types = ['lofi', 'chipmunk', 'radio', 'boost'];
  for (const type of types) {
    const desc = deviceByType(type)!;
    const inst = newInstance(type);
    assert.equal(inst.type, type);
    assert.equal(inst.on, true);
    assert.ok(inst.id.startsWith('fx'), 'Instance ID must follow fx UID format');

    for (const p of desc.params) {
      assert.equal(
        inst.params[p.key],
        p.default,
        `Instance for ${type} must default param "${p.key}" to ${p.default}`
      );
    }
  }
});

test('Chora Live FX — factory presets are populated and contain valid parameters', () => {
  const types = ['lofi', 'chipmunk', 'radio', 'boost'];
  for (const type of types) {
    const presets = presetsForFx(type);
    assert.ok(presets.length >= 3, `Expected at least 3 factory presets for "${type}", found ${presets.length}`);

    const desc = deviceByType(type)!;
    const validKeys = new Set(desc.params.map(p => p.key));

    for (const pr of presets) {
      assert.ok(pr.id.length > 0, 'Preset id must not be empty');
      assert.ok(pr.name.length > 0, 'Preset name must not be empty');
      assert.ok(pr.description.length > 0, 'Preset description must not be empty');

      for (const [key, val] of Object.entries(pr.params)) {
        assert.ok(validKeys.has(key), `Preset "${pr.name}" for ${type} references unknown param key "${key}"`);
        const spec = desc.params.find(p => p.key === key)!;
        assert.ok(
          val >= spec.min && val <= spec.max,
          `Preset "${pr.name}" param "${key}" (${val}) out of range [${spec.min}, ${spec.max}]`
        );
      }
    }
  }
});

test('Chora Live FX — specific factory presets verify musical character', () => {
  // Lo-Fi Cassette preset verification
  const lofiPresets = presetsForFx('lofi');
  const cassette = lofiPresets.find(p => p.id === 'lofi-cassette');
  assert.ok(cassette, 'Must have lofi-cassette preset');
  assert.equal(cassette.params.filter, 3200);
  assert.equal(cassette.params.wow, 0.45);

  // Chipmunk Alvin preset verification
  const chipPresets = presetsForFx('chipmunk');
  const alvin = chipPresets.find(p => p.id === 'chip-alvin');
  assert.ok(alvin, 'Must have chip-alvin preset');
  assert.equal(alvin.params.shift, 460);
  assert.equal(alvin.params.formant, 3200);

  // AM Radio 30s preset verification
  const radioPresets = presetsForFx('radio');
  const am30s = radioPresets.find(p => p.id === 'radio-am30s');
  assert.ok(am30s, 'Must have radio-am30s preset');
  assert.equal(am30s.params.bandwidth, 2800);
  assert.equal(am30s.params.static, 0.35);

  // Boost Club Maximizer preset verification
  const boostPresets = presetsForFx('boost');
  const club = boostPresets.find(p => p.id === 'boost-club');
  assert.ok(club, 'Must have boost-club preset');
  assert.equal(club.params.punch, 0.75);
  assert.equal(club.params.ceiling, -0.2);
});
