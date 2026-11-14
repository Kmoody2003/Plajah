// TONOS world strings: TS param ids, the instrument catalog and the materials mirror tonos.rs /
// params.rs exactly; presets are well-formed; patches survive a save/load; macros stay in range; the
// physics readout matches the engine's equations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TN, TONOS_INDEX_PARAMS, TONOS_MATERIALS, TONOS_SYMP_SCALES } from '../services/melos/instruments/tonos/params';
import { TONOS_INSTRUMENTS } from '../services/melos/instruments/tonos/catalog';
import { TONOS_PRESETS, tonosPresetById, tonosPresetsForInstrument, tonosSubPresetLabel } from '../services/melos/instruments/tonos/presets';
import { deserializeTonosPatch, expandTonosMacros, newTonosPatch, serializeTonosPatch } from '../services/melos/instruments/tonos/patch';
import { describeString, stringFor } from '../services/melos/instruments/tonos/physics';

const rs = fs.readFileSync('rust/plajah-audio/src/tonos.rs', 'utf8');
const prs = fs.readFileSync('rust/plajah-audio/src/params.rs', 'utf8');

test('param ids mirror rust/plajah-audio/src/params.rs; host and crate ABI agree', () => {
  const base = Number(prs.match(/pub const TONOS_BASE: u32 = (\d+);/)![1]);
  const rust: Record<string, number> = {};
  for (const m of prs.matchAll(/pub const TN_([A-Z_]+): u32 = (\d+);/g)) rust[m[1]] = base + Number(m[2]);
  assert.deepEqual(Object.keys(rust).sort(), Object.keys(TN).sort());
  for (const [k, v] of Object.entries(TN)) assert.equal(v, rust[k], k);
  assert.match(prs, /MAX_PARAM_ID: usize = 2[1-9]\d\d/);
  // Host and crate agree on the ABI (17 brought TONOS; later bumps keep it).
  const hostAbi = Number(fs.readFileSync('services/melos/beats/engine/InstrumentHost.ts', 'utf8').match(/DSP_ABI_VERSION = (\d+)/)![1]);
  const crateAbi = Number(fs.readFileSync('rust/plajah-audio/src/lib.rs', 'utf8').match(/ABI_VERSION: u32 = (\d+)/)![1]);
  assert.equal(hostAbi, crateAbi);
  assert.ok(crateAbi >= 17);
});

function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

test('the catalog mirrors INSTRUMENTS in tonos.rs field by field', () => {
  const names = [...rs.match(/pub const INSTRUMENT_NAMES[^=]*=\s*\[([\s\S]*?)\];/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const table = rs.match(/static INSTRUMENTS[\s\S]*?\n\];/)![0];
  const rows = [...table.matchAll(/inst!\((.*)\),\s*$/gm)].map((m) => splitTop(m[1]));
  assert.equal(rows.length, TONOS_INSTRUMENTS.length);
  assert.equal(names.length, TONOS_INSTRUMENTS.length);
  const EX: Record<string, string> = { EX_FINGER: 'finger', EX_NAIL: 'nail', EX_PLECTRUM: 'plectrum', EX_BACHI: 'bachi', EX_HAMMER: 'hammer', EX_BOW: 'bow', EX_WHEEL: 'wheel', EX_HARMONIC: 'harmonic' };
  const MAT: Record<string, number> = { STEEL: 0, BRONZE: 1, NYLON: 2, GUT: 3, SILK: 4, HAIR: 5, TETRON: 6, NSTEEL: 7, BRASS: 8 };
  const STOP: Record<string, string> = { STOP_OPEN: 'open', STOP_FRET: 'fret', STOP_FRETLESS: 'fretless', STOP_AIR: 'air', STOP_TANGENT: 'tangent' };
  const RAT: Record<string, string | null> = { RATTLE_NONE: null, RATTLE_SESSE: 'sesse', RATTLE_SERSAL: 'sersal', RATTLE_CHIEN: 'chien' };
  rows.forEach((p, i) => {
    const t = TONOS_INSTRUMENTS[i];
    assert.equal(t.name, names[i], `name ${i}`);
    assert.equal(t.excite, EX[p[0]], `${t.name} excite`);
    assert.equal(t.material, MAT[p[1]], `${t.name} material`);
    assert.equal(t.courses, Number(p[2]), `${t.name} courses`);
    assert.equal(t.stop, STOP[p[4]], `${t.name} stop`);
    assert.equal(t.length, Number(p[5]), `${t.name} length`);
    assert.equal(t.reference, Number(p[6]), `${t.name} reference`);
    assert.equal(t.alpha, Number(p[7]), `${t.name} alpha`);
    assert.deepEqual(t.opens, (p[8].match(/[\d.]+/g) ?? []).map(Number), `${t.name} opens`);
    assert.equal(t.tension, Number(p[9]), `${t.name} tension`);
    assert.equal(t.jawari, Number(p[10]) > 0, `${t.name} jawari`);
    assert.equal(t.rattle, RAT[p[12]], `${t.name} rattle`);
    assert.equal(t.sympathetic, Number(p[13]), `${t.name} sympathetic`);
    const body = p[14].startsWith('wood') ? 'wood' : p[14].startsWith('skin') ? 'skin' : p[14].includes('BODY_TUBE') ? 'tube' : 'gourd';
    assert.equal(t.body, body, `${t.name} body`);
  });
});

test('materials and sympathetic tunings mirror tonos.rs', () => {
  const mats = [...rs.match(/static MATERIALS[\s\S]*?\];/)![0].matchAll(/Material \{ rho: ([\d.e+-]+), e: ([\d.e+-]+), delta: ([\d.e+-]+), q0: ([\d.e+-]+) \}/g)];
  assert.equal(mats.length, TONOS_MATERIALS.length);
  mats.forEach((m, i) => {
    assert.equal(TONOS_MATERIALS[i].rho, Number(m[1]));
    assert.equal(TONOS_MATERIALS[i].e, Number(m[2]));
  });
  const scales = [...rs.match(/pub const SYMP_SCALE_NAMES[^=]*=\s*\[([\s\S]*?)\];/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scales, [...TONOS_SYMP_SCALES]);
});

test('presets: every instrument has one, ids unique, values in range, index valid', () => {
  const ids = new Set<string>();
  TONOS_INSTRUMENTS.forEach((inst, i) => assert.ok(TONOS_PRESETS.some((p) => p.instrument === i), inst.name));
  for (const p of TONOS_PRESETS) {
    assert.ok(!ids.has(p.id), p.id); ids.add(p.id);
    assert.equal(p.params[TN.ENABLE], 1);
    assert.equal(p.params[TN.INSTRUMENT], p.instrument);
    assert.ok(p.instrument >= 0 && p.instrument < TONOS_INSTRUMENTS.length);
    assert.ok(p.defaultNote > 20 && p.defaultNote < 100, `${p.id} note`);
    for (const [k, v] of Object.entries(p.params)) {
      if (TONOS_INDEX_PARAMS.includes(Number(k))) continue;
      assert.ok(v >= 0 && v <= 1, `${p.id} ${k}=${v}`);
    }
  }
  assert.equal(tonosPresetById('tonos-sitar')?.instrument, 11);
});

test('every TONOS instrument has >= 3 distinct sub-presets with unique labels and contrasting params', () => {
  TONOS_INSTRUMENTS.forEach((inst, i) => {
    const subs = tonosPresetsForInstrument(i);
    assert.ok(subs.length >= 3, `${inst.name} (#${i}) only has ${subs.length} sub-presets`);
    const labels = new Set<string>();
    const paramSignatures = new Set<string>();
    for (const sub of subs) {
      const lbl = tonosSubPresetLabel(sub, inst.name);
      assert.ok(lbl.trim().length > 0, `${sub.id} empty label`);
      assert.ok(!labels.has(lbl), `${inst.name} duplicate sub-preset label "${lbl}"`);
      labels.add(lbl);
      const keys = Object.keys(sub.params)
        .map(Number)
        .filter((k) => k !== TN.ENABLE && k !== TN.INSTRUMENT)
        .sort((a, b) => a - b);
      const sig = `${sub.defaultNote}:` + keys.map((k) => `${k}=${sub.params[k].toFixed(3)}`).join(',');
      paramSignatures.add(sig);
    }
    assert.equal(paramSignatures.size, subs.length, `${inst.name} has identical sub-preset parameter vectors`);
  });
});

test('patches round-trip and macros stay in range', () => {
  for (const p of TONOS_PRESETS) {
    const patch = newTonosPatch(p);
    patch.macros.touch = 1; patch.macros.space = 0; patch.macros.bridge = 1;
    const back = deserializeTonosPatch(JSON.parse(JSON.stringify(serializeTonosPatch(patch))))!;
    assert.equal(back.instrument, p.instrument);
    assert.equal(back.presetId, p.id);
    assert.deepEqual(back.macros, patch.macros);
    const out = expandTonosMacros(back.params, back.macros);
    for (const [k, v] of Object.entries(out)) {
      if (TONOS_INDEX_PARAMS.includes(Number(k))) continue;
      assert.ok(v >= 0 && v <= 1, `${p.id} ${k}=${v}`);
    }
  }
  assert.equal(deserializeTonosPatch({ instrument: 999 })!.instrument, TONOS_INSTRUMENTS.length - 1);
});

test('physics readout: the string a note is played on', () => {
  // Oud top string: stopping an octave halves the length; tension and wave speed stay.
  const a = stringFor(19, 60), b = stringFor(19, 72);
  assert.ok(Math.abs(b.lengthStopped - a.lengthStopped / 2) < 1e-6);
  assert.equal(a.tension, b.tension);
  assert.ok(a.diameter > 5e-4 && a.diameter < 1.6e-3, `oud ⌀ ${a.diameter}`);
  // Sitar main string: slack (≈14 N) thin steel.
  const s = stringFor(11, 41);
  assert.ok(s.tension === 14 && s.diameter < 6e-4);
  // A stiff low string is wound, as string makers do.
  assert.ok(stringFor(22, 55).wound > 1);
  // Đàn bầu plays harmonics.
  assert.ok(stringFor(10, 67).harmonic >= 2);
  assert.match(describeString(19, 60), /m of .*nylon at 45 N/);
});
