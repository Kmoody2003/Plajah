// Melos Beats phase 3: MEKA Groups, scenes, song sections → timeline tracks, multi-pattern playback
// and live pad recording. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPadBank, newGrooveDoc, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import {
  addScene, addSection, groupPatterns, ideasSet, moveSection, newGroupPattern, patternGroup, removeSection, sectionSpans,
  syncSongFromSections,
} from '../services/melos/beats/songSections';
import { StepScheduler } from '../services/melos/beats/engine/scheduler';
import { recordPadHit } from '../services/melos/beats/padRecord';

function twoGroupDoc(): { doc: GrooveDoc; a1: string; a2: string; b1: string } {
  const doc = newGrooveDoc('u');
  addPadBank(doc.kit);
  const a1 = doc.patterns[0].id;                // legacy untagged → Group A
  const a2 = newGroupPattern(doc, 0).id;
  const b1 = newGroupPattern(doc, 1).id;
  doc.patterns.find((p) => p.id === a1)!.steps[0] = { 0: { v: 100 } };
  doc.patterns.find((p) => p.id === b1)!.steps[16] = { 0: { v: 90 }, 8: { v: 90 } };
  return { doc, a1, a2, b1 };
}

test('groups: legacy patterns are Group A; new patterns are named per Group', () => {
  const { doc, a1, a2, b1 } = twoGroupDoc();
  assert.deepEqual(groupPatterns(doc, 0).map((p) => p.id), [a1, a2]);
  assert.deepEqual(groupPatterns(doc, 1).map((p) => p.id), [b1]);
  assert.equal(doc.patterns.find((p) => p.id === b1)!.name, 'B1');
  assert.deepEqual(ideasSet(doc, {}), [a1, b1]);           // each Group's first pattern
  assert.deepEqual(ideasSet(doc, { 0: a2 }), [a2, b1]);     // the Group's pick
});

test('scenes + sections build one managed track per Group, adopting the default Grooves track', () => {
  const { doc, a1, a2, b1 } = twoGroupDoc();
  const verse = addScene(doc, { 0: a1 }, 'Verse');
  const chorus = addScene(doc, { 0: a2 }, 'Chorus');
  assert.deepEqual(verse.slots, { 0: a1, 1: b1 });
  addSection(doc, verse.id, 2);
  addSection(doc, chorus.id, 1);
  const groupTracks = doc.arrangement.filter((t) => t.songGroup !== undefined);
  assert.deepEqual(groupTracks.map((t) => [t.name, t.songGroup]), [['Group A', 0], ['Group B', 1]]);
  assert.equal(doc.arrangement.filter((t) => t.kind === 'pattern').length, 2); // Grooves was adopted, not doubled
  const a = groupTracks[0].clips.map((c) => [c.startBeats, c.lengthBeats, c.patternId]);
  assert.deepEqual(a, [[0, 8, a1], [8, 4, a2]]);
  const b = groupTracks[1].clips.map((c) => [c.startBeats, c.lengthBeats, c.patternId]);
  assert.deepEqual(b, [[0, 8, b1], [8, 4, b1]]);
  // Reorder: chorus first — every Group track follows.
  moveSection(doc, 1, 0);
  assert.deepEqual(groupTracks[0].clips.map((c) => [c.startBeats, c.patternId]), [[0, a2], [4, a1]]);
  // Hand-made clips on a managed track survive a resync.
  groupTracks[0].clips.push({ id: 'mine', startBeats: 64, lengthBeats: 4, patternId: a1 });
  removeSection(doc, doc.sections![0].id);
  assert.ok(groupTracks[0].clips.some((c) => c.id === 'mine'));
  assert.deepEqual(groupTracks[0].clips.filter((c) => c.sectionId).map((c) => c.startBeats), [0]);
});

test('sections follow the meter: a 3/4 bar is 3 beats', () => {
  const { doc, a1 } = twoGroupDoc();
  doc.meter = [{ bar: 0, num: 3, den: 4 }];
  const sc = addScene(doc, { 0: a1 });
  addSection(doc, sc.id, 2);
  addSection(doc, sc.id, 1);
  assert.deepEqual(sectionSpans(doc).map((s) => [s.startBeats, s.lengthBeats]), [[0, 6], [6, 3]]);
  syncSongFromSections(doc);
  assert.equal(doc.arrangement.find((t) => t.songGroup === 0)!.clips[1].startBeats, 6);
});

test('pattern mode plays every Group pattern together; a launch swaps only its Group at the bar', () => {
  const { doc, a1, a2, b1 } = twoGroupDoc();
  const hits: { pad: number; beat: number }[] = [];
  let clock = 0;
  const s = new StepScheduler({
    doc: () => doc,
    toTime: (b) => b * 0.5,
    secBetween: (a, b) => (b - a) * 0.5,
    rng: () => 0,
    trigger: (pad, _v, when) => { hits.push({ pad, beat: when / 0.5 }); },
    startAudioClip: () => {},
    startInstrumentNote: () => {},
  });
  s.start('pattern', 0, [a1, b1]);
  s.onTick(clock += 0.1);
  assert.deepEqual(hits.map((h) => h.pad).sort(), [0, 16]);  // both Groups on beat 1
  s.queuePattern(a2);                                        // swap Group A only
  assert.deepEqual(s.queuedIds(), [a2]);
  s.onTick(clock = 2.2);                                     // past the bar line (beat 4)
  assert.deepEqual(s.currentPatternIds().slice().sort(), [a2, b1].sort());
  const groups = new Set(s.currentPatternIds().map((id) => patternGroup(doc.patterns.find((p) => p.id === id)!)));
  assert.deepEqual([...groups].sort(), [0, 1]);
});

test('pad recording: pattern mode writes the Group pattern; quantize off keeps micro timing', () => {
  const { doc, a1, a2, b1 } = twoGroupDoc();
  // Group B pad 17, beat 1.07 → step 4, micro +0.28
  const r1 = recordPadHit(doc, { padIdx: 17, vel: 99, beat: 1.07, mode: 'pattern' }, [a1, b1], false)!;
  assert.deepEqual(r1, { patternId: b1, step: 4 });
  const st = doc.patterns.find((p) => p.id === b1)!.steps[17][4];
  assert.equal(st.v, 99); assert.ok(Math.abs(st.micro! - 0.28) < 1e-6);
  // Quantize on: no micro; wraps at the pattern length (16 steps = 4 beats).
  const r2 = recordPadHit(doc, { padIdx: 2, vel: 80, beat: 4.49, mode: 'pattern' }, [a2, b1], true)!;
  assert.deepEqual(r2, { patternId: a2, step: 2 });
  assert.equal(doc.patterns.find((p) => p.id === a2)!.steps[2][2].micro, undefined);
  // No playing pattern takes a Group C pad.
  addPadBank(doc.kit);
  assert.equal(recordPadHit(doc, { padIdx: 33, vel: 80, beat: 0, mode: 'pattern' }, [a2, b1], true), null);
});

test('pad recording: song mode writes the pattern clip under the playhead (slip-aware)', () => {
  const { doc, a1, b1 } = twoGroupDoc();
  const sc = addScene(doc, { 0: a1 });
  addSection(doc, sc.id, 2);
  const bTrack = doc.arrangement.find((t) => t.songGroup === 1)!;
  bTrack.clips[0].contentOffsetBeats = 1;  // slipped one beat
  const r = recordPadHit(doc, { padIdx: 20, vel: 70, beat: 5, mode: 'song' }, [], true)!;
  // beat 5 in the clip + 1 slip = 6 → 6 mod 4 = 2 beats → step 8
  assert.deepEqual(r, { patternId: b1, step: 8 });
  assert.equal(recordPadHit(doc, { padIdx: 20, vel: 70, beat: 99, mode: 'song' }, [], true), null);
});
