import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLyraCadModel,
  buildSomaCadModel,
  buildTonosCadModel,
  resolveTonosCadFamily,
} from '../services/melos/instruments/cad3d';
import { TONOS_INSTRUMENTS } from '../services/melos/instruments/tonos/catalog';
import { SOMA_PRESETS, expandSomaMacros } from '../services/melos/instruments/soma/presets';
import { DRUMS, SOMA_PRESET_DRUM } from '../services/melos/instruments/soma/drumKnowledge';
import { LY, LYRA_MODELS } from '../services/melos/instruments/lyra/params';
import {
  acquireF64Scratch,
  bucketByFrames,
  lruSet,
  lruTouch,
  realPairPowerSpecsInto,
  realPowerSpecInto,
  releaseF64Scratch,
  trimSilenceTail,
} from '../services/melos/instruments/soma/deep/deepUtil';
import { BAND } from '../services/melos/beats/band/roster';
import { CHARACTER_SHEETS } from '../services/melos/beats/band/character/sheets';
import { loreById } from '../services/melos/beats/band/lore';
import { KitLens } from '../services/melos/beats/band/live/observations';
import { LYRA_SEAT_INTROS, PANEL_SEAT_INTROS } from '../services/melos/beats/band/live/lineAudio';
import type { CadModel } from '../services/cad/model';

function assertValidCadModel(model: CadModel, label: string): void {
  assert.ok(model.meshes.length >= 2, `${label}: expected >= 2 CAD meshes, got ${model.meshes.length}`);
  for (const mesh of model.meshes) {
    assert.ok(mesh.positions.length >= 9, `${label}/${mesh.id}: positions empty`);
    assert.equal(mesh.positions.length % 3, 0, `${label}/${mesh.id}: positions length % 3`);
    assert.ok(mesh.indices.length >= 3, `${label}/${mesh.id}: indices empty`);
    for (let i = 0; i < mesh.positions.length; i++) {
      assert.ok(Number.isFinite(mesh.positions[i]), `${label}/${mesh.id}: non-finite vertex at ${i}`);
    }
    const vertCount = mesh.positions.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) {
      assert.ok(mesh.indices[i]! < vertCount, `${label}/${mesh.id}: out-of-range index`);
    }
  }
}

test('CAD 3D TONOS: builds distinct valid geometry for all 52 world string instruments', () => {
  const families = new Set<string>();
  TONOS_INSTRUMENTS.forEach((inst, idx) => {
    const { model, spec } = buildTonosCadModel(inst, idx);
    assertValidCadModel(model, `TONOS[${idx}]:${inst.name}`);
    assert.equal(spec.family, resolveTonosCadFamily(inst));
    families.add(spec.family);
    const hasMotionTarget = model.meshes.some(
      (m) => m.id.startsWith('string_') || m.id === 'bow' || m.id === 'wheel' || m.id === 'rattle' || m.id === 'bau_rod',
    );
    assert.ok(hasMotionTarget, `${inst.name} should expose at least one live motion mesh target`);
  });
  assert.ok(families.size >= 14, `Expected rich morphological variety, got ${families.size} families`);
});

test('CAD 3D SOMA: morphs dynamically across all 54 presets and drum families', () => {
  const families = new Set<string>();
  for (const preset of SOMA_PRESETS) {
    const expanded = expandSomaMacros(preset.params, preset.macros);
    const { model, spec } = buildSomaCadModel(expanded, preset.id);
    assertValidCadModel(model, `SOMA:${preset.id}`);
    families.add(spec.family);
    assert.ok(model.meshes.some((m) => m.id === 'membrane'), `${preset.id} needs membrane mesh`);
    assert.ok(model.meshes.some((m) => m.id === 'striker'), `${preset.id} needs striker mesh`);
  }
  assert.ok(families.has('kettle') && families.has('goblet') && families.has('udu'), 'Expected kettle, goblet, and udu families');
});

test('CAD 3D LYRA: builds all 11 physical instrument models and differentiates guitar & trumpet variants', () => {
  for (const modelName of LYRA_MODELS) {
    const { model, spec } = buildLyraCadModel(modelName, 0);
    assertValidCadModel(model, `LYRA:${modelName}`);
    assert.equal(spec.family, modelName);
  }
  const acoustic = buildLyraCadModel('guitar', 0);
  const nylon = buildLyraCadModel('guitar', 1);
  const singleCoil = buildLyraCadModel('guitar', 2, { [LY.PICKUP]: 0.1 });
  const humbucker = buildLyraCadModel('guitar', 3, { [LY.PICKUP]: 0.9 });
  assert.ok(acoustic.model.meshes.some((m) => m.id === 'soundhole'));
  assert.ok(nylon.model.meshes.some((m) => m.id === 'soundhole'));
  assert.ok(singleCoil.model.meshes.some((m) => m.id === 'pickup_n' && m.name.includes('Single')));
  assert.ok(humbucker.model.meshes.some((m) => m.id === 'pickup_n' && m.name.includes('Humbucker')));

  const openTpt = buildLyraCadModel('trumpet', 0);
  const mutedTpt = buildLyraCadModel('trumpet', 2);
  assert.ok(!openTpt.model.meshes.some((m) => m.id === 'mute'));
  assert.ok(mutedTpt.model.meshes.some((m) => m.id === 'mute'));
});

test('deepUtil: scratch pooling, LRU cap, dual-real FFT packing, tail trimming, and duration buckets', () => {
  const a = acquireF64Scratch(300);
  assert.equal(a.length, 512);
  releaseF64Scratch(a);
  const b = acquireF64Scratch(400);
  assert.equal(b, a, 'Expected scratch buffer reuse from bucketed pool');
  releaseF64Scratch(b);

  const lru = new Map<string, number>();
  lruSet(lru, 'k1', 1, 2);
  lruSet(lru, 'k2', 2, 2);
  assert.equal(lruTouch(lru, 'k1'), 1);
  lruSet(lru, 'k3', 3, 2);
  assert.equal(lru.has('k2'), false);
  assert.deepEqual([...lru.keys()], ['k1', 'k3']);

  const n = 256;
  const sigA = new Float64Array(n);
  const sigB = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sigA[i] = Math.sin((2 * Math.PI * 5 * i) / n) + 0.35 * Math.cos((2 * Math.PI * 19 * i) / n);
    sigB[i] = 0.7 * Math.cos((2 * Math.PI * 11 * i) / n) - 0.25 * Math.sin((2 * Math.PI * 29 * i) / n);
  }
  const refA = new Float64Array((n >> 1) + 1);
  const refB = new Float64Array((n >> 1) + 1);
  const pairA = new Float64Array((n >> 1) + 1);
  const pairB = new Float64Array((n >> 1) + 1);
  realPowerSpecInto(sigA, n, n, refA);
  realPowerSpecInto(sigB, n, n, refB);
  realPairPowerSpecsInto(sigA, n, sigB, n, n, pairA, pairB);
  for (let k = 0; k <= (n >> 1); k++) {
    assert.ok(Math.abs(pairA[k]! - refA[k]!) < 1e-8, `pairA mismatch at bin ${k}`);
    assert.ok(Math.abs(pairB[k]! - refB[k]!) < 1e-8, `pairB mismatch at bin ${k}`);
  }

  const raw = new Float32Array(2 * 4000);
  for (let i = 0; i < 600; i++) {
    raw[i] = 0.4;
    raw[4000 + i] = -0.35;
  }
  const trimmed = trimSilenceTail(raw, true, 4000, 256);
  assert.ok(trimmed.frames < 1000, `Expected trailing silence trim, got ${trimmed.frames}`);

  const buckets = bucketByFrames([500, 520, 4800, 5200, 49000], (x) => x);
  assert.equal(buckets.length, 3);
});

test('Session Band completeness: SOMA 54/54 presets mapped, all 13 sheets have >=3 demos, new lore & KitLens work', () => {
  for (const preset of SOMA_PRESETS) {
    const drumId = SOMA_PRESET_DRUM[preset.id];
    assert.ok(drumId, `Missing SOMA_PRESET_DRUM mapping for "${preset.id}"`);
    assert.ok(DRUMS[drumId], `Invalid DrumId "${drumId}" for "${preset.id}"`);
  }

  assert.equal(CHARACTER_SHEETS.length, BAND.length);
  for (const sheet of CHARACTER_SHEETS) {
    assert.ok(sheet.demos.length >= 3, `${sheet.id} should have at least 3 demos, got ${sheet.demos.length}`);
    assert.ok(sheet.expertise.instruments.length >= 1, `${sheet.id} should declare instruments`);
  }

  for (const loreId of ['world-lutes-and-harps', 'world-bowed-fiddles', 'world-zithers-dulcimers', 'sampler', 'spectral-ensemble']) {
    const entry = loreById(loreId);
    assert.ok(entry && entry.players.length > 0 && entry.sources.length > 0, `Incomplete lore entry: ${loreId}`);
  }

  for (const k of ['tonos', 'aura', 'onda', 'bajo', 'vela', 'cantus', 'ison', 'pneuma', 'kera', 'kit'] as const) {
    assert.ok(PANEL_SEAT_INTROS[k].length > 15, `Missing panel intro: ${k}`);
  }
  for (const m of LYRA_MODELS) {
    assert.ok(LYRA_SEAT_INTROS[m].length > 15, `Missing LYRA intro: ${m}`);
  }

  const kitLens = new KitLens();
  const t0 = performance.now();
  kitLens.feed({ kind: 'strike', instrument: 'soma', trackId: 't1', at: t0 - 200, note: 48, velocity: 0.9, pos: 0.1 });
  assert.equal(kitLens.summary(t0), 'not playing right now', 'KitLens must ignore SOMA events');
  kitLens.feed({ kind: 'strike', instrument: 'kit', trackId: 'kit', at: t0 - 100, note: 36, velocity: 0.85, pos: 0.1 });
  assert.ok(kitLens.summary(t0).includes('1 strokes'), 'KitLens summary should describe kit hits');
});
