// Era Clash 3D campaign in Chora Studio: Chapter I is a deterministic Chora project led by a SOMA taiko
// ensemble, with no house kit and none of the Ravencrest palette. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUES_3D, ERA_CLASH_3D_FORM, ERA_CLASH_3D_STINGERS, buildEraClash3dGrooveDoc, buildEraClash3dStingerDoc,
  eraClash3dProjectCopy, eraClash3dProjects, isEraClash3dProjectId,
} from '../services/melos/eraClash3dChoraProjects';
import { isEraClashProjectId } from '../services/melos/eraClashChoraProjects';
import { sectionSpans } from '../services/melos/beats/songSections';

const strip = (d: unknown) => JSON.stringify({ ...(d as object), createdAt: 0, updatedAt: 0 });

test('3D cues are catalogued apart from the 2D arena cues', () => {
  const list = eraClash3dProjects();
  assert.equal(list.length, CUES_3D.length);
  for (const p of list) { assert.ok(isEraClash3dProjectId(p.id)); assert.ok(!isEraClashProjectId(p.id)); }
});

test('3d-ch1: deterministic, taiko-led, no kit, no Ravencrest palette', () => {
  const a = buildEraClash3dGrooveDoc('3d-ch1'), b = buildEraClash3dGrooveDoc('eraclash-3d-ch1');
  assert.equal(strip(a), strip(b));
  assert.ok(a.bpm >= 90 && a.bpm <= 110);
  const spans = sectionSpans(a);
  assert.equal(spans.reduce((n, s) => n + s.section.bars, 0), ERA_CLASH_3D_FORM.TOTAL_BARS);
  assert.deepEqual(a.loop, { on: true, startBeats: 16, endBeats: 144 }, 'loop region = the first body');

  // No MEKA drum-synth kit anywhere; Group A unused.
  assert.ok(a.kit.every((p) => !p.drumSynth));
  assert.ok(a.patterns.every((p) => p.groupIdx === 1));

  // SOMA taiko: O-Daiko and Shime are the real presets and both play in the battle.
  const soma = a.arrangement.filter((t) => t.instrument?.type === 'soma');
  const presets = soma.map((t) => t.instrument!.presetName);
  assert.ok(presets.some((n) => /O-Daiko/.test(n!)) && presets.some((n) => /Shime/.test(n!)));
  const battle = a.patterns.find((p) => p.id.endsWith('_bat3'))!;
  for (const t of soma.slice(0, 3)) assert.ok(Object.keys(battle.steps[t.padIndex!] ?? {}).length > 8, `${t.name} drives the battle`);
  // The intro is ma: few strokes.
  const intro = a.patterns.find((p) => p.id.endsWith('_intro'))!;
  assert.ok(Object.values(intro.steps).reduce((n, r) => n + Object.keys(r).length, 0) < 20);

  const inst = a.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned);
  const names = JSON.stringify(inst.map((t) => `${t.name} ${t.instrument?.presetName}`)).toLowerCase();
  for (const banned of ['braam', 'trailer', 'cs-80', 'choir', 'mellotron', 'house', 'synth']) assert.ok(!names.includes(banned), banned);
  assert.ok(inst.every((t) => t.clips.length > 0));
  // Nothing sustained or reedy (Kenne: "get rid of that whiny synth"): no drone/pad/reed instruments,
  // and the shakuhachi is short, sparse, low and never above G5.
  for (const banned of ['shruti', 'drone', 'oboe', 'hichiriki', 'pad', 'bourdon']) assert.ok(!names.includes(banned), banned);
  assert.ok(inst.every((t) => ['lyra', 'pneuma'].includes(t.instrument!.type)), 'only plucked strings and the shakuhachi');
  const shaku = inst.find((t) => t.id.endsWith('_trk_shaku'))!;
  const shakuNotes = shaku.clips.flatMap((c) => c.notes ?? []);
  assert.ok(shakuNotes.every((n) => n.key <= 79 && n.lengthBeats <= 2.5), 'short notes, at or under G5');
  assert.ok(shaku.gainDb <= -12);
  assert.equal((inst.find((t) => t.id.endsWith('_trk_kotoArp'))!.instrument!.arp as { enabled?: boolean }).enabled, true);

  const copy = eraClash3dProjectCopy('eraclash-3d-ch1', 'someone');
  assert.notEqual(copy.id, a.id);
  assert.equal(copy.ownerId, 'someone');
});

test('taiko stingers build', () => {
  for (const id of ERA_CLASH_3D_STINGERS) {
    const d = buildEraClash3dStingerDoc(id);
    assert.ok(Object.keys(d.patterns[0].steps).length >= 2, id);
  }
});
