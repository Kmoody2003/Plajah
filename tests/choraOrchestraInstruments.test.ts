import test from 'node:test';
import assert from 'node:assert/strict';

import type { OrchestralArticulation } from '../services/melos/beats/grooveDoc.ts';
import type { Instrument } from '../services/melos/beats/engine/InstrumentHost.ts';
import {
  AR,
  ARCO_ARTICULATIONS,
  ARCO_ENSEMBLES,
  ARCO_INSTRUMENTS,
  ARCO_SECTIONS,
  ARCO_STRING_SETS,
  AU,
  AULOS_ARTICULATIONS,
  AULOS_ENSEMBLES,
  AULOS_INSTRUMENTS,
  AULOS_SECTIONS,
  CN,
  CORNU_ARTICULATIONS,
  CORNU_ENSEMBLES,
  CORNU_INSTRUMENTS,
  CORNU_MUTES,
  CORNU_SECTIONS,
  orchestraArticulationParam,
  orchestraNoteExpressionParams,
  type OrchestraFamily,
} from '../services/melos/instruments/orchestra/params.ts';
import {
  defaultOrchestraPreset,
  presetsForOrchestra,
} from '../services/melos/instruments/orchestra/presets.ts';
import {
  applyOrchestraPatch,
  applyOrchestraPreset,
  deserializeOrchestraPatch,
  newOrchestraPatch,
  orchestraEngineParams,
  serializeOrchestraPatch,
} from '../services/melos/instruments/orchestra/patch.ts';

const ALL_ARTICULATIONS: OrchestralArticulation[] = [
  'legato',
  'spiccato',
  'staccato',
  'marcato',
  'tremolo',
  'pizzicato',
  'sul-ponticello',
  'sul-tasto',
  'con-sordino',
  'portamento',
  'flutter-tongue',
  'sfz-hairpin',
];

const FAMILIES: OrchestraFamily[] = ['arco', 'cornu', 'aulos'];

test('Orchestra param IDs and catalog sizes align with Rust params.rs, arco.rs, cornu.rs, and aulos.rs', () => {
  assert.equal(AR.ENABLE, 2100);
  assert.equal(AR.INSTRUMENT, 2101);
  assert.equal(AR.ENSEMBLE, 2102);
  assert.equal(AR.SECTION, 2103);
  assert.equal(AR.ARTIC, 2104);
  assert.equal(AR.BOW_POS, 2107);
  assert.equal(AR.MUTE, 2116);
  assert.equal(AR.STRING_SET, 2117);
  assert.equal(AR.TENSION, 2131);

  assert.equal(CN.ENABLE, 2200);
  assert.equal(CN.INSTRUMENT, 2201);
  assert.equal(CN.ENSEMBLE, 2202);
  assert.equal(CN.SECTION, 2203);
  assert.equal(CN.ARTIC, 2204);
  assert.equal(CN.MUTE, 2205);
  assert.equal(CN.WIDTH, 2220);

  assert.equal(AU.ENABLE, 2300);
  assert.equal(AU.INSTRUMENT, 2301);
  assert.equal(AU.ENSEMBLE, 2302);
  assert.equal(AU.SECTION, 2303);
  assert.equal(AU.ARTIC, 2304);
  assert.equal(AU.WIDTH, 2318);

  assert.equal(ARCO_INSTRUMENTS.length, 4);
  assert.equal(ARCO_ENSEMBLES.length, 5);
  assert.equal(ARCO_SECTIONS.length, 10);
  assert.equal(ARCO_ARTICULATIONS.length, 11);
  assert.equal(ARCO_STRING_SETS.length, 3);

  assert.equal(CORNU_INSTRUMENTS.length, 10);
  assert.equal(CORNU_ENSEMBLES.length, 6);
  assert.equal(CORNU_SECTIONS.length, 6);
  assert.equal(CORNU_ARTICULATIONS.length, 9);
  assert.equal(CORNU_MUTES.length, 6);

  assert.equal(AULOS_INSTRUMENTS.length, 15);
  assert.equal(AULOS_ENSEMBLES.length, 6);
  assert.equal(AULOS_SECTIONS.length, 4);
  assert.equal(AULOS_ARTICULATIONS.length, 7);
});

test('newOrchestraPatch / serializeOrchestraPatch / deserializeOrchestraPatch round-trip for all families', () => {
  for (const family of FAMILIES) {
    const bank = presetsForOrchestra(family);
    assert.ok(bank.length >= 5, `Expected at least 5 presets for ${family}`);
    const def = defaultOrchestraPreset(family);
    assert.equal(def.family, family);

    const patch = newOrchestraPatch(family, bank[1]);
    patch.macros.dynamics = 0.78;
    patch.macros.vibrato = 0.32;
    patch.macros.tightness = 0.85;
    patch.macros.space = 0.6;

    const raw = serializeOrchestraPatch(patch);
    const round = deserializeOrchestraPatch(family, raw);
    assert.ok(round, `deserializeOrchestraPatch returned null for ${family}`);
    assert.equal(round.id, patch.id);
    assert.equal(round.family, family);
    assert.equal(round.name, patch.name);
    assert.equal(round.presetId, patch.presetId);
    assert.equal(round.instrument, patch.instrument);
    assert.equal(round.ensemble, patch.ensemble);
    assert.equal(round.section, patch.section);
    assert.equal(round.artic, patch.artic);
    assert.equal(round.defaultNote, patch.defaultNote);
    assert.equal(round.version, 1);
    assert.deepEqual(round.macros, patch.macros);

    const switched = applyOrchestraPreset(round, bank[2]);
    assert.equal(switched.presetId, bank[2].id);
    assert.equal(switched.macros.dynamics, 0.5);
  }
});

test('applyOrchestraPatch enables only the target family and calls inst.setParams', () => {
  for (const family of FAMILIES) {
    const patch = newOrchestraPatch(family);
    let captured: Array<[number, number]> | null = null;
    const mockInst = {
      setParams(params: Array<[number, number]>) {
        captured = params;
      },
    } as unknown as Instrument;

    applyOrchestraPatch(mockInst, patch);
    if (!captured) throw new Error(`setParams should be called for ${family}`);
    const sent: Array<[number, number]> = captured;

    const map = new Map<number, number>(sent);
    assert.equal(map.get(AR.ENABLE), family === 'arco' ? 1 : 0);
    assert.equal(map.get(CN.ENABLE), family === 'cornu' ? 1 : 0);
    assert.equal(map.get(AU.ENABLE), family === 'aulos' ? 1 : 0);

    const enginePairs = orchestraEngineParams(patch);
    assert.equal(enginePairs.length, sent.length);
  }
});

test('orchestraNoteExpressionParams and orchestraArticulationParam map all OrchestralArticulation values cleanly', () => {
  for (const family of FAMILIES) {
    assert.equal(orchestraArticulationParam(family, undefined), null);
    assert.deepEqual(orchestraNoteExpressionParams(family, undefined), []);

    for (const art of ALL_ARTICULATIONS) {
      const pairs = orchestraNoteExpressionParams(family, art);
      assert.ok(pairs.length >= 1, `${family} should map ${art} to at least 1 param pair`);
      for (const [id, val] of pairs) {
        assert.ok(Number.isFinite(id) && id >= 2100 && id < 2400, `Param id ${id} out of orchestra range`);
        assert.ok(Number.isFinite(val) && val >= 0, `Param value ${val} invalid`);
      }

      const primary = orchestraArticulationParam(family, art);
      assert.deepEqual(primary, pairs[0]);
    }
  }

  // Spot-check key mappings
  assert.deepEqual(orchestraArticulationParam('arco', 'pizzicato'), [AR.ARTIC, 3]);
  assert.deepEqual(orchestraArticulationParam('arco', 'con-sordino'), [AR.MUTE, 1]);
  assert.deepEqual(orchestraArticulationParam('cornu', 'sfz-hairpin'), [CN.ARTIC, 4]);
  assert.deepEqual(orchestraArticulationParam('cornu', 'con-sordino'), [CN.MUTE, 1]);
  assert.deepEqual(orchestraArticulationParam('aulos', 'flutter-tongue'), [AU.ARTIC, 4]);
});
