// The suite's contract.
//
// Four instruments sharing an engine is only honest if they are genuinely different tools. These
// tests check that: each bank has to occupy parameter territory the others do not, or the suite
// is four preset folders wearing four names.
//
//   npx tsx --test tests/velaSuite.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANTUS_PRESETS, ISON_PRESETS, PNEUMA_PRESETS, SUITE, SUITE_ORDER,
  ensembleFor, presetsFor, type SuiteInstrument,
} from '../services/melos/instruments/vela/suite';
import { VELA_PRESETS } from '../services/melos/instruments/vela/presets';
import { M, X } from '../services/melos/instruments/vela/params';
import { createSession } from '../services/ora/stillness/emotionalEngine';

const ALL: Record<SuiteInstrument, typeof VELA_PRESETS> = {
  vela: VELA_PRESETS,
  cantus: CANTUS_PRESETS,
  ison: ISON_PRESETS,
  pneuma: PNEUMA_PRESETS,
};

test('every instrument has an identity, a bank and unique preset ids', () => {
  const seen = new Set<string>();
  for (const id of SUITE_ORDER) {
    const identity = SUITE[id];
    assert.ok(identity, `${id} needs an identity`);
    assert.ok(identity.name && identity.blurb && identity.purpose, `${id} needs copy`);
    assert.match(identity.accent, /^#[0-9A-Fa-f]{6}$/, `${id} needs a real accent colour`);
    assert.equal(Object.keys(identity.macroLabels).length, 4, `${id} names all four macros`);

    const bank = ALL[id];
    assert.ok(bank.length >= 3, `${id} needs a real bank (has ${bank.length})`);
    for (const p of bank) {
      assert.ok(!seen.has(p.id), `duplicate preset id "${p.id}"`);
      seen.add(p.id);
      assert.ok(p.name && p.blurb && p.description, `${p.id} needs copy`);
    }
  }
});

test('the macros are named differently per instrument — same target, different idea', () => {
  const airNames = SUITE_ORDER.map((id) => SUITE[id].macroLabels.air);
  assert.ok(new Set(airNames).size > 1, `"Air" should not mean the same thing everywhere: ${airNames}`);
  const bodyNames = SUITE_ORDER.map((id) => SUITE[id].macroLabels.body);
  assert.ok(new Set(bodyNames).size > 1, `"Body" should differ per instrument: ${bodyNames}`);
});

test('CANTUS is the only bank that leans on the overtone spotlight', () => {
  // Overtone singing is what makes it a voice rather than a body, so it has to be the thing
  // this instrument does and the others mostly do not.
  const avgSpotlight = (bank: typeof VELA_PRESETS) =>
    bank.reduce((a, p) => a + (p.params[M.SPOTLIGHT] ?? 0), 0) / bank.length;

  const cantus = avgSpotlight(CANTUS_PRESETS);
  const vela = avgSpotlight(VELA_PRESETS);
  assert.ok(cantus > 0.3, `CANTUS should use the spotlight heavily (avg ${cantus.toFixed(2)})`);
  assert.ok(cantus > vela * 3, `and far more than VELA (${cantus.toFixed(2)} vs ${vela.toFixed(2)})`);
  assert.ok(
    CANTUS_PRESETS.some((p) => (p.params[M.SPOTLIGHT] ?? 0) > 0.9),
    'at least one CANTUS preset should be a full throat-singing demonstration',
  );
});

test('every CANTUS and ISON preset is driven, not struck', () => {
  // Mode 0 is Struck. A voice or a drone that decays on its own is not one.
  for (const p of CANTUS_PRESETS) {
    assert.notEqual(p.params[M.MODE], 0, `${p.id} must not be a struck body`);
  }
  const drivenIson = ISON_PRESETS.filter((p) => p.params[M.MODE] !== 0).length;
  assert.ok(drivenIson >= ISON_PRESETS.length - 1, 'at most one ISON preset may be struck (Tanpura)');
});

test('PNEUMA is breath-led — the exciter carries it, not the body', () => {
  for (const p of PNEUMA_PRESETS) {
    assert.ok((p.params[X.GRAIN] ?? 0) > 0.8, `${p.id} needs heavy air noise (${p.params[X.GRAIN]})`);
    assert.equal(p.params[X.TYPE], 1, `${p.id} should be blown`);
    // Few partials: an air column is not a bell.
    assert.ok((p.params[M.PARTIALS] ?? 1) <= 0.3, `${p.id} should be spectrally simple`);
  }
  const avgPulse = PNEUMA_PRESETS.reduce((a, p) => a + (p.params[X.PULSE] ?? 0), 0) / PNEUMA_PRESETS.length;
  assert.ok(avgPulse > 0.4, `breath should visibly pulse (avg ${avgPulse.toFixed(2)})`);
});

test('ISON is the stillest bank — a drone must not compete', () => {
  const avg = (bank: typeof VELA_PRESETS, id: number) =>
    bank.reduce((a, p) => a + (p.params[id] ?? 0), 0) / bank.length;
  // Long morphs, slow beating: change measured in minutes rather than seconds.
  assert.ok(avg(ISON_PRESETS, M.MORPH_TIME) > avg(VELA_PRESETS, M.MORPH_TIME),
    'ISON should evolve more slowly than VELA');
  const bourdon = ISON_PRESETS.find((p) => p.id === 'ison-bourdon');
  assert.ok(bourdon, 'Bourdon is the reference drone');
  assert.ok((bourdon!.params[M.ANIMA] ?? 1) < 0.35, 'the reference drone must be nearly still');
});

test('the banks occupy different parameter territory', () => {
  // A crude fingerprint over the controls that define character. If two banks land in the same
  // place, they are the same instrument with different names.
  const KEYS = [M.MODE, M.FORMANT, M.SPOTLIGHT, M.PARTIALS, M.INHARM, X.TYPE, X.GRAIN, M.BEAT];
  const centroid = (bank: typeof VELA_PRESETS) =>
    KEYS.map((k) => bank.reduce((a, p) => a + (p.params[k] ?? 0), 0) / bank.length);

  const cs = SUITE_ORDER.map((id) => ({ id, c: centroid(ALL[id]) }));
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const d = Math.sqrt(cs[i].c.reduce((s, v, k) => s + (v - cs[j].c[k]) ** 2, 0));
      assert.ok(d > 0.5, `${cs[i].id} and ${cs[j].id} are too alike (distance ${d.toFixed(2)})`);
    }
  }
});

test('the ensemble always has a drone, and only the Turn brings in a body', () => {
  const session = createSession({ seed: 7, durationSec: 20 * 60, arrival: 3 });
  let sawVela = false;
  for (let t = 0; t <= 20 * 60; t += 5) {
    const s = session.at(t);
    const layers = ensembleFor(s.phase, s.depth, s.arousal);
    assert.ok(layers.length > 0, `something must be sounding at t=${t}`);
    assert.ok(layers.some((l) => l.instrument === 'ison'), `the drone must never leave (t=${t})`);
    for (const l of layers) {
      assert.ok(l.level > 0 && l.level <= 1, `level out of range: ${l.level}`);
      const bank = l.instrument === 'vela' ? VELA_PRESETS : presetsFor(l.instrument);
      assert.ok(bank.some((p) => p.id === l.presetId), `unknown preset "${l.presetId}"`);
      if (l.instrument === 'vela') {
        sawVela = true;
        assert.equal(s.phase, 'turn', 'a struck body appears only at the Turn');
      }
    }
  }
  assert.ok(sawVela, 'the Turn must actually happen');
});

test('ensemble layers crossfade rather than switch', () => {
  const session = createSession({ seed: 21, durationSec: 20 * 60 });
  let prev: Map<string, number> | null = null;
  let maxJump = 0;
  for (let t = 0; t <= 20 * 60; t += 5) {
    const s = session.at(t);
    const now = new Map(ensembleFor(s.phase, s.depth, s.arousal).map((l) => [l.instrument, l.level]));
    if (prev) {
      for (const inst of ['ison', 'cantus', 'pneuma']) {
        const a = prev.get(inst) ?? 0;
        const b = now.get(inst) ?? 0;
        maxJump = Math.max(maxJump, Math.abs(b - a));
      }
    }
    prev = now;
  }
  // Five seconds apart, a continuous layer should never lurch. The Turn is allowed to be an
  // event; these three are not.
  assert.ok(maxJump < 0.12, `layers must fade, not switch (largest 5 s jump ${maxJump.toFixed(3)})`);
});
