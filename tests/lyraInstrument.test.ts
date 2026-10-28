// LYRA physical-model instruments: the TS param ids mirror params.rs, presets are well-formed,
// patches survive a save/load, macros stay in range, and the band sits down at real LYRA presets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LY, LYRA_MODELS, LYRA_VARIANTS } from '../services/melos/instruments/lyra/params';
import { LYRA_PRESETS, lyraPresetById } from '../services/melos/instruments/lyra/presets';
import { deserializeLyraPatch, expandLyraMacros, newLyraPatch, serializeLyraPatch } from '../services/melos/instruments/lyra/patch';
import { BAND } from '../services/melos/beats/band/roster';

test('param ids mirror rust/plajah-audio/src/params.rs', () => {
  const rs = fs.readFileSync('rust/plajah-audio/src/params.rs', 'utf8');
  const base = Number(rs.match(/pub const LYRA_BASE: u32 = (\d+);/)![1]);
  const rust: Record<string, number> = {};
  for (const m of rs.matchAll(/pub const LY_([A-Z_]+): u32 = (\d+);/g)) rust[m[1]] = base + Number(m[2]);
  assert.deepEqual(Object.keys(rust).sort(), Object.keys(LY).sort());
  for (const [k, v] of Object.entries(LY)) assert.equal(v, rust[k], k);
  assert.match(fs.readFileSync('services/melos/beats/engine/InstrumentHost.ts', 'utf8'), /DSP_ABI_VERSION = 14/);
  assert.match(fs.readFileSync('rust/plajah-audio/src/lib.rs', 'utf8'), /ABI_VERSION: u32 = 14/);
});

test('presets: every model has some, ids unique, values in range, variant valid', () => {
  const ids = new Set<string>();
  for (const m of LYRA_MODELS) assert.ok(LYRA_PRESETS.some((p) => p.model === m), m);
  for (const p of LYRA_PRESETS) {
    assert.ok(!ids.has(p.id), p.id); ids.add(p.id);
    assert.equal(p.params[LY.ENABLE], 1);
    assert.equal(p.params[LY.MODEL], LYRA_MODELS.indexOf(p.model));
    assert.ok(p.params[LY.VARIANT] < LYRA_VARIANTS[p.model].length, `${p.id} variant`);
    for (const [k, v] of Object.entries(p.params)) {
      if (Number(k) === LY.MODEL || Number(k) === LY.VARIANT) continue;
      assert.ok(v >= 0 && v <= 1, `${p.id} ${k}=${v}`);
    }
  }
});

test('patches round-trip and macros stay in range', () => {
  for (const p of LYRA_PRESETS) {
    const patch = newLyraPatch(p);
    patch.macros.tone = 1; patch.macros.space = 0;
    const back = deserializeLyraPatch(JSON.parse(JSON.stringify(serializeLyraPatch(patch))))!;
    assert.equal(back.model, p.model);
    assert.equal(back.presetId, p.id);
    assert.equal(back.macros.tone, 1);
    const flat = expandLyraMacros(back.params, back.macros);
    for (const [k, v] of Object.entries(flat)) if (Number(k) !== LY.MODEL && Number(k) !== LY.VARIANT) assert.ok(v >= 0 && v <= 1, `${p.id} ${k}`);
  }
  assert.equal(deserializeLyraPatch(undefined), null);
});

test('the band sits at real LYRA presets — no stand-ins left for guitar, piano, violin, horns, woodwinds', () => {
  for (const id of ['rosa', 'theo', 'priya', 'corny', 'lena', 'felix']) {
    const p = BAND.find((x) => x.id === id)!;
    assert.equal(p.seat.kind, 'instrument');
    if (p.seat.kind !== 'instrument') continue;
    assert.equal(p.seat.type, 'lyra', id);
    assert.ok(!p.seat.standIn, `${id} still a stand-in`);
    for (const pid of [p.seat.preset, ...Object.values(p.seat.byGenre ?? {})]) assert.ok(lyraPresetById(pid), `${id}: ${pid}`);
  }
});
