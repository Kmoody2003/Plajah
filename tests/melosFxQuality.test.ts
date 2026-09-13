import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES } from '../services/melos/beats/fx/devices';
import { FX_PRESETS, presetsForFx } from '../services/melos/beats/fx/presets';
import { AMP_MODELS, CAB_MODELS, MIC_MODELS, PEDAL_MODELS, RIG_PRESETS } from '../services/melos/beats/fx/ampModels';

test('every general-purpose Melos effect has a diverse factory bank', () => {
  for (const device of DEVICES.filter((entry) => entry.type !== 'amprig')) {
    const presets = presetsForFx(device.type);
    assert.ok(presets.length >= 3, `${device.label} needs at least three presets`);
    assert.equal(new Set(presets.map((entry) => entry.id)).size, presets.length, `${device.label} preset ids`);
    assert.ok(presets.every((entry) => entry.description.length >= 18), `${device.label} preset descriptions`);
    assert.ok(new Set(presets.map((entry) => JSON.stringify(entry.params))).size >= 3, `${device.label} preset diversity`);
  }
});

test('factory effect presets only write real parameters inside their declared ranges', () => {
  for (const device of DEVICES) {
    const specs = new Map(device.params.map((entry) => [entry.key, entry]));
    for (const preset of FX_PRESETS[device.type] ?? []) {
      for (const [key, value] of Object.entries(preset.params)) {
        const spec = specs.get(key);
        assert.ok(spec, `${device.type}/${preset.id} writes unknown ${key}`);
        assert.ok(Number.isFinite(value) && value >= spec!.min && value <= spec!.max, `${device.type}/${preset.id}/${key}=${value}`);
      }
    }
  }
});

test('amp rack spans clean, vintage, modern, bass, fuzz, and experimental rigs', () => {
  assert.ok(AMP_MODELS.length >= 10);
  assert.ok(CAB_MODELS.length >= 8);
  assert.ok(MIC_MODELS.length >= 5);
  assert.ok(PEDAL_MODELS.length >= 8);
  assert.ok(RIG_PRESETS.length >= 12);
  assert.ok(new Set(RIG_PRESETS.map((entry) => entry.params.amp)).size >= 8, 'amp-model diversity');
  assert.ok(new Set(RIG_PRESETS.map((entry) => entry.params.cab)).size >= 6, 'cabinet diversity');
  assert.ok(RIG_PRESETS.some((entry) => entry.params.pedal1On > 0.5 && entry.params.pedal2On > 0.5), 'stacked pedals');
  for (const rig of RIG_PRESETS) {
    assert.ok(rig.params.amp >= 0 && rig.params.amp < AMP_MODELS.length, `${rig.id} amp`);
    assert.ok(rig.params.cab >= 0 && rig.params.cab < CAB_MODELS.length, `${rig.id} cab`);
    assert.ok(rig.params.mic >= 0 && rig.params.mic < MIC_MODELS.length, `${rig.id} mic`);
  }
});
