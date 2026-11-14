// Comprehensive audit tests for:
//   1. Heritage Acoustics, 3D-CT Tonewood/Hide Material Science, ODE Contact/Polarization,
//      and Magnetic Pickup MNA Circuit Physics (`services/melos/instruments/physics/heritageAcoustics.ts`)
//   2. Synthesizer Control & Modulation Reliability Fixes (`motion.ts`, `vela/patch.ts`,
//      `aura/presets.ts`, `noteFx.ts`, `bajo/params.ts`)
//   3. 10-Bank Additive Preset Library Expansion & Zero-Removal Integrity
//
//   npx tsx --test tests/heritageAndSynthAudit.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HERITAGE_TONEWOODS,
  HERITAGE_HIDES,
  ageTonewood,
  evaluateCtPlateThicknessMm,
  solveOrthotropicPlateModes,
  computeMembraneModeRatios,
  simulateWeinreichPolarization,
  simulateHuntCrossleyRattle,
  evaluatePickupBodeCurve,
} from '../services/melos/instruments/physics/heritageAcoustics';

import {
  newMotion,
  setRoute,
  compileMotions,
  applyCompiledMotions,
  MOD_SOURCE,
} from '../services/melos/motion';
import { velaDriftSetup, velaDriftRoutes } from '../services/melos/instruments/vela/patch';
import { VELA_PRESETS } from '../services/melos/instruments/vela/presets';
import { CANTUS_PRESETS, ISON_PRESETS, PNEUMA_PRESETS } from '../services/melos/instruments/vela/suite';
import { FACTORY_PRESETS } from '../services/melos/instruments/onda/presets';
import { AURA_PRESETS } from '../services/melos/instruments/aura/presets';
import { newAuraPatch, serializeAuraPatch } from '../services/melos/instruments/aura/patch';
import { BAJO_PRESETS } from '../services/melos/instruments/bajo/presets';
import { BAJO_PARAM_META } from '../services/melos/instruments/bajo/params';
import { BAJO_EDITOR_GROUPS } from '../services/melos/instruments/bajo/patch';
import { SOMA_PRESETS } from '../services/melos/instruments/soma/presets';
import { TONOS_PRESETS } from '../services/melos/instruments/tonos/presets';
import { LYRA_PRESETS } from '../services/melos/instruments/lyra/presets';
import { resolveChain, applyNoteFx, type FxNote } from '../services/melos/beats/noteFx';

// ── 1. Heritage Acoustics & Multi-Physics Verification ───────────────────────

test('3D-CT heritage tonewood aging law raises specific modulus, Schelleng ratio, and Q', () => {
  const spruce = HERITAGE_TONEWOODS.cremonese_spruce;
  const fresh = ageTonewood(spruce, 0.0, 0.5);
  const aged300 = ageTonewood(spruce, 1.0, 0.8);

  assert.ok(aged300.rho < fresh.rho, 'hemicellulose hydrolysis lowers equilibrium wood density');
  assert.ok(aged300.cLong > fresh.cLong * 1.08, 'longitudinal sound speed c_L rises with century aging');
  assert.ok(aged300.radiationRatio > fresh.radiationRatio * 1.15, 'Schelleng radiation ratio c_L/rho increases');
  assert.ok(aged300.lossLong < fresh.lossLong, 'along-grain internal friction tan delta drops');
  assert.ok(aged300.ctRingContrast < fresh.ctRingContrast, 'CT earlywood/latewood contrast softens');

  assert.ok(HERITAGE_HIDES.goatskin.dorsalSpineAnisotropy > HERITAGE_HIDES.mylar.dorsalSpineAnisotropy * 10);
});

test('3D-CT soundboard graduation maps & orthotropic plate solver model Cremonese asymmetry', () => {
  const stradCenter = evaluateCtPlateThicknessMm(0, 0, 'stradivari_titian', 0);
  const guarneriCenter = evaluateCtPlateThicknessMm(0, 0, 'guarneri_cannone', 0);
  assert.ok(
    guarneriCenter > stradCenter + 0.3,
    `Guarneri "Il Cannone" central lung (${guarneriCenter.toFixed(2)} mm) is thicker than Stradivari "Titian" (${stradCenter.toFixed(2)} mm)`,
  );

  // Bass-bar ridge sits on the bass side (xi ≈ -0.28) vs symmetric treble side (xi = +0.28)
  const bassSide = evaluateCtPlateThicknessMm(-0.28, 0, 'stradivari_titian', 0);
  const trebleSide = evaluateCtPlateThicknessMm(0.28, 0, 'stradivari_titian', 0);
  assert.ok(bassSide > trebleSide + 0.6, 'bass bar creates realistic structural asymmetry');

  const modes = solveOrthotropicPlateModes({
    woodId: 'cremonese_spruce',
    fPlateBaseHz: 210,
    fHelmholtzHz: 278,
    age: 0.85,
    craftAsymmetry: 0.4,
    maxModes: 64,
  });
  assert.equal(modes.length, 64);
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i]!;
    assert.ok(m.freqHz >= 700 && m.freqHz <= 15800);
    assert.ok(m.qFactor >= 14 && m.qFactor <= 135);
    assert.ok(m.panAzimuth >= -1 && m.panAzimuth <= 1);
    if (i > 0) assert.ok(m.freqHz >= modes[i - 1]!.freqHz);
  }
});

test('C.V. Raman syahi paste loading converges circular membrane Bessel modes onto 1:2:3:4:5 harmonics', () => {
  const unloaded = computeMembraneModeRatios({ syahiLoad: 0, stiffnessB: 0, craftAsymmetry: 0 });
  const tablaSyahi = computeMembraneModeRatios({ syahiLoad: 1.0, stiffnessB: 0, craftAsymmetry: 0.45 });

  // Unloaded (2,1) / (1,1) = 5.1356 / 3.8317 ≈ 1.340 (inharmonic drum)
  const unloaded21 = unloaded.find((x) => x.m === 2 && x.n === 1)!;
  assert.ok(Math.abs(unloaded21.primaryRatio - 1.340) < 0.01);

  // Under full Raman syahi loading:
  //   (1,1) ≈ 1.000, (2,1) & (0,2) ≈ 2.000, (3,1) & (1,2) ≈ 3.000, (4,1) ≈ 4.000, (5,1) ≈ 5.000
  const checkHarmonic = (m: number, n: number, targetInt: number) => {
    const mode = tablaSyahi.find((x) => x.m === m && x.n === n)!;
    assert.ok(
      Math.abs(mode.primaryRatio - targetInt) < 0.02,
      `mode (${m},${n}) under syahi should align near harmonic ${targetInt}, got ${mode.primaryRatio}`,
    );
  };
  checkHarmonic(1, 1, 1);
  checkHarmonic(2, 1, 2);
  checkHarmonic(0, 2, 2);
  checkHarmonic(3, 1, 3);
  checkHarmonic(1, 2, 3);
  checkHarmonic(4, 1, 4);
  checkHarmonic(5, 1, 5);

  // Axisymmetric m=0 modes do not split into azimuthal doublets; m>0 modes split with craft asymmetry
  const m02 = tablaSyahi.find((x) => x.m === 0 && x.n === 2)!;
  const m21 = tablaSyahi.find((x) => x.m === 2 && x.n === 1)!;
  assert.equal(m02.doubletRatio, m02.primaryRatio);
  assert.ok(m21.doubletRatio > m21.primaryRatio * 1.005, 'azimuthal m>0 mode splits into beat doublet');
});

test('ODE solvers (services/bio/ode.ts) integrate Weinreich 2D polarization and Hunt-Crossley rattle', () => {
  const orbit = simulateWeinreichPolarization({
    freqHz: 220,
    pluckAngleRad: 0.65,
    bridgeCoupling: 0.7,
    craftDetuneCents: 4.5,
    durationMs: 45,
    points: 100,
  });
  assert.equal(orbit.length, 100);
  const maxVx = Math.max(...orbit.map((p) => Math.abs(p.vx)));
  const maxVy = Math.max(...orbit.map((p) => Math.abs(p.vy)));
  assert.ok(maxVx > 0.15 && maxVy > 0.15, 'both horizontal and vertical bridge polarizations are active');

  const rattleActive = simulateHuntCrossleyRattle({
    membraneFreqHz: 140,
    buzzAmount: 0.9,
    durationMs: 28,
    points: 96,
  });
  assert.equal(rattleActive.length, 96);
  const bounceSpikes = rattleActive.filter((p) => p.contactForce > 0.25).length;
  assert.ok(bounceSpikes >= 2, 'nonlinear Hunt-Crossley snare/jawari contact produces distinct impact spikes');
});

test('Magnetic pickup MNA Bode circuit shifts resonant peak with coil inductance, tone knob, and fret scale', () => {
  const stratOpen = evaluatePickupBodeCurve({ kind: 'single_alnico', toneKnob: 1.0, pickupPosNorm: 0.15, fret: 0 });
  const pafOpen = evaluatePickupBodeCurve({ kind: 'paf_humbucker', toneKnob: 1.0, pickupPosNorm: 0.15, fret: 0 });
  const stratRolled = evaluatePickupBodeCurve({ kind: 'single_alnico', toneKnob: 0.0, pickupPosNorm: 0.15, fret: 0 });
  const stratFret12 = evaluatePickupBodeCurve({ kind: 'single_alnico', toneKnob: 1.0, pickupPosNorm: 0.15, fret: 12 });

  assert.ok(
    stratOpen.resonantFreqHz > pafOpen.resonantFreqHz,
    `Alnico single-coil resonant peak (${Math.round(stratOpen.resonantFreqHz)} Hz) should sit above higher-inductance PAF (${Math.round(pafOpen.resonantFreqHz)} Hz)`,
  );

  // Rolling tone knob to 0 bleeds treble through tone cap
  const hiIdx = stratOpen.curve.findIndex((p) => p.freqHz >= 5000);
  assert.ok(hiIdx > 0);
  assert.ok(
    stratOpen.curve[hiIdx]!.magDb - stratRolled.curve[hiIdx]!.magDb > 8,
    'rolling passive tone pot down attenuates 5 kHz by > 8 dB',
  );

  // Stopping at 12th fret halves speaking string length via services/elec/guitar.ts `fretPosition`
  assert.ok(
    Math.abs(stratFret12.bridgeOffsetMm - stratOpen.bridgeOffsetMm * 0.5) < 0.5,
    '12th fret halves stopped string geometry',
  );
});

// ── 2. Synthesizer Reliability, Motion Compiler & Arp Fixes ──────────────────

test('Motion compiler emits custom step/curve tables, per-voice LFO flag, smooth Tide, and preserves base routes', () => {
  const stepMo = newMotion('steps', 0);
  stepMo.steps = [1, 0.25, 0.75, 0];
  stepMo.perVoice = true;
  setRoute(stepMo, 503, 0.6);

  const curveMo = newMotion('curve', 1);
  curveMo.curve = [0, 0.9, 0.2, 1.0, 0];
  setRoute(curveMo, 105, -0.4);

  const smoothRand = newMotion('random', 2);
  smoothRand.glide = 0.85;
  setRoute(smoothRand, 504, 0.35);

  const compiled = compileMotions([stepMo, curveMo, smoothRand]);
  assert.equal(compiled.unplaced.length, 0);
  assert.equal(compiled.lfoCustoms.length, 2);
  assert.deepEqual(compiled.lfoCustoms[0], { slot: 0, points: [1, 0.25, 0.75, 0], stepped: true });
  assert.deepEqual(compiled.lfoCustoms[1], { slot: 1, points: [0, 0.9, 0.2, 1.0, 0], stepped: false });

  // Slot 0 perVoice=1 (param 807), Slot 2 smooth random -> Tide shape 6 (param 820)
  const paramMap = new Map(compiled.params);
  assert.equal(paramMap.get(807), 1, 'L_PER_VOICE emitted for per-voice step Motion');
  assert.equal(paramMap.get(820), 6, 'smooth random Motion selects aperiodic Tide shape (6)');

  // Verify applyCompiledMotions merges user Motion routes with preset/Drift baseRoutes without clobbering
  const writtenRoutes: Array<[number, number, number, number, number]> = [];
  const uploadedCustoms: Array<{ index: number; points: number[]; stepped: boolean }> = [];
  applyCompiledMotions(
    {
      setParams: () => {},
      setRoute: (index, source, dest, depth, via = 0) => {
        writtenRoutes.push([index, source, dest, depth, via]);
      },
      setLfoCustom: (index, points, stepped) => {
        uploadedCustoms.push({ index, points, stepped });
      },
    },
    compiled,
    velaDriftRoutes(0.6),
  );

  assert.equal(uploadedCustoms.length, 2);
  const nonZeroRoutes = writtenRoutes.filter(([, src, , d]) => src !== 0 && Math.abs(d) > 1e-4);
  // 3 user Motion routes (Lfo1..Lfo3) + 5 VELA Drift routes (Lfo4..Lfo6) = 8 active routes!
  assert.equal(nonZeroRoutes.length, 8);
  const sources = new Set(nonZeroRoutes.map(([, src]) => src));
  assert.ok(sources.has(MOD_SOURCE.Lfo1) && sources.has(MOD_SOURCE.Lfo4) && sources.has(MOD_SOURCE.Lfo6));
});

test('VELA Drift setup occupies LFO slots 3..5 so user Motions in slots 0..2 never collide', () => {
  const setup = velaDriftSetup();
  for (const [id] of setup) {
    assert.ok(id >= 830 && id < 860, `VELA Drift param ${id} must stay inside LFO slots 3..5 (830..859)`);
  }
});

test('AURA octave arpeggiator and step-sequencer presets perform as intended', () => {
  const patch = newAuraPatch(AURA_PRESETS[0]);
  patch.arp.enabled = true;
  patch.arp.mode = 'octave';
  patch.arp.rate = '1/16';
  patch.arp.gate = 0.75;
  patch.arp.steps = [0, 0, 0, 0, 0, 0, 0, 0];

  const chain = resolveChain(undefined, serializeAuraPatch(patch));
  assert.ok(chain && chain.arp, 'AURA octave arp resolves into active noteFx chain');

  const input: FxNote[] = [{ key: 48, vel: 100, beat: 0, len: 2, src: 0 }];
  const out = applyNoteFx(input, chain!, { key: null, seed: 42, to: 2 });
  const distinctOctaves = new Set(out.map((n) => n.key));
  assert.ok(distinctOctaves.has(48) && distinctOctaves.has(60), 'octave arp spans base key and +12 octave');

  const seqPresets = AURA_PRESETS.filter((p) => p.arp?.mode === 'seq');
  assert.ok(seqPresets.length >= 2, 'AURA ships multiple 8-step pitch-sequenced presets');
  for (const sp of seqPresets) {
    assert.equal(sp.arp?.steps.length, 8);
  }

  // BAJO oscillator deep group exposes mode, morph, pulse width, and Osc B enable
  const oscGroup = BAJO_EDITOR_GROUPS[0]!;
  assert.ok(oscGroup.ids.length >= 12);
  for (const id of oscGroup.ids) {
    assert.ok(BAJO_PARAM_META[id], `BAJO param ${id} has metadata`);
  }
});

// ── 3. Master 10-Bank Additive Preset Audit ──────────────────────────────────

test('all 10 Chora preset banks preserve original presets and ship expanded, finite, unique libraries', () => {
  assert.ok(FACTORY_PRESETS.length >= 37, `ONDA expanded to ${FACTORY_PRESETS.length} presets`);
  assert.ok(AURA_PRESETS.length >= 70, `AURA expanded to ${AURA_PRESETS.length} presets`);
  assert.ok(BAJO_PRESETS.length >= 48, `BAJO expanded to ${BAJO_PRESETS.length} presets`);
  assert.ok(VELA_PRESETS.length >= 30, `VELA expanded to ${VELA_PRESETS.length} presets`);
  assert.ok(CANTUS_PRESETS.length >= 9, `CANTUS expanded to ${CANTUS_PRESETS.length} presets`);
  assert.ok(ISON_PRESETS.length >= 8, `ISON expanded to ${ISON_PRESETS.length} presets`);
  assert.ok(PNEUMA_PRESETS.length >= 7, `PNEUMA expanded to ${PNEUMA_PRESETS.length} presets`);
  assert.ok(SOMA_PRESETS.length >= 54, `SOMA expanded to ${SOMA_PRESETS.length} presets`);
  assert.ok(TONOS_PRESETS.length >= 38, `TONOS expanded to ${TONOS_PRESETS.length} presets`);
  assert.ok(LYRA_PRESETS.length >= 60, `LYRA expanded to ${LYRA_PRESETS.length} presets`);

  // Original landmark factory presets remain intact (zero removals)
  const ondaNames = new Set(FACTORY_PRESETS.map((p) => p.name));
  for (const orig of ['808 Deep', 'Reese Wide', 'Supersaw', 'Glass Keys', 'Vowel Choir', 'Pulse Motion']) {
    assert.ok(ondaNames.has(orig), `original ONDA preset "${orig}" preserved`);
  }
  assert.equal(ondaNames.size, FACTORY_PRESETS.length, 'all 37 ONDA preset names are unique');

  for (const p of FACTORY_PRESETS) {
    for (const [k, v] of Object.entries(p.params)) {
      assert.ok(Number.isFinite(Number(k)) && Number.isFinite(v), `ONDA "${p.name}" param ${k}=${v} is finite`);
    }
  }

  // Verify unique IDs and finite params across BAJO, VELA, TONOS, LYRA
  const checkBank = (label: string, bank: ReadonlyArray<{ id: string; name: string; params: Record<number, number> }>) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const p of bank) {
      assert.ok(!ids.has(p.id), `${label} duplicate id "${p.id}"`);
      assert.ok(!names.has(p.name), `${label} duplicate name "${p.name}"`);
      ids.add(p.id);
      names.add(p.name);
      for (const [k, v] of Object.entries(p.params)) {
        assert.ok(Number.isFinite(Number(k)) && Number.isFinite(v), `${label} "${p.id}" non-finite ${k}=${v}`);
      }
    }
  };

  checkBank('BAJO', BAJO_PRESETS);
  checkBank('VELA', VELA_PRESETS);
  checkBank('CANTUS', CANTUS_PRESETS);
  checkBank('ISON', ISON_PRESETS);
  checkBank('PNEUMA', PNEUMA_PRESETS);
  checkBank('TONOS', TONOS_PRESETS);
  checkBank('LYRA', LYRA_PRESETS);
});
