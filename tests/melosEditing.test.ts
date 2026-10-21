// Melos Beats phase 2: clip windows (slip / trim / loop), clipboard, note edits, automation lane
// math (curves, clip CC lanes, sustain, recording) and MIDI export round-trips. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type ArrangeTrack, type GrooveDoc, type TimelineClip, type TrackAutomationLane } from '../services/melos/beats/grooveDoc';
import { contentPosAt, contentWindows, noteOccurrences } from '../services/melos/beats/clipContent';
import { consolidateClip, copyClips, glueWithNext, pasteClips, setClipLoop, slipClip, splitClipAt, trimClipStart } from '../services/melos/beats/clipEdit';
import { quantizeNotes, transposeNotes, fitNotesToScale, copyNotes, pasteNotes, notesInRect } from '../services/melos/beats/noteEdit';
import { clipLaneToSong, effectiveLanes, laneRamps, laneValueAt, sustainedEnd, writeLane } from '../services/melos/beats/automation';
import { exportClipMidi, exportProjectMidi } from '../services/melos/beats/midiExport';
import { parseMidiFile } from '../services/melos/composition/midiFileImport';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const n = (id: string, start: number, len = 0.5, key = 60, vel = 100) => ({ id, startBeats: start, lengthBeats: len, key, vel });

function docWithMidi(clip: Partial<TimelineClip>): { doc: GrooveDoc; track: ArrangeTrack; clip: TimelineClip } {
  const doc = newGrooveDoc('u');
  const c: TimelineClip = { id: 'c', startBeats: 4, lengthBeats: 4, notes: [n('a', 0), n('b', 1), n('c', 3)], ...clip };
  const track: ArrangeTrack = { id: 'm', kind: 'instrument', name: 'Keys', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [c] };
  doc.arrangement.push(track);
  return { doc, track, clip: c };
}

test('plain clip: content = clip-relative, one window', () => {
  const { clip } = docWithMidi({});
  assert.deepEqual(contentWindows(clip).map((w) => [w.songStart, w.songEnd, w.contentStart]), [[4, 8, 0]]);
  assert.deepEqual(noteOccurrences(clip).map((o) => o.songBeat), [4, 5, 7]);
  near(contentPosAt(clip, 6)!, 2);
});

test('slip offset hides earlier notes; loop repeats from loop start', () => {
  const { clip } = docWithMidi({ contentOffsetBeats: 1 });
  assert.deepEqual(noteOccurrences(clip).map((o) => [o.note.id, o.songBeat]), [['b', 4], ['c', 6]]);
  const looped = docWithMidi({ lengthBeats: 8, loop: { startBeats: 0, lengthBeats: 2 } }).clip;
  assert.deepEqual(noteOccurrences(looped).map((o) => [o.note.id, o.songBeat]), [['a', 4], ['b', 5], ['a', 6], ['b', 7], ['a', 8], ['b', 9], ['a', 10], ['b', 11]]);
  // Intro before the loop plays once: offset 0, loop [1,2) → a, then b repeating.
  const intro = docWithMidi({ lengthBeats: 4, loop: { startBeats: 1, lengthBeats: 1 } }).clip;
  assert.deepEqual(noteOccurrences(intro).map((o) => [o.note.id, o.songBeat]), [['a', 4], ['b', 5], ['b', 6], ['b', 7]]);
  // A note is cut at the loop end.
  const cut = docWithMidi({ notes: [n('x', 0, 3)], lengthBeats: 4, loop: { startBeats: 0, lengthBeats: 2 } }).clip;
  near(noteOccurrences(cut)[0].lengthBeats, 2);
});

test('split is non-destructive; left trim moves the window, content stays put', () => {
  const { doc, track } = docWithMidi({});
  const rid = splitClipAt(doc, 'm', 'c', 6)!;
  const right = track.clips.find((c) => c.id === rid)!;
  assert.equal(track.clips[0].notes!.length, 3); // nothing deleted
  assert.deepEqual(noteOccurrences(track.clips[0]).map((o) => o.songBeat), [4, 5]);
  assert.deepEqual(noteOccurrences(right).map((o) => o.songBeat), [7]);
  const t2 = docWithMidi({});
  trimClipStart(t2.doc, 'm', 'c', 5);
  assert.equal(t2.clip.startBeats, 5); assert.equal(t2.clip.lengthBeats, 3);
  assert.deepEqual(noteOccurrences(t2.clip).map((o) => o.songBeat), [5, 7]); // same song times
  trimClipStart(t2.doc, 'm', 'c', 3);  // open further left than the content: silence before it
  assert.deepEqual(noteOccurrences(t2.clip).map((o) => o.songBeat), [4, 5, 7]);
});

test('slip, loop toggle, consolidate and glue', () => {
  const { doc, clip, track } = docWithMidi({});
  slipClip(doc, clip, 1); // content moves later by a beat
  assert.deepEqual(noteOccurrences(clip).map((o) => o.songBeat), [5, 6]);
  setClipLoop(doc, clip, true);
  assert.deepEqual(clip.loop, { startBeats: -1, lengthBeats: 4 });
  consolidateClip(clip);
  assert.equal(clip.contentOffsetBeats, undefined); assert.equal(clip.loop, undefined);
  assert.deepEqual(clip.notes!.map((x) => x.startBeats), [1, 2]);
  track.clips.push({ id: 'd', startBeats: 8, lengthBeats: 2, notes: [n('z', 0)], contentOffsetBeats: 0 });
  assert.ok(glueWithNext(doc, 'm', 'c'));
  assert.equal(track.clips.length, 1);
  assert.deepEqual(track.clips[0].notes!.map((x) => x.startBeats), [1, 2, 4]);
});

test('clipboard: copy keeps relative timing + track offset, paste lands on the anchor', () => {
  const { doc } = docWithMidi({});
  doc.arrangement.push({ id: 'm2', kind: 'instrument', name: 'B', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0, clips: [{ id: 'e', startBeats: 6, lengthBeats: 2, notes: [] }] });
  const cb = copyClips(doc, ['c', 'e'])!;
  assert.equal(cb.spanStart, 4); assert.equal(cb.spanEnd, 8);
  const made = pasteClips(doc, cb, 16);
  assert.equal(made.length, 2);
  assert.deepEqual(doc.arrangement[1].clips.map((c) => c.startBeats), [4, 16]);
  assert.deepEqual(doc.arrangement[2].clips.map((c) => c.startBeats), [6, 18]);
});

test('quantize with strength, swing and ends; transpose; scale fold; note clipboard', () => {
  const notes = [n('a', 0.1, 0.3), n('b', 0.6, 0.3, 61), n('c', 1.2, 0.3, 66)];
  const grid = { snap: (b: number) => Math.round(b / 0.5) * 0.5, cell: () => 0.5 };
  quantizeNotes(notes, new Set(), { ...grid, strength: 1 });
  assert.deepEqual(notes.map((x) => x.startBeats), [0, 0.5, 1]);
  const half = [n('a', 0.2)];
  quantizeNotes(half, new Set(), { ...grid, strength: 0.5 });
  near(half[0].startBeats, 0.1);
  const sw = [n('a', 0.5)];
  quantizeNotes(sw, new Set(), { ...grid, swing: 0.5 });
  near(sw[0].startBeats, 0.625); // odd grid line delayed by swing·cell/2
  const ends = [n('a', 0, 0.7)];
  quantizeNotes(ends, new Set(), { ...grid, ends: true });
  near(ends[0].lengthBeats, 0.5);
  transposeNotes(notes, new Set(['b']), 12);
  assert.equal(notes[1].key, 73);
  fitNotesToScale(notes, new Set(), { tonic: 0, scale: 'major' });
  assert.deepEqual(notes.map((x) => x.key), [60, 72, 65]); // C#5→C5 (nearest), F#→F
  const cb = copyNotes(notes, new Set(['b', 'c']))!;
  const made = pasteNotes(notes, cb, 8);
  assert.equal(made.length, 2);
  assert.deepEqual(notes.slice(-2).map((x) => x.startBeats), [8, 8.5]);
  assert.deepEqual(notesInRect(notes, 0.9, 1.1, 60, 70), ['c']);
});

test('lane values: linear, curves, hold, ramps for scheduling', () => {
  const lane: TrackAutomationLane = { id: 'l', target: { kind: 'pan' }, points: [{ beat: 0, value: -1 }, { beat: 4, value: 1, curve: 'hold' }, { beat: 8, value: -1 }] };
  near(laneValueAt(lane, 2)!, 0);
  near(laneValueAt(lane, 6)!, 1);    // hold
  near(laneValueAt(lane, 99)!, -1);
  lane.points[0].curve = 'ease-in';
  near(laneValueAt(lane, 2)!, -1 + 2 * 0.25);
  const ramps = laneRamps(lane, 1, 9);
  near(ramps[0].value, laneValueAt(lane, 1)!);
  assert.ok(ramps.some((p, i) => i > 0 && Math.abs(p.beat - ramps[i - 1].beat) < 1e-9)); // the hold's step
  assert.ok(ramps.length > 6); // curve sampled
});

test('clip CC lane → song points through slip + loop; outside the clip it rests', () => {
  const { clip, track } = docWithMidi({ lengthBeats: 4, loop: { startBeats: 0, lengthBeats: 2 } });
  clip.automationLanes = [{ id: 'cc', target: { kind: 'mod-wheel' }, points: [{ beat: 0, value: 0 }, { beat: 2, value: 1 }] }];
  const pts = clipLaneToSong(clip, clip.automationLanes[0]);
  const lane = { target: { kind: 'mod-wheel' as const }, points: pts };
  near(laneValueAt(lane, 3.5)!, 0);   // before the clip: rest
  near(laneValueAt(lane, 5)!, 0.5);   // halfway through the first pass
  near(laneValueAt(lane, 7)!, 0.5);   // same in the second pass
  near(laneValueAt(lane, 9)!, 0);     // after: rest
  assert.ok(effectiveLanes(track).has('mod-wheel'));
});

test('sustain pedal extends note ends to pedal up', () => {
  const sus: TrackAutomationLane = { id: 's', target: { kind: 'sustain' }, points: [{ beat: 0, value: 1 }, { beat: 6, value: 0 }] };
  near(sustainedEnd(sus, 2, 100), 6);
  near(sustainedEnd(sus, 7, 100), 7);
  near(sustainedEnd(sus, 2, 5), 5);
});

test('writeLane overwrites a span and thins flat runs', () => {
  const lane: TrackAutomationLane = { id: 'v', target: { kind: 'volume' }, points: [{ beat: 0, value: 0 }, { beat: 8, value: -12 }] };
  writeLane(lane, 2, 2.1, -6);
  writeLane(lane, 2.1, 2.2, -6);
  writeLane(lane, 2.2, 2.3, -6);
  const span = lane.points.filter((p) => p.beat > 2 && p.beat < 8);
  assert.ok(span.length <= 2, JSON.stringify(lane.points));
  near(laneValueAt(lane, 2.3)!, -6);
  near(laneValueAt(lane, 1)!, laneValueAt({ target: lane.target, points: [{ beat: 0, value: 0 }, { beat: 8, value: -12 }] }, 1)!);
  near(lane.points[lane.points.length - 1].value, -12);
});

test('MIDI export round-trips through the importer (slip + loop baked in)', () => {
  const { doc } = docWithMidi({ lengthBeats: 8, loop: { startBeats: 0, lengthBeats: 2 } });
  doc.bpm = 96;
  const clipBytes = exportClipMidi(doc, 'm', 'c')!;
  const parsed = parseMidiFile(clipBytes.buffer.slice(clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.byteLength) as ArrayBuffer);
  assert.equal(parsed.bpm, 96);
  assert.deepEqual(parsed.notes.map((x) => +x.startBeats.toFixed(3)), [0, 1, 2, 3, 4, 5, 6, 7]);
  const proj = exportProjectMidi(doc);
  assert.equal(String.fromCharCode(...proj.slice(0, 4)), 'MThd');
  const parsedProj = parseMidiFile(proj.buffer.slice(proj.byteOffset, proj.byteOffset + proj.byteLength) as ArrayBuffer);
  assert.ok(parsedProj.notes.length >= 8);
});
