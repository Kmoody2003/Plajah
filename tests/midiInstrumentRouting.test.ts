// Unit tests for hardware MIDI & instrument track routing across Chora views. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type ArrangeTrack, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import { makeInstrumentTrack } from '../services/melos/beats/instrumentFactory';
import { resolveMidiRouting, commitRecordedNote } from '../services/melos/midiRouting';
import { mapMidiEvent } from '../services/melos/midiMap';
import type { BeatsMidiEvent } from '../services/melos/midiInput';
import { InstrumentLoader, prepareUnmutedTracks } from '../services/melos/beats/engine/instrumentLoader';

function mkDoc(): GrooveDoc {
  const d = newGrooveDoc('u', 'MIDI routing test');
  // Start without pre-existing instrument tracks so each test controls arrangement explicitly.
  d.arrangement = d.arrangement.filter((t) => t.kind !== 'instrument');
  return d;
}

function addTrack(doc: GrooveDoc, opts: { id: string; name: string; type?: 'tonos' | 'onda' | 'aura'; armed?: boolean; padOwned?: boolean }): ArrangeTrack {
  const t = makeInstrumentTrack(opts.type ?? 'tonos', doc.arrangement.length);
  t.id = opts.id;
  t.name = opts.name;
  t.armed = !!opts.armed;
  t.padOwned = !!opts.padOwned;
  doc.arrangement.push(t);
  return t;
}

function midiNote(
  note: number,
  on = true,
  deviceName = 'MIDI Keystation',
  deviceType: BeatsMidiEvent['deviceType'] = 'generic',
): BeatsMidiEvent {
  return { kind: on ? 'noteon' : 'noteoff', channel: 1, note, velocity: on ? 104 : 0, deviceName, deviceType };
}

test('resolveMidiRouting: Timeline instrument track without manual arm still accepts C1..D#2 notes', () => {
  const doc = mkDoc();
  const tl = addTrack(doc, { id: 'tr-1', name: 'Keys', armed: false, padOwned: false });

  const routing = resolveMidiRouting({
    doc,
    view: 'timeline',
    selectedPad: 0,
    openInstrumentId: null,
  });

  assert.equal(routing.armedTrack, null);
  assert.equal(routing.firstTimelineTrack?.id, tl.id);
  assert.equal(routing.targetTrack?.id, tl.id);
  assert.equal(routing.instrumentArmed, true);
  assert.equal(routing.gridPlaysKeys, true);
  assert.equal(routing.macroTrack?.id, tl.id);

  // Notes 36..51 on generic or Komplete Kontrol keyboards must play chromatic notes in Timeline
  // rather than dropping into drum pads before autoArm() runs.
  for (const n of [36, 48, 51, 60]) {
    assert.deepEqual(
      mapMidiEvent(midiNote(n, true), routing.instrumentArmed, routing.gridPlaysKeys),
      { kind: 'note', note: n, velocity: 104 },
    );
    assert.deepEqual(
      mapMidiEvent(midiNote(n, false), routing.instrumentArmed, routing.gridPlaysKeys),
      { kind: 'noteOff', note: n },
    );
  }
});

test('resolveMidiRouting: open instrument window overrides pad focus and armed track across views', () => {
  const doc = mkDoc();
  const t1 = addTrack(doc, { id: 'tr-1', name: 'Armed Synth', armed: true, padOwned: false });
  const t2 = addTrack(doc, { id: 'tr-2', name: 'Second Strings', armed: false, padOwned: false });
  const padInst = addTrack(doc, { id: 'pad-inst-1', name: 'Pad Tonos', armed: false, padOwned: true });
  doc.kit[2].source = 'instrument';
  doc.kit[2].instrumentTrackId = padInst.id;

  // In Timeline with second track's instrument panel open: openTrack wins over t1.
  const tlOpen = resolveMidiRouting({
    doc,
    view: 'timeline',
    selectedPad: 0,
    openInstrumentId: t2.id,
  });
  assert.equal(tlOpen.openTrack?.id, t2.id);
  assert.equal(tlOpen.targetTrack?.id, t2.id);
  assert.equal(tlOpen.macroTrack?.id, t2.id);
  assert.equal(tlOpen.instrumentArmed, true);

  // In MEKA while pad 2 (padInst) is selected, opening t2 routes notes, wheels, and macros to t2.
  const mekaOpenTimeline = resolveMidiRouting({
    doc,
    view: 'machine',
    selectedPad: 2,
    openInstrumentId: t2.id,
  });
  assert.equal(mekaOpenTimeline.openTrack?.id, t2.id);
  assert.equal(mekaOpenTimeline.padTrack, null);
  assert.equal(mekaOpenTimeline.targetTrack?.id, t2.id);
  assert.equal(mekaOpenTimeline.macroTrack?.id, t2.id);
  assert.equal(mekaOpenTimeline.instrumentArmed, true);
  assert.equal(mekaOpenTimeline.gridPlaysKeys, false);

  // Opening pad-owned track (e.g. desktop + Instrument -> adds pad-owned instrument & opens modal)
  // keeps focus on padInst even when user is on Glass / Timeline or pad 0 is selected.
  const glassOpenPad = resolveMidiRouting({
    doc,
    view: 'glass',
    selectedPad: 0,
    openInstrumentId: padInst.id,
  });
  assert.equal(glassOpenPad.openTrack?.id, padInst.id);
  assert.equal(glassOpenPad.targetTrack?.id, padInst.id);
  assert.equal(glassOpenPad.macroTrack?.id, padInst.id);
  assert.equal(glassOpenPad.instrumentArmed, true);
  assert.equal(t1.armed, true);
});

test('resolveMidiRouting: MEKA preserves pad focus & macro control pages when modal is closed', () => {
  const doc = mkDoc();
  const tl = addTrack(doc, { id: 'tr-1', name: 'Lead', armed: false, padOwned: false });
  const padInst = addTrack(doc, { id: 'pad-inst-1', name: 'Pad Harp', armed: false, padOwned: true });
  doc.kit[3].source = 'instrument';
  doc.kit[3].instrumentTrackId = padInst.id;

  // Drum pad selected in MEKA with no armed Timeline track: 36..51 still hit drum pads.
  const drumPadFocus = resolveMidiRouting({
    doc,
    view: 'machine',
    selectedPad: 0,
    openInstrumentId: null,
  });
  assert.equal(drumPadFocus.padTrack, null);
  assert.equal(drumPadFocus.instrumentArmed, false);
  assert.equal(drumPadFocus.gridPlaysKeys, false);
  assert.equal(drumPadFocus.macroTrack, null);
  assert.deepEqual(
    mapMidiEvent(midiNote(36, true), drumPadFocus.instrumentArmed, drumPadFocus.gridPlaysKeys),
    { kind: 'pad', pad: 0, velocity: 104 },
  );

  // Instrument pad selected in MEKA with no modal open: padTrack active, MEKA control page owns macros.
  const instPadFocus = resolveMidiRouting({
    doc,
    view: 'machine',
    selectedPad: 3,
    openInstrumentId: null,
  });
  assert.equal(instPadFocus.padTrack?.id, padInst.id);
  assert.equal(instPadFocus.targetTrack?.id, padInst.id);
  assert.equal(instPadFocus.instrumentArmed, true);
  assert.equal(instPadFocus.gridPlaysKeys, false);
  assert.equal(instPadFocus.macroTrack, null);
  assert.deepEqual(
    mapMidiEvent(midiNote(36, true), instPadFocus.instrumentArmed, instPadFocus.gridPlaysKeys),
    { kind: 'note', note: 36, velocity: 104 },
  );
  assert.ok(tl);
});

test('resolveMidiRouting & mapMidiEvent: Maschine pads play chromatic notes in Timeline and Glass follows arm state', () => {
  const doc = mkDoc();
  const tl = addTrack(doc, { id: 'tr-1', name: 'Piano', armed: false, padOwned: false });

  // Timeline: Maschine MK3 bottom-left pad (note 60) plays note 36 on instrument when present.
  const tlRouting = resolveMidiRouting({
    doc,
    view: 'timeline',
    selectedPad: 0,
    openInstrumentId: null,
  });
  assert.deepEqual(
    mapMidiEvent(midiNote(60, true, 'Maschine MK3', 'maschine_studio'), tlRouting.instrumentArmed, tlRouting.gridPlaysKeys),
    { kind: 'note', note: 36, velocity: 104 },
  );

  // Glass with nothing armed: drum octave 36..51 still plays drum pads; arming flips to keys.
  const glassDisarmed = resolveMidiRouting({
    doc,
    view: 'glass',
    selectedPad: 0,
    openInstrumentId: null,
  });
  assert.equal(glassDisarmed.instrumentArmed, false);
  assert.deepEqual(
    mapMidiEvent(midiNote(36, true), glassDisarmed.instrumentArmed, glassDisarmed.gridPlaysKeys),
    { kind: 'pad', pad: 0, velocity: 104 },
  );

  tl.armed = true;
  const glassArmed = resolveMidiRouting({
    doc,
    view: 'glass',
    selectedPad: 0,
    openInstrumentId: null,
  });
  assert.equal(glassArmed.instrumentArmed, true);
  assert.equal(glassArmed.macroTrack?.id, tl.id);
  assert.deepEqual(
    mapMidiEvent(midiNote(36, true), glassArmed.instrumentArmed, glassArmed.gridPlaysKeys),
    { kind: 'note', note: 36, velocity: 104 },
  );
});

test('resolveMidiRouting: Timeline with only pad-owned tracks does not invent a Timeline instrument target', () => {
  const doc = mkDoc();
  addTrack(doc, { id: 'pad-inst-1', name: 'Pad Bass', armed: true, padOwned: true });

  const routing = resolveMidiRouting({
    doc,
    view: 'timeline',
    selectedPad: 0,
    openInstrumentId: null,
  });

  assert.equal(routing.armedTrack, null);
  assert.equal(routing.firstTimelineTrack, null);
  assert.equal(routing.targetTrack, null);
  assert.equal(routing.instrumentArmed, false);
});

test('mapMidiEvent: modWheel, pitchBend, sustain, and macro CCs map uniformly for instrument routing', () => {
  const base = { channel: 1, deviceName: 'Komplete Kontrol', deviceType: 'komplete_kontrol' as const };
  assert.deepEqual(mapMidiEvent({ ...base, kind: 'cc', cc: 1, value: 64 }, true, true), { kind: 'modWheel', value: 64 / 127 });
  assert.deepEqual(mapMidiEvent({ ...base, kind: 'pitchbend', bend: -0.5 }, true, true), { kind: 'pitchBend', value: -0.5 });
  assert.deepEqual(mapMidiEvent({ ...base, kind: 'cc', cc: 64, value: 127 }, true, true), { kind: 'sustain', on: true });
  assert.deepEqual(mapMidiEvent({ ...base, kind: 'cc', cc: 64, value: 0 }, true, true), { kind: 'sustain', on: false });
  assert.deepEqual(mapMidiEvent({ ...base, kind: 'cc', cc: 14, value: 127 }, true, true), { kind: 'macro', index: 0, value: 1 });
});

test('commitRecordedNote: records notes and auto-chord keys into Timeline instrument clips cleanly', () => {
  const doc = mkDoc();
  const tl = addTrack(doc, { id: 'tr-rec', name: 'Recorded Keys', armed: true, padOwned: false });

  commitRecordedNote(
    tl.id,
    { key: 60, vel: 100, startBeats: 1, keys: [60, 64, 67] },
    2.5,
    (fn) => fn(doc),
  );

  assert.equal(tl.clips.length, 1);
  assert.equal(tl.clips[0].notes?.length, 3);
  assert.deepEqual(tl.clips[0].notes?.map((n) => n.key), [60, 64, 67]);
});

test('InstrumentLoader & prepareUnmutedTracks deduplicate concurrent chord loads and skip muted tracks', async () => {
  const doc = mkDoc();
  const t1 = addTrack(doc, { id: 'tr-live', name: 'Live Synth', armed: true, padOwned: false });
  const t2 = addTrack(doc, { id: 'tr-second', name: 'Second Synth', armed: false, padOwned: false });
  const tMuted = addTrack(doc, { id: 'tr-muted', name: 'Muted Synth', armed: false, padOwned: false });
  tMuted.mute = true;

  const loader = new InstrumentLoader<{ id: string }>();
  const counts = new Map<string, number>();
  let releaseLive!: () => void;
  const liveGate = new Promise<void>((r) => { releaseLive = r; });

  const factory = async (track: ArrangeTrack): Promise<{ id: string }> => {
    counts.set(track.id, (counts.get(track.id) ?? 0) + 1);
    if (track.id === t1.id) await liveGate;
    return { id: track.id };
  };

  // Three simultaneous chord notes arrive while track 1 is still loading.
  const p1 = loader.ensure(t1.id, () => factory(t1));
  const p2 = loader.ensure(t1.id, () => factory(t1));
  const p3 = loader.ensure(t1.id, () => factory(t1));
  assert.equal(p1, p2);
  assert.equal(p2, p3);
  assert.equal(counts.get(t1.id), 1);

  // Scheduled Play calls prepareUnmutedTracks concurrently while t1 is loading.
  const prep = prepareUnmutedTracks(doc.arrangement, (t) => loader.ensure(t.id, () => factory(t)));
  releaseLive();
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  await prep;

  assert.deepEqual(r1, { id: t1.id });
  assert.equal(r1, r2);
  assert.equal(r2, r3);
  assert.equal(counts.get(t1.id), 1);
  assert.equal(counts.get(t2.id), 1);
  assert.equal(counts.get(tMuted.id), undefined);
  assert.equal(loader.get(t1.id), r1);
  assert.equal(loader.get(tMuted.id), undefined);
});
