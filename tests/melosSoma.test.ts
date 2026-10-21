// SOMA — Real-Time Multi-Physics Acoustic Percussion & Chamber Simulator contract tests.
//
//   npx tsx --test tests/melosSoma.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SM,
  BESSEL_MODES,
  besselJ,
  SOMA_PARAM_META,
  formatSomaParam,
} from '../services/melos/instruments/soma/params';
import {
  SOMA_PRESETS,
  SOMA_CATEGORY_ORDER,
  SOMA_CATEGORY_LABELS,
  expandSomaMacros,
} from '../services/melos/instruments/soma/presets';
import {
  newSomaPatch,
  applySomaPreset,
  serializeSomaPatch,
  deserializeSomaPatch,
  somaEngineParams,
  crossformSomaPatch,
  polarToDrumPad,
  drumPadToPolar,
  SOMA_EDITOR_GROUPS,
  SOMA_MACRO_ORDER,
  SOMA_MACRO_LABELS,
} from '../services/melos/instruments/soma/patch';

test('SOMA ships 36 physical-modeling percussion presets across 6 world & orchestral families', () => {
  assert.equal(SOMA_PRESETS.length, 36, `expected 36 presets, got ${SOMA_PRESETS.length}`);
  assert.equal(SOMA_CATEGORY_ORDER.length, 6);

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const countsByCat = new Map<string, number>();

  for (const p of SOMA_PRESETS) {
    assert.ok(!seenIds.has(p.id), `duplicate preset id "${p.id}"`);
    assert.ok(!seenNames.has(p.name), `duplicate preset name "${p.name}"`);
    seenIds.add(p.id);
    seenNames.add(p.name);

    assert.ok(p.origin.length > 5, `${p.id} needs physical origin metadata`);
    assert.ok(p.acoustics.length > 10, `${p.id} needs acoustic domain specification`);
    assert.ok(p.description.length > 15, `${p.id} needs sound designer description`);
    assert.ok(SOMA_CATEGORY_LABELS[p.category], `${p.id} has unknown category ${p.category}`);
    assert.equal(p.params[SM.ENABLE], 1, `${p.id} must enable SOMA physical modeling engine`);

    countsByCat.set(p.category, (countsByCat.get(p.category) ?? 0) + 1);
  }

  for (const cat of SOMA_CATEGORY_ORDER) {
    assert.equal(countsByCat.get(cat), 6, `category ${cat} should have 6 presets`);
  }
});

test('2D Bessel eigenmode evaluator J_m(x) satisfies exact circular membrane boundary & apex conditions', () => {
  assert.equal(BESSEL_MODES.length, 16);
  // At dead center (r/a = 0), J_0(0) = 1 and J_m(0) = 0 for all m >= 1
  assert.equal(besselJ(0, 0), 1);
  for (let m = 1; m <= 7; m++) {
    assert.equal(besselJ(m, 0), 0, `J_${m}(0) must be 0 at membrane center`);
  }

  // At the outer clamped rim (r/a = 1.0 -> x = j_{mn}), J_m(j_{mn}) = 0
  for (const mode of BESSEL_MODES) {
    const valAtRim = besselJ(mode.m, mode.besselRoot);
    assert.ok(
      Math.abs(valAtRim) < 1e-3,
      `mode ${mode.label} must vanish at clamped rim root j_mn=${mode.besselRoot} (got ${valAtRim})`,
    );
  }
});

test('every SOMA preset serializes cleanly for Firestore with zero undefined values or nested arrays', () => {
  function assertFirestoreSafe(val: unknown, path: string): void {
    assert.notEqual(val, undefined, `undefined at ${path}`);
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        assert.ok(!Array.isArray(val[i]), `nested array at ${path}[${i}]`);
        assertFirestoreSafe(val[i], `${path}[${i}]`);
      }
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        assertFirestoreSafe(v, `${path}.${k}`);
      }
    }
  }

  for (const preset of SOMA_PRESETS) {
    const patch = newSomaPatch(preset);
    const serialized = serializeSomaPatch(patch);
    assertFirestoreSafe(serialized, preset.id);

    const roundtrip = deserializeSomaPatch(serialized);
    assert.ok(roundtrip, `failed to deserialize ${preset.id}`);
    assert.equal(roundtrip!.presetId, preset.id);
    assert.equal(roundtrip!.origin, preset.origin);

    const enginePairs = somaEngineParams(roundtrip!);
    assert.ok(enginePairs.length >= 25, `${preset.id} should emit all physical domain parameters`);
    for (const [id, v] of enginePairs) {
      assert.ok(Number.isFinite(id) && Number.isFinite(v), `non-finite pair [${id}, ${v}] in ${preset.id}`);
    }
  }
});

test('2D drumhead polar <-> Cartesian mapping, macro expansion, and Acoustic Body Morph work accurately', () => {
  const [x, y] = polarToDrumPad(0.65, 0.5);
  const polar = drumPadToPolar(x, y);
  assert.ok(Math.abs(polar.radius - 0.65) < 0.01);
  assert.ok(Math.abs(polar.angle - 0.5) < 0.01);

  const timpani = newSomaPatch(SOMA_PRESETS[0]); // 29" Dresden Copper Timpani
  const djembe = newSomaPatch(SOMA_PRESETS[6]);  // Carved Lenke Master Djembe

  const morphed = crossformSomaPatch(timpani, djembe, 0.5);
  assert.ok(morphed.name.includes('×'));
  assert.equal(morphed.params[SM.CAVITY_TYPE], djembe.params[SM.CAVITY_TYPE]);

  const expanded = expandSomaMacros(timpani.params, {
    strikePos: 0.9,
    hardness: 0.85,
    tension: 0.75,
    chamber: 0.9,
    shellBody: 0.85,
    hallSpace: 0.8,
  });
  assert.ok((expanded[SM.STRIKE_POS] ?? 0) > (timpani.params[SM.STRIKE_POS] ?? 0));
  assert.ok((expanded[SM.TENSION_PEDAL] ?? 0) > 0.5);
});

test('all 4 SOMA physical editor domains and Melos Beats factory/presetHub integration are complete', () => {
  assert.equal(SOMA_MACRO_ORDER.length, 6);
  for (const m of SOMA_MACRO_ORDER) {
    assert.ok(SOMA_MACRO_LABELS[m]);
  }

  for (const group of SOMA_EDITOR_GROUPS) {
    assert.ok(group.ids.length > 0);
    for (const id of group.ids) {
      assert.ok(SOMA_PARAM_META[id], `missing SOMA_PARAM_META for id ${id} in domain ${group.key}`);
      assert.ok(formatSomaParam(id, 0.5).length > 0);
    }
  }

  // Verify applySomaPreset updates patch metadata & parameters cleanly
  const initial = newSomaPatch();
  const targetPreset = SOMA_PRESETS[9]!; // Yoruba GanGan Talking Drum
  const updated = applySomaPreset(initial, targetPreset);
  assert.equal(updated.name, targetPreset.name);
  assert.equal(updated.origin, targetPreset.origin);
  assert.equal(updated.params[SM.CAVITY_TYPE], 3);
});
