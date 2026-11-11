// Era Clash in Chora Studio: every arena cue builds a real, deterministic Chora project (the game's music
// is a bounce of it) with SOMA drums on MEKA Group B, a Drum Synth house kit on Group A, the song form as
// scenes/sections, LYRA and the other Chora instruments on the parts, and live generative devices.
// Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUES, TOTAL_BARS } from '../data/gameScores/eraClash';
import { buildEraClashGrooveDoc, eraClashProjectCopy, eraClashProjects, isEraClashProjectId, ERA_CLASH_CHORA } from '../services/melos/eraClashChoraProjects';
import { sectionSpans } from '../services/melos/beats/songSections';
import { deserializeSomaPatch, somaHandConfig } from '../services/melos/instruments/soma/patch';

const strip = (d: unknown) => JSON.stringify({ ...(d as object), createdAt: 0, updatedAt: 0 });

test('one project per cue, catalogued and addressable', () => {
  const list = eraClashProjects();
  assert.equal(list.length, CUES.length);
  for (const p of list) {
    assert.ok(isEraClashProjectId(p.id), p.id);
    assert.ok(p.soma.length >= 2, `${p.id} has SOMA drums`);
  }
  assert.ok(!isEraClashProjectId('eraclash-nowhere'));
});

for (const c of CUES) {
  test(`${c.id}: deterministic project with the full form, SOMA, kit and generative devices`, () => {
    const a = buildEraClashGrooveDoc(c.id), b = buildEraClashGrooveDoc(`eraclash-${c.id}`);
    assert.equal(strip(a), strip(b), 'same cue → same document');
    assert.equal(a.bpm, c.bpm);
    assert.ok(a.key);

    // Song form: 12 sections over 72 bars, written into managed Group tracks.
    const spans = sectionSpans(a);
    assert.equal(spans.length, 12);
    assert.equal(spans.reduce((n, s) => n + s.section.bars, 0), TOTAL_BARS);
    const groups = a.arrangement.filter((t) => t.songGroup !== undefined).map((t) => t.songGroup).sort();
    assert.deepEqual(groups, [0, 1]);

    // Group A: Drum Synth house kit with a four-on-the-floor in the groove sections.
    assert.ok(a.kit[0].drumSynth?.engine === 'kick');
    const drop = a.patterns.find((p) => p.id.endsWith('_pat_A_drop'))!;
    assert.ok(Object.keys(drop.steps[0] ?? {}).length >= 16, 'kick on every beat of the four-bar drop');

    // Group B: every SOMA drum is a pad-owned SOMA track and plays in the drop.
    const somaTracks = a.arrangement.filter((t) => t.instrument?.type === 'soma');
    assert.equal(somaTracks.length, ERA_CLASH_CHORA[c.id].soma.length);
    const somaDrop = a.patterns.find((p) => p.id.endsWith('_pat_B_drop'))!;
    for (const t of somaTracks) {
      assert.ok(t.padOwned && t.padIndex! >= 16 && t.padIndex! < 32);
      const hits = Object.keys(somaDrop.steps[t.padIndex!] ?? {}).length + Object.keys(somaDrop.melo?.[t.padIndex!] ?? {}).length;
      const hand = somaHandConfig(deserializeSomaPatch(t.instrument!.patch as Record<string, unknown>)!).enabled;
      const spec = ERA_CLASH_CHORA[c.id].soma.find((s) => t.name.startsWith(s.label))!;
      assert.equal(hand, spec.kind === 'hand', `${t.name} hand map matches its drum`);
      if (spec.kind === 'hand' || Object.keys(spec.euclid).includes('drop') || spec.downbeats?.includes('drop')) assert.ok(hits > 0, `${t.name} plays in the drop`);
    }
    // Hand drums are performed (micro-timing off the grid), not typed in.
    const handLanes = somaTracks.filter((t) => ERA_CLASH_CHORA[c.id].soma.find((s) => t.name.startsWith(s.label))?.kind === 'hand');
    for (const t of handLanes) {
      const notes = Object.values(somaDrop.melo?.[t.padIndex!] ?? {}).flat();
      assert.ok(notes.some((n) => n.micro), `${t.name} has a player's feel`);
    }

    // Parts: LYRA leads the instrumentation; no Ravencrest trailer palette.
    const inst = a.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned);
    assert.ok(inst.filter((t) => t.instrument?.type === 'lyra').length >= 4, 'LYRA physical models on the parts');
    const names = JSON.stringify(inst.map((t) => t.instrument?.presetName));
    for (const banned of ['braam', 'trailer', 'CS-80', 'Mellotron']) assert.ok(!names.toLowerCase().includes(banned.toLowerCase()), banned);
    assert.ok(inst.every((t) => t.clips.length > 0 && t.clips.every((cl) => cl.notes?.length)), 'every part has notes');

    // Live generative devices.
    const ost = inst.find((t) => t.id.endsWith('_trk_ost'))!;
    assert.equal((ost.instrument!.arp as { enabled?: boolean }).enabled, true, 'the ostinato is a running arp');
    assert.ok(a.modulators?.some((m) => m.on));
    assert.ok(a.kit.some((p) => p.noteFx?.some((d) => d.kind === 'chance')));

    // A user's copy is a fresh document with the same music.
    const copy = eraClashProjectCopy(c.id, 'someone');
    assert.notEqual(copy.id, a.id);
    assert.equal(copy.ownerId, 'someone');
    assert.equal(JSON.stringify(copy.patterns), JSON.stringify(a.patterns));
  });
}
