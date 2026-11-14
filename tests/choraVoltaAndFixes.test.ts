import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyDesign, voltaSynthDesign } from '../services/elec/designs.ts';
import { simulate } from '../services/elec/sim.ts';
import { checkCircuit, summarize } from '../services/elec/checks.ts';
import {
  analyzeVoltaCircuit,
  buildVoltaCircuitDesign,
  launchVoltaInPlajahBuilder,
  VOLTA_NODE_PROBES,
} from '../services/melos/instruments/volta/circuitSpec.ts';
import { VOLTA } from '../services/melos/instruments/volta/params.ts';
import { VOLTA_PRESETS, VOLTA_MACRO_ORDER } from '../services/melos/instruments/volta/presets.ts';
import {
  deserializeVoltaPatch,
  importAuraPresetToVolta,
  importOndaPresetToVolta,
  newVoltaPatch,
  serializeVoltaPatch,
} from '../services/melos/instruments/volta/patch.ts';
import { AURA_PRESETS } from '../services/melos/instruments/aura/presets.ts';
import { FACTORY_PRESETS as ONDA_PRESETS } from '../services/melos/instruments/onda/presets.ts';
import { buildVoltaCadModel } from '../services/melos/instruments/cad3d/voltaCadModel.ts';
import { computePerformanceKinematics } from '../services/melos/instruments/cad3d/performanceKinematics.ts';
import { makeInstrumentTrack } from '../services/melos/beats/instrumentFactory.ts';
import { instrumentMacros } from '../services/melos/beats/controlPages.ts';
import { researchCreativeReference } from '../services/melos/beats/band/referenceResearch.ts';

test('VOLTA Electronics Core passes verifyDesign, MNA DC+Transient SPICE & ERC checks', () => {
  const design = voltaSynthDesign({ ladderPos: 0.6, clipPos: 0.45, vcoFreqHz: 220 });
  const issues = verifyDesign(design);
  assert.deepEqual(issues, [], 'voltaSynthDesign must have zero catalog verification issues');

  const dc = simulate(design.circuit, { mode: 'dc' });
  const tran = simulate(design.circuit, design.sim);
  assert.equal(dc.converged, true, 'DC operating point must converge');
  assert.equal(tran.converged, true, 'Transient SPICE solve must converge');

  const findings = checkCircuit(design.circuit, tran);
  const s = summarize(findings);
  assert.equal(s.errors, 0, 'ERC/simulation safety must have 0 errors');
  assert.equal(s.warnings, 0, 'ERC/simulation safety must have 0 warnings');
  assert.ok(s.passes >= 20, `Expected >= 20 passing ERC checks, got ${s.passes}`);
});

test('analyzeVoltaCircuit produces sourced real-parts BOM, 3D CNC enclosure & valid node probe voltages', () => {
  const patch = newVoltaPatch(VOLTA_PRESETS[0]);
  const analysis = analyzeVoltaCircuit(patch);

  assert.equal(VOLTA_NODE_PROBES.length, 7);
  assert.ok(analysis.bom.length >= 10, 'BOM should list all physical synth components');
  assert.ok(analysis.enclosure.W > 150 && analysis.enclosure.panels.entities.length >= 6);
  const railDc = analysis.nodeDcVoltages.rail;
  assert.ok(railDc > 4.7 && railDc < 5.3, `Expected ~5V regulated analog bus, got ${railDc}`);

  const built = launchVoltaInPlajahBuilder(patch);
  assert.equal(built.launch.room, 'elec');
  assert.equal(built.launch.starter, 'volta-super-synth');
  assert.ok(built.circuit.parts.length >= 12);

  // Patch macro & knob tuning should update builder circuit potentiometer position
  patch.params[VOLTA.LADDER_CUTOFF] = 0.85;
  const retuned = buildVoltaCircuitDesign(patch);
  assert.ok(retuned.title.includes(patch.name));
});

test('VOLTA imports existing AURA and ONDA patches cleanly with round-trip serialization', () => {
  const fromAura = importAuraPresetToVolta(AURA_PRESETS[0]);
  assert.ok(fromAura.name.includes(AURA_PRESETS[0].name));
  const roundAura = deserializeVoltaPatch(serializeVoltaPatch(fromAura));
  assert.ok(roundAura && roundAura.params[VOLTA.LADDER_CUTOFF] > 0 && roundAura.params[VOLTA.LADDER_CUTOFF] <= 1);

  const fromOnda = importOndaPresetToVolta(ONDA_PRESETS[0]);
  assert.ok(fromOnda.name.includes(ONDA_PRESETS[0].name));
  const roundOnda = deserializeVoltaPatch(serializeVoltaPatch(fromOnda));
  assert.ok(roundOnda && roundOnda.macros.morph >= 0 && roundOnda.macros.morph <= 1);
});

test('VOLTA 3D CAD cutaway model exposes PCB parts & aligns with synth hand/finger kinematics', () => {
  const patch = newVoltaPatch(VOLTA_PRESETS[8] ?? VOLTA_PRESETS[0]);
  const solidCad = buildVoltaCadModel(patch.params, false);
  const xrayCad = buildVoltaCadModel(patch.params, true);

  const faceSolid = solidCad.model.meshes.find((p) => p.id === 'volta_faceplate');
  const faceXray = xrayCad.model.meshes.find((p) => p.id === 'volta_faceplate');
  assert.ok(faceSolid && faceXray);
  assert.equal(faceSolid.opacity ?? 1, 1);
  assert.ok((faceXray.opacity ?? 1) < 0.5, 'Cutaway mode must make faceplate X-Ray translucent');
  assert.ok(xrayCad.model.meshes.some((p) => p.id === 'pcb_main'));
  assert.ok(xrayCad.model.meshes.some((p) => p.id === 'psu_coil'));
  assert.ok(xrayCad.model.meshes.some((p) => p.id === 'tube_0'));
  assert.ok(xrayCad.model.meshes.some((p) => p.id === 'pkey_13'));

  const kin = computePerformanceKinematics({
    archetype: 'synth',
    heldNotes: [50, 54, 57],
    lastNote: 50,
    velocity: 0.9,
    energy: 0.65,
    pitchBend: 0,
    modWheel: 0.5,
    timeSec: 0.25,
  });
  const rhPrimary = kin.fingers.find((f) => f.id === 'synth_rh_key');
  assert.ok(rhPrimary && rhPrimary.active);
  assert.ok(Math.abs(rhPrimary.pos[0] - (-0.325 + 2 * 0.05)) < 1e-4, 'Right hand should align to pkey_2');
  assert.ok(Math.abs(rhPrimary.pos[1] - (-0.30)) < 1e-4, 'Right hand Y should track keybed');
  assert.equal(kin.fingers.filter((f) => f.hand === 'right').length, 3, 'Should track poly chord fingers');

  // Verify brass valves, trombone slide, and woodwind kinematics + airflow remain active & finite
  const trumpetKin = computePerformanceKinematics({
    archetype: 'brass-valves',
    heldNotes: [62], // D4 -> 1-3 valve combination
    lastNote: 62,
    velocity: 0.85,
    energy: 0.7,
    pitchBend: 0,
    modWheel: 0.2,
    timeSec: 0.4,
  });
  assert.deepEqual(trumpetKin.brassValves, [true, false, true]);
  assert.ok(trumpetKin.airflow.active && trumpetKin.airflow.intensity > 0.3);

  const tromboneKin = computePerformanceKinematics({
    archetype: 'brass-slide',
    heldNotes: [55],
    lastNote: 55,
    velocity: 0.8,
    energy: 0.6,
    pitchBend: 0.5,
    modWheel: 0,
    timeSec: 0.4,
  });
  assert.ok(tromboneKin.slideExtension >= 0 && tromboneKin.slideExtension <= 1);

  const saxKin = computePerformanceKinematics({
    archetype: 'woodwind-keys',
    heldNotes: [60],
    lastNote: 60,
    velocity: 0.75,
    energy: 0.55,
    pitchBend: 0,
    modWheel: 0.1,
    timeSec: 0.4,
    isSax: true,
  });
  assert.equal(saxKin.woodwindKeys.length, 6);
  assert.ok(saxKin.airflow.active);
});

test('Beats track factory and MEKA control pages support VOLTA tracks & macros', async () => {
  const trk = makeInstrumentTrack('volta', 0);
  assert.equal(trk.instrument?.type, 'volta');
  const macros = instrumentMacros(trk);
  assert.equal(macros.length, VOLTA_MACRO_ORDER.length);
  assert.ok(macros.some((m) => m.label.toLowerCase().includes('morph')));

  const research = await researchCreativeReference('Blade Runner analog synth', { activeInstrument: 'volta' });
  assert.ok(research.recommendedPresets.some((p) => p.instrument === 'volta'));
});
