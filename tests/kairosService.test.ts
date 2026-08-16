// kairosService — Test Suite (the two-clock rule)
// Run with: npm run test:kairos
//
// This is the piece that is expensive to get wrong: fire a stream viewer on
// wall clock and they receive the verse before they hear it. Every case below
// is a service that actually happens.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCue, markersFor, cueRef, isClear, CLEAR_REF,
  type KairosCue, type ScriptureSession,
} from '../services/kairosService';

const cue = (refId: string, label: string, programTC: number, seq: number): KairosCue => ({
  refId, label, lines: [label], translation: 'King James',
  variant: 'LOWER_THIRD', wallClock: 1_700_000_000_000 + seq * 1000, programTC, seq,
});

const clearAt = (programTC: number, seq: number): KairosCue => ({
  refId: CLEAR_REF, label: '', lines: [], translation: '',
  variant: 'LOWER_THIRD', wallClock: 1_700_000_000_000 + seq * 1000, programTC, seq,
});

/** A service that took four passages, clearing between the third and fourth. */
function service(): ScriptureSession {
  const cues = [
    cue('43.1.1', 'John 1:1', 380, 1),
    cue('19.23.1', 'Psalms 23:1', 845, 2),
    cue('45.8.1', 'Romans 8:1', 1230, 3),
    clearAt(1300, 4),
    cue('45.8.28', 'Romans 8:28', 1453, 5),
  ];
  return {
    id: 'svc_x', orgId: 'org1', hostId: 'h1', title: 'All Things',
    translation: 'kjv', isActive: true,
    current: cues[cues.length - 1],
    cues, startedAt: 0,
  };
}

describe('resolveCue — IN_ROOM fires on what is on screen now', () => {
  test('returns whatever the operator has up', () => {
    assert.equal(resolveCue(service(), 'IN_ROOM')?.label, 'Romans 8:28');
  });

  test('a cleared screen clears the room instantly', () => {
    const s = { ...service(), current: null };
    assert.equal(resolveCue(s, 'IN_ROOM'), null);
  });

  test('ignores the playhead entirely — there is no video in the room', () => {
    assert.equal(resolveCue(service(), 'IN_ROOM', 0)?.label, 'Romans 8:28');
    assert.equal(resolveCue(service(), 'IN_ROOM', 99999)?.label, 'Romans 8:28');
  });
});

describe('resolveCue — STREAM fires against the viewer’s own playhead', () => {
  const s = service();

  test('a viewer behind the first cue sees nothing', () => {
    assert.equal(resolveCue(s, 'STREAM', 0), null);
    assert.equal(resolveCue(s, 'STREAM', 379), null);
  });

  test('THE BUG THIS PREVENTS: a cue fired ahead of the playhead does not leak', () => {
    // The operator is on Romans 8:28 at 24:13 (1453). A viewer running ~3 min
    // behind is at 1290 and must still be on Romans 8:1 — not the verse the
    // room is looking at right now.
    const viewer = resolveCue(s, 'STREAM', 1290);
    assert.equal(viewer?.label, 'Romans 8:1');
    assert.equal(s.current?.label, 'Romans 8:28');
    assert.notEqual(viewer?.label, s.current?.label);
  });

  test('catches up as the playhead reaches each cue', () => {
    assert.equal(resolveCue(s, 'STREAM', 380)?.label, 'John 1:1');
    assert.equal(resolveCue(s, 'STREAM', 900)?.label, 'Psalms 23:1');
    assert.equal(resolveCue(s, 'STREAM', 1250)?.label, 'Romans 8:1');
    assert.equal(resolveCue(s, 'STREAM', 1460)?.label, 'Romans 8:28');
  });

  test('a clear the viewer has reached clears their pane too', () => {
    assert.equal(resolveCue(s, 'STREAM', 1310), null);
    // …and the next real cue brings it back.
    assert.equal(resolveCue(s, 'STREAM', 1453)?.label, 'Romans 8:28');
  });

  test('scrubbing backwards resolves to that moment, not the latest', () => {
    assert.equal(resolveCue(s, 'STREAM', 900)?.label, 'Psalms 23:1');
  });

  test('works on the VOD after the service ended', () => {
    const ended = { ...s, isActive: false, current: null };
    assert.equal(resolveCue(ended, 'STREAM', 1460)?.label, 'Romans 8:28');
    assert.equal(resolveCue(ended, 'STREAM', 900)?.label, 'Psalms 23:1');
  });
});

describe('edge cases', () => {
  test('no session, or a session with no cues', () => {
    assert.equal(resolveCue(null, 'IN_ROOM'), null);
    assert.equal(resolveCue(null, 'STREAM', 100), null);
    const empty = { ...service(), cues: [], current: null };
    assert.equal(resolveCue(empty, 'STREAM', 5000), null);
  });

  test('missing playhead is treated as the very start', () => {
    assert.equal(resolveCue(service(), 'STREAM'), null);
  });

  test('isClear identifies the marker', () => {
    assert.ok(isClear(clearAt(10, 1)));
    assert.ok(!isClear(cue('45.8.28', 'Romans 8:28', 10, 1)));
  });
});

describe('markers — the VOD scrub bar and the recap', () => {
  test('clears are not markers; passages are, in timecode order', () => {
    assert.deepEqual(markersFor(service()).map(m => `${m.label}@${m.programTC}`), [
      'John 1:1@380', 'Psalms 23:1@845', 'Romans 8:1@1230', 'Romans 8:28@1453',
    ]);
  });

  test('a repeated passage at the same second is not double-marked', () => {
    const s = service();
    s.cues = [...s.cues, cue('45.8.28', 'Romans 8:28', 1453, 6)];
    assert.equal(markersFor(s).filter(m => m.label === 'Romans 8:28').length, 1);
  });

  test('markers round-trip back to a real passage', () => {
    const m = markersFor(service())[3];
    const ref = cueRef(cue(m.refId, m.label, m.programTC, 1));
    assert.equal(ref?.bookName, 'Romans');
    assert.equal(ref?.chapter, 8);
    assert.equal(ref?.verse, 28);
  });
});
