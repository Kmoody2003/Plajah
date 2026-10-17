// AURA — 1960s & 1970s Vintage Analogue Synthesizer contract tests.
//
//   npx tsx --test tests/melosAura.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AURA_PRESETS, AURA_CATEGORY_ORDER, AURA_CATEGORY_LABELS, expandAuraMacros,
} from '../services/melos/instruments/aura/presets';
import {
  newAuraPatch, applyAuraPreset, serializeAuraPatch, deserializeAuraPatch,
  auraEngineParams, crossformAuraPatch, AURA_EDITOR_GROUPS, AURA_MACRO_ORDER, AURA_MACRO_LABELS,
} from '../services/melos/instruments/aura/patch';
import { A, P, AURA_PARAM_META, formatAuraParam } from '../services/melos/instruments/aura/params';
import { AURA_WAVETABLES, getAuraWavetable } from '../services/melos/instruments/aura/wavetables';

test('AURA ships 56 classic 1960s & 1970s presets across 7 historic categories', () => {
  assert.equal(AURA_PRESETS.length, 56, `expected 56 presets, got ${AURA_PRESETS.length}`);
  assert.equal(AURA_CATEGORY_ORDER.length, 7);

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const countsByCat = new Map<string, number>();

  for (const p of AURA_PRESETS) {
    assert.ok(!seenIds.has(p.id), `duplicate preset id "${p.id}"`);
    assert.ok(!seenNames.has(p.name), `duplicate preset name "${p.name}"`);
    seenIds.add(p.id);
    seenNames.add(p.name);

    const yr = Number(p.year);
    assert.ok(yr >= 1962 && yr <= 1979, `${p.id} year ${p.year} must be in the 1960s/1970s era`);
    assert.ok(p.inspiration.length > 5, `${p.id} needs historical hardware inspiration`);
    assert.ok(p.description.length > 15, `${p.id} needs a sound designer description`);
    assert.ok(AURA_CATEGORY_LABELS[p.category], `${p.id} has unknown category ${p.category}`);

    countsByCat.set(p.category, (countsByCat.get(p.category) ?? 0) + 1);
  }

  for (const cat of AURA_CATEGORY_ORDER) {
    assert.equal(countsByCat.get(cat), 8, `category ${cat} should have 8 presets`);
  }
});

test('all 6 vintage hardware wave banks build constant-RMS 32x2048 buffers with zero NaNs', () => {
  assert.equal(AURA_WAVETABLES.length, 6);
  for (const w of AURA_WAVETABLES) {
    const data = getAuraWavetable(w.id);
    assert.ok(data, `failed to build wavetable ${w.id}`);
    assert.equal(data!.length, 32 * 2048, `${w.id} must be 32 frames × 2048 samples`);
    let energy = 0;
    for (let i = 0; i < data!.length; i++) {
      assert.ok(Number.isFinite(data![i]), `${w.id} sample ${i} is not finite`);
      energy += data![i] * data![i];
    }
    const rms = Math.sqrt(energy / data!.length);
    assert.ok(rms > 0.20 && rms < 0.65, `${w.id} RMS (${rms.toFixed(3)}) should be normalized`);
  }
});

test('every AURA preset serializes cleanly for Firestore with zero undefined values or nested arrays', () => {
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

  for (const preset of AURA_PRESETS) {
    const patch = newAuraPatch(preset);
    const serialized = serializeAuraPatch(patch);
    assertFirestoreSafe(serialized, preset.id);

    const roundtrip = deserializeAuraPatch(serialized);
    assert.ok(roundtrip, `failed to deserialize ${preset.id}`);
    assert.equal(roundtrip!.presetId, preset.id);
    assert.equal(roundtrip!.year, preset.year);

    const enginePairs = auraEngineParams(roundtrip!);
    assert.ok(enginePairs.length > 20, `${preset.id} should emit engine parameter pairs`);
    for (const [id, v] of enginePairs) {
      assert.ok(Number.isFinite(id) && Number.isFinite(v), `non-finite pair [${id}, ${v}] in ${preset.id}`);
    }
  }
});

test('macro expansion and Crossform morphing interpolate continuous parameters and snap discrete ones', () => {
  const lead = newAuraPatch(AURA_PRESETS[8]); // '70s Mono Lead
  const strings = newAuraPatch(AURA_PRESETS[32]); // Strings & Tape

  const mid = crossformAuraPatch(lead, strings, 0.5);
  assert.ok(mid.name.includes('×'), `expected blended name, got ${mid.name}`);
  // Discrete voice mode should come from B at t=0.5
  assert.equal(mid.params[P.VOICE_MODE], strings.params[P.VOICE_MODE]);

  const expanded = expandAuraMacros(mid.params, {
    warmth: 0.9, cutoff: 0.8, resonance: 0.7, aura: 0.85, ensemble: 0.9, space: 0.75,
  });
  assert.equal(expanded[A.ENS_ON], 1, 'high ensemble macro should enable BBD ensemble');
  assert.ok((expanded[A.AURA] ?? 0) > 0.65, 'high aura macro should raise voice-card tolerance/drift');
});

test('all 6 AURA editor groups and macros have complete metadata and formatters', () => {
  assert.equal(AURA_MACRO_ORDER.length, 6);
  for (const m of AURA_MACRO_ORDER) {
    assert.ok(AURA_MACRO_LABELS[m]);
  }
  const initial = newAuraPatch();
  const targetPreset = AURA_PRESETS[24];
  const updated = applyAuraPreset(initial, targetPreset);
  assert.equal(updated.name, targetPreset.name);
  assert.equal(updated.year, targetPreset.year);

  for (const group of AURA_EDITOR_GROUPS) {
    assert.ok(group.ids.length > 0);
    for (const id of group.ids) {
      assert.ok(AURA_PARAM_META[id], `missing AURA_PARAM_META for param id ${id} in group ${group.key}`);
      assert.ok(formatAuraParam(id, 0.5).length > 0);
    }
  }
});

test('every AURA preset builds a dramatic multi-parameter X/Y Vector Pad and preserves explicit FX toggles', () => {
  for (const preset of AURA_PRESETS) {
    const patch = newAuraPatch(preset);
    assert.ok(patch.padX.length >= 3, `${preset.id} padX should sweep >= 3 parameters, got ${patch.padX.length}`);
    assert.ok(patch.padY.length >= 2, `${preset.id} padY should sweep >= 2 parameters, got ${patch.padY.length}`);
  }

  // Manual toggle of Phaser or BBD Ensemble should not be zeroed out when ensemble macro is 0
  const baseParams = { [A.PH_ON]: 1, [A.PH_MIX]: 0.55, [A.GATE_ON]: 1, [A.FLUX_ON]: 1 };
  const expanded = expandAuraMacros(baseParams, {
    warmth: 0.35, cutoff: 0.5, resonance: 0.3, aura: 0.35, ensemble: 0, space: 0,
  });
  assert.equal(expanded[A.PH_ON], 1);
  assert.equal(expanded[A.PH_MIX], 0.55);
  assert.equal(expanded[A.GATE_ON], 1);
  assert.equal(expanded[A.FLUX_ON], 1);
});

